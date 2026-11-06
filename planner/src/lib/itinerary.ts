// The trip as one line in the order it is lived: Copenhagen, the way in, then each stop with what happens there,
// the leg that leaves it, the next stop, and so on to the way home and Copenhagen again.
//
// The order is fixed by the structure, never sorted by time: Copenhagen, the way in, then for each stop the leg or gap
// that reaches it, the stop, its fold when it is open, and so on to the free nights, the way home and Copenhagen. A
// stop owns its stay and what there is to do there, so its fold comes straight after it, and the leg that leaves a
// stop comes after that fold, never between the stop and its stay. A leg that leaves before you get there is a clash
// the schedule warns about, not a reason to draw the leg above the stop. A leg of several flights is one entry.
//
// Each entry also carries an instant, from the booking when there is one, else from the picked flight, else from its
// day, and that instant never runs backwards along the line. The instants are carried for display and tests, nothing
// in the order depends on them.

/** A leg as the line needs it: when it leaves and when it lands, local time, or a bare day when the time is not known. */
export interface ItinLeg {
  depart: string
  arrive: string | null
}

/** A stop as the line needs it: the day you get there and the day you leave. */
export interface ItinStop {
  inDay: string
  outDay: string
}

export type ItinEntry =
  | { kind: 'home'; key: 'cph0' | 'cph1'; at: string }
  | { kind: 'leg'; key: string; at: string }
  /** a stop reached by no leg of its own, only its day */
  | { kind: 'gap'; key: string; i: number; at: string }
  | { kind: 'stop'; key: string; i: number; at: string }
  /** the stop folded open: its stay, then what there is to do there */
  | { kind: 'fold'; key: string; i: number; at: string }
  | { kind: 'free'; key: 'free'; at: string }

export interface ItinInput {
  wayIn: ItinLeg
  wayHome: ItinLeg
  stops: ItinStop[]
  /** the leg into each stop, by the stop's index. The first stop is reached by the way in, so hops[0] is null */
  hops: (ItinLeg | null)[]
  /** the stop folded open, if any */
  open: number | null
  /** free nights before the way home */
  free: number
}

/** A local stamp as a sortable minute: "2026-12-03" is the start of that day. */
export function instant(t: string): string {
  return t.length >= 16 ? t.slice(0, 16) : `${t.slice(0, 10)}T00:00`
}

const later = (a: string, b: string) => (a > b ? a : b)

/** The entries of the trip in the order they happen. */
export function itinerary({ wayIn, wayHome, stops, hops, open, free }: ItinInput): ItinEntry[] {
  const out: ItinEntry[] = []
  // the instant the line has reached: nothing after it may start earlier than what it follows from
  let now = instant(wayIn.depart)
  const add = (e: ItinEntry) => {
    now = later(now, e.at)
    e.at = now
    out.push(e)
  }
  add({ kind: 'home', key: 'cph0', at: instant(wayIn.depart) })
  add({ kind: 'leg', key: 'in', at: instant(wayIn.depart) })
  let landed = instant(wayIn.arrive ?? wayIn.depart)
  stops.forEach((s, i) => {
    const hop = i > 0 ? hops[i] : null
    if (i > 0) {
      if (hop) {
        add({ kind: 'leg', key: `h${i}`, at: instant(hop.depart) })
        landed = instant(hop.arrive ?? hop.depart)
      } else {
        add({ kind: 'gap', key: `g${i}`, i, at: instant(s.inDay) })
        landed = instant(s.inDay)
      }
    }
    // the stop starts when its leg lands, or on its day when the landing is not known
    add({ kind: 'stop', key: `s${i}`, i, at: later(landed, instant(s.inDay)) })
    if (open === i) add({ kind: 'fold', key: `f${i}`, i, at: now })
  })
  if (free > 0) add({ kind: 'free', key: 'free', at: now })
  add({ kind: 'leg', key: 'home', at: instant(wayHome.depart) })
  add({ kind: 'home', key: 'cph1', at: instant(wayHome.arrive ?? wayHome.depart) })
  return out
}
