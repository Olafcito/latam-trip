import { describe, expect, it } from 'vitest'
import type { Way } from '../data/types'
import { nightTrade, schedule, type Hop, type Journey } from './journey'

const way = (over: Partial<Way>): Way => ({
  id: 'I1', direction: 'in', type: 'oneways', from: 'CPH', to: 'A', depart: '2026-12-03T06:00', arrive: '2026-12-03T14:30',
  total_hours: 14.5, flying_hours: 14.5, flights: 2, hub_nights: 0, changes: 0, us_transit: false, airports: ['CPH', 'A'],
  tickets: [], price_dkk: 0,
  extras: { cabin_bag_fees_dkk: 0, checked_bag_fees_dkk: 0, hub_nights: 0, hub_stay_estimate_dkk: 0 },
  score: 5, timeline: [], ...over,
})
const wi = way({})
const wh = way({ id: 'H1', direction: 'home', from: 'D', to: 'CPH', depart: '2027-02-03T09:05', arrive: '2027-02-04T09:10' })
const bus = (from: string, to: string, date?: string): Hop => ({ from, to, mode: 'bus', operator: null, hours: 8, price_dkk: 100, overnight: false, border: false, flight: null, ...(date ? { date } : {}) })
const trip = (dates: (string | undefined)[] = []): Journey => ({ id: 'j', name: '', wayIn: 'I1', wayHome: 'H1', optionId: null, places: [
  { node: 'A', hop: null },
  { node: 'B', hop: bus('A', 'B', dates[1]) },
  { node: 'C', hop: bus('B', 'C', dates[2]) },
  { node: 'D', hop: bus('C', 'D', dates[3]) },
] })
const sched = (j: Journey) => schedule(j, wi, wh, 'D', (n) => n)
const nights = (j: Journey) => sched(j).places.map((p) => p.days)
/** the trip after the trade, so the test reads the nights a person would see */
const after = (j: Journey, i: number, more: boolean) => {
  const t = nightTrade(j, sched(j), i, more)
  if (!t) return null
  return { ...j, places: j.places.map((p, k) => {
    const c = t.find((x) => x.hop === k)
    return c && p.hop ? { ...p, hop: { ...p.hop, date: c.date } } : p
  }) }
}

describe('a night traded with a neighbouring stop', () => {
  // 62 days over four stops: the first takes the two left over
  it('starts from an even share', () => expect(nights(trip())).toEqual([17, 15, 15, 15]))

  it('a night less here is a night more at the stop before', () => {
    expect(nights(after(trip(), 2, false)!)).toEqual([17, 16, 14, 15])
  })

  it('a night more here is a night less at the stop after', () => {
    expect(nights(after(trip(), 1, true)!)).toEqual([17, 16, 14, 15])
  })

  it('the first stop gives its night to the next one, having none before it', () => {
    expect(nights(after(trip(), 0, false)!)).toEqual([16, 16, 15, 15])
  })

  it('the last stop takes its night from the one before, having none after it', () => {
    expect(nights(after(trip(), 3, true)!)).toEqual([17, 15, 14, 16])
  })

  it('keeps the stops further back where they were, though their share would split another way', () => {
    expect(nights(after(trip(), 3, false)!)).toEqual([17, 15, 16, 14])
  })

  it('works on dates already set and keeps them', () => {
    const j = trip([undefined, '2026-12-10', '2026-12-20'])
    expect(nights(j)).toEqual([7, 10, 23, 22])
    expect(nights(after(j, 1, false)!)).toEqual([8, 9, 23, 22])
  })

  it('has nothing to trade when no stop beside has a night to give', () => {
    const j = trip([undefined, '2026-12-03', '2026-12-03', '2026-12-03'])
    expect(nights(j)).toEqual([0, 0, 0, 62])
    expect(nightTrade(j, sched(j), 1, false)).toBeNull()
    expect(nightTrade(j, sched(j), 1, true)).toBeNull()
    expect(nights(after(j, 2, true)!)).toEqual([0, 0, 1, 61])
  })

  it('has nothing to trade on a trip of one stop', () => {
    const j: Journey = { ...trip(), places: [{ node: 'D', hop: null }] }
    expect(nightTrade(j, sched(j), 0, true)).toBeNull()
    expect(nightTrade(j, sched(j), 0, false)).toBeNull()
  })
})

describe('a flight moved to another day', () => {
  it('still lands the day after when it flies overnight, so the night moves with it', () => {
    const flight = { quote_id: 'Q', depart: '2026-12-10T16:55', arrive: '2026-12-11T04:00', hours: 9, price_dkk: 900, carriers: [], via: [], layover_h: [] }
    const j = trip()
    j.places[1] = { node: 'B', hop: { ...bus('A', 'B'), mode: 'flight', flight } }
    expect(nights(j).slice(0, 2)).toEqual([7, 18])
    const moved = after(j, 1, false)!
    expect(moved.places[1].hop!.date).toBe('2026-12-11')
    expect(nights(moved).slice(0, 2)).toEqual([8, 17])
  })
})
