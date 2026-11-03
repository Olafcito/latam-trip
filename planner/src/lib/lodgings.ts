import type { Lodging, LodgingPrice, LodgingRoom } from '../data/types'
import { supabase } from './supabase'

// Places to stay through Supabase (spec 5.2). The three tables are owner only, so nothing here is cached, logged
// or written to a built file. A lodging comes with its rooms, each room with its prices.

type Result = { ok: true } | { ok: false; message: string }

const KINDS = ['hostel', 'hotel', 'guesthouse', 'apartment', 'other']
const SITES = ['booking', 'hostelworld', 'airbnb', 'own', 'other']
const TAGS = ['beach', 'pool', 'social', 'quiet', 'kitchen', 'breakfast', 'aircon', 'workspace']

const failed = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) })

type PriceRow = Omit<LodgingPrice, 'id' | 'room_id' | 'observed_at'> & Partial<Pick<LodgingPrice, 'id' | 'observed_at'>>
type RoomRow = Omit<LodgingRoom, 'id' | 'lodging_id' | 'created_at' | 'updated_at' | 'prices'> & { id?: string; prices: PriceRow[] }

/** A place to stay as the add form gives it. Without ids it is new, with them the rows that are there already stay as they are. */
export type LodgingDraft = Omit<Lodging, 'id' | 'added_by' | 'hidden' | 'created_at' | 'updated_at' | 'rooms'> & {
  id?: string
  added_by?: Lodging['added_by']
  rooms: RoomRow[]
}

/** Every place to stay with its rooms by name and their prices by date, hidden ones too. Empty without a client. */
export async function loadLodgings(): Promise<Lodging[]> {
  if (!supabase) return []
  const [l, r, p] = await Promise.all([
    supabase.from('lodgings').select('*').order('created_at').order('id'),
    supabase.from('lodging_rooms').select('*').order('name').order('id'),
    supabase.from('lodging_prices').select('*').order('check_in').order('check_out').order('observed_at').order('id'),
  ])
  for (const x of [l, r, p]) if (x.error) throw new Error(x.error.message)
  const prices = new Map<string, LodgingPrice[]>()
  for (const row of (p.data ?? []) as LodgingPrice[]) prices.set(row.room_id, [...(prices.get(row.room_id) ?? []), row])
  const rooms = new Map<string, LodgingRoom[]>()
  for (const row of (r.data ?? []) as Omit<LodgingRoom, 'prices'>[]) rooms.set(row.lodging_id, [...(rooms.get(row.lodging_id) ?? []), { ...row, prices: prices.get(row.id) ?? [] }])
  return ((l.data ?? []) as Omit<Lodging, 'rooms'>[]).map((row) => ({ ...row, rooms: rooms.get(row.id) ?? [] }))
}

/** Calls cb on every change of a lodging, a room or a price. Returns the way to stop listening. Each call gets a channel of its own. */
export function subscribeLodgings(cb: () => void): () => void {
  if (!supabase) return () => {}
  const client = supabase
  let channel = client.channel(`lodgings-changes-${crypto.randomUUID()}`)
  for (const table of ['lodgings', 'lodging_rooms', 'lodging_prices']) channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, cb)
  channel.subscribe()
  return () => {
    void client.removeChannel(channel)
  }
}

/** What the tables would refuse in a draft, said the way the form can show it. */
export function draftProblem(d: LodgingDraft): string | null {
  if (!d.name.trim()) return 'Give the place a name.'
  if (!KINDS.includes(d.kind)) return 'Pick what kind of place it is.'
  if (d.tags.some((t) => !TAGS.includes(t))) return 'A tag is not one the places use.'
  if (d.links.some((x) => !SITES.includes(x.site) || !x.url.trim())) return 'A link needs its site and its address.'
  for (const room of d.rooms) {
    if (!room.name.trim()) return 'Give each room a name.'
    if (room.beds != null && room.beds < 1) return 'A room has at least 1 bed.'
    for (const pr of room.prices) {
      if (!(pr.check_out > pr.check_in)) return 'A price checks out after it checks in.'
      if (pr.total_dkk == null && pr.per_night_dkk == null) return 'A price needs a total or a price per night.'
      if (pr.site != null && !SITES.includes(pr.site)) return 'A price is from a site the places do not use.'
    }
  }
  return null
}

/**
 * Saves a place to stay whole, in the order the connector writes it: the lodging, its rooms, then their prices.
 * A row that is there already stays as it is, so the same draft sent again finishes what a first try left.
 * A new lodging whose rooms or prices fail is taken away again, which takes what was written of it with it.
 */
export async function saveLodging(d: LodgingDraft): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  if (!supabase) return { ok: false, message: 'Not connected.' }
  const problem = draftProblem(d)
  if (problem) return { ok: false, message: problem }
  const client = supabase
  const fresh = !d.id
  const id = d.id ?? crypto.randomUUID()
  const { rooms, ...fields } = d
  const once = { onConflict: 'id', ignoreDuplicates: true }
  const roomRows = rooms.map(({ prices: _p, ...room }) => ({ ...room, id: room.id ?? crypto.randomUUID(), lodging_id: id }))
  const priceRows = rooms.flatMap((room, k) => room.prices.map((pr) => ({ ...pr, id: pr.id ?? crypto.randomUUID(), room_id: roomRows[k].id })))
  const undo = async (message: string) => {
    if (fresh) await client.from('lodgings').delete().eq('id', id)
    return { ok: false as const, message: fresh ? `${message} Nothing was saved.` : message }
  }
  try {
    const l = await client.from('lodgings').upsert({ ...fields, id, added_by: d.added_by ?? 'simon' }, once)
    if (l.error) return { ok: false, message: l.error.message }
    if (roomRows.length) {
      const r = await client.from('lodging_rooms').upsert(roomRows, once)
      if (r.error) return await undo(r.error.message)
    }
    if (priceRows.length) {
      const p = await client.from('lodging_prices').upsert(priceRows, once)
      if (p.error) return await undo(p.error.message)
    }
    return { ok: true, id }
  } catch (e) {
    return fresh ? await undo(failed(e).message).catch(() => failed(e)) : failed(e)
  }
}

/** A hidden place to stay is kept, and no longer shows. */
export async function hideLodging(id: string): Promise<Result> {
  if (!supabase) return { ok: false, message: 'Not connected.' }
  try {
    const { data, error } = await supabase.from('lodgings').update({ hidden: true }).eq('id', id).select('id')
    if (error) return { ok: false, message: error.message }
    if (!data?.length) return { ok: false, message: 'The place is not there any more.' }
    return { ok: true }
  } catch (e) {
    return failed(e)
  }
}
