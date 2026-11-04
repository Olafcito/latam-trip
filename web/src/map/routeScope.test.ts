import { describe, expect, it } from 'vitest'
import type { LonLat } from '../lib/geo'
import { alongRoute, ROUTE_KM, scopeRows } from './routeScope'

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

describe('scopeRows', () => {
  const rows: Row[] = [{ id: 'far', at: [4.5, 2] }, { id: 'mid', at: [0.3, 2] }, { id: 'near', at: [0.1, 0] }]
  it('returns every row for a null scope', () => {
    expect(scopeRows(rows, at, null, false)).toBe(rows)
  })
  it('returns every row when wide', () => {
    expect(scopeRows(rows, at, { line }, true)).toBe(rows)
  })
  it('keeps the rows along the route, nearest to a stop first', () => {
    expect(scopeRows(rows, at, { line }, false).map((r) => r.id)).toEqual(['near', 'mid'])
  })
})
