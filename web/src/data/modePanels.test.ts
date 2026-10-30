import { describe, expect, it } from 'vitest'
import { NO_FILTER, gymWorld } from './gyms'
import { NO_EXPERIENCE_FILTER, experienceWorld } from './experiences'
import { cityMonthDkk, countText, countryCounts, experienceFiltersActive, foldChips, hiddenCitiesByCost, hiddenNote, keepCategories, placeGroups, toggled } from './modePanels'
import type { CityRow, Experience, SavedList } from './types'

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

const city = (id: string, month: number | null): CityRow =>
  ({ ...exp(id), category: 'training', tags: ['city-scorecard'], name: `${id}: training base scorecard`, details: month == null ? {} : { numbeo: { monthly_total_dkk: month } } }) as unknown as CityRow

const place = (id: string) => ({ id, name: `${id} town`, country: 'NI', lat: 11, lon: -85, experience_ids: [] as string[], saved_in: [] as string[] })

describe('countText', () => {
  it('reads with and without a noun', () => {
    expect(countText(12, 90, 'gyms')).toBe('12 of 90 gyms')
    expect(countText(24, 313)).toBe('24 of 313')
  })
})

describe('hiddenNote', () => {
  it('says nothing when none are hidden', () => {
    expect(hiddenNote(0, 'gym', 'gyms')).toBeNull()
  })

  it('counts one and many', () => {
    expect(hiddenNote(1, 'gym', 'gyms')).toBe('1 gym hidden: no cost data')
    expect(hiddenNote(3, 'city', 'cities')).toBe('3 cities hidden: no cost data')
  })
})

describe('countryCounts', () => {
  it('goes biggest first, then by code', () => {
    expect(countryCounts([{ country: 'NI' }, { country: 'MX' }, { country: 'CO' }, { country: 'CO' }])).toEqual([['CO', 2], ['MX', 1], ['NI', 1]])
  })
})

describe('toggled', () => {
  it('adds and takes away', () => {
    expect(toggled(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggled(['a', 'b'], 'a')).toEqual(['b'])
  })
})

describe('foldChips', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f']

  it('keeps the first ones and counts the rest', () => {
    expect(foldChips(ids, [], 3, false)).toEqual({ shown: ['a', 'b', 'c'], hidden: 3 })
  })

  it('never folds a pick away', () => {
    expect(foldChips(ids, ['e'], 3, false)).toEqual({ shown: ['a', 'b', 'c', 'e'], hidden: 2 })
  })

  it('shows them all when open', () => {
    expect(foldChips(ids, [], 3, true)).toEqual({ shown: ids, hidden: 0 })
  })

  it('does not fold one chip behind a More chip', () => {
    expect(foldChips(['a', 'b', 'c', 'd'], [], 3, false)).toEqual({ shown: ['a', 'b', 'c', 'd'], hidden: 0 })
  })
})

describe('city cost', () => {
  it('reads the month or nothing', () => {
    expect(cityMonthDkk(city('a', 7000))).toBe(7000)
    expect(cityMonthDkk(city('b', null))).toBeNull()
  })

  it('counts cities the cost filter hid for having no data', () => {
    const w = gymWorld([city('a', 7000), city('b', null), city('c', null)] as unknown as Experience[], [])
    expect(hiddenCitiesByCost(w, NO_FILTER)).toBe(0)
    expect(hiddenCitiesByCost(w, { ...NO_FILTER, maxCost: 6000 })).toBe(2)
  })
})

describe('experience filter helpers', () => {
  it('counts what is on', () => {
    expect(experienceFiltersActive(NO_EXPERIENCE_FILTER)).toBe(0)
    expect(experienceFiltersActive({ countries: ['NI', 'CO'], categories: ['culture'], saved: true })).toBe(4)
  })

  it('drops picks of categories no longer there', () => {
    expect(keepCategories(['culture', 'food'], [['culture', 3]])).toEqual(['culture'])
  })
})

describe('placeGroups', () => {
  const lists: SavedList[] = [{ id: 'want', name: 'Want to check out', items: [{ type: 'experience', id: 'b', note: 'go' }] }]
  const places = [place('X')]
  const rows = [exp('a', { places: ['X'] }), exp('b', { places: ['X'] }), exp('coiba', { country: 'PA', area: 'Coiba', lat: 7.4, lon: -81.7 })]
  const w = experienceWorld(rows, places, lists)

  it('leaves saved rows to the Saved group', () => {
    const groups = placeGroups(w, rows, w.saved, places, NO_EXPERIENCE_FILTER)
    expect(groups.flatMap((g) => g.rows.map((r) => r.id)).sort()).toEqual(['a', 'coiba'])
  })

  it('keeps a row with no place', () => {
    const groups = placeGroups(w, rows, w.saved, places, NO_EXPERIENCE_FILTER)
    expect(groups.find((g) => g.rows.some((r) => r.id === 'coiba'))?.name).toBe('Coiba')
  })

  it('has no groups under the Saved chip', () => {
    expect(placeGroups(w, rows, w.saved, places, { ...NO_EXPERIENCE_FILTER, saved: true })).toEqual([])
  })
})
