import type { AppState, Exercise, RoutineDay } from '../types.js'

export type { Exercise, RoutineDay }

const DEFAULT_ROUTINE_BY_DAY: Record<string, Exercise[]> = {
  Lunes: [
    { n: 'Sentadilla hack', g: 'Cuádriceps', s: 4, r: '8', rir: 'RIR 2', w: '90 kg' },
    { n: 'Prensa 45°', g: 'Cuádriceps', s: 3, r: '12', rir: 'RIR 2', w: '100 kg' },
    { n: 'Curl femoral acostado', g: 'Isquios/Glúteo', s: 3, r: '12', rir: 'RIR 0-1', w: '30 kg' },
    { n: 'Press inclinado mancuernas', g: 'Pecho', s: 4, r: '8', rir: 'RIR 2', w: '22 kg c/u' },
    { n: 'Aperturas en polea', g: 'Pecho', s: 3, r: '12', rir: 'RIR 0-1', w: '10 kg lado' },
    { n: 'Jalón al pecho supino', g: 'Espalda', s: 4, r: '10', rir: 'RIR 2', w: '55 kg' },
    { n: 'Remo sentado en polea', g: 'Espalda', s: 4, r: '10', rir: 'RIR 2', w: '45 kg' },
    { n: 'Elevaciones laterales', g: 'Hombro lateral', s: 4, r: '15', rir: 'al fallo', w: '6 kg c/u' },
    { n: 'Fondos de tríceps', g: 'Tríceps', s: 3, r: '8', rir: 'RIR 1', w: 'corporal' },
    { n: 'Plancha', g: 'Core', s: 2, r: '45 seg', rir: '—', w: 'corporal' },
  ],
  Miércoles: [
    { n: 'Máquina cuádriceps', g: 'Cuádriceps', s: 4, r: '12', rir: 'RIR 2', w: '70 kg' },
    { n: 'Estocadas con mancuernas', g: 'Cuádriceps', s: 3, r: '10', rir: 'RIR 2', w: '12 kg c/u' },
    { n: 'Hip thrust', g: 'Isquios/Glúteo', s: 4, r: '10', rir: 'RIR 2', w: '60 kg' },
    { n: 'Press de pecho en máquina', g: 'Pecho', s: 4, r: '10', rir: 'RIR 2', w: '80 kg' },
    { n: 'Flexiones', g: 'Pecho', s: 3, r: 'al fallo', rir: 'RIR 0', w: 'corporal' },
    { n: 'Jalón agarre neutro', g: 'Espalda', s: 4, r: '10', rir: 'RIR 2', w: '55 kg' },
    { n: 'Remo con mancuerna', g: 'Espalda', s: 3, r: '10', rir: 'RIR 2', w: '24 kg' },
    { n: 'Pájaros o face pull', g: 'Deltoide post.', s: 4, r: '15', rir: 'RIR 0-1', w: '5 kg c/u' },
    { n: 'Predicador barra recta', g: 'Bíceps', s: 4, r: '10', rir: 'RIR 0-1', w: '15 kg + barra' },
  ],
  Viernes: [
    { n: 'Sentadilla búlgara', g: 'Cuádriceps', s: 4, r: '10', rir: 'RIR 2', w: '10 kg c/u' },
    { n: 'Sentadilla hack', g: 'Cuádriceps', s: 3, r: '10', rir: 'RIR 2', w: '80 kg' },
    { n: 'Hiperextensiones 45°', g: 'Isquios/Glúteo', s: 3, r: '12', rir: 'RIR 1', w: 'corporal' },
    { n: 'Press plano mancuernas', g: 'Pecho', s: 4, r: '10', rir: 'RIR 2', w: '20 kg c/u' },
    { n: 'Cruces en polea', g: 'Pecho', s: 3, r: '12', rir: 'RIR 0-1', w: '10 kg lado' },
    { n: 'Remo en máquina', g: 'Espalda', s: 4, r: '10', rir: 'RIR 2', w: '50 kg' },
    { n: 'Jalón agarre ancho', g: 'Espalda', s: 3, r: '12', rir: 'RIR 2', w: '45 kg' },
    { n: 'Elevaciones laterales', g: 'Hombro lateral', s: 4, r: '15', rir: 'al fallo', w: '6 kg c/u' },
    { n: 'Curl martillo inclinado', g: 'Bíceps', s: 4, r: '10', rir: 'RIR 0-1', w: '10 kg c/u' },
    { n: 'Gemelos de pie', g: 'Gemelos', s: 4, r: '15', rir: 'al fallo', w: '40 kg' },
  ],
}

/** The routine the app started with; used until it's edited. */
export const DEFAULT_ROUTINE: RoutineDay[] = Object.entries(DEFAULT_ROUTINE_BY_DAY).map(([name, exercises]) => ({
  name,
  exercises,
}))

export function routineOf(state: AppState): RoutineDay[] {
  return state.routine?.length ? state.routine : DEFAULT_ROUTINE
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
const weekdayOf = (name: string) => WEEKDAYS.indexOf(name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim())

/**
 * Routine day to train on a date: the latest routine day named after a weekday that falls on or
 * before that date's weekday (Mon–Tue → Lunes, Wed–Thu → Miércoles, Fri–Sun → Viernes), wrapping
 * to the week's last one. Routines whose days aren't weekday names start on their first day.
 */
export function dayForDate(routine: RoutineDay[], iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const today = (new Date(y, m - 1, d).getDay() + 6) % 7 // Monday = 0
  const named = routine
    .map((day) => ({ name: day.name, wd: (weekdayOf(day.name) + 6) % 7 }))
    .filter((x) => weekdayOf(x.name) >= 0)
    .sort((a, b) => a.wd - b.wd)
  if (!named.length) return routine[0]?.name ?? ''
  return (named.filter((x) => x.wd <= today).at(-1) ?? named.at(-1)!).name
}

export const sessionId = (date: string, day: string) => `${date}|${day}`

export interface BestSet {
  date: string
  kg: number
  reps: number
  sets: number
}

/** Best set (heaviest) of every session where the exercise was logged, oldest first. */
export function exerciseHistory(state: AppState, name: string): BestSet[] {
  const out: BestSet[] = []
  for (const session of state.workouts) {
    const sets = (session.exercises[name] ?? []).filter((x): x is { kg: number; reps: number } => !!x && x.kg > 0 && x.reps > 0)
    if (!sets.length) continue
    const top = sets.reduce((a, b) => (b.kg > a.kg ? b : a))
    out.push({ date: session.date, kg: top.kg, reps: top.reps, sets: sets.length })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** Exercises in the routine plus any with logged history, so removed ones stay reviewable. */
export function allExerciseNames(state: AppState): string[] {
  const names = routineOf(state).flatMap((d) => d.exercises.map((e) => e.n))
  for (const w of state.workouts) names.push(...Object.keys(w.exercises))
  return [...new Set(names)]
}

/** Direct sets per week by muscle group across the routine, with the 10–20 sets guideline. */
export function weeklyVolume(routine: RoutineDay[]): { group: string; sets: number; status: string }[] {
  const count: Record<string, number> = {}
  for (const ex of routine.flatMap((d) => d.exercises)) count[ex.g] = (count[ex.g] ?? 0) + ex.s
  return Object.entries(count)
    .sort((a, b) => b[1] - a[1])
    .map(([group, sets]) => ({
      group,
      sets,
      status: sets === 0 ? 'sin trabajo directo' : sets < 10 ? 'bajo el rango' : sets > 20 ? 'sobre el rango' : 'en rango',
    }))
}
