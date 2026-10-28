import { useEffect } from 'react'
import type { AppData } from '../data/types'
import { useStore, type Section } from '../store'
import { BuildScreen } from './BuildScreen'
import { PickScreen } from './PickScreen'
import { TotalsScreen } from './TotalsScreen'

const SECTIONS: [Section, string][] = [
  ['saved', 'Saved trips and compare'],
  ['build', 'Journey builder'],
  ['pick', 'Pick in and out'],
]

/** The second tab: every saved trip (the ranked ones included), the open journey, and where a new one starts. */
export function TripsScreen({ data }: { data: AppData }) {
  const journey = useStore((s) => s.journey)
  const section = useStore((s) => s.section)
  const go = useStore((s) => s.go)
  const buildable = !!journey && !!data.inout.ways[journey.wayIn] && !!data.inout.ways[journey.wayHome]

  useEffect(() => {
    if (!section) return
    document.getElementById(`sec-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    go('trips')
  }, [section, go])

  return (
    <div className="trips">
      <nav className="secnav" aria-label="Sections">
        {SECTIONS.map(([id, label]) => (
          <a key={id} className="btn small" href={`#sec-${id}`} onClick={(e) => { e.preventDefault(); go('trips', id) }}>{label}</a>
        ))}
      </nav>
      <section id="sec-saved" className="sec">
        <h2 className="h2">Saved trips and compare</h2>
        <TotalsScreen data={data} />
      </section>
      <section id="sec-build" className="sec">
        <h2 className="h2">Journey builder</h2>
        {buildable ? <BuildScreen data={data} journey={journey} /> : <div className="card empty">No journey open. Open a saved trip above, or pick a way in and out below.</div>}
      </section>
      <section id="sec-pick" className="sec">
        <h2 className="h2">Pick in and out</h2>
        <PickScreen data={data} />
      </section>
    </div>
  )
}
