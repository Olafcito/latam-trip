import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import type { LodgingKind, LodgingSite, LodgingTag } from '../../data/types'
import { readKr } from '../../lib/bookingDraft'
import { siteOf } from '../../lib/lodgingLinks'
import { loadLodgings, saveLodging, type LodgingDraft } from '../../lib/lodgings'
import { addDays } from '../../lib/time'
import { useStore } from '../../store'
import { Bath, Bed, Calendar, Check, Close, Door, Link, Note, Person, Plus, Trash } from '../icons'
import { safeUrl } from './StayCard'

// Adding a place to stay by hand, in place of the button that opens it. Only the name is needed. A link pasted
// in says which site it is on by itself, a photo shows as soon as its address loads, and a room takes its
// prices for the dates they are for, the stop's nights first. It saves the place whole, as the connector would.

const KINDS: [LodgingKind, string][] = [['hostel', 'Hostel'], ['hotel', 'Hotel'], ['guesthouse', 'Guesthouse'], ['apartment', 'Apartment'], ['other', 'Other']]
const TAGS: [LodgingTag, string][] = [['beach', 'Beach'], ['pool', 'Pool'], ['social', 'Social'], ['quiet', 'Quiet'], ['kitchen', 'Kitchen'], ['breakfast', 'Breakfast'], ['aircon', 'Air con'], ['workspace', 'Workspace']]
const SITE: Record<LodgingSite, string> = { booking: 'Booking.com', hostelworld: 'Hostelworld', airbnb: 'Airbnb', own: 'Own site', other: 'Link' }

interface PriceForm { key: string; check_in: string; check_out: string; total: string }
interface RoomForm { key: string; name: string; beds: string; own: '' | 'own' | 'shared'; bath: '' | 'private' | 'shared'; prices: PriceForm[] }

const key = () => crypto.randomUUID()

/** One choice of a few, or none. The arrows move it, a press on the chosen one clears it. */
function Choice<T extends string>({ label, value, options, onChange, clear = true }: {
  label: string; value: T | ''; options: [T, ReactNode][]; onChange: (v: T | '') => void; clear?: boolean
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const at = options.findIndex(([k]) => k === value)
  const onKey = (e: KeyboardEvent) => {
    const n = options.length
    const from = Math.max(at, 0)
    const to = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (from + 1) % n : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (from - 1 + n) % n : -1
    if (to < 0) return
    e.preventDefault()
    onChange(options[to][0])
    refs.current[to]?.focus()
  }
  return (
    <div className="ap-seg" role="radiogroup" aria-label={label} onKeyDown={onKey}>
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

/** A photo by its address, shown once it loads. */
function Thumb({ url }: { url: string }) {
  const [bad, setBad] = useState(false)
  const ok = safeUrl(url)
  useEffect(() => setBad(false), [url])
  if (!ok || bad) return <span className="ap-thumb" data-none aria-hidden="true" />
  return <img className="ap-thumb" src={ok} alt="" loading="lazy" decoding="async" onError={() => setBad(true)} />
}

export function AddPlace({ place, onSaved, close, first, nights = 0 }: {
  /** the place on the map the place to stay is at */
  place: string
  onSaved: (id: string) => void
  close: () => void
  /** the stop's nights, the dates a new price starts on */
  first?: string | null
  nights?: number
}) {
  const id = useId()
  const setLodgings = useStore((s) => s.setLodgings)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<LodgingKind>('hostel')
  const [links, setLinks] = useState<{ key: string; url: string }[]>([])
  const [photos, setPhotos] = useState<{ key: string; url: string }[]>([])
  const [rooms, setRooms] = useState<RoomForm[]>([])
  const [tags, setTags] = useState<LodgingTag[]>([])
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  const lastLink = useRef<HTMLInputElement | null>(null)
  const lastPhoto = useRef<HTMLInputElement | null>(null)
  const [focusNew, setFocusNew] = useState<{ what: 'link' | 'photo'; n: number } | null>(null)

  // with a mouse the name takes the focus. On a phone it waits for a tap, so the keyboard does not cover the form
  useEffect(() => {
    if (window.matchMedia?.('(pointer: fine)').matches) nameRef.current?.focus({ preventScroll: true })
  }, [])
  // a field just added takes the focus, so a link or a photo can be pasted right away
  useEffect(() => {
    if (focusNew) (focusNew.what === 'link' ? lastLink : lastPhoto).current?.focus()
  }, [focusNew])

  const newPrice = (): PriceForm => {
    const from = first ?? ''
    return { key: key(), check_in: from, check_out: from && nights > 0 ? addDays(from, nights) : '', total: '' }
  }
  const room = (k: string, change: (r: RoomForm) => RoomForm) => setRooms((rs) => rs.map((r) => (r.key === k ? change(r) : r)))
  const price = (rk: string, pk: string, change: Partial<PriceForm>) =>
    room(rk, (r) => ({ ...r, prices: r.prices.map((p) => (p.key === pk ? { ...p, ...change } : p)) }))
  const toggleTag = (t: LodgingTag) => setTags((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]))

  /** The form as a draft, or what is wrong with it said the way the form shows it. */
  const draft = (): LodgingDraft | string => {
    const ls = links.map((l) => l.url.trim()).filter(Boolean)
    if (ls.some((u) => !safeUrl(u))) return 'A link starts with https://.'
    const ps = photos.map((p) => p.url.trim()).filter(Boolean)
    if (ps.some((u) => !safeUrl(u))) return 'A photo address starts with https://.'
    const rs: LodgingDraft['rooms'] = []
    for (const r of rooms) {
      const beds = r.beds.trim() ? Number(r.beds) : null
      if (beds != null && !(Number.isInteger(beds) && beds >= 1)) return 'A room has at least 1 bed.'
      const prices: LodgingDraft['rooms'][number]['prices'] = []
      for (const p of r.prices) {
        if (!p.check_in && !p.check_out && !p.total.trim()) continue
        if (!p.check_in || !p.check_out) return 'A price needs the day you check in and the day you check out.'
        const total = readKr(p.total)
        if (total == null || Number.isNaN(total)) return 'A price needs what it costs in kr.'
        prices.push({ check_in: p.check_in, check_out: p.check_out, total_dkk: Math.round(total), per_night_dkk: null, site: null, url: null, refundable: null, cancel_until: null })
      }
      rs.push({ name: r.name.trim(), beds, private: r.own === '' ? null : r.own === 'own', bathroom: r.bath || null, notes: null, prices })
    }
    return {
      place_id: place, name: name.trim(), kind, tags, notes: notes.trim() || null, summary: null,
      photos: ps.map((url) => ({ url, caption: null })),
      links: ls.map((url) => ({ site: siteOf(url), url })),
      rating: null, reviews: null, rating_source: null, address: null, lat: null, lon: null, to_center_km: null, to_beach_km: null,
      added_by: 'simon', rooms: rs,
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const d = draft()
    if (typeof d === 'string') return setError(d)
    setBusy(true)
    setError('')
    const r = await saveLodging(d)
    if (!r.ok) {
      setBusy(false)
      setError(r.message)
      return
    }
    // the live channel brings it as well, this only makes it show at once
    loadLodgings().then(setLodgings, () => {})
    onSaved(r.id)
  }

  return (
    <form className="ap" onSubmit={submit} aria-labelledby={`${id}-h`} noValidate>
      <header className="ap-head">
        <h5 id={`${id}-h`}>Add a place</h5>
        <button type="button" className="ap-icon" aria-label="Close without adding" onClick={close}><Close /></button>
      </header>

      <ul className="ap-list">
        <li className="ap-row">
          <label className="ws-vh" htmlFor={`${id}-name`}>Name</label>
          <input
            ref={nameRef} id={`${id}-name`} className="ap-in ap-name" value={name} placeholder="Name" autoComplete="off" enterKeyHint="next"
            aria-invalid={error === 'Give the place a name.' || undefined}
            onChange={(e) => setName(e.currentTarget.value)}
          />
        </li>
        <li className="ap-row ap-wrap">
          <Choice label="Kind" value={kind} options={KINDS} clear={false} onChange={(v) => v && setKind(v)} />
        </li>
      </ul>

      <section className="ap-group" aria-label="Links">
        <ul className="ap-list">
          {links.map((l, k) => {
            const ok = safeUrl(l.url)
            return (
              <li key={l.key} className="ap-row">
                <span className="ap-i" aria-hidden="true"><Link s={13} /></span>
                <label className="ws-vh" htmlFor={`${id}-l${k}`}>Link {k + 1}</label>
                <input
                  ref={k === links.length - 1 ? lastLink : undefined}
                  id={`${id}-l${k}`} className="ap-in" type="url" inputMode="url" value={l.url} placeholder="Paste a link" autoComplete="off" autoCapitalize="none" spellCheck={false}
                  onChange={(e) => { const url = e.currentTarget.value; setLinks((ls) => ls.map((x) => (x.key === l.key ? { ...x, url } : x))) }}
                />
                {ok && <span className="ap-site" data-site={siteOf(ok)}>{SITE[siteOf(ok)]}</span>}
                <button type="button" className="ap-icon" aria-label={`Take link ${k + 1} away`} onClick={() => setLinks((ls) => ls.filter((x) => x.key !== l.key))}><Trash /></button>
              </li>
            )
          })}
          {photos.map((p, k) => (
            <li key={p.key} className="ap-row">
              <Thumb url={p.url} />
              <label className="ws-vh" htmlFor={`${id}-p${k}`}>Photo {k + 1}</label>
              <input
                ref={k === photos.length - 1 ? lastPhoto : undefined}
                id={`${id}-p${k}`} className="ap-in" type="url" inputMode="url" value={p.url} placeholder="Paste a photo address" autoComplete="off" autoCapitalize="none" spellCheck={false}
                onChange={(e) => { const url = e.currentTarget.value; setPhotos((ps) => ps.map((x) => (x.key === p.key ? { ...x, url } : x))) }}
              />
              <button type="button" className="ap-icon" aria-label={`Take photo ${k + 1} away`} onClick={() => setPhotos((ps) => ps.filter((x) => x.key !== p.key))}><Trash /></button>
            </li>
          ))}
        </ul>
        <p className="ap-adds">
          <button type="button" className="ap-more" onClick={() => { setLinks((ls) => [...ls, { key: key(), url: '' }]); setFocusNew((f) => ({ what: 'link', n: (f?.n ?? 0) + 1 })) }}><Plus />Link</button>
          <button type="button" className="ap-more" onClick={() => { setPhotos((ps) => [...ps, { key: key(), url: '' }]); setFocusNew((f) => ({ what: 'photo', n: (f?.n ?? 0) + 1 })) }}><Plus />Photo</button>
        </p>
      </section>

      {rooms.map((r, k) => (
        <section key={r.key} className="ap-group ap-room" aria-label={r.name.trim() || `Room ${k + 1}`}>
          <ul className="ap-list">
            <li className="ap-row">
              <span className="ap-i" aria-hidden="true"><Bed s={13} /></span>
              <label className="ws-vh" htmlFor={`${id}-r${k}`}>Room {k + 1}</label>
              <input
                id={`${id}-r${k}`} className="ap-in" value={r.name} placeholder="Room, like Dorm of 6" autoComplete="off"
                aria-invalid={(error === 'Give each room a name.' && !r.name.trim()) || undefined}
                onChange={(e) => { const v = e.currentTarget.value; room(r.key, (x) => ({ ...x, name: v })) }}
              />
              <label className="ws-vh" htmlFor={`${id}-b${k}`}>Beds</label>
              <input
                id={`${id}-b${k}`} className="ap-in ap-beds" inputMode="numeric" pattern="[0-9]*" value={r.beds} placeholder="Beds" autoComplete="off"
                onChange={(e) => { const v = e.currentTarget.value.replace(/\D/g, ''); room(r.key, (x) => ({ ...x, beds: v })) }}
              />
              <button type="button" className="ap-icon" aria-label={`Take ${r.name.trim() || `room ${k + 1}`} away`} onClick={() => setRooms((rs) => rs.filter((x) => x.key !== r.key))}><Trash /></button>
            </li>
            <li className="ap-row ap-wrap">
              <Choice label="The room" value={r.own} onChange={(v) => room(r.key, (x) => ({ ...x, own: v }))} options={[['own', <><Door s={13} />Own room</>], ['shared', <><Person s={13} />Shared</>]]} />
              <Choice label="The bathroom" value={r.bath} onChange={(v) => room(r.key, (x) => ({ ...x, bath: v }))} options={[['private', <><Bath s={13} />Own bath</>], ['shared', <><Bath s={13} />Shared bath</>]]} />
            </li>
            {r.prices.map((p, j) => (
              <li key={p.key} className="ap-row ap-price">
                <span className="ap-i" aria-hidden="true"><Calendar s={13} /></span>
                <span className="ap-dates">
                  <label className="ws-vh" htmlFor={`${id}-i${k}-${j}`}>Check in</label>
                  <input id={`${id}-i${k}-${j}`} className="ap-in ap-date" type="date" value={p.check_in} onChange={(e) => price(r.key, p.key, { check_in: e.currentTarget.value })} />
                  <span aria-hidden="true">to</span>
                  <label className="ws-vh" htmlFor={`${id}-o${k}-${j}`}>Check out</label>
                  <input id={`${id}-o${k}-${j}`} className="ap-in ap-date" type="date" value={p.check_out} min={p.check_in || undefined} onChange={(e) => price(r.key, p.key, { check_out: e.currentTarget.value })} />
                </span>
                <span className="ap-kr">
                  <label className="ws-vh" htmlFor={`${id}-t${k}-${j}`}>Total in kr</label>
                  <input id={`${id}-t${k}-${j}`} className="ap-in" inputMode="decimal" value={p.total} placeholder="0" autoComplete="off" onChange={(e) => price(r.key, p.key, { total: e.currentTarget.value })} />
                  <span aria-hidden="true">kr</span>
                </span>
                <button type="button" className="ap-icon" aria-label={`Take price ${j + 1} away`} onClick={() => room(r.key, (x) => ({ ...x, prices: x.prices.filter((y) => y.key !== p.key) }))}><Trash /></button>
              </li>
            ))}
          </ul>
          <p className="ap-adds">
            <button type="button" className="ap-more" onClick={() => room(r.key, (x) => ({ ...x, prices: [...x.prices, newPrice()] }))}><Plus />Price</button>
          </p>
        </section>
      ))}
      <p className="ap-adds">
        <button type="button" className="ap-more" onClick={() => setRooms((rs) => [...rs, { key: key(), name: '', beds: '', own: '', bath: '', prices: [newPrice()] }])}><Plus />Room</button>
      </p>

      <ul className="ap-tags" aria-label="Tags">
        {TAGS.map(([t, text]) => (
          <li key={t}><button type="button" aria-pressed={tags.includes(t)} onClick={() => toggleTag(t)}>{tags.includes(t) && <Check s={11} />}{text}</button></li>
        ))}
      </ul>

      <div className="ap-notes">
        <span className="ap-i" aria-hidden="true"><Note s={13} /></span>
        <label className="ws-vh" htmlFor={`${id}-n`}>Notes</label>
        <textarea id={`${id}-n`} className="ap-in" rows={2} value={notes} placeholder="Notes" onChange={(e) => setNotes(e.currentTarget.value)} />
      </div>

      <footer className="ap-foot">
        {error && <small className="ap-err" role="alert">{error}</small>}
        <button type="button" className="ap-cancel" onClick={close}>Cancel</button>
        <button type="submit" className="ap-save" disabled={busy}>{busy ? 'Saving' : 'Add the place'}</button>
      </footer>
    </form>
  )
}
