import { useState, type ReactNode } from 'react'
import type { Family } from '@map/data/types'
import { Flag, hasFlag } from '@map/map/Flag'
import type { AppData, MapNode, Way } from '../../data/types'
import { usePairDates } from '../../data/pairDates'
import { useStore } from '../../store'
import { clock, day, hours, weekdayDay } from '../../lib/format'
import { giveNight, legDay, nodeForAirport, nodeName, takeNight, type Journey, type NightMove, type Schedule, type Warning } from '../../lib/journey'
import { iataOf, pricesOn, type PairDates } from '../../lib/prices'
import { familyOf } from '../../lib/route'
import { countryName } from '../../lib/colors'
import { hopLink, wayLinks } from '../../lib/links'
import { dateRange } from '../../lib/time'
import { hoverProps } from '../PlaceCard'
import { WayTrack } from '../WayCard'
import { FlightLinks } from '../FlightLinks'
import { Boat, Bus, Close, Minus, Moon, Pin, Plane, Plus, Warn } from '../icons'
import { LegCard, type LegEnds } from './LegCard'
import { WhenPicker } from './WhenPicker'
import { usePop } from './usePop'

// The route as a story, read top to bottom, from Copenhagen and back to it. A stop is one line, its
// flag, its name and at the right edge its nights. A leg is one line too, the day it leaves and then
// its mode and length, and the rail beside it draws the leg in its mode the way the map does. So
// every date sits on a leg, in one column, and they can only ever be evenly spaced. A click on the
// day opens the calendar, a click on the mode opens the ticket. A leg says when it arrives only if
// that is another day. A leg that leaves before you get there says so, with the day to move it to.
// The earliest stop decides its nights: a night more comes from a later stop you choose, a night
// less is a free night, shown as a line of its own before the flight home, and no stop gets it.

const MODE: Record<Family, string> = { flight: 'Flight', boat: 'Boat', ground: 'Bus' }
/** the cheapest fare known for a leg on each day of a window */
function faresFor(pd: PairDates | null, from: string | null, to: string | null, days: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  if (!pd || !from || !to) return out
  for (const d of days) {
    const q = pricesOn(pd, from, to, d)[0]
    if (q) out[d] = q.p
  }
  return out
}

function Disc({ country }: { country: string }) {
  return (
    <span className="st-disc" title={countryName(country) || undefined}>
      {hasFlag(country) ? <Flag code={country} size={22} /> : <span className="st-nf">{country || <Pin s={14} />}</span>}
    </span>
  )
}

/** "Wed 2 Dec" in three columns, so the dates down the route line up. */
function When({ date }: { date: string }) {
  const [wd, d, mon] = weekdayDay(date).split(' ')
  return <><small>{wd}</small><b>{d}</b><b>{mon}</b></>
}

/** Shut a popover. Shown on a phone, where the popover is a sheet and there is no outside to click. */
function Shut({ on }: { on: () => void }) {
  return <button type="button" className="pop-x" aria-label="Close" onClick={on}><Close /></button>
}

/** Where a night can come from. take is null when it has none to give. */
interface NightRow {
  from: number | 'free'
  name: string
  nights: number
  take: (() => void) | null
}

function Nights({ n }: { n: number }) {
  return <><b>{n}</b> {n === 1 ? 'night' : 'nights'}</>
}

/**
 * Where a night more comes from. It stays open, so several nights can move and the route behind
 * follows. The rows are the ones that had a night when it opened, so none leaves from under the
 * pointer: one that runs out stays, dimmed. The stop it fills is on top, in the same shape.
 */
function NightChooser({ name, days, rows }: { name: string; days: number; rows: NightRow[] }) {
  const [shown] = useState(() => new Set(rows.filter((r) => r.take).map((r) => r.from)))
  return (
    <>
      <p className="nf-to"><b>{name}</b><span className="st-nights"><Nights n={days} /></span></p>
      <p className="nf-h">Take a night from</p>
      <ul className="nf-list">
        {rows.filter((r) => shown.has(r.from)).map((r) => (
          <li key={r.from}>
            <button type="button" className="nf-row" disabled={!r.take} aria-label={`Take a night from ${r.name}, it has ${r.nights}`} onClick={r.take ?? undefined}>
              <span>{r.name}</span>
              <span className="st-nights"><Nights n={r.nights} /></span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

/** A stop: flag on the rail, the city, and at the right edge the nights there, which you can change. Copenhagen has no nights. */
function Stop({ id, name, node, country, days, exact, onLess, rows, home }: {
  id?: string
  name: string; node: MapNode | undefined; country: string; days: number; exact: boolean
  /** a night less here, or null when it has none */
  onLess: (() => void) | null
  /** where a night more can come from */
  rows: NightRow[]
  /** Copenhagen, where the trip starts and ends */
  home?: 'start' | 'end'
}) {
  const pop = usePop(false)
  const less = `One night less in ${name}, it becomes a free night`
  return (
    <li id={id} className="st-stop" data-home={home}>
      <span className="st-rail"><Disc country={country} /></span>
      <div className="st-card">
        <b className="st-name" {...hoverProps(node)}>{name}</b>
        {!home && (
          <span className="st-step" role="group" aria-label={`Nights in ${name}`}>
            <button type="button" className="st-n" aria-label={less} title={less} disabled={!onLess} onClick={onLess ?? undefined}><Minus /></button>
            <span className="pop-wrap" {...pop.wrap}>
              <button type="button" className="st-n" aria-label={`One night more in ${name}, choose where from`} disabled={!rows.some((r) => r.take)} {...pop.trigger}><Plus /></button>
              {pop.open && <div className="pop nf" role="group" aria-label="Take a night from" {...pop.panel}><Shut on={pop.dismiss} /><NightChooser name={name} days={days} rows={rows} /></div>}
            </span>
          </span>
        )}
        {!home && (
          <span className="st-nights" data-est={!exact} aria-live="polite">
            {days ? <Nights n={days} /> : 'Passing through'}
          </span>
        )}
      </div>
    </li>
  )
}

/**
 * Travel between two stops, one line: the day it leaves, a button to the calendar when the day can
 * move, then its mode and length with its ticket behind them. The rail is the leg drawn.
 */
function Leg({ fam, tone, route, date, arrives, set, known, picker, travel, card, aria, clash, stale, fromName, onSet }: {
  fam: Family
  tone?: 'in' | 'home'
  route: string
  date: string
  /** the day it gets there, when that is not the day it leaves */
  arrives?: string | null
  set: boolean; known: boolean
  /** the calendar, or null for a long-haul way whose day the ticket fixes */
  picker: ReactNode | null
  travel: ReactNode; card: ReactNode
  aria: string
  /** the warning when this leg leaves before you get there */
  clash?: Warning
  /** the warning when the flight picked for this leg leaves on another day */
  stale?: Warning
  fromName: string
  onSet?: (date: string) => void
}) {
  const when = usePop(false)
  const pop = usePop(false)
  return (
    <li className="st-leg" data-f={fam} data-tone={tone}>
      <span className="st-rail" />
      <div className="st-line">
        {picker ? (
          <span className="pop-wrap" {...when.wrap}>
            <button type="button" className="st-date st-when" data-set={set} data-known={known} data-clash={!!clash} aria-label={`${route}, leaves ${weekdayDay(date)}${known ? '' : ', estimated'}${clash ? ', before you get there' : ''}. Change the day`} {...when.trigger}>
              <When date={date} />
            </button>
            {when.open && <div className="pop wide" role="dialog" aria-label={`When ${route} leaves`} {...when.panel}><Shut on={when.dismiss} />{picker}</div>}
          </span>
        ) : (
          <span className="st-when" aria-label={`Leaves ${weekdayDay(date)}`}>
            <When date={date} />
          </span>
        )}
        <span className="pop-wrap" {...pop.wrap}>
          <button type="button" className="st-hop" aria-label={aria} {...pop.trigger}>{travel}</button>
          {pop.open && <div className={`pop${tone ? ' way' : ''}`} role="dialog" aria-label={route} {...pop.panel}><Shut on={pop.dismiss} />{card}</div>}
        </span>
        {arrives && <span className="st-arrives">Arrives {day(arrives)}</span>}
      </div>
      {clash && (
        <p className="st-clash" role="alert">
          <Warn /><span>Leaves before you get to {fromName}</span>
          {clash.fix && onSet && <button type="button" className="btn small" onClick={() => onSet(clash.fix!)}>Move to {day(clash.fix)}</button>}
        </p>
      )}
      {stale?.fix && (
        <p className="st-clash" data-level="warn">
          <Warn /><span>The flight you picked leaves {day(stale.fix)}</span>
          {onSet && <button type="button" className="btn small" onClick={() => onSet(stale.fix!)}>Move to {day(stale.fix)}</button>}
        </p>
      )}
    </li>
  )
}

/** The ticket behind a long-haul way: the day it leaves, its track to scale and where to book it. */
function WayCard({ way, other, data }: { way: Way; other: Way; data: AppData }) {
  return (
    <div className="lc way">
      <header className="lc-head"><b className="lc-when">Leaves {weekdayDay(way.depart)}</b></header>
      <WayTrack way={way} airports={data.inout.airports} />
      <FlightLinks links={wayLinks(way, data.inout, other)} />
    </div>
  )
}

const ICON: Record<Family, (p: { s?: number }) => ReactNode> = { flight: Plane, boat: Boat, ground: Bus }

/** A leg's mode and length. The word for the mode when the length is not known. */
function Travel({ fam, dur, overnight }: { fam: Family; dur: number | null | undefined; overnight: boolean }) {
  const Icon = ICON[fam]
  return (
    <>
      <Icon s={14} />
      <span>{dur != null ? hours(dur) : MODE[fam]}</span>
      {overnight && <span className="st-moon" title="Overnight"><Moon /></span>}
    </>
  )
}

export function Story({ data, journey, sched, wayIn, wayHome }: { data: AppData; journey: Journey; sched: Schedule; wayIn: Way; wayHome: Way }) {
  const { inout, map } = data
  const pd = usePairDates()
  const setHopDate = useStore((s) => s.setHopDate)
  const moveNights = useStore((s) => s.moveNights)
  const press = (m: NightMove | null) => (m ? () => moveNights(m) : null)
  const nm = (id: string) => nodeName(map, inout, id)
  const nightRows = (i: number): NightRow[] => [
    { from: 'free', name: 'Free nights', nights: sched.free, take: press(takeNight(journey, sched, i, 'free')) },
    ...sched.places.flatMap((sp, k) => (k > i ? [{ from: k, name: nm(sp.node), nights: sp.days, take: press(takeNight(journey, sched, i, k)) }] : [])),
  ]
  const node = (id: string) => map.nodes.find((n) => n.id === id)
  const countryOf = (id: string) => node(id)?.country ?? inout.airports[id]?.country ?? ''
  const homeDay = sched.homeDepart.slice(0, 10)
  const ps = journey.places
  const cph = { name: inout.airports[wayIn.from]?.name ?? 'Copenhagen', country: inout.airports[wayIn.from]?.country ?? 'DK' }
  const firstNode = ps[0]?.node
  const exitNode = nodeForAirport(inout, wayHome.from)
  /** the day a leg gets there, when that is not the day it leaves */
  const later = (leaves: string, reaches: string | null | undefined) => (reaches && reaches.slice(0, 10) !== leaves.slice(0, 10) ? reaches.slice(0, 10) : null)
  const wayAria = (w: Way, a: string, b: string) => `Flight ${a} to ${b}, leaves ${weekdayDay(w.depart)} ${clock(w.depart)}, ${hours(w.total_hours)}. Details`

  const items: ReactNode[] = [
    <Stop key="cph0" name={cph.name} node={undefined} country={cph.country} days={0} exact onLess={null} rows={[]} home="start" />,
    <Leg
      key="in" fam="flight" tone="in" route={`${cph.name} to ${nm(firstNode)}`}
      date={wayIn.depart.slice(0, 10)} arrives={later(wayIn.depart, sched.places[0]?.inDay)} set known picker={null} fromName={cph.name}
      aria={wayAria(wayIn, cph.name, nm(firstNode))}
      travel={<Travel fam="flight" dur={wayIn.total_hours} overnight={false} />}
      card={<WayCard way={wayIn} other={wayHome} data={data} />}
    />,
  ]
  ps.forEach((p, i) => {
    if (p.hop && i > 0) {
      const h = p.hop
      const prev = sched.places[i - 1]
      const date = legDay(h, prev.outDay)
      const fam = familyOf(h.mode)
      const fromCode = iataOf(map, h.from)
      const toCode = iataOf(map, h.to)
      const ends: LegEnds = { from: h.from, to: h.to, fromName: nm(h.from), toName: nm(h.to), fromCode, toCode }
      const min = prev.inDay
      const max = homeDay
      const fares = fam === 'flight' ? faresFor(pd, fromCode, toCode, dateRange(min, max)) : {}
      if (h.flight) fares[h.flight.depart.slice(0, 10)] ??= h.flight.price_dkk
      const quotes = fromCode && toCode && pd ? pricesOn(pd, fromCode, toCode, date) : []
      const codes = fam === 'flight' && fromCode && toCode ? { from: fromCode, to: toCode } : null
      const dur = h.flight?.hours ?? h.hours
      const route = `${ends.fromName} to ${ends.toName}`
      items.push(
        <Leg
          key={`h${i}`}
          fam={fam}
          route={route}
          date={date}
          arrives={later(date, sched.places[i].inDay)}
          set={!!h.date}
          known={!!(h.date || h.flight)}
          clash={sched.warnings.find((w) => w.leg === i)}
          stale={sched.warnings.find((w) => w.picked === i)}
          fromName={ends.fromName}
          onSet={(d) => setHopDate(i, d)}
          aria={`${MODE[fam]} ${route}, leaves ${weekdayDay(date)}${dur != null ? `, ${hours(dur)}` : ''}${h.overnight ? ', overnight' : ''}. Details`}
          travel={<Travel fam={fam} dur={h.flight?.hours ?? h.hours} overnight={!!h.overnight} />}
          picker={<WhenPicker date={date} set={!!h.date} min={min} max={max} firstDay={sched.firstDay} fares={fares} stay={{ name: nm(ps[i - 1].node), inDay: prev.inDay }} codes={codes} onSet={(d) => setHopDate(i, d)} />}
          card={<LegCard h={h} ends={ends} family={fam} date={date} quotes={quotes} link={hopLink(h, inout)} />}
        />,
      )
    }
    const sp = sched.places[i]
    if (!p.hop && i > 0) {
      items.push(
        <li key={`g${i}`} className="st-gap">
          <span className="st-rail" />
          <div className="st-line"><span className="st-when" aria-label={`Reaches ${nm(p.node)} ${weekdayDay(sp.inDay)}`}><When date={sp.inDay} /></span></div>
        </li>,
      )
    }
    items.push(
      <Stop
        key={`s${i}`}
        id={`st-${i}`}
        name={nm(p.node)}
        node={node(p.node)}
        country={countryOf(p.node)}
        days={sp.days}
        exact={sp.exact}
        onLess={press(giveNight(journey, sched, i))}
        rows={nightRows(i)}
      />,
    )
  })
  if (sched.free > 0) {
    items.push(
      <li key="free" className="st-free">
        <span className="st-rail" />
        <div className="st-card">
          <span className="st-free-t">Free before the flight home</span>
          <span className="st-nights" aria-live="polite"><Nights n={sched.free} /></span>
        </div>
      </li>,
    )
  }
  items.push(
    <Leg
      key="home" fam="flight" tone="home" route={`${nm(exitNode)} to ${cph.name}`}
      date={homeDay} arrives={later(homeDay, wayHome.arrive)} set known picker={null} fromName={nm(exitNode)}
      aria={wayAria(wayHome, nm(exitNode), cph.name)}
      travel={<Travel fam="flight" dur={wayHome.total_hours} overnight={false} />}
      card={<WayCard way={wayHome} other={wayIn} data={data} />}
    />,
    <Stop key="cph1" name={cph.name} node={undefined} country={cph.country} days={0} exact onLess={null} rows={[]} home="end" />,
  )

  return <ol className="st">{items}</ol>
}
