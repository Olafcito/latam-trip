import type { Family } from '@map/data/types'
import { Boat, Plane } from '../icons'

// How a leg is travelled, one mark for the map's bar: a plane, a boat, or a bus seen from the front
// with its windscreen, lights and two wheels, so it reads as a bus at 16 px.

const base = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

export const BusFront = ({ s = 12 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M6 18V5.5C6 4 7.5 3 12 3s6 1 6 2.5V18z" />
    <path d="M6 11h12M8.5 14.8h.01M15.5 14.8h.01M8 18v2.5M16 18v2.5" />
  </svg>
)

export function LegGlyph({ mode, s = 12 }: { mode: Family; s?: number }) {
  return mode === 'flight' ? <Plane s={s} /> : mode === 'boat' ? <Boat s={s} /> : <BusFront s={s} />
}
