import { describe, expect, it } from 'vitest'
import type { Way } from '../data/types'
import { giveNight, schedule, takeNight, type Hop, type Journey, type NightMove } from './journey'

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
const free = (j: Journey) => sched(j).free
/** the trip after the move, so the test reads the nights a person would see */
const moved = (j: Journey, m: NightMove | null) => {
  expect(m).not.toBeNull()
  return { ...j, lastNights: m!.lastNights, places: j.places.map((p, k) => {
    const c = m!.legs.find((x) => x.hop === k)
    return c && p.hop ? { ...p, hop: { ...p.hop, date: c.date } } : p
  }) }
}
const take = (j: Journey, i: number, from: number | 'free') => moved(j, takeNight(j, sched(j), i, from))
const give = (j: Journey, i: number) => moved(j, giveNight(j, sched(j), i))
const legDays = (j: Journey) => j.places.slice(1).map((p) => p.hop!.date)

describe('a night more, the earliest stop decides', () => {
  // 62 days over four stops: the first takes the two left over
  it('starts from an even share', () => expect(nights(trip())).toEqual([17, 15, 15, 15]))

  it('comes from the next stop when you choose it', () => {
    expect(nights(take(trip(), 1, 2))).toEqual([17, 16, 14, 15])
  })

  it('comes from any later stop you choose, and the stops between keep their nights', () => {
    expect(nights(take(trip(), 0, 2))).toEqual([18, 15, 14, 15])
    expect(nights(take(trip(), 0, 3))).toEqual([18, 15, 15, 14])
  })

  it('moves only the legs from this stop to the one that gives', () => {
    const j = trip(['', '2026-12-10', '2026-12-20', '2027-01-01'])
    expect(legDays(take(j, 0, 2))).toEqual(['2026-12-11', '2026-12-21', '2027-01-01'])
  })

  it('never changes a stop before it', () => {
    expect(nights(take(trip(), 2, 3)).slice(0, 2)).toEqual([17, 15])
  })

  it('reaches a stop you are only passing through', () => {
    const j = trip([undefined, '2026-12-10', '2026-12-10'])
    expect(nights(j).slice(0, 2)).toEqual([7, 0])
    expect(nights(take(j, 1, 2)).slice(0, 2)).toEqual([7, 1])
  })

  it('has nothing to take when no later stop has a night', () => {
    const j = trip([undefined, '2026-12-03', '2026-12-03', '2026-12-03'])
    expect(nights(j)).toEqual([0, 0, 0, 62])
    expect(takeNight(j, sched(j), 1, 2)).toBeNull()
    expect(takeNight(j, sched(j), 1, 3)).not.toBeNull()
    expect(nights(take(j, 1, 3))).toEqual([0, 1, 0, 61])
  })

  it('cannot come from an earlier stop', () => {
    const j = trip()
    expect(takeNight(j, sched(j), 2, 1)).toBeNull()
    expect(takeNight(j, sched(j), 2, 2)).toBeNull()
  })
})

describe('a night less is a free night', () => {
  it('does not go to the next stop or the last stop', () => {
    const j = give(trip(), 1)
    expect(nights(j)).toEqual([17, 14, 15, 15])
    expect(free(j)).toBe(1)
  })

  it('moves every later stop a day earlier, with its nights', () => {
    const j = trip(['', '2026-12-10', '2026-12-20', '2027-01-01'])
    expect(legDays(give(j, 0))).toEqual(['2026-12-09', '2026-12-19', '2026-12-31'])
  })

  it('leaves the stops before it alone', () => {
    expect(nights(give(trip(), 2)).slice(0, 2)).toEqual([17, 15])
  })

  it('needs a night to give', () => {
    const j = trip([undefined, '2026-12-03', '2026-12-03', '2026-12-03'])
    expect(giveNight(j, sched(j), 1)).toBeNull()
  })

  it('can be taken back by the same stop, which undoes it', () => {
    const j = take(give(trip(), 1), 1, 'free')
    expect(nights(j)).toEqual(nights(trip()))
    expect(free(j)).toBe(0)
  })

  it('can be taken by any stop', () => {
    const j = take(give(trip(), 2), 0, 'free')
    expect(nights(j)).toEqual([18, 15, 14, 15])
    expect(free(j)).toBe(0)
  })

  it('adds up, nights and free nights are the length of the trip', () => {
    const j = give(give(trip(), 0), 2)
    expect(nights(j).reduce((a, b) => a + b, 0) + free(j)).toBe(62)
    expect(free(j)).toBe(2)
  })

  it('has nothing to take when there is no free night', () => {
    const j = trip()
    expect(takeNight(j, sched(j), 1, 'free')).toBeNull()
  })
})

describe('the last stop', () => {
  it('can let its nights go free', () => {
    const j = give(trip(), 3)
    expect(nights(j)).toEqual([17, 15, 15, 14])
    expect(free(j)).toBe(1)
  })

  it('takes a free night back with no leg moving', () => {
    const j = give(trip(), 3)
    expect(takeNight(j, sched(j), 3, 'free')!.legs.filter((l) => l.hop > 3)).toEqual([])
    expect(nights(take(j, 3, 'free'))).toEqual([17, 15, 15, 15])
  })

  it('gives a night to an earlier stop and the free nights stay as they were', () => {
    const j = take(give(trip(), 3), 0, 3)
    expect(nights(j)).toEqual([18, 15, 15, 13])
    expect(free(j)).toBe(1)
  })

  it('has no later stop to take from', () => {
    const j = trip()
    expect(takeNight(j, sched(j), 3, 3)).toBeNull()
    expect(takeNight(j, sched(j), 3, 4)).toBeNull()
  })

  it('works on a trip of one stop', () => {
    const j: Journey = { ...trip(), places: [{ node: 'D', hop: null }] }
    expect(nights(give(j, 0))).toEqual([61])
    expect(free(give(j, 0))).toBe(1)
  })

  it('takes all the days up to the flight home until nights are set on it', () => {
    expect(free(trip())).toBe(0)
    expect(trip().lastNights).toBeUndefined()
  })

  it('keeps its nights when a leg before it moves by hand, the rest is free', () => {
    const j = give(trip(['', '2026-12-10', '2026-12-20', '2027-01-20']), 3)
    expect(nights(j)[3]).toBe(13)
    const earlier = { ...j, places: j.places.map((p, k) => (k === 3 ? { ...p, hop: { ...p.hop!, date: '2027-01-10' } } : p)) }
    expect(nights(earlier)[3]).toBe(13)
    expect(free(earlier)).toBe(11)
  })
})

describe('legs that float on the even share', () => {
  it('keeps the stops further back where they were, though their share would split another way', () => {
    expect(nights(take(trip(), 2, 3))).toEqual([17, 15, 16, 14])
  })

  it('works on dates already set and keeps them', () => {
    const j = trip([undefined, '2026-12-10', '2026-12-20'])
    expect(nights(j)).toEqual([7, 10, 23, 22])
    expect(nights(take(j, 1, 2))).toEqual([7, 11, 22, 22])
  })
})

describe('a flight moved to another day', () => {
  it('still lands the day after when it flies overnight, so the night moves with it', () => {
    const flight = { quote_id: 'Q', depart: '2026-12-10T16:55', arrive: '2026-12-11T04:00', hours: 9, price_dkk: 900, carriers: [], via: [], layover_h: [] }
    const j = trip()
    j.places[1] = { node: 'B', hop: { ...bus('A', 'B'), mode: 'flight', flight } }
    expect(nights(j).slice(0, 2)).toEqual([7, 18])
    const later = take(j, 0, 1)
    expect(later.places[1].hop!.date).toBe('2026-12-11')
    expect(nights(later).slice(0, 2)).toEqual([8, 17])
  })

  it('says so on its own leg, with the day it flies', () => {
    const flight = { quote_id: 'Q', depart: '2026-12-10T08:00', arrive: '2026-12-10T12:00', hours: 4, price_dkk: 900, carriers: [], via: [], layover_h: [] }
    const j = trip()
    j.places[1] = { node: 'B', hop: { ...bus('A', 'B'), mode: 'flight', flight } }
    const w = sched(take(j, 0, 1)).warnings.find((x) => x.picked === 1)
    expect(w).toMatchObject({ level: 'warn', fix: '2026-12-10' })
    expect(w?.leg).toBeUndefined()
  })
})
