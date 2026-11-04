import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Flag, hasFlag } from '@map/map/Flag'
import { dayRange } from '../../lib/format'
import { Moon } from '../icons'
import { LegGlyph } from './legGlyph'
import { nightWord } from './routeView'
import { spanAt, spread, timeline, type Segment } from './tripBar'

// The itinerary laid over the foot of the trip map: one track from the first day to the last, each
// country as long as its days, a pass through a tick on its boundary. Over every boundary sits the leg
// that crosses it, the way out at the start and the way home at the end, filled once booked. Months
// run under it and today is a red needle. Hover shows a country, a tap or Enter chooses it, a second tap
// or Escape lets go, a drag scrubs along the trip and the arrows step. Over the track the country you
// look at reads as chips.

interface Props {
  bar: Segment[]
  chosen: string | null
  /** the country under the pointer, it shows without being chosen */
  shown: string | null
  onChoose: (key: string | null) => void
  onPreview: (key: string | null) => void
  /** today's date, its needle shows while the trip is on */
  today?: string | null
  /** the way home is booked */
  homeBooked?: boolean
}

/** Glyphs closer than this many px step apart. */
const GLYPH = 22
/** A drag further than this many px scrubs instead of tapping. */
const SCRUB = 6

export function ItineraryBar({ bar, chosen, shown, onChoose, onPreview, today = null, homeBooked = false }: Props) {
  const track = useRef<HTMLDivElement>(null)
  const press = useRef<{ x: number; moved: boolean } | null>(null)
  const [wide, setWide] = useState(0)
  const line = useMemo(() => timeline(bar, { today, homeBooked }), [bar, today, homeBooked])
  const at = bar.find((s) => s.key === (shown ?? chosen))
  const days = at?.first && at.last ? dayRange(at.first, at.last) : null

  useLayoutEffect(() => {
    const t = track.current
    if (!t) return
    const seen = new ResizeObserver(() => setWide(t.clientWidth))
    seen.observe(t)
    setWide(t.clientWidth)
    return () => seen.disconnect()
  }, [])

  // without a size yet the glyphs sit on their boundaries, once measured they step apart where they touch
  const glyphs = wide ? spread(line.legs.map((l) => l.at * wide), GLYPH, GLYPH / 2, wide - GLYPH / 2) : null
  const pos = (i: number) => (glyphs ? `${glyphs[i]}px` : `${line.legs[i].at * 100}%`)

  const under = (e: PointerEvent) => {
    const r = track.current!.getBoundingClientRect()
    return spanAt(line.spans, (e.clientX - r.left) / Math.max(r.width, 1), 10 / Math.max(r.width, 1))
  }
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    press.current = { x: e.clientX, moved: false }
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current
    if (!p) { if (e.pointerType === 'mouse') onPreview(under(e)); return }
    if (!p.moved && Math.abs(e.clientX - p.x) < SCRUB) return
    if (!p.moved) { p.moved = true; e.currentTarget.setPointerCapture(e.pointerId) }
    const k = under(e)
    if (k && k !== chosen) { onPreview(null); onChoose(k) }
  }
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current
    press.current = null
    if (!p || p.moved) return
    const k = under(e)
    onPreview(null)
    onChoose(k === chosen ? null : k)
  }

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
    track.current?.querySelector<HTMLButtonElement>(`[data-key="${next.key}"]`)?.focus()
  }

  return (
    <div className="rs-bar">
      <div className="rs-read" aria-live="polite">
        {at && (
          <>
            <span className="rs-chip rs-chip-name">
              {hasFlag(at.code) && <span className="rs-chip-flag"><Flag code={at.code} size={14} /></span>}
              <b>{at.name}</b>
            </span>
            <span className="rs-chip">{!at.passing && <Moon />}{at.passing ? nightWord(0) : at.nights}</span>
            {days && <span className="rs-chip">{days}</span>}
          </>
        )}
      </div>
      <div className="rs-tl">
        <div className="rs-glyphs" aria-hidden>
          {line.legs.map((l, i) => (
            <span key={i} className="rs-mode" data-f={l.mode} data-booked={l.booked || undefined} style={{ left: pos(i) }}>
              <LegGlyph mode={l.mode} s={12} />
            </span>
          ))}
        </div>
        <div
          ref={track}
          className="rs-track"
          role="group"
          aria-label="Countries in order"
          onKeyDown={step}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => { press.current = null }}
          onPointerLeave={() => { if (!press.current) onPreview(null) }}
        >
          {line.months.filter((m) => m.line).map((m) => (
            <span key={m.name + m.at} className="rs-month-line" style={{ left: `${m.at * 100}%` }} />
          ))}
          {bar.map((s, i) => {
            const sp = line.spans[i]
            return (
              <button
                key={s.key}
                type="button"
                data-key={s.key}
                className="rs-seg"
                data-passing={s.passing || undefined}
                aria-pressed={s.key === chosen}
                aria-label={`${s.name}, ${s.passing ? 'passing through' : nightWord(s.nights)}`}
                style={s.passing ? { left: `${sp.x0 * 100}%` } : { left: `${sp.x0 * 100}%`, width: `${(sp.x1 - sp.x0) * 100}%` }}
                onClick={() => onChoose(s.key === chosen ? null : s.key)}
              >
                {hasFlag(s.code) ? <span className="rs-seg-flag"><Flag code={s.code} size={s.passing ? 10 : 12} /></span> : <span className="rs-seg-code">{s.code}</span>}
                {!s.passing && <span className="rs-seg-n">{s.nights}</span>}
              </button>
            )
          })}
          {line.today != null && <span className="rs-today" style={{ left: `${line.today * 100}%` }} />}
        </div>
        <div className="rs-months" aria-hidden>
          {line.months.filter((m) => m.at < 0.93).map((m) => (
            <span key={m.name + m.at} style={{ left: `${m.at * 100}%` }}>{m.name}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
