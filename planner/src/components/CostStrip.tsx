import type { ReactNode } from 'react'
import type { Totals } from '../lib/journey'
import { hours, kr } from '../lib/format'
import { Chevron, DisclosurePanel, useDisclosure } from './Disclosure'

function V({ v, what }: { v: number | null; what: string }) {
  return v == null ? <span className="q" title={`${what} unknown for at least one ticket`}>not known</span> : <>{kr(v)}</>
}

function Cell({ k, children }: { k: string; children: ReactNode }) {
  return <div><dt>{k}</dt><dd>{children}</dd></div>
}

/** The price of the trip in one line: the total, then the three costs that make most of it. Bags, hub nights and flight counts open on a click. */
export function CostStrip({ t, total }: { t: Totals; total: number }) {
  const more = useDisclosure()
  return (
    <section className="costs" aria-label="Costs">
      <div className="costs-row">
        <dl>
          <Cell k="Total">{kr(total)}</Cell>
          <Cell k="Long-haul">{kr(t.tickets_dkk)}</Cell>
          <Cell k="Regional flights">{kr(t.regional_flights_dkk)}</Cell>
          <Cell k="Ground">{kr(t.ground_dkk)}{t.ground_unknown ? <span className="q" title={`${t.ground_unknown} hop(s) without a price`}>, some not priced</span> : null}</Cell>
        </dl>
        <button className="disc-btn costs-btn" {...more.trigger}>All costs<Chevron open={more.open} /></button>
      </div>
      <DisclosurePanel {...more.panel}>
        <dl className="costs-more">
          <Cell k="Cabin-bag fees"><V v={t.cabin_bag_dkk} what="Cabin-bag fee" /></Cell>
          <Cell k="Checked-bag fees"><V v={t.checked_bag_dkk} what="Checked-bag fee" /></Cell>
          <Cell k="Hub nights">{t.hub_nights}</Cell>
          <Cell k="Hub stays, estimated"><V v={t.hub_stay_dkk} what="Stay estimate" /></Cell>
          <Cell k="Flights">{t.flights}</Cell>
          <Cell k="In the air">{hours(t.air_hours)}</Cell>
        </dl>
      </DisclosurePanel>
    </section>
  )
}
