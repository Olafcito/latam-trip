// The state of the map modes, apart from RouteMap: which mode is on, the stack of open cards, the filters and
// the tab. The markers on the map follow from it, filtered the same way as the lists.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Map as MLMap } from 'maplibre-gl'
import { NO_EXPERIENCE_FILTER, experienceWorld, filterExperiences, filterSaved, type ExperienceFilter } from '../data/experiences'
import { NO_FILTER, cityName, filterCities, filterGyms, gymWorld, rankCities, rankGyms, spreadGyms, type GymFilter } from '../data/gyms'
import type { CityRow, GymRow, MapData } from '../data/types'
import type { LonLat } from '../lib/geo'
import { scopeRows, type RouteScope } from './routeScope'
import { CITY_SOURCE, EXP_SOURCE, GYM_SOURCE, cityFeatures, experienceFeatures, gymFeatures, setMapMode, setModeData, setModeSelection, type MapMode } from './modeLayers'

export type { MapMode }
export type CardRef = { kind: 'gym' | 'city' | 'experience'; id: string }
export type GymTab = 'gyms' | 'cities'

export const MODE_TITLE: Record<MapMode, string> = { gyms: 'Gyms', experiences: 'Experiences' }

const cityAt = (c: CityRow): LonLat | undefined => (c.lat != null && c.lon != null ? [c.lon, c.lat] : undefined)

export type MapModeApi = ReturnType<typeof useMapMode>

/** With no map it still runs the cards. `first` is the card a window opens on, so it has its size from the first frame. */
export function useMapMode(map: MLMap | null, data: MapData, first?: CardRef, scope: RouteScope | null = null) {
  const gyms = useMemo(() => gymWorld(data.experiences, data.places), [data.experiences, data.places])
  const exps = useMemo(() => experienceWorld(data.experiences, data.places, data.lists), [data.experiences, data.places, data.lists])
  const gymSpots = useMemo(() => spreadGyms(gyms.gyms), [gyms])
  const expSpots = useMemo(() => spreadGyms(exps.all), [exps])

  const [mode, setModeState] = useState<MapMode | null>(null)
  // with a trip open the layers show what lies along it, until the whole map is asked for
  const [wide, setWide] = useState(false)
  const [stack, setStack] = useState<CardRef[]>(first ? [first] : [])
  const [tab, setTab] = useState<GymTab>('gyms')
  // filters outlive a mode: coming back finds the map as it was left
  const [gymFilter, setGymFilter] = useState<GymFilter>(NO_FILTER)
  const [expFilter, setExpFilter] = useState<ExperienceFilter>(NO_EXPERIENCE_FILTER)
  // how far each list was scrolled, so coming back finds it there too. Written on every scroll, so no state
  const [listScroll] = useState<Record<string, number>>(() => ({}))

  const modes = useMemo(() => {
    const on: MapMode[] = []
    if (gyms.gyms.length || gyms.cities.length) on.push('gyms')
    if (exps.all.length) on.push('experiences')
    return on
  }, [gyms, exps])

  // closing the trip puts the scope back to the trip's own, the next one starts along its route
  const tripOpen = !!scope
  useEffect(() => {
    if (!tripOpen) setWide(false)
  }, [tripOpen])

  const placeAt = useMemo(() => new Map(data.places.map((p): [string, LonLat] => [p.id, [p.lon, p.lat]])), [data.places])

  const shownGyms = useMemo(() => scopeRows(rankGyms(filterGyms(gyms, gymFilter)), (g) => gymSpots.get(g.id), scope, wide), [gyms, gymFilter, gymSpots, scope, wide])
  const shownCities = useMemo(() => scopeRows(rankCities(filterCities(gyms, gymFilter)), cityAt, scope, wide), [gyms, gymFilter, scope, wide])
  const shownExps = useMemo(() => scopeRows(filterExperiences(exps, expFilter), (e) => expSpots.get(e.id), scope, wide), [exps, expFilter, expSpots, scope, wide])
  const shownSaved = useMemo(
    () => scopeRows(filterSaved(exps, expFilter), (s) => (s.type === 'place' ? placeAt.get(s.id) : expSpots.get(s.id)), scope, wide),
    [exps, expFilter, expSpots, placeAt, scope, wide],
  )

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
    // a card opened from a place panel has a marker too, so the ring is not only for the modes
    const ringed = card && card.kind !== 'city' ? pointOf(card) : null
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
    listScroll,
    shownGyms,
    shownCities,
    shownExps,
    shownSaved,
    wide,
    setWide,
    scoped: !!scope && !wide,
    pointOf,
    gymPoints,
    points,
    titleOf,
  }
}
