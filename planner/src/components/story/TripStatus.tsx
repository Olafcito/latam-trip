import { useState, type CSSProperties, type ReactNode } from 'react'
import type { Family } from '@map/data/types'
import { clock, dayRange, kr, weekdayDay } from '../../lib/format'
import { legCounts, nextOpen, tripCost, type CostItem, type CostPart, type LegKey, type LegState } from '../../lib/tripStatus'
import { DisclosurePanel, Chevron, useDisclosure } from '../Disclosure'
import { Boat, Bus, Check, Moon, Open, Plane } from '../icons'

// Where the trip stands, the first block of its page. Four figures: the nights with their dates, what it
// costs with the part paid as a bar, the legs booked and the legs still open. The cost opens All costs in
// place, the open count steps through the open legs. During the trip a Now block leads: tonight's stop
// and the next leg.

const ICON: Record<Family, (p: { s?: number }) => ReactNode> = { flight: Plane, boat: Boat, ground: Bus }

export interface NowView {
  /** the stop of tonight, null on the move or in the free nights */
  place: string | null
  nightsLeft: number
  next: { key: LegKey; fam: Family; route: string; day: string; time: string | null; booked: boolean } | null
}

export interface StatusProps {
  nights: number
  /** the day the trip lands and the day it flies home */
  first: string
  last: string
  legs: LegState[]
  parts: CostPart[]
  items: CostItem[]
  now: NowView | null
  /** takes the story to a leg and lights it */
  onGo: (key: LegKey) => void
}

const pct = (v: number, of: number) => `${(of > 0 ? (v / of) * 100 : 0).toFixed(2)}%`
const nightsWord = (n: number) => (n === 1 ? 'night' : 'nights')

/** Paid in green, estimated in grey, and a hatched end with the count of parts with no price. width is the share of the widest line. */
function CostBar({ paid, estimated, unpriced, width = 1 }: { paid: number; estimated: number; unpriced: number; width?: number }) {
  const sum = paid + estimated
  return (
    <span className="cb" aria-hidden="true">
      <span className="cb-track" style={{ '--w': `${(width * 100).toFixed(2)}%`, '--paid': pct(paid, sum) } as CSSProperties} data-empty={sum === 0 || undefined} />
      {unpriced > 0 && <span className="cb-q" title={`${unpriced} not priced`}>{unpriced}</span>}
    </span>
  )
}

function AllCosts({ parts, items, onItem }: { parts: CostPart[]; items: CostItem[]; onItem: (key: LegKey) => void }) {
  const widest = Math.max(1, ...parts.map((p) => p.paid + p.estimated))
  return (
    <div className="ac">
      <ul className="ac-parts">
        {parts.map((p) => {
          const sum = p.paid + p.estimated
          return (
            <li key={p.key} className="ac-part" data-optional={p.optional || undefined}>
              <span className="ac-name">{p.label}{p.optional && <span className="ac-opt">Optional</span>}</span>
              <CostBar paid={p.paid} estimated={p.estimated} unpriced={p.unpriced} width={sum / widest} />
              <span className="ac-kr">
                <b>{sum > 0 ? kr(sum) : 'No price'}</b>
                {p.paid > 0 && p.estimated > 0 && <small className="ac-paid" aria-label={`${kr(p.paid)} paid`}><Check s={10} />{kr(p.paid)}</small>}
                {p.paid > 0 && p.estimated === 0 && <small className="ac-paid" aria-label="All paid"><Check s={10} />Paid</small>}
              </span>
            </li>
          )
        })}
      </ul>
      {items.length > 0 && (
        <ol className="ac-items" aria-label="The biggest costs">
          {items.map((it) => {
            const Icon = ICON[it.fam]
            return (
              <li key={String(it.key)}>
                <button type="button" className="ac-item" data-f={it.fam} aria-label={`${it.label}, ${kr(it.dkk)} ${it.paid ? 'paid' : 'estimated'}, go to the leg`} onClick={() => onItem(it.key)}>
                  <Icon s={13} />
                  <span className="ac-route">{it.label}</span>
                  <span className="ac-price" data-paid={it.paid}>{it.paid ? <Check s={11} /> : <span className="ac-tilde">~</span>}{kr(it.dkk)}</span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function Now({ now, onGo }: { now: NowView; onGo: (key: LegKey) => void }) {
  const n = now.next
  const Icon = n ? ICON[n.fam] : null
  return (
    <div className="ts-now">
      <span className="ts-today">Today</span>
      {now.place && <b className="ts-here">{now.place}</b>}
      {now.place && now.nightsLeft > 0 && <span className="ts-left" aria-label={`${now.nightsLeft} ${nightsWord(now.nightsLeft)} left`}><Moon />{now.nightsLeft}</span>}
      {n && Icon && (
        <button type="button" className="ts-next" data-f={n.fam} aria-label={`Next, ${n.route}, ${weekdayDay(n.day)}${n.time ? ` ${clock(n.time)}` : ''}, ${n.booked ? 'booked' : 'open'}, go to the leg`} onClick={() => onGo(n.key)}>
          <Icon s={13} />
          <span className="ts-next-r">{n.route}</span>
          <span className="ts-next-d">{weekdayDay(n.day)}{n.time && <> {clock(n.time)}</>}</span>
          <span className={n.booked ? 'ts-mark booked' : 'ts-mark open'}>{n.booked ? <Check s={11} /> : <Open s={11} />}</span>
        </button>
      )}
    </div>
  )
}

export function TripStatus({ nights, first, last, legs, parts, items, now, onGo }: StatusProps) {
  const costs = useDisclosure()
  const [shown, setShown] = useState<LegKey | null>(null)
  const cost = tripCost(parts)
  const { booked, open } = legCounts(legs)
  const step = () => {
    const k = nextOpen(legs, shown)
    if (k == null) return
    setShown(k)
    onGo(k)
  }
  return (
    <section className="ts" aria-label="Where the trip stands">
      {now && <Now now={now} onGo={onGo} />}
      <div className="ts-row">
        <span className="ts-fig ts-nights" aria-label={`${nights} ${nightsWord(nights)}, ${dayRange(first, last)}`}>
          <span className="ts-top"><Moon /><b className="ts-n">{nights}</b><small>{nightsWord(nights)}</small></span>
          <small className="ts-sub">{dayRange(first, last)}</small>
        </span>
        <button className="ts-fig ts-cost" {...costs.trigger} aria-label={`${kr(cost.total)}, ${kr(cost.paid)} paid${cost.unpriced ? `, ${cost.unpriced} not priced` : ''}. All costs`}>
          <span className="ts-top"><b className="ts-n">{kr(cost.total)}</b><Chevron open={costs.open} /></span>
          <CostBar paid={cost.paid} estimated={cost.estimated} unpriced={cost.unpriced} />
        </button>
        <span className="ts-chips">
          <span className="ts-chip ts-booked" role="img" aria-label={`${booked} ${booked === 1 ? 'leg' : 'legs'} booked`} title="Legs booked"><Check s={13} />{booked}</span>
          {open > 0
            ? <button type="button" className="ts-chip ts-open" aria-label={`${open} ${open === 1 ? 'leg' : 'legs'} open, go to the next`} title="Go to the next open leg" onClick={step}><Open s={12} />{open}</button>
            : <span className="ts-chip ts-done"><Check s={13} />All booked</span>}
        </span>
      </div>
      <DisclosurePanel {...costs.panel}>
        <AllCosts parts={parts} items={items} onItem={(k) => { costs.trigger.onClick(); onGo(k) }} />
      </DisclosurePanel>
    </section>
  )
}
