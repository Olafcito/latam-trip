import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

// no session, and the sign in would be needed for everything else
vi.mock('./lib/supabase', () => ({ remoteEnabled: () => true, useSession: () => ({ ready: true, session: null }) }))

import { App } from './App'
import { guideRequested, SERVER_URL } from './components/Guide'

const at = (search: string) => vi.stubGlobal('window', { location: { search, href: `http://localhost/${search}` } })

describe('the guide', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is asked for by ?guide', () => {
    expect(guideRequested('?guide')).toBe(true)
    expect(guideRequested('?trip=a&guide')).toBe(true)
    expect(guideRequested('?trip=a')).toBe(false)
  })

  it('renders without a session, ahead of the sign in', () => {
    at('?guide')
    const out = renderToStaticMarkup(createElement(App))
    expect(out).toContain('Add it')
    expect(out).toContain('Start a trip')
    expect(out).toContain('What the connector can do')
    expect(out).toContain(SERVER_URL)
    expect(out).not.toContain('Send sign in link')
  })

  it('has no question mark in its text', () => {
    at('?guide')
    const text = renderToStaticMarkup(createElement(App)).replace(/<[^>]*>/g, '')
    expect(text).not.toContain('?')
  })

  it('leaves the sign in to every other address', () => {
    at('')
    expect(renderToStaticMarkup(createElement(App))).toContain('Send sign in link')
  })
})
