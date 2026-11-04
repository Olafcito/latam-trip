import { describe, expect, it } from 'vitest'
import { frameFor, still, toScreen } from './camera'

const size = { w: 1000, h: 800 }
const room: [number, number, number, number] = [0, 100, 1000, 600]

describe('toScreen', () => {
  it('is where it was when the camera is still', () => {
    expect(toScreen(still(size), size, [120, 340])).toEqual([120, 340])
  })
})

describe('frameFor', () => {
  it('zooms a small box to fill the room, centred in it', () => {
    const c = frameFor([400, 300, 500, 350], size, room, 8)
    expect(c.k).toBe(8)
    expect(frameFor([400, 300, 600, 400], size, room, 8).k).toBeCloseTo((500 - 80) / 100)
    const [x, y] = toScreen(c, size, [450, 325])
    expect(x).toBeCloseTo(500)
    expect(y).toBeCloseTo(350)
  })

  it('never zooms out past the whole map nor in past its limit', () => {
    expect(frameFor([0, 0, 1000, 800], size, room, 8).k).toBe(1)
    expect(frameFor([500, 400, 501, 401], size, room, 3).k).toBe(3)
  })

  it('never shows past the edge of the world', () => {
    const c = frameFor([0, 0, 60, 40], size, room, 4)
    const [x0, y0] = toScreen(c, size, [0, 0])
    const [x1, y1] = toScreen(c, size, [1000, 800])
    expect(x0).toBeLessThanOrEqual(0.001)
    expect(y0).toBeLessThanOrEqual(0.001)
    expect(x1).toBeGreaterThanOrEqual(999.999)
    expect(y1).toBeGreaterThanOrEqual(799.999)
  })
})
