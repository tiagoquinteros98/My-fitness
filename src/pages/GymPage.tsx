import { useRef, useState } from 'react'
import AllProgressChart, { type ProgressSeries } from '../components/AllProgressChart'
import ExerciseProgressSheet from '../components/ExerciseProgressSheet'
import { formatDate, todayISO } from '../lib/dates'
import { familyColor, familyIndex, GROUP_FAMILIES, groupOfExercise } from '../lib/muscleGroups'
import {
  allExerciseNames,
  dayForDate,
  estimated1RM,
  exerciseHistory,
  routineOf,
  sessionId,
  weeklyVolume,
  type Exercise,
} from '../lib/routine'
import { actions, useStore } from '../lib/store'
import { openTiktokApp, tiktokSearchUrl } from '../lib/tiktok'
import type { AppState, WorkoutSession } from '../types'

type View = 'train' | 'progress'

const shortDate = (iso: string) => formatDate(iso, { day: '2-digit', month: '2-digit' })

export default function GymPage() {
  const [view, setView] = useState<View>('train')
  return (
    <div className="page gym">
      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={view === 'train'} onClick={() => setView('train')}>
          Entrenamiento
        </button>
        <button role="tab" aria-selected={view === 'progress'} onClick={() => setView('progress')}>
          Progreso
        </button>
      </div>
      {view === 'train' ? <TrainView /> : <ProgressView />}
    </div>
  )
}

// --- Training log ---

function TrainView() {
  const state = useStore()
  const [date, setDate] = useState(todayISO())
  const routine = routineOf(state)
  const [chosenDay, setDay] = useState(() => dayForDate(routine, todayISO()))
  // The routine can change (e.g. edited through Claude): fall back if the chosen day is gone.
  const routineDay = routine.find((d) => d.name === chosenDay) ?? routine[0]
  const day = routineDay?.name ?? chosenDay
  // Set inputs are uncontrolled; bumping this remounts them empty after "Vaciar día".
  const [resets, setResets] = useState(0)
  const [progressOf, setProgressOf] = useState<string | null>(null)
  const id = sessionId(date, day)
  const session = state.workouts.find((w) => w.id === id)
  const exercises = routineDay?.exercises ?? []

  let done = 0
  let total = 0
  let moved = 0
  for (const ex of exercises) {
    total += ex.s
    for (const set of session?.exercises[ex.n] ?? []) {
      if (set && set.kg > 0 && set.reps > 0) {
        done++
        moved += set.kg * set.reps
      }
    }
  }

  function updateSet(ex: Exercise, i: number, field: 'kg' | 'reps', raw: string) {
    // Read the latest session at the time of the edit, not the one from this render.
    const current = actions.getWorkout(id) ?? { id, date, day, exercises: {} }
    const sets = [...(current.exercises[ex.n] ?? [])]
    while (sets.length <= i) sets.push(null)
    const value = field === 'kg' ? parseFloat(raw.replace(',', '.')) || 0 : parseInt(raw, 10) || 0
    sets[i] = { kg: sets[i]?.kg ?? 0, reps: sets[i]?.reps ?? 0, [field]: value }
    actions.saveWorkout({ ...current, exercises: { ...current.exercises, [ex.n]: sets } })
  }

  return (
    <>
      <div className="days">
        {routine.map(({ name }) => (
          <button key={name} className="day" aria-pressed={name === day} onClick={() => setDay(name)}>
            {name}
          </button>
        ))}
      </div>
      <label className="datebar">
        Fecha de la sesión
        <input
          type="date"
          value={date}
          max={todayISO()}
          onChange={(e) => {
            const next = e.target.value || todayISO()
            setDate(next)
            setDay(dayForDate(routine, next))
          }}
        />
      </label>

      <section className="card exercises">
        {exercises.map((ex) => (
          <ExerciseBlock
            key={`${id}|${ex.n}|${resets}`}
            ex={ex}
            session={session}
            state={state}
            date={date}
            onSet={(i, field, raw) => updateSet(ex, i, field, raw)}
            onShowProgress={() => setProgressOf(ex.n)}
          />
        ))}
      </section>

      <section className="card">
        <h3>Volumen semanal por grupo</h3>
        {weeklyVolume(routine).map((v) => (
          <div key={v.group} className="vol">
            <b>{v.sets}</b>
            <span className="vol-group">{v.group}</span>
            <span className={`vol-status${v.status === 'en rango' ? ' ok' : ''}`}>{v.status}</span>
          </div>
        ))}
        <p className="muted small">
          Series directas por semana en los tres días. Los jalones y remos suman bíceps y los press suman tríceps, así que
          el trabajo real de brazo es mayor al que figura acá.
        </p>
      </section>

      {progressOf && <ExerciseProgressSheet name={progressOf} onClose={() => setProgressOf(null)} />}

      <div className="gym-bar">
        <span>
          {done} de {total} series
          {moved > 0 && ` · ${Math.round(moved).toLocaleString('es-AR')} kg movidos`}
        </span>
        <button
          className="btn ghost"
          disabled={!session}
          onClick={() => {
            if (!confirm(`¿Vaciar lo registrado el ${shortDate(date)} (${day})?`)) return
            actions.deleteWorkout(id)
            setResets((n) => n + 1)
          }}
        >
          Vaciar día
        </button>
      </div>
    </>
  )
}

function ExerciseBlock({
  ex,
  session,
  state,
  date,
  onSet,
  onShowProgress,
}: {
  ex: Exercise
  session?: WorkoutSession
  state: AppState
  date: string
  onSet: (i: number, field: 'kg' | 'reps', raw: string) => void
  onShowProgress: () => void
}) {
  const sets = session?.exercises[ex.n] ?? []
  const previous = exerciseHistory(state, ex.n)
    .filter((h) => h.date < date)
    .at(-1)
  const bestToday = sets.reduce((a, s) => (s && s.kg > 0 ? Math.max(a, s.kg) : a), 0)
  const delta = previous && bestToday > 0 ? Math.round((bestToday - previous.kg) * 10) / 10 : undefined

  return (
    <div className="ex">
      <div className="ex-head">
        <div>
          <div className="ex-name">{ex.n}</div>
          <div className="ex-meta">
            {ex.s} × {ex.r} · {ex.rir} · {ex.g}
          </div>
        </div>
        <div className="ex-actions">
        <button
          className="vid"
          onClick={onShowProgress}
          title={`Ver el progreso de ${ex.n}`}
          aria-label={`Ver el progreso de ${ex.n}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 3v18h18" />
            <path d="m7 15 4-4 3 3 6-6" />
          </svg>
        </button>
        <a
          className="vid"
          href={tiktokSearchUrl(ex.n)}
          target="_blank"
          rel="noopener"
          title={`Ver la técnica de ${ex.n} en TikTok`}
          aria-label={`Ver la técnica de ${ex.n} en TikTok`}
          onClick={(e) => {
            if (openTiktokApp(ex.n)) e.preventDefault()
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="2.5" y="5.5" width="13" height="13" rx="2.5" />
            <path d="M15.5 10.5 21 7.5v9l-5.5-3z" />
          </svg>
        </a>
        </div>
      </div>

      {previous ? (
        <div className="last">
          <b>
            {previous.kg}
            <small> × {previous.reps}</small>
          </b>
          <span>tu mejor serie del {shortDate(previous.date)}</span>
          {delta !== undefined && (
            <span className={`delta${delta > 0 ? ' up' : delta < 0 ? ' down' : ''}`}>
              {delta > 0 ? `+${delta} kg` : delta < 0 ? `${delta} kg` : 'igual'}
            </span>
          )}
        </div>
      ) : (
        <div className="last none">
          <b>—</b>
          <span>primera vez que lo registrás. Arrancá con {ex.w}</span>
        </div>
      )}

      <div className="sets">
        {Array.from({ length: ex.s }, (_, i) => {
          const cur = sets[i]
          return (
            <div key={i} className={`set${cur && cur.kg > 0 && cur.reps > 0 ? ' filled' : ''}`}>
              <span className="set-n">{i + 1}</span>
              <SetField
                defaultValue={cur?.kg}
                unit="kg"
                label={`${ex.n}, serie ${i + 1}, peso`}
                decimal
                onChange={(v) => onSet(i, 'kg', v)}
              />
              <SetField
                defaultValue={cur?.reps}
                unit="reps"
                label={`${ex.n}, serie ${i + 1}, repeticiones`}
                onChange={(v) => onSet(i, 'reps', v)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Uncontrolled so partial input like "22," isn't rewritten while typing. */
function SetField({
  defaultValue,
  unit,
  label,
  decimal,
  onChange,
}: {
  defaultValue?: number
  unit: string
  label: string
  decimal?: boolean
  onChange: (raw: string) => void
}) {
  return (
    <label className="set-field">
      <input
        type="number"
        inputMode={decimal ? 'decimal' : 'numeric'}
        step={decimal ? '0.5' : '1'}
        min={0}
        placeholder={decimal ? 'peso' : 'reps'}
        defaultValue={defaultValue ? defaultValue : ''}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      />
      <span>{unit}</span>
    </label>
  )
}

// --- Progress per exercise ---

function ProgressView() {
  const state = useStore()
  const [highlight, setHighlight] = useState<number | null>(null)
  const [progressOf, setProgressOf] = useState<string | null>(null)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // One series per exercise with history, indexed to its first session's estimated 1RM.
  const series: (ProgressSeries & { last: { kg: number; reps: number } })[] = allExerciseNames(state).flatMap((name) => {
    const history = exerciseHistory(state, name)
    if (!history.length) return []
    const base = estimated1RM(history[0])
    return [
      {
        name,
        family: familyIndex(groupOfExercise(state, name)),
        points: history.map((h) => ({ date: h.date, kg: h.kg, reps: h.reps, pct: (estimated1RM(h) / base - 1) * 100 })),
        last: history.at(-1)!,
      },
    ]
  })
  const byFamily = GROUP_FAMILIES.map((f, i) => ({ ...f, i, items: series.filter((s) => s.family === i) })).filter(
    (f) => f.items.length && (highlight === null || highlight === f.i),
  )

  async function importFile(file: File) {
    try {
      const { sessions, weights } = actions.importTrainingBackup(JSON.parse(await file.text()))
      setImportMsg(`Copia importada: ${sessions} sesiones y ${weights} pesajes nuevos.`)
    } catch {
      setImportMsg('El archivo no se pudo leer. Tiene que ser la copia descargada del registro de entrenamiento.')
    }
  }

  return (
    <>
      <section className="card">
        <h3>Progreso de todos los ejercicios</h3>
        {series.length ? (
          <>
            <AllProgressChart series={series} highlight={highlight} onHighlight={setHighlight} />
            <p className="muted small">
              Cambio del 1RM estimado (con la mejor serie de cada sesión) respecto de la primera vez que registraste cada
              ejercicio, así todos entran en la misma escala. Tocá un grupo para resaltarlo.
            </p>
          </>
        ) : (
          <p className="muted small">Cuando registres series en Entrenamiento, acá vas a ver el progreso de cada ejercicio.</p>
        )}
      </section>

      {byFamily.map((f) => (
        <section key={f.label} className="card progress-group">
          <h4 className="group-chip">
            <i style={{ background: familyColor(f.i) }} />
            {f.label}
          </h4>
          {f.items.map((s) => {
            const pct = Math.round(s.points.at(-1)!.pct * 10) / 10
            return (
              <button key={s.name} className="progress-row" onClick={() => setProgressOf(s.name)}>
                <span className="entry-name">{s.name}</span>
                <small>
                  {s.last.kg} kg × {s.last.reps} · {s.points.length === 1 ? '1 sesión' : `${s.points.length} sesiones`}
                </small>
                <b>{s.points.length > 1 ? `${pct > 0 ? '+' : ''}${pct}%` : '—'}</b>
                <span className="chevron" aria-hidden>
                  ›
                </span>
              </button>
            )
          })}
        </section>
      ))}

      {progressOf && <ExerciseProgressSheet name={progressOf} onClose={() => setProgressOf(null)} />}

      <section className="card form">
        <h3>Importar el registro anterior</h3>
        <p className="muted small">
          Si usabas el registro de entrenamiento por separado, subí la copia que descargaste con “Descargar copia”. Se suman
          las sesiones y los pesajes de fechas que todavía no tengas.
        </p>
        <button className="btn ghost" onClick={() => fileRef.current?.click()}>
          Elegir archivo
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void importFile(file)
            e.target.value = ''
          }}
        />
        {importMsg && <p className="small">{importMsg}</p>}
      </section>
    </>
  )
}
