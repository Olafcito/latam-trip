import { Fragment, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { Flag } from '@map/map/Flag'
import type { AppData, InOut, Option, Way } from '../data/types'
import { changing, useStore, type Pair } from '../store'
import type { Journey } from '../lib/journey'
import { clock, day, dec1, kr, nextDayMark, observed, shortPlace, timeUncertain, TYPE_LABEL } from '../lib/format'
import { passesFilters, type Filters } from '../lib/options'
import { allIn, cityChoices, homeChoices, pairRows, type PairFilters } from '../lib/pairs'
import { HOMES } from '../lib/homes'
import { WayCard } from '../components/WayCard'
import { MiniMap } from '../components/MiniMap'
import { HomePill } from '../components/HomePill'
import { PillSelect, type PillOption } from '../components/PillSelect'
import { Arrow, Bag, Caret, Land, Moon, Pin, Plane } from '../components/icons'

// Picking the way in and the way home: the pair as the title, one row of pills that narrow the pairs,
// the pairs ranked by the score or the price, and the flight options of the open pair.

type SortKey = 'rating' | 'price' | 'leave' | 'home'
type Row = { o: Option; wi: Way; wh: Way }

const REGION_NAME: Record<string, string> = { CA: 'Central America', CO: 'Colombia', MX: 'Mexico', BO: 'Bolivia' }
/** Best rated sorts high to low, the rest low to high. */
const SORT_DIR: Record<SortKey, 'ascending' | 'descending'> = { rating: 'descending', price: 'ascending', leave: 'ascending', home: 'ascending' }

const NO_FILTERS: PairFilters = { arrival: '', departure: '', noUS: false, maxHubNights: null }

/** A city as it reads on screen: the name without the note in brackets. */
const cityName = (inout: InOut, code: string) => shortPlace(inout.airports[code]?.name ?? code)

/** The pair of cities a trip flies in to and home from. */
function ownPair(inout: InOut, j: Journey | null): Pair | null {
  const wi = j ? inout.ways[j.wayIn] : undefined
  const wh = j ? inout.ways[j.wayHome] : undefined
  return wi && wh ? { in: wi.to, home: wh.from } : null
}

function Stamp({ s, from }: { s: string; from?: string }) {
  if (!s) return <span className="q" title="Time unknown">no time</span>
  const nd = from ? nextDayMark(from, s) : ''
  return (
    <span className="stamp">
      <b>{clock(s)}</b>
      {nd && <sup className="nd">{nd}</sup>}
      {timeUncertain(s) && <span className="warnmark" title="Time not known exactly">!</span>}
      <small>{day(s)}</small>
    </span>
  )
}

function Rate({ v }: { v: number }) {
  return (
    <span className="rate" title="Rating out of 10">
      <span className="bar" aria-hidden="true"><i style={{ width: `${v * 10}%` }} /></span>
      <b>{dec1(v)}</b>
    </span>
  )
}

function Num({ v, what }: { v: number | null | undefined; what: string }) {
  return v == null ? <span className="q" title={`${what} unknown`}>not known</span> : <>{kr(v)}</>
}

/** Enter and space open a row the way a click does. */
const onActivate = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    fn()
  }
}

/** The filters without the airport pair: the matrix picks the pair. */
const noPair = (f: Filters): Filters => ({ ...f, arrival: '', departure: '' })

/** The options that leave from home and come back to it, before the filters. */
function useHomeRows(inout: InOut): Row[] {
  const home = useStore((s) => s.home)
  return useMemo(
    () =>
      inout.options
        .map((o) => ({ o, wi: inout.ways[o.way_in], wh: inout.ways[o.way_home] }))
        .filter((r) => r.wi && r.wh && r.wi.from === home && r.wh.to === home),
    [inout, home],
  )
}

function useRows(all: Row[]): Row[] {
  const filters = useStore((s) => s.filters)
  return useMemo(() => {
    const f = noPair(filters)
    return all.filter((r) => passesFilters(r.o, r.wi, r.wh, f))
  }, [all, filters])
}

export function PickScreen({ data }: { data: AppData }) {
  const { inout } = data
  const pickFor = useStore((s) => s.pickFor)
  const pair = useStore((s) => s.pair)
  const trip = useStore(changing)
  // the picker opens at its top when a trip's sheet sends you here
  useEffect(() => {
    if (pickFor) window.scrollTo({ top: 0 })
  }, [pickFor])
  return (
    <div className="pick">
      <Head inout={inout} trip={trip} shown={pair ?? ownPair(inout, trip)} />
      <Controls inout={inout} />
      <OptionsView data={data} />
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

function OptionsView({ data }: { data: AppData }) {
  const { inout } = data
  const all = useHomeRows(inout)
  const rows = useRows(all)
  const home = useStore((s) => s.home)
  const pair = useStore((s) => s.pair)
  const setPair = useStore((s) => s.setPair)
  const [expanded, setExpanded] = useState<string | null>(null)
  const toggle = (id: string) => setExpanded((e) => (e === id ? null : id))
  const [sort, setSort] = useState<SortKey>('rating')
  const ap = (c: string) => inout.airports[c]?.name ?? c

  const list = useMemo(() => {
    const val = (r: Row): number | string => {
      switch (sort) {
        case 'rating': return -r.o.rating.total
        case 'price': return r.o.price_dkk
        case 'leave': return r.wi.depart
        case 'home': return r.wh.arrive
      }
    }
    return rows
      .filter((r) => !pair || (r.o.entry === pair.in && r.o.exit === pair.home))
      .sort((a, b) => {
        const x = val(a), y = val(b)
        return (x < y ? -1 : x > y ? 1 : 0) || b.o.rating.total - a.o.rating.total
      })
  }, [rows, pair, sort])

  const th = (key: SortKey | null, label: string, num = false) => (
    <th scope="col" className={num ? 'num' : undefined} aria-sort={key && sort === key ? SORT_DIR[key] : undefined}>
      {key ? <button type="button" className="sort" onClick={() => setSort(key)}>{label}</button> : label}
    </th>
  )

  return (
    <>
      <section className="opt-sec" id="pick-list" aria-labelledby="opt-title">
        <div className="sec-head">
          {pair ? (
            <>
              <h3 className="sec-title" id="opt-title">{ap(pair.in)} in, {ap(pair.home)} home</h3>
              <span className="count">{list.length} {list.length === 1 ? 'option' : 'options'}</span>
              <span className="spacer" />
              <button type="button" className="btn small" onClick={() => setPair(null)}>Show all pairs</button>
            </>
          ) : (
            <>
              <h3 className="sec-title" id="opt-title">All pairs</h3>
              <span className="count">{list.length} of {all.length} options</span>
            </>
          )}
        </div>
        <div className="tablewrap opts-wrap">
          <table className="grid opts">
            <thead>
              <tr>
                {!pair && th(null, 'In')}
                {!pair && th(null, 'Home')}
                {th(null, 'Ticket')}
                {th('price', 'Flights', true)}
                {th(null, 'Bags', true)}
                {th('rating', 'Rating')}
                {th('leave', `Leaves ${home}`)}
                {th(null, 'Lands')}
                {th(null, 'Departs')}
                {th('home', `Home in ${home}`)}
                {th(null, 'Hub nights', true)}
              </tr>
            </thead>
            <tbody>
              {list.map(({ o, wi, wh }) => {
                const open = expanded === o.id
                return (
                  <Fragment key={o.id}>
                    <tr className={'orow' + (open ? ' open' : '')} tabIndex={0} onClick={() => toggle(o.id)} onKeyDown={onActivate(() => toggle(o.id))} aria-expanded={open}>
                      {!pair && <td className="city"><b>{ap(o.entry)}</b><span className="code">{o.entry}</span></td>}
                      {!pair && <td className="city"><b>{ap(o.exit)}</b><span className="code">{o.exit}</span></td>}
                      <td><span className={'pill ' + o.type}>{TYPE_LABEL[o.type]}</span></td>
                      <td className="num price">{kr(o.price_dkk)}</td>
                      <td className="num"><span className="ico"><Bag /><Num v={o.extras.cabin_bag_fees_dkk} what="Cabin-bag fee" /></span></td>
                      <td><Rate v={o.rating.total} /></td>
                      <td><Stamp s={wi.depart} /></td>
                      <td><Stamp s={wi.arrive} from={wi.depart} /></td>
                      <td><Stamp s={wh.depart} /></td>
                      <td><Stamp s={wh.arrive} from={wh.depart} /></td>
                      <td className="num">{o.extras.hub_nights ? <span className="ico"><Moon />{o.extras.hub_nights}</span> : <span className="faint">0</span>}</td>
                    </tr>
                    {open && (
                      <tr className="expand">
                        <td colSpan={pair ? 9 : 11}><Expanded data={data} option={o} wi={wi} wh={wh} /></td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          {list.length === 0 && <div className="empty">No option matches the filters.</div>}
        </div>
      </section>
    </>
  )
}

/** The words of the build button: a new trip goes onto the map, a trip being changed takes the ways. */
function useBuildLabel(): string {
  return useStore((s) => (changing(s) ? 'Use these ways for the trip' : 'Build this trip on the map'))
}

function Expanded({ data, option, wi, wh }: { data: AppData; option: Option; wi: Way; wh: Way }) {
  const pickWays = useStore((s) => s.pickWays)
  const label = useBuildLabel()
  const tickets = [...new Set([...wi.tickets, ...wh.tickets])].map((t) => data.inout.tickets[t]).filter(Boolean)
  const build = () => pickWays(wi, wh, option.id)
  return (
    <div className="expand-in">
      <div className="ways">
        <WayCard way={wi} inout={data.inout} dir="in" />
        <WayCard way={wh} inout={data.inout} dir="home" />
      </div>
      <div className="side">
        <MiniMap data={data.inout} ways={[wi, wh]} onOpen={build} />
        <div className="tot">
          <span className="k">Flights, {tickets.length} {tickets.length === 1 ? 'ticket' : 'tickets'}</span><span className="v big">{kr(option.price_dkk)}</span>
          <span className="k">Cabin bags</span><span className="v"><Num v={option.extras.cabin_bag_fees_dkk} what="Cabin-bag fee" /></span>
          <span className="k">Checked bags</span><span className="v"><Num v={option.extras.checked_bag_fees_dkk} what="Checked-bag fee" /></span>
          <span className="k">Hub nights, stay est.</span><span className="v">{option.extras.hub_nights} · <Num v={option.extras.hub_stay_estimate_dkk} what="Stay estimate" /></span>
          <span className="sep" />
          <span className="k">Rating: price, in, home</span><span className="v">{dec1(option.rating.price)} · {option.rating.way_in} · {option.rating.way_home}</span>
        </div>
        <button type="button" className="btn primary wide" onClick={build}><Pin />{label}</button>
        <p className="prov small faint">
          {tickets.map((t) => `${t.legs.join(' + ')} ${kr(t.price_dkk)}, ${t.source} ${observed(t.observed_at)}`).join(' · ')}
        </p>
      </div>
    </div>
  )
}
