import type { Lodging, LodgingRoom } from '../data/types'
import { dayRange, kr } from './format'
import { safeUrl } from './lodgingLinks'
import { partDkk, priceFor, type StayPart } from './stays'

// What a place to stay's card and a stop's parts show, worked out apart from them so it can be tested: the photos
// that are left to show, and the price a part shows with what it is. A price quoted for other nights and scaled to
// the part's own nights is an estimate, and says so with the same mark as a price for other nights on a card.

/** The photos with an address the card may load that have not failed to. */
export function photosShown(photos: Lodging['photos'], broken: ReadonlySet<string>): Lodging['photos'] {
  return photos.filter((p) => safeUrl(p.url) && !broken.has(p.url))
}

/** A part's price: none known, the price for its very nights, or one for other nights scaled to its own. */
export type PartPrice =
  | { kind: 'none' }
  | { kind: 'exact'; total: number }
  | { kind: 'estimate'; total: number; nights: number; from: { total: number; check_in: string; check_out: string } }

export function partPrice(room: LodgingRoom | undefined, part: StayPart): PartPrice {
  const pr = room ? priceFor(room, part.first, part.nights) : null
  const total = partDkk(room, part)
  if (!pr || total == null) return { kind: 'none' }
  if (pr.exact) return { kind: 'exact', total }
  return { kind: 'estimate', total, nights: part.nights, from: { total: pr.total, check_in: pr.check_in, check_out: pr.check_out } }
}

const nightsWord = (n: number) => (n === 1 ? '1 night' : `${n} nights`)

/** A price for other nights in full, as its mark says it: what it was, for which dates. */
export function quotedLabel(total: number, check_in: string, check_out: string): string {
  return `${kr(total)} is the price for ${dayRange(check_in, check_out)}, not these nights`
}

/** The words of a part's price: the price as it shows, and for an estimate the whole of it for its mark. */
export function partPriceWords(p: PartPrice): { text: string; estimate: string | null } {
  if (p.kind === 'none') return { text: kr(null), estimate: null }
  if (p.kind === 'exact') return { text: kr(p.total), estimate: null }
  return {
    text: kr(p.total),
    estimate: `About ${kr(p.total)} for ${nightsWord(p.nights)}, worked out from ${kr(p.from.total)} for ${dayRange(p.from.check_in, p.from.check_out)}`,
  }
}
