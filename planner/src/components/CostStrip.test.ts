import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Totals } from '../lib/journey'
import { kr } from '../lib/format'
import { CostStrip } from './CostStrip'

const zero: Totals = {
  tickets_dkk: 6000, regional_flights_dkk: 0, cabin_bag_dkk: 0, checked_bag_dkk: 0, hub_nights: 0, hub_stay_dkk: 0, ground_dkk: 0,
  ground_unknown: 0, regional_unknown: 0, stays_booked_dkk: 0, stays_planned_dkk: 0, stays_unknown: 0, flights: 2, air_hours: 24, days_per_country: {}, hub_stops: [],
}
const html = (t: Partial<Totals>) => renderToStaticMarkup(createElement(CostStrip, { t: { ...zero, ...t } }))
/** the Stays cell of the strip, or null when it has none */
const stays = (out: string) => out.match(/<dt>Stays<\/dt><dd>(.*?)<\/dd>/)?.[1] ?? null
const cell = (out: string, k: string) => out.match(new RegExp(`<dt>${k}</dt><dd>(.*?)</dd>`))?.[1] ?? null
/** the Travel total's text, with whether its chip reads complete */
const total = (out: string) => {
  const m = out.match(/<dt>Travel total<\/dt><dd><span class="total-mark" data-complete="(true|false)">(.*?)<\/span><\/dd>/)
  return m ? { complete: m[1] === 'true', text: m[2] } : null
}

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

  it('shows a regional flight with no price as not priced, in its line and in the travel total', () => {
    const out = html({ regional_flights_dkk: 900, regional_unknown: 1 })
    expect(cell(out, 'Regional flights')).toBe(`${kr(900)}, 1 not priced`)
    expect(total(out)).toEqual({ complete: false, text: `${kr(6900)}, 1 not priced` })
    expect(cell(html({ regional_unknown: 2 }), 'Regional flights')).toBe('Not priced')
    // a hub stay and cabin bags with no price count too, as the total leaves them out
    expect(total(html({ hub_stay_dkk: null, cabin_bag_dkk: null, ground_unknown: 1 }))).toEqual({ complete: false, text: `${kr(6000)}, 3 not priced` })
    expect(total(html({}))).toEqual({ complete: true, text: kr(6000) })
  })

  it('marks a single unknown cabin or checked bag fee with the hollow mark, never the words not known', () => {
    const out = html({ cabin_bag_dkk: null, checked_bag_dkk: null })
    expect(cell(out, 'Cabin-bag fees')).toContain('class="unk"')
    expect(cell(out, 'Checked-bag fees')).toContain('class="unk"')
    expect(out).not.toContain('not known')
  })

  it('marks the travel total as an outline chip when part of it is not priced, a solid one once it is all in', () => {
    expect(total(html({}))?.complete).toBe(true)
    expect(total(html({ regional_unknown: 1 }))?.complete).toBe(false)
  })
})
