import { describe, expect, it } from 'vitest'
import { placeTip } from './tooltip'

describe('placeTip', () => {
  const map = { w: 1000, h: 600 }
  const size = { w: 200, h: 100 }

  it('sits to the right of the target when nothing is there', () => {
    const pos = placeTip({ left: 300, top: 300, right: 340, bottom: 320 }, size, map)
    expect(pos.side).toBe('right')
    expect(pos.left).toBe(356)
  })

  it('slides clear of a blocked strip instead of hiding under it', () => {
    // a side pane on the right, a legend along the bottom, and a target in the corner between them
    const side = { left: 700, top: 0, right: 1000, bottom: 600 }
    const legend = { left: 300, top: 520, right: 700, bottom: 600 }
    const pos = placeTip({ left: 640, top: 480, right: 690, bottom: 500 }, size, map, [side, legend])
    const r = { left: pos.left, top: pos.top, right: pos.left + size.w, bottom: pos.top + size.h }
    for (const b of [side, legend]) {
      expect(r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top).toBe(false)
    }
  })
})
