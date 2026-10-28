export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snacks'

export const MEALS: { id: Meal; label: string }[] = [
  { id: 'breakfast', label: 'Desayuno' },
  { id: 'lunch', label: 'Almuerzo' },
  { id: 'dinner', label: 'Cena' },
  { id: 'snacks', label: 'Snacks' },
]

/** Nutrient values per 100 g of the food. */
export interface Nutrients {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export interface Food {
  id: string
  name: string
  brand?: string
  barcode?: string
  imageUrl?: string
  per100g: Nutrients
  /** Grams in one serving, when the product declares one. */
  servingGrams?: number
}

export interface DiaryEntry {
  id: string
  date: string // YYYY-MM-DD
  meal: Meal
  food: Food
  grams: number
}

export interface WeightEntry {
  id: string
  date: string // YYYY-MM-DD
  kg: number
}

export interface Settings {
  calorieGoal: number
  goalWeightKg?: number
}
