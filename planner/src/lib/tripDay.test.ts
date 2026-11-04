import { describe, expect, it } from 'vitest'
import { dayValue, tripDay, type DayInput } from './tripDay'

// Made up legs and stays only. A real reference, price or name never goes in this file.
const input: DayInput = {
  legs: [
    { key: 'in', fam: 'flight', from: 'Copenhagen', to: 'Cartagena', depart: '2026-12-02T06:00', arrive: '2026-12-02T19:40', booked: true },
    { key: 'h1', fam: 'flight', from: 'Cartagena', to: 'San Andrés', depart: '2026-12-05T06:00', arrive: '2026-12-05T07:35', booked: true },
    { key: 'h2', fam: 'ground', from: 'San Andrés', to: 'Test Town', depart: '2026-12-08', arrive: null, booked: false },
    { key: 'h3', fam: 'boat', from: 'Test Town', to: 'Test Bay', depart: '2026-12-10T22:00', arrive: '2026-12-11T06:30', booked: false },
  ],
  stops: [
    { name: 'Cartagena', inDay: '2026-12-02', outDay: '2026-12-05', stay: { name: 'Test Hostel', booked: true } },
    { name: 'San Andrés', inDay: '2026-12-05', outDay: '2026-12-08' },
    { name: 'Test Town', inDay: '2026-12-08', outDay: '2026-12-08' },
  ],
  others: [{ title: 'Test Tour', at: '2026-12-06T09:30' }],
}

describe('tripDay', () => {
  it('puts the check out first, then the flight by its time, the check in and the night last', () => {
    const items = tripDay(input, '2026-12-05')
    expect(items.map((x) => [x.kind, x.title, x.tag ?? null])).toEqual([
      ['out', 'Test Hostel', 'Check out'],
      ['flight', 'Cartagena to San Andrés', null],
      ['in', 'San Andrés', 'Check in'],
      ['night', 'San Andrés', null],
    ])
    expect(items[1]).toMatchObject({ time: '06:00', until: '07:35', mark: '', booked: true, leg: 'h1' })
    expect(items[0].booked).toBe(true)
    expect(items[2].booked).toBe(false)
  })

  it('names the booked stay for the night, else the place', () => {
    expect(tripDay(input, '2026-12-03')).toEqual([{ kind: 'night', key: 'night-Cartagena', time: null, title: 'Test Hostel', detail: 'Cartagena', booked: true }])
    expect(tripDay(input, '2026-12-06').map((x) => x.kind)).toEqual(['other', 'night'])
  })

  it('shows a booked activity with its time', () => {
    expect(tripDay(input, '2026-12-06')[0]).toMatchObject({ kind: 'other', title: 'Test Tour', time: '09:30', booked: true })
  })

  it('keeps a stop passed through without a check in, out or night', () => {
    const items = tripDay(input, '2026-12-08')
    expect(items.map((x) => x.kind)).toEqual(['out', 'ground'])
    expect(items[1]).toMatchObject({ time: null, until: null })
  })

  it('marks a leg that lands on a later day, and lists it as landing on that day', () => {
    expect(tripDay(input, '2026-12-10')[0]).toMatchObject({ kind: 'boat', time: '22:00', until: '06:30', mark: '+1' })
    expect(tripDay(input, '2026-12-11')[0]).toMatchObject({ kind: 'boat', time: '06:30', tag: 'Lands', leg: 'h3' })
  })

  it('is empty on a day with nothing', () => {
    expect(tripDay(input, '2027-03-01')).toEqual([])
  })
})

describe('dayValue', () => {
  const fares = { '2026-12-04': 1450, '2026-12-05': 980, '2026-12-06': 12345 }

  it('shows the cheapest fare of a day on a leg that is not booked, the lowest marked', () => {
    const o = { fares, booked: null }
    expect(dayValue('2026-12-05', o)).toEqual({ kind: 'fare', price: 980, low: true })
    expect(dayValue('2026-12-06', o)).toEqual({ kind: 'fare', price: 12345, low: false })
    expect(dayValue('2026-12-07', o)).toEqual({ kind: 'none' })
  })

  it('shows a check on the booked day and never a price, whatever fare it has', () => {
    const o = { fares, booked: '2026-12-05' }
    expect(dayValue('2026-12-05', o)).toEqual({ kind: 'booked' })
    expect(dayValue('2026-12-04', o)).toEqual({ kind: 'fare', price: 1450, low: false })
  })
})
