import { describe, expect, it } from 'vitest'
import { byCountry, type Neighbour } from './model'

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
