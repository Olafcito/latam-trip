import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BookingForm, type BookTarget, type FormOpen } from './BookingForm'
import type { BoxData } from './BookedBox'

// Made up rows only. A real reference, price or name never goes in this file.
const data = { inout: { airports: {} }, map: { nodes: [] } } as unknown as BoxData
const target: BookTarget<never> = {
  leg: { kind: 'flight', from: 'SMR', to: 'CLO', day: '2026-12-14', tripId: 'TEST01', fromName: 'Santa Marta', toName: 'Cali' },
  inout: { tickets: {}, ways: {} }, data, tripId: 'TEST01', tripVersion: 1,
  save: async () => ({ ok: true, ids: ['TEST01'] }),
}
const read = {
  rows: [{ kind: 'flight' as const, from_code: 'SMR', to_code: 'CLO', depart: '2026-12-14T06:40', arrive: '2026-12-14T10:15' }],
  fields: { reference: 'TEST01', price: '275' },
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

  it('leaves the chips off the ticket when the fields below say the same, and keeps them on the picked flight', () => {
    const filled = { ...read, rows: [{ ...read.rows[0], cabin_bag: '1 x 8 kg', checked_bag: 'None' }] }
    expect(form({ start: 'manual', read: filled })).not.toContain('bk-chips')
    const picked = { ...target, leg: target.leg }
    const out = renderToStaticMarkup(createElement(BookingForm<never>, { target: picked, open: { start: 'picked', picked: { id: 'TEST01', depart: '2026-12-14T06:40', arrive: '2026-12-14T10:15', price_dkk: 275, cabin_bag: '1 x 8 kg', checked_bag: 'None', carriers: ['Test Air'], via: [], layover_h: [] } as never }, onDone: () => {} }))
    expect(out).toContain('bk-chips')
  })
})
