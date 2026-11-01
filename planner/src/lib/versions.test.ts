import { describe, expect, it } from 'vitest'
import type { TripRow } from './repoTrips'
import { savedWhen, urlWithVersion, versionEntries, versionParam } from './versions'

const row = (version: number, name: string, by = 'planner'): TripRow => ({ id: 't', version, name, saved_at: `2026-11-0${version}T10:00:00Z`, by }) as unknown as TripRow

describe('versionParam', () => {
  it('reads a version number', () => expect(versionParam('?trip=a&v=3')).toBe(3))
  it.each(['', '?trip=a', '?v=', '?v=0', '?v=-1', '?v=abc', '?v=2.5', '?v=1e3'])('gives null for %s', (s) => expect(versionParam(s)).toBeNull())
})

describe('urlWithVersion', () => {
  it('adds the trip and the version and keeps other parameters', () => {
    expect(urlWithVersion('https://x.test/preview/?a=1', 'abc', 3)).toBe('/preview/?a=1&trip=abc&v=3')
  })
  it('takes the version away for the latest', () => {
    expect(urlWithVersion('https://x.test/?trip=abc&v=3', 'abc', null)).toBe('/?trip=abc')
  })
  it('takes both away when no trip is open', () => {
    expect(urlWithVersion('https://x.test/?trip=abc&v=3', null, 3)).toBe('/')
  })
})

describe('versionEntries', () => {
  const list = versionEntries([row(1, 'Old name'), row(3, 'New name'), row(2, 'New name')])
  it('is newest first', () => expect(list.map((e) => e.version)).toEqual([3, 2, 1]))
  it('marks only the newest as latest', () => expect(list.map((e) => e.latest)).toEqual([true, false, false]))
  it('gives the title only where it differs from the latest', () => expect(list.map((e) => e.title)).toEqual([null, null, 'Old name']))
  it('carries who saved it', () => expect(list[0].by).toBe('planner'))
  it('is empty for no rows', () => expect(versionEntries([])).toEqual([]))
})

describe('savedWhen', () => {
  it('shows a day and a time', () => expect(savedWhen('2026-11-01T10:00:00Z')).toMatch(/^1 Nov, \d\d:\d\d$/))
  it('shows nothing for a date that does not read', () => expect(savedWhen('nope')).toBe(''))
})
