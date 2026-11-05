import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Lodging } from '../../data/types'
import { kr } from '../../lib/format'
import { amenities, cheapestRoom, nightly, nightsWord, providers, stayDates, type Provider } from '../../lib/stayOffer'
import { safeUrl } from '../../lib/lodgingLinks'
import { roomMarks, type Mark } from '../../lib/roomMarks'
import { Bed, Calendar, Caret, Check, Clock, External, Heart, Person, Photos, Share, Warn } from '../icons'
import { AmenityIcon, kindWord, NightPrice, Rating } from './offerMarks'
import { useLiveRates, type LiveRates } from './useLiveRates'

// A place to stay in full, pushed over the search on a phone and beside it on a wide screen: its photos edge to
// edge with back, share and save on them, its name, kind, place and rating, what it is like and what it offers,
// then its rooms priced per night for the dates with Select on each, and the sites that sell it. The cheapest
// site's price is in green. A site with no price for the room shows none. A place with a Hostelworld link asks
// for its live prices on open: a pulsing dot on the rooms heading and on each room still without a price for the
// dates while it asks, one warn mark on the heading when it could not.

export interface PropertyViewProps {
  lodging: Lodging
  /** "Santa Marta, Colombia" */
  place: string
  checkIn: string
  checkOut: string
  nights: number
  guests: number
  /** the rooms planned for the stay */
  chosen?: string[]
  /** the room booked here, when one is */
  booked?: string | null
  saved?: boolean
  onBack?: () => void
  onSave?: () => void
  onShare?: () => void
  onSelect?: (roomId: string) => void
  /** a logo for a site the app has no file for */
  logo?: (p: Provider) => string | null
}

function Gallery({ l, onBack, onShare, onSave, saved }: Pick<PropertyViewProps, 'onBack' | 'onShare' | 'onSave' | 'saved'> & { l: Lodging }) {
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set())
  const [at, setAt] = useState(0)
  const strip = useRef<HTMLDivElement>(null)
  const frame = useRef(0)
  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  const shown = l.photos.filter((p) => safeUrl(p.url) && !broken.has(p.url))
  const onScroll = () => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const el = strip.current
      if (el) setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
    })
  }
  return (
    <div className="pv-top">
      {shown.length ? (
        <div ref={strip} className="pv-strip" tabIndex={shown.length > 1 ? 0 : undefined} aria-label={`Photos of ${l.name}`} role="group" onScroll={onScroll}>
          {shown.map((p, i) => (
            <img
              key={p.url} src={safeUrl(p.url)!} alt={p.caption || `${l.name}, photo ${i + 1} of ${shown.length}`} loading={i ? 'lazy' : undefined} decoding="async"
              referrerPolicy="no-referrer" draggable={false} onError={() => setBroken((b) => new Set(b).add(p.url))}
            />
          ))}
        </div>
      ) : <span className="pv-noph" aria-hidden="true"><Bed s={36} /></span>}
      <div className="pv-acts">
        {onBack && <button type="button" className="pv-round" aria-label="Back to the places" onClick={onBack}><Caret dir="l" s={20} /></button>}
        <span className="pv-gap" />
        {onShare && <button type="button" className="pv-round" aria-label={`Share ${l.name}`} onClick={onShare}><Share s={18} /></button>}
        {onSave && <button type="button" className="pv-round" aria-pressed={!!saved} aria-label={saved ? `Saved, keep ${l.name} no more` : `Save ${l.name}`} onClick={onSave}><Heart s={18} on={saved} /></button>}
      </div>
      {shown.length > 1 && <span className="pv-count" aria-hidden="true"><Photos s={13} />{at + 1} / {shown.length}</span>}
    </div>
  )
}

function RoomPhoto({ src }: { src: string | null | undefined }) {
  const [broken, setBroken] = useState(false)
  const ok = src ? safeUrl(src) : null
  return (
    <span className="pv-rph" aria-hidden="true">
      {ok && !broken ? <img src={ok} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setBroken(true)} /> : <Bed s={22} />}
    </span>
  )
}

/** A chip on a room: its short words in view, the full ones for a tooltip and a screen reader. */
function RoomMark({ m, tone, icon }: { m: Mark; tone?: 'stale' | 'good' | 'warn' | 'low'; icon?: ReactNode }) {
  return (
    <li className="pv-mk" data-tone={tone} title={m.label}>
      {icon}<span aria-hidden="true">{m.text}</span><span className="pv-vh">{m.label}</span>
    </li>
  )
}

/** The asking for live prices on the rooms heading: a pulsing dot while it runs, a warn mark when it failed. */
function LiveMark({ live }: { live: LiveRates }) {
  return (
    <span className="pv-live" role="status">
      {live.state === 'asking' && <><span className="as-live" aria-hidden="true" /><span className="pv-vh">Asking Hostelworld</span></>}
      {live.state === 'failed' && <span className="pv-mk" data-tone="warn" role="img" aria-label={live.message} title={live.message}><Warn s={13} /></span>}
    </span>
  )
}

function Seller({ p, logo }: { p: Provider; logo: string | null }) {
  const inner = (
    <>
      <span className="pv-logo" data-none={!logo || undefined} aria-hidden="true">{logo ? <img src={logo} alt="" /> : p.name.slice(0, 1).toUpperCase()}</span>
      <span className="pv-sn">{p.name}</span>
      {p.price && (
        <span className="pv-sp" data-low={p.cheapest || undefined}>
          <NightPrice p={p.price} className="pv-skr" />
          {p.cheapest && <span className="pv-vh">, the lowest price</span>}
        </span>
      )}
      {p.url && <External s={16} />}
    </>
  )
  return (
    <li>
      {p.url ? <a className="pv-seller" href={p.url} target="_blank" rel="noopener noreferrer">{inner}</a> : <div className="pv-seller">{inner}</div>}
    </li>
  )
}

export function PropertyView(p: PropertyViewProps) {
  const l = p.lodging
  const chosen = p.chosen ?? []
  const all = amenities(l)
  const focus = l.rooms.find((r) => chosen.includes(r.id)) ?? l.rooms.find((r) => r.id === p.booked) ?? cheapestRoom(l, p.checkIn, p.checkOut)?.room ?? l.rooms[0] ?? null
  const sellers = providers(l, focus, p.checkIn, p.checkOut)
  const kind = kindWord(l.kind)
  const live = useLiveRates(l, p.checkIn, p.checkOut)
  const asking = live.state === 'asking'
  const now = Date.now()
  return (
    <article className="pv" aria-label={l.name}>
      <Gallery l={l} onBack={p.onBack} onShare={p.onShare} onSave={p.onSave} saved={p.saved} />
      <div className="pv-body">
        <header className="pv-h">
          <h3>{l.name}</h3>
          <p className="pv-where">{[kind, p.place].filter(Boolean).map((w, k) => <span key={k}>{w}</span>)}</p>
          <Rating l={l} full />
        </header>
        {l.summary && <p className="pv-sum">{l.summary}</p>}
        {all.length > 0 && (
          <ul className="pv-am" aria-label="What it offers">
            {all.map((a) => <li key={a.key}><AmenityIcon k={a.key} s={20} /><span>{a.label}</span></li>)}
          </ul>
        )}

        {(l.rooms.length > 0 || asking || live.state === 'failed') && (
          <section className="pv-sec" aria-labelledby="pv-rooms">
            <div className="pv-sh">
              <h4 id="pv-rooms">Rooms & prices</h4>
              <LiveMark live={live} />
            </div>
            <div className="pv-bar">
              <span><Calendar s={16} />{stayDates(p.checkIn, p.checkOut)}<i aria-hidden="true">·</i>{nightsWord(p.nights)}</span>
              <span><Person s={16} />{p.guests} {p.guests === 1 ? 'guest' : 'guests'}</span>
            </div>
            <ul className="pv-rooms">
              {l.rooms.map((r) => {
                const pr = nightly(r.prices, p.checkIn, p.checkOut)
                const on = chosen.includes(r.id)
                const booked = p.booked === r.id
                const mk = roomMarks(r, p.checkIn, p.checkOut, now)
                return (
                  <li key={r.id} className="pv-room" data-on={on || booked || undefined}>
                    <RoomPhoto src={r.photo} />
                    <span className="pv-rn">
                      <b>{r.name}</b>
                      {pr ? (
                        <span className="pv-rp">
                          <NightPrice p={pr} className="pv-rkr" stale={mk.seen?.stale} /><small>/ night</small>
                          {asking && !pr.exact && <span className="as-live" title="Asking Hostelworld" aria-hidden="true" />}
                        </span>
                      ) : asking ? (
                        <span className="pv-nop" data-asking title="Asking Hostelworld"><span className="pv-vh">Asking Hostelworld for a price</span></span>
                      ) : <span className="pv-nop"><span className="pv-vh">No price for these dates</span></span>}
                      {(mk.seen || mk.left || mk.free) && (
                        <ul className="pv-mks" aria-label={`About the price of ${r.name}`}>
                          {mk.free && <RoomMark m={mk.free} tone="good" icon={<Check s={12} />} />}
                          {mk.left && <RoomMark m={mk.left} tone={mk.left.none ? 'warn' : 'low'} />}
                          {mk.seen && <RoomMark m={mk.seen} tone={mk.seen.stale ? 'stale' : undefined} icon={<Clock s={12} />} />}
                        </ul>
                      )}
                    </span>
                    {booked ? (
                      <span className="pv-sel" data-booked><Check s={14} />Booked</span>
                    ) : p.onSelect ? (
                      <button type="button" className="pv-sel" aria-pressed={on} aria-label={on ? `${r.name} is picked` : `Select ${r.name}${pr ? `, ${kr(pr.dkk)} per night` : ''}`} onClick={() => p.onSelect!(r.id)}>
                        {on && <Check s={14} />}{on ? 'Selected' : 'Select'}
                      </button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {sellers.length > 0 && (
          <section className="pv-sec" aria-labelledby="pv-book">
            <h4 id="pv-book">Book at</h4>
            <ul className="pv-sellers">{sellers.map((s) => <Seller key={s.key} p={s} logo={p.logo?.(s) ?? s.logo} />)}</ul>
          </section>
        )}
      </div>
    </article>
  )
}
