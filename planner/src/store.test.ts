import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from './store'
import type { Journey } from './lib/journey'

const trip: Journey = {
  id: 'jtest',
  name: 'Test',
  wayIn: 'in',
  wayHome: 'home',
  optionId: null,
  places: [{ node: 'GDL', hop: null }, { node: 'GUA', hop: null }, { node: 'SAL', hop: null }],
}

describe('a card opened from Trips', () => {
  const ref = { kind: 'gym', id: 'g1' } as const

  it('keeps where it came from after the map took the card, until the screen changes', () => {
    const s = useStore.getState
    s().openMapCard(ref)
    s().clearMapCard()
    expect([s().mapCard, s().mapCardFrom, s().screen]).toEqual([null, ref, 'map'])
    s().go('trips')
    expect([s().mapCardFrom, s().screen]).toEqual([null, 'trips'])
  })
})

describe('toggleCursor', () => {
  beforeEach(() => {
    useStore.getState().setJourney(trip)
    useStore.getState().setCursor(null)
  })

  it('builds from a stop on the first tap and goes back to the itinerary on the second', () => {
    const s = useStore.getState
    s().toggleCursor(1)
    expect([s().cursor, s().idle]).toEqual([1, false])
    s().toggleCursor(1)
    expect(s().idle).toBe(true)
    s().toggleCursor(1)
    expect([s().cursor, s().idle]).toEqual([1, false])
  })

  it('treats the last stop, the default cursor, the same way', () => {
    const s = useStore.getState
    s().toggleCursor(2)
    expect([s().cursor, s().idle]).toEqual([null, true])
    s().toggleCursor(0)
    expect([s().cursor, s().idle]).toEqual([0, false])
  })

  it('cursorTo from the map toggles too, and any other cursor move starts building again', () => {
    const s = useStore.getState
    s().cursorTo('GUA')
    s().cursorTo('GUA')
    expect([s().cursor, s().idle]).toEqual([1, true])
    s().setCursor(0)
    expect([s().cursor, s().idle]).toEqual([0, false])
  })
})
