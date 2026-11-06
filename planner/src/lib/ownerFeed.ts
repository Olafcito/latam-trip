import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

// The signed in person's changes come on one private broadcast topic, owner:<user id> (TECH-012). The database tells
// it the table that changed and nothing of the row, and row level security on the topic keeps it to that person.
// Each tab holds one channel for the person, shared by every listener, and moves to the new person on a sign in.

/** The private tables whose changes reach the planner. */
export type OwnerTable = 'trips' | 'bookings' | 'lodgings' | 'lodging_rooms' | 'lodging_prices' | 'tasks'

interface Listener {
  tables: ReadonlySet<string>
  cb: () => void
}

const listeners = new Set<Listener>()
let current: { uid: string; channel: RealtimeChannel } | null = null
let queue: Promise<void> = Promise.resolve()
let watching = false

function tell(table: string): void {
  for (const l of [...listeners]) if (l.tables.has(table)) l.cb()
}

function tellAll(): void {
  for (const l of [...listeners]) l.cb()
}

// The log names neither the topic nor the person, since the topic carries the user id.
function fail(what: string, detail: string): void {
  console.error(`ownerFeed: ${what}`, detail)
}

async function follow(uid: string | null): Promise<void> {
  const client = supabase
  if (!client || current?.uid === uid) return
  if (current) {
    const old = current.channel
    current = null
    await client.removeChannel(old)
  }
  if (!uid) return
  // a private channel joins with the person's token, so it is set before the join
  await client.realtime.setAuth()
  const channel = client.channel(`owner:${uid}`, { config: { private: true } })
  current = { uid, channel }
  let joins = 0
  channel
    .on('broadcast', { event: '*' }, (msg: { event: string }) => tell(msg.event))
    .subscribe((status) => {
      if (current?.channel !== channel) return
      if (status === 'SUBSCRIBED') {
        // a message sent while the channel was away is lost, so after a rejoin every list reads its rows again
        if (joins++ > 0) tellAll()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // the error's own text names the topic, so only the status is logged
        fail('the private channel did not join', status)
      }
    })
}

function watch(): void {
  if (watching || !supabase) return
  watching = true
  // the auth callback must not wait on the client, so the switch runs after it, one at a time
  supabase.auth.onAuthStateChange((_event, session) => {
    const uid = session?.user.id ?? null
    setTimeout(() => {
      queue = queue
        .then(() => follow(uid))
        .catch((e: unknown) => fail('the private channel did not move', e instanceof Error ? e.name : 'error'))
    }, 0)
  })
}

/** Calls cb whenever one of the tables changes for the signed in person. Returns the way to stop listening. */
export function onOwnerChange(tables: readonly OwnerTable[], cb: () => void): () => void {
  if (!supabase) return () => {}
  const listener: Listener = { tables: new Set(tables), cb }
  listeners.add(listener)
  watch()
  return () => {
    listeners.delete(listener)
  }
}
