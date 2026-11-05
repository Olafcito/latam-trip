import { describe, expect, it } from 'vitest'
import { clampPhoto, keyStep, photoAt, stepPhoto } from './photoStrip'

describe('photoAt', () => {
  it('rounds the scroll to the nearest photo', () => {
    expect(photoAt(0, 400, 8)).toBe(0)
    expect(photoAt(190, 400, 8)).toBe(0)
    expect(photoAt(210, 400, 8)).toBe(1)
    expect(photoAt(1200, 400, 8)).toBe(3)
  })
  it('stays on the photos past either end and with no width', () => {
    expect(photoAt(-40, 400, 8)).toBe(0)
    expect(photoAt(99999, 400, 8)).toBe(7)
    expect(photoAt(300, 0, 8)).toBe(7)
    expect(photoAt(300, 400, 0)).toBe(0)
  })
})

describe('clampPhoto', () => {
  it('keeps an index inside the strip', () => {
    expect(clampPhoto(3, 8)).toBe(3)
    expect(clampPhoto(-1, 8)).toBe(0)
    expect(clampPhoto(8, 8)).toBe(7)
    expect(clampPhoto(2.7, 8)).toBe(2)
    expect(clampPhoto(Number.NaN, 8)).toBe(0)
    expect(clampPhoto(2, 0)).toBe(0)
  })
})

describe('stepPhoto', () => {
  it('steps one photo back or on and stops at the ends', () => {
    expect(stepPhoto(0, 1, 8)).toBe(1)
    expect(stepPhoto(5, -1, 8)).toBe(4)
    expect(stepPhoto(0, -1, 8)).toBe(0)
    expect(stepPhoto(7, 1, 8)).toBe(7)
    expect(stepPhoto(0, 1, 1)).toBe(0)
  })
})

describe('keyStep', () => {
  it('reads the left and right arrows only', () => {
    expect(keyStep('ArrowLeft')).toBe(-1)
    expect(keyStep('ArrowRight')).toBe(1)
    expect(keyStep('ArrowUp')).toBeNull()
    expect(keyStep('Enter')).toBeNull()
  })
})
