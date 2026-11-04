import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode, type Ref } from 'react'
import type { Booking, BookingFile, InOut, MapNode } from '../../data/types'
import { boxHead, boxRows, boxSegments, fileMessage, fileTile, flightHours, type BoxChip, type BoxHead, type BoxRow, type BoxSegment } from '../../lib/bookedBox'
import { attachFile, cancelBooking, fileUrl } from '../../lib/bookings'
import { hours, shortPlace } from '../../lib/format'
import { useStore } from '../../store'
import { Arrow, Bag, Boat, Bus, Check, Clock, Copy, Doc, External, Hash, Link, Pencil, Person, Plane, Plus, Rebook, Refund, Shop, Star, Suitcase, Ticket } from '../icons'

// The booking at the top of its sheet, read like a boarding pass: a small green mark that says Booked, the two
// codes large with the cities and the local times under them and the flight time on the line between, the
// flights inside with the time in each airport between, the reference on one row with a copy button, then the
// facts as one list of icon rows and Simon's own notes apart. It reads the booking row alone, so it is whole
// even when the leg has no picked flight. Change booking opens the days and the flights under it to look at.
// Remove asks once, here in the box, and sets the booking to cancelled.

export interface BoxData {
  inout: Pick<InOut, 'airports'>
  map: { nodes: readonly Pick<MapNode, 'iata' | 'name' | 'country'>[] }
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

/**
 * The UTC offset of an airport code: its own from the long-haul airports, else that of another airport in the
 * same country, found through the map place that carries the code. null when neither is known.
 */
export function offsetOf(data: BoxData) {
  return (code: string): number | null => {
    const own = data.inout.airports[code]?.utc_offset
    if (typeof own === 'number') return own
    const country = data.map.nodes.find((n) => n.iata === code)?.country
    if (!country) return null
    const near = Object.values(data.inout.airports).find((a) => a.country === country && typeof a.utc_offset === 'number')
    return near ? near.utc_offset : null
  }
}

/** A web address the box may link to. Anything else, a javascript: one too, gives no link. */
const safeUrl = (u: string | null) => (u && /^https?:\/\//i.test(u.trim()) ? u.trim() : null)

/** The mark of a later day: seen as a small +1, heard as words. */
function DayMark({ mark }: { mark: string }) {
  if (!mark) return null
  return <><sup aria-hidden="true">{mark}</sup><span className="vh">, {mark} day</span></>
}

/** A local time with its small mark, so the time is read as the airport's own. */
function Local({ time, mark }: { time: string; mark?: string }) {
  return <span className="bk-time">{time}<DayMark mark={mark ?? ''} /><i aria-hidden="true">local</i><span className="vh"> local time</span></span>
}

/**
 * The two codes large with the cities under them and the local times, as on a boarding pass. The line between is
 * the way it goes, with the time it takes over it when both ends know their clock.
 */
export function BoxRoute({ head, kind, took }: { head: BoxHead; kind?: string | null; took?: number | null }) {
  const Way = kind === 'bus' ? Bus : kind === 'boat' ? Boat : Plane
  const span = hours(took)
  return (
    <div className="bk-route" data-kind={kind && kind !== 'flight' ? kind : undefined}>
      <div className="bk-end">
        <b>{head.from.code || 'From'}</b>
        {head.from.city && <small title={head.from.city}>{head.from.city}</small>}
        {head.from.time && <Local time={head.from.time} />}
      </div>
      <span className="bk-fly">
        {span && <small><span className="vh">Takes </span>{span}</small>}
        <span className="bk-line" aria-hidden="true"><Way s={22} /></span>
      </span>
      <div className="bk-end to">
        <b>{head.to.code || 'To'}</b>
        {head.to.city && <small title={head.to.city}>{head.to.city}</small>}
        {head.to.time && <Local time={head.to.time} mark={head.to.mark} />}
      </div>
    </div>
  )
}

/** A copy button that turns into a check for a moment once the text is on the clipboard. */
function CopyButton({ text, label, onDone }: { text: string; label: string; onDone: (ok: boolean) => void }) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const t = window.setTimeout(() => setDone(false), 1500)
    return () => window.clearTimeout(t)
  }, [done])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
      onDone(true)
    } catch {
      onDone(false)
    }
  }
  return (
    <button type="button" className="bk-icon bk-copy" data-done={done || undefined} onClick={copy} aria-label={label} title="Copy">
      <span aria-hidden="true"><Copy s={16} /></span>
      <span aria-hidden="true"><Check s={16} /></span>
    </button>
  )
}

const ROW_ICON: Record<BoxRow['key'], (p: { s?: number }) => ReactNode> = {
  seller: Shop, paid: Ticket, ticket: Link, fare: Star, cabin: Bag, checked: Suitcase, refundable: Refund, changeable: Rebook, travellers: Person,
}

/** The facts as one grouped list of icon rows: the label at the left, the value at the right with what it covers under it. */
export function BoxRows({ rows, onCopied }: { rows: BoxRow[]; onCopied?: (what: string, ok: boolean) => void }) {
  if (!rows.length) return null
  return (
    <ul className="bk-rows">
      {rows.map((r, i) => {
        const Icon = ROW_ICON[r.key]
        return (
          <li key={`${r.key}-${i}`} data-k={r.key}>
            <span className="bk-row-i" aria-hidden="true"><Icon s={16} /></span>
            <span className="bk-row-l">{r.label}</span>
            <span className="bk-row-v">
              <span>{r.value}</span>
              {r.more?.map((m) => <small key={m}>{m}</small>)}
              {r.mono && (
                <span className="bk-row-code">
                  <code className="bk-code">{r.mono}</code>
                  {onCopied && <CopyButton text={r.mono} label={`Copy the number from ${r.value}`} onDone={(ok) => onCopied('Number', ok)} />}
                </span>
              )}
            </span>
          </li>
        )
      })}
    </ul>
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
  const bookings = useStore((st) => st.bookings)
  const rows = boxRows(b, bookings)
  const segs = boxSegments(b, { single: true })
  const took = flightHours(b, offsetOf(data))
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

  const copied = (what: string, ok: boolean) =>
    setSaid(ok ? { text: `${what} copied.` } : { text: `Copying did not work. Select the ${what.toLowerCase()} and copy it by hand.`, bad: true })

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
      <header className="bk-mark">
        <span className="bk-tick" aria-hidden="true"><Check s={13} /></span>
        <h4 id={`${id}-h`}>Booked</h4>
        {head.day && <span>{head.day}</span>}
        {onEdit && <button type="button" className="bk-icon bk-edit" onClick={onEdit} aria-label="Edit the booking" title="Edit"><Pencil s={16} /></button>}
      </header>

      <BoxRoute head={head} kind={b.kind} took={took} />

      <div className="bk-body">
        <BoxSegs segs={segs} label={b.kind === 'flight' ? 'Flights' : 'Legs'} />

        {b.reference && (
          <div className="bk-refrow">
            <span className="bk-row-i" aria-hidden="true"><Hash s={16} /></span>
            <span className="bk-row-l" id={`${id}-ref`}>Reference</span>
            <code className="bk-code" aria-labelledby={`${id}-ref`}>{b.reference}</code>
            <CopyButton text={b.reference} label="Copy the booking reference" onDone={(ok) => copied('Reference', ok)} />
          </div>
        )}

        <BoxRows rows={rows} onCopied={copied} />

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
            <h5 id={`${id}-notes`}>Your notes</h5>
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
