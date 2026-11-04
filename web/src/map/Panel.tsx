import { useRef, useState, type ReactNode, type Ref } from 'react'
import { airportFlights, byCountry, countries, countryName, landing, neighbours, otherEnd, pairFlights, stopsFrom, viaText, type Model, type Neighbour } from '../data/model'
import { capped } from '../data/cardFacts'
import { legOption, tripPieces, type Piece, type SeedWay, type Trip, type TripLeg } from '../data/trips'
import { familyOf, type AirportFlight, type Connection, type DatedFare, type Family, type FlownLeg, type Mode, type Place, type RoundTrip, type RouteOption } from '../data/types'
import { altitude, duration, fromPrice, kr, modeLabel, observed, shortDate } from '../lib/format'
import { Flag as CountryFlag } from './Flag'
import { Arrow, Back, Chevron, Close, Fare, Flag, ModeChip, Moon, Plus } from './icons'
import { PlaceSections } from './PlaceSections'
import { Unknown } from './Unknown'
import type { CardRef, MapModeApi } from './useMapMode'

export type PanelView = 'city' | 'more' | 'route' | 'trips' | 'way'

export interface View {
  sel: string | null
  panel: PanelView | null
  route: string | null // connection id in route view
  from: string | null // the end the route is read from
  opt: number // index into the route's enabled options, fastest first
  back: 'city' | 'more' | null // where Esc and the back button go from route view
}

export type FlightDir = 'in' | 'out'

export interface PanelProps {
  model: Model
  view: View
  dir: FlightDir // which way the city's flights read: out of it or into it
  onDir(dir: FlightDir): void
  families: Set<Family>
  collapsed: boolean
  trip: Trip | null // the open trip, which the route view adds legs to
  panelRef: Ref<HTMLElement>
  onCollapse(collapsed: boolean): void
  onClose(): void
  onMore(): void
  onCity(): void
  onBack(): void
  onRoute(cid: string, from: string): void
  onOption(i: number): void
  onGoTo(id: string): void
  onHoverRoute(cid: string | null, from?: string): void
  /** Add a leg to the open trip. With `cont` the panel moves on to the far city. */
  onAddLeg?(conn: Connection, opt: RouteOption, from: string, cont: boolean): void
  onRemoveLeg(index: number): void
  legIndex(cid: string, from: string, mode: Mode): number
  /** What a place has in the map modes, for its Experiences and Training. */
  api: MapModeApi
  /** A row of a place's Experiences or Training opens its window. */
  onCard(ref: CardRef): void
  /** The places to stay at a city, which a host that has them renders at the top of the city panel. */
  stays?: (placeId: string) => ReactNode
  /** A stop's nights and dates, which a host with a schedule gives. */
  stopDays?: (placeId: string) => StopDays | null
  /** The phone sheet holds the panel: the sheet carries the name, the photo and the close, the panel only its body. */
  hosted?: boolean
}

/** What the phone sheet shows in its head for the open view: the name, the country, and for a city its photo. */
export interface SheetHead {
  label: string
  title: ReactNode
  count: string
  peek?: ReactNode
}

/** The nights at a stop and the days it is reached and left. `exact` is false while an earlier stop has no date. */
export interface StopDays {
  nights: number
  inDay: string
  outDay: string
  exact: boolean
}

/** Wikimedia thumbnails come in fixed steps; swap the width in the URL. */
export const sized = (url: string, w: number) => url.replace(/\/\d+px-([^/]+)$/, `/${w}px-$1`)

export function Panel(p: PanelProps) {
  const { model, view } = p
  const city = view.sel ? model.byId.get(view.sel) : undefined
  const conn = view.route ? model.conns.get(view.route) : undefined
  if (!view.panel || (!city && !conn)) return null
  const wide = view.panel !== 'city'
  const title = view.panel === 'route' && conn ? routeTitle(model, conn, view.from ?? conn.a) : city?.short_name ?? ''
  const body =
    view.panel === 'city' && city ? (
      <CityView key={`c:${city.id}`} {...p} city={city} />
    ) : view.panel === 'more' && city ? (
      <MoreView key={`m:${city.id}`} {...p} city={city} />
    ) : conn ? (
      <RouteView key={`r:${conn.id}:${view.from}`} {...p} conn={conn} />
    ) : null
  if (p.hosted) return body

  return (
    <section ref={p.panelRef} className={`panel${wide ? ' wide' : ''}${p.collapsed ? ' collapsed' : ''}`} aria-label="Details">
      {p.collapsed ? (
        <div className="pslim">
          <span className="pslim-name">{title}</span>
          <button className="x sm" aria-label="Expand panel" onClick={() => p.onCollapse(false)}><Chevron up={false} /></button>
          <button className="x sm" aria-label="Close" onClick={p.onClose}><Close /></button>
        </div>
      ) : body}
    </section>
  )
}

/** The head of the phone sheet for the open view, or null when nothing is open. */
export function sheetHead(p: PanelProps): SheetHead | null {
  const { model, view } = p
  const city = view.sel ? model.byId.get(view.sel) : undefined
  const conn = view.route ? model.conns.get(view.route) : undefined
  if (view.panel === 'route' && conn) {
    const a = model.byId.get(view.from ?? conn.a)
    const b = model.byId.get(otherEnd(conn, view.from ?? conn.a))
    if (!a || !b) return null
    return {
      label: `${a.short_name} to ${b.short_name}`,
      // either name opens that city, the same as tapping its dot
      title: (
        <span className="rtitle in-head">
          <button className="rname" title={`Open ${a.short_name}`} onClick={() => p.onGoTo(a.id)}>{a.short_name}</button>
          <Arrow s={16} />
          <button className="rname" title={`Open ${b.short_name}`} onClick={() => p.onGoTo(b.id)}>{b.short_name}</button>
        </span>
      ),
      count: countries(model, a, b),
    }
  }
  if (!city || (view.panel !== 'city' && view.panel !== 'more')) return null
  const stop = view.panel === 'city' && p.trip ? tripStop(p.trip, city) : null
  return {
    label: stop ? `Stop ${stop.numbers.join(' and ')}, ${city.short_name}` : city.short_name,
    title: view.panel === 'more' ? city.name : city.short_name,
    count: countryName(model, city.country),
    peek: view.panel === 'city' && (
      <div className="thumb-wrap mhead-thumb">
        <Thumb city={city} w={120} className="thumb" />
        {stop && <span className="stopno mono" aria-hidden="true">{stop.numbers.join(',')}</span>}
      </div>
    ),
  }
}

function routeTitle(model: Model, conn: Connection, from: string) {
  const a = model.byId.get(from)
  const b = model.byId.get(otherEnd(conn, from))
  return `${a?.short_name} to ${b?.short_name}`
}

function HeadButtons(p: PanelProps) {
  return (
    <div className="hbtns">
      <button className="x" aria-label="Collapse panel" onClick={() => p.onCollapse(true)}><Chevron up /></button>
      <button className="x" aria-label="Close" onClick={p.onClose}><Close /></button>
    </div>
  )
}

/** A connection at a glance: the mode as an icon, the time and the lowest price. The words sit in the title, and what is unknown is left out. */
function OptChip({ o }: { o: RouteOption }) {
  const time = o.duration_min == null ? null : duration(o.duration_min)
  const price = o.price_dkk.min == null ? null : o.price_dkk.min
  return (
    <span className="copt mono" title={[modeLabel(o.mode), time, price == null ? null : fromPrice(price)].filter(Boolean).join(', ')}>
      <ModeChip family={familyOf(o.mode)} />
      {time && <b>{time}</b>} {price != null && kr(price)}
    </span>
  )
}

interface ConnListProps {
  p: PanelProps
  list: Neighbour[]
  from: string
  dir?: FlightDir // which way the flight chips read: out of `from` (default) or into it
  compact?: boolean
}

/** The connections of `from`, under a heading per country once more than one country is reachable. */
function ConnList({ p, list, from, dir = 'out', compact }: ConnListProps) {
  const home = p.model.byId.get(from)?.country ?? ''
  const groups = byCountry(list, home)
  if (groups.length < 2) return <ConnRows p={p} list={list} from={from} dir={dir} compact={compact} />
  return (
    <div className={`cgroups${compact ? ' flush' : ''}`}>
      {groups.map((g) => (
        <section key={g.country}>
          <p className="cgroup"><CountryFlag code={g.country} size={11} />{countryName(p.model, g.country)}</p>
          <ConnRows p={p} list={g.list} from={from} dir={dir} compact={compact} />
        </section>
      ))}
    </div>
  )
}

function ConnRows({ p, list, from, dir = 'out', compact }: ConnListProps) {
  return (
    <ul className={`clist${compact ? ' flush' : ''}`}>
      {list.map((n, i) => <ConnRow key={n.conn.id} p={p} n={n} from={from} dir={dir} i={i} />)}
    </ul>
  )
}

/** One connection: the name opens the route, a flight chip with crawled fares unfolds them under the row. */
function ConnRow({ p, n, from, dir, i }: { p: PanelProps; n: Neighbour; from: string; dir: FlightDir; i: number }) {
  const { model } = p
  const [open, setOpen] = useState(false)
  const here = model.byId.get(from)?.iata
  const there = n.other.iata
  const pair = here && there ? (dir === 'out' ? pairFlights(model, here, there) : pairFlights(model, there, here)) : []
  // the route lights up the way it is read, so reading flights in runs it into the city
  const hoverFrom = dir === 'in' ? n.other.id : from
  return (
    <li
      className="crow"
      style={{ animationDelay: `${0.12 + Math.min(i, 10) * 0.04}s` }}
      onMouseEnter={() => p.onHoverRoute(n.conn.id, hoverFrom)}
      onMouseLeave={() => p.onHoverRoute(null)}
    >
      <button className="cr-main" onClick={() => p.onRoute(n.conn.id, from)} onFocus={() => p.onHoverRoute(n.conn.id, hoverFrom)} onBlur={() => p.onHoverRoute(null)}>
        <span className="cr-name">{n.other.short_name}</span>
        <span className="cr-arrow"><Arrow /></span>
      </button>
      <span className="cr-opts">
        {n.options.map((o, j) =>
          o.mode === 'flight' && pair.length ? (
            <button
              key={j}
              type="button"
              className={`copt mono cr-fl${open ? ' on' : ''}`}
              aria-expanded={open}
              title={`Flight, ${pair.length} crawled fare${pair.length === 1 ? '' : 's'} ${dir === 'out' ? 'to' : 'from'} ${n.other.short_name}, ${fromPrice(pair[0].dkk)}`}
              onClick={() => setOpen(!open)}
            >
              <ModeChip family={familyOf(o.mode)} />
              <b>{duration(o.duration_min)}</b> {kr(pair[0].dkk)}
              <Chevron up={open} />
            </button>
          ) : o.mode === 'flight' && dir === 'in' && here ? (
            // the crawl did not search this way in, so there is no price to read
            <span key={j} className="copt mono" title={`Flight, no crawled fares from ${n.other.short_name}`}>
              <ModeChip family={familyOf(o.mode)} />
              {o.duration_min != null && <b>{duration(o.duration_min)}</b>}
            </span>
          ) : (
            <OptChip key={j} o={o} />
          ),
        )}
      </span>
      {open && pair.length > 0 && (
        <ul className="flist nested">
          {pair.map((r, k) => <FlightRow key={`${r.dep}-${r.dkk}-${r.hours}`} model={model} r={r} i={k} />)}
        </ul>
      )}
    </li>
  )
}

function Thumb({ city, w, className }: { city: Place; w: number; className: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className={className}>
      {city.image?.url && !failed ? (
        <img src={sized(city.image.url, w)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <span className="thumb-fallback">{city.short_name.slice(0, 1)}</span>
      )}
    </div>
  )
}

function CityView(p: PanelProps & { city: Place }) {
  const { model, city, dir } = p
  const list = neighbours(model, city.id, p.families)
  const [all, setAll] = useState(false)
  const conns = useRef<HTMLElement>(null)
  const { shown, folded } = capped(list, all)
  // the in or out switch only once the airport has crawled fares to read either way
  const flown = !!city.iata && (airportFlights(model, city.iata, 'in').length > 0 || airportFlights(model, city.iata, 'out').length > 0)
  const stop = p.trip ? tripStop(p.trip, city) : null
  /** The trip ends here: read the connections out and bring them up, where a leg is added. */
  const addLeg = () => {
    p.onDir('out')
    const sec = conns.current
    if (!sec) return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    sec.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' })
    sec.querySelector<HTMLButtonElement>('.cr-main')?.focus({ preventScroll: true })
  }
  return (
    <div className="pview">
      <section className="mc-sec overview" aria-label="Overview">
        {p.hosted ? (
          city.why && <p className="why hosted stg">{city.why}</p>
        ) : (
          <div className="phead stg">
            <div className="thumb-wrap">
              <Thumb city={city} w={250} className="thumb" />
              {stop && <span className="stopno mono" aria-hidden="true">{stop.numbers.join(',')}</span>}
            </div>
            <div className="ptext">
              <p className="kicker"><CountryFlag code={city.country} size={11} />{countryName(model, city.country)}</p>
              <h2 className="pname">{city.short_name}</h2>
              {city.why && <p className="why">{city.why}</p>}
            </div>
            <HeadButtons {...p} />
          </div>
        )}
        {p.trip && stop && (
          <StopLegs p={p} trip={p.trip} city={city} stop={stop} days={p.stopDays?.(city.id) ?? null} onAdd={list.length ? addLeg : null} />
        )}
        {p.trip && !stop && list.length > 0 && visits(p.trip).length === 0 && (
          // a trip with no stops yet starts wherever the first leg is added
          <ol className="tstop stg" aria-label={`Start ${p.trip.name}`}>
            <li className="ts-row">
              <button type="button" className="ts-btn ts-line ts-add" onClick={addLeg}>
                <span className="ts-dot"><Plus /></span>
                <span className="ts-name">Start here</span>
              </button>
            </li>
          </ol>
        )}
        {p.stays?.(city.id)}
        {!!(city.summary || city.things_to_do?.length) && (
          <div className="pmid stg">
            <button className="more" onClick={p.onMore}>More about {city.short_name} <span className="arr"><Arrow /></span></button>
          </div>
        )}
      </section>
      <PlaceSections key={city.id} api={p.api} categories={model.data.categories} placeId={city.id} withSaved onCard={p.onCard} />
      {list.length > 0 && (
        <section ref={conns} className="mc-sec" aria-label="Connections">
          <div className="sechead">
            <p className="sub">Connections</p>
            <span className="sechead-r">
              {flown && (
                <span className="dirseg" role="group" aria-label="Read flights in or out">
                  <button type="button" aria-pressed={dir === 'in'} onClick={() => p.onDir('in')}>In</button>
                  <button type="button" aria-pressed={dir === 'out'} onClick={() => p.onDir('out')}>Out</button>
                </span>
              )}
              <p className="sub mono">{list.length}</p>
            </span>
          </div>
          <ConnList p={p} list={shown} from={city.id} dir={dir} />
          {folded > 0 && <button type="button" className="mc-more" onClick={() => setAll(true)}>Show all {list.length}</button>}
        </section>
      )}
    </div>
  )
}

/** Where a city sits in a trip: its stop numbers, the piece that arrives at its first visit and the piece that leaves its last. */
interface TripStop {
  numbers: number[]
  first: boolean
  last: boolean
  in: Piece | null
  /** The stop number at the other end of `in`. */
  inN: number
  out: Piece | null
  outN: number
}

/** The stops of a trip in visiting order, each with the piece that reached it and the piece that left it. Built the way `tripStops` is. */
function visits(trip: Trip) {
  const out: { id: string; in: Piece | null; out: Piece | null }[] = trip.start ? [{ id: trip.start, in: null, out: null }] : []
  for (const piece of tripPieces(trip)) {
    if (out.at(-1)?.id !== piece.from) out.push({ id: piece.from, in: null, out: null })
    out.at(-1)!.out = piece
    if (out.at(-1)!.id !== piece.to) out.push({ id: piece.to, in: piece, out: null })
  }
  return out
}

function tripStop(trip: Trip, city: Place): TripStop | null {
  const all = visits(trip)
  const at = all.flatMap((v, i) => (v.id === city.id ? [i] : []))
  if (!at.length) return null
  const first = all[at[0]]
  const last = all[at.at(-1)!]
  return {
    numbers: at.map((i) => i + 1),
    first: at[0] === 0,
    last: at.at(-1) === all.length - 1,
    in: first.in,
    inN: at[0], // the visit before the first one
    out: last.out,
    outN: at.at(-1)! + 2, // the visit after the last one
  }
}

/** The way in or home of a planned trip, when it lands or leaves at this city's airport. */
function wayAt(trip: Trip, city: Place, end: 'entry' | 'exit') {
  const io = trip.inout
  if (!io || (io[end] !== city.iata && io[end] !== city.id)) return null
  return end === 'entry' ? io.way_in : io.way_home
}

const day = (at: string | null | undefined) => (at ? shortDate(at.slice(0, 10)) : null)

/**
 * This trip's facts for the stop as a short timeline: the leg in, the nights and the dates, the leg out.
 * A stop the trip ends at with no way home gets the control that adds the next leg.
 */
function StopLegs({ p, trip, city, stop, days, onAdd }: { p: PanelProps; trip: Trip; city: Place; stop: TripStop; days: StopDays | null; onAdd: (() => void) | null }) {
  const flyIn = stop.first && !stop.in ? wayAt(trip, city, 'entry') : null
  const flyHome = stop.last && !stop.out ? wayAt(trip, city, 'exit') : null
  return (
    <ol className="tstop stg" aria-label={`Stop ${stop.numbers.join(' and ')} of ${trip.name}`}>
      {stop.in ? (
        <PieceRow p={p} piece={stop.in} other={stop.in.from} n={stop.inN} way="in" />
      ) : flyIn ? (
        <WayRow way={flyIn} end="in" />
      ) : null}
      {days && (
        <li className="ts-row ts-line ts-here">
          <span className="ts-dot"><Moon /></span>
          <span className="ts-name"><b className="mono">{days.nights}</b> {days.nights === 1 ? 'night' : 'nights'}</span>
          <span className={`ts-facts mono${days.exact ? '' : ' soft'}`} title={days.exact ? undefined : 'Dates follow from the nights before'}>
            {shortDate(days.inDay)} <Arrow s={11} /> {shortDate(days.outDay)}
          </span>
        </li>
      )}
      {stop.out ? (
        <PieceRow p={p} piece={stop.out} other={stop.out.to} n={stop.outN} way="out" />
      ) : flyHome ? (
        <WayRow way={flyHome} end="home" />
      ) : onAdd ? (
        <li className="ts-row">
          <button type="button" className="ts-btn ts-line ts-add" onClick={onAdd}>
            <span className="ts-dot"><Plus /></span>
            <span className="ts-name">Add leg</span>
          </button>
        </li>
      ) : null}
    </ol>
  )
}

/** The way in or home as a row shaped like a leg: the date, the time door to door and the way's own price, with the Unknown mark where a fact is missing. */
function WayRow({ way, end }: { way: SeedWay; end: 'in' | 'home' }) {
  const date = day(end === 'in' ? way.arrive : way.depart)
  return (
    <li className={`ts-row ts-line ts-way ${end}`}>
      <span className="ts-dot"><ModeChip family="flight" /></span>
      <span className="ts-text">
        <span className="ts-name">{end === 'in' ? 'Fly in' : 'Fly home'}</span>
        <span className="ts-facts mono">
          {date ?? <Unknown title={end === 'in' ? 'Arrival date not known' : 'Departure date not known'} />}
          {way.total_hours != null ? <b>{duration(Math.round(way.total_hours * 60))}</b> : <Unknown title="Travel time not known" />}
          {way.price_dkk != null ? kr(way.price_dkk) : <Unknown title="Price not known" />}
        </span>
      </span>
    </li>
  )
}

/** The time and price of a leg: what the host's itinerary carries on the leg, else the connection's fastest option of its mode. */
function legNumbers(leg: TripLeg, opt: RouteOption | undefined) {
  return { minutes: leg.minutes ?? opt?.duration_min ?? null, dkk: leg.dkk ?? opt?.price_dkk.min ?? null }
}

/** A leg or an overland stretch to or from the stop. A leg opens its route, a stretch goes to the stop at its other end. */
function PieceRow({ p, piece, other, n, way }: { p: PanelProps; piece: Piece; other: string; n: number; way: 'in' | 'out' }) {
  const name = p.model.byId.get(other)?.short_name
  if (!name) return null // the other end is not on the map: nothing to name, so no row
  const leg = piece.kind === 'leg' ? piece.leg : null
  const found = leg ? legOption(p.model, leg) : null
  const { minutes, dkk } = leg ? legNumbers(leg, found?.opt) : { minutes: null, dkk: null }
  const open = () => (leg && found ? p.onRoute(leg.cid, leg.from) : p.onGoTo(other))
  return (
    <li className="ts-row">
      <button
        type="button"
        className="ts-btn ts-line"
        aria-label={`${way === 'in' ? 'From' : 'To'} ${name}`}
        onClick={open}
        onMouseEnter={() => leg && found && p.onHoverRoute(leg.cid, leg.from)}
        onMouseLeave={() => p.onHoverRoute(null)}
      >
        <span className="ts-dot"><span className="ts-no mono">{n}</span></span>
        <span className="ts-text">
          <span className="ts-name">{name}</span>
          {leg && (
            <span className="ts-facts mono">
              <ModeChip family={familyOf(leg.mode)} />
              {minutes != null ? <b>{duration(minutes)}</b> : <Unknown title="Travel time not known" />}
              {dkk != null ? kr(dkk) : <Unknown title="Price not known" />}
            </span>
          )}
        </span>
        <span className="cr-arrow"><Arrow s={14} /></span>
      </button>
    </li>
  )
}

const LAND_TEXT = { night: 'night', day: 'by day', evening: 'evening' } as const
const WARN_NOTES = new Set(['self transfer', 'US transit'])

/** One crawled fare: when it flies and lands, the price, the routing and what makes the row worth reading. */
function FlightRow({ model, r, i }: { model: Model; r: AirportFlight; i: number }) {
  const name = (code: string) => model.byIata.get(code)?.short_name ?? code
  const land = landing(r.arr)
  const url = r.link ?? `https://www.momondo.dk/flight-search/${r.from}-${r.to}${r.dep ? '/' + r.dep.slice(0, 10) : ''}`
  const plus = r.dep && r.arr && r.arr.slice(0, 10) !== r.dep.slice(0, 10) ? ` +${Math.round((Date.parse(r.arr.slice(0, 10)) - Date.parse(r.dep.slice(0, 10))) / 864e5)}` : ''
  return (
    <li className="frow" style={{ animationDelay: `${Math.min(i, 10) * 0.05}s` }}>
      <a href={url} target="_blank" rel="noreferrer" title={`${r.from} to ${r.to}, times local at each airport`}>
        <span className="fr-time mono">
          {r.dep ? `${weekday(r.dep.slice(0, 10))} ${shortDate(r.dep.slice(0, 10))} ${r.dep.slice(11, 16)}` : 'time unknown'}
          {' → '}
          {r.arr ? r.arr.slice(11, 16) + plus : 'time unknown'}
          {land && <span className={`land ${land}`}>{land === 'night' && <Moon />}{LAND_TEXT[land]}</span>}
        </span>
        <span className="fr-price mono">{kr(r.dkk)}</span>
        <span className="fr-meta">
          {duration(Math.round(r.hours * 60))} · {r.vias.length ? 'via ' + r.vias.map(name).join(', ') : 'nonstop'}
          {r.carriers.length ? ` · ${r.carriers.join(', ')}` : ''}
        </span>
        <span className="fr-tags">
          {r.shows.map((s) => <span key={s}>{s}</span>)}
          {r.notes.map((n) => <span key={n} className={WARN_NOTES.has(n) ? 'warn' : 'note'}>{n}</span>)}
        </span>
      </a>
    </li>
  )
}

function Touristy({ n }: { n: number | null | undefined }) {
  if (n == null) return <span className="mono">Not rated</span>
  return (
    <span className="meter" role="img" aria-label={`Touristy ${n} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= n ? 'f' : ''} />)}
    </span>
  )
}

function MoreView(p: PanelProps & { city: Place }) {
  const { model, city } = p
  const list = neighbours(model, city.id, p.families)
  const img = city.image
  return (
    <div className="pview">
      <div className="pbody stg">
        <div className="prow">
          <button className="back" onClick={p.onCity}><Back />{city.short_name}</button>
          {!p.hosted && <HeadButtons {...p} />}
        </div>
        <div>
          <Thumb city={city} w={960} className="hero" />
          {img && (
            <p className="credit mono">
              Photo: <a href={img.page ?? img.url} target="_blank" rel="noreferrer">{img.credit || 'Wikimedia Commons'}</a>
              {img.licence ? ` · ${img.licence}` : ''}{img.credit ? ', Wikimedia Commons' : ''}
            </p>
          )}
        </div>
        {!p.hosted && (
          <div>
            <p className="kicker"><CountryFlag code={city.country} size={11} />{countryName(model, city.country)}</p>
            <h2 className="pname" style={{ marginTop: 4 }}>{city.name}</h2>
          </div>
        )}
        {city.why && <p className="p-why">{city.why}</p>}
        {city.summary && <p className="p-sum">{city.summary}</p>}
        <div className="facts">
          {city.altitude_m != null && <div className="fact"><span className="mono">Altitude</span><span className="mono">{altitude(city.altitude_m)}</span></div>}
          <div className="fact"><span className="mono">Touristy</span><Touristy n={city.touristy} /></div>
        </div>
        <PlaceSections key={city.id} api={p.api} categories={model.data.categories} placeId={city.id} flush onCard={p.onCard} />
        {!!city.things_to_do?.length && (
          <div>
            <p className="sec-k mono">Things to do</p>
            <ul className="todo">{city.things_to_do.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
        )}
        <div>
          <p className="sec-k mono">From here · {list.length}</p>
          <ConnList p={p} list={list} from={city.id} compact />
        </div>
      </div>
    </div>
  )
}

function liveUrl(model: Model, conn: Connection, o: RouteOption, from: string): string {
  const a = model.byId.get(from)!
  const b = model.byId.get(otherEnd(conn, from))!
  if (o.mode === 'flight' && a.iata && b.iata) {
    const date = o.booking_url?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? o.flight?.dates_searched[0]
    return `https://www.momondo.dk/flight-search/${a.iata}-${b.iata}${date ? '/' + date : ''}`
  }
  if (o.source_url) return o.source_url
  return `https://www.rome2rio.com/s/${encodeURIComponent(a.short_name)}/${encodeURIComponent(b.short_name)}`
}

function Stops({ model, conn, o, from }: { model: Model; conn: Connection; o: RouteOption; from: string }) {
  const stops = stopsFrom(conn, o, from)
  if (!stops.length) {
    const msg =
      o.mode === 'flight'
        ? o.flight?.nonstop
          ? 'Nonstop'
          : o.flight?.vias.length
            ? `Connections vary: via ${o.flight.vias.join(' or ')}`
            : 'No stop data'
        : o.border
          ? 'Direct, with a border crossing'
          : 'Direct, no changes'
    return <p className="tl-none">{msg}</p>
  }
  return (
    <ol className="tl">
      {stops.map((s, i) => (
        <li key={s.place_id + i} className={s.type} style={{ animationDelay: `${0.15 + i * 0.06}s` }}>
          <span className="tl-dot" />
          <span>{model.byId.get(s.place_id)?.short_name ?? s.place_id}</span>
          <span className="tl-kind mono">{s.type}{s.wait_min ? ` · ${duration(s.wait_min)}` : ''}</span>
        </li>
      ))}
    </ol>
  )
}

const weekday = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })

/** The cheapest crawled fare per departure date, the travelled direction first. */
function ByDate({ model, rows, from }: { model: Model; rows: DatedFare[]; from: string }) {
  const name = (id: string) => model.byId.get(id)?.short_name ?? id
  const travelled = rows.filter((r) => r.from === from)
  const back = rows.filter((r) => r.from !== from)
  const group = (g: DatedFare[]) => {
    const low = Math.min(...g.map((r) => r.dkk ?? Infinity))
    return (
      <div key={g[0].from}>
        <p className="sec-k mono">Fares by date · {name(g[0].from)} to {name(g[0].to)}</p>
        <ul>
          {g.map((r) => {
            const url = `https://www.momondo.dk/flight-search/${model.byId.get(r.from)?.iata ?? r.from}-${model.byId.get(r.to)?.iata ?? r.to}/${r.date}`
            const route = r.vias.length ? 'via ' + r.vias.map(name).join(', ') : 'nonstop'
            return (
              <li key={r.date} className={g.length > 1 && r.dkk === low ? 'low' : ''}>
                <a href={url} target="_blank" rel="noreferrer" title={r.flights.join(', ') || undefined}>
                  <span className="bd-day mono">{weekday(r.date)} {shortDate(r.date)}</span>
                  <span className="bd-price mono">{kr(r.dkk)}</span>
                  <span className="bd-meta">
                    {r.dep && r.arr ? <span className="mono">{times(r)}</span> : null}
                    <span>{duration(r.duration_min)} · {route}</span>
                    <span>{r.carriers.join(', ')}{r.self_transfer ? ' · self transfer' : ''}</span>
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }
  return (
    <div className="bydate">
      {travelled.length > 0 && group(travelled)}
      {back.length > 0 && (
        // the way the header reads leads, the other way waits one tap deeper
        <details className="bd-rev" open={travelled.length === 0}>
          <summary className="sec-k mono">Fares by date · {name(back[0].from)} to {name(back[0].to)}</summary>
          {group(back)}
        </details>
      )}
    </div>
  )
}

const times = (l: { dep: string | null; arr: string | null; arr_days: number }) =>
  `${l.dep} → ${l.arr}${l.arr_days > 0 ? ` +${l.arr_days}` : ''}`

// "Sun 20 to Mon 28 Dec", with the month only once when both dates share it
function span(a: string | null, b: string | null) {
  const day = (d: string | null) => (d ? `${weekday(d)} ${shortDate(d)}` : 'date unknown')
  if (a && b && a.slice(0, 7) === b.slice(0, 7)) return `${weekday(a)} ${Number(a.slice(8))} to ${day(b)}`
  return `${day(a)} to ${day(b)}`
}

/** Every crawled return ticket on the pair, with both legs as flown. */
function RoundTrips({ model, rows }: { model: Model; rows: RoundTrip[] }) {
  const name = (id: string) => model.byId.get(id)?.short_name ?? id
  const low = Math.min(...rows.map((r) => r.dkk ?? Infinity))
  const leg = (label: string, l: FlownLeg) => (
    <span className="bd-meta">
      <b>{label}</b>
      {l.dep && l.arr ? <span className="mono">{times(l)}</span> : null}
      <span>{duration(l.duration_min)} · {l.vias.length ? 'via ' + l.vias.map(name).join(', ') : 'nonstop'}</span>
      <span>{l.carriers.join(', ')}</span>
    </span>
  )
  return (
    <div className="bydate">
      <div>
        <p className="sec-k mono">Return tickets · {name(rows[0].from)} to {name(rows[0].to)} and back</p>
        <ul>
          {rows.map((r, i) => (
            <li key={i} className={rows.length > 1 && r.dkk === low ? 'low' : ''}>
              <a href={r.link ?? undefined} target="_blank" rel="noreferrer"
                title={[...r.out.flights, ...r.home.flights].join(', ') || undefined}>
                <span className="bd-day mono">{span(r.out.date, r.home.date)}</span>
                <span className="bd-price mono">{kr(r.dkk)}</span>
                {leg('Out', r.out)}
                {leg('Back', r.home)}
                {r.self_transfer ? <span className="bd-meta">self transfer</span> : null}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function FlightFacts({ model, o, from }: { model: Model; o: RouteOption; from: string }) {
  const f = o.flight
  if (!f) return null
  const itin = (q: NonNullable<typeof f.cheapest>) =>
    `${kr(q.dkk)} · ${duration(q.duration_min)} · ${q.vias.length ? 'via ' + q.vias.join(', ') : 'nonstop'} · ${q.carriers.join(', ')} · ${shortDate(q.date)}`
  return (
    <div className="ffacts">
      <div className="facts">
        <div className="fact"><span className="mono">One-way</span><span className="mono">{fromPrice(f.oneway_dkk.min)}</span></div>
        <div className="fact"><span className="mono">Return</span><span className="mono">{f.return_dkk?.min != null ? fromPrice(f.return_dkk.min) : 'not searched'}</span></div>
        <div className="fact"><span className="mono">Routing</span><span>{f.nonstop ? 'Nonstop' + (f.vias.length ? ' or via ' + f.vias.join(', ') : '') : f.vias.length ? 'via ' + f.vias.join(', ') : 'not listed'}</span></div>
        <div className="fact"><span className="mono">Carriers</span><span>{f.carriers.join(', ') || 'not listed'}</span></div>
      </div>
      {f.cheapest && <p className="ops"><b>Cheapest</b> · <span className="mono">{itin(f.cheapest)}</span>{f.cheapest.self_transfer ? ' · self transfer' : ''}</p>}
      {f.fastest && f.fastest.dkk !== f.cheapest?.dkk && <p className="ops"><b>Fastest</b> · <span className="mono">{itin(f.fastest)}</span></p>}
      {f.by_date?.length ? <ByDate model={model} rows={f.by_date} from={from} /> : null}
      {f.round_trips?.length ? <RoundTrips model={model} rows={f.round_trips} /> : null}
      {f.by_date?.length || f.round_trips?.length ? null : o.source !== 'crawl' ? (
        <p className="ops"><b>No dated search</b> · this price comes from {o.source_url ? 'a fare page' : 'research'}, not from a search for your dates</p>
      ) : null}
      {o.observed_at && (
        <p className="ops"><b>Price observed</b> · <span className="mono">{observed(f.oneway_dkk.observed_at ?? o.observed_at)}</span>{f.quotes ? ` · ${f.quotes} quotes` : ''}</p>
      )}
    </div>
  )
}

/** One real option for the hero: a flight reads as its cheapest crawled fare with that fare's own duration, anything else as it is. */
function heroFare(o: RouteOption) {
  const q = o.mode === 'flight' ? o.flight?.cheapest : null
  if (q) return { minutes: q.duration_min, dkk: q.dkk, cheapest: true }
  return { minutes: o.duration_min, dkk: o.price_dkk.min, cheapest: false }
}

function RouteView(p: PanelProps & { conn: Connection }) {
  const { model, view, conn } = p
  const from = view.from ?? conn.a
  const to = otherEnd(conn, from)
  const a = model.byId.get(from)!
  const b = model.byId.get(to)!
  const opts = conn.options
    .filter((o) => p.families.has(familyOf(o.mode)))
    .sort((x, y) => (x.duration_min ?? 1e9) - (y.duration_min ?? 1e9))
  const cur = opts[Math.min(view.opt, opts.length - 1)]
  const added = cur ? p.legIndex(conn.id, from, cur.mode) : -1
  const backLabel = view.back && view.sel ? model.byId.get(view.sel)?.short_name : null

  return (
    <div className="pview">
      <div className="pbody stg">
        {p.hosted ? (
          backLabel && <div className="prow"><button className="back" onClick={p.onBack}><Back />{backLabel}</button></div>
        ) : (
          <>
            <div className="prow">
              {backLabel ? <button className="back" onClick={p.onBack}><Back />{backLabel}</button> : <span />}
              <HeadButtons {...p} />
            </div>
            {/* either name opens that city, the same as tapping its dot */}
            <h2 className="rtitle">
              <button className="rname" title={`Open ${a.short_name}`} onClick={() => p.onGoTo(a.id)}>{a.short_name}</button>
              <Arrow s={22} />
              <button className="rname" title={`Open ${b.short_name}`} onClick={() => p.onGoTo(b.id)}>{b.short_name}</button>
            </h2>
            <p className="rcountries mono">{countries(model, a, b)}</p>
          </>
        )}
        {opts.length > 0 ? (
          <div className="compare">
            {opts.map((o, i) => {
              const real = heroFare(o)
              return (
              <button key={i} className={`ocard${o === cur ? ' cur' : ''}`} aria-pressed={o === cur} onClick={() => p.onOption(i)}>
                <span className="oc-mode"><ModeChip family={familyOf(o.mode)} />{modeLabel(o.mode)}</span>
                <span className="oc-dur mono">{real.minutes == null ? <Unknown title="Duration not known" /> : duration(real.minutes)}</span>
                <span className="oc-cost mono">
                  {real.cheapest && <span className="oc-fare" role="img" aria-label="Cheapest fare" title="Cheapest fare"><Fare /></span>}
                  {real.dkk == null ? <Unknown title="Price not known" /> : real.cheapest ? kr(real.dkk) : fromPrice(real.dkk)}
                </span>
                <span className="oc-via">{viaText(model, conn, o, from)}</span>
                {(o.overnight || o.border) && (
                  <span className="oc-flags">
                    {o.overnight && <span><Moon />Overnight</span>}
                    {o.border && o.mode !== 'flight' && <span><Flag />Border</span>}
                  </span>
                )}
              </button>
              )
            })}
          </div>
        ) : (
          <p className="empty">All modes on this route are switched off.</p>
        )}
        {cur && (
          <div className="detail">
            <p className="sec-k mono">{modeLabel(cur.mode)} · stops on the way</p>
            <Stops model={model} conn={conn} o={cur} from={from} />
            {cur.mode === 'flight' ? <FlightFacts model={model} o={cur} from={from} /> : (
              <div className="facts">
                <div className="fact"><span className="mono">Frequency</span><span>{cur.frequency || 'not listed'}</span></div>
                <div className="fact"><span className="mono">Local price</span><span>{cur.price_local || (cur.price_dkk.min == null ? <Unknown title="Price not known" /> : kr(cur.price_dkk.min))}</span></div>
                {cur.duration_range_h && <div className="fact"><span className="mono">Range</span><span className="mono">{cur.duration_range_h.replace('-', ' to ')} h</span></div>}
                {cur.observed_at && <div className="fact"><span className="mono">Researched</span><span className="mono">{observed(cur.observed_at)}</span></div>}
              </div>
            )}
            {!!cur.operators.length && <p className="ops"><b>Operators</b> · {cur.operators.join(', ')}</p>}
            {cur.note && <p className="note">{cur.note}</p>}
            {cur.researched && (
              <p className="fine mono">
                Researched {cur.researched.year}: {duration(cur.researched.duration_min)}, {fromPrice(cur.researched.price_min)}
              </p>
            )}
          </div>
        )}
        {cur && p.onAddLeg && p.trip ? (
          // pinned to the bottom so the trip buttons never need a scroll
          <div className="pactions tripacts">
            {added >= 0 ? (
              <button className="pbtn ghost done" onClick={() => p.onRemoveLeg(added)}>In {p.trip.name} · remove</button>
            ) : (
              <>
                <button className="pbtn add" onClick={() => p.onAddLeg!(conn, cur, from, true)}>
                  Add leg and continue
                  <span>then show what leaves {b.short_name}</span>
                </button>
                <button className="pbtn ghost" onClick={() => p.onAddLeg!(conn, cur, from, false)}>Add leg, stay here</button>
              </>
            )}
            <a className="pbtn ghost" href={liveUrl(model, conn, cur, from)} target="_blank" rel="noreferrer">Search live prices</a>
          </div>
        ) : (
          <div className="pactions">
            {cur && <a className="pbtn primary" href={liveUrl(model, conn, cur, from)} target="_blank" rel="noreferrer">Search live prices</a>}
            <button className="pbtn ghost" onClick={() => p.onGoTo(to)}>Go to {b.short_name}</button>
          </div>
        )}
      </div>
    </div>
  )
}
