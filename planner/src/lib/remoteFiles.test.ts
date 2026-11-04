import { describe, expect, it } from 'vitest'
import { createFiles, type FileCache, type Keep } from '@map/data/remoteFiles'

const BASE = 'https://x.test/storage/web/'
const META = (files: Record<string, string>, built_at = '2026-11-01T10:00:00Z') => ({ built_at, last_checked: {}, files })

function fakeCache(): FileCache & { held: Map<string, string> } {
  const held = new Map<string, string>()
  return {
    held,
    match: async (url) => (held.has(url) ? new Response(held.get(url)) : undefined),
    put: async (url, res) => void held.set(url, await res.text()),
  }
}

function fakeKeep(): Keep {
  const m = new Map<string, string>()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }
}

/** A network of files by url. A url that is not in the table answers 404, and a null table is offline. */
function fakeNet(table: { current: Record<string, unknown> | null }) {
  const log: { url: string; init?: RequestInit }[] = []
  const fetcher = (async (url: string, init?: RequestInit) => {
    log.push({ url, init })
    if (!table.current) throw new TypeError('Failed to fetch')
    if (!(url in table.current)) return new Response('', { status: 404 })
    return new Response(JSON.stringify(table.current[url]), { status: 200 })
  }) as unknown as typeof fetch
  return { fetcher, log }
}

describe('remote files', () => {
  it('opens from cache with no network', async () => {
    const cache = fakeCache()
    const keep = fakeKeep()
    const net = { current: { [BASE + 'data/web/meta.json']: META({ 'a.json': 'h1' }), [BASE + 'by-hash/h1-a.json']: { n: 1 } } as Record<string, unknown> | null }
    const first = fakeNet(net)
    expect(await createFiles({ base: BASE, fetch: first.fetcher, cache, keep }).getFile('a.json')).toEqual({ n: 1 })
    // a new visit, offline: the kept meta and the cached copy are enough
    net.current = null
    const second = fakeNet(net)
    expect(await createFiles({ base: BASE, fetch: second.fetcher, cache, keep }).getFile('a.json')).toEqual({ n: 1 })
    expect(second.log).toEqual([])
  })

  it('an empty cache downloads and fills', async () => {
    const cache = fakeCache()
    const net = fakeNet({ current: { [BASE + 'data/web/meta.json']: META({ 'a.json': 'h1' }), [BASE + 'by-hash/h1-a.json']: { n: 1 } } })
    const files = createFiles({ base: BASE, fetch: net.fetcher, cache, keep: fakeKeep() })
    expect(await files.getFile('a.json')).toEqual({ n: 1 })
    expect(cache.held.get(BASE + 'by-hash/h1-a.json')).toBe(JSON.stringify({ n: 1 }))
  })

  it('only a changed hash downloads', async () => {
    const table = {
      current: {
        [BASE + 'data/web/meta.json']: META({ 'a.json': 'h1', 'b.json': 'k1' }),
        [BASE + 'by-hash/h1-a.json']: { n: 1 },
        [BASE + 'by-hash/k1-b.json']: { m: 1 },
      } as Record<string, unknown> | null,
    }
    const net = fakeNet(table)
    const files = createFiles({ base: BASE, fetch: net.fetcher, cache: fakeCache(), keep: fakeKeep() })
    await files.getFile('a.json')
    await files.getFile('b.json')
    net.log.length = 0
    table.current = {
      [BASE + 'data/web/meta.json']: META({ 'a.json': 'h1', 'b.json': 'k2' }),
      [BASE + 'by-hash/k2-b.json']: { m: 2 },
    }
    const changed = await files.refresh()
    expect(changed).toEqual(['b.json'])
    expect(net.log.map((c) => c.url)).toEqual([BASE + 'data/web/meta.json', BASE + 'by-hash/k2-b.json'])
    expect(await files.getFile('b.json')).toEqual({ m: 2 })
    expect(await files.getFile('a.json')).toEqual({ n: 1 })
  })

  it('meta.json is fetched uncached', async () => {
    const net = fakeNet({ current: { [BASE + 'data/web/meta.json']: META({}) } })
    await createFiles({ base: BASE, fetch: net.fetcher, cache: fakeCache(), keep: fakeKeep() }).refresh()
    const call = net.log.find((c) => c.url.endsWith('meta.json'))
    expect(call?.init?.cache).toBe('no-store')
  })

  it('a failed refresh keeps the old file', async () => {
    const table = {
      current: { [BASE + 'data/web/meta.json']: META({ 'a.json': 'h1' }), [BASE + 'by-hash/h1-a.json']: { n: 1 } } as Record<string, unknown> | null,
    }
    const net = fakeNet(table)
    const files = createFiles({ base: BASE, fetch: net.fetcher, cache: fakeCache(), keep: fakeKeep() })
    expect(await files.getFile('a.json')).toEqual({ n: 1 })
    // the network goes, then the new copy is missing while the plain path fails too
    table.current = null
    expect(await files.refresh()).toEqual([])
    table.current = { [BASE + 'data/web/meta.json']: META({ 'a.json': 'h2' }) }
    expect(await files.refresh()).toEqual([])
    expect(await files.getFile('a.json')).toEqual({ n: 1 })
    expect(files.meta()?.files?.['a.json']).toBe('h1')
  })
})
