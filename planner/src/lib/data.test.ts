import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { InOut } from '../data/types'
import { mixWays, priceOfWays } from './options'

// Checks the logic against the synced copy of the real data (npm run sync-data). Skipped when it is missing.
const file = resolve(import.meta.dirname, '../../public/data/data/web/inout.json')
const has = existsSync(file)

describe.skipIf(!has)('real inout.json', () => {
  const data = has ? (JSON.parse(readFileSync(file, 'utf8')) as InOut) : null

  it('option prices equal their tickets, a shared ticket counted once', () => {
    for (const o of data!.options) {
      const p = priceOfWays(data!, [data!.ways[o.way_in], data!.ways[o.way_home]])
      expect(Math.abs(p.price_dkk - o.price_dkk)).toBeLessThanOrEqual(1)
    }
  })

  it('mixing the two ways of a one-ways option reproduces its rating', () => {
    for (const o of data!.options.filter((x) => x.type === 'oneways')) {
      const m = mixWays(data!, data!.ways[o.way_in], data!.ways[o.way_home])
      expect(Math.abs(m.rating.total - o.rating.total)).toBeLessThanOrEqual(0.11)
    }
  })
})
