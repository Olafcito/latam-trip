import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { kr, shortKr } from '../../lib/format'
import { tripDay, type DayInput } from '../../lib/tripDay'
import { Days, DayView } from './FlightSheet'

const input: DayInput = {
  legs: [
    { key: 'h1', fam: 'flight', from: 'Lima', to: 'Cusco', depart: '2026-12-05T06:00', arrive: '2026-12-05T07:20', booked: true },
    { key: 'h2', fam: 'ground', from: 'Cusco', to: 'Puno', depart: '2026-12-07', arrive: null, booked: false },
  ],
  stops: [{ name: 'Cusco', inDay: '2026-12-05', outDay: '2026-12-07', stay: { name: 'Hostel Test', booked: true } }],
  others: [],
}
const trip = { items: (d: string) => tripDay(input, d), leg: 'h1' }
const days = ['2026-12-04', '2026-12-05', '2026-12-06', '2026-12-07']
const fares = { '2026-12-04': 410, '2026-12-05': 520, '2026-12-06': 380, '2026-12-07': 450 }
const strip = (p: Partial<Parameters<typeof Days>[0]>) =>
  renderToStaticMarkup(createElement(Days, { days, fares, at: '2026-12-05', leg: '2026-12-05', onChange: () => {}, trip, ...p }))

describe('the day strip', () => {
  it('shows the fare from on each day of a leg that is not booked, the cheapest marked', () => {
    const out = strip({})
    expect(out).toContain(kr(380))
    expect(out).toContain(kr(520))
    expect(out.match(/data-low="true"/g)).toHaveLength(1)
  })

  it('shows no live fare on a booked leg, only what was paid on its day', () => {
    const out = strip({ locked: true, booked: '2026-12-05', paid: 1234 })
    expect(out).toContain(kr(1234))
    expect(out).toContain(`</svg>${shortKr(1234)}</span>`)
    for (const p of Object.values(fares)) expect(out).not.toContain(kr(p))
    expect(out).not.toContain('data-low="true"')
  })

  it('keeps the days of a booked leg pressable, to look at the trip on them', () => {
    const out = strip({ locked: true, booked: '2026-12-05', paid: 1234 })
    expect(out).not.toContain('disabled')
    expect(out).toContain('data-held="true"')
  })

  it('marks a booked leg sharing a ticket without a price', () => {
    const out = strip({ locked: true, booked: '2026-12-05', paid: 0 })
    expect(out).toContain('the same ticket')
    expect(out).not.toContain(kr(0))
  })
})

describe('the day view', () => {
  it('lists the leg with its local times, tinting the sheet leg', () => {
    const out = renderToStaticMarkup(createElement(DayView, { day: '2026-12-05', trip }))
    expect(out).toContain('06:00')
    expect(out).toContain('07:20')
    expect(out).toContain('Lima to Cusco')
    expect(out).toContain('data-own="true"')
    expect(out).toContain('Hostel Test')
  })

  it('says a day with nothing on it in words, never a question mark', () => {
    const out = renderToStaticMarkup(createElement(DayView, { day: '2026-12-20', trip }))
    expect(out).toContain('Nothing planned')
    expect(out).not.toContain('?')
  })
})
