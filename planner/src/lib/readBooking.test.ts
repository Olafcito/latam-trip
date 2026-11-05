import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Booking } from '../data/types'
import type { BookData } from './booked'
import type { DraftLeg } from './bookingDraft'
import { draftOf, linkIn, mailLinkOf, readBooking, type Known, type ReadBooking } from './readBooking'

// Made up rows only. A real reference, price or name never goes in this file. Nothing here reaches the read function.
const invoke = vi.fn()
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }))

const leg: DraftLeg = { kind: 'flight', from: 'CPH', to: 'BOG', day: '2026-12-03', tripId: 't1' }

const out = { from: 'CPH', to: 'BOG', depart: '2026-12-03T10:20', arrive: '2026-12-03T21:40', segments: [
  { from: 'CPH', to: 'MAD', carrier: 'Test Air', number: 'TA101', depart: '2026-12-03T10:20', arrive: '2026-12-03T13:30' },
  { from: 'MAD', to: 'BOG', carrier: 'Test Air', number: 'TA102', depart: '2026-12-03T15:10', arrive: '2026-12-03T21:40' },
] }
const back = { from: 'BOG', to: 'CPH', depart: '2027-02-01T23:00', arrive: '2027-02-02T17:00' }

describe('mailLinkOf', () => {
  it('takes a lone link', () => {
    expect(mailLinkOf('  https://mail.google.com/mail/u/0/#inbox/ABC \n')).toBe('https://mail.google.com/mail/u/0/#inbox/ABC')
  })
  it('refuses text around the link or none', () => {
    expect(mailLinkOf('see https://mail.google.com/x')).toBeNull()
    expect(mailLinkOf('https://a.com/x and more')).toBeNull()
    expect(mailLinkOf('')).toBeNull()
  })
})

describe('linkIn', () => {
  it('finds a Gmail or Outlook link in longer text', () => {
    expect(linkIn('Forwarded: https://mail.google.com/mail/u/0/#inbox/ABC thanks')).toBe('https://mail.google.com/mail/u/0/#inbox/ABC')
    expect(linkIn('x https://outlook.live.com/mail/0/id/1 y')).toBe('https://outlook.live.com/mail/0/id/1')
  })
  it('ignores other links', () => {
    expect(linkIn('https://example.com/a')).toBeNull()
  })
})

describe('draftOf', () => {
  it('fills one leg', () => {
    const b: ReadBooking = { legs: [out], reference: 'TEST01', seller: 'Test Air', price: { amount: 2450.5, currency: 'DKK' }, refundable: 'no', changeable: 'fee', cabin_bag: '1 x 8 kg', checked_bag: 'None', not_found: ['cancel_until'] }
    const d = draftOf(leg, b, 'https://mail.google.com/x')
    expect(d.rows).toHaveLength(1)
    expect(d.rows[0]).toMatchObject({ kind: 'flight', from_code: 'CPH', to_code: 'BOG', depart: '2026-12-03T10:20', currency: 'DKK', source: 'claude', trip_id: 't1', ticket: null })
    expect(d.rows[0].segments).toHaveLength(2)
    expect(d.fields).toMatchObject({ reference: 'TEST01', price: '2450.5', refundable: 'no', changeable: 'fee', checked_bag: 'None', mail_url: 'https://mail.google.com/x' })
    expect(d.missing).toEqual(['cancel_until'])
  })

  it('puts this leg first on a return ticket, one shared ticket, price on the first row', () => {
    const d = draftOf(leg, { legs: [back, out], reference: 'TEST01', price: { amount: 5000, currency: 'DKK' } })
    expect(d.rows.map((r) => r.from_code)).toEqual(['CPH', 'BOG'])
    expect(d.rows[0].ticket).toBeTruthy()
    expect(d.rows[1].ticket).toBe(d.rows[0].ticket)
    expect(d.rows[0].price_dkk).toBe(5000)
    expect(d.rows[1].price_dkk).toBe(0)
    expect(d.rows[1].depart).toBe('2027-02-01T23:00')
  })

  it('keeps a USD price on the first row as paid, leaves the kroner field empty and the notes alone', () => {
    const d = draftOf(leg, { legs: [out], reference: 'TEST01', price: { amount: 120, currency: 'USD' } })
    expect(d.fields.price).toBeUndefined()
    expect(d.fields.notes).toBeUndefined()
    expect(d.rows[0]).toMatchObject({ price: 120, currency: 'USD' })
    expect(d.missing).toContain('price')
  })

  it('puts a foreign price on the first row of a return ticket only', () => {
    const d = draftOf(leg, { legs: [out, back], price: { amount: 300, currency: 'eur' } })
    expect(d.rows[0]).toMatchObject({ price: 300, currency: 'EUR', price_dkk: null })
    expect(d.rows[1]).toMatchObject({ currency: 'DKK', price_dkk: 0 })
    expect(d.rows[1].price).toBeUndefined()
  })

  it('gives an unmatched leg its own ends on the first row and keeps the price there', () => {
    const odd = { from: 'CPH', to: 'MDE', depart: '2026-12-03T09:00', arrive: '2026-12-03T20:00' }
    const d = draftOf(leg, { legs: [odd, back], price: { amount: 4000, currency: 'DKK' } })
    expect(d.rows[0]).toMatchObject({ from_code: 'CPH', to_code: 'BOG', depart: '2026-12-03T09:00', price_dkk: 4000 })
    expect(d.rows[1]).toMatchObject({ from_code: 'BOG', to_code: 'CPH', price_dkk: 0 })
    expect(d.rows[1].ticket).toBe(d.rows[0].ticket)
  })

  it('matches the read leg to the form leg through the place of the airport', () => {
    const here: DraftLeg = { kind: 'flight', from: 'MDE', to: 'CPH', day: '2026-12-20', tripId: 't1' }
    const flight = { from: 'EOH', to: 'CPH', depart: '2026-12-20T08:00' }
    const d = draftOf(here, { legs: [{ from: 'CPH', to: 'MDE', depart: '2026-12-01T08:00' }, flight] }, null, known([]))
    expect(d.rows.map((r) => r.from_code)).toEqual(['EOH', 'CPH'])
  })

  it('leaves out a return leg that is booked already, and the ticket with it', () => {
    const d = draftOf(leg, { legs: [out, back], price: { amount: 5000, currency: 'DKK' } }, null, known([bookedBack]))
    expect(d.rows).toHaveLength(1)
    expect(d.rows[0].ticket).toBeNull()
    expect(d.rows[0]).not.toHaveProperty('price_dkk')
    expect(d.fields.price).toBe('5000')
  })

  it('keeps a return leg that is booked on another day', () => {
    const d = draftOf(leg, { legs: [out, { ...back, depart: '2027-02-02T23:00' }] }, null, known([bookedBack]))
    expect(d.rows).toHaveLength(2)
  })

  it('drops dates and times that have the wrong shape', () => {
    const b: ReadBooking = {
      legs: [{ from: 'CPH', to: 'BOG', depart: '3 Dec 10:20', arrive: '2026-12-03 21:40', segments: [{ from: 'CPH', to: 'BOG', depart: '10:20', arrive: '2026-12-03T21:40' }] }],
      cancel_until: '3 December', change_until: '2026-11-20',
    }
    const d = draftOf(leg, b)
    expect(d.rows[0].depart).toBe('2026-12-03')
    expect(d.rows[0].arrive).toBeUndefined()
    expect(d.rows[0].segments).toEqual([{ from: 'CPH', to: 'BOG', arrive: '2026-12-03T21:40' }])
    expect(d.fields.cancel_until).toBeUndefined()
    expect(d.fields.change_until).toBe('2026-11-20')
  })

  it('marks empty reference and bags missing and drops unknown names', () => {
    const d = draftOf(leg, { legs: [], not_found: ['fare', 'colour'] })
    expect(d.rows).toEqual([{ kind: 'flight', from_code: 'CPH', to_code: 'BOG', depart: '2026-12-03', source: 'claude', trip_id: 't1' }])
    expect(d.missing).toEqual(['reference', 'fare', 'price', 'cabin_bag', 'checked_bag'])
  })
})

const data = {
  inout: { airports: { MDE: { map_node: 'medellin' }, EOH: { map_node: 'medellin' } }, ways: {} },
  map: { nodes: [{ id: 'CPH', iata: 'CPH' }, { id: 'BOG', iata: 'BOG' }, { id: 'medellin', iata: null }] },
} as unknown as BookData
const bookedBack = { id: 'b1', status: 'booked', kind: 'flight', from_code: 'BOG', to_code: 'CPH', depart: '2027-02-01T23:00' } as Booking
const known = (bookings: Booking[]): Known => ({ bookings, data })

const file = (name: string, type: string, bytes = 8) => new File([new Uint8Array(bytes)], name, { type })
const MB = 1024 * 1024
const good = { data: { booking: { legs: [out], reference: 'TEST01' } }, error: null }

describe('readBooking', () => {
  beforeEach(() => { invoke.mockReset(); invoke.mockResolvedValue(good) })

  it('keeps a lone mail link as the link and reads nothing', async () => {
    const r = await readBooking(leg, [], 'https://mail.google.com/mail/u/0/#inbox/ABC')
    expect(r).toMatchObject({ ok: true, fields: { mail_url: 'https://mail.google.com/mail/u/0/#inbox/ABC' }, missing: [] })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('reads a saved mail as text and sends the other files with the type the bucket knows', async () => {
    const eml = new File(['Subject: Your trip TEST01'], 'trip.eml', { type: 'message/rfc822' })
    const r = await readBooking(leg, [eml, file('ticket.pdf', 'application/pdf'), file('shot.jpg', '')], 'pasted words')
    expect(r.ok).toBe(true)
    const body = invoke.mock.calls[0][1].body
    expect(body.text).toContain('pasted words')
    expect(body.text).toContain('Subject: Your trip TEST01')
    expect(body.files.map((f: { name: string; type: string }) => [f.name, f.type])).toEqual([['ticket.pdf', 'application/pdf'], ['shot.jpg', 'image/jpeg']])
  })

  it('passes the reason the function gave', async () => {
    invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: 'Claude could not read this right now.' }), { status: 502 }) } })
    expect(await readBooking(leg, [file('a.pdf', 'application/pdf')], '')).toEqual({ ok: false, message: 'Claude could not read this right now.' })
  })

  it('says a plain sentence when the function gave no reason or nothing', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('boom') })
    expect((await readBooking(leg, [], 'some text')).ok).toBe(false)
    invoke.mockResolvedValue({ data: {}, error: null })
    expect(await readBooking(leg, [], 'some text')).toEqual({ ok: false, message: 'The booking could not be read. Fill it in yourself.' })
  })

  it('skips a HEIC photo for the read and reads the rest', async () => {
    const r = await readBooking(leg, [file('IMG_1.HEIC', 'image/heic'), file('a.pdf', 'application/pdf')], '')
    expect(r.ok).toBe(true)
    expect(invoke.mock.calls[0][1].body.files.map((f: { name: string }) => f.name)).toEqual(['a.pdf'])
  })

  it('says HEIC cannot be read when it is all there is', async () => {
    const r = await readBooking(leg, [file('IMG_1.heic', '')], '')
    expect(r).toEqual({ ok: false, message: 'HEIC photos cannot be read. Share a screenshot or a PDF instead.' })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('keeps a lone link as the link when the only files are HEIC', async () => {
    const r = await readBooking(leg, [file('IMG_1.heic', 'image/heic')], 'https://mail.google.com/mail/u/0/#inbox/ABC')
    expect(r).toMatchObject({ ok: true, fields: { mail_url: 'https://mail.google.com/mail/u/0/#inbox/ABC' } })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('refuses more than 5 files, an image over 5 MB and more than 10 MB together', async () => {
    const six = Array.from({ length: 6 }, (_, k) => file(`a${k}.pdf`, 'application/pdf'))
    expect(await readBooking(leg, six, '')).toEqual({ ok: false, message: 'Add at most 5 files to read.' })
    const big = await readBooking(leg, [file('shot.png', 'image/png', 5 * MB + 1)], '')
    expect(big).toEqual({ ok: false, message: 'shot.png is over 5 MB, so it cannot be read. Share a smaller screenshot or a PDF.' })
    const sum = await readBooking(leg, [file('a.pdf', 'application/pdf', 6 * MB), file('b.pdf', 'application/pdf', 5 * MB)], '')
    expect(sum).toEqual({ ok: false, message: 'The files are over 10 MB together, so they cannot be read.' })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('leaves out a return leg that is already booked', async () => {
    invoke.mockResolvedValue({ data: { booking: { legs: [out, back] } }, error: null })
    const r = await readBooking(leg, [], 'text', known([bookedBack]))
    expect(r.ok && r.rows).toHaveLength(1)
  })
})
