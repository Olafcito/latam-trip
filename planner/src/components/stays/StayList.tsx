import { useState } from 'react'
import { nightsWord, stayDates } from '../../lib/stayOffer'
import { usePop } from '../story/usePop'
import { Bed, Calendar, Check, Close, More, Plus, Ring, Warn } from '../icons'

// The stays of a stop, in the Accommodation tab of its fold: one row each with its photo, the place, its own
// dates and nights, the room, whether it is booked and a menu of what can be done to it. The row opens the
// place. Under them the dashed button that adds one.

export interface StayAction {
  label: string
  run: () => void
  danger?: boolean
}

export interface StayRowData {
  key: string
  name: string
  photo: string | null
  /** the stay's own dates. Null when the stop has no nights left for it */
  checkIn: string | null
  checkOut: string | null
  nights: number
  room: string | null
  booked: boolean
  /** why the stay no longer fits the stop, when it does not */
  warn?: string | null
  actions: StayAction[]
  /** opens the place */
  onOpen?: () => void
}

function Menu({ name, actions }: { name: string; actions: StayAction[] }) {
  const pop = usePop(false)
  if (!actions.length) return null
  return (
    <span className="pop-wrap al-more" {...pop.wrap}>
      <button type="button" className="al-dots" aria-label={`More for ${name}`} {...pop.trigger}><More s={18} /></button>
      {pop.open && (
        <div className="pop al-menu" role="menu" aria-label={name} {...pop.panel}>
          <button type="button" className="pop-x" aria-label="Close" onClick={pop.dismiss}><Close /></button>
          {actions.map((a) => (
            <button key={a.label} type="button" role="menuitem" className="al-item" data-danger={a.danger || undefined} onClick={() => { pop.close(); a.run() }}>{a.label}</button>
          ))}
        </div>
      )}
    </span>
  )
}

function Thumb({ src }: { src: string | null }) {
  const [broken, setBroken] = useState(false)
  return (
    <span className="al-ph" aria-hidden="true">
      {src && !broken ? <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setBroken(true)} /> : <Bed s={20} />}
    </span>
  )
}

export function StayRow({ row }: { row: StayRowData }) {
  const when = row.checkIn && row.checkOut ? `${stayDates(row.checkIn, row.checkOut)}, ${nightsWord(row.nights)}` : 'No nights'
  return (
    <li className="al-row" data-booked={row.booked || undefined}>
      <Thumb src={row.photo} />
      <div className="al-what">
        {row.onOpen ? (
          <button type="button" className="al-name al-open" onClick={row.onOpen} aria-label={`${row.name}, ${when}${row.room ? `, ${row.room}` : ''}, ${row.booked ? 'booked' : 'not booked'}. Open`}>{row.name}</button>
        ) : <b className="al-name">{row.name}</b>}
        <span className="al-when" aria-hidden={row.onOpen ? true : undefined}>
          <Calendar s={14} />
          {row.checkIn && row.checkOut ? (
            <><span>{stayDates(row.checkIn, row.checkOut)}</span><i aria-hidden="true">·</i><span>{nightsWord(row.nights)}</span></>
          ) : <span>No nights</span>}
          {row.warn && <span className="al-warn" title={row.warn}><Warn s={13} /></span>}
        </span>
        {row.room && <span className="al-room" aria-hidden={row.onOpen ? true : undefined}>{row.room}</span>}
      </div>
      <span className="al-pill" data-on={row.booked || undefined} aria-hidden={row.onOpen ? true : undefined}>
        {row.booked ? <Check s={14} /> : <Ring s={14} />}
        {row.booked ? 'Booked' : 'Not booked'}
      </span>
      <Menu name={row.name} actions={row.actions} />
    </li>
  )
}

export function StayList({ rows, onAdd }: { rows: StayRowData[]; onAdd?: () => void }) {
  return (
    <div className="al">
      {rows.length > 0 && <ul className="al-list">{rows.map((r) => <StayRow key={r.key} row={r} />)}</ul>}
      {onAdd && <button type="button" className="al-add" onClick={onAdd}><Plus />Add accommodation</button>}
    </div>
  )
}
