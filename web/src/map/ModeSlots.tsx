// The two places the map modes render into, with the props the real panel and card get. For now each holds a
// minimal stand-in: the mode panel only has its header, and a card only says what it is for.
import type { Ref } from 'react'
import { Back, Chevron, Close } from './icons'
import type { CardRef, MapModeApi, MapMode } from './useMapMode'

const TITLE: Record<MapMode, string> = { gyms: 'Gyms', experiences: 'Experiences' }

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
  const title = TITLE[api.mode!]
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

export interface CardSlotProps {
  api: MapModeApi
  /** The card's left edge in the map, or null on a phone, where it is a sheet. */
  left: number | null
  cardRef: Ref<HTMLElement>
  /** What Back returns to, or null when this card is the first. */
  backTo: string | null
  /** One card back. */
  onBack(): void
  /** Closes every card. */
  onClose(): void
  /** A link inside a card: stacks the new card on this one. */
  onOpen(ref: CardRef): void
  /** Brings a card's marker into view and keeps the stack as it is. */
  onShow(ref: CardRef): void
}

export function CardSlot({ api, left, cardRef, backTo, onBack, onClose }: CardSlotProps) {
  const title = api.titleOf(api.card!)
  return (
    <section ref={cardRef} className="panel mcard" style={left == null ? undefined : { left }} aria-label={title ?? 'Card'}>
      <div className="pview">
        <div className="pbody">
          <div className="prow">
            {backTo ? (
              <button className="back" onClick={onBack}><Back />Back to {backTo}</button>
            ) : <h2 className="pname">{title}</h2>}
            <div className="hbtns">
              <button className="x" aria-label="Close" onClick={onClose}><Close /></button>
            </div>
          </div>
          {backTo && <h2 className="pname">{title}</h2>}
        </div>
      </div>
    </section>
  )
}
