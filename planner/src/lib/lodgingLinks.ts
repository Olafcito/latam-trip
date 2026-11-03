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
