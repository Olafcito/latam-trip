import { describe, expect, it } from 'vitest'
import { cover, leadFrom, SIDES, spotFor } from './labelSpots'
import type { Box } from './routeView'

const bounds: Box = [0, 0, 1000, 500]
const flag = (x: number, y: number, r = 20): Box => [x - r - 3, y - r - 3, x + r + 3, y + r + 3]

describe('spotFor', () => {
  it('puts a label right of its flag when that is clear', () => {
    const s = spotFor({ w: 100, h: 30, at: [500, 250, 20] }, [flag(500, 250)], [], [], bounds)
    expect(SIDES[s.k]).toEqual([1, 0])
    expect(s.left).toBeGreaterThan(520)
    expect(s.peek).toBe(false)
    expect(s.lead).toBeNull()
  })

  it('goes left when a neighbour flag sits on the right', () => {
    const hard = [flag(500, 250), flag(560, 250)]
    const s = spotFor({ w: 100, h: 30, at: [500, 250, 20] }, hard, [], [], bounds)
    expect(SIDES[s.k]).toEqual([-1, 0])
    expect(hard.every((h) => cover(s.box, h) === 0)).toBe(true)
  })

  it('never lays a label over a word placed before it', () => {
    const words: Box[] = []
    const a = spotFor({ w: 120, h: 30, at: [500, 250, 20] }, [], words, [], bounds)
    const b = spotFor({ w: 120, h: 30, at: [520, 250, 20] }, [], words, [], bounds)
    expect(cover(a.box, b.box)).toBe(0)
    expect(words).toHaveLength(2)
  })

  it('stays inside the map at its right edge', () => {
    const s = spotFor({ w: 100, h: 30, at: [960, 250, 20] }, [], [], [], bounds)
    expect(s.box[2]).toBeLessThanOrEqual(1000)
  })

  it('keeps the side it had while that side is still clear', () => {
    const s = spotFor({ w: 100, h: 30, at: [500, 250, 20], side: 1 }, [], [], [], bounds)
    expect(s.k).toBe(1)
  })

  it('moves out on a leader line when every close spot is taken', () => {
    const at: [number, number, number] = [500, 250, 20]
    // a neighbour flag on the right and words left, above and below, with room only further out
    const hard = [flag(500, 250), flag(560, 250)]
    const words: Box[] = [[380, 200, 477, 300], [440, 150, 600, 227], [440, 273, 536, 330]]
    const before = [...words]
    const s = spotFor({ w: 60, h: 20, at }, hard, words, [], bounds)
    expect(s.peek).toBe(false)
    expect(s.lead).not.toBeNull()
    expect([...hard, ...before].every((h) => cover(s.box, h) === 0)).toBe(true)
  })

  it('waits for hover when nothing anywhere is clear', () => {
    const s = spotFor({ w: 100, h: 30, at: [500, 250, 20] }, [[0, 0, 1000, 500]], [], [], bounds)
    expect(s.peek).toBe(true)
  })

  it('never lays a label over a line it is told is hard', () => {
    const line: Box[] = Array.from({ length: 20 }, (_, k): Box => [430 + k * 7, 225, 434 + k * 7, 229])
    const s = spotFor({ w: 100, h: 30, at: [500, 250, 20] }, [flag(500, 250), ...line], [], [], bounds)
    expect(line.every((b) => cover(s.box, b) === 0)).toBe(true)
  })

  it('lets the line cost but not block', () => {
    const line: Box[] = [[520, 200, 700, 300]]
    const s = spotFor({ w: 100, h: 30, at: [500, 250, 20] }, [], [], line, bounds)
    expect(s.peek).toBe(false)
    expect(cover(s.box, line[0])).toBe(0)
  })
})

describe('leadFrom', () => {
  it('starts on the flag edge facing the label', () => {
    expect(leadFrom([0, 0, 10], [50, -5, 90, 5])).toEqual([10, 0])
  })
})
