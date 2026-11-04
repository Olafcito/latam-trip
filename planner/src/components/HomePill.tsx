import { HOMES } from '../lib/homes'
import { countryName } from '../lib/colors'
import { Home } from './icons'
import { PillSelect } from './PillSelect'

// The home airport of the trip picker: Copenhagen and the airports near it, each with the price of its
// cheapest pair. A home the data has no fares from stays in the list, off, with a No fares chip.

export function HomePill({ value, onChange, best }: {
  value: string
  onChange: (code: string) => void
  /** the all in price of the cheapest pair from each home, null where the data has none */
  best?: Record<string, number | null>
}) {
  const options = HOMES.map((h) => ({
    value: h.code,
    label: h.city,
    flag: h.country,
    sub: `${countryName(h.country)} ${h.code}`,
    price: best?.[h.code],
    off: best != null && best[h.code] == null && h.code !== value,
  }))
  return <PillSelect name="Home airport" value={value} options={options} onChange={onChange} icon={<Home s={14} />} className="home-pick" />
}
