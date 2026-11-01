import type { TripRow } from './repoTrips'

// The older versions of a stored trip (spec 6.1: history comes from the older versions of the id).
// /?trip=<id>&v=3 opens version 3 of the trip in the normal trip view.

/** The version a link asks for, or null when it asks for none or for something that is not a version number. */
export function versionParam(search: string): number | null {
  const raw = new URLSearchParams(search).get('v')
  return raw && /^[1-9]\d{0,5}$/.test(raw.trim()) ? Number(raw.trim()) : null
}

/** The page address with ?trip=<id> and &v=<version> set. A null version, or a null id, takes the version away. */
export function urlWithVersion(href: string, id: string | null, version: number | null): string {
  const u = new URL(href)
  if (id) u.searchParams.set('trip', id)
  else u.searchParams.delete('trip')
  if (id && version != null) u.searchParams.set('v', String(version))
  else u.searchParams.delete('v')
  return u.pathname + u.search + u.hash
}

export interface VersionEntry {
  version: number
  savedAt: string
  by: string
  name: string
  /** the title of this version when it is not the title of the latest one */
  title: string | null
  latest: boolean
  row: TripRow
}

/** The versions of one trip, newest first. */
export function versionEntries(rows: readonly TripRow[]): VersionEntry[] {
  const sorted = [...rows].sort((a, b) => b.version - a.version)
  const top = sorted[0]
  return sorted.map((row) => ({
    version: row.version,
    savedAt: row.saved_at,
    by: row.by,
    name: row.name,
    title: top && row.name !== top.name ? row.name : null,
    latest: row === top,
    row,
  }))
}

/** "1 Nov, 14:05" in the clock of the device. */
export function savedWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${day}, ${time}`
}
