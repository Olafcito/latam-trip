// The map's city panel, its More view, through the real component on the small data set in fixtures.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { experienceWorld } from '../data/experiences'
import { gymWorld } from '../data/gyms'
import { buildModel } from '../data/model'
import type { Trip } from '../data/trips'
import type { Family, MapData } from '../data/types'
import { Panel, type PanelProps } from './Panel'
import type { MapModeApi } from './useMapMode'

const DATA_DIR = resolve(import.meta.dirname, 'fixtures')
const read = <T,>(name: string): T => JSON.parse(readFileSync(resolve(DATA_DIR, `${name}.json`), 'utf8'))

const data: MapData = {
  places: read('places'),
  connections: read('connections'),
  countries: read('countries'),
  experiences: read('experiences'),
  categories: read('experience_categories'),
  lists: read<{ lists: MapData['lists'] }>('lists').lists,
}
const model = buildModel(data)
const api = { gyms: gymWorld(data.experiences, data.places), exps: experienceWorld(data.experiences, data.places, data.lists) } as unknown as MapModeApi

const noop = () => {}
const more = (sel: string) =>
  renderToStaticMarkup(
    <Panel
      {...({
        model, api, trip: null, panelRef: null, collapsed: false, dir: 'out', families: new Set(),
        view: { sel, panel: 'more', route: null, from: null, opt: 0, back: null },
        onDir: noop, onCollapse: noop, onClose: noop, onMore: noop, onCity: noop, onBack: noop, onRoute: noop,
        onOption: noop, onGoTo: noop, onHoverRoute: noop, onRemoveLeg: noop, legIndex: () => -1, onCard: noop,
      } as unknown as PanelProps)}
    />,
  )

const ALL: Set<Family> = new Set(['ground', 'boat', 'flight'])
const city = (sel: string, extra: Partial<PanelProps> = {}) =>
  renderToStaticMarkup(
    <Panel
      {...({
        model, api, trip: null, panelRef: null, collapsed: false, dir: 'out', families: ALL,
        view: { sel, panel: 'city', route: null, from: null, opt: 0, back: null },
        onDir: noop, onCollapse: noop, onClose: noop, onMore: noop, onCity: noop, onBack: noop, onRoute: noop,
        onOption: noop, onGoTo: noop, onHoverRoute: noop, onRemoveLeg: noop, legIndex: () => -1, onCard: noop,
        ...extra,
      } as unknown as PanelProps)}
    />,
  )

/** The aria-label of every section of the city view, in document order. */
const sections = (html: string) => [...html.matchAll(/<section class="mc-sec[^"]*" aria-label="([^"]+)"/g)].map((m) => m[1])
/** The markup of one section, up to the next section at the same depth or the end. */
const sectionOf = (html: string, label: string) => {
  const at = html.indexOf(`aria-label="${label}"`)
  if (at < 0) return ''
  const next = html.indexOf('<section class="mc-sec', at)
  return html.slice(at, next < 0 ? undefined : next)
}

const trip: Trip = {
  id: 'TEST01', name: 'TEST01', updated: 0, start: 'MGA',
  legs: [
    { cid: 'MGA-SAL', from: 'MGA', to: 'SAL', mode: 'shuttle' },
    { cid: 'BOG-SAL', from: 'SAL', to: 'BOG', mode: 'flight' },
  ],
}

describe('the city panel as sections', () => {
  const ORDER = ['Overview', 'Saved places', 'Experiences', 'Training', 'Connections']

  it('renders the sections in the fixed order', () => {
    expect(sections(city('SAL'))).toEqual(['Overview', 'Saved places', 'Training', 'Connections'])
    expect(sections(city('LPB'))).toEqual(['Overview', 'Experiences', 'Connections'])
    for (const id of ['SAL', 'LPB', 'BOG', 'MGA']) {
      const got = sections(city(id))
      expect(got).toEqual(ORDER.filter((s) => got.includes(s)))
    }
  })

  it('leaves out an empty section', () => {
    const out = city('BOG')
    expect(out).not.toContain('aria-label="Experiences"')
    expect(out).not.toContain('aria-label="Saved places"')
    expect(out).not.toContain('aria-label="Training"')
    // with every mode off there is nothing to connect to
    expect(city('BOG', { families: new Set() })).not.toContain('aria-label="Connections"')
  })

  it('saved places come from the marks', () => {
    const saved = sectionOf(city('SAL'), 'Saved places')
    expect(saved).toContain('Boqueron')
    // a saved row is listed once, not again under Experiences
    expect(city('SAL').match(/Boqueron/g)).toHaveLength(1)
  })

  it('the overview holds the stay block', () => {
    const out = city('SAL', { stays: () => <div data-stay /> })
    expect(sectionOf(out, 'Overview')).toContain('data-stay')
  })

  it('leads a trip stop with its number and its legs in and out, with no prose', () => {
    const out = sectionOf(city('SAL', { trip }), 'Overview')
    expect(out).toMatch(/aria-label="Stop 2 of TEST01"/)
    expect(out).toContain('Managua')
    expect(out).toContain('Bogota')
    expect(out).toContain('350 kr')
    expect(out).toContain('900 kr')
    expect(out).not.toMatch(/Pick a connection|ends here|Adding to/)
  })

  it('a stop with no leg out offers the add leg control', () => {
    const out = sectionOf(city('BOG', { trip }), 'Overview')
    expect(out).toContain('San Salvador')
    expect(out).toContain('Add leg')
  })

  it('a host can give the stop its nights and dates', () => {
    const out = sectionOf(city('SAL', { trip, stopDays: () => ({ nights: 3, inDay: '2026-12-13', outDay: '2026-12-16', exact: true }) }), 'Overview')
    expect(out).toMatch(/>3<\/b> nights/)
    expect(out).toContain('13 Dec')
    expect(out).toContain('16 Dec')
  })

  it('a city off the trip shows no stop', () => {
    expect(city('LPB', { trip })).not.toContain('Stop ')
  })
})

describe('the city panel', () => {
  it('shows no research hostels, places to stay come only from what was added', () => {
    // the fixture place still carries a research hostel, the panel leaves it out
    expect(JSON.stringify(data.places.find((p) => p.id === 'SAL'))).toContain('Hostal Volcan')
    const out = more('SAL')
    expect(out).toContain('San Salvador')
    expect(out).not.toMatch(/Hostal Volcan|Hostels|per night|Dorm/)
  })
})
