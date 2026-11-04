import { describe, expect, it } from 'vitest'
import { legEnds, legState, offTrip, orientLine, showFan, stackLabel, stopPoints } from './tripDraw'

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

describe('the trip as the figure', () => {
  const stops = ['a', 'b', 'c', 'd']
  const legs = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd' }]
  it('lights the legs in and out of a selected stop and dims the rest', () => {
    expect(legs.map((l) => legState(l, 'b', stops))).toEqual(['lit', 'lit', 'dim'])
  })
  it('lights only the leg in of the last stop', () => {
    expect(legs.map((l) => legState(l, 'd', stops))).toEqual(['dim', 'dim', 'lit'])
  })
  it('draws every leg plain with no selection or a selection off the trip', () => {
    expect(legs.map((l) => legState(l, null, stops))).toEqual(['plain', 'plain', 'plain'])
    expect(legs.map((l) => legState(l, 'x', stops))).toEqual(['plain', 'plain', 'plain'])
  })
  it('names the stops a selected stop connects to along the trip', () => {
    expect(legEnds(legs, 'b').sort()).toEqual(['a', 'c'])
    expect(legEnds(legs, 'a')).toEqual(['b'])
    expect(legEnds(legs, 'x')).toEqual([])
  })
  it('quiets places off the open trip only', () => {
    const on = new Set(stops)
    expect(offTrip('x', on)).toBe(true)
    expect(offTrip('a', on)).toBe(false)
    expect(offTrip('x', null)).toBe(false)
  })
  it('keeps the fan of a stop off until it is asked for', () => {
    const on = new Set(stops)
    expect(showFan('b', on, false)).toBe(false)
    expect(showFan('b', on, true)).toBe(true)
    expect(showFan('x', on, false)).toBe(true)
    expect(showFan('b', null, false)).toBe(true)
    expect(showFan(null, on, true)).toBe(false)
  })
})
