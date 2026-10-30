import { describe, expect, it } from 'vitest'
import type { Experience, MapData } from '@map/data/types'
import { placeFinds } from './placeFinds'

const row = (id: string, over: Partial<Experience> = {}): Experience => ({
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

const place = { id: 'GRAN', name: 'Granada', country: 'NI', lat: 11, lon: -85, experience_ids: [], saved_in: [] }
const empty = { id: 'PUNO', name: 'Puno', country: 'PE', lat: -15, lon: -70, experience_ids: [], saved_in: [] }

const data = {
  places: [place, empty],
  categories: [{ id: 'culture', name: 'Culture & markets' }],
  lists: [{ id: 'want', name: 'Want to check out', items: [{ type: 'experience', id: 'party', note: 'New year' }, { type: 'experience', id: 'zip', note: '' }] }],
  experiences: [
    row('walk', { places: ['GRAN'] }),
    row('party', { places: ['GRAN'] }),
    row('zip', { places: ['GRAN'] }),
    row('low', { category: 'training', tags: ['gym'], places: ['GRAN'], details: { score: { total: 4.25 } } }),
    row('high', { category: 'training', tags: ['gym'], places: ['GRAN'], details: { score: { total: 7 } } }),
    row('none', { category: 'training', tags: ['gym'], places: ['GRAN'] }),
    row('card', { tags: ['city-scorecard'], area: 'Granada', places: ['GRAN'], details: { score: { total: 3.4 } } }),
  ],
} as unknown as Pick<MapData, 'experiences' | 'places' | 'lists' | 'categories'>

describe('placeFinds', () => {
  const read = placeFinds(data)

  it('lists saved experiences first and says so in the row', () => {
    const { experiences } = read('GRAN')
    expect(experiences.map((e) => e.name)).toEqual(['party', 'zip', 'walk'])
    expect(experiences.map((e) => e.sub)).toEqual(['Saved: New year', 'Saved', 'Culture & markets'])
    expect(experiences.map((e) => e.saved)).toEqual([true, true, false])
    expect(experiences[0].ref).toEqual({ kind: 'experience', id: 'party' })
  })

  it('puts the city scorecard above its gyms, best gym first', () => {
    const { training } = read('GRAN')
    expect(training.map((t) => t.ref.id)).toEqual(['card', 'high', 'low', 'none'])
    expect(training[0]).toMatchObject({ ref: { kind: 'city', id: 'card' }, name: 'Granada', sub: 'City scorecard', score: '3.4' })
  })

  it('leaves a score out when there is none', () => {
    const { training } = read('GRAN')
    expect(training.map((t) => t.score)).toEqual(['3.4', '7.0', '4.3', null])
  })

  it('gives a place with nothing two empty lists', () => {
    expect(read('PUNO')).toEqual({ experiences: [], training: [] })
  })
})
