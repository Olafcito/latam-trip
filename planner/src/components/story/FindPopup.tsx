import { useMemo } from 'react'
import { buildModel } from '@map/data/model'
import type { MapData } from '@map/data/types'
import { CardWindow } from '@map/map/CardWindow'
import { useMapMode, type CardRef } from '@map/map/useMapMode'
import { useStore } from '../../store'

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
