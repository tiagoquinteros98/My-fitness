import { useRef, useState } from 'react'
import WeightChart from '../components/WeightChart'
import { formatDate, todayISO } from '../lib/dates'
import {
  dayForDate,
  exerciseHistory,
  openTiktokApp,
  ROUTINE,
  ROUTINE_DAYS,
  sessionId,
  tiktokSearchUrl,
  weeklyVolume,
  type Exercise,
} from '../lib/routine'
import { actions, useStore } from '../lib/store'
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
  const [day, setDay] = useState(() => dayForDate(todayISO()))
  // Set inputs are uncontrolled; bumping this remounts them empty after "Vaciar día".
  const [resets, setResets] = useState(0)
  const id = sessionId(date, day)
  const session = state.workouts.find((w) => w.id === id)
  const exercises = ROUTINE[day]

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
        {ROUTINE_DAYS.map((d) => (
          <button key={d} className="day" aria-pressed={d === day} onClick={() => setDay(d)}>
            {d}
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
            setDay(dayForDate(next))
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
          />
        ))}
      </section>

      <section className="card">
        <h3>Volumen semanal por grupo</h3>
        {weeklyVolume().map((v) => (
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
}: {
  ex: Exercise
  session?: WorkoutSession
  state: AppState
  date: string
  onSet: (i: number, field: 'kg' | 'reps', raw: string) => void
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

const ALL_EXERCISES = [...new Set(Object.values(ROUTINE).flat().map((e) => e.n))]

function ProgressView() {
  const state = useStore()
  const [exercise, setExercise] = useState(ALL_EXERCISES[0])
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const history = exerciseHistory(state, exercise)
  const first = history[0]
  const last = history.at(-1)
  const change = first && last ? Math.round((last.kg - first.kg) * 10) / 10 : 0

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
      <select className="ex-pick" value={exercise} onChange={(e) => setExercise(e.target.value)} aria-label="Ejercicio">
        {ALL_EXERCISES.map((n) => (
          <option key={n}>{n}</option>
        ))}
      </select>

      <section className="card">
        {history.length >= 2 ? (
          <>
            <WeightChart
              data={history.map((h) => ({ id: h.date, date: h.date, kg: h.kg }))}
              label={`Progreso de ${exercise}`}
            />
            <p className="muted small">
              Mejor serie de cada sesión.{' '}
              {change > 0 ? `Subiste ${change} kg` : change < 0 ? `Bajaste ${Math.abs(change)} kg` : 'Sin cambios'} desde el{' '}
              {shortDate(first!.date)}. Última: {last!.kg} kg × {last!.reps}.
            </p>
          </>
        ) : (
          <p className="muted small">
            {history.length === 1
              ? 'Una sola sesión registrada. Con dos ya se puede ver la tendencia.'
              : 'Todavía no registraste este ejercicio.'}
          </p>
        )}
      </section>

      {history.length > 0 && (
        <>
          <h4 className="list-title">Sesiones registradas</h4>
          <section className="card">
            <table className="log">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Mejor serie</th>
                  <th>Series</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map((h) => (
                  <tr key={h.date}>
                    <td>{formatDate(h.date, { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                    <td>
                      {h.kg} kg × {h.reps}
                    </td>
                    <td>{h.sets}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

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
