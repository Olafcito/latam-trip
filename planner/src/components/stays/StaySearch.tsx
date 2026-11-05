import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Lodging, LodgingKind } from '../../data/types'
import { day } from '../../lib/format'
import { KIND } from '../../lib/lodgingWords'
import { amenities, cheapestRoom, sortPlaces, type StaySort } from '../../lib/stayOffer'
import { hostelworldId, type RatesResult } from '../../lib/stayRates'
import { Bed, Bookmark, Calendar, Caret, Check, Close, Link, Pencil, Person, Pin, Search, Star, Warn } from '../icons'
import { AmenityIcon, KindIcon, kindWord, NightPrice, Rating } from './offerMarks'

// Add accommodation: find a place among the ones stored for the stop, or add one by hand. The stop, the dates and
// the guests on top, the kinds of place as chips, then the places as cards led by their photo. A card opens the
// place. A search under way brings more places in over time: the cards found so far stay and the ones still
// coming show as shapes under them. A pasted Hostelworld link adds a place that is not stored yet and opens it.

export interface StayBadge {
  label: string
  tone: 'booked' | 'plan' | 'saved'
}

export interface StaySearchProps {
  destination: string
  checkIn: string
  checkOut: string
  guests: number
  rooms: number
  /** the places, in the order recommended */
  places: Lodging[]
  saved: ReadonlySet<string>
  /** what the trip already says about a place, shown on its photo */
  badge?: (l: Lodging) => StayBadge | null
  /** a search under way and the sites it asks */
  searching?: { sites: string[] } | null
  onDates?: (checkIn: string, checkOut: string) => void
  onGuests?: (guests: number) => void
  onOpen: (l: Lodging) => void
  onSave?: (l: Lodging) => void
  onClose?: () => void
  /** the place open beside the list, on a wide screen */
  openId?: string | null
  /** the form that adds a place by hand */
  manual?: ReactNode
  /** adds the place a Hostelworld link is for, with its rooms and prices, and has it in places when it resolves */
  onLink?: (url: string) => Promise<RatesResult>
}

const KINDS: LodgingKind[] = ['hostel', 'hotel', 'guesthouse', 'apartment']
const SORTS: [StaySort, string][] = [['recommended', 'Recommended'], ['price', 'Lowest price'], ['rating', 'Best rated']]

function Photo({ l }: { l: Lodging }) {
  const [broken, setBroken] = useState(false)
  const src = l.photos.find((p) => /^https:\/\//i.test(p.url))?.url
  if (!src || broken) return <span className="as-ph as-noph" aria-hidden="true"><Bed s={28} /></span>
  return <span className="as-ph"><img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setBroken(true)} /></span>
}

function Card({ l, checkIn, checkOut, saved, badge, open, onOpen, onSave }: {
  l: Lodging; checkIn: string; checkOut: string; saved: boolean; badge: StayBadge | null; open: boolean
  onOpen: () => void; onSave?: () => void
}) {
  const best = cheapestRoom(l, checkIn, checkOut)
  const all = amenities(l)
  const shown = all.slice(0, 3)
  const kind = kindWord(l.kind)
  return (
    <li className="as-card" data-open={open || undefined}>
      <Photo l={l} />
      {badge && (
        <span className="as-badge" data-tone={badge.tone}>
          {badge.tone === 'booked' ? <Check s={12} /> : badge.tone === 'plan' ? <Calendar s={12} /> : <Star s={12} />}
          {badge.label}
        </span>
      )}
      <div className="as-body">
        <button type="button" className="as-name" aria-current={open || undefined} onClick={onOpen}>{l.name}</button>
        <span className="as-meta">
          {[kind, l.area].filter(Boolean).map((w, k) => <span key={k}>{w}</span>)}
          <Rating l={l} />
        </span>
        <span className="as-price">
          {best ? <><NightPrice p={best.price} className="as-kr" /><small>per night</small></> : <small className="as-nokr">No price yet</small>}
        </span>
        {shown.length > 0 && (
          <ul className="as-am" aria-label="What it offers">
            {shown.map((a) => <li key={a.key}><AmenityIcon k={a.key} />{a.label}</li>)}
            {all.length > shown.length && <li className="as-more" aria-label={all.slice(3).map((a) => a.label).join(', ')}>+{all.length - shown.length}</li>}
          </ul>
        )}
      </div>
      {onSave && (
        <button type="button" className="as-keep" aria-pressed={saved} aria-label={saved ? `Saved, keep ${l.name} no more` : `Save ${l.name}`} onClick={onSave}>
          <Bookmark s={18} on={saved} />
        </button>
      )}
    </li>
  )
}

/** A field with its label over it and a native control laid over the face, so a phone opens its own picker. */
function Field({ label, icon, face, children, wide }: { label: string; icon: ReactNode; face: ReactNode; children?: ReactNode; wide?: boolean }) {
  return (
    <label className="as-f" data-wide={wide || undefined}>
      <span className="as-fl">{label}</span>
      <span className="as-fv">{icon}<span className="as-face">{face}</span>{children}</span>
    </label>
  )
}

/** A Hostelworld link pasted in: Go adds the place and opens it once it is among the places. */
function LinkRow({ places, onLink, onOpen }: { places: Lodging[]; onLink: (url: string) => Promise<RatesResult>; onOpen: (l: Lodging) => void }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // the place added, until the store has it
  const [want, setWant] = useState<string | null>(null)
  useEffect(() => {
    if (!want) return
    const l = places.find((x) => x.id === want)
    if (l) {
      setWant(null)
      onOpen(l)
      return
    }
    // the store reloads right after the add, so a place still missing a moment later is not at this stop
    const t = setTimeout(() => {
      setWant(null)
      setError('That place is not at this stop.')
    }, 2500)
    return () => clearTimeout(t)
  }, [want, places, onOpen])
  const ok = hostelworldId(url) != null
  const go = async (e: FormEvent) => {
    e.preventDefault()
    if (!ok || busy) return
    setBusy(true)
    setError(null)
    let r: RatesResult
    try {
      r = await onLink(url)
    } catch {
      r = { ok: false, message: 'Hostelworld could not be asked right now.' }
    }
    setBusy(false)
    if (!r.ok) return setError(r.message)
    setUrl('')
    setWant(r.lodging_id)
  }
  return (
    <form className="as-link" onSubmit={go} aria-busy={busy || undefined} data-busy={busy || undefined}>
      <label className="as-lf">
        {busy ? <span className="as-live" aria-hidden="true" /> : <Link s={16} />}
        <input
          type="url" name="hostelworld" inputMode="url" autoComplete="off" spellCheck={false} placeholder="Paste a Hostelworld link" aria-label="Hostelworld link"
          value={url} disabled={busy} aria-invalid={error ? true : undefined}
          onChange={(e) => { setUrl(e.target.value); setError(null) }}
        />
        {error && <span className="pv-mk" data-tone="warn" role="img" aria-label={error} title={error}><Warn s={13} /></span>}
      </label>
      <button type="submit" className="as-go" disabled={!ok || busy} aria-label={busy ? 'Adding from Hostelworld' : 'Go'}>Go</button>
      <span className="pv-vh" role="status">{error ?? ''}</span>
    </form>
  )
}

export function StaySearch(p: StaySearchProps) {
  const [tab, setTab] = useState<'find' | 'manual'>('find')
  const [kind, setKind] = useState<LodgingKind | 'all'>('all')
  const [sort, setSort] = useState<StaySort>('recommended')
  const list = sortPlaces(p.places, kind, sort, p.checkIn, p.checkOut)
  const busy = !!p.searching
  const count = busy ? `${list.length} ${list.length === 1 ? 'place' : 'places'} so far` : `${list.length} ${list.length === 1 ? 'place' : 'places'} found`
  return (
    <section className="as" aria-label="Add accommodation">
      <header className="as-h">
        <h3>Add accommodation</h3>
        {p.onClose && <button type="button" className="as-x" aria-label="Close" onClick={p.onClose}><Close /></button>}
      </header>
      <div className="as-tabs" role="tablist" aria-label="How to add">
        <button type="button" role="tab" aria-selected={tab === 'find'} className="as-tab" onClick={() => setTab('find')}><Search s={17} />Find & add</button>
        <button type="button" role="tab" aria-selected={tab === 'manual'} className="as-tab" onClick={() => setTab('manual')}><Pencil s={17} />Add manually</button>
      </div>

      {tab === 'manual' ? <div className="as-manual">{p.manual}</div> : (
        <div className="as-find">
          <div className="as-fields">
            <Field label="Destination" icon={<Pin s={16} />} face={p.destination} wide />
            <Field label="Check-in" icon={<Calendar s={16} />} face={day(p.checkIn)}>
              <input type="date" aria-label="Check-in" value={p.checkIn} max={p.checkOut} readOnly={!p.onDates} onChange={(e) => e.target.value && p.onDates?.(e.target.value, p.checkOut)} />
            </Field>
            <Field label="Check-out" icon={<Calendar s={16} />} face={day(p.checkOut)}>
              <input type="date" aria-label="Check-out" value={p.checkOut} min={p.checkIn} readOnly={!p.onDates} onChange={(e) => e.target.value && p.onDates?.(p.checkIn, e.target.value)} />
            </Field>
            <Field label="Guests · Rooms" icon={<Person s={16} />} face={`${p.guests} ${p.guests === 1 ? 'guest' : 'guests'}, ${p.rooms} ${p.rooms === 1 ? 'room' : 'rooms'}`}>
              <Caret dir="d" s={16} />
              <select aria-label="Guests" value={p.guests} disabled={!p.onGuests} onChange={(e) => p.onGuests?.(Number(e.target.value))}>
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'guest' : 'guests'}</option>)}
              </select>
            </Field>
          </div>

          <div className="as-chips" role="radiogroup" aria-label="Kind of place">
            <button type="button" role="radio" aria-checked={kind === 'all'} className="as-chip" onClick={() => setKind('all')}>All</button>
            {KINDS.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} className="as-chip" onClick={() => setKind(k)}><KindIcon kind={k} s={15} />{KIND[k]}</button>
            ))}
          </div>

          {p.onLink && <LinkRow places={p.places} onLink={p.onLink} onOpen={p.onOpen} />}

          <div className="as-count">
            <span aria-live="polite">{busy && <span className="as-live" aria-hidden="true" />}{count}</span>
            <label className="as-sort">
              <span>{SORTS.find(([s]) => s === sort)![1]}</span><Caret dir="d" s={14} />
              <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as StaySort)}>
                {SORTS.map(([s, w]) => <option key={s} value={s}>{w}</option>)}
              </select>
            </label>
          </div>
          {busy && p.searching!.sites.length > 0 && <p className="as-asking">Asking {p.searching!.sites.join(', ')}</p>}

          <ul className="as-list">
            {list.map((l) => (
              <Card
                key={l.id} l={l} checkIn={p.checkIn} checkOut={p.checkOut} saved={p.saved.has(l.id)} badge={p.badge?.(l) ?? null} open={p.openId === l.id}
                onOpen={() => p.onOpen(l)} onSave={p.onSave ? () => p.onSave!(l) : undefined}
              />
            ))}
            {busy && [0, 1].map((k) => <li key={`wait${k}`} className="as-card as-wait" aria-hidden="true"><span className="as-ph" /><div className="as-body"><i /><i /><i /></div></li>)}
          </ul>
          {!busy && list.length === 0 && (
            <p className="as-empty">{kind === 'all' ? 'No places stored for this stop yet.' : `No ${KIND[kind as LodgingKind].toLowerCase()}s stored for this stop yet.`}</p>
          )}
        </div>
      )}
    </section>
  )
}
