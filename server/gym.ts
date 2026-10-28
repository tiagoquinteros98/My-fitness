import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { addDays } from '../src/lib/dates.js'
import { normalize } from '../src/lib/nutrition.js'
import { dayForDate, exerciseHistory, routineOf, sessionId, weeklyVolume } from '../src/lib/routine.js'
import type { AppState, Exercise, Op, RoutineDay, WorkoutSession, WorkoutSet } from '../src/types.js'
import { applyOps, readState } from './db.js'

// MCP tools for the Gym section: read and edit the routine, log sets, review training.

const MAX_DAYS = 7
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const dateArg = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const r1 = (n: number) => Math.round(n * 10) / 10
const same = (a: string, b: string) => normalize(a).trim() === normalize(b).trim()

function text(s: string) {
  return { content: [{ type: 'text' as const, text: s }] }
}
function fail(s: string) {
  return { ...text(s), isError: true }
}


/** Estimated one-rep max (Epley); only meaningful up to ~12 reps. */
const e1rm = (s: WorkoutSet) => s.kg * (1 + Math.min(s.reps, 12) / 30)

const validSets = (sets: (WorkoutSet | null)[] | undefined) =>
  (sets ?? []).filter((s): s is WorkoutSet => !!s && s.kg >= 0 && s.reps > 0)

function describeRoutine(routine: RoutineDay[]): string {
  const lines: string[] = []
  for (const day of routine) {
    const sets = day.exercises.reduce((a, e) => a + e.s, 0)
    lines.push(`\n${day.name} (${plural(day.exercises.length, 'ejercicio', 'ejercicios')}, ${plural(sets, 'serie', 'series')}):`)
    day.exercises.forEach((e, i) => lines.push(`${i + 1}. ${e.n} — ${e.s} × ${e.r} · ${e.rir} · ${e.g} · arranque ${e.w}`))
  }
  lines.push('', 'Volumen semanal (series directas por grupo; guía 10–20):')
  for (const v of weeklyVolume(routine)) lines.push(`- ${v.group}: ${v.sets} (${v.status})`)
  return lines.join('\n').trim()
}

function findDay(routine: RoutineDay[], name: string): RoutineDay | undefined {
  return routine.find((d) => same(d.name, name))
}

/** Exercise by name in a routine day, or anywhere in the routine / history when no day is given. */
function findExercise(state: AppState, name: string, day?: RoutineDay): string | undefined {
  const pool = day
    ? day.exercises.map((e) => e.n)
    : [...routineOf(state).flatMap((d) => d.exercises.map((e) => e.n)), ...state.workouts.flatMap((w) => Object.keys(w.exercises))]
  return pool.find((n) => same(n, name)) ?? pool.find((n) => normalize(n).includes(normalize(name)))
}

/** Saves a new routine, plus the workout ops that keep history under renamed exercises/days. */
async function saveRoutine(routine: RoutineDay[], extra: Op[] = []) {
  await applyOps([...extra, { type: 'putRoutine', routine }])
}

const exerciseFields = {
  group: z.string().min(1).describe('Grupo muscular, ej. "Pecho"'),
  sets: z.number().int().min(1).max(10).describe('Series'),
  reps: z.string().min(1).describe('Repeticiones por serie, ej. "10", "8-12" o "45 seg"'),
  rir: z.string().default('RIR 2').describe('Esfuerzo, ej. "RIR 2", "al fallo"'),
  start_weight: z.string().default('—').describe('Peso sugerido para arrancar, ej. "20 kg c/u"'),
}

function sessionSummary(state: AppState, session: WorkoutSession): string {
  const day = findDay(routineOf(state), session.day)
  const lines = [`Sesión ${session.date} (${session.day}):`]
  let done = 0
  let planned = 0
  let moved = 0
  const names = [...new Set([...(day?.exercises.map((e) => e.n) ?? []), ...Object.keys(session.exercises)])]
  for (const name of names) {
    const ex = day?.exercises.find((e) => e.n === name)
    const sets = validSets(session.exercises[name])
    planned += ex?.s ?? 0
    done += sets.length
    moved += sets.reduce((a, s) => a + s.kg * s.reps, 0)
    const plan = ex ? ` [${ex.s} × ${ex.r}]` : ' [fuera de la rutina]'
    lines.push(`- ${name}${plan}: ${sets.length ? sets.map((s) => `${s.kg}×${s.reps}`).join(', ') : 'sin registrar'}`)
  }
  lines.push(`Total: ${done} de ${planned} series, ${Math.round(moved).toLocaleString('es-AR')} kg movidos.`)
  return lines.join('\n')
}

function exerciseReport(state: AppState, name: string, from: string, to: string): string {
  const all = state.workouts
    .filter((w) => validSets(w.exercises[name]).length)
    .map((w) => {
      const sets = validSets(w.exercises[name])
      const best = sets.reduce((a, b) => (e1rm(b) > e1rm(a) ? b : a))
      return { date: w.date, sets, best, e1rm: e1rm(best), volume: sets.reduce((a, s) => a + s.kg * s.reps, 0) }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
  const inRange = all.filter((x) => x.date >= from && x.date <= to)
  if (!all.length) return `${name}: todavía no hay series registradas.`
  const lines = [`${name}, del ${from} al ${to}: ${inRange.length} sesiones (${all.length} en total).`, '']
  for (const x of inRange) {
    lines.push(`${x.date}: ${x.sets.map((s) => `${s.kg}×${s.reps}`).join(', ')} · mejor ${x.best.kg}×${x.best.reps} · 1RM est. ${r1(x.e1rm)} kg · volumen ${Math.round(x.volume)} kg`)
  }
  const pr = all.reduce((a, b) => (b.e1rm > a.e1rm ? b : a))
  lines.push('', `Récord (1RM estimado): ${r1(pr.e1rm)} kg con ${pr.best.kg}×${pr.best.reps} el ${pr.date}.`)
  if (inRange.length >= 2) {
    const first = inRange[0]
    const last = inRange.at(-1)!
    const pct = ((last.e1rm - first.e1rm) / first.e1rm) * 100
    lines.push(`Cambio de 1RM estimado en el período: ${pct >= 0 ? '+' : ''}${r1(pct)}% (${r1(first.e1rm)} → ${r1(last.e1rm)} kg).`)
  }
  const last3 = all.slice(-3)
  if (last3.length === 3 && last3[2].e1rm <= last3[0].e1rm) {
    lines.push('Sin progreso en las últimas 3 sesiones: considerá subir reps antes que peso, revisar descanso/RIR o cambiar la variante.')
  }
  return lines.join('\n')
}

function trainingReport(state: AppState, from: string, to: string): string {
  const routine = routineOf(state)
  const sessions = state.workouts.filter((w) => w.date >= from && w.date <= to && Object.values(w.exercises).some((s) => validSets(s).length))
  const span = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1
  const weeks = span / 7
  const lines = [`Entrenamiento del ${from} al ${to} (${span} días).`]
  lines.push(`Sesiones: ${sessions.length} (${r1(sessions.length / weeks)} por semana; la rutina tiene ${routine.length}).`)
  if (!sessions.length) return lines.join('\n')

  lines.push('')
  for (const s of sessions) {
    const day = findDay(routine, s.day)
    const planned = day?.exercises.reduce((a, e) => a + e.s, 0) ?? 0
    const done = Object.values(s.exercises).reduce((a, sets) => a + validSets(sets).length, 0)
    const moved = Object.values(s.exercises).reduce((a, sets) => a + validSets(sets).reduce((b, x) => b + x.kg * x.reps, 0), 0)
    lines.push(`${s.date} ${s.day}: ${planned ? `${done} de ${planned} series` : plural(done, 'serie', 'series')}, ${Math.round(moved).toLocaleString('es-AR')} kg movidos`)
  }

  // Sets actually done per muscle group per week, against the routine's plan.
  const groupOf = new Map(routine.flatMap((d) => d.exercises.map((e) => [e.n, e.g] as const)))
  const doneByGroup: Record<string, number> = {}
  for (const s of sessions) {
    for (const [name, sets] of Object.entries(s.exercises)) {
      const g = groupOf.get(name) ?? 'Otros'
      doneByGroup[g] = (doneByGroup[g] ?? 0) + validSets(sets).length
    }
  }
  lines.push('', 'Series por semana por grupo (hechas / planificadas):')
  for (const v of weeklyVolume(routine)) {
    lines.push(`- ${v.group}: ${r1((doneByGroup[v.group] ?? 0) / weeks)} / ${v.sets}`)
  }

  // Per exercise: progress of estimated 1RM within the period, records and stalls.
  const progress: string[] = []
  const records: string[] = []
  const stalled: string[] = []
  for (const name of new Set(sessions.flatMap((s) => Object.keys(s.exercises)))) {
    const hist = exerciseHistory(state, name)
    const within = hist.filter((h) => h.date >= from && h.date <= to)
    if (!within.length) continue
    const before = hist.filter((h) => h.date < from)
    const best = (h: typeof hist) => Math.max(...h.map((x) => e1rm(x)))
    if (within.length >= 2) {
      const pct = ((e1rm(within.at(-1)!) - e1rm(within[0])) / e1rm(within[0])) * 100
      progress.push(`- ${name}: ${within[0].kg}×${within[0].reps} → ${within.at(-1)!.kg}×${within.at(-1)!.reps} (${pct >= 0 ? '+' : ''}${r1(pct)}% 1RM est.)`)
    }
    if (before.length && best(within) > best(before)) records.push(name)
    const last3 = hist.slice(-3)
    if (last3.length === 3 && e1rm(last3[2]) <= e1rm(last3[0])) stalled.push(name)
  }
  if (progress.length) lines.push('', 'Progreso por ejercicio (mejor serie, primera → última):', ...progress)
  if (records.length) lines.push('', `Récords nuevos en el período: ${records.join(', ')}.`)
  if (stalled.length) lines.push('', `Sin progreso en las últimas 3 sesiones: ${stalled.join(', ')}.`)
  return lines.join('\n')
}

export function registerGymTools(server: McpServer, today: () => string) {
  server.registerTool(
    'get_routine',
    {
      description: 'Muestra la rutina de gimnasio: días, ejercicios con series × reps, RIR, grupo y peso de arranque, y el volumen semanal por grupo.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => text(describeRoutine(routineOf(await readState()))),
  )

  server.registerTool(
    'add_routine_exercise',
    {
      description: 'Agrega un ejercicio a un día de la rutina (al final o en la posición indicada).',
      inputSchema: {
        day: z.string().describe('Día de la rutina, ej. "Lunes"'),
        name: z.string().min(1),
        ...exerciseFields,
        position: z.number().int().min(1).optional().describe('Posición (1 = primero); por defecto al final'),
      },
    },
    async ({ day, name, group, sets, reps, rir, start_weight, position }) => {
      const routine = structuredClone(routineOf(await readState()))
      const d = findDay(routine, day)
      if (!d) return fail(`No existe el día "${day}". Días: ${routine.map((x) => x.name).join(', ')}.`)
      if (d.exercises.some((e) => same(e.n, name))) return fail(`"${name}" ya está en ${d.name}.`)
      const ex: Exercise = { n: name.trim(), g: group, s: sets, r: reps, rir, w: start_weight }
      d.exercises.splice(position ? position - 1 : d.exercises.length, 0, ex)
      await saveRoutine(routine)
      return text(`Agregado a ${d.name}: ${ex.n} — ${ex.s} × ${ex.r} · ${ex.rir} · ${ex.g}.\n\n${describeRoutine(routine)}`)
    },
  )

  server.registerTool(
    'update_routine_exercise',
    {
      description:
        'Modifica un ejercicio de un día de la rutina: series, reps, RIR, grupo, peso de arranque, posición, o lo renombra (el historial de series se mueve al nombre nuevo) o lo pasa a otro día.',
      inputSchema: {
        day: z.string(),
        name: z.string().describe('Nombre actual del ejercicio'),
        new_name: z.string().min(1).optional(),
        group: exerciseFields.group.optional(),
        sets: exerciseFields.sets.optional(),
        reps: exerciseFields.reps.optional(),
        rir: z.string().optional(),
        start_weight: z.string().optional(),
        position: z.number().int().min(1).optional().describe('Nueva posición dentro del día (1 = primero)'),
        move_to_day: z.string().optional().describe('Pasarlo a otro día de la rutina'),
      },
    },
    async (a) => {
      const state = await readState()
      const routine = structuredClone(routineOf(state))
      const d = findDay(routine, a.day)
      if (!d) return fail(`No existe el día "${a.day}". Días: ${routine.map((x) => x.name).join(', ')}.`)
      const idx = d.exercises.findIndex((e) => same(e.n, a.name))
      if (idx < 0) return fail(`"${a.name}" no está en ${d.name}. Ejercicios: ${d.exercises.map((e) => e.n).join(', ')}.`)
      const [ex] = d.exercises.splice(idx, 1)
      const oldName = ex.n
      if (a.new_name) ex.n = a.new_name.trim()
      if (a.group) ex.g = a.group
      if (a.sets) ex.s = a.sets
      if (a.reps) ex.r = a.reps
      if (a.rir) ex.rir = a.rir
      if (a.start_weight) ex.w = a.start_weight
      const target = a.move_to_day ? findDay(routine, a.move_to_day) : d
      if (!target) return fail(`No existe el día "${a.move_to_day}".`)
      if (target.exercises.some((e) => same(e.n, ex.n))) return fail(`"${ex.n}" ya está en ${target.name}.`)
      target.exercises.splice(a.position ? Math.min(a.position - 1, target.exercises.length) : target === d ? idx : target.exercises.length, 0, ex)

      // A rename moves the logged sets too, unless another routine day still uses the old name.
      const extra: Op[] = []
      const stillUsedIn = routine.filter((day) => day.exercises.some((e) => e.n === oldName)).map((day) => day.name)
      if (ex.n !== oldName && !stillUsedIn.length) {
        for (const w of state.workouts) {
          if (!w.exercises[oldName]) continue
          const { [oldName]: sets, ...rest } = w.exercises
          extra.push({ type: 'putWorkout', session: { ...w, exercises: { ...rest, [ex.n]: rest[ex.n] ?? sets } } })
        }
      }
      await saveRoutine(routine, extra)
      return text(
        `Actualizado: ${ex.n} en ${target.name} — ${ex.s} × ${ex.r} · ${ex.rir} · ${ex.g} · arranque ${ex.w}.` +
          (extra.length ? ` Historial movido de "${oldName}" (${plural(extra.length, 'sesión', 'sesiones')}).` : '') +
          (ex.n !== oldName && stillUsedIn.length
            ? ` El historial sigue bajo "${oldName}" porque ${stillUsedIn.join(' y ')} todavía usa ese nombre; "${ex.n}" arranca de cero.`
            : '') +
          `\n\n${describeRoutine(routine)}`,
      )
    },
  )

  server.registerTool(
    'remove_routine_exercise',
    {
      description: 'Saca un ejercicio de un día de la rutina. Las series ya registradas se conservan en el historial.',
      inputSchema: { day: z.string(), name: z.string() },
      annotations: { destructiveHint: true },
    },
    async ({ day, name }) => {
      const routine = structuredClone(routineOf(await readState()))
      const d = findDay(routine, day)
      if (!d) return fail(`No existe el día "${day}".`)
      const idx = d.exercises.findIndex((e) => same(e.n, name))
      if (idx < 0) return fail(`"${name}" no está en ${d.name}.`)
      const [removed] = d.exercises.splice(idx, 1)
      await saveRoutine(routine)
      return text(`Quitado de ${d.name}: ${removed.n}.\n\n${describeRoutine(routine)}`)
    },
  )

  server.registerTool(
    'manage_routine_day',
    {
      description:
        'Agrega un día a la rutina (vacío o copiando otro), lo renombra (las sesiones registradas se mueven al nombre nuevo) o lo elimina (las sesiones se conservan). Usá nombres de día de la semana (ej. "Martes") para que la app sugiera el día según la fecha.',
      inputSchema: {
        action: z.enum(['add', 'rename', 'remove']),
        day: z.string().describe('Día a agregar, renombrar o eliminar'),
        new_name: z.string().optional().describe('Para rename'),
        copy_from: z.string().optional().describe('Para add: copiar los ejercicios de este día'),
        position: z.number().int().min(1).optional().describe('Para add: posición del día (1 = primero)'),
      },
      annotations: { destructiveHint: true },
    },
    async ({ action, day, new_name, copy_from, position }) => {
      const state = await readState()
      const routine = structuredClone(routineOf(state))
      if (action === 'add') {
        if (findDay(routine, day)) return fail(`Ya existe el día "${day}".`)
        if (routine.length >= MAX_DAYS) return fail(`La rutina ya tiene ${MAX_DAYS} días.`)
        const source = copy_from ? findDay(routine, copy_from) : undefined
        if (copy_from && !source) return fail(`No existe el día "${copy_from}".`)
        routine.splice(position ? position - 1 : routine.length, 0, { name: day.trim(), exercises: structuredClone(source?.exercises ?? []) })
        await saveRoutine(routine)
        return text(`Día agregado: ${day.trim()}${source ? ` (copia de ${source.name})` : ''}.\n\n${describeRoutine(routine)}`)
      }
      const d = findDay(routine, day)
      if (!d) return fail(`No existe el día "${day}". Días: ${routine.map((x) => x.name).join(', ')}.`)
      if (action === 'remove') {
        if (routine.length === 1) return fail('La rutina tiene que tener al menos un día.')
        await saveRoutine(routine.filter((x) => x !== d))
        return text(`Día eliminado: ${d.name}. Las sesiones registradas se conservan.\n\n${describeRoutine(routine.filter((x) => x !== d))}`)
      }
      if (!new_name?.trim()) return fail('Falta new_name.')
      if (findDay(routine, new_name) && !same(new_name, d.name)) return fail(`Ya existe el día "${new_name}".`)
      const oldName = d.name
      d.name = new_name.trim()
      // Sessions are keyed by date and day name: move them to the new name.
      const extra: Op[] = []
      for (const w of state.workouts.filter((x) => x.day === oldName)) {
        const id = sessionId(w.date, d.name)
        extra.push({ type: 'deleteWorkout', id: w.id }, { type: 'putWorkout', session: { ...w, id, day: d.name } })
      }
      await saveRoutine(routine, extra)
      return text(`Día renombrado: ${oldName} → ${d.name}${extra.length ? ` (${plural(extra.length / 2, 'sesión movida', 'sesiones movidas')})` : ''}.\n\n${describeRoutine(routine)}`)
    },
  )

  server.registerTool(
    'replace_routine',
    {
      description:
        'Reemplaza la rutina completa (por ejemplo al armar una nueva). Confirmá con el usuario antes de usarla. El historial se conserva: los ejercicios que mantengan el mismo nombre siguen mostrando su progreso.',
      inputSchema: {
        days: z
          .array(
            z.object({
              name: z.string().min(1),
              exercises: z.array(z.object({ name: z.string().min(1), ...exerciseFields })).min(1),
            }),
          )
          .min(1)
          .max(MAX_DAYS),
      },
      annotations: { destructiveHint: true },
    },
    async ({ days }) => {
      const names = days.map((d) => normalize(d.name))
      if (new Set(names).size !== names.length) return fail('Hay días repetidos.')
      const routine: RoutineDay[] = days.map((d) => ({
        name: d.name.trim(),
        exercises: d.exercises.map((e) => ({ n: e.name.trim(), g: e.group, s: e.sets, r: e.reps, rir: e.rir, w: e.start_weight })),
      }))
      await saveRoutine(routine)
      return text(`Rutina reemplazada.\n\n${describeRoutine(routine)}`)
    },
  )

  server.registerTool(
    'get_workout',
    {
      description: 'Muestra lo registrado en el gimnasio en una fecha (por defecto hoy): series hechas vs. planificadas de cada ejercicio.',
      inputSchema: { date: dateArg.optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ date }) => {
      const state = await readState()
      const d = date ?? today()
      const sessions = state.workouts.filter((w) => w.date === d)
      if (!sessions.length) {
        const last = state.workouts.filter((w) => w.date < d).at(-1)
        return text(`Sin sesión registrada el ${d}. Día sugerido por la fecha: ${dayForDate(routineOf(state), d)}.${last ? ` Última sesión: ${last.date} (${last.day}).` : ''}`)
      }
      return text(sessions.map((s) => sessionSummary(state, s)).join('\n\n'))
    },
  )

  server.registerTool(
    'log_workout_sets',
    {
      description:
        'Registra las series (kg × reps) de un ejercicio en una sesión. Por defecto reemplaza las series de ese ejercicio en esa fecha; con append las agrega. Para ejercicios con peso corporal usá kg 0.',
      inputSchema: {
        exercise: z.string().describe('Nombre del ejercicio (como en la rutina)'),
        sets: z.array(z.object({ kg: z.number().min(0), reps: z.number().int().min(1) })).min(1),
        date: dateArg.optional().describe('Por defecto hoy'),
        day: z.string().optional().describe('Día de la rutina; por defecto el que corresponde a la fecha o el que tiene ese ejercicio'),
        append: z.boolean().default(false),
      },
    },
    async (a) => {
      const state = await readState()
      const routine = routineOf(state)
      const date = a.date ?? today()
      let day = a.day ? findDay(routine, a.day) : findDay(routine, dayForDate(routine, date))
      if (a.day && !day) return fail(`No existe el día "${a.day}". Días: ${routine.map((x) => x.name).join(', ')}.`)
      let name = day && findExercise(state, a.exercise, day)
      let dayName = day?.name
      if (!name && !a.day) {
        // Not in the day the date suggests. If that date already has a session, it was done there
        // (as an extra); otherwise use the routine day that has the exercise.
        const anyName = findExercise(state, a.exercise)
        const existing = state.workouts.find((w) => w.date === date)
        if (anyName && existing) {
          name = anyName
          dayName = existing.day
        } else {
          day = routine.find((d) => findExercise(state, a.exercise, d))
          name = day && findExercise(state, a.exercise, day)
          dayName = day?.name
        }
      }
      if (!dayName || !name) {
        return fail(`"${a.exercise}" no está en la rutina${day ? ` de ${day.name}` : ''}. Agregalo primero con add_routine_exercise o indicá el día.`)
      }
      const id = sessionId(date, dayName)
      const session: WorkoutSession = structuredClone(state.workouts.find((w) => w.id === id) ?? { id, date, day: dayName, exercises: {} })
      const sets = a.sets.map((s) => ({ kg: r1(s.kg), reps: s.reps }))
      session.exercises[name] = a.append ? [...validSets(session.exercises[name]), ...sets] : sets
      await applyOps([{ type: 'putWorkout', session }])

      const previous = exerciseHistory(state, name).filter((h) => h.date < date).at(-1)
      const best = sets.reduce((x, y) => (y.kg > x.kg ? y : x))
      const cmp = previous ? ` Mejor serie anterior: ${previous.kg}×${previous.reps} (${previous.date}); hoy ${best.kg}×${best.reps} (${best.kg - previous.kg >= 0 ? '+' : ''}${r1(best.kg - previous.kg)} kg).` : ' Primera vez que se registra.'
      return text(`Registrado ${name} el ${date} (${dayName}): ${session.exercises[name].map((s) => `${s!.kg}×${s!.reps}`).join(', ')}.${cmp}\n\n${sessionSummary(state, session)}`)
    },
  )

  server.registerTool(
    'get_exercise_history',
    {
      description: 'Historial de un ejercicio: series de cada sesión, mejor serie, 1RM estimado, volumen, récord y si está estancado.',
      inputSchema: {
        exercise: z.string(),
        from: dateArg.optional().describe('Por defecto 90 días antes de "to"'),
        to: dateArg.optional().describe('Por defecto hoy'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ exercise, from, to }) => {
      const state = await readState()
      const name = findExercise(state, exercise)
      if (!name) return fail(`No encontré "${exercise}" en la rutina ni en el historial.`)
      const end = to ?? today()
      return text(exerciseReport(state, name, from ?? addDays(end, -89), end))
    },
  )

  server.registerTool(
    'get_training_report',
    {
      description:
        'Evaluación del entrenamiento en un período (por defecto los últimos 28 días): sesiones por semana vs. rutina, series por grupo hechas vs. planificadas, progreso de cada ejercicio, récords y ejercicios estancados.',
      inputSchema: { from: dateArg.optional(), to: dateArg.optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ from, to }) => {
      const end = to ?? today()
      const start = from ?? addDays(end, -27)
      if (start > end) return fail('La fecha "from" es posterior a "to".')
      return text(trainingReport(await readState(), start, end))
    },
  )
}
