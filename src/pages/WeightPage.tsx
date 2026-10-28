import { useState } from 'react'
import WeightChart from '../components/WeightChart'
import { actions, useStore } from '../lib/store'
import { formatDate, todayISO } from '../lib/dates'

export default function WeightPage() {
  const { weights, settings } = useStore()
  const [date, setDate] = useState(todayISO())
  const [kg, setKg] = useState('')

  const latest = weights.at(-1)
  const first = weights[0]
  const change = latest && first ? latest.kg - first.kg : 0
  const toGoal = latest && settings.goalWeightKg ? latest.kg - settings.goalWeightKg : null

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const v = parseFloat(kg.replace(',', '.'))
    if (!(v > 0) || !date) return
    actions.logWeight(date, Math.round(v * 10) / 10)
    setKg('')
  }

  return (
    <div className="page">
      <h2 className="page-title">Peso</h2>

      <section className="card stats">
        <div>
          <strong>{latest ? `${latest.kg} kg` : '—'}</strong>
          <small>Actual</small>
        </div>
        <div>
          <strong className={change > 0 ? 'over' : change < 0 ? 'ok' : ''}>
            {weights.length > 1 ? `${change > 0 ? '+' : ''}${change.toFixed(1)} kg` : '—'}
          </strong>
          <small>Cambio total</small>
        </div>
        <div>
          <strong>{toGoal === null ? '—' : `${Math.abs(toGoal).toFixed(1)} kg`}</strong>
          <small>{toGoal === null ? 'Al objetivo' : toGoal > 0 ? 'Por bajar' : toGoal < 0 ? 'Por subir' : '¡Logrado!'}</small>
        </div>
      </section>

      <form className="card form" onSubmit={submit}>
        <h3>Registrar peso</h3>
        <div className="amount-row">
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min={0}
            placeholder="kg"
            value={kg}
            onChange={(e) => setKg(e.target.value)}
          />
          <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
        </div>
        <button className="btn block" type="submit" disabled={!kg}>
          Guardar
        </button>
      </form>

      {weights.length > 0 && (
        <section className="card">
          <WeightChart data={weights} goal={settings.goalWeightKg} />
        </section>
      )}

      <section className="card form">
        <label>
          Peso objetivo (kg)
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min={0}
            value={settings.goalWeightKg ?? ''}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              actions.updateSettings({ goalWeightKg: v > 0 ? v : undefined })
            }}
          />
        </label>
      </section>

      {weights.length > 0 && (
        <>
          <h4 className="list-title">Historial</h4>
          <div className="card list">
            {[...weights].reverse().map((w, i, arr) => {
              const prev = arr[i + 1]
              const diff = prev ? w.kg - prev.kg : null
              return (
                <div key={w.id} className="entry">
                  <span className="entry-main static">
                    <span className="entry-name">{w.kg} kg</span>
                    <small>{formatDate(w.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</small>
                  </span>
                  {diff !== null && (
                    <span className={`diff ${diff > 0 ? 'over' : diff < 0 ? 'ok' : ''}`}>
                      {diff > 0 ? '+' : ''}
                      {diff.toFixed(1)}
                    </span>
                  )}
                  <button className="icon-btn danger" aria-label="Eliminar" onClick={() => actions.removeWeight(w.id)}>
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
