import type { CSSProperties, ReactNode } from 'react'
import type { Family } from '@map/data/types'
import { Flag, hasFlag } from '@map/map/Flag'
import type { AppData, MapNode, Way } from '../../data/types'
import { usePairDates } from '../../data/pairDates'
import { useStore } from '../../store'
import { clock, day, dayDiff, dayRange, hours, weekdayDay } from '../../lib/format'
import { legDay, nodeForAirport, nodeName, type Hop, type Journey, type Schedule, type Warning } from '../../lib/journey'
import { iataOf, pricesOn, type PairDates } from '../../lib/prices'
import { familyOf } from '../../lib/route'
import { countryName } from '../../lib/colors'
import { hopLink, wayLinks } from '../../lib/links'
import { addDays, dateRange } from '../../lib/time'
import { hoverProps } from '../PlaceCard'
import { WayTrack } from '../WayCard'
import { FlightLinks } from '../FlightLinks'
import { Boat, Bus, Close, Home, Land, Minus, Moon, Plane, Plus, Warn } from '../icons'
import { LegCard, type LegEnds } from './LegCard'
import { WhenPicker } from './WhenPicker'
import { usePop } from './usePop'

// The route as a story, read top to bottom like the flag strip on the hero is read left to right.
// A plain rail runs down the left with the dates beside it. Stops are chapters on the rail, tall in
// proportion to the nights there. Travel is a quiet line between two stops with the mode and the
// time it takes on it: click it for the boarding pass. The date a leg leaves sits in the gutter, and
// a click on it opens the calendar. A stop reached the day its leg leaves shows only its trip day.
// A leg that leaves before you get there shows it on its own date, with the day to move it to.

const MODE: Record<Family, string> = { flight: 'Flight', boat: 'Boat', ground: 'Bus' }
const ICON: Record<Family, (p: { s?: number }) => ReactNode> = { flight: Plane, boat: Boat, ground: Bus }
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

function Disc({ country, ring }: { country: string; ring?: 'in' | 'out' }) {
  return (
    <span className="st-disc" data-ring={ring} title={countryName(country)}>
      {hasFlag(country) ? <Flag code={country} size={22} /> : <span className="st-nf">{country || '?'}</span>}
    </span>
  )
}

/** The date beside the rail, with the day of the trip under it. No date when the leg above has it. */
function Gutter({ n, date, est }: { n: number | null; date: string | null; est: boolean }) {
  return (
    <span className="st-gut" data-est={est}>
      {date && <b>{est ? '~' : ''}{day(date)}</b>}
      {n != null && <small>Day {n}</small>}
    </span>
  )
}

/** Shut a popover. Shown on a phone, where the popover is a sheet and there is no outside to click. */
function Shut({ on }: { on: () => void }) {
  return <button type="button" className="pop-x" aria-label="Close" onClick={on}><Close /></button>
}

/** The way in or home: an end of the rail. Click it for its track. */
function End({ dir, way, other, data, dayN, place }: { dir: 'in' | 'home'; way: Way; other: Way; data: AppData; dayN: number; place: string }) {
  const pop = usePop(false)
  const at = dir === 'in' ? way.arrive : way.depart
  return (
    <li className={`st-end ${dir}`}>
      <Gutter n={dayN} date={at} est={false} />
      <span className="st-rail"><span className="st-io">{dir === 'in' ? <Land s={14} /> : <Home s={14} />}</span></span>
      <div className="st-body pop-wrap" {...pop.wrap}>
        <button type="button" className="st-endbtn" {...pop.trigger}>
          <b>{dir === 'in' ? `Land in ${place}` : `Fly home from ${place}`}</b>
          <small>{clock(at)} · {hours(way.total_hours)} {dir === 'in' ? 'from' : 'to'} Copenhagen · {way.flights} {way.flights === 1 ? 'flight' : 'flights'}</small>
        </button>
        {pop.open && (
          <div className="pop" role="dialog" aria-label={dir === 'in' ? 'The way in' : 'The way home'} {...pop.panel}>
            <Shut on={pop.dismiss} />
            <WayTrack way={way} airports={data.inout.airports} compact />
            <FlightLinks links={wayLinks(way, data.inout, other)} />
          </div>
        )}
      </div>
    </li>
  )
}

/** A stop: flag on the rail, the city, its dates, and the nights there, which you can change. */
function Stop({ name, node, country, inDay, outDay, days, exact, dated, onNights, last, dayN }: {
  name: string; node: MapNode | undefined; country: string; inDay: string; outDay: string; days: number; exact: boolean
  /** the date beside the rail: shown, shown and known, or left to the leg above */
  dated: 'est' | 'known' | null
  /** set the nights here, or null when the flight home decides them */
  onNights: ((n: number) => void) | null
  last: boolean
  /** the trip day beside the rail, null when the row above says it */
  dayN: number | null
}) {
  const est = !exact
  return (
    <li className="st-stop" style={{ '--nights': Math.min(days, 12) } as CSSProperties} data-last={last}>
      <Gutter n={dayN} date={dated ? inDay : null} est={dated === 'est'} />
      <span className="st-rail"><Disc country={country} /></span>
      <div className="st-body st-card">
        <span className="st-nm">
          <b {...hoverProps(node)}>{name}</b>
          <small>{countryName(country)} · {est ? '~' : ''}{dayRange(inDay, outDay)}</small>
          {node?.profile?.tagline && <span className="st-tag">{node.profile.tagline}</span>}
        </span>
        <span className="st-nights" data-est={est}>
          {onNights ? (
            <span className="st-step" role="group" aria-label={`Nights in ${name}`}>
              <button type="button" aria-label={`One night less in ${name}`} disabled={days <= 0} onClick={() => onNights(days - 1)}><Minus /></button>
              <b>{est ? '~' : ''}{days}</b>
              <button type="button" aria-label={`One night more in ${name}`} onClick={() => onNights(days + 1)}><Plus /></button>
            </span>
          ) : <b>{est ? '~' : ''}{days}</b>}
          <small>{days === 1 ? 'night' : 'nights'}{onNights ? '' : ' until home'}</small>
        </span>
      </div>
    </li>
  )
}

/**
 * Travel between two stops. The date it leaves sits in the gutter and opens the calendar. The body is
 * a line in the mode's stroke with the mode and the time it takes on it, and the boarding pass behind.
 */
function Leg({ h, ends, date, set, known, clash, onSet, picker, card }: {
  h: Hop; ends: LegEnds; date: string; set: boolean; known: boolean
  /** the warning when this leg leaves before you get there */
  clash: Warning | undefined
  onSet: (date: string) => void
  picker: ReactNode; card: ReactNode
}) {
  const when = usePop(false)
  const pop = usePop(false)
  const fam = familyOf(h.mode)
  const Icon = ICON[fam]
  const dur = h.flight?.hours ?? h.hours
  const route = `${ends.fromName} to ${ends.toName}`
  return (
    <li className="st-leg" data-f={fam}>
      <span className="st-gut">
        <span className="pop-wrap" {...when.wrap}>
          <button type="button" className="st-date" data-set={set} data-known={known} data-clash={!!clash} aria-label={`${route}, leaves ${weekdayDay(date)}${known ? '' : ', estimated'}${clash ? ', before you get there' : ''}. Change the day`} {...when.trigger}>
            <b>{known ? '' : '~'}{day(date)}</b>
            <small>{wd(date)}</small>
          </button>
          {when.open && <div className="pop wide" role="dialog" aria-label={`When ${route} leaves`} {...when.panel}><Shut on={when.dismiss} />{picker}</div>}
        </span>
      </span>
      <span className="st-rail" />
      <div className="st-body pop-wrap" {...pop.wrap}>
        <button type="button" className="st-hop" aria-label={`${MODE[fam]} ${route}${dur != null ? `, ${hours(dur)}` : ''}${h.overnight ? ', overnight' : ''}. Details`} {...pop.trigger}>
          <i className="st-hl" />
          <span className="st-hm">
            <Icon s={14} />
            <span data-none={dur == null || undefined}>{dur != null ? hours(dur) : 'time ?'}</span>
            {h.overnight && <span className="st-moon" title="Overnight"><Moon /></span>}
          </span>
          <i className="st-hl" />
        </button>
        {pop.open && <div className="pop" role="dialog" aria-label={route} {...pop.panel}><Shut on={pop.dismiss} />{card}</div>}
      </div>
      {clash && (
        <p className="st-clash" role="alert">
          <Warn />Leaves before you get to {ends.fromName}
          {clash.fix && <button type="button" className="btn small" onClick={() => onSet(clash.fix!)}>Move to {day(clash.fix)}</button>}
        </p>
      )}
    </li>
  )
}

export function Story({ data, journey, sched, wayIn, wayHome }: { data: AppData; journey: Journey; sched: Schedule; wayIn: Way; wayHome: Way }) {
  const { inout, map } = data
  const pd = usePairDates()
  const setHopDate = useStore((s) => s.setHopDate)
  const nm = (id: string) => nodeName(map, inout, id)
  const node = (id: string) => map.nodes.find((n) => n.id === id)
  const countryOf = (id: string) => node(id)?.country ?? inout.airports[id]?.country ?? ''
  const tripDay = (d: string) => dayDiff(sched.firstDay, d) + 1
  const homeDay = sched.homeDepart.slice(0, 10)
  const ps = journey.places

  const items: ReactNode[] = [
    <End key="in" dir="in" way={wayIn} other={wayHome} data={data} dayN={1} place={nm(nodeForAirport(inout, wayIn.to))} />,
  ]
  // the day the last leg left, so the stop it reaches that day does not say the date again
  let legDate: string | null = null
  ps.forEach((p, i) => {
    legDate = null
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
      legDate = date
      items.push(
        <Leg
          key={`h${i}`}
          h={h}
          ends={ends}
          date={date}
          set={!!h.date}
          known={!!(h.date || h.flight)}
          clash={sched.warnings.find((w) => w.leg === i)}
          onSet={(d) => setHopDate(i, d)}
          picker={<WhenPicker date={date} set={!!h.date} min={min} max={max} firstDay={sched.firstDay} fares={fares} stay={{ name: nm(ps[i - 1].node), inDay: prev.inDay }} codes={codes} onSet={(d) => setHopDate(i, d)} />}
          card={<LegCard h={h} ends={ends} family={fam} date={date} quotes={quotes} link={hopLink(h, inout)} />}
        />,
      )
    }
    const sp = sched.places[i]
    const next = ps[i + 1]
    items.push(
      <Stop
        key={`s${i}`}
        name={nm(p.node)}
        node={node(p.node)}
        country={countryOf(p.node)}
        inDay={sp.inDay}
        outDay={sp.outDay}
        days={sp.days}
        exact={sp.exact}
        dated={i === 0 || legDate === sp.inDay ? null : sp.exact ? 'known' : 'est'}
        last={i === ps.length - 1}
        dayN={i === 0 ? null : tripDay(sp.inDay)}
        onNights={next?.hop ? (n) => setHopDate(i + 1, addDays(sp.inDay, Math.max(0, n))) : null}
      />,
    )
  })
  items.push(<End key="home" dir="home" way={wayHome} other={wayIn} data={data} dayN={tripDay(homeDay)} place={nm(nodeForAirport(inout, wayHome.from))} />)

  return <ol className="st">{items}</ol>
}
