import { describe, expect, it } from 'vitest'
import type { Airport, FlightItem, StopItem, Way } from '../data/types'
import { nights, wayAxis, wayTrack, wayTrackLabel } from './waytrack'

const fl = (over: Partial<FlightItem>): FlightItem => ({
  kind: 'flight', from: 'CPH', to: 'MAD', depart: '2026-12-02T06:10', arrive: '2026-12-02T09:35', hours: 3.42,
  connections: [], carriers: [], overnight_layover: false, self_transfer_inside: false, ticket: 'T1', ...over,
})
const stop = (over: Partial<StopItem>): StopItem => ({
  kind: 'night', airport: 'MAD', arrive: '2026-12-02T09:35', depart: '2026-12-03T08:10', hours: 22.58,
  nights: 1, same_ticket: false, stay_estimate_dkk: 450, ...over,
})

const way: Way = {
  id: 'I1', direction: 'in', type: 'oneways', from: 'CPH', to: 'SAL', depart: '2026-12-02T06:10', arrive: '2026-12-03T21:45',
  total_hours: 46.6, flying_hours: 17, flights: 3, hub_nights: 1, changes: 2, us_transit: false, airports: [], tickets: [],
  price_dkk: 0, extras: { cabin_bag_fees_dkk: 0, checked_bag_fees_dkk: 0, hub_nights: 1, hub_stay_estimate_dkk: 450 },
  score: 5,
  timeline: [
    fl({}),
    stop({}),
    fl({ from: 'MAD', to: 'SAL', depart: '2026-12-03T08:10', arrive: '2026-12-03T21:45', hours: 20.58, connections: [{ airport: 'BOG', layover_h: 7.17 }] }),
  ],
}

const ap = (name: string): Airport => ({ name, country: '', lat: 0, lon: 0, region: null, utc_offset: 0, home: false })
const airports = { CPH: ap('Copenhagen'), MAD: ap('Madrid'), SAL: ap('San Salvador'), BOG: ap('Bogotá') }

describe('wayTrack', () => {
  it('runs from the first take-off to the last landing, a wait between every two flights', () => {
    const t = wayTrack(way)
    expect(t.start).toEqual({ code: 'CPH', time: '2026-12-02T06:10' })
    expect(t.end).toEqual({ code: 'SAL', time: '2026-12-03T21:45' })
    expect(t.parts.map((p) => (p.kind === 'fly' ? 'fly' : `${p.type} ${p.code}`))).toEqual(['fly', 'night MAD', 'fly', 'layover BOG', 'fly'])
  })

  it('keeps a stop between tickets with its own times, a change inside a ticket has none', () => {
    const [, night, , change] = wayTrack(way).parts
    expect(night).toMatchObject({ kind: 'wait', arrive: '2026-12-02T09:35', depart: '2026-12-03T08:10', nights: 1, stay: 450 })
    expect(change).toMatchObject({ kind: 'wait', hours: 7.17, arrive: null, depart: null })
  })

  it('splits a flight with a change evenly around it and marks those lengths as rough', () => {
    const flies = wayTrack(way).parts.filter((p) => p.kind === 'fly')
    expect(flies[0]).toEqual({ kind: 'fly', hours: 3.42, approx: false })
    expect(flies[1].hours).toBeCloseTo((20.58 - 7.17) / 2)
    expect(flies.slice(1).every((f) => f.kind === 'fly' && f.approx)).toBe(true)
  })
})

describe('wayTrackLabel', () => {
  it('reads the way once, with the airport names and the local times', () => {
    expect(wayTrackLabel(way, airports)).toBe(
      'Copenhagen 06:10 2 Dec to Madrid 09:35, night in Madrid, Madrid 08:10 3 Dec to San Salvador 21:45, changing in Bogotá',
    )
  })

  it('says the day of a landing after midnight and falls back to codes', () => {
    const w = { ...way, timeline: [fl({ arrive: '2026-12-03T01:20' }), stop({ kind: 'connection', hours: 1.17 })] }
    expect(wayTrackLabel(w)).toBe('CPH 06:10 2 Dec to MAD 01:20 3 Dec, change in MAD, 1h 10m')
    expect(nights(2)).toBe('2 nights')
  })
})

describe('wayAxis', () => {
  it('lays the parts end to end by their hours from the take-off', () => {
    const a = wayAxis(wayTrack(way))
    expect(a.parts.map((p) => p.part.kind)).toEqual(['fly', 'wait', 'fly', 'wait', 'fly'])
    expect(a.parts[0].start).toBe(0)
    expect(a.parts[1].start).toBeCloseTo(3.42)
    expect(a.parts[2].start).toBeCloseTo(3.42 + 22.58)
    // the second ticket splits its 20.58 hours: 7.17 waiting in Bogotá, the rest in the air in two halves
    expect(a.parts[3].hours).toBeCloseTo(7.17)
    expect(a.total).toBeCloseTo(3.42 + 22.58 + 20.58)
    for (let i = 1; i < a.parts.length; i++) expect(a.parts[i].start).toBeCloseTo(a.parts[i - 1].start + a.parts[i - 1].hours)
  })

  it('marks the ruler every 12 hours on a two day way, and keeps the last tick off the landing', () => {
    expect(wayAxis(wayTrack(way)).ticks).toEqual([12, 24, 36])
    const short = wayAxis(wayTrack({ ...way, timeline: [fl({ hours: 13 })] }))
    expect(short.ticks).toEqual([6])
  })

  it('gives a change with no hours in the data one hour', () => {
    const w = { ...way, timeline: [fl({ hours: 10, connections: [{ airport: 'BOG', layover_h: null }] })] }
    const a = wayAxis(wayTrack(w as Way))
    expect(a.parts[1].hours).toBe(1)
  })

  it('draws the parts to scale on the line, with a floor for short ones', () => {
    const a = wayAxis(wayTrack(way))
    expect(a.parts.reduce((s, p) => s + p.width, 0)).toBeCloseTo(1)
    expect(a.parts[0].left).toBe(0)
    for (const p of a.parts) expect(p.width).toBeGreaterThan(0.08)
    // the night in Bogotá is the longest part and stays the widest
    expect(Math.max(...a.parts.map((p) => p.width))).toBe(a.parts[1].width)
    // the ruler follows the parts: the start, a part's start and the landing land on its edges
    expect(a.x(0)).toBe(0)
    expect(a.x(a.parts[2].start)).toBeCloseTo(a.parts[2].left)
    expect(a.x(a.total)).toBeCloseTo(1)
  })
})
