import { describe, expect, it } from 'vitest'
import { boundsOf } from '../lib/geo'
import type { Place } from '../data/types'
import { legBounds, padBounds, tripBounds } from './camera'

const at = (id: string, lon: number, lat: number) => [id, { id, lon, lat } as Place] as const
const byId = new Map<string, Place>([at('A', -90, 14), at('B', -86, 12), at('C', -84, 10)])

describe('camera bounds', () => {
  it('fits every stop of a trip', () => {
    expect(tripBounds(['A', 'B', 'C'], byId)).toEqual(boundsOf([[-90, 14], [-86, 12], [-84, 10]]))
  })
  it('is null when no stop resolves', () => {
    expect(tripBounds(['X', 'Y'], byId)).toBeNull()
    expect(tripBounds([], byId)).toBeNull()
  })
  it('gives a one stop trip a point box', () => {
    expect(tripBounds(['B'], byId)).toEqual([[-86, 12], [-86, 12]])
  })
  it('skips stops that are missing and keeps the rest', () => {
    expect(tripBounds(['A', 'X', 'C'], byId)).toEqual(boundsOf([[-90, 14], [-84, 10]]))
  })
  it('fits a leg from both ends', () => {
    expect(legBounds({ a: 'A', b: 'B' }, byId)).toEqual(boundsOf([[-90, 14], [-86, 12]]))
  })
  it('is null for a leg with a missing end', () => {
    expect(legBounds({ a: 'A', b: 'X' }, byId)).toBeNull()
    expect(legBounds({ a: 'X', b: 'A' }, byId)).toBeNull()
  })
  it('pads by a share of the box with a floor so a point gets a usable box', () => {
    const p = padBounds([[0, 0], [0, 0]], 0.1)
    expect(p[1][0] - p[0][0]).toBeCloseTo(0.5)
    expect(p[1][1] - p[0][1]).toBeCloseTo(0.5)
    expect(padBounds([[0, 0], [10, 10]], 0.1)).toEqual([[-1, -1], [11, 11]])
  })
  it('never returns NaN for a point box', () => {
    expect(padBounds(tripBounds(['B'], byId)!, 0.2).flat().every(Number.isFinite)).toBe(true)
  })
})
