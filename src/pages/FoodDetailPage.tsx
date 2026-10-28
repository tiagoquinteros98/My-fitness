import { useState } from 'react'
import { actions, nutrientsFor } from '../lib/store'
import { MEALS, type DiaryEntry, type Food, type Meal } from '../types'

interface Props {
  food: Food
  date: string
  meal: Meal
  /** When editing an existing diary entry. */
  entry?: DiaryEntry
  onBack: () => void
  onDone: () => void
}

type Unit = 'g' | 'serving'

export default function FoodDetailPage({ food, date, meal: initialMeal, entry, onBack, onDone }: Props) {
  const hasServing = !!food.servingGrams
  const [unit, setUnit] = useState<Unit>(entry || !hasServing ? 'g' : 'serving')
  const [amount, setAmount] = useState<string>(entry ? String(entry.grams) : hasServing ? '1' : '100')
  const [meal, setMeal] = useState<Meal>(entry?.meal ?? initialMeal)

  const qty = parseFloat(amount.replace(',', '.'))
  const grams = Number.isFinite(qty) && qty > 0 ? (unit === 'serving' ? qty * food.servingGrams! : qty) : 0
  const n = nutrientsFor(food, grams)

  function changeUnit(next: Unit) {
    if (next === unit || !grams) return setUnit(next)
    setAmount(next === 'g' ? String(Math.round(grams)) : String(+(grams / food.servingGrams!).toFixed(2)))
    setUnit(next)
  }

  function save() {
    const rounded = Math.round(grams * 10) / 10
    if (entry) actions.updateDiaryEntry(entry.id, { grams: rounded, meal })
    else actions.addDiaryEntry({ date, meal, food, grams: rounded })
    onDone()
  }

  return (
    <div className="page">
      <div className="topbar">
        <button className="link" onClick={onBack}>
          ‹ Volver
        </button>
        <span>{entry ? 'Editar' : 'Agregar'} alimento</span>
        <button className="link strong" onClick={save} disabled={!grams}>
          ✓ Guardar
        </button>
      </div>

      <section className="card food-head">
        {food.imageUrl && <img src={food.imageUrl} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />}
        <div>
          <h2>{food.name}</h2>
          {food.brand && <p className="muted">{food.brand}</p>}
          {food.barcode && <p className="muted small">Código: {food.barcode}</p>}
        </div>
      </section>

      <section className="card form">
        <label>
          Comida
          <select value={meal} onChange={(e) => setMeal(e.target.value as Meal)}>
            {MEALS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cantidad
          <div className="amount-row">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <select value={unit} onChange={(e) => changeUnit(e.target.value as Unit)}>
              <option value="g">gramos</option>
              {hasServing && <option value="serving">porción ({food.servingGrams} g)</option>}
            </select>
          </div>
        </label>
      </section>

      <section className="card nutrition">
        <div className="kcal-big">
          <strong>{Math.round(n.kcal)}</strong>
          <small>kcal</small>
        </div>
        <div className="macro-grid">
          <div>
            <strong>{n.carbs.toFixed(1)} g</strong>
            <small>Carbs</small>
          </div>
          <div>
            <strong>{n.fat.toFixed(1)} g</strong>
            <small>Grasas</small>
          </div>
          <div>
            <strong>{n.protein.toFixed(1)} g</strong>
            <small>Proteínas</small>
          </div>
        </div>
        <p className="muted small center">
          Por 100 g: {food.per100g.kcal} kcal · C {food.per100g.carbs} · G {food.per100g.fat} · P {food.per100g.protein}
        </p>
      </section>

      <button className="btn block" onClick={save} disabled={!grams}>
        {entry ? 'Guardar cambios' : `Agregar a ${MEALS.find((m) => m.id === meal)?.label}`}
      </button>
    </div>
  )
}
