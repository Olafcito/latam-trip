import { thousands } from '../lib/format'
import type { SeedWay, Trip, WayFlight, WayStop } from './trips'

// The open trip's way in and way home: where the markers go and what their pane lists.
// Only the Latin American end of each way is on the map. Copenhagen and the hubs are text.

export type Dir = 'in' | 'home'

export const IO_COLORS: Record<Dir, string> = { in: '#58D68D', home: '#FF8A4C' }
export const IO_LABEL: Record<Dir, string> = { in: 'Fly in here', home: 'Fly home from here' }

export interface IoMarker {
  place: string
  dirs: Dir[]
}

/**
 * One marker for the entry airport and one for the exit, or a single marker with both
 * directions when they are the same place. `place` turns an airport code into a map place
 * id, null when the map does not have it.
 */
export function ioMarkers(trip: Trip | null, place: (code: string) => string | null): IoMarker[] {
  const io = trip?.inout
  if (!io) return []
  const a = place(io.entry)
  const b = place(io.exit)
  if (a && a === b) return [{ place: a, dirs: ['in', 'home'] }]
  return [a && { place: a, dirs: ['in'] as Dir[] }, b && { place: b, dirs: ['home'] as Dir[] }].filter((m): m is IoMarker => !!m)
}

/** 18.68 -> "18,7 h". */
export function hours(h: number | null | undefined): string {
  if (h == null || !Number.isFinite(h)) return '?'
  return `${String(Math.round(h * 10) / 10).replace('.', ',')} h`
}

/** A local ISO time as "Wed 2 Dec 09:55". */
export function dayTime(iso: string | null | undefined): string {
  if (!iso) return '?'
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return iso
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '')
  return iso.length >= 16 ? `${day} ${iso.slice(11, 16)}` : day
}

const STOP_LABEL: Record<WayStop['kind'], string> = {
  connection: 'Connection',
  self_transfer: 'Self-transfer',
  day_stop: 'Day stop',
  night: 'Night',
}

export type WayRow =
  | {
      kind: 'flight'
      from: string
      to: string
      depart: string
      arrive: string
      hours: string
      carriers: string
      numbers: string
      connections: { airport: string; hours: string }[]
    }
  | { kind: 'stop'; label: string; airport: string; ground: string; arrive: string; depart: string }

/** One row per flight and one per stop, in travel order, each cell already formatted. */
export function wayRows(way: SeedWay): WayRow[] {
  return (way.timeline ?? []).map((t): WayRow => {
    if (t.kind === 'flight') {
      const f = t as WayFlight
      return {
        kind: 'flight',
        from: f.from,
        to: f.to,
        depart: dayTime(f.depart),
        arrive: dayTime(f.arrive),
        hours: hours(f.hours),
        carriers: (f.carriers ?? []).join(', ') || '?',
        numbers: (f.flight_numbers ?? []).join(', ') || '?',
        connections: (f.connections ?? []).map((c) => ({ airport: c.airport, hours: hours(c.layover_h) })),
      }
    }
    const s = t as WayStop
    const nights = s.kind === 'night' && s.nights ? ` (${s.nights} ${s.nights === 1 ? 'night' : 'nights'})` : ''
    return {
      kind: 'stop',
      label: (STOP_LABEL[s.kind] ?? s.kind) + nights,
      airport: s.airport,
      ground: `${hours(s.hours)} on the ground`,
      arrive: dayTime(s.arrive),
      depart: dayTime(s.depart),
    }
  })
}

export interface Fact {
  label: string
  value: string
}

const money = (dkk: number | null | undefined) => (dkk == null ? 'unknown' : `${thousands(dkk)} kr`)
const fee = (dkk: number | null | undefined) => (dkk == null ? 'unknown' : dkk === 0 ? 'included' : `${thousands(dkk)} kr`)

/**
 * The facts under a direction's rows: ticket price, cabin-bag fee, US transit and the time at
 * Copenhagen. A ticket shared by both ways is priced once, on the in/out, and says so.
 */
export function wayFacts(trip: Trip, dir: Dir): Fact[] {
  const io = trip.inout
  if (!io) return []
  const way = dir === 'in' ? io.way_in : io.way_home
  const shared = !!way.shared_ticket || (io.type === 'ticket' && way.price_dkk == null)
  const out: Fact[] = []
  if (shared) {
    // seeds stored before extras were written: the long-haul fee is the total less the flights in between
    const between = (trip.segments ?? []).reduce((n, g) => n + (g.kind === 'flight' ? g.cabin_bag_fee_dkk ?? 0 : 0), 0)
    const cabin = io.extras?.cabin_bag_fees_dkk ?? (trip.totals ? trip.totals.cabin_bag_fees_dkk - between : null)
    out.push({ label: 'Ticket price', value: money(io.price_dkk) })
    out.push({ label: 'Ticket covers', value: 'Both ways' })
    out.push({ label: 'Cabin-bag fee', value: fee(cabin) })
  } else {
    out.push({ label: 'Ticket price', value: money(way.price_dkk) })
    out.push({ label: 'Cabin-bag fee', value: fee(way.extras?.cabin_bag_fees_dkk) })
  }
  out.push({ label: 'US transit', value: way.us_transit ? 'Yes' : 'No' })
  if (dir === 'in') out.push({ label: 'Leaves Copenhagen', value: dayTime(way.depart) })
  else out.push({ label: 'Lands in Copenhagen', value: dayTime(way.arrive) })
  return out
}
