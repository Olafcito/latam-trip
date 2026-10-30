// Where a map mode's panel renders, with the props the real panel gets. For now it only has its header.
import type { Ref } from 'react'
import { Chevron, Close } from './icons'
import { MODE_TITLE, type CardRef, type MapModeApi } from './useMapMode'

export interface ModePanelProps {
  api: MapModeApi
  collapsed: boolean
  panelRef: Ref<HTMLElement>
  onCollapse(collapsed: boolean): void
  /** Leaves the mode. */
  onClose(): void
  /** A list row: opens its card and goes to its marker. */
  onPick(ref: CardRef): void
  /** A saved place in the list: leaves the mode for the normal place panel. */
  onPlace(id: string): void
}

export function ModePanelSlot({ api, collapsed, panelRef, onCollapse, onClose }: ModePanelProps) {
  const title = MODE_TITLE[api.mode!]
  return (
    <section ref={panelRef} className={`panel mode${collapsed ? ' collapsed' : ''}`} aria-label={title}>
      {collapsed ? (
        <div className="pslim">
          <span className="pslim-name">{title}</span>
          <button className="x sm" aria-label="Expand panel" onClick={() => onCollapse(false)}><Chevron up={false} /></button>
          <button className="x sm" aria-label="Close" onClick={onClose}><Close /></button>
        </div>
      ) : (
        <div className="pview">
          <div className="pbody stg">
            <div className="prow">
              <h2 className="pname">{title}</h2>
              <div className="hbtns">
                <button className="x" aria-label="Collapse panel" onClick={() => onCollapse(true)}><Chevron up /></button>
                <button className="x" aria-label="Close" onClick={onClose}><Close /></button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
