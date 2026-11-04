import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { spreadGyms } from '../data/gyms'
import type { LonLat } from '../lib/geo'
import { ScopeToggle } from './ModeControls'
import { scopeKey, scopeRows, wideForTrip, type RouteScope, type WideState } from './routeScope'

const toggle = (wide: boolean, scoped: boolean) => renderToStaticMarkup(<ScopeToggle api={{ wide, scoped, setWide: () => {} }} />)

describe('the scope a layer mode shows', () => {
  const gyms = [
    { id: 'near', lat: 14.6, lon: -90.5 },
    { id: 'far', lat: -23.5, lon: -46.6 },
  ]
  const spots = spreadGyms(gyms)
  const at = (g: { id: string }) => spots.get(g.id)
  const scope = { line: [[-90.5, 14.6], [-86.2, 12.1]] as LonLat[] }

  it('shows the rows along the open trip and drops the rest', () => {
    expect(scopeRows(gyms, at, scope, false).map((g) => g.id)).toEqual(['near'])
  })
  it('shows every row on the whole map', () => {
    expect(scopeRows(gyms, at, scope, true)).toHaveLength(2)
  })
  it('shows every row with no trip open', () => {
    expect(scopeRows(gyms, at, null, false)).toHaveLength(2)
  })
})

describe('the whole map toggle per trip', () => {
  const line = [[-90.5, 14.6]] as LonLat[]
  const tripA = { id: 'A', line }
  const tripB = { id: 'B', line }
  // the hook's own steps: sync to the open trip, then the toggle sets wide for it
  const open = (s: WideState, scope: RouteScope | null) => wideForTrip(s, scopeKey(scope))
  const turn = (s: WideState, wide: boolean): WideState => ({ ...s, wide })

  it('starts along the route', () => {
    expect(open({ trip: null, wide: false }, tripA)).toEqual({ trip: 'A', wide: false })
  })
  it('keeps the whole map while the same trip stays open', () => {
    const on = turn(open({ trip: null, wide: false }, tripA), true)
    expect(open(on, { ...tripA, line: [...line, [-86.2, 12.1]] })).toBe(on)
  })
  it('goes back along the route when another trip opens', () => {
    const on = turn(open({ trip: null, wide: false }, tripA), true)
    expect(open(on, tripB)).toEqual({ trip: 'B', wide: false })
  })
  it('goes back along the route when the trip closes and opens again', () => {
    const on = turn(open({ trip: null, wide: false }, tripA), true)
    const closed = open(on, null)
    expect(closed.wide).toBe(false)
    expect(open(closed, tripA)).toEqual({ trip: 'A', wide: false })
  })
  it('toggles back to the route', () => {
    const on = turn(open({ trip: null, wide: false }, tripA), true)
    expect(open(turn(on, false), tripA)).toEqual({ trip: 'A', wide: false })
  })
})

describe('the Whole map toggle', () => {
  it('does not render with no trip open', () => {
    expect(toggle(false, false)).toBe('')
  })
  it('renders unpressed while the scope is along the route', () => {
    expect(toggle(false, true)).toContain('aria-pressed="false"')
  })
  it('renders pressed once widened', () => {
    const html = toggle(true, false)
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('Whole map')
  })
})
