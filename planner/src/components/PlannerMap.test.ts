import { describe, expect, it } from 'vitest'
import { cityStays } from './PlannerMap'

describe('the city panel stays block', () => {
  it('keys itself apart from the city id the panel keys its places by', () => {
    expect(cityStays('CLO').key).toBe('stays:CLO')
    expect(cityStays('CLO').key).not.toBe('CLO')
  })
})
