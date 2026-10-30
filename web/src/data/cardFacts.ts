// What the gym, city and experience cards say, worked out apart from them. Every list holds the lines that have
// a value and nothing else, so a card never has to test for null and never shows an empty line.
import { kr, thousands } from '../lib/format'
import type { CityRow, Experience, GymRow, Quote, ScoreCard } from './types'

export interface Fact {
  label: string
  value: string
  href?: string | null
  note?: string | null
}

const has = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n)
const money = (label: string, dkk: number | null | undefined, per = ''): Fact[] => (has(dkk) ? [{ label, value: kr(dkk) + per }] : [])
const text = (label: string, value: string | null | undefined): Fact[] => (value?.trim() ? [{ label, value: value.trim() }] : [])
const count = (label: string, n: number | null | undefined): Fact[] => (has(n) ? [{ label, value: String(n) }] : [])
/** Opening hours come as one line with a semicolon between the days, and read better as a line per day. */
const byDay = (value: string | null | undefined) => value?.split(/;\s*/).join('\n')

/** A few research notes name a raw field. The data stays as it was written and the card says it in words. */
export function plainNote(note: string | null | undefined): string | null {
  const out = note
    ?.replace(/,?\s*so room_month_dkk is null/g, '')
    .replace(/single_month_no_rent(_dkk)?/g, 'Living without rent')
    .trim()
  return out || null
}

export const SCORE_MAX = 10

const SCORE_PARTS = [
  ['training', 'Training'],
  ['evidence', 'Evidence'],
  ['local_life', 'Local life'],
  ['cost', 'Cost'],
  ['water', 'Water'],
] as const

export interface ScoreBar {
  key: string
  label: string
  value: number
}

export function scoreBars(score: ScoreCard | null | undefined): ScoreBar[] {
  return SCORE_PARTS.flatMap(([key, label]) => {
    const value = score?.[key]
    return has(value) ? [{ key, label, value }] : []
  })
}

export const scoreText = (total: number) => total.toFixed(1)

export const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function reviews(rating: number | null | undefined, n: number | null | undefined): string | null {
  const many = has(n) ? `${thousands(n)} ${n === 1 ? 'review' : 'reviews'}` : null
  if (has(rating)) return many ? `${rating} from ${many}` : String(rating)
  return many
}

/** Google first, then every other site that gave a rating or a count. */
export function gymRatings(g: GymRow): Fact[] {
  const d = g.details
  const google = reviews(d?.google_rating, d?.google_reviews)
  const others = (d?.other_ratings ?? []).flatMap((r) => {
    const value = reviews(r.rating, r.count)
    return value ? [{ label: r.site, value }] : []
  })
  return [...(google ? [{ label: 'Google', value: google }] : []), ...others]
}

export function gymPrices(g: GymRow): Fact[] {
  const d = g.details
  return [
    ...money('Drop-in', d?.price_dropin_dkk),
    ...money('Week', d?.price_week_dkk),
    ...money('Month', d?.price_month_dkk ?? g.price_dkk),
    ...money('Private', d?.private_dkk),
  ]
}

function sessions(n: number | string | null | undefined): string | null {
  if (typeof n === 'number') return has(n) ? `${n} a week` : null
  return n ?? null
}

/** The distance to the water, with the note on how it was measured under it. */
function water(km: number | null | undefined, note: string | null | undefined): Fact[] {
  if (!has(km)) return text('Water', note)
  return [{ label: 'Water', value: `${thousands(km)} km`, ...(note?.trim() ? { note: note.trim() } : {}) }]
}

/** The lines under the prices, in the order the card shows them. */
export function gymLines(g: GymRow): Fact[] {
  const d = g.details
  return [
    ...text('Timetable', byDay(d?.timetable)),
    ...text('Sessions', sessions(d?.sessions_per_week)),
    ...text('Sparring', d?.sparring),
    ...text('Visitors', d?.visitors),
    ...text('Coaches', d?.coaches),
    ...text('Fighters', d?.fighters),
    ...text('Neighbourhood', d?.neighbourhood),
    ...water(d?.water_km, d?.water_note),
    ...money('Room', d?.room_month_dkk, ' a month'),
    ...money('Studio', d?.studio_month_dkk, ' a month'),
    ...money('Food', d?.food_day_dkk, ' a day'),
    ...text('Address', d?.address),
    ...text('Address note', d?.address_note),
    ...text('Phone', d?.phone),
    ...text('Hours', byDay(d?.hours)),
    ...text('Season', g.season),
    ...text('December and January', g.dec_jan),
    ...text('Requirements', g.requirements),
    ...text('Duration', g.duration),
  ]
}

/** The three numbers a city's month comes down to, from Numbeo. */
export function numbeoFacts(c: CityRow): Fact[] {
  const n = c.details?.numbeo
  return [
    ...money('Living without rent', n?.single_month_no_rent_dkk),
    ...money('1-bed rent', n?.rent_1bed_outside_dkk),
    ...money('Total a month', n?.monthly_total_dkk),
  ]
}

/** What else the city's Numbeo page and the research gave. */
export function cityCostFacts(c: CityRow): Fact[] {
  const d = c.details
  const n = d?.numbeo
  return [
    ...money('Own estimate a month', d?.monthly_total_dkk),
    ...money('Listed price', c.price_dkk),
    ...money('Cheap meal', n?.meal_cheap_dkk),
    ...money('Gym a month', n?.gym_month_dkk),
    ...money('Room a month', d?.room_month_dkk),
    ...money('Studio a month', d?.studio_month_dkk),
    ...money('Food a day', d?.food_day_dkk),
    ...count('Cost of living index', n?.col_index),
    ...count('Rent index', n?.rent_index),
    ...count('Cost and rent index', n?.col_plus_rent_index),
  ]
}

export function hostelFacts(c: CityRow): Fact[] {
  const h = c.details?.hostels
  return [...money('Dorm a night', h?.dorm_night_dkk), ...money('Private a night', h?.private_night_dkk), ...count('Hostels found', h?.n)]
}

/** The city's place on the outside rankings. An index that does not list the city has no line. */
export function indexFacts(c: CityRow): Fact[] {
  const i = c.details?.indices
  if (!i) return []
  const out: Fact[] = []
  if (has(i.backpacker_index_dkk_day)) {
    const year = has(i.backpacker_index_year) ? `, ${i.backpacker_index_year}` : ''
    out.push({ label: 'Backpacker Index', value: `${thousands(i.backpacker_index_dkk_day)} kr a day${year}`, href: i.backpacker_index_url, note: i.backpacker_index_note })
  }
  const expat = [
    has(i.expat_friendliness_rank) ? `friendliness ${i.expat_friendliness_rank}` : null,
    has(i.expat_settling_rank) ? `settling in ${i.expat_settling_rank}` : null,
  ].filter(Boolean)
  if (expat.length) out.push({ label: 'Expat Insider rank', value: capitalise(expat.join(', ')), href: i.expat_url, note: i.expat_edition == null ? null : String(i.expat_edition) })
  if (has(i.tasteatlas_cuisine_rank)) {
    const score = has(i.tasteatlas_cuisine_score) ? `, score ${i.tasteatlas_cuisine_score}` : ''
    out.push({ label: 'TasteAtlas cuisine', value: `Rank ${i.tasteatlas_cuisine_rank}${score}`, href: i.tasteatlas_url })
  }
  if (has(i.tasteatlas_city_rank)) out.push({ label: 'TasteAtlas city', value: `Rank ${i.tasteatlas_city_rank}`, href: i.tasteatlas_url })
  return out
}

export function cityLines(c: CityRow): Fact[] {
  const d = c.details
  return [
    ...text('Neighbourhoods', d?.neighbourhoods),
    ...text('Safety', d?.safety),
    ...text('Local life', d?.local_life),
    ...text('Water', d?.water_note),
    ...text('Also seen', d?.also_seen),
    ...text('Cost note', d?.cost_note),
    ...text('Not verified', d?.unverified),
    ...text('Season', c.season),
    ...text('December and January', c.dec_jan),
  ]
}

export function experienceLines(e: Experience): Fact[] {
  return [
    ...text('Season', e.season),
    ...text('December and January', e.dec_jan),
    ...text('Duration', e.duration),
    ...text('Requirements', e.requirements),
  ]
}

/** A category's stock photo says nothing about the row, so a card only shows a row's own photo or its place's. */
export function cardPhoto(row: Pick<Experience, 'image' | 'image_source'>) {
  return row.image?.url && row.image_source !== 'category' ? row.image : null
}

/** Who said a quote and when, as the text of its link. */
export function quoteSource(q: Quote): string | null {
  const said = [q.site && capitalise(q.site), q.date].filter(Boolean).join(', ')
  return said || (q.url ? 'Source' : null)
}

export const SECTION_CAP = 3

/** The rows a section shows, and how many are folded away behind its "Show all". */
export function capped<T>(rows: T[], open: boolean, cap = SECTION_CAP): { shown: T[]; folded: number } {
  // one row behind a button is a worse deal than the row itself
  if (open || rows.length <= cap + 1) return { shown: rows, folded: 0 }
  return { shown: rows.slice(0, cap), folded: rows.length - cap }
}
