import { useEffect, useState } from 'react'
import { loadUnresolved } from '../lib/remoteTrips'
import { remoteEnabled } from '../lib/supabase'

/** Journeys from this browser that could not be moved into the table. They are listed so they can be rebuilt by hand. */
export function Unresolved() {
  const [list, setList] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    if (!remoteEnabled()) return
    let live = true
    void loadUnresolved().then((l) => live && setList(l))
    return () => {
      live = false
    }
  }, [])
  if (!list.length) return null
  return (
    <section className="tt-unresolved" aria-label="Not moved over">
      <h3>Not moved over, rebuild by hand</h3>
      <ul>
        {list.map((j) => (
          <li key={j.id}>{j.name}</li>
        ))}
      </ul>
    </section>
  )
}
