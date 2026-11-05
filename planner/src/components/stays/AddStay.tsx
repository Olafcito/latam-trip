import { useEffect, useState, type ReactNode } from 'react'
import type { Lodging } from '../../data/types'
import { StaySearch, type StaySearchProps } from './StaySearch'

// The search and a place opened from it, as one window. On a wide window the place stands beside the list, which
// keeps working, and the window is as wide as the two need. On a narrow one the place is pushed over the list from
// the right and its back arrow slides it away again, the list as it was under it.

/** A screen this wide or wider shows the place beside the list. The window widens to hold both, so the choice is
 * made on the screen and not on the window, which is narrow until the place stands beside it. */
const SIDE = '(min-width: 800px)'

function useSide(): boolean {
  const [side, setSide] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(SIDE).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(SIDE)
    if (!mq) return
    const on = () => setSide(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return side
}

export function AddStay({ property, startId, ...search }: Omit<StaySearchProps, 'onOpen' | 'openId'> & {
  /** the place open from the start, when the window opens from one */
  startId?: string | null
  /** the place in full, with the way back to the list when it covers the list */
  property: (l: Lodging, back: (() => void) | null) => ReactNode
}) {
  const start = search.places.find((l) => l.id === startId) ?? null
  const [open, setOpen] = useState<Lodging | null>(start)
  // the place stays drawn while it slides out
  const [shown, setShown] = useState<Lodging | null>(start)
  const side = useSide()
  const go = (l: Lodging) => {
    setShown(l)
    setOpen(l)
  }
  // the place as the store has it now, so live rooms and prices that came in while it was open show at once
  const now = (l: Lodging | null) => (l ? search.places.find((x) => x.id === l.id) ?? l : null)
  // beside the list a place is always open, the first one until another is picked, as a mail app shows its first mail
  const here = now(open) ?? (side ? search.places[0] ?? null : null)
  const drawn = side ? here : now(shown)
  return (
    <div className="stad" data-open={here ? true : undefined} data-side={side || undefined}>
      <div className="stad-list" inert={open && !side ? true : undefined}>
        <StaySearch {...search} onOpen={go} openId={here?.id ?? null} />
      </div>
      <div className="stad-pane" onTransitionEnd={(e) => { if (e.target === e.currentTarget && !open) setShown(null) }}>
        {drawn && property(drawn, side ? null : () => setOpen(null))}
      </div>
    </div>
  )
}
