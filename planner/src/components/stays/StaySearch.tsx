import { useState, type ReactNode } from 'react'
import type { Lodging, LodgingKind } from '../../data/types'
import { day } from '../../lib/format'
import { KIND } from '../../lib/lodgingWords'
import { amenities, cheapestRoom, sortPlaces, type StaySort } from '../../lib/stayOffer'
import { Bed, Bookmark, Calendar, Caret, Check, Close, Pencil, Person, Pin, Search, Star } from '../icons'
import { AmenityIcon, KindIcon, kindWord, NightPrice, Rating } from './offerMarks'

// Add accommodation: find a place among the ones stored for the stop, or add one by hand. The stop, the dates and
// the guests on top, the kinds of place as chips, then the places as cards led by their photo. A card opens the
// place. A search under way brings more places in over time: the cards found so far stay and the ones still
// coming show as shapes under them.

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
