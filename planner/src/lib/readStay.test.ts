import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readStay, stayReadOf, type ReadStayItem } from './readStay'
import { stayFormOf, type StayForm, type StayTarget } from './stayBooking'

// Made up places, amounts and the reference TEST01 only. Nothing here reaches the read function.
const invoke = vi.fn()
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }))

const target: StayTarget = { tripId: 'TEST-TRIP', placeId: 'B', lodgingId: null, roomId: null, first: '2026-12-08', nights: 2 }
const base = (): StayForm => stayFormOf(target, null)
const property = { name: 'Casa Test', address: '1 Test Street, Testville', city: 'Testville', country: 'Testland' }
const night = (first: string, over: Partial<ReadStayItem> = {}): ReadStayItem => ({
  property, check_in: first, check_out: first.slice(0, 8) + String(Number(first.slice(8)) + 1).padStart(2, '0'),
  reference: 'TEST01', total: { amount: 50, currency: 'EUR' }, ...over,
})

describe('stayReadOf', () => {
  it('fills the form from the stay that overlaps the nights and names what the read did not state', () => {
    const r = stayReadOf(
      [{ ...night('2026-12-08'), check_out: '2026-12-10', provider: 'hostelworld', room_name: '6 Bed Dorm', check_in_time: '14:00', cancel_until: '2026-12-05', refundable: 'yes' }],
      target,
      base(),
    )
    expect(r.form).toMatchObject({ reference: 'TEST01', checkIn: '2026-12-08', checkOut: '2026-12-10', total: '50', currency: 'EUR', provider: 'hostelworld', room: '6 Bed Dorm', checkInTime: '14:00', cancelUntil: '2026-12-05', refundable: 'yes', address: '1 Test Street, Testville' })
    expect(r.missing).toEqual(['dkk'])
    expect(r.place).toEqual({ name: 'Casa Test', city: 'Testville', country: 'Testland' })
  })

  it('skips a stay that does not overlap the nights', () => {
    const r = stayReadOf([night('2027-01-20', { reference: 'TEST99' }), night('2026-12-08', { reference: 'TEST01' })], target, base())
    expect(r.form.reference).toBe('TEST01')
  })

  it('joins two one-night bookings at one property into one', () => {
    const r = stayReadOf(
      [night('2026-12-09', { reference: 'TEST02', room_name: 'Room B', total: { amount: 30, currency: 'EUR' }, paid: { amount: 5, currency: 'EUR' } }), night('2026-12-08', { reference: 'TEST01', room_name: 'Room A', total: { amount: 50, currency: 'EUR' }, paid: { amount: 5, currency: 'EUR' } })],
      target,
      base(),
    )
    expect(r.form).toMatchObject({ checkIn: '2026-12-08', checkOut: '2026-12-10', total: '80', paid: '10', currency: 'EUR', reference: 'TEST01, TEST02', room: 'Room A, Room B' })
  })

  it('does not repeat a room name or a reference that is the same', () => {
    const r = stayReadOf([night('2026-12-08', { room_name: 'Dorm' }), night('2026-12-09', { room_name: 'Dorm' })], target, base())
    expect(r.form.room).toBe('Dorm')
    expect(r.form.reference).toBe('TEST01')
  })

  it('does not join stays at different properties', () => {
    const r = stayReadOf([night('2026-12-08'), night('2026-12-09', { property: { name: 'Hotel Other' } })], target, base())
    expect(r.form.checkOut).toBe('2026-12-09')
  })

  it('leaves the total out and names it when the joined totals are in different currencies', () => {
    const r = stayReadOf([night('2026-12-08'), night('2026-12-09', { total: { amount: 400, currency: 'DKK' } })], target, base())
    expect(r.form.total).toBe('')
    expect(r.missing).toContain('total')
  })

  it('leaves the total out when a deposit and a balance are in different currencies', () => {
    const r = stayReadOf([{ ...night('2026-12-08'), check_out: '2026-12-10', total: undefined, paid: { amount: 10, currency: 'USD' }, balance: { amount: 90, currency: 'EUR' } }], target, base())
    expect(r.form.total).toBe('')
    expect(r.missing).toContain('total')
  })

  it('sums a deposit and a balance in one currency', () => {
    const r = stayReadOf([{ ...night('2026-12-08'), check_out: '2026-12-10', total: undefined, paid: { amount: 10, currency: 'EUR' }, balance: { amount: 90, currency: 'EUR' } }], target, base())
    expect(r.form).toMatchObject({ total: '100', paid: '10', currency: 'EUR' })
  })

  it('invents nothing: a bare stay keeps the base and names every field', () => {
    const b = base()
    const r = stayReadOf([{ property: { name: 'Casa Test' }, check_in: '2026-12-08', check_out: '2026-12-10' }], target, b)
    expect(r.form).toEqual({ ...b, checkIn: '2026-12-08', checkOut: '2026-12-10' })
    expect(r.missing).toEqual(['reference', 'total', 'currency', 'room', 'cancelUntil', 'provider', 'address'])
    expect(r.place).toEqual({ name: 'Casa Test', city: null, country: null })
  })

  it('does not overwrite the base with an unusable value', () => {
    const b = { ...base(), room: 'My room', checkInTime: '15:00' }
    const r = stayReadOf([{ ...night('2026-12-08'), check_out: '2026-12-10', room_name: '  ', check_in_time: 'afternoon', provider: 'expedia' }], target, b)
    expect(r.form.room).toBe('My room')
    expect(r.form.checkInTime).toBe('15:00')
    expect(r.form.provider).toBe('')
    expect(r.missing).toEqual(expect.arrayContaining(['room', 'provider']))
  })

  it('keeps the name and link of an other provider only for other or own', () => {
    const other = stayReadOf([{ ...night('2026-12-08'), provider: 'other', seller: 'Casa Lola direct', seller_url: 'https://example.test/lola' }], target, base())
    expect(other.form).toMatchObject({ provider: 'other', seller: 'Casa Lola direct', sellerUrl: 'https://example.test/lola' })
    const site = stayReadOf([{ ...night('2026-12-08'), provider: 'booking', seller: 'Booking.com' }], target, base())
    expect(site.form.seller).toBe('')
  })

  it('does not ask for a last day of cancellation of a stay that cannot be cancelled', () => {
    const r = stayReadOf([{ ...night('2026-12-08'), refundable: 'no' }], target, base())
    expect(r.missing).not.toContain('cancelUntil')
  })

  it('asks for the kroner total only when the currency is not DKK and the base has none', () => {
    const dkk = stayReadOf([night('2026-12-08', { total: { amount: 400, currency: 'DKK' } })], target, base())
    expect(dkk.missing).not.toContain('dkk')
    const eur = stayReadOf([night('2026-12-08')], target, { ...base(), dkk: '370' })
    expect(eur.missing).not.toContain('dkk')
  })

  it('puts a mail link in the form', () => {
    const r = stayReadOf([night('2026-12-08')], target, base(), 'https://mail.google.com/mail/u/0/#inbox/TEST01')
    expect(r.form.mailUrl).toBe('https://mail.google.com/mail/u/0/#inbox/TEST01')
  })
})

describe('readStay', () => {
  beforeEach(() => invoke.mockReset())

  it('keeps a pasted link alone as the mail link without reading', async () => {
    const r = await readStay(target, 'Testville', [], 'https://mail.google.com/mail/u/0/#inbox/TEST01', base())
    expect(invoke).not.toHaveBeenCalled()
    expect(r).toMatchObject({ ok: true, form: { mailUrl: 'https://mail.google.com/mail/u/0/#inbox/TEST01' }, missing: [] })
  })

  it('sends the stay leg and the text and returns the form', async () => {
    invoke.mockResolvedValue({ data: { booking: { stays: [night('2026-12-08')] } }, error: null })
    const r = await readStay(target, 'Testville', [], 'Booking confirmation TEST01 https://mail.google.com/mail/u/0/#inbox/abc', base())
    expect(invoke).toHaveBeenCalledWith('read-booking', { body: expect.objectContaining({ leg: { kind: 'stay', place: 'Testville', day: '2026-12-08', nights: 2 } }) })
    expect(r).toMatchObject({ ok: true, form: { reference: 'TEST01', mailUrl: 'https://mail.google.com/mail/u/0/#inbox/abc' } })
  })

  it('refuses a HEIC photo alone and reads a saved mail as text', async () => {
    const heic = new File(['x'], 'IMG.heic', { type: 'image/heic' })
    const refused = await readStay(target, 'Testville', [heic], '', base())
    expect(refused).toEqual({ ok: false, message: 'HEIC photos cannot be read. Share a screenshot or a PDF instead.' })
    invoke.mockResolvedValue({ data: { booking: { stays: [night('2026-12-08')] } }, error: null })
    const eml = new File(['Subject: TEST01'], 'mail.eml', { type: 'message/rfc822' })
    await readStay(target, 'Testville', [eml], '', base())
    const body = invoke.mock.calls[0][1].body as { text: string; files: unknown[] }
    expect(body.text).toContain('Subject: TEST01')
    expect(body.files).toEqual([])
  })

  it('gives the sentence the function said, or a plain one', async () => {
    invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: 'The files are over 10 MB together.' }), { status: 400 }) } })
    expect(await readStay(target, 'Testville', [], 'text', base())).toEqual({ ok: false, message: 'The files are over 10 MB together.' })
    invoke.mockResolvedValue({ data: { booking: { stays: [] } }, error: null })
    expect(await readStay(target, 'Testville', [], 'text', base())).toEqual({ ok: false, message: 'The booking could not be read. Fill it in yourself.' })
  })
})
