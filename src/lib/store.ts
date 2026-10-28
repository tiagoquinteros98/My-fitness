import { useSyncExternalStore } from 'react'
import type { DiaryEntry, Food, Settings, WeightEntry } from '../types'

interface State {
  diary: DiaryEntry[]
  weights: WeightEntry[]
  customFoods: Food[]
  settings: Settings
}

const STORAGE_KEY = 'my-fitness:v1'

const DEFAULT_STATE: State = {
  diary: [],
  weights: [],
  customFoods: [],
  settings: { calorieGoal: 2000, macroGoals: {} },
}

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<State>
    return {
      ...DEFAULT_STATE,
      ...parsed,
      settings: { ...DEFAULT_STATE.settings, ...parsed.settings },
    }
  } catch {
    return DEFAULT_STATE
  }
}

let state: State = load()
const listeners = new Set<() => void>()

function setState(update: (s: State) => State) {
  state = update(state)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage full or unavailable: keep working in memory.
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useStore(): State {
  return useSyncExternalStore(subscribe, () => state)
}

export function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const actions = {
  addDiaryEntry(entry: Omit<DiaryEntry, 'id'>) {
    setState((s) => ({ ...s, diary: [...s.diary, { ...entry, id: newId() }] }))
  },
  updateDiaryEntry(id: string, patch: Partial<DiaryEntry>) {
    setState((s) => ({ ...s, diary: s.diary.map((e) => (e.id === id ? { ...e, ...patch } : e)) }))
  },
  removeDiaryEntry(id: string) {
    setState((s) => ({ ...s, diary: s.diary.filter((e) => e.id !== id) }))
  },

  /** One weight per day: logging again on the same date replaces it. */
  logWeight(date: string, kg: number) {
    setState((s) => {
      const others = s.weights.filter((w) => w.date !== date)
      const weights = [...others, { id: newId(), date, kg }].sort((a, b) => a.date.localeCompare(b.date))
      return { ...s, weights }
    })
  },
  removeWeight(id: string) {
    setState((s) => ({ ...s, weights: s.weights.filter((w) => w.id !== id) }))
  },

  saveCustomFood(food: Food) {
    setState((s) => ({
      ...s,
      customFoods: [food, ...s.customFoods.filter((f) => f.id !== food.id && (!food.barcode || f.barcode !== food.barcode))],
    }))
  },

  updateSettings(patch: Partial<Settings>) {
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }))
  },
}

export function nutrientsFor(food: Food, grams: number) {
  const f = grams / 100
  return {
    kcal: food.per100g.kcal * f,
    protein: food.per100g.protein * f,
    carbs: food.per100g.carbs * f,
    fat: food.per100g.fat * f,
  }
}

/** Foods logged recently (most recent first, unique), plus foods the user created. */
export function recentFoods(s: State, limit = 20): Food[] {
  const seen = new Set<string>()
  const result: Food[] = []
  const key = (f: Food) => f.barcode ?? f.id
  for (const f of s.customFoods) {
    if (!seen.has(key(f))) {
      seen.add(key(f))
      result.push(f)
    }
  }
  for (let i = s.diary.length - 1; i >= 0 && result.length < limit; i--) {
    const f = s.diary[i].food
    if (!seen.has(key(f))) {
      seen.add(key(f))
      result.push(f)
    }
  }
  return result.slice(0, limit)
}
