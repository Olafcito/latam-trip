import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type { Booking } from '../../data/types'
import { FILE_TYPES, attachFile, loadBookings, saveBookings } from '../../lib/bookings'
import { fileMessage } from '../../lib/bookedBox'
import { bookingLink, manualChange, stayPrompt, stayRow, type ManualStay, type StayTarget } from '../../lib/stayBooking'
import { useStore } from '../../store'
import { Caret, Check, Copy, Link, Pencil, Sparkles, Upload } from '../icons'

// Add booking confirmation, as the reference window draws it: three ways in, each a row, and under them the prompt
// that lets ChatGPT or Claude find the booking in the mail. A file is sent at once. A link and the details open a
// short form in the same window, with a way back. Whatever is given books the stay: the part's booking is made, or
// the one it has is changed, so the card turns green when the window closes.

type View = 'menu' | 'link' | 'manual'

/** The store learns of the change at once, so the card does not wait for the live channel. */
const refresh = () => loadBookings().then(useStore.getState().setBookings, () => {})

export function StayConfirm({ city, booking, target, close }: {
  city: string
  /** the booking the stay has, when it has one */
  booking: Booking | null
  target: StayTarget
  close: () => void
}) {
  const [view, setView] = useState<View>('menu')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [link, setLink] = useState(booking?.url ?? '')
  const out = booking?.check_out ?? null
  const [form, setForm] = useState<ManualStay>({
    reference: booking?.reference ?? '',
    price: booking?.price_dkk != null ? String(booking.price_dkk) : '',
    seller: booking?.seller ?? '',
    checkIn: booking?.check_in ?? target.first,
    checkOut: out ?? stayRowOut(target),
    cancelUntil: booking?.cancel_until ?? '',
  })
  const file = useRef<HTMLInputElement>(null)
  const first = useRef<HTMLInputElement>(null)
  const head = useRef<HTMLHeadingElement>(null)
  const timer = useRef<number>(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  useEffect(() => {
    if (view === 'menu') head.current?.focus({ preventScroll: true })
    else first.current?.focus({ preventScroll: true })
  }, [view])

  /** Books the stay with the change and hands back its id, or says why not. */
  const book = async (change: Partial<Booking>): Promise<string | null> => {
    if (booking && !Object.keys(change).length) return booking.id
    const r = await saveBookings([stayRow(booking, target, change)])
    if (!r.ok) {
      setSaid(r.message)
      return null
    }
    return r.ids[0]
  }

  const go = async (work: () => Promise<boolean>) => {
    if (busy) return
    setBusy(true)
    setSaid(null)
    const done = await work()
    setBusy(false)
    if (done) {
      await refresh()
      close()
    }
  }

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget
    const f = input.files?.[0] ?? null
    input.value = ''
    const problem = fileMessage(f)
    if (problem || !f) return setSaid(problem)
    void go(async () => {
      const id = await book({})
      if (!id) return false
      const a = await attachFile(id, f)
      if (!a.ok) {
        // the booking stands, the file did not go up, so the reason shows and the window stays
        await refresh()
        setSaid(`Booked, but ${f.name} was not added. ${a.message}`)
        return false
      }
      return true
    })
  }

  const onLink = (e: FormEvent) => {
    e.preventDefault()
    const url = bookingLink(link)
    if (!url) return setSaid('Paste a link that starts with https://')
    void go(async () => !!(await book({ url })))
  }

  const onManual = (e: FormEvent) => {
    e.preventDefault()
    const m = manualChange(form)
    if (!m.ok) return setSaid(m.message)
    void go(async () => !!(await book(m.change)))
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(stayPrompt(city))
      setCopied(true)
      setSaid(null)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setSaid('Copying did not work. Try again.')
    }
  }

  const set = (k: keyof ManualStay) => (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.currentTarget.value }))
  const back = () => { setSaid(null); setView('menu') }
  const title = view === 'link' ? 'Paste booking link' : view === 'manual' ? 'Enter manually' : 'Add booking confirmation'

  return (
    <div className="scw" aria-busy={busy || undefined}>
      <header className="scw-head">
        {view !== 'menu' && (
          <button type="button" className="scw-back" aria-label="Back" title="Back" onClick={back}><Caret dir="l" s={18} /></button>
        )}
        <h2 ref={head} tabIndex={-1}>{title}</h2>
      </header>

      {view === 'menu' && (
        <>
          <ul className="scw-ways">
            <li>
              <button type="button" className="scw-way" disabled={busy} onClick={() => file.current?.click()}>
                <span className="scw-i"><Upload s={20} /></span>
                <span className="scw-w"><b>Upload confirmation</b><small>PDF, screenshot or image</small></span>
                <Caret dir="r" s={18} />
              </button>
              <input ref={file} type="file" hidden accept={FILE_TYPES.join(',')} onChange={onFile} />
            </li>
            <li>
              <button type="button" className="scw-way" disabled={busy} onClick={() => { setSaid(null); setView('link') }}>
                <span className="scw-i"><Link s={20} /></span>
                <span className="scw-w"><b>Paste booking link</b><small>Add your reservation link (Booking.com, Hostelworld, etc.)</small></span>
                <Caret dir="r" s={18} />
              </button>
            </li>
            <li>
              <button type="button" className="scw-way" disabled={busy} onClick={() => { setSaid(null); setView('manual') }}>
                <span className="scw-i"><Pencil s={20} /></span>
                <span className="scw-w"><b>Enter manually</b><small>Add booking reference, price and other details</small></span>
                <Caret dir="r" s={18} />
              </button>
            </li>
          </ul>

          <section className="scw-ai" aria-label="Use with AI">
            <span className="scw-ai-i"><Sparkles s={20} /></span>
            <div>
              <h3>Use with AI</h3>
              <p>Let ChatGPT or Claude find your accommodation bookings in your email and add them to your trip.</p>
            </div>
            <button type="button" className="scw-copy" data-on={copied || undefined} onClick={copy}>
              {copied ? <Check s={14} /> : <Copy s={14} />}
              {copied ? 'Copied' : 'Copy prompt'}
            </button>
          </section>
        </>
      )}

      {view === 'link' && (
        <form className="scw-form" onSubmit={onLink}>
          <label className="fld">Booking link
            <input ref={first} type="url" inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://" value={link} onChange={(e) => setLink(e.currentTarget.value)} />
          </label>
          <button type="submit" className="btn primary wide" disabled={busy}>{busy ? 'Saving' : 'Save link'}</button>
        </form>
      )}

      {view === 'manual' && (
        <form className="scw-form" onSubmit={onManual}>
          <label className="fld">Booking reference
            <input ref={first} autoComplete="off" spellCheck={false} value={form.reference} onChange={set('reference')} />
          </label>
          <div className="scw-two">
            <label className="fld">Price in all, DKK
              <input inputMode="decimal" autoComplete="off" value={form.price} onChange={set('price')} />
            </label>
            <label className="fld">Booked with
              <input autoComplete="off" placeholder="Hostelworld" value={form.seller} onChange={set('seller')} />
            </label>
          </div>
          <div className="scw-two">
            <label className="fld">Check-in
              <input type="date" value={form.checkIn} onChange={set('checkIn')} />
            </label>
            <label className="fld">Check-out
              <input type="date" value={form.checkOut} onChange={set('checkOut')} />
            </label>
          </div>
          <label className="fld">Free cancellation until
            <input type="date" value={form.cancelUntil} onChange={set('cancelUntil')} />
          </label>
          <button type="submit" className="btn primary wide" disabled={busy}>{busy ? 'Saving' : 'Save booking'}</button>
        </form>
      )}

      {said && <p className="scw-said" role="alert">{said}</p>}
    </div>
  )
}

/** The morning after the part's last night. */
function stayRowOut(t: StayTarget): string {
  return stayRow(null, t, {}).check_out as string
}
