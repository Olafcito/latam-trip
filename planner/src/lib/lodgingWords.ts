import type { LodgingKind, LodgingSite, LodgingTag } from '../data/types'

// The words for a place to stay's kind, tags and link sites, the same on its card and in the form that adds it.

/** The kinds in the order the form offers them. */
export const KINDS: [LodgingKind, string][] = [['hostel', 'Hostel'], ['hotel', 'Hotel'], ['guesthouse', 'Guesthouse'], ['apartment', 'Apartment'], ['other', 'Other']]
export const KIND: Record<LodgingKind, string> = Object.fromEntries(KINDS) as Record<LodgingKind, string>

/** The tags in the order the form offers them. */
export const TAGS: [LodgingTag, string][] = [['beach', 'Beach'], ['pool', 'Pool'], ['social', 'Social'], ['quiet', 'Quiet'], ['kitchen', 'Kitchen'], ['breakfast', 'Breakfast'], ['aircon', 'Air con'], ['workspace', 'Workspace']]
export const TAG: Record<LodgingTag, string> = Object.fromEntries(TAGS) as Record<LodgingTag, string>

export const SITE: Record<LodgingSite, string> = { booking: 'Booking.com', hostelworld: 'Hostelworld', airbnb: 'Airbnb', own: 'Own site', other: 'Link' }

/** The name of a link: the site, or for any other the host of its address. */
export function linkName(site: LodgingSite, url: string): string {
  if (site !== 'other') return SITE[site]
  try {
    return new URL(url).hostname.replace(/^www\./, '') || SITE.other
  } catch {
    return SITE.other
  }
}
