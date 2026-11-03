import type { ReactElement } from 'react'
import type { Mark, MarkKind } from '../../lib/marks'
import { Bag, Calendar, Home, Hop, Hourglass, Land, Moon, Passport, Sun, Suitcase, Transfer, Warn } from '../icons'

// The marks of a flight or way row: an icon in the app's set, a short figure beside it only when the
// figure is the point, and the tone as its colour. The whole fact is its tooltip and its accessible name.

const ICON: Record<MarkKind, () => ReactElement> = {
  cabin: () => <Bag />, checked: () => <Suitcase />, night: () => <Moon />, moon: () => <Moon />, day: () => <Sun />,
  wait: () => <Hourglass />, self: () => <Transfer />, airport: () => <Hop />, stopover: () => <Calendar />,
  esta: () => <Passport />, late: () => <Warn />, home: () => <Home />, in: () => <Land />,
}

/** One mark as an icon pill, or a bare icon when it has no figure and sits inline. */
export function MarkIcon({ m, bare }: { m: Mark; bare?: boolean }) {
  const Icon = ICON[m.kind]
  return (
    <span className={bare ? 'mk-i' : 'mk'} data-tone={m.tone} data-kind={m.kind} title={m.label} role="img" aria-label={m.label}>
      <Icon />
      {m.text && !bare && <span aria-hidden="true">{m.text}</span>}
    </span>
  )
}

/** The row's own marks, under the times, in the order the helper gave them. */
export function Marks({ list }: { list: Mark[] }) {
  if (!list.length) return null
  return (
    <ul className="fl-marks">
      {list.map((m) => <li key={m.kind + m.label}><MarkIcon m={m} /></li>)}
    </ul>
  )
}
