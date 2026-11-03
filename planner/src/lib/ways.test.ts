import { describe, expect, it } from 'vitest'
import type { InOut, MapData, MapEdge, Option, Way } from '../data/types'
import type { Journey } from './journey'
import { mixWays } from './options'
import { withTripWays, type TripRow } from './repoTrips'
import { chooseWay, dayOf, waysOn, withEnds } from './ways'

const way = (over: Partial<Way>): Way => ({
  id: 'I1', direction: 'in', type: 'oneways', from: 'CPH', to: 'CTG', depart: '2026-12-03T06:00', arrive: '2026-12-03T14:30',
  total_hours: 14.5, flying_hours: 14.5, flights: 2, hub_nights: 0, changes: 0, us_transit: false, airports: ['CPH', 'CTG'],
  tickets: [], price_dkk: 0,
  extras: { cabin_bag_fees_dkk: 0, checked_bag_fees_dkk: 0, hub_nights: 0, hub_stay_estimate_dkk: 0 },
  score: 5, timeline: [], ...over,
})
const home = (over: Partial<Way>): Way => way({ direction: 'home', from: 'GUA', to: 'CPH', ...over })

const inoutOf = (ways: Way[]): InOut => ({
  generated_at: '', currency: 'DKK', home: ['CPH'],
  rating: { formula: '', price_anchor_dkk: 7000, price_basis: '', way_score: '' },
  airports: {}, tickets: {}, options: [],
  ways: Object.fromEntries(ways.map((w) => [w.id, w])),
})

// ways in
const ticketIn1202 = way({ id: 'I_ticket_1202', type: 'ticket', depart: '2026-12-02T07:00', price_dkk: 8235, paired_with: 'H_ticket_0203' })
const oneIn1202 = way({ id: 'I_oneway_1202', depart: '2026-12-02T09:00', price_dkk: 4000 })
const ticketIn = way({ id: 'I_ticket_1203', type: 'ticket', depart: '2026-12-03T07:00', price_dkk: 7500, paired_with: 'H_ticket_0205' })
const oneIn = way({ id: 'I_oneway_1203', depart: '2026-12-03T09:00', price_dkk: 3900 })
// ways home
const ticketHome0203 = home({ id: 'H_ticket_0203', type: 'ticket', depart: '2027-02-03T10:00', paired_with: 'I_ticket_1202' })
const ticketHome = home({ id: 'H_ticket_0205', type: 'ticket', depart: '2027-02-05T10:00', paired_with: 'I_ticket_1203' })
const oneHome = home({ id: 'H_oneway_0205', depart: '2027-02-05T12:00', price_dkk: 3600 })
const oneHomeDear = home({ id: 'H_oneway_0205_dear', depart: '2027-02-05T18:00', price_dkk: 5200 })
const oneHome0204 = home({ id: 'H_oneway_0204', depart: '2027-02-04T12:00', price_dkk: 2500 })
// a way between other cities that must never show up
const otherCity = way({ id: 'I_oneway_1202_BOG', to: 'BOG', depart: '2026-12-02T08:00', price_dkk: 100 })

const inout = inoutOf([ticketIn1202, oneIn1202, ticketIn, oneIn, ticketHome0203, ticketHome, oneHome, oneHomeDear, oneHome0204, otherCity])

// a saved trip's own ways, as withTripWays makes them from its row. A row way is a built way without its id
const rowWay = ({ id: _, ...rest }: Way) => rest as unknown as TripRow['way_in']
const tripWays = (id: string, wayIn: Way, wayHome: Way) => withTripWays(inoutOf([]), [{
  id, version: 1, name: id, saved_at: '2026-10-29T10:00:00Z', by: 'planner', why: '',
  way_in: rowWay(wayIn), way_home: rowWay(wayHome), places: [{ node: 'CTG', hop: null }],
}]).ways
const t1 = tripWays('t1', way({ type: 'ticket', depart: '2026-12-03T06:30', price_dkk: 7000, paired_with: 'H_ticket_0205' }), home({ type: 'ticket', depart: '2027-02-05T09:00' }))
// not in the built ways
const tripOwnIn = t1['t1:in']
const tripOwnHome = t1['t1:home']

describe('ways by day', () => {
  it('lists ways by day with the same kind first', () => {
    expect(waysOn(inout, ticketIn)['2026-12-02'].map((w) => w.id)).toEqual(['I_ticket_1202', 'I_oneway_1202'])
  })
  it('lists a one way first when the way looked at is a one way', () => {
    expect(waysOn(inout, oneIn)['2026-12-02'].map((w) => w.id)).toEqual(['I_oneway_1202', 'I_ticket_1202'])
  })
  it('keeps a trip way that is not in the built ways', () => {
    expect(waysOn(inout, tripOwnIn)['2026-12-03'][0].id).toBe('t1:in')
  })
  it('leaves out a built way that is the same flight as the trip way', () => {
    const io = { ...inout, ways: { ...inout.ways, ...tripWays('t3', ticketIn, ticketHome) } }
    expect(waysOn(io, io.ways['t3:in'])['2026-12-03'].map((w) => w.id)).toEqual(['t3:in', 'I_oneway_1203'])
  })
  it('leaves out the own ways of other trips', () => {
    const withOther = inoutOf([...Object.values(inout.ways), way({ id: 't2:in', depart: '2026-12-03T05:00', price_dkk: 1 })])
    expect(waysOn(withOther, oneIn)['2026-12-03'].map((w) => w.id)).toEqual(['I_oneway_1203', 'I_ticket_1203'])
  })
  describe('tickets as the build has them, at price 0 with the price on the ticket', () => {
    // two return tickets on the same flight in, home on different days
    const tA = way({ id: 'I_t_A', type: 'ticket', depart: '2026-12-03T06:00', paired_with: 'H_t_A' })
    const tAHome = home({ id: 'H_t_A', type: 'ticket', depart: '2027-02-02T13:00', paired_with: 'I_t_A' })
    const tB = way({ id: 'I_t_B', type: 'ticket', depart: '2026-12-03T06:00', paired_with: 'H_t_B' })
    const tBHome = home({ id: 'H_t_B', type: 'ticket', depart: '2027-02-03T16:00', paired_with: 'I_t_B' })
    const built = inoutOf([tA, tAHome, tB, tBHome])

    it('keeps every ticket with the same times when the way looked at is a built way', () => {
      expect(waysOn(built, tA)['2026-12-03'].map((w) => w.id)).toEqual(['I_t_A', 'I_t_B'])
    })
    it('leaves out only the copy of a saved trip way, not the tickets home on other days', () => {
      const io = { ...built, ways: { ...built.ways, ...tripWays('t4', tA, tAHome) } }
      expect(waysOn(io, io.ways['t4:in'])['2026-12-03'].map((w) => w.id).sort()).toEqual(['I_t_B', 't4:in'])
    })
  })
  it("the trip's own way is still offered on its day after another way is picked", () => {
    const io = inoutOf([...Object.values(inout.ways), tripOwnIn, tripOwnHome])
    const c = chooseWay(io, oneIn1202, { wayIn: tripOwnIn, wayHome: tripOwnHome })
    expect(waysOn(io, c.wayIn, 't1')['2026-12-03'].map((w) => w.id)).toContain('t1:in')
  })
  it('with the trip id, still leaves out the own ways of other trips and the built copy of its own way', () => {
    const io = { ...inout, ways: { ...inout.ways, ...tripWays('t3', ticketIn, ticketHome), ...tripWays('t2', ticketIn, ticketHome) } }
    expect(waysOn(io, oneIn1202, 't3')['2026-12-03'].map((w) => w.id)).toEqual(['I_oneway_1203', 't3:in'])
  })
  it('the day of a way is its local depart day', () => {
    expect(dayOf(ticketHome)).toBe('2027-02-05')
  })
})

describe('choosing a way', () => {
  it('a ticket way sets both ways', () => {
    const c = chooseWay(inout, ticketIn1202, { wayIn: oneIn, wayHome: oneHome })
    expect(c.wayHome.id).toBe(ticketIn1202.paired_with)
    expect(c.note).toBe('One ticket. This also sets the way home on Wed 3 Feb')
  })
  it('a ticket way home also sets the way in', () => {
    const c = chooseWay(inout, ticketHome0203, { wayIn: oneIn, wayHome: oneHome })
    expect(c.wayIn.id).toBe('I_ticket_1202')
    expect(c.note).toBe('One ticket. This also sets the way in on Wed 2 Dec')
  })
  it('a one way next to a ticket half turns the other into a one way', () => {
    const c = chooseWay(inout, oneIn1202, { wayIn: ticketIn, wayHome: ticketHome })
    expect(c.wayHome.type).toBe('oneways')
    expect(dayOf(c.wayHome)).toBe(dayOf(ticketHome))
    expect(() => mixWays(inout, c.wayIn, c.wayHome)).not.toThrow()
  })
  it('takes the cheapest one way on that day and says so', () => {
    const c = chooseWay(inout, oneIn1202, { wayIn: ticketIn, wayHome: ticketHome })
    expect(c.wayHome.id).toBe('H_oneway_0205')
    expect(c.note).toBe('Your way home is now a one way on Fri 5 Feb')
  })
  it('takes a one way on the nearest day when that day has none', () => {
    const io = inoutOf([ticketIn, ticketHome, oneIn1202, oneHome0204, home({ id: 'H_oneway_0210', depart: '2027-02-10T12:00', price_dkk: 100 })])
    const c = chooseWay(io, oneIn1202, { wayIn: ticketIn, wayHome: ticketHome })
    expect(c.wayHome.id).toBe('H_oneway_0204')
    expect(c.note).toBe('Your way home is now a one way on Thu 4 Feb')
  })
  it('turns the way in into a one way when a one way home is picked', () => {
    const c = chooseWay(inout, oneHome0204, { wayIn: ticketIn, wayHome: ticketHome })
    expect(c.wayIn.id).toBe('I_oneway_1203')
    expect(c.note).toBe('Your way in is now a one way on Thu 3 Dec')
    expect(() => mixWays(inout, c.wayIn, c.wayHome)).not.toThrow()
  })
  it('keeps the ticket when there is no one way to go with the pick', () => {
    const io = inoutOf([ticketIn, ticketHome, oneIn1202])
    const c = chooseWay(io, oneIn1202, { wayIn: ticketIn, wayHome: ticketHome })
    expect(c.wayIn.id).toBe('I_ticket_1203')
    expect(c.wayHome.id).toBe('H_ticket_0205')
    expect(c.note).toBe('There is no saved one way home on any day, so the ticket stays as it was')
    expect(() => mixWays(io, c.wayIn, c.wayHome)).not.toThrow()
  })
  it('picking a trip way of its own brings back the trip way home', () => {
    const io = inoutOf([...Object.values(inout.ways), tripOwnIn, tripOwnHome])
    const c = chooseWay(io, tripOwnIn, { wayIn: oneIn, wayHome: oneHome })
    expect(c.wayHome.id).toBe('t1:home')
    expect(c.note).toBe('One ticket. This also sets the way home on Fri 5 Feb')
  })
  it('a one way next to a trip way of its own turns that into a one way', () => {
    const c = chooseWay(inout, oneIn1202, { wayIn: tripOwnIn, wayHome: tripOwnHome })
    expect(c.wayHome.id).toBe('H_oneway_0205')
    expect(() => mixWays(inout, c.wayIn, c.wayHome)).not.toThrow()
  })
  it('picking the current way changes nothing', () => {
    expect(chooseWay(inout, ticketIn, { wayIn: ticketIn, wayHome: ticketHome })).toEqual({ wayIn: ticketIn, wayHome: ticketHome, note: null })
  })
  it('a ticket whose way home leaves from another city names that city', () => {
    const jawIn = way({ id: 'I_jaw_1202', type: 'ticket', depart: '2026-12-02T07:00', paired_with: 'H_jaw_0206' })
    const jawHome = home({ id: 'H_jaw_0206', type: 'ticket', from: 'SAL', depart: '2027-02-06T10:00', paired_with: 'I_jaw_1202' })
    const io = { ...inoutOf([...Object.values(inout.ways), jawIn, jawHome]), airports: { SAL: { name: 'San Salvador (Comalapa)' } } } as unknown as InOut
    expect(chooseWay(io, jawIn, { wayIn: oneIn, wayHome: oneHome }).note)
      .toBe('One ticket. The way home then leaves from San Salvador on Sat 6 Feb, and San Salvador is added as the last stop')
  })
  it('a ticket whose way in lands in another city names that city', () => {
    const jawIn = way({ id: 'I_jaw_1202', type: 'ticket', to: 'BOG', depart: '2026-12-02T23:00', arrive: '2026-12-03T09:00', paired_with: 'H_jaw_0206' })
    const jawHome = home({ id: 'H_jaw_0206', type: 'ticket', depart: '2027-02-06T10:00', paired_with: 'I_jaw_1202' })
    const io = inoutOf([...Object.values(inout.ways), jawIn, jawHome])
    expect(chooseWay(io, jawHome, { wayIn: oneIn, wayHome: oneHome }).note)
      .toBe('One ticket. The way in then lands in BOG on Thu 3 Dec, and BOG is added as the first stop')
  })
  it('a one way next to a one way sets only that way', () => {
    expect(chooseWay(inout, oneIn1202, { wayIn: oneIn, wayHome: oneHome }).note).toBeNull()
  })
})

describe('changing the ends of a trip', () => {
  const wayInCTG = ticketIn
  const wayInCTG1202 = oneIn1202
  const wayInBOG = way({ id: 'I_oneway_1203_BOG', to: 'BOG', depart: '2026-12-03T08:00', price_dkk: 3500 })
  const wayHomeGUA = oneHome
  const wayHomeSAL = home({ id: 'H_oneway_0205_SAL', from: 'SAL', depart: '2027-02-05T11:00', price_dkk: 3400 })
  const optIn = ticketIn1202
  const optHome = ticketHome0203
  const option = { id: 'CTG-GUA-ticket-1202-0203', way_in: optIn.id, way_home: optHome.id } as Option
  const inout = { ...inoutOf([wayInCTG, wayInCTG1202, wayInBOG, wayHomeGUA, wayHomeSAL, optIn, optHome]), options: [option] }
  const edge = { from: 'BOG', to: 'CTG', mode: 'flight', oneway_min_dkk: 600, oneway_min_hours: 1.5 } as MapEdge
  const map = { nodes: [], edges: [edge] } as unknown as MapData
  const leg = (from: string, to: string) => ({ from, to, mode: 'bus' as const, operator: null, hours: 4, price_dkk: 100, overnight: false, border: false, flight: null })
  const j: Journey = {
    id: 'j1', name: 'Test', wayIn: wayInCTG.id, wayHome: ticketHome.id, optionId: null,
    places: [{ node: 'CTG', hop: null }, { node: 'SMR', hop: leg('CTG', 'SMR') }, { node: 'GUA', hop: leg('SMR', 'GUA') }],
  }

  it('a new arrival city comes in before the old first stop', () => {
    const j2 = withEnds(j, inout, map, wayInBOG, wayHomeGUA)
    expect(j2.places.map((p) => p.node)).toEqual(['BOG', 'CTG', 'SMR', 'GUA'])
    expect(j2.places[1].hop?.from).toBe('BOG')
  })
  it('the same arrival city adds no stop', () => {
    expect(withEnds(j, inout, map, wayInCTG1202, wayHomeGUA).places).toHaveLength(j.places.length)
  })
  it('a new home city adds a last leg to it', () => {
    expect(withEnds(j, inout, map, wayInCTG, wayHomeSAL).places.at(-1)!.node).toBe('SAL')
  })
  it('keeps the option id when the pair is an option', () => {
    expect(withEnds(j, inout, map, optIn, optHome).optionId).toBe('CTG-GUA-ticket-1202-0203')
  })
  it('sets the ways, and no option id when the pair is no option', () => {
    const j2 = withEnds({ ...j, optionId: 'CTG-GUA-ticket' }, inout, map, wayInBOG, wayHomeSAL)
    expect([j2.wayIn, j2.wayHome, j2.optionId]).toEqual([wayInBOG.id, wayHomeSAL.id, null])
  })
  it('the new first leg and the new last leg are looked up on the map', () => {
    const j2 = withEnds(j, inout, map, wayInBOG, wayHomeSAL)
    expect(j2.places.map((p) => p.node)).toEqual(['BOG', 'CTG', 'SMR', 'GUA', 'SAL'])
    expect([j2.places[1].hop?.mode, j2.places[1].hop?.price_dkk]).toEqual(['flight', 600])
    expect([j2.places[4].hop?.from, j2.places[4].hop?.to]).toEqual(['GUA', 'SAL'])
    expect(j2.places[0].hop).toBeNull()
  })
  it('the other stops and their legs stay as they were', () => {
    const j2 = withEnds(j, inout, map, wayInBOG, wayHomeSAL)
    expect(j2.places.slice(2, 4)).toEqual(j.places.slice(1, 3))
  })
  it('a new home city drops the nights planned at the old last stop, the same home city keeps them', () => {
    const planned = { ...j, lastNights: 3 }
    expect(withEnds(planned, inout, map, wayInCTG, wayHomeSAL).lastNights).toBeUndefined()
    expect(withEnds(planned, inout, map, wayInBOG, wayHomeGUA).lastNights).toBe(3)
  })
  it('a name made from the ends follows the new ends', () => {
    expect(withEnds({ ...j, wayHome: wayHomeGUA.id, name: 'CTG in, GUA home' }, inout, map, wayInBOG, wayHomeSAL).name).toBe('BOG in, SAL home')
  })
  it('a name Simon typed stays', () => {
    expect(withEnds({ ...j, wayHome: wayHomeGUA.id, name: 'Caribbean first' }, inout, map, wayInBOG, wayHomeSAL).name).toBe('Caribbean first')
  })
  it('the old first stop loses why it was there once a new arrival city comes before it', () => {
    const why = { ...j, places: [{ ...j.places[0], why: 'the way in lands here' }, ...j.places.slice(1)] }
    expect(withEnds(why, inout, map, wayInBOG, wayHomeGUA).places[1].why).toBeUndefined()
    expect(withEnds(why, inout, map, wayInCTG1202, wayHomeGUA).places[0].why).toBe('the way in lands here')
  })
})
