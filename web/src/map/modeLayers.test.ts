import { describe, expect, it } from 'vitest'
import type { SavedEntry } from '../data/experiences'
import type { CityRow, Experience, GymRow, Place } from '../data/types'
import type { LonLat } from '../lib/geo'
import { cityFeatures, experienceFeatures, gymFeatures, nearestHit, type HitFeature } from './modeLayers'

const gym = (id: string, total: number | null) => ({ id, name: id.toUpperCase(), details: { score: { total } } }) as unknown as GymRow
const city = (id: string, over: Partial<CityRow>, total: number | null = null) =>
  ({ id, name: id, lat: 1, lon: 2, details: { score: { total } }, ...over }) as unknown as CityRow
const exp = (id: string) => ({ id, name: id.toUpperCase() }) as unknown as Experience
const saved = (type: SavedEntry['type'], id: string): SavedEntry => ({ type, id, name: id.toUpperCase() }) as SavedEntry

describe('gymFeatures', () => {
  const at = new Map<string, LonLat>([['a', [1, 2]], ['b', [3, 4]]])

  it('puts each gym on its spot with its score', () => {
    const [f] = gymFeatures([gym('a', 7.2)], at).features
    expect(f.geometry.coordinates).toEqual([1, 2])
    expect(f.properties).toEqual({ kind: 'gym', id: 'a', name: 'A', total: 7.2 })
  })
  it('gives a gym without a score the total a map expression can compare', () => {
    expect(gymFeatures([gym('b', null)], at).features[0].properties?.total).toBe(-1)
  })
  it('leaves out a gym with no spot', () => {
    expect(gymFeatures([gym('c', 5)], at).features).toEqual([])
  })
})

describe('cityFeatures', () => {
  it('shows the score after the name', () => {
    const [f] = cityFeatures([city('Lima', {}, 6.25)]).features
    expect(f.geometry.coordinates).toEqual([2, 1])
    expect(f.properties?.label).toMatch(/ 6\.[23]$/)
    expect(f.properties?.total).toBe(6.25)
  })
  it('shows only the name without a score, never a placeholder', () => {
    const [f] = cityFeatures([city('Lima', {})]).features
    expect(f.properties?.label).not.toMatch(/null|\?/)
    expect(f.properties?.total).toBe(-1)
  })
  it('leaves out a city with no coordinates', () => {
    expect(cityFeatures([city('Lima', { lat: null })]).features).toEqual([])
  })
})

describe('experienceFeatures', () => {
  const at = new Map<string, LonLat>([['a', [1, 2]], ['b', [3, 4]]])
  const places = [{ id: 'LIM', lat: 10, lon: 20 }] as Pick<Place, 'id' | 'lat' | 'lon'>[]

  it('marks the saved experiences', () => {
    const fs = experienceFeatures([exp('a'), exp('b')], [saved('experience', 'b')], places, at).features
    expect(fs.map((f) => f.properties?.saved)).toEqual([false, true])
  })
  it('adds saved places, as place markers at the place', () => {
    const [f] = experienceFeatures([], [saved('place', 'LIM')], places, at).features
    expect(f.geometry.coordinates).toEqual([20, 10])
    expect(f.properties).toMatchObject({ kind: 'place', id: 'LIM', saved: true })
  })
  it('leaves out what has no spot', () => {
    expect(experienceFeatures([exp('c')], [saved('place', 'NOPE')], places, at).features).toEqual([])
  })
})

describe('nearestHit', () => {
  const feature = (layer: string, x: number, y: number, properties: Record<string, unknown>): HitFeature => ({
    layer: { id: layer },
    source: 'mode-gyms',
    properties,
    geometry: { type: 'Point', coordinates: [x, y] },
  })
  const project = ([x, y]: LonLat) => ({ x, y })
  const tap = { x: 100, y: 100 }

  it('takes the marker closest to the tap', () => {
    const hit = nearestHit([feature('gyms-dot', 106, 100, { kind: 'gym', id: 'far' }), feature('gyms-dot', 102, 100, { kind: 'gym', id: 'near' })], tap, project)
    expect(hit).toEqual({ kind: 'gym', id: 'near' })
  })
  it('hands back a cluster with what it takes to zoom in on it', () => {
    const hit = nearestHit([feature('gyms-cluster', 100, 100, { cluster_id: 7 })], tap, project)
    expect(hit).toEqual({ kind: 'cluster', source: 'mode-gyms', id: 7, at: [100, 100] })
  })
  it('measures a city from its risen diamond, not from its spot', () => {
    const hit = nearestHit([feature('gyms-dot', 100, 110, { kind: 'gym', id: 'g' }), feature('city-mark', 100, 122, { kind: 'city', id: 'c' })], tap, project)
    expect(hit).toEqual({ kind: 'city', id: 'c' })
  })
  it('finds nothing in nothing', () => {
    expect(nearestHit([], tap, project)).toBeNull()
  })
})
