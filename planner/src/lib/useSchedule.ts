import { useMemo } from 'react'
import type { AppData } from '../data/types'
import { useOwnBookings, useOwnLodgings } from '../store'
import { nodeForAirport, nodeName, schedule, type Journey, type Schedule } from './journey'

// The open trip's days, worked out the one way the trip panel, the trip page and the map's city panel all need:
// from its ways in and home, the booked legs and stays and the places to stay. It is worked out again only when
// one of them changes. null when the trip's ways are no longer in the data, or there is no trip.

export function useSchedule(data: AppData | null | undefined, journey: Journey | null | undefined): { sched: Schedule; exitNode: string } | null {
  // a trip someone shared is read with none of the viewer's own bookings or stays
  const bookings = useOwnBookings(journey)
  const lodgings = useOwnLodgings(journey)
  return useMemo(() => {
    if (!data || !journey) return null
    const wi = data.inout.ways[journey.wayIn]
    const wh = data.inout.ways[journey.wayHome]
    if (!wi || !wh) return null
    const exitNode = nodeForAirport(data.inout, wh.from)
    return { sched: schedule(journey, wi, wh, exitNode, (id) => nodeName(data.map, data.inout, id), bookings, data, lodgings), exitNode }
  }, [data, journey, bookings, lodgings])
}
