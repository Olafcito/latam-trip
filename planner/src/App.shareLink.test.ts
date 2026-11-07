import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TripRow } from './lib/repoTrips'

const { loadShared, ownShare } = vi.hoisted(() => ({ loadShared: vi.fn(), ownShare: vi.fn() }))

vi.mock('./lib/supabase', () => ({ remoteEnabled: () => true, useSession: () => ({ session: null }), supabase: null }))
vi.mock('./lib/shareTrip', async (orig) => ({
  ...(await orig<typeof import('./lib/shareTrip')>()),
  loadShared: (...a: unknown[]) => loadShared(...a),
  ownShare: (...a: unknown[]) => ownShare(...a),
}))

const tok = 'AbCdEfGhIjKlMnOpQrStUv'
const way = (from: string, to: string) => ({ from, to, timeline: [] })
const row = { id: `shared-${tok}`, version: 1, name: 'TEST01', saved_at: '2026-11-01T10:00:00Z', by: '', why: '', way_in: way('CPH', 'GUA'), way_home: way('SAL', 'CPH'), places: [{ node: 'GUA', hop: null }] } as unknown as TripRow

function browserAt(href: string) {
  const current = new URL(href)
  const browser = {
    location: { href: current.href, pathname: current.pathname, search: current.search, hash: current.hash },
    history: {
      state: null,
      replaceState(_state: unknown, _title: string, next: string) {
        const url = new URL(next, current.origin)
        Object.assign(browser.location, { href: url.href, pathname: url.pathname, search: url.search, hash: url.hash })
      },
    },
  }
  vi.stubGlobal('window', browser)
  return browser
}

// openDeepLink reads the link once per page, so every case loads the app afresh
async function app() {
  vi.resetModules()
  const [{ openDeepLink, syncAddress }, { useStore }] = await Promise.all([import('./App'), import('./store')])
  useStore.setState({ rows: {}, saved: [], journey: null, shared: null, notice: null, view: 'home', screen: 'trips' })
  const off = useStore.subscribe(syncAddress)
  return { openDeepLink, useStore, off }
}

describe('shared trip links', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    loadShared.mockReset()
    ownShare.mockReset()
  })

  it('opens the shared trip read only and keeps the link in the address', async () => {
    const browser = browserAt(`https://example.test/?share=${tok}`)
    ownShare.mockResolvedValue(null)
    loadShared.mockResolvedValue(row)
    const { openDeepLink, useStore, off } = await app()
    openDeepLink()
    await vi.waitFor(() => expect(useStore.getState().shared?.token).toBe(tok))
    expect(useStore.getState().view).toBe('trip')
    expect(new URL(browser.location.href).searchParams.get('share')).toBe(tok)
    expect(new URL(browser.location.href).searchParams.get('trip')).toBeNull()
    off()
  })

  it('a dead link shows the Trips list with a note', async () => {
    const browser = browserAt(`https://example.test/?share=${tok}`)
    ownShare.mockResolvedValue(null)
    loadShared.mockResolvedValue(null)
    const { openDeepLink, useStore, off } = await app()
    openDeepLink()
    await vi.waitFor(() => expect(useStore.getState().notice).toBe('That shared trip is no longer shared.'))
    expect(useStore.getState().view).toBe('home')
    expect(browser.location.search).toBe('')
    off()
  })

  it('the owner opening their own link gets their own trip', async () => {
    const browser = browserAt(`https://example.test/?share=${tok}`)
    ownShare.mockResolvedValue('trip-a')
    const { openDeepLink, useStore, off } = await app()
    useStore.setState({ saved: [{ id: 'trip-a', name: 'Mine', wayIn: 'trip-a:in', wayHome: 'trip-a:home', optionId: null, places: [{ node: 'GUA', hop: null }] }] })
    openDeepLink()
    await vi.waitFor(() => expect(useStore.getState().journey?.id).toBe('trip-a'))
    expect(useStore.getState().shared).toBeNull()
    expect(loadShared).not.toHaveBeenCalled()
    expect(new URL(browser.location.href).searchParams.get('trip')).toBe('trip-a')
    off()
  })
})
