import { useEffect, useRef, type KeyboardEvent } from 'react'
import { Flag, hasFlag } from '@map/map/Flag'
import { dayRange } from '../../lib/format'
import { Boat, Bus, Plane } from '../icons'
import type { Segment } from './tripBar'

// The itinerary laid over the foot of the trip map, a segment per country as wide as its nights. Each
// carries how you got there, its flag and its nights. Hover shows a country, a tap or Enter chooses it,
// a second tap or Escape lets go and the arrows step along the trip. Above the bar the country you look
// at says its name and days, with nothing chosen it says what a tap does.

interface Props {
  bar: Segment[]
  chosen: string | null
  /** the country under the pointer, it shows without being chosen */
  shown: string | null
  onChoose: (key: string | null) => void
  onPreview: (key: string | null) => void
}

function Mode({ s }: { s: Segment }) {
  return (
    <span className="rs-mode" data-f={s.mode} data-booked={s.booked || undefined} aria-hidden>
      {s.mode === 'flight' ? <Plane s={11} /> : s.mode === 'boat' ? <Boat s={11} /> : <Bus s={11} />}
    </span>
  )
}

export function ItineraryBar({ bar, chosen, shown, onChoose, onPreview }: Props) {
  const list = useRef<HTMLDivElement>(null)
  const at = bar.find((s) => s.key === (shown ?? chosen))
  const days = at?.first && at.last ? dayRange(at.first, at.last) : null

  // a long trip scrolls, so the chosen country is brought into the bar
  useEffect(() => {
    if (chosen) list.current?.querySelector(`[data-key="${chosen}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [chosen])

  const step = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      if (!chosen) return
      // lets the country go before the window would close
      e.preventDefault()
      e.stopPropagation()
      onChoose(null)
      return
    }
    const by = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!by) return
    e.preventDefault()
    const now = bar.findIndex((s) => s.key === chosen)
    const next = bar[Math.min(bar.length - 1, Math.max(0, now < 0 ? (by > 0 ? 0 : bar.length - 1) : now + by))]
    onChoose(next.key)
    list.current?.querySelector<HTMLButtonElement>(`[data-key="${next.key}"]`)?.focus()
  }

  return (
    <div className="rs-bar">
      <p className="rs-read" aria-live="polite">
        {at
          ? <><b>{at.name}</b>{days && <span>{days}</span>}</>
          : <span>Tap a flag to open its country</span>}
      </p>
      <div ref={list} className="rs-segs" role="group" aria-label="Countries in order" onKeyDown={step} onPointerLeave={() => onPreview(null)}>
        {bar.map((s) => (
          <button
            key={s.key}
            type="button"
            data-key={s.key}
            className="rs-seg"
            data-passing={s.passing || undefined}
            aria-pressed={s.key === chosen}
            aria-label={`${s.name}, ${s.passing ? 'passing through' : `${s.nights} ${s.nights === 1 ? 'night' : 'nights'}`}`}
            style={{ flexGrow: s.passing ? 0 : s.share }}
            onPointerEnter={(e) => { if (e.pointerType === 'mouse') onPreview(s.key) }}
            onClick={() => onChoose(s.key === chosen ? null : s.key)}
          >
            <Mode s={s} />
            {hasFlag(s.code) ? <span className="rs-seg-flag"><Flag code={s.code} size={12} /></span> : <span className="rs-seg-code">{s.code}</span>}
            {!s.passing && <span className="rs-seg-n">{s.nights}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
