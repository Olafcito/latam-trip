import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Flag } from '@map/map/Flag'
import { kr } from '../lib/format'
import { Check } from './icons'

// A round pill that opens a short list, grown from the home airport pill. The rows follow originui's select
// with flags on 21st (a flag, the name, the pick checked) and cnippet's select with disabled options (a row
// that cannot be picked stays in the list, dimmed, with the reason as a chip). Built on a plain listbox, so it
// needs no new package. The list keeps focus while open: arrows, Home and End walk the rows that can be
// picked, Enter or space picks, Escape and Tab close and focus goes back to the pill. On a phone the list
// rises from the bottom edge as a sheet titled with the pill's name.

export interface PillOption {
  value: string
  /** the words on the row */
  label: string
  /** the words on the pill when this row is picked, else the label */
  short?: string
  /** a country code for a flag before the label */
  flag?: string
  /** an icon before the label, when there is no flag */
  icon?: ReactNode
  /** quieter words after the label, a country or a code */
  sub?: string
  /** the price on the right. Null with `off` reads No fares */
  price?: number | null
  /** in the list but not to be picked */
  off?: boolean
  /** the group header the row sits under */
  group?: string
}

export function PillSelect({
  name, value, options, onChange, icon, set = false, className,
}: {
  /** what the pill picks: its accessible name and the title of the phone sheet */
  name: string
  value: string
  options: PillOption[]
  onChange: (value: string) => void
  /** the icon at the start of the pill */
  icon?: ReactNode
  /** the pill holds a filter that is on */
  set?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const at = Math.max(0, options.findIndex((o) => o.value === value))
  const [active, setActive] = useState(at)
  const [edge, setEdge] = useState<'left' | 'right'>('left')
  const wrap = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const id = useId()
  const picked = options[at]

  const close = (refocus: boolean) => {
    setOpen(false)
    if (refocus) btn.current?.focus({ preventScroll: true })
  }
  const pick = (o: PillOption) => {
    if (o.off) return
    if (o.value !== value) onChange(o.value)
    close(true)
  }

  useEffect(() => {
    if (!open) return
    setActive(at)
    // a pill past the middle of the screen opens its list to the left, so it never leaves the page
    const r = btn.current?.getBoundingClientRect()
    setEdge(r && r.left + r.width / 2 > window.innerWidth / 2 ? 'right' : 'left')
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

  /** The next row that can be picked from i in the step's direction, else i. */
  const walk = (i: number, step: 1 | -1) => {
    for (let j = i + step; j >= 0 && j < options.length; j += step) if (!options[j].off) return j
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
      End: () => walk(options.length, -1),
    }
    if (e.key in moves) {
      e.preventDefault()
      const next = moves[e.key]()
      if (next >= 0 && next < options.length) setActive(next)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (options[active]) pick(options[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close(true)
    } else if (e.key === 'Tab') {
      close(false)
    }
  }

  const lead = (o: PillOption) => (o.flag ? <Flag code={o.flag} size={12} /> : o.icon ? <span className="ps-ico">{o.icon}</span> : null)
  const row = (o: PillOption, i: number) => (
    <div
      key={o.value}
      id={`${id}-${i}`}
      data-i={i}
      role="option"
      aria-selected={o.value === value}
      aria-disabled={o.off || undefined}
      className={'ps-opt' + (i === active ? ' active' : '')}
      onPointerMove={() => !o.off && setActive(i)}
      onClick={() => pick(o)}
    >
      {lead(o)}
      <span className="ps-opt-label">
        {o.label}
        {o.sub && <span className="ps-opt-sub">{o.sub}</span>}
      </span>
      {o.off ? (
        <span className="ps-nofare">No fares</span>
      ) : (
        o.price != null && <span className="ps-opt-price">{kr(o.price)}</span>
      )}
      <span className="ps-opt-check">{o.value === value && <Check s={14} />}</span>
    </div>
  )

  // rows under their group headers, in the order they come
  const groups: { name: string | undefined; rows: { o: PillOption; i: number }[] }[] = []
  options.forEach((o, i) => {
    const g = groups[groups.length - 1]
    if (g && g.name === o.group) g.rows.push({ o, i })
    else groups.push({ name: o.group, rows: [{ o, i }] })
  })

  return (
    <div className={'ps' + (className ? ` ${className}` : '')} ref={wrap}>
      <button
        ref={btn}
        type="button"
        className="ps-pill"
        data-set={set || undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={picked ? `${name}, ${picked.label}` : name}
        title={picked ? `${name}, ${picked.label}` : name}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
      >
        {icon && <span className="ps-ico">{icon}</span>}
        {picked?.flag && <Flag code={picked.flag} size={12} />}
        <span className="ps-text">{picked?.short ?? picked?.label}</span>
        <svg className="ps-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div className="ps-scrim" data-open={open || undefined} aria-hidden="true" onClick={() => close(true)} />
      <div className="ps-pop" data-open={open || undefined} data-edge={edge}>
        <p className="ps-pop-title" id={`${id}-title`}>{name}</p>
        <div
          ref={list}
          id={`${id}-list`}
          className="ps-list"
          role="listbox"
          tabIndex={-1}
          aria-labelledby={`${id}-title`}
          aria-activedescendant={open ? `${id}-${active}` : undefined}
          onKeyDown={onListKey}
        >
          {groups.map((g, gi) =>
            g.name ? (
              <div key={`g${gi}`} role="group" aria-labelledby={`${id}-g${gi}`}>
                <div className="ps-group" id={`${id}-g${gi}`} role="presentation">{g.name}</div>
                {g.rows.map(({ o, i }) => row(o, i))}
              </div>
            ) : (
              <Fragment key={`g${gi}`}>{g.rows.map(({ o, i }) => row(o, i))}</Fragment>
            ),
          )}
        </div>
      </div>
    </div>
  )
}
