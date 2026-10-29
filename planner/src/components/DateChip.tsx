import { useRef } from 'react'
import { weekdayDay } from '../lib/format'
import { Calendar, Close } from './icons'

// The day you set out on a leg, in the Route table. A set day reads solid, an estimated one reads
// "~" with a dashed edge. A click opens the browser's own date picker, kept to the trip's days.

export function DateChip({ date, set, known, min, max, label, onSet }: {
  /** the day shown, "2026-12-13": the one set, else the picked flight's, else the estimate */
  date: string
  /** true when the day was set on the leg */
  set: boolean
  /** true when the day is set or comes from a picked flight, false when it is estimated */
  known: boolean
  min: string
  max: string
  /** "León to San Salvador", for the button's name */
  label: string
  onSet: (date: string | null) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const open = () => {
    const el = input.current
    if (!el) return
    try { el.showPicker() } catch { el.focus() }
  }
  return (
    <span className="dchip" data-known={known} data-set={set}>
      <button
        type="button"
        className="dchip-btn"
        onClick={open}
        aria-label={`${label}, ${set ? 'leaves' : known ? 'the picked flight leaves' : 'estimated'} ${weekdayDay(date)}. Set the day`}
        title={set ? 'The day you set. Click to change it' : known ? 'The picked flight’s day. Click to set another' : 'Estimated from the days around it. Click to set the day'}
      >
        <Calendar s={12} />
        <span>{known ? '' : '~'}{weekdayDay(date)}</span>
      </button>
      {set && (
        <button type="button" className="dchip-x" onClick={() => onSet(null)} aria-label={`Clear the day set for ${label}`} title="Clear the day">
          <Close />
        </button>
      )}
      <input
        ref={input}
        className="dchip-in"
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={date}
        min={min}
        max={max}
        onChange={(e) => onSet(e.target.value || null)}
      />
    </span>
  )
}
