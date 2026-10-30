import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { capped } from '@map/data/cardFacts'
import type { MapData } from '@map/data/types'
import { loadRouteData } from '../../data/routeMap'
import type { Hostel, MapNode } from '../../data/types'
import { day, kr } from '../../lib/format'
import { countryName } from '../../lib/colors'
import { placeFinds, type FindRow, type PlaceFinds } from '../../lib/placeFinds'
import { Modal } from '../Modal'
import { FindPopup, HostelPopup } from './FindPopup'

// The top of the route, after the 21st Hover Expand Gallery: its places as narrow panels with their
// names, the one under the mouse or the Tab key opens to its photo. A click opens that place's
// itinerary under the strip, after the 21st Expandable Card (id 35717): what to do there and where
// to sleep. The panel stays mounted so it can open and close from wherever it is, its words fade
// in once it has made room, Escape closes it and gives the focus back. On a phone the places are a
// row to swipe instead. Its hostels, Experiences and Training open a window over the trip, you stay
// where you are. The trip's costs sit between the title and the strip.

export interface HeadPlace { name: string; node: MapNode | undefined; days: number; inDay: string }

const nightsOf = (n: number) => `${n} ${n === 1 ? 'night' : 'nights'}`
const short = (name: string) => name.replace(/\s*\(.*\)$/, '')

export function TripHead({ places, costs }: { places: HeadPlace[]; costs: ReactNode }) {
  const [hover, setHover] = useState<number | null>(null)
  const [pick, setPick] = useState<number | null>(null)
  // what the panel shows, kept while it closes so its words fade out instead of vanishing
  const [shown, setShown] = useState(0)
  const [route, setRoute] = useState<MapData | null>(null)
  const [find, setFind] = useState<FindRow | null>(null)
  const [bed, setBed] = useState<Hostel | null>(null)
  const btns = useRef<(HTMLButtonElement | null)[]>([])
  const panelId = useId()
  const read = useMemo(() => (route ? placeFinds(route) : null), [route])
  // the picked place holds the big panel while its itinerary is open, a hover only brightens the others
  const open = pick ?? hover ?? 0

  const choose = (i: number) => {
    const next = pick === i ? null : i
    setPick(next)
    if (next == null) return
    setShown(next)
    btns.current[i]?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }
  const close = () => {
    if (pick == null) return
    btns.current[pick]?.focus()
    setHover(null)
    setPick(null)
  }
  useEffect(() => {
    if (pick == null) return
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); close() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })
  // the map's data comes the first time an itinerary opens. Without it the itinerary still has its own lines,
  // and the Map tab says when that data cannot load
  useEffect(() => {
    if (pick == null || route) return
    loadRouteData().then(setRoute, () => {})
  }, [pick, route])

  return (
    <header className="tg">
      <h3 className="tg-title">Route<span>{places.length} {places.length === 1 ? 'place' : 'places'}</span></h3>
      {costs}
      <ul
        className="tg-strip"
        style={{ '--n': places.length } as CSSProperties}
        onPointerLeave={() => setHover(null)}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHover(null) }}
      >
        {places.map((p, i) => {
          const img = p.node?.profile?.image?.url
          return (
            <li key={i} className="tg-p" data-open={i === open || undefined} data-pick={i === pick || undefined}>
              <button
                ref={(el) => { btns.current[i] = el }}
                type="button"
                aria-expanded={i === pick}
                aria-controls={panelId}
                aria-label={`${p.name}, ${nightsOf(p.days)} from ${day(p.inDay)}`}
                onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHover(i) }}
                onFocus={() => setHover(i)}
                onClick={() => choose(i)}
              >
                {img && <img src={img} alt="" loading="lazy" decoding="async" draggable={false} />}
                <span className="tg-name">{short(p.name)}</span>
                <span className="tg-meta">{nightsOf(p.days)}<span className="tg-from">, from {day(p.inDay)}</span></span>
              </button>
            </li>
          )
        })}
      </ul>
      <div id={panelId} className="tg-it" data-open={pick != null} inert={pick == null} role="region" aria-label={places[shown] ? `${short(places[shown].name)} itinerary` : undefined}>
        <div className="tg-it-in">
          {places[shown] && <Itinerary key={shown} place={places[shown]} finds={read && places[shown].node ? read(places[shown].node.id) : null} onClose={close} onFind={setFind} onBed={setBed} />}
        </div>
      </div>
      {find && route && <Modal label={find.name} className="fp-md" bare onClose={() => setFind(null)}>{(shut) => <FindPopup data={route} first={find.ref} onClose={shut} />}</Modal>}
      {bed && <Modal label={bed.name} onClose={() => setBed(null)}>{() => <HostelPopup h={bed} place={short(places[shown].name)} />}</Modal>}
    </header>
  )
}

interface ItineraryProps {
  place: HeadPlace
  finds: PlaceFinds | null
  onClose: () => void
  onFind: (r: FindRow) => void
  onBed: (h: Hostel) => void
}

function Itinerary({ place, finds, onClose, onFind, onBed }: ItineraryProps) {
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
        <span className="tg-stay">{nightsOf(place.days)}<small>from {day(place.inDay)}</small></span>
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
