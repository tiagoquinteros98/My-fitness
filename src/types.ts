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
  /** When the food was saved to the user's database (ms since epoch). */
  savedAt?: number
}

export interface DiaryEntry {
  id: string
  date: string // YYYY-MM-DD
  meal: Meal
  food: Food
  grams: number
  /** ms since epoch; orders entries and "recent foods". */
  createdAt?: number
}

export interface WeightEntry {
  id: string
  date: string // YYYY-MM-DD
  kg: number
}

export type Macro = 'carbs' | 'fat' | 'protein'

export const MACROS: { id: Macro; label: string; kcalPerGram: number }[] = [
  { id: 'carbs', label: 'Carbs', kcalPerGram: 4 },
  { id: 'fat', label: 'Grasas', kcalPerGram: 9 },
  { id: 'protein', label: 'Proteínas', kcalPerGram: 4 },
]

export interface Settings {
  calorieGoal: number
  /** Daily macro targets in grams; unset means no target. */
  macroGoals: Partial<Record<Macro, number>>
  goalWeightKg?: number
}

export interface WorkoutSet {
  kg: number
  reps: number
}

/** One routine day trained on one date. Sets are by exercise name, in order (gaps are null). */
export interface WorkoutSession {
  id: string // `${date}|${day}`
  date: string // YYYY-MM-DD
  day: string // routine day, e.g. "Lunes"
  exercises: Record<string, (WorkoutSet | null)[]>
}

export interface AppState {
  diary: DiaryEntry[]
  weights: WeightEntry[]
  customFoods: Food[]
  workouts: WorkoutSession[]
  settings: Settings
}

/** A single change, applied both locally and on the server (POST /api/state). */
export type Op =
  | { type: 'putDiary'; entry: DiaryEntry }
  | { type: 'deleteDiary'; id: string }
  | { type: 'putWeight'; entry: WeightEntry }
  | { type: 'deleteWeight'; date: string }
  | { type: 'putFood'; food: Food }
  | { type: 'putSettings'; settings: Settings }
  | { type: 'putWorkout'; session: WorkoutSession }
  | { type: 'deleteWorkout'; id: string }
  /** One-time upload of the data kept in the browser before the server existed. */
  | { type: 'import'; state: AppState }
