import { describe, expect, it } from 'vitest'
import type { RouteStop } from '../../lib/bundle'
import { fitSizes, flagSize, routeView, type RouteLand } from './routeView'

const stop = (id: string, country: string, nights: number, lon: number, lat: number): RouteStop =>
  ({ id, name: id, country, nights, mode: 'flight', type: 'city', lat, lon })

const land: RouteLand = { at: (lon, lat) => [500 + lon * 20, 600 - lat * 20], land: '', lit: '', borders: '' }
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
    expect(flagSize(1, 22, 40)).toBe(40 * 0.5)
    expect(flagSize(0, 22, 40)).toBeLessThan(40 * 0.5)
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
