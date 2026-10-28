import { Fragment, useMemo, useState } from 'react'
import type { AppData, Option, Way } from '../data/types'
import { useStore } from '../store'
import { dayDiff, dayTime, dec1, hours, kr, observed, TYPE_LABEL } from '../lib/format'
import { mixWays, oneWayWays, passesFilters } from '../lib/options'
import { WayTimeline } from '../components/WayTimeline'
import { MiniMap } from '../components/MiniMap'

type SortKey = 'rating' | 'price' | 'cabin' | 'outH' | 'homeH' | 'hub' | 'leave' | 'home'

function Stamp({ s, from }: { s: string; from?: string }) {
  const nd = from ? dayDiff(from, s) : 0
  return (
    <>
      {dayTime(s)}
      {nd > 0 && <span className="nd">+{nd}</span>}
      {s.endsWith('23:59') && <span className="warnmark" title="Logged as 23:59: time uncertain"> *</span>}
    </>
  )
}

function Rate({ v }: { v: number }) {
  return (
    <span className="rate" title="Rating out of 10">
      <span className="bar"><i style={{ width: `${v * 10}%` }} /></span>
      <b>{dec1(v)}</b>
    </span>
  )
}

function Num({ v, what }: { v: number | null | undefined; what: string }) {
  return v == null ? <span className="q" title={`${what} unknown`}>?</span> : <>{kr(v)}</>
}

export function PickScreen({ data }: { data: AppData }) {
  const mode = useStore((s) => s.pickMode)
  const setMode = useStore((s) => s.setPickMode)
  return (
    <>
      <div className="row">
        <div className="seg" role="group" aria-label="Mode">
          <button className={mode === 'options' ? 'on' : ''} onClick={() => setMode('options')}>Rated options</button>
          <button className={mode === 'mix' ? 'on' : ''} onClick={() => setMode('mix')}>Mix one-ways</button>
        </div>
        <span className="small muted">
          {mode === 'options'
            ? 'Every way in Latin America and back, best rating first. Click a row for the timelines.'
            : 'Pick any separate one-way in and any one-way home. One ticket and Madrid ways always come with their pair.'}
        </span>
      </div>
      {mode === 'options' ? <OptionsView data={data} /> : <MixView data={data} />}
    </>
  )
}

function FiltersBar({ data }: { data: AppData }) {
  const f = useStore((s) => s.filters)
  const set = useStore((s) => s.setFilters)
  const reset = useStore((s) => s.resetFilters)
  const ap = data.inout.airports
  const entries = [...new Set(data.inout.options.map((o) => o.entry))].sort((a, b) => (ap[a]?.name ?? a).localeCompare(ap[b]?.name ?? b))
  const exits = [...new Set(data.inout.options.map((o) => o.exit))].sort((a, b) => (ap[a]?.name ?? a).localeCompare(ap[b]?.name ?? b))
  const num = (v: string) => (v === '' ? null : Number(v))
  return (
    <div className="card filters">
      <label className="fld">Arrival city
        <select value={f.arrival} onChange={(e) => set({ arrival: e.target.value })}>
          <option value="">Any</option>
          {entries.map((c) => <option key={c} value={c}>{ap[c]?.name ?? c} ({c})</option>)}
        </select>
      </label>
      <label className="fld">Departure city
        <select value={f.departure} onChange={(e) => set({ departure: e.target.value })}>
          <option value="">Any</option>
          {exits.map((c) => <option key={c} value={c}>{ap[c]?.name ?? c} ({c})</option>)}
        </select>
      </label>
      <label className="fld">Type
        <select value={f.type} onChange={(e) => set({ type: e.target.value as typeof f.type })}>
          <option value="">Any</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="fld">Max price (kr)
        <input type="number" step={500} min={0} value={f.maxPrice ?? ''} onChange={(e) => set({ maxPrice: num(e.target.value) })} />
      </label>
      <label className="fld">Min rating
        <input type="number" step={0.5} min={0} max={10} value={f.minRating ?? ''} onChange={(e) => set({ minRating: num(e.target.value) })} />
      </label>
      <label className="fld">Max flying h per direction
        <input type="number" step={1} min={0} value={f.maxHours ?? ''} onChange={(e) => set({ maxHours: num(e.target.value) })} />
      </label>
      <label className="fld">Max hub nights
        <input type="number" step={1} min={0} value={f.maxHubNights ?? ''} onChange={(e) => set({ maxHubNights: num(e.target.value) })} />
      </label>
      <label className="chk"><input type="checkbox" checked={f.noUS} onChange={(e) => set({ noUS: e.target.checked })} /> No US transit</label>
      <span className="spacer" />
      <button className="btn small" onClick={reset}>Clear filters</button>
    </div>
  )
}

function OptionsView({ data }: { data: AppData }) {
  const { inout } = data
  const filters = useStore((s) => s.filters)
  const expanded = useStore((s) => s.expanded)
  const toggle = useStore((s) => s.toggleExpanded)
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'rating', asc: false })

  const rows = useMemo(() => {
    const val = (o: Option, wi: Way, wh: Way): number | string => {
      switch (sort.key) {
        case 'rating': return o.rating.total
        case 'price': return o.price_dkk
        case 'cabin': return o.extras.cabin_bag_fees_dkk ?? 1e9
        case 'outH': return wi.flying_hours
        case 'homeH': return wh.flying_hours
        case 'hub': return o.extras.hub_nights
        case 'leave': return wi.depart
        case 'home': return wh.arrive
      }
    }
    return inout.options
      .map((o) => ({ o, wi: inout.ways[o.way_in], wh: inout.ways[o.way_home] }))
      .filter((r) => r.wi && r.wh && passesFilters(r.o, r.wi, r.wh, filters))
      .sort((a, b) => {
        const x = val(a.o, a.wi, a.wh), y = val(b.o, b.wi, b.wh)
        const c = x < y ? -1 : x > y ? 1 : 0
        return (sort.asc ? c : -c) || b.o.rating.total - a.o.rating.total
      })
  }, [inout, filters, sort])

  const th = (key: SortKey | null, label: string, num = false) => (
    <th className={num ? 'num' : ''} onClick={key ? () => setSort((s) => ({ key, asc: s.key === key ? !s.asc : key !== 'rating' })) : undefined} aria-sort={key && sort.key === key ? (sort.asc ? 'ascending' : 'descending') : undefined}>
      {label} {key && sort.key === key && <span className="sort">{sort.asc ? '↑' : '↓'}</span>}
    </th>
  )
  const ap = (c: string) => inout.airports[c]?.name ?? c

  return (
    <>
      <FiltersBar data={data} />
      <div className="card">
        <div className="row pad" style={{ paddingBottom: 6 }}>
          <span className="count">{rows.length} of {inout.options.length} options · prices are snapshots, flights only (bags and hub stays apart)</span>
        </div>
        <div className="tablewrap">
          <table className="opts">
            <thead>
              <tr>
                {th(null, 'Arrival city')}
                {th(null, 'Departure city')}
                {th(null, 'Type')}
                {th('price', 'Flights', true)}
                {th('cabin', 'Cabin-bag fees', true)}
                {th('rating', 'Rating')}
                {th('leave', 'Leaves CPH')}
                {th(null, 'Lands')}
                {th('outH', 'Flying out', true)}
                {th(null, 'Departs home')}
                {th('home', 'Home in CPH')}
                {th('homeH', 'Flying home', true)}
                {th('hub', 'Hub nights', true)}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ o, wi, wh }) => {
                const open = expanded === o.id
                return (
                  <Fragment key={o.id}>
                    <tr className={'main' + (open ? ' open' : '')} onClick={() => toggle(o.id)} aria-expanded={open}>
                      <td className="city"><b>{ap(o.entry)}</b><span className="code">{o.entry}</span></td>
                      <td className="city"><b>{ap(o.exit)}</b><span className="code">{o.exit}</span></td>
                      <td><span className={'pill ' + o.type}>{TYPE_LABEL[o.type]}</span></td>
                      <td className="num">{kr(o.price_dkk)}</td>
                      <td className="num"><Num v={o.extras.cabin_bag_fees_dkk} what="Cabin-bag fee" /></td>
                      <td><Rate v={o.rating.total} /></td>
                      <td><Stamp s={wi.depart} /></td>
                      <td><Stamp s={wi.arrive} from={wi.depart} /></td>
                      <td className="num">{hours(wi.flying_hours)}</td>
                      <td><Stamp s={wh.depart} /></td>
                      <td><Stamp s={wh.arrive} from={wh.depart} /></td>
                      <td className="num">{hours(wh.flying_hours)}</td>
                      <td className="num">{o.extras.hub_nights || ''}</td>
                    </tr>
                    {open && (
                      <tr className="expand">
                        <td colSpan={13}><Expanded data={data} option={o} wi={wi} wh={wh} /></td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          {rows.length === 0 && <div className="empty">No option matches the filters.</div>}
        </div>
      </div>
    </>
  )
}

function Expanded({ data, option, wi, wh }: { data: AppData; option: Option; wi: Way; wh: Way }) {
  const start = useStore((s) => s.startJourney)
  const startOnMap = useStore((s) => s.startOnMap)
  const tickets = [...new Set([...wi.tickets, ...wh.tickets])].map((t) => data.inout.tickets[t]).filter(Boolean)
  return (
    <div className="expand-in">
      <WayTimeline data={data.inout} way={wi} />
      <WayTimeline data={data.inout} way={wh} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <MiniMap data={data.inout} ways={[wi, wh]} onOpen={() => startOnMap(wi, wh, option.id)} />
        <div className="tot">
          <span className="k">Flights ({tickets.length} {tickets.length === 1 ? 'ticket' : 'tickets'})</span><span className="v">{kr(option.price_dkk)}</span>
          <span className="k">Cabin-bag fees</span><span className="v"><Num v={option.extras.cabin_bag_fees_dkk} what="Cabin-bag fee" /></span>
          <span className="k">Checked bag</span><span className="v"><Num v={option.extras.checked_bag_fees_dkk} what="Checked-bag fee" /></span>
          <span className="k">Hub nights, stay est.</span><span className="v">{option.extras.hub_nights} · <Num v={option.extras.hub_stay_estimate_dkk} what="Stay estimate" /></span>
          <span className="sep" />
          <span className="k">Rating: price, way in, way home</span><span className="v">{dec1(option.rating.price)} · {option.rating.way_in} · {option.rating.way_home}</span>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          {tickets.map((t) => `${t.legs.join(' + ')} ${kr(t.price_dkk)} (${t.source}, ${observed(t.observed_at)})`).join(' · ')}
        </p>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn primary" onClick={() => start(wi, wh, option.id)}>Build trip from this</button>
          <button className="btn" onClick={() => startOnMap(wi, wh, option.id)}>Build on the map</button>
        </div>
      </div>
    </div>
  )
}

function MixView({ data }: { data: AppData }) {
  const { inout } = data
  const mixIn = useStore((s) => s.mixIn)
  const mixHome = useStore((s) => s.mixHome)
  const setMix = useStore((s) => s.setMix)
  const start = useStore((s) => s.startJourney)
  const startOnMap = useStore((s) => s.startOnMap)
  const ins = useMemo(() => oneWayWays(inout, 'in'), [inout])
  const homes = useMemo(() => oneWayWays(inout, 'home'), [inout])
  const wi = mixIn ? inout.ways[mixIn] : null
  const wh = mixHome ? inout.ways[mixHome] : null
  const mixed = wi && wh ? mixWays(inout, wi, wh) : null
  const ap = (c: string) => inout.airports[c]?.name ?? c

  const list = (dir: 'in' | 'home', ways: Way[], sel: string | null) => (
    <div className="card">
      <div className="pad" style={{ paddingBottom: 8 }}>
        <h2 className="h2">{dir === 'in' ? 'One-way in' : 'One-way home'}</h2>
        <span className="small muted">{ways.length} separate one-way ways, best way score first</span>
      </div>
      <div className="waylist">
        <div className="wayrow head"><span>{dir === 'in' ? 'Lands in' : 'Leaves from'}</span><span>{dir === 'in' ? 'Leaves CPH' : 'Departs'}</span><span>Price</span><span>Flying</span><span>Score</span></div>
        {ways.map((w) => (
          <button key={w.id} className={'wayrow' + (sel === w.id ? ' on' : '')} onClick={() => setMix(dir, sel === w.id ? null : w.id)}>
            <span><b>{ap(dir === 'in' ? w.to : w.from)}</b> <span className="faint small">via {w.airports.slice(1, -1).join(', ') || 'nonstop'}{w.hub_nights ? ` · ${w.hub_nights} hub night${w.hub_nights > 1 ? 's' : ''}` : ''}{w.us_transit ? ' · US' : ''}</span></span>
            <span>{dayTime(w.depart)}</span>
            <span>{kr(w.price_dkk)}</span>
            <span>{hours(w.flying_hours)}</span>
            <span>{w.score}/5</span>
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <>
      <div className="mix">
        {list('in', ins, mixIn)}
        {list('home', homes, mixHome)}
      </div>
      {mixed && wi && wh ? (
        <div className="card">
          <div className="mixbar">
            <div>
              <div className="small muted">{ap(wi.to)} in, {ap(wh.from)} home · separate tickets</div>
              <div className="big">{kr(mixed.price_dkk)}</div>
            </div>
            <div className="small">Cabin bags <Num v={mixed.extras.cabin_bag_fees_dkk} what="Cabin-bag fee" /> · checked <Num v={mixed.extras.checked_bag_fees_dkk} what="Checked-bag fee" /> · {mixed.extras.hub_nights} hub nights</div>
            <Rate v={mixed.rating.total} />
            <span className="spacer" />
            <button className="btn primary" onClick={() => start(wi, wh, null)}>Build trip from this</button>
            <button className="btn" onClick={() => startOnMap(wi, wh, null)}>Build on the map</button>
          </div>
          <div className="expand-in" style={{ paddingTop: 0 }}>
            <WayTimeline data={inout} way={wi} />
            <WayTimeline data={inout} way={wh} />
            <MiniMap data={inout} ways={[wi, wh]} onOpen={() => startOnMap(wi, wh, null)} />
          </div>
        </div>
      ) : (
        <div className="card empty">Pick one way in and one way home to see the pair.</div>
      )}
    </>
  )
}
