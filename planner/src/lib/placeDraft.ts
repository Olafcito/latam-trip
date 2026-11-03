import type { LodgingKind, LodgingTag } from '../data/types'
import { readKr } from './bookingDraft'
import { safeUrl, siteOf } from './lodgingLinks'
import { draftProblem, type LodgingDraft } from './lodgings'

// The form that adds a place to stay by hand, read into the draft the connector would write, or into what is wrong
// with it said the way the form shows it. A price is what it costs for its dates, so a price row with no total says
// nothing and is left out, even with the stop's dates already in it.

export interface PriceForm { key: string; check_in: string; check_out: string; total: string }
export interface RoomForm { key: string; name: string; beds: string; own: '' | 'own' | 'shared'; bath: '' | 'private' | 'shared'; prices: PriceForm[] }
export interface PlaceForm {
  name: string
  kind: LodgingKind
  links: string[]
  photos: string[]
  rooms: RoomForm[]
  tags: LodgingTag[]
  notes: string
}

export function placeDraft(place: string, f: PlaceForm): LodgingDraft | string {
  const ls = f.links.map((u) => u.trim()).filter(Boolean)
  if (ls.some((u) => !safeUrl(u))) return 'A link starts with https://.'
  const ps = f.photos.map((u) => u.trim()).filter(Boolean)
  if (ps.some((u) => !safeUrl(u))) return 'A photo address starts with https://.'
  const rooms: LodgingDraft['rooms'] = []
  for (const r of f.rooms) {
    const beds = r.beds.trim() ? Number(r.beds) : null
    if (beds != null && !(Number.isInteger(beds) && beds >= 1)) return 'A room has at least 1 bed.'
    const prices: LodgingDraft['rooms'][number]['prices'] = []
    for (const p of r.prices) {
      if (!p.total.trim()) continue
      const total = readKr(p.total)
      if (total == null || Number.isNaN(total)) return 'A price needs what it costs in kr.'
      if (!p.check_in || !p.check_out) return 'A price needs the day you check in and the day you check out.'
      prices.push({ check_in: p.check_in, check_out: p.check_out, total_dkk: Math.round(total), per_night_dkk: null, site: null, url: null, refundable: null, cancel_until: null })
    }
    rooms.push({ name: r.name.trim(), beds, private: r.own === '' ? null : r.own === 'own', bathroom: r.bath || null, notes: null, prices })
  }
  const d: LodgingDraft = {
    place_id: place, name: f.name.trim(), kind: f.kind, tags: f.tags, notes: f.notes.trim() || null, summary: null,
    photos: ps.map((url) => ({ url, caption: null })),
    links: ls.map((url) => ({ site: siteOf(url), url })),
    rating: null, reviews: null, rating_source: null, address: null, lat: null, lon: null, to_center_km: null, to_beach_km: null,
    added_by: 'simon', rooms,
  }
  return draftProblem(d) ?? d
}
