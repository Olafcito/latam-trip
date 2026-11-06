import { useId, useState, type ReactNode } from 'react'
import { Caret, Info, Star, Umbrella } from '../icons'

// A stop folded open on the route, in stacked sections: its summary, then where Simon sleeps as large cards, then
// Things to do, Experiences and About as compact rows. A row shows its count and a line of what it holds, and opens
// in place under itself. A row with nothing gathered is not shown, except About, which holds the stop's own acts.

export interface FoldSection {
  /** "2 ideas" */
  count?: string | null
  /** a line of what it holds, "Diving, boat tours, beach clubs" */
  line?: string | null
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

function Row({ title, Icon, s }: { title: string; Icon: (p: { s?: number }) => ReactNode; s: FoldSection }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <li className="fr">
      <button type="button" className="fr-head" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <Icon s={24} />
        <span className="fr-what">
          <span className="fr-t">{title}{s.count && <span className="fr-n">{s.count}</span>}</span>
          {s.line && <span className="fr-s">{s.line}</span>}
        </span>
        <span className="fr-c"><Caret dir="r" s={18} /></span>
      </button>
      <div className="fr-body" id={id} hidden={!open}>{open && s.body}</div>
    </li>
  )
}

export function CityFold({ summary, stays, todo, experiences, about }: CityFoldProps) {
  return (
    <div className="af">
      {summary && <p className="af-sum">{summary}</p>}
      <section className="af-stay" aria-label="Accommodation">{stays}</section>
      {(todo || experiences || about) && (
        <ul className="fr-list">
          {todo && <Row title="Things to do" Icon={Umbrella} s={todo} />}
          {experiences && <Row title="Experiences" Icon={Star} s={experiences} />}
          {about && <Row title="About" Icon={Info} s={about} />}
        </ul>
      )}
    </div>
  )
}
