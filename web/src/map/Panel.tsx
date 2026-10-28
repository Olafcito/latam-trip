import { useState, type Ref } from 'react'
import { neighbours, otherEnd, stopsFrom, viaText, type Model, type Neighbour } from '../data/model'
import { familyOf, type Connection, type Family, type Place, type RouteOption } from '../data/types'
import { altitude, duration, fromPrice, kr, modeLabel, observed, shortDate, thousands } from '../lib/format'
import { Arrow, Back, Chevron, Close, Flag, ModeChip, Moon } from './icons'

export type PanelView = 'city' | 'more' | 'route'

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
  journey: Set<string>
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
  onAddToJourney?(conn: Connection, opt: RouteOption, from: string): void
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

function countryName(model: Model, code: string) {
  return model.data.countries.find((c) => c.code === code)?.name ?? code
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

function ConnList({ p, list, from, compact }: { p: PanelProps; list: Neighbour[]; from: string; compact?: boolean }) {
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

function FlightFacts({ o }: { o: RouteOption }) {
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
      {!!f.dates_searched.length && (
        <p className="ops"><b>Dates searched</b> · <span className="mono">{f.dates_searched.map(shortDate).join(', ')}</span></p>
      )}
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
  const inJourney = p.journey.has(`${conn.id}|${cur?.mode}`)
  const backLabel = view.back && view.sel ? model.byId.get(view.sel)?.short_name : null

  return (
    <div className="pview">
      <div className="pbody stg">
        <div className="prow">
          {backLabel ? <button className="back" onClick={p.onBack}><Back />{backLabel}</button> : <span />}
          <HeadButtons {...p} />
        </div>
        <h2 className="rtitle"><span>{a.short_name}</span><Arrow s={22} /><span>{b.short_name}</span></h2>
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
            {cur.mode === 'flight' ? <FlightFacts o={cur} /> : (
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
        <div className="pactions">
          {cur && <a className="pbtn primary" href={liveUrl(model, conn, cur, from)} target="_blank" rel="noreferrer">Search live prices</a>}
          <button className="pbtn ghost" onClick={() => p.onGoTo(to)}>Go to {b.short_name}</button>
          {cur && p.onAddToJourney && (
            <button className={`pbtn ghost${inJourney ? ' done' : ''}`} onClick={() => p.onAddToJourney!(conn, cur, from)} aria-pressed={inJourney}>
              {inJourney ? 'In journey' : 'Add to journey'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
