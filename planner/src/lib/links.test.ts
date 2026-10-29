import { describe, expect, it } from 'vitest'
import type { Airport, FlightItem, InOut, Ticket, Way } from '../data/types'
import type { Hop } from './journey'
import { hopLink, momondoSearch, wayLinks } from './links'

const fl = (over: Partial<FlightItem>): FlightItem => ({
  kind: 'flight', from: 'CPH', to: 'MAD', depart: '2026-12-02T06:10', arrive: '2026-12-02T09:35', hours: 3.42,
  connections: [], carriers: [], overnight_layover: false, self_transfer_inside: false, ticket: 'TQ:a', ...over,
})
const way = (over: Partial<Way>): Way => ({
  id: 'W', direction: 'in', type: 'oneways', from: 'CPH', to: 'SAL', depart: '2026-12-02T06:10', arrive: '2026-12-03T21:45',
  total_hours: 40, flying_hours: 20, flights: 2, hub_nights: 0, changes: 1, us_transit: false, airports: [], tickets: [],
  price_dkk: 0, extras: { cabin_bag_fees_dkk: 0, checked_bag_fees_dkk: 0, hub_nights: 0, hub_stay_estimate_dkk: 0 },
  score: 0, timeline: [], ...over,
})
const tk = (id: string, over: Partial<Ticket>): Ticket => ({
  id, quote_id: id.slice(1), source: 'expedia', observed_at: '', structure: 'one_way', legs: [], price_dkk: 1000,
  fare_brand: null, cabin_bag: null, checked_bag: null, cabin_bag_fee_dkk: null, checked_bag_fee_dkk: null,
  tickets_inside: 1, self_transfer: false, carriers: [], flags: [], notes: null, link: null, ...over,
})
const ap = (map_node?: string): Airport => ({ name: '', country: '', lat: 0, lon: 0, region: null, utc_offset: 0, home: false, map_node })
const inout = (tickets: Ticket[]): InOut =>
  ({ airports: { CPH: ap(), MAD: ap(), SAL: ap(), BOG: ap(), LPB: ap('la-paz') }, tickets: Object.fromEntries(tickets.map((t) => [t.id, t])) }) as unknown as InOut

describe('momondoSearch', () => {
  it('is a one way for one leg and a multi-city search for more', () => {
    expect(momondoSearch([{ from: 'CPH', to: 'GDL', date: '2026-12-04' }])).toBe('https://www.momondo.dk/flight-search/CPH-GDL/2026-12-04?sort=price_a')
    expect(momondoSearch([{ from: 'CPH', to: 'GDL', date: '2026-12-04' }, { from: 'VVI', to: 'CPH', date: '2027-02-04' }]))
      .toBe('https://www.momondo.dk/flight-search/CPH-GDL/2026-12-04/VVI-CPH/2027-02-04?sort=price_a')
  })
})

describe('wayLinks', () => {
  it('gives each one-way ticket of a way its own link: the saved page, else a search for its own leg and day', () => {
    const w = way({
      tickets: ['TQ:a', 'TQ:b'],
      timeline: [fl({}), fl({ from: 'MAD', to: 'BOG', depart: '2026-12-03T08:10', ticket: 'TQ:b' }), fl({ from: 'BOG', to: 'SAL', depart: '2026-12-03T19:00', ticket: 'TQ:b' })],
    })
    const [a, b] = wayLinks(w, inout([tk('TQ:a', { source: 'kiwi', link: 'https://www.kiwi.com/x' }), tk('TQ:b', {})]))
    expect(a).toMatchObject({ href: 'https://www.kiwi.com/x', site: 'Kiwi.com', saved: true, legs: [{ from: 'CPH', to: 'MAD', date: '2026-12-02' }] })
    expect(b).toMatchObject({ site: 'Momondo', saved: false, legs: [{ from: 'MAD', to: 'SAL', date: '2026-12-03' }] })
    expect(b.href).toBe('https://www.momondo.dk/flight-search/MAD-SAL/2026-12-03?sort=price_a')
  })

  it('searches both legs of a ticket shared with the way home, way in first', () => {
    const wi = way({ tickets: ['TQ:o'], shared_ticket: 'TQ:o', timeline: [fl({ to: 'SAL', ticket: 'TQ:o' })] })
    const wh = way({ direction: 'home', tickets: ['TQ:o'], shared_ticket: 'TQ:o', timeline: [fl({ from: 'BOG', to: 'CPH', depart: '2027-02-03T21:35', ticket: 'TQ:o' })] })
    const [l] = wayLinks(wh, inout([tk('TQ:o', {})]), wi)
    expect(l.href).toBe('https://www.momondo.dk/flight-search/CPH-SAL/2026-12-02/BOG-CPH/2027-02-03?sort=price_a')
  })

  it('never links a link that is not a web page', () => {
    const w = way({ tickets: ['TQ:a'], timeline: [fl({})] })
    expect(wayLinks(w, inout([tk('TQ:a', { link: 'javascript:alert(1)' })]))[0].saved).toBe(false)
  })
})

describe('hopLink', () => {
  const hop = (over: Partial<Hop>): Hop => ({ from: 'BOG', to: 'la-paz', mode: 'flight', operator: null, hours: 9.75, price_dkk: 2000, overnight: false, border: false, flight: null, ...over })
  const f = { quote_id: 'Q:h', depart: '2027-01-28T17:15', arrive: '2027-01-29T04:00', hours: 9.75, price_dkk: 2000, carriers: [], via: [], layover_h: [] }

  it('is null for a hop that is not a flight', () => {
    expect(hopLink(hop({ mode: 'bus' }), inout([]))).toBeNull()
  })

  it('searches the flight by airport and day when its ticket is not in the data, map nodes turned into airports', () => {
    expect(hopLink(hop({ flight: f }), inout([]))?.href).toBe('https://www.momondo.dk/flight-search/BOG-LPB/2027-01-28?sort=price_a')
  })

  it('opens the saved page when the ticket has one', () => {
    expect(hopLink(hop({ flight: f }), inout([tk('TQ:h', { source: 'momondo', legs: ['BOG>LPB'], link: 'https://www.momondo.dk/flight-search/BOG-LPB/2027-01-28' })])))
      .toMatchObject({ site: 'Momondo', saved: true })
  })
})
