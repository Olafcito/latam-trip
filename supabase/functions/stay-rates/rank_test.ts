// Run from the repo root with: npx deno test supabase/functions/stay-rates/
import { countryName, km, pickCity, rankHostels } from './rank.ts'

function equal(got: unknown, want: unknown, what: string): void {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  if (a !== b) throw new Error(`${what}: got ${a}, want ${b}`)
}

// San Andres town and Cartagena, about 720 km apart.
const ADZ = { lat: 12.5847, lon: -81.7006 }
const CTG = { lat: 10.391, lon: -75.4794 }

Deno.test('km gives 0 for one point and the known distance between two towns', () => {
  equal(km(ADZ.lat, ADZ.lon, ADZ.lat, ADZ.lon), 0, 'same point')
  const d = km(ADZ.lat, ADZ.lon, CTG.lat, CTG.lon)
  if (d < 700 || d > 740) throw new Error(`San Andres to Cartagena is ${d} km`)
})

Deno.test('countryName reads an ISO code and gives null for nothing', () => {
  equal(countryName('CO'), 'Colombia', 'CO')
  equal(countryName('bo'), 'Bolivia', 'lower case')
  equal(countryName(null), null, 'null')
  equal(countryName(''), null, 'empty')
})

const suggestions = [
  { type: 'property', city: { id: '2399', name: 'San Andres Island', country: 'Colombia' } },
  { type: 'city', city: { id: '23872', name: 'San Andrés', country: 'Peru' } },
  { type: 'city', city: { id: '2399', name: 'San Andres Island', country: 'Colombia' } },
  { type: 'city', city: { id: '21385', name: 'San Andres', country: 'Colombia' } },
]

Deno.test('pickCity takes the first city in the country of the place', () => {
  equal(pickCity(suggestions, 'Colombia'), { id: '2399', name: 'San Andres Island' }, 'Colombia')
  equal(pickCity(suggestions, 'PERÚ'), { id: '23872', name: 'San Andrés' }, 'accents and case')
  equal(pickCity(suggestions, null), { id: '23872', name: 'San Andrés' }, 'no country takes the first city')
  equal(pickCity(suggestions, 'Bolivia'), null, 'no city in the country')
  equal(pickCity({ error: 'x' }, 'Colombia'), null, 'not a list')
})

const prop = (id: number, overall: number | null, ratings: string, at = ADZ, type = 'HOSTEL') => ({
  id, name: `P${id}`, type, overallRating: { overall, numberOfRatings: ratings }, latitude: String(at.lat), longitude: at.lon,
})

Deno.test('rankHostels puts the well rated first by number of ratings, then fills from the rest', () => {
  const list = [
    prop(1, 95, '120'),
    prop(2, 79, '5000'),
    prop(3, 88, '900'),
    prop(4, 80, '900'),
    prop(5, null, '10'),
    prop(6, 99, '20000', ADZ, 'HOTEL'),
  ]
  equal(rankHostels(list, ADZ).map((r) => r.id), ['3', '4', '1', '2', '5'], 'order')
  equal(rankHostels(list, ADZ)[0].km, 0, 'distance kept')
})

Deno.test('rankHostels leaves out hostels more than 40 km away and those without coordinates', () => {
  const list = [prop(1, 90, '10'), prop(2, 90, '9999', CTG), { ...prop(3, 90, '50'), latitude: null }]
  equal(rankHostels(list, ADZ).map((r) => r.id), ['1'], 'near only')
  equal(rankHostels(list, { lat: null, lon: null }).map((r) => r.id), ['2', '3', '1'], 'no distance test without place coordinates')
})

Deno.test('rankHostels takes each id once and gives nothing for a list that is not one', () => {
  equal(rankHostels([prop(1, 90, '10'), prop(1, 90, '10')], ADZ).length, 1, 'duplicates')
  equal(rankHostels(null, ADZ), [], 'null')
})
