import { describe, expect, it } from 'vitest'
import { EASE, along, arc, boundsOf, pathThrough } from './geo'
import { placeTip } from './tooltip'

describe('arc', () => {
  it('starts and ends at the endpoints and bows to one side', () => {
    const line = arc([-90, 14], [-75, 10])
    expect(line[0][0]).toBeCloseTo(-90)
    expect(line[0][1]).toBeCloseTo(14)
    expect(line.at(-1)![0]).toBeCloseTo(-75)
    expect(line.at(-1)![1]).toBeCloseTo(10)
    const mid = line[Math.floor(line.length / 2)]
    // the straight midpoint is about lat 12; a left bow when heading east goes north
    expect(mid[1]).toBeGreaterThan(12.5)
  })

  it('draws through layovers in order', () => {
    const path = pathThrough([[-90, 14], [-79.4, 9], [-75, 10]], true)
    expect(path[0]).toEqual(arc([-90, 14], [-79.4, 9], 0.16, 24)[0])
    expect(path.some(([lon, lat]) => Math.abs(lon + 79.4) < 1e-9 && Math.abs(lat - 9) < 1e-9)).toBe(true)
  })
})

describe('bounds and along', () => {
  it('computes bounds and interpolates by length', () => {
    expect(boundsOf([[1, 2], [-3, 5], [4, -1]])).toEqual([[-3, -1], [4, 5]])
    expect(along([[0, 0], [10, 0]], 0.25)).toEqual([2.5, 0])
    expect(along([[0, 0], [10, 0], [10, 10]], 0.75)).toEqual([10, 5])
  })

  it('eases from 0 to 1 and front loads the motion', () => {
    expect(EASE(0)).toBe(0)
    expect(EASE(1)).toBe(1)
    expect(EASE(0.3)).toBeGreaterThan(0.6)
  })
})

describe('placeTip', () => {
  const map = { w: 1000, h: 700 }
  const size = { w: 280, h: 120 }

  it('prefers the right side', () => {
    const r = placeTip({ left: 400, top: 300, right: 500, bottom: 360 }, size, map)
    expect(r.side).toBe('right')
    expect(r.left).toBe(516)
  })

  it('goes left when the right side runs off the map', () => {
    const r = placeTip({ left: 600, top: 300, right: 800, bottom: 360 }, size, map)
    expect(r.side).toBe('left')
  })

  it('skips spots under the panel', () => {
    const panel = { left: 14, top: 14, right: 314, bottom: 686 }
    const r = placeTip({ left: 330, top: 300, right: 700, bottom: 360 }, size, map, [panel])
    expect(r.side).toBe('below')
  })

  it('never covers the target', () => {
    const t = { left: 50, top: 50, right: 950, bottom: 650 }
    const r = placeTip(t, size, map)
    expect(r.side).toBeNull()
  })
})
