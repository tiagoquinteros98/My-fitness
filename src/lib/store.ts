import { useSyncExternalStore } from 'react'
import type { AppState, DiaryEntry, Food, Op, Settings, WorkoutSession, WorkoutSet } from '../types'
import { normalize } from './nutrition'

// The server (/api/state, backed by Redis) is the source of truth, so Claude can log food
// through the MCP endpoint. The browser keeps a localStorage copy to open instantly and work
// offline; every change is an Op applied locally right away and queued for the server.

const STORAGE_KEY = 'my-fitness:v1'
const PENDING_KEY = 'my-fitness:pending-ops'

const DEFAULT_STATE: AppState = {
  diary: [],
  weights: [],
  customFoods: [],
  workouts: [],
  settings: { calorieGoal: 2000, macroGoals: {} },
}

function normalizeState(s: Partial<AppState>): AppState {
  return { ...DEFAULT_STATE, ...s, settings: { ...DEFAULT_STATE.settings, ...s.settings } }
}

function readJSON<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch {
    return undefined
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or unavailable: keep working in memory.
  }
}

let state: AppState = normalizeState(readJSON<Partial<AppState>>(STORAGE_KEY) ?? {})
let pending: Op[] = readJSON<Op[]>(PENDING_KEY) ?? []
const listeners = new Set<() => void>()

function setState(next: AppState) {
  state = next
  writeJSON(STORAGE_KEY, state)
  listeners.forEach((l) => l())
}

function applyOp(s: AppState, op: Op): AppState {
  switch (op.type) {
    case 'putDiary': {
      const exists = s.diary.some((e) => e.id === op.entry.id)
      return {
        ...s,
        diary: exists ? s.diary.map((e) => (e.id === op.entry.id ? op.entry : e)) : [...s.diary, op.entry],
      }
    }
    case 'deleteDiary':
      return { ...s, diary: s.diary.filter((e) => e.id !== op.id) }
    case 'putWeight':
      return {
        ...s,
        weights: [...s.weights.filter((w) => w.date !== op.entry.date), op.entry].sort((a, b) =>
          a.date.localeCompare(b.date),
        ),
      }
    case 'deleteWeight':
      return { ...s, weights: s.weights.filter((w) => w.date !== op.date) }
    case 'putFood':
      return { ...s, customFoods: [op.food, ...s.customFoods.filter((f) => f.id !== op.food.id)] }
    case 'putSettings':
      return { ...s, settings: op.settings }
    case 'putWorkout':
      return {
        ...s,
        workouts: [...s.workouts.filter((w) => w.id !== op.session.id), op.session].sort((a, b) =>
          a.date.localeCompare(b.date),
        ),
      }
    case 'deleteWorkout':
      return { ...s, workouts: s.workouts.filter((w) => w.id !== op.id) }
    case 'import':
      return s // Uploads what the browser already has.
  }
}

let flushTimer: ReturnType<typeof setTimeout> | undefined

function dispatch(op: Op) {
  setState(applyOp(state, op))
  if (op.type === 'putWorkout') {
    // Typing a set dispatches on every keystroke: keep only the latest copy of the session
    // and send it once typing pauses.
    pending = pending.filter((p) => !(p.type === 'putWorkout' && p.session.id === op.session.id))
  }
  pending.push(op)
  writeJSON(PENDING_KEY, pending)
  clearTimeout(flushTimer)
  if (op.type === 'putWorkout') flushTimer = setTimeout(() => void flush(), 800)
  else void flush()
}

// --- Server sync ---

function goToLogin() {
  location.replace('/login.html')
}

export async function logout() {
  await fetch('/api/logout', { method: 'POST' }).catch(() => {})
  goToLogin()
}

let flushing = false
let retryTimer: ReturnType<typeof setTimeout> | undefined

async function flush(): Promise<void> {
  if (flushing || pending.length === 0) return
  flushing = true
  const batch = pending.slice()
  try {
    const res = await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ops: batch }),
    })
    if (res.status === 401) return goToLogin() // Changes stay queued for after logging in.
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    pending = pending.filter((op) => !batch.includes(op))
    writeJSON(PENDING_KEY, pending)
  } catch {
    clearTimeout(retryTimer)
    retryTimer = setTimeout(() => void flush(), 15000)
    return
  } finally {
    flushing = false
  }
  if (pending.length) await flush()
}

async function refresh(): Promise<void> {
  let server: AppState & { initialized: boolean }
  try {
    const res = await fetch('/api/state', { cache: 'no-store' })
    if (res.status === 401) return goToLogin()
    if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) return // No API (e.g. vite dev).
    server = await res.json()
  } catch {
    return // Offline: keep the local copy.
  }
  const hasLocalData =
    state.diary.length > 0 || state.weights.length > 0 || state.customFoods.length > 0 || state.workouts.length > 0
  if (!server.initialized && hasLocalData) {
    // First time against the server: upload what this browser has stored, then load the merge.
    // A browser without data never does this, so it can't mark the store initialized and make
    // the browser that does have data (the phone) drop it.
    if (pending.some((op) => op.type === 'import')) return // Upload already queued; retried by flush.
    dispatch({ type: 'import', state })
    await flush()
    if (!pending.length) await refresh()
    return
  }
  // Server data plus local changes it hasn't received yet.
  setState(pending.reduce(applyOp, normalizeState(server)))
}

if (typeof window !== 'undefined') {
  void flush().then(refresh)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flush().then(refresh)
  })
  window.addEventListener('online', () => void flush().then(refresh))
}

// --- Public API ---

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useStore(): AppState {
  return useSyncExternalStore(subscribe, () => state)
}

export function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const actions = {
  addDiaryEntry(entry: Omit<DiaryEntry, 'id' | 'createdAt'>) {
    dispatch({ type: 'putDiary', entry: { ...entry, id: newId(), createdAt: Date.now() } })
  },
  updateDiaryEntry(id: string, patch: Partial<DiaryEntry>) {
    const entry = state.diary.find((e) => e.id === id)
    if (entry) dispatch({ type: 'putDiary', entry: { ...entry, ...patch } })
  },
  removeDiaryEntry(id: string) {
    dispatch({ type: 'deleteDiary', id })
  },

  /** One weight per day: logging again on the same date replaces it. */
  logWeight(date: string, kg: number) {
    dispatch({ type: 'putWeight', entry: { id: newId(), date, kg } })
  },
  removeWeight(id: string) {
    const w = state.weights.find((x) => x.id === id)
    if (w) dispatch({ type: 'deleteWeight', date: w.date })
  },

  saveCustomFood(food: Food) {
    // Same barcode replaces the earlier food instead of creating a duplicate.
    const existing = food.barcode && state.customFoods.find((f) => f.barcode === food.barcode)
    dispatch({ type: 'putFood', food: { ...food, id: existing ? existing.id : food.id, savedAt: Date.now() } })
  },

  /** Current copy of a workout session (fresh, not from a past render). */
  getWorkout(id: string): WorkoutSession | undefined {
    return state.workouts.find((w) => w.id === id)
  },
  saveWorkout(session: WorkoutSession) {
    dispatch({ type: 'putWorkout', session })
  },
  deleteWorkout(id: string) {
    dispatch({ type: 'deleteWorkout', id })
  },

  /**
   * Merges a backup from the previous standalone training log ("Descargar copia"):
   * { sesiones: { "fecha|día": { ejercicio: [{kg, reps}] } }, peso: { fecha: kg } }.
   * Existing sessions and weigh-ins on the same date are kept.
   */
  importTrainingBackup(data: unknown): { sessions: number; weights: number } {
    const d = data as { sesiones?: Record<string, Record<string, (WorkoutSet | null)[]>>; peso?: Record<string, number> }
    if (!d || typeof d !== 'object' || (!d.sesiones && !d.peso)) throw new Error('No es una copia del registro')
    let sessions = 0
    let weights = 0
    for (const [id, exercises] of Object.entries(d.sesiones ?? {})) {
      const [date, day] = id.split('|')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !day || state.workouts.some((w) => w.id === id)) continue
      dispatch({ type: 'putWorkout', session: { id, date, day, exercises } })
      sessions++
    }
    for (const [date, kg] of Object.entries(d.peso ?? {})) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(kg > 0) || state.weights.some((w) => w.date === date)) continue
      dispatch({ type: 'putWeight', entry: { id: newId(), date, kg } })
      weights++
    }
    void flush()
    return { sessions, weights }
  },

  updateSettings(patch: Partial<Settings>) {
    dispatch({ type: 'putSettings', settings: { ...state.settings, ...patch } })
  },
}

export { nutrientsFor } from './nutrition'

/** Foods saved or logged most recently first, unique by barcode (or id). */
export function recentFoods(s: AppState, limit = 20): Food[] {
  const candidates: [Food, number][] = [
    ...s.customFoods.map((f): [Food, number] => [f, f.savedAt ?? 0]),
    ...s.diary.map((e, i): [Food, number] => [e.food, e.createdAt ?? i]),
  ].sort((a, b) => b[1] - a[1])
  const seen = new Set<string>()
  const result: Food[] = []
  for (const [f] of candidates) {
    const key = f.barcode ?? f.id
    if (seen.has(key)) continue
    seen.add(key)
    result.push(f)
    if (result.length >= limit) break
  }
  return result
}

/** A food the user saved or logged with this barcode, if any. */
export function findByBarcode(s: AppState, barcode: string): Food | undefined {
  return (
    s.customFoods.find((f) => f.barcode === barcode) ??
    s.diary.findLast((e) => e.food.barcode === barcode)?.food
  )
}

export interface MyFood {
  food: Food
  timesLogged: number
  /** Last time it was logged or saved (ms since epoch). */
  lastUsed: number
}

const foodKey = (f: Food) => f.barcode ?? f.id

/** Every food the user saved or logged, with how often it was logged. Saved versions win over diary copies. */
export function myFoods(s: AppState): MyFood[] {
  const byKey = new Map<string, MyFood>()
  s.diary.forEach((e, i) => {
    const key = foodKey(e.food)
    const at = e.createdAt ?? i
    const prev = byKey.get(key)
    if (!prev) byKey.set(key, { food: e.food, timesLogged: 1, lastUsed: at })
    else {
      prev.timesLogged++
      if (at >= prev.lastUsed) Object.assign(prev, { food: e.food, lastUsed: at })
    }
  })
  for (const f of s.customFoods) {
    const prev = byKey.get(foodKey(f))
    if (prev) Object.assign(prev, { food: f, lastUsed: Math.max(prev.lastUsed, f.savedAt ?? 0) })
    else byKey.set(foodKey(f), { food: f, timesLogged: 0, lastUsed: f.savedAt ?? 0 })
  }
  return [...byKey.values()]
}

/** The user's foods matching every word of the query (name, brand or barcode), most logged first. */
export function searchMyFoods(s: AppState, query: string): MyFood[] {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  return myFoods(s)
    .filter(({ food: f }) => {
      const text = normalize(`${f.name} ${f.brand ?? ''} ${f.barcode ?? ''}`)
      return words.every((w) => text.includes(w))
    })
    .sort((a, b) => b.timesLogged - a.timesLogged || b.lastUsed - a.lastUsed)
}
