import { describe, expect, it } from 'vitest'
import { MODE_SHEET, SHEET_PEEK, SPRING_CALM, SPRING_THROWN, detentOffsets, dragTo, nextDetent, project, releaseVelocity, rubberband, settleOn, springDone, springStep } from './sheet'

const offsets = detentOffsets(724, 780)

describe('detentOffsets', () => {
  it('keeps the half detent at the share the map pads for', () => {
    expect(724 - offsets.half).toBe(Math.round(780 * MODE_SHEET))
    expect(offsets.full).toBe(0)
    expect(724 - offsets.peek).toBe(SHEET_PEEK)
  })

  it('counts the safe area into the peek', () => {
    expect(detentOffsets(724, 780, 34).peek).toBe(724 - SHEET_PEEK - 34)
  })

  it('never puts half below peek on a very short screen', () => {
    const short = detentOffsets(120, 176)
    expect(short.half).toBeLessThanOrEqual(short.peek)
  })
})

describe('project', () => {
  it('follows the decay form', () => {
    expect(project(1000)).toBeCloseTo(499, 0)
    expect(project(-1000)).toBeCloseTo(-499, 0)
    expect(project(0)).toBe(0)
  })
})

describe('rubberband', () => {
  it('gives less the further it goes and never reaches the pull', () => {
    const near = rubberband(50, 700)
    const far = rubberband(300, 700)
    expect(near).toBeLessThan(50)
    expect(far).toBeLessThan(300)
    expect(far / 300).toBeLessThan(near / 50)
    expect(rubberband(-50, 700)).toBeCloseTo(-near)
  })
})

describe('dragTo', () => {
  it('tracks 1:1 between the ends and goes soft past them', () => {
    expect(dragTo(200, 0, 650, 700)).toBe(200)
    expect(dragTo(-80, 0, 650, 700)).toBeGreaterThan(-80)
    expect(dragTo(-80, 0, 650, 700)).toBeLessThan(0)
    expect(dragTo(730, 0, 650, 700)).toBeLessThan(730)
    expect(dragTo(730, 0, 650, 700)).toBeGreaterThan(650)
  })
})

describe('settleOn', () => {
  it('lands on the nearest detent when the sheet is let go at rest', () => {
    expect(settleOn(offsets, offsets.half + 30, 0)).toBe('half')
    expect(settleOn(offsets, 40, 0)).toBe('full')
    expect(settleOn(offsets, offsets.peek - 10, 0)).toBe('peek')
  })

  it('throws past the nearest detent on a fast flick', () => {
    expect(settleOn(offsets, offsets.half - 20, 1200)).toBe('peek')
    expect(settleOn(offsets, offsets.half + 20, -1200)).toBe('full')
    expect(settleOn(offsets, 10, 3000)).toBe('peek')
  })

  it('never goes against a flick', () => {
    expect(settleOn(offsets, 300, -150)).toBe('full')
    expect(settleOn(offsets, offsets.half + 20, 150)).toBe('peek')
  })

  it('stays inside the detents past the ends', () => {
    expect(settleOn(offsets, -40, -2000)).toBe('full')
    expect(settleOn(offsets, offsets.peek + 30, 2000)).toBe('peek')
  })
})

describe('releaseVelocity', () => {
  it('reads the last moments of the drag', () => {
    expect(releaseVelocity([{ t: 0, y: 0 }, { t: 90, y: 90 }, { t: 100, y: 100 }], 100)).toBeCloseTo(1000)
  })

  it('is zero when the finger stopped before lifting', () => {
    expect(releaseVelocity([{ t: 0, y: 0 }, { t: 50, y: 300 }], 400)).toBe(0)
  })

  it('is zero with one point', () => {
    expect(releaseVelocity([{ t: 10, y: 5 }], 10)).toBe(0)
  })
})

describe('spring', () => {
  const run = (from: number, v: number, to: number, shape = SPRING_CALM) => {
    let s = { x: from, v }
    let peak = from
    let frames = 0
    while (!springDone(s, to) && frames < 600) {
      s = springStep(s, to, 1 / 60, shape)
      peak = to > from ? Math.max(peak, s.x) : Math.min(peak, s.x)
      frames++
    }
    return { s, peak, frames }
  }

  it('settles without passing the target when critically damped', () => {
    const { peak, frames } = run(0, 0, 400)
    expect(frames).toBeLessThan(120)
    expect(peak).toBeLessThanOrEqual(400.5)
  })

  it('carries the speed it was handed', () => {
    const still = springStep({ x: 0, v: 0 }, 400, 1 / 60, SPRING_CALM)
    const moving = springStep({ x: 0, v: 1500 }, 400, 1 / 60, SPRING_CALM)
    expect(moving.x).toBeGreaterThan(still.x)
  })

  it('overshoots a little after a throw', () => {
    const { peak } = run(0, 2000, 400, SPRING_THROWN)
    expect(peak).toBeGreaterThan(400)
    expect(peak).toBeLessThan(480)
  })
})

describe('nextDetent', () => {
  it('goes up on a tap and comes back down from the top', () => {
    expect(nextDetent('peek', 'tap')).toBe('half')
    expect(nextDetent('half', 'tap')).toBe('full')
    expect(nextDetent('full', 'tap')).toBe('half')
  })

  it('stops at the ends with the keys', () => {
    expect(nextDetent('full', 'up')).toBe('full')
    expect(nextDetent('peek', 'down')).toBe('peek')
    expect(nextDetent('half', 'down')).toBe('peek')
  })
})
