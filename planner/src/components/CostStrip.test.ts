import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Totals } from '../lib/journey'
import { kr } from '../lib/format'
import { CostStrip } from './CostStrip'

const zero: Totals = {
  tickets_dkk: 6000, regional_flights_dkk: 0, cabin_bag_dkk: 0, checked_bag_dkk: 0, hub_nights: 0, hub_stay_dkk: 0, ground_dkk: 0,
  ground_unknown: 0, stays_booked_dkk: 0, stays_planned_dkk: 0, stays_unknown: 0, flights: 2, air_hours: 24, days_per_country: {}, hub_stops: [],
}
const html = (t: Partial<Totals>) => renderToStaticMarkup(createElement(CostStrip, { t: { ...zero, ...t } }))
/** the Stays cell of the strip, or null when it has none */
const stays = (out: string) => out.match(/<dt>Stays<\/dt><dd>(.*?)<\/dd>/)?.[1] ?? null

describe('CostStrip', () => {
  it('shows stays with no price as not priced, never as 0 kr', () => {
    const out = html({ stays_unknown: 1 })
    expect(stays(out)).toBe('1 not priced')
    expect(stays(out)).not.toContain(kr(0))
  })

  it('shows booked and planned stays beside the ones not priced, and no Stays cell with none', () => {
    expect(stays(html({ stays_booked_dkk: 1200, stays_planned_dkk: 2100, stays_unknown: 2 }))).toBe(`${kr(1200)} booked, ${kr(2100)} planned, 2 not priced`)
    expect(stays(html({}))).toBeNull()
  })
})
