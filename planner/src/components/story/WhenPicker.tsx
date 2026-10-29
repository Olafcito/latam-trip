import { useState } from 'react'
import { day, dayDiff, kr, thousands, weekdayDay } from '../../lib/format'
import { momondoUrl } from '../../lib/prices'
import { addDays, dateRange } from '../../lib/time'
import { External, Minus, Plus } from '../icons'

// When a leg leaves, three ways to say it in one picker: a calendar date, a day of the trip, or how
// many nights you stay before it. They all set the same day. Each day carries the cheapest fare
// known for the leg, so the cheap days show while you pick.

type Lens = 'date' | 'day'
const KEY = 'planner.whenLens'
const WD = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function readLens(): Lens {
  try { return localStorage.getItem(KEY) === 'day' ? 'day' : 'date' } catch { return 'date' }
}
function saveLens(l: Lens) {
  try { localStorage.setItem(KEY, l) } catch { /* private window */ }
}
/** 0 for Monday */
const weekday = (d: string) => (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7
/** "1.240" as "1,2k" so a price fits under a day */
const short = (p: number) => (p >= 10_000 ? `${Math.round(p / 1000)}k` : p >= 1000 ? `${(p / 1000).toFixed(1).replace('.', ',')}k` : thousands(p))

export function WhenPicker({ date, set, min, max, firstDay, fares, stay, codes, onSet }: {
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
  codes: { from: string; to: string } | null
  onSet: (date: string | null) => void
}) {
  const [lens, setLens] = useState<Lens>(readLens)
  const [peek, setPeek] = useState<string | null>(null)
  const pick = (l: Lens) => { setLens(l); saveLens(l) }
  const tripDay = (d: string) => dayDiff(firstDay, d) + 1
  const nights = dayDiff(stay.inDay, date)
  const priced = Object.entries(fares).filter(([d]) => d >= min && d <= max)
  const cheapest = priced.length ? Math.min(...priced.map(([, p]) => p)) : null
  const shown = peek ?? date

  // the date lens is a calendar from the Monday before the first day to the Sunday after the last
  const start = addDays(min, -weekday(min))
  const end = addDays(max, 6 - weekday(max))
  const days = lens === 'date' ? dateRange(start, end) : dateRange(min, max)

  return (
    <div className="wp" onPointerLeave={() => setPeek(null)}>
      <div className="wp-top">
        <div className="seg wp-seg" role="radiogroup" aria-label="Pick by">
          <button type="button" role="radio" aria-checked={lens === 'date'} onClick={() => pick('date')}>Date</button>
          <button type="button" role="radio" aria-checked={lens === 'day'} onClick={() => pick('day')}>Trip day</button>
        </div>
        <span className="wp-read" aria-live="polite">
          <b>{lens === 'date' ? weekdayDay(shown) : `Day ${tripDay(shown)}`}</b>
          <small>{lens === 'date' ? `Day ${tripDay(shown)}` : weekdayDay(shown)}{fares[shown] != null ? ` · ${kr(fares[shown])}` : ''}</small>
        </span>
      </div>

      {lens === 'date' && <div className="wp-wd" aria-hidden="true">{WD.map((w) => <span key={w}>{w}</span>)}</div>}
      <div className="wp-grid" data-lens={lens} role="grid" aria-label={lens === 'date' ? 'Calendar' : 'Days of the trip'}>
        {days.map((d) => {
          const inside = d >= min && d <= max
          const p = fares[d]
          const first = d.slice(8) === '01' || d === start
          return (
            <button
              key={d}
              type="button"
              className="wp-d"
              disabled={!inside}
              data-sel={d === date}
              data-set={set && d === date}
              data-cheap={p != null && p === cheapest}
              data-priced={p != null}
              onClick={() => onSet(d)}
              onPointerEnter={() => inside && setPeek(d)}
              onFocus={() => setPeek(d)}
              aria-label={`${weekdayDay(d)}, day ${tripDay(d)}${p != null ? `, from ${kr(p)}` : ''}`}
            >
              {lens === 'date' && first && <i className="wp-m">{MON[+d.slice(5, 7) - 1]}</i>}
              <b>{lens === 'date' ? +d.slice(8) : tripDay(d)}</b>
              <small>{p != null ? short(p) : inside ? '' : ''}</small>
            </button>
          )
        })}
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
          {codes && <a className="btn small" href={momondoUrl(codes.from, codes.to, date)} target="_blank" rel="noopener noreferrer">Momondo {day(date)}<External /></a>}
        </span>
      </div>
    </div>
  )
}
