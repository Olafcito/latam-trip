// Every row of the small data set in fixtures through the real card. The set is built by the pipeline from
// plugin/scripts/fixtures/corpus, plus a gym and an experience with no coordinate, which the schema cannot hold.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { experienceWorld } from '../data/experiences'
import { gymWorld } from '../data/gyms'
import { buildModel } from '../data/model'
import type { MapData } from '../data/types'
import { CardWindow } from './CardWindow'
import type { CardRef, MapModeApi } from './useMapMode'

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
const gyms = gymWorld(data.experiences, data.places)
const exps = experienceWorld(data.experiences, data.places, data.lists)

function cardMarkup(card: CardRef): string {
  const api = { card, stack: [card], gyms, exps, titleOf: () => 'Title' } as unknown as MapModeApi
  const noop = () => {}
  return renderToStaticMarkup(<CardWindow api={api} model={model} left={0} cardRef={null} backTo="List" onBack={noop} onClose={noop} onOpen={noop} onShow={noop} />)
}

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const words = (html: string) => decode(html.replace(/<[^>]*>/g, '\n'))
/** What a person can read off the card, attributes such as alt and aria-label included. */
const textOf = (html: string) => [words(html), ...[...html.matchAll(/\b(?:alt|aria-label|title)="([^"]*)"/g)].map((m) => decode(m[1]))].join('\n')

const cards: CardRef[] = [
  ...gyms.gyms.map((g): CardRef => ({ kind: 'gym', id: g.id })),
  ...gyms.cities.map((c): CardRef => ({ kind: 'city', id: c.id })),
  ...exps.all.map((e): CardRef => ({ kind: 'experience', id: e.id })),
]

describe('every card in the data', () => {
  it('covers every row', () => {
    const plain = (data.experiences ?? []).filter((r) => !r.tags?.includes('gym') && !r.tags?.includes('city-scorecard'))
    // the gym with no coordinate has no card, every other row has one
    expect(gyms.gyms.map((g) => g.id).sort()).toEqual(['gym-sal-strike', 'gym-sal-unrated'])
    expect(gyms.cities.map((c) => c.id)).toEqual(['city-san-salvador-training'])
    expect(exps.all.map((e) => e.id).sort()).toEqual(['boqueron-crater', 'salt-flat-tour', 'titicaca-day'])
    expect(exps.all.length).toBe(plain.length)
    expect(cards.length).toBe(6)
  })

  it('shows a card for each, with no null, no undefined, no NaN, no question mark and no raw field name', () => {
    const bad: string[] = []
    for (const card of cards) {
      const text = textOf(cardMarkup(card))
      if (text.length < 40) bad.push(`${card.kind} ${card.id}: empty card`)
      for (const line of text.split('\n')) {
        // a raw field by how the schema ends them: a photo credit or a handle such as diego_cue is fine
        if (/\b(null|undefined|NaN)\b|\[object|\?|\b[a-z]+(_[a-z]+)*_(dkk|rent|url|note|km|usd|day|month|index)\b/.test(line)) bad.push(`${card.kind} ${card.id}: ${line.slice(0, 120)}`)
      }
    }
    expect(bad).toEqual([])
  })
})
