import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type InputHTMLAttributes } from 'react'
import type { Booking, Lodging, LodgingSite } from '../../data/types'
import { FILE_TYPES, loadBookings } from '../../lib/bookings'
import { fileMessage } from '../../lib/bookedBox'
import { loadLodgings } from '../../lib/lodgings'
import { isTileLogo, sellerLogo } from '../../lib/purchase'
import { readStay } from '../../lib/readStay'
import { stayFormOf, stayPrompt, type StayForm, type StayFormKey, type StayTarget } from '../../lib/stayBooking'
import { addressField, newProgress, pastedLink, saveStay } from '../../lib/stayConfirm'
import { useStore } from '../../store'
import { Caret, Check, Copy, Doc, House, Link, More, Paperclip, Pencil, Sparkles } from '../icons'

// Add booking confirmation, as the reference window draws it: three ways in, each a row, and under them the prompt
// that lets ChatGPT or Claude find the booking in the mail. Every way ends in the same review: a file is read first,
// a link and Enter manually open it at once. What the confirmation did not state is amber. Nothing is saved until
// Save, which books the stay, attaches the file and gives the place its address when it had none.

type View = 'menu' | 'reading' | 'link' | 'review'

const TITLE: Record<View, string> = {
  menu: 'Add booking confirmation', reading: 'Reading confirmation', link: 'Paste booking link', review: 'Review booking',
}

/** The store learns of the change at once, so the card does not wait for the live channel. */
const refresh = () => loadBookings().then(useStore.getState().setBookings, () => {})

export function StayConfirm({ city, booking, target, lodging, close }: {
  city: string
  /** the booking the stay has, when it has one */
  booking: Booking | null
  target: StayTarget
  /** the place of the stay, whose address the confirmation can fill */
  lodging: Pick<Lodging, 'id' | 'address'> | null
  close: () => void
}) {
  const [view, setView] = useState<View>('menu')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [link, setLink] = useState('')
  const [form, setForm] = useState<StayForm>(() => stayFormOf(target, booking))
  const [missing, setMissing] = useState<ReadonlySet<StayFormKey>>(new Set())
  const [file, setFile] = useState<File | null>(null)
  const [pasted, setPasted] = useState<string | null>(null)
  const progress = useRef(newProgress())
  const reading = useRef(0)
  const picker = useRef<HTMLInputElement>(null)
  const linkField = useRef<HTMLInputElement>(null)
  const head = useRef<HTMLHeadingElement>(null)
  const timer = useRef<number>(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  useEffect(() => {
    if (view === 'link') linkField.current?.focus({ preventScroll: true })
    else head.current?.focus({ preventScroll: true })
  }, [view])

  /** Opens the review on a form, the fields it names amber. */
  const review = (f: StayForm, notFound: StayFormKey[] = []) => {
    setForm(f)
    setMissing(new Set(notFound))
    setView('review')
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget
    const f = input.files?.[0] ?? null
    input.value = ''
    const problem = fileMessage(f)
    if (problem || !f) return setSaid(problem)
    setSaid(null)
    setFile(f)
    setPasted(null)
    setView('reading')
    const token = ++reading.current
    const base = stayFormOf(target, booking)
    const r = await readStay(target, city, [f], '', base).catch(() => ({ ok: false as const, message: 'The file could not be read.' }))
    if (token !== reading.current) return
    if (r.ok) return review(r.form, r.missing)
    setSaid(r.message)
    review(base)
  }

  const onLink = (e: FormEvent) => {
    e.preventDefault()
    const p = pastedLink(link)
    if (!p) return setSaid('Paste a link that starts with http')
    setSaid(null)
    setFile(null)
    const base = stayFormOf(target, booking)
    if ('mailUrl' in p) {
      setPasted(null)
      review({ ...base, mailUrl: p.mailUrl })
    } else {
      setPasted(p.url)
      review(base)
    }
  }

  const onManual = () => {
    setSaid(null)
    setFile(null)
    setPasted(null)
    review(stayFormOf(target, booking))
  }

  const onSave = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setSaid(null)
    const r = await saveStay({ booking, target, form, file, url: pasted, lodging, progress: progress.current })
    setBusy(false)
    if (!r.ok) {
      // a step after the booking failed: the card shows the booking, and the reason shows here
      if (progress.current.id) await refresh()
      return setSaid(r.message)
    }
    if (r.addressSet) await loadLodgings().then(useStore.getState().setLodgings, () => {})
    await refresh()
    close()
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

  const change = (k: StayFormKey, v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    if (missing.has(k)) setMissing((m) => { const n = new Set(m); n.delete(k); return n })
  }
  const back = () => {
    reading.current++
    setSaid(null)
    setView('menu')
  }

  return (
    <div className="scw" aria-busy={busy || view === 'reading' || undefined} data-view={view}>
      <header className="scw-head">
        {view !== 'menu' && (
          <button type="button" className="scw-back" aria-label="Back" title="Back" onClick={back}><Caret dir="l" s={18} /></button>
        )}
        <h2 ref={head} tabIndex={-1}>{TITLE[view]}</h2>
      </header>

      {view === 'menu' && (
        <>
          <ul className="scw-ways">
            <li>
              <button type="button" className="scw-way" onClick={() => picker.current?.click()}>
                <span className="scw-i"><Paperclip s={22} /></span>
                <span className="scw-w"><b>Upload confirmation</b><small>PDF, screenshot or image</small></span>
                <Caret dir="r" s={18} />
              </button>
              <input ref={picker} type="file" hidden accept={FILE_TYPES.join(',')} onChange={onFile} />
            </li>
            <li>
              <button type="button" className="scw-way" onClick={() => { setSaid(null); setView('link') }}>
                <span className="scw-i"><Link s={22} /></span>
                <span className="scw-w"><b>Paste booking link</b><small>Add your reservation link (Booking.com, Hostelworld, etc.)</small></span>
                <Caret dir="r" s={18} />
              </button>
            </li>
            <li>
              <button type="button" className="scw-way" onClick={onManual}>
                <span className="scw-i"><Pencil s={22} /></span>
                <span className="scw-w"><b>Enter manually</b><small>Add booking reference, price and other details</small></span>
                <Caret dir="r" s={18} />
              </button>
            </li>
          </ul>

          <section className="scw-ai" aria-label="Use with AI">
            <span className="scw-ai-i"><Sparkles s={22} /></span>
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

      {view === 'reading' && file && (
        <div className="scw-reading" role="status">
          <span className="scw-src"><Doc s={16} /><span>{file.name}</span></span>
          <span className="scw-bar" aria-hidden="true" />
          <span className="vh">Reading the confirmation</span>
        </div>
      )}

      {view === 'link' && (
        <form className="scw-form" onSubmit={onLink}>
          <label className="fld">Booking link or mail link
            <input ref={linkField} type="url" inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://" value={link} onChange={(e) => setLink(e.currentTarget.value)} />
          </label>
          <button type="submit" className="btn primary wide">Continue</button>
        </form>
      )}

      {view === 'review' && (
        <StayReview
          form={form} missing={missing} lodgingAddress={lodging?.address ?? null}
          source={file ? { kind: 'file', name: file.name } : pasted ? { kind: 'link', name: pasted } : null}
          busy={busy} said={said} onChange={change} onSave={onSave}
        />
      )}

      {said && view !== 'review' && <p className="scw-said" role="alert">{said}</p>}
    </div>
  )
}

const PROVIDERS: { site: LodgingSite; name: string }[] = [
  { site: 'booking', name: 'Booking.com' },
  { site: 'hostelworld', name: 'Hostelworld' },
  { site: 'airbnb', name: 'Airbnb' },
  { site: 'own', name: 'Own site' },
  { site: 'other', name: 'Other' },
]

function ProviderFace({ site, name }: { site: LodgingSite; name: string }) {
  const [broken, setBroken] = useState(false)
  const logo = site === 'own' || site === 'other' ? null : sellerLogo(name)
  if (logo && !broken) return <span className="ac-logo" data-tile={isTileLogo(logo) || undefined}><img src={logo} alt="" onError={() => setBroken(true)} /></span>
  return site === 'other' ? <More s={18} /> : site === 'own' ? <House s={18} /> : <span className="scw-pname">{name}</span>
}

export interface StayReviewProps {
  form: StayForm
  /** the fields the confirmation did not state */
  missing: ReadonlySet<StayFormKey>
  lodgingAddress: string | null
  /** what Save keeps with the booking: the file read, or the booking page pasted */
  source: { kind: 'file' | 'link'; name: string } | null
  busy: boolean
  said: string | null
  onChange: (k: StayFormKey, v: string) => void
  onSave: (e: FormEvent) => void
}

/** The review of a stay confirmation: every field Save keeps, the ones not found amber. */
export function StayReview({ form, missing, lodgingAddress, source, busy, said, onChange, onSave }: StayReviewProps) {
  const miss = (k: StayFormKey) => missing.has(k) || undefined
  const field = (k: StayFormKey, label: string, input: InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="fld" data-miss={miss(k)}>
      <span>{label}{missing.has(k) && <span className="vh">, not on the confirmation</span>}</span>
      <input autoComplete="off" spellCheck={false} value={form[k]} onChange={(e) => onChange(k, e.currentTarget.value)} {...input} />
    </label>
  )
  const currency = form.currency.trim().toUpperCase()
  const chosen = PROVIDERS.find((p) => p.site === form.provider)
  const address = addressField(lodgingAddress, form.address)

  return (
    <form className="scw-form scw-review" onSubmit={onSave} noValidate>
      {source && (
        <p className="scw-src" title={source.name}>
          {source.kind === 'file' ? <Doc s={16} /> : <Link s={16} />}
          <span>{source.name}</span>
        </p>
      )}

      <div className="fld scw-prov" data-miss={miss('provider')} role="group" aria-labelledby="scw-prov-l">
        <span id="scw-prov-l">Booked on{chosen && <b> {chosen.name}</b>}{missing.has('provider') && <span className="vh">, not on the confirmation</span>}</span>
        <div className="seg">
          {PROVIDERS.map((p) => (
            <button
              key={p.site} type="button" aria-pressed={form.provider === p.site} aria-label={p.name} title={p.name}
              onClick={() => onChange('provider', form.provider === p.site ? '' : p.site)}
            >
              <ProviderFace site={p.site} name={p.name} />
            </button>
          ))}
        </div>
      </div>
      {form.provider === 'other' && (
        <div className="scw-two">
          {field('seller', 'Provider')}
          {field('sellerUrl', 'Provider link', { type: 'url', inputMode: 'url', placeholder: 'https://' })}
        </div>
      )}

      {field('reference', 'Booking reference')}

      <div className="scw-when">
        {field('checkIn', 'Check-in', { type: 'date' })}
        {field('checkInTime', 'From', { type: 'time', 'aria-label': 'Check-in time' })}
      </div>
      <div className="scw-when">
        {field('checkOut', 'Check-out', { type: 'date' })}
        {field('checkOutTime', 'Until', { type: 'time', 'aria-label': 'Check-out time' })}
      </div>

      {field('room', 'Room')}
      <div className="scw-two scw-keep">
        {field('guests', 'Guests', { inputMode: 'numeric' })}
        {field('rooms', 'Rooms', { inputMode: 'numeric' })}
      </div>

      <div className="scw-two">
        <div className="scw-money">
          {field('total', 'Total', { inputMode: 'decimal' })}
          {field('currency', 'Currency', { maxLength: 3, autoCapitalize: 'characters' })}
        </div>
        {field('paid', 'Paid', { inputMode: 'decimal' })}
      </div>
      {currency && currency !== 'DKK' && field('dkk', 'Total in DKK', { inputMode: 'decimal' })}

      <div className="fld" role="group" aria-labelledby="scw-ref-l">
        <span id="scw-ref-l">Cancellation</span>
        <div className="seg">
          {([['yes', 'Refundable'], ['partly', 'Partly'], ['no', 'No refund']] as const).map(([v, word]) => (
            <button key={v} type="button" aria-pressed={form.refundable === v} onClick={() => onChange('refundable', form.refundable === v ? '' : v)}>{word}</button>
          ))}
        </div>
      </div>
      {form.refundable !== 'no' && field('cancelUntil', 'Free cancellation until', { type: 'date' })}

      {field('mailUrl', 'Confirmation mail', { type: 'url', inputMode: 'url', placeholder: 'https://mail.google.com/' })}
      {address === 'add' && field('address', 'Address')}
      {address === 'other' && field('address', 'Address on the confirmation', { readOnly: true })}

      <div className="scw-save">
        {said && <p className="scw-said" role="alert">{said}</p>}
        <button type="submit" className="btn primary wide" disabled={busy}>{busy ? 'Saving' : 'Save'}</button>
      </div>
    </form>
  )
}
