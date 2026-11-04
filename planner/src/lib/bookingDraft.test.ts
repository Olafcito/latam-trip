import { describe, expect, it } from 'vitest'
import type { CrawledFlight, InOut, Ticket, Way } from '../data/types'
import { blank, formRows, fromPicked, fromRow, manualRows, rowsOf, savedRow, wayRebookIds, withIds, withSaved, type DraftLeg } from './bookingDraft'
import { keepPaid, paidPrice } from './booked'
import type { Booking } from '../data/types'
import { bookingTask } from './tasks'

// Made up flights and tickets only. A real reference, price or name never goes in this file.

const regional: CrawledFlight = {
  quote_id: 'q1', depart: '2026-12-20T10:05', arrive: '2026-12-20T15:40', hours: 5.6, price_dkk: 1490,
  carriers: ['Test Air'], via: ['BOG'], layover_h: [1.5], cabin_bag: 'included', checked_bag: '1 x 23 kg', source: 'momondo',
}
const leg: DraftLeg = { kind: 'flight', from: 'MDE', to: 'VVI', day: '2026-12-20', tripId: 'jtest' }

const ticket = (id: string, price: number, over: Partial<Ticket> = {}): Ticket => ({
  id, quote_id: id, source: 'test', observed_at: '2026-10-01T10:00Z', structure: 'open_jaw', legs: [], price_dkk: price, fare_brand: null,
  cabin_bag: 'included', checked_bag: 'not included', cabin_bag_fee_dkk: 0, checked_bag_fee_dkk: 300, tickets_inside: 1, self_transfer: false,
  carriers: ['Test Air'], flags: [], notes: null, link: null, ...over,
})
const way = (over: Partial<Way>): Way => ({
  id: 'I1', direction: 'in', type: 'ticket', from: 'CPH', to: 'CTG', depart: '2026-12-02T06:00', arrive: '2026-12-02T18:30',
  total_hours: 18.5, flying_hours: 15, flights: 2, hub_nights: 0, changes: 1, us_transit: false, airports: ['CPH', 'AMS', 'CTG'],
  tickets: ['T1'], shared_ticket: null, paired_with: 'H1', price_dkk: 0,
  extras: { cabin_bag_fees_dkk: 0, checked_bag_fees_dkk: 300, hub_nights: 0, hub_stay_estimate_dkk: 0 }, score: 5,
  timeline: [
    { kind: 'flight', from: 'CPH', to: 'AMS', depart: '2026-12-02T06:00', arrive: '2026-12-02T07:30', hours: 1.5, connections: [], carriers: ['Test Air'], flight_numbers: ['TA1'], overnight_layover: false, self_transfer_inside: false, ticket: 'T1' },
    { kind: 'connection', airport: 'AMS', arrive: '2026-12-02T07:30', depart: '2026-12-02T09:55', hours: 2.4, nights: 0, same_ticket: true, stay_estimate_dkk: null },
    { kind: 'flight', from: 'AMS', to: 'CTG', depart: '2026-12-02T09:55', arrive: '2026-12-02T18:30', hours: 14.6, connections: [], carriers: ['Test Air'], flight_numbers: ['TA7'], overnight_layover: false, self_transfer_inside: false, ticket: 'T1' },
  ],
  ...over,
})
const wIn = way({})
const wHome = way({
  id: 'H1', direction: 'home', from: 'GUA', to: 'CPH', depart: '2027-02-03T09:05', arrive: '2027-02-04T09:10', paired_with: 'I1',
  timeline: [{ kind: 'flight', from: 'GUA', to: 'CPH', depart: '2027-02-03T09:05', arrive: '2027-02-04T09:10', hours: 18, connections: [{ airport: 'AMS', layover_h: 2 }], carriers: ['Test Air'], overnight_layover: false, self_transfer_inside: false, ticket: 'T1' }],
})
const lone = way({ id: 'O1', type: 'oneways', tickets: ['T2'], paired_with: null })
const inout = { tickets: { T1: ticket('T1', 8235), T2: ticket('T2', 3100) }, ways: { I1: wIn, H1: wHome, O1: lone } } as unknown as InOut

describe('fromPicked', () => {
  it('gives a picked regional flight as one row with its times, airline, stops, price and bags', () => {
    const rows = fromPicked(leg, regional, inout)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: 'flight', source: 'picked', from_code: 'MDE', to_code: 'VVI', depart: '2026-12-20T10:05', arrive: '2026-12-20T15:40',
      price_dkk: 1490, currency: 'DKK', cabin_bag: 'included', checked_bag: '1 x 23 kg', trip_id: 'jtest', ticket: null,
    })
    expect(rows[0].segments).toEqual([
      { from: 'MDE', to: 'BOG', carrier: 'Test Air', depart: '2026-12-20T10:05', layover_h: 1.5 },
      { from: 'BOG', to: 'VVI', carrier: 'Test Air', arrive: '2026-12-20T15:40' },
    ])
  })

  it('keeps the airline of a direct flight in its one segment', () => {
    const rows = fromPicked(leg, { ...regional, via: [], layover_h: [] }, inout)
    expect(rows[0].segments).toEqual([{ from: 'MDE', to: 'VVI', carrier: 'Test Air', depart: '2026-12-20T10:05', arrive: '2026-12-20T15:40' }])
  })

  it('gives a way on a ticket with the other way as two rows of one new ticket, the price on the first', () => {
    const rows = fromPicked({ kind: 'flight', from: 'CPH', to: 'CTG', day: '2026-12-02', tripId: 'jtest' }, wHome, inout)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => [r.from_code, r.to_code, r.depart])).toEqual([['CPH', 'CTG', '2026-12-02T06:00'], ['GUA', 'CPH', '2027-02-03T09:05']])
    expect(rows.map((r) => r.price_dkk)).toEqual([8235, 0])
    expect(rows[0].ticket).toBeTruthy()
    expect(rows[1].ticket).toBe(rows[0].ticket)
    expect(rows.every((r) => r.source === 'picked' && r.cabin_bag === 'included' && r.checked_bag === 'not included')).toBe(true)
    expect(rows[0].segments).toEqual([
      { from: 'CPH', to: 'AMS', carrier: 'Test Air', number: 'TA1', depart: '2026-12-02T06:00', arrive: '2026-12-02T07:30' },
      { from: 'AMS', to: 'CTG', carrier: 'Test Air', number: 'TA7', depart: '2026-12-02T09:55', arrive: '2026-12-02T18:30' },
    ])
    expect(rows[1].segments).toEqual([
      { from: 'GUA', to: 'AMS', carrier: 'Test Air', depart: '2027-02-03T09:05', layover_h: 2 },
      { from: 'AMS', to: 'CPH', carrier: 'Test Air', arrive: '2027-02-04T09:10' },
    ])
    // a second press makes another group, never the same one
    expect(fromPicked(leg, wIn, inout)[0].ticket).not.toBe(rows[0].ticket)
  })

  it('gives a way of its own as one row with no ticket group', () => {
    const rows = fromPicked(leg, lone, inout)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ from_code: 'CPH', to_code: 'CTG', price_dkk: 3100, ticket: null })
  })
})

describe('blank', () => {
  it('holds only the kind, the ends and the day', () => {
    expect(blank({ kind: 'bus', from: 'BOG', to: 'MDE', day: '2026-12-10', tripId: 'jtest' })).toEqual({ kind: 'bus', from_code: 'BOG', to_code: 'MDE', depart: '2026-12-10' })
  })
})

describe('Fill in yourself', () => {
  it('starts from the blank row when nothing is picked', () => {
    expect(manualRows(leg, null)).toEqual([{ kind: 'flight', from_code: 'MDE', to_code: 'VVI', depart: '2026-12-20', source: 'manual', trip_id: 'jtest' }])
  })
  it('starts from the picked flight, the form holding the seller, the bags and the price', () => {
    const [r] = manualRows(leg, fromPicked(leg, { ...regional, site: 'Test Site' }, inout))
    expect(r).toMatchObject({ from_code: 'MDE', to_code: 'VVI', depart: '2026-12-20T10:05', arrive: '2026-12-20T15:40', source: 'manual' })
    expect(r.segments).toHaveLength(2)
    expect(r).not.toHaveProperty('seller')
    expect(r).not.toHaveProperty('price_dkk')
    expect(r).not.toHaveProperty('cabin_bag')
    expect(r).not.toHaveProperty('checked_bag')
  })
  it('takes the link of a way from its ticket, and leaves it to the form', () => {
    const wl: DraftLeg = { kind: 'flight', from: 'CPH', to: 'CTG', day: '2026-12-02', tripId: 'jtest' }
    const linked = { ...inout, tickets: { ...inout.tickets, T1: ticket('T1', 8235, { link: 'https://example.com/fare' }) } } as unknown as InOut
    const picked = fromPicked(wl, wIn, linked)
    expect(picked?.[0].url).toBe('https://example.com/fare')
    expect(manualRows(wl, picked).some((r) => 'url' in r)).toBe(false)
    expect(fromPicked(wl, wIn, inout)?.[0]).not.toHaveProperty('url')
    const odd = { ...inout, tickets: { ...inout.tickets, T1: ticket('T1', 8235, { link: 'javascript:void(0)' }) } } as unknown as InOut
    expect(fromPicked(wl, wIn, odd)?.[0]).not.toHaveProperty('url')
  })
  it('keeps both rows of a way on one ticket with the second at 0', () => {
    const wl: DraftLeg = { kind: 'flight', from: 'CPH', to: 'CTG', day: '2026-12-02', tripId: 'jtest' }
    const rows = manualRows(wl, fromPicked(wl, wIn, inout))
    expect(rows).toHaveLength(2)
    expect(rows[0].ticket).toBe(rows[1].ticket)
    expect(rows[0]).not.toHaveProperty('price_dkk')
    expect(rows[1].price_dkk).toBe(0)
    expect(rows.every(r => r.source === 'manual')).toBe(true)
  })
  it('saves what the form holds once the fields come back', () => {
    const [r] = formRows(manualRows(leg, fromPicked(leg, regional, inout)), { reference: 'TEST01', seller: '', price: '1.490', cabin_bag: 'included', checked_bag: '' })
    expect(r).toMatchObject({ reference: 'TEST01', price_dkk: 1490, cabin_bag: 'included', depart: '2026-12-20T10:05' })
    expect(r).not.toHaveProperty('checked_bag')
  })
})

describe('the form rows', () => {
  it('saves the reference typed on a picked flight on every row of its ticket', () => {
    const rows = formRows(fromPicked(leg, wIn, inout), { reference: ' TEST01 ' })
    expect(rows.map((r) => r.reference)).toEqual(['TEST01', 'TEST01'])
    expect(rows.map((r) => r.price_dkk)).toEqual([8235, 0])
  })

  it('leaves out what is left empty and reads a price in Danish', () => {
    const [r] = formRows([blank(leg)], { reference: '', seller: 'Test Seller', price: '1.250,50', notes: '  ', refundable: '', changeable: 'fee', change_until: '2026-12-01' })
    expect(r).toEqual({ kind: 'flight', from_code: 'MDE', to_code: 'VVI', depart: '2026-12-20', seller: 'Test Seller', price_dkk: 1250.5, changeable: 'fee', change_until: '2026-12-01' })
  })

  it('a day typed in moves the row, and an empty day keeps the leg day', () => {
    expect(formRows([blank(leg)], { day: '2026-12-21' })[0].depart).toBe('2026-12-21')
    expect(formRows([blank(leg)], { day: '' })[0].depart).toBe('2026-12-20')
  })

  it('reads the fields of a booked row back into the form for Edit', () => {
    const f = fromRow({ reference: 'TEST01', seller: null, price_dkk: 700, refundable: 'partly', cancel_until: '2026-11-30', depart: '2026-12-20T10:05', notes: null })
    expect(f).toMatchObject({ reference: 'TEST01', seller: '', price: '700', refundable: 'partly', cancel_until: '2026-11-30', day: '2026-12-20' })
  })

  it('makes a whole row out of a saved one, booked', () => {
    const r = savedRow({ kind: 'bus', from_code: 'BOG', to_code: 'MDE', depart: '2026-12-10' }, 'new1')
    expect(r).toMatchObject({ id: 'new1', status: 'booked', kind: 'bus', from_code: 'BOG', depart: '2026-12-10', travellers: 1, attachments: [], reference: null, seller_reference: null, fare: null })
  })

  it('shares the seller number over the ticket and gives the fare to every row of a new one', () => {
    const rows = formRows(fromPicked(leg, wIn, inout), { seller_reference: ' TEST02 ', fare: 'Light' })
    expect(rows.map((r) => r.seller_reference)).toEqual(['TEST02', 'TEST02'])
    expect(rows.map((r) => r.fare)).toEqual(['Light', 'Light'])
  })

  it('on Edit keeps the reference and the fare on the row that was opened, so the other flight keeps its own', () => {
    const rows = formRows([{ id: 'b1' }, { id: 'b2' }], { reference: 'TEST03', fare: 'Plus', seller: 'Test Seller' }, { edit: true, own: 'b2' })
    expect(rows[0]).toEqual({ id: 'b1', seller: 'Test Seller' })
    expect(rows[1]).toEqual({ id: 'b2', reference: 'TEST03', fare: 'Plus', seller: 'Test Seller' })
  })

  it('clears an emptied reference on the opened row alone', () => {
    const rows = formRows([{ id: 'b1' }, { id: 'b2' }], { reference: '' }, { edit: true, own: 'b1' })
    expect(rows).toEqual([{ id: 'b1', reference: null }, { id: 'b2' }])
  })

  it('gives the reference to every row when the opened row is not among them', () => {
    const rows = formRows([{ id: 'b1' }, { id: 'b2' }], { reference: 'TEST01' }, { edit: true, own: 'gone' })
    expect(rows.map((r) => r.reference)).toEqual(['TEST01', 'TEST01'])
  })

  it('reads the seller number and the fare back for Edit', () => {
    expect(fromRow({ seller_reference: 'TEST02', fare: 'Light' })).toMatchObject({ seller_reference: 'TEST02', fare: 'Light' })
    expect(fromRow({})).toMatchObject({ seller_reference: '', fare: '' })
  })
})

describe('changing a booking', () => {
  const row = (id: string, depart: string, ticket: string | null, status: Booking['status'] = 'booked') => savedRow({ kind: 'flight', depart, ticket, status }, id)

  it('puts the ids of the booked rows on the new ones, so saving changes them and adds none', () => {
    const rows = withIds(fromPicked(leg, wIn, inout), ['bin', undefined])
    expect(rows.map((r) => r.id)).toEqual(['bin', undefined])
    expect('id' in rows[1]).toBe(false)
  })

  it('gives the rows of a booking with the rest of its ticket, in the order they leave', () => {
    const home = row('bh', '2027-02-03T09:05', 'G1')
    const out = row('bi', '2026-12-02T06:00', 'G1')
    const gone = row('bx', '2026-12-09T06:00', 'G1', 'cancelled')
    const other = row('bo', '2026-12-20T10:05', null)
    expect(rowsOf([home, other, gone, out], home).map((b) => b.id)).toEqual(['bi', 'bh'])
    expect(rowsOf([home, other, out], other).map((b) => b.id)).toEqual(['bo'])
  })

  it('takes the ids of the booked ways for a way changed from its booking', () => {
    const booked = { in: row('bin', '2026-12-02T06:00', 'G1'), home: null }
    expect(wayRebookIds(2, booked, 'home')).toEqual(['bin', undefined])
    expect(wayRebookIds(1, booked, 'in')).toEqual(['bin'])
    expect(wayRebookIds(1, booked, 'home')).toEqual([undefined])
  })

  it('keeps what a shared ticket paid when one way of it is booked again alone', () => {
    // a round trip on one ticket at 9,800 kr, priced on the way in
    const bin = { ...row('bin', '2026-12-02T06:00', 'G1'), price_dkk: 9800 }
    const bhome = { ...row('bhome', '2027-02-03T09:05', 'G1'), price_dkk: 0 }
    const list = [bin, bhome]
    const paid = (l: Booking[]) => l.map((b) => paidPrice(l, b))
    // the way in alone, at 6,000 kr on a ticket of its own
    const again = withIds([{ kind: 'flight', depart: '2026-12-03T06:00', ticket: null, price_dkk: 6000 }], wayRebookIds(1, { in: bin, home: bhome }, 'in'))
    expect(paid(withSaved(list, again, ['bin']))).toEqual([6000, 0])
    const kept = keepPaid(list, again)
    expect(kept).toEqual([again[0], { id: 'bhome', price_dkk: 9800 }])
    expect(paid(withSaved(list, kept, ['bin', 'bhome']))).toEqual([6000, 9800])
    // the way home alone leaves the way in paying for the ticket, so nothing moves
    const home = withIds([{ kind: 'flight', depart: '2027-02-04T09:05', ticket: null, price_dkk: 5000 }], wayRebookIds(1, { in: bin, home: bhome }, 'home'))
    expect(keepPaid(list, home)).toEqual(home)
    expect(paid(withSaved(list, home, ['bhome']))).toEqual([9800, 5000])
    // both ways again on a new ticket leave nothing on the old one
    const both = withIds([{ ticket: 'G2', price_dkk: 7000 }, { ticket: 'G2', price_dkk: 0 }], wayRebookIds(2, { in: bin, home: bhome }, 'in'))
    expect(keepPaid(list, both)).toEqual(both)
    // an edit changes no ticket, so nothing moves
    expect(keepPaid(list, [{ id: 'bin', reference: 'TEST01' }])).toEqual([{ id: 'bin', reference: 'TEST01' }])
  })

  it('keeps a shared ticket with no price not priced when its payer is booked again alone', () => {
    // Fill in yourself with the price left empty saves the way in with no price and the way home at 0
    const bin = { ...row('bin', '2026-12-02T06:00', 'G1'), price_dkk: null }
    const bhome = { ...row('bhome', '2027-02-03T09:05', 'G1'), price_dkk: 0 }
    const list = [bin, bhome]
    const paid = (l: Booking[]) => l.map((b) => paidPrice(l, b))
    expect(paid(list)).toEqual([null, null])
    const again = withIds([{ kind: 'flight', depart: '2026-12-03T06:00', ticket: null, price_dkk: 6000 }], wayRebookIds(1, { in: bin, home: bhome }, 'in'))
    // without it the way home would read 0 paid
    expect(paid(withSaved(list, again, ['bin']))).toEqual([6000, 0])
    const kept = keepPaid(list, again)
    expect(kept).toEqual([again[0], { id: 'bhome', price_dkk: null }])
    expect(paid(withSaved(list, kept, ['bin', 'bhome']))).toEqual([6000, null])
  })
})

describe('bookingTask', () => {
  it('carries the leg and the text', () => {
    const d = bookingTask({ kind: 'flight', from: 'MDE', to: 'VVI', day: '2026-12-20', fromName: 'Medellín', toName: 'Santa Cruz' }, 'It is in my mail from Test Air')
    expect(d.task).toEqual({ type: 'booking', leg: { kind: 'flight', from: 'MDE', to: 'VVI', day: '2026-12-20' }, text: 'It is in my mail from Test Air', from: 'app' })
    expect(d.title).toBe('[booking] MDE to VVI 20 Dec')
    expect(d.line).toBe('Fill in the booking of Medellín to Santa Cruz on 20 Dec.')
  })
})
