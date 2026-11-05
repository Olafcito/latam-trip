import { describe, expect, it } from 'vitest'
import type { LodgingPrice, LodgingRoom } from '../data/types'
import type { StayPart } from './stays'
import { partPrice, partPriceWords, photosShown, quotedLabel } from './stayView'

// Made up rooms, prices and addresses only. A real name or price never goes in this file.

const price = (over: Partial<LodgingPrice>): LodgingPrice => ({
  id: 'p', room_id: 'R1', check_in: '2026-12-05', check_out: '2026-12-09', total_dkk: null, per_night_dkk: null, site: null, url: null,
  refundable: null, cancel_until: null, available: null, observed_at: '2026-11-03T10:00:00Z', ...over,
})
const room = (prices: LodgingPrice[]): LodgingRoom => ({
  id: 'R1', lodging_id: 'L1', name: 'TEST01 dorm', beds: 6, private: false, bathroom: 'shared', notes: null, site: null, site_id: null, photo: null,
  created_at: '2026-11-03T10:00:00Z', updated_at: '2026-11-03T10:00:00Z', prices,
})
const part = (first: string, nights: number): StayPart => ({ stay: { lodging_id: 'L1', room_id: 'R1' }, first, last: first, nights, fits: true })

describe('the photos a card shows', () => {
  const photos = [
    { url: 'https://test01.example/a.jpg', caption: null },
    { url: 'http://test01.example/b.jpg', caption: null },
    { url: 'https://test01.example/c.jpg', caption: 'TEST01 pool' },
  ]

  it('leaves out an address the card may not load', () => {
    expect(photosShown(photos, new Set()).map((p) => p.url)).toEqual(['https://test01.example/a.jpg', 'https://test01.example/c.jpg'])
  })

  it('leaves out a photo that failed, and is empty when every one did', () => {
    expect(photosShown(photos, new Set(['https://test01.example/a.jpg']))).toEqual([photos[2]])
    expect(photosShown(photos, new Set(['https://test01.example/a.jpg', 'https://test01.example/c.jpg']))).toEqual([])
  })
})

describe('the price a part shows', () => {
  it('is none without a room or a price', () => {
    expect(partPrice(undefined, part('2026-12-05', 4))).toEqual({ kind: 'none' })
    expect(partPrice(room([]), part('2026-12-05', 4))).toEqual({ kind: 'none' })
    expect(partPriceWords({ kind: 'none' })).toEqual({ text: 'no price', estimate: null })
  })

  it('is exact for a price for its very nights, with no mark', () => {
    const p = partPrice(room([price({ total_dkk: 1200 })]), part('2026-12-05', 4))
    expect(p).toEqual({ kind: 'exact', total: 1200 })
    expect(partPriceWords(p)).toEqual({ text: '1.200 kr', estimate: null })
  })

  it('is an estimate for a price for other nights, scaled to its own and marked so', () => {
    // 1.200 kr for 4 nights is 300 kr a night, so 3 nights is about 900 kr
    const p = partPrice(room([price({ total_dkk: 1200 })]), part('2026-12-06', 3))
    expect(p).toEqual({ kind: 'estimate', total: 900, nights: 3, from: { total: 1200, check_in: '2026-12-05', check_out: '2026-12-09' } })
    expect(partPriceWords(p)).toEqual({ text: '900 kr', estimate: 'About 900 kr for 3 nights, worked out from 1.200 kr for 5 to 9 Dec' })
  })

  it('says a card price for other nights is for those nights', () => {
    expect(quotedLabel(1200, '2026-12-05', '2026-12-09')).toBe('1.200 kr is the price for 5 to 9 Dec, not these nights')
  })
})
