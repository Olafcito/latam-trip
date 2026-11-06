import type { Booking, ConfirmationSource, Lodging } from '../data/types'
import { attachFile, saveBookings } from './bookings'
import { setLodgingAddress } from './lodgings'
import { mailLinkOf } from './readBooking'
import { bookingLink, formChange, stayRow, type StayForm, type StayTarget } from './stayBooking'

// Saving the review of a stay confirmation (window C). Nothing is written until Save. Save books the stay with the
// reviewed form, then attaches the file, then gives the lodging the address when it had none. A step that fails says
// why and leaves the window open, and Save again goes on from there: the booking is changed in place, never made twice,
// and a file or an address that went up is not sent again.

const MAIL = /^https:\/\/(?:mail\.google\.com|outlook\.(?:live|office|office365)\.com)\//i

/** A link to the confirmation mail in Gmail or Outlook. */
export const isMailLink = (text: string): boolean => MAIL.test(text.trim())

/** What a pasted link is: the confirmation mail, a booking page, or nothing worth keeping. */
export function pastedLink(text: string): { mailUrl: string } | { url: string } | null {
  const t = mailLinkOf(text)
  if (!t) return null
  if (isMailLink(t)) return { mailUrl: t }
  const url = bookingLink(t)
  return url ? { url } : null
}

/** Where the confirmation came from: the file, the mail link, a pasted booking page, or typed in. */
export function confirmSource(file: File | null, mailUrl: string, url: string | null): ConfirmationSource {
  if (file) return 'upload'
  if (isMailLink(mailUrl)) return 'gmail'
  if (url) return 'url'
  return 'manual'
}

/** The address the review shows: the place has none, or the confirmation names another. */
export function addressField(lodgingAddress: string | null | undefined, formAddress: string): 'add' | 'other' | null {
  const had = (lodgingAddress ?? '').trim()
  if (!had) return 'add'
  const read = formAddress.trim()
  return read && norm(read) !== norm(had) ? 'other' : null
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** How far a save got, kept by the window for Save again. */
export interface SaveProgress {
  id: string | null
  /** the file that went up */
  filed: File | null
  addressDone: boolean
}

export const newProgress = (): SaveProgress => ({ id: null, filed: null, addressDone: false })

export interface StaySave {
  booking: Pick<Booking, 'id'> | null
  target: StayTarget
  form: StayForm
  file: File | null
  /** a pasted booking page */
  url: string | null
  lodging: Pick<Lodging, 'id' | 'address'> | null
  progress: SaveProgress
}

/** Saves the reviewed stay. The progress is changed as each step lands. */
export async function saveStay(s: StaySave): Promise<{ ok: true; addressSet: boolean } | { ok: false; message: string }> {
  const m = formChange(s.form)
  if (!m.ok) return m
  const change: Partial<Booking> = { ...m.change, confirmation_source: confirmSource(s.file, s.form.mailUrl, s.url) }
  if (s.url) change.url = s.url

  const had = s.booking ?? (s.progress.id ? { id: s.progress.id } : null)
  const r = await saveBookings([stayRow(had, s.target, change)])
  if (!r.ok) return { ok: false, message: r.message }
  const id = r.ids[0] ?? had?.id
  if (!id) return { ok: false, message: 'The booking was not saved. Try again.' }
  s.progress.id = id

  if (s.file && s.progress.filed !== s.file) {
    const a = await attachFile(id, s.file)
    if (!a.ok) return { ok: false, message: `Booked, but ${s.file.name} was not added. ${a.message}` }
    s.progress.filed = s.file
  }

  let addressSet = false
  if (s.lodging && !(s.lodging.address ?? '').trim() && m.address && !s.progress.addressDone) {
    const w = await setLodgingAddress(s.lodging.id, m.address)
    if (!w.ok) return { ok: false, message: `Booked, but the address was not added to the place. ${w.message}` }
    s.progress.addressDone = true
    addressSet = true
  }
  return { ok: true, addressSet }
}
