import { describe, expect, it } from 'vitest'
import type { InOut, Ticket, Way } from '../data/types'
import { withTripWays, type TripRow } from './repoTrips'
import { kindOf, pairPrice, pickOfDay, rowFares, rowNotes, wayRowsByDay } from './wayRows'

const way = (over: Partial<Way>): Way => ({
  id: 'I1', direction: 'in', type: 'oneways', from: 'CPH', to: 'CTG', depart: '2026-12-03T06:00', arrive: '2026-12-03T14:30',
  total_hours: 14.5, flying_hours: 14.5, flights: 2, hub_nights: 0, changes: 0, us_transit: false, airports: ['CPH', 'CTG'],
  tickets: [], price_dkk: 0,
  extras: { cabin_bag_fees_dkk: 0, checked_bag_fees_dkk: 0, hub_nights: 0, hub_stay_estimate_dkk: 0 },
  score: 5, timeline: [], ...over,
})
const home = (over: Partial<Way>): Way => way({ direction: 'home', from: 'GUA', to: 'CPH', ...over })
const ticket = (id: string, price_dkk: number) => ({ id, price_dkk, cabin_bag_fee_dkk: 0, checked_bag_fee_dkk: 0 }) as unknown as Ticket

// as the build has them: a return ticket's ways carry price 0, the ticket carries the price
const tIn1202 = way({ id: 'I_t_1202', type: 'ticket', depart: '2026-12-02T07:00', tickets: ['TA'], shared_ticket: 'TA', paired_with: 'H_t_0205a' })
const tHome0205a = home({ id: 'H_t_0205a', type: 'ticket', depart: '2027-02-05T10:00', tickets: ['TA'], shared_ticket: 'TA', paired_with: 'I_t_1202' })
const tIn1203 = way({ id: 'I_t_1203', type: 'ticket', depart: '2026-12-03T07:00', tickets: ['TB'], shared_ticket: 'TB', paired_with: 'H_t_0205b' })
const tHome0205b = home({ id: 'H_t_0205b', type: 'ticket', depart: '2027-02-05T10:00', tickets: ['TB'], shared_ticket: 'TB', paired_with: 'I_t_1203' })
const tIn1203c = way({ id: 'I_t_1203c', type: 'ticket', depart: '2026-12-03T07:00', tickets: ['TC'], shared_ticket: 'TC', paired_with: 'H_t_0206c' })
const tHome0206c = home({ id: 'H_t_0206c', type: 'ticket', depart: '2027-02-06T10:00', tickets: ['TC'], shared_ticket: 'TC', paired_with: 'I_t_1203c' })
const oneIn1203 = way({ id: 'I_o_1203', depart: '2026-12-03T09:00', tickets: ['TO1'], price_dkk: 3900 })
const oneHome0205 = home({ id: 'H_o_0205', depart: '2027-02-05T12:00', tickets: ['TO2'], price_dkk: 3600 })

const inout = {
  generated_at: '', currency: 'DKK', home: ['CPH'], airports: {}, options: [],
  rating: { formula: '', price_anchor_dkk: 7000, price_basis: '', way_score: '' },
  tickets: { TA: ticket('TA', 8000), TB: ticket('TB', 7500), TC: ticket('TC', 7000), TO1: ticket('TO1', 3900), TO2: ticket('TO2', 3600) },
  ways: Object.fromEntries([tIn1202, tHome0205a, tIn1203, tHome0205b, tIn1203c, tHome0206c, oneIn1203, oneHome0205].map((w) => [w.id, w])),
} as InOut

// an open jaw ticket: in to the same city, but home from San Salvador and not Guatemala City, and cheaper
const jawIn = way({ id: 'I_jaw_1202', type: 'ticket', depart: '2026-12-02T07:00', tickets: ['TJ'], shared_ticket: 'TJ', paired_with: 'H_jaw_0205' })
const jawHome = home({ id: 'H_jaw_0205', type: 'ticket', from: 'SAL', depart: '2027-02-05T10:00', tickets: ['TJ'], shared_ticket: 'TJ', paired_with: 'I_jaw_1202' })
const withJaw = {
  ...inout, airports: { SAL: { name: 'San Salvador (Comalapa)' } },
  tickets: { ...inout.tickets, TJ: ticket('TJ', 6000) }, ways: { ...inout.ways, [jawIn.id]: jawIn, [jawHome.id]: jawHome },
} as unknown as InOut

describe('pricing a pair of ways', () => {
  it('counts a return ticket once', () => {
    expect(pairPrice(inout, tIn1202, tHome0205a)).toBe(8000)
  })
  it('adds two one ways', () => {
    expect(pairPrice(inout, oneIn1203, oneHome0205)).toBe(7500)
  })
  it('takes a way without a known ticket at its own price', () => {
    expect(pairPrice(inout, way({ id: 'x', tickets: ['nope'], price_dkk: 1000 }), oneHome0205)).toBe(4600)
  })
  it('has no price when nothing is known', () => {
    expect(pairPrice(inout, way({ id: 'x' }), home({ id: 'y' }))).toBeNull()
  })
})

describe('the rows of the way sheet', () => {
  const current = { wayIn: tIn1203, wayHome: tHome0205b }
  const rows = wayRowsByDay(inout, tIn1203, current)

  it('prices a ticket row by its ticket, not the way price of 0', () => {
    expect(rows['2026-12-02'][0].total).toBe(8000)
  })
  it('puts the same kind first, then the one that keeps the other day, then the cheapest', () => {
    // TC is cheaper but moves the way home to the 6th
    expect(rows['2026-12-03'].map((r) => r.way.id)).toEqual(['I_t_1203', 'I_t_1203c', 'I_o_1203'])
  })
  it('a one way row is priced with the one way it turns the other half into', () => {
    const o = rows['2026-12-03'].find((r) => r.way.id === 'I_o_1203')!
    expect(o.choice.wayHome.id).toBe('H_o_0205')
    expect(o.total).toBe(7500)
  })
  it('the fares of the day picker are the first row of each day', () => {
    expect(rowFares(rows)).toEqual({ '2026-12-02': 8000, '2026-12-03': 7500 })
  })
  it('a ticket without its other half saved changes nothing and goes last', () => {
    const lone = way({ id: 'I_t_lone', type: 'ticket', depart: '2026-12-03T05:00', tickets: ['TC'], paired_with: 'missing' })
    const io = { ...inout, ways: { ...inout.ways, [lone.id]: lone } }
    const list = wayRowsByDay(io, tIn1203, current)['2026-12-03']
    expect(list.at(-1)!.way.id).toBe('I_t_lone')
    expect(list.at(-1)!.works).toBe(false)
  })
  it('finds the ways of a saved trip whose own ways are not built, and keeps its own way', () => {
    const rowWay = ({ id: _, ...rest }: Way) => rest as unknown as TripRow['way_in']
    const io = withTripWays(inout, [{
      id: 'trip', version: 1, name: 'trip', saved_at: '2026-10-29T10:00:00Z', by: 'planner', why: '',
      way_in: rowWay({ ...tIn1203, depart: '2026-12-03T06:30', tickets: ['TBOOK'] }), way_home: rowWay({ ...tHome0205b, tickets: ['TBOOK'] }),
      tickets: { TBOOK: { id: 'TBOOK', price_dkk: 8946 } },
      places: [{ node: 'CTG', hop: null }],
    }])
    const own = { wayIn: io.ways['trip:in'], wayHome: io.ways['trip:home'] }
    const byDay = wayRowsByDay(io, own.wayIn, own)
    expect(Object.keys(byDay).sort()).toEqual(['2026-12-02', '2026-12-03'])
    const mine = byDay['2026-12-03'].find((r) => r.way.id === 'trip:in')!
    expect([mine.works, mine.total, mine.choice.note]).toEqual([true, 8946, null])
  })
})

describe('a ticket that moves the end of the trip to another city', () => {
  const current = { wayIn: tIn1203, wayHome: tHome0205b }
  const day = wayRowsByDay(withJaw, tIn1203, current)['2026-12-02']

  it('ranks below a ticket that keeps the city, even when it is cheaper', () => {
    expect(day.map((r) => r.way.id)).toEqual(['I_t_1202', 'I_jaw_1202'])
    expect(day.map((r) => r.keepsCity)).toEqual([true, false])
  })
  it('a tap on the day takes the way that keeps the city', () => {
    expect(pickOfDay(day)?.way.id).toBe('I_t_1202')
  })
  it('the line under it names the city the way home then leaves from', () => {
    const r = day.find((x) => x.way.id === 'I_jaw_1202')!
    expect(rowNotes(withJaw, r, 'in', tHome0205b, (c) => (c === 'SAL' ? 'San Salvador' : c))[0])
      .toEqual({ text: 'Way home leaves from San Salvador, Fri 5 Feb at 10:00', strong: true })
  })
  it('its note names the city and the stop it adds', () => {
    expect(day.find((x) => x.way.id === 'I_jaw_1202')!.choice.note)
      .toBe('One ticket. The way home then leaves from San Salvador on Fri 5 Feb, and San Salvador is added as the last stop')
  })
})


describe('the lines under a row', () => {
  const current = { wayIn: tIn1203, wayHome: tHome0205b }
  const rows = wayRowsByDay(inout, tIn1203, current)
  const first = (day: string, id: string) => rowNotes(inout, rows[day].find((r) => r.way.id === id)!, 'in', tHome0205b, (c) => c)[0]

  it('says the way home stays when it keeps its day and time', () => {
    expect(first('2026-12-02', 'I_t_1202')).toEqual({ text: 'Way home still Fri 5 Feb at 10:00', strong: false })
  })
  it('says the way home moves, in bold, when it goes to another day', () => {
    expect(first('2026-12-03', 'I_t_1203c')).toEqual({ text: 'Way home moves to Sat 6 Feb at 10:00', strong: true })
  })
  it('says the way home becomes a one way, with its new time on the same day', () => {
    expect(first('2026-12-03', 'I_o_1203')).toEqual({ text: 'Way home still Fri 5 Feb, now at 12:00, as a one way', strong: false })
  })
  it('the way the trip has says nothing about the other direction', () => {
    expect(rowNotes(inout, rows['2026-12-03'].find((r) => r.way.id === 'I_t_1203')!, 'in', tHome0205b, (c) => c).map((n) => n.text))
      .toEqual(['Cabin bag included, checked bag included'])
  })
  it('a row that changes nothing carries the reason, marked bad', () => {
    const lone = way({ id: 'I_t_lone', type: 'ticket', depart: '2026-12-03T05:00', tickets: ['TC'], paired_with: 'missing' })
    const io = { ...inout, ways: { ...inout.ways, [lone.id]: lone } }
    const r = wayRowsByDay(io, tIn1203, current)['2026-12-03'].find((x) => x.way.id === 'I_t_lone')!
    expect(rowNotes(io, r, 'in', tHome0205b, (c) => c)[0].bad).toBe(true)
  })
  it('names the kind of ticket', () => {
    const kind = (way: Way) => kindOf(inout, { way, keepsCity: true })
    expect([kind(tIn1203), kind(oneIn1203), kind(way({ type: 'madrid' })), kind(way({ tickets: ['a', 'b'] }))])
      .toEqual(['Return ticket', 'One way', 'Via Madrid, 2 tickets', '2 one way tickets'])
  })
  it('calls a ticket that moves the other end to another city an open jaw ticket', () => {
    const rows = wayRowsByDay(withJaw, tIn1203, { wayIn: tIn1203, wayHome: tHome0205b })['2026-12-02']
    expect(rows.map((r) => kindOf(withJaw, r))).toEqual(['Return ticket', 'Open jaw ticket'])
  })
  it('calls a ticket without its other half a ticket', () => {
    const kind = (paired_with?: string) => kindOf(inout, { way: way({ type: 'ticket', paired_with }), keepsCity: true })
    expect([kind(), kind('missing')]).toEqual(['Ticket', 'Ticket'])
  })
})
