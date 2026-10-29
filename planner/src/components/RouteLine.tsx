import { Fragment } from 'react'
import type { Family } from '@map/data/types'
import { Flag, hasFlag } from '@map/map/Flag'
import { countryName } from '../lib/colors'
import { day } from '../lib/format'
import { flyOn, routeLabel, type RouteCountry, type RouteLeg, type TripRoute } from '../lib/route'
import { Arrow, ModeChip, Plane } from './icons'
import { useEdgeFade } from './useEdgeFade'

// The flag route of a trip: home, the flight in, the countries in order with how you move between
// them, the flight out and home. The same piece on the Trips list and, larger, on the trip hero.
// Built after the ReUI stepper on 21st.dev: masked dot connectors, a ring with a gap around the
// stages that matter (the landing and the way out) and edge fades when the route has to scroll.

type Ring = 'in' | 'out' | 'both'

function Country({ c, ring }: { c: RouteCountry; ring?: Ring }) {
  const name = countryName(c.country)
  const tip = c.places.length ? `${name}: ${c.places.join(', ')}` : `${name}, crossed overland`
  return (
    <span className="rt-c" data-ring={ring} title={tip}>
      {hasFlag(c.country) ? <Flag code={c.country} /> : <span className="rt-nf">{c.country || '?'}</span>}
    </span>
  )
}

function HomeFlag({ code, name }: { code: string; name: string }) {
  return (
    <span className="rt-c home" title={name}>
      {hasFlag(code) ? <Flag code={code} /> : <span className="rt-nf">{code}</span>}
    </span>
  )
}

/** The stretch between two flags. The mode chip sits on the first stretch of a hop, the rest of it is line only. */
function Link({ family, tone, same }: { family: Family; tone?: 'in' | 'home'; same?: boolean }) {
  return (
    <span className="rt-l" data-f={family} data-tone={tone}>
      {!same && <ModeChip family={family} />}
    </span>
  )
}

/**
 * The route as flags. A labelled image: the flags inside are decorative, so assistive tech reads the
 * label once, "Copenhagen to Guatemala City, Guatemala, ..., out from Bogotá".
 */
export function RouteLine({ route, size = 'row', label }: { route: TripRoute; size?: 'row' | 'hero'; label?: string }) {
  const ref = useEdgeFade<HTMLDivElement>()
  const cs = route.countries
  const first = cs[0]
  const last = cs[cs.length - 1]
  const one = cs.length === 1
  return (
    <div ref={ref} className="rt" data-size={size} role="img" aria-label={label ?? routeLabel(route)}>
      <span className="rt-end in">
        <HomeFlag code={route.home.country} name={route.home.name} />
        <Link family="flight" tone="in" />
        {first && <Country c={first} ring={one ? 'both' : 'in'} />}
        <span className="rt-cap" aria-hidden="true">{route.land.name}</span>
      </span>
      {cs.slice(1, -1).map((c, i) => (
        <Fragment key={i}>
          <Link family={c.via ?? 'ground'} same={c.same} />
          <Country c={c} />
        </Fragment>
      ))}
      {!one && last && <Link family={last.via ?? 'ground'} same={last.same} />}
      <span className="rt-end out">
        {!one && last && <Country c={last} ring="out" />}
        <Link family="flight" tone="home" />
        <HomeFlag code={route.home.country} name={route.home.name} />
        <span className="rt-cap" aria-hidden="true">{route.out.name}</span>
      </span>
    </div>
  )
}

/** "SJO" stays a code, a place without one keeps its name. */
const short = (id: string, name: string) => (/^[A-Z]{3}$/.test(id) ? id : name)

/**
 * The day each flight leaves, give or take, as a row of chips. onPickLeg gets the leg's from, to and
 * date, which is what a fare for that day is looked up by. pickedLeg is the key of the chosen one.
 */
export function FlyOnChips({ legs, pickedLeg, onPickLeg, labelledBy }: {
  legs: RouteLeg[]
  pickedLeg?: string | null
  onPickLeg?: (leg: RouteLeg) => void
  labelledBy?: string
}) {
  return (
    <ul className="fly" aria-labelledby={labelledBy}>
      {legs.map((l) => (
        <li key={l.key}>
          <button
            type="button"
            className="fly-chip"
            data-kind={l.kind}
            aria-pressed={onPickLeg ? pickedLeg === l.key : undefined}
            onClick={onPickLeg ? () => onPickLeg(l) : undefined}
            aria-label={`${l.fromName} to ${l.toName}, around ${day(l.date)}`}
            title={`${l.fromName} to ${l.toName}${l.dated ? '' : ', a rough day from the days around it'}`}
          >
            <span className="fly-ico"><Plane s={12} /></span>
            <b className="fly-d">{flyOn(l)}</b>
            <span className="fly-r">{short(l.from, l.fromName)}<Arrow s={10} />{short(l.to, l.toName)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
