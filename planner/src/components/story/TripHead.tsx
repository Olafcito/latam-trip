import { useState, type CSSProperties } from 'react'
import type { MapNode } from '../../data/types'
import { day, kr } from '../../lib/format'

// The trip at a glance above the rail, after the 21st Hover Expand Gallery: its places as narrow
// panels with their names, the one under the mouse or the keys opens to its photo. Under the strip
// one line with the dates, the nights, the places and what it all costs. A click goes to the place
// on the rail. On a phone the places are a row to swipe instead.

export interface HeadPlace { name: string; node: MapNode | undefined; days: number; inDay: string }

const nightsOf = (n: number) => `${n} ${n === 1 ? 'night' : 'nights'}`

export function TripHead({ places, from, to, total, partial }: {
  places: HeadPlace[]
  /** local times the way in leaves Copenhagen and the way home lands there */
  from: string
  to: string
  total: number
  /** some ground legs have no price yet, so the total is short of them */
  partial: boolean
}) {
  const [open, setOpen] = useState(0)
  const nights = places.reduce((a, p) => a + p.days, 0)
  const go = (i: number) => {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(`st-${i}`)?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' })
  }
  return (
    <header className="tg">
      <ul className="tg-strip" style={{ '--n': places.length } as CSSProperties}>
        {places.map((p, i) => {
          const img = p.node?.profile?.image?.url
          return (
            <li key={i} className="tg-p" data-open={i === open || undefined}>
              <button
                type="button"
                aria-label={`${p.name}, ${nightsOf(p.days)} from ${day(p.inDay)}. Go to it on the route`}
                onPointerEnter={(e) => { if (e.pointerType === 'mouse') setOpen(i) }}
                onFocus={() => setOpen(i)}
                onClick={() => { setOpen(i); go(i) }}
              >
                {img && <img src={img} alt="" loading="lazy" decoding="async" draggable={false} />}
                <span className="tg-name">{p.name.replace(/\s*\(.*\)$/, '')}</span>
                <span className="tg-meta">{nightsOf(p.days)}<span className="tg-from">, from {day(p.inDay)}</span></span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="tg-sum">
        <b>{day(from)}</b> to <b>{day(to)}</b>, {nightsOf(nights)} in {places.length} {places.length === 1 ? 'place' : 'places'},{' '}
        <b>{kr(total)}</b> all in{partial && <span className="tg-part">, ground not priced yet</span>}
      </p>
    </header>
  )
}
