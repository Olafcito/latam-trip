import { describe, expect, it, vi } from 'vitest'

vi.mock('@map/data/remoteFiles', () => ({ dataBase: () => 'https://x/' }))
const getFile = vi.fn(async () => ({ pairs: {} }))
vi.mock('../lib/remoteFiles', () => ({ getFile: (...a: unknown[]) => (getFile as (...a: unknown[]) => unknown)(...a) }))
vi.mock('./load', () => ({}))
vi.mock('react', () => ({ useEffect: () => {}, useState: () => [null, () => {}], useSyncExternalStore: () => 0 }))

import { clearPairDates, loadPairDates } from './pairDates'

describe('the pair prices after a new build', () => {
  it('are read again once cleared and not before', async () => {
    await loadPairDates()
    await loadPairDates()
    expect(getFile).toHaveBeenCalledTimes(1)
    clearPairDates()
    await loadPairDates()
    expect(getFile).toHaveBeenCalledTimes(2)
  })
})
