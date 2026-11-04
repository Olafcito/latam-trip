import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Freshness } from './Freshness'
import type { Meta } from '../data/types'

const html = (meta: Meta | null) => renderToStaticMarkup(createElement(Freshness, { meta }))

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('Freshness', () => {
  it('shows nothing when there is no meta', () => {
    expect(html(null)).toBe('')
  })

  it('shows nothing when every tracked type was checked recently', () => {
    const meta: Meta = { built_at: today(), last_checked: { flights: today(), stays: today() } }
    expect(html(meta)).toBe('')
  })

  it('shows an icon and plain words, never the cryptic abbreviation, when something is stale', () => {
    const meta: Meta = { built_at: today(), last_checked: { flights: today(), stays: '2000-01-01' } }
    const out = html(meta)
    expect(out).toContain('stays checked')
    expect(out).toMatch(/days ago/)
    expect(out).not.toContain('>3d<')
    expect(out).not.toMatch(/\d+d</)
  })
})
