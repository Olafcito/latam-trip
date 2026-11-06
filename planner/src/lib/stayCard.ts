import type { Booking, Lodging, LodgingPrice, LodgingRoom, LodgingSite } from '../data/types'
import { datedLink } from './lodgingLinks'
import { SITE } from './lodgingWords'
import { safeLink, sellerLogo } from './purchase'
import { cancelWords, type StayMoney } from './stayBooking'

// What a stay card shows that is worked out from the rows: where the room was found and the page it opens, whether
// it cancels for free, and what a booked stay cost in the currency that is known.

export interface CardProvider {
  name: string
  logo: string | null
  url: string | null
}

const LOGO: Partial<Record<LodgingSite, string>> = { booking: 'booking', hostelworld: 'hostelworld', airbnb: 'airbnb' }

/**
 * Where the room was booked, else where its price was seen, else the room's site, else the place's first link.
 * The room name opens the place's link on that site on the stay's nights, else the booking's page, else nothing.
 * Null when no provider and no page is known.
 */
export function cardProvider(l: Pick<Lodging, 'name' | 'links'> | undefined, b: Pick<Booking, 'provider' | 'seller' | 'seller_url' | 'url'> | null, terms: Pick<LodgingPrice, 'site'> | null, room?: Pick<LodgingRoom, 'site'>, nights?: { checkIn: string | null; checkOut: string | null }): CardProvider | null {
  const site: LodgingSite | null = b?.provider ?? terms?.site ?? room?.site ?? l?.links[0]?.site ?? null
  const link = site ? l?.links.find((k) => k.site === site)?.url : undefined
  const url = datedLink(link, nights?.checkIn, nights?.checkOut) ?? safeLink(link) ?? (site === 'other' ? safeLink(b?.seller_url) : null) ?? safeLink(b?.url)
  if (!site) return url ? { name: b?.seller?.trim() || 'Booking page', logo: sellerLogo(b?.seller), url } : null
  const other = site === 'other' ? b?.seller?.trim() || null : null
  const name = other ?? (site === 'own' ? l?.name ?? SITE.own : SITE[site])
  const logo = LOGO[site] ? sellerLogo(LOGO[site]) : other ? sellerLogo(other) : null
  return { name, logo, url }
}

/** "Free cancellation until Tue 8 Dec" when the stay cancels for free, else null. Partly and non-refundable give nothing. */
export function freeCancel(refundable: LodgingPrice['refundable'] | Booking['refundable'] | undefined, until: string | null | undefined): string | null {
  if (refundable === 'no' || refundable === 'partly') return null
  return refundable === 'yes' || until ? cancelWords('yes', until) : null
}

/**
 * What a booked stay cost: the kroner paid when known, else the booking's own price in its currency, never a made
 * up conversion. Nothing known gives no figure.
 */
export function bookedMoney(b: Pick<Booking, 'price' | 'currency'>, paidDkk: number | null, nights: number): { money: StayMoney; currency: string } {
  const n = Math.max(1, nights)
  if (paidDkk != null) return { money: { perNight: Math.round(paidDkk / n), total: paidDkk, exact: true }, currency: 'DKK' }
  const cur = b.currency?.trim().toUpperCase()
  if (b.price != null && Number.isFinite(b.price) && b.price > 0 && cur) return { money: { perNight: Math.round(b.price / n), total: b.price, exact: true }, currency: cur }
  return { money: { perNight: null, total: null, exact: true }, currency: 'DKK' }
}
