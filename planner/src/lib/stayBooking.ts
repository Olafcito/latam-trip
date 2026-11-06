import type { Booking, LodgingPrice, LodgingRoom } from '../data/types'
import { weekdayDay } from './format'
import { partDkk, priceFor, type StayPart } from './stays'
import { addDays } from './time'

// A stay at a stop turned from planned into booked. Booking a planned part is one bookings row of kind stay, with
// the stop, the place, the room, the trip and the part's nights, and what Simon gives: a file, a link or the details.
// A part that already has its row is changed in place, so a second confirmation never makes a second booking.

/** The prompt Use with AI copies, with the city filled in. */
export function stayPrompt(city: string): string {
  return (
    `Look through my Gmail for emails about accommodation in ${city}. Find any accommodation bookings or reservations ` +
    'and add them to my LATAM Trips itinerary, including the property name, dates, room type, price and booking reference. ' +
    'Let me review the results before saving.'
  )
}

export interface StayTarget {
  tripId: string
  placeId: string
  lodgingId: string | null
  roomId: string | null
  /** the first night and the number of nights */
  first: string
  nights: number
}

/** The new booking of a planned part: booked, typed in by Simon, from its first night to the morning after its last. */
export function stayDraft(t: StayTarget): Partial<Booking> {
  return {
    kind: 'stay',
    status: 'booked',
    place_id: t.placeId,
    lodging_id: t.lodgingId,
    room_id: t.roomId,
    trip_id: t.tripId,
    check_in: t.first,
    check_out: addDays(t.first, Math.max(1, t.nights)),
    source: 'manual',
  }
}

/** The row to save: a change to the booking the part has, or a new booking with the change on it. */
export function stayRow(had: Pick<Booking, 'id'> | null, t: StayTarget, change: Partial<Booking>): Partial<Booking> {
  return had ? { ...change, id: had.id } : { ...stayDraft(t), ...change }
}

export interface ManualStay {
  reference: string
  /** the total paid, in kroner, as typed */
  price: string
  seller: string
  checkIn: string
  checkOut: string
  /** the last day it can be cancelled for free, or empty */
  cancelUntil: string
}

/** What the typed details change, or the reason they cannot be saved. Empty fields change nothing. */
export function manualChange(m: ManualStay): { ok: true; change: Partial<Booking> } | { ok: false; message: string } {
  const change: Partial<Booking> = {}
  if (m.reference.trim()) change.reference = m.reference.trim()
  if (m.seller.trim()) change.seller = m.seller.trim()
  const price = m.price.trim().replace(/\s|kr|dkk/gi, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  if (price) {
    const n = Number(price)
    if (!Number.isFinite(n) || n < 0) return { ok: false, message: 'The price needs to be a number of kroner.' }
    change.price_dkk = Math.round(n)
    change.price = Math.round(n)
    change.currency = 'DKK'
  }
  if (m.checkIn && m.checkOut) {
    if (m.checkOut <= m.checkIn) return { ok: false, message: 'Check-out needs to be after check-in.' }
    change.check_in = m.checkIn
    change.check_out = m.checkOut
  }
  if (m.cancelUntil) {
    change.cancel_until = m.cancelUntil
    change.refundable = 'yes'
  }
  return { ok: true, change }
}

/** A link worth keeping: http or https only. */
export function bookingLink(text: string): string | null {
  const t = text.trim()
  try {
    const u = new URL(t)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

/** How it can be cancelled, in a few words, or null when nothing is known. */
export function cancelWords(refundable: LodgingPrice['refundable'] | Booking['refundable'], until: string | null | undefined): string | null {
  if (refundable === 'no') return 'Non-refundable'
  if (refundable === 'partly') return until ? `Partly refundable until ${weekdayDay(until)}` : 'Partly refundable'
  if (refundable === 'yes' || until) return until ? `Free cancellation until ${weekdayDay(until)}` : 'Free cancellation'
  return null
}

/** The price of the room seen nearest the part's nights, for its cancellation terms. */
export function partTerms(room: LodgingRoom | undefined, part: Pick<StayPart, 'first' | 'nights'>): LodgingPrice | null {
  if (!room || part.nights <= 0) return null
  const out = addDays(part.first, part.nights)
  const exact = room.prices.filter((p) => p.check_in === part.first && p.check_out === out)
  if (exact.length) return exact.reduce((a, b) => ((a.total_dkk ?? Infinity) <= (b.total_dkk ?? Infinity) ? a : b))
  const near = priceFor(room, part.first, part.nights)
  if (!near || near.exact) return null
  return room.prices.find((p) => p.check_in === near.check_in && p.check_out === near.check_out) ?? null
}

export interface StayMoney {
  /** a night, rounded */
  perNight: number | null
  total: number | null
  /** false when the price is from other dates */
  exact: boolean
}

/** What the part costs a night and in all, from the booking when its price is filled in, else from the room's prices. */
export function stayMoney(room: LodgingRoom | undefined, part: StayPart, paid: number | null): StayMoney {
  const nights = Math.max(1, part.nights)
  if (paid != null) return { perNight: Math.round(paid / nights), total: paid, exact: true }
  const total = partDkk(room, part)
  if (total == null) return { perNight: null, total: null, exact: false }
  const pr = room ? priceFor(room, part.first, part.nights) : null
  return { perNight: Math.round(total / nights), total, exact: !!pr?.exact }
}
