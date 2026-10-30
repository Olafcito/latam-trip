import type { Family } from '../data/types'

const base = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

export const Plane = ({ s = 12 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.4} {...base}>
    <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
  </svg>
)

export const Bus = ({ s = 12 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.4} {...base}>
    <rect x="4" y="3" width="16" height="14" rx="3" />
    <path d="M4 10h16M8 20v-3M16 20v-3" />
  </svg>
)

export const Boat = ({ s = 12 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.4} {...base}>
    <path d="M3 15h18l-2.5 5h-13zM12 3v12M12 4l6 8h-6" />
  </svg>
)

export const Moon = () => (
  <svg width={13} height={13} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
  </svg>
)

export const Flag = () => (
  <svg width={13} height={13} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </svg>
)

export const Arrow = ({ s = 16 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.4} {...base}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)

export const Back = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" strokeWidth={2.4} {...base}>
    <path d="M15 6l-6 6 6 6" />
  </svg>
)

export const Close = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" strokeWidth={2} {...base}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

export const Chevron = ({ up }: { up: boolean }) => (
  <svg width={18} height={18} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
  </svg>
)

export const Plus = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const Minus = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M5 12h14" />
  </svg>
)

export const Fit = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" strokeWidth={2} {...base}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
)

/** The boxing glove, thumb on the left and cuff apart. The map draws its markers from the same paths. */
export const GLOVE = {
  body: 'M7.6 16.6C6.4 15.2 5.6 14 4.6 13 3.2 11.6 2.9 10 3.8 9 4.8 7.9 6.6 8.2 7.8 9.4 8 5.6 10.4 2.6 14 2.6 18.2 2.6 21 6 21 10.2 21 12.8 19.8 15 18 16.6Z',
  cuff: 'M7.6 18h10.4v2.4a1 1 0 0 1-1 1H8.6a1 1 0 0 1-1-1z',
  thumb: 'M7.8 9.4c.1 1.7 1.1 3 2.8 3.5',
}

export const BOOKMARK = 'M6.5 3.5h11a1.5 1.5 0 0 1 1.5 1.5v15.6a.4.4 0 0 1-.63.33L12 16.5l-6.37 4.43A.4.4 0 0 1 5 20.6V5a1.5 1.5 0 0 1 1.5-1.5z'

export const Glove = ({ s = 16 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2} {...base}>
    <path d={GLOVE.body} />
    <path d={GLOVE.cuff} />
    <path d={GLOVE.thumb} />
  </svg>
)

export const Bookmark = ({ s = 16, filled = false }: { s?: number; filled?: boolean }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2} {...base}>
    <path d={BOOKMARK} fill={filled ? 'currentColor' : 'none'} />
  </svg>
)

export function ModeChip({ family, lg }: { family: Family; lg?: boolean }) {
  const s = lg ? 15 : 12
  return (
    <span className={`mchip ${family}${lg ? ' lg' : ''}`}>
      {family === 'flight' ? <Plane s={s} /> : family === 'boat' ? <Boat s={s} /> : <Bus s={s} />}
    </span>
  )
}
