import { describe, expect, it } from 'vitest'
import type { LodgingPrice, LodgingRoom } from '../data/types'
import { bookingLink, cancelWords, manualChange, partTerms, stayDraft, stayMoney, stayPrompt, stayRow, type StayTarget } from './stayBooking'
import type { StayPart } from './stays'

// Made up places, rooms and references only.

const target: StayTarget = { tripId: 'TEST-TRIP', placeId: 'B', lodgingId: 'TEST01', roomId: 'dorm', first: '2026-12-08', nights: 5 }
const part: StayPart = { stay: { lodging_id: 'TEST01', room_id: 'dorm' }, first: '2026-12-08', last: '2026-12-12', nights: 5, fits: true }
const price = (p: Partial<LodgingPrice>): LodgingPrice => ({
  id: 'p', room_id: 'dorm', check_in: '2026-12-08', check_out: '2026-12-13', total_dkk: 1220, per_night_dkk: null,
  site: null, url: null, refundable: null, cancel_until: null, available: null, observed_at: '2026-11-01T10:00', ...p,
})
const room = (prices: LodgingPrice[]): LodgingRoom => ({
  id: 'dorm', lodging_id: 'TEST01', name: 'Dorm', beds: 4, private: false, bathroom: 'private', notes: null, site: null, site_id: null,
  photo: null, created_at: '', updated_at: '', prices,
}) as LodgingRoom

describe('the AI prompt', () => {
  it('names the city in the wording of the brief', () => {
    expect(stayPrompt('San Andrés')).toBe(
      'Look through my Gmail for emails about accommodation in San Andrés. Find any accommodation bookings or reservations ' +
        'and add them to my LATAM Trips itinerary, including the property name, dates, room type, price and booking reference. ' +
        'Let me review the results before saving.',
    )
  })
})

describe('the booking of a planned part', () => {
  it('is a booked stay of the place, room and trip, from the first night to the morning after the last', () => {
    expect(stayDraft(target)).toEqual({
      kind: 'stay', status: 'booked', place_id: 'B', lodging_id: 'TEST01', room_id: 'dorm', trip_id: 'TEST-TRIP',
      check_in: '2026-12-08', check_out: '2026-12-13', source: 'manual',
    })
  })

  it('a part with no row gets a new one with the change on it', () => {
    expect(stayRow(null, target, { reference: 'TEST01' })).toMatchObject({ kind: 'stay', place_id: 'B', reference: 'TEST01' })
    expect(stayRow(null, target, {}).id).toBeUndefined()
  })

  it('a part with a row changes only that row', () => {
    expect(stayRow({ id: 'row1' }, target, { url: 'https://example.com/b' })).toEqual({ id: 'row1', url: 'https://example.com/b' })
  })
})

describe('typed details', () => {
  const empty = { reference: '', price: '', seller: '', checkIn: '', checkOut: '', cancelUntil: '' }

  it('empty fields change nothing', () => {
    expect(manualChange(empty)).toEqual({ ok: true, change: {} })
  })

  it('reads a price in kroner with dots, commas and a currency', () => {
    const r = manualChange({ ...empty, price: '1.220 kr', reference: ' TEST01 ' })
    expect(r).toEqual({ ok: true, change: { reference: 'TEST01', price_dkk: 1220, price: 1220, currency: 'DKK' } })
    expect(manualChange({ ...empty, price: '244,50' })).toMatchObject({ ok: true, change: { price_dkk: 245 } })
  })

  it('refuses a price that is not a number, or dates the wrong way round', () => {
    expect(manualChange({ ...empty, price: 'cheap' }).ok).toBe(false)
    expect(manualChange({ ...empty, checkIn: '2026-12-13', checkOut: '2026-12-08' }).ok).toBe(false)
  })

  it('a free cancellation day makes it refundable', () => {
    expect(manualChange({ ...empty, cancelUntil: '2026-12-01' })).toEqual({ ok: true, change: { cancel_until: '2026-12-01', refundable: 'yes' } })
  })
})

describe('a booking link', () => {
  it('keeps http and https only', () => {
    expect(bookingLink(' https://www.hostelworld.com/b/1 ')).toBe('https://www.hostelworld.com/b/1')
    expect(bookingLink('javascript:alert(1)')).toBeNull()
    expect(bookingLink('not a link')).toBeNull()
  })
})

describe('cancellation', () => {
  it('says how it can be cancelled, or nothing when not known', () => {
    expect(cancelWords('no', null)).toBe('Non-refundable')
    expect(cancelWords('yes', null)).toBe('Free cancellation')
    expect(cancelWords('yes', '2026-12-01')).toBe('Free cancellation until Tue 1 Dec')
    expect(cancelWords(null, null)).toBeNull()
  })

  it('reads the terms of the price for the part, or the nearest one', () => {
    expect(partTerms(room([price({ refundable: 'yes' })]), part)?.refundable).toBe('yes')
    expect(partTerms(room([price({ check_in: '2026-12-09', check_out: '2026-12-14', refundable: 'no' })]), part)?.refundable).toBe('no')
    expect(partTerms(room([]), part)).toBeNull()
  })
})

describe('the money of a part', () => {
  it('uses the price paid when there is one', () => {
    expect(stayMoney(room([price({})]), part, 1500)).toEqual({ perNight: 300, total: 1500, exact: true })
  })

  it('else the room price for those nights, a night and in all', () => {
    expect(stayMoney(room([price({})]), part, null)).toEqual({ perNight: 244, total: 1220, exact: true })
  })

  it('a price from other dates is not exact', () => {
    expect(stayMoney(room([price({ check_in: '2026-12-01', check_out: '2026-12-03', total_dkk: 400 })]), part, null)).toEqual({ perNight: 200, total: 1000, exact: false })
  })

  it('nothing known is nothing', () => {
    expect(stayMoney(undefined, part, null)).toEqual({ perNight: null, total: null, exact: false })
  })
})
