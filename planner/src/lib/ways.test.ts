import { describe, expect, it } from 'vitest'
import type { InOut, Way } from '../data/types'
import { mixWays } from './options'
import { chooseWay, dayFares, dayOf, waysOn } from './ways'

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

// a saved trip's own way, as withTripWays names it, not in the built ways
const tripOwnIn = way({ id: 't1:in', type: 'ticket', depart: '2026-12-03T06:30', price_dkk: 7000, paired_with: 'H_ticket_0205' })

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
  it('leaves out the own ways of other trips', () => {
    const withOther = inoutOf([...Object.values(inout.ways), way({ id: 't2:in', depart: '2026-12-03T05:00', price_dkk: 1 })])
    expect(waysOn(withOther, oneIn)['2026-12-03'].map((w) => w.id)).toEqual(['I_oneway_1203', 'I_ticket_1203'])
  })
  it('day fares are the price of the first way that day', () => {
    expect(dayFares(inout, ticketIn)['2026-12-02']).toBe(8235)
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
    expect(c.note).toBe('No one way home is saved for any day, so the ticket stays as it was')
    expect(() => mixWays(io, c.wayIn, c.wayHome)).not.toThrow()
  })
  it('picking a trip way of its own brings back the trip way home', () => {
    const tripOwnHome = home({ id: 't1:home', type: 'ticket', depart: '2027-02-05T09:00', paired_with: null })
    const own = { ...tripOwnIn, paired_with: null }
    const io = inoutOf([...Object.values(inout.ways), own, tripOwnHome])
    const c = chooseWay(io, own, { wayIn: oneIn, wayHome: oneHome })
    expect(c.wayHome.id).toBe('t1:home')
    expect(c.note).toBe('One ticket. This also sets the way home on Fri 5 Feb')
  })
  it('a one way next to a trip way of its own turns that into a one way', () => {
    const tripOwnHome = home({ id: 't1:home', type: 'ticket', depart: '2027-02-05T09:00', paired_with: null })
    const c = chooseWay(inout, oneIn1202, { wayIn: { ...tripOwnIn, paired_with: null }, wayHome: tripOwnHome })
    expect(c.wayHome.id).toBe('H_oneway_0205')
    expect(() => mixWays(inout, c.wayIn, c.wayHome)).not.toThrow()
  })
  it('picking the current way changes nothing', () => {
    expect(chooseWay(inout, ticketIn, { wayIn: ticketIn, wayHome: ticketHome })).toEqual({ wayIn: ticketIn, wayHome: ticketHome, note: null })
  })
  it('a one way next to a one way sets only that way', () => {
    expect(chooseWay(inout, oneIn1202, { wayIn: oneIn, wayHome: oneHome }).note).toBeNull()
  })
})
