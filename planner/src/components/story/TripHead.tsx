import { useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { MapNode } from '../../data/types'
import { day, kr } from '../../lib/format'
import { countryName } from '../../lib/colors'

// The top of the route, after the 21st Hover Expand Gallery: its places as narrow panels with their
// names, the one under the mouse or the keys opens to its photo. A click opens that place's
// itinerary under the strip, after the 21st Expandable Card (id 35717): what to do there and where
// to sleep. The panel stays mounted so it can open and close from wherever it is, its words fade
// in once it has made room, Escape closes it and gives the focus back. On a phone the places are a
// row to swipe instead.

export interface HeadPlace { name: string; node: MapNode | undefined; days: number; inDay: string }

const nightsOf = (n: number) => `${n} ${n === 1 ? 'night' : 'nights'}`
const short = (name: string) => name.replace(/\s*\(.*\)$/, '')

export function TripHead({ places }: { places: HeadPlace[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const [pick, setPick] = useState<number | null>(null)
  // what the panel shows, kept while it closes so its words fade out instead of vanishing
  const [shown, setShown] = useState(0)
  const btns = useRef<(HTMLButtonElement | null)[]>([])
  const panelId = useId()
  const open = hover ?? pick ?? 0

  const choose = (i: number) => {
    const next = pick === i ? null : i
    setPick(next)
    if (next != null) setShown(next)
  }
  const close = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || pick == null) return
    e.preventDefault()
    btns.current[pick]?.focus()
    setPick(null)
  }

  return (
    <header className="tg" onKeyDown={close}>
      <h3 className="tg-title">Route<span>{places.length} {places.length === 1 ? 'place' : 'places'}</span></h3>
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
          {places[shown] && <Itinerary key={shown} place={places[shown]} onClose={() => { btns.current[shown]?.focus(); setPick(null) }} />}
        </div>
      </div>
    </header>
  )
}

function Itinerary({ place, onClose }: { place: HeadPlace; onClose: () => void }) {
  const n = place.node
  const p = n?.profile
  const todo = p?.things_to_do ?? []
  const beds = p?.hostels ?? []
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
      {todo.length || beds.length ? (
        <div className="tg-cols">
          {!!todo.length && (
            <section>
              <h5>Things to do</h5>
              <ul className="tg-todo">{todo.map((t) => <li key={t}>{t}</li>)}</ul>
              {p?.touristy != null && (
                <p className="tg-tour">Touristy <span className="dots" aria-label={`${p.touristy} of 5`}>{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= p.touristy! ? 'f' : ''} />)}</span></p>
              )}
            </section>
          )}
          {!!beds.length && (
            <section>
              <h5 className="tg-bh"><span>Hostels</span><span>Dorm</span><span>Private</span></h5>
              <ul className="tg-beds">
                {beds.map((h) => (
                  <li key={h.name} data-sus={h.price_suspect || undefined} title={h.price_suspect ? 'The price looks wrong in the source' : undefined}>
                    {h.source ? <a href={h.source} target="_blank" rel="noopener noreferrer" title={h.name}>{h.name}</a> : <span title={h.name}>{h.name}</span>}
                    <span>{h.dorm_dkk != null && kr(h.dorm_dkk)}</span>
                    <span>{h.private_dkk != null && kr(h.private_dkk)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <p className="tg-none">Nothing gathered for this place yet.</p>
      )}
      {credit && <p className="tg-cr">Photo: {credit}, Wikimedia Commons</p>}
    </div>
  )
}
