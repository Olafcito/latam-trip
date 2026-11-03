import { clock, hours, kr } from './format'
import { nights } from './waytrack'

// The facts a row of the flight and way sheets shows as marks rather than lines of text: an icon with
// its words in a toggletip and for a screen reader, a short figure beside it when the fact needs a word
// on a phone, and a tone that says how much it weighs.

export type MarkKind =
  | 'cabin' | 'checked' | 'night' | 'day' | 'wait' | 'self' | 'airport' | 'stopover' | 'esta' | 'moon' | 'late' | 'home' | 'in' | 'border'

/** ok reads green, part amber, no faint, bad red and strong in the text colour at full weight */
export type Tone = 'ok' | 'part' | 'no' | 'bad' | 'strong'

export interface Mark {
  kind: MarkKind
  /** the whole fact, for the toggletip and the accessible name */
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

/** The weight or the count a site states for a bag, short: "23 kg", "2 x 23 kg", "2 bags". Nothing when it states neither. */
export function bagFigure(said: string): string | undefined {
  const kg = /(?:(\d+)\s*[x\u00d7]\s*)?(\d+(?:[.,]\d+)?)\s*kg\b/i.exec(said)
  if (kg) return `${kg[1] && +kg[1] > 1 ? `${kg[1]} x ` : ''}${kg[2]} kg`
  const n = /(\d+)\s*(?:[x\u00d7](?!\w)|pcs?\b|pieces?\b|bags?\b)/i.exec(said)
  if (n) return `${n[1]} ${+n[1] === 1 ? 'bag' : 'bags'}`
  return undefined
}

/** A bag as a site words it: green when it is included, faint when it is not, amber at a fee, its weight or count beside the icon, the words in the toggletip. */
export function bagMark(kind: 'cabin' | 'checked', said: string | null | undefined): Mark | null {
  const t = said?.trim()
  if (!t) return null
  const tone: Tone | undefined = /^(no|none|not)\b|not included/i.test(t) ? 'no'
    : /fee|paid|extra|only/i.test(t) ? 'part'
      : /includ|free|^\d+\s*x\b|\bkg\b/i.test(t) ? 'ok'
        : undefined
  const text = tone === 'no' ? undefined : bagFigure(t)
  return { kind, label: `${word(kind)}, ${t}`, ...(text ? { text } : {}), tone }
}

/**
 * The marks of the stops of one flight, by place, read the same way on a flight row and a way row. The
 * longest wait carries the stopover or the night when the flight has one, and every other wait of
 * LONG_WAIT_H or more is a long wait. `at` names the stop, or is empty when the airport is not known.
 */
export function waitMarks(waits: readonly (number | null)[], at: (i: number) => string, has: { night?: boolean; stopover?: boolean }): (Mark | null)[] {
  const longest = waits.reduce<number>((k, h, i) => ((h ?? 0) > (waits[k] ?? 0) ? i : k), 0)
  return waits.map((h, i): Mark | null => {
    const where = at(i) ? ` in ${at(i)}` : ''
    if (i === longest && has.stopover) return { kind: 'stopover', label: `Stopover${where}${h ? `, ${nights(Math.max(1, Math.round(h / 24)))}` : ''}` }
    if (i === longest && has.night) return { kind: 'night', label: `A night${where}${h != null ? `, ${hours(h)}` : ''}` }
    return h != null && h >= LONG_WAIT_H ? { kind: 'wait', label: `Long wait${where}, ${hours(h)}`, tone: 'part' } : null
  })
}

/** A bus or a boat over a border. */
export const BORDER: Mark = { kind: 'border', label: 'Crosses a border', text: 'Border' }

/** The moon on a time that falls in the night: leaving before 5, or landing from 22 to 6. */
export function nightMark(local: string, at: 'leaves' | 'lands'): Mark | null {
  const h = +clock(local).slice(0, 2)
  if (at === 'leaves' ? h < 5 : h >= 22 || h < 6) return { kind: 'moon', label: `${at === 'leaves' ? 'Leaves' : 'Lands'} at night, ${clock(local)}` }
  return null
}
