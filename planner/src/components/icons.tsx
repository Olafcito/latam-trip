// Icons the planner adds to the map's set: one stroke, round caps, currentColor.
export { Plane, Bus, Boat, Moon, Arrow, Plus, Minus, Close, ModeChip } from '@map/map/icons'

const base = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

/** A layover: a clock. */
export const Clock = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </svg>
)

/** A day stop: the sun. */
export const Sun = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
  </svg>
)

/** A self-transfer between separate tickets: two arrows swapping. */
export const Transfer = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M4 8h13M14 4l4 4-4 4M20 16H7M10 12l-4 4 4 4" />
  </svg>
)

/** Home, for Copenhagen at either end. */
export const Home = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M4 11l8-7 8 7M6 10v10h12V10M10 20v-6h4v6" />
  </svg>
)

/** A landing plane, for the arrival end of a way. */
export const Land = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M3 20h18M3.5 12.5l16 4.3c.6.2 1.2-.2 1.3-.8l.1-.4c.1-.5-.2-1-.7-1.2L15 12l-2-8-2 .5.5 6.5-5-1.5-1.5-3-2 .5z" />
  </svg>
)

/** A calendar, for dates. */
export const Calendar = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
)

/** A bag, for cabin and checked bag fees. */
export const Bag = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <rect x="4" y="8" width="16" height="13" rx="3" />
    <path d="M9 8V5a3 3 0 0 1 6 0v3" />
  </svg>
)

/** A warning triangle. */
export const Warn = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M12 4 2.5 20h19zM12 10v4M12 17.5v.5" />
  </svg>
)

/** A map pin, for opening a trip on the map. */
export const Pin = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M12 21s6-6.5 6-11a6 6 0 1 0-12 0c0 4.5 6 11 6 11z" />
    <circle cx="12" cy="10" r="2.2" />
  </svg>
)

/** A download arrow, for exports. */
export const Download = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M12 4v11M7 10l5 5 5-5M4 20h16" />
  </svg>
)

/** A trash can. */
export const Trash = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v6M14 11v6" />
  </svg>
)

/** A drag handle: two columns of dots. */
export const Grip = ({ s = 14 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={3} {...base}>
    <path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" />
  </svg>
)

/** Opens elsewhere: an arrow out of a box. */
export const External = ({ s = 12 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
)

/** A month back or on, in the calendar. */
export const Caret = ({ s = 14, dir }: { s?: number; dir: 'l' | 'r' }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d={dir === 'l' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
  </svg>
)
