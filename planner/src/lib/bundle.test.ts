import { describe, expect, it } from 'vitest'
import type { Family } from '@map/data/types'
import { bundle, entryOf, type RouteStop } from './bundle'

const stop = (id: string, country: string, nights: number, mode: Family, type = 'city'): RouteStop => ({ id, name: id, country, nights, mode, type, lat: 0, lon: 0 })
const read = (stops: RouteStop[]) => bundle(stops).map((c) => [c.code, c.nights, c.places.map((p) => `${p.name} ${p.nights}`)])

describe('bundle', () => {
  it('reads the Cartagena trip the way you would tell it', () => {
    const stops = [
      stop('Cartagena', 'CO', 1, 'ground'),
      stop('Tintipan', 'CO', 5, 'boat', 'island'),
      stop('Tolu', 'CO', 0, 'boat', 'hub'),
      stop('Medellin', 'CO', 4, 'flight', 'hub'),
      stop('Jardin', 'CO', 2, 'ground'),
      stop('Salento', 'CO', 2, 'ground'),
      stop('Armenia', 'CO', 0, 'ground', 'hub'),
      stop('Cali', 'CO', 3, 'ground'),
      stop('Santa Cruz', 'BO', 1, 'flight'),
      stop('Cochabamba', 'BO', 6, 'flight'),
      stop('Santa Cruz', 'BO', 1, 'flight'),
      stop('San Jose', 'CR', 1, 'flight'),
      stop('San Juan del Sur', 'NI', 11, 'ground', 'beach'),
      stop('Managua', 'NI', 2, 'ground', 'hub'),
      stop('Leon', 'NI', 7, 'ground'),
      stop('El Tunco', 'SV', 3, 'boat', 'beach'),
      stop('San Salvador', 'SV', 5, 'ground'),
    ]
    expect(read(stops)).toEqual([
      ['CO', 17, ['Cartagena and islands 6', 'Medellin to Cali 11']],
      ['BO', 8, ['Cochabamba 8']],
      ['CR', 1, ['San Jose 1']],
      ['NI', 20, ['San Juan del Sur 11', 'Leon 9']],
      ['SV', 8, ['El Tunco 3', 'San Salvador 5']],
    ])
  })

  it('keeps long stays apart and an island reached by air on its own', () => {
    const stops = [
      stop('Leon', 'NI', 7, 'boat'),
      stop('Las Penitas', 'NI', 4, 'ground', 'beach'),
      stop('Leon', 'NI', 0, 'ground'),
      stop('Managua', 'NI', 0, 'ground', 'hub'),
      stop('Big Corn', 'NI', 12, 'flight', 'island'),
      stop('Managua', 'NI', 0, 'flight', 'hub'),
      stop('Granada', 'NI', 3, 'ground'),
      stop('San Juan del Sur', 'NI', 7, 'ground', 'beach'),
    ]
    expect(read(stops)).toEqual([['NI', 33, ['Leon 7', 'Las Penitas 4', 'Big Corn 12', 'Granada 3', 'San Juan del Sur 7']]])
  })

  it('names a chain by its ends and keeps the stops between', () => {
    const [c] = bundle([stop('A', 'CO', 3, 'flight'), stop('B', 'CO', 2, 'ground'), stop('C', 'CO', 0, 'ground'), stop('D', 'CO', 3, 'ground')])
    expect(c.places).toHaveLength(1)
    expect(c.places[0]).toMatchObject({ name: 'A to D', kind: 'chain', ends: [0, 3], anchor: 3, own: [0, 1, 2, 3] })
    expect(entryOf(c.places[0])).toBe(0)
  })

  it('moves a transit forward, and back only at the end of a country', () => {
    const [one, two] = bundle([
      stop('Transit', 'BO', 1, 'flight'), stop('Stay', 'BO', 6, 'flight'),
      stop('Stay2', 'PE', 6, 'flight'), stop('Transit2', 'PE', 1, 'flight'),
    ])
    expect(one.places.map((p) => [p.name, p.nights, p.stops])).toEqual([['Stay', 7, [0, 1]]])
    expect(two.places.map((p) => [p.name, p.nights, p.stops])).toEqual([['Stay2', 7, [2, 3]]])
    expect(entryOf(one.places[0])).toBe(1)
  })

  it('counts a country entered twice as two visits', () => {
    const list = bundle([stop('Lima', 'PE', 3, 'ground'), stop('La Paz', 'BO', 3, 'ground'), stop('Cusco', 'PE', 3, 'ground')])
    expect(list.map((c) => c.code)).toEqual(['PE', 'BO', 'PE'])
  })

  it('survives a country you only pass through', () => {
    const [c] = bundle([stop('Hub', 'PA', 0, 'flight', 'hub'), stop('Hub2', 'PA', 0, 'ground', 'hub')])
    expect(c.places).toHaveLength(1)
    expect(c.places[0]).toMatchObject({ name: 'Hub', kind: 'stay', nights: 0, anchor: 0 })
  })

  it('never loses a night', () => {
    const stops = [
      stop('A', 'CO', 1, 'flight'), stop('B', 'CO', 0, 'boat', 'hub'), stop('C', 'CO', 2, 'flight'),
      stop('D', 'CO', 1, 'flight'), stop('E', 'CO', 9, 'ground'), stop('F', 'CO', 1, 'boat', 'island'), stop('G', 'CO', 2, 'flight'),
    ]
    const [c] = bundle(stops)
    expect(c.places.reduce((n, p) => n + p.nights, 0)).toBe(c.nights)
    expect(c.places.flatMap((p) => p.stops).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })
})
