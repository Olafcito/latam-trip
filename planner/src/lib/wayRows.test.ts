import { describe, expect, it } from 'vitest'
import type { InOut, Ticket, Way } from '../data/types'
import { withTripWays, type TripRow } from './repoTrips'
import { kindOf, otherMark, pairPrice, pickOfDay, rowFares, wayMarks, wayRowsByDay, wayStops } from './wayRows'

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
  it('its chip carries the city the way home then leaves from, and the sentence is its tooltip', () => {
    const r = day.find((x) => x.way.id === 'I_jaw_1202')!
    expect(otherMark(r, 'in', tHome0205b, (c) => (c === 'SAL' ? 'San Salvador' : c)))
      .toEqual({ kind: 'home', text: 'SAL Fri 5 Feb', label: 'Way home leaves from San Salvador, Fri 5 Feb at 10:00', tone: 'strong' })
  })
  it('its note names the city and the stop it adds', () => {
    expect(day.find((x) => x.way.id === 'I_jaw_1202')!.choice.note)
      .toBe('One ticket. The way home then leaves from San Salvador on Fri 5 Feb, and San Salvador is added as the last stop')
  })
})


describe('the marks of a row', () => {
  const current = { wayIn: tIn1203, wayHome: tHome0205b }
  const rows = wayRowsByDay(inout, tIn1203, current)
  const row = (day: string, id: string) => rows[day].find((r) => r.way.id === id)!
  const home = (day: string, id: string) => otherMark(row(day, id), 'in', tHome0205b, (c) => c)

  it('shows no chip for the way home when it keeps its day and time', () => {
    expect(home('2026-12-02', 'I_t_1202')).toBeNull()
  })
  it('a moved way home shows its new day and time as a strong chip on the row', () => {
    expect(home('2026-12-03', 'I_t_1203c')).toEqual({ kind: 'home', text: 'Sat 6 Feb 10:00', label: 'Way home moves to Sat 6 Feb at 10:00', tone: 'strong' })
  })
  it('a way home on the same day at a new time shows only the time', () => {
    expect(home('2026-12-03', 'I_o_1203')).toEqual({ kind: 'home', text: '12:00', label: 'Way home still Fri 5 Feb, now at 12:00, as a one way' })
  })
  it('the way the trip has shows nothing about the other direction', () => {
    expect(home('2026-12-03', 'I_t_1203')).toBeNull()
  })
  it('a row that changes nothing greys out its Pick with the reason', () => {
    const lone = way({ id: 'I_t_lone', type: 'ticket', depart: '2026-12-03T05:00', tickets: ['TC'], paired_with: 'missing' })
    const io = { ...inout, ways: { ...inout.ways, [lone.id]: lone } }
    const r = wayRowsByDay(io, tIn1203, current)['2026-12-03'].find((x) => x.way.id === 'I_t_lone')!
    const m = wayMarks(io, r, 'in', tHome0205b, (c) => c)
    expect([m.dead, m.badges.some((b) => b.kind === 'home')]).toEqual(['This ticket has no way home saved, so nothing changed', false])
  })

  describe('the bags of its tickets', () => {
    const bagsOf = (fees: { cabin_bag_fee_dkk?: number | null; checked_bag_fee_dkk?: number | null } | null) => {
      const io = fees ? { ...inout, tickets: { ...inout.tickets, TB: { ...inout.tickets.TB, ...fees } } } : inout
      const w = fees ? tIn1203 : way({ id: 'I_none' })
      const r = { ...row('2026-12-03', 'I_t_1203'), way: w }
      return wayMarks(io, r, 'in', tHome0205b, (c) => c).badges.filter((b) => b.kind === 'cabin' || b.kind === 'checked')
    }
    it('shows no bags when no ticket is known', () => {
      expect(bagsOf(null)).toEqual([])
    })
    it('shows no bag whose fee is not known', () => {
      expect(bagsOf({ cabin_bag_fee_dkk: null, checked_bag_fee_dkk: null })).toEqual([])
    })
    it('shows the cabin bag alone, green, when only it is known and included', () => {
      expect(bagsOf({ cabin_bag_fee_dkk: 0, checked_bag_fee_dkk: null })).toEqual([{ kind: 'cabin', label: 'Cabin bag included', tone: 'ok' }])
    })
    it('shows a checked bag at a price with the price beside it', () => {
      expect(bagsOf({ cabin_bag_fee_dkk: 0, checked_bag_fee_dkk: 1120 })).toEqual([
        { kind: 'cabin', label: 'Cabin bag included', tone: 'ok' },
        { kind: 'checked', label: 'Checked bag 1.120 kr', text: '1.120 kr', tone: 'part' },
      ])
    })
  })

  it('puts the moon on a night arrival and leaves the morning departure alone', () => {
    const r = { ...row('2026-12-03', 'I_t_1203'), way: way({ depart: '2026-12-03T06:00', arrive: '2026-12-03T23:15' }) }
    const m = wayMarks(inout, r, 'in', tHome0205b, (c) => c)
    expect([m.leaves, m.lands]).toEqual([null, { kind: 'moon', label: 'Lands at night, 23:15' }])
  })

  it('marks a night, a long wait and a self transfer on the stop where each falls', () => {
    const w = way({
      timeline: [
        { kind: 'flight', from: 'CPH', to: 'MAD', depart: '', arrive: '', hours: 3, connections: [], carriers: [], overnight_layover: false, self_transfer_inside: false, ticket: 'T' },
        { kind: 'night', airport: 'MAD', arrive: '', depart: '', hours: 20, nights: 1, same_ticket: false, stay_estimate_dkk: 450 },
        { kind: 'flight', from: 'MAD', to: 'BOG', depart: '', arrive: '', hours: 11, connections: [{ airport: 'LIS', layover_h: 5.5 }, { airport: 'OPO', layover_h: 1 }], carriers: [], overnight_layover: false, self_transfer_inside: false, ticket: 'T' },
        { kind: 'self_transfer', airport: 'BOG', arrive: '', depart: '', hours: 3, nights: 0, same_ticket: false, stay_estimate_dkk: 0 },
      ],
    } as unknown as Partial<Way>)
    const name = (c: string) => ({ MAD: 'Madrid', LIS: 'Lisbon', BOG: 'Bogota' })[c] ?? c
    expect(wayStops(w, name)).toEqual([
      { code: 'MAD', text: '1 night', mark: { kind: 'night', label: '1 night in Madrid, stay about 450 kr' } },
      { code: 'LIS', text: '5h 30m', mark: { kind: 'wait', label: 'Long wait in Lisbon, 5h 30m', tone: 'part' } },
      { code: 'OPO', text: '1h', mark: null },
      { code: 'BOG', text: '3h', mark: { kind: 'self', label: 'Self transfer in Bogota, you check in again', tone: 'part' } },
    ])
  })

  it('marks a way through the United States', () => {
    const r = { ...row('2026-12-03', 'I_t_1203'), way: way({ us_transit: true }) }
    expect(wayMarks(inout, r, 'in', tHome0205b, (c) => c).badges).toEqual([{ kind: 'esta', label: 'Through the United States, ESTA needed', text: 'ESTA' }])
  })

})

describe('the kind of ticket', () => {
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
