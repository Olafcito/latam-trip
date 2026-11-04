import { useEffect, useId, useRef, useState, type FocusEvent, type MouseEvent, type PointerEvent } from 'react'
import type { Meta } from '../data/types'
import { STALE_DAYS, ageLabel, ageWords, checkedLabel, freshness } from '../lib/freshness'
import { Warn } from './icons'

// A hover opens after a beat, so passing the mouse over the header does not flash it open,
// and closes after a beat, so the pointer can travel from the button into the popover.
const OPEN_DELAY = 120
const CLOSE_DELAY = 160

/** The freshness warning. Nothing renders when every tracked type was checked within
 *  STALE_DAYS: this is only for when something needs attention. When it shows, it is an icon
 *  and the stalest type in plain words. Hover, focus or a tap opens a popover with every
 *  type and its last check. */
export function Freshness({ meta }: { meta: Meta | null }) {
  const [open, setOpen] = useState(false)
  // a keyboard open shows at once, a pointer open scales in
  const [via, setVia] = useState<'key' | 'pointer'>('pointer')
  const [now, setNow] = useState(() => Date.now())
  const wrap = useRef<HTMLDivElement>(null)
  const pointer = useRef<string>('mouse')
  const pinned = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  const id = useId()

  const list = freshness(meta, now)
  const stale = list.filter((f) => f.stale)

  const show = (how: 'key' | 'pointer') => {
    window.clearTimeout(timer.current)
    setNow(Date.now())
    setVia(how)
    setOpen(true)
  }
  const hide = () => {
    window.clearTimeout(timer.current)
    pinned.current = false
    setOpen(false)
  }

  // while open: Escape and a press anywhere else close it
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide()
    }
    const onDown = (e: globalThis.PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) hide()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  if (!stale.length) return null

  const worst = stale.reduce((a, b) => ((b.ageDays ?? 0) > (a.ageDays ?? 0) ? b : a))
  const label = `${worst.type} checked ${ageWords(worst.ageDays)}`

  const onEnter = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    window.clearTimeout(timer.current)
    if (!open) timer.current = window.setTimeout(() => show('pointer'), OPEN_DELAY)
  }
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || pinned.current) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(hide, CLOSE_DELAY)
  }
  const onClick = (e: MouseEvent) => {
    // detail 0 is Enter or Space: toggle at once
    if (e.detail === 0) return open ? hide() : show('key')
    // a mouse click pins what the hover opened, a second click lets go
    if (pointer.current === 'mouse') {
      if (open && pinned.current) return hide()
      pinned.current = true
      return show('pointer')
    }
    // a tap toggles
    if (open) return hide()
    pinned.current = true
    show('pointer')
  }
  const onFocus = (e: FocusEvent<HTMLButtonElement>) => {
    if (e.currentTarget.matches(':focus-visible')) show('key')
  }
  const onBlur = (e: FocusEvent) => {
    if (!wrap.current?.contains(e.relatedTarget as Node | null)) hide()
  }

  return (
    <div className="fresh" ref={wrap} data-state="stale" onPointerEnter={onEnter} onPointerLeave={onLeave}>
      <button
        type="button"
        className="fresh-btn"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onPointerDown={(e) => { pointer.current = e.pointerType }}
        onClick={onClick}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        <Warn s={14} />
        <span className="fresh-age">{label}</span>
      </button>
      <div id={id} className="fresh-pop" role="group" aria-label="When the data was last checked" data-open={open || undefined} data-via={via}>
        <table className="fresh-list">
          <thead>
            <tr>
              <th scope="col">data</th>
              <th scope="col" className="fresh-when">checked</th>
              <th scope="col" className="fresh-ago">age</th>
            </tr>
          </thead>
          <tbody>
            {list.map((f) => (
              <tr key={f.type} data-state={f.stale ? 'stale' : f.ageDays == null ? 'unknown' : 'fresh'}>
                <th scope="row"><span className="fresh-dot" aria-hidden="true" />{f.type}</th>
                <td className="fresh-when">{checkedLabel(f.at)}</td>
                <td className="fresh-ago">{ageLabel(f.ageDays)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="fresh-note">Amber after {STALE_DAYS} days without a check.</p>
      </div>
    </div>
  )
}
