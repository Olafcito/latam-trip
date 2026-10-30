// The state of the map modes, apart from RouteMap: which mode is on, the stack of open cards, the filters and
// the tab. The markers on the map follow from it, filtered the same way as the lists.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Map as MLMap } from 'maplibre-gl'
import { NO_EXPERIENCE_FILTER, experienceWorld, filterExperiences, filterSaved, type ExperienceFilter } from '../data/experiences'
import { NO_FILTER, cityName, filterCities, filterGyms, gymWorld, rankCities, rankGyms, spreadGyms, type GymFilter } from '../data/gyms'
import type { CityRow, GymRow, MapData } from '../data/types'
import type { LonLat } from '../lib/geo'
import { CITY_SOURCE, EXP_SOURCE, GYM_SOURCE, cityFeatures, experienceFeatures, gymFeatures, setMapMode, setModeData, setModeSelection, type MapMode } from './modeLayers'

export type { MapMode }
export type CardRef = { kind: 'gym' | 'city' | 'experience'; id: string }
export type GymTab = 'gyms' | 'cities'

export type MapModeApi = ReturnType<typeof useMapMode>

export function useMapMode(map: MLMap | null, data: MapData) {
  const gyms = useMemo(() => gymWorld(data.experiences, data.places), [data.experiences, data.places])
  const exps = useMemo(() => experienceWorld(data.experiences, data.places, data.lists), [data.experiences, data.places, data.lists])
  const gymSpots = useMemo(() => spreadGyms(gyms.gyms), [gyms])
  const expSpots = useMemo(() => spreadGyms(exps.all), [exps])

  const [mode, setModeState] = useState<MapMode | null>(null)
  const [stack, setStack] = useState<CardRef[]>([])
  const [tab, setTab] = useState<GymTab>('gyms')
  // filters outlive a mode: coming back finds the map as it was left
  const [gymFilter, setGymFilter] = useState<GymFilter>(NO_FILTER)
  const [expFilter, setExpFilter] = useState<ExperienceFilter>(NO_EXPERIENCE_FILTER)

  const modes = useMemo(() => {
    const on: MapMode[] = []
    if (gyms.gyms.length || gyms.cities.length) on.push('gyms')
    if (exps.all.length) on.push('experiences')
    return on
  }, [gyms, exps])

  const shownGyms = useMemo(() => rankGyms(filterGyms(gyms, gymFilter)), [gyms, gymFilter])
  const shownCities = useMemo(() => rankCities(filterCities(gyms, gymFilter)), [gyms, gymFilter])
  const shownExps = useMemo(() => filterExperiences(exps, expFilter), [exps, expFilter])
  const shownSaved = useMemo(() => filterSaved(exps, expFilter), [exps, expFilter])

  const gymMarks = useMemo(() => gymFeatures(shownGyms, gymSpots), [shownGyms, gymSpots])
  const cityMarks = useMemo(() => cityFeatures(shownCities), [shownCities])
  const expMarks = useMemo(() => experienceFeatures(shownExps, shownSaved, data.places, expSpots), [shownExps, shownSaved, data.places, expSpots])

  const setMode = useCallback((next: MapMode | null) => {
    setModeState(next)
    setStack([])
  }, [])

  /** A marker or a list row: a new start, the stack holds just this card. */
  const openCard = useCallback((ref: CardRef) => setStack([ref]), [])
  /** A link inside a card: the card it came from stays one step back. */
  const pushCard = useCallback((ref: CardRef) => setStack((s) => [...s, ref]), [])
  const popCard = useCallback(() => setStack((s) => s.slice(0, -1)), [])
  const closeCards = useCallback(() => setStack([]), [])

  const card = stack.at(-1) ?? null

  /** Where a card's marker sits, or null when it has no place on the map. */
  const pointOf = useCallback(
    (ref: CardRef): LonLat | null => {
      if (ref.kind === 'gym') return gymSpots.get(ref.id) ?? null
      if (ref.kind === 'experience') return expSpots.get(ref.id) ?? null
      const c = gyms.byId.get(ref.id)
      return c?.lat != null && c.lon != null ? [c.lon, c.lat] : null
    },
    [gyms, gymSpots, expSpots],
  )

  /** Where a city's gyms sit, to frame the city. */
  const gymPoints = useCallback(
    (cityId: string): LonLat[] => {
      const c = gyms.byId.get(cityId) as CityRow | undefined
      return c ? gyms.gymsOf(c).map((g) => gymSpots.get(g.id)).filter((at) => !!at) : []
    },
    [gyms, gymSpots],
  )

  /** Every marker a mode shows right now. */
  const points = useCallback(
    (m: MapMode): LonLat[] => {
      const features = m === 'gyms' ? [...gymMarks.features, ...cityMarks.features] : expMarks.features
      return features.map((f) => f.geometry.coordinates as LonLat)
    },
    [gymMarks, cityMarks, expMarks],
  )

  /** The name a card goes by, for its Back link. */
  const titleOf = useCallback(
    (ref: CardRef): string | null => {
      if (ref.kind === 'experience') return exps.byId.get(ref.id)?.name ?? null
      const row = gyms.byId.get(ref.id)
      if (!row) return null
      return ref.kind === 'city' ? cityName(row as CityRow) : (row as GymRow).name
    },
    [gyms, exps],
  )

  useEffect(() => {
    if (map) setMapMode(map, mode)
  }, [map, mode])

  useEffect(() => {
    if (!map || mode !== 'gyms') return
    setModeData(map, GYM_SOURCE, gymMarks)
    setModeData(map, CITY_SOURCE, cityMarks)
  }, [map, mode, gymMarks, cityMarks])

  useEffect(() => {
    if (map && mode === 'experiences') setModeData(map, EXP_SOURCE, expMarks)
  }, [map, mode, expMarks])

  useEffect(() => {
    if (!map) return
    const ringed = mode && card && card.kind !== 'city' ? pointOf(card) : null
    setModeSelection(map, ringed, mode && card?.kind === 'city' ? card.id : null)
  }, [map, mode, card, pointOf])

  return {
    gyms,
    exps,
    modes,
    mode,
    setMode,
    stack,
    card,
    openCard,
    pushCard,
    popCard,
    closeCards,
    tab,
    setTab,
    gymFilter,
    setGymFilter,
    expFilter,
    setExpFilter,
    shownGyms,
    shownCities,
    shownExps,
    shownSaved,
    pointOf,
    gymPoints,
    points,
    titleOf,
  }
}
