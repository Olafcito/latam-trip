import { useState, type ReactNode } from 'react'
import type { Booking, BookingFile } from '../../data/types'
import { fileUrl } from '../../lib/bookings'
import { fileTile } from '../../lib/bookedBox'
import { thousands, weekdayDay } from '../../lib/format'
import { nightsWord } from '../../lib/stayOffer'
import { Bed, Calendar, Check, Doc, External, Hash, Paperclip, Refund, Ring, Shop, Ticket, Trash, Warn } from '../icons'
import type { StayCardData } from './AccommodationCard'

// The stay on its own, as the flight's booking opens: the photos, then the place, then its facts one to a line with
// the mark that says what each is, then the confirmation files. Only this place shows, not the search. The acts sit
// at the foot: add a confirmation to a planned stay, see the rooms, take the stay off the stop.

const Pic = ({ src, big }: { src: string; big?: boolean }) => {
  const [broken, setBroken] = useState(false)
  return <span className={big ? 'sd-pic sd-big' : 'sd-pic'}>{!broken ? <img src={src} alt="" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setBroken(true)} /> : <Bed s={22} />}</span>
}

export function StayDetails({ c, booking, cancel, close, onConfirm, onPlace, onRemove }: {
  c: StayCardData
  booking: Booking | null
  /** how it can be cancelled, in a few words */
  cancel: string | null
  close: () => void
  onConfirm?: () => void
  /** the place with its rooms */
  onPlace?: () => void
  onRemove?: () => void
}) {
  const [said, setSaid] = useState<string | null>(null)
  const { perNight, total, exact } = c.money
  const files = booking?.attachments ?? []
  const pics = c.photos.slice(0, 5)

  const open = async (f: BookingFile) => {
    // the tab opens on the press, so no popup blocker stops it, and gets its address once the bucket gives one
    const tab = window.open('', '_blank')
    if (tab) tab.opener = null
    const url = await fileUrl(f.path)
    if (url && tab) {
      tab.location.href = url
      return
    }
    tab?.close()
    setSaid(url ? 'The browser kept the file from opening in a new tab.' : `${f.name} could not be opened. Try again.`)
  }

  const price = total == null ? null : c.booked
    ? `${thousands(total)} DKK${perNight != null && c.nights > 1 ? `, ${thousands(perNight)} a night` : ''}`
    : `${exact ? '' : 'About '}${thousands(total)} DKK${perNight != null && c.nights > 1 ? `, ${thousands(perNight)} a night` : ''}`

  const facts: { k: string; Icon: (p: { s?: number }) => ReactNode; label: string; value: string; href?: string; tone?: 'warn' }[] = [
    ...(c.room ? [{ k: 'room', Icon: Bed, label: 'Room', value: c.room }] : []),
    ...(c.checkIn ? [{
      k: 'dates', Icon: Calendar, label: nightsWord(c.nights),
      value: `${weekdayDay(c.checkIn)}${c.checkOut ? ` to ${weekdayDay(c.checkOut)}` : ''}`,
    }] : []),
    ...(c.warn ? [{ k: 'warn', Icon: Warn, label: 'Dates', value: c.warn, tone: 'warn' as const }] : []),
    ...(price ? [{ k: 'price', Icon: Ticket, label: c.booked ? 'Paid' : 'Price', value: price }] : []),
    ...(booking?.reference ? [{ k: 'ref', Icon: Hash, label: 'Reference', value: booking.reference }] : []),
    ...(booking?.seller ? [{ k: 'seller', Icon: Shop, label: 'Booked with', value: booking.seller }] : []),
    ...(cancel ? [{ k: 'cancel', Icon: Refund, label: 'Cancellation', value: cancel }] : []),
    ...(booking?.url ? [{ k: 'url', Icon: External, label: 'Booking', value: hostOf(booking.url), href: booking.url }] : []),
  ]

  return (
    <div className="scw sd">
      {pics.length > 0 && (
        <div className="sd-pics" data-n={Math.min(pics.length, 3)}>
          {pics.slice(0, 3).map((p, k) => <Pic key={p} src={p} big={k === 0} />)}
        </div>
      )}
      <div className="sd-body">
        <header className="sd-head">
          <span className="ac-pill sd-mark" data-on={c.booked || undefined}>
            {c.booked ? <Check s={12} /> : <Ring s={11} />}
            {c.booked ? 'Booked' : 'Not booked'}
          </span>
          <h2>{c.name}</h2>
          <p className="ac-kind">{c.kind && <b>{c.kind}</b>}{c.kind && c.where && <i aria-hidden="true">·</i>}<span>{c.where}</span></p>
        </header>

        <ul className="sd-facts">
          {facts.map(({ k, Icon, label, value, href, tone }) => (
            <li key={k} data-tone={tone}>
              <Icon s={17} />
              <span className="sd-l">{label}</span>
              {href ? <a className="sd-v" href={href} target="_blank" rel="noreferrer noopener">{value}</a> : <b className="sd-v">{value}</b>}
            </li>
          ))}
        </ul>

        {c.booked && (
          <section className="sd-files" aria-label="Confirmation">
            <h3><Paperclip s={15} />{files.length ? (files.length === 1 ? 'Confirmation' : `${files.length} confirmations`) : 'No confirmation file'}</h3>
            {files.length > 0 && (
              <ul className="bk-files">
                {files.map((f) => {
                  const { kind, size } = fileTile(f)
                  return (
                    <li key={f.path}>
                      <button type="button" className="bk-tile" onClick={() => open(f)} aria-label={`Open ${f.name}, ${kind}${size ? `, ${size}` : ''}, in a new tab`}>
                        <span className="bk-tile-i" aria-hidden="true"><Doc /></span>
                        <b title={f.name}>{f.name}</b>
                        <small>{kind}{size && `, ${size}`}</small>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}

        {said && <p className="scw-said" role="alert">{said}</p>}

        <div className="sd-acts">
          {onConfirm && (
            <button type="button" className="ac-att sd-confirm" onClick={() => { close(); onConfirm() }}>
              <Paperclip s={18} />
              <span><b>{c.booked ? 'Add a confirmation' : 'Add booking confirmation'}</b><small>Attach PDF, screenshot or booking link</small></span>
            </button>
          )}
          <div className="sd-row">
            {onPlace && <button type="button" className="btn small" onClick={() => { close(); onPlace() }}>Rooms and photos</button>}
            {onRemove && (
              <button type="button" className="btn small danger" onClick={() => { close(); onRemove() }}>
                <Trash s={13} />Take off the stop
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
