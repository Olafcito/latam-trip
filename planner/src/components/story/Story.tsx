import { useRef, useState, type ReactNode } from 'react'
import type { Family } from '@map/data/types'
import { Flag, hasFlag } from '@map/map/Flag'
import type { AppData, MapNode, Way } from '../../data/types'
import { usePairDates } from '../../data/pairDates'
import { useStore } from '../../store'
import { clock, day, hours, legHours, shortPlace, weekdayDay } from '../../lib/format'
import { giveNight, legDay, legTime, nodeForAirport, nodeName, takeNight, type Journey, type NightMove, type Schedule, type Warning } from '../../lib/journey'
import { timed } from '../../lib/fares'
import { legWindow } from '../../lib/legDates'
import { familyOf } from '../../lib/route'
import { countryName } from '../../lib/colors'
import { hopLink, wayLinks } from '../../lib/links'
import { Modal } from '../Modal'
import { hoverProps, usePlaceHover } from '../PlaceCard'
import { WayTrack } from '../WayCard'
import { FlightLinks } from '../FlightLinks'
import { Boat, Bus, Close, Minus, Moon, Pin, Plane, Plus, Warn } from '../icons'
import { CityCard } from './CityCard'
import { FlightSheet } from './FlightSheet'
import { LegCard, type LegEnds } from './LegCard'
import type { LegPoint } from './LegMap'
import { WhenPicker } from './WhenPicker'
import { usePop } from './usePop'

// The route as a story, read top to bottom, from Copenhagen and back to it. A stop is one line, its
// flag, its name and at the right edge its nights. A leg is one line too, the day it leaves and then
// its mode and length, and the rail beside it draws the leg in its mode the way the map does. So
// every date sits on a leg, in one column, and they can only ever be evenly spaced. A click on the
// day opens the calendar, a click on the mode opens the ticket, or the flights to choose from when
// the leg has its airports. A leg shows its times when they are known, with the day it lands if that
// is another day. A leg that leaves before you get there says so, with the day to move it to.
// The earliest stop decides its nights: a night more comes from the free nights, and from a later
// stop you choose once there are none. A night less is a free night, shown as a line of its own before
// the flight home, and no stop gets it. A stop's name or flag opens its City card.

const MODE: Record<Family, string> = { flight: 'Flight', boat: 'Boat', ground: 'Bus' }

/** A leg's times on the route, with the day it lands when that is another day. Only that day when the times are not known. */
const timesOf = (leaves: string, reaches: string | null | undefined): string | null => {
  if (!reaches) return null
  const other = reaches.slice(0, 10) !== leaves.slice(0, 10)
  if (leaves.length > 10 && reaches.length > 10) return `${clock(leaves)} to ${clock(reaches)}${other ? ` ${weekdayDay(reaches)}` : ''}`
  return other ? `Arrives ${day(reaches)}` : null
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

/** The nights at a stop, the number over its word, in the middle of its stepper. */
function Count({ n, est }: { n: number; est?: boolean }) {
  return (
    <span className="st-val" data-est={est} aria-live="polite">
      {n ? <><b>{n}</b><small>{n === 1 ? 'night' : 'nights'}</small></> : <small>Passing through</small>}
    </span>
  )
}

/**
 * Which later stop a night more comes from, once there are no free nights. It stays open, so several nights can move and the route behind
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
function Stop({ id, name, node, country, days, exact, onLess, rows, home, onOpen }: {
  id?: string
  name: string; node: MapNode | undefined; country: string; days: number; exact: boolean
  /** a night less here, or null when it has none */
  onLess: (() => void) | null
  /** where a night more can come from */
  rows: NightRow[]
  /** Copenhagen, where the trip starts and ends */
  home?: 'start' | 'end'
  /** opens the City card */
  onOpen?: () => void
}) {
  const pop = usePop(false)
  const less = `One night less in ${name}, it becomes a free night`
  // free nights go first with nothing to choose, the chooser is for when there are none left
  const direct = rows.find((r) => r.from === 'free')?.take
  const later = rows.filter((r) => r.from !== 'free')
  const more = direct ? `One night more in ${name}, from the free nights` : `One night more in ${name}, choose where from`
  const open = onOpen && (() => {
    usePlaceHover.getState().hide()
    onOpen()
  })
  return (
    <li id={id} className="st-stop" data-home={home}>
      <span className="st-rail">
        {open ? <button type="button" className="st-flag" tabIndex={-1} aria-hidden="true" onClick={open}><Disc country={country} /></button> : <Disc country={country} />}
      </span>
      <div className="st-card">
        {open
          ? <button type="button" className="st-name st-open" aria-haspopup="dialog" aria-label={`${name}, open the city card`} {...hoverProps(node)} onClick={open}>{name}</button>
          : <b className="st-name">{name}</b>}
        {!home && (
          <span className="st-step" role="group" aria-label={`Nights in ${name}`}>
            <button type="button" className="st-n" aria-label={less} title={less} disabled={!onLess} onClick={onLess ?? undefined}><Minus /></button>
            <Count n={days} est={!exact} />
            <span className="pop-wrap" {...pop.wrap}>
              <button type="button" className="st-n" aria-label={more} title={more} disabled={!direct && !later.some((r) => r.take)} {...(direct ? { onClick: direct } : pop.trigger)}><Plus /></button>
              {pop.open && <div className="pop nf" role="group" aria-label="Take a night from" {...pop.panel}><Shut on={pop.dismiss} /><NightChooser name={name} days={days} rows={later} /></div>}
            </span>
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
function Leg({ fam, tone, route, date, times, set, known, picker, travel, card, sheet, aria, clash, fromName, onSet }: {
  fam: Family
  tone?: 'in' | 'home'
  route: string
  date: string
  /** when it leaves and lands, or the day it lands */
  times?: string | null
  set: boolean; known: boolean
  /** the calendar, or null for a long-haul way whose day the ticket fixes */
  picker: ReactNode | null
  travel: ReactNode; card: ReactNode
  /** the flights to choose from, shown in a window in place of the ticket */
  sheet?: (close: () => void) => ReactNode
  aria: string
  /** the warning when this leg leaves before you get there */
  clash?: Warning
  fromName: string
  onSet?: (date: string) => void
}) {
  const when = usePop(false)
  const pop = usePop(false)
  const [sheetOpen, setSheetOpen] = useState(false)
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
        {sheet ? (
          <>
            <button type="button" className="st-hop" aria-label={aria} aria-haspopup="dialog" aria-expanded={sheetOpen} onClick={() => setSheetOpen(true)}>{travel}</button>
            {sheetOpen && <Modal label={route} className="fl-md" onClose={() => setSheetOpen(false)}>{sheet}</Modal>}
          </>
        ) : (
          <span className="pop-wrap" {...pop.wrap}>
            <button type="button" className="st-hop" aria-label={aria} {...pop.trigger}>{travel}</button>
            {pop.open && <div className={`pop${tone ? ' way' : ''}`} role="dialog" aria-label={route} {...pop.panel}><Shut on={pop.dismiss} />{card}</div>}
          </span>
        )}
        {times && <span className="st-arrives">{times}</span>}
      </div>
      {clash && (
        <p className="st-clash" role="alert">
          <Warn /><span>Leaves before you get to {fromName}</span>
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

/** A leg's mode and length. The word for the mode when the length is not known. */
function Travel({ fam, time, overnight }: { fam: Family; time: string | null; overnight: boolean }) {
  const Icon = ICON[fam]
  return (
    <>
      <Icon s={14} />
      <span>{time ?? MODE[fam]}</span>
      {overnight && <span className="st-moon" title="Overnight"><Moon /></span>}
    </>
  )
}

export function Story({ data, journey, sched, wayIn, wayHome }: { data: AppData; journey: Journey; sched: Schedule; wayIn: Way; wayHome: Way }) {
  const { inout, map } = data
  const pd = usePairDates()
  const setHopDate = useStore((s) => s.setHopDate)
  const setHopFlight = useStore((s) => s.setHopFlight)
  const moveNights = useStore((s) => s.moveNights)
  const removeStop = useStore((s) => s.removeStop)
  // the stop whose City card is open. A stop deleted from the card goes once the card has closed
  const [city, setCity] = useState<number | null>(null)
  const goes = useRef(false)
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
  const airportName = (code: string) => shortPlace(inout.airports[code]?.name ?? map.nodes.find((n) => n.iata === code)?.name ?? code)
  const pointsOf = (ids: string[]): LegPoint[] | null => {
    const ns = ids.map(node)
    return ns.every((n) => n) ? ns.map((n) => ({ name: shortPlace(n!.name), lat: n!.lat, lon: n!.lon })) : null
  }
  const wayAria = (w: Way, a: string, b: string) => `Flight ${a} to ${b}, leaves ${weekdayDay(w.depart)} ${clock(w.depart)}, ${hours(w.total_hours)}. Details`

  const items: ReactNode[] = [
    <Stop key="cph0" name={cph.name} node={undefined} country={cph.country} days={0} exact onLess={null} rows={[]} home="start" />,
    <Leg
      key="in" fam="flight" tone="in" route={`${cph.name} to ${nm(firstNode)}`}
      date={wayIn.depart.slice(0, 10)} times={timesOf(wayIn.depart, wayIn.arrive)} set known picker={null} fromName={cph.name}
      aria={wayAria(wayIn, cph.name, nm(firstNode))}
      travel={<Travel fam="flight" time={hours(wayIn.total_hours)} overnight={false} />}
      card={<WayCard way={wayIn} other={wayHome} data={data} />}
    />,
  ]
  ps.forEach((p, i) => {
    if (p.hop && i > 0) {
      const h = p.hop
      const prev = sched.places[i - 1]
      const { date, min, max, days, fares, fromCode, toCode, codes } = legWindow(pd, map, h, prev, homeDay)
      const fam = familyOf(h.mode)
      const ends: LegEnds = { from: h.from, to: h.to, fromName: nm(h.from), toName: nm(h.to), fromCode, toCode }
      const f = h.flight
      const time = legTime(map, h)
      const took = legHours(time)
      const route = `${ends.fromName} to ${ends.toName}`
      // a leg with no day of its own moves with this one, so the stay runs to the next leg that is fixed
      const fixedAt = ps.findIndex((q, k) => k > i && (q.hop?.date || q.hop?.flight))
      const fixed = fixedAt > 0 ? ps[fixedAt].hop! : null
      items.push(
        <Leg
          key={`h${i}`}
          fam={fam}
          route={route}
          date={date}
          times={f && timed(f) && f.depart.slice(0, 10) === date ? timesOf(f.depart, f.arrive) : timesOf(date, sched.places[i].inDay)}
          set={!!h.date}
          known={!!(h.date || f)}
          clash={sched.warnings.find((w) => w.leg === i)}
          fromName={ends.fromName}
          onSet={(d) => setHopDate(i, d)}
          aria={`${MODE[fam]} ${route}, leaves ${weekdayDay(date)}${took ? `, ${took}` : ''}${h.overnight ? ', overnight' : ''}. Details`}
          travel={<Travel fam={fam} time={took} overnight={!!h.overnight} />}
          picker={<WhenPicker date={date} set={!!h.date} min={min} max={max} firstDay={sched.firstDay} fares={fares} stay={{ name: nm(ps[i - 1].node), inDay: prev.inDay }} codes={codes} trip={journey.id} onSet={(d) => setHopDate(i, d)} />}
          card={<LegCard h={h} ends={ends} family={fam} date={date} time={time} points={fam === 'flight' ? null : pointsOf([h.from, ...time.via, h.to])} link={hopLink(h, inout)} />}
          sheet={codes ? (close) => (
            <FlightSheet
              from={{ code: codes.from, name: ends.fromName }}
              to={{ code: codes.to, name: ends.toName }}
              typical={h.price_dkk ?? null}
              picked={f ?? null}
              date={date}
              days={days}
              fares={fares}
              stay={{
                fromName: ends.fromName,
                fromIn: min,
                toName: ends.toName,
                onward: fixed ? fixedAt > i + 1 : i < ps.length - 1,
                nextDay: fixed ? legDay(fixed, homeDay) : homeDay,
                nextLabel: fixed ? `Leg from ${nm(fixed.from)}` : 'Flight home',
              }}
              pd={pd}
              link={hopLink(h, inout)}
              tripId={journey.id}
              airportName={airportName}
              onPick={(x) => setHopFlight(i, x)}
              close={close}
            />
          ) : undefined}
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
        onOpen={() => setCity(i)}
      />,
    )
  })
  if (sched.free > 0) {
    items.push(
      <li key="free" className="st-free">
        <span className="st-rail" />
        <div className="st-card">
          <span className="st-free-t">Free before the flight home</span>
          <Count n={sched.free} />
        </div>
      </li>,
    )
  }
  items.push(
    <Leg
      key="home" fam="flight" tone="home" route={`${nm(exitNode)} to ${cph.name}`}
      date={homeDay} times={timesOf(wayHome.depart, wayHome.arrive)} set known picker={null} fromName={nm(exitNode)}
      aria={wayAria(wayHome, nm(exitNode), cph.name)}
      travel={<Travel fam="flight" time={hours(wayHome.total_hours)} overnight={false} />}
      card={<WayCard way={wayHome} other={wayIn} data={data} />}
    />,
    <Stop key="cph1" name={cph.name} node={undefined} country={cph.country} days={0} exact onLess={null} rows={[]} home="end" />,
  )

  return (
    <>
      <ol className="st">{items}</ol>
      {city != null && ps[city] && (
        <Modal
          label={nm(ps[city].node)}
          className="cc-md"
          bare
          onClose={() => {
            setCity(null)
            if (goes.current) removeStop(city)
            goes.current = false
          }}
        >
          {(shut) => <CityCard data={data} journey={journey} sched={sched} i={city} close={shut} onDelete={() => { goes.current = true; shut() }} />}
        </Modal>
      )}
    </>
  )
}
