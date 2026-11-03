import { describe, expect, it } from 'vitest'
import { bagFigure, bagMark, BORDER, waitMarks } from './marks'

describe('bag figures', () => {
  it('says the weight or the count a site states', () => {
    expect(bagFigure('1 x 23 kg')).toBe('23 kg')
    expect(bagFigure('2 x 23 kg')).toBe('2 x 23 kg')
    expect(bagFigure('8kg')).toBe('8 kg')
    expect(bagFigure('2 bags')).toBe('2 bags')
    expect(bagFigure('1 piece')).toBe('1 bag')
    expect(bagFigure('included')).toBeUndefined()
  })
  it('puts the figure beside the icon, and none on a bag that is not included', () => {
    expect(bagMark('checked', '1 x 23 kg')).toEqual({ kind: 'checked', label: 'Checked bag, 1 x 23 kg', text: '23 kg', tone: 'ok' })
    expect(bagMark('cabin', 'Included')).toEqual({ kind: 'cabin', label: 'Cabin bag, Included', tone: 'ok' })
    expect(bagMark('checked', 'not included')?.text).toBeUndefined()
  })
})

describe('waits', () => {
  const at = (i: number) => ['Lisbon', 'Madrid', ''][i]
  it('marks every wait of 4h or more, the night on the longest', () => {
    expect(waitMarks([5, 9, 1], at, { night: true })).toEqual([
      { kind: 'wait', label: 'Long wait in Lisbon, 5h', tone: 'part' },
      { kind: 'night', label: 'A night in Madrid, 9h' },
      null,
    ])
    expect(waitMarks([5, 9], at, {}).map((m) => m?.kind)).toEqual(['wait', 'wait'])
    expect(waitMarks([3.9], at, {})).toEqual([null])
  })
  it('marks a stopover in its nights, and a stop with no known wait', () => {
    expect(waitMarks([26], at, { stopover: true })).toEqual([{ kind: 'stopover', label: 'Stopover in Lisbon, 1 night' }])
    expect(waitMarks([null], () => '', { night: true })).toEqual([{ kind: 'night', label: 'A night' }])
  })
  it('names a border crossing with a word beside its icon', () => {
    expect(BORDER).toEqual({ kind: 'border', label: 'Crosses a border', text: 'Border' })
  })
})
