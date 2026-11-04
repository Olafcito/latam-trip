/** Carrier names as the crawl and the research wrote them, folded so each airline reads once. */

const SUFFIX = /\s+(airlines?|airways)$/i
// a fare site notice the crawl caught in the carrier field, not an airline
const NOTICE = /^service mellem /i

const keyOf = (name: string) => name.toLowerCase().replace(SUFFIX, '').replace(/\s+/g, ' ').trim()

// lower is better: a proper mixed case name without the Airlines suffix wins
function cost(name: string): number {
  let c = 0
  if (name === name.toLowerCase()) c += 4
  if (name.length > 3 && name === name.toUpperCase()) c += 1
  if (SUFFIX.test(name)) c += 2
  return c
}

const capital = (name: string) => (name === name.toLowerCase() ? name.replace(/\b\w/g, (ch) => ch.toUpperCase()) : name)

export function cleanCarriers(names: string[]): string[] {
  const best = new Map<string, string>()
  for (const raw of names) {
    const name = raw.replace(/\s+/g, ' ').trim()
    if (!name || NOTICE.test(name)) continue
    const k = keyOf(name)
    const had = best.get(k)
    if (had == null || cost(name) < cost(had)) best.set(k, name)
  }
  return [...best.values()].map(capital)
}

/** True when two name lists hold the same airlines once folded, so the second adds nothing. */
export function sameNames(a: string[], b: string[]): boolean {
  const x = new Set(cleanCarriers(a).map(keyOf))
  const y = new Set(cleanCarriers(b).map(keyOf))
  return x.size === y.size && [...x].every((k) => y.has(k))
}
