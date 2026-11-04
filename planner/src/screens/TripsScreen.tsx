import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import type { AppData } from '../data/types'
import { useStore } from '../store'
import { kr } from '../lib/format'
import { bookedCount, bookedMark } from '../lib/booked'
import { travelUnknown, type Journey } from '../lib/journey'
import { usePlan } from '../lib/plan'
import { axisOf, monthTicks, type Axis, type Line } from '../lib/tripTimeline'
import { SORT_LABEL, sortTrips, type SortKey } from '../lib/tripsort'
import { summarize, type Summary } from '../lib/tripsummary'
import { Compare } from '../components/CompareTray'
import { NightsBar, tripLine } from '../components/NightsBar'
import { Caret, Check, Coin, Columns, Download, Moon, More, Pin, Plus, Star, Ticket, Trash, Warn } from '../components/icons'
import { PickScreen } from './PickScreen'
import { Notice } from '../components/Notice'
import { Unresolved } from '../components/Unresolved'
import { VersionMenu } from '../components/VersionMenu'
import { remoteEnabled } from '../lib/supabase'
import { TripDashboard } from './TripDashboard'

// The Trips tab. Its home is the list of whole trip options. The current plan sits pinned on top with
// the accent edge. Every row is its trip's nights as a bar on one axis shared by all rows, with the
// landing city under the left end and the city of the flight home under the right end, the nights, the
// travel total and what is booked. The whole row opens the trip. Compare docks on the right on a wide
// screen and is a sheet on a phone.

export function TripsScreen({ data }: { data: AppData }) {
  const view = useStore((s) => s.view)
  const journey = useStore((s) => s.journey)
  if (view === 'pick') return <PickScreen data={data} />
  if (view === 'trip' && journey) return <TripDashboard data={data} journey={journey} />
  return <Timetable data={data} />
}

export interface Row {
  j: Journey
  s: Summary | null
  line: Line | null
  draft: boolean
  rank?: number
  savedAt?: string
  total: number | null
  nights: number | null
  /** parts of the travel total with no price */
  unpriced: number
  /** its legs, ways and stays that are booked */
  booked: number
}

export const TOTAL_TIP = 'Travel: the long haul tickets, regional flights, ground legs, hub stays and cabin bags. Stays at the stops are apart.'
export const unpricedTip = (n: number) => `${n} ${n === 1 ? 'part has' : 'parts have'} no price yet, so the total is what is priced`

function Timetable({ data }: { data: AppData }) {
  const journey = useStore((s) => s.journey)
  const saved = useStore((s) => s.saved)
  const compare = useStore((s) => s.compare)
  const toggleCompare = useStore((s) => s.toggleCompare)
  const deleteSaved = useStore((s) => s.deleteSaved)
  const importJourneys = useStore((s) => s.importJourneys)
  const openSaved = useStore((s) => s.openSaved)
  const openTrip = useStore((s) => s.openTrip)
  const go = useStore((s) => s.go)
  const bookings = useStore((s) => s.bookings)
  const lodgings = useStore((s) => s.lodgings)
  const plan = usePlan((s) => s.id)
  const planReady = usePlan((s) => s.ready)
  const setPlan = usePlan((s) => s.set)
  const file = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('rank')

  useEffect(() => {
    if (!planReady) void usePlan.getState().load()
  }, [planReady])

  const unsaved = journey && !saved.some((s) => s.id === journey.id) ? journey : null
  const rows = useMemo<Row[]>(() => {
    const all = [...saved, ...(unsaved ? [unsaved] : [])]
    return all.map((j) => {
      const s = summarize(data, j, bookings, lodgings)
      return {
        j, s,
        line: s ? tripLine(data, j, s) : null,
        draft: j === unsaved,
        rank: j.rank,
        savedAt: j.savedAt,
        total: s ? s.total : null,
        nights: s ? s.nights : null,
        unpriced: s ? travelUnknown(s.t) : 0,
        booked: s ? bookedCount(bookings, data, j, s.sched) : 0,
      }
    })
  }, [data, saved, unsaved, bookings, lodgings])
  const axis = useMemo(() => axisOf(rows.flatMap((r) => (r.line ? [r.line] : []))), [rows])
  const months = useMemo(() => monthTicks(axis), [axis])
  const current = rows.find((r) => !r.draft && r.j.id === plan) ?? null
  const sorted = useMemo(() => sortTrips(rows.filter((r) => r !== current), sort), [rows, current, sort])

  const cmp = compare
    .map((id) => rows.find((r) => r.j.id === id && !r.draft && r.s))
    .filter((r): r is Row => !!r)

  const exportAll = () => {
    const blob = new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'latam-journeys.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const onImport = async (f: File | undefined) => {
    if (!f) return
    try {
      const n = importJourneys(JSON.parse(await f.text()))
      setMsg(`${n} ${n === 1 ? 'trip' : 'trips'} imported`)
    } catch {
      setMsg('That file is not a trip export')
    }
  }

  const newTrip = (
    <button type="button" className="btn tt-new" onClick={() => go('trips', 'pick')} aria-label="New trip" title="New trip">
      <Plus /><span>New trip</span>
    </button>
  )
  const io = (
    <div className="tt-io">
      {saved.length > 0 && <button type="button" className="btn link small" onClick={exportAll}><Download />Export all trips</button>}
      <button type="button" className="btn link small" onClick={() => file.current?.click()}>Import trips</button>
      <input ref={file} type="file" accept="application/json" hidden onChange={(e) => { onImport(e.target.files?.[0]); e.target.value = '' }} />
      <span className="tt-msg" role="status">{msg}</span>
    </div>
  )

  if (!rows.length) {
    return (
      <div className="tt tt-empty">
        <h2 className="sr">Trips</h2>
        <Notice />
        <Unresolved />
        <p>No trips yet. Start with the way in and the way home.</p>
        <button type="button" className="btn primary" onClick={() => go('trips', 'pick')}><Plus />New trip</button>
        {io}
      </div>
    )
  }

  const card = (r: Row) => (
    <TripRow
      key={r.j.id}
      row={r}
      axis={axis}
      months={months}
      current={r === current}
      selected={compare.includes(r.j.id)}
      onOpen={() => openTrip(r.j)}
      onMap={() => openSaved(r.j)}
      onCompare={() => toggleCompare(r.j.id)}
      onPlan={() => void setPlan(r.j.id)}
      onDelete={() => deleteSaved(r.j.id)}
    />
  )

  return (
    <div className="tt" data-cmp={cmp.length > 0 || undefined}>
      <h2 className="sr">Trips</h2>
      <Notice />
      <Unresolved />

      {current && (
        <section className="tt-current" aria-label="Current plan">
          <ol className="tt-rows">{card(current)}</ol>
        </section>
      )}

      <div className="tt-bar">
        <SortSeg value={sort} onChange={setSort} />
        <span className="tt-count mono">{rows.length} {rows.length === 1 ? 'trip' : 'trips'}</span>
        <p className="sr" role="status">{`Sorted by ${SORT_LABEL[sort]}`}</p>
        <span className="tt-spacer" />
        {newTrip}
      </div>

      <div className="tt-table">
        <div className="tt-head" aria-hidden="true">
          <span className="tt-h-route">
            {months.map((m) => <span key={m.day} className="tt-mon" style={{ left: `${m.x * 100}%` }}>{m.label}</span>)}
          </span>
        </div>
        <ol className="tt-rows" aria-label="Trips">{sorted.map(card)}</ol>
      </div>

      {io}

      {cmp.length > 0 && (
        <Compare
          data={data}
          items={cmp}
          onOpen={(j) => openTrip(j)}
          onRemove={(id) => toggleCompare(id)}
          onClear={() => compare.forEach((id) => toggleCompare(id))}
        />
      )}
    </div>
  )
}

/** Sort by rank, price or length. A radio group: arrows move and pick, wrapping, Home and End jump. */
function SortSeg({ value, onChange }: { value: SortKey; onChange: (k: SortKey) => void }) {
  const keys: SortKey[] = ['rank', 'price', 'nights']
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = keys.indexOf(value)
    const to =
      e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % keys.length
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + keys.length) % keys.length
          : e.key === 'Home' ? 0
            : e.key === 'End' ? keys.length - 1
              : -1
    if (to < 0) return
    e.preventDefault()
    onChange(keys[to])
    refs.current[to]?.focus()
  }
  return (
    <div className="seg tt-sort" role="radiogroup" aria-label="Sort trips by" onKeyDown={onKey}>
      {keys.map((k, i) => (
        <button
          key={k}
          ref={(el) => { refs.current[i] = el }}
          type="button"
          role="radio"
          aria-checked={value === k}
          tabIndex={value === k ? 0 : -1}
          onClick={() => onChange(k)}
        >
          {SORT_LABEL[k]}
        </button>
      ))}
    </div>
  )
}

interface RowProps {
  row: Row
  axis: Axis
  months: { day: string; x: number }[]
  current: boolean
  selected: boolean
  onOpen: () => void
  onMap: () => void
  onCompare: () => void
  onPlan: () => void
  onDelete: () => void
}

/** The total as a number, with a hollow coin and the count when parts have no price. */
export function Total({ total, unpriced, big = true }: { total: number | null; unpriced: number; big?: boolean }) {
  if (total == null) return <span className="tt-unknown">No price</span>
  return (
    <span className="tt-price" title={TOTAL_TIP}>
      <span className={big ? 'tt-big' : undefined}>{kr(total)}</span>
      {unpriced > 0 && (
        <span className="tt-unpriced" title={unpricedTip(unpriced)} aria-label={unpricedTip(unpriced)}>
          <Coin s={12} />{unpriced}
        </span>
      )}
    </span>
  )
}

function TripRow({ row, axis, months, current, selected, onOpen, onMap, onCompare, onPlan, onDelete }: RowProps) {
  const { j, s, line, draft } = row
  const mark = bookedMark(row.booked)
  const name = j.name
  const versioned = remoteEnabled() && (j.version ?? 0) > 1
  // a click anywhere on the row opens the trip, except on a control or at the end of a text selection
  const onRowClick = (e: MouseEvent<HTMLLIElement>) => {
    if (!s) return
    if ((e.target as HTMLElement).closest('a, button, input, label, [role="menu"]')) return
    if (window.getSelection()?.toString()) return
    onOpen()
  }

  return (
    <li className="tt-row" data-current={current || undefined} data-selected={selected || undefined} data-off={!s || undefined} onClick={onRowClick}>
      <div className="tt-name">
        {current && <span className="tt-cur"><Check s={12} />Current plan</span>}
        <h3 className="tt-title">
          <button type="button" className="tt-open" onClick={onOpen} disabled={!s}>{name}</button>
        </h3>
        <span className="tt-marks">
          {draft && <span className="tag draft">not saved</span>}
          {!draft && j.rank != null && (
            <span className="tt-rank" title={`Rank ${j.rank} among the planned trips`} aria-label={`Rank ${j.rank}`}><Star s={11} />{j.rank}</span>
          )}
          {!draft && versioned && <VersionMenu id={j.id} version={j.version!} />}
          {mark && <span className="tt-booked" title="Legs, ways and stays booked"><Ticket />{mark}</span>}
          {!s && <span className="tt-gone" title="Its flights are no longer in the data" aria-label="Its flights are no longer in the data"><Warn s={12} />gone</span>}
        </span>
      </div>

      <div className="tt-route">
        {line && s && <NightsBar line={line} axis={axis} months={months} from={s.route[0]} to={s.route[s.route.length - 1]} />}
      </div>

      <div className="tt-figs">
        {row.nights != null && (
          <span className="tt-nights" title={`${row.nights} nights from the landing to the flight home`} aria-label={`${row.nights} nights`}>
            <Moon s={12} />{row.nights}
          </span>
        )}
        <Total total={row.total} unpriced={row.unpriced} />
      </div>

      <div className="tt-act">
        {!draft && s && (
          <button type="button" className="tt-chip" aria-pressed={selected} onClick={onCompare} aria-label={`Compare ${name}`}>
            <Columns s={13} /><span>Compare</span>
          </button>
        )}
        <RowMenu name={name} draft={draft} canOpen={!!s} current={current} booked={row.booked} onMap={onMap} onPlan={onPlan} onDelete={onDelete} />
        {s && <span className="tt-chev" aria-hidden><Caret dir="r" s={16} /></span>}
      </div>
    </li>
  )
}

/** More: make it the plan, build on the map, delete. Delete asks in the menu and names the bookings it leaves. */
function RowMenu({ name, draft, canOpen, current, booked, onMap, onPlan, onDelete }: {
  name: string; draft: boolean; canOpen: boolean; current: boolean; booked: number; onMap: () => void; onPlan: () => void; onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const [asking, setAsking] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)

  const close = (focus = true) => {
    setOpen(false)
    setAsking(false)
    if (focus) btn.current?.focus()
  }
  useEffect(() => {
    if (!open) return
    pop.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus()
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) close(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open, asking])

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      if (asking) setAsking(false)
      else close()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const items = [...(pop.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLElement)
    e.preventDefault()
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
  }
  const act = (f: () => void) => () => { close(); f() }

  return (
    <div className="tt-more" ref={wrap}>
      <button
        type="button" ref={btn} className="tt-icon" aria-haspopup="menu" aria-expanded={open}
        aria-label={`More for ${name}`} title="More" onClick={() => (open ? close() : setOpen(true))}
      >
        <More />
      </button>
      <div ref={pop} className="tt-pop" role="menu" aria-label={name} data-open={open || undefined} onKeyDown={onKey}>
        {asking ? (
          <>
            <p className="tt-pop-name">{name}</p>
            {booked > 0 && (
              <p className="tt-pop-warn"><Ticket />{`${booked} ${booked === 1 ? 'booking' : 'bookings'} will have no trip`}</p>
            )}
            <button type="button" role="menuitem" className="tt-item danger" onClick={act(onDelete)}><Trash s={15} />Delete the trip</button>
            <button type="button" role="menuitem" className="tt-item" onClick={() => setAsking(false)}>Keep it</button>
          </>
        ) : (
          <>
            {!draft && (
              <button type="button" role="menuitem" className="tt-item" aria-disabled={current || undefined} disabled={!canOpen || current} onClick={act(onPlan)}>
                {current ? <Check s={15} /> : <Star s={15} />}{current ? 'Your current plan' : 'Make it my plan'}
              </button>
            )}
            <button type="button" role="menuitem" className="tt-item" disabled={!canOpen} onClick={act(onMap)}><Pin s={15} />Build on the map</button>
            {!draft && <button type="button" role="menuitem" className="tt-item danger" onClick={() => setAsking(true)}><Trash s={15} />Delete</button>}
          </>
        )}
      </div>
    </div>
  )
}
