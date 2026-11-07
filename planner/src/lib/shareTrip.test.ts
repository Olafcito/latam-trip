import { describe, expect, it } from 'vitest'
import { shareParam, sharedJourneyId, sharedRow, shareUrl, urlWithShare } from './shareTrip'

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
})
