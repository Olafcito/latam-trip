import { useState } from 'react'
import type { Booking, Lodging } from '../../data/types'
import { dayRange } from '../../lib/format'
import type { Schedule } from '../../lib/journey'
import { canStep, choiceNights, freeNights, removePart, stepNights, toggleRoom } from '../../lib/stayEdit'
import { partBooking, stayClashes, stayParts, tripStays, type StayPart } from '../../lib/stays'
import { partPrice, partPriceWords } from '../../lib/stayView'
import { addDays } from '../../lib/time'
import { useStore } from '../../store'
import { Calendar, Check, Minus, Moon, Plus, Trash, Warn } from '../icons'
import { Tip } from '../story/Marks'
import { AddPlace } from './AddPlace'
import { StayCard } from './StayCard'

// Where to stay at a stop of the open trip: the stop's nights as a line of parts, each a room of a place to
// stay with its nights and its price, then the places to stay there as cards whose rooms you pick. A part is
// one row: the place and its room, then its dates, price and nights, which wrap under the name when narrow.
// A price worked out from other nights is muted and wears the estimate mark. A night no part takes shows as a
// free night, a booked stay wears the green ring and a stay the stop has moved off says so with a mark.

/** check in to check out of nights from first */
const span = (first: string, nights: number) => dayRange(first, addDays(first, nights))
const nightsWord = (n: number) => (n === 1 ? '1 night' : `${n} nights`)

function PartRow({ part, k, lodging, booking, more, less, onStep, onRemove }: {
  part: StayPart
  k: number
  lodging: Lodging | undefined
  booking: Booking | null
  more: boolean
  less: boolean
  onStep: (k: number, by: 1 | -1) => void
  onRemove: (k: number) => void
}) {
  const room = lodging?.rooms.find((r) => r.id === part.stay.room_id)
  const name = lodging?.name ?? 'A place to stay'
  const pp = partPrice(room, part)
  const price = partPriceWords(pp)
  return (
    <li className="ws-part" data-booked={booking ? true : undefined} data-off={!part.fits || undefined}>
      <What name={name} room={room?.name ?? 'No room picked'} />
      <span className="ws-meta">
        <span className="ws-when">{part.fits ? span(part.first, part.nights) : 'No nights'}</span>
        {booking ? (
          <Booked b={booking} />
        ) : part.fits ? (
          <span className="ws-pr" data-none={pp.kind === 'none' || undefined} data-near={price.estimate ? true : undefined}>
            {price.estimate && <Tip label={price.estimate} className="ws-mk" kind="near"><Calendar s={12} /></Tip>}
            <span>{price.text}</span>
          </span>
        ) : (
          <Tip label="The stop has no nights left for this part" className="ws-mk" tone="warn"><Warn /></Tip>
        )}
        {part.fits && (
          <span className="ws-step" role="group" aria-label={`Nights at ${name}`}>
            <button type="button" aria-label={`A night less at ${name}`} disabled={!less} onClick={() => onStep(k, -1)}><Minus /></button>
            <output aria-live="polite"><Moon /><span>{part.nights}</span><span className="ws-vh"> {part.nights === 1 ? 'night' : 'nights'}</span></output>
            <button type="button" aria-label={`A night more at ${name}`} disabled={!more} onClick={() => onStep(k, 1)}><Plus /></button>
          </span>
        )}
      </span>
      <button type="button" className="ws-x" aria-label={`Take ${name} off the stop`} onClick={() => onRemove(k)}><Trash /></button>
    </li>
  )
}

/** The place and its room on one line, the room cut short first. */
function What({ name, room }: { name: string; room?: string | null }) {
  return (
    <span className="ws-what">
      <b>{name}</b>
      {room && <small>{room}</small>}
    </span>
  )
}

/** A booked stay's mark, its reference cut short when it is long. */
function Booked({ b }: { b: Booking }) {
  return <Tip label={b.reference ? `Booked, reference ${b.reference}` : 'Booked'} className="ws-mk ws-ref" tone="booked"><Check /><span aria-hidden="true">{b.reference ?? 'Booked'}</span></Tip>
}

export function WhereToStay({ i, sched }: { i: number; sched: Schedule }) {
  const journey = useStore((s) => s.journey)
  const lodgings = useStore((s) => s.lodgings)
  const bookings = useStore((s) => s.bookings)
  const setStays = useStore((s) => s.setStays)
  const [adding, setAdding] = useState(false)
  const p = journey?.places[i]
  const sp = sched.places[i]
  if (!journey || !p || !sp) return null

  const stays = p.stays ?? []
  const parts = stayParts(stays, sp)
  const free = freeNights(stays, sp)
  const here = lodgings.filter((l) => l.place_id === sp.node && !l.hidden)
  const byId = new Map(lodgings.map((l) => [l.id, l]))
  const partBooked = parts.map((part) => partBooking(journey, sched, bookings, sp, part))
  // the trip's booked stays at this stop that no part stands for
  const shown = new Set(partBooked.filter(Boolean).map((b) => b!.id))
  const clashes = new Map(stayClashes(journey, sched, bookings).filter((c) => c.stop === i).map((c) => [c.booking.id, c]))
  const lastNight = addDays(sp.inDay, Math.max(1, sp.days) - 1)
  const loose = tripStays(journey, sched, bookings).filter(
    (b) => b.place_id === sp.node && !shown.has(b.id) && (clashes.has(b.id) || (b.check_in! <= lastNight && b.check_out! > sp.inDay)),
  )
  const bookedAt = (l: Lodging) => [...partBooked, ...loose].find((b) => b && b.lodging_id === l.id) ?? null
  const nights = sp.days > 0

  const change = (next: typeof stays) => setStays(i, next)

  return (
    <section className="ws" aria-labelledby={`ws-h-${i}`}>
      <header className="ws-head">
        <h4 id={`ws-h-${i}`}>Where to stay</h4>
      </header>

      {nights && (parts.length > 0 || loose.length > 0) && (
        <>
          <div className="ws-bar" aria-hidden="true">
            {parts.map((part, k) => part.fits && <i key={k} style={{ flexGrow: part.nights }} data-booked={partBooked[k] ? true : undefined} />)}
            {free.nights > 0 && <i style={{ flexGrow: free.nights }} data-free />}
          </div>
          <ol className="ws-parts">
            {parts.map((part, k) => {
              const step = canStep(stays, sp, k)
              return (
                <PartRow
                  key={`${part.stay.lodging_id}-${k}`}
                  part={part}
                  k={k}
                  lodging={byId.get(part.stay.lodging_id)}
                  booking={partBooked[k]}
                  more={step.more}
                  less={step.less}
                  onStep={(at, by) => change(stepNights(stays, sp, at, by))}
                  onRemove={(at) => change(removePart(stays, at))}
                />
              )
            })}
            {parts.length > 0 && free.nights > 0 && (
              <li className="ws-part" data-free>
                <What name={`${nightsWord(free.nights)} free`} />
                <span className="ws-meta"><span className="ws-when">{span(free.first, free.nights)}</span></span>
              </li>
            )}
            {loose.map((b) => {
              const c = clashes.get(b.id)
              const l = b.lodging_id ? byId.get(b.lodging_id) : undefined
              return (
                <li key={b.id} className="ws-part" data-booked>
                  <What name={l?.name ?? b.seller ?? 'Booked stay'} room={l && b.room_id ? l.rooms.find((r) => r.id === b.room_id)?.name : null} />
                  <span className="ws-meta">
                    <span className="ws-when">{dayRange(b.check_in!, b.check_out!)}</span>
                    {c && <Tip label={c.meets ? 'The stop has only some of these nights now' : 'The stop has none of these nights now'} className="ws-mk" tone="warn"><Warn /></Tip>}
                    <Booked b={b} />
                  </span>
                </li>
              )
            })}
          </ol>
        </>
      )}

      {here.length > 0 && (
        <div className="ws-cards">
          {here.map((l) => {
            const at = choiceNights(stays, sp, l.id)
            const chosen = stays.filter((s) => s.lodging_id === l.id && s.room_id).map((s) => s.room_id!)
            return (
              <StayCard
                key={l.id}
                lodging={l}
                first={nights ? at.first : null}
                nights={nights ? at.nights : 0}
                booking={bookedAt(l)}
                chosen={chosen}
                onChoose={nights ? (roomId) => change(toggleRoom(stays, sp, l.id, roomId)) : undefined}
              />
            )
          })}
        </div>
      )}

      {adding ? (
        <AddPlace
          place={sp.node}
          first={nights ? (free.nights > 0 ? free.first : sp.inDay) : null}
          nights={nights ? (free.nights > 0 ? free.nights : sp.days) : 0}
          close={() => setAdding(false)}
          onSaved={() => setAdding(false)}
        />
      ) : (
        <button type="button" className="ws-add" onClick={() => setAdding(true)}><Plus />Add a place</button>
      )}
    </section>
  )
}
