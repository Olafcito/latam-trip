import type { Ref } from 'react'
import { IO_COLORS, IO_LABEL, wayFacts, wayRows, type Dir, type IoMarker, type WayRow } from '../data/inout'
import type { Model } from '../data/model'
import type { Trip } from '../data/trips'
import { Chevron, Close } from './icons'

interface Props {
  model: Model
  trip: Trip
  dirs: Dir[]
  collapsed: boolean
  panelRef: Ref<HTMLElement>
  onCollapse(collapsed: boolean): void
  onClose(): void
}

const TITLE: Record<Dir, string> = { in: 'Way in', home: 'Way home' }

/** The long-haul flights behind a marker: one row per flight and per stop, then the ticket facts. */
export function WayPanel(p: Props) {
  const io = p.trip.inout!
  const name = (code: string) => p.model.byId.get(code)?.short_name ?? code
  const title = p.dirs.map((d) => TITLE[d]).join(' and ')
  return (
    <section ref={p.panelRef} className={`panel way${p.collapsed ? ' collapsed' : ''}`} aria-label={title}>
      {p.collapsed ? (
        <div className="pslim">
          <span className="pslim-name">{title}</span>
          <button className="x sm" aria-label="Expand panel" onClick={() => p.onCollapse(false)}><Chevron up={false} /></button>
          <button className="x sm" aria-label="Close" onClick={p.onClose}><Close /></button>
        </div>
      ) : (
        <div className="pview">
          <div className="pbody stg">
            <div className="prow">
              <div>
                <p className="kicker mono">{p.trip.name}</p>
                <h2 className="pname">{title}</h2>
              </div>
              <div className="hbtns">
                <button className="x" aria-label="Collapse panel" onClick={() => p.onCollapse(true)}><Chevron up /></button>
                <button className="x" aria-label="Close" onClick={p.onClose}><Close /></button>
              </div>
            </div>
            {p.dirs.map((d) => {
              const way = d === 'in' ? io.way_in : io.way_home
              const place = d === 'in' ? io.entry : io.exit
              return (
                <section key={d} className="wsec">
                  <p className="wsec-h">
                    <span className="io-dot" style={{ background: IO_COLORS[d] }} />
                    {IO_LABEL[d]}: {name(place)}
                  </p>
                  <ol className="wrows">
                    {wayRows(way).map((r, i) => (
                      <li key={i} className={`wrow ${r.kind}`}>
                        <Row r={r} />
                      </li>
                    ))}
                  </ol>
                  <dl className="facts wfacts">
                    {wayFacts(p.trip, d).map((f) => (
                      <div key={f.label} className="fact">
                        <dt>{f.label}</dt>
                        <dd>{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

function Row({ r }: { r: WayRow }) {
  if (r.kind === 'stop') {
    return (
      <>
        <p className="wr-top">
          <span className="wr-kind">{r.label}</span>
          <span className="mono">{r.airport}</span>
          <span className="wr-h mono">{r.ground}</span>
        </p>
        <dl className="wr-cells">
          <dt>Lands</dt><dd className="mono">{r.arrive}</dd>
          <dt>Leaves</dt><dd className="mono">{r.depart}</dd>
        </dl>
      </>
    )
  }
  return (
    <>
      <p className="wr-top">
        <span className="wr-route mono">{r.from} → {r.to}</span>
        <span className="wr-h mono">{r.hours}</span>
      </p>
      <dl className="wr-cells">
        <dt>Departs</dt><dd className="mono">{r.depart}</dd>
        <dt>Arrives</dt><dd className="mono">{r.arrive}</dd>
        <dt>Carriers</dt><dd>{r.carriers}</dd>
        <dt>Flights</dt><dd className="mono">{r.numbers}</dd>
        {r.connections.length > 0 && (
          <>
            <dt>Connections</dt>
            <dd className="wr-conns">
              {r.connections.map((c, i) => (
                <span key={i} className="mono"><b>{c.airport}</b> {c.hours}</span>
              ))}
            </dd>
          </>
        )}
      </dl>
    </>
  )
}

/** What the two marker colours mean. */
export function IoLegend({ markers }: { markers: IoMarker[] }) {
  const dirs = new Set(markers.flatMap((m) => m.dirs))
  return (
    <div className="legend io-legend" aria-hidden="true">
      {(['in', 'home'] as Dir[]).filter((d) => dirs.has(d)).map((d) => (
        <span key={d}><i className={`io-key ${d}`} />{IO_LABEL[d]}</span>
      ))}
    </div>
  )
}
