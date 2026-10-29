import { useEffect, useId, useRef, useState, type FocusEvent, type MouseEvent, type PointerEvent } from 'react'
import type { Meta } from '../data/types'
import { STALE_DAYS, ageLabel, ageWords, checkedLabel, freshness, leadOf, type Fresh } from '../lib/freshness'

// A hover opens after a beat, so passing the mouse over the header does not flash it open,
// and closes after a beat, so the pointer can travel from the button into the popover.
const OPEN_DELAY = 120
const CLOSE_DELAY = 160

type State = 'fresh' | 'stale' | 'unknown'
const stateOf = (f: Fresh | null): State => (f == null || f.ageDays == null ? 'unknown' : f.stale ? 'stale' : 'fresh')

/** The freshness corner: a dot and the age of the flights, amber when any data is stale.
 *  Hover, focus or a tap opens a popover with every type and its last check. */
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
  const lead = leadOf(list)
  const anyStale = list.some((f) => f.stale)
  const state: State = anyStale ? 'stale' : stateOf(lead)

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

  const type = lead?.type ?? 'data'
  const name = lead
    ? `Data freshness, ${lead.type} checked ${ageWords(lead.ageDays)}${anyStale ? `, some data is older than ${STALE_DAYS} days` : ''}`
    : 'Data freshness unknown'

  return (
    <div className="fresh" ref={wrap} data-state={state} onPointerEnter={onEnter} onPointerLeave={onLeave}>
      <button
        type="button"
        className="fresh-btn"
        aria-label={name}
        aria-expanded={open}
        aria-controls={id}
        onPointerDown={(e) => { pointer.current = e.pointerType }}
        onClick={onClick}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        <span className="fresh-dot" aria-hidden="true" />
        <span className="fresh-type">{type}</span>
        <span className="fresh-age">{ageLabel(lead?.ageDays ?? null)}</span>
      </button>
      <div id={id} className="fresh-pop" role="group" aria-label="When the data was last checked" data-open={open || undefined} data-via={via}>
        {list.length ? (
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
                <tr key={f.type} data-state={stateOf(f)}>
                  <th scope="row"><span className="fresh-dot" aria-hidden="true" />{f.type}</th>
                  <td className="fresh-when">{checkedLabel(f.at)}</td>
                  <td className="fresh-ago">{ageLabel(f.ageDays)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="fresh-none">No record of when the data was checked.</p>
        )}
        <p className="fresh-note">Amber after {STALE_DAYS} days without a check.</p>
      </div>
    </div>
  )
}
