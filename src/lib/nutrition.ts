import type { Food } from '../types.js'

export function nutrientsFor(food: Food, grams: number) {
  const f = grams / 100
  return {
    kcal: food.per100g.kcal * f,
    protein: food.per100g.protein * f,
    carbs: food.per100g.carbs * f,
    fat: food.per100g.fat * f,
  }
}

/** Lowercase and strip accents, for forgiving name matching. */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
