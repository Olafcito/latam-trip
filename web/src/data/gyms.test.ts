import { describe, expect, it } from 'vitest'
import {
  NO_FILTER,
  costRange,
  disciplinesOf,
  filterCities,
  filterGyms,
  filtersActive,
  gymLinks,
  gymWorld,
  hiddenByCost,
  mapsUrl,
  monthlyCost,
  rankCities,
  rankGyms,
  scoreTier,
  spreadGyms,
  topScore,
} from './gyms'
import type { CityDetails, CityRow, Experience, GymDetails, GymRow } from './types'

const base = { category: 'training', area: 'Area', lat: 10, lon: -80, summary: null, price: null, price_dkk: null }

const gym = (id: string, over: Partial<GymRow> = {}, details: GymDetails = {}): GymRow => ({
  ...base,
  id,
  name: id,
  tags: ['gym'],
  country: 'MX',
  places: [],
  ...over,
  details,
})

const score = (total: number | null) => ({ training: null, evidence: null, local_life: null, cost: null, water: null, total })

const city = (id: string, over: Partial<CityRow> = {}, details: CityDetails = {}): CityRow => ({
  ...base,
  id,
  name: `${id}: training base scorecard`,
  tags: ['city-scorecard'],
  country: 'MX',
  places: [],
  ...over,
  details,
})

const rows = (...r: (GymRow | CityRow)[]) => r as Experience[]
const ids = (r: { id: string }[]) => r.map((x) => x.id)

describe('disciplinesOf', () => {
  it('joins the tags and the parsed details', () => {
    const g = gym('a', { tags: ['gym', 'kickboxing'] }, { disciplines: ['Muay Thai', 'Brazilian Jiu-Jitsu'] })
    expect(disciplinesOf(g)).toEqual(['Muay Thai', 'Kickboxing', 'BJJ'])
  })
  it('reads several disciplines out of one value', () => {
    expect(disciplinesOf(gym('a', {}, { disciplines: ['Chute Boxe (Muay Thai, boxing, MMA style)'] }))).toEqual(['Muay Thai', 'Boxing', 'MMA'])
  })
  it('does not count fitness boxing as boxing, even with the tag', () => {
    expect(disciplinesOf(gym('a', { tags: ['gym', 'boxing'] }, { disciplines: ['boxing (fitness)'] }))).toEqual([])
  })
  it('keeps plain boxing next to fitness boxing', () => {
    expect(disciplinesOf(gym('a', {}, { disciplines: ['boxing (fitness)', 'boxing'] }))).toEqual(['Boxing'])
  })
  it('falls back to the tags when the details have no list', () => {
    expect(disciplinesOf(gym('a', { tags: ['gym', 'mma'] }, { disciplines: null }))).toEqual(['MMA'])
  })
})

describe('gymWorld', () => {
  it('leaves out rows that are neither gyms nor cards, and gyms without a location', () => {
    const w = gymWorld(rows(gym('a'), gym('b', { lat: null }), { ...city('c'), tags: ['other'], category: 'hike' }), [])
    expect(ids(w.gyms)).toEqual(['a'])
    expect(w.cities).toEqual([])
  })
  it('handles no rows at all', () => {
    const w = gymWorld(undefined, [])
    expect(w.gyms).toEqual([])
    expect(costRange(w)).toBeNull()
    expect(topScore(w)).toBe(0)
  })
  it('ties a gym to the card that lists it, and otherwise to the card of its place', () => {
    const c = city('c', { places: ['GDL'] }, { gyms: ['listed'] })
    const w = gymWorld(rows(gym('listed'), gym('sameplace', { places: ['GDL'] }), gym('nocard', { places: ['MDE'] }), c), [])
    expect(w.cityOf.get('listed')?.id).toBe('c')
    expect(w.cityOf.get('sameplace')?.id).toBe('c')
    expect(w.cityOf.has('nocard')).toBe(false)
    expect(ids(w.gymsOf(c)).sort()).toEqual(['listed', 'sameplace'])
    expect(ids(w.gymsAtPlace('MDE'))).toEqual(['nocard'])
    expect(w.cityOfPlace('MDE')).toBeNull()
  })
  it('skips ids a card lists that do not exist', () => {
    const c = city('c', {}, { gyms: ['gone'] })
    expect(gymWorld(rows(c), []).gymsOf(c)).toEqual([])
  })
  it('gives a card without a place the closest place within 25 km', () => {
    const c = city('c', { lat: 24.14, lon: -110.31, places: [] })
    const near = { id: 'LAP', lat: 24.07, lon: -110.36 }
    const far = { id: 'FAR', lat: 25.5, lon: -110.3 }
    expect(gymWorld(rows(c), [far, near]).cityOfPlace('LAP')?.id).toBe('c')
    expect(gymWorld(rows(c), [far]).cityOfPlace('FAR')).toBeNull()
  })
})

describe('monthlyCost', () => {
  const c = city('c', {}, { numbeo: { monthly_total_dkk: 5000 } })
  it('adds the gym to the city total', () => {
    expect(monthlyCost(gym('a', {}, { price_month_dkk: 400 }), c)).toEqual({ living: 5000, gym: 400, total: 5400 })
  })
  it('falls back to price_dkk for the gym', () => {
    expect(monthlyCost(gym('a', { price_dkk: 300 }), c)?.gym).toBe(300)
  })
  it('is the city alone when the gym price is unknown', () => {
    expect(monthlyCost(gym('a'), c)).toEqual({ living: 5000, gym: null, total: 5000 })
  })
  it('is null without a Numbeo total or a city', () => {
    expect(monthlyCost(gym('a', { price_dkk: 300 }), city('d', {}, { numbeo: { monthly_total_dkk: null } }))).toBeNull()
    expect(monthlyCost(gym('a'), undefined)).toBeNull()
  })
})

describe('filters', () => {
  const cheap = city('cheap', { country: 'BO', places: ['A'] }, { gyms: ['muay'], numbeo: { monthly_total_dkk: 3000 }, score: score(7) })
  const dear = city('dear', { country: 'MX', places: ['B'] }, { gyms: ['bjj'], numbeo: { monthly_total_dkk: 9000 }, score: score(3) })
  const blank = city('blank', { country: 'MX', places: ['C'] }, { gyms: ['nocost'], numbeo: null, score: null })
  const empty = city('empty', { country: 'MX', places: ['D'] }, { numbeo: { monthly_total_dkk: 4000 }, score: score(5) })
  const w = gymWorld(
    rows(
      gym('muay', { tags: ['gym', 'muay-thai'], country: 'BO' }, { score: score(6.5), water_km: 2, price_month_dkk: 500 }),
      gym('bjj', { tags: ['gym', 'bjj'] }, { score: score(3), water_km: 5 }),
      gym('nocost', { tags: ['gym', 'mma'] }, { score: score(5), water_km: null }),
      cheap,
      dear,
      blank,
      empty,
    ),
    [],
  )

  it('passes everything with no filter', () => {
    expect(filterGyms(w, NO_FILTER)).toHaveLength(3)
    expect(filterCities(w, NO_FILTER)).toHaveLength(4)
    expect(filtersActive(NO_FILTER)).toBe(0)
  })
  it('matches any chosen discipline', () => {
    expect(ids(filterGyms(w, { ...NO_FILTER, disciplines: ['BJJ', 'MMA'] }))).toEqual(['bjj', 'nocost'])
  })
  it('matches any chosen country', () => {
    expect(ids(filterGyms(w, { ...NO_FILTER, countries: ['BO'] }))).toEqual(['muay'])
  })
  it('drops gyms under the minimum score, also gyms with no score', () => {
    const noScore = gymWorld(rows(gym('a', {}, { score: score(5) }), gym('b')), [])
    expect(ids(filterGyms(noScore, { ...NO_FILTER, minScore: 4.5 }))).toEqual(['a'])
  })
  it('counts the city total plus the gym price against the maximum cost', () => {
    expect(ids(filterGyms(w, { ...NO_FILTER, maxCost: 3500 }))).toEqual(['muay'])
    expect(filterGyms(w, { ...NO_FILTER, maxCost: 3499 })).toEqual([])
  })
  it('reports gyms hidden only for lack of cost data', () => {
    expect(hiddenByCost(w, { ...NO_FILTER, maxCost: 3500 })).toBe(1)
    expect(hiddenByCost(w, { ...NO_FILTER, maxCost: 3500, disciplines: ['BJJ'] })).toBe(0)
    expect(hiddenByCost(w, NO_FILTER)).toBe(0)
  })
  it('treats near water as strictly under 5 km, and unknown as not near', () => {
    expect(ids(filterGyms(w, { ...NO_FILTER, nearWater: true }))).toEqual(['muay'])
  })
  it('combines filters with and', () => {
    expect(filterGyms(w, { ...NO_FILTER, countries: ['MX'], nearWater: true })).toEqual([])
    expect(filtersActive({ ...NO_FILTER, countries: ['MX', 'BO'], nearWater: true, minScore: 4, maxCost: 5000 })).toBe(5)
  })
  it('keeps a city when one of its gyms matches, and drops cities with no gyms for those filters', () => {
    expect(ids(filterCities(w, { ...NO_FILTER, disciplines: ['Muay Thai'] }))).toEqual(['cheap'])
    expect(ids(filterCities(w, { ...NO_FILTER, nearWater: true }))).toEqual(['cheap'])
  })
  it('filters cities by their own country, score and cost', () => {
    expect(ids(filterCities(w, { ...NO_FILTER, countries: ['BO'] }))).toEqual(['cheap'])
    expect(ids(filterCities(w, { ...NO_FILTER, minScore: 5 }))).toEqual(['cheap', 'empty'])
    expect(ids(filterCities(w, { ...NO_FILTER, maxCost: 4000 }))).toEqual(['cheap', 'empty'])
  })
  it('gives the slider ranges from the data', () => {
    expect(costRange(w)).toEqual([3500, 9000])
    expect(topScore(w)).toBe(7)
  })
})

describe('ranking', () => {
  it('sorts gyms by total, highest first, with no score last', () => {
    const g = [gym('low', {}, { score: score(2) }), gym('none'), gym('high', {}, { score: score(8) })]
    expect(ids(rankGyms(g))).toEqual(['high', 'low', 'none'])
  })
  it('breaks a tie by name', () => {
    const g = [gym('b', {}, { score: score(5) }), gym('a', {}, { score: score(5) }), gym('d'), gym('c')]
    expect(ids(rankGyms(g))).toEqual(['a', 'b', 'c', 'd'])
  })
  it('does not reorder its input', () => {
    const g = [gym('a', {}, { score: score(1) }), gym('b', {}, { score: score(2) })]
    rankGyms(g)
    expect(ids(g)).toEqual(['a', 'b'])
  })
  it('ranks cities the same way', () => {
    const c = [city('a', {}, { score: score(4) }), city('b'), city('c', {}, { score: score(9) })]
    expect(ids(rankCities(c))).toEqual(['c', 'a', 'b'])
  })
  it('sorts a total of 0 above no score', () => {
    expect(ids(rankGyms([gym('none'), gym('zero', {}, { score: score(0) })]))).toEqual(['zero', 'none'])
  })
})

describe('scoreTier', () => {
  it('splits the totals', () => {
    expect([6, 5.9, 4.5, 4.4, 0, null].map(scoreTier)).toEqual(['top', 'mid', 'mid', 'low', 'low', 'none'])
  })
})

describe('links', () => {
  it('uses the gym link when it has one', () => {
    expect(mapsUrl(gym('a', {}, { google_maps_url: 'https://maps.example/a' }))).toBe('https://maps.example/a')
  })
  it('builds a maps search from the name and coordinates otherwise', () => {
    const url = mapsUrl(gym('Lobo Gym', { lat: 20.5, lon: -103.4 }))
    expect(decodeURIComponent(url)).toBe('https://www.google.com/maps/search/?api=1&query=Lobo Gym 20.5,-103.4')
  })
  it('lists only the links a gym has, and always maps', () => {
    expect(gymLinks(gym('a')).map((l) => l.kind)).toEqual(['maps'])
    const full = gym('a', {}, { website: 'https://w', instagram: 'https://i', facebook: 'https://f', phone: '+52 (33) 4960-4080' })
    const links = gymLinks(full)
    expect(links.map((l) => l.label)).toEqual(['Website', 'Instagram', 'Facebook', 'Google Maps', 'Call'])
    expect(links.at(-1)?.href).toBe('tel:+523349604080')
  })
})

describe('spreadGyms', () => {
  it('leaves a lone gym where it is', () => {
    expect(spreadGyms([gym('a', { lat: 1, lon: 2 })]).get('a')).toEqual([2, 1])
  })
  it('moves gyms on the same spot apart', () => {
    const at = spreadGyms([gym('a'), gym('b'), gym('c')])
    expect(new Set([...at.values()].map(String)).size).toBe(3)
  })
  it('gives a big group a wider ring, so its markers do not sit on each other', () => {
    const reach = (n: number) => {
      const spots = [...spreadGyms(Array.from({ length: n }, (_, i) => gym(`g${i}`, { lat: 0, lon: 0 }))).values()]
      return Math.max(...spots.map(([lon, lat]) => Math.hypot(lon, lat)))
    }
    expect(reach(16)).toBeGreaterThan(reach(3) * 1.5)
  })
})
