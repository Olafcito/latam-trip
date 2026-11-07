import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SharedChip } from './SharedChip'

describe('the shared chip', () => {
  it('marks a shared trip as shared with you and read only', () => {
    const html = renderToStaticMarkup(createElement(SharedChip, { show: true }))
    expect(html).toContain('Shared with you')
    expect(html).toContain('title="Shared with you, read only"')
  })

  it('shows nothing on your own trip', () => {
    expect(renderToStaticMarkup(createElement(SharedChip, { show: false }))).toBe('')
  })
})
