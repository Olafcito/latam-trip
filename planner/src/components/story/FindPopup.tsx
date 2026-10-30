import { useMemo } from 'react'
import { buildModel } from '@map/data/model'
import type { MapData } from '@map/data/types'
import { CardWindow } from '@map/map/CardWindow'
import { useMapMode, type CardRef } from '@map/map/useMapMode'
import type { Hostel } from '../../data/types'
import { dec1, kr } from '../../lib/format'
import { useStore } from '../../store'
import { External } from '../icons'

// What a row of an itinerary opens, over the trip instead of on the map. A find is the map's own card,
// so the two never differ, and its Show on map is the one way to the map from here.

export function FindPopup({ data, first, onClose }: { data: MapData; first: CardRef; onClose: () => void }) {
  const openMapCard = useStore((s) => s.openMapCard)
  const mm = useMapMode(null, data, first)
  const model = useMemo(() => buildModel(data), [data])
  if (!mm.card) return null
  const before = mm.stack.at(-2)
  return (
    <div className="fp rmap">
      <CardWindow
        api={mm}
        model={model}
        left={0}
        cardRef={null}
        backTo={before ? mm.titleOf(before) : null}
        onBack={mm.popCard}
        onClose={onClose}
        onOpen={mm.pushCard}
        onShow={openMapCard}
      />
    </div>
  )
}

const hostOf = (url: string | undefined) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : ''
  } catch {
    return ''
  }
}

const Price = ({ k, v }: { k: string; v: number | null }) => (
  <div>
    <dt>{k}</dt>
    {v == null ? <dd className="no">No price</dd> : <dd>{kr(v)}</dd>}
  </div>
)

export function HostelPopup({ h, place }: { h: Hostel; place: string }) {
  const host = hostOf(h.source)
  return (
    <div className="mdh">
      <div>
        <h3>{h.name}</h3>
        <small>{place}</small>
      </div>
      <dl className="mdh-facts">
        <Price k="Dorm" v={h.dorm_dkk} />
        <Price k="Private" v={h.private_dkk} />
        {h.rating != null && <div><dt>Rating</dt><dd>{dec1(h.rating)} of 10</dd></div>}
      </dl>
      {h.price_suspect && <p className="mdh-note">Price looks off, check before booking.</p>}
      {host && <a className="btn mdh-go" href={h.source} target="_blank" rel="noopener noreferrer">Open {host}<External /></a>}
    </div>
  )
}
