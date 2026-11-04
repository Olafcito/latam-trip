import type { Ref } from 'react'
import { IO_COLORS, IO_LABEL, wayFacts, wayHead, wayRows, type Dir, type WayHead, type WayRow } from '../data/inout'
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
                  <Head h={wayHead(way)} />
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

/** Both ends large with their clock times, the total between them and each stop as a mark on the line. */
function Head({ h }: { h: WayHead }) {
  return (
    <div className="whead">
      <span className="wh-end">
        <b className="mono">{h.from}</b>
        {h.depart && <span className="mono">{h.depart}</span>}
        {h.departDay && <small>{h.departDay}</small>}
      </span>
      <span className="wh-mid">
        {h.total && <span className="wh-total mono">{h.total}</span>}
        <span className="wh-line" aria-hidden="true">
          {h.marks.map((m) => <i key={m} />)}
        </span>
        {h.marks.length > 0 && <span className="wh-marks mono" title={`Stops at ${h.marks.join(', ')}`}>{h.marks.join(' ')}</span>}
      </span>
      <span className="wh-end r">
        <b className="mono">{h.to}</b>
        {h.arrive && <span className="mono">{h.arrive}</span>}
        {h.arriveDay && <small>{h.arriveDay}</small>}
      </span>
    </div>
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
        {(r.arrive || r.depart) && (
          <dl className="wr-cells">
            {r.arrive && <><dt>Lands</dt><dd className="mono">{r.arrive}</dd></>}
            {r.depart && <><dt>Leaves</dt><dd className="mono">{r.depart}</dd></>}
          </dl>
        )}
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
        {r.depart && <><dt>Departs</dt><dd className="mono">{r.depart}</dd></>}
        {r.arrive && <><dt>Arrives</dt><dd className="mono">{r.arrive}</dd></>}
        {r.carriers && <><dt>Carriers</dt><dd>{r.carriers}</dd></>}
        {r.numbers && <><dt>Flights</dt><dd className="mono">{r.numbers}</dd></>}
        {r.connections.length > 0 && (
          <>
            <dt>Connections</dt>
            <dd className="wr-conns">
              {r.connections.map((c, i) => (
                <span key={i} className="mono"><b>{c.airport}</b>{c.hours && ' ' + c.hours}</span>
              ))}
            </dd>
          </>
        )}
      </dl>
    </>
  )
}
