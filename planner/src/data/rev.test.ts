import { describe, expect, it, vi } from 'vitest'
import { dataChanged } from './rev'

describe('a build swapped in while the page is open', () => {
  it('forgets what the readers hold', () => {
    const clearRoute = vi.fn()
    const clearPairs = vi.fn()
    dataChanged([clearRoute, clearPairs])
    expect(clearRoute).toHaveBeenCalledTimes(1)
    expect(clearPairs).toHaveBeenCalledTimes(1)
  })
})
