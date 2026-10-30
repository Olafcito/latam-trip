import type { ReactNode, Ref } from 'react'
import type { Family } from '../data/types'
import { Bookmark, Fit, Glove, Minus, Plus } from './icons'
import { SCORE_COLOUR, type MapMode } from './modeLayers'

const LABELS: Record<Family, string> = { ground: 'Bus', boat: 'Boat', flight: 'Flight' }
const MODE_LABELS: Record<MapMode, string> = { gyms: 'Gyms', experiences: 'Experiences' }
const SCORE_KEY = [
  { colour: SCORE_COLOUR.top, label: '6 and up' },
  { colour: SCORE_COLOUR.mid, label: '4.5 to 6' },
  { colour: SCORE_COLOUR.low, label: 'Under 4.5' },
  { colour: SCORE_COLOUR.none, label: 'No score' },
]

interface Props {
  available: Family[]
  families: Set<Family>
  onToggle(f: Family): void
  onZoom(delta: number): void
  onHome(): void
  hint: 'show' | 'fading' | 'gone'
  controlsRef: Ref<HTMLDivElement>
  bottomRef: Ref<HTMLDivElement>
  /** A legend for the open trip, above the map legend. */
  extraLegend?: ReactNode
  /** The map mode that is on. Everything about normal travel leaves the controls while one is. */
  mode?: MapMode | null
  /** The map modes with something to show. */
  modes?: MapMode[]
  onMode?(mode: MapMode): void
}

export function Controls(p: Props) {
  return (
    <>
      <div className="ctl ctl-tr" ref={p.controlsRef}>
        {!!p.modes?.length && (
          <div className="seg modeseg" role="group" aria-label="Map modes">
            {p.modes.map((m) => {
              const on = p.mode === m
              return (
                <button key={m} className={`mbtn ${m}${on ? ' on' : ''}`} aria-pressed={on} aria-label={MODE_LABELS[m]} onClick={() => p.onMode?.(m)}>
                  {m === 'gyms' ? <Glove s={16} /> : <Bookmark s={16} filled={on} />}
                  <span className="mbtn-name">{MODE_LABELS[m]}</span>
                </button>
              )
            })}
          </div>
        )}
        {!p.mode && (
          <div className="seg" role="group" aria-label="Travel modes">
            {p.available.map((f) => {
              const on = p.families.has(f)
              return (
                <button key={f} className={`mbtn${on ? ' on' : ''}`} aria-pressed={on} onClick={() => p.onToggle(f)}>
                  <span className={`mdot ${f}`} />{LABELS[f]}
                </button>
              )
            })}
          </div>
        )}
        <div className="zbtns">
          <button className="zbtn" aria-label="Zoom in" onClick={() => p.onZoom(1)}><Plus /></button>
          <button className="zbtn" aria-label="Zoom out" onClick={() => p.onZoom(-1)}><Minus /></button>
          <button className="zbtn" aria-label="Show whole map" onClick={p.onHome}><Fit /></button>
        </div>
      </div>

      {/* hint and legend share one bottom row, so they wrap instead of colliding */}
      <div className="ctl ctl-bottom" ref={p.bottomRef}>
        {p.hint !== 'gone' && !p.mode ? (
          <div className={`hint${p.hint === 'fading' ? ' out' : ''}`}>
            <span className="hint-dot" />
            <span>Click a city · scroll to zoom · drag or hold <kbd>space</kbd> to pan</span>
          </div>
        ) : <span />}
        <div className="legend-col">
          {!p.mode && p.extraLegend}
          {p.mode === 'gyms' && (
            <div className="legend scorekey" role="group" aria-label="Gym scores">
              {SCORE_KEY.map((k) => (
                <span key={k.label}><i className="keydot" style={{ background: k.colour }} />{k.label}</span>
              ))}
              <span><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.2 L10.8 6 L6 10.8 L1.2 6 Z" fill="#EAF0F2" stroke={SCORE_COLOUR.low} strokeWidth="1.4" /></svg>City</span>
            </div>
          )}
          {!p.mode && (
            <div className="legend" aria-hidden="true">
              <span><svg width="22" height="8" viewBox="0 0 22 8"><path d="M2 4 L20 4" stroke="#6FD3B8" strokeWidth="2" strokeLinecap="round" /></svg>Bus</span>
              {p.available.includes('boat') && (
                <span><svg width="22" height="8" viewBox="0 0 22 8"><path d="M2 4 L20 4" stroke="#8DB8F2" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 3" /></svg>Boat</span>
              )}
              <span><svg width="22" height="8" viewBox="0 0 22 8"><path d="M2 4 L20 4" stroke="#F2B544" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="0.1 4.4" /></svg>Flight</span>
              <span><svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 1 L11 6 L6 11 L1 6 Z" fill="#F2B544" stroke="#0B1720" strokeWidth="1.2" /></svg>Hub</span>
              <span><svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 1.6 L10.4 6 L6 10.4 L1.6 6 Z" fill="#0B1720" stroke="#F2B544" strokeWidth="1.6" /></svg>Airport</span>
              <span><svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="2.6" fill="#EAF0F2" /></svg>Town</span>
              <span><svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="3.5" fill="#0B1720" stroke="#6FD3B8" strokeWidth="2" /></svg>Stop</span>
              <span><svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="3.5" fill="#F2B544" stroke="#0B1720" strokeWidth="1.5" /></svg>Layover</span>
            </div>
          )}
          <p className="attrib">
            <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> ·{' '}
            <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">© OpenMapTiles</a> ·{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a> · Terrain: Mapzen
          </p>
        </div>
      </div>
    </>
  )
}
