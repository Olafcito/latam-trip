import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Booking } from '../data/types'

const saveBookings = vi.fn()
const attachFile = vi.fn()
const setLodgingAddress = vi.fn()
vi.mock('./bookings', () => ({
  saveBookings: (...a: unknown[]) => saveBookings(...a),
  attachFile: (...a: unknown[]) => attachFile(...a),
}))
vi.mock('./lodgings', () => ({ setLodgingAddress: (...a: unknown[]) => setLodgingAddress(...a) }))

import { stayFormOf, type StayTarget } from './stayBooking'
import { addressField, confirmSource, newProgress, pastedLink, saveStay } from './stayConfirm'

const target: StayTarget = { tripId: 't1', placeId: 'p1', lodgingId: 'l1', roomId: 'r1', first: '2026-12-10', nights: 5 }
const form = { ...stayFormOf(target, null), reference: 'TEST01', total: '1220' }
const file = new File(['x'], 'TEST01.pdf', { type: 'application/pdf' })
const rowOf = (call = 0) => (saveBookings.mock.calls[call][0] as Partial<Booking>[])[0]

beforeEach(() => {
  saveBookings.mockReset().mockResolvedValue({ ok: true, ids: ['b1'] })
  attachFile.mockReset().mockResolvedValue({ ok: true, attachment: {} })
  setLodgingAddress.mockReset().mockResolvedValue({ ok: true })
})

describe('pastedLink', () => {
  it('keeps a Gmail or Outlook link as the mail and any other link as the booking page', () => {
    expect(pastedLink(' https://mail.google.com/mail/u/0/#inbox/TEST01 ')).toEqual({ mailUrl: 'https://mail.google.com/mail/u/0/#inbox/TEST01' })
    expect(pastedLink('https://outlook.live.com/mail/0/id/TEST01')).toEqual({ mailUrl: 'https://outlook.live.com/mail/0/id/TEST01' })
    expect(pastedLink('https://www.booking.com/myreservations/TEST01')).toEqual({ url: 'https://www.booking.com/myreservations/TEST01' })
  })

  it('gives nothing for text that is not a link', () => {
    expect(pastedLink('TEST01')).toBeNull()
    expect(pastedLink('see https://www.booking.com/TEST01')).toBeNull()
    expect(pastedLink('')).toBeNull()
  })
})

describe('confirmSource', () => {
  it('is the file first, then the mail link, then the pasted page, else typed in', () => {
    expect(confirmSource(file, 'https://mail.google.com/mail/u/0/#inbox/TEST01', 'https://x.test')).toBe('upload')
    expect(confirmSource(null, 'https://mail.google.com/mail/u/0/#inbox/TEST01', null)).toBe('gmail')
    expect(confirmSource(null, '', 'https://www.booking.com/TEST01')).toBe('url')
    expect(confirmSource(null, 'https://example.test/mail', null)).toBe('manual')
  })
})

describe('addressField', () => {
  it('asks for the address when the place has none, and shows another one the confirmation names', () => {
    expect(addressField(null, '')).toBe('add')
    expect(addressField('  ', 'Calle 1')).toBe('add')
    expect(addressField('Avenida Colombia 12', 'avenida colombia 12')).toBeNull()
    expect(addressField('Avenida Colombia 12', '')).toBeNull()
    expect(addressField('Avenida Colombia 12', 'Calle 5 no 3')).toBe('other')
  })
})

describe('saveStay', () => {
  it('books a new stay with the form, its source, then attaches the file and gives the place its address', async () => {
    const r = await saveStay({ booking: null, target, form: { ...form, address: 'Calle 5 no 3' }, file, url: null, lodging: { id: 'l1', address: null }, progress: newProgress() })
    expect(r).toEqual({ ok: true, addressSet: true })
    expect(rowOf()).toMatchObject({ kind: 'stay', status: 'booked', lodging_id: 'l1', reference: 'TEST01', price: 1220, price_dkk: 1220, confirmation_source: 'upload' })
    expect(rowOf().id).toBeUndefined()
    expect(attachFile).toHaveBeenCalledWith('b1', file)
    expect(setLodgingAddress).toHaveBeenCalledWith('l1', 'Calle 5 no 3')
  })

  it('changes the booking the stay has and keeps a pasted page as its url', async () => {
    await saveStay({ booking: { id: 'b9' }, target, form, file: null, url: 'https://www.booking.com/TEST01', lodging: null, progress: newProgress() })
    expect(rowOf()).toMatchObject({ id: 'b9', url: 'https://www.booking.com/TEST01', confirmation_source: 'url' })
    expect(rowOf().kind).toBeUndefined()
    expect(attachFile).not.toHaveBeenCalled()
  })

  it('never writes over an address the place has', async () => {
    const r = await saveStay({ booking: null, target, form: { ...form, address: 'Calle 5 no 3' }, file: null, url: null, lodging: { id: 'l1', address: 'Avenida Colombia 12' }, progress: newProgress() })
    expect(r).toEqual({ ok: true, addressSet: false })
    expect(setLodgingAddress).not.toHaveBeenCalled()
  })

  it('saves nothing when the form does not hold', async () => {
    const r = await saveStay({ booking: null, target, form: { ...form, total: 'many' }, file, url: null, lodging: null, progress: newProgress() })
    expect(r).toEqual({ ok: false, message: 'The total needs to be a number.' })
    expect(saveBookings).not.toHaveBeenCalled()
  })

  it('goes on from a failed file on Save again without making a second booking or sending the file twice', async () => {
    const progress = newProgress()
    attachFile.mockResolvedValueOnce({ ok: false, message: 'Offline.' })
    const first = await saveStay({ booking: null, target, form, file, url: null, lodging: null, progress })
    expect(first).toEqual({ ok: false, message: 'Booked, but TEST01.pdf was not added. Offline.' })
    expect(progress.id).toBe('b1')

    const again = await saveStay({ booking: null, target, form, file, url: null, lodging: { id: 'l1', address: null }, progress })
    expect(again.ok).toBe(true)
    expect(rowOf(1).id).toBe('b1')
    expect(attachFile).toHaveBeenCalledTimes(2)

    await saveStay({ booking: null, target, form, file, url: null, lodging: null, progress })
    expect(attachFile).toHaveBeenCalledTimes(2)
  })

  it('says why when the booking is not stored', async () => {
    saveBookings.mockResolvedValueOnce({ ok: false, message: 'Not connected.' })
    expect(await saveStay({ booking: null, target, form, file, url: null, lodging: null, progress: newProgress() })).toEqual({ ok: false, message: 'Not connected.' })
    expect(attachFile).not.toHaveBeenCalled()
  })
})
