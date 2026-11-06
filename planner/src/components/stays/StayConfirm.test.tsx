import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// the parsers and the writes are never reached from a static render, and are mocked so nothing is read or sent
vi.mock('../../lib/readStay', () => ({ readStay: vi.fn() }))
vi.mock('../../lib/bookings', () => ({ FILE_TYPES: ['application/pdf'], loadBookings: vi.fn(), saveBookings: vi.fn(), attachFile: vi.fn() }))
vi.mock('../../lib/lodgings', () => ({ loadLodgings: vi.fn(), setLodgingAddress: vi.fn() }))

import { stayFormOf, type StayFormKey, type StayTarget } from '../../lib/stayBooking'
import { StayConfirm, StayReview, type StayReviewProps } from './StayConfirm'

const target: StayTarget = { tripId: 't1', placeId: 'p1', lodgingId: 'l1', roomId: null, first: '2026-12-10', nights: 5 }
const base: StayReviewProps = {
  form: stayFormOf(target, null), missing: new Set(), lodgingAddress: 'Avenida Colombia 12', source: null,
  busy: false, said: null, onChange: () => {}, onSave: () => {},
}
const html = (over: Partial<StayReviewProps>) => renderToStaticMarkup(createElement(StayReview, { ...base, ...over }))

describe('StayConfirm', () => {
  it('opens on the three ways in and Use with AI, with no form', () => {
    const out = renderToStaticMarkup(createElement(StayConfirm, { city: 'San Andres', booking: null, target, lodging: null, close: () => {} }))
    expect(out).toContain('Upload confirmation')
    expect(out).toContain('Paste booking link')
    expect(out).toContain('Enter manually')
    expect(out).toContain('Copy prompt')
    expect(out).not.toContain('<form')
  })
})

describe('StayReview', () => {
  it('offers the provider as five named segments, the chosen one named in the label', () => {
    const out = html({ form: { ...base.form, provider: 'hostelworld' } })
    for (const n of ['Booking.com', 'Hostelworld', 'Airbnb', 'Own site', 'Other']) expect(out).toContain(`aria-label="${n}"`)
    expect(out).toContain('aria-pressed="true" aria-label="Hostelworld"')
    expect(out).toContain('Booked on<b> Hostelworld</b>')
    expect(out).not.toContain('Provider link')
  })

  it('asks for the name and link of another provider', () => {
    const out = html({ form: { ...base.form, provider: 'other' } })
    expect(out).toContain('>Provider<')
    expect(out).toContain('Provider link')
  })

  it('marks the fields the confirmation did not state amber, and only those', () => {
    const out = html({ missing: new Set<StayFormKey>(['reference', 'provider']) })
    expect(out.match(/data-miss="true"/g)).toHaveLength(2)
    expect(out).toContain(', not on the confirmation')
  })

  it('asks for kroner only when the currency is not DKK', () => {
    expect(html({})).not.toContain('Total in DKK')
    expect(html({ form: { ...base.form, currency: 'usd' } })).toContain('Total in DKK')
  })

  it('hides the cancellation date when the stay does not refund', () => {
    expect(html({})).toContain('Free cancellation until')
    expect(html({ form: { ...base.form, refundable: 'no' } })).not.toContain('Free cancellation until')
  })

  it('asks for the address when the place has none, and shows another one read only', () => {
    expect(html({})).not.toContain('Address')
    expect(html({ lodgingAddress: null })).toContain('>Address<')
    const other = html({ form: { ...base.form, address: 'Calle 5 no 3' } })
    expect(other).toContain('Address on the confirmation')
    expect(other).toMatch(/readOnly=""|readonly=""/)
  })

  it('names the file or the page Save keeps, and the reason a read failed by Save', () => {
    const out = html({ source: { kind: 'file', name: 'TEST01.pdf' }, said: 'The file could not be read.' })
    expect(out).toContain('TEST01.pdf')
    expect(out).toContain('role="alert"')
    expect(html({ busy: true })).toContain('Saving')
  })
})
