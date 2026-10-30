// Formatting rules from the brief: Danish numbers (6.494 kr), "3 Dec 06:00", unknown values in words or left out, never "?" and never 0.

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function thousands(n: number): string {
  const s = String(Math.round(Math.abs(n)))
  return (n < 0 ? '-' : '') + s.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** "1.240" as "1,2k", so a price fits under a day */
export function shortKr(p: number): string {
  return p >= 10_000 ? `${Math.round(p / 1000)}k` : p >= 1000 ? `${(p / 1000).toFixed(1).replace('.', ',')}k` : thousands(p)
}

export function kr(dkk: number | null | undefined): string {
  return dkk == null || !Number.isFinite(dkk) ? 'no price' : `${thousands(dkk)} kr`
}

/** One decimal with a Danish comma: 9.9 -> "9,9". */
export function dec1(n: number | null | undefined): string {
  return n == null ? '' : n.toFixed(1).replace('.', ',')
}

/** Hours to "16h 10m"; null to an empty string. */
/** An estimate to the hour. Minutes would claim more than it knows. */
export const aboutHours = (h: number): string => `About ${Math.max(1, Math.round(h))}h`

/** A place's name without the country some names carry in brackets. */
export const shortPlace = (name: string) => name.replace(/\s*\(.*\)$/, '')

export function hours(h: number | null | undefined): string {
  if (h == null || !Number.isFinite(h)) return ''
  const m = Math.round(h * 60)
  const hh = Math.floor(m / 60)
  const mm = m % 60
  if (hh === 0) return `${mm}m`
  return mm === 0 ? `${hh}h` : `${hh}h ${String(mm).padStart(2, '0')}m`
}

/** "2026-12-03T06:00" -> "3 Dec 06:00". */
export function dayTime(local: string): string {
  return `${day(local)} ${clock(local)}`
}

/** "2026-12-03T06:00" -> "3 Dec". Also accepts "2026-12-03". */
export function day(local: string): string {
  const m = Number(local.slice(5, 7))
  const d = Number(local.slice(8, 10))
  return `${d} ${MON[m - 1] ?? ''}`
}

/** "13 to 17 Dec", or "28 Dec to 3 Jan" across a month. */
export function dayRange(a: string, b: string): string {
  if (a.slice(0, 10) === b.slice(0, 10)) return day(a)
  return a.slice(5, 7) === b.slice(5, 7) ? `${Number(a.slice(8, 10))} to ${day(b)}` : `${day(a)} to ${day(b)}`
}

/** "2026-12-03" -> "Thu 3 Dec". */
export function weekdayDay(local: string): string {
  const dt = new Date(local.slice(0, 10) + 'T00:00:00Z')
  return `${WD[dt.getUTCDay()]} ${day(local)}`
}

export function clock(local: string): string {
  return local.slice(11, 16)
}

/** Calendar days between the dates of two local stamps (b minus a). */
export function dayDiff(a: string, b: string): number {
  const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))
  const db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))
  return Math.round((db - da) / 86400000)
}

/** "+1" when arrive is on a later date than depart. */
export function nextDayMark(depart: string, arrive: string): string {
  const n = dayDiff(depart, arrive)
  return n > 0 ? `+${n}` : ''
}

/** An arrival logged at exactly 23:59 is a crawler placeholder. */
export function timeUncertain(local: string): boolean {
  return local.slice(11, 16) === '23:59'
}

export function observed(at: string | null | undefined): string {
  if (!at) return 'unknown'
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return at
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`
}

export const TYPE_LABEL: Record<string, string> = {
  ticket: 'One ticket',
  madrid: 'Madrid ticket + own hops',
  oneways: 'Separate one-ways',
}

export const STOP_LABEL: Record<string, string> = {
  connection: 'Connection',
  self_transfer: 'Self-transfer',
  day_stop: 'Day stop',
  night: 'Night',
}

/** How long a leg takes in words, an estimate as one. Null when it is not known. */
export const legHours = (t: { hours: number | null; about: boolean }) => (t.hours == null ? null : t.about ? aboutHours(t.hours) : hours(t.hours))
