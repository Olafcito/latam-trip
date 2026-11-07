import { describe, expect, it } from 'vitest'
import { shareParam, sharedJourneyId, sharedLodgings, sharedRow, shareUrl, urlWithShare } from './shareTrip'

const tok = 'AbCdEfGhIjKlMnOpQrStUv'
const way = (from: string, to: string) => ({ from, to, timeline: [] })

describe('share links', () => {
  it('reads a token and refuses anything that is not one', () => {
    expect(shareParam(`?share=${tok}`)).toBe(tok)
    expect(shareParam('?share=short')).toBeNull()
    expect(shareParam('?share=a%3Cb%3Ec-d_e-f-g-h-i-j-k-l-m')).toBeNull()
    expect(shareParam('?trip=a')).toBeNull()
  })

  it('puts the token on the address and takes the trip and version away, and the other way round', () => {
    expect(urlWithShare('https://x.test/preview/?trip=a&v=2', tok)).toBe(`/preview/?share=${tok}`)
    expect(urlWithShare(`https://x.test/?share=${tok}&x=1`, null)).toBe('/?x=1')
  })

  it('builds the link from the page it lives on', () => {
    expect(shareUrl({ origin: 'https://x.test', pathname: '/preview/' }, tok)).toBe(`https://x.test/preview/?share=${tok}`)
  })

  it('opens what shared_trip answers under an id of its own', () => {
    const row = sharedRow({ id: 'trip-a', name: 'TEST01', saved_at: '2026-11-01T10:00:00Z', way_in: way('CPH', 'GUA'), way_home: way('SAL', 'CPH'), places: [{ node: 'GUA', hop: null }] }, tok)
    expect(row).toMatchObject({ id: sharedJourneyId(tok), name: 'TEST01', by: '', version: 1, why: '' })
    expect(sharedRow({ name: 'no ways' }, tok)).toBeNull()
  })

  it('reads the places to stay a shared trip names, with no notes and none hidden', () => {
    const got = sharedLodgings({
      lodgings: [
        {
          id: 'TEST01-l', place_id: 'GUA', name: 'TEST01 hostel', kind: 'hostel', notes: 'TEST01 note', hidden: true,
          photos: [{ url: 'https://x.test/a.jpg' }, { caption: 'no url' }], tags: ['social', 3],
          links: [{ site: 'booking', url: 'https://x.test/b' }],
          rooms: [
            { id: 'TEST01-r', lodging_id: 'TEST01-l', name: 'Dorm', beds: 6, notes: 'TEST01 room note',
              prices: [{ id: 'p', room_id: 'TEST01-r', check_in: '2026-12-03', check_out: '2026-12-06', total_dkk: 600, url: 'https://x.test/c' }, { id: 'q' }] },
            { id: 'TEST01-x', lodging_id: 'another', name: 'Not here' },
          ],
        },
        { name: 'no id' },
      ],
    })
    expect(got).toHaveLength(1)
    const [l] = got
    expect([l.id, l.notes, l.hidden, l.tags, l.photos]).toEqual(['TEST01-l', null, false, ['social'], [{ url: 'https://x.test/a.jpg', caption: null }]])
    expect(l.rooms.map((r) => [r.id, r.notes, r.prices.map((p) => [p.total_dkk, p.url])])).toEqual([['TEST01-r', null, [[600, null]]]])
    expect(sharedLodgings({})).toEqual([])
    expect(sharedLodgings(null)).toEqual([])
  })
})
