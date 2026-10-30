// Experiences and Training in the place panel. A row names the thing and opens its window, the detail stays there.
import { useState, type ReactNode } from 'react'
import { capped } from '../data/cardFacts'
import { categoryLabel } from '../data/experiences'
import { cityName, disciplinesOf, rankGyms, totalOf } from '../data/gyms'
import type { ExperienceCategory } from '../data/types'
import { CardRow, SavedLine, ScoreChip } from './CardParts'
import type { CardRef, MapModeApi } from './useMapMode'

export interface PlaceSectionsProps {
  api: MapModeApi
  categories: ExperienceCategory[] | undefined
  placeId: string
  /** In a view with its own padding, where a section needs none. */
  flush?: boolean
  onCard(ref: CardRef): void
}

export function PlaceSections({ api, categories, placeId, flush, onCard }: PlaceSectionsProps) {
  const exps = api.exps.at(placeId)
  const city = api.gyms.cityOfPlace(placeId)
  const gyms = rankGyms(api.gyms.gymsAtPlace(placeId))
  return (
    <>
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

interface SectionProps<T> {
  title: string
  flush?: boolean
  rows: T[]
  /** A row above the list that the cap does not count. */
  head?: ReactNode
  render(row: T): ReactNode
}

function Section<T>({ title, flush, rows, head, render }: SectionProps<T>) {
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
