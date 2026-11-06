// Icons the planner adds to the map's set: one stroke, round caps, currentColor.
export { Plane, Bus, Boat, Moon, Arrow, Plus, Minus, Close, ModeChip } from '@map/map/icons'

const base = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

/** A layover: a clock. */
export const Clock = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </svg>
)

/** A day stop: the sun. */
export const Sun = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
  </svg>
)

/** A self-transfer between separate tickets: two arrows swapping. */
export const Transfer = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M4 8h13M14 4l4 4-4 4M20 16H7M10 12l-4 4 4 4" />
  </svg>
)

/** Home, for Copenhagen at either end. */
export const Home = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M4 11l8-7 8 7M6 10v10h12V10M10 20v-6h4v6" />
  </svg>
)

/** A landing plane, for the arrival end of a way. */
export const Land = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M3 20h18M3.5 12.5l16 4.3c.6.2 1.2-.2 1.3-.8l.1-.4c.1-.5-.2-1-.7-1.2L15 12l-2-8-2 .5.5 6.5-5-1.5-1.5-3-2 .5z" />
  </svg>
)

/** A calendar, for dates. */
export const Calendar = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
)

/** A bag, for cabin and checked bag fees. */
export const Bag = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <rect x="4" y="8" width="16" height="13" rx="3" />
    <path d="M9 8V5a3 3 0 0 1 6 0v3" />
  </svg>
)

/** A warning triangle. */
export const Warn = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M12 4 2.5 20h19zM12 10v4M12 17.5v.5" />
  </svg>
)

/** A map pin, for opening a trip on the map. */
export const Pin = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M12 21s6-6.5 6-11a6 6 0 1 0-12 0c0 4.5 6 11 6 11z" />
    <circle cx="12" cy="10" r="2.2" />
  </svg>
)

/** A download arrow, for exports. */
export const Download = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M12 4v11M7 10l5 5 5-5M4 20h16" />
  </svg>
)

/** A trash can. */
export const Trash = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v6M14 11v6" />
  </svg>
)

/** A drag handle: two columns of dots. */
export const Grip = ({ s = 14 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={3} {...base}>
    <path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" />
  </svg>
)

/** Done or booked: a check. */
export const Check = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.6} {...base}><path d="M5 12.5l4.5 4.5L19 7" /></svg>
)

/** Opens elsewhere: an arrow out of a box. */
export const External = ({ s = 12 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
)

/** A month back or on, in the calendar, or down on a control that opens a choice. */
export const Caret = ({ s = 14, dir }: { s?: number; dir: 'l' | 'r' | 'd' | 'u' }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d={dir === 'l' ? 'M15 5l-7 7 7 7' : dir === 'r' ? 'M9 5l7 7-7 7' : dir === 'u' ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} />
  </svg>
)

/** Copy: two sheets, one over the other. */
export const Copy = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
  </svg>
)

/** A file: a page with its corner folded. */
export const Doc = ({ s = 16 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2} {...base}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </svg>
)

/** Edit: a pencil. */
export const Pencil = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />
  </svg>
)

/** Money back: an arrow turning back on itself. */
export const Refund = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M4 5v5h5" />
    <path d="M4.6 14.5A8 8 0 1 0 6 7.5L4 10" />
  </svg>
)

/** Another day: a calendar with an arrow on it. */
export const Rebook = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4M9 15.5h6M13 13l2.5 2.5L13 18" />
  </svg>
)

/** A checked bag: a suitcase standing up. */
export const Suitcase = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <rect x="6" y="6" width="12" height="14" rx="2.5" />
    <path d="M10 6V3.5h4V6M10 10v6M14 10v6M9 20v1.5M15 20v1.5" />
  </svg>
)

/** A person, for travellers. */
export const Person = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
  </svg>
)

/** Who sold it: a shop front. */
export const Shop = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M4 9.5 5.5 4h13L20 9.5M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M5.5 12v8h13v-8M10 20v-5h4v5" />
  </svg>
)

/** A ticket: a stub with its notches. */
export const Ticket = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" />
    <path d="M14 6v12" strokeDasharray="2 2.5" />
  </svg>
)

/** A booking reference: a hash. */
export const Hash = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M9 4 7 20M17 4l-2 16M4.5 9h16M3.5 15h16" />
  </svg>
)

/** A web address: two links of a chain. */
export const Link = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
    <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
  </svg>
)

/** Notes: lines of text. */
export const Note = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M5 6h14M5 11h14M5 16h9" />
  </svg>
)

/** A long wait between flights: an hourglass. */
export const Hourglass = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M6 3h12M6 21h12M7 3v3a5 5 0 0 0 10 0V3M7 21v-3a5 5 0 0 1 10 0v3" />
  </svg>
)

/** An entry permit such as the ESTA: a passport with a globe. */
export const Passport = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <rect x="5" y="3" width="14" height="18" rx="2.5" />
    <circle cx="12" cy="10.5" r="3.2" />
    <path d="M9 17h6" />
  </svg>
)

/** A change of airport on the way: a hop from one point to another. */
export const Hop = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <circle cx="5" cy="17" r="2" />
    <circle cx="19" cy="17" r="2" />
    <path d="M6.5 14.5C8 8.5 16 8.5 17.5 14.5M15 13.8l2.5.7.8-2.6" />
  </svg>
)

/** A bed, for the beds of a room. */
export const Bed = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M3 6v13M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6" />
    <circle cx="7" cy="11.5" r="1.8" />
  </svg>
)

/** A bath, for the bathroom of a room. */
export const Bath = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M3 12h18v2a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5zM7 19l-1 2M17 19l1 2M6 12V6a2 2 0 0 1 3.7-1" />
  </svg>
)

/** A door with its key, for a room of your own. */
export const Door = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M5 21V4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5V21M3 21h18" />
    <circle cx="15" cy="12" r="1" />
  </svg>
)

/** A star, for a rating. */
export const Star = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z" />
  </svg>
)

/** A wave, for the beach. */
export const Wave = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M2 9c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" />
  </svg>
)

/** The Madrid ticket: one ticket with a hop inside, for a ticket that changes airport on the way. */
export const TicketHop = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" />
    <path d="M8 14.5c1.2-3.6 6.8-3.6 8 0" strokeWidth={2} />
  </svg>
)

/** Two one ways: a ticket torn in two, the halves pulled apart along a jagged tear. */
export const TwoTickets = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M3 6.5a2 2 0 0 0 2-2h5.5l-2 3 2 3-2 3 2 3H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" />
    <path d="M13.5 7.5H19a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2h-5.5l2-3-2-3 2-3z" />
  </svg>
)

/** A booked side that a pick may not replace: a padlock. */
export const Lock = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
)

/** Somewhere else: an arrow up and to the right, for a mail, a page or another journey. */
export const ArrowUpRight = ({ s = 14 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M8 6h10v10M18 6L6 18" />
  </svg>
)

/** Fresh prices: a circle arrow coming round. */
export const Refresh = ({ s = 14 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
  </svg>
)

/** Add a file: an arrow up out of a tray. */
export const Upload = ({ s = 20 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
  </svg>
)

// ---- accommodation: the city tabs, the search and a place's offer

/** Things to do: a list. */
export const List = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2} {...base}>
    <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" strokeWidth={2.2} />
  </svg>
)

/** About a place: an i in a ring. */
export const Info = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2} {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.8v.2" strokeWidth={2.4} />
  </svg>
)

/** Find: a magnifying glass. */
export const Search = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </svg>
)

/** Keep for later: a bookmark, filled when kept. */
export const Bookmark = ({ s = 13, on }: { s?: number; on?: boolean }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base} fill={on ? 'currentColor' : 'none'}>
    <path d="M6.5 3.5h11v17L12 16.5l-5.5 4z" />
  </svg>
)

/** Save a place: a heart, filled when saved. */
export const Heart = ({ s = 13, on }: { s?: number; on?: boolean }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base} fill={on ? 'currentColor' : 'none'}>
    <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" />
  </svg>
)

/** Share: an arrow up out of a tray. */
export const Share = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M12 3.5v11M8 7.5l4-4 4 4M7 11H5.5v9.5h13V11H17" />
  </svg>
)

/** More: three dots in a row. */
export const More = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={3.2} {...base}>
    <path d="M5 12h.01M12 12h.01M19 12h.01" />
  </svg>
)

/** Not done yet: an open ring. */
export const Ring = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.4} {...base}>
    <circle cx="12" cy="12" r="7.5" />
  </svg>
)

/** A hostel: a bunk bed. */
export const Bunk = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2} {...base}>
    <path d="M4 3.5v17M20 3.5v17M4 9h16M4 16h16M4 6.5h6M4 13.5h6" />
  </svg>
)

/** A guesthouse: a house with a sign. */
export const House = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2} {...base}>
    <rect x="4" y="6" width="16" height="13" rx="2" />
    <path d="M8 11h8M8 14.5h5M12 3v3" />
  </svg>
)

/** An apartment: a block with windows. */
export const Building = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2} {...base}>
    <path d="M5 20.5V7l7-3.5L19 7v13.5M3 20.5h18M9 10h.01M15 10h.01M9 14h.01M15 14h.01M10.5 20.5v-3h3v3" strokeWidth={2.2} />
  </svg>
)

/** Photos: a picture frame. */
export const Photos = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M20.5 15.5 15.5 11 7 19" />
  </svg>
)

/** Social: two people. */
export const People = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M3 19.5a6 6 0 0 1 12 0M15.5 5.5a3.2 3.2 0 0 1 0 6.2M17.5 14a6 6 0 0 1 3.5 5.5" />
  </svg>
)

/** A kitchen: a pot on the boil. */
export const Pot = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M5 10h14v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM2.5 11.5H5M19 11.5h2.5M9 6.5c0-1.5 1-1.5 1-3M13.5 6.5c0-1.5 1-1.5 1-3" />
  </svg>
)

/** Breakfast: a cup. */
export const Cup = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M4.5 9h12v5.5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5zM16.5 10.5h1.5a2.5 2.5 0 0 1 0 5h-1.8M8 3.5v2.5M12 3.5v2.5" />
  </svg>
)

/** Air con: a unit blowing cool air. */
export const AirCon = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <rect x="3" y="4.5" width="18" height="8" rx="2" />
    <path d="M7 9.5h10M8 16c0 1.5-1 1.5-1 3M12 16v3.5M16 16c0 1.5 1 1.5 1 3" />
  </svg>
)

/** A workspace: a laptop. */
export const Laptop = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <rect x="5" y="5" width="14" height="10" rx="1.5" />
    <path d="M2.5 19h19" />
  </svg>
)

/** Wi-Fi: three arcs over a dot. */
export const Wifi = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.6 16a5 5 0 0 1 6.8 0" />
    <circle cx="12" cy="19.5" r="0.6" />
  </svg>
)

/** A bar: a cocktail glass on its stem. */
export const Glass = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M4.5 4.5h15L12 13zM12 13v7M8 20h8M7 7.5h10" />
  </svg>
)

/** By the beach: a sun umbrella. */
export const Umbrella = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M3 12a9 9 0 0 1 18 0zM12 12v8M8.5 20.5h7" />
  </svg>
)

/** Quiet: a crescent and a small star. */
export const Quiet = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M18.5 14.5A7.5 7.5 0 0 1 9.5 5.5a7.5 7.5 0 1 0 9 9z" />
  </svg>
)

// ---- a stay's booking: the confirmation window and the card

/** Use with AI: a large sparkle and a small one. */
export const Sparkles = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2} {...base}>
    <path d="M10 3.5l1.6 4.9 4.9 1.6-4.9 1.6L10 16.5l-1.6-4.9L3.5 10l4.9-1.6z" />
    <path d="M18 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
  </svg>
)

/** A confirmation attached: a paperclip. */
export const Paperclip = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7.1-7.1l8.1-8.1a3.3 3.3 0 0 1 4.7 4.7l-8.1 8.1a1.7 1.7 0 0 1-2.4-2.4l7.4-7.4" />
  </svg>
)

/** A sign in link on its way: an envelope. */
export const Mail = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="m3.5 7.5 8.5 6 8.5-6" />
  </svg>
)

/** The money a person counts in: a banknote. */
export const Cash = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6 12h.01M18 12h.01" />
  </svg>
)
