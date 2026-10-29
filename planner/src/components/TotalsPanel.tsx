import type { Totals } from '../lib/journey'
import { hours, kr } from '../lib/format'
import { Chevron, DisclosurePanel, useDisclosure } from './Disclosure'

function V({ v, what }: { v: number | null; what: string }) {
  return v == null ? <span className="q" title={`${what} unknown for at least one ticket`}>?</span> : <>{kr(v)}</>
}

/** The total and the three costs that make most of it. Bags, hub nights and flight counts open on a click. */
export function TotalsPanel({ t, total }: { t: Totals; total: number }) {
  const more = useDisclosure()
  return (
    <div className="tots">
      <div className="tot">
        <span className="k">Total</span><span className="v big">{kr(total)}</span>
        <span className="sep" />
        <span className="k">Long-haul</span><span className="v">{kr(t.tickets_dkk)}</span>
        <span className="k">Regional flights</span><span className="v">{kr(t.regional_flights_dkk)}</span>
        <span className="k">Ground</span><span className="v">{kr(t.ground_dkk)}{t.ground_unknown ? <span className="q" title={`${t.ground_unknown} hop(s) without a price`}> +?</span> : null}</span>
      </div>
      <button className="disc-btn tot-more" {...more.trigger}>All costs<Chevron open={more.open} /></button>
      <DisclosurePanel {...more.panel}>
        <div className="tot">
          <span className="k">Cabin-bag fees</span><span className="v"><V v={t.cabin_bag_dkk} what="Cabin-bag fee" /></span>
          <span className="k">Checked-bag fees</span><span className="v"><V v={t.checked_bag_dkk} what="Checked-bag fee" /></span>
          <span className="k">Hub nights</span><span className="v">{t.hub_nights}</span>
          <span className="k">Hub stays, estimated</span><span className="v"><V v={t.hub_stay_dkk} what="Stay estimate" /></span>
          <span className="k">Flights</span><span className="v">{t.flights}</span>
          <span className="k">In the air</span><span className="v">{hours(t.air_hours)}</span>
        </div>
      </DisclosurePanel>
    </div>
  )
}
