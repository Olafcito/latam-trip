import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { day, dayDiff, kr, shortKr, weekdayDay } from '../../lib/format'
import { momondoUrl } from '../../lib/prices'
import { addDays } from '../../lib/time'
import { Caret, External, Minus, Plus } from '../icons'

// When a leg leaves, as a calendar of one month at a time. After two components on 21st.dev: the
// month grid with its arrows and keyboard moves from halaska-studio's Calendar, and the price under
// each day from originui's pricing calendar, so the cheap days show while you pick. Built here on the
// planner's own tokens instead of pulling in react-day-picker. The days read as dates or as days of
// the trip, and the nights at the stop before move the same day.

type Lens = 'date' | 'day'
const KEY = 'planner.whenLens'
const WD = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function readLens(): Lens {
  try { return localStorage.getItem(KEY) === 'day' ? 'day' : 'date' } catch { return 'date' }
}
function saveLens(l: Lens) {
  try { localStorage.setItem(KEY, l) } catch { /* private window */ }
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

export function WhenPicker({ date, set, min, max, firstDay, fares, stay, codes, trip, onSet }: {
  date: string
  set: boolean
  /** the first and last day the leg can leave */
  min: string
  max: string
  /** day 1 of the trip, the landing */
  firstDay: string
  /** the cheapest fare known for the leg by day */
  fares: Record<string, number>
  /** the stop before the leg: its name and the day you get there */
  stay: { name: string; inDay: string }
  /** the trip, so a flight picked on Momondo finds its way back */
  trip?: string
  codes: { from: string; to: string } | null
  onSet: (date: string | null) => void
}) {
  const [lens, setLens] = useState<Lens>(readLens)
  const [month, setMonth] = useState(() => monthOf(date))
  const [focus, setFocus] = useState(date)
  const grid = useRef<HTMLDivElement>(null)
  const moved = useRef(false)
  const pick = (l: Lens) => { setLens(l); saveLens(l) }
  const tripDay = (d: string) => dayDiff(firstDay, d) + 1
  const nights = dayDiff(stay.inDay, date)
  const priced = Object.entries(fares).filter(([d]) => d >= min && d <= max)
  const cheapest = priced.length ? Math.min(...priced.map(([, p]) => p)) : null
  // the one day in the grid that Tab lands on: the focused day, or the first open day of the month
  const first = `${month}-01` < min ? min : `${month}-01`
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
    d = d < min ? min : d > max ? max : d
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
          <small>Day {tripDay(date)}{fares[date] != null ? ` · ${kr(fares[date])}${fares[date] === cheapest ? ', the cheapest' : ''}` : ''}</small>
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
                disabled={d < min || d > max}
                tabIndex={d === tabDay ? 0 : -1}
                data-sel={d === date}
                data-set={set && d === date}
                data-cheap={p != null && p === cheapest}
                data-priced={p != null}
                aria-pressed={d === date}
                aria-label={`${weekdayDay(d)}, day ${tripDay(d)}${p != null ? `, from ${kr(p)}` : ''}`}
                onClick={() => { setFocus(d); onSet(d) }}
              >
                <b>{lens === 'date' ? +d.slice(8) : tripDay(d)}</b>
                <small>{p != null ? shortKr(p) : ''}</small>
              </button>
            )
          })}
        </div>
      </div>

      <div className="wp-stay">
        <span>Nights in <b>{stay.name}</b></span>
        <span className="wp-step">
          <button type="button" aria-label="One night less" disabled={date <= min || nights <= 0} onClick={() => onSet(addDays(date, -1))}><Minus /></button>
          <b>{nights}</b>
          <button type="button" aria-label="One night more" disabled={date >= max} onClick={() => onSet(addDays(date, 1))}><Plus /></button>
        </span>
      </div>

      <div className="wp-foot">
        <span className="wp-key">{cheapest != null ? <><i /> Cheapest known fare</> : codes ? 'No fares saved for these days yet' : 'Overland, no fares to look up'}</span>
        <span className="wp-btns">
          {set && <button type="button" className="btn link small" onClick={() => onSet(null)}>Back to estimate</button>}
          {codes && <a className="btn small" href={momondoUrl(codes.from, codes.to, date, trip)} target="_blank" rel="noopener noreferrer">Momondo {day(date)}<External /></a>}
        </span>
      </div>
    </div>
  )
}
