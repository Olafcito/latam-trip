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
import { ModeSheet } from './ModeSheet'
import { Panel, sheetHead, type PanelProps } from './Panel'
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

  it('the leg rows show the numbers the itinerary shows for the same leg', () => {
    const itinerary: Trip = { ...trip, legs: [trip.legs[0], { ...trip.legs[1], minutes: 465, dkk: 1755 }] }
    const out = sectionOf(city('SAL', { trip: itinerary }), 'Overview')
    expect(out).toContain('7h45m')
    expect(out).toContain('1.755 kr')
    const bog = sectionOf(city('BOG', { trip: itinerary }), 'Overview')
    expect(bog).toContain('7h45m')
    expect(bog).toContain('1.755 kr')
  })

  it('a stop visited twice reads its legs from its own visits', () => {
    const twice: Trip = {
      ...trip,
      legs: [
        { cid: 'MGA-SAL', from: 'MGA', to: 'SAL', mode: 'shuttle' },
        { cid: 'BOG-SAL', from: 'SAL', to: 'BOG', mode: 'flight' },
        { cid: 'BOG-SAL', from: 'BOG', to: 'SAL', mode: 'flight' },
      ],
    }
    const sal = sectionOf(city('SAL', { trip: twice }), 'Overview')
    expect(sal).toContain('aria-label="Stop 2 and 4 of TEST01"')
    // it arrives from Managua the first time and is left only by the end of the trip
    expect(sal).toContain('Managua')
    expect(sal).toContain('Add leg')
    const bog = sectionOf(city('BOG', { trip: twice }), 'Overview')
    expect(bog).toMatch(/ts-no mono">2</)
    expect(bog).toMatch(/ts-no mono">4</)
  })

  it('a one stop trip is first and last at once', () => {
    const one: Trip = { ...trip, legs: [] }
    const out = sectionOf(city('MGA', { trip: one }), 'Overview')
    expect(out).toContain('aria-label="Stop 1 of TEST01"')
    expect(out).toContain('Add leg')
  })

  it('a trip with no stops offers a way to start at the open city', () => {
    const none: Trip = { ...trip, start: undefined, legs: [] }
    expect(sectionOf(city('SAL', { trip: none }), 'Overview')).toContain('Start here')
  })

  it('a leg to a place the map does not have shows no row and never an id', () => {
    const lost: Trip = { ...trip, legs: [{ cid: 'MGA-SAL', from: 'MGA', to: 'ZZZ9', mode: 'shuttle' }] }
    const out = sectionOf(city('MGA', { trip: lost }), 'Overview')
    expect(out).not.toContain('ZZZ9')
  })

  it('Fly in and Fly home are rows shaped like a leg, with the Unknown mark where a fact is missing', () => {
    const flown = {
      ...trip,
      legs: [],
      inout: {
        entry: 'MGA', exit: 'MGA',
        way_in: { from: 'CPH', to: 'MGA', depart: null, arrive: '2026-12-02T21:36', total_hours: 18.7, price_dkk: 3000 },
        way_home: { from: 'MGA', to: 'CPH', depart: '2027-02-03T08:00', arrive: null, total_hours: null },
      },
    } as unknown as Trip
    const out = sectionOf(city('MGA', { trip: flown }), 'Overview')
    expect(out).toContain('Fly in')
    expect(out).toContain('2 Dec')
    expect(out).toContain('18h42m')
    expect(out).toContain('3.000 kr')
    expect(out).toContain('Fly home')
    expect(out).toContain('3 Feb')
    expect(out).toContain('Travel time not known')
    expect(out).toContain('Price not known')
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

describe('the panel in the phone sheet', () => {
  const props = (sel: string, extra: Partial<PanelProps> = {}) =>
    ({
      model, api, trip: null, panelRef: null, collapsed: false, dir: 'out', families: ALL,
      view: { sel, panel: 'city', route: null, from: null, opt: 0, back: null },
      onDir: noop, onCollapse: noop, onClose: noop, onMore: noop, onCity: noop, onBack: noop, onRoute: noop,
      onOption: noop, onGoTo: noop, onHoverRoute: noop, onRemoveLeg: noop, legIndex: () => -1, onCard: noop,
      ...extra,
    }) as unknown as PanelProps

  it('a hosted panel renders no close of its own', () => {
    expect(city('SAL')).toContain('aria-label="Close"')
    const hosted = city('SAL', { hosted: true })
    expect(hosted).not.toContain('aria-label="Close"')
    expect(hosted).not.toContain('aria-label="Collapse panel"')
    expect(hosted).not.toContain('aria-label="Details"')
  })

  it('a hosted panel leaves its name to the sheet head', () => {
    expect(city('SAL', { hosted: true })).not.toContain('class="pname"')
    const head = sheetHead(props('SAL'))!
    expect(head.label).toBe('San Salvador')
    expect(renderToStaticMarkup(<>{head.title}</>)).toContain('San Salvador')
  })

  it('the phone sheet names the stop number with the place', () => {
    expect(sheetHead(props('SAL', { trip }))!.label).toBe('Stop 2, San Salvador')
  })

  it('the stop sheet peek line carries the number, the nights and the next place', () => {
    const head = sheetHead(props('SAL', { trip, stopDays: () => ({ nights: 3, inDay: '2026-12-04', outDay: '2026-12-07', exact: true }) }))!
    const html = renderToStaticMarkup(<>{head.count}</>)
    expect(html).toContain('Stop 2')
    expect(html).toContain('3 nights')
    expect(html).toMatch(/aria-label="[A-Za-z ]+"/)
  })

  it('the sheet head puts the stop number of the open trip on the photo', () => {
    const peek = sheetHead(props('SAL', { trip }))!.peek
    expect(renderToStaticMarkup(<>{peek}</>)).toMatch(/class="stopno[^"]*"[^>]*>2</)
  })

  it('the title sits outside the scroll body, so the peek shows the name', () => {
    const head = sheetHead(props('SAL'))!
    const html = renderToStaticMarkup(
      <ModeSheet
        title={head.title}
        label={head.label}
        count={head.count}
        peek={head.peek}
        narrow
        collapsed
        cardOpen={false}
        panelRef={{ current: null }}
        onCollapse={noop}
        onClose={noop}
        detentMemo={{ current: null }}
        scrollMemo={{}}
        scrollKey="city:SAL"
      >
        <Panel {...props('SAL', { hosted: true })} />
      </ModeSheet>,
    )
    const name = html.indexOf('San Salvador')
    expect(name).toBeGreaterThan(-1)
    expect(name).toBeLessThan(html.indexOf('class="mscroll"'))
    expect(html).toContain('aria-label="San Salvador"')
    expect(html.match(/aria-label="Close"/g)).toHaveLength(1)
  })
})
