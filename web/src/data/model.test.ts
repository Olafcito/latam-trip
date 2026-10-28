import { describe, expect, it } from 'vitest'
import { airportFlights, buildModel, byCountry, landing, pairFlights, viaLine, type Neighbour } from './model'
import type { MapData } from './types'

const n = (id: string, country: string, fastest: number) => ({ other: { id, country }, fastest }) as unknown as Neighbour

describe('byCountry', () => {
  it('puts the home country first and the rest by their fastest link', () => {
    const list = [n('SJO', 'CR', 60), n('RTB', 'HN', 90), n('GRAN', 'NI', 45), n('LCE', 'HN', 70), n('LEON', 'NI', 120)]
    const groups = byCountry(list, 'NI')
    expect(groups.map((g) => g.country)).toEqual(['NI', 'CR', 'HN'])
    expect(groups[0].list.map((x) => x.other.id)).toEqual(['GRAN', 'LEON'])
    expect(groups[2].list.map((x) => x.other.id)).toEqual(['RTB', 'LCE'])
  })
})

describe('flights with layovers', () => {
  const place = (id: string, lon: number, lat: number) => ({ id, name: id, short_name: id, country: 'X', lon, lat, tier: 'destination' })
  const flight = (stops: string[]) => ({ mode: 'flight', duration_min: 300, stops: stops.map((place_id) => ({ place_id, type: 'layover' })), geometry: null })
  const data = {
    places: [place('BOG', -74, 4.6), place('SAL', -89, 13.7), place('SAP', -88, 15.5)],
    connections: [{ id: 'BOG-SAP', a: 'BOG', b: 'SAP', options: [flight(['SAL'])] }],
    countries: [],
  } as unknown as MapData
  const model = buildModel(data)
  const touches = (line: number[][], lon: number, lat: number) => line.some(([x, y]) => Math.hypot(x - lon, y - lat) < 0.01)

  it('draws the overview arc between the ends only, not through the layover', () => {
    const line = model.routeLines.get('BOG-SAP|flight')!
    expect(touches(line, -89, 13.7)).toBe(false)
    expect(touches([line[0]], -74, 4.6)).toBe(true)
    expect(touches([line.at(-1)!], -88, 15.5)).toBe(true)
  })

  it('gives the route in focus its path through the layover', () => {
    const conn = model.conns.get('BOG-SAP')!
    expect(touches(viaLine(model, conn, conn.options[0])!, -89, 13.7)).toBe(true)
    expect(viaLine(model, conn, { ...conn.options[0], stops: [] })).toBeNull()
  })
})

describe('airport flights', () => {
  const place = (id: string, iata: string | null) => ({ id, name: id, short_name: id, country: 'X', lon: 0, lat: 0, tier: 'town', iata })
  const row = (from: string, to: string, dkk: number) => ({ from, to, dkk, hours: 3, dep: null, arr: null, vias: [], carriers: [], shows: ['cheapest'], notes: [], link: null })
  const data = {
    places: [place('ANT', 'GUA'), place('GUA', 'GUA'), place('VVI', 'VVI')],
    connections: [],
    countries: [],
    flights: [row('GUA', 'VVI', 900), row('VVI', 'GUA', 1200), row('LIM', 'VVI', 1500)],
  } as unknown as MapData
  const model = buildModel(data)

  it('names an airport after the city whose id it is, not the first town that shares it', () => {
    expect(model.byIata.get('GUA')?.id).toBe('GUA')
  })

  it('lists flights into and out of an airport in the data order', () => {
    expect(airportFlights(model, 'VVI', 'in').map((f) => f.from)).toEqual(['GUA', 'LIM'])
    expect(airportFlights(model, 'VVI', 'out').map((f) => f.to)).toEqual(['GUA'])
    expect(airportFlights(model, 'ANT', 'in')).toEqual([])
  })

  it('reads one directed pair, cheapest first', () => {
    expect(pairFlights(model, 'GUA', 'VVI').map((f) => f.dkk)).toEqual([900])
    expect(pairFlights(model, 'VVI', 'LIM')).toEqual([])
  })

  it('tags landings by the local arrival hour', () => {
    expect(landing('2026-12-10T04:35')).toBe('night')
    expect(landing('2026-12-10T12:42')).toBe('day')
    expect(landing('2026-12-10T18:00')).toBe('evening')
    expect(landing(null)).toBeNull()
  })
})
