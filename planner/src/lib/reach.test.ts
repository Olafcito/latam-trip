import { describe, expect, it } from 'vitest'
import { buildModel } from '@map/data/model'
import type { Family, MapData, Mode } from '@map/data/types'
import { filterReach, reachFrom } from './reach'

const place = (id: string, name: string, country: string, lon: number, lat: number) =>
  ({ id, name, short_name: name, country, lon, lat, tier: 'destination', type: 'city', popularity: 1, iata: null, airport_transfer_min: null })
const opt = (mode: Mode, minutes: number | null, min: number | null, typical: number | null = null) => ({
  mode, operators: [], duration_min: minutes, price_dkk: { min, typical }, frequency: null, overnight: false, border: false,
  stops: [], geometry: null, flight: null, source: 'crawl', observed_at: null, note: null, booking_url: null,
})
const data = {
  places: [
    place('ANT', 'Antigua', 'GT', -90.7, 14.6),
    place('ATI', 'Lake Atitlán', 'GT', -91.2, 14.7),
    place('SAL', 'San Salvador', 'SV', -89.2, 13.7),
    place('CAY', 'Caye Caulker', 'BZ', -88.0, 17.7),
    place('BOG', 'Bogotá', 'CO', -74.1, 4.7),
  ],
  connections: [
    { id: 'ANT-ATI', a: 'ANT', b: 'ATI', options: [opt('shuttle', 180, 150), opt('chicken_bus', 240, 40)] },
    { id: 'ANT-SAL', a: 'ANT', b: 'SAL', options: [opt('bus', 330, null, 210), opt('flight', 50, 900)] },
    { id: 'ANT-CAY', a: 'CAY', b: 'ANT', options: [opt('boat', 600, null)] },
    { id: 'ANT-BOG', a: 'ANT', b: 'BOG', options: [opt('flight', 270, 1700)] },
  ],
  countries: [],
} as unknown as MapData
const model = buildModel(data)
const fams = (...f: Family[]) => new Set<Family>(f)
const COUNTRY: Record<string, string> = { GT: 'Guatemala', SV: 'El Salvador', BZ: 'Belize', CO: 'Colombia' }
const cn = (c: string) => COUNTRY[c] ?? c

describe('places one leg away', () => {
  it('follows the map toggles: only the switched on modes, one row per place and mode', () => {
    const ground = reachFrom(model, 'ANT', fams('ground'))
    expect(ground.map((r) => r.key)).toEqual(['ATI:ground', 'SAL:ground'])
    const all = reachFrom(model, 'ANT', fams('ground', 'boat', 'flight'))
    expect(all.map((r) => r.key).sort()).toEqual(['ATI:ground', 'BOG:flight', 'CAY:boat', 'SAL:flight', 'SAL:ground'])
    expect(reachFrom(model, 'ANT', fams('boat')).map((r) => r.place.id)).toEqual(['CAY'])
  })

  it('sorts by hours, fastest first', () => {
    const all = reachFrom(model, 'ANT', fams('ground', 'boat', 'flight'))
    expect(all.map((r) => r.key)).toEqual(['SAL:flight', 'ATI:ground', 'BOG:flight', 'SAL:ground', 'CAY:boat'])
    expect(all.map((r) => r.hours)).toEqual([50 / 60, 3, 4.5, 5.5, 10])
  })

  it('takes the cheapest known price of the mode, the typical one when no minimum is known, else none', () => {
    const rows = Object.fromEntries(reachFrom(model, 'ANT', fams('ground', 'boat', 'flight')).map((r) => [r.key, r]))
    expect(rows['ATI:ground'].price).toBe(40)
    expect(rows['SAL:ground'].price).toBe(210)
    expect(rows['CAY:boat'].price).toBeNull()
  })

  it('adds the leg a tap on the lit city adds: the connection, from the stop, by the fastest option of the mode', () => {
    const rows = Object.fromEntries(reachFrom(model, 'ANT', fams('ground', 'boat', 'flight')).map((r) => [r.key, r]))
    expect(rows['ATI:ground'].leg).toEqual({ cid: 'ANT-ATI', from: 'ANT', to: 'ATI', mode: 'shuttle' })
    expect(rows['CAY:boat'].leg).toEqual({ cid: 'ANT-CAY', from: 'ANT', to: 'CAY', mode: 'boat' })
  })

  it('filters by place or country name, ignoring case and accents', () => {
    const all = reachFrom(model, 'ANT', fams('ground', 'boat', 'flight'))
    expect(filterReach(all, 'salvador', cn).map((r) => r.key)).toEqual(['SAL:flight', 'SAL:ground'])
    expect(filterReach(all, 'guatemala', cn).map((r) => r.key)).toEqual(['ATI:ground'])
    expect(filterReach(all, 'BOGOTA', cn).map((r) => r.key)).toEqual(['BOG:flight'])
    expect(filterReach(all, 'atitlan', cn).map((r) => r.key)).toEqual(['ATI:ground'])
    expect(filterReach(all, '  ', cn)).toHaveLength(all.length)
    expect(filterReach(all, 'peru', cn)).toEqual([])
  })
})
