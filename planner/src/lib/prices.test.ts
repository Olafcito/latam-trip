import { describe, expect, it } from 'vitest'
import type { MapData } from '../data/types'
import { checkedAgo, iataOf, momondoUrl, priceState, pricesOn, sourceLabel, type PairDates, type PairQuote } from './prices'
import { flightPricesTask } from './tasks'

const NOW = Date.parse('2026-10-29T12:00:00Z')
const q = (p: number, at: string, extra: Partial<PairQuote> = {}): PairQuote => ({
  p, d: '06:10', a: '09:40', h: 3.5, c: ['Avianca'], s: 0, src: 'momondo', at, ...extra,
})

const pd: PairDates = {
  pairs: {
    'BOG-VVI': {
      '2027-01-28': [q(1900, '2026-10-27T10:00Z'), q(1450, '2026-10-20T10:00Z', { src: 'momondo-manual' }), q(1450, '2026-10-28T10:00Z', { h: 2.5 })],
      '2027-01-29': [q(999, '2026-10-28T10:00Z')],
    },
    'VVI-BOG': { '2027-01-28': [q(2100, '2026-10-28T10:00Z')] },
  },
}

describe('prices for a leg on a day', () => {
  it('finds the quotes of that pair, direction and day, cheapest first and shorter on a tie', () => {
    const list = pricesOn(pd, 'BOG', 'VVI', '2027-01-28')
    expect(list.map((x) => x.p)).toEqual([1450, 1450, 1900])
    expect(list[0].h).toBe(2.5)
    expect(pricesOn(pd, 'VVI', 'BOG', '2027-01-28').map((x) => x.p)).toEqual([2100])
  })

  it('is empty for an unknown day, an unknown pair or no data', () => {
    expect(pricesOn(pd, 'BOG', 'VVI', '2027-01-30')).toEqual([])
    expect(pricesOn(pd, 'LIM', 'CUZ', '2027-01-28')).toEqual([])
    expect(pricesOn(null, 'BOG', 'VVI', '2027-01-28')).toEqual([])
  })

  it('does not reorder the loaded file', () => {
    pricesOn(pd, 'BOG', 'VVI', '2027-01-28')
    expect(pd.pairs['BOG-VVI']['2027-01-28'][0].p).toBe(1900)
  })
})

describe('staleness', () => {
  it('is none without quotes', () => {
    expect(priceState([], NOW)).toBe('none')
  })
  it('is fresh when the newest quote is at most 3 days old, whatever the older ones', () => {
    expect(priceState(pricesOn(pd, 'BOG', 'VVI', '2027-01-28'), NOW)).toBe('fresh')
    expect(priceState([q(1, '2026-10-26T12:00Z')], NOW)).toBe('fresh')
  })
  it('is stale when the newest quote is older than 3 days', () => {
    expect(priceState([q(1, '2026-10-26T11:59Z'), q(2, '2026-10-01T00:00Z')], NOW)).toBe('stale')
  })
})

describe('labels', () => {
  it('says how old a price is', () => {
    expect(checkedAgo('2026-10-29T11:30Z', NOW)).toBe('checked just now')
    expect(checkedAgo('2026-10-29T07:00Z', NOW)).toBe('checked 5 hours ago')
    expect(checkedAgo('2026-10-28T10:00Z', NOW)).toBe('checked yesterday')
    expect(checkedAgo('2026-10-27T10:00Z', NOW)).toBe('checked 2 days ago')
  })
  it('calls a price Simon saved "saved by you"', () => {
    expect(sourceLabel('momondo-manual')).toBe('saved by you')
    expect(sourceLabel('google_flights')).toBe('Google Flights')
    expect(sourceLabel(null)).toBe('unknown source')
  })
})

describe('searching again', () => {
  it('builds the Momondo one-way search, cheapest first', () => {
    expect(momondoUrl('BOG', 'VVI', '2027-01-28')).toBe('https://www.momondo.dk/flight-search/BOG-VVI/2027-01-28?sort=price_a')
  })

  it('builds a flight_prices task for the leg and day, a day either side', () => {
    const t = flightPricesTask({ from: 'BOG', to: 'VVI', date: '2027-01-28', fromName: 'Bogotá', toName: 'Santa Cruz' })
    expect(t.task).toEqual({ type: 'flight_prices', legs: [{ from: 'BOG', to: 'VVI', date: '2027-01-28', flex_days: 1 }], from: 'app' })
    expect(t.title).toBe('[flight_prices] BOG to VVI 28 Jan')
    const url = new URL(t.url)
    expect(url.origin + url.pathname).toBe('https://github.com/Olafcito/latam-trip/issues/new')
    expect(url.searchParams.get('labels')).toBe('claude-task')
    const body = url.searchParams.get('body')!
    expect(body.startsWith('One-way prices for Bogotá to Santa Cruz on 28 Jan, a day either side.')).toBe(true)
    expect(JSON.parse(body.match(/```json\n(.*)\n```/)![1])).toEqual(t.task)
  })

  it('maps a map place to its airport code', () => {
    const map = { nodes: [{ id: 'bogota', iata: 'BOG' }, { id: 'salento', iata: null }] } as unknown as MapData
    expect(iataOf(map, 'bogota')).toBe('BOG')
    expect(iataOf(map, 'salento')).toBeNull()
    expect(iataOf(map, 'CPH')).toBe('CPH')
  })
})
