// The guest view: the city panel on the public web map, with no trip, no stays and no leg handler.
// It must carry no edit controls, because a guest cannot change anything (FEAT-001, PROD-005).
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
const guestCity = (sel: string) =>
  renderToStaticMarkup(
    <Panel
      {...({
        model, api, trip: null, panelRef: null, collapsed: false, dir: 'out', families: new Set(),
        view: { sel, panel: 'city', route: null, from: null, opt: 0, back: null },
        stays: undefined, onAddLeg: undefined,
        onDir: noop, onCollapse: noop, onClose: noop, onMore: noop, onCity: noop, onBack: noop, onRoute: noop,
        onOption: noop, onGoTo: noop, onHoverRoute: noop, onRemoveLeg: noop, legIndex: () => -1, onCard: noop,
      } as unknown as PanelProps)}
    />,
  )

describe('the guest city panel', () => {
  const out = guestCity('SAL')

  it('renders the city', () => {
    expect(out).toContain('San Salvador')
  })

  it('has no button that starts with Add', () => {
    const buttons = [...out.matchAll(/<button\b[^>]*>(.*?)<\/button>/gs)].map((m) => m[1].replace(/<[^>]*>/g, '').trim())
    expect(buttons.filter((t) => t.startsWith('Add'))).toEqual([])
  })

  it('has no control labelled Edit', () => {
    expect(out).not.toMatch(/aria-label="[^"]*Edit/)
  })
})
