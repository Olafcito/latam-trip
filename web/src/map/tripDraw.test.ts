import { describe, expect, it } from 'vitest'
import { orientLine, stackLabel, stopPoints } from './tripDraw'

describe('orientLine', () => {
  const line: [number, number][] = [[0, 0], [1, 1], [2, 2]]
  it('keeps a line that starts at the leg origin', () => {
    expect(orientLine(line, [0, 0])).toEqual(line)
  })
  it('reverses a line drawn from the other end', () => {
    expect(orientLine(line, [2, 2])).toEqual([[2, 2], [1, 1], [0, 0]])
  })
  it('picks the nearer end when the origin is not exactly on the line', () => {
    expect(orientLine(line, [2.1, 1.9])[0]).toEqual([2, 2])
  })
})

describe('stackLabel', () => {
  it('shows one number alone', () => {
    expect(stackLabel(3, 3)).toBe('3')
  })
  it('joins a range with an ellipsis, never a dash', () => {
    expect(stackLabel(2, 5)).toBe('2…5')
    expect(stackLabel(2, 5)).not.toMatch(/[-–—]/)
  })
})

describe('stopPoints', () => {
  const at = (id: string): [number, number] | null => ({ a: [0, 0], b: [1, 1], c: [2, 2] } as Record<string, [number, number]>)[id] ?? null
  it('gives a place visited twice one point with both numbers and a first and last', () => {
    const pts = stopPoints(['a', 'b', 'a', 'c'], at)
    const a = pts.find((p) => p.properties.n === '1,3')!
    expect(a.properties.first).toBe(1)
    expect(a.properties.last).toBe(3)
    expect(pts.find((p) => p.properties.end)!.properties.n).toBe('4')
  })
  it('skips a stop the map has no place for', () => {
    expect(stopPoints(['a', 'x'], at)).toHaveLength(1)
  })
})
