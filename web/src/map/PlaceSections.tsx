// Saved places, Experiences and Training in the place panel. A row names the thing and opens its window, the detail stays there.
import { useState, type ReactNode } from 'react'
import { capped } from '../data/cardFacts'
import { categoryLabel } from '../data/experiences'
import { cityName, disciplinesOf, rankGyms, totalOf } from '../data/gyms'
import type { ExperienceCategory, Experience } from '../data/types'
import { CardRow, SavedLine, ScoreChip } from './CardParts'
import type { CardRef, MapModeApi } from './useMapMode'

export interface PlaceSectionsProps {
  api: MapModeApi
  categories: ExperienceCategory[] | undefined
  placeId: string
  /** In a view with its own padding, where a section needs none. */
  flush?: boolean
  /** Lead with what is saved at the place, and keep those rows out of the sections under it. */
  withSaved?: boolean
  onCard(ref: CardRef): void
}

/** Something saved at a place, an experience or a gym, with the note it was saved with. */
export interface SavedRow {
  ref: CardRef
  name: string
  note: string | null
  /** The category of an experience, the disciplines of a gym. */
  category: string
  score?: number | null
}

/** What is saved at a place: its experiences in list order, then its gyms by score. */
export function savedAt(api: MapModeApi, categories: ExperienceCategory[] | undefined, placeId: string): SavedRow[] {
  const exps = api.exps.at(placeId).flatMap((e: Experience): SavedRow[] => {
    const mark = api.exps.markOf('experience', e.id)
    return mark ? [{ ref: { kind: 'experience', id: e.id }, name: e.name, note: mark.note, category: categoryLabel(categories, e.category) }] : []
  })
  const gyms = rankGyms(api.gyms.gymsAtPlace(placeId)).flatMap((g): SavedRow[] => {
    const mark = api.exps.markOf('experience', g.id)
    return mark ? [{ ref: { kind: 'gym', id: g.id }, name: g.name, note: mark.note, category: disciplinesOf(g).join(', '), score: totalOf(g) }] : []
  })
  return [...exps, ...gyms]
}

export function PlaceSections({ api, categories, placeId, flush, withSaved, onCard }: PlaceSectionsProps) {
  const saved = withSaved ? savedAt(api, categories, placeId) : []
  const held = new Set(saved.map((s) => s.ref.id))
  const exps = api.exps.at(placeId).filter((e) => !held.has(e.id))
  const city = api.gyms.cityOfPlace(placeId)
  const gyms = rankGyms(api.gyms.gymsAtPlace(placeId)).filter((g) => !held.has(g.id))
  return (
    <>
      {!!saved.length && (
        <Section title="Saved places" flush={flush} rows={saved} render={(r) => (
          <CardRow
            key={r.ref.id}
            name={r.name}
            sub={r.note || r.category}
            lead={r.score !== undefined ? <ScoreChip total={r.score} /> : undefined}
            onClick={() => onCard(r.ref)}
          />
        )} />
      )}
      {!!exps.length && (
        <Section title="Experiences" flush={flush} rows={exps} render={(e) => {
          const saved = api.exps.markOf('experience', e.id)
          return (
            <CardRow
              key={e.id}
              name={e.name}
              sub={saved ? <SavedLine note={saved.note} /> : categoryLabel(categories, e.category)}
              onClick={() => onCard({ kind: 'experience', id: e.id })}
            />
          )
        }} />
      )}
      {!!(city || gyms.length) && (
        <Section
          title="Training"
          flush={flush}
          rows={gyms}
          head={city && (
            <CardRow name={cityName(city)} sub="City scorecard" lead={<ScoreChip total={totalOf(city)} />} onClick={() => onCard({ kind: 'city', id: city.id })} />
          )}
          render={(g) => (
            <CardRow
              key={g.id}
              name={g.name}
              sub={disciplinesOf(g).join(', ')}
              lead={<ScoreChip total={totalOf(g)} />}
              onClick={() => onCard({ kind: 'gym', id: g.id })}
            />
          )}
        />
      )}
    </>
  )
}

export interface SectionProps<T> {
  title: string
  flush?: boolean
  rows: T[]
  /** A row above the list that the cap does not count. */
  head?: ReactNode
  render(row: T): ReactNode
}

export function Section<T>({ title, flush, rows, head, render }: SectionProps<T>) {
  const [open, setOpen] = useState(false)
  const { shown, folded } = capped(rows, open)
  return (
    <section className={`mc-sec${flush ? ' flush' : ''}`} aria-label={title}>
      <div className="sechead">
        <p className="sub">{title}</p>
        {rows.length > 0 && <p className="sub mono">{rows.length}</p>}
      </div>
      <ul className={`clist${flush ? ' flush' : ''}`}>
        {head}
        {shown.map(render)}
      </ul>
      {folded > 0 && <button type="button" className="mc-more" onClick={() => setOpen(true)}>Show all {rows.length}</button>}
    </section>
  )
}
