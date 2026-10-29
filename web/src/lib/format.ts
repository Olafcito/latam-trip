import type { Mode } from '../data/types'

/** Danish thousands separator: 1040 -> "1.040". */
export function thousands(n: number): string {
  const s = String(Math.round(Math.abs(n)))
  return (n < 0 ? '-' : '') + s.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** Minutes to the compact handoff format: 55 -> "55m", 65 -> "1h05", 540 -> "9h". */
export function duration(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return '?'
  const m = Math.round(min)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r === 0 ? `${h}h` : `${h}h${String(r).padStart(2, '0')}`
}

/** "from 1.040 kr", or "?" when there is no price. */
export function fromPrice(dkk: number | null | undefined): string {
  return dkk == null ? '?' : `from ${thousands(dkk)} kr`
}

export function kr(dkk: number | null | undefined): string {
  return dkk == null ? '?' : `${thousands(dkk)} kr`
}

export function altitude(m: number | null | undefined): string {
  return m == null ? '' : `${thousands(m)} m`
}

const MODE_LABEL: Record<Mode, string> = {
  bus: 'Bus',
  shuttle: 'Shuttle',
  chicken_bus: 'Chicken bus',
  colectivo: 'Colectivo',
  train: 'Train',
  boat: 'Boat',
  flight: 'Flight',
}

export function modeLabel(mode: Mode): string {
  return MODE_LABEL[mode] ?? mode
}

/** "2026-10-28T12:31:37Z" -> "28 Oct 2026"; a bare year passes through. */
export function observed(at: string | null | undefined): string {
  if (!at) return ''
  if (/^\d{4}$/.test(at)) return at
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return at
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** "2027-01-10" -> "10 Jan". */
export function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}
