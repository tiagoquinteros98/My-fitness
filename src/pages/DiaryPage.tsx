import { actions, nutrientsFor, useStore } from '../lib/store'
import { addDays, dayLabel } from '../lib/dates'
import BarcodeIcon from '../components/BarcodeIcon'
import GoalsCard from '../components/GoalsCard'
import { MACROS, MEALS, type DiaryEntry, type Meal } from '../types'

interface Props {
  date: string
  onChangeDate: (date: string) => void
  onAddFood: (meal: Meal) => void
  onScanFood: (meal: Meal) => void
  onEditEntry: (entry: DiaryEntry) => void
}

export default function DiaryPage({ date, onChangeDate, onAddFood, onScanFood, onEditEntry }: Props) {
  const { diary, settings } = useStore()
  const entries = diary.filter((e) => e.date === date)

  const totals = entries.reduce(
    (acc, e) => {
      const n = nutrientsFor(e.food, e.grams)
      acc.kcal += n.kcal
      acc.protein += n.protein
      acc.carbs += n.carbs
      acc.fat += n.fat
      return acc
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )
  const remaining = settings.calorieGoal - Math.round(totals.kcal)

  return (
    <div className="page">
      <div className="date-nav">
        <button className="icon-btn" aria-label="Día anterior" onClick={() => onChangeDate(addDays(date, -1))}>
          ‹
        </button>
        <span className="date-label">{dayLabel(date)}</span>
        <button className="icon-btn" aria-label="Día siguiente" onClick={() => onChangeDate(addDays(date, 1))}>
          ›
        </button>
      </div>

      <section className="card summary">
        <h3>Calorías restantes</h3>
        <div className="equation">
          <div>
            <strong>{settings.calorieGoal}</strong>
            <small>Objetivo</small>
          </div>
          <span>−</span>
          <div>
            <strong>{Math.round(totals.kcal)}</strong>
            <small>Comida</small>
          </div>
          <span>=</span>
          <div className={remaining < 0 ? 'over' : 'ok'}>
            <strong>{remaining}</strong>
            <small>Restantes</small>
          </div>
        </div>
        <div className="progress">
          <div style={{ width: `${Math.min(100, (totals.kcal / settings.calorieGoal) * 100)}%` }} />
        </div>
        <div className="macros">
          {MACROS.map((m) => {
            const eaten = Math.round(totals[m.id])
            const goal = settings.macroGoals[m.id]
            return (
              <div key={m.id} className={`macro macro-${m.id}`}>
                <span>{m.label}</span>
                <strong className={goal && eaten > goal ? 'over' : undefined}>
                  {eaten}
                  {goal ? <small> / {goal} g</small> : <small> g</small>}
                </strong>
                {goal ? (
                  <div className="progress thin">
                    <div style={{ width: `${Math.min(100, (eaten / goal) * 100)}%` }} />
                  </div>
                ) : null}
                {goal ? <small>{eaten > goal ? `+${eaten - goal} g` : `Faltan ${goal - eaten} g`}</small> : null}
              </div>
            )
          })}
        </div>
      </section>

      {MEALS.map((meal) => {
        const mealEntries = entries.filter((e) => e.meal === meal.id)
        const mealKcal = mealEntries.reduce((s, e) => s + nutrientsFor(e.food, e.grams).kcal, 0)
        return (
          <section key={meal.id} className="card meal">
            <div className="meal-header">
              <h3>{meal.label}</h3>
              <span className="meal-kcal">{Math.round(mealKcal)}</span>
            </div>
            {mealEntries.map((e) => (
              <div key={e.id} className="entry">
                <button className="entry-main" onClick={() => onEditEntry(e)}>
                  <span className="entry-name">{e.food.name}</span>
                  <small>
                    {e.food.brand ? `${e.food.brand}, ` : ''}
                    {e.grams} g
                  </small>
                </button>
                <span className="entry-kcal">{Math.round(nutrientsFor(e.food, e.grams).kcal)}</span>
                <button className="icon-btn danger" aria-label="Eliminar" onClick={() => actions.removeDiaryEntry(e.id)}>
                  ×
                </button>
              </div>
            ))}
            <div className="meal-footer">
              <button className="link add" onClick={() => onAddFood(meal.id)}>
                + Agregar alimento
              </button>
              <button
                className="scan-shortcut"
                onClick={() => onScanFood(meal.id)}
                aria-label={`Escanear código de barras para ${meal.label}`}
              >
                <BarcodeIcon size={18} />
              </button>
            </div>
          </section>
        )
      })}

      <GoalsCard />
    </div>
  )
}
