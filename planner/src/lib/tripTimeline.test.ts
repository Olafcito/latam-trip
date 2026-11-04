import { describe, expect, it } from 'vitest'
import { axisOf, at, monthTicks, timeline, type LineInput } from './tripTimeline'

const COUNTRY: Record<string, string> = { CTG: 'CO', MDE: 'CO', LPZ: 'BO', CBB: 'BO', SAL: 'SV', GUA: 'GT' }
const NAME: Record<string, string> = { CTG: 'Cartagena', MDE: 'Medellín', LPZ: 'La Paz', CBB: 'Cochabamba', SAL: 'San Salvador', GUA: 'Guatemala City' }

const stop = (node: string, inDay: string, days: number) => ({ node, inDay, days })

function line(over: Partial<LineInput> = {}): LineInput {
  return {
    places: [stop('CTG', '2026-12-02', 5), stop('MDE', '2026-12-07', 4), stop('LPZ', '2026-12-11', 10), stop('CBB', '2026-12-21', 6)],
    modes: [null, 'bus', 'flight', 'bus'],
    free: 0,
    firstDay: '2026-12-02',
    homeDepart: '2026-12-27T08:00',
    countryOf: (n) => COUNTRY[n] ?? '?',
    nameOf: (n) => NAME[n] ?? n,
    ...over,
  }
}

describe('timeline', () => {
  it('merges neighbouring stops in one country and keeps their names', () => {
    const t = timeline(line())
    expect(t.segs.map((s) => [s.country, s.from, s.nights, s.stops])).toEqual([
      ['CO', '2026-12-02', 9, ['Cartagena', 'Medellín']],
      ['BO', '2026-12-11', 16, ['La Paz', 'Cochabamba']],
    ])
    expect(t.start).toBe('2026-12-02')
    expect(t.end).toBe('2026-12-27')
  })

  it('puts a plane tick where a flight brings you into a stop', () => {
    expect(timeline(line()).flights).toEqual(['2026-12-11'])
  })

  it('shows the free nights before the flight home as their own segment in the last country', () => {
    const t = timeline(line({ places: [stop('CTG', '2026-12-02', 5), stop('LPZ', '2026-12-07', 14)], modes: [null, 'flight'], free: 6, homeDepart: '2026-12-27' }))
    expect(t.segs.map((s) => [s.country, s.from, s.nights, s.free])).toEqual([
      ['CO', '2026-12-02', 5, false],
      ['BO', '2026-12-07', 14, false],
      ['BO', '2026-12-21', 6, true],
    ])
  })

  it('gives a stop passed through its name and no width', () => {
    const t = timeline(line({ places: [stop('SAL', '2026-12-02', 3), stop('GUA', '2026-12-05', 0), stop('CTG', '2026-12-05', 22)], modes: [null, 'bus', 'flight'] }))
    expect(t.segs.map((s) => [s.country, s.nights, s.stops])).toEqual([
      ['SV', 3, ['San Salvador']],
      ['GT', 0, ['Guatemala City']],
      ['CO', 22, ['Cartagena']],
    ])
  })

  it('splits a country you leave and come back to', () => {
    const t = timeline(line({ places: [stop('CTG', '2026-12-02', 5), stop('LPZ', '2026-12-07', 10), stop('MDE', '2026-12-17', 10)], modes: [null, 'flight', 'flight'] }))
    expect(t.segs.map((s) => s.country)).toEqual(['CO', 'BO', 'CO'])
  })

  it('has no segments for a trip with no stops', () => {
    expect(timeline(line({ places: [], modes: [] })).segs).toEqual([])
  })
})

describe('axis', () => {
  it('runs from the earliest landing to the latest flight home', () => {
    const a = axisOf([{ start: '2026-12-02', end: '2027-02-03' }, { start: '2026-12-01', end: '2027-01-30' }])
    expect(a).toEqual({ start: '2026-12-01', end: '2027-02-03', days: 64 })
  })

  it('places a day as a share of the axis', () => {
    const a = axisOf([{ start: '2026-12-01', end: '2026-12-11' }])
    expect(at(a, '2026-12-01')).toBe(0)
    expect(at(a, '2026-12-06')).toBe(0.5)
    expect(at(a, '2026-12-11T09:00')).toBe(1)
  })

  it('never divides by zero', () => {
    const a = axisOf([])
    expect(a.days).toBe(1)
    expect(at(a, a.start)).toBe(0)
  })

  it('marks the first of each month inside the axis', () => {
    const a = axisOf([{ start: '2026-12-02', end: '2027-02-03' }])
    expect(monthTicks(a).map((m) => [m.day, m.label])).toEqual([['2027-01-01', 'Jan'], ['2027-02-01', 'Feb']])
  })
})
