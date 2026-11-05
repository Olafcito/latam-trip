import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Bed, Info, List, Star } from '../icons'

// A stop folded open on the route: its summary, then tabs for where to sleep, what to do, the experiences
// found there and the rest about it. Accommodation comes first and is open when the fold opens. The tabs
// are one row, the open one underlined in the text colour. The count of stays sits in its label, as "Accommodation (2)".
// When the fold is narrow each tab stacks its icon over its label.

export type FoldTab = 'stay' | 'todo' | 'exp' | 'about'

export interface CityFoldProps {
  summary?: string | null
  stays: { count: number; body: ReactNode }
  todo?: ReactNode
  experiences?: ReactNode
  about?: ReactNode
  /** the tab open first */
  start?: FoldTab
}

const TABS: { id: FoldTab; label: string; Icon: (p: { s?: number }) => ReactNode }[] = [
  { id: 'stay', label: 'Accommodation', Icon: Bed },
  { id: 'todo', label: 'Things to do', Icon: List },
  { id: 'exp', label: 'Experiences', Icon: Star },
  { id: 'about', label: 'About', Icon: Info },
]

const Empty = () => <p className="af-none">Nothing gathered for this place yet.</p>

export function CityFold({ summary, stays, todo, experiences, about, start = 'stay' }: CityFoldProps) {
  const [tab, setTab] = useState<FoldTab>(start)
  const id = useId()
  const bar = useRef<HTMLDivElement>(null)
  const body: Record<FoldTab, ReactNode> = { stay: stays.body, todo: todo ?? <Empty />, exp: experiences ?? <Empty />, about: about ?? <Empty /> }
  // arrows move along the tabs and open the one they land on, as tabs do
  const onKey = (e: KeyboardEvent) => {
    const k = TABS.findIndex((t) => t.id === tab)
    const to = e.key === 'ArrowRight' ? k + 1 : e.key === 'ArrowLeft' ? k - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : null
    if (to == null) return
    e.preventDefault()
    const next = TABS[(to + TABS.length) % TABS.length].id
    setTab(next)
    bar.current?.querySelector<HTMLButtonElement>(`[data-tab='${next}']`)?.focus()
  }
  return (
    <div className="af">
      {summary && <p className="af-sum">{summary}</p>}
      <div ref={bar} className="af-tabs" role="tablist" aria-label="About this stop" onKeyDown={onKey}>
        {TABS.map(({ id: t, label, Icon }) => (
          <button
            key={t} type="button" role="tab" data-tab={t} id={`${id}-${t}`} aria-selected={tab === t} aria-controls={`${id}-p`} tabIndex={tab === t ? 0 : -1}
            className="af-tab" onClick={() => setTab(t)}
          >
            <Icon s={17} />
            <span>{t === 'stay' && stays.count > 0 ? `${label} (${stays.count})` : label}</span>
          </button>
        ))}
      </div>
      <div className="af-panel" role="tabpanel" id={`${id}-p`} aria-labelledby={`${id}-${tab}`}>{body[tab]}</div>
    </div>
  )
}
