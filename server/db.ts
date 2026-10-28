import { Redis } from '@upstash/redis'
import type { AppState, DiaryEntry, Food, Op, RoutineDay, Settings, WeightEntry, WorkoutSession } from '../src/types.js'

// Single-user app: all data lives under a few Redis keys. DATA_PREFIX lets tests use separate keys.
const PREFIX = process.env.DATA_PREFIX || 'mf'
const KEYS = {
  initialized: `${PREFIX}:initialized`,
  settings: `${PREFIX}:settings`,
  foods: `${PREFIX}:foods`, // hash id -> Food
  diary: `${PREFIX}:diary`, // hash id -> DiaryEntry
  weights: `${PREFIX}:weights`, // hash date -> WeightEntry
  workouts: `${PREFIX}:workouts`, // hash id -> WorkoutSession
  routine: `${PREFIX}:routine`, // RoutineDay[]
}

export const DEFAULT_SETTINGS: Settings = { calorieGoal: 2000, macroGoals: {} }

let redis: Redis | undefined
function db(): Redis {
  redis ??= new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! })
  return redis
}

export async function readState(): Promise<AppState & { initialized: boolean }> {
  const p = db().pipeline()
  p.get(KEYS.initialized)
  p.get<Settings>(KEYS.settings)
  p.hgetall<Record<string, Food>>(KEYS.foods)
  p.hgetall<Record<string, DiaryEntry>>(KEYS.diary)
  p.hgetall<Record<string, WeightEntry>>(KEYS.weights)
  p.hgetall<Record<string, WorkoutSession>>(KEYS.workouts)
  p.get<RoutineDay[]>(KEYS.routine)
  const [initialized, settings, foods, diary, weights, workouts, routine] = (await p.exec()) as [
    unknown,
    Settings | null,
    Record<string, Food> | null,
    Record<string, DiaryEntry> | null,
    Record<string, WeightEntry> | null,
    Record<string, WorkoutSession> | null,
    RoutineDay[] | null,
  ]
  return {
    initialized: !!initialized,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    customFoods: Object.values(foods ?? {}).sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0)),
    diary: Object.values(diary ?? {}).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)),
    weights: Object.values(weights ?? {}).sort((a, b) => a.date.localeCompare(b.date)),
    workouts: Object.values(workouts ?? {}).sort((a, b) => a.date.localeCompare(b.date)),
    routine: routine ?? undefined,
  }
}

export async function applyOps(ops: Op[]): Promise<void> {
  if (ops.length === 0) return
  const p = db().pipeline()
  for (const op of ops) {
    switch (op.type) {
      case 'putDiary':
        p.hset(KEYS.diary, { [op.entry.id]: op.entry })
        break
      case 'deleteDiary':
        p.hdel(KEYS.diary, op.id)
        break
      case 'putWeight':
        p.hset(KEYS.weights, { [op.entry.date]: op.entry })
        break
      case 'deleteWeight':
        p.hdel(KEYS.weights, op.date)
        break
      case 'putFood':
        p.hset(KEYS.foods, { [op.food.id]: op.food })
        break
      case 'putSettings':
        p.set(KEYS.settings, op.settings)
        break
      case 'putWorkout':
        p.hset(KEYS.workouts, { [op.session.id]: op.session })
        break
      case 'deleteWorkout':
        p.hdel(KEYS.workouts, op.id)
        break
      case 'putRoutine':
        p.set(KEYS.routine, op.routine)
        break
      case 'import': {
        const { state } = op
        const base = Date.now() - state.diary.length
        // Keep the browser's original order for entries saved before createdAt existed.
        const diary = state.diary.map((e, i) => ({ ...e, createdAt: e.createdAt ?? base + i }))
        const foods = state.customFoods.map((f, i) => ({ ...f, savedAt: f.savedAt ?? base - i }))
        if (diary.length) p.hset(KEYS.diary, Object.fromEntries(diary.map((e) => [e.id, e])))
        if (foods.length) p.hset(KEYS.foods, Object.fromEntries(foods.map((f) => [f.id, f])))
        if (state.weights.length) p.hset(KEYS.weights, Object.fromEntries(state.weights.map((w) => [w.date, w])))
        if (state.workouts?.length) p.hset(KEYS.workouts, Object.fromEntries(state.workouts.map((w) => [w.id, w])))
        if (state.routine?.length) p.set(KEYS.routine, state.routine)
        p.set(KEYS.settings, { ...DEFAULT_SETTINGS, ...state.settings })
        break
      }
    }
  }
  // Only the browser's first upload marks the store as initialized, so data that was
  // only in the browser is never replaced by a server copy that lacks it.
  if (ops.some((op) => op.type === 'import')) p.set(KEYS.initialized, '1')
  await p.exec()
}
