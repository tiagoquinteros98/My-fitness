export function todayISO(): string {
  return toISODate(new Date())
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return toISODate(new Date(y, m - 1, d + days))
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', opts)
}

export function dayLabel(iso: string): string {
  const today = todayISO()
  if (iso === today) return 'Hoy'
  if (iso === addDays(today, -1)) return 'Ayer'
  if (iso === addDays(today, 1)) return 'Mañana'
  return formatDate(iso, { weekday: 'long', day: 'numeric', month: 'long' })
}
