import type { LodgingPrice, LodgingRoom } from '../data/types'
import { day } from './format'
import { checkedLabel, daysSince, isStale } from './freshness'
import { SITE } from './lodgingWords'

// The marks on a room of a place to stay, from its latest price for the very dates searched: how old that price
// is, how few beds or rooms were left when it was seen, and whether it cancels for free. Each mark is a short chip
// with its full words for a tooltip and a screen reader.

export interface Mark {
  /** what the chip shows, "5 days old", "3 left", "Free until 8 Dec" */
  text: string
  /** the words in full, "Seen on Hostelworld 5 Nov 14:02" */
  label: string
}

export interface RoomMarks {
  /** how old the price is, null when it is from today, so a fresh price carries no mark. Amber when stale */
  seen: (Mark & { stale: boolean }) | null
  /** few left, at most LOW_LEFT, or none left */
  left: (Mark & { none: boolean }) | null
  /** cancels for free, until a day when the site says */
  free: Mark | null
}

/** At this many beds or rooms left, or fewer, the room says how many. */
export const LOW_LEFT = 3

const at = (p: LodgingPrice) => {
  const t = Date.parse(p.observed_at)
  return Number.isNaN(t) ? -Infinity : t
}

/** The latest price seen for these very dates, null with none. */
export function latestExact(room: Pick<LodgingRoom, 'prices'>, checkIn: string, checkOut: string): LodgingPrice | null {
  let best: LodgingPrice | null = null
  for (const p of room.prices) {
    if (p.check_in !== checkIn || p.check_out !== checkOut) continue
    if (!best || at(p) > at(best)) best = p
  }
  return best
}

const unit = (room: Pick<LodgingRoom, 'private'>, n: number) =>
  room.private === false ? (n === 1 ? 'bed' : 'beds') : room.private === true ? (n === 1 ? 'room' : 'rooms') : null

export function roomMarks(room: Pick<LodgingRoom, 'prices' | 'private'>, checkIn: string, checkOut: string, now: number): RoomMarks {
  const p = latestExact(room, checkIn, checkOut)
  if (!p) return { seen: null, left: null, free: null }

  const age = daysSince(p.observed_at, now)
  const seen = age == null || age === 0
    ? null
    : {
        text: age === 1 ? '1 day old' : `${age} days old`,
        label: `Seen${p.site ? ` on ${SITE[p.site]}` : ''} ${checkedLabel(p.observed_at)}`,
        stale: isStale(p.observed_at, now),
      }

  let left: RoomMarks['left'] = null
  if (p.available != null && p.available <= LOW_LEFT) {
    const n = Math.max(0, p.available)
    const u = unit(room, n)
    left = n === 0
      ? { text: 'Sold out', label: `Sold out${p.site ? ` on ${SITE[p.site]}` : ''} for these dates`, none: true }
      : { text: `${n} left`, label: u ? `${n} ${u} left` : `${n} left`, none: false }
  }

  const free = p.refundable === 'yes'
    ? p.cancel_until
      ? { text: `Free until ${day(p.cancel_until)}`, label: `Free cancellation until ${day(p.cancel_until)}` }
      : { text: 'Free cancellation', label: 'Free cancellation' }
    : null

  return { seen, left, free }
}
