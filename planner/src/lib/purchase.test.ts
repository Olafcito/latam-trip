import { describe, expect, it } from 'vitest'
import type { Booking } from '../data/types'
import { airlineLogo, codeOfName, codeOfNumber, codesOf, flightLabel, flightsOf, mailLink, photoOf, relationOf, sellerLogo, ticketRows, waitHours, type PlaceData } from './purchase'

const row = (over: Partial<Booking>): Booking => ({
  id: 'r1', kind: 'flight', status: 'booked', from_code: 'AAA', to_code: 'CCC', depart: '2026-12-08T10:00', arrive: '2026-12-08T18:00',
  place_id: null, check_in: null, check_out: null, lodging_id: null, room_id: null, reference: 'TEST01', seller: null, seller_reference: null,
  fare: null, url: null, price_dkk: null, price: null, currency: null, refundable: null, changeable: null, change_until: null, cancel_until: null,
  cabin_bag: null, checked_bag: null, segments: null, travellers: 1, trip_id: null, ticket: null, source: 'manual', notes: null, attachments: [],
  created_at: '', updated_at: '', ...over,
})

describe('flightsOf', () => {
  it('reads each segment with its airline code from the number', () => {
    const f = flightsOf(row({ segments: [
      { from: 'AAA', to: 'BBB', depart: '2026-12-08T10:00', arrive: '2026-12-08T12:00', carrier: 'JetSMART', number: 'JA1234' },
      { origin: 'BBB', destination: 'CCC', depart: '2026-12-08T15:00', arrive: '2026-12-08T18:00', airline: 'LATAM', flight: '4321', operated_by: 'Partner Air' },
    ] }))
    expect(f.map((x) => [x.from, x.to, x.code, x.operatedBy])).toEqual([['AAA', 'BBB', 'JA', null], ['BBB', 'CCC', 'LA', 'Partner Air']])
    expect(flightLabel(f[1])).toBe('LA4321')
  })
  it('makes one flight of a row without segments, and none of a row without ends', () => {
    expect(flightsOf(row({})).map((x) => `${x.from}-${x.to}`)).toEqual(['AAA-CCC'])
    expect(flightsOf(row({ from_code: null }))).toEqual([])
  })
  it('skips segments that do not name both ends', () => {
    expect(flightsOf(row({ segments: [{ from: 'AAA' }, null, 'x'] }))).toHaveLength(1)
  })
  it('lists the codes a journey passes', () => {
    expect(codesOf(flightsOf(row({ segments: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }] })))).toEqual(['A', 'B', 'C'])
  })
})

describe('codes and logos', () => {
  it('reads an airline code from a number or a name', () => {
    expect(codeOfNumber('kl 1266')).toBe('KL')
    expect(codeOfNumber('1266')).toBeNull()
    expect(codeOfName('Copa Airlines')).toBe('CM')
    expect(codeOfName('Aeroméxico')).toBe('AM')
    expect(codeOfName('Some Air')).toBeNull()
  })
  it('finds a logo file for a known airline or seller and none for an unknown one', () => {
    // a small file is inlined, a bigger one is an address, so the tests ask that there is one and which
    expect(airlineLogo('KL')).toBeTruthy()
    expect(airlineLogo(null, 'JetSMART')).toBeTruthy()
    expect(airlineLogo('ZZ')).toBeNull()
    expect(sellerLogo('LATAM')).toBe(airlineLogo('LA', null, { mark: true }))
    expect(airlineLogo('LA', null, { on: 'dark' })).not.toBe(airlineLogo('LA'))
    expect(airlineLogo('JA', null, { on: 'dark' })).not.toBe(airlineLogo('JA'))
    expect(sellerLogo('Booking.com')).toBeTruthy()
    expect(sellerLogo('Travellink.dk')).toBeTruthy()
    expect(sellerLogo('Travellink')).toBe(sellerLogo('Travellink.dk'))
    for (const n of ['Airbnb', 'Hotels.com', 'Tripadvisor', 'Trip.com', 'Trivago', 'Google Hotels', 'Hilton', 'Marriott']) expect(sellerLogo(n)).toBeTruthy()
    expect(sellerLogo('Some Agent')).toBeNull()
  })
})

describe('the purchase', () => {
  const a = row({ id: 'a', ticket: 't', depart: '2026-12-03T09:00' })
  const b = row({ id: 'b', ticket: 't', depart: '2026-12-08T10:00' })
  const gone = row({ id: 'c', ticket: 't', status: 'cancelled' })
  const other = row({ id: 'd', ticket: 'u' })
  it('lists the other booked rows of the ticket in the order they fly', () => {
    expect(ticketRows(b, [b, gone, other, a]).map((r) => r.id)).toEqual(['a'])
    expect(ticketRows(row({ ticket: null }), [a, b])).toEqual([])
  })
  it('calls another row a return only through the trip ways, never from the ticket alone', () => {
    expect(relationOf(a, b)).toBe('also')
    expect(relationOf(a, b, { in: a, home: b })).toBe('return')
    expect(relationOf(b, a, { in: a, home: b })).toBe('outbound')
    expect(relationOf(a, b, { in: a, home: null })).toBe('also')
  })
})

describe('places', () => {
  const data: PlaceData = {
    inout: { airports: { CPH: { name: 'Copenhagen (Denmark)', lat: 55.6, lon: 12.6 }, CTG: { name: 'Cartagena airport', lat: 10.4, lon: -75.5, map_node: 'ctg' } } },
    map: { nodes: [
      { id: 'ctg', iata: null, name: 'Cartagena', lat: 10.4, lon: -75.5, profile: { image: { url: 'https://upload.example/ctg.jpg', credit: 'Someone' } } },
      { id: 'smr', iata: 'SMR', name: 'Santa Marta', lat: 11.1, lon: -74.2, profile: { image: { url: 'javascript:alert(1)' } } },
    ] },
  }
  it('takes a photo only from an https address', () => {
    expect(photoOf('CTG', data)?.url).toBe('https://upload.example/ctg.jpg')
    expect(photoOf('SMR', data)).toBeNull()
    expect(photoOf('CPH', data)).toBeNull()
  })
})

describe('links and waits', () => {
  it('opens a mail only from an https address', () => {
    expect(mailLink({ mail_url: ' https://mail.google.com/mail/u/0/#all/TEST01 ' })).toBe('https://mail.google.com/mail/u/0/#all/TEST01')
    expect(mailLink({ mail_url: 'javascript:alert(1)' })).toBeNull()
    expect(mailLink({})).toBeNull()
  })
  it('measures the wait at an airport from two local times', () => {
    expect(waitHours('2026-12-08T12:00', '2026-12-08T15:30')).toBe(3.5)
    expect(waitHours('2026-12-08', '2026-12-08T15:00')).toBeNull()
  })
})
