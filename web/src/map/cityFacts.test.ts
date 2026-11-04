import { describe, expect, it } from 'vitest'
import { experienceWorld } from '../data/experiences'
import { gymWorld } from '../data/gyms'
import type { Experience, MapData } from '../data/types'
import { cityFinds } from './cityFacts'

// Made up places only.

const row = (id: string, over: Partial<Experience> = {}): Experience => ({
  id, name: id, category: 'culture', tags: [], area: null, country: 'NI', lat: 11, lon: -85,
  summary: null, price: null, price_dkk: null, places: [], ...over,
})
const gym = (id: string, disciplines: string[], total: number | null, over: Record<string, unknown> = {}) =>
  row(id, { category: 'training', tags: ['gym'], places: ['GRAN'], details: { disciplines, score: total == null ? null : { total }, ...over } } as Partial<Experience>)

const data = {
  places: [
    { id: 'GRAN', name: 'Granada', country: 'NI', lat: 11, lon: -85, experience_ids: [], saved_in: [] },
    { id: 'PUNO', name: 'Puno', country: 'PE', lat: -15, lon: -70, experience_ids: [], saved_in: [] },
  ],
  categories: [{ id: 'culture', name: 'Culture & markets' }],
  lists: [{ id: 'want', name: 'Want to check out', items: [{ type: 'experience', id: 'TEST01 Volcano hike', note: 'New year' }] }],
  experiences: [
    row('TEST01 Castle walk', { name: 'TEST01 Castle walk', places: ['GRAN'] }),
    row('TEST01 Volcano hike', { name: 'TEST01 Volcano hike', places: ['GRAN'] }),
    gym('box', ['Boxing'], 8),
    gym('roll', ['Muay Thai', 'Brazilian Jiu Jitsu'], 6, { price_dropin_dkk: 75 }),
    gym('mat', ['BJJ'], null),
    row('card', { tags: ['city-scorecard'], area: 'Granada', places: ['GRAN'], details: { score: { total: 4.7 } } } as Partial<Experience>),
  ],
} as unknown as Pick<MapData, 'experiences' | 'places' | 'lists' | 'categories'>

const gyms = gymWorld(data.experiences, data.places)
const exps = experienceWorld(data.experiences, data.places, data.lists)
const read = (id: string, things?: string[]) => cityFinds(gyms, exps, data.categories, id, things)

describe('a city\'s finds', () => {
  it('lists gyms only, the ones that teach BJJ first and best first among them', () => {
    const { training } = read('GRAN')
    expect(training.map((t) => t.ref?.id)).toEqual(['roll', 'mat', 'box'])
    expect(training.every((t) => t.ref?.kind === 'gym')).toBe(true)
  })

  it('puts BJJ first among a gym\'s disciplines and keeps its drop in price and score', () => {
    const [roll, mat, box] = read('GRAN').training
    expect(roll).toMatchObject({ chips: ['BJJ', 'Muay Thai'], dropIn: 75, score: 6 })
    expect(mat).toMatchObject({ chips: ['BJJ'], dropIn: null, score: null })
    expect(box.chips).toEqual(['Boxing'])
  })

  it('lists saved experiences first with their note, then the rest with their category', () => {
    const { experiences } = read('GRAN')
    expect(experiences.map((e) => e.name)).toEqual(['TEST01 Volcano hike', 'TEST01 Castle walk'])
    expect(experiences[0]).toMatchObject({ saved: true, note: 'New year', sub: null })
    expect(experiences[1]).toMatchObject({ saved: false, note: null, sub: 'Culture & markets' })
  })

  it('adds the things to do that are not an experience already, as rows that open nothing', () => {
    const { experiences } = read('GRAN', ['TEST01 castle walk at dusk', 'TEST01 Lake boat', 'TEST01 lake boat'])
    expect(experiences.map((e) => e.name)).toEqual(['TEST01 Volcano hike', 'TEST01 Castle walk', 'TEST01 Lake boat'])
    expect(experiences[2]).toMatchObject({ ref: null, sub: null, saved: false })
  })

  it('gives a place with nothing two empty lists', () => {
    expect(read('PUNO')).toEqual({ experiences: [], training: [] })
  })
})
