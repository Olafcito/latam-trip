import type { Ref } from 'react'
import type { Model } from '../data/model'
import { tripTotals, type Trip } from '../data/trips'
import { duration, kr } from '../lib/format'
import { Close } from './icons'

interface Props {
  model: Model
  trip: Trip | null
  count: number
  /** Left offset beside an open desktop panel, or null for the default corner. */
  left: number | null
  barRef: Ref<HTMLDivElement>
  onList(): void
  onUndo(): void
  onClose(): void
}

/** A quiet "Trips" button, or while a trip is open, its name, totals and undo. */
export function TripBar(p: Props) {
  const style = p.left != null ? { left: p.left } : undefined
  if (!p.trip) {
    return (
      <div className="ctl tripbar idle" ref={p.barRef} style={style}>
        <button className="tb-name" onClick={p.onList}>Trips{p.count ? <span className="mono"> · {p.count}</span> : null}</button>
      </div>
    )
  }
  const t = tripTotals(p.model, p.trip)
  return (
    <div className="ctl tripbar" ref={p.barRef} style={style} role="group" aria-label="Open trip">
      <button className="tb-name" onClick={p.onList} title="All trips">
        <span className="tb-dot" />
        <span className="tb-label">{p.trip.name}</span>
      </button>
      <span className="tb-tot mono">
        {t.legs ? `${t.legs} ${t.legs === 1 ? 'leg' : 'legs'} · ${duration(t.min)} · ${kr(t.dkk)}${t.unknown ? '+' : ''}` : 'tap a city to start'}
      </span>
      <span className="tb-saved mono" title="Every change is saved on this device">saved</span>
      {t.legs > 0 && <button className="tb-btn" onClick={p.onUndo} title="Remove the last leg">Undo</button>}
      <button className="tb-btn tb-x" aria-label="Close trip" title="Close the trip. It stays in your trips." onClick={p.onClose}><Close /></button>
    </div>
  )
}
