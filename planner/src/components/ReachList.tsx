import { useMemo, useState } from 'react'
import type { Model } from '@map/data/model'
import type { Family } from '@map/data/types'
import type { TripLeg } from '@map/data/trips'
import { Flag } from '@map/map/Flag'
import { countryName } from '../lib/colors'
import { hours, kr } from '../lib/format'
import { filterReach, reachFrom } from '../lib/reach'
import { ModeChip } from './icons'

// The places one leg from the cursor stop, the same ones the map lights, as a short list to pick
// from when the city is hard to find on the map. A row adds the place as the next stop.

const MODE: Record<Family, string> = { ground: 'Bus', boat: 'Boat', flight: 'Flight' }

export function ReachList({ model, families, here, onPick }: { model: Model; families: Set<Family>; here: string; onPick: (leg: TripLeg) => void }) {
  const [q, setQ] = useState('')
  const rows = useMemo(() => reachFrom(model, here, families), [model, here, families])
  const shown = useMemo(() => filterReach(rows, q, countryName), [rows, q])
  if (!rows.length) return <small className="reach-none">Nothing one leg away with the modes switched on.</small>

  return (
    <div className="reach">
      <input
        className="reach-q"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Find a place or country, ${rows.length} reachable`}
        aria-label="Find a reachable place or country"
        autoComplete="off"
        spellCheck={false}
      />
      {shown.length ? (
        <ul className="reach-list" aria-label="Reachable places, fastest first">
          {shown.map((r) => (
            <li key={r.key}>
              <button
                type="button"
                className="reach-row"
                onClick={() => onPick(r.leg)}
                title={`Add ${r.place.name} as the next stop, by ${MODE[r.family].toLowerCase()}`}
              >
                <Flag code={r.place.country} size={11} title={countryName(r.place.country)} />
                <span className="reach-name">{r.place.name}</span>
                <span className="reach-mode" role="img" aria-label={MODE[r.family]}><ModeChip family={r.family} /></span>
                <span className="reach-h">{hours(r.hours)}</span>
                <span className="reach-p">{r.price == null ? 'no price' : kr(r.price)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <small className="reach-none">No reachable place matches "{q.trim()}".</small>
      )}
    </div>
  )
}
