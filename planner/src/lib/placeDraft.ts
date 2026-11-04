import type { LodgingKind, LodgingTag } from '../data/types'
import { readKr } from './bookingDraft'
import { dayDiff } from './format'
import { addDays } from './time'
import { nameOfLink, safeUrl, siteOf } from './lodgingLinks'
import { draftProblem, type LodgingDraft } from './lodgings'

// The form that adds a place to stay by hand, read into the draft the connector would write, or into what is wrong
// with it said the way the form shows it. The form asks what a hostel page shows at a glance: the link, the name,
// the price per night and the dates. The place gets one room, named after its kind unless Details names it, so it
// can be chosen for the stop straight away. A price keeps its price per night and its total for the dates, and the
// site and link it came from. The area is the place's address.

export interface PlaceForm {
  link: string
  name: string
  kind: LodgingKind
  perNight: string
  check_in: string
  check_out: string
  area: string
  room: string
  beds: string
  own: '' | 'own' | 'shared'
  bath: '' | 'private' | 'shared'
  photos: string[]
  tags: LodgingTag[]
  notes: string
}

const ROOM: Record<LodgingKind, string> = { hostel: 'Dorm bed', hotel: 'Room', guesthouse: 'Room', apartment: 'Apartment', other: 'Room' }

/** The room of a place added by hand when Details gives it no name. */
export const roomName = (kind: LodgingKind) => ROOM[kind]

/** The nights between the dates and what they cost at the price per night, or nothing when either is missing. */
export function quickTotal(perNight: string, checkIn: string, checkOut: string): { nights: number; total: number } | null {
  const n = readKr(perNight)
  if (n == null || Number.isNaN(n) || !checkIn || !checkOut) return null
  const nights = dayDiff(checkIn, checkOut)
  return nights > 0 ? { nights, total: Math.round(n * nights) } : null
}

export function placeDraft(place: string, f: PlaceForm): LodgingDraft | string {
  const link = f.link.trim()
  if (link && !safeUrl(link)) return 'A link starts with https://.'
  const ps = f.photos.map((u) => u.trim()).filter(Boolean)
  if (ps.some((u) => !safeUrl(u))) return 'A photo address starts with https://.'
  const beds = f.beds.trim() ? Number(f.beds) : null
  if (beds != null && !(Number.isInteger(beds) && beds >= 1)) return 'A room has at least 1 bed.'

  const prices: LodgingDraft['rooms'][number]['prices'] = []
  if (f.perNight.trim()) {
    const n = readKr(f.perNight)
    if (n == null || Number.isNaN(n)) return 'A price needs what it costs in kr.'
    if (!f.check_in || !f.check_out) return 'A price needs the day you check in and the day you check out.'
    const nights = dayDiff(f.check_in, f.check_out)
    if (nights < 1) return 'You check out after the day you check in.'
    prices.push({
      check_in: f.check_in, check_out: f.check_out, total_dkk: Math.round(n * nights), per_night_dkk: Math.round(n),
      site: link ? siteOf(link) : null, url: link || null, refundable: null, cancel_until: null,
    })
  }
  const room = { name: f.room.trim() || roomName(f.kind), beds, private: f.own === '' ? null : f.own === 'own', bathroom: f.bath || null, notes: null, prices }

  const d: LodgingDraft = {
    place_id: place, name: f.name.trim(), kind: f.kind, tags: f.tags, notes: f.notes.trim() || null, summary: null,
    photos: ps.map((url) => ({ url, caption: null })),
    links: link ? [{ site: siteOf(link), url: link }] : [],
    rating: null, reviews: null, rating_source: null, address: f.area.trim() || null, lat: null, lon: null, to_center_km: null, to_beach_km: null,
    added_by: 'simon', rooms: [room],
  }
  return draftProblem(d) ?? d
}

/** The form as it opens: a hostel on the nights from first, or with no dates off a stop. */
export function blankForm(first: string | null | undefined, nights: number): PlaceForm {
  const from = first ?? ''
  return {
    link: '', name: '', kind: 'hostel', perNight: '', check_in: from, check_out: from && nights > 0 ? addDays(from, nights) : '', area: '',
    room: '', beds: '', own: '', bath: '', photos: [], tags: [], notes: '',
  }
}

/** The form with a new link. Its address names the place when the name is empty or was read from the last link. */
export function withLink(f: PlaceForm, link: string): PlaceForm {
  const read = nameOfLink(link)
  const auto = !f.name.trim() || f.name === (nameOfLink(f.link) ?? '')
  return { ...f, link, name: read && auto ? read : f.name }
}
