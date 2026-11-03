import type { Booking, Lodging } from '../../data/types'
import { dayRange, kr } from '../../lib/format'
import type { Schedule } from '../../lib/journey'
import { canStep, choiceNights, chooseRoom, freeNights, removePart, stepNights } from '../../lib/stayEdit'
import { partBooking, partDkk, stayClashes, stayParts, tripStays, type StayPart } from '../../lib/stays'
import { addDays } from '../../lib/time'
import { useStore } from '../../store'
import { Check, Minus, Moon, Plus, Trash, Warn } from '../icons'
import { Tip } from '../story/Marks'
import { StayCard } from './StayCard'

// Where to stay at a stop of the open trip: the stop's nights as a line of parts, each a room of a place to
// stay with its nights and its price, then the places to stay there as cards whose rooms you pick. A night
// no part takes shows as a free night, a booked stay wears the green ring and a stay the stop has moved off
// says so with a mark.

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
  const cost = booking ? null : partDkk(room, part)
  return (
    <li className="ws-part" data-booked={booking ? true : undefined} data-off={!part.fits || undefined}>
      <span className="ws-when">{part.fits ? span(part.first, part.nights) : 'No nights'}</span>
      <span className="ws-what">
        <b>{name}</b>
        <small>{room?.name ?? 'No room picked'}</small>
      </span>
      <span className="ws-end">
        {booking ? (
          <Tip label={booking.reference ? `Booked, reference ${booking.reference}` : 'Booked'} className="ws-mk" tone="booked"><Check /><span aria-hidden="true">{booking.reference ?? 'Booked'}</span></Tip>
        ) : part.fits ? (
          <span className="ws-pr" data-none={cost == null || undefined}>{kr(cost)}</span>
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
        <button type="button" className="ws-x" aria-label={`Take ${name} off the stop`} onClick={() => onRemove(k)}><Trash /></button>
      </span>
    </li>
  )
}

export function WhereToStay({ i, sched }: { i: number; sched: Schedule }) {
  const journey = useStore((s) => s.journey)
  const lodgings = useStore((s) => s.lodgings)
  const bookings = useStore((s) => s.bookings)
  const setStays = useStore((s) => s.setStays)
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
        {nights && <span className="ws-n"><Moon />{sp.days}</span>}
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
                <span className="ws-when">{span(free.first, free.nights)}</span>
                <span className="ws-what"><b>{nightsWord(free.nights)} free</b></span>
              </li>
            )}
            {loose.map((b) => {
              const c = clashes.get(b.id)
              const l = b.lodging_id ? byId.get(b.lodging_id) : undefined
              return (
                <li key={b.id} className="ws-part" data-booked>
                  <span className="ws-when">{dayRange(b.check_in!, b.check_out!)}</span>
                  <span className="ws-what"><b>{l?.name ?? b.seller ?? 'Booked stay'}</b>{l && b.room_id && <small>{l.rooms.find((r) => r.id === b.room_id)?.name}</small>}</span>
                  <span className="ws-end">
                    {c && <Tip label={c.meets ? 'The stop has only some of these nights now' : 'The stop has none of these nights now'} className="ws-mk" tone="warn"><Warn /></Tip>}
                    <Tip label={b.reference ? `Booked, reference ${b.reference}` : 'Booked'} className="ws-mk" tone="booked"><Check /><span aria-hidden="true">{b.reference ?? 'Booked'}</span></Tip>
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
                onChoose={nights ? (roomId) => change(chooseRoom(stays, sp, l.id, roomId)) : undefined}
              />
            )
          })}
        </div>
      )}
    </section>
  )
}
