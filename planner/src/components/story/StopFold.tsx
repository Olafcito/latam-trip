import { useEffect, useMemo, useState } from 'react'
import type { MapData as RouteData } from '@map/data/types'
import { loadRouteData } from '../../data/routeMap'
import { useDataRev } from '../../data/rev'
import type { AppData, Booking, Lodging } from '../../data/types'
import { useStore } from '../../store'
import { countryName } from '../../lib/colors'
import { nodeName, type Journey, type Schedule } from '../../lib/journey'
import { placeFinds, type FindRow } from '../../lib/placeFinds'
import { shortPlace } from '../../lib/format'
import { choiceNights, chooseRoom, freeNights, nightsFrom, pickDates, removePart } from '../../lib/stayEdit'
import { partBooking, stayClashes, stayParts, tripStays } from '../../lib/stays'
import { loadLodgings } from '../../lib/lodgings'
import { addFromLink, remember } from '../../lib/stayRates'
import { shareLink, sharePlace } from '../../lib/sharePlace'
import { addDays } from '../../lib/time'
import { Modal } from '../Modal'
import { AddPlace } from '../stays/AddPlace'
import { AddStay } from '../stays/AddStay'
import { CityFold } from '../stays/CityFold'
import { PropertyView } from '../stays/PropertyView'
import { StayList, type StayRowData } from '../stays/StayList'
import { useSaved } from '../stays/useSaved'
import { useStayFind } from '../stays/useStayFind'
import { FindPopup } from './FindPopup'
import { Finds } from './TripHead'

// A stop of the route folded open in place: the wiring of the fold to the trip. Its stays are the stop's planned
// parts with their dates and the booked stays at it that no part stands for. Add accommodation opens the search
// over the places stored for the stop, and Select on a room plans it. Dates picked in the window, in the search or
// on a place, price the places for those dates until the window closes. A room selected still takes the stop's nights. The rest of the city card's acts, change
// the place and delete it, still open the city card from About.

const firstPhoto = (l: Lodging | undefined) => l?.photos.find((p) => /^https:\/\//i.test(p.url))?.url ?? null

/** The search asks for the nights no stay has yet, else the whole stop, and one night for a stop passed through. */
function searchWindow(stays: Parameters<typeof freeNights>[0], sp: Parameters<typeof freeNights>[1]) {
  const free = freeNights(stays, sp)
  const checkIn = free.nights > 0 ? free.first : sp.inDay
  return { free, checkIn, checkOut: addDays(checkIn, Math.max(1, free.nights > 0 ? free.nights : sp.days)) }
}

export function StopFold({ data, journey, sched, i, onCity, onMap }: {
  data: AppData
  journey: Journey
  sched: Schedule
  i: number
  /** opens the city card at changing or deleting the stop */
  onCity: (view: 'change' | 'delete') => void
  onMap: () => void
}) {
  const { inout, map } = data
  const lodgings = useStore((s) => s.lodgings)
  const bookings = useStore((s) => s.bookings)
  const setStays = useStore((s) => s.setStays)
  const setLodgings = useStore((s) => s.setLodgings)
  const [adding, setAdding] = useState<string | null | false>(false)
  const [route, setRoute] = useState<RouteData | null>(null)
  const [find, setFind] = useState<FindRow | null>(null)
  // dates picked in the window, which hold until it closes
  const [pick, setPick] = useState<{ checkIn: string; checkOut: string } | null>(null)
  const [saved, toggleSaved] = useSaved()
  const rev = useDataRev()
  useEffect(() => {
    loadRouteData().then(setRoute, () => {})
  }, [rev])
  const read = useMemo(() => (route ? placeFinds(route) : null), [route])

  const p = journey.places[i]
  const sp = sched.places[i]
  const name = p ? shortPlace(nodeName(map, inout, p.node)) : ''
  const win = p && sp ? searchWindow(p.stays ?? [], sp) : null
  const dates = pick ?? win
  // Find accommodations, for a stop with nights
  const finder = useStayFind(
    sp && sp.days > 0 ? { id: sp.node, name } : null,
    dates?.checkIn ?? '',
    dates?.checkOut ?? '',
    { id: journey.id, version: journey.version ?? null },
    adding !== false,
  )
  if (!p || !sp || !win || !dates) return null
  const node = map.nodes.find((n) => n.id === p.node)
  const prof = node?.profile
  const stays = p.stays ?? []
  const parts = stayParts(stays, sp)
  const byId = new Map(lodgings.map((l) => [l.id, l]))
  const here = lodgings.filter((l) => l.place_id === sp.node && !l.hidden)
  const partBooked = parts.map((part) => partBooking(journey, sched, bookings, sp, part))
  const shownIds = new Set(partBooked.filter(Boolean).map((b) => b!.id))
  const clashes = new Map(stayClashes(journey, sched, bookings).filter((c) => c.stop === i).map((c) => [c.booking.id, c]))
  const lastNight = addDays(sp.inDay, Math.max(1, sp.days) - 1)
  const loose = tripStays(journey, sched, bookings).filter(
    (b) => b.place_id === sp.node && !shownIds.has(b.id) && (clashes.has(b.id) || (b.check_in! <= lastNight && b.check_out! > sp.inDay)),
  )
  const change = (next: typeof stays) => setStays(i, next)
  const bookedAt = (l: Lodging): Booking | null => [...partBooked, ...loose].find((b) => b && b.lodging_id === l.id) ?? null

  const rows: StayRowData[] = [
    ...parts.map((part, k): StayRowData => {
      const l = byId.get(part.stay.lodging_id)
      const b = partBooked[k]
      const lname = l?.name ?? 'A place to stay'
      return {
        key: `p${k}-${part.stay.lodging_id}`,
        name: lname,
        photo: firstPhoto(l),
        checkIn: part.fits ? part.first : null,
        checkOut: part.fits ? addDays(part.first, part.nights) : null,
        nights: part.nights,
        room: l?.rooms.find((r) => r.id === part.stay.room_id)?.name ?? null,
        booked: !!b,
        warn: part.fits ? null : 'The stop has no nights left for this stay',
        onOpen: l ? () => setAdding(l.id) : undefined,
        actions: [...(l ? [{ label: 'Open', run: () => setAdding(l.id) }] : []), { label: `Take off ${name}`, run: () => change(removePart(stays, k)), danger: true }],
      }
    }),
    ...loose.map((b): StayRowData => {
      const l = b.lodging_id ? byId.get(b.lodging_id) : undefined
      const c = clashes.get(b.id)
      return {
        key: b.id,
        name: l?.name ?? b.seller ?? 'Booked stay',
        photo: firstPhoto(l),
        checkIn: b.check_in,
        checkOut: b.check_out,
        nights: Math.max(0, Math.round((Date.parse(b.check_out!) - Date.parse(b.check_in!)) / 864e5)),
        room: l && b.room_id ? l.rooms.find((r) => r.id === b.room_id)?.name ?? null : null,
        booked: true,
        warn: c ? (c.meets ? 'The stop has only some of these nights now' : 'The stop has none of these nights now') : null,
        onOpen: l ? () => setAdding(l.id) : undefined,
        actions: l ? [{ label: 'Open', run: () => setAdding(l.id) }] : [],
      }
    }),
  ]

  const { free } = win
  const { checkIn: searchIn, checkOut: searchOut } = dates
  /** new dates picked from the ones shown */
  const repick = (was: { checkIn: string; checkOut: string }) => (checkIn: string, checkOut: string) => setPick(pickDates(was, checkIn, checkOut))
  const planned = new Set(stays.map((s) => s.lodging_id))
  const ranked = [...here].sort((a, b) => Number(!!bookedAt(b)) - Number(!!bookedAt(a)) || Number(planned.has(b.id)) - Number(planned.has(a.id)))
  const finds = read && node ? read(node.id) : null
  const exps = [...(finds?.experiences ?? []), ...(finds?.training ?? [])]
  const credit = [prof?.image?.credit, prof?.image?.license].filter(Boolean).join(', ')

  return (
    <>
      <CityFold
        summary={prof?.summary}
        stays={{ count: rows.length, body: <StayList rows={rows} onAdd={() => setAdding(null)} /> }}
        todo={prof?.things_to_do?.length ? (
          <div className="af-todo">
            <ul className="tg-todo">{prof.things_to_do.map((t) => <li key={t}>{t}</li>)}</ul>
            {prof.touristy != null && (
              <p className="tg-tour">Touristy <span className="dots" role="img" aria-label={`${prof.touristy} of 5`}>{[1, 2, 3, 4, 5].map((k) => <i key={k} className={k <= prof.touristy! ? 'f' : ''} />)}</span></p>
            )}
          </div>
        ) : undefined}
        experiences={exps.length ? (
          <div className="af-exp">
            {!!finds?.experiences.length && <Finds title="Experiences" rows={finds.experiences} onFind={setFind} />}
            {!!finds?.training.length && <Finds title="Training" rows={finds.training} onFind={setFind} />}
          </div>
        ) : undefined}
        about={
          <div className="af-about">
            {prof?.image?.url && <img className="af-img" src={prof.image.url} alt="" loading="lazy" />}
            {(node || prof?.tagline) && <p className="af-tag">{[node && countryName(node.country), prof?.tagline].filter(Boolean).join('. ')}</p>}
            {credit && <p className="tg-cr">Photo: {credit}, Wikimedia Commons</p>}
            <div className="af-acts">
              <button type="button" className="btn small" onClick={onMap}>Open in map</button>
              {i > 0 ? (
                <>
                  <button type="button" className="btn small" onClick={() => onCity('change')}>Change location</button>
                  <button type="button" className="btn small danger" onClick={() => onCity('delete')}>Delete</button>
                </>
              ) : <p className="cc-sure">The flight lands here, so this stop stays.</p>}
            </div>
          </div>
        }
      />
      {adding !== false && (
        <Modal label={`Add accommodation in ${name}`} className="ad-md" bare onClose={() => { setAdding(false); setPick(null) }}>
          {(close) => (
            <AddStay
              key={adding ?? 'list'}
              destination={name}
              checkIn={searchIn}
              checkOut={searchOut}
              onDates={repick(dates)}
              guests={1}
              rooms={1}
              places={ranked}
              startId={adding}
              saved={saved}
              onSave={(l) => toggleSaved(l.id)}
              searching={finder.searching}
              onFind={sp.days > 0 ? finder.find : undefined}
              findError={finder.error}
              onLink={async (url) => {
                const r = await addFromLink(url, sp.node, searchIn, searchOut)
                // the place shows in the list before the search opens it. A failed read is let go: the live channel brings it
                if (r.ok) remember(r.lodging_id, searchIn, searchOut, r)
                if (r.ok) await loadLodgings().then(setLodgings, () => {})
                return r
              }}
              badge={(l) => (bookedAt(l) ? { label: 'Booked here', tone: 'booked' } : planned.has(l.id) ? { label: 'In your plan', tone: 'plan' } : null)}
              onClose={close}
              manual={<AddPlace place={sp.node} first={sp.days > 0 ? win.checkIn : null} nights={sp.days > 0 ? Math.max(1, free.nights || sp.days) : 0} close={close} onSaved={close} />}
              property={(l, back) => {
                const at = choiceNights(stays, sp, l.id)
                const b = bookedAt(l)
                const first = pick?.checkIn ?? (sp.days > 0 ? at.first : searchIn)
                const nights = pick ? nightsFrom(pick.checkIn, pick.checkOut) : sp.days > 0 ? Math.max(1, at.nights) : 1
                const shown = { checkIn: first, checkOut: addDays(first, nights) }
                const link = shareLink(l)
                return (
                  <PropertyView key={l.id}
                    lodging={l}
                    place={[name, node && countryName(node.country)].filter(Boolean).join(', ')}
                    checkIn={shown.checkIn}
                    checkOut={shown.checkOut}
                    nights={nights}
                    onDates={back ? repick(shown) : undefined}
                    guests={1}
                    chosen={stays.filter((s) => s.lodging_id === l.id && s.room_id).map((s) => s.room_id!)}
                    booked={b?.room_id ?? null}
                    onBack={back ?? undefined}
                    saved={saved.has(l.id)}
                    onSave={() => toggleSaved(l.id)}
                    onShare={link ? () => sharePlace(l.name, link) : undefined}
                    onSelect={sp.days > 0 ? (roomId) => change(chooseRoom(stays, sp, l.id, roomId)) : undefined}
                  />
                )
              }}
            />
          )}
        </Modal>
      )}
      {find && route && <Modal label={find.name} className="fp-md" bare onClose={() => setFind(null)}>{(shut) => <FindPopup data={route} first={find.ref} onClose={shut} />}</Modal>}
    </>
  )
}
