import { useState } from 'react'
import type { LodgingKind } from '../../data/types'
import { isTileLogo } from '../../lib/purchase'
import type { Amenity } from '../../lib/stayOffer'
import type { StayMoney } from '../../lib/stayBooking'
import { House } from '../icons'

// What a stay card shows of where Simon sleeps at a stop, and the provider's mark. EditorialStayCard draws the card
// and StayDetails the stay on its own.

/** Where the room was found or booked: its mark and the page the room name opens. */
export interface StayProvider {
  name: string
  /** the logo's address, null to draw a plain mark */
  logo: string | null
  /** https only, null when there is no page to open */
  url: string | null
}

export interface StayCardData {
  key: string
  name: string
  /** the kind of place and its word, "Hostel", null for a place of no kind */
  kind: { key: LodgingKind; word: string } | null
  /** the street address, null when the place has none */
  address: string | null
  /** "San Andrés, Colombia" */
  town: string
  /** https photos, the first is the one on the card */
  photos: string[]
  amenities: Amenity[]
  /** "Free cancellation until Tue 8 Dec", only when the stay cancels for free */
  freeCancel: string | null
  /** the stay's own dates, null when the stop has no nights left for it */
  checkIn: string | null
  checkOut: string | null
  nights: number
  room: string | null
  provider: StayProvider | null
  money: StayMoney
  /** the currency of the money, DKK unless only a foreign price is known */
  currency: string
  booked: boolean
  /** the confirmation files attached */
  files: number
  /** the confirmation mail in Gmail, https only */
  mailUrl: string | null
  /** why the stay no longer fits the stop, when it does not */
  warn?: string | null
  onOpen: () => void
  /** add a booking confirmation, on a planned stay */
  onConfirm?: () => void
  /** open the place to choose a room, when none is chosen */
  onRoom?: () => void
}

/** The provider's logo on a small light square, or a plain mark when it has none. */
export function ProviderMark({ p, size }: { p: StayProvider; size?: 'large' }) {
  const [broken, setBroken] = useState(false)
  return (
    <span className="ac-logo" data-size={size} data-plain={!p.logo || broken || undefined} data-tile={(!broken && isTileLogo(p.logo)) || undefined} role="img" aria-label={p.name} title={p.name}>
      {p.logo && !broken ? <img src={p.logo} alt="" onError={() => setBroken(true)} /> : <House s={size ? 18 : 12} />}
    </span>
  )
}
