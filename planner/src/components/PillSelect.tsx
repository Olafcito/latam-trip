import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check } from './icons'

// A round pill that opens a short list, grown from the home airport pill (originui's select with flags on
// 21st). Built on a plain listbox, so it needs no new package. The list keeps focus while it is open: arrows,
// Home and End walk the rows and skip the ones that are off, Enter or space picks, Escape and Tab close and
// focus goes back to the pill. A row can carry a price, and a row that is off says why in a chip. Rows can sit
// under group heads. On a phone the list rises from the bottom edge as a full width sheet.

export interface PillChoice {
  value: string
  label: string
  /** a flag or an icon before the label */
  lead?: ReactNode
  /** quiet words after the label, a country */
  sub?: string
  /** on the right, a price or a code */
  meta?: string
  /** the chip of a row that cannot be picked, "No fares" */
  off?: string
  /** the head the row sits under */
  group?: string
}

export function PillSelect({
  label, value, choices, onChange, icon, lead, text, on = false,
}: {
  /** what the pill picks, "Home airport", for the sheet title and the screen reader */
  label: string
  value: string
  choices: PillChoice[]
  onChange: (value: string) => void
  icon?: ReactNode
  /** the lead of the pill itself, a flag */
  lead?: ReactNode
  /** the words on the pill, the label of the picked row by default */
  text?: string
  /** a filter that is set: the pill is outlined in amber */
  on?: boolean
}) {
  const [open, setOpen] = useState(false)
  const at = Math.max(0, choices.findIndex((c) => c.value === value))
  const [active, setActive] = useState(at)
  const wrap = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const id = useId()
  const picked = choices[at]

  const close = (refocus: boolean) => {
    setOpen(false)
    if (refocus) btn.current?.focus({ preventScroll: true })
  }
  const pick = (c: PillChoice) => {
    if (c.off) return
    if (c.value !== value) onChange(c.value)
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

  /** the next row that can be picked, walking by step from i, or i when there is none */
  const walk = (i: number, step: number) => {
    for (let k = i + step; k >= 0 && k < choices.length; k += step) if (!choices[k].off) return k
    return i
  }

  const onTriggerKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
    }
  }
  const onListKey = (e: KeyboardEvent) => {
    const moves: Record<string, () => number> = {
      ArrowDown: () => walk(active, 1),
      ArrowUp: () => walk(active, -1),
      Home: () => walk(-1, 1),
      End: () => walk(choices.length, -1),
    }
    if (e.key in moves) {
      e.preventDefault()
      setActive(moves[e.key]())
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (choices[active]) pick(choices[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close(true)
    } else if (e.key === 'Tab') {
      close(false)
    }
  }

  return (
    <div className="ps" ref={wrap}>
      <button
        ref={btn}
        type="button"
        className="ps-pill"
        data-on={on || undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={`${label}, ${text ?? picked?.label ?? ''}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
      >
        {icon && <span className="ps-icon" aria-hidden="true">{icon}</span>}
        {lead}
        <span className="ps-text">{text ?? picked?.label}</span>
        <svg className="ps-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div className="ps-scrim" data-open={open || undefined} aria-hidden="true" onClick={() => close(true)} />
      <div className="ps-pop" data-open={open || undefined}>
        <p className="ps-pop-title" id={`${id}-title`}>{label}</p>
        <ul
          ref={list}
          id={`${id}-list`}
          className="ps-list"
          role="listbox"
          tabIndex={-1}
          aria-labelledby={`${id}-title`}
          aria-activedescendant={open ? `${id}-${active}` : undefined}
          onKeyDown={onListKey}
        >
          {choices.map((c, i) => (
            <PillRow key={c.value} c={c} i={i} id={id} head={c.group && c.group !== choices[i - 1]?.group ? c.group : null}
              selected={c.value === value} active={i === active} onHover={() => !c.off && setActive(i)} onPick={() => pick(c)} />
          ))}
        </ul>
      </div>
    </div>
  )
}

function PillRow({ c, i, id, head, selected, active, onHover, onPick }: {
  c: PillChoice; i: number; id: string; head: string | null; selected: boolean; active: boolean; onHover: () => void; onPick: () => void
}) {
  return (
    <>
      {head && <li className="ps-group" role="presentation">{head}</li>}
      <li
        id={`${id}-${i}`}
        data-i={i}
        role="option"
        aria-selected={selected}
        aria-disabled={c.off ? true : undefined}
        className={'ps-opt' + (active ? ' active' : '')}
        onPointerMove={onHover}
        onClick={onPick}
      >
        <span className="ps-opt-lead">{c.lead}</span>
        <span className="ps-opt-label">{c.label}{c.sub && <span className="ps-opt-sub">{c.sub}</span>}</span>
        {c.off ? <span className="ps-opt-off">{c.off}</span> : <span className="ps-opt-meta">{c.meta}</span>}
        <span className="ps-opt-check">{selected && <Check s={14} />}</span>
      </li>
    </>
  )
}
