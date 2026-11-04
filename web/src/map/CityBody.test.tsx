// The one city body of the trip sheet and the map panel, through the real component.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CityBody, type CityBodyProps } from './CityBody'
import type { CityFind } from './cityFacts'

const find = (name: string, over: Partial<CityFind> = {}): CityFind => ({
  ref: { kind: 'experience', id: name }, name, sub: 'Culture & markets', note: null, saved: false, chips: [], dropIn: null, score: null, ...over,
})

const base: CityBodyProps = {
  name: 'TEST01 City',
  country: 'CO',
  countryName: 'Colombia',
  tagline: 'TEST01 walls by the sea',
  image: { url: 'https://upload.wikimedia.org/test01/640px-a.jpg', credit: 'TEST01 author', licence: 'CC BY 4.0', page: null },
  stop: { nights: 2, range: '2 to 4 Dec' },
  finds: {
    experiences: ['A', 'B', 'C', 'D', 'E'].map((n) => find(`TEST01 ${n}`)),
    training: [find('TEST01 Roll', { ref: { kind: 'gym', id: 'roll' }, sub: null, chips: ['BJJ', 'Muay Thai'], dropIn: 1240, score: 6.25 })],
  },
  about: { summary: 'TEST01 summary of the city.', touristy: 3, altitude: '2 m' },
  onFind: () => {},
}

const html = (over: Partial<CityBodyProps> = {}) => renderToStaticMarkup(<CityBody {...base} {...over} />)

describe('the city body', () => {
  it('heads with the name, the country and the nights large beside the full range', () => {
    const out = html()
    expect(out).toContain('TEST01 City')
    expect(out).toContain('Colombia')
    expect(out).toMatch(/class="cy-n"[^>]*>2</)
    expect(out).toContain('nights')
    expect(out).toContain('2 to 4 Dec')
  })

  it('says one night in the singular and leaves the nights out off a trip', () => {
    expect(html({ stop: { nights: 1, range: '2 to 3 Dec' } })).toMatch(/>night</)
    expect(html({ stop: null })).not.toContain('class="cy-n"')
  })

  it('marks the first stop with a lock and no sentence', () => {
    const out = html({ stop: { nights: 2, range: '2 to 4 Dec', fixed: true } })
    expect(out).toContain('The flight lands here')
    expect(out).not.toContain('so this stop stays')
  })

  it('keeps the photo credit off the page and on the mark in the photo corner', () => {
    const out = html()
    expect(out).not.toContain('Photo:')
    expect(out).toMatch(/aria-label="Photo by TEST01 author, CC BY 4.0, Wikimedia Commons"/)
  })

  it('puts the stay slot before the experiences and training after them', () => {
    const out = html({ stay: <div className="TEST01-stay" /> })
    expect(out.indexOf('TEST01-stay')).toBeLessThan(out.indexOf('Experiences'))
    expect(out.indexOf('Experiences')).toBeLessThan(out.indexOf('Training'))
  })

  it('shows three experiences and a count for the rest', () => {
    const out = html()
    expect(out).toContain('TEST01 C')
    expect(out).not.toContain('TEST01 D')
    expect(out).toContain('Show all 5')
  })

  it('gives a gym its discipline chips and its drop in price in kr', () => {
    const out = html()
    expect(out).toMatch(/cy-chip[^>]*>BJJ</)
    expect(out).toContain('1.240 kr')
    expect(out).toContain('6.3')
  })

  it('keeps the summary, the touristy meter and the altitude behind About', () => {
    const out = html()
    expect(out).toMatch(/<details[^>]*class="cy-about"/)
    expect(out.indexOf('<details')).toBeLessThan(out.indexOf('TEST01 summary'))
    expect(out).toContain('Touristy')
    expect(out).toContain('2 m')
  })

  it('leaves out what it does not have, with no empty section and no question mark', () => {
    const out = html({ tagline: null, image: null, about: {}, finds: { experiences: [], training: [] } })
    expect(out).not.toMatch(/Experiences|Training|About|cy-hero/)
    expect(out).not.toContain('?')
  })
})
