import type { CSSProperties, ReactNode } from 'react'
import type { Family } from '@map/data/types'
import { Flag, hasFlag } from '@map/map/Flag'
import type { AppData, MapNode, Way } from '../../data/types'
import { usePairDates } from '../../data/pairDates'
import { useStore } from '../../store'
import { clock, day, hours, weekdayDay } from '../../lib/format'
import { legDay, nightTrade, nodeForAirport, nodeName, type Journey, type Schedule, type Warning } from '../../lib/journey'
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

// The route as a story, read top to bottom. A plain rail runs down the left with the dates beside
// it, from Copenhagen and back to it. Stops sit on the rail as their flag, the name and the nights.
// Travel between two stops is a line with its mode and length. Click it for its ticket. The date a leg leaves sits in the gutter, and
// a click on it opens the calendar. A stop reached the day its leg leaves does not say the date
// again. A leg that leaves before you get there shows it on its own date, with the day to move it to.

const MODE: Record<Family, string> = { flight: 'Flight', boat: 'Boat', ground: 'Bus' }
/** "Thu" for a date */
const wd = (d: string) => weekdayDay(d).split(' ')[0]

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

/** The date beside the rail. None when the leg above has it. */
function Gutter({ date, est }: { date: string | null; est: boolean }) {
  return <span className="st-gut" data-est={est}>{date && <b>{est ? '~' : ''}{day(date)}</b>}</span>
}

/** Shut a popover. Shown on a phone, where the popover is a sheet and there is no outside to click. */
function Shut({ on }: { on: () => void }) {
  return <button type="button" className="pop-x" aria-label="Close" onClick={on}><Close /></button>
}

/** A stop: flag on the rail, the city and the nights there, which you can change. Copenhagen has no nights. */
function Stop({ id, name, node, country, inDay, days, exact, dated, onLess, onMore, home }: {
  id?: string
  name: string; node: MapNode | undefined; country: string; inDay: string | null; days: number; exact: boolean
  /** the date beside the rail: shown, shown and known, or left to the leg above */
  dated: 'est' | 'known' | null
  /** a night less or more here, traded with the stop beside, or null when no stop beside can trade */
  onLess: (() => void) | null
  onMore: (() => void) | null
  /** Copenhagen, where the trip starts and ends */
  home?: 'start' | 'end'
}) {
  const est = !exact
  return (
    <li id={id} className="st-stop" data-home={home} style={{ '--nights': home ? 0 : Math.min(days, 12) } as CSSProperties}>
      <Gutter date={dated ? inDay : null} est={dated === 'est'} />
      <span className="st-rail"><Disc country={country} /></span>
      <div className="st-body st-card">
        <span className="st-nm"><b {...hoverProps(node)}>{name}</b></span>
        {!home && (
          <span className="st-nights" data-est={est}>
            {onLess || onMore ? (
              <span className="st-step" role="group" aria-label={`Nights in ${name}`}>
                <button type="button" aria-label={`One night less in ${name}`} disabled={!onLess} onClick={onLess ?? undefined}><Minus /></button>
                <b>{est ? '~' : ''}{days}</b>
                <button type="button" aria-label={`One night more in ${name}`} disabled={!onMore} onClick={onMore ?? undefined}><Plus /></button>
              </span>
            ) : <b>{est ? '~' : ''}{days}</b>}
            <small>{days === 1 ? 'night' : 'nights'}</small>
          </span>
        )}
      </div>
    </li>
  )
}

/**
 * Travel between two stops. The date it leaves sits in the gutter, a button to the calendar when the
 * day can move. The body is the leg drawn, with its ticket behind it.
 */
function Leg({ fam, tone, route, date, set, known, picker, ribbon, card, aria, clash, fromName, onSet }: {
  fam: Family
  tone?: 'in' | 'home'
  route: string
  date: string; set: boolean; known: boolean
  /** the calendar, or null for a long-haul way whose day the ticket fixes */
  picker: ReactNode | null
  ribbon: ReactNode; card: ReactNode
  aria: string
  /** the warning when this leg leaves before you get there */
  clash?: Warning
  fromName: string
  onSet?: (date: string) => void
}) {
  const when = usePop(false)
  const pop = usePop(false)
  return (
    <li className="st-leg" data-f={fam} data-tone={tone}>
      <span className="st-gut">
        {picker ? (
          <span className="pop-wrap" {...when.wrap}>
            <button type="button" className="st-date st-when" data-set={set} data-known={known} data-clash={!!clash} aria-label={`${route}, leaves ${weekdayDay(date)}${known ? '' : ', estimated'}${clash ? ', before you get there' : ''}. Change the day`} {...when.trigger}>
              <b>{known ? '' : '~'}{day(date)}</b>
              <small>{wd(date)}</small>
            </button>
            {when.open && <div className="pop wide" role="dialog" aria-label={`When ${route} leaves`} {...when.panel}><Shut on={when.dismiss} />{picker}</div>}
          </span>
        ) : (
          <span className="st-when" aria-label={`Leaves ${weekdayDay(date)}`}>
            <b>{day(date)}</b>
            <small>{wd(date)}</small>
          </span>
        )}
      </span>
      <span className="st-rail" />
      <div className="st-body pop-wrap" {...pop.wrap}>
        <button type="button" className="st-hop" aria-label={aria} {...pop.trigger}>{ribbon}</button>
        {pop.open && <div className={`pop${tone ? ' way' : ''}`} role="dialog" aria-label={route} {...pop.panel}><Shut on={pop.dismiss} />{card}</div>}
      </div>
      {clash && (
        <p className="st-clash" role="alert">
          <Warn />Leaves before you get to {fromName}
          {clash.fix && onSet && <button type="button" className="btn small" onClick={() => onSet(clash.fix!)}>Move to {day(clash.fix)}</button>}
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

/** A leg as a line with its mode and length in the middle. */
function Line({ fam, dur, overnight }: { fam: Family; dur: number | null | undefined; overnight: boolean }) {
  const Icon = ICON[fam]
  return (
    <>
      <i className="st-hl" />
      <span className="st-hm">
        <Icon s={14} />
        {dur != null && <span>{hours(dur)}</span>}
        {overnight && <span className="st-moon" title="Overnight"><Moon /></span>}
      </span>
      <i className="st-hl" />
    </>
  )
}

export function Story({ data, journey, sched, wayIn, wayHome }: { data: AppData; journey: Journey; sched: Schedule; wayIn: Way; wayHome: Way }) {
  const { inout, map } = data
  const pd = usePairDates()
  const setHopDate = useStore((s) => s.setHopDate)
  const trade = (i: number, more: boolean) => {
    const t = nightTrade(journey, sched, i, more)
    return t ? () => t.forEach((c) => setHopDate(c.hop, c.date)) : null
  }
  const nm = (id: string) => nodeName(map, inout, id)
  const node = (id: string) => map.nodes.find((n) => n.id === id)
  const countryOf = (id: string) => node(id)?.country ?? inout.airports[id]?.country ?? ''
  const homeDay = sched.homeDepart.slice(0, 10)
  const ps = journey.places
  const cph = { name: inout.airports[wayIn.from]?.name ?? 'Copenhagen', country: inout.airports[wayIn.from]?.country ?? 'DK' }
  const firstNode = ps[0]?.node
  const exitNode = nodeForAirport(inout, wayHome.from)
  const wayAria = (w: Way, a: string, b: string) => `Flight ${a} to ${b}, leaves ${weekdayDay(w.depart)} ${clock(w.depart)}, ${hours(w.total_hours)}. Details`

  const items: ReactNode[] = [
    <Stop key="cph0" name={cph.name} node={undefined} country={cph.country} inDay={null} days={0} exact dated={null} onLess={null} onMore={null} home="start" />,
    <Leg
      key="in" fam="flight" tone="in" route={`${cph.name} to ${nm(firstNode)}`}
      date={wayIn.depart.slice(0, 10)} set known picker={null} fromName={cph.name}
      aria={wayAria(wayIn, cph.name, nm(firstNode))}
      ribbon={<Line fam="flight" dur={wayIn.total_hours} overnight={false} />}
      card={<WayCard way={wayIn} other={wayHome} data={data} />}
    />,
  ]
  // the day the last leg left, so the stop it reaches that day does not say the date again
  let legDate: string = wayIn.depart.slice(0, 10)
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
      legDate = date
      items.push(
        <Leg
          key={`h${i}`}
          fam={fam}
          route={route}
          date={date}
          set={!!h.date}
          known={!!(h.date || h.flight)}
          clash={sched.warnings.find((w) => w.leg === i)}
          fromName={ends.fromName}
          onSet={(d) => setHopDate(i, d)}
          aria={`${MODE[fam]} ${route}, leaves ${weekdayDay(date)}${dur != null ? `, ${hours(dur)}` : ''}${h.overnight ? ', overnight' : ''}. Details`}
          ribbon={<Line fam={fam} dur={h.flight?.hours ?? h.hours} overnight={!!h.overnight} />}
          picker={<WhenPicker date={date} set={!!h.date} min={min} max={max} firstDay={sched.firstDay} fares={fares} stay={{ name: nm(ps[i - 1].node), inDay: prev.inDay }} codes={codes} onSet={(d) => setHopDate(i, d)} />}
          card={<LegCard h={h} ends={ends} family={fam} date={date} quotes={quotes} link={hopLink(h, inout)} />}
        />,
      )
    }
    const sp = sched.places[i]
    items.push(
      <Stop
        key={`s${i}`}
        id={`st-${i}`}
        name={nm(p.node)}
        node={node(p.node)}
        country={countryOf(p.node)}
        inDay={sp.inDay}
        days={sp.days}
        exact={sp.exact}
        dated={legDate === sp.inDay ? null : sp.exact ? 'known' : 'est'}
        onLess={trade(i, false)}
        onMore={trade(i, true)}
      />,
    )
    legDate = ''
  })
  items.push(
    <Leg
      key="home" fam="flight" tone="home" route={`${nm(exitNode)} to ${cph.name}`}
      date={homeDay} set known picker={null} fromName={nm(exitNode)}
      aria={wayAria(wayHome, nm(exitNode), cph.name)}
      ribbon={<Line fam="flight" dur={wayHome.total_hours} overnight={false} />}
      card={<WayCard way={wayHome} other={wayIn} data={data} />}
    />,
    <Stop
      key="cph1" name={cph.name} node={undefined} country={cph.country}
      inDay={wayHome.arrive ? wayHome.arrive.slice(0, 10) : null} days={0} exact
      dated={wayHome.arrive && wayHome.arrive.slice(0, 10) !== homeDay ? 'known' : null}
      onLess={null} onMore={null} home="end"
    />,
  )

  return <ol className="st">{items}</ol>
}
