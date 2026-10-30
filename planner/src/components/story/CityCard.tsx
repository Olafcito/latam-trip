import { useEffect, useMemo, useState } from 'react'
import { Flag, hasFlag } from '@map/map/Flag'
import type { MapData as RouteData } from '@map/data/types'
import { loadRouteData } from '../../data/routeMap'
import type { AppData, Hostel, MapData, MapNode } from '../../data/types'
import { useStore } from '../../store'
import { nodeName, type Journey, type Schedule } from '../../lib/journey'
import { countryName } from '../../lib/colors'
import { shortPlace } from '../../lib/format'
import { placeFinds, type FindRow } from '../../lib/placeFinds'
import { Modal } from '../Modal'
import { Caret } from '../icons'
import { FindPopup, HostelPopup } from './FindPopup'
import { Itinerary } from './TripHead'

// A stop's City card, opened from its name or flag on the route: the same itinerary as the gallery, and
// under it what you can do to the stop. Open in map builds on from it, Change location swaps the place
// and Delete takes it out. All of it happens in this window, so you stay where you are on the route.
// The first stop is where the flight lands, so it can be looked at and built on but not swapped or deleted.

type View = 'card' | 'change' | 'delete'

/** what is left of the place's name when a search looks at it */
const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Rough distance in degrees, enough to put the closest places first. */
const away = (a: MapNode, b: MapNode) => Math.hypot(a.lat - b.lat, (a.lon - b.lon) * Math.cos((a.lat * Math.PI) / 180))

/** What goes with the stop, said before it goes. */
function goesText(name: string, nights: number, last: boolean) {
  const own = nights === 1 ? 'Its 1 night becomes a free night' : `Its ${nights} nights become free nights`
  if (!nights) return `Delete ${name}.`
  return `Delete ${name}. ${own}${last ? '' : ' and the stops after it move earlier'}.`
}

function ChangeList({ map, here, skip, name, onPick, onBack }: {
  map: MapData
  here: MapNode | undefined
  /** the stop and the stops beside it, a leg needs two different places */
  skip: Set<string>
  name: string
  onPick: (id: string) => void
  onBack: () => void
}) {
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    const look = plain(q.trim())
    return map.nodes
      .filter((n) => n.type !== 'border' && !skip.has(n.id) && (!look || plain(`${n.name} ${countryName(n.country)}`).includes(look)))
      .sort((a, b) => (here ? away(here, a) - away(here, b) : 0))
      .slice(0, 30)
  }, [map, here, skip, q])
  return (
    <div className="cc-change">
      <header className="cc-h">
        <button type="button" className="cc-back" aria-label={`Back to ${name}`} onClick={onBack}><Caret dir="l" /></button>
        <h3>Change {name}</h3>
      </header>
      <input className="cc-find" type="search" value={q} autoFocus placeholder="Search places or countries" aria-label="Search places or countries" onChange={(e) => setQ(e.target.value)} />
      {rows.length ? (
        <ul className="cc-list" aria-label={q.trim() ? 'Places found' : 'Closest places'}>
          {rows.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => onPick(n.id)}>
                {hasFlag(n.country) && <Flag code={n.country} size={14} />}
                <b>{shortPlace(n.name)}</b>
                <small>{countryName(n.country)}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="cc-none">No place by that name. Try the name of the country.</p>}
    </div>
  )
}

export function CityCard({ data, journey, sched, i, close, onDelete }: {
  data: AppData
  journey: Journey
  sched: Schedule
  i: number
  close: () => void
  onDelete: () => void
}) {
  const { inout, map } = data
  const openSaved = useStore((s) => s.openSaved)
  const setCursor = useStore((s) => s.setCursor)
  const replaceStop = useStore((s) => s.replaceStop)
  const [view, setView] = useState<View>('card')
  // the view you came back from, so the focus lands on the button that opened it
  const [from, setFrom] = useState<View | null>(null)
  const [route, setRoute] = useState<RouteData | null>(null)
  const [find, setFind] = useState<FindRow | null>(null)
  const [bed, setBed] = useState<Hostel | null>(null)
  const read = useMemo(() => (route ? placeFinds(route) : null), [route])
  useEffect(() => {
    loadRouteData().then(setRoute, () => {})
  }, [])

  const p = journey.places[i]
  const sp = sched.places[i]
  const name = shortPlace(nodeName(map, inout, p.node))
  const node = map.nodes.find((n) => n.id === p.node)
  const img = node?.profile?.image?.url
  const last = i === journey.places.length - 1
  const skip = useMemo(() => new Set([journey.places[i - 1]?.node, p.node, journey.places[i + 1]?.node]), [journey.places, i, p.node])
  const go = (v: View) => {
    setFrom(view)
    setView(v)
  }
  const inMap = () => {
    openSaved(journey)
    setCursor(i)
  }

  return (
    <div className="cc">
      {view === 'change' ? (
        <ChangeList map={map} here={node} skip={skip} name={name} onBack={() => go('card')} onPick={(id) => { replaceStop(i, id); go('card') }} />
      ) : (
        <>
          {img && <img className="cc-img" src={img} alt="" />}
          <div className="cc-body">
            <Itinerary
              key={p.node}
              place={{ name: nodeName(map, inout, p.node), node, days: sp.days, inDay: sp.inDay }}
              finds={read && node ? read(node.id) : null}
              onClose={close}
              onFind={setFind}
              onBed={setBed}
            />
          </div>
          {view === 'delete' ? (
            <footer className="cc-foot" key="delete">
              <p className="cc-sure" role="alert">{goesText(name, sp.days, last)}</p>
              <span className="spacer" />
              <button type="button" className="btn small" autoFocus onClick={() => go('card')}>Keep it</button>
              <button type="button" className="btn small danger" onClick={onDelete}>Delete</button>
            </footer>
          ) : (
            <footer className="cc-foot" key="card">
              <button type="button" className="btn small" onClick={inMap}>Open in map</button>
              {i > 0 ? (
                <>
                  <button type="button" className="btn small" autoFocus={from === 'change'} onClick={() => go('change')}>Change location</button>
                  <span className="spacer" />
                  <button type="button" className="btn small danger" autoFocus={from === 'delete'} onClick={() => go('delete')}>Delete</button>
                </>
              ) : <p className="cc-sure">The flight lands here, so this stop stays.</p>}
            </footer>
          )}
        </>
      )}
      {find && route && <Modal label={find.name} className="fp-md" bare onClose={() => setFind(null)}>{(shut) => <FindPopup data={route} first={find.ref} onClose={shut} />}</Modal>}
      {bed && <Modal label={bed.name} onClose={() => setBed(null)}>{() => <HostelPopup h={bed} place={name} />}</Modal>}
    </div>
  )
}
