import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import type { AppData } from '../data/types'
import { useStore } from '../store'
import { kr } from '../lib/format'
import { bookedCount, bookedMark } from '../lib/booked'
import type { Journey } from '../lib/journey'
import { tripRoute, type TripRoute } from '../lib/route'
import { SORT_LABEL, sortTrips, type SortKey } from '../lib/tripsort'
import { summarize, type Summary } from '../lib/tripsummary'
import { CompareTray } from '../components/CompareTray'
import { RouteLine } from '../components/RouteLine'
import { Download, Pin, Plus, Trash } from '../components/icons'
import { PickScreen } from './PickScreen'
import { Notice } from '../components/Notice'
import { Unresolved } from '../components/Unresolved'
import { VersionMenu } from '../components/VersionMenu'
import { remoteEnabled } from '../lib/supabase'
import { TripDashboard } from './TripDashboard'
import { Unknown } from '@map/map/Unknown'

// The Trips tab. Its home is a list: one row per trip with its name, its route as flags from the
// landing to the way out, and the all-in price. Every trip runs early December to early February, so
// dates and nights stay off the list. A trip with something bought has a green ticket mark with the
// count. Compare docks to the bottom.

export function TripsScreen({ data }: { data: AppData }) {
  const view = useStore((s) => s.view)
  const journey = useStore((s) => s.journey)
  if (view === 'pick') return <PickScreen data={data} />
  if (view === 'trip' && journey) return <TripDashboard data={data} journey={journey} />
  return <Timetable data={data} />
}

interface Row {
  j: Journey
  s: Summary | null
  route: TripRoute | null
  draft: boolean
  rank?: number
  savedAt?: string
  total: number | null
  air: number | null
  /** its legs, ways and stays that are booked */
  booked: number
}

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
  const file = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('rank')

  const unsaved = journey && !saved.some((s) => s.id === journey.id) ? journey : null
  const rows = useMemo<Row[]>(() => {
    const all = [...saved, ...(unsaved ? [unsaved] : [])]
    return all.map((j) => {
      const s = summarize(data, j, bookings, lodgings)
      return {
        j, s,
        route: s ? tripRoute(data, j) : null,
        draft: j === unsaved,
        rank: j.rank,
        savedAt: j.savedAt,
        total: s ? s.total : null,
        air: s ? s.t.air_hours : null,
        booked: s ? bookedCount(bookings, data, j, s.sched) : 0,
      }
    })
  }, [data, saved, unsaved, bookings, lodgings])
  const sorted = useMemo(() => sortTrips(rows, sort), [rows, sort])

  const cmp = compare
    .map((id) => rows.find((r) => r.j.id === id && !r.draft))
    .filter((r): r is Row => !!r)
    .map((r) => ({ j: r.j, s: r.s }))

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
    <button type="button" className="btn primary" onClick={() => go('trips', 'pick')}>
      <Plus />New trip
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
        {newTrip}
        {io}
      </div>
    )
  }

  return (
    <div className="tt">
      <h2 className="sr">Trips</h2>
      <Notice />
      <Unresolved />
      <div className="tt-bar">
        <SortSeg value={sort} onChange={setSort} />
        <span className="tt-count mono">{rows.length} {rows.length === 1 ? 'trip' : 'trips'}</span>
        <p className="sr" role="status">{`Sorted by ${SORT_LABEL[sort]}`}</p>
        <span className="tt-spacer" />
        {newTrip}
      </div>

      <div className="tt-table">
        <div className="tt-head" aria-hidden="true">
          <span className="tt-h tt-h-name">trip</span>
          <span className="tt-h">route</span>
          <span className="tt-h num">all in</span>
          <span className="tt-h" />
        </div>

        <ol className="tt-rows" aria-label="Trips">
          {sorted.map((r) => (
            <TripRow
              key={r.j.id}
              row={r}
              selected={compare.includes(r.j.id)}
              onOpen={() => openTrip(r.j)}
              onMap={() => openSaved(r.j)}
              onCompare={() => toggleCompare(r.j.id)}
              onDelete={() => deleteSaved(r.j.id)}
            />
          ))}
        </ol>
      </div>

      {io}

      {cmp.length > 0 && <CompareTray data={data} items={cmp} onClear={() => compare.forEach((id) => toggleCompare(id))} />}
    </div>
  )
}

/** Sort by rank, price or air time. A radio group: arrows move and pick, wrapping, Home and End jump. */
function SortSeg({ value, onChange }: { value: SortKey; onChange: (k: SortKey) => void }) {
  const keys: SortKey[] = ['rank', 'price', 'air']
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
  selected: boolean
  onOpen: () => void
  onMap: () => void
  onCompare: () => void
  onDelete: () => void
}

function TripRow({ row, selected, onOpen, onMap, onCompare, onDelete }: RowProps) {
  const { j, s, route, draft } = row
  const mark = bookedMark(row.booked)
  const name = j.name
  const versioned = remoteEnabled() && (j.version ?? 0) > 1
  // the whole row opens the trip, except a click on a control in it or one that ends a text selection
  const onRowClick = (e: MouseEvent<HTMLLIElement>) => {
    if (!s) return
    if ((e.target as HTMLElement).closest('a, button, input, label')) return
    if (window.getSelection()?.toString()) return
    onOpen()
  }

  return (
    <li className="tt-row" data-selected={selected || undefined} data-off={!s || undefined} onClick={onRowClick}>
      <div className="tt-name">
        <button type="button" className="tt-open" onClick={onOpen} disabled={!s} title={s ? name : 'Its flights are no longer in the data'}>
          {name}
        </button>
        <span className="tt-tagline">
          {draft ? <span className="tag draft">not saved</span>
            : j.rank != null ? <span className="tag" title="Rank among the planned trips">#{j.rank}</span>
              : j.version != null ? (versioned ? null : <span className="tag" title="Version in the trips table">version {j.version}</span>)
                : <span className="tag mine">mine</span>}
          {!draft && versioned && <VersionMenu id={j.id} version={j.version!} />}
          {mark && <span className="tt-booked" title="Legs, ways and stays booked"><Ticket />{mark}</span>}
        </span>
      </div>

      <div className="tt-route">
        {route ? <RouteLine route={route} />
          : <span className="tt-gone">{s ? 'No stops to draw yet' : 'Its flights are no longer in the data'}</span>}
      </div>

      <span className="tt-n tt-total">
        {s ? (
          <>
            <span className="tt-big total-mark" data-complete={!s.partial}>
              {s.partial && <span className="tt-q" title="Some legs have no price yet, so this is a floor">from </span>}
              {kr(s.total)}
            </span>
            <span className="tt-sub">{kr(s.t.tickets_dkk)} long haul</span>
          </>
        ) : <Q />}
        <span className="sr"> all in</span>
      </span>

      <RowActions name={name} draft={draft} canOpen={!!s} selected={selected} onMap={onMap} onCompare={onCompare} onDelete={onDelete} />
    </li>
  )
}

const Q = () => <Unknown title="Trip total not known" />

const Ticket = () => (
  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
    <path d="M13 5v2M13 11v2M13 17v2" />
  </svg>
)

const Check = () => (
  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)

/** Map, compare and delete. Delete asks in place: the trash turns into "Delete? yes / no", Escape backs out. */
function RowActions({ name, draft, canOpen, selected, onMap, onCompare, onDelete }: {
  name: string; draft: boolean; canOpen: boolean; selected: boolean; onMap: () => void; onCompare: () => void; onDelete: () => void
}) {
  const [asking, setAsking] = useState(false)
  const noRef = useRef<HTMLButtonElement>(null)
  const trashRef = useRef<HTMLButtonElement>(null)
  const back = useRef(false)
  useEffect(() => {
    if (asking) noRef.current?.focus()
    else if (back.current) { back.current = false; trashRef.current?.focus() }
  }, [asking])
  const cancel = () => { back.current = true; setAsking(false) }

  if (asking) {
    return (
      <div className="tt-act asking" role="group" aria-label={`Delete ${name}?`} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); cancel() } }}>
        <span className="tt-ask" aria-hidden="true">Delete?</span>
        <button type="button" className="tt-yes" onClick={onDelete} aria-label={`Yes, delete ${name}`}><Check />yes</button>
        <button type="button" className="tt-no" ref={noRef} onClick={cancel} aria-label={`No, keep ${name}`}>no</button>
      </div>
    )
  }
  return (
    <div className="tt-act">
      <button type="button" className="tt-icon" onClick={onMap} disabled={!canOpen} aria-label={`Build ${name} on the map`} title="Build on the map"><Pin s={15} /></button>
      {!draft && (
        <label className="tt-icon tt-cmp" title="Compare">
          <input type="checkbox" checked={selected} onChange={onCompare} aria-label={`Compare ${name}`} />
        </label>
      )}
      {!draft && (
        <button type="button" className="tt-icon" ref={trashRef} onClick={() => setAsking(true)} aria-label={`Delete ${name}`} title="Delete"><Trash s={15} /></button>
      )}
    </div>
  )
}
