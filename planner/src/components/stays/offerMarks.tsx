import type { ReactElement } from 'react'
import type { Lodging, LodgingKind } from '../../data/types'
import { dec1, kr, thousands } from '../../lib/format'
import { KIND } from '../../lib/lodgingWords'
import { otherDates, type Amenity, type Nightly } from '../../lib/stayOffer'
import { AirCon, Bed, Building, Bunk, Cup, Glass, House, Pot, Quiet, Star, Umbrella, Wave, Wifi } from '../icons'

// The small pieces the accommodation panes share: the icon of a kind of place and of what it offers, its
// rating as a star and a figure, and a price per night that is muted when it is for other dates.

const AMENITY: Record<Amenity['key'], (p: { s?: number }) => ReactElement> = {
  rooms: Bed, beach: Umbrella, pool: Wave, social: Glass, quiet: Quiet, kitchen: Pot, breakfast: Cup, aircon: AirCon, workspace: Wifi,
}

export function AmenityIcon({ k, s = 14 }: { k: Amenity['key']; s?: number }) {
  const Icon = AMENITY[k]
  return <Icon s={s} />
}

const KIND_ICON: Record<LodgingKind, ((p: { s?: number }) => ReactElement) | null> = {
  hostel: Bunk, hotel: Bed, guesthouse: House, apartment: Building, other: null,
}

export function KindIcon({ kind, s = 14 }: { kind: LodgingKind; s?: number }) {
  const Icon = KIND_ICON[kind]
  return Icon ? <Icon s={s} /> : null
}

/** "8,9 (1.243)" after a filled star, or "8,9 (1.243 reviews)" in full. Nothing without a rating. */
export function Rating({ l, full }: { l: Pick<Lodging, 'rating' | 'reviews' | 'rating_source'>; full?: boolean }) {
  if (l.rating == null) return null
  const count = l.reviews ? ` (${thousands(l.reviews)}${full ? ' reviews' : ''})` : ''
  const label = [`Rated ${dec1(l.rating)} of 10`, l.reviews ? `from ${thousands(l.reviews)} reviews` : '', l.rating_source ? `on ${l.rating_source}` : ''].filter(Boolean).join(' ')
  return (
    <span className="ao-rate" role="img" aria-label={label} title={l.rating_source ? `On ${l.rating_source}` : undefined}>
      <Star s={full ? 15 : 12} />
      <b aria-hidden="true">{dec1(l.rating)}</b>
      {count && <span aria-hidden="true">{count}</span>}
    </span>
  )
}

/** The kind as a word, "Hostel". Empty for other. */
export const kindWord = (k: LodgingKind) => (k === 'other' ? '' : KIND[k])

/** A price per night: bold for these dates, muted for others with the dates in its title. Nothing when none is known. */
export function NightPrice({ p, className, stale }: { p: Nightly | null; className: string; stale?: boolean }) {
  if (!p) return null
  return (
    <b className={className} data-other={!p.exact || undefined} data-stale={stale || undefined} title={p.exact ? undefined : otherDates(p)} aria-label={p.exact ? undefined : `About ${kr(p.dkk)} per night, ${otherDates(p).toLowerCase()}`}>
      {kr(p.dkk)}
    </b>
  )
}
