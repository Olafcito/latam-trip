// The small parts the cards and the lists share: a score's chip and block, a row that opens a card, the lines of a
// card, its quotes and its sources.
import type { CSSProperties, ReactNode } from 'react'
import { capitalise, scoreBars, scoreText, SCORE_MAX, quoteSource, type Fact } from '../data/cardFacts'
import { sourceLabel } from '../data/experiences'
import { scoreTier } from '../data/gyms'
import type { Quote, ScoreCard } from '../data/types'
import { Arrow, Bookmark, Chevron } from './icons'

/** A link out of the app. */
export const away = { target: '_blank', rel: 'noreferrer' } as const

/** A score at a glance. A row with no score keeps the chip's room, so the names still line up. */
export function ScoreChip({ total }: { total: number | null }) {
  return <span className={`mc-chip tier-${scoreTier(total)} mono`}>{total != null && scoreText(total)}</span>
}

/** The total, big, and the five parts as bars from zero. Ported from 21st Rank Bars. */
export function ScoreBlock({ score, total }: { score: ScoreCard | null; total: number | null }) {
  const bars = scoreBars(score)
  if (total == null && !bars.length) return null
  return (
    <div className={`mc-score tier-${scoreTier(total)}`}>
      {total != null && <p className="mc-total mono"><b>{scoreText(total)}</b><span>/{SCORE_MAX}</span></p>}
      <ul className="mc-bars">
        {bars.map((b, i) => (
          <li key={b.key} style={{ '--i': i } as CSSProperties}>
            <span className="mc-bar-l">{b.label}</span>
            <span className="mc-bar"><i style={{ transform: `scaleX(${b.value / SCORE_MAX})` }} /></span>
            <span className="mc-bar-v mono">{b.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export interface CardRowProps {
  name: string
  sub?: ReactNode
  /** The score chip of a gym or a city. */
  lead?: ReactNode
  onClick(): void
}

/** One line of a list, opening its card. Holds no detail: that is what the card is for. */
export function CardRow({ name, sub, lead, onClick }: CardRowProps) {
  return (
    <li>
      <button type="button" className="mc-row" onClick={onClick}>
        {lead}
        <span className="mc-row-t">
          <span className="mc-row-n">{name}</span>
          {sub && <span className="mc-row-s">{sub}</span>}
        </span>
        <span className="cr-arrow"><Arrow s={14} /></span>
      </button>
    </li>
  )
}

/** How a saved row reads under its name. */
export function SavedLine({ note }: { note: string | null | undefined }) {
  return (
    <span className="mc-saved"><Bookmark s={12} filled />{note ? `Saved: ${note}` : 'Saved'}</span>
  )
}

/** A heading over a part of a card. */
export function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="sec-k mono">{title}</p>
      {children}
    </div>
  )
}

/** Numbers side by side. */
export function FactGrid({ facts }: { facts: Fact[] }) {
  if (!facts.length) return null
  return (
    <div className="facts mc-facts">
      {facts.map((f) => (
        <div key={f.label} className="fact"><span className="mono">{f.label}</span><span className="mono">{f.value}</span></div>
      ))}
    </div>
  )
}

/** Lines of text with a label over each, in full. */
export function Lines({ facts }: { facts: Fact[] }) {
  if (!facts.length) return null
  return (
    <dl className="mc-dl">
      {facts.map((f) => (
        <div key={f.label}>
          <dt>{f.label}</dt>
          <dd>{f.href ? <a href={f.href} {...away}>{capitalise(f.value)}</a> : capitalise(f.value)}</dd>
          {f.note && <dd className="fine">{f.note}</dd>}
        </div>
      ))}
    </dl>
  )
}

export function Quotes({ quotes }: { quotes: Quote[] | null | undefined }) {
  if (!quotes?.length) return null
  return (
    <Part title="What people say">
      <ul className="mc-quotes">
        {quotes.map((q, i) => {
          const source = quoteSource(q)
          return (
            <li key={i}>
              <p>{q.quote}</p>
              {source && <p className="mc-said">{q.url ? <a href={q.url} {...away}>{source}</a> : source}</p>}
            </li>
          )
        })}
      </ul>
    </Part>
  )
}

export function Sources({ urls }: { urls: string[] | null | undefined }) {
  if (!urls?.length) return null
  return (
    <details className="mc-src">
      <summary><span>Sources</span><span className="mono">{urls.length}</span><Chevron up={false} /></summary>
      <ul>
        {urls.map((url) => (
          <li key={url}><a href={url} {...away}>{sourceLabel(url)}</a></li>
        ))}
      </ul>
    </details>
  )
}
