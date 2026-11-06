// The site a link to a place to stay is on, read from its host. A link is Booking.com, Hostelworld or Airbnb
// when its host is that site or a sub domain of it, any country of Airbnb too. Anything else is the place's own site.

export type LinkSite = 'booking' | 'hostelworld' | 'airbnb' | 'own'

const host = (url: string) => {
  try {
    return new URL(url.trim()).hostname.toLowerCase()
  } catch {
    return ''
  }
}

/** true when the host is the domain or a sub domain of it */
const on = (h: string, domain: string) => h === domain || h.endsWith(`.${domain}`)

export function siteOf(url: string): LinkSite {
  const h = host(url)
  if (!h) return 'own'
  if (on(h, 'booking.com')) return 'booking'
  if (on(h, 'hostelworld.com')) return 'hostelworld'
  // airbnb.com, airbnb.dk, airbnb.co.uk and the like
  if (/(^|\.)airbnb\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/.test(h)) return 'airbnb'
  return 'own'
}

/**
 * A web address a place to stay may link to or load: https with a host, read by the browser's own parser.
 * Anything else gives nothing: plain http, a bare "https://", an address with spaces in it, a javascript: one.
 */
export function safeUrl(u: string | null | undefined): string | null {
  const t = (u ?? '').trim()
  if (!t || /\s/.test(t)) return null
  try {
    const url = new URL(t)
    return url.protocol === 'https:' && url.hostname ? t : null
  } catch {
    return null
  }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * A link to a place to stay opened on the nights and guests: Hostelworld's from, to and guests on its pwa page,
 * Booking.com's checkin, checkout and adults, Airbnb's check_in, check_out and adults. The place's own site, a link
 * that is not https, and dates that are not two days in order give the link as it was.
 */
export function datedLink(url: string | null | undefined, checkIn: string | null | undefined, checkOut: string | null | undefined, guests = 1): string | null {
  const safe = safeUrl(url)
  if (!safe || !checkIn || !checkOut || !DAY.test(checkIn) || !DAY.test(checkOut) || checkOut <= checkIn) return safe
  const n = String(Math.max(1, Math.round(guests) || 1))
  const u = new URL(safe)
  const set = (pairs: Record<string, string>) => Object.entries(pairs).forEach(([k, v]) => u.searchParams.set(k, v))
  const site = siteOf(safe)
  if (site === 'hostelworld') {
    if (u.pathname.startsWith('/hosteldetails.php/')) u.pathname = `/pwa${u.pathname}`
    set({ from: checkIn, to: checkOut, guests: n, origin: 'microsite' })
  } else if (site === 'booking') {
    set({ checkin: checkIn, checkout: checkOut, group_adults: n, no_rooms: '1', group_children: '0' })
  } else if (site === 'airbnb') {
    set({ check_in: checkIn, check_out: checkOut, adults: n })
  } else return safe
  return u.toString()
}
