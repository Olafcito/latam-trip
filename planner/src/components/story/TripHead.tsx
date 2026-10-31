import { useState, type ReactNode } from 'react'
import { capped } from '@map/data/cardFacts'
import type { Hostel, MapNode } from '../../data/types'
import { day, kr, shortPlace as short } from '../../lib/format'
import { countryName } from '../../lib/colors'
import type { FindRow, PlaceFinds } from '../../lib/placeFinds'

// The top of the route: its title, its costs and the trip as a small map. What to do and where to
// sleep in a place sits in its city card, which opens from the place in the story below.

export interface HeadPlace { name: string; node: MapNode | undefined; days: number; inDay: string }

const nightsOf = (n: number) => (n ? `${n} ${n === 1 ? 'night' : 'nights'}` : 'Passing through')
const fromDay = (p: HeadPlace) => `${p.days ? 'from' : 'on'} ${day(p.inDay)}`

export function TripHead({ count, costs, map }: { count: number; costs: ReactNode; map: ReactNode }) {
  return (
    <header className="tg">
      <h3 className="tg-title">Route<span>{count} {count === 1 ? 'place' : 'places'}</span></h3>
      {costs}
      {map}
    </header>
  )
}

export interface ItineraryProps {
  place: HeadPlace
  finds: PlaceFinds | null
  onClose: () => void
  onFind: (r: FindRow) => void
  onBed: (h: Hostel) => void
}

export function Itinerary({ place, finds, onClose, onFind, onBed }: ItineraryProps) {
  const n = place.node
  const p = n?.profile
  const todo = p?.things_to_do ?? []
  const beds = p?.hostels ?? []
  const exps = finds?.experiences ?? []
  const training = finds?.training ?? []
  const credit = [p?.image?.credit, p?.image?.license].filter(Boolean).join(', ')
  return (
    <div className="tg-card">
      <div className="tg-top">
        <div className="tg-id">
          <h4>{short(place.name)}{n && <span>{countryName(n.country)}</span>}</h4>
          {p?.tagline && <p className="tg-tag">{p.tagline}</p>}
        </div>
        <span className="tg-stay">{nightsOf(place.days)}<small>{fromDay(place)}</small></span>
        <button type="button" className="tg-x" onClick={onClose} aria-label="Close">
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>
      {p?.summary && <p className="tg-about">{p.summary}</p>}
      {todo.length || beds.length || exps.length || training.length ? (
        <div className="tg-cols">
          {!!todo.length && (
            <section>
              <h5>Things to do</h5>
              <ul className="tg-todo">{todo.map((t) => <li key={t}>{t}</li>)}</ul>
              {p?.touristy != null && (
                <p className="tg-tour">Touristy <span className="dots" role="img" aria-label={`${p.touristy} of 5`}>{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= p.touristy! ? 'f' : ''} />)}</span></p>
              )}
            </section>
          )}
          {!!beds.length && (
            <section>
              <h5 className="tg-bh"><span>Hostels</span><span>Dorm</span><span>Private</span></h5>
              <ul className="tg-beds">
                {beds.map((h) => (
                  <li key={h.name} data-sus={h.price_suspect || undefined}>
                    <button type="button" onClick={() => onBed(h)}>
                      <span title={h.name}>{h.name}</span>
                      <span>{h.dorm_dkk != null && kr(h.dorm_dkk)}{h.price_suspect && h.dorm_dkk != null && <small>unsure</small>}</span>
                      <span>{h.private_dkk != null && kr(h.private_dkk)}{h.price_suspect && h.private_dkk != null && <small>unsure</small>}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!!exps.length && <Finds title="Experiences" rows={exps} onFind={onFind} />}
          {!!training.length && <Finds title="Training" rows={training} onFind={onFind} />}
        </div>
      ) : (
        <p className="tg-none">Nothing gathered for this place yet.</p>
      )}
      {credit && <p className="tg-cr">Photo: {credit}, Wikimedia Commons</p>}
    </div>
  )
}

/** A row names the thing and opens its window, the detail stays there. */
function Finds({ title, rows, onFind }: { title: string; rows: FindRow[]; onFind: (r: FindRow) => void }) {
  const [open, setOpen] = useState(false)
  const { shown, folded } = capped(rows, open)
  return (
    <section>
      <h5>{title}</h5>
      <ul className="tg-finds">
        {shown.map((r) => (
          <li key={r.ref.id}>
            <button type="button" onClick={() => onFind(r)}>
              <span className="tg-find">
                <b>{r.name}</b>
                {r.sub && <small data-saved={r.saved || undefined}>{r.sub}</small>}
              </span>
              {r.score && <span className="tg-score">{r.score}</span>}
            </button>
          </li>
        ))}
      </ul>
      {folded > 0 && <button type="button" className="tg-more" onClick={() => setOpen(true)}>Show all {rows.length}</button>}
    </section>
  )
}
