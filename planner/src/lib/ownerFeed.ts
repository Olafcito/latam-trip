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
  channel.on('broadcast', { event: '*' }, (msg: { event: string }) => tell(msg.event)).subscribe()
  current = { uid, channel }
}

function watch(): void {
  if (watching || !supabase) return
  watching = true
  // the auth callback must not wait on the client, so the switch runs after it, one at a time
  supabase.auth.onAuthStateChange((_event, session) => {
    const uid = session?.user.id ?? null
    setTimeout(() => {
      queue = queue.then(() => follow(uid)).catch(() => {})
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
