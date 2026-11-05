import { describe, expect, it } from 'vitest'
import type { DraftLeg } from './bookingDraft'
import { draftOf, linkIn, mailLinkOf, type ReadBooking } from './readBooking'

const leg: DraftLeg = { kind: 'flight', from: 'CPH', to: 'BOG', day: '2026-12-03', tripId: 't1' }

const out = { from: 'CPH', to: 'BOG', depart: '2026-12-03T10:05', arrive: '2026-12-03T21:40', segments: [
  { from: 'CPH', to: 'MAD', carrier: 'Iberia', number: 'IB3177', depart: '2026-12-03T10:05', arrive: '2026-12-03T13:30' },
  { from: 'MAD', to: 'BOG', carrier: 'Iberia', number: 'IB6585', depart: '2026-12-03T15:10', arrive: '2026-12-03T21:40' },
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
    const b: ReadBooking = { legs: [out], reference: 'TEST01', seller: 'Iberia', price: { amount: 2450.5, currency: 'DKK' }, refundable: 'no', changeable: 'fee', cabin_bag: '1 x 8 kg', checked_bag: 'None', not_found: ['cancel_until'] }
    const d = draftOf(leg, b, 'https://mail.google.com/x')
    expect(d.rows).toHaveLength(1)
    expect(d.rows[0]).toMatchObject({ kind: 'flight', from_code: 'CPH', to_code: 'BOG', depart: '2026-12-03T10:05', currency: 'DKK', source: 'claude', trip_id: 't1', ticket: null })
    expect(d.rows[0].segments).toHaveLength(2)
    expect(d.fields).toMatchObject({ reference: 'TEST01', price: '2450,5', refundable: 'no', changeable: 'fee', checked_bag: 'None', mail_url: 'https://mail.google.com/x' })
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

  it('leaves a USD price empty, notes it and marks it missing', () => {
    const d = draftOf(leg, { legs: [out], reference: 'TEST01', price: { amount: 120, currency: 'USD' } })
    expect(d.fields.price).toBeUndefined()
    expect(d.fields.notes).toBe('Paid 120 USD')
    expect(d.missing).toContain('price')
  })

  it('marks empty reference and bags missing and drops unknown names', () => {
    const d = draftOf(leg, { legs: [], not_found: ['fare', 'colour'] })
    expect(d.rows).toEqual([{ kind: 'flight', from_code: 'CPH', to_code: 'BOG', depart: '2026-12-03', source: 'claude', trip_id: 't1' }])
    expect(d.missing).toEqual(['reference', 'fare', 'price', 'cabin_bag', 'checked_bag'])
  })
})
