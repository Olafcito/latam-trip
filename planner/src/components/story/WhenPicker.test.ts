import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WhenPicker } from './WhenPicker'

const base = {
  date: '2026-12-08', set: true, min: '2026-12-05', max: '2026-12-12', firstDay: '2026-12-02',
  fares: { '2026-12-07': 900, '2026-12-08': 1100 }, stay: { name: 'San Andrés', inDay: '2026-12-03' },
  codes: { from: 'ADZ', to: 'SMR' }, onSet: () => {},
}
const html = (held?: string | null) => renderToStaticMarkup(createElement(WhenPicker, { ...base, held }))
/** every day button of the grid, by its data-d */
const dayButtons = (out: string) => [...out.matchAll(/<button[^>]*class="wp-d"[^>]*>/g)].map((m) => m[0])
const steppers = (out: string) => [...out.matchAll(/<button[^>]*aria-label="[^"]*"[^>]*><svg/g)].map((m) => m[0]).filter((b) => !b.includes('wp-arr'))

describe('WhenPicker on a booked leg', () => {
  it('shows every day and both nights steppers disabled, the booked day marked, and no way back to the estimate', () => {
    const out = html('2026-12-08')
    const days = dayButtons(out)
    expect(days.length).toBe(31)
    expect(days.every((b) => / disabled=""/.test(b))).toBe(true)
    const booked = days.filter((b) => b.includes('data-booked'))
    expect(booked).toHaveLength(1)
    expect(booked[0]).toContain('data-d="2026-12-08"')
    expect(booked[0]).toContain(', booked"')
    // the check mark sits under the booked day, in place of its fare
    expect(out).toMatch(/data-d="2026-12-08"[^>]*><b>8<\/b><small><svg/)
    const step = steppers(out)
    expect(step).toHaveLength(2)
    for (const b of step) {
      expect(b).toContain(' disabled=""')
      expect(b).toContain('aria-label="Booked for Tue 8 Dec, change it from its booking"')
      expect(b).toContain('title="Booked for Tue 8 Dec, change it from its booking"')
    }
    expect(out).not.toContain('Back to estimate')
  })

  it('leaves the open days and the steppers live on a leg that is not booked', () => {
    const out = html(null)
    const days = dayButtons(out)
    expect(days.filter((b) => !/ disabled=""/.test(b)).length).toBe(8)
    expect(days.some((b) => b.includes('data-booked'))).toBe(false)
    const step = steppers(out)
    expect(step.map((b) => / disabled=""/.test(b))).toEqual([false, false])
    expect(step.some((b) => b.includes('title='))).toBe(false)
    expect(out).toContain('Back to estimate')
  })
})
