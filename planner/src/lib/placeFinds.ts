// What an itinerary lists beside its hostels: a place's Experiences and Training as rows that open their card.
// The detail stays in the card, as it does in the map's place panel.
import { scoreText } from '@map/data/cardFacts'
import { categoryLabel, experienceWorld } from '@map/data/experiences'
import { cityName, disciplinesOf, gymWorld, rankGyms, totalOf } from '@map/data/gyms'
import type { MapData } from '@map/data/types'
import type { CardRef } from '@map/map/useMapMode'

export interface FindRow {
  ref: CardRef
  name: string
  sub: string
  score: string | null
  saved: boolean
}

export interface PlaceFinds {
  experiences: FindRow[]
  training: FindRow[]
}

const scored = (total: number | null) => (total == null ? null : scoreText(total))

/** Builds the worlds once and reads a place from them. */
export function placeFinds(data: Pick<MapData, 'experiences' | 'places' | 'lists' | 'categories'>): (placeId: string) => PlaceFinds {
  const gyms = gymWorld(data.experiences, data.places)
  const exps = experienceWorld(data.experiences, data.places, data.lists)
  return (placeId) => {
    const experiences = exps.at(placeId).map((e): FindRow => {
      const mark = exps.markOf('experience', e.id)
      const sub = mark ? (mark.note ? `Saved: ${mark.note}` : 'Saved') : categoryLabel(data.categories, e.category)
      return { ref: { kind: 'experience', id: e.id }, name: e.name, sub, score: null, saved: !!mark }
    })
    const city = gyms.cityOfPlace(placeId)
    const cityRow: FindRow[] = city
      ? [{ ref: { kind: 'city', id: city.id }, name: cityName(city), sub: 'City scorecard', score: scored(totalOf(city)), saved: false }]
      : []
    const gymRows = rankGyms(gyms.gymsAtPlace(placeId)).map((g): FindRow => ({
      ref: { kind: 'gym', id: g.id },
      name: g.name,
      sub: disciplinesOf(g).join(', '),
      score: scored(totalOf(g)),
      saved: false,
    }))
    return { experiences, training: [...cityRow, ...gymRows] }
  }
}
