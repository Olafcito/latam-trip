/**
 * The airports a trip can start from and end at: Copenhagen and the airports near it. The picker offers a home
 * only when the data has fares from it, so a new home is a row here and its quotes in the crawl.
 */
export const HOMES: { code: string; city: string; country: string }[] = [
  { code: 'CPH', city: 'Copenhagen', country: 'DK' },
  { code: 'MMX', city: 'Malmö', country: 'SE' },
  { code: 'BLL', city: 'Billund', country: 'DK' },
  { code: 'AAR', city: 'Aarhus', country: 'DK' },
  { code: 'AAL', city: 'Aalborg', country: 'DK' },
  { code: 'HAM', city: 'Hamburg', country: 'DE' },
  { code: 'GOT', city: 'Gothenburg', country: 'SE' },
]
