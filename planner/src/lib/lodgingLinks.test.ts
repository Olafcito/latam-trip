import { describe, expect, it } from 'vitest'
import { nameOfLink, safeUrl, searchLinks, siteOf } from './lodgingLinks'

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

describe('the name in a link', () => {
  it('reads a Booking.com address, its country and language parts left out', () => {
    expect(nameOfLink('https://www.booking.com/hotel/co/test01-patio-hostel.en-gb.html?aid=1&checkin=2026-12-02')).toBe('Test01 Patio Hostel')
    expect(nameOfLink('https://www.booking.com/hotel/gt/casa-test01.html')).toBe('Casa Test01')
  })
  it('reads a Hostelworld address in both its shapes', () => {
    expect(nameOfLink('https://www.hostelworld.com/hostels/p/313343/test01-viajero-hostel/')).toBe('Test01 Viajero Hostel')
    expect(nameOfLink('https://www.hostelworld.com/st/hostels/p/313343/test01-viajero-hostel/?from=2026-12-02')).toBe('Test01 Viajero Hostel')
    expect(nameOfLink('https://www.hostelworld.com/pwa/hosteldetails.php/Test01-Mango-Hostel/Cartagena/12345')).toBe('Test01 Mango Hostel')
  })
  it('gives nothing for a link with no name in it', () => {
    expect(nameOfLink('https://www.airbnb.com/rooms/12345')).toBeNull()
    expect(nameOfLink('https://www.booking.com/searchresults.html?ss=Cartagena')).toBeNull()
    expect(nameOfLink('https://test01.example/')).toBeNull()
    expect(nameOfLink('not a link')).toBeNull()
  })
})

describe('a search for a place to stay', () => {
  it('opens Booking.com and Hostelworld on the city and the nights', () => {
    const s = searchLinks('Cartagena', 'Colombia', '2026-12-02', '2026-12-04')
    const b = new URL(s.booking)
    expect(b.hostname).toBe('www.booking.com')
    expect(b.searchParams.get('ss')).toBe('Cartagena, Colombia')
    expect(b.searchParams.get('checkin')).toBe('2026-12-02')
    expect(b.searchParams.get('checkout')).toBe('2026-12-04')
    expect(b.searchParams.get('group_adults')).toBe('1')
    const h = new URL(s.hostelworld)
    expect(h.hostname).toBe('www.hostelworld.com')
    expect(h.searchParams.get('search_keywords')).toBe('Cartagena, Colombia')
    expect(h.searchParams.get('date_from')).toBe('2026-12-02')
    expect(h.searchParams.get('date_to')).toBe('2026-12-04')
  })
  it('searches the city alone with no dates', () => {
    const s = searchLinks('Cartagena', null, null, null)
    expect(new URL(s.booking).searchParams.get('ss')).toBe('Cartagena')
    expect(new URL(s.booking).searchParams.has('checkin')).toBe(false)
    expect(new URL(s.hostelworld).searchParams.has('date_from')).toBe(false)
  })
})
