import { beforeEach, describe, expect, it } from 'vitest'
import { outbox, type SendOutcome } from './outbox'
import type { TripRow } from './repoTrips'

function fakeStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  }
}

const row = (id: string, name: string) => ({ id, name, version: 1 }) as unknown as TripRow

beforeEach(() => {
  ;(globalThis as { localStorage?: unknown }).localStorage = fakeStorage()
})

describe('outbox', () => {
  it('keeps order and removes only after a send', async () => {
    outbox.enqueue(row('a', 'first'))
    outbox.enqueue(row('b', 'second'))
    outbox.enqueue(row('c', 'third'))
    const seen: string[] = []
    // the second send cannot be made yet: the run stops there and nothing after it is tried
    const rep = await outbox.flush(async (r) => {
      seen.push(r.name)
      return (r.name === 'second' ? { status: 'queued' } : { status: 'saved' }) as SendOutcome
    })
    expect(seen).toEqual(['first', 'second'])
    expect(rep.sent).toBe(1)
    expect(rep.left).toBe(2)
    expect(outbox.list().map((q) => q.row.name)).toEqual(['second', 'third'])
  })

  it('keeps an entry whose send threw', async () => {
    outbox.enqueue(row('a', 'first'))
    await outbox.flush(async () => {
      throw new Error('offline')
    })
    expect(outbox.size()).toBe(1)
  })

  it('keeps two saves of one trip as two entries, sent in the order pressed', async () => {
    outbox.enqueue(row('a', 'one'))
    outbox.enqueue(row('a', 'two'))
    expect(outbox.size()).toBe(2)
    const seen: string[] = []
    await outbox.flush(async (r) => {
      seen.push(r.name)
      return { status: 'saved' }
    })
    expect(seen).toEqual(['one', 'two'])
    expect(outbox.size()).toBe(0)
  })

  it('reports a save that can never go through and moves on', async () => {
    outbox.enqueue(row('a', 'gone'))
    outbox.enqueue(row('b', 'fine'))
    const rep = await outbox.flush(async (r) => (r.name === 'gone' ? { status: 'deleted' } : { status: 'saved' }))
    expect(rep.dropped.map((d) => d.row.name)).toEqual(['gone'])
    expect(rep.sent).toBe(1)
    expect(outbox.size()).toBe(0)
  })

  it('survives unreadable storage', () => {
    localStorage.setItem('latam-planner.outbox', 'not json')
    expect(outbox.size()).toBe(0)
    outbox.enqueue(row('a', 'x'))
    expect(outbox.size()).toBe(1)
  })
})
