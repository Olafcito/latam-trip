import { useState } from 'react'
import type { LodgingKind } from '../../data/types'
import { thousands, weekdayDay } from '../../lib/format'
import { gmailLogo } from '../../lib/purchase'
import { nightsWord, type Amenity } from '../../lib/stayOffer'
import type { StayMoney } from '../../lib/stayBooking'
import { Bed, Calendar, Check, External, House, Paperclip, Refund, Ring, Warn } from '../icons'
import { Tip } from '../story/Marks'
import { AmenityIcon, KindIcon } from './offerMarks'

// Where Simon sleeps at a stop. One photo fills the card's height on the left. On the right the place in two rows:
// its name with the address and the town under it and what it offers, then under a rule three columns, check-in
// with the nights, the room where it was found, and the price with the booking mark and the act that books it.
// Planned is amber and booked is green. The photo and the name open the stay on its own. On a narrow fold the photo
// goes on top.

/** Where the room was found or booked: its mark and the page the room name opens. */
export interface StayProvider {
  name: string
  /** the logo's address, null to draw a plain mark */
  logo: string | null
  /** https only, null when there is no page to open */
  url: string | null
}

export interface StayCardData {
  key: string
  name: string
  /** the kind of place and its word, "Hostel", null for a place of no kind */
  kind: { key: LodgingKind; word: string } | null
  /** the street address, null when the place has none */
  address: string | null
  /** "San Andrés, Colombia" */
  town: string
  /** https photos, the first is the one on the card */
  photos: string[]
  amenities: Amenity[]
  /** "Free cancellation until Tue 8 Dec", only when the stay cancels for free */
  freeCancel: string | null
  /** the stay's own dates, null when the stop has no nights left for it */
  checkIn: string | null
  checkOut: string | null
  nights: number
  room: string | null
  provider: StayProvider | null
  money: StayMoney
  /** the currency of the money, DKK unless only a foreign price is known */
  currency: string
  booked: boolean
  /** the confirmation files attached */
  files: number
  /** the confirmation mail in Gmail, https only */
  mailUrl: string | null
  /** why the stay no longer fits the stop, when it does not */
  warn?: string | null
  onOpen: () => void
  /** add a booking confirmation, on a planned stay */
  onConfirm?: () => void
  /** open the place to choose a room, when none is chosen */
  onRoom?: () => void
}

function Photo({ src }: { src: string | undefined }) {
  const [broken, setBroken] = useState(false)
  return (
    <span className="ac-main">
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

/** The provider's logo on a small light square, or a plain mark when it has none. */
export function ProviderMark({ p, size }: { p: StayProvider; size?: 'large' }) {
  const [broken, setBroken] = useState(false)
  return (
    <span className="ac-logo" data-size={size} data-plain={!p.logo || broken || undefined} role="img" aria-label={p.name} title={p.name}>
      {p.logo && !broken ? <img src={p.logo} alt="" onError={() => setBroken(true)} /> : <House s={size ? 18 : 12} />}
    </span>
  )
}

export function AccommodationCard({ c }: { c: StayCardData }) {
  const { perNight, total, exact } = c.money
  const about = !exact && total != null
  const when = c.checkIn ? `${weekdayDay(c.checkIn)}${c.checkOut ? ` to ${weekdayDay(c.checkOut)}` : ''}` : 'No nights'
  const money = (n: number) => `${thousands(n)} ${c.currency}`
  // booked leads with what was paid, planned with a night, the other figure under it
  const lead = c.booked ? (total != null ? { n: total, unit: 'total' } : perNight != null ? { n: perNight, unit: '/ night' } : null)
    : perNight != null ? { n: perNight, unit: '/ night' } : total != null ? { n: total, unit: 'total' } : null
  const second = lead?.unit === 'total' ? (perNight != null && c.nights > 1 ? `${money(perNight)} / night` : null)
    : total != null && c.nights > 1 ? `${money(total)} total` : null
  const roomUrl = c.provider?.url ?? null
  return (
    <article className="ac" data-booked={c.booked || undefined} aria-label={`${c.name}, ${c.booked ? 'booked' : 'not booked'}`}>
      <button type="button" className="ac-pics" onClick={c.onOpen} tabIndex={-1} aria-hidden="true">
        <Photo src={c.photos[0]} />
        <Mark booked={c.booked} className="ac-flag" />
      </button>

      <div className="ac-body">
        <div className="ac-place">
          <h4 className="ac-name"><button type="button" onClick={c.onOpen}>{c.name}</button></h4>
          <p className="ac-where">
            {c.address && <span className="ac-addr">{c.address}</span>}
            <span className="ac-town">{c.town}</span>
          </p>
          {(c.kind || c.amenities.length > 0 || c.freeCancel) && (
            <ul className="ac-ams" aria-label="What it offers">
              {c.kind && <li className="ac-kind"><KindIcon kind={c.kind.key} s={15} />{c.kind.word}</li>}
              {c.amenities.map((a) => <li key={a.key}><AmenityIcon k={a.key} s={15} />{a.label}</li>)}
              {c.freeCancel && (
                <li className="ac-free">
                  <Tip label={c.freeCancel} className="ac-tip"><Refund s={15} /><span aria-hidden="true">Free cancellation</span></Tip>
                </li>
              )}
            </ul>
          )}
        </div>

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
              {c.room ? (
                <span className="ac-room-row">
                  {c.provider && <ProviderMark p={c.provider} />}
                  {roomUrl ? (
                    <a className="ac-v ac-room" href={roomUrl} target="_blank" rel="noopener noreferrer">
                      <span>{c.room}</span><External s={11} /><span className="vh">, opens {c.provider?.name} in a new tab</span>
                    </a>
                  ) : <b className="ac-v ac-room"><span>{c.room}</span></b>}
                </span>
              ) : c.onRoom ? <button type="button" className="ac-pick" onClick={c.onRoom}>Choose a room</button> : <b className="ac-v">Room not known</b>}
            </div>
          </div>

          <div className="ac-f ac-money">
            <div className="ac-price">
              {c.booked && c.provider && <ProviderMark p={c.provider} size="large" />}
              {lead && (
                <span className="ac-amt">
                  <span className="ac-lead"><b title={about && !c.booked ? 'From the price seen for other dates' : undefined}>{money(lead.n)}</b><span>{lead.unit}</span></span>
                  {second && <small>{about && !c.booked ? `About ${second}` : second}</small>}
                </span>
              )}
            </div>
            <Mark booked={c.booked} className="ac-pill" />
            <div className="ac-acts">
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
              {c.mailUrl && (
                <a className="ac-mail" href={c.mailUrl} target="_blank" rel="noopener noreferrer" aria-label="Confirmation mail, opens in Gmail" title="Confirmation mail in Gmail">
                  <img src={gmailLogo()} alt="" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}
