import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DataStrip } from './DataStrip'

const html = (state: Parameters<typeof DataStrip>[0]['state']) => renderToStaticMarkup(createElement(DataStrip, { state }))

describe('DataStrip', () => {
  it('the strip shows when last_error is set', () => {
    const out = html({ last_error: 'check: 1 error', last_warning: null })
    expect(out).toContain('The data has stopped updating.')
    expect(out).toContain('check: 1 error')
    expect(out).not.toContain('?')
  })
  it('shows a warning on its own, and nothing when all is well', () => {
    expect(html({ last_error: null, last_warning: 'trips left out of the build: zz-bad-trip' })).toContain('zz-bad-trip')
    expect(html({ last_error: null, last_warning: null })).toBe('')
    expect(html(null)).toBe('')
  })
})
