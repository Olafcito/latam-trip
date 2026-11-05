import { describe, expect, it } from 'vitest'
import type { ScheduledPlace } from './journey'
import { canStep, choiceNights, chooseRoom, freeNights, nightsFrom, pickDates, removePart, stepNights } from './stayEdit'
import type { PlannedStay } from './stays'

// Made up places and rooms only.

/** a stop of 6 nights from 10 Dec, out on the 16th */
const sp: ScheduledPlace = { node: 'B', arrive: '2026-12-10T14:00', depart: '2026-12-16T09:00', days: 6, inDay: '2026-12-10', outDay: '2026-12-16', exact: true } as ScheduledPlace
const a = (nights?: number): PlannedStay => ({ lodging_id: 'TEST01', room_id: 'dorm', ...(nights == null ? {} : { nights }) })
const b = (nights?: number): PlannedStay => ({ lodging_id: 'TEST02', room_id: 'double', ...(nights == null ? {} : { nights }) })

describe('choosing a room', () => {
  it('takes the whole stop when nothing is planned, as a part that follows the stop', () => {
    expect(chooseRoom([], sp, 'TEST01', 'dorm')).toEqual([a()])
  })

  it('takes the free nights when a part is planned with nights of its own', () => {
    expect(chooseRoom([a(4)], sp, 'TEST02', 'double')).toEqual([a(4), b()])
  })

  it('the same room as the last part makes that part take the rest', () => {
    expect(chooseRoom([b(2), a(2)], sp, 'TEST01', 'dorm')).toEqual([b(2), a()])
  })

  it('with no night free it changes the room of the place, or swaps the last part and keeps its nights', () => {
    expect(chooseRoom([a()], sp, 'TEST01', 'private')).toEqual([{ lodging_id: 'TEST01', room_id: 'private' }])
    expect(chooseRoom([a(2), b()], sp, 'TEST03', 'bed')).toEqual([a(2), { lodging_id: 'TEST03', room_id: 'bed' }])
    expect(chooseRoom([a(2), b()], sp, 'TEST01', 'private')).toEqual([{ lodging_id: 'TEST01', room_id: 'private', nights: 2 }, b()])
  })

  it('prices a place for the nights a choice of it would take', () => {
    expect(choiceNights([], sp, 'TEST01')).toEqual({ first: '2026-12-10', nights: 6 })
    expect(choiceNights([a(4)], sp, 'TEST02')).toEqual({ first: '2026-12-14', nights: 2 })
    expect(choiceNights([a(4), b()], sp, 'TEST02')).toEqual({ first: '2026-12-14', nights: 2 })
    expect(choiceNights([a(4), b()], sp, 'TEST03')).toEqual({ first: '2026-12-14', nights: 2 })
  })
})

describe('nights of a part', () => {
  it('a night less on the last part leaves a free night that shows', () => {
    const s = stepNights([a()], sp, 0, -1)
    expect(s).toEqual([a(5)])
    expect(freeNights(s, sp)).toEqual({ first: '2026-12-15', nights: 1 })
  })

  it('the last part given every night left follows the stop again', () => {
    expect(stepNights([a(5)], sp, 0, 1)).toEqual([a()])
    expect(stepNights([a(3)], sp, 0, 1)).toEqual([a(4)])
  })

  it('a night more comes from the part after when nothing is free', () => {
    expect(stepNights([a(2), b()], sp, 0, 1)).toEqual([a(3), b()])
    expect(stepNights([a(2), b(4)], sp, 0, 1)).toEqual([a(3), b(3)])
  })

  it('a night less goes to the part after when it follows the stop', () => {
    const s = stepNights([a(3), b()], sp, 0, -1)
    expect(s).toEqual([a(2), b()])
    expect(freeNights(s, sp).nights).toBe(0)
  })

  it('keeps at least 1 night and takes none that is not there', () => {
    expect(stepNights([a(1), b()], sp, 0, -1)).toEqual([a(1), b()])
    expect(stepNights([a(5), b(1)], sp, 0, 1)).toEqual([a(5), b(1)])
    expect(stepNights([a()], sp, 0, 1)).toEqual([a()])
    expect(canStep([a(5), b(1)], sp, 0)).toEqual({ more: false, less: true })
    expect(canStep([a(1), b()], sp, 0)).toEqual({ more: true, less: false })
  })

  it('a part taken out leaves the others as they are', () => {
    expect(removePart([a(2), b()], 0)).toEqual([b()])
    expect(removePart([a(2), b()], 1)).toEqual([a(2)])
    expect(freeNights(removePart([a(2), b()], 1), sp).nights).toBe(4)
  })
})

describe('pickDates', () => {
  const was = { checkIn: '2026-12-03', checkOut: '2026-12-06' }
  it('takes dates in order as they are', () => {
    expect(pickDates(was, '2026-12-04', '2026-12-06')).toEqual({ checkIn: '2026-12-04', checkOut: '2026-12-06' })
    expect(pickDates(was, '2026-12-03', '2026-12-09')).toEqual({ checkIn: '2026-12-03', checkOut: '2026-12-09' })
  })
  it('moves the check-out along with a check-in onto or past it and keeps the nights', () => {
    expect(pickDates(was, '2026-12-08', '2026-12-06')).toEqual({ checkIn: '2026-12-08', checkOut: '2026-12-11' })
    expect(pickDates(was, '2026-12-06', '2026-12-06')).toEqual({ checkIn: '2026-12-06', checkOut: '2026-12-09' })
  })
  it('makes a check-out on or before the check-in the day after it', () => {
    expect(pickDates(was, '2026-12-03', '2026-12-02')).toEqual({ checkIn: '2026-12-03', checkOut: '2026-12-04' })
  })
  it('counts the nights between two days, at least 1', () => {
    expect(nightsFrom('2026-12-03', '2026-12-06')).toBe(3)
    expect(nightsFrom('2026-12-03', '2026-12-03')).toBe(1)
  })
})
