import type { CSSProperties, ReactNode } from 'react'
import type { Family } from '@map/data/types'
import { Flag, hasFlag } from '@map/map/Flag'
import type { AppData, MapNode, Way } from '../../data/types'
import { usePairDates } from '../../data/pairDates'
import { useStore } from '../../store'
import { clock, dayDiff, dayRange, hours, kr, weekdayDay } from '../../lib/format'
import { legDay, nodeForAirport, nodeName, type Hop, type Journey, type Schedule } from '../../lib/journey'
import { iataOf, pricesOn, type PairDates } from '../../lib/prices'
import { familyOf } from '../../lib/route'
import { countryName } from '../../lib/colors'
import { hopLink, wayLinks } from '../../lib/links'
import { addDays, dateRange } from '../../lib/time'
import { hoverProps } from '../PlaceCard'
import { WayTrack } from '../WayCard'
import { FlightLinks } from '../FlightLinks'
import { Calendar, Home, Land, Minus, ModeChip, Moon, Plus } from '../icons'
import { LegCard, type LegEnds } from './LegCard'
import { WhenPicker } from './WhenPicker'
import { usePop } from './usePop'

// The route as a story, read top to bottom like the flag strip on the hero is read left to right.
// A rail runs down the left with the day of the trip beside it. Stops are chapters on the rail,
// tall in proportion to the nights there. Travel is the line between them, drawn the way the map
// draws it, with the leg riding on it as one pill: rest on it for the boarding pass, click to pin
// it. The day a leg leaves sits next to it and opens a picker by date, by trip day or by nights.

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

function Disc({ country, ring }: { country: string; ring?: 'in' | 'out' }) {
  return (
    <span className="st-disc" data-ring={ring} title={countryName(country)}>
      {hasFlag(country) ? <Flag code={country} size={22} /> : <span className="st-nf">{country || '?'}</span>}
    </span>
  )
}

function Gutter({ n, date, est }: { n: number; date: string; est: boolean }) {
  return (
    <span className="st-gut" data-est={est}>
      <b>Day {n}</b>
      <small>{est ? '~' : ''}{weekdayDay(date)}</small>
    </span>
  )
}

/** The way in or home: an end of the rail. Rest on it for its track. */
function End({ dir, way, other, data, dayN, place }: { dir: 'in' | 'home'; way: Way; other: Way; data: AppData; dayN: number; place: string }) {
  const pop = usePop()
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
            <WayTrack way={way} airports={data.inout.airports} compact />
            <FlightLinks links={wayLinks(way, data.inout, other)} />
          </div>
        )}
      </div>
    </li>
  )
}

/** A stop: flag on the rail, the city, its dates, and the nights there, which you can change. */
function Stop({ name, node, country, inDay, outDay, days, exact, onNights, last, dayN }: {
  name: string; node: MapNode | undefined; country: string; inDay: string; outDay: string; days: number; exact: boolean
  /** set the nights here, or null when the flight home decides them */
  onNights: ((n: number) => void) | null
  last: boolean
  dayN: number
}) {
  const est = !exact
  return (
    <li className="st-stop" style={{ '--nights': Math.min(days, 12) } as CSSProperties} data-last={last}>
      <Gutter n={dayN} date={inDay} est={est} />
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

/** The day a leg leaves, as a chip that opens the picker. */
function When({ children, label, picker, set, known }: { children: ReactNode; label: string; picker: ReactNode; set: boolean; known: boolean }) {
  const pop = usePop(false)
  return (
    <span className="pop-wrap st-when" {...pop.wrap}>
      <button type="button" className="st-wbtn" data-set={set} data-known={known} aria-label={label} {...pop.trigger}>
        <Calendar s={12} />{children}
      </button>
      {pop.open && <div className="pop wide" role="dialog" aria-label={label} {...pop.panel}>{picker}</div>}
    </span>
  )
}

/** Travel between two stops: the line, the day it leaves, and the pill with the boarding pass behind it. */
function Leg({ h, ends, date, set, known, picker, card }: { h: Hop; ends: LegEnds; date: string; set: boolean; known: boolean; picker: ReactNode; card: ReactNode }) {
  const pop = usePop()
  const fam = familyOf(h.mode)
  const f = h.flight
  const what = f ? `${clock(f.depart)} to ${clock(f.arrive)}` : h.overland ? 'Overland' : MODE[fam]
  return (
    <li className="st-leg" data-f={fam}>
      <span className="st-gut" />
      <span className="st-rail"><span className="st-line" /><ModeChip family={fam} /></span>
      <div className="st-body st-legrow">
        <When label={`${ends.fromName} to ${ends.toName}, leaves ${weekdayDay(date)}. Change the day`} picker={picker} set={set} known={known}>
          <span>{known ? '' : '~'}{weekdayDay(date)}</span>
        </When>
        <span className="pop-wrap" {...pop.wrap}>
          <button type="button" className="st-pill" {...pop.trigger} aria-label={`${MODE[fam]} ${ends.fromName} to ${ends.toName}, details`}>
            <span className="st-p-what">{what}</span>
            {(f?.hours ?? h.hours) != null && <span className="st-p-dur">{hours(f?.hours ?? h.hours)}</span>}
            {f && f.via.length > 0 && <span className="st-p-via">via {f.via.join(', ')}</span>}
            {h.overnight && <span className="st-p-moon" title="Overnight"><Moon /></span>}
            <b className="st-p-kr">{kr(h.price_dkk)}</b>
          </button>
          {pop.open && <div className="pop" role="dialog" aria-label={`${ends.fromName} to ${ends.toName}`} {...pop.panel}>{card}</div>}
        </span>
      </div>
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
      items.push(
        <Leg
          key={`h${i}`}
          h={h}
          ends={ends}
          date={date}
          set={!!h.date}
          known={!!(h.date || h.flight)}
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
        last={i === ps.length - 1}
        dayN={tripDay(sp.inDay)}
        onNights={next?.hop ? (n) => setHopDate(i + 1, addDays(sp.inDay, Math.max(0, n))) : null}
      />,
    )
  })
  items.push(<End key="home" dir="home" way={wayHome} other={wayIn} data={data} dayN={tripDay(homeDay)} place={nm(nodeForAirport(inout, wayHome.from))} />)

  return <ol className="st">{items}</ol>
}
