import type { Family } from '@map/data/types'
import type { RouteView } from './routeView'

// The itinerary laid over the foot of the trip map: a segment per country as wide as its nights, how
// you got there and whether that leg is booked. Choosing a country lights the route up to it.

export interface Segment {
  key: string
  code: string
  name: string
  nights: number
  /** its part of all the trip's nights, nothing for a country only passed through */
  share: number
  passing: boolean
  /** how you reach it, the first country by the way in */
  mode: Family
  booked: boolean
  /** the day you get there and the day you leave */
  first: string | null
  last: string | null
}

/** inBooked: the way in from home is booked, it brings you to the first country. */
export function ribbon(view: RouteView, inBooked = false): Segment[] {
  const all = view.countries.reduce((n, c) => n + c.n, 0) || 1
  return view.countries.map((c, ci) => {
    const s = view.stops[c.first]
    return {
      key: c.key, code: c.code, name: c.name, nights: c.n, share: c.n / all, passing: !c.n,
      mode: ci ? s.mode : 'flight',
      booked: ci ? !!s.booked : inBooked,
      first: s.inDay ?? null,
      last: view.stops[c.last].outDay ?? null,
    }
  })
}

/** The country you sleep in on this day, nothing before or after the trip. On a day you move it is the next one. */
export function hereAt(bar: Segment[], today: string): string | null {
  return bar.find((s) => !s.passing && s.first && s.last && s.first <= today && today < s.last)?.key ?? null
}

export type Tier = 'plain' | 'past' | 'hero' | 'future'
export interface Tiers {
  countries: Tier[]
  /** the leg into each stop after the first */
  legs: Tier[]
  /** the way in from home and the way home */
  from: Tier
  to: Tier
}

/**
 * A chosen country is the hero with its legs in and out and the legs inside it, what came before goes
 * quiet, what comes after stays plain. Nothing chosen leaves it all plain.
 */
export function tierOf(view: RouteView, key: string | null): Tiers {
  const at = key == null ? -1 : view.countries.findIndex((c) => c.key === key)
  const legs = view.stops.slice(1)
  if (at < 0) return { countries: view.countries.map(() => 'plain'), legs: legs.map(() => 'plain'), from: 'plain', to: 'plain' }
  const { first, last } = view.countries[at]
  const last1 = view.countries.length - 1
  return {
    countries: view.countries.map((_, ci) => (ci < at ? 'past' : ci > at ? 'future' : 'hero')),
    // the leg into stop k
    legs: legs.map((_, j) => { const k = j + 1; return k < first ? 'past' : k > last + 1 ? 'future' : 'hero' }),
    from: at === 0 ? 'hero' : 'past',
    to: at === last1 ? 'hero' : 'future',
  }
}

export interface Span { key: string; x0: number; x1: number }
export interface LegMark { at: number; mode: Family; booked: boolean }
export interface Month { at: number; name: string; line: boolean }
export interface Timeline { spans: Span[]; legs: LegMark[]; months: Month[]; today: number | null }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayNo = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000

/**
 * The bar as one track from the first day of the trip to the last, each country placed by its days, a
 * glyph for every leg on the boundary where it is, the months and today. Without days it goes by nights.
 */
export function timeline(bar: Segment[], { today, homeBooked }: { today: string | null; homeBooked: boolean }): Timeline {
  const dated = bar.length > 0 && bar.every((s) => s.first && s.last)
  const start = dated ? dayNo(bar[0].first!) : 0
  const end = dated ? dayNo(bar[bar.length - 1].last!) : 0
  let spans: Span[]
  if (dated && end > start) {
    const at = (d: string) => (dayNo(d) - start) / (end - start)
    spans = bar.map((s) => ({ key: s.key, x0: at(s.first!), x1: at(s.last!) }))
  } else {
    const all = bar.reduce((n, s) => n + s.nights, 0) || 1
    let run = 0
    spans = bar.map((s) => { const x0 = run / all; run += s.nights; return { key: s.key, x0, x1: run / all } })
  }
  const legs: LegMark[] = [
    ...bar.map((s, i) => ({ at: spans[i].x0, mode: s.mode, booked: s.booked })),
    { at: 1, mode: 'flight' as Family, booked: homeBooked },
  ]
  const months: Month[] = []
  let now: number | null = null
  if (dated && end > start) {
    const first = bar[0].first!
    months.push({ at: 0, name: MONTHS[+first.slice(5, 7) - 1], line: false })
    let y = +first.slice(0, 4)
    let m = +first.slice(5, 7)
    for (;;) {
      m += 1
      if (m > 12) { m = 1; y += 1 }
      const d = Date.UTC(y, m - 1, 1) / 86400000
      if (d >= end) break
      months.push({ at: (d - start) / (end - start), name: MONTHS[m - 1], line: true })
    }
    if (today) {
      const t = dayNo(today)
      if (t >= start && t < end) now = (t - start + 0.5) / (end - start)
    }
  }
  return { spans, legs, months, today: now }
}

/**
 * Glyphs at these places, each at least gap from the next, kept inside lo and hi: those that would
 * touch step apart as little as they can.
 */
export function spread(xs: number[], gap: number, lo: number, hi: number): number[] {
  const out = xs.map((x) => Math.min(hi, Math.max(lo, x)))
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + gap)
  for (let i = out.length - 1; i >= 0; i--) out[i] = Math.min(out[i], i === out.length - 1 ? hi : out[i + 1] - gap)
  for (let i = 0; i < out.length; i++) out[i] = Math.max(out[i], i ? out[i - 1] + gap : lo)
  return out
}

/** The country under a point of the track: a pass through within near of it wins, then the stay it is in. */
export function spanAt(spans: Span[], f: number, near: number): string | null {
  const pass = spans.filter((s) => s.x1 - s.x0 < 1e-9 && Math.abs(s.x0 - f) <= near)
    .sort((a, b) => Math.abs(a.x0 - f) - Math.abs(b.x0 - f))[0]
  if (pass) return pass.key
  const live = spans.filter((s) => s.x1 > s.x0)
  if (!live.length) return null
  const x = Math.min(Math.max(f, 0), 1)
  return (live.find((s) => x >= s.x0 && x < s.x1) ?? (x < live[0].x0 ? live[0] : live[live.length - 1])).key
}
