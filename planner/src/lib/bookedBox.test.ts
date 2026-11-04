import { describe, expect, it } from 'vitest'
import type { Booking } from '../data/types'
import { boxChips, boxFacts, boxHead, boxRows, boxSegments, fileMessage, fileTile, flightHours } from './bookedBox'

// Made up rows only. A real reference, price or name never goes in this file.
const row = (over: Partial<Booking>): Booking => ({
  id: 'b1', kind: 'flight', status: 'booked', from_code: 'CTG', to_code: 'ADZ', depart: '2026-12-03T06:00', arrive: '2026-12-03T07:35',
  place_id: null, check_in: null, check_out: null, lodging_id: null, room_id: null, reference: 'TEST01', seller: null,
  url: null, price_dkk: null, price: null, currency: null, refundable: null, changeable: null, change_until: null,
  cancel_until: null, cabin_bag: null, checked_bag: null, segments: null, travellers: 1, trip_id: null, ticket: null,
  source: 'manual', notes: null, attachments: [], created_at: '2026-11-03T10:00:00Z', updated_at: '2026-11-03T10:00:00Z',
  ...over,
})

const city = (code: string) => ({ CTG: 'Cartagena', ADZ: 'San Andrés', BOG: 'Bogotá' })[code] ?? null

describe('boxHead', () => {
  it('reads the codes, the cities, the day and the times from the booking alone', () => {
    expect(boxHead(row({}), city)).toEqual({
      from: { code: 'CTG', city: 'Cartagena', time: '06:00' },
      to: { code: 'ADZ', city: 'San Andrés', time: '07:35', mark: '' },
      day: 'Thu 3 Dec',
    })
  })

  it('marks an arrival on a later day and leaves out what it does not know', () => {
    const h = boxHead(row({ from_code: 'XXX', depart: '2026-12-03', arrive: '2026-12-04T01:10' }), city)
    expect(h.from).toEqual({ code: 'XXX', city: null, time: null })
    expect(h.to.mark).toBe('+1')
    expect(h.day).toBe('Thu 3 Dec')
  })

  it('keeps the box whole when the booking has no ends or days', () => {
    const h = boxHead(row({ from_code: null, to_code: null, depart: null, arrive: null }), city)
    expect(h.from.code).toBe('')
    expect(h.day).toBe(null)
    expect(h.to).toEqual({ code: '', city: null, time: null, mark: '' })
  })
})

describe('boxFacts', () => {
  it('shows nothing when nothing is set, and one traveller is not worth a row', () => {
    expect(boxFacts(row({}))).toEqual([])
    expect(boxFacts(row({ travellers: 0 }))).toEqual([])
  })

  it('keeps the order seller, price paid, bags, refundable, changeable, travellers', () => {
    const facts = boxFacts(row({
      seller: 'Test Air', price_dkk: 1234, cabin_bag: '1 x 8 kg', checked_bag: '1 x 23 kg', refundable: 'partly', cancel_until: '2026-11-30',
      changeable: 'fee', change_until: '2026-12-01', travellers: 2,
    }))
    expect(facts).toEqual([
      { key: 'seller', label: 'Seller', value: 'Test Air' },
      { key: 'paid', label: 'Price paid', value: '1.234 kr' },
      { key: 'cabin', label: 'Cabin bag', value: '1 x 8 kg' },
      { key: 'checked', label: 'Checked bag', value: '1 x 23 kg' },
      { key: 'refundable', label: 'Refundable', value: 'Partly, until Mon 30 Nov' },
      { key: 'changeable', label: 'Changeable', value: 'For a fee, until Tue 1 Dec' },
      { key: 'travellers', label: 'Travellers', value: '2' },
    ])
  })

  it('never shows a price row for a null price, and never 0 kr', () => {
    expect(boxFacts(row({ price_dkk: null })).some((f) => f.key === 'paid')).toBe(false)
    expect(boxFacts(row({ price_dkk: 0 })).some((f) => f.key === 'paid')).toBe(false)
    expect(boxFacts(row({ price_dkk: 0 })).map((f) => f.value).join(' ')).not.toMatch(/0 kr/)
  })

  it('says a second row of a shared ticket was paid on the first', () => {
    expect(boxFacts(row({ price_dkk: 0, ticket: 'T1' })).find((f) => f.key === 'paid')).toEqual({ key: 'paid', label: 'Price paid', value: 'On the shared ticket' })
  })

  it('adds the amount in its own currency when it was paid in another', () => {
    expect(boxFacts(row({ price_dkk: 700, price: 100, currency: 'USD' }))[0].value).toBe('700 kr, paid as 100 USD')
    expect(boxFacts(row({ price_dkk: 9100, price: 1250.5, currency: 'eur' }))[0].value).toBe('9.100 kr, paid as 1.250,50 EUR')
    expect(boxFacts(row({ price_dkk: 700, price: 700, currency: 'DKK' }))[0].value).toBe('700 kr')
  })

  it('reads yes and no in words, and a last day alone when the answer is unknown', () => {
    const facts = boxFacts(row({ refundable: 'no', changeable: null, change_until: '2026-12-01' }))
    expect(facts.find((f) => f.key === 'refundable')?.value).toBe('No')
    expect(facts.find((f) => f.key === 'changeable')?.value).toBe('Until Tue 1 Dec')
  })

  it('drops a blank seller or bag', () => {
    expect(boxFacts(row({ seller: '  ', cabin_bag: '' })).map((f) => f.key)).toEqual([])
  })
})

describe('boxChips', () => {
  it('turns every fact into a short chip, the whole fact kept for its tooltip', () => {
    const chips = boxChips(row({
      seller: 'Test Air', price_dkk: 700, price: 100, currency: 'USD', cabin_bag: 'Included', checked_bag: 'Not included',
      refundable: 'partly', cancel_until: '2026-11-30', changeable: 'fee', change_until: '2026-12-01', travellers: 2,
    }))
    expect(chips).toEqual([
      { key: 'seller', text: 'Test Air', label: 'Seller, Test Air' },
      { key: 'paid', text: '700 kr', label: 'Price paid, 700 kr, paid as 100 USD' },
      { key: 'cabin', text: 'Included', tone: 'ok', label: 'Cabin bag, Included' },
      { key: 'checked', text: 'Not included', tone: 'no', label: 'Checked bag, Not included' },
      { key: 'refundable', text: 'Part refund', until: 'Mon 30 Nov', tone: 'part', label: 'Refundable, Partly, until Mon 30 Nov' },
      { key: 'changeable', text: 'Change for a fee', until: 'Tue 1 Dec', tone: 'part', label: 'Changeable, For a fee, until Tue 1 Dec' },
      { key: 'travellers', text: '2', label: 'Travellers, 2' },
    ])
  })

  it('reads yes and no as a word on the chip', () => {
    const c = boxChips(row({ refundable: 'yes', changeable: 'no' }))
    expect(c.map((x) => [x.text, x.tone])).toEqual([['Refundable', 'ok'], ['No changes', 'no']])
    const n = boxChips(row({ refundable: 'no', changeable: 'yes', change_until: '2026-12-01' }))
    expect(n.map((x) => [x.text, x.tone, x.until])).toEqual([['No refund', 'no', undefined], ['Changeable', 'ok', 'Tue 1 Dec']])
  })

  it('keeps a last day with no answer, and names a second row of a shared ticket', () => {
    expect(boxChips(row({ cancel_until: '2026-11-30' }))).toEqual([{ key: 'refundable', text: 'Refund', until: 'Mon 30 Nov', label: 'Refundable, Until Mon 30 Nov' }])
    expect(boxChips(row({ price_dkk: 0, ticket: 'T1' }))[0]).toEqual({ key: 'paid', text: 'Shared ticket', label: 'Price paid, On the shared ticket' })
  })

  it('has no chips when nothing is set', () => {
    expect(boxChips(row({}))).toEqual([])
  })
})

describe('boxSegments', () => {
  it('is empty without segments, or with one flight only', () => {
    expect(boxSegments(row({}))).toEqual([])
    expect(boxSegments(row({ segments: [{ from: 'CTG', to: 'ADZ', depart: '2026-12-03T06:00', arrive: '2026-12-03T07:35' }] }))).toEqual([])
  })

  it('puts the time in each airport between the flights', () => {
    const b = row({ segments: [
      { from: 'CTG', to: 'BOG', depart: '2026-12-03T06:00', arrive: '2026-12-03T07:30', carrier: 'Test Air', number: 'TA 1' },
      { from: 'BOG', to: 'ADZ', depart: '2026-12-03T09:40', arrive: '2026-12-03T11:55', airline: 'Test Air', flight: 'TA 2' },
    ] })
    expect(boxSegments(b)).toEqual([
      { kind: 'flight', from: 'CTG', to: 'BOG', depart: '06:00', arrive: '07:30', mark: '', what: 'Test Air TA 1' },
      { kind: 'stop', airport: 'BOG', time: '2h 10m' },
      { kind: 'flight', from: 'BOG', to: 'ADZ', depart: '09:40', arrive: '11:55', mark: '', what: 'Test Air TA 2' },
    ])
  })

  it('takes a stated layover when the times are missing, and leaves a stop without a time when neither is there', () => {
    const b = row({ segments: [
      { origin: 'CTG', destination: 'BOG', layover_h: 1.5 },
      { origin: 'BOG', destination: 'PTY' },
      { origin: 'PTY', destination: 'ADZ' },
    ] })
    const stops = boxSegments(b).filter((s) => s.kind === 'stop')
    expect(stops).toEqual([{ kind: 'stop', airport: 'BOG', time: '1h 30m' }, { kind: 'stop', airport: 'PTY', time: '' }])
  })

  it('marks a flight that lands on a later day, and skips entries that are not flights', () => {
    const b = row({ segments: [
      'not a flight', null,
      { from: 'CTG', to: 'BOG', depart: '2026-12-03T23:00', arrive: '2026-12-04T00:30' },
      { from: 'BOG', to: 'ADZ', depart: '2026-12-04T06:00', arrive: '2026-12-04T08:00' },
    ] })
    const s = boxSegments(b)
    expect(s).toHaveLength(3)
    expect(s[0]).toMatchObject({ kind: 'flight', mark: '+1', what: '' })
    expect(s[1]).toEqual({ kind: 'stop', airport: 'BOG', time: '5h 30m' })
  })
})

describe('boxSegments with one flight', () => {
  it('shows a lone flight when it names its airline or number, and nothing for a bare one', () => {
    const one = row({ segments: [{ from: 'CTG', to: 'ADZ', depart: '2026-12-03T06:00', arrive: '2026-12-03T07:35', carrier: 'Test Air', number: 'TA 1' }] })
    expect(boxSegments(one, { single: true })).toEqual([{ kind: 'flight', from: 'CTG', to: 'ADZ', depart: '06:00', arrive: '07:35', mark: '', what: 'Test Air TA 1' }])
    expect(boxSegments(one)).toEqual([])
    expect(boxSegments(row({ segments: [{ from: 'CTG', to: 'ADZ' }] }), { single: true })).toEqual([])
  })
})

describe('flightHours', () => {
  const offset = (code: string) => ({ CTG: -5, ADZ: -5, MAD: 1, BOG: -5 })[code] ?? null

  it('takes the time between the local stamps and the offsets of the two airports', () => {
    expect(flightHours(row({}), offset)).toBeCloseTo(1 + 35 / 60)
    expect(flightHours(row({ from_code: 'MAD', to_code: 'BOG', depart: '2026-12-03T12:00', arrive: '2026-12-03T16:30' }), offset)).toBeCloseTo(10.5)
  })

  it('is null without both offsets, without times, or when it would be negative', () => {
    expect(flightHours(row({ to_code: 'XXX' }), offset)).toBe(null)
    expect(flightHours(row({ depart: '2026-12-03' }), offset)).toBe(null)
    expect(flightHours(row({ arrive: '2026-12-03T05:00' }), offset)).toBe(null)
  })
})

describe('boxRows', () => {
  const second = row({ id: 'b2', from_code: 'ADZ', to_code: 'SMR', depart: '2026-12-09T10:00', arrive: '2026-12-09T11:30', ticket: 'G1', price_dkk: 0 })
  const first = row({ ticket: 'G1', price_dkk: 2400, price: 320, currency: 'EUR', seller: 'Test Seller', seller_reference: 'TEST02' })

  it('shows nothing when nothing is set', () => {
    expect(boxRows(row({}), [row({})])).toEqual([])
  })

  it('names the seller with its own number to copy', () => {
    const r = boxRows(row({ seller: 'Test Seller', seller_reference: 'TEST02' }), [])
    expect(r[0]).toEqual({ key: 'seller', label: 'Booked through', value: 'Test Seller', mono: 'TEST02' })
  })

  it('shows the ticket total on every flight of it, with the amount paid in its own currency and how many it covers', () => {
    const list = [first, second]
    expect(boxRows(second, list).find((x) => x.key === 'paid')).toEqual({ key: 'paid', label: 'Paid', value: '2.400 kr', more: ['320 EUR', 'For 2 flights'] })
    expect(boxRows(first, list).find((x) => x.key === 'paid')?.value).toBe('2.400 kr')
  })

  it('lists the other flights on the same ticket with their codes and day', () => {
    const r = boxRows(first, [first, second, row({ id: 'gone', ticket: 'G1', status: 'cancelled' })]).find((x) => x.key === 'ticket')
    expect(r).toEqual({ key: 'ticket', label: 'Same ticket', value: 'ADZ to SMR', more: ['Wed 9 Dec'] })
  })

  it('gives the fare, the bags, the rules and more than one traveller as rows', () => {
    const keys = boxRows(row({ fare: 'Light', cabin_bag: '8 kg', checked_bag: '23 kg', refundable: 'no', changeable: 'fee', change_until: '2026-12-01', travellers: 2 }), []).map((x) => [x.key, x.value])
    expect(keys).toEqual([
      ['fare', 'Light'], ['cabin', '8 kg'], ['checked', '23 kg'], ['refundable', 'No'], ['changeable', 'For a fee, until Tue 1 Dec'], ['travellers', '2'],
    ])
  })

  it('reads a price paid in kroner alone, and never 0 kr', () => {
    expect(boxRows(row({ price_dkk: 700, currency: 'DKK', price: 700 }), [])[0]).toEqual({ key: 'paid', label: 'Paid', value: '700 kr' })
    expect(boxRows(row({ price_dkk: 0 }), [])).toEqual([])
  })
})

describe('fileMessage', () => {
  const file = (name: string, type: string, size: number) => ({ name, type, size })

  it('takes a small PDF or photo', () => {
    expect(fileMessage(file('ticket.pdf', 'application/pdf', 2000))).toBe(null)
    expect(fileMessage(file('pass.jpg', 'image/jpeg', 2000))).toBe(null)
  })

  it('refuses a file over 10 MB in a plain sentence', () => {
    expect(fileMessage(file('big.pdf', 'application/pdf', 10 * 1024 * 1024 + 1))).toBe('big.pdf is over 10 MB, so it cannot be added.')
  })

  it('refuses another type in a plain sentence', () => {
    expect(fileMessage(file('notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 2000))).toBe('notes.docx is not a PDF or a photo, so it cannot be added.')
  })

  it('asks for a file when none was chosen', () => {
    expect(fileMessage(null)).toBe('Choose a PDF or a photo to add.')
  })
})

describe('fileTile', () => {
  it('names the kind and the size of a file', () => {
    expect(fileTile({ path: 'b1/ticket.pdf', name: 'ticket.pdf', type: 'application/pdf', size: 52_000, added_at: '' })).toEqual({ kind: 'PDF', size: '51 KB' })
    expect(fileTile({ path: 'b1/p.jpg', name: 'p.jpg', type: 'image/jpeg', size: 2_500_000, added_at: '' })).toEqual({ kind: 'Photo', size: '2,4 MB' })
    expect(fileTile({ path: 'b1/x', name: 'x', type: 'text/plain', size: null, added_at: '' })).toEqual({ kind: 'File', size: '' })
  })
})
