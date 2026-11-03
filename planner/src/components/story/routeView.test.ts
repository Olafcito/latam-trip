import { describe, expect, it } from 'vitest'
import type { RouteStop } from '../../lib/bundle'
import { routeView, type RouteLand } from './routeView'

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
})
