// The pure parts of the search (FEAT-003, TECH-004): the distance between two points, the Hostelworld city of a map
// place among the suggestions, and the ranking of a city's hostels by popularity. No network, so rank_test.ts checks
// them on their own.

/** The great circle distance in km between two points, by the haversine formula. */
export function km(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = Math.PI / 180
  const dLat = (bLat - aLat) * rad
  const dLon = (bLon - aLon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}

const number = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : Number.NaN
  return Number.isFinite(n) ? n : null
}

/** A name folded for comparing, without case or accents. */
export const folded = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()

/** The English name of a country from its ISO code, else null. */
export function countryName(code: string | null | undefined): string | null {
  if (!code || !code.trim()) return null
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.trim().toUpperCase()) ?? null
  } catch {
    return null
  }
}

export interface Suggestion { type?: string; city?: { id?: string | number; name?: string; country?: string } }

/**
 * The Hostelworld city among the suggestions for a place's name: the first city in the place's country, compared
 * without case or accents. A place without a country takes the first city. Null when none fits.
 */
export function pickCity(list: unknown, country: string | null): { id: string; name: string | null } | null {
  if (!Array.isArray(list)) return null
  const want = country ? folded(country) : null
  for (const s of list as Suggestion[]) {
    if (!s || s.type !== 'city' || !s.city) continue
    const id = s.city.id === undefined || s.city.id === null ? '' : String(s.city.id).trim()
    if (!id) continue
    if (want !== null && folded(s.city.country ?? '') !== want) continue
    return { id, name: typeof s.city.name === 'string' && s.city.name.trim() ? s.city.name.trim() : null }
  }
  return null
}

export interface CityProperty {
  id?: number | string; name?: string; type?: string
  overallRating?: { overall?: number | string | null; numberOfRatings?: number | string | null } | null
  latitude?: number | string | null; longitude?: number | string | null
}

export interface Ranked { id: string; name: string; overall: number | null; ratings: number; km: number | null }

/** Rated this or more, out of 100, a hostel counts as well rated. */
export const WELL_RATED = 80

/**
 * The hostels of a city list in order of popularity. Only type HOSTEL, and when the place has coordinates only
 * those within maxKm of it. The well rated come first by number of ratings, then the rest by number of ratings.
 * Hostelworld's own order mixes in promoted places, so it is not used.
 */
export function rankHostels(props: unknown, at: { lat: number | null; lon: number | null }, maxKm = 40): Ranked[] {
  if (!Array.isArray(props)) return []
  const out: Ranked[] = []
  const seen = new Set<string>()
  for (const p of props as CityProperty[]) {
    if (!p || (p.type ?? '').toUpperCase() !== 'HOSTEL') continue
    const id = p.id === undefined || p.id === null ? '' : String(p.id).trim()
    if (!id || seen.has(id)) continue
    const lat = number(p.latitude)
    const lon = number(p.longitude)
    let dist: number | null = null
    if (at.lat !== null && at.lon !== null) {
      if (lat === null || lon === null) continue
      dist = km(at.lat, at.lon, lat, lon)
      if (dist > maxKm) continue
    }
    seen.add(id)
    out.push({
      id,
      name: (p.name ?? '').trim(),
      overall: number(p.overallRating?.overall),
      ratings: Math.max(0, number(p.overallRating?.numberOfRatings) ?? 0),
      km: dist,
    })
  }
  const well = (r: Ranked): boolean => r.overall !== null && r.overall >= WELL_RATED
  return out.sort((a, b) =>
    Number(well(b)) - Number(well(a)) || b.ratings - a.ratings || (b.overall ?? -1) - (a.overall ?? -1) || a.id.localeCompare(b.id)
  )
}

/** A name as the stop's own places spell it: accents and case folded, runs of other characters one space. */
export const nameKey = (s: string): string => folded(s).replace(/[^a-z0-9]+/g, ' ').trim()

/** Whether a place with this name is already stored at the stop, hidden or not, whoever added it. */
export function nameStored(stored: { name?: string | null }[], name: string): boolean {
  const key = nameKey(name)
  return key !== '' && stored.some((l) => nameKey(l.name ?? '') === key)
}
