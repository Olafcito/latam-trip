import { useId, useState, type ReactNode } from 'react'
import { capped, scoreText, SCORE_MAX } from '../data/cardFacts'
import { kr } from '../lib/format'
import type { CityFind, CityFinds } from './cityFacts'
import { Flag, hasFlag } from './Flag'
import { Arrow, Bookmark, Info, Lock } from './icons'
import './city.css'

// One city, the same in the trip sheet and in the map's place panel. The photo, the name with its country,
// the line that sells it and, on a stop of the open trip, its nights large beside the dates. Then whatever
// the frame puts in the stay slot, the experiences, the places to train, the guide text folded behind About,
// and whatever the frame adds last. It reads a view model, never the store, so both apps can fill it.

export interface CityImage {
  url: string
  credit?: string | null
  licence?: string | null
  /** the photo's page on Wikimedia Commons */
  page?: string | null
}

export interface CityStop {
  nights: number
  /** check in to check out, as the app says dates */
  range: string
  /** the first stop, where the flight lands: it cannot move */
  fixed?: boolean
}

export interface CityAbout {
  summary?: string | null
  /** 1 to 5 */
  touristy?: number | null
  /** said already, like 2.640 m */
  altitude?: string | null
}

export interface CityBodyProps {
  name: string
  /** the country code, for the flag */
  country: string
  countryName: string
  tagline?: string | null
  image?: CityImage | null
  /** the city as a stop of the open trip, or nothing */
  stop?: CityStop | null
  finds: CityFinds
  about: CityAbout
  /** buttons in the top corner, like close */
  actions?: ReactNode
  /** where to stay, in the planner */
  stay?: ReactNode
  /** what the frame adds last, like the connections on the map */
  extra?: ReactNode
  onFind: (f: CityFind) => void
}

const creditOf = (img: CityImage) => {
  const who = [img.credit, img.licence].filter(Boolean).join(', ')
  return who ? `Photo by ${who}, Wikimedia Commons` : 'Photo from Wikimedia Commons'
}

function Hero({ img }: { img: CityImage }) {
  const [bad, setBad] = useState(false)
  const [open, setOpen] = useState(false)
  if (bad) return null
  const credit = creditOf(img)
  return (
    <figure className="cy-hero">
      <img src={img.url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBad(true)} />
      {open && (
        <figcaption className="cy-credit-t">
          <a href={img.page ?? img.url} target="_blank" rel="noreferrer">{credit}</a>
        </figcaption>
      )}
      <button type="button" className="cy-credit cy-tip" aria-label={credit} data-tip={open ? undefined : credit} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Info s={14} />
      </button>
    </figure>
  )
}

function Row({ f, onFind }: { f: CityFind; onFind: (f: CityFind) => void }) {
  const sub = f.saved
    ? <small className="cy-saved"><Bookmark s={11} filled />{f.note || 'Saved'}</small>
    : f.sub && <small className="cy-sub">{f.sub}</small>
  const meta = (f.chips.length > 0 || f.dropIn != null) && (
    <span className="cy-meta">
      {f.chips.map((c) => <span key={c} className="cy-chip" data-bjj={c === 'BJJ' || undefined}>{c}</span>)}
      {f.dropIn != null && <span className="cy-drop">Drop in {kr(f.dropIn)}</span>}
    </span>
  )
  const body = (
    <>
      <span className="cy-row-t">
        <b>{f.name}</b>
        {sub}
        {meta}
      </span>
      {f.score != null && <span className="cy-score" aria-label={`Score ${scoreText(f.score)} of ${SCORE_MAX}`}>{scoreText(f.score)}</span>}
    </>
  )
  return (
    <li>
      {f.ref ? (
        <button type="button" className="cy-row" onClick={() => onFind(f)}>
          {body}
          <span className="cy-arr" aria-hidden="true"><Arrow s={14} /></span>
        </button>
      ) : <div className="cy-row" data-plain>{body}</div>}
    </li>
  )
}

function Section({ title, rows, onFind }: { title: string; rows: CityFind[]; onFind: (f: CityFind) => void }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  if (!rows.length) return null
  const { shown, folded } = capped(rows, open)
  return (
    <section className="cy-sec" aria-labelledby={id}>
      <h3 id={id} className="cy-h">{title}</h3>
      <ul className="cy-rows">
        {shown.map((f, k) => <Row key={f.ref ? `${f.ref.kind}-${f.ref.id}` : `t-${k}-${f.name}`} f={f} onFind={onFind} />)}
      </ul>
      {folded > 0 && <button type="button" className="cy-more" onClick={() => setOpen(true)}>Show all {rows.length}</button>}
    </section>
  )
}

function Meter({ n }: { n: number }) {
  const v = Math.max(0, Math.min(5, Math.round(n)))
  return (
    <span className="cy-meter" role="img" aria-label={`${v} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => <i key={i} data-on={i <= v || undefined} />)}
    </span>
  )
}

function About({ name, about }: { name: string; about: CityAbout }) {
  const { summary, touristy, altitude } = about
  if (!summary && touristy == null && !altitude) return null
  return (
    <details className="cy-about">
      <summary><span>About {name}</span><span className="cy-caret" aria-hidden="true" /></summary>
      <div className="cy-about-b">
        {summary && <p>{summary}</p>}
        {(touristy != null || altitude) && (
          <dl className="cy-facts">
            {touristy != null && <div><dt>Touristy</dt><dd><Meter n={touristy} /></dd></div>}
            {altitude && <div><dt>Altitude</dt><dd>{altitude}</dd></div>}
          </dl>
        )}
      </div>
    </details>
  )
}

export function CityBody(p: CityBodyProps) {
  const { stop } = p
  return (
    <div className="cy" data-hero={p.image ? true : undefined}>
      {p.image && <Hero key={p.image.url} img={p.image} />}
      {p.actions && <div className="cy-actions">{p.actions}</div>}
      <header className="cy-head">
        <div className="cy-title">
          <h2 className="cy-name">{p.name}</h2>
          <p className="cy-country">{hasFlag(p.country) && <Flag code={p.country} size={11} />}{p.countryName}</p>
        </div>
        {p.tagline && <p className="cy-tag">{p.tagline}</p>}
        {stop && (
          <p className="cy-stop">
            {stop.nights > 0 ? (
              <>
                <span className="cy-n">{stop.nights}</span>
                <span className="cy-nw">{stop.nights === 1 ? 'night' : 'nights'}</span>
              </>
            ) : <span className="cy-nw">Passing through</span>}
            <span className="cy-range">{stop.range}</span>
            {stop.fixed && (
              <span className="cy-lock cy-tip" role="img" tabIndex={0} aria-label="The flight lands here" data-tip="The flight lands here"><Lock s={13} /></span>
            )}
          </p>
        )}
      </header>
      {p.stay}
      <Section title="Experiences" rows={p.finds.experiences} onFind={p.onFind} />
      <Section title="Training" rows={p.finds.training} onFind={p.onFind} />
      <About name={p.name} about={p.about} />
      {p.extra && <div className="cy-extra">{p.extra}</div>}
    </div>
  )
}
