import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode, type Ref } from 'react'
import type { Booking, BookingFile, InOut, MapNode } from '../../data/types'
import { boxChips, boxHead, boxSegments, fileMessage, fileTile, type BoxChip, type BoxHead, type BoxSegment } from '../../lib/bookedBox'
import { attachFile, cancelBooking, fileUrl } from '../../lib/bookings'
import { shortPlace } from '../../lib/format'
import { useStore } from '../../store'
import { Arrow, Bag, Boat, Bus, Check, Clock, Copy, Doc, External, Pencil, Person, Plane, Plus, Rebook, Refund, Shop, Suitcase, Ticket } from '../icons'

// The booking at the top of its sheet, read like a boarding pass: a green band that says Booked, the two
// codes large with the cities under them, the reference on its own stub, then the facts as icon chips,
// the flights inside with the time in each airport between, the files and the notes. It reads the booking
// row alone, so it is whole even when the leg has no picked flight. Change booking opens the days and the
// flights under it to look at. Remove asks once, here in the box, and sets the booking to cancelled.

export interface BoxData {
  inout: Pick<InOut, 'airports'>
  map: { nodes: readonly Pick<MapNode, 'iata' | 'name'>[] }
}

/** Puts a change into the store's bookings at once, so the box agrees with what was saved before the live reload lands. */
const patch = (id: string, change: Partial<Booking>) => useStore.getState().patchBooking(id, change)

/** The city of an airport code, from the long-haul airports or the places on the map. */
export function cityOf(data: BoxData) {
  return (code: string) => {
    const name = data.inout.airports[code]?.name ?? data.map.nodes.find((n) => n.iata === code)?.name
    return name ? shortPlace(name) : null
  }
}

/** A web address the box may link to. Anything else, a javascript: one too, gives no link. */
const safeUrl = (u: string | null) => (u && /^https?:\/\//i.test(u.trim()) ? u.trim() : null)

/** The mark of a later day: seen as a small +1, heard as words. */
function DayMark({ mark }: { mark: string }) {
  if (!mark) return null
  return <><sup aria-hidden="true">{mark}</sup><span className="vh">, {mark} day</span></>
}

/** The two codes large with the cities under them and the times, as on a boarding pass. The mark between is the way it goes. */
export function BoxRoute({ head, kind }: { head: BoxHead; kind?: string | null }) {
  const Way = kind === 'bus' ? Bus : kind === 'boat' ? Boat : Plane
  return (
    <div className="bk-route" data-kind={kind && kind !== 'flight' ? kind : undefined}>
      <div className="bk-end">
        <b>{head.from.code || 'From'}</b>
        {head.from.city && <small>{head.from.city}</small>}
        {head.from.time && <span>{head.from.time}</span>}
      </div>
      <span className="bk-fly" aria-hidden="true"><Way s={18} /></span>
      <div className="bk-end to">
        <b>{head.to.code || 'To'}</b>
        {head.to.city && <small>{head.to.city}</small>}
        {head.to.time && <span>{head.to.time}<DayMark mark={head.to.mark} /></span>}
      </div>
    </div>
  )
}

const CHIP_ICON: Record<BoxChip['key'], (p: { s?: number }) => ReactNode> = {
  seller: Shop, paid: Ticket, cabin: Bag, checked: Suitcase, refundable: Refund, changeable: Rebook, travellers: Person,
}

/** The facts as icon chips. Each holds its whole fact in its tooltip and for a screen reader. */
export function BoxChips({ chips }: { chips: BoxChip[] }) {
  if (!chips.length) return null
  return (
    <ul className="bk-chips">
      {chips.map((c) => {
        const Icon = CHIP_ICON[c.key]
        return (
          <li key={c.key} className="bk-chip" data-k={c.key} data-tone={c.tone} title={c.label}>
            <Icon s={14} />
            <span aria-hidden="true">{c.text}</span>
            {c.until && <small aria-hidden="true">{c.until}</small>}
            <span className="vh">{c.label}</span>
          </li>
        )
      })}
    </ul>
  )
}

/** The flights inside a booking with the time in each airport between. */
export function BoxSegs({ segs, label }: { segs: BoxSegment[]; label: string }) {
  if (!segs.length) return null
  return (
    <ol className="bk-segs" aria-label={label}>
      {segs.map((s, i) => s.kind === 'flight' ? (
        <li key={i}>
          <span className="bk-seg-route"><b>{s.from}</b>{s.depart && ` ${s.depart}`}<Arrow s={12} /><b>{s.to}</b>{s.arrive && ` ${s.arrive}`}<DayMark mark={s.mark} /></span>
          {s.what && <small>{s.what}</small>}
        </li>
      ) : (
        <li key={i} className="bk-stop"><Clock /><span>{s.time ? `${s.time} in ${s.airport}` : `Change in ${s.airport}`}</span></li>
      ))}
    </ol>
  )
}

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

export function BookedBox({ booking: b, data, changing, onChange, onEdit, onRemoved, ref }: {
  booking: Booking
  data: BoxData
  /** the days and the flights under the box are open */
  changing: boolean
  /** Change booking and Done. Left out where nothing under the box opens, a bus or a boat, and the button goes with it */
  onChange?: (on: boolean) => void
  /** opens the booking form filled from the row */
  onEdit?: () => void
  /** after the booking is cancelled, so the sheet can say so */
  onRemoved?: () => void
  ref?: Ref<HTMLElement>
}) {
  const id = useId()
  const head = boxHead(b, cityOf(data))
  const chips = boxChips(b)
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
    if (changing) onChange?.(false)
    patch(b.id, { status: 'cancelled' })
    onRemoved?.()
  }

  return (
    <section ref={ref} className="bk" aria-labelledby={`${id}-h`} tabIndex={-1}>
      <header className="bk-band">
        <Check s={18} />
        <h4 id={`${id}-h`}>Booked</h4>
        {head.day && <span>{head.day}</span>}
        {onEdit && <button type="button" className="bk-icon bk-edit" onClick={onEdit} aria-label="Edit" title="Edit"><Pencil s={16} /></button>}
      </header>

      <BoxRoute head={head} kind={b.kind} />

      {b.reference && (
        <div className="bk-ref">
          <div>
            <small id={`${id}-ref`}>Booking reference</small>
            <output className="bk-code" aria-labelledby={`${id}-ref`}>{b.reference}</output>
          </div>
          <button type="button" className="bk-icon" onClick={copy} aria-label="Copy the booking reference" title="Copy"><Copy s={16} /></button>
        </div>
      )}

      <div className="bk-body">
        <BoxChips chips={chips} />

        {segs.length > 0 && (
          <section className="bk-part" aria-labelledby={`${id}-segs`}>
            <h5 id={`${id}-segs`}>Flights</h5>
            <BoxSegs segs={segs} label="Flights" />
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
            {onChange && <button type="button" className="btn small" data-on={changing || undefined} onClick={() => onChange(!changing)}>{changing ? 'Done' : 'Change booking'}</button>}
            <button ref={remove} type="button" className="btn small danger bk-remove" onClick={() => setAsking(true)}>Remove booking</button>
          </div>
        )}
      </div>
    </section>
  )
}
