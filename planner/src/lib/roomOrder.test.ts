import { describe, expect, it } from 'vitest'
import { cheapestFirst } from './roomOrder'

// Made up rooms only.
type Room = { id: string; dkk: number | null }
const room = (id: string, dkk: number | null): Room => ({ id, dkk })
const price = (r: Room) => r.dkk

describe('cheapestFirst', () => {
  it('sorts the priced rooms from the lowest price up', () => {
    const rooms = [room('a', 900), room('b', 300), room('c', 600)]
    expect(cheapestFirst(rooms, price).map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })

  it('puts the rooms with no price after all the priced ones', () => {
    const rooms = [room('a', null), room('b', 500), room('c', null), room('d', 200)]
    expect(cheapestFirst(rooms, price).map((r) => r.id)).toEqual(['d', 'b', 'a', 'c'])
  })

  it('keeps the order of rooms with the same price', () => {
    const rooms = [room('a', 400), room('b', 200), room('c', 400), room('d', 200)]
    expect(cheapestFirst(rooms, price).map((r) => r.id)).toEqual(['b', 'd', 'a', 'c'])
  })

  it('keeps the order of the unpriced rooms', () => {
    const rooms = [room('a', null), room('b', null), room('c', 100)]
    expect(cheapestFirst(rooms, price).map((r) => r.id)).toEqual(['c', 'a', 'b'])
  })

  it('does not change the input array', () => {
    const rooms = [room('a', 900), room('b', null), room('c', 300)]
    const before = [...rooms]
    const sorted = cheapestFirst(rooms, price)
    expect(rooms).toEqual(before)
    expect(rooms.map((r) => r.id)).toEqual(['a', 'b', 'c'])
    expect(sorted).not.toBe(rooms)
  })

  it('returns an empty list for no rooms', () => {
    expect(cheapestFirst([] as Room[], price)).toEqual([])
  })
})
