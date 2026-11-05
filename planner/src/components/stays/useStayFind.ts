import { useCallback, useEffect, useRef, useState } from 'react'
import { loadLodgings } from '../../lib/lodgings'
import { remember, searchCity } from '../../lib/stayRates'
import { insertTask, openStaySearch, stayFindTask, subscribeTasks } from '../../lib/tasks'
import { useStore } from '../../store'

// Find accommodations at a stop (FEAT-003). One press asks the stay-rates function for the most popular Hostelworld
// places of the stop's city and saves a stay_search task for the task runner, which adds Booking.com places a minute
// or two later. Hostelworld is asked until the call returns. Booking.com is asked while the task is open or under
// way, read from the tasks table whenever the sheet opens and followed live, so it survives closing the sheet.

export interface StayFind {
  /** the sites still asked for the stop and dates, null when none is */
  searching: { sites: string[] } | null
  /** why the last find for the stop and dates failed */
  error: string | null
  find: () => void
}

export function useStayFind(
  place: { id: string; name: string } | null,
  checkIn: string,
  checkOut: string,
  trip: { id: string | null; version: number | null },
  /** the sheet is open, so the task is looked for and followed */
  open: boolean,
): StayFind {
  const setLodgings = useStore((s) => s.setLodgings)
  const key = place ? `${place.id}|${checkIn}|${checkOut}` : null
  // the stop and dates each half is asking for
  const [hw, setHw] = useState<string | null>(null)
  const [bk, setBk] = useState<string | null>(null)
  const bkNow = useRef<string | null>(null)
  const [error, setError] = useState<{ key: string; message: string } | null>(null)

  const reload = useCallback(() => {
    void loadLodgings().then(setLodgings, () => {})
  }, [setLodgings])
  const markBk = useCallback((k: string | null) => {
    bkNow.current = k
    setBk(k)
  }, [])

  const placeId = place?.id ?? null
  useEffect(() => {
    if (!open || !placeId || !key) return
    let latest = 0
    const look = () => {
      const n = ++latest
      openStaySearch(placeId, checkIn, checkOut).then((t) => {
        if (n !== latest) return
        if (t) return markBk(key)
        // the task closed: the places it added come in
        if (bkNow.current === key) {
          markBk(null)
          reload()
        }
      }, () => {})
    }
    look()
    const stop = subscribeTasks(look)
    return () => {
      latest = -1
      stop()
    }
  }, [open, placeId, key, checkIn, checkOut, markBk, reload])

  const find = () => {
    if (!place || !key || hw === key || bk === key) return
    const k = key
    const fail = (message: string) => setError((e) => (e?.key === k ? e : { key: k, message }))
    setError(null)
    setHw(k)
    searchCity(place.id, checkIn, checkOut).then((r) => {
      setHw((h) => (h === k ? null : h))
      if (!r.ok) return fail(r.message)
      // the places were priced for these dates just now, so opening one asks Hostelworld nothing more
      for (const id of r.priced_ids) remember(id, checkIn, checkOut, { ok: true, lodging_id: id, fetched: true, rooms: 0, prices: 0 })
      reload()
    })
    insertTask(stayFindTask(place, checkIn, checkOut), trip.id, trip.version).then((t) => {
      if (!t.ok) return fail(t.message)
      markBk(k)
    })
  }

  const sites = [hw === key && 'Hostelworld', bk === key && 'Booking.com'].filter((x): x is string => !!x)
  return { searching: key && sites.length ? { sites } : null, error: error && error.key === key ? error.message : null, find }
}
