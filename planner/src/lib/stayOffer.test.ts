import { describe, expect, it } from 'vitest'
import type { Lodging, LodgingPrice, LodgingRoom } from '../data/types'
import { amenities, amenityRow, cheapestRoom, nightly, providers, roomMix, siteKey, sortPlaces, stayDates } from './stayOffer'

const price = (over: Partial<LodgingPrice>): LodgingPrice => ({
  id: 'p', room_id: 'r', check_in: '2026-12-08', check_out: '2026-12-09', total_dkk: null, per_night_dkk: null, site: null, url: null,
  refundable: null, cancel_until: null, available: null, observed_at: '2026-11-01T10:00', ...over,
})
const room = (id: string, prices: LodgingPrice[], over: Partial<LodgingRoom> = {}): LodgingRoom => ({
  id, lodging_id: 'l', name: id, beds: null, private: null, bathroom: null, notes: null, site: null, site_id: null, photo: null, created_at: '', updated_at: '', prices, ...over,
})
const lodging = (over: Partial<Lodging>): Lodging => ({
  id: 'l', place_id: 'smr', name: 'TEST01', kind: 'hostel', photos: [], rating: null, reviews: null, rating_source: null, address: null,
  lat: null, lon: null, to_center_km: null, to_beach_km: null, tags: [], summary: null, notes: null, links: [], added_by: 'simon', hidden: false,
  created_at: '', updated_at: '', rooms: [], ...over,
})

describe('nightly', () => {
  it('takes the cheapest price for the very dates, a total over its nights', () => {
    const p = nightly([price({ per_night_dkk: 230 }), price({ total_dkk: 210 }), price({ check_in: '2026-12-01', check_out: '2026-12-02', per_night_dkk: 100 })], '2026-12-08', '2026-12-09')
    expect(p).toEqual({ dkk: 210, exact: true })
  })
  it('falls back to the nearest dates and says which', () => {
    const p = nightly([price({ check_in: '2026-12-10', check_out: '2026-12-13', total_dkk: 600 })], '2026-12-08', '2026-12-09')
    expect(p).toEqual({ dkk: 200, exact: false, check_in: '2026-12-10', check_out: '2026-12-13' })
  })
  it('has nothing without a figure', () => {
    expect(nightly([price({})], '2026-12-08', '2026-12-09')).toBeNull()
  })
})

describe('cheapestRoom', () => {
  it('prefers an exact price over a cheaper one for other dates', () => {
    const l = lodging({ rooms: [room('far', [price({ check_in: '2026-12-20', check_out: '2026-12-21', per_night_dkk: 90 })]), room('here', [price({ per_night_dkk: 210 })])] })
    expect(cheapestRoom(l, '2026-12-08', '2026-12-09')?.room.id).toBe('here')
  })
})

describe('providers', () => {
  const dorm = room('dorm', [
    price({ site: 'booking', per_night_dkk: 210 }),
    price({ site: 'hostelworld', per_night_dkk: 215 }),
    price({ site: 'other', url: 'https://www.agoda.com/x', per_night_dkk: 218 }),
  ])
  const l = lodging({ links: [{ site: 'airbnb', url: 'https://airbnb.com/x' }, { site: 'booking', url: 'https://booking.com/x' }], rooms: [dorm] })
  it('lists each site once with its price, cheapest first, marked, and a site without a price last with none', () => {
    const rows = providers(l, dorm, '2026-12-08', '2026-12-09')
    expect(rows.map((r) => [r.name, r.price?.dkk ?? null, r.cheapest])).toEqual([
      ['Booking.com', 210, true], ['Hostelworld', 215, false], ['Agoda', 218, false], ['Airbnb', null, false],
    ])
    expect(rows[0].url).toBe('https://booking.com/x')
  })
  it('marks no site when there is only one price', () => {
    const one = room('one', [price({ site: 'booking', per_night_dkk: 210 })])
    expect(providers(lodging({ rooms: [one] }), one, '2026-12-08', '2026-12-09').some((r) => r.cheapest)).toBe(false)
  })
  it('names a host it knows', () => {
    expect(siteKey('other', 'https://secure.agoda.com/h')).toEqual({ key: 'agoda.com', name: 'Agoda' })
    expect(siteKey('other', 'https://example.org/h')).toEqual({ key: 'example.org', name: 'example.org' })
  })
})

describe('amenities', () => {
  it('puts the rooms first, then the tags in one word each', () => {
    const l = lodging({ tags: ['social', 'pool'], rooms: [room('a', [], { private: false }), room('b', [], { private: true })] })
    expect(amenities(l).map((a) => a.label)).toEqual(['Dorms & private rooms', 'Pool', 'Bar'])
    expect(amenityRow(l).map((a) => a.label)).toEqual(['Pool', 'Bar', 'Dorms'])
    expect(roomMix([room('a', [])])).toBeNull()
  })
})

describe('sortPlaces', () => {
  const a = lodging({ id: 'a', kind: 'hostel', rating: 8.9, rooms: [room('a', [price({ per_night_dkk: 230 })])] })
  const b = lodging({ id: 'b', kind: 'hotel', rating: 9.2, rooms: [] })
  const c = lodging({ id: 'c', kind: 'hostel', rating: 8.1, rooms: [room('c', [price({ per_night_dkk: 165 })])] })
  it('filters by kind and sorts by price with no price last, or by rating', () => {
    expect(sortPlaces([a, b, c], 'all', 'price', '2026-12-08', '2026-12-09').map((l) => l.id)).toEqual(['c', 'a', 'b'])
    expect(sortPlaces([a, b, c], 'hostel', 'rating', '2026-12-08', '2026-12-09').map((l) => l.id)).toEqual(['a', 'c'])
    expect(stayDates('2026-12-08', '2026-12-09')).toBe('8 Dec to 9 Dec')
  })
})
