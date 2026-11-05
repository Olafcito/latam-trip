import type { ScheduledPlace } from './journey'
import { stayParts, type PlannedStay } from './stays'
import { addDays } from './time'

// Changes to a stop's planned stays, as the Where to stay section makes them. Each one gives the new list and
// leaves the old one as it was. A night is never dropped in silence: nights no part takes show as free nights.

/** The nights no part takes, after the last part, and the first of them. */
export function freeNights(stays: PlannedStay[], sp: ScheduledPlace): { first: string; nights: number } {
  const used = stayParts(stays, sp).reduce((n, p) => n + p.nights, 0)
  return { first: addDays(sp.inDay, used), nights: Math.max(0, sp.days - used) }
}

/** The nights a room of the place would be priced for: its own part, else the nights a choice of it would take. */
export function choiceNights(stays: PlannedStay[], sp: ScheduledPlace, lodgingId: string): { first: string; nights: number } {
  const parts = stayParts(stays, sp)
  const own = parts.find((p) => p.stay.lodging_id === lodgingId && p.fits)
  if (own) return { first: own.first, nights: own.nights }
  if (!parts.length) return { first: sp.inDay, nights: Math.max(0, sp.days) }
  const free = freeNights(stays, sp)
  if (free.nights > 0) return free
  const last = parts[parts.length - 1]
  return { first: last.first, nights: last.nights }
}

/**
 * Picks a room of a place to stay. With nothing planned it takes the whole stop. With free nights left it takes
 * them, as a part that follows the stop. With none left it changes the room of the place's own part, or else
 * swaps the last part for it and keeps that part's nights.
 */
export function chooseRoom(stays: PlannedStay[], sp: ScheduledPlace, lodgingId: string, roomId: string): PlannedStay[] {
  if (!stays.length) return [{ lodging_id: lodgingId, room_id: roomId }]
  const last = stays[stays.length - 1]
  if (freeNights(stays, sp).nights > 0) {
    // the same room as the last part: that part takes the rest instead of a second part beside it
    if (last.lodging_id === lodgingId && last.room_id === roomId) return [...stays.slice(0, -1), { lodging_id: lodgingId, room_id: roomId }]
    return [...stays, { lodging_id: lodgingId, room_id: roomId }]
  }
  const own = stays.findIndex((s) => s.lodging_id === lodgingId)
  const k = own >= 0 ? own : stays.length - 1
  return stays.map((s, i) => (i === k ? { ...s, lodging_id: lodgingId, room_id: roomId } : s))
}

/**
 * One night more or less on part k. A night more comes from the free nights, or else from the part after it.
 * A night less goes to the part after it when that part follows the stop, else it becomes a free night.
 * The last part given every night that is left follows the stop again. A part keeps at least 1 night.
 */
export function stepNights(stays: PlannedStay[], sp: ScheduledPlace, k: number, by: 1 | -1): PlannedStay[] {
  const parts = stayParts(stays, sp)
  const part = parts[k]
  if (!part) return stays
  const want = part.nights + by
  if (want < 1) return stays
  const free = freeNights(stays, sp).nights
  const next = parts[k + 1]
  if (by > 0 && free <= 0 && !(next && next.nights > 1)) return stays
  const out = stays.map((s) => ({ ...s }))
  const isLast = k === stays.length - 1
  if (isLast && by > 0 && want >= part.nights + free) delete out[k].nights
  else out[k].nights = want
  // the night comes from the part after it when nothing is free
  if (by > 0 && free <= 0 && next && out[k + 1].nights != null) out[k + 1].nights = next.nights - 1
  return out
}

/** Can part k take one night more, or give one up. */
export function canStep(stays: PlannedStay[], sp: ScheduledPlace, k: number): { more: boolean; less: boolean } {
  const parts = stayParts(stays, sp)
  const part = parts[k]
  if (!part) return { more: false, less: false }
  const next = parts[k + 1]
  return { more: freeNights(stays, sp).nights > 0 || (!!next && next.nights > 1), less: part.nights > 1 }
}

/** Part k taken out. The parts after it move up to start sooner, as parts run in order from the first night. The nights that frees go to a last part with no nights of its own, else they become free at the end of the stop. */
export function removePart(stays: PlannedStay[], k: number): PlannedStay[] {
  return stays.filter((_, i) => i !== k)
}

/** The nights from one day to another, at least 1. */
export const nightsFrom = (checkIn: string, checkOut: string) => Math.max(1, Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 864e5))

/**
 * New dates to look at prices for. A check-in moved onto or past the check-out takes the check-out along and keeps
 * the nights, and a check-out moved onto or before the check-in becomes the day after it.
 */
export function pickDates(was: { checkIn: string; checkOut: string }, checkIn: string, checkOut: string): { checkIn: string; checkOut: string } {
  if (checkOut > checkIn) return { checkIn, checkOut }
  if (checkIn !== was.checkIn) return { checkIn, checkOut: addDays(checkIn, nightsFrom(was.checkIn, was.checkOut)) }
  return { checkIn, checkOut: addDays(checkIn, 1) }
}
