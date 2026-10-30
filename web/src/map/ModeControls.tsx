// The controls of the mode panels, plain CSS on the app's tokens. Ported from 21st Segmented Control 34764,
// Chip Group 35042 and Slider 31347.
import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { foldChips } from '../data/modePanels'

/** Where an arrow key, Home or End goes in a row of `n`, or -1 for any other key. */
function keyTarget(key: string, at: number, n: number) {
  if (key === 'ArrowRight' || key === 'ArrowDown') return (at + 1) % n
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (at - 1 + n) % n
  if (key === 'Home') return 0
  if (key === 'End') return n - 1
  return -1
}

export interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: { id: T; label: string }[]
  onChange(value: T): void
}

/** Arrow keys move and pick at once, as radios do. */
export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  const box = useRef<HTMLDivElement>(null)
  const at = options.findIndex((o) => o.id === value)

  const onKeyDown = (e: KeyboardEvent) => {
    const to = keyTarget(e.key, at, options.length)
    if (to < 0) return
    e.preventDefault()
    onChange(options[to].id)
    box.current?.querySelectorAll('button')[to]?.focus()
  }

  return (
    <div ref={box} className="mseg" role="radiogroup" aria-label={label} onKeyDown={onKeyDown} style={{ '--n': options.length, '--i': at } as CSSProperties}>
      <span className="mseg-thumb" />
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={o.id === value} tabIndex={o.id === value ? 0 : -1} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export interface Chip {
  id: string
  label: string
  count?: number
  /** A flag, in front of the label. */
  lead?: ReactNode
}

export interface ChipGroupProps {
  label: string
  chips: Chip[]
  picked: string[]
  onToggle(id: string): void
  /** Chips that stand first and never fold, such as All or Saved. */
  pinned?: Chip[]
  /** How many of `chips` show before a More chip. */
  cap?: number
  /** One scrolling line on a phone instead of wrapping rows. */
  line?: boolean
}

export function ChipGroup({ label, chips, picked, onToggle, pinned = [], cap, line = false }: ChipGroupProps) {
  const box = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(0)
  const fold = cap ? foldChips(chips.map((c) => c.id), picked, cap, open) : { shown: chips.map((c) => c.id), hidden: 0 }
  const shown = chips.filter((c) => fold.shown.includes(c.id))
  const list = [...pinned, ...shown]
  const extra = fold.hidden > 0 || open
  const size = list.length + (extra ? 1 : 0)
  const roving = Math.min(focused, size - 1)

  const onKeyDown = (e: KeyboardEvent) => {
    const to = keyTarget(e.key, roving, size)
    if (to < 0) return
    e.preventDefault()
    setFocused(to)
    box.current?.querySelectorAll('button')[to]?.focus()
  }

  return (
    <div ref={box} className={`chips${line ? ' line' : ''}`} role="group" aria-label={label} onKeyDown={onKeyDown}>
      {list.map((c, i) => (
        <button key={c.id} type="button" className="chip" aria-pressed={picked.includes(c.id)} tabIndex={i === roving ? 0 : -1} onFocus={() => setFocused(i)} onClick={() => onToggle(c.id)}>
          <svg className="chip-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 12.5 9.5 18 20 6.5" />
          </svg>
          <span className="chip-in">
            {c.lead}
            <span>{c.label}</span>
            {c.count != null && <span className="chip-n">{c.count}</span>}
          </span>
        </button>
      ))}
      {extra && (
        <button type="button" className="chip chip-more" aria-expanded={open} tabIndex={size - 1 === roving ? 0 : -1} onFocus={() => setFocused(size - 1)} onClick={() => setOpen(!open)}>
          {open ? 'Less' : `+${fold.hidden} more`}
        </button>
      )}
    </div>
  )
}

export interface RangeSliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  /** The value in words. */
  display: string
  onChange(value: number): void
}

/** A native range, so keys, touch and screen readers come with it. The bubble shows only while it is being moved. */
export function RangeSlider({ label, value, min, max, step, display, onChange }: RangeSliderProps) {
  const id = useId()
  const part = max > min ? (value - min) / (max - min) : 0
  return (
    <div className="rng" style={{ '--p': part } as CSSProperties}>
      <div className="rng-top">
        <label htmlFor={id}>{label}</label>
        <span className="rng-v">{display}</span>
      </div>
      <div className="rng-rail">
        <input id={id} type="range" min={min} max={max} step={step} value={value} aria-valuetext={display} onChange={(e) => onChange(Number(e.target.value))} />
        <output htmlFor={id} className="rng-tip">{display}</output>
      </div>
    </div>
  )
}
