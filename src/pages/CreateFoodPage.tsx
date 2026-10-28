import { useState } from 'react'
import { actions, newId } from '../lib/store'
import type { Food } from '../types'

interface Props {
  barcode?: string
  onBack: () => void
  onCreated: (food: Food) => void
}

export default function CreateFoodPage({ barcode, onBack, onCreated }: Props) {
  const [form, setForm] = useState({
    name: '',
    brand: '',
    barcode: barcode ?? '',
    servingGrams: '',
    kcal: '',
    carbs: '',
    fat: '',
    protein: '',
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))
  const n = (v: string) => {
    const x = parseFloat(v.replace(',', '.'))
    return Number.isFinite(x) && x >= 0 ? x : 0
  }
  const valid = form.name.trim() !== '' && form.kcal !== ''

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    const food: Food = {
      id: `custom:${newId()}`,
      name: form.name.trim(),
      brand: form.brand.trim() || undefined,
      barcode: form.barcode.replace(/\D/g, '') || undefined,
      servingGrams: n(form.servingGrams) || undefined,
      per100g: { kcal: n(form.kcal), carbs: n(form.carbs), fat: n(form.fat), protein: n(form.protein) },
    }
    actions.saveCustomFood(food)
    onCreated(food)
  }

  return (
    <form className="page" onSubmit={submit}>
      <div className="topbar">
        <button type="button" className="link" onClick={onBack}>
          ‹ Volver
        </button>
        <span>Crear alimento</span>
        <span style={{ width: 64 }} />
      </div>

      <section className="card form">
        <label>
          Nombre *
          <input value={form.name} onChange={set('name')} placeholder="Ej: Yogur natural" required />
        </label>
        <label>
          Marca
          <input value={form.brand} onChange={set('brand')} />
        </label>
        <label>
          Código de barras
          <input value={form.barcode} onChange={set('barcode')} inputMode="numeric" />
        </label>
        <label>
          Tamaño de porción (g)
          <input value={form.servingGrams} onChange={set('servingGrams')} type="number" inputMode="decimal" step="any" />
        </label>
      </section>

      <h4 className="list-title">Información nutricional cada 100 g</h4>
      <section className="card form">
        <label>
          Calorías (kcal) *
          <input value={form.kcal} onChange={set('kcal')} type="number" inputMode="decimal" step="any" required />
        </label>
        <label>
          Carbohidratos (g)
          <input value={form.carbs} onChange={set('carbs')} type="number" inputMode="decimal" step="any" />
        </label>
        <label>
          Grasas (g)
          <input value={form.fat} onChange={set('fat')} type="number" inputMode="decimal" step="any" />
        </label>
        <label>
          Proteínas (g)
          <input value={form.protein} onChange={set('protein')} type="number" inputMode="decimal" step="any" />
        </label>
      </section>

      <button className="btn block" type="submit" disabled={!valid}>
        Guardar y continuar
      </button>
    </form>
  )
}
