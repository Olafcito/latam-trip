import { describe, expect, it } from 'vitest'
import type { RouteStop } from '../../lib/bundle'
import { fitSizes, flagSize, inOrder, routeLand, routeView, sideOf, type RouteLand } from './routeView'

const stop = (id: string, country: string, nights: number, lon: number, lat: number): RouteStop =>
  ({ id, name: id, country, nights, mode: 'flight', type: 'city', lat, lon })

const land: RouteLand = { at: (lon, lat) => [500 + lon * 20, 600 - lat * 20], land: '', lit: [], borders: '' }
const canvas = { w: 1000, h: 1250, tilted: false }

describe('routeView', () => {
  it('a country only passed through gets a smaller flag, closed and open', () => {
    const v = routeView([stop('a', 'CO', 6, -10, 10), stop('b', 'CR', 0, 0, 0), stop('c', 'BO', 5, 10, -10)], land, canvas)
    const [co, cr] = v.countries
    expect(cr.nights).toBe('Passing through')
    expect(cr.r).toBeLessThan(co.r * 0.6)
    expect(cr.ro).toBeLessThan(co.ro * 0.6)
  })

  it('the longest stay has the biggest flag', () => {
    const v = routeView([stop('a', 'GT', 5, -10, 10), stop('b', 'NI', 22, 0, 0), stop('c', 'BO', 11, 10, -10)], land, canvas)
    const [gt, ni, bo] = v.countries
    expect(ni.r).toBeGreaterThan(bo.r)
    expect(bo.r).toBeGreaterThan(gt.r)
    expect(ni.n).toBe(22)
  })

  it('a flag stays on its place, never pushed aside', () => {
    const v = routeView([stop('a', 'GT', 5, 0, 0), stop('b', 'SV', 4, 0.5, 0), stop('c', 'BO', 11, 10, -10)], land, canvas)
    expect(v.countries[0].rest).toEqual([500, 600])
    expect(v.countries[1].rest).toEqual([510, 600])
  })

  it('every leg knows its mode and whether it is booked', () => {
    const v = routeView([stop('a', 'CO', 6, -10, 10), { ...stop('b', 'BO', 5, 10, -10), booked: true }, { ...stop('c', 'BO', 3, 11, -11), mode: 'ground' }], land, canvas)
    expect(v.stops.map((s) => [s.mode, !!s.booked, s.fly])).toEqual([['flight', false, false], ['flight', true, true], ['ground', false, false]])
  })
})

describe('flagSize', () => {
  it('grows with the square root of the nights, with a floor and a small mark for passing', () => {
    expect(flagSize(22, 22, 40)).toBe(40)
    expect(flagSize(11, 22, 40)).toBeCloseTo(40 * Math.sqrt(0.5))
    expect(flagSize(1, 22, 40)).toBe(40 * 0.42)
    expect(flagSize(0, 22, 40)).toBeLessThan(40 * 0.42)
    expect(flagSize(5, 22, 40)).toBeGreaterThan(flagSize(4, 22, 40))
  })
})

describe('fitSizes', () => {
  it('leaves flags apart alone', () => {
    expect(fitSizes([[0, 0], [200, 0]], [40, 20])).toEqual([40, 20])
  })
  it('shrinks the smaller of two touching flags first', () => {
    const [a, b] = fitSizes([[0, 0], [60, 0]], [40, 30])
    expect(a).toBe(40)
    expect(b).toBeLessThan(30)
    expect(b).toBeGreaterThanOrEqual(30 * 0.7)
  })
  it('never below the floor, they may stack then', () => {
    const [, b] = fitSizes([[0, 0], [10, 0]], [40, 30])
    expect(b).toBeCloseTo(30 * 0.7)
  })
})

describe('inOrder', () => {
  it('keeps no flag bigger than one with more nights', () => {
    expect(inOrder([20, 24, 30], [5, 4, 22])).toEqual([20, 20, 30])
  })
  it('the sizes of a crowd follow its nights', () => {
    const v = routeView([stop('a', 'GT', 5, 0, 0), stop('b', 'SV', 4, 0.6, 0), stop('c', 'NI', 22, 1.4, 0), stop('d', 'BO', 11, 10, -10)], land, canvas)
    const by = [...v.countries].sort((a, b) => b.n - a.n).map((c) => c.r)
    expect(by).toEqual([...by].sort((a, b) => b - a))
  })
})

describe('sideOf', () => {
  it('bends the usual way when it is clear', () => {
    expect(sideOf([0, 0], [400, 0], [], [], 88)).toBe(1)
  })
  it('bends away from a foreign flag in its way', () => {
    // the usual bend of a leg going right lifts it up, towards negative y
    expect(sideOf([0, 0], [400, 0], [{ p: [200, -60], r: 30 }], [], 88)).toBe(-1)
  })
  it('stays out of a corridor already used', () => {
    expect(sideOf([0, 0], [400, 0], [], [[200, -88]], 88)).toBe(-1)
  })
})

describe('home stubs', () => {
  it('leave towards home along the great circle', () => {
    const v = routeView([stop('a', 'CO', 6, -75, 10), stop('b', 'BO', 5, -68, -16)], land, canvas, [12.6, 55.6])
    // home is north east of both ends
    expect(v.from[0]).toBeGreaterThan(v.stops[0].x)
    expect(v.from[1]).toBeLessThan(v.stops[0].y)
    expect(v.to[0]).toBeGreaterThan(v.stops[1].x)
    expect(v.to[1]).toBeLessThan(v.stops[1].y)
  })
})

describe('routeLand', () => {
  const ca = [
    stop('ctg', 'CO', 14, -75.5, 10.4), stop('lpb', 'BO', 12, -68.1, -16.5), stop('lir', 'CR', 0, -85.4, 10.6),
    stop('gra', 'NI', 22, -85.95, 11.93), stop('tun', 'SV', 4, -89.38, 13.49), stop('ant', 'GT', 5, -90.73, 14.56),
  ]
  const window = { w: 1000, h: 800, tilted: false, room: [110, 60] as [number, number], foot: 160 }

  it('draws a crowd of countries again, bigger, where there is room', () => {
    const l = routeLand(ca, window)
    expect(l.inset).toBeDefined()
    expect([...l.inset!.codes].sort()).toEqual(['CR', 'GT', 'NI', 'SV'])
    expect(l.inset!.k).toBeGreaterThanOrEqual(1.6)
    const [x, y] = l.at(-85.95, 11.93, 'NI')
    const [x0, y0, x1, y1] = l.inset!.rect
    expect(x).toBeGreaterThan(x0)
    expect(x).toBeLessThan(x1)
    expect(y).toBeGreaterThan(y0)
    expect(y).toBeLessThan(y1)
    // the rest stays where it is
    expect(l.at(-68.1, -16.5, 'BO')).toEqual(l.at(-68.1, -16.5))
  })

  it('a trip with room for every flag has no inset', () => {
    expect(routeLand([stop('ctg', 'CO', 14, -75.5, 10.4), stop('lpb', 'BO', 12, -68.1, -16.5)], window).inset).toBeUndefined()
  })

  it('lights each visited country on its own, so it can wait for the line', () => {
    expect(routeLand(ca, window).lit.map((l) => l.code).sort()).toEqual(['BO', 'CO', 'CR', 'GT', 'NI', 'SV'])
  })
})
