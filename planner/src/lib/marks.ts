import { clock, kr } from './format'

// The facts a row of the flight and way sheets shows as marks rather than lines of text: an icon with
// its words in a tooltip and for a screen reader, a short figure beside it only when the figure is the
// point, and a tone that says how much it weighs.

export type MarkKind =
  | 'cabin' | 'checked' | 'night' | 'day' | 'wait' | 'self' | 'airport' | 'stopover' | 'esta' | 'moon' | 'late' | 'home' | 'in'

/** ok reads green, part amber, no faint, bad red and strong in the text colour at full weight */
export type Tone = 'ok' | 'part' | 'no' | 'bad' | 'strong'

export interface Mark {
  kind: MarkKind
  /** the whole fact, for the tooltip and the accessible name */
  label: string
  /** a short figure shown beside the icon */
  text?: string
  tone?: Tone
}

/** A wait this long at a stop is worth a mark. */
export const LONG_WAIT_H = 4

const word = (kind: 'cabin' | 'checked') => (kind === 'cabin' ? 'Cabin bag' : 'Checked bag')

/** A bag fee on a ticket: included, a price shown beside the icon, or no mark when it is not known. */
export function feeMark(kind: 'cabin' | 'checked', fee: number | null | undefined): Mark | null {
  if (fee == null) return null
  if (fee === 0) return { kind, label: `${word(kind)} included`, tone: 'ok' }
  return { kind, label: `${word(kind)} ${kr(fee)}`, text: kr(fee), tone: 'part' }
}

/** A bag as a site words it: green when it is included, faint when it is not, amber at a fee, the words in the tooltip. */
export function bagMark(kind: 'cabin' | 'checked', said: string | null | undefined): Mark | null {
  const t = said?.trim()
  if (!t) return null
  const tone: Tone | undefined = /^(no|none|not)\b|not included/i.test(t) ? 'no'
    : /fee|paid|extra|only/i.test(t) ? 'part'
      : /includ|free|^\d+\s*x\b|\bkg\b/i.test(t) ? 'ok'
        : undefined
  return { kind, label: `${word(kind)}, ${t}`, tone }
}

/** The moon on a time that falls in the night: leaving before 5, or landing from 22 to 6. */
export function nightMark(local: string, at: 'leaves' | 'lands'): Mark | null {
  const h = +clock(local).slice(0, 2)
  if (at === 'leaves' ? h < 5 : h >= 22 || h < 6) return { kind: 'moon', label: `${at === 'leaves' ? 'Leaves' : 'Lands'} at night, ${clock(local)}` }
  return null
}
