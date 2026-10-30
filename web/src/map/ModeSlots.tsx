// Where a map mode's panel renders, whichever mode it is.
import { useRef } from 'react'
import type { Model } from '../data/model'
import { ExperiencesPanel } from './ExperiencesPanel'
import { GymsPanel } from './GymsPanel'
import type { ModeShell } from './ModeSheet'
import type { Detent } from './sheet'
import type { CardRef, MapModeApi } from './useMapMode'

export interface ModePanelProps extends Omit<ModeShell, 'detentMemo' | 'scrollMemo'> {
  api: MapModeApi
  model: Model
  /** A list row: opens its card and goes to its marker. */
  onPick(ref: CardRef): void
  /** A saved place in the list: leaves the mode for the normal place panel. */
  onPlace(id: string): void
}

export function ModePanelSlot({ api, model, onPick, onPlace, ...rest }: ModePanelProps) {
  const detentMemo = useRef<Detent | null>(null)
  const shell = { ...rest, detentMemo, scrollMemo: api.listScroll }
  return api.mode === 'gyms'
    ? <GymsPanel api={api} model={model} shell={shell} onPick={onPick} />
    : <ExperiencesPanel api={api} model={model} shell={shell} onPick={onPick} onPlace={onPlace} />
}
