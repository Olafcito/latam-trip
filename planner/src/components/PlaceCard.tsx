import { create } from 'zustand'
import type { MapNode } from '../data/types'
import { kr } from '../lib/format'
import { countryName } from '../lib/colors'

interface HoverState {
  node: MapNode | null
  x: number
  y: number
  show: (node: MapNode, x: number, y: number) => void
  hide: () => void
}

/** One hover card for the whole app, positioned at the pointer. */
export const usePlaceHover = create<HoverState>((set) => ({
  node: null,
  x: 0,
  y: 0,
  show: (node, x, y) => set({ node, x, y }),
  hide: () => set({ node: null }),
}))

/** Props to spread on anything that should show the place card on hover. */
export function hoverProps(node: MapNode | undefined) {
  if (!node?.profile) return {}
  return {
    onMouseEnter: (e: React.MouseEvent) => usePlaceHover.getState().show(node, e.clientX, e.clientY),
    onMouseMove: (e: React.MouseEvent) => usePlaceHover.getState().show(node, e.clientX, e.clientY),
    onMouseLeave: () => usePlaceHover.getState().hide(),
  }
}

export function PlaceCard() {
  const { node, x, y } = usePlaceHover()
  if (!node?.profile) return null
  const p = node.profile
  const left = Math.min(x + 16, window.innerWidth - 336)
  const top = Math.min(y + 16, window.innerHeight - 420)
  return (
    <div className="pcard" style={{ left, top }} role="tooltip">
      {p.image?.url && <div className="img" style={{ backgroundImage: `url("${p.image.url}")` }} />}
      {p.image?.url && <div className="credit">Photo: {p.image.credit ?? '?'} · {p.image.license ?? '?'}, Wikimedia Commons</div>}
      <div className="body">
        <div className="small muted">{node.name}, {countryName(node.country)}</div>
        {p.tagline && <div className="tag">{p.tagline}</div>}
        {p.summary && <div className="sum">{p.summary}</div>}
        {!!p.things_to_do?.length && <div className="chips">{p.things_to_do.slice(0, 5).map((t) => <span key={t} className="chip">{t}</span>)}</div>}
        {p.touristy != null && (
          <div className="row small muted">Touristy <span className="dots" aria-label={`${p.touristy} of 5`}>{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= p.touristy! ? 'f' : ''} />)}</span></div>
        )}
        {(p.hostels ?? []).slice(0, 3).map((h) => (
          <div key={h.name} className={'hostel' + (h.price_suspect ? ' sus' : '')} title={h.price_suspect ? 'Price looks wrong in the source' : undefined}>
            <span>{h.name}</span>
            <span>dorm {kr(h.dorm_dkk)} · private {kr(h.private_dkk)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
