import { describe, expect, it } from 'vitest'
import { capped, cardPhoto, cityCostFacts, cityLines, experienceLines, gymLines, gymPrices, gymRatings, hostelFacts, indexFacts, numbeoFacts, plainNote, quoteSource, scoreBars, scoreText } from './cardFacts'
import type { CityRow, Experience, GymRow } from './types'

const row = { id: 'x', name: 'X', category: 'training', tags: [], country: 'MX', lat: 1, lon: 2, summary: null, price: null, price_dkk: null }
const gym = (over: Partial<GymRow> = {}, details: Partial<NonNullable<GymRow['details']>> = {}) => ({ ...row, ...over, details }) as unknown as GymRow
const city = (details: Partial<NonNullable<CityRow['details']>> = {}) => ({ ...row, details }) as unknown as CityRow
const labels = (facts: { label: string }[]) => facts.map((f) => f.label)
// nothing a card reads may turn into words a person should not see
const clean = (facts: { value: string }[]) => facts.every((f) => !/null|undefined|NaN|\?/.test(f.value))

describe('scoreBars', () => {
  it('gives the five parts in a fixed order', () => {
    const bars = scoreBars({ water: 2, cost: 3, local_life: 4, evidence: 5, training: 6, total: 5 })
    expect(labels(bars)).toEqual(['Training', 'Evidence', 'Local life', 'Cost', 'Water'])
    expect(bars[0].value).toBe(6)
  })
  it('leaves out a part with no value, and has nothing for a row with no score', () => {
    expect(labels(scoreBars({ training: 6, evidence: null, local_life: 4, cost: null, water: 1, total: 4 }))).toEqual(['Training', 'Local life', 'Water'])
    expect(scoreBars(null)).toEqual([])
    expect(scoreBars(undefined)).toEqual([])
  })
  it('keeps a real zero', () => {
    expect(scoreBars({ training: 0, evidence: null, local_life: null, cost: null, water: null, total: 0 })).toEqual([{ key: 'training', label: 'Training', value: 0 }])
  })
})

describe('scoreText', () => {
  it('always has one decimal', () => expect([scoreText(6), scoreText(5.42)]).toEqual(['6.0', '5.4']))
})

describe('gymRatings', () => {
  it('puts Google first and skips a site with neither rating nor count', () => {
    const g = gym({}, { google_rating: 4.9, google_reviews: 69, other_ratings: [{ site: 'Wellhub', rating: 4.5, count: null }, { site: 'Airbnb', rating: null, count: 12 }, { site: 'Empty', rating: null, count: null }] })
    expect(gymRatings(g)).toEqual([
      { label: 'Google', value: '4.9 from 69 reviews' },
      { label: 'Wellhub', value: '4.5' },
      { label: 'Airbnb', value: '12 reviews' },
    ])
  })
  it('counts one review as one', () => {
    expect(gymRatings(gym({}, { other_ratings: [{ site: 'A', rating: 5, count: 1 }] }))[0].value).toBe('5 from 1 review')
  })
  it('is empty without ratings', () => expect(gymRatings(gym())).toEqual([]))
})

describe('gymPrices', () => {
  it('has a line per known price, in kroner', () => {
    expect(gymPrices(gym({}, { price_dropin_dkk: 39, private_dkk: 1940 }))).toEqual([
      { label: 'Drop-in', value: '39 kr' },
      { label: 'Private', value: '1.940 kr' },
    ])
  })
  it('falls back on the row price for the month', () => {
    expect(gymPrices(gym({ price_dkk: 360 }))).toEqual([{ label: 'Month', value: '360 kr' }])
  })
  it('is empty when no price is known', () => expect(gymPrices(gym())).toEqual([]))
})

describe('gymLines', () => {
  it('is empty for a gym with nothing', () => expect(gymLines(gym())).toEqual([]))
  it('says sessions as a rate, and keeps a free text one', () => {
    expect(gymLines(gym({}, { sessions_per_week: 6 }))).toEqual([{ label: 'Sessions', value: '6 a week' }])
    expect(gymLines(gym({}, { sessions_per_week: 'around 10' }))).toEqual([{ label: 'Sessions', value: 'around 10' }])
  })
  it('breaks hours into a line per day', () => {
    expect(gymLines(gym({}, { hours: 'Mon 5-6; Tue 7-8' }))[0].value).toBe('Mon 5-6\nTue 7-8')
  })
  it('gives the distance to the water with its note under it, and either one alone', () => {
    expect(gymLines(gym({}, { water_km: 30, water_note: 'Pacific' }))).toEqual([{ label: 'Water', value: '30 km', note: 'Pacific' }])
    expect(gymLines(gym({}, { water_km: 30 }))).toEqual([{ label: 'Water', value: '30 km' }])
    expect(gymLines(gym({}, { water_note: 'Pacific' }))).toEqual([{ label: 'Water', value: 'Pacific' }])
  })
  it('spells out the phone number', () => {
    expect(gymLines(gym({}, { phone: '+52 33 4960 4080' }))).toEqual([{ label: 'Phone', value: '+52 33 4960 4080' }])
  })
  it('leaves blank text out', () => expect(gymLines(gym({}, { sparring: '  ' }))).toEqual([]))
  it('takes season and the rest from the row', () => {
    expect(labels(gymLines(gym({ season: 'year round', dec_jan: 'open', requirements: 'none', duration: 'monthly' })))).toEqual(['Season', 'December and January', 'Requirements', 'Duration'])
  })
})

describe('city facts', () => {
  const numbeo = { numbeo_url: 'https://n', proxy_for: null, col_index: 42.9, rent_index: null, col_plus_rent_index: null, single_month_no_rent_dkk: 4716, rent_1bed_outside_dkk: 4966, meal_cheap_dkk: 44, gym_month_dkk: null, monthly_total_dkk: 9682, contributors_note: null, observed: null }
  it('reads the month from Numbeo', () => {
    expect(numbeoFacts(city({ numbeo }))).toEqual([
      { label: 'Living without rent', value: '4.716 kr' },
      { label: '1-bed rent', value: '4.966 kr' },
      { label: 'Total a month', value: '9.682 kr' },
    ])
  })
  it('is empty without Numbeo', () => {
    expect(numbeoFacts(city())).toEqual([])
    expect(cityCostFacts(city())).toEqual([])
    expect(hostelFacts(city())).toEqual([])
    expect(cityLines(city())).toEqual([])
  })
  it('leaves out what the page did not give', () => {
    expect(labels(cityCostFacts(city({ numbeo, room_month_dkk: 3000 })))).toEqual(['Cheap meal', 'Room a month', 'Cost of living index'])
  })
  it('gives dorm, private and the count only when known', () => {
    expect(hostelFacts(city({ hostels: { dorm_night_dkk: 50, private_night_dkk: null, n: 2, names: [], source: 'x' } }))).toEqual([{ label: 'Dorm a night', value: '50 kr' }, { label: 'Hostels found', value: '2' }])
  })
  it('shows the listed price and the season of the row', () => {
    const row = { ...city(), price_dkk: 2696, season: 'year round', dec_jan: 'Dry' } as CityRow
    expect(cityCostFacts(row)).toEqual([{ label: 'Listed price', value: '2.696 kr' }])
    expect(labels(cityLines(row))).toEqual(['Season', 'December and January'])
  })
})

describe('plainNote', () => {
  it('says a raw field in words', () => {
    expect(plainNote('single_month_no_rent from Managua (no estimate on own page)')).toBe('Living without rent from Managua (no estimate on own page)')
  })
  it('drops the clause about a null field and keeps the sentence', () => {
    expect(plainNote('No listing could be opened, so room_month_dkk is null.')).toBe('No listing could be opened.')
  })
  it('leaves other text alone and has nothing for no note', () => {
    expect(plainNote('Rated by 12 people')).toBe('Rated by 12 people')
    expect(plainNote(null)).toBeNull()
    expect(plainNote('  ')).toBeNull()
  })
})

describe('indexFacts', () => {
  const empty = { backpacker_index_usd_day: null, backpacker_index_dkk_day: null, backpacker_index_year: 2025, backpacker_index_url: 'https://b', backpacker_index_note: 'no own entry', expat_friendliness_rank: null, expat_settling_rank: null, expat_edition: 'no entry found', expat_url: 'https://e', tasteatlas_cuisine_rank: null, tasteatlas_cuisine_score: null, tasteatlas_city_rank: null, tasteatlas_url: 'https://t', observed: '2026-10-30' }
  it('has no line for an index that does not list the city', () => {
    expect(indexFacts(city({ indices: empty }))).toEqual([])
    expect(indexFacts(city())).toEqual([])
  })
  it('gives each listed index its link', () => {
    const facts = indexFacts(city({ indices: { ...empty, backpacker_index_dkk_day: 376.87, backpacker_index_note: 'dorm bed', expat_friendliness_rank: 1, expat_settling_rank: 2, tasteatlas_cuisine_rank: 11, tasteatlas_cuisine_score: 4.46, tasteatlas_city_rank: 31 } }))
    expect(facts.map((f) => [f.value, f.href])).toEqual([
      ['377 kr a day, 2025', 'https://b'],
      ['Friendliness 1, settling in 2', 'https://e'],
      ['Rank 11, score 4.46', 'https://t'],
      ['Rank 31', 'https://t'],
    ])
    expect(facts[0].note).toBe('dorm bed')
  })
  it('handles one ranking alone', () => {
    expect(indexFacts(city({ indices: { ...empty, expat_settling_rank: 4 } }))[0].value).toBe('Settling in 4')
  })
})

describe('experienceLines', () => {
  it('is empty for a bare row', () => expect(experienceLines(row as unknown as Experience)).toEqual([]))
  it('keeps the order of the card', () => {
    const e = { ...row, requirements: 'Open Water', season: 'Dec to Jun', duration: '2 days', dec_jan: 'Good' } as unknown as Experience
    expect(labels(experienceLines(e))).toEqual(['Season', 'December and January', 'Duration', 'Requirements'])
  })
})

describe('cardPhoto', () => {
  const image = { url: 'https://i', credit: 'A', w: 1, h: 1 }
  it('takes a photo of the row or its place', () => {
    expect(cardPhoto({ image, image_source: 'own' })).toBe(image)
    expect(cardPhoto({ image, image_source: 'place' })).toBe(image)
  })
  it('leaves out a category stock photo, and copes with no photo', () => {
    expect(cardPhoto({ image, image_source: 'category' })).toBeNull()
    expect(cardPhoto({ image: undefined, image_source: 'own' })).toBeNull()
  })
})

describe('quoteSource', () => {
  it('joins site and date', () => expect(quoteSource({ quote: 'q', site: 'google maps', date: 'about 2024-10', url: null })).toBe('Google maps, about 2024-10'))
  it('has one or the other', () => {
    expect(quoteSource({ quote: 'q', site: null, date: '2024', url: null })).toBe('2024')
    expect(quoteSource({ quote: 'q', site: 'Reddit', date: null, url: null })).toBe('Reddit')
  })
  it('names a bare link, and has nothing for a bare quote', () => {
    expect(quoteSource({ quote: 'q', site: null, date: null, url: 'https://x' })).toBe('Source')
    expect(quoteSource({ quote: 'q', site: null, date: null, url: null })).toBeNull()
  })
})

describe('capped', () => {
  const six = [1, 2, 3, 4, 5, 6]
  it('folds what is over the cap', () => expect(capped(six, false)).toEqual({ shown: [1, 2, 3], folded: 3 }))
  it('shows all when open', () => expect(capped(six, true)).toEqual({ shown: six, folded: 0 }))
  it('never hides a single row behind a button', () => expect(capped([1, 2, 3, 4], false)).toEqual({ shown: [1, 2, 3, 4], folded: 0 }))
})

describe('nothing unfinished reaches a card', () => {
  it('reads a gym that has only nulls', () => {
    const g = gym({}, { google_rating: null, google_reviews: null, other_ratings: [{ site: 'A', rating: null, count: null }], price_dropin_dkk: null, sessions_per_week: null, water_km: null, water_note: null })
    expect([...gymRatings(g), ...gymPrices(g), ...gymLines(g)]).toEqual([])
  })
  it('never prints a placeholder', () => {
    const g = gym({ season: 'year round' }, { google_rating: 4, google_reviews: 2, price_dropin_dkk: 10, hours: 'Mon 5' })
    expect(clean([...gymRatings(g), ...gymPrices(g), ...gymLines(g)])).toBe(true)
  })
})
