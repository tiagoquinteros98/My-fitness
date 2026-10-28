import { addDays } from '../src/lib/dates.js'
import { nutrientsFor } from '../src/lib/nutrition.js'
import { MACROS, MEALS, type AppState, type WeightEntry } from '../src/types.js'

// Read-only analyses of the user's history, used by the MCP history tools.

/** Rough energy content of 1 kg of body weight change. */
const KCAL_PER_KG = 7700

const r1 = (n: number) => Math.round(n * 10) / 10
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

export interface Range {
  from: string
  to: string
}

export function rangeOf(today: string, from?: string, to?: string, defaultDays = 30): Range {
  const end = to ?? today
  return { from: from ?? addDays(end, -(defaultDays - 1)), to: end }
}

/** Least-squares slope of weight over time, in kg per day. */
function weightSlope(weights: WeightEntry[]): number | undefined {
  if (weights.length < 2) return undefined
  const xs = weights.map((w) => daysBetween(weights[0].date, w.date))
  if (xs.at(-1) === 0) return undefined
  const n = weights.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = weights.reduce((a, w) => a + w.kg, 0) / n
  let num = 0
  let den = 0
  weights.forEach((w, i) => {
    num += (xs[i] - mx) * (w.kg - my)
    den += (xs[i] - mx) ** 2
  })
  return den ? num / den : undefined
}

function weightStats(state: AppState, range: Range) {
  const weights = state.weights.filter((w) => w.date >= range.from && w.date <= range.to)
  const slope = weightSlope(weights)
  const last = weights.at(-1)
  const recent = last ? weights.filter((w) => w.date > addDays(last.date, -7)) : []
  return {
    weights,
    first: weights[0],
    last,
    min: weights.length ? weights.reduce((a, w) => (w.kg < a.kg ? w : a)) : undefined,
    max: weights.length ? weights.reduce((a, w) => (w.kg > a.kg ? w : a)) : undefined,
    slopePerDay: slope,
    avgLast7: recent.length ? recent.reduce((a, w) => a + w.kg, 0) / recent.length : undefined,
  }
}

function foodDays(state: AppState, range: Range) {
  const byDate = new Map<string, { kcal: number; carbs: number; fat: number; protein: number; items: number }>()
  for (const e of state.diary) {
    if (e.date < range.from || e.date > range.to) continue
    const n = nutrientsFor(e.food, e.grams)
    const d = byDate.get(e.date) ?? { kcal: 0, carbs: 0, fat: 0, protein: 0, items: 0 }
    d.kcal += n.kcal
    d.carbs += n.carbs
    d.fat += n.fat
    d.protein += n.protein
    d.items++
    byDate.set(e.date, d)
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))
}

export function weightHistoryReport(state: AppState, range: Range): string {
  const s = weightStats(state, range)
  const goal = state.settings.goalWeightKg
  const lines = [`Peso del ${range.from} al ${range.to}: ${s.weights.length} registros.`]
  if (!s.weights.length) {
    const lastEver = state.weights.at(-1)
    lines.push(lastEver ? `Sin pesajes en el período. Último registro: ${lastEver.kg} kg el ${lastEver.date}.` : 'Nunca registró su peso.')
    return lines.join('\n')
  }
  lines.push('', ...s.weights.map((w) => `${w.date}: ${w.kg} kg`), '')
  lines.push(`Primero: ${s.first!.kg} kg (${s.first!.date}). Último: ${s.last!.kg} kg (${s.last!.date}).`)
  if (s.weights.length > 1) lines.push(`Cambio: ${r1(s.last!.kg - s.first!.kg) > 0 ? '+' : ''}${r1(s.last!.kg - s.first!.kg)} kg.`)
  lines.push(`Mínimo: ${s.min!.kg} kg (${s.min!.date}). Máximo: ${s.max!.kg} kg (${s.max!.date}).`)
  if (s.avgLast7 !== undefined) lines.push(`Promedio de los últimos 7 días registrados: ${r1(s.avgLast7)} kg.`)
  if (s.slopePerDay !== undefined) {
    lines.push(`Tendencia (regresión lineal): ${r1(s.slopePerDay * 7) > 0 ? '+' : ''}${r1(s.slopePerDay * 7)} kg por semana.`)
  }
  if (goal) {
    const toGo = r1(s.last!.kg - goal)
    lines.push(`Objetivo: ${goal} kg; ${toGo === 0 ? 'alcanzado' : `faltan ${Math.abs(toGo)} kg ${toGo > 0 ? 'por bajar' : 'por subir'}`}.`)
    if (s.slopePerDay && toGo !== 0 && Math.sign(-s.slopePerDay) === Math.sign(toGo)) {
      const days = Math.round(Math.abs(toGo / s.slopePerDay))
      lines.push(`A este ritmo llegaría en ~${Math.round(days / 7)} semanas (${addDays(s.last!.date, days)}).`)
    } else if (s.slopePerDay && toGo !== 0) {
      lines.push('Con la tendencia actual se está alejando del objetivo.')
    }
  }
  return lines.join('\n')
}

export function foodHistoryReport(state: AppState, range: Range, includeFoods: boolean): string {
  const days = foodDays(state, range)
  const { calorieGoal, macroGoals } = state.settings
  const span = daysBetween(range.from, range.to) + 1
  const lines = [`Comidas del ${range.from} al ${range.to}: ${days.length} de ${span} días con registros.`]
  if (!days.length) return lines.join('\n')

  lines.push('', 'Por día (kcal | carbs | grasas | proteínas | alimentos):')
  for (const [date, d] of days) {
    lines.push(`${date}: ${Math.round(d.kcal)} kcal | C ${Math.round(d.carbs)} g | G ${Math.round(d.fat)} g | P ${Math.round(d.protein)} g | ${d.items}`)
  }

  const avg = (k: 'kcal' | 'carbs' | 'fat' | 'protein') => days.reduce((a, [, d]) => a + d[k], 0) / days.length
  lines.push('', `Promedio por día registrado: ${Math.round(avg('kcal'))} kcal (objetivo ${calorieGoal}).`)
  for (const m of MACROS) {
    const goal = macroGoals[m.id]
    lines.push(`${m.label}: ${Math.round(avg(m.id))} g${goal ? ` (objetivo ${goal} g)` : ''}.`)
  }
  const kcalShare = MACROS.map((m) => `${m.label} ${Math.round(((avg(m.id) * m.kcalPerGram) / Math.max(1, avg('kcal'))) * 100)}%`)
  lines.push(`Reparto de calorías: ${kcalShare.join(', ')}.`)
  const within = days.filter(([, d]) => Math.abs(d.kcal - calorieGoal) <= calorieGoal * 0.1).length
  const over = days.filter(([, d]) => d.kcal > calorieGoal * 1.1).length
  lines.push(`Días dentro de ±10% del objetivo de calorías: ${within}; por encima: ${over}; por debajo: ${days.length - within - over}.`)
  for (const m of MACROS) {
    const goal = macroGoals[m.id]
    if (goal) lines.push(`Días que alcanzaron ${m.label.toLowerCase()} (≥90% de ${goal} g): ${days.filter(([, d]) => d[m.id] >= goal * 0.9).length}.`)
  }

  // Most logged foods and how many calories each contributed in the period.
  const foods = new Map<string, { name: string; times: number; kcal: number }>()
  for (const e of state.diary) {
    if (e.date < range.from || e.date > range.to) continue
    const key = e.food.barcode ?? e.food.id
    const f = foods.get(key) ?? { name: e.food.brand ? `${e.food.name} (${e.food.brand})` : e.food.name, times: 0, kcal: 0 }
    f.times++
    f.kcal += nutrientsFor(e.food, e.grams).kcal
    foods.set(key, f)
  }
  const top = [...foods.values()].sort((a, b) => b.times - a.times || b.kcal - a.kcal).slice(0, 10)
  lines.push('', 'Alimentos más registrados:', ...top.map((f) => `- ${f.name}: ${f.times === 1 ? '1 vez' : `${f.times} veces`}, ${Math.round(f.kcal)} kcal en total`))

  const mealKcal = MEALS.map((m) => {
    const kcal = state.diary
      .filter((e) => e.meal === m.id && e.date >= range.from && e.date <= range.to)
      .reduce((a, e) => a + nutrientsFor(e.food, e.grams).kcal, 0)
    return `${m.label} ${Math.round(kcal / days.length)} kcal`
  })
  lines.push('', `Promedio por comida: ${mealKcal.join(', ')}.`)

  if (includeFoods) {
    lines.push('', 'Detalle:')
    for (const [date] of days) {
      for (const m of MEALS) {
        const items = state.diary.filter((e) => e.date === date && e.meal === m.id)
        if (!items.length) continue
        lines.push(`${date} ${m.label}: ${items.map((e) => `${e.food.name} ${e.grams} g (${Math.round(nutrientsFor(e.food, e.grams).kcal)} kcal)`).join('; ')}`)
      }
    }
  }
  return lines.join('\n')
}

export function progressReport(state: AppState, range: Range): string {
  const days = foodDays(state, range)
  const w = weightStats(state, range)
  const span = daysBetween(range.from, range.to) + 1
  const lines = [`Progreso del ${range.from} al ${range.to} (${span} días).`]

  const avgKcal = days.length ? days.reduce((a, [, d]) => a + d.kcal, 0) / days.length : undefined
  lines.push(
    avgKcal === undefined
      ? 'Sin comidas registradas en el período.'
      : `Ingesta promedio: ${Math.round(avgKcal)} kcal/día en ${days.length} días registrados (objetivo ${state.settings.calorieGoal}).`,
  )
  if (w.slopePerDay !== undefined) {
    lines.push(
      `Peso: ${w.first!.kg} → ${w.last!.kg} kg (${w.weights.length} pesajes); tendencia ${r1(w.slopePerDay * 7) > 0 ? '+' : ''}${r1(w.slopePerDay * 7)} kg/semana.`,
    )
  } else {
    lines.push(w.weights.length ? `Peso: ${w.last!.kg} kg (un solo pesaje; hacen falta al menos dos para ver tendencia).` : 'Sin pesajes en el período.')
  }

  // Energy balance: intake minus the energy implied by the weight trend.
  const weightSpan = w.first && w.last ? daysBetween(w.first.date, w.last.date) : 0
  if (avgKcal !== undefined && w.slopePerDay !== undefined && days.length >= 7 && weightSpan >= 7) {
    const tdee = avgKcal - w.slopePerDay * KCAL_PER_KG
    lines.push(
      `Gasto diario estimado (balance energético): ~${Math.round(tdee / 10) * 10} kcal/día.`,
      `Para bajar 0,5 kg/semana: ~${Math.round((tdee - 550) / 10) * 10} kcal/día. Para mantener: ~${Math.round(tdee / 10) * 10} kcal/día.`,
    )
    const coverage = days.length / span
    if (coverage < 0.8) {
      lines.push(`Ojo: solo ${Math.round(coverage * 100)}% de los días tienen comidas registradas; si los días sin registro no fueron de ayuno, el gasto real es mayor y la estimación es poco confiable.`)
    }
  } else {
    lines.push('Para estimar el gasto diario hacen falta al menos 7 días con comidas y pesajes que abarquen 7 días o más.')
  }
  lines.push('Las estimaciones asumen ~7700 kcal por kg y que se registró todo lo comido; el peso diario fluctúa por agua, así que la tendencia es más confiable que dos pesajes sueltos.')
  return lines.join('\n')
}
