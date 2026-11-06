import { fileType } from './bookings'
import { supabase } from './supabase'

// What the booking readers share: the limits on what is sent to the read-booking function, the file helpers and the
// call itself. readBooking.ts (flights and the like) and readStay.ts (stays) both build on it.

const HEIC = /\.(heic|heif)$/i
export const isHeic = (f: File) => HEIC.test(f.name) || /^image\/hei[cf]$/.test(f.type)
export const isEml = (f: File) => /\.eml$/i.test(f.name) || f.type === 'message/rfc822'

export const MAX_SENT_FILES = 5
export const MAX_SENT_BYTES = 10 * 1024 * 1024
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export const PLAIN = 'The booking could not be read. Fill it in yourself.'
export const HEIC_SAID = 'HEIC photos cannot be read. Share a screenshot or a PDF instead.'

export async function base64Of(f: File): Promise<string> {
  const bytes = new Uint8Array(await f.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** Why the files to send cannot go, in a plain sentence, or null. */
export function sendProblem(sent: File[]): string | null {
  if (sent.length > MAX_SENT_FILES) return `Add at most ${MAX_SENT_FILES} files to read.`
  const big = sent.find((f) => fileType(f).startsWith('image/') && f.size > MAX_IMAGE_BYTES)
  if (big) return `${big.name} is over 5 MB, so it cannot be read. Share a smaller screenshot or a PDF.`
  if (sent.reduce((n, f) => n + f.size, 0) > MAX_SENT_BYTES) return 'The files are over 10 MB together, so they cannot be read.'
  return null
}

export type Sent = { ok: true; text: string; files: { name: string; type: string; data: string }[] } | { ok: false; message: string }

/** The text and files to send out of what was added: HEIC photos left out, a saved mail turned into text. */
export async function toSend(files: File[], text: string): Promise<Sent> {
  const readable = files.filter((f) => !isHeic(f))
  const sentFiles = readable.filter((f) => !isEml(f))
  const tooMuch = sendProblem(sentFiles)
  if (tooMuch) return { ok: false, message: tooMuch }
  let all = text
  for (const f of readable) if (isEml(f)) all += `\n\n${await f.text()}`
  const sent: { name: string; type: string; data: string }[] = []
  for (const f of sentFiles) sent.push({ name: f.name, type: fileType(f), data: await base64Of(f) })
  if (!all.trim() && !sent.length) return { ok: false, message: files.some(isHeic) ? HEIC_SAID : 'Add a file or paste the confirmation first.' }
  return { ok: true, text: all, files: sent }
}

/** What the planner says when the monthly reads are used up (read-booking answers 429 monthly_cap). */
export const CAP_SAID = 'The reads for this month are used up. Fill in the booking by hand.'

/** Calls the read-booking function and gives its data, or the plain sentence the function said. */
export async function invokeRead(body: Record<string, unknown>): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
  if (!supabase) return { ok: false, message: 'Reading is not available without a connection.' }
  const { data, error } = await supabase.functions.invoke('read-booking', { body })
  if (error) {
    let message = PLAIN
    const ctx = (error as { context?: unknown }).context
    if (ctx instanceof Response) {
      const said = (await ctx.json().catch(() => null)) as { error?: string } | null
      if (said?.error) message = said.error === 'monthly_cap' ? CAP_SAID : said.error
    }
    return { ok: false, message }
  }
  return { ok: true, data }
}
