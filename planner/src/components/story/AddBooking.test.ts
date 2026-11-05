import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AddBooking } from './AddBooking'

const leg = { kind: 'flight' as const, from: 'SMR', to: 'CLO', day: '2026-12-14', tripId: 'TEST01' }

describe('Add booking', () => {
  it('opens as one titled row for a mail, a PDF or a screenshot, with no question in it', () => {
    const out = renderToStaticMarkup(createElement(AddBooking, { leg, onRead: () => {}, onManual: () => {} }))
    expect(out).toContain('>Add booking</h4>')
    expect(out).toContain('Mail, PDF or screenshot')
    expect(out).toContain('Or paste a mail link')
    expect(out).not.toContain('?')
  })
})
