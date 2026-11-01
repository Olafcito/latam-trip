import { beforeEach, describe, expect, it, vi } from 'vitest'

const reads: string[] = []
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        order: async () => {
          reads.push(table)
          return { data: [], error: null }
        },
      }),
    }),
  },
  remoteEnabled: () => true,
}))

import { loadRepoTrips } from './routeMap'

beforeEach(() => {
  reads.length = 0
})

describe('routeMap', () => {
  it('routeMap reads trips_latest', async () => {
    const calls: string[] = []
    const real = globalThis.fetch
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url))
      return new Response('', { status: 404 })
    }) as typeof fetch
    try {
      expect(await loadRepoTrips()).toEqual([])
    } finally {
      globalThis.fetch = real
    }
    expect(reads).toEqual(['trips_latest'])
    expect(calls.filter((u) => u.includes('trips.json'))).toEqual([])
  })
})
