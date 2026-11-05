import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import type { Booking, BookingFile, CrawledFlight, InOut, Way } from '../../data/types'
import { boxChips, boxHead, boxSegments, fileMessage, type BoxHead } from '../../lib/bookedBox'
import { formRows, fromPicked, fromRow, manualRows, readKr, rowsOf, savedRow, withIds, type BookingFields, type DraftLeg } from '../../lib/bookingDraft'
import { attachFile } from '../../lib/bookings'
import { weekdayDay } from '../../lib/format'
import type { ReadDraft } from '../../lib/readBooking'
import { useStore } from '../../store'
import { Bag, Calendar, Check, Close, Doc, Hash, Link, Note, Plus, Rebook, Refund, Shop, Star, Suitcase, Ticket } from '../icons'
import { BoxChips, BoxRoute, BoxSegs, cityOf, type BoxData } from './BookedBox'

// The booking form, in place of the sheet it opens from. Two ways in, one segmented control: Picked
// flight shows the booking the picked flight or way would make, as the booked box would show it, with
// one field for the reference, so adding it takes two taps. Fill in yourself is a grouped list of the
// fields, each with its icon, none required and no day, since the leg has its day. A booking read from
// its confirmation opens Fill in yourself filled in, with its files ready to attach and the fields the
// confirmation did not hold tinted amber. Edit opens Fill in yourself filled from the booked rows, and a
// flight picked after Change booking opens Picked flight on the booking it changes.

export type SaveResult = { ok: true; ids: string[] } | { ok: false; message: string }
export type Start = 'picked' | 'manual'

/** The leg with the names of its two ends. */
export interface FormLeg extends DraftLeg {
  fromName: string
  toName: string
}

/** What a sheet gives the form: the leg, what to read, and how a save pins the leg. */
export interface BookTarget<P> {
  leg: FormLeg
  inout: Pick<InOut, 'tickets' | 'ways'>
  data: BoxData
  tripId: string
  tripVersion: number | null
  /** saves the rows and pins the leg on them, with the pick they came from when there is one */
  save: (rows: Partial<Booking>[], pin?: P) => Promise<SaveResult>
}

/** How the form opens. */
export interface FormOpen<P> {
  start: Start
  /** the flight or way the leg has, or the one picked after Change booking */
  picked?: CrawledFlight | Way | null
  /** what the leg is pinned to on a save from the picked flight */
  pin?: P
  /** the booking it edits, or the one a rebook changes */
  booking?: Booking | null
  /** the ids of the booked rows the picked rows write over, by place */
  ids?: (n: number) => (string | undefined)[]
  edit?: boolean
  /** a booking read from its confirmation: its rows, its fields, what it did not hold, and the files it was read from */
  read?: ReadDraft & { files: File[] }
}

/** The form for a sheet: open() puts it in place of the sheet, node is what the sheet shows then, and after runs once the sheet is back. */
export function useBookingForm<P>(target: BookTarget<P> | undefined, after?: (saved: boolean) => void) {
  const [o, setO] = useState<FormOpen<P> | null>(null)
  const [back, setBack] = useState<boolean | null>(null)
  // the sheet is in the page again only after the render that drops the form, so the focus waits for it
  useEffect(() => {
    if (back === null || o) return
    setBack(null)
    after?.(back)
  })
  const node = o && target ? <BookingForm target={target} open={o} onDone={(saved) => { setO(null); setBack(saved) }} /> : null
  return { open: (x: FormOpen<P>) => setO(x), node }
}

const TABS: [Start, string][] = [['picked', 'Picked flight'], ['manual', 'Fill in yourself']]
const REFUND: [NonNullable<BookingFields['refundable']>, string][] = [['yes', 'Yes'], ['partly', 'Partly'], ['no', 'No']]
const CHANGE: [NonNullable<BookingFields['changeable']>, string][] = [['yes', 'Yes'], ['fee', 'For a fee'], ['no', 'No']]
const FACTS = ['seller', 'url', 'price', 'cabin_bag', 'checked_bag'] as const

/** The arrows, Home and End move along a segmented control, as in the sort of the flight sheet. */
function arrow(e: KeyboardEvent, i: number, n: number): number {
  const to = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % n
    : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + n) % n
      : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1
  if (to >= 0) e.preventDefault()
  return to
}

/** One choice of a few. The arrows move it. A press on the chosen one clears it when clear is set, since none is an answer too. */
function Seg<T extends string>({ label, value, options, onChange, clear, className }: {
  label: string; value: T | ''; options: [T, string][]; onChange: (v: T | '') => void; clear?: boolean; className?: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const at = options.findIndex(([k]) => k === value)
  const onKey = (e: KeyboardEvent) => {
    const to = arrow(e, Math.max(at, 0), options.length)
    if (to < 0) return
    onChange(options[to][0])
    refs.current[to]?.focus()
  }
  return (
    <div className={`seg${className ? ` ${className}` : ''}`} role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {options.map(([k, text], i) => (
        <button
          key={k} ref={(el) => { refs.current[i] = el }} type="button" role="radio" aria-checked={value === k}
          tabIndex={value === k || (at < 0 && i === 0) ? 0 : -1}
          onClick={() => onChange(clear && value === k ? '' : k)}
        >{text}</button>
      ))}
    </div>
  )
}

const NOT_READ = 'Not in the confirmation'

/** A row of the grouped list: the icon, the name of the field, and the field. One the confirmation did not hold is tinted, and its name says so. */
function Row({ icon, label, htmlFor, children, sub, missing }: { icon: ReactNode; label: string; htmlFor?: string; children: ReactNode; sub?: boolean; missing?: boolean }) {
  const words = <>{label}{missing && <span className="vh">, {NOT_READ.toLowerCase()}</span>}</>
  const name = htmlFor ? <label className="bf-k" htmlFor={htmlFor}>{words}</label> : <span className="bf-k">{words}</span>
  return (
    <li className="bf-row" data-sub={sub || undefined} data-missing={missing || undefined} title={missing ? NOT_READ : undefined}>
      <span className="bf-i" aria-hidden="true">{icon}</span>{name}<span className="bf-v">{children}</span>
    </li>
  )
}

/** The head of a leg with no airport codes, a bus or a boat: the names large in place of the codes. */
function namedHead(leg: FormLeg, row: Partial<Booking>, city: (code: string) => string | null): BoxHead {
  const h = boxHead(savedRow(row, 'draft'), city)
  if (leg.kind === 'flight') return h
  return { ...h, from: { ...h.from, code: leg.fromName, city: null }, to: { ...h.to, code: leg.toName, city: null } }
}

/** The rows as they would be booked, read like the booked box. Two rows of one ticket show both ways. */
function Pass({ leg, rows, data }: { leg: FormLeg; rows: Partial<Booking>[]; data: BoxData }) {
  const city = cityOf(data)
  const first = savedRow(rows[0], 'draft')
  return (
    <div className="bk bf-pass">
      {rows.map((r, k) => {
        const b = savedRow(r, `draft-${k}`)
        const segs = boxSegments(b)
        return (
          <div key={k} className="bf-leg">
            {b.depart && <span className="bf-day"><Calendar s={12} />{weekdayDay(b.depart)}</span>}
            <BoxRoute head={namedHead(leg, r, city)} kind={b.kind} />
            {segs.length > 0 && <div className="bf-segs"><BoxSegs segs={segs} label="Flights" /></div>}
          </div>
        )
      })}
      <BoxChips chips={boxChips(first)} />
    </div>
  )
}

/** The facts the picked rows hold, as the form shows them. */
const factsOf = (r: Partial<Booking> | undefined): BookingFields => {
  if (!r) return {}
  const all = fromRow(r)
  return Object.fromEntries(FACTS.map((k) => [k, all[k] ?? ''])) as BookingFields
}

/** The form without its day, since the leg holds the day and a booked leg keeps it. */
const noDay = ({ day: _d, ...rest }: BookingFields): BookingFields => rest

/** The until days go when the answer they belong to does not hold one. */
function cleaned(f: BookingFields): BookingFields {
  const out = noDay(f)
  if (f.refundable !== 'yes' && f.refundable !== 'partly') out.cancel_until = ''
  if (f.changeable !== 'yes' && f.changeable !== 'fee') out.change_until = ''
  return out
}

export function BookingForm<P>({ target, open, onDone }: { target: BookTarget<P>; open: FormOpen<P>; onDone: (saved: boolean) => void }) {
  const { leg, inout, data } = target
  const id = useId()
  const bookings = useStore((s) => s.bookings)
  const edit = !!open.edit && !!open.booking
  const rebook = !edit && !!open.booking
  // made once, since a shared ticket gets a new ticket id each time
  const [picked] = useState(() => {
    if (!open.picked) return null
    const rows = fromPicked(leg, open.picked, inout)
    return rebook ? withIds(rows, open.ids?.(rows.length) ?? [open.booking!.id]) : rows
  })
  const [existing] = useState(() => (open.booking ? rowsOf(bookings, open.booking) : []))
  const read = edit ? undefined : open.read
  const tabs = TABS.filter(([k]) => k !== 'picked' || (picked && !read))
  const [tab, setTab] = useState<Start>(() => (edit ? 'manual' : tabs.some(([k]) => k === open.start) ? open.start : 'manual'))
  const [form, setForm] = useState<BookingFields>(() => {
    const was = existing[0] ?? open.booking
    // the reference and the fare are the opened row's own, so a second flight of a ticket keeps its airline reference
    if (edit && was) {
      const own = fromRow(open.booking!)
      return { ...noDay(fromRow(was)), reference: own.reference, fare: own.fare }
    }
    if (rebook && was) return { ...noDay(fromRow(was)), ...factsOf(picked?.[0]) }
    // a read fills what the confirmation held. Fill in yourself starts from the pick, so its seller, link, price and bags are there to edit
    return { reference: '', ...factsOf(picked?.[0]), ...noDay(read?.fields ?? {}) }
  })
  const [files, setFiles] = useState<File[]>(() => read?.files ?? [])
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ text: string; bad?: boolean } | null>(null)
  // a save that went but left a file behind: the rows are booked now, so a second save changes them
  const [savedIds, setSavedIds] = useState<string[] | null>(null)
  const first = useRef<HTMLInputElement | null>(null)
  const price = useRef<HTMLInputElement>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  // with a mouse the field you write in first takes the focus, on open and on each change of tab. On a phone it
  // waits for a tap, so the keyboard does not cover the booking before it is read
  useEffect(() => {
    if (window.matchMedia?.('(pointer: fine)').matches) first.current?.focus({ preventScroll: true })
  }, [tab])

  const set = <K extends keyof BookingFields>(k: K) => (v: BookingFields[K]) => setForm((f) => ({ ...f, [k]: v }))
  const typed = (k: keyof BookingFields) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k)(e.currentTarget.value as never)

  const base = (): Partial<Booking>[] => {
    if (edit) return existing.map((b) => ({ id: b.id }))
    if ((tab === 'picked' || rebook) && picked) return picked
    if (read) return read.rows
    return manualRows(leg, picked)
  }

  const addFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget
    const chosen = [...(input.files ?? [])]
    input.value = ''
    const bad = chosen.map((f) => fileMessage(f)).find(Boolean)
    const good = chosen.filter((f) => !fileMessage(f))
    setFiles((now) => [...now, ...good.filter((f) => !now.some((x) => x.name === f.name))])
    setSaid(bad ? { text: bad, bad: true } : null)
  }

  const save = async (e?: FormEvent) => {
    e?.preventDefault()
    if (busy) return
    const full = tab === 'manual' || edit
    if (full && Number.isNaN(readKr(form.price))) {
      setSaid({ text: 'Write the price as a number of kroner.', bad: true })
      price.current?.focus()
      return
    }
    const fields = full ? cleaned(form) : { reference: form.reference ?? '' }
    let rows = formRows(base(), fields, { edit: edit || rebook || !!savedIds, own: edit ? open.booking!.id : undefined, hadMail: existing.some((r) => !!r.mail_url?.trim()) })
    if (savedIds) rows = withIds(rows, savedIds)
    setBusy(true)
    setSaid(null)
    const r = await target.save(rows, (tab === 'picked' || rebook) && picked ? open.pin : undefined)
    if (!r.ok) {
      setBusy(false)
      return setSaid({ text: r.message, bad: true })
    }
    const left: File[] = []
    const added: BookingFile[] = []
    let why = ''
    for (const f of full ? files : []) {
      const a = await attachFile(r.ids[0], f)
      if (a.ok) added.push(a.attachment)
      else {
        left.push(f)
        why ||= `${f.name}: ${a.message}`
      }
    }
    if (added.length) {
      const now = useStore.getState().bookings.find((b) => b.id === r.ids[0])?.attachments ?? []
      useStore.getState().patchBooking(r.ids[0], { attachments: now.filter((x) => !added.some((a) => a.path === x.path)).concat(added) })
    }
    setBusy(false)
    if (!left.length) return onDone(true)
    setSavedIds(r.ids)
    setFiles(left)
    setSaid({ text: `Booked. ${why}`, bad: true })
  }

  const onTabKey = (e: KeyboardEvent) => {
    const i = tabs.findIndex(([k]) => k === tab)
    const to = arrow(e, i, tabs.length)
    if (to < 0) return
    setTab(tabs[to][0])
    tabRefs.current[to]?.focus()
  }

  // Fill in yourself shows the booking as it is typed, so a price or a bag written in shows on the ticket
  const typedIn = Number.isNaN(readKr(form.price)) ? { ...cleaned(form), price: '' } : cleaned(form)
  const pass = tab === 'manual' ? (edit ? existing : formRows(base(), typedIn)) : picked ?? base()
  const refundUntil = form.refundable === 'yes' || form.refundable === 'partly'
  const changeUntil = form.changeable === 'yes' || form.changeable === 'fee'
  // a field the read did not find stays tinted until something is written in it
  const miss = (k: keyof BookingFields) => !!read?.missing.includes(k) && !form[k]

  return (
    <form className="fl bf" aria-labelledby={`${id}-h`} onSubmit={save} noValidate>
      <div className="fl-top bf-top">
        <header className="fl-h">
          <h3 id={`${id}-h`}>{edit ? 'Edit' : 'Add booking'}</h3>
        </header>
        {!edit && tabs.length > 1 && (
          <div className="seg bf-tabs" role="radiogroup" aria-label="How to mark it" onKeyDown={onTabKey}>
            {tabs.map(([k, label], i) => (
              <button key={k} ref={(el) => { tabRefs.current[i] = el }} type="button" role="radio" aria-checked={tab === k} tabIndex={tab === k ? 0 : -1} onClick={() => setTab(k)}>{label}</button>
            ))}
          </div>
        )}
      </div>

      <div className="bf-body">
        {pass.length > 0 && (tab === 'picked' || !edit) && <Pass leg={leg} rows={pass} data={data} />}

        {tab === 'picked' && (
          <ul className="bf-list">
            <Row icon={<Hash s={16} />} label="Booking reference" htmlFor={`${id}-ref`}>
              <input
                ref={(el) => { first.current = el }} id={`${id}-ref`} name="reference" className="bf-in bf-code" value={form.reference ?? ''} onChange={typed('reference')}
                autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false} enterKeyHint="done" placeholder="ABC123"
              />
            </Row>
          </ul>
        )}

        {tab === 'manual' && (
          <>
            <ul className="bf-list">
              <Row icon={<Hash s={16} />} label="Booking reference" htmlFor={`${id}-ref`} missing={miss('reference')}>
                <input
                  ref={(el) => { first.current = el }} id={`${id}-ref`} name="reference" className="bf-in bf-code" value={form.reference ?? ''} onChange={typed('reference')}
                  autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false} placeholder="ABC123"
                />
              </Row>
              <Row icon={<Shop s={16} />} label="Seller" missing={miss('seller')} htmlFor={`${id}-seller`}>
                <input id={`${id}-seller`} name="seller" className="bf-in" value={form.seller ?? ''} onChange={typed('seller')} autoComplete="off" placeholder="Airline or site…" />
              </Row>
              <Row icon={<Hash s={16} />} label="Seller's number" missing={miss('seller_reference')} htmlFor={`${id}-sref`} sub>
                <input
                  id={`${id}-sref`} name="seller_reference" className="bf-in bf-code" value={form.seller_reference ?? ''} onChange={typed('seller_reference')}
                  autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false} placeholder="Order number"
                />
              </Row>
              <Row icon={<Star s={16} />} label="Fare" missing={miss('fare')} htmlFor={`${id}-fare`}>
                <input id={`${id}-fare`} name="fare" className="bf-in" value={form.fare ?? ''} onChange={typed('fare')} autoComplete="off" placeholder="Light, Classic" />
              </Row>
              <Row icon={<Ticket s={16} />} label="Price" missing={miss('price')} htmlFor={`${id}-price`}>
                <span className="bf-kr">
                  <input
                    ref={price} id={`${id}-price`} name="price" className="bf-in" value={form.price ?? ''} onChange={typed('price')} inputMode="decimal" autoComplete="off"
                    aria-invalid={Number.isNaN(readKr(form.price)) || undefined}
                  />
                  <span aria-hidden="true">kr</span>
                </span>
              </Row>
            </ul>

            <ul className="bf-list">
              <Row icon={<Refund s={16} />} label="Refundable" missing={miss('refundable')}>
                <Seg label="Refundable" value={form.refundable ?? ''} options={REFUND} onChange={set('refundable')} clear />
              </Row>
              {refundUntil && (
                <Row icon={<Calendar s={16} />} label="Until" htmlFor={`${id}-cancel`} sub missing={miss('cancel_until')}>
                  <input id={`${id}-cancel`} name="cancel_until" className="bf-in" type="date" value={form.cancel_until ?? ''} onChange={typed('cancel_until')} max={leg.day} />
                </Row>
              )}
              <Row icon={<Rebook s={16} />} label="Changeable" missing={miss('changeable')}>
                <Seg label="Changeable" value={form.changeable ?? ''} options={CHANGE} onChange={set('changeable')} clear />
              </Row>
              {changeUntil && (
                <Row icon={<Calendar s={16} />} label="Until" htmlFor={`${id}-change`} sub missing={miss('change_until')}>
                  <input id={`${id}-change`} name="change_until" className="bf-in" type="date" value={form.change_until ?? ''} onChange={typed('change_until')} max={leg.day} />
                </Row>
              )}
            </ul>

            <ul className="bf-list">
              <Row icon={<Bag s={16} />} label="Cabin bag" missing={miss('cabin_bag')} htmlFor={`${id}-cabin`}>
                <input id={`${id}-cabin`} name="cabin_bag" className="bf-in" value={form.cabin_bag ?? ''} onChange={typed('cabin_bag')} autoComplete="off" placeholder="Included" />
              </Row>
              <Row icon={<Suitcase s={16} />} label="Checked bag" missing={miss('checked_bag')} htmlFor={`${id}-checked`}>
                <input id={`${id}-checked`} name="checked_bag" className="bf-in" value={form.checked_bag ?? ''} onChange={typed('checked_bag')} autoComplete="off" placeholder="1 x 23 kg" />
              </Row>
            </ul>

            <ul className="bf-list">
              <Row icon={<Link s={16} />} label="Link" missing={miss('url')} htmlFor={`${id}-url`}>
                <input id={`${id}-url`} name="url" className="bf-in" type="url" inputMode="url" value={form.url ?? ''} onChange={typed('url')} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="https://" />
              </Row>
              <Row icon={<Link s={16} />} label="Confirmation mail" missing={miss('mail_url')} htmlFor={`${id}-mail`}>
                <input id={`${id}-mail`} name="mail_url" className="bf-in" type="url" inputMode="url" value={form.mail_url ?? ''} onChange={typed('mail_url')} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="https://mail.google.com/..." />
              </Row>
              <li className="bf-row bf-notes">
                <span className="bf-i" aria-hidden="true"><Note s={16} /></span>
                <label className="bf-k" htmlFor={`${id}-notes`}>Notes</label>
                <textarea id={`${id}-notes`} name="notes" className="bf-in" rows={3} value={form.notes ?? ''} onChange={typed('notes')} />
              </li>
            </ul>

            <div className="bf-files">
              <ul className="bf-chips" aria-label="Files to add">
                {files.map((f) => (
                  <li key={f.name} className="bk-chip">
                    <Doc s={14} />
                    <span title={f.name}>{f.name}</span>
                    <button type="button" className="bf-x" aria-label={`Leave out ${f.name}`} title="Leave out" onClick={() => setFiles((now) => now.filter((x) => x !== f))}><Close /></button>
                  </li>
                ))}
                <li>
                  <label className="bf-add">
                    <input type="file" name="files" multiple accept="application/pdf,image/*" onChange={addFiles} aria-label="Add files, PDF or photo, up to 10 MB" />
                    <Plus /><span aria-hidden="true">Files</span>
                  </label>
                </li>
              </ul>
            </div>
          </>
        )}
      </div>

      <footer className="fl-foot bf-foot">
        <p className="bf-said" role="status" data-bad={said?.bad || undefined}>{said?.text}</p>
        <button type="button" className="btn small" onClick={() => onDone(false)} disabled={busy}>Cancel</button>
        <button type="submit" className="btn small bf-go" disabled={busy}><Check s={14} />{busy ? 'Saving' : edit ? 'Save' : 'Add'}</button>
      </footer>
    </form>
  )
}
