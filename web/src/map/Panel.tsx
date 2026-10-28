import { useState, type Ref } from 'react'
import { byCountry, countries, countryName, neighbours, otherEnd, stopsFrom, viaText, type Model, type Neighbour } from '../data/model'
import { tripEnd, type Trip } from '../data/trips'
import { familyOf, type Connection, type DatedFare, type Family, type FlownLeg, type Mode, type Place, type RoundTrip, type RouteOption } from '../data/types'
import { altitude, duration, fromPrice, kr, modeLabel, observed, shortDate, thousands } from '../lib/format'
import { Arrow, Back, Chevron, Close, Flag, ModeChip, Moon } from './icons'

export type PanelView = 'city' | 'more' | 'route' | 'trips'

export interface View {
  sel: string | null
  panel: PanelView | null
  route: string | null // connection id in route view
  from: string | null // the end the route is read from
  opt: number // index into the route's enabled options, fastest first
  back: 'city' | 'more' | null // where Esc and the back button go from route view
}

export interface PanelProps {
  model: Model
  view: View
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
}

/** Wikimedia thumbnails come in fixed steps; swap the width in the URL. */
const sized = (url: string, w: number) => url.replace(/\/\d+px-([^/]+)$/, `/${w}px-$1`)

export function Panel(p: PanelProps) {
  const { model, view } = p
  const city = view.sel ? model.byId.get(view.sel) : undefined
  const conn = view.route ? model.conns.get(view.route) : undefined
  if (!view.panel || (!city && !conn)) return null
  const wide = view.panel !== 'city'
  const title = view.panel === 'route' && conn ? routeTitle(model, conn, view.from ?? conn.a) : city?.short_name ?? ''

  return (
    <section ref={p.panelRef} className={`panel${wide ? ' wide' : ''}${p.collapsed ? ' collapsed' : ''}`} aria-label="Details">
      {p.collapsed ? (
        <div className="pslim">
          <span className="pslim-name">{title}</span>
          <button className="x sm" aria-label="Expand panel" onClick={() => p.onCollapse(false)}><Chevron up={false} /></button>
          <button className="x sm" aria-label="Close" onClick={p.onClose}><Close /></button>
        </div>
      ) : view.panel === 'city' && city ? (
        <CityView key={`c:${city.id}`} {...p} city={city} />
      ) : view.panel === 'more' && city ? (
        <MoreView key={`m:${city.id}`} {...p} city={city} />
      ) : conn ? (
        <RouteView key={`r:${conn.id}:${view.from}`} {...p} conn={conn} />
      ) : null}
    </section>
  )
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

function OptChip({ o, label }: { o: RouteOption; label?: boolean }) {
  return (
    <span className="copt mono">
      <ModeChip family={familyOf(o.mode)} />
      {label && <span className="copt-m">{modeLabel(o.mode).toLowerCase()}</span>}
      <b>{duration(o.duration_min)}</b> {fromPrice(o.price_dkk.min)}
    </span>
  )
}

/** The connections of `from`, under a heading per country once more than one country is reachable. */
function ConnList({ p, list, from, compact }: { p: PanelProps; list: Neighbour[]; from: string; compact?: boolean }) {
  const home = p.model.byId.get(from)?.country ?? ''
  const groups = byCountry(list, home)
  if (groups.length < 2) return <ConnRows p={p} list={list} from={from} compact={compact} />
  return (
    <div className={`cgroups${compact ? ' flush' : ''}`}>
      {groups.map((g) => (
        <section key={g.country}>
          <p className="cgroup mono">{g.country === home ? `Within ${countryName(p.model, g.country)}` : countryName(p.model, g.country)}</p>
          <ConnRows p={p} list={g.list} from={from} compact={compact} />
        </section>
      ))}
    </div>
  )
}

function ConnRows({ p, list, from, compact }: { p: PanelProps; list: Neighbour[]; from: string; compact?: boolean }) {
  return (
    <ul className={`clist${compact ? ' flush' : ''}`}>
      {list.map((n, i) => (
        <li key={n.conn.id} className="crow" style={{ animationDelay: `${0.12 + Math.min(i, 10) * 0.04}s` }}>
          <button
            onClick={() => p.onRoute(n.conn.id, from)}
            onMouseEnter={() => p.onHoverRoute(n.conn.id, from)}
            onMouseLeave={() => p.onHoverRoute(null)}
            onFocus={() => p.onHoverRoute(n.conn.id, from)}
            onBlur={() => p.onHoverRoute(null)}
          >
            <span className="cr-top">
              <span className="cr-name">{n.other.short_name}</span>
              <span className="cr-arrow"><Arrow /></span>
            </span>
            <span className="cr-opts">
              {n.options.map((o, j) => <OptChip key={j} o={o} label />)}
            </span>
          </button>
        </li>
      ))}
    </ul>
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
  const { model, city } = p
  const list = neighbours(model, city.id, p.families)
  const kicker = [countryName(model, city.country), altitude(city.altitude_m)].filter(Boolean).join(' · ')
  return (
    <div className="pview">
      <div className="phead stg">
        <Thumb city={city} w={250} className="thumb" />
        <div className="ptext">
          <p className="kicker mono">{kicker}</p>
          <h2 className="pname">{city.short_name}</h2>
          {city.why && <p className="why">{city.why}</p>}
        </div>
        <HeadButtons {...p} />
      </div>
      {p.trip && (
        <p className="tripnote">
          {tripEnd(p.trip) === city.id
            ? <>Your trip <b>{p.trip.name}</b> ends here. Pick a connection to add the next leg.</>
            : p.trip.legs.length
              ? <>Adding to <b>{p.trip.name}</b>. Pick a connection to add a leg from here.</>
              : <>Pick a connection to start <b>{p.trip.name}</b> here.</>}
        </p>
      )}
      <div className="pmid stg">
        {!!city.categories?.length && (
          <div className="tags">{city.categories.map((c) => <span key={c} className="tag">{c}</span>)}</div>
        )}
        {!!(city.summary || city.things_to_do?.length) && (
          <button className="more" onClick={p.onMore}>More about {city.short_name} <span className="arr"><Arrow /></span></button>
        )}
      </div>
      <div className="sechead"><p className="sub mono">Connections</p><p className="sub mono">{list.length}</p></div>
      {list.length ? <ConnList p={p} list={list} from={city.id} /> : <p className="empty">No connections with the selected modes.</p>}
    </div>
  )
}

function Touristy({ n }: { n: number | null | undefined }) {
  if (n == null) return <span className="mono">?</span>
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
          <HeadButtons {...p} />
        </div>
        <div>
          <Thumb city={city} w={960} className="hero" />
          {img && (
            <p className="credit mono">
              Photo: <a href={img.page ?? img.url} target="_blank" rel="noreferrer">{img.credit || 'Unknown'}</a>
              {img.licence ? ` · ${img.licence}` : ''}, Wikimedia Commons
            </p>
          )}
        </div>
        <div>
          <p className="kicker mono">{countryName(model, city.country)}</p>
          <h2 className="pname" style={{ marginTop: 4 }}>{city.name}</h2>
        </div>
        {city.why && <p className="p-why">{city.why}</p>}
        {city.summary && <p className="p-sum">{city.summary}</p>}
        <div className="facts">
          <div className="fact"><span className="mono">Altitude</span><span className="mono">{altitude(city.altitude_m) || '?'}</span></div>
          <div className="fact"><span className="mono">Touristy</span><Touristy n={city.touristy} /></div>
        </div>
        {!!city.things_to_do?.length && (
          <div>
            <p className="sec-k mono">Things to do</p>
            <ul className="todo">{city.things_to_do.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
        )}
        {!!city.hostels?.length && (
          <div>
            <p className="sec-k mono">Hostels · per night</p>
            <ul className="hostels">
              {city.hostels.map((h) => (
                <li key={h.name} className={h.price_suspect ? 'sus' : ''} title={h.price_suspect ? 'Price looks off, check before booking' : undefined}>
                  {h.url ? <a href={h.url} target="_blank" rel="noreferrer">{h.name}</a> : <span>{h.name}</span>}
                  <span className="mono">
                    {h.dorm_dkk != null && `Dorm ${thousands(h.dorm_dkk)}`}
                    {h.dorm_dkk != null && h.private_dkk != null && ' · '}
                    {h.private_dkk != null && `Private ${thousands(h.private_dkk)}`}
                    {h.dorm_dkk == null && h.private_dkk == null && 'no price'}
                  </span>
                </li>
              ))}
            </ul>
            {city.hostel_note && <p className="fine">{city.hostel_note}</p>}
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
  const groups = [rows.filter((r) => r.from === from), rows.filter((r) => r.from !== from)].filter((g) => g.length)
  return (
    <div className="bydate">
      {groups.map((g) => {
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
      })}
    </div>
  )
}

const times = (l: { dep: string | null; arr: string | null; arr_days: number }) =>
  `${l.dep} → ${l.arr}${l.arr_days > 0 ? ` +${l.arr_days}` : ''}`

// "Sun 20 to Mon 28 Dec", with the month only once when both dates share it
function span(a: string | null, b: string | null) {
  const day = (d: string | null) => (d ? `${weekday(d)} ${shortDate(d)}` : '?')
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
        <div className="fact"><span className="mono">Routing</span><span>{f.nonstop ? 'Nonstop' + (f.vias.length ? ' or via ' + f.vias.join(', ') : '') : f.vias.length ? 'via ' + f.vias.join(', ') : '?'}</span></div>
        <div className="fact"><span className="mono">Carriers</span><span>{f.carriers.join(', ') || '?'}</span></div>
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
        {opts.length > 0 ? (
          <div className="compare">
            {opts.map((o, i) => (
              <button key={i} className={`ocard${o === cur ? ' cur' : ''}`} aria-pressed={o === cur} onClick={() => p.onOption(i)}>
                <span className="oc-mode"><ModeChip family={familyOf(o.mode)} />{modeLabel(o.mode)}</span>
                <span className="oc-dur mono">{duration(o.duration_min)}</span>
                <span className="oc-cost mono">{fromPrice(o.price_dkk.min)}</span>
                <span className="oc-via">{viaText(model, conn, o, from)}</span>
                {(o.overnight || o.border) && (
                  <span className="oc-flags">
                    {o.overnight && <span><Moon />Overnight</span>}
                    {o.border && o.mode !== 'flight' && <span><Flag />Border</span>}
                  </span>
                )}
              </button>
            ))}
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
                <div className="fact"><span className="mono">Frequency</span><span>{cur.frequency || '?'}</span></div>
                <div className="fact"><span className="mono">Local price</span><span>{cur.price_local || kr(cur.price_dkk.min)}</span></div>
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
