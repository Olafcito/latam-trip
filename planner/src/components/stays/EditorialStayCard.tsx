import { useState } from 'react'
import { thousands, weekdayDay } from '../../lib/format'
import { gmailLogo } from '../../lib/purchase'
import { Arrow, Bed, Check, External, Paperclip, Refund, Ring, Warn } from '../icons'
import { Tip } from '../story/Marks'
import { ProviderMark, type StayCardData } from './AccommodationCard'
import { AmenityIcon, KindIcon } from './offerMarks'

// The editorial look of where Simon sleeps at a stop, from the same card data as AccommodationCard. One wide landscape
// photo on the left, on a phone on top. Beside it the kind and the booking mark once, the name large, the address,
// what it offers as small marks, then one row of the stay: in, out, nights and the room, the room a link to where it
// was found with that site's logo before it. Last the money and the confirmation as one group: the total large,
// a night under it, the Gmail mark before the confirmation link. The money stays in the currency it was seen in.

function Photo({ src, onOpen }: { src: string | undefined; onOpen: () => void }) {
  const [state, setState] = useState<'wait' | 'ok' | 'broken'>('wait')
  return (
    <button type="button" className="es-pic" onClick={onOpen} tabIndex={-1} aria-hidden="true">
      {src && state !== 'broken'
        ? <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} data-ok={state === 'ok' || undefined} onLoad={() => setState('ok')} onError={() => setState('broken')} />
        : <Bed s={26} />}
    </button>
  )
}

export function EditorialStayCard({ c }: { c: StayCardData }) {
  const { perNight, total, exact } = c.money
  const money = (n: number) => `${thousands(n)} ${c.currency}`
  // the total leads, a night under it. Only a night known: the night leads
  const lead = total != null ? { n: total, unit: 'total' } : perNight != null ? { n: perNight, unit: 'a night' } : null
  const night = total != null && perNight != null && c.nights > 1 ? `${money(perNight)} a night` : null
  const about = !exact && !c.booked && lead != null
  const roomUrl = c.provider?.url ?? null
  return (
    <article className="es" data-booked={c.booked || undefined} aria-label={`${c.name}, ${c.booked ? 'booked' : 'not booked'}`}>
      <Photo src={c.photos[0]} onOpen={c.onOpen} />

      <div className="es-body">
        <div className="es-top">
          {c.kind && <span className="es-kind"><KindIcon kind={c.kind.key} s={14} />{c.kind.word}</span>}
          <span className="es-mark" data-on={c.booked || undefined}>
            {c.booked ? <Check s={12} /> : <Ring s={11} />}{c.booked ? 'Booked' : 'Not booked'}
          </span>
        </div>
        <h4 className="es-name"><button type="button" onClick={c.onOpen}>{c.name}</button></h4>
        <p className="es-where">{c.address && c.town && c.address.includes(c.town.split(',')[0]) ? c.address : [c.address, c.town].filter(Boolean).join(', ')}</p>
        {(c.amenities.length > 0 || c.freeCancel) && (
          <ul className="es-ams" aria-label="What it offers">
            {c.amenities.map((a) => <li key={a.key}><AmenityIcon k={a.key} s={14} />{a.label}</li>)}
            {c.freeCancel && (
              <li className="es-free"><Tip label={c.freeCancel} className="ac-tip"><Refund s={14} /><span aria-hidden="true">Free cancellation</span></Tip></li>
            )}
          </ul>
        )}

        <dl className="es-stay">
          <div className="es-d">
            <dt>Check in</dt>
            <dd>{c.checkIn ? weekdayDay(c.checkIn) : 'No nights'}</dd>
          </div>
          <span className="es-arrow" aria-hidden="true"><Arrow s={14} /></span>
          <div className="es-d">
            <dt>Check out</dt>
            <dd>{c.checkOut ? weekdayDay(c.checkOut) : 'Not set'}</dd>
          </div>
          <div className="es-d es-n">
            <dt>Nights</dt>
            <dd>
              {c.nights}
              {c.warn && <span className="es-warn" role="img" aria-label={c.warn} title={c.warn}><Warn s={13} /></span>}
            </dd>
          </div>
          <div className="es-d es-room">
            <dt>Room</dt>
            <dd>
              {c.room ? (
                <>
                  {c.provider && <ProviderMark p={c.provider} />}
                  {roomUrl ? (
                    <a href={roomUrl} target="_blank" rel="noopener noreferrer">
                      <span>{c.room}</span><External s={11} /><span className="vh">, opens {c.provider?.name} in a new tab</span>
                    </a>
                  ) : <span>{c.room}</span>}
                </>
              ) : c.onRoom ? <button type="button" className="es-pick" onClick={c.onRoom}>Choose a room</button> : <span className="es-none">Not known</span>}
            </dd>
          </div>
        </dl>

        <div className="es-money">
          {lead && (
            <p className="es-price">
              <b title={about ? 'From the price seen for other dates' : undefined}>{about && <small>About </small>}{money(lead.n)}</b>
              <span>{lead.unit}</span>
              {night && <small className="es-night">{night}</small>}
            </p>
          )}
          <div className="es-acts">
            {c.mailUrl && (
              <a className="es-mail" href={c.mailUrl} target="_blank" rel="noopener noreferrer" title="Confirmation mail in Gmail">
                <img src={gmailLogo()} alt="" /><span>Confirmation</span><span className="vh">, opens Gmail</span>
              </a>
            )}
            {c.booked ? (
              (c.files > 0 || !c.mailUrl) && (
                <button type="button" className="es-att" onClick={c.onOpen} aria-label={c.files ? `${c.files === 1 ? 'Confirmation' : `${c.files} confirmations`} attached, booking details` : 'Booking details'}>
                  <Paperclip s={16} />{c.files > 0 ? <span>{c.files}</span> : <span>Details</span>}
                </button>
              )
            ) : c.onConfirm && (
              <button type="button" className="es-att" onClick={c.onConfirm}><Paperclip s={16} /><span>Add confirmation</span></button>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
