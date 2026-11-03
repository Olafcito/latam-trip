import type { Booking, BookingFile } from '../data/types'
import { supabase } from './supabase'

// Bookings through Supabase (spec 4.1). The table and its bucket are owner only, so nothing here is cached or logged.

const BUCKET = 'bookings'
/** the bucket's own limits in 0013_bookings.sql */
export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp']
const FILE_EXT: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', webp: 'image/webp' }
/** a signed download URL lasts 10 minutes and is asked for when a tile is opened */
const URL_SECONDS = 600

type Result = { ok: true } | { ok: false; message: string }

const failed = (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) })

/** Every booking, cancelled ones too. Empty without a client. */
export async function loadBookings(): Promise<Booking[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('bookings').select('*').order('id')
  if (error) throw new Error(error.message)
  return (data ?? []) as Booking[]
}

/** Calls cb on every change of bookings. Returns the way to stop listening. */
export function subscribeBookings(cb: () => void): () => void {
  if (!supabase) return () => {}
  const client = supabase
  const channel = client.channel('bookings-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, cb).subscribe()
  return () => {
    void client.removeChannel(channel)
  }
}

/**
 * Rows without an id are inserted together, so the rows of one ticket land as one. A row with an id updates that row
 * with the fields it has, or is inserted when there is none. The ids come back in the order of the rows.
 */
export async function saveBookings(rows: Partial<Booking>[]): Promise<{ ok: true; ids: string[] } | { ok: false; message: string }> {
  if (!supabase) return { ok: false, message: 'Not connected.' }
  const client = supabase
  const fields = rows.map(({ created_at: _c, updated_at: _u, ...r }) => r)
  try {
    const ids: (string | undefined)[] = fields.map((r) => r.id)
    const fresh = fields.filter((r) => !r.id)
    if (fresh.length) {
      // missing fields take the table's defaults, not null
      const { data, error } = await client.from('bookings').insert(fresh, { defaultToNull: false }).select('id')
      if (error) return { ok: false, message: error.message }
      const made = (data ?? []).map((r: { id: string }) => r.id)
      if (made.length !== fresh.length) return { ok: false, message: 'The bookings were not all stored.' }
      let i = 0
      ids.forEach((id, k) => {
        if (!id) ids[k] = made[i++]
      })
    }
    // one at a time, since a bulk upsert would set the fields a row leaves out to their defaults
    for (const r of fields.filter((r) => r.id)) {
      const { error } = await client.from('bookings').upsert(r, { onConflict: 'id', defaultToNull: false })
      if (error) return { ok: false, message: error.message }
    }
    return { ok: true, ids: ids as string[] }
  } catch (e) {
    return failed(e)
  }
}

/** A cancelled row is kept, and matches nothing. */
export async function cancelBooking(id: string): Promise<Result> {
  if (!supabase) return { ok: false, message: 'Not connected.' }
  try {
    const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id)
    return error ? { ok: false, message: error.message } : { ok: true }
  } catch (e) {
    return failed(e)
  }
}

/** The type the bucket stores a file as, from the browser or else from its extension. */
export function fileType(file: Pick<File, 'name' | 'type'>): string {
  return file.type || FILE_EXT[file.name.split('.').pop()?.toLowerCase() ?? ''] || ''
}

/** Why the bucket would refuse the file, in a plain sentence, or null when it takes it. */
export function fileProblem(file: Pick<File, 'name' | 'type' | 'size'>): string | null {
  const name = file.name
  if (!name.trim() || !name.replace(/\./g, '') || /[/\\\x00-\x1f]/.test(name)) return 'The file needs a name like ticket.pdf.'
  if (!FILE_TYPES.includes(fileType(file))) return `${name} is not a PDF or a photo, so it cannot be added.`
  if (!file.size) return `${name} is empty.`
  if (file.size > MAX_FILE_BYTES) return `${name} is over 10 MB, so it cannot be added.`
  return null
}

/** Uploads the file to bookings/<id>/<name> after the checks, and adds it to the booking in place of one with that name. */
export async function attachFile(id: string, file: File): Promise<{ ok: true; attachment: BookingFile } | { ok: false; message: string }> {
  const problem = fileProblem(file)
  if (problem) return { ok: false, message: problem }
  if (!supabase) return { ok: false, message: 'Not connected.' }
  const client = supabase
  const path = `${id}/${file.name}`
  const type = fileType(file)
  try {
    const { data: row, error: readError } = await client.from('bookings').select('attachments').eq('id', id).maybeSingle()
    if (readError) return { ok: false, message: readError.message }
    if (!row) return { ok: false, message: 'The booking is not there any more.' }
    const up = await client.storage.from(BUCKET).upload(path, file, { contentType: type, upsert: true })
    if (up.error) return { ok: false, message: up.error.message }
    const attachment: BookingFile = { path, name: file.name, type, size: file.size, added_at: new Date().toISOString() }
    const files = ((row as { attachments: BookingFile[] | null }).attachments ?? []).filter((a) => a.path !== path).concat(attachment)
    const { error } = await client.from('bookings').update({ attachments: files }).eq('id', id)
    return error ? { ok: false, message: error.message } : { ok: true, attachment }
  } catch (e) {
    return failed(e)
  }
}

/** A download URL for one file that lasts 10 minutes. It is never stored. */
export async function fileUrl(path: string): Promise<string | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, URL_SECONDS)
    return error ? null : data.signedUrl
  } catch {
    return null
  }
}
