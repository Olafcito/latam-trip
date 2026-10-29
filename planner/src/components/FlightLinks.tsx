import type { FlightLink } from '../lib/links'
import { External } from './icons'

/** Where each ticket can be looked up again. More tickets name their own legs. */
export function FlightLinks({ links }: { links: readonly FlightLink[] }) {
  if (!links.length) return null
  const many = links.length > 1
  return (
    <span className="fl-links">
      {links.map((l, i) => {
        const route = l.legs.map((g) => `${g.from} to ${g.to}`).join(', ')
        return (
          <a
            key={i}
            className={`fl-link${l.saved ? '' : ' search'}`}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            title={l.saved ? `The ${l.site} page this price was seen on` : `No page was saved for this price. A new ${l.site} search for ${route} on the same day`}
            onClick={(e) => e.stopPropagation()}
          >
            {many && route && <span className="fl-route">{route}</span>}
            {l.saved ? `Open on ${l.site}` : `Search ${l.site}`}
            <External />
          </a>
        )
      })}
    </span>
  )
}
