// The gyms mode: two ranked lists and the filters they share with the markers on the map.
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { SCORE_MAX, scoreText } from '../data/cardFacts'
import { DISCIPLINES, NO_FILTER, cityName, costRange, filtersActive, hiddenByCost, monthlyCost, scoreTier, topScore, totalOf, type GymFilter } from '../data/gyms'
import { cityMonthDkk, countText, countryCounts, hiddenCitiesByCost, hiddenNote, toggled } from '../data/modePanels'
import { countryName, type Model } from '../data/model'
import type { CityRow, GymRow } from '../data/types'
import { kr } from '../lib/format'
import { Flag } from './Flag'
import { ChipGroup, RangeSlider, Segmented, type Chip } from './ModeControls'
import { ModeSheet, type ModeShell } from './ModeSheet'
import { MODE_TITLE, type CardRef, type GymTab, type MapModeApi } from './useMapMode'

const COST_STEP = 250
const TABS: { id: GymTab; label: string }[] = [{ id: 'gyms', label: 'Gyms' }, { id: 'cities', label: 'Cities' }]
const DISCIPLINE_CHIPS: Chip[] = DISCIPLINES.map((d) => ({ id: d, label: d }))
const WATER_CHIP: Chip[] = [{ id: 'water', label: 'Near water' }]

export interface GymsPanelProps {
  api: MapModeApi
  model: Model
  shell: ModeShell
  onPick(ref: CardRef): void
}

interface RankRowProps {
  /** Null for a row with no score. */
  rank: number | null
  name: string
  country: string
  where: string
  total: number | null
  /** A month in kroner, left out when it is not known. */
  month: number | null
  id: string
  onOpen(id: string): void
}

const RankRow = memo(function RankRow({ rank, name, country, where, total, month, id, onOpen }: RankRowProps) {
  return (
    <li>
      <button type="button" className={`rrow tier-${scoreTier(total)}`} onClick={() => onOpen(id)}>
        <span className="rrow-rank">{rank}</span>
        <span className="rrow-t">
          <span className="rrow-n">{name}</span>
          <span className="rrow-s"><Flag code={country} size={11} /><span>{where}</span></span>
        </span>
        <span className="rrow-v">
          {total != null && <span className="rrow-score">{scoreText(total)}</span>}
          {month != null && <span className="rrow-cost">{kr(month)}/mo</span>}
        </span>
        {total != null && <span className="rrow-bar"><i style={{ transform: `scaleX(${total / SCORE_MAX})` }} /></span>}
      </button>
    </li>
  )
})

const rankOf = (total: number | null, i: number) => (total != null ? i + 1 : null)

const GymList = memo(function GymList({ rows, api, model, onOpen }: { rows: GymRow[]; api: MapModeApi['gyms']; model: Model; onOpen(id: string): void }) {
  return (
    <ol className="mlist ranked">
      {rows.map((g, i) => {
        const city = api.cityOf.get(g.id)
        const total = totalOf(g)
        return <RankRow key={g.id} id={g.id} rank={rankOf(total, i)} name={g.name} country={g.country} where={g.area || (city ? cityName(city) : countryName(model, g.country))} total={total} month={monthlyCost(g, city)?.total ?? null} onOpen={onOpen} />
      })}
    </ol>
  )
})

const CityList = memo(function CityList({ rows, model, onOpen }: { rows: CityRow[]; model: Model; onOpen(id: string): void }) {
  return (
    <ol className="mlist ranked">
      {rows.map((c, i) => {
        const total = totalOf(c)
        return <RankRow key={c.id} id={c.id} rank={rankOf(total, i)} name={cityName(c)} country={c.country} where={countryName(model, c.country)} total={total} month={cityMonthDkk(c)} onOpen={onOpen} />
      })}
    </ol>
  )
})

export function GymsPanel({ api, model, shell, onPick }: GymsPanelProps) {
  const { gyms: world, gymFilter: f, setGymFilter, tab, setTab, shownGyms, shownCities } = api
  const [filtersOpen, setFiltersOpen] = useState(!shell.narrow)
  const countries = useMemo<Chip[]>(
    () => countryCounts(world.gyms).map(([code, count]) => ({ id: code, label: countryName(model, code), count, lead: <Flag code={code} size={11} /> })),
    [world, model],
  )
  const cost = useMemo(() => costRange(world, COST_STEP), [world])
  const top = useMemo(() => topScore(world), [world])

  // rows stay memoized through a filter change, so what they open with must not change
  const pick = useRef(onPick)
  useLayoutEffect(() => {
    pick.current = onPick
  })
  const openGym = useCallback((id: string) => pick.current({ kind: 'gym', id }), [])
  const openCity = useCallback((id: string) => pick.current({ kind: 'city', id }), [])

  const set = (patch: Partial<GymFilter>) => setGymFilter({ ...f, ...patch })
  const onGyms = tab === 'gyms'
  const active = filtersActive(f)
  const shown = onGyms ? shownGyms.length : shownCities.length
  const count = onGyms ? countText(shownGyms.length, world.gyms.length, 'gyms') : countText(shownCities.length, world.cities.length, 'cities')
  const note = onGyms ? hiddenNote(hiddenByCost(world, f), 'gym', 'gyms') : hiddenNote(hiddenCitiesByCost(world, f), 'city', 'cities')

  const bar = (
    <>
      <Segmented<GymTab> label="List" value={tab} options={TABS} onChange={setTab} />
      <button type="button" className="mtoggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>
        Filters{active > 0 && <span className="mtoggle-n">{active}</span>}
      </button>
    </>
  )

  return (
    <ModeSheet {...shell} title={MODE_TITLE.gyms} count={count} bar={bar} scrollKey={tab}>
      {filtersOpen && (
        <div className="mfilters">
          <div className="mf">
            <p className="mf-k">Discipline</p>
            <ChipGroup label="Discipline" chips={DISCIPLINE_CHIPS} picked={f.disciplines} onToggle={(id) => set({ disciplines: toggled(f.disciplines, id as GymFilter['disciplines'][number]) })} />
          </div>
          <div className="mf">
            <p className="mf-k">Country</p>
            <ChipGroup label="Country" chips={countries} picked={f.countries} cap={5} onToggle={(id) => set({ countries: toggled(f.countries, id) })} />
          </div>
          {top > 0 && (
            <RangeSlider label="Minimum total score" value={f.minScore} min={0} max={top} step={0.5} display={f.minScore > 0 ? `${scoreText(f.minScore)} or more` : 'Any'} onChange={(minScore) => set({ minScore })} />
          )}
          {cost && (
            <RangeSlider
              label="Maximum a month"
              value={f.maxCost ?? cost[1]}
              min={cost[0]}
              max={cost[1]}
              step={COST_STEP}
              display={f.maxCost != null ? `Up to ${kr(f.maxCost)}` : 'Any'}
              onChange={(v) => set({ maxCost: v >= cost[1] ? null : v })}
            />
          )}
          <ChipGroup label="Water" chips={WATER_CHIP} picked={f.nearWater ? ['water'] : []} onToggle={() => set({ nearWater: !f.nearWater })} />
        </div>
      )}
      {active > 0 && shown > 0 && (
        <div className="mstatus">
          <p className="mnote">{note}</p>
          <button type="button" className="mclear" onClick={() => setGymFilter(NO_FILTER)}>Clear filters</button>
        </div>
      )}
      {shown === 0 ? (
        <div className="mempty">
          <p>{onGyms ? 'No gyms match these filters' : 'No cities match these filters'}</p>
          {note && <p className="mnote">{note}</p>}
          <button type="button" className="mclear" onClick={() => setGymFilter(NO_FILTER)}>Clear filters</button>
        </div>
      ) : onGyms ? (
        <GymList rows={shownGyms} api={world} model={model} onOpen={openGym} />
      ) : (
        <CityList rows={shownCities} model={model} onOpen={openCity} />
      )}
    </ModeSheet>
  )
}
