import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ownKey, readOwn } from '@map/data/ownKey'
import { day, dayDiff, kr, shortKr, weekdayDay } from '../../lib/format'
import { momondoUrl } from '../../lib/prices'
import { addDays } from '../../lib/time'
import { Caret, Check, External, Minus, Plus } from '../icons'

// When a leg leaves, as a calendar of one month at a time. After two components on 21st.dev: the
// month grid with its arrows and keyboard moves from halaska-studio's Calendar, and the price under
// each day from originui's pricing calendar, so the cheap days show while you pick. Built here on the
// planner's own tokens instead of pulling in react-day-picker. The days read as dates or as days of
// the trip, and the nights at the stop before move the same day. A booked leg holds its day: every day
// and both steppers show and none moves, the booked day marked the way the flight sheet's day strip marks it.

type Lens = 'date' | 'day'
const KEY = 'planner.whenLens'
const WD = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function readLens(): Lens {
  try { return readOwn(KEY) === 'day' ? 'day' : 'date' } catch { return 'date' }
}
function saveLens(l: Lens) {
  try { localStorage.setItem(ownKey(KEY), l) } catch { /* private window */ }
}
/** 0 for Monday */
const weekday = (d: string) => (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7
/** "2026-12" for a date */
const monthOf = (d: string) => d.slice(0, 7)
const monthName = (m: string) => `${MONTH[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`
/** the month n months on from a "2026-12" month */
function monthAdd(m: string, n: number): string {
  const i = +m.slice(0, 4) * 12 + +m.slice(5, 7) - 1 + n
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
}
/** every day of a month, with blanks before the first so the weeks start on a Monday */
function monthCells(m: string): (string | null)[] {
  const first = `${m}-01`
  const out: (string | null)[] = Array(weekday(first)).fill(null)
  for (let d = first; monthOf(d) === m; d = addDays(d, 1)) out.push(d)
  return out
}

export function WhenPicker({ date, set, min, max, days, firstDay, fares, fareFor, stay, codes, trip, clearable = true, held = null, onSet }: {
  date: string
  set: boolean
  /** the first and last day the leg can leave */
  min: string
  max: string
  /** only these days can be picked, when the leg leaves on the days something is known for */
  days?: readonly string[]
  /** day 1 of the trip, the landing */
  firstDay: string
  /** the cheapest fare known for the leg by day */
  fares: Record<string, number>
  /** what a fare is when it is not the cheapest known for the leg alone, "for both ways" */
  fareFor?: string
  /** the stop before the leg: its name and the day you get there. None for a leg with no stop before it */
  stay?: { name: string; inDay: string }
  /** the trip, so a flight picked on Momondo finds its way back */
  trip?: string
  codes: { from: string; to: string } | null
  /** false when the leg has no estimate to go back to */
  clearable?: boolean
  /** the day a booking holds the leg on. Nothing can be picked then, and the leg is changed from its booking */
  held?: string | null
  onSet: (date: string | null) => void
}) {
  const [lens, setLens] = useState<Lens>(readLens)
  const [month, setMonth] = useState(() => monthOf(date))
  const [focus, setFocus] = useState(date)
  const grid = useRef<HTMLDivElement>(null)
  const moved = useRef(false)
  const pick = (l: Lens) => { setLens(l); saveLens(l) }
  /** the day of the trip, or null for a day before it starts, as the way in can leave */
  const tripDay = (d: string) => (d < firstDay ? null : dayDiff(firstDay, d) + 1)
  const nights = stay ? dayDiff(stay.inDay, date) : 0
  const open = (d: string) => !held && d >= min && d <= max && (!days || days.includes(d))
  const heldLabel = held ? `Booked for ${weekdayDay(held)}, change it from its booking` : undefined
  /** the next day that can be picked from d in a direction, or null */
  const step = (d: string, dir: number): string | null => {
    for (let x = addDays(d, dir); x >= min && x <= max; x = addDays(x, dir)) if (open(x)) return x
    return null
  }
  const before = step(date, -1)
  const after = step(date, 1)
  const priced = Object.entries(fares).filter(([d]) => d >= min && d <= max)
  const cheapest = priced.length ? Math.min(...priced.map(([, p]) => p)) : null
  const isCheap = (d: string) => fares[d] != null && fares[d] === cheapest
  const readout = [
    tripDay(date) != null ? `Day ${tripDay(date)}` : null,
    fares[date] != null ? `${kr(fares[date])}${fareFor ? ` ${fareFor}` : ''}${isCheap(date) ? ', the cheapest' : ''}` : null,
  ].filter(Boolean).join(', ')
  // the one day in the grid that Tab lands on: the focused day, or the first open day of the month
  const start = `${month}-01` < min ? min : `${month}-01`
  const first = open(start) ? start : step(start, 1) ?? start
  const tabDay = monthOf(focus) === month ? focus : first

  // follow the day when it changes from outside, from the nights stepper or the story
  useEffect(() => { setFocus(date); setMonth(monthOf(date)) }, [date])
  // after an arrow key, move the focus to the new day, across a month when it has to
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    grid.current?.querySelector<HTMLButtonElement>(`[data-d="${focus}"]`)?.focus()
  }, [focus, month])

  const keys = (e: KeyboardEvent) => {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -weekday(focus), End: 6 - weekday(focus) }
    const pages: Record<string, number> = { PageUp: -1, PageDown: 1 }
    let d: string
    if (e.key in steps) d = addDays(focus, steps[e.key])
    else if (e.key in pages) {
      const m = monthAdd(monthOf(focus), pages[e.key])
      const last = addDays(`${monthAdd(m, 1)}-01`, -1)
      d = `${m}-${focus.slice(8)}` > last ? last : `${m}-${focus.slice(8)}`
    } else return
    e.preventDefault()
    // up and down keep the weekday, so past the open days they stay put rather than leave the column
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !open(d)) return
    d = d < min ? min : d > max ? max : d
    // a day that cannot be picked is skipped over, the way the keys move
    if (!open(d)) {
      const dir = d < focus ? -1 : 1
      const near = step(d, dir) ?? step(d, -dir)
      if (!near) return
      d = near
    }
    moved.current = true
    setFocus(d)
    setMonth(monthOf(d))
  }

  return (
    <div className="wp" data-fares={cheapest != null} data-overland={!codes || undefined}>
      <div className="wp-top">
        <div className="seg wp-seg" role="radiogroup" aria-label="Show the days as">
          <button type="button" role="radio" aria-checked={lens === 'date'} onClick={() => pick('date')}>Date</button>
          <button type="button" role="radio" aria-checked={lens === 'day'} onClick={() => pick('day')}>Trip day</button>
        </div>
        <span className="wp-read" aria-live="polite">
          <b>{weekdayDay(date)}</b>
          {readout && <small>{readout}</small>}
        </span>
      </div>

      <div className="wp-cal">
        <div className="wp-nav">
          <button type="button" className="wp-arr" aria-label="Month before" disabled={month <= monthOf(min)} onClick={() => setMonth(monthAdd(month, -1))}><Caret dir="l" /></button>
          <b aria-live="polite">{monthName(month)}</b>
          <button type="button" className="wp-arr" aria-label="Month after" disabled={month >= monthOf(max)} onClick={() => setMonth(monthAdd(month, 1))}><Caret dir="r" /></button>
        </div>
        <div className="wp-wd" aria-hidden="true">{WD.map((w) => <span key={w}>{w}</span>)}</div>
        <div className="wp-grid" ref={grid} aria-label={monthName(month)} onKeyDown={keys}>
          {monthCells(month).map((d, i) => {
            if (!d) return <span key={`b${i}`} />
            const p = fares[d]
            return (
              <button
                key={d}
                type="button"
                className="wp-d"
                data-d={d}
                disabled={!open(d)}
                tabIndex={d === tabDay ? 0 : -1}
                data-sel={d === date}
                data-set={(set || !!held) && d === date}
                data-cheap={isCheap(d)}
                data-priced={p != null}
                data-booked={d === held || undefined}
                aria-pressed={d === date}
                aria-label={`${weekdayDay(d)}${tripDay(d) != null ? `, day ${tripDay(d)}` : ''}${d === held ? ', booked' : p == null ? '' : fareFor ? `, ${kr(p)} ${fareFor}` : `, from ${kr(p)}`}`}
                onClick={() => { setFocus(d); onSet(d) }}
              >
                <b>{lens === 'date' ? +d.slice(8) : tripDay(d) ?? ' '}</b>
                <small>{d === held ? <Check s={11} /> : p != null ? shortKr(p) : ''}</small>
              </button>
            )
          })}
        </div>
      </div>

      {stay && (
        <div className="wp-stay">
          <span>Nights in <b>{stay.name}</b></span>
          <span className="wp-step">
            <button type="button" aria-label={heldLabel ?? 'One night less'} title={heldLabel} disabled={!before || dayDiff(stay.inDay, before) < 0} onClick={() => before && onSet(before)}><Minus /></button>
            <b>{nights}</b>
            <button type="button" aria-label={heldLabel ?? 'One night more'} title={heldLabel} disabled={!after} onClick={() => after && onSet(after)}><Plus /></button>
          </span>
        </div>
      )}

      <div className="wp-foot">
        <span className="wp-key">{cheapest != null ? <><i /> {fareFor ? `Cheapest day, prices ${fareFor}` : 'Cheapest known fare'}</> : codes ? 'No fares saved for these days yet' : 'Overland, no fares to look up'}</span>
        <span className="wp-btns">
          {set && clearable && !held && <button type="button" className="btn link small" onClick={() => onSet(null)}>Back to estimate</button>}
          {codes && <a className="btn small" href={momondoUrl(codes.from, codes.to, date, trip)} target="_blank" rel="noopener noreferrer">Momondo {day(date)}<External /></a>}
        </span>
      </div>
    </div>
  )
}
