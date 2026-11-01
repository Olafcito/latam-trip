import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The preview of the Supabase build shares localStorage with the site that still runs on files.
// Whatever it stores goes under keys of its own, and the keys of the file based build stay as they were.

function fakeStorage(start: Record<string, string>) {
  const m = new Map(Object.entries(start))
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    all: () => Object.fromEntries(m),
  }
}

const mainKeys = {
  'latam-planner.filters': '{"a":1}',
  'latam-planner.journeys': '[]',
  'latam-planner.hidden': '{"t":2}',
  'latam-planner.current': 'null',
  'latam-planner.seeded': '["x"]',
  'latam-planner.seed-file': '"f"',
  'latam-trip.trips': '{"trips":[],"active":null}',
  'latam-trip.journey': '[]',
  'latam-web.options': '1',
  'planner.whenLens': 'day',
}

let store: ReturnType<typeof fakeStorage>
beforeEach(() => {
  store = fakeStorage(mainKeys)
  ;(globalThis as { localStorage?: unknown }).localStorage = store
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_KEY', 'sb_publishable_test')
})
afterEach(() => vi.unstubAllEnvs())

describe('the Supabase build and the keys of the file based build', () => {
  it('writes its filters under its own key', async () => {
    const { useStore } = await import('./store')
    useStore.getState().setFilters({})
    expect(store.all()['latam-planner.filters.sb']).toBeDefined()
    for (const [k, v] of Object.entries(mainKeys)) expect(store.all()[k]).toBe(v)
  })

  it('starts from the filters the file based build left, and leaves them', async () => {
    const { useStore } = await import('./store')
    expect(useStore.getState().filters).toMatchObject({ a: 1 })
  })

  it('writes the open trip and the saved list under its own keys', async () => {
    const { useStore } = await import('./store')
    const j = { id: 'x', name: 'X', wayIn: 'in', wayHome: 'home', optionId: null, places: [{ node: 'GUA', hop: null }] }
    useStore.getState().setJourney(j)
    useStore.getState().importJourneys([j])
    expect(store.all()['latam-planner.current.sb']).toBeDefined()
    expect(store.all()['latam-planner.journeys.sb']).toBeDefined()
    for (const [k, v] of Object.entries(mainKeys)) expect(store.all()[k]).toBe(v)
  })
})
