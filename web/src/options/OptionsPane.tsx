import { useMemo, useState } from 'react'
import {
  FLIGHT_COLUMNS,
  JOURNEY_COLUMNS,
  TRIP_COLUMNS,
  airportOptions,
  airportsOf,
  cityOptions,
  filterFlights,
  filterJourneys,
  filterTrips,
  nextSort,
  sortRows,
  type DashFlight,
  type DashJourney,
  type DashTrip,
  type Direction,
  type Scenario,
  type Sort,
} from '../data/dash'
import type { DashData } from '../data/load'
import { thousands } from '../lib/format'
import { DataTable } from './DataTable'
import './options.css'

export type OptionsTab = 'trips' | 'journeys' | 'flights' | 'method'

const TABS: { id: OptionsTab; label: string }[] = [
  { id: 'trips', label: 'Whole trips' },
  { id: 'journeys', label: 'Long-haul tickets' },
  { id: 'flights', label: 'Regional flights' },
  { id: 'method', label: 'How ratings work' },
]

const REBUILD = 'python3 src/dashboard_data.py --root .'

interface Props {
  dash: DashData | null
  /** the airports now ringed on the map, as the picked row's id */
  picked: string | null
  onPick(id: string | null, airports: string[]): void
  onClose(): void
}

function Missing({ what, file }: { what: string; file: string }) {
  return (
    <p className="opt-missing">
      The {what} file (data/web/{file}.json) is missing. Rebuild it with <code>{REBUILD}</code>
    </p>
  )
}

function Search({ value, onChange, label }: { value: string; onChange(v: string): void; label: string }) {
  return (
    <input
      className="opt-input opt-search"
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search city, airline, hub"
      aria-label={label}
      spellCheck={false}
    />
  )
}

function Chips<V extends string>({ value, options, onChange, label }: { value: V; options: { v: V; label: string }[]; onChange(v: V): void; label: string }) {
  return (
    <div className="opt-chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} type="button" className={`opt-chip${o.v === value ? ' on' : ''}`} aria-pressed={o.v === value} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Count({ shown, total, noun }: { shown: number; total: number; noun: string }) {
  return (
    <span className="opt-count mono">
      {shown === total ? `${total} ${noun}` : `${shown} of ${total} ${noun}`}
    </span>
  )
}

// ---- whole trips

function TripsTab({ rows, picked, onPick }: { rows: DashTrip[] | null; picked: string | null; onPick: Props['onPick'] }) {
  const [scenario, setScenario] = useState<Scenario>('all')
  const [inCity, setIn] = useState('')
  const [outCity, setOut] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>({ key: 'rating', dir: 'desc' })
  const all = rows ?? []
  const ins = useMemo(() => cityOptions(all, 'in'), [all])
  const outs = useMemo(() => cityOptions(all, 'out'), [all])
  const shown = useMemo(() => sortRows(filterTrips(all, { scenario, in: inCity, out: outCity, q }), sort), [all, scenario, inCity, outCity, q, sort])
  const best = useMemo(() => sortRows(all, { key: 'rating', dir: 'desc' })[0], [all])

  return (
    <section className="opt-tab" aria-labelledby="opt-h-trips">
      <h2 id="opt-h-trips">Whole trips: long-haul ticket plus the regional flights between regions</h2>
      {rows ? (
        <>
          {best && (
            <p className="opt-lead">
              Best rated whole trip right now: <b>{best.in}</b> in, <b>{best.out}</b> home, <b>{best.route}</b>,{' '}
              <b className="mono">{thousands(best.total_kr)}</b> kr and <b className="mono">{best.travel_hours.toFixed(1)}</b> travel hours.
              Every row is one journey, sorted by rating. Click a column to sort, click a row to see its airports on the map.
            </p>
          )}
          <p className="opt-note">
            Scenario A visits Bolivia and ends there or flies back to Central America. Scenario B skips Bolivia.
            Total is flights, cabin bag fees and hub stays (450 kr per night). Checked bags are not included.
            Regional flights are the best acceptable one-way found for each hop, on the date it was searched.
          </p>
          <div className="opt-controls">
            <Chips<Scenario>
              label="Scenario"
              value={scenario}
              onChange={setScenario}
              options={[
                { v: 'all', label: 'All' },
                { v: 'A', label: 'A: with Bolivia' },
                { v: 'B', label: 'B: without Bolivia' },
              ]}
            />
            <select className="opt-input" value={inCity} onChange={(e) => setIn(e.target.value)} aria-label="Arrival city">
              <option value="">Any arrival city</option>
              {ins.map((c) => <option key={c} value={c}>{c} in</option>)}
            </select>
            <select className="opt-input" value={outCity} onChange={(e) => setOut(e.target.value)} aria-label="Home from">
              <option value="">Any home city</option>
              {outs.map((c) => <option key={c} value={c}>{c} home</option>)}
            </select>
            <Search value={q} onChange={setQ} label="Search whole trips" />
            <Count shown={shown.length} total={all.length} noun="trips" />
          </div>
          <DataTable
            columns={TRIP_COLUMNS}
            rows={shown}
            sort={sort}
            onSort={(k) => setSort((s) => nextSort(s, k))}
            picked={picked}
            onPick={(r) => onPick(picked === r.id ? null : r.id, picked === r.id ? [] : airportsOf(r.id))}
            noun="trips"
          />
        </>
      ) : (
        <Missing what="whole trips" file="dash_trips" />
      )}
    </section>
  )
}

// ---- long-haul tickets

function JourneysTab({ rows, picked, onPick }: { rows: DashJourney[] | null; picked: string | null; onPick: Props['onPick'] }) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>({ key: 'rating', dir: 'desc' })
  const all = rows ?? []
  const shown = useMemo(() => sortRows(filterJourneys(all, q), sort), [all, q, sort])
  return (
    <section className="opt-tab" aria-labelledby="opt-h-journeys">
      <h2 id="opt-h-journeys">Long-haul tickets: one way in and one way home from Copenhagen</h2>
      {rows ? (
        <>
          <p className="opt-note">
            Every searched combination of arrival and departure city, best option per ticket type.
            Rating uses the total. The rating on flights alone is shown beside it.
          </p>
          <div className="opt-controls">
            <Search value={q} onChange={setQ} label="Search long-haul tickets" />
            <Count shown={shown.length} total={all.length} noun="tickets" />
          </div>
          <DataTable
            columns={JOURNEY_COLUMNS}
            rows={shown}
            sort={sort}
            onSort={(k) => setSort((s) => nextSort(s, k))}
            picked={picked}
            onPick={(r) => onPick(picked === r.id ? null : r.id, picked === r.id ? [] : airportsOf(r.id))}
            noun="tickets"
          />
        </>
      ) : (
        <Missing what="long-haul tickets" file="dash_journeys" />
      )}
    </section>
  )
}

// ---- regional flights

function FlightsTab({ rows }: { rows: DashFlight[] | null }) {
  const all = rows ?? []
  const airports = useMemo(() => airportOptions(all), [all])
  const [airport, setAirport] = useState(() => (airports.some((a) => a.code === 'VVI') ? 'VVI' : (airports[0]?.code ?? '')))
  const [dir, setDir] = useState<Direction>('in')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>({ key: 'price_kr', dir: 'asc' })
  const shown = useMemo(() => sortRows(filterFlights(all, { airport, dir, q }), sort), [all, airport, dir, q, sort])
  return (
    <section className="opt-tab" aria-labelledby="opt-h-flights">
      <h2 id="opt-h-flights">Regional flights into or out of one airport</h2>
      {rows ? (
        <>
          <p className="opt-note">
            Every one-way found between Latin American airports, up to 30 hours. Per route up to three rows: the cheapest,
            the fastest, and the cheapest that lands between 06:00 and 23:59. Times are local. Dates searched shows how many
            dates the route was checked on. Prices move with the date.
          </p>
          <div className="opt-controls">
            <select className="opt-input" value={airport} onChange={(e) => setAirport(e.target.value)} aria-label="Airport">
              <option value="">Any airport</option>
              {airports.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}
            </select>
            <Chips<Direction>
              label="Direction"
              value={dir}
              onChange={setDir}
              options={[
                { v: 'in', label: 'Flying into' },
                { v: 'out', label: 'Flying out of' },
              ]}
            />
            <Search value={q} onChange={setQ} label="Search regional flights" />
            <Count shown={shown.length} total={all.length} noun="flights" />
          </div>
          <DataTable columns={FLIGHT_COLUMNS} rows={shown} sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} noun="flights" />
        </>
      ) : (
        <Missing what="regional flights" file="dash_flights" />
      )}
    </section>
  )
}

// ---- how ratings work

function MethodTab() {
  return (
    <section className="opt-tab opt-method" aria-labelledby="opt-h-method">
      <h2 id="opt-h-method">How ratings work</h2>
      <p>All ratings are out of 10. Green is 8 or more, amber 5 to 7.9, red below 5.</p>
      <h3>Whole trips</h3>
      <ul>
        <li>Rating = 2 × (0.35 cost + 0.35 hours + 0.15 way home + 0.15 hassle). Cost and travel hours weigh the same.</li>
        <li>
          Cost score: 5 at 7,000 kr or less, minus 1 per 2,000 kr more (minimum 1). Cost is the total: flights, cabin bag fees,
          hub stays, and 300 kr for a bed whenever a regional flight lands between 00:00 and 05:59 (the room has to be booked from the night before).
        </li>
        <li>
          Hours score: 5 at 34 travel hours or less, minus 1 per 8 hours more (minimum 1). Travel hours add the way in, the way home
          and every regional flight with its layovers, plus 2 hours for the Boliviana hops inside Bolivia. One travel hour weighs about as much as 250 kr.
        </li>
        <li>Way home score: 5, minus 1 per hub night, minus 1 for a change between separate tickets, minus 1 for US transit, minus 1 over 20 flying hours and 1 more over 23.</li>
        <li>
          Hassle: the average of the way in (scored like the way home) and the regional flights (5, minus 1 per regional flight beyond two,
          minus 1 per flight leaving or landing between 00:00 and 05:00).
        </li>
        <li>Scope: the trip starts in Central America (not Guatemala), visits Colombia and Bolivia at most once each, and ends in Central America or Bolivia.</li>
      </ul>
      <h3>Long-haul tickets</h3>
      <ul>
        <li>Rating = 2 × (0.5 price + 0.3 way home + 0.2 way in). Price score is 5 at 7,000 kr, minus 1 per 1,000 kr more (minimum 1), on the total including hub stays.</li>
        <li>Ways are scored as above.</li>
      </ul>
      <h3>Where the numbers come from</h3>
      <p>
        The three tables are written by the Python side and read as they are. Nothing is recomputed here. Rebuild them with{' '}
        <code>python3 src/inout.py --root . && python3 src/itineraries.py --root . && python3 src/dashboard_data.py --root .</code>
      </p>
    </section>
  )
}

/** The Options pane: the flight option tables beside the map. */
export function OptionsPane({ dash, picked, onPick, onClose }: Props) {
  const [tab, setTab] = useState<OptionsTab>('trips')
  return (
    <div className="opts" aria-label="Flight options">
      <div className="opts-head">
        <div className="opts-tabs" role="tablist" aria-label="Option tables">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`opt-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`opt-panel-${t.id}`}
              className={`opts-tab${tab === t.id ? ' on' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" className="opts-close" onClick={onClose} aria-label="Hide options">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" /></svg>
        </button>
      </div>
      <div className="opts-body" role="tabpanel" id={`opt-panel-${tab}`} aria-labelledby={`opt-tab-${tab}`}>
        {!dash && <p className="opt-missing mono">Loading the option tables…</p>}
        {dash && tab === 'trips' && <TripsTab rows={dash.trips} picked={picked} onPick={onPick} />}
        {dash && tab === 'journeys' && <JourneysTab rows={dash.journeys} picked={picked} onPick={onPick} />}
        {dash && tab === 'flights' && <FlightsTab rows={dash.flights} />}
        {dash && tab === 'method' && <MethodTab />}
      </div>
    </div>
  )
}
