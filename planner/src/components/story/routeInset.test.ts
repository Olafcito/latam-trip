import { describe, expect, it } from 'vitest'
import { clusterOf, insetFor } from './routeInset'

describe('clusterOf', () => {
  it('joins flags too close to read, one after another', () => {
    // three close together on the left, two far apart
    const pts: [number, number][] = [[100, 100], [130, 110], [160, 125], [600, 300], [800, 900]]
    expect(clusterOf(pts, 40)).toEqual([0, 1, 2])
  })
  it('is nothing when every flag has room', () => {
    expect(clusterOf([[0, 0], [400, 0], [0, 400]], 30)).toEqual([])
  })
  it('takes the biggest crowd when there are two', () => {
    const pts: [number, number][] = [[0, 0], [20, 0], [500, 500], [520, 500], [540, 500]]
    expect(clusterOf(pts, 30)).toEqual([2, 3, 4])
  })
})

describe('insetFor', () => {
  const area: [number, number, number, number] = [0, 0, 1000, 800]

  it('grows the crowd into free room, keeping its shape', () => {
    const got = insetFor([100, 100, 200, 150], [{ p: [800, 600], r: 40 }], area)!
    expect(got.k).toBeGreaterThan(3)
    const [x0, y0, x1, y1] = got.rect
    expect((x1 - x0) / (y1 - y0)).toBeCloseTo(2)
    expect(x0).toBeGreaterThanOrEqual(0)
    expect(y1).toBeLessThanOrEqual(800)
  })

  it('never covers another stop', () => {
    const others = [{ p: [500, 400] as [number, number], r: 40 }, { p: [900, 100] as [number, number], r: 40 }]
    const { rect } = insetFor([100, 100, 200, 150], others, area)!
    others.forEach(({ p, r }) => {
      const nx = Math.max(rect[0], Math.min(p[0], rect[2]))
      const ny = Math.max(rect[1], Math.min(p[1], rect[3]))
      expect(Math.hypot(p[0] - nx, p[1] - ny)).toBeGreaterThanOrEqual(r)
    })
  })

  it('stays near where the crowd really is', () => {
    const left = insetFor([60, 60, 120, 90], [], area)!
    const right = insetFor([880, 700, 940, 730], [], area)!
    expect((left.rect[0] + left.rect[2]) / 2).toBeLessThan((right.rect[0] + right.rect[2]) / 2)
  })

  it('is nothing when it cannot magnify enough', () => {
    expect(insetFor([0, 0, 900, 700], [], area)).toBeNull()
  })
})
