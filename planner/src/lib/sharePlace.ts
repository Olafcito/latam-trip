import type { Lodging } from '../data/types'
import { safeUrl } from './lodgingLinks'

// Sharing a place: its Hostelworld link when it has one, else its first link. The phone's own share sheet when the
// browser has one, else the link copied. A share the person cancels is neither.

export type Shared = 'shared' | 'copied' | 'cancelled' | 'failed'

/** The link a place is shared by, null when it has none to share. */
export function shareLink(l: Pick<Lodging, 'links'>): string | null {
  const hw = l.links.find((x) => x.site === 'hostelworld' && safeUrl(x.url))
  return safeUrl(hw?.url) ?? l.links.map((x) => safeUrl(x.url)).find(Boolean) ?? null
}

export async function sharePlace(name: string, url: string): Promise<Shared> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: name, url })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // a share sheet that would not open: the link is copied instead
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    return 'failed'
  }
}
