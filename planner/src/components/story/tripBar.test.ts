import { describe, expect, it } from 'vitest'
import type { RouteStop } from '../../lib/bundle'
import { routeView, type RouteLand } from './routeView'
import { hereAt, ribbon, spanAt, spread, tierOf, timeline } from './tripBar'

const stop = (id: string, country: string, nights: number, mode: RouteStop['mode'], inDay: string, outDay: string, booked = false): RouteStop =>
  ({ id, name: id, country, nights, mode, type: 'city', lat: 0, lon: 0, inDay, outDay, booked })

const land: RouteLand = { at: (lon, lat) => [500 + lon * 20, 600 - lat * 20], land: '', lit: [], borders: '' }
const canvas = { w: 1000, h: 1250, tilted: false }

// in by air to the first, a bus on, a booked flight to the last, two stops in the last
const trip = [
  stop('a', 'CO', 10, 'ground', '2026-12-02', '2026-12-12'),
  stop('b', 'CR', 0, 'ground', '2026-12-12', '2026-12-12'),
  stop('c', 'NI', 6, 'flight', '2026-12-12', '2026-12-18', true),
  stop('d', 'NI', 4, 'ground', '2026-12-18', '2026-12-22'),
]
const view = routeView(trip, land, canvas)

describe('ribbon', () => {
  const bar = ribbon(view)

  it('has a segment per country with its nights and share of the trip', () => {
    expect(bar.map((s) => [s.code, s.nights])).toEqual([['CO', 10], ['CR', 0], ['NI', 10]])
    expect(bar[0].share).toBeCloseTo(0.5)
    expect(bar[1].passing).toBe(true)
    expect(bar[1].share).toBe(0)
  })

  it('tells how you reached each country and whether that leg is booked', () => {
    expect(bar[0].mode).toBe('flight')
    expect(bar[1].mode).toBe('ground')
    expect(bar[2]).toMatchObject({ mode: 'flight', booked: true })
    expect(bar[1].booked).toBe(false)
  })

  it('the first country takes the way in', () => {
    expect(ribbon(view, true)[0].booked).toBe(true)
  })

  it('runs from the first day in a country to the day you leave it', () => {
    expect([bar[2].first, bar[2].last]).toEqual(['2026-12-12', '2026-12-22'])
  })
})

describe('hereAt', () => {
  const bar = ribbon(view)
  it('is nobody before and after the trip', () => {
    expect(hereAt(bar, '2026-11-03')).toBeNull()
    expect(hereAt(bar, '2027-01-10')).toBeNull()
  })
  it('is the country of the day, the next one on a day you move', () => {
    expect(hereAt(bar, '2026-12-05')).toBe(bar[0].key)
    expect(hereAt(bar, '2026-12-12')).toBe(bar[2].key)
    expect(hereAt(bar, '2026-12-21')).toBe(bar[2].key)
  })
})

describe('tierOf', () => {
  it('leaves everything plain when nothing is chosen', () => {
    const t = tierOf(view, null)
    expect(t.countries).toEqual(['plain', 'plain', 'plain'])
    expect(t.legs).toEqual(['plain', 'plain', 'plain'])
    expect([t.from, t.to]).toEqual(['plain', 'plain'])
  })
  it('makes the chosen country the hero with its legs in and out, before it quiet, after it plain', () => {
    const t = tierOf(view, view.countries[1].key)
    expect(t.countries).toEqual(['past', 'hero', 'future'])
    // legs into b, c, d: into the pass, out of it, then on inside the last country
    expect(t.legs).toEqual(['hero', 'hero', 'future'])
    expect([t.from, t.to]).toEqual(['past', 'future'])
  })
  it('the first country owns the way in, the last the way home and the legs inside it', () => {
    expect(tierOf(view, view.countries[0].key).from).toBe('hero')
    const t = tierOf(view, view.countries[2].key)
    expect(t.legs).toEqual(['past', 'hero', 'hero'])
    expect(t.to).toBe('hero')
  })
})

describe('timeline', () => {
  const bar = ribbon(view, true)
  const line = timeline(bar, { today: '2026-11-03', homeBooked: false })

  it('places each country by its days, butted from the first day to the last', () => {
    // 2 Dec to 22 Dec is 20 days
    expect(line.spans.map((s) => [s.x0, s.x1])).toEqual([[0, 0.5], [0.5, 0.5], [0.5, 1]])
  })
  it('has a glyph for every leg, the way out at the start and the way home at the end', () => {
    expect(line.legs.map((l) => [l.at, l.mode, l.booked])).toEqual([
      [0, 'flight', true], [0.5, 'ground', false], [0.5, 'flight', true], [1, 'flight', false],
    ])
  })
  it('names the month at the start and draws a hairline where a new one begins', () => {
    expect(line.months).toEqual([{ at: 0, name: 'Dec', line: false }])
    const long = timeline([{ ...bar[0], last: '2027-01-11' }], { today: null, homeBooked: false })
    expect(long.months).toEqual([{ at: 0, name: 'Dec', line: false }, { at: 0.75, name: 'Jan', line: true }])
  })
  it('puts today at its day, nowhere before or after the trip', () => {
    expect(line.today).toBeNull()
    expect(timeline(bar, { today: '2026-12-12', homeBooked: false }).today).toBeCloseTo(10.5 / 20)
    expect(timeline(bar, { today: '2026-12-22', homeBooked: false }).today).toBeNull()
  })
  it('falls back on the nights when the days are not known', () => {
    const blind = bar.map((s) => ({ ...s, first: null, last: null }))
    expect(timeline(blind, { today: null, homeBooked: false }).spans.map((s) => s.x1)).toEqual([0.5, 0.5, 1])
  })
})

describe('spread', () => {
  it('leaves glyphs that are apart where they are', () => {
    expect(spread([10, 50, 90], 20, 0, 100)).toEqual([10, 50, 90])
  })
  it('steps touching glyphs apart and keeps them inside', () => {
    expect(spread([40, 42, 44], 20, 0, 100)).toEqual([40, 60, 80])
    expect(spread([90, 95, 100], 20, 0, 100)).toEqual([60, 80, 100])
  })
})

describe('spanAt', () => {
  const spans = [{ key: 'a', x0: 0, x1: 0.5 }, { key: 'p', x0: 0.5, x1: 0.5 }, { key: 'b', x0: 0.5, x1: 1 }]
  it('finds the stay under the point', () => {
    expect(spanAt(spans, 0.2, 0.02)).toBe('a')
    expect(spanAt(spans, 0.8, 0.02)).toBe('b')
  })
  it('a pass through near the point wins', () => {
    expect(spanAt(spans, 0.51, 0.02)).toBe('p')
  })
  it('a point past either end takes the end', () => {
    expect(spanAt(spans, -0.1, 0.02)).toBe('a')
    expect(spanAt(spans, 1.2, 0.02)).toBe('b')
  })
})
