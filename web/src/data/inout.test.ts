import { describe, expect, it } from 'vitest'
import { dayTime, hours, ioMarkers, wayFacts, wayRows } from './inout'
import type { SeedWay, Trip } from './trips'

const way = (over: Partial<SeedWay>): SeedWay => ({
  from: 'CPH', to: 'GUA', depart: '2026-12-02T09:55', arrive: '2026-12-02T21:36', flying_hours: 18.7, total_hours: 18.7,
  hub_nights: 0, us_transit: false, airports: [], timeline: [], ...over,
})

const trip = (entry: string, exit: string, over: Partial<Trip> = {}): Trip => ({
  id: 't', name: 'T', legs: [], updated: 0,
  inout: { option_id: 'x', type: 'ticket', entry, exit, price_dkk: 7850, way_in: way({}), way_home: way({ from: exit, to: 'CPH', arrive: '2027-02-04T17:00' }) },
  ...over,
})

const onMap = (code: string) => (['GUA', 'BOG', 'SJO'].includes(code) ? code : null)

describe('entry and exit markers', () => {
  it('marks the entry and the exit apart', () => {
    expect(ioMarkers(trip('GUA', 'BOG'), onMap)).toEqual([{ place: 'GUA', dirs: ['in'] }, { place: 'BOG', dirs: ['home'] }])
  })

  it('uses one marker with both directions when entry and exit are the same place', () => {
    expect(ioMarkers(trip('SJO', 'SJO'), onMap)).toEqual([{ place: 'SJO', dirs: ['in', 'home'] }])
  })

  it('leaves out an airport the map does not have, and trips without in/out', () => {
    expect(ioMarkers(trip('GUA', 'LIM'), onMap)).toEqual([{ place: 'GUA', dirs: ['in'] }])
    expect(ioMarkers({ id: 'a', name: 'A', legs: [], updated: 0 }, onMap)).toEqual([])
    expect(ioMarkers(null, onMap)).toEqual([])
  })
})

describe('way pane rows', () => {
  const w = way({
    timeline: [
      {
        kind: 'flight', from: 'CPH', to: 'MAD', depart: '2026-12-02T06:10', arrive: '2026-12-02T09:35', hours: 3.42,
        connections: [], carriers: ['Ryanair'], flight_numbers: ['Ryanair 606'],
      },
      { kind: 'night', airport: 'MAD', arrive: '2026-12-02T09:35', depart: '2026-12-03T15:20', hours: 29.75, nights: 1 },
      {
        kind: 'flight', from: 'MAD', to: 'GUA', depart: '2026-12-03T15:20', arrive: '2026-12-03T21:36', hours: 13.27,
        connections: [{ airport: 'SJO', layover_h: 2.42 }, { airport: 'PTY', layover_h: null }], carriers: ['Iberia', 'Copa'], flight_numbers: ['IB 6341', 'CM 391'],
      },
    ],
  })

  it('gives a flight row its times, hours, carriers, numbers and connections', () => {
    const [first, , last] = wayRows(w)
    expect(first).toMatchObject({ kind: 'flight', from: 'CPH', to: 'MAD', depart: 'Wed 2 Dec 06:10', arrive: 'Wed 2 Dec 09:35', hours: '3,4 h', carriers: 'Ryanair', numbers: 'Ryanair 606', connections: [] })
    expect(last).toMatchObject({ carriers: 'Iberia, Copa', numbers: 'IB 6341, CM 391', connections: [{ airport: 'SJO', hours: '2,4 h' }, { airport: 'PTY', hours: 'time unknown' }] })
  })

  it('gives a stop row its kind, nights and hours on the ground', () => {
    expect(wayRows(w)[1]).toEqual({ kind: 'stop', label: 'Night (1 night)', airport: 'MAD', ground: '29,8 h on the ground', arrive: 'Wed 2 Dec 09:35', depart: 'Thu 3 Dec 15:20' })
    const st = wayRows(way({ timeline: [{ kind: 'self_transfer', airport: 'MAD', arrive: null, depart: null, hours: 3.17 }] }))[0]
    expect(st).toMatchObject({ label: 'Self-transfer', ground: '3,2 h on the ground', arrive: 'time unknown' })
    const bare = wayRows(way({ timeline: [{ kind: 'connection', airport: 'MAD', arrive: null, depart: null, hours: null }] }))[0]
    expect(bare).toMatchObject({ ground: '' })
  })

  it('formats hours and times the Danish way', () => {
    expect(hours(1.333)).toBe('1,3 h')
    expect(hours(12)).toBe('12 h')
    expect(hours(null)).toBe('time unknown')
    expect(dayTime('2027-02-04T17:00')).toBe('Thu 4 Feb 17:00')
  })
})

describe('way pane facts', () => {
  it('prices a shared ticket once for both ways and says when it lands in Copenhagen', () => {
    const t = trip('GUA', 'BOG', { inout: { ...trip('GUA', 'BOG').inout!, extras: { cabin_bag_fees_dkk: 0 } } })
    expect(wayFacts(t, 'home')).toEqual([
      { label: 'Ticket price', value: '7.850 kr' },
      { label: 'Ticket covers', value: 'Both ways' },
      { label: 'Cabin-bag fee', value: 'included' },
      { label: 'US transit', value: 'No' },
      { label: 'Lands in Copenhagen', value: 'Thu 4 Feb 17:00' },
    ])
    expect(wayFacts(t, 'in').at(-1)).toEqual({ label: 'Leaves Copenhagen', value: 'Wed 2 Dec 09:55' })
  })

  it('reads the long-haul cabin fee from the totals for seeds stored without extras', () => {
    const t = trip('GUA', 'BOG', {
      totals: { long_haul_dkk: 7850, in_between_dkk: 4601, flights_total_dkk: 12451, cabin_bag_fees_dkk: 500, hub_nights: 0, us_transit: false },
      segments: [{ kind: 'flight', from: 'SJO', to: 'LPB', cabin_bag_fee_dkk: 250 }, { kind: 'overland', from: 'GUA', to: 'SJO' }],
    })
    expect(wayFacts(t, 'in')).toContainEqual({ label: 'Cabin-bag fee', value: '250 kr' })
  })

  it('prices separate one-ways per direction and flags US transit', () => {
    const base = trip('GUA', 'BOG').inout!
    const t = trip('GUA', 'BOG', {
      inout: { ...base, type: 'oneways', way_in: way({ price_dkk: 3120, extras: { cabin_bag_fees_dkk: 180 }, us_transit: true }) },
    })
    expect(wayFacts(t, 'in')).toEqual([
      { label: 'Ticket price', value: '3.120 kr' },
      { label: 'Cabin-bag fee', value: '180 kr' },
      { label: 'US transit', value: 'Yes' },
      { label: 'Leaves Copenhagen', value: 'Wed 2 Dec 09:55' },
    ])
  })
})
