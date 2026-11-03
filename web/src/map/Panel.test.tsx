// The map's city panel, its More view, through the real component on the small data set in fixtures.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { experienceWorld } from '../data/experiences'
import { gymWorld } from '../data/gyms'
import { buildModel } from '../data/model'
import type { MapData } from '../data/types'
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

describe('the city panel', () => {
  it('shows no research hostels, places to stay come only from what was added', () => {
    // the fixture place still carries a research hostel, the panel leaves it out
    expect(JSON.stringify(data.places.find((p) => p.id === 'SAL'))).toContain('Hostal Volcan')
    const out = more('SAL')
    expect(out).toContain('San Salvador')
    expect(out).not.toMatch(/Hostal Volcan|Hostels|per night|Dorm/)
  })
})
