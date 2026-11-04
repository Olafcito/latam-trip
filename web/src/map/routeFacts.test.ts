import { describe, expect, it } from 'vitest'
import { cleanCarriers, sameNames } from './routeFacts'

describe('cleanCarriers', () => {
  it('folds spellings of one carrier into one name', () => {
    expect(cleanCarriers(['Avianca', 'avianca', 'Copa Airlines', 'COPA', 'Copa'])).toEqual(['Avianca', 'Copa'])
  })
  it('keeps a lone acronym as written', () => {
    expect(cleanCarriers(['LATAM', 'BoA', 'LATAM Airlines'])).toEqual(['LATAM', 'BoA'])
  })
  it('capitalises a name that only came in lower case', () => {
    expect(cleanCarriers(['wingo'])).toEqual(['Wingo'])
  })
  it('drops the scraped notice that is not a carrier', () => {
    expect(cleanCarriers(['Copa', 'Service mellem PTY og GUA er underlagt myndighedernes'])).toEqual(['Copa'])
  })
  it('trims and skips empty names', () => {
    expect(cleanCarriers(['  JetSMART ', '', 'Jetsmart'])).toEqual(['JetSMART'])
  })
})

describe('sameNames', () => {
  it('sees operators that repeat the carriers', () => {
    expect(sameNames(['Copa Airlines', 'avianca'], ['Avianca', 'Copa'])).toBe(true)
  })
  it('sees operators that add a name', () => {
    expect(sameNames(['Copa', 'Air Panama'], ['Copa'])).toBe(false)
  })
})
