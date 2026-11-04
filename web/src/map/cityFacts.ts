// What a city lists under its stay: Experiences and Training as rows, the same in the trip sheet and the map panel.
// Experiences are the saved ones first, then the rest, then the things to do no experience already covers, which
// open nothing. Training is gyms only, the ones that teach BJJ first, each with its disciplines as chips (BJJ first)
// and its drop in price when it is known. A city's scorecard is not a place to train, so it is no row.
import { categoryLabel, type ExperienceWorld } from '../data/experiences'
import { disciplinesOf, totalOf, type Discipline, type GymWorld } from '../data/gyms'
import type { ExperienceCategory, GymDetails } from '../data/types'
import type { CardRef } from './useMapMode'

export interface CityFind {
  /** the card a row opens, none for a thing to do */
  ref: CardRef | null
  name: string
  /** the category of an experience that is not saved */
  sub: string | null
  /** what Simon wrote when he saved it */
  note: string | null
  saved: boolean
  chips: Discipline[]
  /** a gym's drop in price in kr */
  dropIn: number | null
  score: number | null
}

export interface CityFinds {
  experiences: CityFind[]
  training: CityFind[]
}

const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** BJJ first, the others in their usual order. */
const bjjFirst = (ds: Discipline[]) => [...ds.filter((d) => d === 'BJJ'), ...ds.filter((d) => d !== 'BJJ')]

export function cityFinds(
  gyms: Pick<GymWorld, 'gymsAtPlace'>,
  exps: Pick<ExperienceWorld, 'at' | 'markOf'>,
  categories: ExperienceCategory[] | undefined,
  placeId: string,
  things: string[] = [],
): CityFinds {
  const experiences = exps.at(placeId).map((e): CityFind => {
    const mark = exps.markOf('experience', e.id)
    return {
      ref: { kind: 'experience', id: e.id }, name: e.name, sub: mark ? null : categoryLabel(categories, e.category),
      note: mark?.note || null, saved: !!mark, chips: [], dropIn: null, score: null,
    }
  })
  const seen = experiences.map((e) => plain(e.name))
  for (const t of things) {
    const p = plain(t)
    if (!p || seen.some((s) => s.includes(p) || p.includes(s))) continue
    seen.push(p)
    experiences.push({ ref: null, name: t, sub: null, note: null, saved: false, chips: [], dropIn: null, score: null })
  }

  const rows = gyms.gymsAtPlace(placeId).map((g): CityFind => ({
    ref: { kind: 'gym', id: g.id }, name: g.name, sub: null, note: null, saved: false,
    chips: bjjFirst(disciplinesOf(g)),
    dropIn: (g.details as GymDetails | undefined)?.price_dropin_dkk ?? null,
    score: totalOf(g),
  }))
  const training = [...rows.filter((r) => r.chips[0] === 'BJJ'), ...rows.filter((r) => r.chips[0] !== 'BJJ')]
  return { experiences, training }
}
