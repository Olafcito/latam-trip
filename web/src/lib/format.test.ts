import { describe, expect, it } from 'vitest'
import { duration, fromPrice, kr, observed, shortDate, thousands } from './format'

describe('thousands', () => {
  it('uses a period as the Danish thousands separator', () => {
    expect(thousands(210)).toBe('210')
    expect(thousands(1040)).toBe('1.040')
    expect(thousands(1234567)).toBe('1.234.567')
    expect(thousands(1039.6)).toBe('1.040')
  })
})

describe('duration', () => {
  it('formats minutes as in the handoff', () => {
    expect(duration(55)).toBe('55m')
    expect(duration(60)).toBe('1h')
    expect(duration(65)).toBe('1h05')
    expect(duration(540)).toBe('9h')
    expect(duration(402)).toBe('6h42')
    expect(duration(null)).toBe('time unknown')
  })
})

describe('prices', () => {
  it('formats from prices and plain amounts', () => {
    expect(fromPrice(1040)).toBe('from 1.040 kr')
    expect(fromPrice(null)).toBe('no price')
    expect(kr(255)).toBe('255 kr')
    expect(kr(null)).toBe('no price')
  })
})

describe('dates', () => {
  it('formats observed timestamps and search dates', () => {
    expect(observed('2026-10-28T12:31:37Z')).toBe('28 Oct 2026')
    expect(observed('2026')).toBe('2026')
    expect(shortDate('2027-01-10')).toBe('10 Jan')
  })
})
