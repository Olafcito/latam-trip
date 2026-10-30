import type { JSX } from 'react'

// Small flags drawn as svg, so they look the same on Windows, which has no flag emoji.
// Simplified on purpose: stripes and the one mark that tells two look-alikes apart, no coats of arms.
// Every flag is drawn on a 30 by 20 box.

type Draw = () => JSX.Element

const h3 = (a: string, b: string, c: string): Draw => () => (
  <>
    <rect width="30" height="20" fill={b} />
    <rect width="30" height="6.67" fill={a} />
    <rect y="13.33" width="30" height="6.67" fill={c} />
  </>
)
const v3 = (a: string, b: string, c: string): Draw => () => (
  <>
    <rect width="30" height="20" fill={b} />
    <rect width="10" height="20" fill={a} />
    <rect x="20" width="10" height="20" fill={c} />
  </>
)
const mark = (base: Draw, el: JSX.Element): Draw => () => (
  <>
    {base()}
    {el}
  </>
)

const FLAGS: Record<string, Draw> = {
  MX: mark(v3('#006847', '#FFFFFF', '#CE1126'), <circle cx="15" cy="10" r="2.2" fill="#8C6A3F" />),
  GT: mark(v3('#4997D0', '#FFFFFF', '#4997D0'), <circle cx="15" cy="10" r="2.2" fill="#6A9A4A" />),
  SV: mark(h3('#0F47AF', '#FFFFFF', '#0F47AF'), <circle cx="15" cy="10" r="2" fill="#C9A227" />),
  NI: mark(h3('#0067C6', '#FFFFFF', '#0067C6'), <path d="M15 7.6 17.4 12h-4.8z" fill="#0067C6" />),
  HN: mark(
    h3('#00BCE4', '#FFFFFF', '#00BCE4'),
    <g fill="#00BCE4">
      {[[11, 8.4], [19, 8.4], [15, 10], [11, 11.6], [19, 11.6]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="1" />)}
    </g>,
  ),
  CR: () => (
    <>
      <rect width="30" height="20" fill="#002B7F" />
      <rect y="3.33" width="30" height="13.33" fill="#FFFFFF" />
      <rect y="6.67" width="30" height="6.67" fill="#CE1126" />
    </>
  ),
  PA: () => (
    <>
      <rect width="30" height="20" fill="#FFFFFF" />
      <rect x="15" width="15" height="10" fill="#DA121A" />
      <rect y="10" width="15" height="10" fill="#072357" />
      <circle cx="7.5" cy="5" r="2" fill="#072357" />
      <circle cx="22.5" cy="15" r="2" fill="#DA121A" />
    </>
  ),
  CO: () => (
    <>
      <rect width="30" height="20" fill="#CE1126" />
      <rect width="30" height="15" fill="#003893" />
      <rect width="30" height="10" fill="#FCD116" />
    </>
  ),
  EC: () => (
    <>
      <rect width="30" height="20" fill="#ED1C24" />
      <rect width="30" height="15" fill="#034EA2" />
      <rect width="30" height="10" fill="#FFDD00" />
      <circle cx="15" cy="10" r="2.6" fill="#7A5C2E" />
    </>
  ),
  PE: v3('#D91023', '#FFFFFF', '#D91023'),
  BO: h3('#D52B1E', '#F9E300', '#007934'),
  DO: () => (
    <>
      <rect width="30" height="20" fill="#FFFFFF" />
      <rect width="13" height="8.5" fill="#002D62" />
      <rect x="17" width="13" height="8.5" fill="#CE1126" />
      <rect y="11.5" width="13" height="8.5" fill="#CE1126" />
      <rect x="17" y="11.5" width="13" height="8.5" fill="#002D62" />
    </>
  ),
  BZ: () => (
    <>
      <rect width="30" height="20" fill="#CE1126" />
      <rect y="1.6" width="30" height="16.8" fill="#003F87" />
      <circle cx="15" cy="10" r="5" fill="#FFFFFF" />
    </>
  ),
  BR: () => (
    <>
      <rect width="30" height="20" fill="#009C3B" />
      <path d="M15 2.5 27 10 15 17.5 3 10z" fill="#FFDF00" />
      <circle cx="15" cy="10" r="4" fill="#002776" />
    </>
  ),
  UY: () => (
    <>
      <rect width="30" height="20" fill="#FFFFFF" />
      {[0, 2, 4, 6, 8].map((i) => <rect key={i} y={i * 2.22 + 2.22} width="30" height="2.22" fill="#0038A8" />)}
      <rect width="11" height="11.1" fill="#FFFFFF" />
      <circle cx="5.5" cy="5.5" r="3" fill="#FCD116" />
    </>
  ),
  US: () => (
    <>
      <rect width="30" height="20" fill="#FFFFFF" />
      {[0, 2, 4, 6, 8, 10, 12].map((i) => <rect key={i} y={i * 1.54} width="30" height="1.54" fill="#B22234" />)}
      <rect width="13" height="10.77" fill="#3C3B6E" />
    </>
  ),
  DK: () => (
    <>
      <rect width="30" height="20" fill="#C8102E" />
      <rect x="9" width="3.5" height="20" fill="#FFFFFF" />
      <rect y="8.25" width="30" height="3.5" fill="#FFFFFF" />
    </>
  ),
  ES: () => (
    <>
      <rect width="30" height="20" fill="#AA151B" />
      <rect y="5" width="30" height="10" fill="#F1BF00" />
    </>
  ),
  FR: v3('#002395', '#FFFFFF', '#ED2939'),
  NL: h3('#AE1C28', '#FFFFFF', '#21468B'),
  DE: h3('#000000', '#DD0000', '#FFCE00'),
}

export const hasFlag = (code: string) => code in FLAGS

/** A country's flag, 3 by 2, `size` px tall. Nothing for a country without one. */
export function Flag({ code, size = 12, title }: { code: string; size?: number; title?: string }) {
  const draw = FLAGS[code]
  if (!draw) return null
  return (
    <svg className="flag" width={size * 1.5} height={size} viewBox="0 0 30 20" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <clipPath id={`fl-${code}`}>
        <rect width="30" height="20" rx="3" />
      </clipPath>
      <g clipPath={`url(#fl-${code})`}>{draw()}</g>
      <rect width="29" height="19" x=".5" y=".5" rx="2.6" fill="none" stroke="#000" strokeOpacity=".28" />
    </svg>
  )
}
