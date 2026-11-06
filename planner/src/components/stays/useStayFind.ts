import { useCallback, useEffect, useRef, useState } from 'react'
import { hasBookingPlace, loadLodgings } from '../../lib/lodgings'
import { remember, searchCity } from '../../lib/stayRates'
import { alreadyQueued, insertTask, localDay, stayFindTask, stayMarks, stayPicksTask, stayTasksAt, subscribeTasks, wantsPicks } from '../../lib/tasks'
import { useStore } from '../../store'

// Find accommodations at a stop (FEAT-003). One press asks the stay-rates function for the most popular Hostelworld
// places of the stop's city and saves a stay_search task for the task runner, which adds Booking.com places a minute
// or two later. Hostelworld is asked until the call returns. Booking.com is asked while the task is open or under
// way, read from the tasks table whenever the sheet opens and followed live, so it survives closing the sheet.
// The first time the sheet opens at a stop with nights, not booked and with no Booking.com place, it queues a
// stay_picks task by itself (FEAT-004), which adds three good value places. It shows the same mark, but a press of
// Find accommodations still works while it runs.

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
  /** the stop has a booked stay, so no picks are queued for it */
  booked = false,
): StayFind {
  const setLodgings = useStore((s) => s.setLodgings)
  const key = place ? `${place.id}|${checkIn}|${checkOut}` : null
  // the stop and dates each half is asking for: Hostelworld, the pressed Booking.com search and the picks
  const [hw, setHw] = useState<string | null>(null)
  const [bk, setBk] = useState<string | null>(null)
  const [pk, setPk] = useState<string | null>(null)
  const askedNow = useRef<string | null>(null)
  // the keys a picks insert was tried for in this session, so a failed one is tried again only on the next open
  const tried = useRef(new Set<string>())
  const [error, setError] = useState<{ key: string; message: string } | null>(null)

  const reload = useCallback(() => {
    void loadLodgings().then(setLodgings, () => {})
  }, [setLodgings])

  const placeId = place?.id ?? null
  const placeName = place?.name ?? ''
  useEffect(() => {
    if (!open || !placeId || !key) return
    let latest = 0
    let first = true
    const look = () => {
      const n = ++latest
      const queue = first
      first = false
      stayTasksAt(placeId).then(async (tasks) => {
        if (n !== latest) return
        const m = stayMarks(tasks, checkIn, checkOut)
        setBk(m.search ? key : null)
        setPk(m.picks ? key : null)
        if (m.search || m.picks) askedNow.current = key
        else if (askedNow.current === key) {
          // the task closed: the places it added come in
          askedNow.current = null
          reload()
        }
        if (!queue || tried.current.has(key)) return
        const base = { nights: 1, booked, checkIn, checkOut, today: localDay(), hasBooking: false, tasks }
        if (!wantsPicks(base)) return
        tried.current.add(key)
        if (await hasBookingPlace(placeId)) return
        const t = await insertTask(stayPicksTask({ id: placeId, name: placeName }, checkIn, checkOut), trip.id, trip.version)
        if (n !== latest) return
        if (t.ok || alreadyQueued(t.message)) {
          askedNow.current = key
          setPk(key)
        } else tried.current.delete(key) // a weak signal: tried again the next time the sheet opens
      }).catch(() => {})
    }
    look()
    const stop = subscribeTasks(look)
    return () => {
      latest = -1
      stop()
    }
  }, [open, placeId, placeName, key, checkIn, checkOut, booked, trip.id, trip.version, reload])

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
      askedNow.current = k
      setBk(k)
    })
  }

  const sites = [hw === key && 'Hostelworld', (bk === key || pk === key) && 'Booking.com'].filter((x): x is string => !!x)
  return { searching: key && sites.length ? { sites } : null, error: error && error.key === key ? error.message : null, find }
}
