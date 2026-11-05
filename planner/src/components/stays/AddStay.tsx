import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Lodging } from '../../data/types'
import { StaySearch, type StaySearchProps } from './StaySearch'

// The search and a place opened from it, as one window. On a wide window the place stands beside the list, which
// keeps working. On a narrow one the place is pushed over the list from the right and its back arrow slides it
// away again, the list as it was under it.

/** At this width and up the place stands beside the list. The same number is in acc.css. */
const SIDE = 720

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
  const [side, setSide] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setSide(el.clientWidth >= SIDE))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const go = (l: Lodging) => {
    setShown(l)
    setOpen(l)
  }
  // beside the list a place is always open, the first one until another is picked, as a mail app shows its first mail
  const here = open ?? (side ? search.places[0] ?? null : null)
  const drawn = side ? here : shown
  return (
    <div ref={box} className="ad" data-open={here ? true : undefined} data-side={side || undefined}>
      <div className="ad-list" inert={open && !side ? true : undefined}>
        <StaySearch {...search} onOpen={go} openId={here?.id ?? null} />
      </div>
      <div className="ad-place" onTransitionEnd={(e) => { if (e.target === e.currentTarget && !open) setShown(null) }}>
        {drawn && property(drawn, side ? null : () => setOpen(null))}
      </div>
    </div>
  )
}
