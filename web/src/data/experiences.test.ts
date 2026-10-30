import { describe, expect, it } from 'vitest'
import {
  NEAR_PLACE_KM,
  NO_EXPERIENCE_FILTER,
  categoriesIn,
  categoryLabel,
  countriesOf,
  detailLines,
  experienceWorld,
  filterExperiences,
  filterSaved,
  groupByPlace,
  sourceLabel,
} from './experiences'
import type { Experience, SavedList } from './types'

const exp = (id: string, over: Partial<Experience> = {}): Experience => ({
  id,
  name: id,
  category: 'culture',
  tags: [],
  area: null,
  country: 'NI',
  lat: 11,
  lon: -85,
  summary: null,
  price: null,
  price_dkk: null,
  places: [],
  ...over,
})

const place = (id: string, over: Partial<Parameters<typeof experienceWorld>[1][number]> = {}) => ({
  id,
  name: `${id} town`,
  country: 'NI',
  lat: 11,
  lon: -85,
  experience_ids: [],
  saved_in: [],
  ...over,
})

const want = (...items: SavedList['items']): SavedList[] => [{ id: 'want', name: 'Want to check out', items }]

describe('experienceWorld grouping', () => {
  it('puts an experience under the places that list it and the ones it names', () => {
    const w = experienceWorld([exp('a'), exp('b', { places: ['Y'] })], [place('X', { experience_ids: ['a'] }), place('Y')], [])
    expect(w.at('X').map((e) => e.id)).toEqual(['a'])
    expect(w.at('Y').map((e) => e.id)).toEqual(['b'])
    expect(w.placeOf('a')).toBe('X')
  })

  it('does not list a row twice when both sides name the same place', () => {
    const w = experienceWorld([exp('a', { places: ['X'] })], [place('X', { experience_ids: ['a'] })], [])
    expect(w.at('X')).toHaveLength(1)
  })

  it('leaves gyms and scorecards to the Training section', () => {
    const rows = [exp('g', { tags: ['gym'], places: ['X'] }), exp('c', { tags: ['city-scorecard'], places: ['X'] }), exp('a', { places: ['X'] })]
    const w = experienceWorld(rows, [place('X', { experience_ids: ['g', 'c', 'a'] })], [])
    expect(w.all.map((e) => e.id)).toEqual(['a'])
    expect(w.at('X').map((e) => e.id)).toEqual(['a'])
  })

  it('files a row with no place under the closest place within 30 km', () => {
    const rows = [exp('near', { lat: 11.1, lon: -85 })]
    const w = experienceWorld(rows, [place('FAR', { lat: 11.25 }), place('CLOSE', { lat: 11 })], [])
    expect(w.at('CLOSE').map((e) => e.id)).toEqual(['near'])
    expect(w.at('FAR')).toEqual([])
  })

  it('files nothing past 30 km, and such a row still counts', () => {
    const away = 11 + (NEAR_PLACE_KM + 2) / 111
    const w = experienceWorld([exp('far', { lat: away })], [place('X')], [])
    expect(w.at('X')).toEqual([])
    expect(w.placeOf('far')).toBeNull()
    expect(w.all).toHaveLength(1)
  })

  it('ignores the 30 km rule for a row that has a place', () => {
    const w = experienceWorld([exp('a', { places: ['X'], lat: 11 })], [place('X', { lat: 12 }), place('Y', { lat: 11 })], [])
    expect(w.at('Y')).toEqual([])
  })

  it('skips a row without coordinates', () => {
    const w = experienceWorld([exp('a', { lat: null, lon: null })], [place('X')], [])
    expect(w.at('X')).toEqual([])
  })

  it('sorts saved rows first, then by name', () => {
    const rows = [exp('b', { places: ['X'] }), exp('c', { places: ['X'] }), exp('a', { places: ['X'] })]
    const w = experienceWorld(rows, [place('X')], want({ type: 'experience', id: 'c', note: 'NYE' }))
    expect(w.at('X').map((e) => e.id)).toEqual(['c', 'a', 'b'])
  })
})

describe('saved marks', () => {
  const rows = [exp('party', { places: ['GRAN'] }), exp('walk', { places: ['GRAN'] })]
  const places = [place('GRAN'), place('DRAKE', { country: 'CR' }), place('NONE')]
  const lists = want(
    { type: 'experience', id: 'party', note: 'New Year candidate' },
    { type: 'place', id: 'DRAKE', note: 'Sharks' },
    { type: 'place', id: 'GONE', note: 'Not on the map' },
  )

  it('keeps the note and the list', () => {
    const w = experienceWorld(rows, places, lists)
    expect(w.markOf('experience', 'party')).toEqual({ list: 'Want to check out', note: 'New Year candidate' })
    expect(w.markOf('experience', 'walk')).toBeNull()
  })

  it('badges a saved place and a place holding a saved experience', () => {
    const w = experienceWorld(rows, places, lists)
    expect([...w.savedPlaces].sort()).toEqual(['DRAKE', 'GRAN'])
  })

  it('drops an item that points at nothing', () => {
    const w = experienceWorld(rows, places, lists)
    expect(w.saved.map((s) => s.id)).toEqual(['party', 'DRAKE'])
  })

  it('counts saved_in on a row that no list carries', () => {
    const w = experienceWorld([exp('x', { saved_in: ['want'] })], [place('P', { saved_in: ['want'] })], want())
    expect(w.markOf('experience', 'x')).toEqual({ list: 'Want to check out', note: null })
    expect(w.savedPlaces.has('P')).toBe(true)
    expect(w.saved).toHaveLength(2)
  })

  it('reads no marks from no lists', () => {
    const w = experienceWorld(rows, places, undefined)
    expect(w.saved).toEqual([])
  })
})

describe('filters', () => {
  const rows = [
    exp('a', { country: 'NI', category: 'food' }),
    exp('b', { country: 'NI', category: 'beach' }),
    exp('c', { country: 'CR', category: 'beach' }),
  ]
  const places = [place('DRAKE', { country: 'CR' })]
  const w = experienceWorld(rows, places, want({ type: 'experience', id: 'a' }, { type: 'place', id: 'DRAKE', note: 'Sharks' }))

  it('passes everything with no filter', () => {
    expect(filterExperiences(w, NO_EXPERIENCE_FILTER)).toHaveLength(3)
  })

  it('matches any picked country and any picked category', () => {
    const ids = (f: Partial<typeof NO_EXPERIENCE_FILTER>) => filterExperiences(w, { ...NO_EXPERIENCE_FILTER, ...f }).map((e) => e.id)
    expect(ids({ countries: ['CR'] })).toEqual(['c'])
    expect(ids({ countries: ['CR', 'NI'] })).toEqual(['a', 'b', 'c'])
    expect(ids({ categories: ['beach', 'food'], countries: ['NI'] })).toEqual(['a', 'b'])
  })

  it('narrows to saved', () => {
    expect(filterExperiences(w, { ...NO_EXPERIENCE_FILTER, saved: true }).map((e) => e.id)).toEqual(['a'])
  })

  it('lets a saved place through a country filter but not a category filter', () => {
    expect(filterSaved(w, { ...NO_EXPERIENCE_FILTER, countries: ['CR'] }).map((s) => s.id)).toEqual(['DRAKE'])
    expect(filterSaved(w, { ...NO_EXPERIENCE_FILTER, categories: ['food'] }).map((s) => s.id)).toEqual(['a'])
  })

  it('counts countries biggest first and categories inside the pick', () => {
    expect(countriesOf(w)).toEqual([['NI', 2], ['CR', 1]])
    expect(categoriesIn(w, [])).toEqual([['beach', 2], ['food', 1]])
    expect(categoriesIn(w, ['CR'])).toEqual([['beach', 1]])
  })
})

describe('groupByPlace', () => {
  it('sorts by place name and gives a lone row its own area', () => {
    const rows = [exp('a', { places: ['Z'] }), exp('b', { places: ['A'] }), exp('coiba', { area: 'Coiba', lat: 7.4, lon: -81 })]
    const places = [place('Z'), place('A')]
    const w = experienceWorld(rows, places, [])
    expect(groupByPlace(w, w.all, places).map((g) => [g.name, g.rows.length])).toEqual([['A town', 1], ['Coiba', 1], ['Z town', 1]])
  })
})

describe('detailLines', () => {
  it('leaves out what has no value', () => {
    const lines = detailLines({ water: 'warm', animals: null, depth: '', extras: [], cert: 0, rating: undefined })
    expect(lines.map((l) => l.label)).toEqual(['Water', 'Cert'])
  })

  it('makes a label of the key, a link of a url and words of the rest', () => {
    const [url, list, yes] = detailLines({ hostel_world: 'https://example.com/x', animals: ['ray', 'shark'], party_day: true })
    expect(url).toMatchObject({ label: 'Hostel world', href: 'https://example.com/x' })
    expect(list).toMatchObject({ value: 'ray, shark', href: null })
    expect(yes.value).toBe('Yes')
  })

  it('copes with no details', () => {
    expect(detailLines(null)).toEqual([])
    expect(detailLines({ nested: { a: 1 } })).toEqual([])
  })
})

describe('labels', () => {
  it('names a category from the table, else from its id', () => {
    expect(categoryLabel([{ id: 'diving', name: 'Diving & snorkelling' }], 'diving')).toBe('Diving & snorkelling')
    expect(categoryLabel([], 'hiking')).toBe('Hiking')
  })

  it('shows the domain of a source', () => {
    expect(sourceLabel('https://www.example.com/a/b')).toBe('example.com')
    expect(sourceLabel('not a url')).toBe('not a url')
  })
})
