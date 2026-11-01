import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The Save button sits on the Map tab, so the line that says a save waits or failed must be there too.
describe('the Map tab', () => {
  it('shows the notice line', () => {
    const src = readFileSync(resolve(import.meta.dirname, 'MapScreen.tsx'), 'utf8')
    expect(src).toMatch(/<Notice \/>/)
  })
})
