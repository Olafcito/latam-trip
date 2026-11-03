import { describe, expect, it } from 'vitest'
import type { RouteStop } from '../../lib/bundle'
import { routeView, type RouteLand } from './routeView'
import { hereAt, revealOf, ribbon } from './tripBar'

const stop = (id: string, country: string, nights: number, mode: RouteStop['mode'], inDay: string, outDay: string, booked = false): RouteStop =>
  ({ id, name: id, country, nights, mode, type: 'city', lat: 0, lon: 0, inDay, outDay, booked })

const land: RouteLand = { at: (lon, lat) => [500 + lon * 20, 600 - lat * 20], land: '', lit: '', borders: '' }
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

describe('revealOf', () => {
  it('lights everything when nothing is chosen', () => {
    const r = revealOf(view, null)
    expect(r.legs.every(Boolean)).toBe(true)
    expect(r.countries.every(Boolean)).toBe(true)
    expect(r.home).toBe(true)
  })
  it('lights the route up to the chosen country and dims the rest', () => {
    const r = revealOf(view, view.countries[1].key)
    // legs into b, c, d
    expect(r.legs).toEqual([true, false, false])
    expect(r.countries).toEqual([true, true, false])
    expect(r.home).toBe(false)
  })
  it('the last country lights the way home too', () => {
    const r = revealOf(view, view.countries[2].key)
    expect(r.legs).toEqual([true, true, true])
    expect(r.home).toBe(true)
  })
})
