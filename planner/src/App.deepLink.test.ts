import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TripRow } from './lib/repoTrips'

const { loadVersions } = vi.hoisted(() => ({ loadVersions: vi.fn() }))

vi.mock('./lib/supabase', () => ({ remoteEnabled: () => true, useSession: () => ({ session: null }) }))
vi.mock('./lib/remoteTrips', () => ({
  loadDeletedIds: vi.fn(),
  loadTrips: vi.fn(),
  loadVersions: (...args: unknown[]) => loadVersions(...args),
  subscribeTrips: vi.fn(),
}))

import { openDeepLink, syncAddress } from './App'
import { useStore } from './store'

const way = (from: string, to: string) => ({ from, to, timeline: [] })
const row = (version: number): TripRow => ({
  id: 'trip-a', version, name: `Trip v${version}`, saved_at: '2026-11-01T10:00:00Z', by: 'planner', why: '',
  way_in: way('CPH', 'GUA'), way_home: way('SAL', 'CPH'), places: [{ node: 'GUA', hop: null }],
}) as TripRow

function browserAt(href: string) {
  const current = new URL(href)
  const browser = {
    location: { href: current.href, pathname: current.pathname, search: current.search, hash: current.hash },
    history: {
      state: null,
      replaceState(_state: unknown, _title: string, next: string) {
        const url = new URL(next, current.origin)
        browser.location.href = url.href
        browser.location.pathname = url.pathname
        browser.location.search = url.search
        browser.location.hash = url.hash
      },
    },
  }
  vi.stubGlobal('window', browser)
  return browser
}

describe('trip version deep links', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens the requested version and keeps it in the URL while loading', async () => {
    const browser = browserAt('https://example.test/preview/index.html?trip=trip-a&v=2')
    loadVersions.mockResolvedValue([row(2), row(1)])
    useStore.setState({
      rows: { 'trip-a': row(3) },
      saved: [{ id: 'trip-a', name: 'Trip v3', wayIn: 'trip-a:in', wayHome: 'trip-a:home', optionId: null, places: [{ node: 'GUA', hop: null }], version: 3 }],
      journey: null,
      view: 'home',
      viewing: null,
    })
    const unsubscribe = useStore.subscribe(syncAddress)

    openDeepLink()
    await vi.waitFor(() => expect(useStore.getState().viewing?.version).toBe(2))

    expect(loadVersions).toHaveBeenCalledWith('trip-a')
    expect(new URL(browser.location.href).searchParams.get('v')).toBe('2')
    unsubscribe()
  })
})
