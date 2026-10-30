// The one window a gym, a city or an experience opens in, from a list, a marker or a place panel. Beside the panel
// on a wide map, over it on a narrow one, and a sheet on a phone. Its cards stack, so Back walks back through them.
import { useLayoutEffect, useRef, useState, type Ref } from 'react'
import {
  capitalise,
  cardPhoto,
  cityCostFacts,
  cityLines,
  experienceLines,
  gymLines,
  gymPrices,
  gymRatings,
  hostelFacts,
  indexFacts,
  numbeoFacts,
  plainNote,
} from '../data/cardFacts'
import { categoryLabel, detailLines } from '../data/experiences'
import { cityName, disciplinesOf, gymLinks, monthlyCost, otherDisciplines, rankGyms, scoreOf, totalOf } from '../data/gyms'
import { countryName, type Model } from '../data/model'
import type { CityRow, Experience, GymRow, Place } from '../data/types'
import { kr, observed } from '../lib/format'
import { CardRow, FactGrid, Lines, Part, Quotes, SavedLine, ScoreBlock, ScoreChip, Sources, away } from './CardParts'
import { Flag as CountryFlag } from './Flag'
import { Back, Chevron, Close } from './icons'
import { sized } from './Panel'
import type { CardRef, MapModeApi } from './useMapMode'

export interface CardWindowProps {
  api: MapModeApi
  model: Model
  /** The card's left edge in the map, or null on a phone, where it is a sheet. */
  left: number | null
  cardRef: Ref<HTMLElement>
  /** What Back returns to: the card before, or the panel under this one. Null when nothing is behind it. */
  backTo: string | null
  /** One card back. */
  onBack(): void
  /** Closes every card. */
  onClose(): void
  /** A link inside a card: stacks the new card on this one. */
  onOpen(ref: CardRef): void
  /** Brings a card's marker into view and keeps the stack as it is. */
  onShow(ref: CardRef): void
}

export function CardWindow({ api, model, left, cardRef, backTo, onBack, onClose, onOpen, onShow }: CardWindowProps) {
  const card = api.card!
  const title = api.titleOf(card)
  // on a phone the window covers the map, so showing a marker folds it down to a bar. The next card starts open
  const [peeked, setPeeked] = useState<CardRef | null>(null)
  const peek = left == null && peeked === card
  const show = () => {
    setPeeked(card)
    onShow(card)
  }
  // going back slides in from the side it left to, and finds the card where it was left
  const depth = api.stack.length
  const [seen, setSeen] = useState({ depth, back: false })
  if (seen.depth !== depth) setSeen({ depth, back: depth < seen.depth })
  const scroller = useRef<HTMLDivElement>(null)
  const tops = useRef(new WeakMap<CardRef, number>())
  // a keyboard lands in the card, and goes back to what opened it when the last card closes
  useLayoutEffect(() => {
    const from = document.activeElement as HTMLElement | null
    return () => {
      if (from?.isConnected && from !== document.body) from.focus({ preventScroll: true })
    }
  }, [])
  useLayoutEffect(() => {
    if (!scroller.current) return
    scroller.current.scrollTop = tops.current.get(card) ?? 0
    scroller.current.focus({ preventScroll: true })
  }, [card, peek])

  if (peek) {
    return (
      <section ref={cardRef} className="panel mcard peek" aria-label={title ?? 'Card'}>
        <div className="mc-head">
          <button className="mc-peek" aria-label={`Open ${title ?? 'card'}`} onClick={() => setPeeked(null)}>
            <span>{title}</span>
            <Chevron up />
          </button>
          <button className="x" aria-label="Close" onClick={onClose}><Close /></button>
        </div>
      </section>
    )
  }

  return (
    <section ref={cardRef} className="panel mcard" style={left == null ? undefined : { left }} aria-label={title ?? 'Card'}>
      <div className={`mc-head${backTo ? '' : ' solo'}`}>
        {backTo && <button className="back" onClick={onBack}><Back /><span>Back to {backTo}</span></button>}
        <button className="x" aria-label="Close" onClick={onClose}><Close /></button>
      </div>
      <div
        key={`${card.kind}:${card.id}:${depth}`}
        ref={scroller}
        tabIndex={-1}
        className={`pview${seen.back ? ' mc-back' : ''}`}
        onScroll={(e) => tops.current.set(card, e.currentTarget.scrollTop)}
      >
        <div className="pbody">
          <Body api={api} model={model} card={card} onOpen={onOpen} onShow={show} />
        </div>
      </div>
    </section>
  )
}

interface BodyProps {
  api: MapModeApi
  model: Model
  card: CardRef
  onOpen(ref: CardRef): void
  onShow(): void
}

function Body({ api, model, card, onOpen, onShow }: BodyProps) {
  if (card.kind === 'experience') {
    const e = api.exps.byId.get(card.id)
    return e ? <ExperienceCard e={e} api={api} model={model} onShow={onShow} /> : null
  }
  const row = api.gyms.byId.get(card.id)
  if (!row) return null
  return card.kind === 'gym'
    ? <GymCard g={row as GymRow} api={api} model={model} onShow={onShow} />
    : <CityCard c={row as CityRow} api={api} model={model} onOpen={onOpen} onShow={onShow} />
}

function Where({ model, country, area }: { model: Model; country: string | null | undefined; area?: string | null }) {
  const land = country ? countryName(model, country) : null
  const text = [area, land].filter(Boolean).join(', ')
  if (!text) return null
  return <p className="kicker mc-where">{country && <CountryFlag code={country} size={11} />}<span>{text}</span></p>
}

function Photo({ row, name }: { row: Pick<Experience, 'image' | 'image_source'>; name: string }) {
  const [failed, setFailed] = useState(false)
  const img = cardPhoto(row)
  if (!img || failed) return null
  return (
    <div>
      <div className="hero">
        <img src={sized(img.url, 960)} alt={name} width={img.w ?? undefined} height={img.h ?? undefined} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      </div>
      <p className="credit mono">
        Photo: <a href={img.page ?? img.url} {...away}>{img.credit || 'Unknown'}</a>
        {img.licence ? ` · ${img.licence}` : ''}, Wikimedia Commons
      </p>
    </div>
  )
}

/** When the row was last checked, at the foot of its card. */
function Checked({ at }: { at: string | null | undefined }) {
  return at ? <p className="fine">Checked {observed(at)}</p> : null
}

function GymCard({ g, api, model, onShow }: { g: GymRow; api: MapModeApi; model: Model; onShow(): void }) {
  const d = g.details
  const cost = monthlyCost(g, api.gyms.cityOf.get(g.id))
  const prices = gymPrices(g)
  const rated = gymRatings(g)
  const chips = disciplinesOf(g)
  const others = otherDisciplines(g)
  const note = plainNote(d?.score_note)
  return (
    <>
      <Photo row={g} name={g.name} />
      <div>
        <h2 className="pname mc-name">{g.name}</h2>
        <Where model={model} country={g.country} area={g.area} />
      </div>
      {!!(chips.length || others.length || d?.gym_kind) && (
        <div className="tags">
          {chips.map((c) => <span key={c} className="tag">{c}</span>)}
          {others.map((c) => <span key={c} className="tag mc-kind">{capitalise(c)}</span>)}
          {d?.gym_kind && <span className="tag mc-kind">{capitalise(d.gym_kind)}</span>}
        </div>
      )}
      <ScoreBlock score={scoreOf(g)} total={totalOf(g)} />
      {!!(rated.length || d?.last_activity) && (
        <Lines facts={[...rated, ...(d?.last_activity ? [{ label: 'Last activity', value: d.last_activity }] : [])]} />
      )}
      <div className="mc-actions">
        <div className="mc-links">
          {gymLinks(g).map((l) => (
            <a key={l.kind} className="mc-link" href={l.href} {...(l.kind === 'call' ? {} : away)}>{l.label}</a>
          ))}
          <button type="button" className="mc-link" onClick={onShow}>Show on map</button>
        </div>
        <Sources urls={g.sources} />
      </div>
      {g.summary && <p className="p-sum">{g.summary}</p>}
      {!!(prices.length || g.price) && (
        <Part title="Prices">
          <FactGrid facts={prices} />
          {g.price && <p className="fine">{g.price}</p>}
        </Part>
      )}
      {cost && (
        <Part title="Monthly estimate">
          <ul className="hostels">
            <li><span>Living</span><span className="mono">{kr(cost.living)}</span></li>
            <li><span>Gym</span><span className="mono">{cost.gym != null ? kr(cost.gym) : 'Not published'}</span></li>
            <li className="mc-sum"><span>Total</span><span className="mono">{kr(cost.total)}</span></li>
          </ul>
        </Part>
      )}
      <Lines facts={gymLines(g)} />
      <Quotes quotes={d?.what_people_say} />
      {note && <p className="fine">{note}</p>}
      <Checked at={g.checked_at} />
    </>
  )
}

function CityCard({ c, api, model, onOpen, onShow }: { c: CityRow; api: MapModeApi; model: Model; onOpen(ref: CardRef): void; onShow(): void }) {
  const d = c.details
  const n = d?.numbeo
  const h = d?.hostels
  const name = cityName(c)
  const gyms = rankGyms(api.gyms.gymsOf(c))
  const month = numbeoFacts(c)
  const indices = indexFacts(c)
  const hostels = hostelFacts(c)
  const peopleNote = plainNote(n?.contributors_note)
  return (
    <>
      <Photo row={c} name={name} />
      <div>
        <h2 className="pname mc-name">{name}</h2>
        <Where model={model} country={c.country} />
      </div>
      {c.summary && <p className="p-sum">{c.summary}</p>}
      <ScoreBlock score={scoreOf(c)} total={totalOf(c)} />
      {!!month.length && (
        <Part title="A month here">
          <FactGrid facts={month} />
          {n?.proxy_for && <p className="fine">Figures from {n.proxy_for}.</p>}
          {peopleNote && <p className="fine">{peopleNote}</p>}
          {n?.observed && <p className="fine">Read from Numbeo {observed(n.observed)}</p>}
          {n?.numbeo_url && <a className="mc-link mc-out" href={n.numbeo_url} {...away}>Numbeo</a>}
        </Part>
      )}
      <FactGrid facts={cityCostFacts(c)} />
      {d?.monthly_note && <p className="fine">{d.monthly_note}</p>}
      {d?.price_note && <p className="fine">{d.price_note}</p>}
      {!!(hostels.length || h?.names?.length || h?.source) && (
        <Part title="Hostels">
          <FactGrid facts={hostels} />
          {!!h?.names?.length && <p className="fine">{h.names.join(', ')}</p>}
          {h?.source && <p className="fine">{h.source}</p>}
        </Part>
      )}
      {!!indices.length && (
        <Part title="Rankings">
          <Lines facts={indices} />
          {d?.indices?.observed && <p className="fine">Read {observed(d.indices.observed)}</p>}
        </Part>
      )}
      <Lines facts={cityLines(c)} />
      <Quotes quotes={d?.what_people_say} />
      {!!gyms.length && (
        <Part title={gyms.length === 1 ? '1 gym' : `${gyms.length} gyms`}>
          <ul className="clist flush">
            {gyms.map((g) => (
              <CardRow
                key={g.id}
                name={g.name}
                sub={g.id === d?.best_gym ? 'Best gym' : disciplinesOf(g).join(', ')}
                lead={<ScoreChip total={totalOf(g)} />}
                onClick={() => onOpen({ kind: 'gym', id: g.id })}
              />
            ))}
          </ul>
        </Part>
      )}
      <div className="mc-actions">
        <div className="mc-links"><button type="button" className="mc-link" onClick={onShow}>Show on map</button></div>
        <Sources urls={c.sources} />
      </div>
      <Checked at={c.checked_at} />
    </>
  )
}

function ExperienceCard({ e, api, model, onShow }: { e: Experience; api: MapModeApi; model: Model; onShow(): void }) {
  const saved = api.exps.markOf('experience', e.id)
  const details = detailLines(e.details as Record<string, unknown> | null | undefined)
  const place: Place | undefined = model.byId.get(api.exps.placeOf(e.id) ?? '')
  const links = details.filter((l) => l.href)
  const area = e.area ?? (place?.short_name || null)
  const lines = experienceLines(e)
  return (
    <>
      <Photo row={e} name={e.name} />
      <div>
        <h2 className="pname mc-name">{e.name}</h2>
        <Where model={model} country={e.country} area={area} />
      </div>
      <div className="tags">
        <span className="tag">{categoryLabel(model.data.categories, e.category)}</span>
        {e.tags?.map((t) => <span key={t} className="tag mc-kind">{capitalise(t.replace(/-/g, ' '))}</span>)}
      </div>
      {saved && <p className="note mc-note"><SavedLine note={saved.note} /></p>}
      {e.summary && <p className="p-sum">{e.summary}</p>}
      {!!(e.price || e.price_dkk != null) && (
        <Part title="Price">
          {e.price_dkk != null && <p className="mc-price mono">{kr(e.price_dkk)}</p>}
          {e.price && <p className="fine">{e.price}</p>}
        </Part>
      )}
      <Lines facts={details.filter((l) => !l.href)} />
      <Lines facts={lines} />
      <div className="mc-actions">
        <div className="mc-links">
          {links.map((l) => <a key={l.key} className="mc-link" href={l.href!} {...away}>{l.label}</a>)}
          <button type="button" className="mc-link" onClick={onShow}>Show on map</button>
        </div>
        <Sources urls={e.sources} />
      </div>
      {!e.researched && !e.summary && <p className="fine">Not researched yet.</p>}
      <Checked at={e.checked_at} />
    </>
  )
}
