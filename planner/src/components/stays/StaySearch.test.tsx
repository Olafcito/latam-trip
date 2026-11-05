import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { StaySearch, type StaySearchProps } from './StaySearch'

const base: StaySearchProps = {
  destination: 'San Andres', checkIn: '2026-12-13', checkOut: '2026-12-17', guests: 1, rooms: 1,
  places: [], saved: new Set(), onOpen: () => {}, onFind: () => {},
}
const html = (over: Partial<StaySearchProps>) => renderToStaticMarkup(createElement(StaySearch, { ...base, ...over }))

describe('StaySearch progress marks', () => {
  it('shows one named mark per site being asked and no sentence', () => {
    const out = html({ searching: { sites: ['Hostelworld', 'Booking.com'] } })
    expect(out.match(/class="as-site"/g)).toHaveLength(2)
    expect(out).toContain('aria-label="Asking Hostelworld"')
    expect(out).toContain('title="Asking Booking.com"')
    expect(out).not.toContain('as-asking')
    expect(out).not.toMatch(/<p[^>]*>Asking/)
  })
  it('shows a single mark when one site is asked', () => {
    expect(html({ searching: { sites: ['Booking.com'] } }).match(/class="as-site"/g)).toHaveLength(1)
  })
  it('shows no marks when nothing is searching', () => {
    expect(html({})).not.toContain('as-site')
  })
})
