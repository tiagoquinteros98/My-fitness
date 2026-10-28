import type { AppState } from '../types'
import { DEFAULT_ROUTINE, routineOf } from './routine'

/**
 * Muscle groups folded into the 8 chart colors (a validated categorical palette has 8 slots;
 * see --group-N in index.css). The order is the palette order and must not change, so each
 * group keeps its color.
 */
export const GROUP_FAMILIES = [
  { label: 'Cuádriceps', match: ['cuadriceps'] },
  { label: 'Isquios/Glúteo', match: ['isquios', 'gluteo', 'femoral'] },
  { label: 'Pecho', match: ['pecho', 'pectoral'] },
  { label: 'Espalda', match: ['espalda', 'dorsal', 'lumbar'] },
  { label: 'Hombros', match: ['hombro', 'deltoide'] },
  { label: 'Bíceps', match: ['biceps'] },
  { label: 'Tríceps', match: ['triceps'] },
  { label: 'Otros', match: [] as string[] },
] as const

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Index into GROUP_FAMILIES for a routine muscle group; unknown groups go to "Otros". */
export function familyIndex(group: string): number {
  const g = fold(group)
  const i = GROUP_FAMILIES.findIndex((f) => f.match.some((m) => g.includes(m)))
  return i < 0 ? GROUP_FAMILIES.length - 1 : i
}

export const familyColor = (i: number) => `var(--group-${i + 1})`

/** Muscle group of an exercise: from the current routine, else the original one. */
export function groupOfExercise(state: AppState, name: string): string {
  for (const routine of [routineOf(state), DEFAULT_ROUTINE]) {
    const ex = routine.flatMap((d) => d.exercises).find((e) => e.n === name)
    if (ex) return ex.g
  }
  return 'Otros'
}
