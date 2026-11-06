import { describe, expect, it, vi } from 'vitest'

type Session = { user: { id: string } } | null
type Message = { event: string }
type Status = (status: string, err?: Error) => void
const joined: { topic: string; config: unknown; fire: (m: Message) => void; status: Status; removed: boolean }[] = []
let authChanged: (event: string, session: Session) => void = () => {}
vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string, session: Session) => void) => {
        authChanged = cb
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
    },
    realtime: { setAuth: async () => {} },
    channel: (topic: string, opts: unknown) => {
      const entry = { topic, config: opts, fire: (_m: Message) => {}, status: ((_s: string) => {}) as Status, removed: false }
      joined.push(entry)
      const channel = {
        entry,
        on: (_kind: string, _filter: unknown, cb: (m: Message) => void) => {
          entry.fire = cb
          return channel
        },
        subscribe: (cb?: Status) => {
          if (cb) entry.status = cb
          return channel
        },
      }
      return channel
    },
    removeChannel: async (channel: { entry: { removed: boolean } }) => {
      channel.entry.removed = true
      return 'ok'
    },
  },
}))

import { onOwnerChange } from './ownerFeed'

const settle = () => new Promise((r) => setTimeout(r, 0)).then(() => new Promise((r) => setTimeout(r, 0)))

describe('owner feed', () => {
  it('joins the private topic of the signed in person once, and tells each listener its own tables', async () => {
    const trips: string[] = []
    const stays: string[] = []
    const stopTrips = onOwnerChange(['trips'], () => trips.push('trips'))
    const stopStays = onOwnerChange(['lodgings', 'lodging_prices'], () => stays.push('stays'))
    authChanged('INITIAL_SESSION', { user: { id: 'TEST01-a' } })
    authChanged('TOKEN_REFRESHED', { user: { id: 'TEST01-a' } })
    await settle()
    expect(joined.map((j) => [j.topic, j.config])).toEqual([['owner:TEST01-a', { config: { private: true } }]])
    const feed = joined[0]
    feed.fire({ event: 'trips' })
    feed.fire({ event: 'lodging_prices' })
    feed.fire({ event: 'bookings' })
    expect(trips).toEqual(['trips'])
    expect(stays).toEqual(['stays'])
    stopTrips()
    feed.fire({ event: 'trips' })
    expect(trips).toEqual(['trips'])
    stopStays()
  })

  it('leaves the topic on sign out and joins the next person on sign in', async () => {
    const seen: string[] = []
    const stop = onOwnerChange(['bookings'], () => seen.push('b'))
    authChanged('SIGNED_OUT', null)
    await settle()
    expect(joined.every((j) => j.removed)).toBe(true)
    authChanged('SIGNED_IN', { user: { id: 'TEST01-b' } })
    await settle()
    const last = joined[joined.length - 1]
    expect(last.topic).toBe('owner:TEST01-b')
    expect(last.removed).toBe(false)
    last.fire({ event: 'bookings' })
    expect(seen).toEqual(['b'])
    stop()
  })

  it('logs a failed join without the topic, and every list reads again after a rejoin', async () => {
    const trips: string[] = []
    const stays: string[] = []
    const stopTrips = onOwnerChange(['trips'], () => trips.push('trips'))
    const stopStays = onOwnerChange(['lodgings'], () => stays.push('stays'))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const feed = joined[joined.length - 1]
    feed.status('SUBSCRIBED')
    expect([trips, stays]).toEqual([[], []])
    feed.status('CHANNEL_ERROR', new Error('Unauthorized: owner:TEST01-b'))
    expect(errors).toHaveBeenCalledTimes(1)
    const logged = JSON.stringify(errors.mock.calls)
    expect(logged).toContain('CHANNEL_ERROR')
    expect(logged).not.toContain('owner:')
    expect(logged).not.toContain('TEST01-b')
    feed.status('SUBSCRIBED')
    expect([trips, stays]).toEqual([['trips'], ['stays']])
    feed.status('SUBSCRIBED')
    expect([trips, stays]).toEqual([['trips', 'trips'], ['stays', 'stays']])
    // a channel left behind on a sign out tells no one
    authChanged('SIGNED_OUT', null)
    await settle()
    feed.status('SUBSCRIBED')
    expect(trips).toHaveLength(2)
    errors.mockRestore()
    stopTrips()
    stopStays()
  })
})
