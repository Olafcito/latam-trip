import { describe, expect, it } from 'vitest'
import type { Booking } from '../data/types'
import { formChange, moneyOf, stayFormOf, type StayForm, type StayTarget } from './stayBooking'

// Made up places and amounts, the reference TEST01 only.
const target: StayTarget = { tripId: 'TEST-TRIP', placeId: 'B', lodgingId: null, roomId: null, first: '2026-12-08', nights: 3 }
const empty = (): StayForm => stayFormOf(target, null)
const form = (over: Partial<StayForm> = {}): StayForm => ({ ...empty(), ...over })
const change = (f: StayForm) => {
  const r = formChange(f)
  if (!r.ok) throw new Error(r.message)
  return r
}
const refused = (f: StayForm) => {
  const r = formChange(f)
  if (r.ok) throw new Error('should be refused')
  return r.message
}

describe('moneyOf', () => {
  it.each([
    ['106,754.76', 106754.76],
    ['106.754,76', 106754.76],
    ['1 220', 1220],
    ['1220 kr', 1220],
    ['1.220', 1220],
    ['12,50', 12.5],
    ['1220', 1220],
  ])('reads %s', (text, n) => {
    expect(moneyOf(text)).toBe(n)
  })
  it('gives null for empty and NaN for words', () => {
    expect(moneyOf('  ')).toBeNull()
    expect(moneyOf(undefined)).toBeNull()
    expect(moneyOf('a lot')).toBeNaN()
    expect(moneyOf('abc')).toBeNaN()
  })
})

describe('stayFormOf', () => {
  it('has the target dates alone when there is no booking', () => {
    expect(empty()).toMatchObject({ checkIn: '2026-12-08', checkOut: '2026-12-11', currency: 'DKK', total: '', provider: '' })
  })

  it('maps every field back from the booking', () => {
    const b = {
      reference: 'TEST01', provider: 'other', seller: 'Casa Lola direct', seller_url: 'https://example.test/lola',
      check_in: '2026-12-08', check_out: '2026-12-10', check_in_time: '14:00', check_out_time: '11:00', room_name: 'Dorm',
      travellers: 2, rooms: 1, price: 100.5, currency: 'EUR', paid: 20, price_dkk: 750, refundable: 'yes', cancel_until: '2026-12-05',
      mail_url: 'https://mail.google.com/mail/u/0/#inbox/x',
    } as Booking
    expect(stayFormOf(target, b)).toEqual({
      provider: 'other', seller: 'Casa Lola direct', sellerUrl: 'https://example.test/lola', reference: 'TEST01',
      checkIn: '2026-12-08', checkOut: '2026-12-10', checkInTime: '14:00', checkOutTime: '11:00', room: 'Dorm', guests: '2', rooms: '1',
      total: '100.5', currency: 'EUR', paid: '20', dkk: '750', refundable: 'yes', cancelUntil: '2026-12-05',
      mailUrl: 'https://mail.google.com/mail/u/0/#inbox/x', address: '',
    })
  })

  it('leaves dkk empty for a kroner booking and defaults the currency', () => {
    const f = stayFormOf(target, { price: 900, currency: 'DKK', price_dkk: 900 } as Booking)
    expect(f).toMatchObject({ total: '900', currency: 'DKK', dkk: '' })
    expect(stayFormOf(target, { check_in: null, check_out: null } as Booking).currency).toBe('DKK')
  })
})

describe('formChange', () => {
  it('changes nothing for an empty form but its dates', () => {
    const r = change(form({ checkIn: '', checkOut: '' }))
    expect(r.change).toEqual({})
    expect(r.address).toBeNull()
  })

  it('takes the total as the kroner price when the currency is DKK', () => {
    expect(change(form({ total: '1 220', currency: 'DKK', dkk: '5' })).change).toMatchObject({ price: 1220, currency: 'DKK', price_dkk: 1220 })
  })

  it('takes the typed kroner for another currency, or null', () => {
    expect(change(form({ total: '106.754,76', currency: 'COP', dkk: '1 700' })).change).toMatchObject({ price: 106754.76, currency: 'COP', price_dkk: 1700 })
    expect(change(form({ total: '80', currency: 'eur' })).change).toMatchObject({ price: 80, currency: 'EUR', price_dkk: null })
  })

  it('keeps what was paid and refuses more paid than the total', () => {
    expect(change(form({ total: '80', currency: 'EUR', paid: '10' })).change.paid).toBe(10)
    expect(refused(form({ total: '80', currency: 'EUR', paid: '81' }))).toBe('The amount paid cannot be more than the total.')
  })

  it('refuses an amount that is not a number', () => {
    expect(refused(form({ total: 'cheap' }))).toBe('The total needs to be a number.')
  })

  it('needs check-out after check-in and times as HH:MM', () => {
    expect(refused(form({ checkIn: '2026-12-10', checkOut: '2026-12-10' }))).toBe('Check-out needs to be after check-in.')
    expect(refused(form({ checkInTime: '3pm' }))).toBe('Times need to be written like 15:00.')
    expect(change(form({ checkInTime: '15:00', checkOutTime: '11:30' })).change).toMatchObject({ check_in_time: '15:00', check_out_time: '11:30', check_in: '2026-12-08', check_out: '2026-12-11' })
  })

  it('needs a name and an http link for another provider', () => {
    expect(refused(form({ provider: 'other', seller: '', sellerUrl: 'https://example.test' }))).toBe('Name the provider.')
    expect(refused(form({ provider: 'other', seller: 'Casa Lola direct', sellerUrl: '' }))).toMatch(/link/)
    expect(refused(form({ provider: 'other', seller: 'Casa Lola direct', sellerUrl: 'ftp://example.test' }))).toMatch(/link/)
    expect(change(form({ provider: 'other', seller: 'Casa Lola direct', sellerUrl: 'https://example.test/lola' })).change).toMatchObject({ provider: 'other', seller: 'Casa Lola direct', seller_url: 'https://example.test/lola' })
  })

  it('names the provider and clears the link for a site', () => {
    expect(change(form({ provider: 'hostelworld', seller: 'old', sellerUrl: 'https://x.test' })).change).toMatchObject({ provider: 'hostelworld', seller: 'Hostelworld', seller_url: null })
    expect(change(form({ provider: 'booking' })).change.seller).toBe('Booking.com')
    expect(change(form({ provider: 'airbnb' })).change.seller).toBe('Airbnb')
    expect(change(form({ provider: 'own', seller: 'Casa Lola' })).change).toMatchObject({ provider: 'own', seller: 'Casa Lola', seller_url: null })
  })

  it('sets refundable yes with a cancel date unless it is set', () => {
    expect(change(form({ cancelUntil: '2026-12-05' })).change).toMatchObject({ cancel_until: '2026-12-05', refundable: 'yes' })
    expect(change(form({ cancelUntil: '2026-12-05', refundable: 'partly' })).change.refundable).toBe('partly')
    expect(change(form({ refundable: 'no' })).change).toMatchObject({ refundable: 'no' })
  })

  it('takes only an https mail link', () => {
    expect(change(form({ mailUrl: 'https://mail.google.com/mail/u/0/#inbox/x' })).change.mail_url).toBe('https://mail.google.com/mail/u/0/#inbox/x')
    expect(refused(form({ mailUrl: 'http://mail.test/x' }))).toBe('The mail link needs to start with https.')
  })

  it('maps room, guests, rooms and reference', () => {
    expect(change(form({ room: ' Dorm ', guests: '2', rooms: '1', reference: ' TEST01 ' })).change).toMatchObject({ room_name: 'Dorm', travellers: 2, rooms: 1, reference: 'TEST01' })
    expect(refused(form({ guests: 'two' }))).toBe('Guests need to be a whole number.')
  })

  it('hands back the address apart from the change', () => {
    const r = change(form({ address: ' 1 Test Street ' }))
    expect(r.address).toBe('1 Test Street')
    expect(r.change).not.toHaveProperty('address')
  })
})
