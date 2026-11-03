import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Flag } from '@map/map/Flag'
import { HOMES } from '../lib/homes'
import { countryName } from '../lib/colors'
import { Check } from './icons'

// The home airport of the trip picker, adapted from originui's select with flags on 21st: a round pill
// with the flag, the city and a chevron, opening a short list of flag and city rows with the pick checked.
// Built on a plain listbox, so it needs no new package. The list keeps focus while it is open: arrows,
// Home and End walk the rows, Enter or space picks, Escape and Tab close and focus goes back to the pill.
// On a phone the list rises from the bottom edge as a full width sheet.

export function HomePill({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const [open, setOpen] = useState(false)
  const at = Math.max(0, HOMES.findIndex((h) => h.code === value))
  const [active, setActive] = useState(at)
  const wrap = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const id = useId()
  const home = HOMES[at]

  const close = (refocus: boolean) => {
    setOpen(false)
    if (refocus) btn.current?.focus({ preventScroll: true })
  }
  const pick = (code: string) => {
    if (code !== value) onChange(code)
    close(true)
  }

  useEffect(() => {
    if (!open) return
    setActive(at)
    list.current?.focus({ preventScroll: true })
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
    // `at` only seeds the row the list opens on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (open) list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const onTriggerKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
    }
  }
  const onListKey = (e: KeyboardEvent) => {
    const last = HOMES.length - 1
    const moves: Record<string, () => number> = {
      ArrowDown: () => Math.min(last, active + 1),
      ArrowUp: () => Math.max(0, active - 1),
      Home: () => 0,
      End: () => last,
    }
    if (e.key in moves) {
      e.preventDefault()
      setActive(moves[e.key]())
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      pick(HOMES[active].code)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close(true)
    } else if (e.key === 'Tab') {
      close(false)
    }
  }

  return (
    <div className="home-pick" ref={wrap}>
      <button
        ref={btn}
        type="button"
        className="home-pill"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={`Home airport, ${home.city}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
      >
        <Flag code={home.country} size={12} />
        <span className="home-city">{home.city}</span>
        <svg className="home-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div className="home-scrim" data-open={open || undefined} aria-hidden="true" onClick={() => close(true)} />
      <div className="home-pop" data-open={open || undefined}>
        <p className="home-pop-title" id={`${id}-title`}>Home airport</p>
        <ul
          ref={list}
          id={`${id}-list`}
          className="home-list"
          role="listbox"
          tabIndex={-1}
          aria-labelledby={`${id}-title`}
          aria-activedescendant={open ? `${id}-${active}` : undefined}
          onKeyDown={onListKey}
        >
          {HOMES.map((h, i) => (
            <li
              key={h.code}
              id={`${id}-${i}`}
              data-i={i}
              role="option"
              aria-selected={h.code === value}
              className={'home-opt' + (i === active ? ' active' : '')}
              onPointerMove={() => setActive(i)}
              onClick={() => pick(h.code)}
            >
              <Flag code={h.country} size={12} />
              <span className="home-opt-city">{h.city}</span>
              <span className="home-opt-country">{countryName(h.country)}</span>
              <span className="home-opt-code">{h.code}</span>
              <span className="home-opt-check">{h.code === value && <Check s={14} />}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
