import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Meta } from '../data/types'
import { loadData } from '../data/load'
import { STALE_DAYS, ageLabel, ageWords, checkedLabel, freshness, isStale, leadOf } from './freshness'

// noon local time on 29 Oct 2026, so a calendar day is a calendar day in any time zone
const NOW = new Date(2026, 9, 29, 12, 0).getTime()

const meta = (last_checked: Record<string, string | null>): Meta => ({ built_at: '2026-10-29T10:25+00:00', last_checked })

describe('freshness', () => {
  it('a date three days old is not stale, four days is', () => {
    expect(STALE_DAYS).toBe(3)
    expect(isStale('2026-10-26', NOW)).toBe(false)
    expect(isStale('2026-10-25', NOW)).toBe(true)
    const [a, b] = freshness(meta({ flights: '2026-10-26', stays: '2026-10-25' }), NOW)
    expect(a).toEqual({ type: 'flights', at: '2026-10-26', ageDays: 3, stale: false })
    expect(b).toEqual({ type: 'stays', at: '2026-10-25', ageDays: 4, stale: true })
    expect(isStale('2026-10-27', NOW, 1)).toBe(true)
  })

  it('null is unknown, shown as ?', () => {
    expect(isStale(null, NOW)).toBe(false)
    const [f] = freshness(meta({ tasks: null }), NOW)
    expect(f).toEqual({ type: 'tasks', at: null, ageDays: null, stale: false })
    expect(ageLabel(f.ageDays)).toBe('?')
    expect(ageLabel(0)).toBe('today')
    expect(ageLabel(1)).toBe('1 d')
    expect(ageLabel(5)).toBe('5 d')
  })

  it('meta null gives an empty list', () => {
    expect(freshness(null, NOW)).toEqual([])
    expect(leadOf([])).toBeNull()
  })

  it('accepts both a bare date and an ISO time', () => {
    const list = freshness(meta({ flights: '2026-10-28T20:37:33', experiences: '2026-10-29', places: '2026-10-24T12:00:00Z' }), NOW)
    expect(list.map((f) => [f.type, f.ageDays, f.stale])).toEqual([
      ['flights', 1, false],
      ['experiences', 0, false],
      ['places', 5, true],
    ])
  })

  it('keeps the key order of last_checked', () => {
    const list = freshness(meta({ tasks: null, flights: '2026-10-29', stays: null }), NOW)
    expect(list.map((f) => f.type)).toEqual(['tasks', 'flights', 'stays'])
  })

  it('a date that does not parse is unknown, and a future date is today', () => {
    const [bad, ahead] = freshness(meta({ flights: 'soon', stays: '2026-11-02' }), NOW)
    expect(bad).toMatchObject({ at: 'soon', ageDays: null, stale: false })
    expect(ahead).toMatchObject({ ageDays: 0, stale: false })
    expect(isStale('soon', NOW)).toBe(false)
  })

  it('ages read as words for the accessible name', () => {
    expect(ageWords(0)).toBe('today')
    expect(ageWords(1)).toBe('1 day ago')
    expect(ageWords(4)).toBe('4 days ago')
    expect(ageWords(null)).toBe('at an unknown time')
  })

  it('the checked date reads as a day, with the local clock when there is one', () => {
    expect(checkedLabel('2026-10-29')).toBe('29 Oct')
    expect(checkedLabel('2026-10-28T20:37:33')).toBe('28 Oct 20:37')
    expect(checkedLabel(null)).toBe('?')
    expect(checkedLabel('soon')).toBe('?')
  })

  it('the corner leads with flights unless another type is stale and flights is not', () => {
    const fresh = freshness(meta({ stays: '2026-10-29', flights: '2026-10-28' }), NOW)
    expect(leadOf(fresh)?.type).toBe('flights')
    const staleStays = freshness(meta({ flights: '2026-10-28', stays: '2026-10-20', places: '2026-10-24' }), NOW)
    expect(leadOf(staleStays)?.type).toBe('stays')
    const bothStale = freshness(meta({ flights: '2026-10-24', stays: '2026-10-20' }), NOW)
    expect(leadOf(bothStale)?.type).toBe('flights')
    const noFlights = freshness(meta({ places: '2026-10-29', stays: null }), NOW)
    expect(leadOf(noFlights)?.type).toBe('places')
  })
})

describe('loadData and meta.json', () => {
  afterEach(() => vi.unstubAllGlobals())

  const serve = (missing: string[]) =>
    vi.fn(async (url: string) => {
      const path = String(url)
      if (missing.some((m) => path.endsWith(m))) return new Response('not found', { status: 404 })
      const body = path.endsWith('meta.json') ? meta({ flights: '2026-10-28' }) : path.endsWith('bag_rules.json') ? [] : {}
      return new Response(JSON.stringify(body), { status: 200 })
    })

  it('reads meta.json from data/web', async () => {
    const fetch = serve([])
    vi.stubGlobal('fetch', fetch)
    const d = await loadData()
    expect(d.meta).toEqual(meta({ flights: '2026-10-28' }))
    expect(fetch.mock.calls.some(([u]) => String(u).endsWith('data/web/meta.json'))).toBe(true)
  })

  it('a missing meta.json gives meta null and the load still succeeds', async () => {
    vi.stubGlobal('fetch', serve(['meta.json']))
    const d = await loadData()
    expect(d.meta).toBeNull()
    expect(d.source).toBe('github')
  })
})
