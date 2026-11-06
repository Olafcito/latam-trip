import type { LodgingSite } from '../data/types'
import { linkIn, mailLinkOf } from './readBooking'
import { invokeRead, isHeic, PLAIN, toSend } from './readFiles'
import { supabase } from './supabase'
import type { StayForm, StayFormKey, StayTarget } from './stayBooking'
import { addDays } from './time'

// Reads a stay confirmation (a PDF, a screenshot, a saved mail or pasted text) with the read-booking function in its
// stay mode (supabase/functions/read-booking), and hands back the review form filled in with what it states.
// A pasted mail link alone is kept as the mail link and nothing is read.

export interface StayRead {
  form: StayForm
  /** the fields the confirmation did not state */
  missing: StayFormKey[]
  /** what the confirmation says of the place, to compare with the lodging */
  place: { name: string | null; city: string | null; country: string | null }
}

export type StayReadResult = ({ ok: true } & StayRead) | { ok: false; message: string }

interface Money { amount?: number; currency?: string }

/** One stay of the read function's answer: the input of its stays tool. Every field may be missing. */
export interface ReadStayItem {
  property?: { name?: string; address?: string; city?: string; country?: string }
  check_in?: string
  check_out?: string
  check_in_time?: string
  check_out_time?: string
  nights?: number
  guests?: number
  rooms?: number
  room_name?: string
  provider?: string
  seller?: string
  seller_url?: string
  reference?: string
  total?: Money
  paid?: Money
  balance?: Money
  per_night?: Money
  refundable?: string
  cancel_until?: string
  cancel_policy?: string
  not_found?: string[]
}

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const DAY = /^\d{4}-\d{2}-\d{2}$/
const CLOCK = /^\d{2}:\d{2}$/
const shaped = (re: RegExp, v: unknown): string => {
  const t = clean(v)
  return re.test(t) ? t : ''
}
const PROVIDERS: LodgingSite[] = ['booking', 'hostelworld', 'airbnb', 'own', 'other']
const REFUNDABLE = ['yes', 'no', 'partly']

interface Amount { amount: number; currency: string }

function amountOf(m: Money | undefined): Amount | null {
  if (!m || typeof m.amount !== 'number' || !Number.isFinite(m.amount) || m.amount < 0) return null
  const currency = clean(m.currency).toUpperCase()
  return currency ? { amount: m.amount, currency } : null
}

/** The amounts added when they share one currency and every stay has one, else null. */
function summed(list: (Amount | null)[]): Amount | null {
  if (!list.length || list.some((a) => !a)) return null
  const all = list as Amount[]
  if (all.some((a) => a.currency !== all[0].currency)) return null
  // round away the float noise of adding cents
  return { amount: Math.round(all.reduce((n, a) => n + a.amount, 0) * 100) / 100, currency: all[0].currency }
}

/** The stay's total as stated, or its deposit plus its balance when those are stated in one currency. */
function totalOf(s: ReadStayItem): Amount | null {
  const total = amountOf(s.total)
  if (total) return total
  const paid = amountOf(s.paid)
  const balance = amountOf(s.balance)
  return paid && balance && paid.currency === balance.currency ? summed([paid, balance]) : null
}

const nameKey = (s: ReadStayItem) => clean(s.property?.name).toLowerCase().replace(/\s+/g, ' ')
const unique = (list: string[]) => [...new Set(list.filter(Boolean))]
const text = (n: number) => String(n)

/**
 * The review form out of what the function read. Pure.
 * The stays that overlap the target's nights are picked. Picked stays at one property that follow each other, such as two
 * one-night bookings, are joined into one. When no stay overlaps, the first one is taken and its own dates show in the form.
 * The form is base with only the fields the read states written over it, and missing names the fields it did not state.
 */
export function stayReadOf(stays: ReadStayItem[], target: StayTarget, base: StayForm, mailUrl?: string | null): StayRead {
  const end = addDays(target.first, Math.max(1, target.nights))
  const dated = (s: ReadStayItem) => shaped(DAY, s.check_in) && shaped(DAY, s.check_out) && clean(s.check_out) > clean(s.check_in)
  const overlaps = stays.filter((s) => dated(s) && clean(s.check_in) < end && clean(s.check_out) > target.first)
  const picked = (overlaps.length ? overlaps : stays.slice(0, 1)).slice().sort((a, b) => (clean(a.check_in) < clean(b.check_in) ? -1 : 1))

  // the first picked stay and the ones that continue it at the same property
  const joined: ReadStayItem[] = picked.slice(0, 1)
  for (const s of picked.slice(1)) {
    const last = joined[joined.length - 1]
    if (nameKey(s) && nameKey(s) === nameKey(last) && clean(s.check_in) === clean(last.check_out)) joined.push(s)
  }
  const first = joined[0]
  const form: StayForm = { ...base }
  const stated = new Set<StayFormKey>()
  const put = (key: StayFormKey, v: string) => {
    if (!v) return
    ;(form as unknown as Record<string, string>)[key] = v
    stated.add(key)
  }

  if (first) {
    put('reference', unique(joined.map((s) => clean(s.reference))).join(', '))
    const ins = joined.map((s) => shaped(DAY, s.check_in)).filter(Boolean).sort()
    const outs = joined.map((s) => shaped(DAY, s.check_out)).filter(Boolean).sort()
    put('checkIn', ins[0] ?? '')
    put('checkOut', outs[outs.length - 1] ?? '')
    form.checkInTime = shaped(CLOCK, first.check_in_time) || form.checkInTime
    form.checkOutTime = shaped(CLOCK, joined[joined.length - 1].check_out_time) || form.checkOutTime
    put('room', unique(joined.map((s) => clean(s.room_name))).join(', '))
    if (typeof first.guests === 'number' && first.guests >= 1) form.guests = text(first.guests)
    if (typeof first.rooms === 'number' && first.rooms >= 1) form.rooms = text(first.rooms)

    const total = summed(joined.map(totalOf))
    if (total) {
      put('total', text(total.amount))
      put('currency', total.currency)
      // a kroner figure typed for another amount or currency no longer holds
      if (text(total.amount) !== base.total.trim() || total.currency !== base.currency) form.dkk = ''
    }
    // paid can be summed only the same way, and it is kept only in the form's one currency, so a deposit in
    // kroner is never stored as the same number of pesos
    const paid = summed(joined.map((s) => amountOf(s.paid)))
    if (paid && paid.currency === form.currency) form.paid = text(paid.amount)

    const provider = clean(first.provider) as LodgingSite
    if (PROVIDERS.includes(provider)) {
      put('provider', provider)
      if (provider === 'own' || provider === 'other') {
        form.seller = clean(first.seller) || form.seller
        form.sellerUrl = clean(first.seller_url) || form.sellerUrl
      }
    }

    const refundable = unique(joined.map((s) => clean(s.refundable)).filter((r) => REFUNDABLE.includes(r)))
    if (refundable.length) form.refundable = (refundable.length === 1 ? refundable[0] : 'partly') as StayForm['refundable']
    const until = joined.map((s) => shaped(DAY, s.cancel_until)).filter(Boolean).sort()
    put('cancelUntil', until[0] ?? '')
    put('address', clean(first.property?.address))
  }
  if (mailUrl) form.mailUrl = mailUrl

  const asked: StayFormKey[] = ['reference', 'checkIn', 'checkOut', 'total', 'currency', 'room', 'cancelUntil', 'provider', 'address']
  // a stay that cannot be cancelled has no last day of free cancellation to state
  const missing = asked.filter((k) => !stated.has(k) && !(k === 'cancelUntil' && form.refundable === 'no'))
  if (form.currency && form.currency !== 'DKK' && !form.dkk.trim()) missing.push('dkk')

  return {
    form,
    missing,
    place: { name: clean(first?.property?.name) || null, city: clean(first?.property?.city) || null, country: clean(first?.property?.country) || null },
  }
}

/** Reads files and text for one planned stay. city is the stop's town, so the reader knows which stay is meant. base is the form so far. */
export async function readStay(target: StayTarget, city: string, files: File[], text: string, base: StayForm): Promise<StayReadResult> {
  const readable = files.filter((f) => !isHeic(f))
  const link = mailLinkOf(text)
  if (link && !readable.length) {
    return { ok: true, form: { ...base, mailUrl: link }, missing: [], place: { name: null, city: null, country: null } }
  }
  if (!supabase) return { ok: false, message: 'Reading is not available without a connection.' }
  try {
    const sent = await toSend(files, text)
    if (!sent.ok) return sent
    const leg = { kind: 'stay', place: city, day: target.first, nights: target.nights }
    const res = await invokeRead({ leg, text: sent.text, files: sent.files })
    if (!res.ok) return res
    const stays = (res.data as { booking?: { stays?: ReadStayItem[] } } | null)?.booking?.stays
    if (!Array.isArray(stays) || !stays.some((s) => s && typeof s === 'object')) return { ok: false, message: PLAIN }
    return { ok: true, ...stayReadOf(stays.filter((s) => s && typeof s === 'object'), target, base, link ?? linkIn(sent.text)) }
  } catch {
    return { ok: false, message: PLAIN }
  }
}
