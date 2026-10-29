import { useState, type Ref } from 'react'
import type { Model } from '../data/model'
import { TRIP_COLORS, legOption, tripEnd, tripStops, tripTotals, type Trip, type TripState } from '../data/trips'
import { familyOf } from '../data/types'
import { duration, kr } from '../lib/format'
import { Chevron, Close, ModeChip } from './icons'

interface Props {
  model: Model
  trips: TripState
  collapsed: boolean
  panelRef: Ref<HTMLElement>
  onCollapse(collapsed: boolean): void
  onClose(): void
  onCreate(name: string): void
  onOpen(trip: Trip): void
  onShut(): void
  onRename(id: string, name: string): void
  onDelete(id: string): void
  onRemoveLeg(id: string, index: number): void
  onGoTo(placeId: string): void
}

/** Every saved trip. Only reached from the trip bar, so exploring stays as it was. */
export function TripsPanel(p: Props) {
  const list = [...p.trips.trips].sort((x, y) => y.updated - x.updated)
  const color = (t: Trip) => TRIP_COLORS[p.trips.trips.indexOf(t) % TRIP_COLORS.length]
  return (
    <section ref={p.panelRef} className={`panel trips${p.collapsed ? ' collapsed' : ''}`} aria-label="Trips">
      {p.collapsed ? (
        <div className="pslim">
          <span className="pslim-name">Trips</span>
          <button className="x sm" aria-label="Expand panel" onClick={() => p.onCollapse(false)}><Chevron up={false} /></button>
          <button className="x sm" aria-label="Close" onClick={p.onClose}><Close /></button>
        </div>
      ) : (
        <div className="pview">
          <div className="pbody stg">
            <div className="prow">
              <div>
                <p className="kicker mono">Saved on this device</p>
                <h2 className="pname">Trips</h2>
              </div>
              <div className="hbtns">
                <button className="x" aria-label="Collapse panel" onClick={() => p.onCollapse(true)}><Chevron up /></button>
                <button className="x" aria-label="Close" onClick={p.onClose}><Close /></button>
              </div>
            </div>
            {list.length ? (
              <div className="tcards">
                {list.map((t) => (
                  <TripCard key={t.id} {...p} trip={t} color={color(t)} active={t.id === p.trips.active} />
                ))}
              </div>
            ) : (
              <p className="empty">No trips yet. Start one, tap a city, and add legs from the route window.</p>
            )}
            <NewTrip onCreate={p.onCreate} />
          </div>
        </div>
      )}
    </section>
  )
}

function TripCard(p: Props & { trip: Trip; color: string; active: boolean }) {
  const { model, trip } = p
  const [renaming, setRenaming] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const tot = tripTotals(model, trip)
  const name = (id: string) => model.byId.get(id)?.short_name ?? id
  const end = tripEnd(trip)
  return (
    <article className={`tcard${p.active ? ' on' : ''}`}>
      <div className="tc-head">
        <span className="tc-dot" style={{ background: p.color }} />
        {renaming ? (
          <NameInput
            initial={trip.name}
            onDone={(v) => {
              if (v != null) p.onRename(trip.id, v)
              setRenaming(false)
            }}
          />
        ) : (
          <h3>{trip.name}</h3>
        )}
        {p.active && <span className="tc-on mono">On map</span>}
      </div>
      {trip.inout && <SeedSummary trip={trip} name={name} />}
      <p className="tc-path">{tripStops(trip).map(name).join(' → ') || 'No legs yet'}</p>
      <p className="tc-tot mono">
        <span>{tot.legs} {tot.legs === 1 ? 'leg' : 'legs'} · {duration(tot.min)}</span>
        <b>{kr(tot.dkk)}{tot.unknown ? '+' : ''}</b>
      </p>
      {p.active && trip.legs.length > 0 && (
        <ol className="tc-legs">
          {trip.legs.map((l, i) => {
            const o = legOption(model, l)?.opt
            return (
              <li key={i}>
                <ModeChip family={familyOf(l.mode)} />
                <button className="tc-leg" onClick={() => p.onGoTo(l.to)} title={`Open ${name(l.to)}`}>
                  {name(l.from)} → {name(l.to)}
                  <span className="mono">{duration(o?.duration_min)} · {kr(o?.price_dkk.min)}</span>
                </button>
                <button className="x sm" aria-label={`Remove ${name(l.from)} to ${name(l.to)}`} onClick={() => p.onRemoveLeg(trip.id, i)}><Close /></button>
              </li>
            )
          })}
        </ol>
      )}
      <div className="tc-btns">
        {p.active ? (
          <>
            {end && <button className="tbtn dark" onClick={() => p.onGoTo(end)}>Continue from {name(end)}</button>}
            <button className="tbtn" onClick={p.onShut}>Close</button>
          </>
        ) : (
          <button className="tbtn dark" onClick={() => p.onOpen(trip)}>Open</button>
        )}
        <button className="tbtn" onClick={() => setRenaming(true)}>Rename</button>
        <button
          className={`tbtn${confirm ? ' danger' : ''}`}
          onClick={() => (confirm ? p.onDelete(trip.id) : setConfirm(true))}
          onBlur={() => setConfirm(false)}
        >
          {confirm ? 'Delete for good' : 'Delete'}
        </button>
      </div>
    </article>
  )
}

/** A name field: Enter or leaving it saves, Esc cancels with null. */
function NameInput({ initial, placeholder, onDone }: { initial: string; placeholder?: string; onDone(v: string | null): void }) {
  return (
    <input
      className="tc-input"
      autoFocus
      defaultValue={initial}
      placeholder={placeholder}
      aria-label="Trip name"
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => onDone(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          // keep the window's Esc from closing the panel
          e.preventDefault()
          onDone(null)
        }
      }}
    />
  )
}

function NewTrip({ onCreate }: { onCreate(name: string): void }) {
  const [open, setOpen] = useState(false)
  if (!open) return <button className="tnew" onClick={() => setOpen(true)}>+ New trip</button>
  return (
    <form
      className="tnew-form"
      onSubmit={(e) => {
        e.preventDefault()
        onCreate(new FormData(e.currentTarget).get('name')?.toString() ?? '')
      }}
    >
      <input
        className="tc-input"
        name="name"
        autoFocus
        placeholder="Name, e.g. Central America loop"
        aria-label="New trip name"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            setOpen(false)
          }
        }}
      />
      <button className="tbtn dark" type="submit">Start</button>
    </form>
  )
}

/** "3 Dec 22:44" from a local ISO time. */
function when(iso: string | null | undefined): string {
  if (!iso) return '?'
  const d = new Date(iso.slice(0, 10) + 'T00:00:00')
  const mon = d.toLocaleString('en-GB', { month: 'short' })
  return `${d.getDate()} ${mon} ${iso.slice(11, 16)}`
}

/** In and home of a seeded trip, and its flight totals. One fact per line. */
function SeedSummary({ trip, name }: { trip: Trip; name: (id: string) => string }) {
  const io = trip.inout!
  const t = trip.totals
  return (
    <div className="tc-io mono">
      <p>In: {name(io.entry)}, lands {when(io.way_in.arrive)} ({io.way_in.flying_hours} h{io.way_in.us_transit ? ', US transit' : ''})</p>
      <p>Home: {name(io.exit)} {when(io.way_home.depart)}, in Copenhagen {when(io.way_home.arrive)} ({io.way_home.flying_hours} h)</p>
      {t && <p>Flights: {kr(t.flights_total_dkk)} (long-haul {kr(t.long_haul_dkk)}, in between {kr(t.in_between_dkk)}) · cabin bags {kr(t.cabin_bag_fees_dkk)}</p>}
    </div>
  )
}
