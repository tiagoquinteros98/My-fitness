import type { AppState } from '../types'

export interface Exercise {
  /** Name; also the key sets are stored under, so don't rename exercises that have history. */
  n: string
  /** Muscle group. */
  g: string
  /** Sets. */
  s: number
  /** Reps per set. */
  r: string
  rir: string
  /** Suggested starting weight. */
  w: string
}

export const ROUTINE: Record<string, Exercise[]> = {
  Lunes: [
    { n: 'Sentadilla hack', g: 'Cuádriceps', s: 4, r: '8', rir: 'RIR 2', w: '90 kg' },
    { n: 'Prensa 45°', g: 'Cuádriceps', s: 3, r: '12', rir: 'RIR 2', w: '100 kg' },
    { n: 'Curl femoral acostado', g: 'Isquios/Glúteo', s: 3, r: '12', rir: 'RIR 0-1', w: '30 kg' },
    { n: 'Press inclinado mancuernas', g: 'Pecho', s: 4, r: '8', rir: 'RIR 2', w: '22 kg c/u' },
    { n: 'Aperturas en polea', g: 'Pecho', s: 3, r: '12', rir: 'RIR 0-1', w: '10 kg lado' },
    { n: 'Jalón al pecho supino', g: 'Espalda', s: 4, r: '10', rir: 'RIR 2', w: '55 kg' },
    { n: 'Remo sentado en polea', g: 'Espalda', s: 4, r: '10', rir: 'RIR 2', w: '45 kg' },
    { n: 'Elevaciones laterales', g: 'Hombro lateral', s: 4, r: '15', rir: 'al fallo', w: '6 kg c/u' },
    { n: 'Fondos de tríceps', g: 'Tríceps', s: 3, r: '8', rir: 'RIR 1', w: 'corporal' },
    { n: 'Plancha', g: 'Core', s: 2, r: '45 seg', rir: '—', w: 'corporal' },
  ],
  Miércoles: [
    { n: 'Máquina cuádriceps', g: 'Cuádriceps', s: 4, r: '12', rir: 'RIR 2', w: '70 kg' },
    { n: 'Estocadas con mancuernas', g: 'Cuádriceps', s: 3, r: '10', rir: 'RIR 2', w: '12 kg c/u' },
    { n: 'Hip thrust', g: 'Isquios/Glúteo', s: 4, r: '10', rir: 'RIR 2', w: '60 kg' },
    { n: 'Press de pecho en máquina', g: 'Pecho', s: 4, r: '10', rir: 'RIR 2', w: '80 kg' },
    { n: 'Flexiones', g: 'Pecho', s: 3, r: 'al fallo', rir: 'RIR 0', w: 'corporal' },
    { n: 'Jalón agarre neutro', g: 'Espalda', s: 4, r: '10', rir: 'RIR 2', w: '55 kg' },
    { n: 'Remo con mancuerna', g: 'Espalda', s: 3, r: '10', rir: 'RIR 2', w: '24 kg' },
    { n: 'Pájaros o face pull', g: 'Deltoide post.', s: 4, r: '15', rir: 'RIR 0-1', w: '5 kg c/u' },
    { n: 'Predicador barra recta', g: 'Bíceps', s: 4, r: '10', rir: 'RIR 0-1', w: '15 kg + barra' },
  ],
  Viernes: [
    { n: 'Sentadilla búlgara', g: 'Cuádriceps', s: 4, r: '10', rir: 'RIR 2', w: '10 kg c/u' },
    { n: 'Sentadilla hack', g: 'Cuádriceps', s: 3, r: '10', rir: 'RIR 2', w: '80 kg' },
    { n: 'Hiperextensiones 45°', g: 'Isquios/Glúteo', s: 3, r: '12', rir: 'RIR 1', w: 'corporal' },
    { n: 'Press plano mancuernas', g: 'Pecho', s: 4, r: '10', rir: 'RIR 2', w: '20 kg c/u' },
    { n: 'Cruces en polea', g: 'Pecho', s: 3, r: '12', rir: 'RIR 0-1', w: '10 kg lado' },
    { n: 'Remo en máquina', g: 'Espalda', s: 4, r: '10', rir: 'RIR 2', w: '50 kg' },
    { n: 'Jalón agarre ancho', g: 'Espalda', s: 3, r: '12', rir: 'RIR 2', w: '45 kg' },
    { n: 'Elevaciones laterales', g: 'Hombro lateral', s: 4, r: '15', rir: 'al fallo', w: '6 kg c/u' },
    { n: 'Curl martillo inclinado', g: 'Bíceps', s: 4, r: '10', rir: 'RIR 0-1', w: '10 kg c/u' },
    { n: 'Gemelos de pie', g: 'Gemelos', s: 4, r: '15', rir: 'al fallo', w: '40 kg' },
  ],
}

export const ROUTINE_DAYS = Object.keys(ROUTINE)

/** Routine day for a date: Mon–Tue → Lunes, Wed–Thu → Miércoles, Fri–Sun → Viernes. */
export function dayForDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const weekday = new Date(y, m - 1, d).getDay() // 0 = Sunday
  return weekday >= 1 && weekday <= 2 ? 'Lunes' : weekday >= 3 && weekday <= 4 ? 'Miércoles' : 'Viernes'
}

export const sessionId = (date: string, day: string) => `${date}|${day}`

export interface BestSet {
  date: string
  kg: number
  reps: number
  sets: number
}

/** Best set (heaviest) of every session where the exercise was logged, oldest first. */
export function exerciseHistory(state: AppState, name: string): BestSet[] {
  const out: BestSet[] = []
  for (const session of state.workouts) {
    const sets = (session.exercises[name] ?? []).filter((x): x is { kg: number; reps: number } => !!x && x.kg > 0 && x.reps > 0)
    if (!sets.length) continue
    const top = sets.reduce((a, b) => (b.kg > a.kg ? b : a))
    out.push({ date: session.date, kg: top.kg, reps: top.reps, sets: sets.length })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** Direct sets per week by muscle group across the routine, with the 10–20 sets guideline. */
export function weeklyVolume(): { group: string; sets: number; status: string }[] {
  const count: Record<string, number> = {}
  for (const ex of Object.values(ROUTINE).flat()) count[ex.g] = (count[ex.g] ?? 0) + ex.s
  return Object.entries(count)
    .sort((a, b) => b[1] - a[1])
    .map(([group, sets]) => ({
      group,
      sets,
      status: sets === 0 ? 'sin trabajo directo' : sets < 10 ? 'bajo el rango' : sets > 20 ? 'sobre el rango' : 'en rango',
    }))
}

// --- Technique videos on TikTok ---

const TIKTOK_PACKAGE = 'com.zhiliaoapp.musically'

/** Search query for an exercise's technique, URL-encoded. */
export function tiktokQuery(name: string): string {
  return encodeURIComponent(name.replace('°', ' grados') + ' técnica gimnasio')
}

export function tiktokSearchUrl(name: string): string {
  return `https://www.tiktok.com/search?q=${tiktokQuery(name)}`
}

/**
 * Opens the TikTok app on the search.
 * Android: intent:// with the browser URL as fallback inside it, so it never fails when the
 *          app isn't installed. Returns true when it handled the click.
 * iOS: the https link is already a Universal Link and opens the app by itself.
 * Desktop: stays in the browser.
 */
export function openTiktokApp(name: string): boolean {
  if (!/android/i.test(navigator.userAgent)) return false
  const fallback = encodeURIComponent(tiktokSearchUrl(name))
  window.location.href =
    `intent://search?keyword=${tiktokQuery(name)}#Intent;scheme=snssdk1233;` +
    `package=${TIKTOK_PACKAGE};S.browser_fallback_url=${fallback};end`
  return true
}
