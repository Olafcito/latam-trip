import type { Totals } from '../lib/journey'
import { hours, kr } from '../lib/format'
import { countryName } from '../lib/colors'

function V({ v, what }: { v: number | null; what: string }) {
  return v == null ? <span className="q" title={`${what} unknown for at least one ticket`}>?</span> : <>{kr(v)}</>
}

/** Flight tickets first (a shared ticket counted once), then everything kept apart from the flight price. */
export function TotalsPanel({ t, compact = false }: { t: Totals; compact?: boolean }) {
  const flightsTotal = t.tickets_dkk + t.regional_flights_dkk
  const countries = Object.entries(t.days_per_country).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
  return (
    <div className="tot">
      <span className="k">Long-haul tickets</span><span className="v">{kr(t.tickets_dkk)}</span>
      <span className="k">Regional flights</span><span className="v">{kr(t.regional_flights_dkk)}</span>
      <span className="k"><b>Flight tickets</b></span><span className="v big">{kr(flightsTotal)}</span>
      <span className="sep" />
      <span className="k">Cabin-bag fees</span><span className="v"><V v={t.cabin_bag_dkk} what="Cabin-bag fee" /></span>
      <span className="k">Checked-bag fees</span><span className="v"><V v={t.checked_bag_dkk} what="Checked-bag fee" /></span>
      <span className="k">Hub nights, est. stay</span><span className="v">{t.hub_nights} · <V v={t.hub_stay_dkk} what="Stay estimate" /></span>
      <span className="k">Ground transport</span><span className="v">{kr(t.ground_dkk)}{t.ground_unknown ? <span className="q" title={`${t.ground_unknown} hop(s) without a price`}> +?</span> : null}</span>
      <span className="sep" />
      <span className="k">Flights</span><span className="v">{t.flights}</span>
      <span className="k">Hours in the air</span><span className="v">{hours(t.air_hours)}</span>
      {!compact && countries.map(([c, n]) => (
        <span key={c} style={{ display: 'contents' }}><span className="k">Days in {countryName(c)}</span><span className="v">{n}</span></span>
      ))}
      {compact && countries.length > 0 && (
        <><span className="k">Days per country</span><span className="v">{countries.map(([c, n]) => `${c} ${n}`).join(' · ')}</span></>
      )}
    </div>
  )
}
