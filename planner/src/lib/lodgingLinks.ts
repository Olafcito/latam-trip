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

const words = (slug: string) =>
  slug.split(/[-_+\s]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

/**
 * The name of a place to stay as its Booking.com or Hostelworld address spells it, for the form to start from.
 * Booking.com keeps it in /hotel/<country>/<name>.<language>.html, Hostelworld after the place's number in
 * /hostels/p/<number>/<name>/ or in /hosteldetails.php/<name>/<city>/<number>. Any other address gives nothing.
 */
export function nameOfLink(url: string): string | null {
  let u: URL
  try {
    u = new URL(url.trim())
  } catch {
    return null
  }
  const site = siteOf(url)
  const parts = u.pathname.split('/').filter(Boolean).map((p) => decodeURIComponent(p))
  if (site === 'booking') {
    const at = parts.indexOf('hotel')
    const file = at >= 0 ? parts[parts.length - 1] : null
    if (!file || parts.length < at + 2 || !file.endsWith('.html')) return null
    return words(file.replace(/\.html$/, '').split('.')[0]) || null
  }
  if (site === 'hostelworld') {
    const php = parts.indexOf('hosteldetails.php')
    if (php >= 0 && parts[php + 1]) return words(parts[php + 1])
    const p = parts.indexOf('p')
    if (p >= 0 && /^\d+$/.test(parts[p + 1] ?? '') && parts[p + 2]) return words(parts[p + 2])
  }
  return null
}

export interface StaySearch { booking: string; hostelworld: string }

/** A search for somewhere to stay in the city on Booking.com and Hostelworld, on the nights when there are some. */
export function searchLinks(city: string, country: string | null, checkIn: string | null, checkOut: string | null): StaySearch {
  const where = country ? `${city}, ${country}` : city
  const dated = !!(checkIn && checkOut)
  const b = new URL('https://www.booking.com/searchresults.html')
  b.searchParams.set('ss', where)
  if (dated) {
    b.searchParams.set('checkin', checkIn!)
    b.searchParams.set('checkout', checkOut!)
  }
  b.searchParams.set('group_adults', '1')
  b.searchParams.set('no_rooms', '1')
  const h = new URL('https://www.hostelworld.com/search')
  h.searchParams.set('search_keywords', where)
  if (dated) {
    h.searchParams.set('date_from', checkIn!)
    h.searchParams.set('date_to', checkOut!)
  }
  h.searchParams.set('number_of_guests', '1')
  return { booking: b.toString(), hostelworld: h.toString() }
}
