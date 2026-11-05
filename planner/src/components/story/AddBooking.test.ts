import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AddBooking } from './AddBooking'

// Made up rows only. A real reference, price or name never goes in this file.

const leg = { kind: 'flight' as const, from: 'SMR', to: 'CLO', day: '2026-12-14', tripId: 'TEST01' }

describe('Add booking', () => {
  it('opens as one titled row for a mail, a PDF or a screenshot, with no question in it', () => {
    const out = renderToStaticMarkup(createElement(AddBooking, { leg, onRead: () => {}, onManual: () => {} }))
    expect(out).toContain('>Add booking</h4>')
    expect(out).toContain('Mail, PDF or screenshot')
    expect(out).toContain('Or paste a mail link')
    expect(out).not.toContain('?')
  })

  it('has one status region from the start, empty until a read or a failure has something to say', () => {
    const out = renderToStaticMarkup(createElement(AddBooking, { leg, onRead: () => {}, onManual: () => {} }))
    expect(out).toMatch(/<p class="vh" role="status" aria-live="polite"><\/p>/)
    expect(out.match(/role="status"/g)).toHaveLength(1)
    expect(out).not.toContain('role="alert"')
  })
})
