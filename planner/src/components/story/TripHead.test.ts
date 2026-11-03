import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { MapNode } from '../../data/types'
import { Itinerary } from './TripHead'

// a node as the research left it, with hostels the itinerary must no longer show
const node = {
  id: 'antigua', name: 'Antigua', country: 'GT', lat: 14.56, lon: -90.73, type: 'city', iata: null, popularity: 1,
  profile: {
    summary: 'Cobbled streets under three volcanoes.',
    things_to_do: ['Climb Acatenango'],
    hostels: [{ name: 'Hostal Volcan', dorm_dkk: 90, private_dkk: 300 }],
  },
} as unknown as MapNode

const html = (n: MapNode) =>
  renderToStaticMarkup(createElement(Itinerary, { place: { name: 'Antigua', node: n, days: 3, inDay: '2026-12-05' }, finds: null, onClose: () => {}, onFind: () => {} }))

describe('Itinerary', () => {
  it('shows no research hostels, places to stay come only from what was added', () => {
    const out = html(node)
    expect(out).toContain('Climb Acatenango')
    expect(out).not.toMatch(/Hostal Volcan|Hostels|Dorm|Private/)
  })
  it('a place with only hostels reads as nothing gathered', () => {
    const only = { ...node, profile: { hostels: node.profile && (node.profile as { hostels?: unknown }).hostels } } as unknown as MapNode
    expect(html(only)).toContain('Nothing gathered for this place yet.')
  })
})
