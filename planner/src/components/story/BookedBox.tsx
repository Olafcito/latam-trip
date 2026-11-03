import { useEffect, useId, useRef, useState, type ChangeEvent, type Ref } from 'react'
import type { Booking, BookingFile, InOut, MapNode } from '../../data/types'
import { boxFacts, boxHead, boxSegments, fileMessage, fileTile } from '../../lib/bookedBox'
import { attachFile, cancelBooking, fileUrl } from '../../lib/bookings'
import { shortPlace } from '../../lib/format'
import { useStore } from '../../store'
import { Arrow, Check, Clock, Copy, Doc, External, Plane, Plus } from '../icons'

// The booking at the top of its sheet, read like a boarding pass: a green band that says Booked, the two
// codes large with the cities under them, the reference on its own stub, then the facts, the flights
// inside with the time in each airport between, the files and the notes. It reads the booking row alone,
// so it is whole even when the leg has no picked flight. Change booking opens the days and the flights
// under it to look at. Remove asks once, here in the box, and sets the booking to cancelled.

export interface BoxData {
  inout: Pick<InOut, 'airports'>
  map: { nodes: readonly Pick<MapNode, 'iata' | 'name'>[] }
}

/** Puts a change into the store's bookings at once, so the box agrees with what was saved before the live reload lands. */
function patch(id: string, change: Partial<Booking>) {
  const s = useStore.getState()
  s.setBookings(s.bookings.map((b) => (b.id === id ? { ...b, ...change } : b)))
}

/** A web address the box may link to. Anything else, a javascript: one too, gives no link. */
const safeUrl = (u: string | null) => (u && /^https?:\/\//i.test(u.trim()) ? u.trim() : null)

function Tile({ f, onOpen }: { f: BookingFile; onOpen: (f: BookingFile) => void }) {
  const { kind, size } = fileTile(f)
  return (
    <li>
      <button type="button" className="bk-tile" onClick={() => onOpen(f)} aria-label={`Open ${f.name}, ${kind}${size ? `, ${size}` : ''}, in a new tab`}>
        <span className="bk-tile-i" aria-hidden="true"><Doc /></span>
        <b title={f.name}>{f.name}</b>
        <small>{kind}{size && `, ${size}`}</small>
      </button>
    </li>
  )
}

export function BookedBox({ booking: b, data, changing, hint, onChange, onEdit, onRemoved, ref }: {
  booking: Booking
  data: BoxData
  /** the days and the flights under the box are open */
  changing: boolean
  /** what is open under the box while changing, in a sentence */
  hint?: string
  /** Change booking and Done */
  onChange: (on: boolean) => void
  /** opens the booking form, left out until the form is there */
  onEdit?: () => void
  /** after the booking is cancelled, so the sheet can say so */
  onRemoved?: () => void
  ref?: Ref<HTMLElement>
}) {
  const id = useId()
  const city = (code: string) => {
    const name = data.inout.airports[code]?.name ?? data.map.nodes.find((n) => n.iata === code)?.name
    return name ? shortPlace(name) : null
  }
  const head = boxHead(b, city)
  const facts = boxFacts(b)
  const segs = boxSegments(b)
  const link = safeUrl(b.url)
  const [said, setSaid] = useState<{ text: string; bad?: boolean } | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [removing, setRemoving] = useState(false)
  const keep = useRef<HTMLButtonElement>(null)
  const remove = useRef<HTMLButtonElement>(null)
  // the question takes the focus to its safe answer, and Keep booking gives it back to Remove booking
  const asked = useRef(false)
  useEffect(() => {
    if (asking) keep.current?.focus()
    else if (asked.current) remove.current?.focus()
    asked.current = asking
  }, [asking])

  const copy = async () => {
    if (!b.reference) return
    try {
      await navigator.clipboard.writeText(b.reference)
      setSaid({ text: 'Reference copied.' })
    } catch {
      setSaid({ text: 'Copying did not work. Select the reference and copy it by hand.', bad: true })
    }
  }

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
    setSaid({ text: url ? 'The browser kept the file from opening in a new tab.' : `${f.name} could not be opened. Try again.`, bad: true })
  }

  const add = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget
    const file = input.files?.[0] ?? null
    input.value = ''
    const problem = fileMessage(file)
    if (problem || !file) {
      setSaid({ text: problem ?? 'Choose a PDF or a photo to add.', bad: true })
      return
    }
    setAdding(file.name)
    setSaid(null)
    const r = await attachFile(b.id, file)
    setAdding(null)
    if (!r.ok) return setSaid({ text: r.message, bad: true })
    patch(b.id, { attachments: b.attachments.filter((a) => a.path !== r.attachment.path).concat(r.attachment) })
    setSaid({ text: `${file.name} added.` })
  }

  const cancel = async () => {
    setRemoving(true)
    const r = await cancelBooking(b.id)
    setRemoving(false)
    if (!r.ok) {
      setAsking(false)
      return setSaid({ text: r.message, bad: true })
    }
    if (changing) onChange(false)
    patch(b.id, { status: 'cancelled' })
    onRemoved?.()
  }

  return (
    <section ref={ref} className="bk" aria-labelledby={`${id}-h`} tabIndex={-1}>
      <header className="bk-band">
        <Check s={18} />
        <h4 id={`${id}-h`}>Booked</h4>
        {head.day && <span>{head.day}</span>}
      </header>

      <div className="bk-route">
        <div className="bk-end">
          <b>{head.from.code || 'From'}</b>
          {head.from.city && <small>{head.from.city}</small>}
          {head.from.time && <span>{head.from.time}</span>}
        </div>
        <span className="bk-fly" aria-hidden="true"><Plane s={18} /></span>
        <div className="bk-end to">
          <b>{head.to.code || 'To'}</b>
          {head.to.city && <small>{head.to.city}</small>}
          {head.to.time && <span>{head.to.time}{head.to.mark && <sup aria-label={`, ${head.to.mark} day`}>{head.to.mark}</sup>}</span>}
        </div>
      </div>

      {b.reference && (
        <div className="bk-ref">
          <div>
            <small id={`${id}-ref`}>Booking reference</small>
            <output className="bk-code" aria-labelledby={`${id}-ref`}>{b.reference}</output>
          </div>
          <button type="button" className="btn small" onClick={copy} aria-label="Copy the booking reference"><Copy /> Copy</button>
        </div>
      )}

      <div className="bk-body">
        {facts.length > 0 && (
          <dl className="bk-facts">
            {facts.map((f) => <div key={f.key}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}
          </dl>
        )}

        {segs.length > 0 && (
          <section className="bk-part" aria-labelledby={`${id}-segs`}>
            <h5 id={`${id}-segs`}>Flights</h5>
            <ol className="bk-segs">
              {segs.map((s, i) => s.kind === 'flight' ? (
                <li key={i}>
                  <span className="bk-seg-route"><b>{s.from}</b>{s.depart && ` ${s.depart}`}<Arrow s={12} /><b>{s.to}</b>{s.arrive && ` ${s.arrive}`}{s.mark && <sup>{s.mark}</sup>}</span>
                  {s.what && <small>{s.what}</small>}
                </li>
              ) : (
                <li key={i} className="bk-stop"><Clock /><span>{s.time ? `${s.time} in ${s.airport}` : `Change in ${s.airport}`}</span></li>
              ))}
            </ol>
          </section>
        )}

        <section className="bk-part" aria-labelledby={`${id}-files`}>
          <h5 id={`${id}-files`}>Files</h5>
          <ul className="bk-files">
            {b.attachments.map((f) => <Tile key={f.path} f={f} onOpen={open} />)}
            <li>
              <label className="bk-tile bk-add" data-busy={adding ? true : undefined}>
                <input type="file" accept="application/pdf,image/*" onChange={add} disabled={!!adding} aria-describedby={`${id}-add`} />
                <span className="bk-tile-i" aria-hidden="true"><Plus /></span>
                <b>{adding ? `Adding ${adding}` : 'Add a file'}</b>
                <small id={`${id}-add`}>PDF or photo, up to 10 MB</small>
              </label>
            </li>
          </ul>
        </section>

        {b.notes && b.notes.trim() && (
          <section className="bk-part" aria-labelledby={`${id}-notes`}>
            <h5 id={`${id}-notes`}>Notes</h5>
            <p className="bk-notes">{b.notes.trim()}</p>
          </section>
        )}

        {changing && hint && <p className="bk-hint">{hint}</p>}

        <p className="bk-said" role="status" data-bad={said?.bad || undefined}>{said?.text}</p>

        {asking ? (
          <div className="bk-ask" role="group" aria-labelledby={`${id}-ask`}>
            <p id={`${id}-ask`}>Remove this booking. It is kept as cancelled and the leg can change again.</p>
            <div className="bk-acts">
              <button type="button" className="btn small bk-confirm" onClick={cancel} disabled={removing}>{removing ? 'Removing' : 'Remove booking'}</button>
              <button ref={keep} type="button" className="btn small" onClick={() => setAsking(false)} disabled={removing}>Keep booking</button>
            </div>
          </div>
        ) : (
          <div className="bk-acts">
            {link && <a className="btn small" href={link} target="_blank" rel="noopener noreferrer">Open booking<External /></a>}
            <button type="button" className="btn small" data-on={changing || undefined} onClick={() => onChange(!changing)}>{changing ? 'Done' : 'Change booking'}</button>
            {onEdit && <button type="button" className="btn small" onClick={onEdit}>Edit</button>}
            <button ref={remove} type="button" className="btn small danger bk-remove" onClick={() => setAsking(true)}>Remove booking</button>
          </div>
        )}
      </div>
    </section>
  )
}
