import { describe, expect, it } from 'vitest'
import { siteOf } from './lodgingLinks'

// Made up addresses only.

describe('the site of a link', () => {
  it('knows Booking.com, Hostelworld and Airbnb by their host', () => {
    expect(siteOf('https://www.booking.com/hotel/cr/test01-casa.html')).toBe('booking')
    expect(siteOf('https://www.hostelworld.com/pwa/hosteldetails.php/TEST01/12345')).toBe('hostelworld')
    expect(siteOf('https://www.airbnb.dk/rooms/12345')).toBe('airbnb')
    expect(siteOf('https://airbnb.com/rooms/12345')).toBe('airbnb')
  })

  it('counts a sub domain of the site, and the host in any case', () => {
    expect(siteOf('https://secure.booking.com/x')).toBe('booking')
    expect(siteOf('HTTPS://WWW.HOSTELWORLD.COM/x')).toBe('hostelworld')
  })

  it('takes anything else as the place own site', () => {
    expect(siteOf('https://test01-casa.example/rooms')).toBe('own')
    expect(siteOf('https://notbooking.com/hotel')).toBe('own')
    expect(siteOf('https://booking.com.example.net/x')).toBe('own')
    expect(siteOf('not a link')).toBe('own')
    expect(siteOf('')).toBe('own')
  })
})
