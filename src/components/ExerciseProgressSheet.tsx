import { useEffect } from 'react'
import { formatDate } from '../lib/dates'
import { familyColor, familyIndex, GROUP_FAMILIES, groupOfExercise } from '../lib/muscleGroups'
import { estimated1RM, exerciseHistory } from '../lib/routine'
import { useStore } from '../lib/store'
import WeightChart from './WeightChart'

const shortDate = (iso: string) => formatDate(iso, { day: '2-digit', month: '2-digit' })

/** Bottom sheet with one exercise's progress: best set per session, chart and sessions. */
export default function ExerciseProgressSheet({ name, onClose }: { name: string; onClose: () => void }) {
  const state = useStore()
  const history = exerciseHistory(state, name)
  const family = familyIndex(groupOfExercise(state, name))
  const first = history[0]
  const last = history.at(-1)
  const change = first && last ? Math.round((last.kg - first.kg) * 10) / 10 : 0
  const best = history.length ? history.reduce((a, b) => (estimated1RM(b) > estimated1RM(a) ? b : a)) : undefined

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={`Progreso de ${name}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <h2>{name}</h2>
            <span className="group-chip">
              <i style={{ background: familyColor(family) }} />
              {GROUP_FAMILIES[family].label}
            </span>
          </div>
          <button className="icon-btn" aria-label="Cerrar" onClick={onClose}>
            ×
          </button>
        </div>

        {history.length >= 2 ? (
          <>
            <WeightChart
              data={history.map((h) => ({ id: h.date, date: h.date, kg: h.kg }))}
              label={`Progreso de ${name}`}
              color={familyColor(family)}
            />
            <p className="muted small">
              Mejor serie de cada sesión.{' '}
              {change > 0 ? `Subiste ${change} kg` : change < 0 ? `Bajaste ${Math.abs(change)} kg` : 'Sin cambios'} desde el{' '}
              {shortDate(first!.date)}. Última: {last!.kg} kg × {last!.reps}.
              {best && ` Récord: ${best.kg} kg × ${best.reps} (1RM estimado ${Math.round(estimated1RM(best))} kg).`}
            </p>
          </>
        ) : (
          <p className="muted small">
            {history.length === 1
              ? `Una sola sesión registrada (${last!.kg} kg × ${last!.reps}). Con dos ya se puede ver la tendencia.`
              : 'Todavía no registraste este ejercicio.'}
          </p>
        )}

        {history.length > 0 && (
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
        )}
      </div>
    </div>
  )
}
