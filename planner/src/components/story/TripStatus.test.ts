import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { kr } from '../../lib/format'
import type { CostItem, CostPart, LegState } from '../../lib/tripStatus'
import { TripStatus, type StatusProps } from './TripStatus'

const leg = (key: LegState['key'], over: Partial<LegState> = {}): LegState => ({
  key, fam: 'flight', from: 'A', to: 'B', day: '2026-12-04', booked: false, unpicked: false, price: null, paid: false, ...over,
})

const parts: CostPart[] = [
  { key: 'long', label: 'Long haul', paid: 4000, estimated: 0, unpriced: 0 },
  { key: 'regional', label: 'Regional flights', paid: 350, estimated: 1200, unpriced: 0 },
  { key: 'ground', label: 'Ground', paid: 0, estimated: 0, unpriced: 2 },
  { key: 'stays', label: 'Stays', paid: 0, estimated: 2100, unpriced: 1 },
  { key: 'checked', label: 'Checked bags', paid: 0, estimated: 600, unpriced: 0, optional: true },
]
const items: CostItem[] = [
  { key: 'in', fam: 'flight', label: 'Long haul', dkk: 4000, paid: true },
  { key: 3, fam: 'flight', label: 'Tayrona to Guatemala City', dkk: 1200, paid: false },
  { key: 1, fam: 'flight', label: 'Cartagena to Santa Marta', dkk: 350, paid: true },
]
const base: StatusProps = {
  nights: 14, first: '2026-12-02', last: '2026-12-16', parts, items, now: null, onGo: () => {},
  legs: [leg('in', { booked: true }), leg(1, { booked: true }), leg(2, { fam: 'ground' }), leg(3, { unpicked: true }), leg('home')],
}
const html = (over: Partial<StatusProps> = {}) => renderToStaticMarkup(createElement(TripStatus, { ...base, ...over }))
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('TripStatus', () => {
  it('shows the nights with the dates, the cost and the booked and open counts as figures', () => {
    const out = html()
    expect(out).toContain('<b class="ts-n">14</b>')
    expect(text(out)).toContain('2 to 16 Dec')
    // the trip costs what is paid and estimated, the checked bags left out
    expect(text(out)).toContain(kr(4000 + 350 + 1200 + 2100))
    expect(out).toMatch(/class="ts-chip ts-booked"[^>]*aria-label="2 legs booked"/)
    expect(out).toMatch(/class="ts-chip ts-open"[^>]*aria-label="3 legs open, go to the next"/)
  })

  it('draws the paid part green and the estimated part grey, with the parts not priced counted at the end', () => {
    const out = html()
    const total = 4000 + 350 + 1200 + 2100
    expect(out).toContain(`--paid:${((4350 / total) * 100).toFixed(2)}%`)
    expect(out).toMatch(/class="cb-q"[^>]*>3</)
  })

  it('reads All booked when no leg is open', () => {
    const out = html({ legs: base.legs.map((l) => ({ ...l, booked: true })) })
    expect(text(out)).toContain('All booked')
    expect(out).not.toContain('legs open')
  })

  it('lists every category with its kroner and the checked bags apart as optional', () => {
    const out = text(html())
    for (const p of ['Long haul', 'Regional flights', 'Ground', 'Stays', 'Checked bags']) expect(out).toContain(p)
    expect(out).toContain('Optional')
    expect(out).toContain(kr(1550))
    expect(out).toContain(kr(600))
  })

  it('lists the biggest items, each with paid or estimated', () => {
    const out = html()
    expect(out).toMatch(/aria-label="Tayrona to Guatemala City, 1\.200 kr estimated, go to the leg"/)
    expect(out).toMatch(/aria-label="Cartagena to Santa Marta, 350 kr paid, go to the leg"/)
  })

  it('shows today with the stop, its nights left and the next leg', () => {
    const out = html({ now: { place: 'Santa Marta', nightsLeft: 2, next: { key: 2, fam: 'ground', route: 'Santa Marta to Tayrona', day: '2026-12-07', time: null, booked: false } } })
    expect(text(out)).toContain('Today')
    expect(text(out)).toContain('Santa Marta')
    expect(out).toContain('aria-label="2 nights left"')
    expect(out).toMatch(/aria-label="Next, Santa Marta to Tayrona, Mon 7 Dec, open, go to the leg"/)
  })

  it('says nothing in sentences, no semicolons and no question marks', () => {
    const out = text(html({ now: { place: null, nightsLeft: 0, next: null } }))
    expect(out).not.toMatch(/[;?]/)
  })
})
