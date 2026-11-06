import { useId, useState, type ReactNode } from 'react'
import { Caret, Info, Star, Umbrella } from '../icons'

// A stop folded open on the route, in stacked sections: its summary, then where Simon sleeps as large cards, then
// Things to do, Experiences and About as compact rows. A row is one line, its icon, title and count, and opens in
// place under itself. A row with nothing gathered is not shown, except About, which holds the stop's own acts.

export interface FoldSection {
  /** "2 ideas" */
  count?: string | null
  body: ReactNode
}

export interface CityFoldProps {
  summary?: string | null
  /** the stay cards and the act that adds one */
  stays: ReactNode
  todo?: FoldSection
  experiences?: FoldSection
  about?: FoldSection
}

/**
 * The editorial row: no rule and no pill, the icon, the title, the count as a quiet badge and a chevron that turns.
 * The body is always there and opens by its height, so it opens and shuts smoothly, and it is inert while shut.
 */
function EdRow({ title, Icon, s }: { title: string; Icon: (p: { s?: number }) => ReactNode; s: FoldSection }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <li className="er" data-open={open || undefined}>
      <button type="button" className="er-head" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <span className="er-i"><Icon s={18} /></span>
        <span className="er-t">{title}</span>
        {s.count && <span className="er-n">{s.count}</span>}
        <span className="er-c"><Caret dir="d" s={16} /></span>
      </button>
      <div className="er-body" id={id} inert={!open}><div>{s.body}</div></div>
    </li>
  )
}

export function CityFold({ summary, stays, todo, experiences, about }: CityFoldProps) {
  // the summary is a description, so it waits in About with the rest of the place
  const place = about && { ...about, body: <>{summary && <p className="af-sum">{summary}</p>}{about.body}</> }
  return (
    <div className="af ed">
      <section className="af-stay" aria-label="Accommodation">{stays}</section>
      {(todo || experiences || place) && (
        <ul className="er-list">
          {todo && <EdRow title="Things to do" Icon={Umbrella} s={todo} />}
          {experiences && <EdRow title="Experiences" Icon={Star} s={experiences} />}
          {place && <EdRow title="About" Icon={Info} s={place} />}
        </ul>
      )}
    </div>
  )
}
