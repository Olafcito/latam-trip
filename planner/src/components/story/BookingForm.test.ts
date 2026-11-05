import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BookingForm, type BookTarget, type FormOpen } from './BookingForm'
import type { BoxData } from './BookedBox'

const data = { inout: { airports: {} }, map: { nodes: [] } } as unknown as BoxData
const target: BookTarget<never> = {
  leg: { kind: 'flight', from: 'SMR', to: 'CLO', day: '2026-12-14', tripId: 'TEST01', fromName: 'Santa Marta', toName: 'Cali' },
  inout: { tickets: {}, ways: {} }, data, tripId: 'TEST01', tripVersion: 1,
  save: async () => ({ ok: true, ids: ['TEST01'] }),
}
const read = {
  rows: [{ kind: 'flight' as const, from_code: 'SMR', to_code: 'CLO', depart: '2026-12-14T06:05', arrive: '2026-12-14T09:45' }],
  fields: { reference: 'TEST01', price: '286' },
  missing: ['checked_bag' as const, 'reference' as const],
  files: [],
}
const form = (open: FormOpen<never>) => renderToStaticMarkup(createElement(BookingForm<never>, { target, open, onDone: () => {} }))

describe('the booking form', () => {
  it('opens a read filled in, the field the confirmation did not hold tinted and named so', () => {
    const out = form({ start: 'manual', read })
    expect(out).toContain('Add booking')
    expect(out).toContain('value="TEST01"')
    expect(out.match(/data-missing="true"/g)).toHaveLength(1)
    expect(out).toContain('Checked bag<span class="vh">, not in the confirmation</span>')
    expect(out).toContain('>Add</button>')
  })

  it('has no Ask Claude way and says Add, never Booked', () => {
    const out = form({ start: 'manual' })
    expect(out).not.toContain('Ask Claude')
    expect(out).not.toContain('Mark as booked')
    expect(out).toContain('>Add</button>')
  })
})
