import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppData, StopItem, Way } from '../../data/types'
import { clock, hours, kr, nextDayMark, shortPlace, weekdayDay } from '../../lib/format'
import type { FlightLink } from '../../lib/links'
import { wayLinks } from '../../lib/links'
import { priceOfWays } from '../../lib/options'
import { momondoUrl } from '../../lib/prices'
import { dayOf, type WayChoice } from '../../lib/ways'
import { rowFares, wayRowsByDay, type WayRow } from '../../lib/wayRows'
import { FlightLinks } from '../FlightLinks'
import { Check, Plane } from '../icons'
import { Days } from './FlightSheet'

// The way in or the way home opened like any other leg: the days it can leave with a price each, and
// the ways of the day you look at as tickets, airline, when it leaves and lands with the airports in
// between, and what both ways cost once it is picked, since a return ticket is one price for both.
// Looking at a day changes nothing, only Pick does. A pick that only changes this way closes the
// sheet. A pick that also moves or changes the other way keeps it open and says so, where you pressed,
// so the change to the other end of the trip is never a surprise.

/** the ways shown before Show all */
const SHOWN = 6

interface Note { text: string; bad?: boolean; strong?: boolean }

const nightsText = (n: number) => (n === 1 ? '1 night' : `${n} nights`)

/** The airports in between with the wait at each, a night stop as its nights. */
function stopsOf(way: Way): { code: string; text: string | null }[] {
  return way.timeline.flatMap((t) => {
    if (t.kind === 'flight') return t.connections.map((c) => ({ code: c.airport, text: c.layover_h != null ? hours(c.layover_h) : null }))
    return [{ code: t.airport, text: t.kind === 'night' ? nightsText(t.nights) : hours(t.hours) }]
  })
}

function carriersOf(way: Way, data: AppData): string[] {
  const flown = [...new Set(way.timeline.flatMap((t) => (t.kind === 'flight' ? t.carriers : [])))]
  if (flown.length) return flown
  return [...new Set(way.tickets.flatMap((id) => data.inout.tickets[id]?.carriers ?? []))]
}

/** What kind of ticket the way is, in words. */
function kindOf(way: Way): string {
  if (way.type === 'ticket') return way.paired_with ? 'Return ticket' : 'One ticket'
  if (way.type === 'madrid') return 'Via Madrid, 2 tickets'
  return way.tickets.length > 1 ? `${way.tickets.length} one way tickets` : 'One way'
}

/** What the bags cost on the way's own tickets, or null when that is not known. */
function bagsOf(way: Way, data: AppData): string | null {
  if (!way.tickets.length || !way.tickets.every((t) => data.inout.tickets[t])) return null
  const { cabin, checked } = priceOfWays(data.inout, [way])
  const parts = [
    cabin == null ? null : cabin === 0 ? 'Cabin bag included' : `Cabin bag ${kr(cabin)}`,
    checked == null ? null : checked === 0 ? 'checked bag included' : `checked bag ${kr(checked)}`,
  ].filter((x): x is string => !!x)
  if (!parts.length) return null
  const s = parts.join(', ')
  return s[0].toUpperCase() + s.slice(1)
}

function notesOf(r: WayRow, dir: 'in' | 'home', other: Way, data: AppData, name: (code: string) => string): Note[] {
  const notes: Note[] = []
  const then = dir === 'in' ? r.choice.wayHome : r.choice.wayIn
  const word = dir === 'in' ? 'Way home' : 'Way in'
  if (!r.works) notes.push({ text: r.choice.note ?? 'Picking it changes nothing', bad: true })
  else if (then.id !== other.id) {
    const when = `${weekdayDay(then.depart)} at ${clock(then.depart)}`
    const oneWay = then.type === 'oneways' && other.type !== 'oneways' ? ', as a one way' : ''
    // the same day at another time says the day stays and the time is new
    const still = then.depart === other.depart ? `${word} still ${when}` : `${word} still ${weekdayDay(then.depart)}, now at ${clock(then.depart)}`
    notes.push({ text: r.keeps ? `${still}${oneWay}` : `${word} moves to ${when}${oneWay}`, strong: !r.keeps })
  }
  for (const t of r.way.timeline) {
    if (t.kind === 'night') {
      const s = t as StopItem
      notes.push({ text: `${nightsText(s.nights)} in ${name(s.airport)}${s.stay_estimate_dkk ? `, stay about ${kr(s.stay_estimate_dkk)}` : ''}` })
    }
    if (t.kind === 'self_transfer') notes.push({ text: `Self transfer in ${name(t.airport)}, you check in again` })
  }
  if (r.way.us_transit) notes.push({ text: 'Through the United States, ESTA needed' })
  const bags = bagsOf(r.way, data)
  if (bags) notes.push({ text: bags })
  return notes
}

/**
 * The right column of a row: what both ways cost with it, and under that what you can do with it. Its
 * own part, so a booked way can show its state here the same way.
 */
function WayState({ total, state, label, onPick }: { total: number | null; state: 'picked' | 'pick' | 'none'; label: string; onPick: () => void }) {
  return (
    <div className="fl-price">
      {state !== 'none' && <b>{kr(total)}</b>}
      {state === 'picked' && <span className="ws-chip"><Check /> Picked</span>}
      {state === 'pick' && <button type="button" className="btn small" aria-label={`Pick ${label}${total != null ? `, ${kr(total)} for both ways` : ''}`} onClick={onPick}>Pick</button>}
    </div>
  )
}

function WayRowView({ r, picked, dir, other, data, name, onPick }: {
  r: WayRow; picked: boolean; dir: 'in' | 'home'; other: Way; data: AppData; name: (code: string) => string; onPick: () => void
}) {
  const w = r.way
  const air = carriersOf(w, data)
  const who = air.join(', ')
  const stops = stopsOf(w)
  const notes = notesOf(r, dir, other, data, name)
  const label = `${who || 'this way'}, ${weekdayDay(w.depart)} ${clock(w.depart)} to ${clock(w.arrive)}`
  return (
    <div className="fl-row" data-picked={picked || undefined}>
      <div className="fl-air">
        <span className="fl-logo" aria-hidden="true">{who ? who.slice(0, 2).toUpperCase() : <Plane s={16} />}</span>
        <div className="fl-who">
          <b title={who || undefined}>{who || 'Airline not listed'}</b>
          <small>{kindOf(w)}</small>
        </div>
      </div>
      <div className="fl-line">
        <div className="fl-end">
          <b>{clock(w.depart)}</b>
          <small>{weekdayDay(w.depart)}</small>
        </div>
        <div className="fl-mid">
          <span className="fl-dur">{hours(w.total_hours)}</span>
          <div className="fl-track" aria-hidden="true">{stops.map((_, i) => <i key={i} />)}</div>
          <div className="fl-stops">
            {stops.length === 0 ? <span>Direct</span> : stops.map((s, i) => {
              const at = name(s.code)
              return <span key={i}><b>{s.code}</b>{at !== s.code && ` ${at}`}{s.text && ` ${s.text}`}</span>
            })}
          </div>
        </div>
        <div className="fl-end to">
          <b>{clock(w.arrive)}<sup>{nextDayMark(w.depart, w.arrive)}</sup></b>
          <small data-other={w.arrive.slice(0, 10) !== w.depart.slice(0, 10)}>{weekdayDay(w.arrive)}</small>
        </div>
      </div>
      <WayState total={r.total} state={picked ? 'picked' : r.works ? 'pick' : 'none'} label={label} onPick={onPick} />
      {notes.length > 0 && (
        <ul className="fl-notes">
          {notes.map((x) => <li key={x.text} data-bad={!!x.bad} data-strong={!!x.strong}>{x.text}</li>)}
        </ul>
      )}
    </div>
  )
}

/** The ways of one day. Its own part, so Show all starts over with each day. */
function DayList({ rows, current, dir, other, data, name, onPick }: {
  rows: WayRow[]; current: string; dir: 'in' | 'home'; other: Way; data: AppData; name: (code: string) => string; onPick: (r: WayRow) => void
}) {
  const [all, setAll] = useState(false)
  const shown = all ? rows : rows.slice(0, SHOWN)
  return (
    <>
      <ol className="fl-rows">
        {shown.map((r) => (
          <li key={r.way.id}>
            <WayRowView r={r} picked={r.way.id === current} dir={dir} other={other} data={data} name={name} onPick={() => onPick(r)} />
          </li>
        ))}
      </ol>
      {rows.length > SHOWN && <button type="button" className="btn small fl-all" onClick={() => setAll((x) => !x)}>{all ? 'Show fewer' : `Show all ${rows.length}`}</button>}
    </>
  )
}

export function WaySheet({ dir, way, other, data, tripId, onPick, onChangeEnds, close }: {
  dir: 'in' | 'home'
  /** the way the trip has in this direction */
  way: Way
  /** the way the trip has in the other direction */
  other: Way
  data: AppData
  /** the trip, so a flight picked on Momondo finds its way back */
  tripId?: string
  onPick: (c: WayChoice) => void
  onChangeEnds: () => void
  close: () => void
}) {
  const { inout, map } = data
  const current = useMemo(() => (dir === 'in' ? { wayIn: way, wayHome: other } : { wayIn: other, wayHome: way }), [dir, way, other])
  const byDay = useMemo(() => wayRowsByDay(inout, way, current), [inout, way, current])
  const days = useMemo(() => Object.keys(byDay).sort(), [byDay])
  const fares = useMemo(() => rowFares(byDay), [byDay])
  const [at, setAt] = useState(() => dayOf(way))
  const [said, setSaid] = useState<{ text: string; n: number } | null>(null)
  const status = useRef<HTMLParagraphElement>(null)
  // the order a day's ways had when it was first looked at, so a pick never moves a row from under the pointer
  const order = useRef<Record<string, string[]>>({})
  const name = (code: string) => shortPlace(inout.airports[code]?.name ?? map.nodes.find((n) => n.iata === code)?.name ?? code)

  const found = byDay[at] ?? []
  if (found.length && !order.current[at]) {
    const ids = found.map((r) => r.way.id)
    // the way the trip has comes first on its day, so the sheet opens on what you have
    order.current[at] = ids.includes(way.id) ? [way.id, ...ids.filter((id) => id !== way.id)] : ids
  }
  const seen = order.current[at] ?? []
  const place = (id: string) => { const i = seen.indexOf(id); return i < 0 ? seen.length : i }
  const rows = [...found].sort((a, b) => place(a.way.id) - place(b.way.id))

  // the pressed Pick turns into the Picked mark, so the focus goes to the line that says what changed
  useEffect(() => { if (said) status.current?.focus({ preventScroll: true }) }, [said])

  const pick = (r: WayRow) => {
    onPick(r.choice)
    if (r.choice.note) setSaid({ text: r.choice.note, n: (said?.n ?? 0) + 1 })
    else close()
  }
  const links: readonly FlightLink[] = at === dayOf(way)
    ? wayLinks(way, inout, other)
    : [{ href: momondoUrl(way.from, way.to, at, tripId), site: 'Momondo', saved: false, legs: [{ from: way.from, to: way.to, date: at }] }]

  return (
    <div className="fl ws">
      <div className="fl-top">
        <header className="fl-h">
          <h3>{name(way.from)} to {name(way.to)}</h3>
          <small>{dir === 'in' ? 'Way in' : 'Way home'}, {way.from} to {way.to}</small>
        </header>
        <Days days={days} fares={fares} at={at} leg={dayOf(way)} onChange={setAt} />
        <div className="fl-bar">
          <b>{weekdayDay(at)}</b>
          {rows.length > 0 && <span>{rows.length === 1 ? '1 way' : `${rows.length} ways`}, prices for both ways</span>}
        </div>
        <p ref={status} className="ws-said" role="status" tabIndex={-1}>
          {said && <span key={said.n} className="ws-said-in"><Check /><span>{said.text}</span></span>}
        </p>
      </div>
      <div className="fl-list">
        {rows.length === 0
          ? <div className="fl-none"><p>No ways saved for {weekdayDay(at)}</p></div>
          : <DayList key={at} rows={rows} current={way.id} dir={dir} other={other} data={data} name={name} onPick={pick} />}
      </div>
      <footer className="fl-foot">
        <FlightLinks links={links} />
        <button type="button" className="btn small" onClick={() => { close(); onChangeEnds() }}>Change start and end</button>
      </footer>
    </div>
  )
}
