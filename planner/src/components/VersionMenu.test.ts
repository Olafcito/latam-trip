import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TripRow } from '../lib/repoTrips'

const remote = vi.hoisted(() => ({ on: true }))
vi.mock('../lib/supabase', () => ({ remoteEnabled: () => remote.on, supabase: null }))
vi.mock('../lib/remoteTrips', () => ({ loadVersions: async () => [] }))

import { useStore } from '../store'
import { VersionMenu } from './VersionMenu'

const row = (version: number) => ({ id: 't', version, name: 'T' }) as unknown as TripRow
const html = (id: string, version: number) => renderToStaticMarkup(createElement(VersionMenu, { id, version }))

beforeEach(() => {
  remote.on = true
  useStore.setState({ rows: { t: row(6) }, viewing: null })
})

describe('VersionMenu', () => {
  it('is a quiet tag with the version', () => {
    const h = html('t', 6)
    expect(h).toContain('>v6<')
    expect(h).not.toContain('Latest')
  })

  it('is not there for a trip with one version', () => {
    useStore.setState({ rows: { t: row(1) } })
    expect(html('t', 1)).toBe('')
  })

  it('is not there without Supabase', () => {
    remote.on = false
    expect(html('t', 6)).toBe('')
  })

  it('shows no question mark', () => {
    expect(html('t', 6)).not.toContain('?')
  })
})
