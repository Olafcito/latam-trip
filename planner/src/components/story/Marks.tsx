import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type MouseEvent, type PointerEvent, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Mark, MarkKind } from '../../lib/marks'
import { Bag, Calendar, Home, Hop, Hourglass, Land, Moon, Passport, Sun, Suitcase, Transfer, Warn } from '../icons'

// The marks of a flight or way row: an icon in the app's set, a short figure beside it when the fact needs
// a word on a phone, and the tone as its colour. Each one is a toggletip: the whole fact is its accessible
// name, and a tap, a click, a hover or a keyboard focus shows it in a small bubble above the mark.

const ICON: Record<MarkKind, () => ReactElement> = {
  cabin: () => <Bag />, checked: () => <Suitcase />, night: () => <Moon />, moon: () => <Moon />, day: () => <Sun />,
  wait: () => <Hourglass />, self: () => <Transfer />, airport: () => <Hop />, stopover: () => <Calendar />,
  esta: () => <Passport />, late: () => <Warn />, home: () => <Home />, in: () => <Land />, border: () => <Passport />,
}

// a hover opens after a beat and closes after one, as the freshness corner does
const OPEN_DELAY = 120
const CLOSE_DELAY = 160
/** a tip opened this soon after another closed shows at once, so running along a row of marks reads as one */
const WARM_MS = 400
/** the gap between the mark and its bubble, and the least room kept to the edge of the screen */
const GAP = 6
const EDGE = 8

// one tip open at a time
let openTip: { close: () => void } | null = null
let closedAt = 0

interface TipProps {
  /** the whole fact, the accessible name and the words in the bubble */
  label: string
  className: string
  tone?: string
  kind?: string
  children: ReactNode
}

/** A mark as a toggletip: a button that keeps its name and shows it in a bubble on a tap, a click, a hover or a keyboard focus. */
export function Tip({ label, className, tone, kind, children }: TipProps) {
  const [open, setOpen] = useState(false)
  // the bubble is made the first time it opens and kept, so it can fade out
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [via, setVia] = useState<'pointer' | 'key' | 'warm'>('pointer')
  const btn = useRef<HTMLButtonElement>(null)
  const tip = useRef<HTMLSpanElement>(null)
  const pointer = useRef('mouse')
  const pinned = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  const self = useRef({ close: () => {} })

  const hide = () => {
    window.clearTimeout(timer.current)
    pinned.current = false
    setOpen(false)
  }
  self.current.close = hide
  const show = (how: 'pointer' | 'key') => {
    window.clearTimeout(timer.current)
    if (openTip && openTip !== self.current) openTip.close()
    openTip = self.current
    // inside a sheet the bubble lives in the sheet, so the modal does not make it inert
    setHost(btn.current?.closest('dialog') ?? document.body)
    setVia(how === 'key' ? 'key' : Date.now() - closedAt < WARM_MS ? 'warm' : 'pointer')
    setOpen(true)
  }

  // the bubble sits above the mark when it fits, below when it does not, and never past the edge
  const place = () => {
    const b = btn.current?.getBoundingClientRect()
    const t = tip.current
    if (!b || !t) return
    const w = t.offsetWidth
    const h = t.offsetHeight
    const room = document.documentElement.clientWidth
    const left = Math.min(Math.max(EDGE, b.left + b.width / 2 - w / 2), room - w - EDGE)
    const up = b.top - h - GAP >= EDGE
    t.style.left = `${left}px`
    t.style.top = `${up ? b.top - h - GAP : b.bottom + GAP}px`
    t.style.transformOrigin = `${b.left + b.width / 2 - left}px ${up ? '100%' : '0'}`
    t.dataset.side = up ? 'top' : 'bottom'
  }

  useLayoutEffect(() => {
    const t = tip.current
    if (!t) return
    if (open) {
      if (!t.matches(':popover-open')) t.showPopover()
      place()
    } else if (t.matches(':popover-open')) {
      t.hidePopover()
    }
  }, [open, host])

  // while open: a press anywhere else, Escape, a scroll or a resize close it. Escape is caught first so
  // the sheet around the mark stays open.
  useEffect(() => {
    if (!open) return
    const onDown = (e: globalThis.PointerEvent) => {
      if (!btn.current?.contains(e.target as Node)) hide()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      hide()
    }
    const onMove = () => hide()
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
      if (openTip === self.current) openTip = null
      closedAt = Date.now()
    }
  }, [open])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const onEnter = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    window.clearTimeout(timer.current)
    if (!open) timer.current = window.setTimeout(() => show('pointer'), Date.now() - closedAt < WARM_MS ? 0 : OPEN_DELAY)
  }
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || pinned.current) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(hide, CLOSE_DELAY)
  }
  const onClick = (e: MouseEvent) => {
    // the mark sits on a row that may do something on a click of its own
    e.stopPropagation()
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

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={className}
        data-tone={tone}
        data-kind={kind}
        data-open={open || undefined}
        aria-label={label}
        onPointerDown={(e) => { pointer.current = e.pointerType }}
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
        onClick={onClick}
        onFocus={onFocus}
        onBlur={hide}
      >
        {children}
      </button>
      {host && createPortal(
        <span ref={tip} className="tip" popover="manual" aria-hidden="true" data-via={via}>{label}</span>,
        host,
      )}
    </>
  )
}

/** One mark as an icon pill, or a bare icon when it has no figure and sits inline. */
export function MarkIcon({ m, bare }: { m: Mark; bare?: boolean }) {
  const Icon = ICON[m.kind]
  return (
    <Tip label={m.label} className={bare ? 'mk-i' : 'mk'} tone={m.tone} kind={m.kind}>
      <Icon />
      {m.text && !bare && <span aria-hidden="true">{m.text}</span>}
    </Tip>
  )
}

/** The row's own marks, under the times, in the order the helper gave them. */
export function Marks({ list }: { list: (Mark | null)[] }) {
  const shown = list.filter((m): m is Mark => m != null)
  if (!shown.length) return null
  return (
    <ul className="fl-marks">
      {shown.map((m) => <li key={m.kind + m.label}><MarkIcon m={m} /></li>)}
    </ul>
  )
}
