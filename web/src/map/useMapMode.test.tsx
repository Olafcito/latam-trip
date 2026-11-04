import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { spreadGyms } from '../data/gyms'
import type { LonLat } from '../lib/geo'
import { ScopeToggle } from './ModeControls'
import { scopeRows } from './routeScope'

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
