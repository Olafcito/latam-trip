import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ItineraryBar } from './ItineraryBar'
import type { Segment } from './tripBar'

const seg = (key: string, code: string, nights: number, over: Partial<Segment> = {}): Segment => ({
  key, code, name: key, nights, share: nights / 30, passing: !nights, mode: 'ground', booked: false, first: '2026-12-02', last: '2026-12-12', ...over,
})
const bar = [seg('Alpha', 'CO', 20, { mode: 'flight', booked: true }), seg('Beta', 'CR', 0), seg('Gamma', 'NI', 10, { first: '2026-12-12', last: '2026-12-22' })]
const draw = (chosen: string | null, shown = chosen) =>
  renderToStaticMarkup(createElement(ItineraryBar, { bar, chosen, shown, onChoose: () => {}, onPreview: () => {} }))

describe('ItineraryBar', () => {
  it('has a button per country, as wide as its nights, a passing one at its own size', () => {
    const html = draw(null)
    expect(html.match(/class="rs-seg"/g)).toHaveLength(3)
    expect(html).toContain('flex-grow:0.6666')
    expect(html).toContain('flex-grow:0')
    expect(html).toContain('aria-label="Beta, passing through"')
  })

  it('marks how you got there, filled when booked', () => {
    const html = draw(null)
    expect(html).toMatch(/class="rs-mode" data-f="flight" data-booked="true"/)
    expect(html).toMatch(/class="rs-mode" data-f="ground" aria-hidden/)
  })

  it('with nothing chosen says what a tap does, a chosen country says its name and days', () => {
    expect(draw(null)).toContain('Tap a flag to open its country')
    const html = draw('Gamma')
    expect(html).toContain('<b>Gamma</b><span>12 to 22 Dec</span>')
    expect(html).toMatch(/data-key="Gamma"[^>]*aria-pressed="true"/)
  })

  it('the country under the pointer reads without being chosen', () => {
    const html = draw(null, 'Alpha')
    expect(html).toContain('<b>Alpha</b>')
    expect(html).not.toContain('aria-pressed="true"')
  })

  it('never shows a question mark', () => {
    expect(draw(null) + draw('Alpha')).not.toContain('?')
  })
})
