import { describe, expect, it } from 'vitest'
import { bookedMoney, cardProvider, freeCancel } from './stayCard'

const place = {
  name: 'TEST01 Hostel',
  links: [
    { site: 'hostelworld' as const, url: 'https://www.hostelworld.com/test01' },
    { site: 'booking' as const, url: 'https://www.booking.com/hotel/test01.html' },
  ],
}
const none = { provider: null, seller: null, seller_url: null, url: null }

describe('cardProvider', () => {
  it('names the site the stay was booked on and opens the place there', () => {
    const p = cardProvider(place, { ...none, provider: 'booking' }, null)
    expect(p).toMatchObject({ name: 'Booking.com', url: 'https://www.booking.com/hotel/test01.html' })
  })

  it('falls back to where the price was seen, then the room, then the first link', () => {
    expect(cardProvider(place, null, { site: 'booking' })?.name).toBe('Booking.com')
    expect(cardProvider(place, null, null, { site: 'booking' })?.name).toBe('Booking.com')
    expect(cardProvider(place, null, null)).toMatchObject({ name: 'Hostelworld', url: 'https://www.hostelworld.com/test01' })
  })

  it('opens the booking page when the place has no link on that site', () => {
    const p = cardProvider({ name: 'TEST01', links: [] }, { ...none, provider: 'airbnb', url: 'https://www.airbnb.com/rooms/1' }, null)
    expect(p).toMatchObject({ name: 'Airbnb', url: 'https://www.airbnb.com/rooms/1' })
  })

  it('names another provider by its seller and gives no link that is not http', () => {
    const p = cardProvider({ name: 'TEST01', links: [] }, { ...none, provider: 'other', seller: 'Casa TEST01', seller_url: 'javascript:alert(1)' }, null)
    expect(p).toEqual({ name: 'Casa TEST01', logo: null, url: null })
  })

  it('names the own site by the place', () => {
    expect(cardProvider({ name: 'TEST01 Hostel', links: [{ site: 'own', url: 'https://test01.example' }] }, null, null)).toEqual({ name: 'TEST01 Hostel', logo: null, url: 'https://test01.example' })
  })

  it('gives nothing when no provider and no page is known', () => {
    expect(cardProvider({ name: 'TEST01', links: [] }, none, null)).toBeNull()
    expect(cardProvider(undefined, null, null)).toBeNull()
  })
})

describe('freeCancel', () => {
  it('shows only a stay that cancels for free', () => {
    expect(freeCancel('yes', null)).toBe('Free cancellation')
    expect(freeCancel(null, '2026-12-08')).toMatch(/^Free cancellation until /)
    expect(freeCancel('no', '2026-12-08')).toBeNull()
    expect(freeCancel('partly', '2026-12-08')).toBeNull()
    expect(freeCancel(null, null)).toBeNull()
  })
})

describe('bookedMoney', () => {
  it('leads with the kroner paid', () => {
    expect(bookedMoney({ price: 300, currency: 'USD' }, 1220, 5)).toEqual({ money: { perNight: 244, total: 1220, exact: true }, currency: 'DKK' })
  })

  it('keeps a foreign price in its own currency, never converted', () => {
    expect(bookedMoney({ price: 180, currency: 'usd' }, null, 3)).toEqual({ money: { perNight: 60, total: 180, exact: true }, currency: 'USD' })
  })

  it('gives no figure when nothing is known', () => {
    expect(bookedMoney({ price: null, currency: null }, null, 3).money).toEqual({ perNight: null, total: null, exact: true })
    expect(bookedMoney({ price: 180, currency: null }, null, 3).money.total).toBeNull()
  })
})
