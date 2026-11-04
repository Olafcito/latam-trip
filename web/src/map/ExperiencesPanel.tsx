// The experiences mode: what is saved first, then everything else by place, filtered with the markers on the map.
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { NO_EXPERIENCE_FILTER, categoriesIn, categoryLabel, countriesOf, type PlaceGroup, type SavedEntry } from '../data/experiences'
import { countText, experienceFiltersActive, keepCategories, placeGroups, toggled } from '../data/modePanels'
import { countryName, type Model } from '../data/model'
import { CardRow, SavedLine } from './CardParts'
import { Flag } from './Flag'
import { ChipGroup, ScopeToggle, type Chip } from './ModeControls'
import { ModeSheet, type ModeShell } from './ModeSheet'
import { MODE_TITLE, type CardRef, type MapModeApi } from './useMapMode'

const ALL = 'all'
const SAVED = 'saved'

export interface ExperiencesPanelProps {
  api: MapModeApi
  model: Model
  shell: ModeShell
  onPick(ref: CardRef): void
  onPlace(id: string): void
  /** The countries the open trip passes through. With the layer scoped along the route only these get a chip. */
  tripCountries?: string[]
}

interface ListProps {
  saved: SavedEntry[]
  groups: PlaceGroup[]
  categories: Model['data']['categories']
  onSaved(entry: SavedEntry): void
  onRow(id: string): void
}

/** Up to 474 rows, so none of them animates and the ones out of view are left to content-visibility. */
const ExperienceList = memo(function ExperienceList({ saved, groups, categories, onSaved, onRow }: ListProps) {
  return (
    <>
      {saved.length > 0 && (
        <section className="mgroup">
          <h3 className="mgroup-h"><span>Saved</span><span className="mgroup-n">{saved.length}</span></h3>
          <ul className="mlist">
            {saved.map((s) => <CardRow key={`${s.type}-${s.id}`} name={s.name} sub={<SavedLine note={s.mark.note} />} onClick={() => onSaved(s)} />)}
          </ul>
        </section>
      )}
      {groups.map((g) => (
        <section key={g.id} className="mgroup">
          <h3 className="mgroup-h"><span>{g.name}</span><span className="mgroup-n">{g.rows.length}</span></h3>
          <ul className="mlist">
            {g.rows.map((e) => <CardRow key={e.id} name={e.name} sub={categoryLabel(categories, e.category)} onClick={() => onRow(e.id)} />)}
          </ul>
        </section>
      ))}
    </>
  )
})

export function ExperiencesPanel({ api, model, shell, onPick, onPlace, tripCountries }: ExperiencesPanelProps) {
  const { exps: world, expFilter: f, setExpFilter, shownExps, shownSaved } = api
  const { categories, places } = model.data

  const countries = useMemo<Chip[]>(
    () => countriesOf(world)
      .filter(([code]) => !api.scoped || !tripCountries?.length || tripCountries.includes(code) || f.countries.includes(code))
      .map(([code, count]) => ({ id: code, label: countryName(model, code), count, lead: <Flag code={code} size={11} /> })),
    [world, model, api.scoped, tripCountries, f.countries],
  )
  const inCountries = useMemo(() => categoriesIn(world, f.countries), [world, f.countries])
  const categoryChips = useMemo<Chip[]>(() => inCountries.map(([id, count]) => ({ id, label: categoryLabel(categories, id), count })), [inCountries, categories])
  const groups = useMemo(() => placeGroups(world, shownExps, shownSaved, places, f), [world, shownExps, shownSaved, places, f])

  // the list stays memoized through a filter change, so what it opens with must not change
  const open = useRef({ onPick, onPlace })
  useLayoutEffect(() => {
    open.current = { onPick, onPlace }
  })
  const onRow = useCallback((id: string) => open.current.onPick({ kind: 'experience', id }), [])
  const onSaved = useCallback((s: SavedEntry) => {
    if (s.type === 'place') open.current.onPlace(s.id)
    else open.current.onPick({ kind: 'experience', id: s.id })
  }, [])

  const toggleCountry = (id: string) => {
    const next = id === ALL ? [] : toggled(f.countries, id)
    setExpFilter({ ...f, countries: next, categories: keepCategories(f.categories, categoriesIn(world, next)) })
  }
  const toggleCategory = (id: string) => {
    if (id === SAVED) setExpFilter({ ...f, saved: !f.saved })
    else setExpFilter({ ...f, categories: toggled(f.categories, id) })
  }

  const active = experienceFiltersActive(f)
  const empty = !shownSaved.length && !groups.length
  const count = f.saved ? `${shownSaved.length} saved` : countText(shownExps.length, world.all.length)
  const clear = () => setExpFilter(NO_EXPERIENCE_FILTER)
  // the list leads on a phone, so its filters wait behind the Filters button there
  const [filtersOpen, setFiltersOpen] = useState(!shell.narrow)
  const bar = (
    <button type="button" className="mtoggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>
      Filters{active > 0 && <span className="mtoggle-n">{active}</span>}
    </button>
  )

  return (
    <ModeSheet {...shell} title={MODE_TITLE.experiences} count={count} tools={<ScopeToggle api={api} />} bar={bar} scrollKey="experiences">
      {filtersOpen && (
        <div className="mfilters">
          <ChipGroup label="Country" line chips={countries} picked={f.countries.length ? f.countries : [ALL]} pinned={[{ id: ALL, label: 'All' }]} cap={4} onToggle={toggleCountry} />
          <ChipGroup label="Category" line chips={categoryChips} picked={f.saved ? [SAVED, ...f.categories] : f.categories} pinned={[{ id: SAVED, label: 'Saved', count: shownSaved.length }]} cap={5} onToggle={toggleCategory} />
        </div>
      )}
      {active > 0 && !empty && (
        <div className="mstatus end">
          <button type="button" className="mclear" onClick={clear}>Clear filters</button>
        </div>
      )}
      {empty && api.scoped ? (
        <div className="mempty">
          <p>No experiences along this route</p>
          <button type="button" className="mclear" onClick={() => api.setWide(true)}>Show the whole map</button>
        </div>
      ) : empty ? (
        <div className="mempty">
          <p>No experiences match these filters</p>
          <button type="button" className="mclear" onClick={clear}>Clear filters</button>
        </div>
      ) : (
        <ExperienceList saved={shownSaved} groups={groups} categories={categories} onSaved={onSaved} onRow={onRow} />
      )}
    </ModeSheet>
  )
}
