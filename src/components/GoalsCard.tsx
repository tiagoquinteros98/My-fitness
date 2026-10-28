import { useState } from 'react'
import { actions, useStore } from '../lib/store'
import { MACROS, type Macro } from '../types'

/** Number input that keeps its own text so it can be cleared or half-typed without fighting the store. */
function GoalInput({ value, onCommit, placeholder }: { value?: number; onCommit: (v?: number) => void; placeholder?: string }) {
  const [text, setText] = useState(value?.toString() ?? '')
  const [prevValue, setPrevValue] = useState(value)
  // Value changed from outside (e.g. "Usar N kcal"): show it, unless it's what's being typed.
  if (value !== prevValue) {
    setPrevValue(value)
    if (value !== Math.round(parseFloat(text))) setText(value?.toString() ?? '')
  }
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const v = Math.round(parseFloat(e.target.value))
        onCommit(v > 0 ? v : undefined)
      }}
    />
  )
}

export default function GoalsCard() {
  const { settings } = useStore()
  const { macroGoals } = settings

  const setMacro = (id: Macro) => (v?: number) =>
    actions.updateSettings({ macroGoals: { ...macroGoals, [id]: v } })

  const allMacros = MACROS.every((m) => macroGoals[m.id])
  const macroKcal = MACROS.reduce((s, m) => s + (macroGoals[m.id] ?? 0) * m.kcalPerGram, 0)

  return (
    <section className="card form">
      <h3>Objetivos diarios</h3>
      <label>
        Calorías (kcal)
        <GoalInput value={settings.calorieGoal} onCommit={(v) => v && actions.updateSettings({ calorieGoal: v })} />
      </label>
      <div className="goal-grid">
        {MACROS.map((m) => (
          <label key={m.id}>
            {m.label} (g)
            <GoalInput value={macroGoals[m.id]} onCommit={setMacro(m.id)} placeholder="—" />
          </label>
        ))}
      </div>
      {allMacros && (
        <p className="muted small">
          Tus macros suman {macroKcal} kcal
          {Math.abs(macroKcal - settings.calorieGoal) > 50 && (
            <>
              {' '}
              (tu objetivo es {settings.calorieGoal}).{' '}
              <button type="button" className="link" onClick={() => actions.updateSettings({ calorieGoal: macroKcal })}>
                Usar {macroKcal} kcal
              </button>
            </>
          )}
        </p>
      )}
    </section>
  )
}
