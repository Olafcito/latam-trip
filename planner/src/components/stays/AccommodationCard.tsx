import { useState } from 'react'
import { thousands, weekdayDay } from '../../lib/format'
import { nightsWord, type Amenity } from '../../lib/stayOffer'
import type { StayMoney } from '../../lib/stayBooking'
import { Bed, Calendar, Check, Paperclip, Ring, Warn } from '../icons'
import { AmenityIcon } from './offerMarks'

// Where Simon sleeps at a stop, as the reference card draws it: the photos on the left, the place on the right with
// its kind, town, a line about it and what it offers, then under a rule three columns, check-in with the nights,
// the room with its terms, and the price a night with the booking mark and the act that books it. Planned is amber
// and booked is green. The photos and the name open the stay on its own. On a narrow fold the photos go on top.

export interface StayCardData {
  key: string
  name: string
  /** "Hostel", empty for a place of no kind */
  kind: string
  /** "San Andrés, Colombia" */
  where: string
  summary: string | null
  /** https photos, the first is the large one */
  photos: string[]
  amenities: Amenity[]
  /** the stay's own dates, null when the stop has no nights left for it */
  checkIn: string | null
  checkOut: string | null
  nights: number
  room: string | null
  /** the room's terms in a few words, "Free cancellation · Private bathroom" */
  terms: string | null
  money: StayMoney
  booked: boolean
  /** the confirmation files attached */
  files: number
  /** why the stay no longer fits the stop, when it does not */
  warn?: string | null
  onOpen: () => void
  /** add a booking confirmation, on a planned stay */
  onConfirm?: () => void
  /** open the place to choose a room, when none is chosen */
  onRoom?: () => void
}

function Photo({ src, className }: { src: string | undefined; className: string }) {
  const [broken, setBroken] = useState(false)
  return (
    <span className={className}>
      {src && !broken ? <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setBroken(true)} /> : <Bed s={22} />}
    </span>
  )
}

/** The booking mark: an amber ring and Not booked, or a green check and Booked. */
function Mark({ booked, className }: { booked: boolean; className: string }) {
  return (
    <span className={className} data-on={booked || undefined}>
      {booked ? <Check s={12} /> : <Ring s={11} />}
      {booked ? 'Booked' : 'Not booked'}
    </span>
  )
}

export function AccommodationCard({ c }: { c: StayCardData }) {
  const [main, ...rest] = c.photos
  const thumbs = rest.slice(0, 3)
  const { perNight, total, exact } = c.money
  const about = !exact && total != null
  const when = c.checkIn ? `${weekdayDay(c.checkIn)}${c.checkOut ? ` to ${weekdayDay(c.checkOut)}` : ''}` : 'No nights'
  return (
    <article className="ac" data-booked={c.booked || undefined} aria-label={`${c.name}, ${c.booked ? 'booked' : 'not booked'}`}>
      <button type="button" className="ac-pics" data-one={thumbs.length === 0 || undefined} onClick={c.onOpen} tabIndex={-1} aria-hidden="true">
        <Photo src={main} className="ac-main" />
        <Mark booked={c.booked} className="ac-flag" />
        {thumbs.length > 0 && (
          <span className="ac-thumbs" data-n={thumbs.length}>
            {thumbs.map((t) => <Photo key={t} src={t} className="ac-th" />)}
          </span>
        )}
      </button>

      <div className="ac-body">
        <h4 className="ac-name"><button type="button" onClick={c.onOpen}>{c.name}</button></h4>
        <p className="ac-kind">{c.kind && <b>{c.kind}</b>}{c.kind && c.where && <i aria-hidden="true">·</i>}<span>{c.where}</span></p>
        {c.summary && <p className="ac-sum">{c.summary}</p>}
        {c.amenities.length > 0 && (
          <ul className="ac-ams" aria-label="What it offers">
            {c.amenities.map((a) => <li key={a.key}><AmenityIcon k={a.key} s={15} />{a.label}</li>)}
          </ul>
        )}

        <div className="ac-facts">
          <div className="ac-f">
            <Calendar s={17} />
            <div>
              <span className="ac-l">Check-in</span>
              <b className="ac-v" title={when}>{c.checkIn ? weekdayDay(c.checkIn) : 'No nights'}</b>
              {c.checkIn && (
                <span className="ac-chips">
                  <span className="ac-chip" title={when}>{nightsWord(c.nights)}</span>
                  {c.warn && <span className="ac-warn" role="img" aria-label={c.warn} title={c.warn}><Warn s={13} /></span>}
                </span>
              )}
            </div>
          </div>

          <div className="ac-f">
            <Bed s={17} />
            <div>
              <span className="ac-l">Room</span>
              {c.room ? <b className="ac-v ac-room">{c.room}</b> : c.onRoom ? <button type="button" className="ac-pick" onClick={c.onRoom}>Choose a room</button> : <b className="ac-v">Room not known</b>}
              {c.terms && <span className="ac-sub">{c.terms}</span>}
            </div>
          </div>

          <div className="ac-f ac-money">
            <div className="ac-price">
              {c.booked && total != null ? (
                <span className="ac-amt"><b>{thousands(total)} DKK</b><span>total</span></span>
              ) : perNight != null ? (
                <span className="ac-amt"><b title={about ? 'From the price seen for other dates' : undefined}>{thousands(perNight)} DKK</b><span>/ night</span></span>
              ) : <span className="ac-none">No price yet</span>}
              {total != null && (
                <span className="ac-cur" data-about={about || undefined}>
                  {c.booked ? (perNight != null ? `${thousands(perNight)} / night` : 'DKK') : `${about ? 'About ' : ''}${thousands(total)} DKK in all`}
                </span>
              )}
            </div>
            <Mark booked={c.booked} className="ac-pill" />
            {c.booked ? (
              <button type="button" className="ac-att" data-on onClick={c.onOpen}>
                <Paperclip s={18} />
                <span><b>{c.files ? (c.files === 1 ? 'Confirmation attached' : `${c.files} confirmations attached`) : 'Booking details'}</b></span>
              </button>
            ) : c.onConfirm && (
              <button type="button" className="ac-att" onClick={c.onConfirm}>
                <Paperclip s={18} />
                <span><b>Add booking confirmation</b><small>Attach PDF, screenshot or booking link</small></span>
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
