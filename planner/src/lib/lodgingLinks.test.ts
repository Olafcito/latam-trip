import { describe, expect, it } from 'vitest'
import { datedLink, safeUrl, siteOf } from './lodgingLinks'

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

describe('an address a place may link to or load', () => {
  it('takes https with a host, trimmed', () => {
    expect(safeUrl(' https://test01.example/a.jpg ')).toBe('https://test01.example/a.jpg')
    expect(safeUrl('HTTPS://TEST01.EXAMPLE/x')).toBe('HTTPS://TEST01.EXAMPLE/x')
  })

  it('refuses plain http, a bare https://, spaces and any other scheme', () => {
    const bad = ['http://test01.example/a.jpg', 'https://', 'https:// test01.example', 'https://test01 .example', 'javascript:alert(1)', 'data:image/png;base64,AAAA', 'test01.example', '', null, undefined]
    for (const u of bad) expect(safeUrl(u)).toBeNull()
  })
})

describe('a link opened on the nights', () => {
  it('gives Hostelworld its from, to and guests on the pwa page', () => {
    expect(datedLink('https://www.hostelworld.com/pwa/hosteldetails.php/TEST01-Hostel/Testville/123456', '2026-12-03', '2026-12-08'))
      .toBe('https://www.hostelworld.com/pwa/hosteldetails.php/TEST01-Hostel/Testville/123456?from=2026-12-03&to=2026-12-08&guests=1&origin=microsite')
    expect(datedLink('https://www.hostelworld.com/hosteldetails.php/TEST01/Testville/123456?from=2026-01-01&to=2026-01-02', '2026-12-03', '2026-12-08', 2))
      .toBe('https://www.hostelworld.com/pwa/hosteldetails.php/TEST01/Testville/123456?from=2026-12-03&to=2026-12-08&guests=2&origin=microsite')
  })
  it('gives Booking.com and Airbnb their own names for the same', () => {
    expect(datedLink('https://www.booking.com/hotel/co/test01.html', '2026-12-03', '2026-12-08'))
      .toBe('https://www.booking.com/hotel/co/test01.html?checkin=2026-12-03&checkout=2026-12-08&group_adults=1&no_rooms=1&group_children=0')
    expect(datedLink('https://www.airbnb.dk/rooms/1', '2026-12-03', '2026-12-08')).toBe('https://www.airbnb.dk/rooms/1?check_in=2026-12-03&check_out=2026-12-08&adults=1')
  })
  it('leaves the place own site, missing or backwards dates and unsafe links as they were', () => {
    expect(datedLink('https://test01.example/rooms', '2026-12-03', '2026-12-08')).toBe('https://test01.example/rooms')
    expect(datedLink('https://www.hostelworld.com/x/1', null, '2026-12-08')).toBe('https://www.hostelworld.com/x/1')
    expect(datedLink('https://www.hostelworld.com/x/1', '2026-12-08', '2026-12-03')).toBe('https://www.hostelworld.com/x/1')
    expect(datedLink('http://www.hostelworld.com/x/1', '2026-12-03', '2026-12-08')).toBeNull()
  })
})
