import { describe, expect, it } from 'vitest'
import type { LonLat } from '../lib/geo'
import { alongRoute, ROUTE_KM } from './routeScope'

type Row = { id: string; at?: LonLat }
const at = (r: Row) => r.at
// one degree of latitude is about 111 km
const line: LonLat[] = [[0, 0], [0, 4]]

describe('alongRoute', () => {
  it('keeps a point 50 km from a stop', () => {
    const rows: Row[] = [{ id: 'near', at: [0.45, 0] }]
    expect(alongRoute(rows, at, line, ROUTE_KM)).toEqual(rows)
  })
  it('keeps a point near the midpoint of a segment', () => {
    const rows: Row[] = [{ id: 'mid', at: [0.3, 2] }]
    expect(alongRoute(rows, at, line, ROUTE_KM)).toEqual(rows)
  })
  it('drops a point 500 km from every vertex and midpoint', () => {
    expect(alongRoute([{ id: 'far', at: [4.5, 2] }], at, line, ROUTE_KM)).toEqual([])
  })
  it('drops a row with no point', () => {
    expect(alongRoute([{ id: 'none' }], at, line, ROUTE_KM)).toEqual([])
  })
  it('keeps nothing for an empty line', () => {
    expect(alongRoute([{ id: 'a', at: [0, 0] }], at, [], ROUTE_KM)).toEqual([])
  })
  it('works with a single vertex', () => {
    expect(alongRoute([{ id: 'a', at: [0.1, 0.1] }], at, [[0, 0]], ROUTE_KM)).toHaveLength(1)
  })
})
