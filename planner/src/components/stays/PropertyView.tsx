import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Lodging } from '../../data/types'
import { day, kr } from '../../lib/format'
import { amenityRow, bookAt, cheapestRoom, nightly, nightsWord, stayDates, type Provider } from '../../lib/stayOffer'
import { addDays } from '../../lib/time'
import { safeUrl } from '../../lib/lodgingLinks'
import { clampPhoto } from '../../lib/photoStrip'
import { roomMarks, type Mark } from '../../lib/roomMarks'
import type { Shared } from '../../lib/sharePlace'
import { Bed, Calendar, Caret, Check, External, Heart, Person, Photos, Share, Warn } from '../icons'
import { DayInput } from './DayInput'
import { StripArrows } from './StripArrows'
import { AmenityIcon, kindWord, NightPrice, Rating } from './offerMarks'
import { useLiveRates, type LiveRates } from './useLiveRates'
import { useStrip } from './useStrip'

// A place to stay in full, pushed over the search on a phone and beside it on a wide screen: its photos edge to
// edge with back, share and save on them, arrows on them for a mouse, its name, kind, place and
// rating, three lines of what it is like with More for the rest, five things it offers in one row, then its rooms
// priced per night for the dates with Select on each, the two days themselves the control that changes the dates,
// and last the sites to book it at. A booked room carries the Booked pill in place of Select. A place with a
// Hostelworld link asks for its live prices on open: a pulsing dot on the rooms heading and on each room still
// without a price for the dates while it asks, one warn mark on the heading when it could not. Green is for Select
// and Booked only.

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
  /** shares the place, and says how, so a copied link shows a check on the button for a moment */
  onShare?: () => Promise<Shared> | void
  onSelect?: (roomId: string) => void
  /** new dates picked on the dates bar. Without it the dates are only shown */
  onDates?: (checkIn: string, checkOut: string) => void
  /** a logo for a site the app has no file for */
  logo?: (p: Provider) => string | null
}

function Gallery({ l, onBack, onShare, onSave, saved }: Pick<PropertyViewProps, 'onBack' | 'onShare' | 'onSave' | 'saved'> & { l: Lodging }) {
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set())
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(t)
  }, [copied])
  const share = async () => {
    if ((await onShare?.()) === 'copied') setCopied(true)
  }
  const shown = l.photos.filter((p) => safeUrl(p.url) && !broken.has(p.url))
  const s = useStrip(shown.length)
  const at = clampPhoto(s.at, shown.length)
  return (
    <div className="pv-top">
      {shown.length ? (
        <div ref={s.ref} className="pv-strip" tabIndex={shown.length > 1 ? 0 : undefined} aria-label={`Photos of ${l.name}`} role="group" onScroll={s.onScroll} onScrollEnd={s.onScrollEnd} onKeyDown={s.onKeyDown}>
          {shown.map((p, i) => (
            <img
              key={p.url} src={safeUrl(p.url)!} alt={p.caption || `${l.name}, photo ${i + 1} of ${shown.length}`} loading={i ? 'lazy' : undefined} decoding="async"
              referrerPolicy="no-referrer" draggable={false} onError={() => setBroken((b) => new Set(b).add(p.url))}
            />
          ))}
        </div>
      ) : <span className="pv-noph" aria-hidden="true"><Bed s={36} /></span>}
      <StripArrows at={at} count={shown.length} step={s.step} />
      <div className="pv-acts">
        {onBack && <button type="button" className="pv-round" aria-label="Back to the places" onClick={onBack}><Caret dir="l" s={18} /></button>}
        <span className="pv-gap" />
        {onShare && <button type="button" className="pv-round" aria-label={copied ? 'Link copied' : `Share ${l.name}`} title={copied ? 'Link copied' : 'Share'} onClick={share}>{copied ? <Check s={16} /> : <Share s={16} />}</button>}
        {onSave && <button type="button" className="pv-round" aria-pressed={!!saved} aria-label={`Save ${l.name}`} title={saved ? 'Saved' : 'Save'} onClick={onSave}><Heart s={16} on={saved} /></button>}
      </div>
      {shown.length > 1 && <span className="pv-count" aria-hidden="true"><Photos s={12} />{at + 1} / {shown.length}</span>}
    </div>
  )
}

function RoomPhoto({ src }: { src: string | null | undefined }) {
  const [broken, setBroken] = useState(false)
  const ok = src ? safeUrl(src) : null
  return (
    <span className="pv-rph" aria-hidden="true">
      {ok && !broken ? <img src={ok} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setBroken(true)} /> : <Bed s={20} />}
    </span>
  )
}

/** What a place is like: three lines, and More when there is more. */
function Summary({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  const [more, setMore] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || open) return
    const check = () => setMore(el.scrollHeight > el.clientHeight + 1)
    check()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text, open])
  return (
    <div className="pv-sum">
      <p ref={ref} id="pv-sum" data-open={open || undefined}>{text}</p>
      {(more || open) && (
        <button type="button" className="pv-more" aria-expanded={open} aria-controls="pv-sum" onClick={() => setOpen((o) => !o)}>
          {open ? 'Less' : 'More'}
        </button>
      )}
    </div>
  )
}

/** A word under a room's price: its short words in view, the full ones for a tooltip and a screen reader. */
function RoomMark({ m, tone }: { m: Mark; tone?: 'stale' | 'warn' }) {
  return (
    <li className="pv-mk" data-tone={tone} title={m.label}>
      <span aria-hidden="true">{m.text}</span><span className="pv-vh">{m.label}</span>
    </li>
  )
}

/** The asking for live prices on the rooms heading: a pulsing dot while it runs, a warn mark when it failed. */
function LiveMark({ live }: { live: LiveRates }) {
  return (
    <span className="pv-live" role="status">
      {live.state === 'asking' && <><span className="as-live" aria-hidden="true" /><span className="pv-vh">Asking Hostelworld</span></>}
      {live.state === 'failed' && <span className="pv-fail" role="img" aria-label={live.message} title={live.message}><Warn s={14} /></span>}
    </span>
  )
}

/** A site's mark: its logo file, Hostelworld's orange square, or its first letter. */
function SiteLogo({ p, logo }: { p: Provider; logo: string | null }) {
  if (p.key === 'hostelworld') return <span className="pv-logo" data-site="hostelworld" aria-hidden="true">H</span>
  return <span className="pv-logo" data-none={!logo || undefined} aria-hidden="true">{logo ? <img src={logo} alt="" /> : p.name.slice(0, 1).toUpperCase()}</span>
}

function Seller({ p, logo }: { p: Provider; logo: string | null }) {
  const inner = (
    <>
      <SiteLogo p={p} logo={logo} />
      <span className="pv-sn">{p.name}</span>
      {p.price && (
        <span className="pv-sp">
          <NightPrice p={p.price} className="pv-skr" />
          {p.cheapest && <span className="pv-vh">, the lowest price</span>}
        </span>
      )}
      {p.url && <External s={15} />}
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
  const offers = amenityRow(l).slice(0, 5)
  const focus = l.rooms.find((r) => chosen.includes(r.id)) ?? l.rooms.find((r) => r.id === p.booked) ?? cheapestRoom(l, p.checkIn, p.checkOut)?.room ?? l.rooms[0] ?? null
  const sellers = bookAt(l, focus, p.checkIn, p.checkOut)
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
        {l.summary && <Summary text={l.summary} />}
        {offers.length > 0 && (
          <ul className="pv-am" aria-label="What it offers">
            {offers.map((a) => <li key={a.key}><AmenityIcon k={a.key} s={18} /><span>{a.label}</span></li>)}
          </ul>
        )}

        {(l.rooms.length > 0 || asking || live.state === 'failed') && (
          <section className="pv-sec" aria-labelledby="pv-rooms">
            <div className="pv-sh">
              <h4 id="pv-rooms">Rooms & prices</h4>
              <LiveMark live={live} />
            </div>
            <div className="pv-bar">
              {p.onDates ? (
                <span>
                  <Calendar s={15} />
                  <span className="pv-day">{day(p.checkIn)}<DayInput label="Check-in" value={p.checkIn} onPick={(d) => p.onDates!(d, p.checkOut)} /></span>
                  <i aria-hidden="true">to</i>
                  <span className="pv-day">{day(p.checkOut)}<DayInput label="Check-out" value={p.checkOut} min={addDays(p.checkIn, 1)} onPick={(d) => p.onDates!(p.checkIn, d)} /></span>
                  <i aria-hidden="true">·</i>{nightsWord(p.nights)}
                </span>
              ) : <span><Calendar s={15} />{stayDates(p.checkIn, p.checkOut)}<i aria-hidden="true">·</i>{nightsWord(p.nights)}</span>}
              <span><Person s={15} />{p.guests} {p.guests === 1 ? 'guest' : 'guests'}</span>
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
                          {mk.free && <RoomMark m={mk.free} />}
                          {mk.left && <RoomMark m={mk.left} tone={mk.left.none ? 'warn' : undefined} />}
                          {mk.seen && <RoomMark m={mk.seen} tone={mk.seen.stale ? 'stale' : undefined} />}
                        </ul>
                      )}
                    </span>
                    {booked ? (
                      <span className="pv-booked"><Check s={12} />Booked</span>
                    ) : p.onSelect ? (
                      <button type="button" className="pv-sel" aria-pressed={on} aria-label={on ? `${r.name} is picked` : `Select ${r.name}${pr ? `, ${kr(pr.dkk)} per night` : ''}`} onClick={() => p.onSelect!(r.id)}>
                        {on && <Check s={13} />}{on ? 'Selected' : 'Select'}
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
