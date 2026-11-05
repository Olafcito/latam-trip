import { useEffect, useState } from 'react'
import type { Lodging } from '../../data/types'
import { fetchRates, liveLink } from '../../lib/stayRates'

// Opening a place that has a Hostelworld link asks for its live rooms and prices for the dates (FEAT-002). The
// rows come back through the store, so this only says how the asking goes: off for a place without the link,
// asking while the call runs, done when it came back, failed with the reason. The stored prices show all along.

export type LiveRates = { state: 'off' | 'asking' | 'done' } | { state: 'failed'; message: string }

const OFF: LiveRates = { state: 'off' }
const ASKING: LiveRates = { state: 'asking' }
const DONE: LiveRates = { state: 'done' }

/**
 * Asks for the rates of a place and tells each step to onState: asking at once, then done or failed. Nothing
 * when it has no live link. The function it gives back stops the telling, for a pane that closed or changed.
 */
export function askLive(lodgingId: string, link: string | null, checkIn: string, checkOut: string, onState: (s: LiveRates) => void): () => void {
  if (!link) {
    onState(OFF)
    return () => {}
  }
  let on = true
  onState(ASKING)
  fetchRates(lodgingId, checkIn, checkOut).then(
    (r) => on && onState(r.ok ? DONE : { state: 'failed', message: r.message }),
    () => on && onState({ state: 'failed', message: 'Hostelworld could not be asked right now.' }),
  )
  return () => {
    on = false
  }
}

/** How the asking for a place's live rates goes, for these dates. Asks again when the place or the dates change. */
export function useLiveRates(lodging: Pick<Lodging, 'id' | 'links'>, checkIn: string, checkOut: string): LiveRates {
  const link = liveLink(lodging)
  const [live, setLive] = useState<LiveRates>(link ? ASKING : OFF)
  useEffect(() => askLive(lodging.id, link, checkIn, checkOut, setLive), [lodging.id, link, checkIn, checkOut])
  return live
}
