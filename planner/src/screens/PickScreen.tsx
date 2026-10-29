import { Fragment, useMemo, useState, type KeyboardEvent } from 'react'
import type { AppData, InOut, Option, Way } from '../data/types'
import { useStore, type Pair } from '../store'
import { clock, day, dec1, hours, kr, nextDayMark, observed, timeUncertain, TYPE_LABEL } from '../lib/format'
import { mixWays, oneWayWays, passesFilters, type Filters } from '../lib/options'
import { WayCard } from '../components/WayCard'
import { MiniMap } from '../components/MiniMap'
import { Bag, Moon, Pin } from '../components/icons'

// Picking the way in and way home: the matrix of airport pairs first, then the options of the
// picked pair, each opening into a picture of its two ways and one button to build on the map.

type SortKey = 'rating' | 'price' | 'leave' | 'home'
type Row = { o: Option; wi: Way; wh: Way }

const REGION_NAME: Record<string, string> = { CA: 'Central America', CO: 'Colombia', MX: 'Mexico', BO: 'Bolivia' }
const REGION_ORDER = ['CA', 'CO', 'MX', 'BO']
/** Best rated sorts high to low, the rest low to high. */
const SORT_DIR: Record<SortKey, 'ascending' | 'descending'> = { rating: 'descending', price: 'ascending', leave: 'ascending', home: 'ascending' }

function Stamp({ s, from }: { s: string; from?: string }) {
  if (!s) return <span className="q" title="Time unknown">?</span>
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
  return v == null ? <span className="q" title={`${what} unknown`}>?</span> : <>{kr(v)}</>
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

function useRows(inout: InOut): Row[] {
  const filters = useStore((s) => s.filters)
  return useMemo(() => {
    const f = noPair(filters)
    return inout.options
      .map((o) => ({ o, wi: inout.ways[o.way_in], wh: inout.ways[o.way_home] }))
      .filter((r) => r.wi && r.wh && passesFilters(r.o, r.wi, r.wh, f))
  }, [inout, filters])
}

export function PickScreen({ data }: { data: AppData }) {
  const mode = useStore((s) => s.pickMode)
  const setMode = useStore((s) => s.setPickMode)
  const go = useStore((s) => s.go)
  return (
    <div className="pick">
      <div className="pick-head">
        <button type="button" className="btn link small pick-back" onClick={() => go('trips', 'home')}>‹ Trips</button>
        <div className="pick-title">
          <h2 className="h2">New trip: where in, where home</h2>
          <div className="seg" role="group" aria-label="Mode">
            <button type="button" className={mode === 'options' ? 'on' : ''} aria-pressed={mode === 'options'} onClick={() => setMode('options')}>Rated pairs</button>
            <button type="button" className={mode === 'mix' ? 'on' : ''} aria-pressed={mode === 'mix'} onClick={() => setMode('mix')}>Mix one-ways</button>
          </div>
        </div>
      </div>
      {mode === 'options' ? <OptionsView data={data} /> : <MixView data={data} />}
    </div>
  )
}

function FiltersBar({ sort, onSort }: { sort: SortKey; onSort: (k: SortKey) => void }) {
  const f = useStore((s) => s.filters)
  const set = useStore((s) => s.setFilters)
  const reset = useStore((s) => s.resetFilters)
  const [more, setMore] = useState(false)
  const num = (v: string) => (v === '' ? null : Number(v))
  const active = f.maxPrice != null || f.minRating != null || f.maxHours != null || f.maxHubNights != null || f.noUS || !!f.type
  return (
    <div className="filters" role="group" aria-label="Filters">
      <div className="seg" role="group" aria-label="Sort">
        <button type="button" className={sort === 'rating' ? 'on' : ''} aria-pressed={sort === 'rating'} onClick={() => onSort('rating')}>Best rated</button>
        <button type="button" className={sort === 'price' ? 'on' : ''} aria-pressed={sort === 'price'} onClick={() => onSort('price')}>Cheapest</button>
      </div>
      <label className="chk"><input type="checkbox" checked={f.noUS} onChange={(e) => set({ noUS: e.target.checked })} /> No US transit</label>
      <label className="fld">Max price (kr)
        <input type="number" inputMode="numeric" step={500} min={0} placeholder="any" value={f.maxPrice ?? ''} onChange={(e) => set({ maxPrice: num(e.target.value) })} />
      </label>
      <label className="fld">Max hub nights
        <input type="number" inputMode="numeric" step={1} min={0} placeholder="any" value={f.maxHubNights ?? ''} onChange={(e) => set({ maxHubNights: num(e.target.value) })} />
      </label>
      {more && (
        <>
          <label className="fld">Type
            <select value={f.type} onChange={(e) => set({ type: e.target.value as typeof f.type })}>
              <option value="">Any</option>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="fld">Min rating
            <input type="number" inputMode="decimal" step={0.5} min={0} max={10} placeholder="any" value={f.minRating ?? ''} onChange={(e) => set({ minRating: num(e.target.value) })} />
          </label>
          <label className="fld">Max flying h per way
            <input type="number" inputMode="numeric" step={1} min={0} placeholder="any" value={f.maxHours ?? ''} onChange={(e) => set({ maxHours: num(e.target.value) })} />
          </label>
        </>
      )}
      <span className="spacer" />
      <div className="filters-act">
        <button type="button" className="btn link small" onClick={() => setMore((m) => !m)} aria-expanded={more}>{more ? 'Fewer filters' : 'More filters'}</button>
        {active && <button type="button" className="btn small" onClick={reset}>Clear</button>}
      </div>
    </div>
  )
}

/** Rows fly in to, columns fly home from, each tile the best option of its pair. */
function Matrix({ inout, rows, pair, onPick, sort }: { inout: InOut; rows: Row[]; pair: Pair | null; onPick: (p: Pair | null) => void; sort: SortKey }) {
  const ap = inout.airports
  const byPrice = sort === 'price'
  const [hover, setHover] = useState<Pair | null>(null)
  const { entries, exits, best, lo, hi } = useMemo(() => {
    const best = new Map<string, Row>()
    const better = (a: Row, b: Row) => (byPrice ? a.o.price_dkk < b.o.price_dkk : a.o.rating.total > b.o.rating.total)
    for (const r of rows) {
      const k = `${r.o.entry}|${r.o.exit}`
      const cur = best.get(k)
      if (!cur || better(r, cur)) best.set(k, r)
    }
    const group = (codes: string[]) => {
      const byRegion = new Map<string, string[]>()
      for (const c of codes) {
        const g = ap[c]?.region ?? 'other'
        byRegion.set(g, [...(byRegion.get(g) ?? []), c])
      }
      return [...REGION_ORDER, ...[...byRegion.keys()].filter((k) => !REGION_ORDER.includes(k))]
        .filter((g) => byRegion.has(g))
        .map((g) => ({ g, codes: byRegion.get(g)!.sort((a, b) => (ap[a]?.name ?? a).localeCompare(ap[b]?.name ?? b)) }))
    }
    const entries = group([...new Set(inout.options.map((o) => o.entry))])
    const exits = group([...new Set(inout.options.map((o) => o.exit))])
    const vals = [...best.values()].map((r) => (byPrice ? -r.o.price_dkk : r.o.rating.total))
    return { entries, exits, best, lo: Math.min(...vals), hi: Math.max(...vals) }
  }, [inout, rows, ap, byPrice])

  const step = (r: Row) => {
    const v = byPrice ? -r.o.price_dkk : r.o.rating.total
    return hi === lo ? 4 : Math.min(4, Math.floor(((v - lo) / (hi - lo)) * 5))
  }
  const hl = hover ?? pair
  const allExits = exits.flatMap((e) => e.codes)
  const any = best.size > 0
  // the ends of the ramp in the unit the tiles are sorted by
  const end = (v: number) => (byPrice ? kr(-v) : dec1(v))
  return (
    <section className="mx" aria-labelledby="mx-title">
      <div className="sec-head">
        <h3 className="sec-title" id="mx-title">Pairs</h3>
        <span className="count">{best.size} {best.size === 1 ? 'pair' : 'pairs'}</span>
        <span className="sec-note">Each tile is the {byPrice ? 'cheapest' : 'best rated'} option of its pair. Pick one to list its options.</span>
        <span className="spacer" />
        {any && (
          <span className="ramp" role="img" aria-label={byPrice ? `Price from ${end(lo)} to ${end(hi)}` : `Rating from ${end(lo)} to ${end(hi)}`}>
            <small className="ramp-k">{byPrice ? 'price' : 'rating'}</small>
            <small>{end(lo)}</small>
            {[0, 1, 2, 3, 4].map((i) => <i key={i} className={`s${i}`} />)}
            <small>{end(hi)}</small>
          </span>
        )}
      </div>
      <div className="mx-box">
        <table className="matrix" onMouseLeave={() => setHover(null)}>
          <thead>
            <tr>
              <th className="corner" rowSpan={2} scope="col"><span className="in">Fly in to</span><span className="out">Fly home from</span></th>
              {exits.map((g) => <th key={g.g} className="grp" colSpan={g.codes.length} scope="colgroup"><span>{REGION_NAME[g.g] ?? g.g}</span></th>)}
            </tr>
            <tr>
              {allExits.map((c) => (
                <th key={c} scope="col" className={`col${hl?.home === c ? ' hl' : ''}`} title={ap[c]?.name ?? c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((g) => (
              <Fragment key={g.g}>
                <tr className="grp"><th colSpan={allExits.length + 1} scope="rowgroup"><span>{REGION_NAME[g.g] ?? g.g}</span></th></tr>
                {g.codes.map((en) => (
                  <tr key={en} className={hl?.in === en ? 'hl' : ''}>
                    <th className="rowh" scope="row" title={ap[en]?.name ?? en}><b>{ap[en]?.name ?? en}</b><span className="code">{en}</span></th>
                    {allExits.map((ex) => {
                      const r = best.get(`${en}|${ex}`)
                      const on = pair?.in === en && pair?.home === ex
                      const lit = hl && (hl.in === en || hl.home === ex) ? ' hl' : ''
                      if (!r) return <td key={ex} className="none" />
                      return (
                        <td key={ex} className={`t s${step(r)}${on ? ' on' : ''}${en === ex ? ' same' : ''}${lit}`}>
                          <button
                            type="button"
                            onClick={() => onPick(on ? null : { in: en, home: ex })}
                            onMouseEnter={() => setHover({ in: en, home: ex })}
                            onFocus={() => setHover({ in: en, home: ex })}
                            onBlur={() => setHover(null)}
                            aria-pressed={on}
                            title={`${ap[en]?.name ?? en} in, ${ap[ex]?.name ?? ex} home: ${kr(r.o.price_dkk)}, rated ${dec1(r.o.rating.total)}`}
                          >
                            <b>{dec1(r.o.rating.total)}</b>
                            <small>{Math.round(r.o.price_dkk / 1000)}k</small>
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {!any && <div className="empty">No pair matches the filters.</div>}
    </section>
  )
}

function OptionsView({ data }: { data: AppData }) {
  const { inout } = data
  const rows = useRows(inout)
  const pair = useStore((s) => s.pair)
  const setPair = useStore((s) => s.setPair)
  const expanded = useStore((s) => s.expanded)
  const toggle = useStore((s) => s.toggleExpanded)
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
      <FiltersBar sort={sort} onSort={setSort} />
      <Matrix inout={inout} rows={rows} pair={pair} onPick={setPair} sort={sort} />
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
              <span className="count">{list.length} of {inout.options.length} options</span>
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
                {th('leave', 'Leaves CPH')}
                {th(null, 'Lands')}
                {th(null, 'Departs')}
                {th('home', 'Home in CPH')}
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

function Expanded({ data, option, wi, wh }: { data: AppData; option: Option; wi: Way; wh: Way }) {
  const startOnMap = useStore((s) => s.startOnMap)
  const tickets = [...new Set([...wi.tickets, ...wh.tickets])].map((t) => data.inout.tickets[t]).filter(Boolean)
  const build = () => startOnMap(wi, wh, option.id)
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
        <button type="button" className="btn primary wide" onClick={build}><Pin />Build this trip on the map</button>
        <p className="prov small faint">
          {tickets.map((t) => `${t.legs.join(' + ')} ${kr(t.price_dkk)}, ${t.source} ${observed(t.observed_at)}`).join(' · ')}
        </p>
      </div>
    </div>
  )
}

function MixView({ data }: { data: AppData }) {
  const { inout } = data
  const mixIn = useStore((s) => s.mixIn)
  const mixHome = useStore((s) => s.mixHome)
  const setMix = useStore((s) => s.setMix)
  const startOnMap = useStore((s) => s.startOnMap)
  const ins = useMemo(() => oneWayWays(inout, 'in'), [inout])
  const homes = useMemo(() => oneWayWays(inout, 'home'), [inout])
  const wi = mixIn ? inout.ways[mixIn] : null
  const wh = mixHome ? inout.ways[mixHome] : null
  const mixed = wi && wh ? mixWays(inout, wi, wh) : null
  const ap = (c: string) => inout.airports[c]?.name ?? c

  const list = (dir: 'in' | 'home', ways: Way[], sel: string | null) => (
    <section className="mix-col" aria-labelledby={`mix-${dir}`}>
      <div className="sec-head">
        <h3 className="sec-title" id={`mix-${dir}`}>{dir === 'in' ? 'One-way in' : 'One-way home'}</h3>
        <span className="count">{ways.length} ways</span>
        <span className="sec-note">Separate one-way ways, best first. One ticket and Madrid ways always come with their pair.</span>
      </div>
      <div className="waylist">
        <div className="wayrow head" aria-hidden="true"><span>{dir === 'in' ? 'Lands in' : 'Leaves from'}</span><span>{dir === 'in' ? 'Leaves CPH' : 'Departs'}</span><span>Price</span><span>Flying</span><span>Score</span></div>
        {ways.map((w) => (
          <button type="button" key={w.id} className={'wayrow' + (sel === w.id ? ' on' : '')} onClick={() => setMix(dir, sel === w.id ? null : w.id)} aria-pressed={sel === w.id}>
            <span className="wr-name"><b>{ap(dir === 'in' ? w.to : w.from)}</b> <span className="faint small">via {w.airports.slice(1, -1).join(', ') || 'nonstop'}{w.hub_nights ? ` · ${w.hub_nights} hub night${w.hub_nights > 1 ? 's' : ''}` : ''}{w.us_transit ? ' · US' : ''}</span></span>
            <span><Stamp s={w.depart} /></span>
            <span className="n">{kr(w.price_dkk)}</span>
            <span className="n">{hours(w.flying_hours)}</span>
            <span className="n">{w.score}/5</span>
          </button>
        ))}
      </div>
    </section>
  )

  return (
    <>
      <div className="mix">
        {list('in', ins, mixIn)}
        {list('home', homes, mixHome)}
      </div>
      {mixed && wi && wh ? (
        <section className="mix-pair" aria-label="The mixed pair">
          <div className="mixbar">
            <div className="mb-sum">
              <div className="small muted">{ap(wi.to)} in, {ap(wh.from)} home · separate tickets</div>
              <div className="big">{kr(mixed.price_dkk)}</div>
            </div>
            <div className="mb-facts small">Cabin bags <Num v={mixed.extras.cabin_bag_fees_dkk} what="Cabin-bag fee" /> · checked <Num v={mixed.extras.checked_bag_fees_dkk} what="Checked-bag fee" /> · {mixed.extras.hub_nights} hub nights</div>
            <Rate v={mixed.rating.total} />
            <span className="spacer" />
            <button type="button" className="btn primary" onClick={() => startOnMap(wi, wh, null)}><Pin />Build this trip on the map</button>
          </div>
          <div className="expand-in">
            <div className="ways">
              <WayCard way={wi} inout={inout} dir="in" />
              <WayCard way={wh} inout={inout} dir="home" />
            </div>
            <div className="side"><MiniMap data={inout} ways={[wi, wh]} onOpen={() => startOnMap(wi, wh, null)} /></div>
          </div>
        </section>
      ) : (
        <div className="mix-empty">Pick one way in and one way home to see the pair.</div>
      )}
    </>
  )
}
