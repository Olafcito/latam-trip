import type { AppData } from '../data/types'
import { day } from './format'
import { nodeForAirport, nodeName, schedule, totals, travelTotal, type Journey } from './journey'

// The facts the Trips home shows for one trip: its ways, totals and route. Null when a way has left the data.

export function summarize(data: AppData, j: Journey) {
  const wi = data.inout.ways[j.wayIn]
  const wh = data.inout.ways[j.wayHome]
  if (!wi || !wh) return null
  const nm = (id: string) => nodeName(data.map, data.inout, id)
  const sched = schedule(j, wi, wh, nodeForAirport(data.inout, wh.from), nm)
  const t = totals(data, j, sched)
  return {
    wi,
    wh,
    t,
    sched,
    route: j.places.map((p) => nm(p.node)),
    total: travelTotal(t),
    /** some ground legs or a hub stay have no price, so the total is a floor */
    partial: t.ground_unknown > 0 || t.hub_stay_dkk == null,
    /** calendar days from the landing to the flight home */
    nights: sched.totalDays,
    stops: j.places.length,
    lands: day(wi.arrive),
    home: day(wh.depart),
  }
}

export type Summary = NonNullable<ReturnType<typeof summarize>>
