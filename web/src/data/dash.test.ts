import { describe, expect, it } from 'vitest'
import {
  airportOptions,
  airportsOf,
  cityOptions,
  defaultDir,
  filterFlights,
  filterJourneys,
  filterTrips,
  nextSort,
  ratingBand,
  sortRows,
  type DashFlight,
  type DashJourney,
  type DashTrip,
} from './dash'

function trip(p: Partial<DashTrip>): DashTrip {
  return {
    id: 'x', scenario: 'A', route: 'Central America', in: 'San José', out: 'San José', type: 'One ticket',
    rating: 7, rating_cost: 3, rating_hours: 4, total_kr: 9000, travel_hours: 40, long_haul_kr: 7000, regional_kr: 2000,
    hub_nights: 0, night_arrivals: 0, out_leaves: '2 Dec 09:55', out_lands: '2 Dec 19:00', out_hours: 15, out_via: 'FRA',
    out_airlines: 'LH', home_leaves: '2 Feb 08:45', home_lands: '3 Feb 10:20', home_hours: 18, home_via: 'YYZ',
    home_airlines: 'AC', regional_flights: 'none', stops: '', ...p,
  }
}

function flight(p: Partial<DashFlight>): DashFlight {
  return {
    id: 'f', from: 'Santa Cruz', to: 'Bogotá', from_code: 'VVI', to_code: 'BOG', pick: 'Cheapest', price_kr: 900, hours: 3,
    departs: '1 Feb 05:30', lands: '1 Feb 08:00', via: '', airlines: 'BoA', notes: '', dates_searched: 3, ...p,
  }
}

const trips = [
  trip({ id: 'a', scenario: 'A', in: 'Mexico City', out: 'Santa Cruz', rating: 8.4, total_kr: 12000 }),
  trip({ id: 'am', scenario: 'A + Mexico', in: 'Guatemala City', out: 'La Paz', rating: 6.1, total_kr: 11000 }),
  trip({ id: 'b', scenario: 'B', in: 'San José', out: 'San José', rating: 8.7, total_kr: 9647, home_airlines: 'Air Canada' }),
  trip({ id: 'bm', scenario: 'B + Mexico', in: 'Mexico City', out: 'San José', rating: 4.9, total_kr: 9647 }),
]

describe('whole trip filters', () => {
  it('keeps every row on All', () => {
    expect(filterTrips(trips, { scenario: 'all', in: '', out: '', q: '' }).map((r) => r.id)).toEqual(['a', 'am', 'b', 'bm'])
  })
  it('matches the scenario by its first letter, so "A + Mexico" counts as A', () => {
    expect(filterTrips(trips, { scenario: 'A', in: '', out: '', q: '' }).map((r) => r.id)).toEqual(['a', 'am'])
    expect(filterTrips(trips, { scenario: 'B', in: '', out: '', q: '' }).map((r) => r.id)).toEqual(['b', 'bm'])
  })
  it('filters on the arrival and the home city together', () => {
    expect(filterTrips(trips, { scenario: 'all', in: 'Mexico City', out: '', q: '' }).map((r) => r.id)).toEqual(['a', 'bm'])
    expect(filterTrips(trips, { scenario: 'all', in: 'Mexico City', out: 'San José', q: '' }).map((r) => r.id)).toEqual(['bm'])
    expect(filterTrips(trips, { scenario: 'B', in: 'Mexico City', out: 'Santa Cruz', q: '' })).toEqual([])
  })
  it('searches every field, ignoring case and accents', () => {
    expect(filterTrips(trips, { scenario: 'all', in: '', out: '', q: 'air canada' }).map((r) => r.id)).toEqual(['b'])
    expect(filterTrips(trips, { scenario: 'all', in: '', out: '', q: 'san jose' }).map((r) => r.id)).toEqual(['b', 'bm'])
    expect(filterTrips(trips, { scenario: 'all', in: '', out: '', q: 'yyz mexico' }).map((r) => r.id)).toEqual(['a', 'am', 'bm'])
  })
  it('lists the cities for the dropdowns', () => {
    expect(cityOptions(trips, 'in')).toEqual(['Guatemala City', 'Mexico City', 'San José'])
    expect(cityOptions(trips, 'out')).toEqual(['La Paz', 'San José', 'Santa Cruz'])
  })
})

describe('long-haul ticket search', () => {
  const rows = [
    { id: 'j1', in: 'Cancún', out: 'Mexico City', out_via: 'MAD', home_airlines: 'Iberia' },
    { id: 'j2', in: 'Bogotá', out: 'La Paz', out_via: 'FRA', home_airlines: 'Lufthansa' },
  ] as DashJourney[]
  it('finds rows by any field', () => {
    expect(filterJourneys(rows, 'mad').map((r) => r.id)).toEqual(['j1'])
    expect(filterJourneys(rows, 'bogota').map((r) => r.id)).toEqual(['j2'])
    expect(filterJourneys(rows, '').length).toBe(2)
  })
})

describe('regional flight filters', () => {
  const rows = [
    flight({ id: 'out1', from_code: 'VVI', to_code: 'BOG', to: 'Bogotá' }),
    flight({ id: 'out2', from_code: 'VVI', to_code: 'LPB', to: 'La Paz', airlines: 'BoA' }),
    flight({ id: 'in1', from_code: 'LPB', from: 'La Paz', to_code: 'VVI', to: 'Santa Cruz' }),
    flight({ id: 'other', from_code: 'BOG', from: 'Bogotá', to_code: 'MDE', to: 'Medellín', airlines: 'LATAM' }),
    flight({ id: 'bare', from_code: 'CBB', from: 'CBB', to_code: 'VVI', to: 'Santa Cruz' }),
  ]
  it('keeps the flights leaving the airport when flying out of it', () => {
    expect(filterFlights(rows, { airport: 'VVI', dir: 'out', q: '' }).map((r) => r.id)).toEqual(['out1', 'out2'])
  })
  it('keeps the flights landing at the airport when flying into it', () => {
    expect(filterFlights(rows, { airport: 'VVI', dir: 'in', q: '' }).map((r) => r.id)).toEqual(['in1', 'bare'])
  })
  it('combines the airport with the text search', () => {
    expect(filterFlights(rows, { airport: 'VVI', dir: 'out', q: 'la paz' }).map((r) => r.id)).toEqual(['out2'])
    expect(filterFlights(rows, { airport: '', dir: 'out', q: 'latam' }).map((r) => r.id)).toEqual(['other'])
  })
  it('labels the airports "City (CODE)" and keeps a bare code when there is no name', () => {
    expect(airportOptions(rows)).toEqual([
      { code: 'BOG', label: 'Bogotá (BOG)' },
      { code: 'CBB', label: 'CBB' },
      { code: 'LPB', label: 'La Paz (LPB)' },
      { code: 'MDE', label: 'Medellín (MDE)' },
      { code: 'VVI', label: 'Santa Cruz (VVI)' },
    ])
  })
})

describe('sorting', () => {
  it('sorts numbers numerically, not as text', () => {
    const rows = [{ id: 'a', total_kr: 10000, rating: 1 }, { id: 'b', total_kr: 9000, rating: 1 }, { id: 'c', total_kr: 900, rating: 1 }]
    expect(sortRows(rows, { key: 'total_kr', dir: 'asc' }).map((r) => r.id)).toEqual(['c', 'b', 'a'])
    expect(sortRows(rows, { key: 'total_kr', dir: 'desc' }).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })
  it('sorts text alphabetically and reverses on the same column', () => {
    const rows = [{ id: '1', in: 'San José' }, { id: '2', in: 'Bogotá' }, { id: '3', in: 'Mexico City' }]
    expect(sortRows(rows, { key: 'in', dir: 'asc' }).map((r) => r.id)).toEqual(['2', '3', '1'])
    const flipped = nextSort({ key: 'in', dir: 'asc' }, 'in')
    expect(flipped).toEqual({ key: 'in', dir: 'desc' })
    expect(sortRows(rows, flipped).map((r) => r.id)).toEqual(['1', '3', '2'])
  })
  it('breaks ties by the best rating, then the lowest total', () => {
    const rows = [
      { id: 'x', type: 'One ticket', rating: 7, total_kr: 9000 },
      { id: 'y', type: 'One ticket', rating: 9, total_kr: 9500 },
      { id: 'z', type: 'One ticket', rating: 9, total_kr: 9100 },
    ]
    expect(sortRows(rows, { key: 'type', dir: 'asc' }).map((r) => r.id)).toEqual(['z', 'y', 'x'])
  })
  it('starts a new column in its natural direction', () => {
    expect(defaultDir('rating')).toBe('desc')
    expect(defaultDir('rating_flights')).toBe('desc')
    expect(defaultDir('total_kr')).toBe('asc')
    expect(defaultDir('price_kr')).toBe('asc')
    expect(defaultDir('travel_hours')).toBe('asc')
    expect(defaultDir('hours')).toBe('asc')
    expect(defaultDir('in')).toBe('asc')
    expect(defaultDir('hub_nights')).toBe('desc')
    expect(nextSort(null, 'rating')).toEqual({ key: 'rating', dir: 'desc' })
    expect(nextSort({ key: 'rating', dir: 'desc' }, 'total_kr')).toEqual({ key: 'total_kr', dir: 'asc' })
  })
  it('does not mutate the input', () => {
    const rows = [{ id: 'a', rating: 1 }, { id: 'b', rating: 2 }]
    sortRows(rows, { key: 'rating', dir: 'desc' })
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('airports of a row', () => {
  it('reads the in and home codes from the id', () => {
    expect(airportsOf('SJO-LPB-ticket|CA-CO-BO')).toEqual(['SJO', 'LPB'])
    expect(airportsOf('GUA-SJO-ticket')).toEqual(['GUA', 'SJO'])
    expect(airportsOf('SJO-SJO-oneways')).toEqual(['SJO'])
    expect(airportsOf('MDE>ADZ|Q:b5dabe45f30b')).toEqual([])
  })
})

describe('rating bands', () => {
  it('colours 8 and up green, 5 to 7.9 amber, below 5 red', () => {
    expect(ratingBand(8)).toBe('good')
    expect(ratingBand(7.9)).toBe('fair')
    expect(ratingBand(5)).toBe('fair')
    expect(ratingBand(4.9)).toBe('poor')
  })
})
