import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType, type ReactNode } from 'react'
import { Flag } from '@map/map/Flag'
import type { AppData, InOut, Option, Ticket, Way, WayType } from '../data/types'
import { changing, useStore, type Pair } from '../store'
import type { Journey } from '../lib/journey'
import { clock, dec1, hours, kr, observed, shortPlace, timeUncertain, weekdayDay } from '../lib/format'
import type { FlightLink } from '../lib/links'
import {
  allIn, cheapestKey, cityChoices, flagChip, heldSides, homeChoices, mixOption, oneWaysFor, pairRows, pickedOf, pointsLost, scoreParts, ticketsOf, typeTiles,
  type PairFilters, type PairRow,
} from '../lib/pairs'
import { heldWayNotice } from '../lib/booked'
import { bagWords, carriersOf, flightNumbersOf, legEnds, lossLabel, pairMarks, stopsLabel, type PairMark } from '../lib/pickMarks'
import { HOMES } from '../lib/homes'
import { WayTrack } from '../components/WayCard'
import { HomePill } from '../components/HomePill'
import { PillSelect, type PillOption } from '../components/PillSelect'
import { Chevron, DisclosurePanel, useDisclosure } from '../components/Disclosure'
import { Arrow, Bag, Caret, Check, Clock, External, Land, Lock, Moon, Pin, Plane, Suitcase, Ticket as TicketIcon, TicketHop, Transfer, TwoTickets } from '../components/icons'

// Picking the way in and the way home: the pair as the title, one row of pills that narrow the pairs,
// the pairs ranked by the score or the price, and the open pair with its options, ways, cost, score and tickets.

const REGION_NAME: Record<string, string> = { CA: 'Central America', CO: 'Colombia', MX: 'Mexico', BO: 'Bolivia' }
const NO_FILTERS: PairFilters = { arrival: '', departure: '', noUS: false, maxHubNights: null }

/** A city as it reads on screen: the name without the note in brackets. */
const cityName = (inout: InOut, code: string) => shortPlace(inout.airports[code]?.name ?? code)

const pairKey = (p: Pair) => `${p.in}|${p.home}`

/** The pair of cities a trip flies in to and home from. */
function ownPair(inout: InOut, j: Journey | null): Pair | null {
  const wi = j ? inout.ways[j.wayIn] : undefined
  const wh = j ? inout.ways[j.wayHome] : undefined
  return wi && wh ? { in: wi.to, home: wh.from } : null
}

// Below this width the open pair opens in place under its row. Above it the pair is a column beside the list.
const INLINE = '(max-width: 959px)'
const watchInline = (fn: () => void) => {
  const m = matchMedia(INLINE)
  m.addEventListener('change', fn)
  return () => m.removeEventListener('change', fn)
}
const isInline = () => matchMedia(INLINE).matches
const useInline = () => useSyncExternalStore(watchInline, isInline, () => false)

export function PickScreen({ data }: { data: AppData }) {
  const { inout } = data
  const pickFor = useStore((s) => s.pickFor)
  const pair = useStore((s) => s.pair)
  const trip = useStore(changing)
  const home = useStore((s) => s.home)
  const sort = useStore((s) => s.pairSort)
  const { arrival, departure, noUS, maxHubNights } = useStore((s) => s.filters)
  const rows = useMemo(
    () => pairRows(inout, home, { arrival, departure, noUS, maxHubNights }, sort),
    [inout, home, arrival, departure, noUS, maxHubNights, sort],
  )
  const setPair = useStore((s) => s.setPair)
  const inline = useInline()
  const own = ownPair(inout, trip)
  const ownKey = own && pairKey(own)
  // the trip's own pair stands open until any pair is closed
  const [ownClosed, setOwnClosed] = useState(false)
  const openKey = pair ? pairKey(pair) : ownClosed ? null : ownKey
  // the open pair is found among all the pairs, so a filter never closes it under the user
  const openRow = useMemo(
    () => (openKey ? pairRows(inout, home, NO_FILTERS, sort).find((r) => r.key === openKey) ?? null : null),
    [inout, home, sort, openKey],
  )
  const toggle = (r: PairRow) => {
    if (r.key !== openKey) return setPair({ in: r.in, home: r.home })
    setPair(null)
    setOwnClosed(true)
  }
  const pane = (row: PairRow) => <PairPane key={row.key} data={data} row={row} trip={trip} />
  // in place, a pair the pills hide has no row to open under, so it opens under the list
  const orphan = inline && openRow && !rows.some((r) => r.key === openRow.key)
  // the picker opens at its top when a trip's sheet sends you here
  useEffect(() => {
    if (pickFor) window.scrollTo({ top: 0 })
  }, [pickFor])
  return (
    <div className="pick">
      <Head inout={inout} trip={trip} shown={pair ?? ownPair(inout, trip)} />
      <Controls inout={inout} />
      <div className="pk-body">
        <PairList
          inout={inout} rows={rows} ownKey={ownKey} openKey={openKey} onToggle={toggle}
          inline={inline ? (r) => pane(r.key === openRow?.key ? openRow : r) : null}
          filtered={!!arrival || !!departure || noUS || maxHubNights != null}
        />
        {openRow && (!inline || orphan) && <div className="pk-side" id="pk-pair" key={openRow.key}>{pane(openRow)}</div>}
      </div>
    </div>
  )
}

/** Back on the left, the trip small, and the answer as the title: from home, in to one city, home from another. */
function Head({ inout, trip, shown }: { inout: InOut; trip: Journey | null; shown: Pair | null }) {
  const go = useStore((s) => s.go)
  const home = useStore((s) => s.home)
  const h = HOMES.find((x) => x.code === home)
  const homeCity = h?.city ?? cityName(inout, home)
  return (
    <header className="pk-head">
      <button type="button" className="btn link small pk-back" onClick={() => go('trips', trip ? 'trip' : 'home')}>
        <Caret dir="l" />{trip ? 'Back to the trip' : 'Trips'}
      </button>
      <p className="pk-eyebrow">{trip?.name || 'New trip'}</p>
      <h2 className="pk-title">
        <Flag code={h?.country ?? inout.airports[home]?.country ?? ''} size={14} title={shown ? `From ${homeCity}` : undefined} />
        {shown ? (
          <>
            <span className="pk-city">{cityName(inout, shown.in)}</span>
            <span className="pk-arrow" aria-hidden="true"><Arrow s={20} /></span>
            <span className="vh"> to </span>
            <span className="pk-city">{cityName(inout, shown.home)}</span>
          </>
        ) : (
          <span className="pk-city">{homeCity}</span>
        )}
      </h2>
    </header>
  )
}

/** The rows of a Fly in or Fly home pill: any city, then each city by region with its best price. */
function cityOptions(inout: InOut, home: string, f: PairFilters, side: 'in' | 'home'): PillOption[] {
  const key = side === 'in' ? 'arrival' : 'departure'
  const choices = cityChoices(pairRows(inout, home, { ...f, [key]: '' }, 'cheapest'), side, inout.airports)
  const row = (code: string): PillOption => ({ value: code, label: cityName(inout, code), sub: code, flag: inout.airports[code]?.country })
  const any: PillOption = {
    value: '', label: 'Any city', short: side === 'in' ? 'Fly in' : 'Fly home',
    price: choices.length ? Math.min(...choices.map((c) => c.best)) : null, off: choices.length === 0,
  }
  const cur = f[key]
  // a city picked before the other pills took all its pairs away stays on top, off, so the pill can still name it
  const lost: PillOption[] = cur && !choices.some((c) => c.code === cur) ? [{ ...row(cur), off: true }] : []
  return [any, ...lost, ...choices.map((c) => ({ ...row(c.code), price: c.best, group: REGION_NAME[c.region] ?? 'Other' }))]
}

const HUB: { value: string; label: string; short: string; max: number | null }[] = [
  { value: '', label: 'Any', short: 'Hub nights', max: null },
  { value: '0', label: 'None', short: 'No hub nights', max: 0 },
  { value: '1', label: '1 at most', short: '1 hub night at most', max: 1 },
  { value: '2', label: '2 at most', short: '2 hub nights at most', max: 2 },
]

/** One wrapping row: where from, where in, where home, the order, and the two filters. */
function Controls({ inout }: { inout: InOut }) {
  const home = useStore((s) => s.home)
  const setHome = useStore((s) => s.setHome)
  const filters = useStore((s) => s.filters)
  const setFilters = useStore((s) => s.setFilters)
  const sort = useStore((s) => s.pairSort)
  const setSort = useStore((s) => s.setPairSort)
  const { arrival, departure, noUS, maxHubNights } = filters
  const f = useMemo<PairFilters>(() => ({ arrival, departure, noUS, maxHubNights }), [arrival, departure, noUS, maxHubNights])
  const homeBest = useMemo(() => Object.fromEntries(homeChoices(inout, HOMES.map((h) => h.code)).map((c) => [c.code, c.best])), [inout])
  const ins = useMemo(() => cityOptions(inout, home, f, 'in'), [inout, home, f])
  const homes = useMemo(() => cityOptions(inout, home, f, 'home'), [inout, home, f])
  const hubs = useMemo<PillOption[]>(() => [
    ...HUB,
    // a limit stored by the old picker still shows as itself
    ...(maxHubNights != null && maxHubNights > 2 ? [{ value: String(maxHubNights), label: `${maxHubNights} at most`, short: `${maxHubNights} hub nights at most`, max: maxHubNights }] : []),
  ].map((h) => {
    const rows = pairRows(inout, home, { ...f, maxHubNights: h.max }, 'cheapest')
    const price = rows.length ? Math.min(...rows.map((r) => allIn(r.cheapest))) : null
    return { value: h.value, label: h.label, short: h.short, price, off: price == null && h.max !== maxHubNights }
  }), [inout, home, f, maxHubNights])
  const on = !!arrival || !!departure || noUS || maxHubNights != null
  return (
    <div className="pk-controls" role="group" aria-label="Pairs to show">
      <HomePill value={home} onChange={setHome} best={homeBest} />
      <PillSelect name="Fly in" value={arrival} options={ins} onChange={(v) => setFilters({ arrival: v })} icon={<Land s={14} />} set={!!arrival} />
      <PillSelect name="Fly home" value={departure} options={homes} onChange={(v) => setFilters({ departure: v })} icon={<Plane s={14} />} set={!!departure} />
      <div className="seg pk-sort" role="group" aria-label="Order">
        <button type="button" aria-pressed={sort === 'best'} onClick={() => setSort('best')}>Best</button>
        <button type="button" aria-pressed={sort === 'cheapest'} onClick={() => setSort('cheapest')}>Cheapest</button>
      </div>
      <button type="button" className="ps-pill pk-chip" aria-pressed={noUS} data-set={noUS || undefined} title="Leave out ways through the United States" onClick={() => setFilters({ noUS: !noUS })}>
        No US
      </button>
      <PillSelect
        name="Hub nights" value={maxHubNights == null ? '' : String(maxHubNights)} options={hubs}
        onChange={(v) => setFilters({ maxHubNights: v === '' ? null : Number(v) })} icon={<Moon />} set={maxHubNights != null}
      />
      {on && <button type="button" className="btn link small pk-clear" onClick={() => setFilters(NO_FILTERS)}>Clear</button>}
    </div>
  )
}

const TOP = 10

const TYPE_ICON: Record<WayType, { label: string; Icon: ComponentType<{ s?: number }> }> = {
  ticket: { label: 'One ticket', Icon: TicketIcon },
  madrid: { label: 'Madrid ticket', Icon: TicketHop },
  oneways: { label: 'Two one ways', Icon: TwoTickets },
}

/** An icon that says a fact: its words for a screen reader and as a tooltip. */
function Said({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return <span className={className} role="img" aria-label={label} title={label}>{children}</span>
}

function MarkIcon({ m }: { m: PairMark }) {
  switch (m.kind) {
    case 'night': return <Said label={m.label} className="pk-mark"><Moon /><span aria-hidden="true">{m.text}</span></Said>
    case 'us': return <Said label={m.label} className="pk-mark pk-us"><span aria-hidden="true">US</span></Said>
    case 'change': return <Said label={m.label} className="pk-mark"><Transfer s={13} /></Said>
    case 'long': return <Said label={m.label} className="pk-mark"><Clock s={13} /></Said>
  }
}

/** The ranked pairs: the top ten by the sort, then all of them on request. The open pair stays in view past the top ten. */
function PairList({ inout, rows, ownKey, openKey, onToggle, inline, filtered }: {
  inout: InOut; rows: PairRow[]; ownKey: string | null; openKey: string | null; onToggle: (r: PairRow) => void
  /** on a narrow screen: the open pair, drawn in place under its row */
  inline: ((r: PairRow) => ReactNode) | null
  filtered: boolean
}) {
  const setFilters = useStore((s) => s.setFilters)
  const home = useStore((s) => s.home)
  const [all, setAll] = useState(false)
  const cheap = useMemo(() => cheapestKey(rows), [rows])
  // one pair drawn in place: the open one, or the one closing while its height runs down
  const [drawn, setDrawn] = useState<string | null>(null)
  if (openKey && openKey !== drawn) setDrawn(openKey)
  // in place, the row tapped stays under the finger while the pair above it closes
  const list = useRef<HTMLOListElement>(null)
  const anchor = useRef<{ key: string; top: number } | null>(null)
  useLayoutEffect(() => {
    const a = anchor.current
    anchor.current = null
    const el = a && list.current?.querySelector(`[data-key="${CSS.escape(a.key)}"]`)
    if (a && el) window.scrollBy(0, el.getBoundingClientRect().top - a.top)
  }, [openKey])

  if (!rows.length) {
    const city = HOMES.find((h) => h.code === home)?.city ?? cityName(inout, home)
    return (
      <section className="pk-list pk-empty" aria-label="Pairs">
        <p className="pk-empty-title">{filtered ? 'No pairs' : `No fares from ${city}`}</p>
        {filtered && <button type="button" className="btn small" onClick={() => setFilters(NO_FILTERS)}>Clear</button>}
      </section>
    )
  }

  const at = openKey ? rows.findIndex((r) => r.key === openKey) : -1
  const shown = rows.map((r, i) => ({ r, i })).filter(({ i }) => all || i < TOP || i === at)
  return (
    <section className="pk-list" aria-label="Pairs">
      <ol className="pk-rows" ref={list}>
        {shown.map(({ r, i }) => {
          const wi = inout.ways[r.best.way_in]
          const wh = inout.ways[r.best.way_home]
          const open = r.key === openKey
          const panelId = `pk-pair-${r.in}-${r.home}`
          return (
            <li key={r.key} data-gap={i >= TOP && !all ? '' : undefined}>
              <button
                type="button" className="pk-row" data-key={r.key} aria-expanded={open}
                aria-controls={inline ? panelId : open ? 'pk-pair' : undefined}
                onClick={(e) => {
                  if (inline) anchor.current = { key: r.key, top: e.currentTarget.getBoundingClientRect().top }
                  onToggle(r)
                }}
              >
                <span className="pk-rank" data-first={i === 0 || undefined}><span className="vh">Rank </span>{i + 1}</span>
                <span className="pk-cities">
                  <span className="pk-c"><Flag code={inout.airports[r.in]?.country ?? ''} size={12} />{cityName(inout, r.in)}</span>
                  <span className="pk-to" aria-hidden="true"><Arrow s={13} /></span>
                  <span className="vh"> to </span>
                  <span className="pk-c"><Flag code={inout.airports[r.home]?.country ?? ''} size={12} />{cityName(inout, r.home)}</span>
                </span>
                <span className="pk-meta">
                  <span className="pk-types">
                    {r.types.map((t) => {
                      const { label, Icon } = TYPE_ICON[t]
                      return <Said key={t} label={label} className="pk-type"><Icon s={14} /></Said>
                    })}
                  </span>
                  {wi && wh && pairMarks(wi, wh).map((m) => <MarkIcon key={m.kind} m={m} />)}
                  {r.options.length > 1 && <span className="pk-count">{r.options.length} options</span>}
                  {r.key === cheap && <span className="tag pk-cheap">Cheapest</span>}
                  {r.key === ownKey && <Said label="In the trip" className="pk-own"><Check s={14} /></Said>}
                </span>
                <span className="pk-price">
                  <b>{kr(allIn(r.best))}</b>
                  <small title="Score out of 10"><span className="vh">Score </span>{dec1(scoreParts(r.best.rating).total)}</small>
                </span>
              </button>
              {inline && (
                <DisclosurePanel id={panelId} open={open} className="pk-inline">
                  {drawn === r.key && inline(r)}
                </DisclosurePanel>
              )}
            </li>
          )
        })}
      </ol>
      {rows.length > TOP && (
        <button type="button" className="btn link small pk-more" aria-expanded={all} onClick={() => setAll((a) => !a)}>
          {all ? `Show the top ${TOP}` : `Show all ${rows.length} pairs`}
        </button>
      )}
    </section>
  )
}

/** A local time as the day and the clock, with a mark when the clock is a guess. */
function When({ s }: { s: string }) {
  if (!s) return <span className="pk-faint">Time not known</span>
  return (
    <span className="pk-when">
      <b>{weekdayDay(s)}</b> {clock(s)}
      {timeUncertain(s) && <span className="warnmark" role="img" aria-label="Time not known exactly" title="Time not known exactly">!</span>}
    </span>
  )
}

/** A figure, or "not known" when the data has none. */
function Fee({ v }: { v: number | null | undefined }) {
  return v == null ? <span className="pk-faint">not known</span> : <>{kr(v)}</>
}

/**
 * One pair opened: what each ticket type costs, the options as radio cards, the one ways to swap on two one
 * ways, the two ways, the cost, the score in its parts and every ticket behind them.
 */
function PairPane({ data, row, trip }: { data: AppData; row: PairRow; trip: Journey | null }) {
  const { inout } = data
  const home = useStore((s) => s.home)
  const bookings = useStore((s) => s.bookings)
  const unlocked = useStore((s) => s.unlocked)
  const chosen = useStore((s) => s.chosen)
  const setChosen = useStore((s) => s.setChosen)
  const mixIn = useStore((s) => s.mixIn)
  const mixHome = useStore((s) => s.mixHome)
  const setMix = useStore((s) => s.setMix)
  const [type, setType] = useState<WayType | null>(null)
  const picked = pickedOf(inout, row, { chosen, tripIn: trip?.wayIn, tripHome: trip?.wayHome, mixIn, mixHome })
  const tiles = typeTiles(row.options)
  const list = type ? row.options.filter((o) => o.type === type) : row.options
  const mix = picked.base.type === 'oneways' ? oneWaysFor(inout, home, row.in, row.home) : null
  const choose = (id: string) => {
    setChosen(id)
    setMix('in', null)
    setMix('home', null)
  }
  const name = `pk-opt-${row.key}`
  const held = heldSides(bookings, data, trip, picked.wi, picked.wh, unlocked)
  return (
    <section className="pk-pair" aria-label={`${cityName(inout, row.in)} to ${cityName(inout, row.home)}`}>
      {tiles.length > 1 && (
        <div className="pk-tiles" role="group" aria-label="Ticket type">
          {tiles.map((t) => {
            const { label, Icon } = TYPE_ICON[t.type]
            return (
              <button key={t.type} type="button" className="pk-tile" aria-pressed={type === t.type} onClick={() => {
                if (type === t.type) return setType(null)
                setType(t.type)
                if (picked.base.type !== t.type) choose(t.option.id)
              }}>
                <span className="pk-tile-name"><Icon s={15} />{label}</span>
                <b className="pk-tile-price">{kr(t.price)}</b>
                <small className="pk-tile-delta" data-best={t.delta === 0 || undefined}>{t.delta === 0 ? 'Cheapest' : `+${kr(t.delta)}`}</small>
              </button>
            )
          })}
        </div>
      )}

      <div className="pk-opts" role="radiogroup" aria-label="Options">
        {list.map((o) => {
          const wi = inout.ways[o.way_in]
          const wh = inout.ways[o.way_home]
          if (!wi || !wh) return null
          const { label, Icon } = TYPE_ICON[o.type]
          const air = unique([...carriersOf(wi), ...carriersOf(wh)])
          const on = o.id === picked.base.id
          return (
            <label key={o.id} className="pk-opt" data-on={on || undefined}>
              <input type="radio" className="vh" name={name} checked={on} onChange={() => choose(o.id)} />
              <Said label={label} className="pk-opt-type"><Icon s={16} /></Said>
              <span className="pk-opt-ways">
                <span className="pk-opt-way"><span className="pk-dir" aria-hidden="true"><Land s={13} /></span><span className="vh">Out </span><When s={wi.depart} /><span className="pk-stops">{stopsLabel(wi)}</span></span>
                <span className="pk-opt-way"><span className="pk-dir" aria-hidden="true"><Plane s={13} /></span><span className="vh">Home </span><When s={wh.depart} /><span className="pk-stops">{stopsLabel(wh)}</span></span>
                {air.length > 0 && <span className="pk-opt-air">{air.join(', ')}</span>}
              </span>
              <b className="pk-opt-price">{kr(allIn(o))}</b>
            </label>
          )
        })}
      </div>

      {mix && (mix.ins.length > 1 || mix.homes.length > 1) && (
        <div className="pk-mix">
          <MixList label="Way in" ways={mix.ins} at={picked.wi.id} price={(w) => allIn(mixOption(inout, w, picked.wh))} onPick={(id) => setMix('in', id === picked.base.way_in ? null : id)} />
          <MixList label="Way home" ways={mix.homes} at={picked.wh.id} price={(w) => allIn(mixOption(inout, picked.wi, w))} onPick={(id) => setMix('home', id === picked.base.way_home ? null : id)} />
        </div>
      )}

      <div className="pk-legs">
        <Leg inout={inout} way={picked.wi} dir="in" held={held.in} />
        <Leg inout={inout} way={picked.wh} dir="home" held={held.home} />
      </div>

      <div className="pk-facts">
        <Cost option={picked.option} />
        <Score option={picked.option} wi={picked.wi} wh={picked.wh} />
      </div>

      <Tickets inout={inout} wi={picked.wi} wh={picked.wh} />

      <Apply inout={inout} wi={picked.wi} wh={picked.wh} optionId={picked.option.id} trip={trip} held={held} />
    </section>
  )
}

/** What a held pick reads on the button, and the tooltip that says where to change it. */
function heldWords(held: { in: boolean; home: boolean }): { label: string; notice: string } | null {
  if (held.in && held.home) return { label: 'Both ways booked', notice: 'Both ways are booked. Change them from their bookings.' }
  if (held.in) return { label: 'Way in booked', notice: heldWayNotice('in') }
  if (held.home) return { label: 'Way home booked', notice: heldWayNotice('home') }
  return null
}

/**
 * The pick, pinned to the foot of the pair: start the trip on these two ways, or change the trip to them.
 * Off, and still focusable for its tooltip, when the trip already flies them or a side of it is booked.
 */
function Apply({ inout, wi, wh, optionId, trip, held }: {
  inout: InOut; wi: Way; wh: Way; optionId: string; trip: Journey | null; held: { in: boolean; home: boolean }
}) {
  const pickWays = useStore((s) => s.pickWays)
  const same = !!trip && trip.wayIn === wi.id && trip.wayHome === wh.id
  const lock = same ? null : heldWords(held)
  const off = same || !!lock
  return (
    <div className="pk-apply">
      <button
        type="button" className="btn primary wide" aria-disabled={off || undefined} data-held={lock ? '' : undefined}
        title={same ? 'The trip flies these two ways' : lock?.notice}
        onClick={() => {
          if (!off) pickWays(wi, wh, optionId)
        }}
      >
        {same ? (
          <><Check s={15} />In the trip</>
        ) : lock ? (
          <><Lock s={15} />{lock.label}</>
        ) : (
          <><Pin s={15} />Start {cityName(inout, wi.to)}, end {cityName(inout, wh.from)}</>
        )}
      </button>
    </div>
  )
}

const unique = (xs: string[]) => [...new Set(xs)]

/** The one ways of one side that can swap in, each priced all in with the other side kept, the one in use checked. */
function MixList({ label, ways, at, price, onPick }: { label: string; ways: Way[]; at: string; price: (w: Way) => number; onPick: (id: string) => void }) {
  const name = `pk-mix-${label}`
  if (ways.length < 2) return null
  return (
    <div className="pk-mix-side" role="radiogroup" aria-label={label}>
      <p className="pk-label">{label}</p>
      {ways.map((w) => (
        <label key={w.id} className="pk-mix-row" data-on={w.id === at || undefined}>
          <input type="radio" className="vh" name={name} checked={w.id === at} onChange={() => onPick(w.id)} />
          <When s={w.depart} />
          <span className="pk-stops">{stopsLabel(w)}</span>
          <span className="pk-mix-price" title="All in with this way">{kr(price(w))}</span>
        </label>
      ))}
    </div>
  )
}

/** One way: its ends with their clock times on the track, the flights, the time it takes. */
function Leg({ inout, way, dir, held }: { inout: InOut; way: Way; dir: 'in' | 'home'; held: boolean }) {
  const nums = flightNumbersOf(way)
  const air = Math.abs(way.total_hours - way.flying_hours) >= 0.1
  return (
    <article className="pk-leg">
      <header className="pk-leg-head">
        <span className="pk-dir" aria-hidden="true">{dir === 'in' ? <Land s={14} /> : <Plane s={14} />}</span>
        <h3>{dir === 'in' ? 'Way in' : 'Way home'}</h3>
        {held && <span className="pk-held" title={heldWayNotice(dir)}><Lock s={12} />Booked</span>}
        <span className="pk-leg-time">
          <Said label={`Total time ${hours(way.total_hours)}`} className="pk-fig"><Clock s={13} /><span aria-hidden="true">{hours(way.total_hours)}</span></Said>
          {air && <Said label={`Time in the air ${hours(way.flying_hours)}`} className="pk-fig"><Plane s={12} /><span aria-hidden="true">{hours(way.flying_hours)}</span></Said>}
        </span>
      </header>
      <WayTrack way={way} airports={inout.airports} />
      {nums.length > 0 && <p className="pk-leg-air">{nums.join(', ')}</p>}
    </article>
  )
}

/** What the option costs: the parts of the all in price, the total, then the checked bags it leaves out. */
function Cost({ option }: { option: Option }) {
  const x = option.extras
  const guess = x.cabin_bag_fees_dkk == null || (x.hub_nights > 0 && x.hub_stay_estimate_dkk == null)
  return (
    <dl className="pk-cost">
      <dt>Flights</dt><dd>{kr(option.price_dkk)}</dd>
      <dt>Cabin bags</dt><dd><Fee v={x.cabin_bag_fees_dkk} /></dd>
      {x.hub_nights > 0 && (
        <>
          <dt>Hub stays<Said label={x.hub_nights === 1 ? '1 night' : `${x.hub_nights} nights`} className="pk-fig pk-faint"><Moon /><span aria-hidden="true">{x.hub_nights}</span></Said></dt>
          <dd><Fee v={x.hub_stay_estimate_dkk} /></dd>
        </>
      )}
      <dt className="pk-all">All in</dt>
      <dd className="pk-all">
        {kr(allIn(option))}
        {guess && <span className="warnmark" role="img" aria-label="A fee is not known" title="A fee is not known">!</span>}
      </dd>
      <dt className="pk-extra">Checked bags</dt><dd className="pk-extra"><Fee v={x.checked_bag_fees_dkk} /></dd>
    </dl>
  )
}

/** The score out of 10 as a meter in three parts, the marks that cost points under the part they hit. */
function Score({ option, wi, wh }: { option: Option; wi: Way; wh: Way }) {
  const p = scoreParts(option.rating)
  const parts = [
    { key: 'price', label: 'Price', v: p.price, of: 5, lost: [] as string[] },
    { key: 'home', label: 'Way home', v: p.home, of: 3, lost: pointsLost(wh).map(lossLabel) },
    { key: 'in', label: 'Way in', v: p.in, of: 2, lost: pointsLost(wi).map(lossLabel) },
  ]
  const said = `Score ${dec1(p.total)} of 10: ` + parts.map((x) => `${x.label.toLowerCase()} ${dec1(x.v)} of ${x.of}`).join(', ')
  return (
    <div className="pk-score">
      <p className="pk-score-head"><span className="pk-label">Score</span><b>{dec1(p.total)}</b></p>
      <div className="pk-meter" role="img" aria-label={said}>
        {parts.map((x) => (
          <span key={x.key} style={{ flexGrow: x.of }}><i style={{ width: `${Math.max(0, Math.min(1, x.v / x.of)) * 100}%` }} /></span>
        ))}
      </div>
      <div className="pk-parts" aria-hidden="true">
        {parts.map((x) => (
          <div key={x.key} style={{ flexGrow: x.of }}>
            <span className="pk-part-name">{x.label}</span> <span className="pk-part-v">{dec1(x.v)}</span>
            {x.lost.map((l, i) => <span key={i} className="pk-lost">{l}</span>)}
          </div>
        ))}
      </div>
    </div>
  )
}

const SOURCE: Record<string, string> = { momondo: 'Momondo', 'momondo-manual': 'Momondo', kiwi: 'Kiwi.com', google_flights: 'Google Flights', 'google-flights-manual': 'Google Flights', expedia: 'Expedia' }

/** Every ticket behind the two ways: where and when it was seen, the fare, the legs, the price, the bags, its flags, one link and its notes. */
function Tickets({ inout, wi, wh }: { inout: InOut; wi: Way; wh: Way }) {
  const list = ticketsOf(inout, wi, wh)
  if (!list.length) return null
  return (
    <div className="pk-tickets">
      <p className="pk-label">{list.length === 1 ? '1 ticket' : `${list.length} tickets`}</p>
      <ul>
        {list.map(({ ticket: t, link }) => <TicketRow key={t.id} t={t} link={link} />)}
      </ul>
    </div>
  )
}

function TicketRow({ t, link }: { t: Ticket; link: FlightLink | null }) {
  const notes = useDisclosure()
  const site = link?.site ?? SOURCE[t.source] ?? t.source
  return (
    <li className="pk-ticket">
      <div className="pk-t-head">
        <b className="pk-t-site">{site}</b>
        <span className="pk-faint">Seen {observed(t.observed_at)}</span>
        <b className="pk-t-price">{kr(t.price_dkk)}</b>
      </div>
      <div className="pk-t-legs">
        {t.legs.map((l, i) => {
          const e = legEnds(l)
          return (
            <span key={i} className="pk-t-leg">
              {e ? <>{e[0]}<span aria-hidden="true"><Arrow s={11} /></span><span className="vh"> to </span>{e[1]}</> : l}
            </span>
          )
        })}
        {t.fare_brand && <span className="pk-t-fare">{t.fare_brand}</span>}
      </div>
      <div className="pk-t-bags">
        <span className="pk-t-bag"><Said label="Cabin bag" className="pk-fig"><Bag s={13} /></Said>{bagWords(t.cabin_bag, t.cabin_bag_fee_dkk)}</span>
        <span className="pk-t-bag"><Said label="Checked bag" className="pk-fig"><Suitcase s={13} /></Said>{bagWords(t.checked_bag, t.checked_bag_fee_dkk, true)}</span>
      </div>
      {t.flags.length > 0 && (
        <ul className="pk-t-flags" aria-label="Flags">
          {t.flags.map((f) => { const c = flagChip(f); return <li key={f} className="pk-flag" data-tone={c.tone}>{c.label}</li> })}
        </ul>
      )}
      <div className="pk-t-foot">
        {link && (
          <a className="btn small" href={link.href} target="_blank" rel="noreferrer" title={link.saved ? `The page the price was seen on, at ${link.site}` : `A fresh search at ${link.site}`}>
            {link.saved ? `Open on ${link.site}` : `Search ${link.site}`}<External />
          </a>
        )}
        {t.notes && (
          <button className="btn link small pk-t-notes" {...notes.trigger}>Notes<Chevron open={notes.open} /></button>
        )}
      </div>
      {t.notes && <DisclosurePanel {...notes.panel}><p className="pk-t-note">{t.notes}</p></DisclosurePanel>}
    </li>
  )
}
