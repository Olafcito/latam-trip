import type { InOut, Ticket, Way } from '../data/types'
import type { Journey, Place, Totals } from './journey'
import { rowToJourney, sameJourney, tripWayId, type RowPlace, type TripRow } from './repoTrips'

// The writer from a journey to a trip row, and a mirror of the checks tripdb makes of a row
// (TRIP, TRIP_WAY, TRIP_TICKET, TRIP_PLACE, TRIP_HOP and TRIP_FLIGHT in plugin/scripts/tripdb.py).

type Spec = Record<string, string>

const TRIP: Spec = {
  id: '!tid', version: '!int', name: '!str', saved_at: '!time', by: '!enum:plan-trip,migration,planner', why: '!str',
  rank: 'int|null', option_id: 'str|null', way_in: '!dict', way_home: '!dict', tickets: 'dict|null', places: '!list', totals: 'dict|null',
}
const TRIP_WAY: Spec = {
  direction: 'enum:in,home', from: '!iata', to: '!iata', depart: '!time', arrive: '!time', price_dkk: '!num', tickets: '!list',
  timeline: '!list', airports: 'list', observed_at: 'time|null',
}
const TRIP_TICKET: Spec = { id: '!str', price_dkk: '!num', observed_at: 'str|null' }
const TRIP_PLACE: Spec = {
  node: '!pid', hop: '!dict|null', why: 'str|null', nights: 'int|null', arrive: 'date|time|null', depart: 'date|time|null', stay: 'dict|null',
}
const TRIP_HOP: Spec = {
  from: '!pid', to: '!pid', mode: '!enum:flight,bus,boat,train,colectivo,shuttle,chicken_bus', operator: 'str|null', hours: 'num|null',
  price_dkk: 'num|null', observed_at: 'time|null', overnight: 'bool|null', border: 'bool|null', flight: 'dict|null', overland: 'str|null',
  countries: 'list|null',
}
const TRIP_FLIGHT: Spec = {
  quote_id: '!str', depart: '!time', arrive: '!time', hours: '!num', price_dkk: '!num', carriers: '!list', via: 'list',
  layover_h: 'list', observed_at: 'time|null',
}

const PATTERNS: Record<string, RegExp> = {
  iata: /^[A-Z]{3}$/, pid: /^[A-Z][A-Z0-9_]{1,9}$/, slug: /^[a-z0-9][a-z0-9_-]*$/, cc: /^[A-Z]{2}$/, tid: /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/,
}
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/

const validDate = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function is(v: unknown, t: string): boolean {
  switch (t) {
    case 'str': return typeof v === 'string'
    case 'int': return typeof v === 'number' && Number.isInteger(v)
    case 'num': return typeof v === 'number' && Number.isFinite(v)
    case 'bool': return typeof v === 'boolean'
    case 'list': return Array.isArray(v)
    case 'dict': return isObj(v)
    case 'null': return v === null
    case 'date': {
      const m = typeof v === 'string' ? DATE_RE.exec(v) : null
      return !!m && validDate(+m[1], +m[2], +m[3])
    }
    case 'time': {
      const m = typeof v === 'string' ? TIME_RE.exec(v) : null
      return !!m && validDate(+m[1], +m[2], +m[3]) && +m[4] < 24 && +m[5] < 60
    }
    default:
      if (PATTERNS[t]) return typeof v === 'string' && PATTERNS[t].test(v)
      if (t.startsWith('enum:')) return typeof v === 'string' && t.slice(5).split(',').includes(v)
      if (t.startsWith('const:')) return v === t.slice(6)
      throw new Error(`unknown field type ${t}`)
  }
}

function checkFields(row: unknown, schema: Spec): string[] {
  if (!isObj(row)) return ['row is not a JSON object']
  const errs: string[] = []
  for (const [field, spec] of Object.entries(schema)) {
    const required = spec.startsWith('!')
    if (!(field in row)) {
      if (required) errs.push(`missing ${field}`)
      continue
    }
    const types = spec.replace(/^!/, '').split('|')
    if (!types.some((t) => is(row[field], t))) {
      errs.push(`${field} is ${(JSON.stringify(row[field]) ?? 'undefined').slice(0, 60)}, expected ${types.join(' or ')}`)
    }
  }
  return errs
}

/** What `tripdb check` refuses in a trip row, in its words. Empty when the row is fine. */
export function tripRowErrors(r: TripRow): string[] {
  let errs = checkFields(r, TRIP)
  if (errs.length) return errs
  if (r.version < 1) errs.push(`version ${r.version} is below 1`)
  for (const name of ['way_in', 'way_home'] as const) errs = errs.concat(checkFields(r[name], TRIP_WAY).map((e) => `${name} ${e}`))
  for (const [k, tk] of Object.entries(r.tickets ?? {})) errs = errs.concat(checkFields(tk, TRIP_TICKET).map((e) => `tickets.${k} ${e}`))
  if (!r.places.length) errs.push('places is empty')
  let prev: string | null = null
  r.places.forEach((p, i) => {
    const pe = checkFields(p, TRIP_PLACE)
    errs = errs.concat(pe.map((e) => `places[${i}] ${e}`))
    if (pe.length) {
      prev = null
      return
    }
    const hop = p.hop
    if (i === 0) {
      if (hop != null) errs.push('places[0] has a hop, the first place is where the way in lands')
    } else if (hop == null) {
      errs.push(`places[${i}] ${p.node} has no hop`)
    } else {
      const he = checkFields(hop, TRIP_HOP)
      errs = errs.concat(he.map((e) => `places[${i}].hop ${e}`))
      if (!he.length) {
        if (prev !== null && hop.from !== prev) errs.push(`places[${i}].hop starts in ${hop.from}, the place before is ${prev}`)
        if (hop.to !== p.node) errs.push(`places[${i}].hop ends in ${hop.to}, the place is ${p.node}`)
        if (isObj(hop.flight)) errs = errs.concat(checkFields(hop.flight, TRIP_FLIGHT).map((e) => `places[${i}].hop.flight ${e}`))
      }
    }
    prev = p.node
  })
  return errs
}

type RowWay = TripRow['way_in']

/** A way for the row: the trip's own copy when the journey still uses it, else the build's way without the id that changes per build. */
function rowWay(j: Journey, dir: 'in' | 'home', inout: InOut, last: TripRow | null): RowWay | null {
  const id = dir === 'in' ? j.wayIn : j.wayHome
  if (last && id === tripWayId(j.id, dir)) return dir === 'in' ? last.way_in : last.way_home
  const w = inout.ways[id] as Way | undefined
  if (!w) return null
  const { id: _id, ...rest } = w
  return rest as unknown as RowWay
}

function rowTickets(ways: RowWay[], inout: InOut, last: TripRow | null): TripRow['tickets'] {
  const out: NonNullable<TripRow['tickets']> = {}
  for (const w of ways) {
    for (const t of w.tickets ?? []) {
      const own = last?.tickets?.[t] ?? (inout.tickets[t] as Ticket | undefined)
      if (own) out[t] = own as NonNullable<TripRow['tickets']>[string]
    }
  }
  return Object.keys(out).length ? out : null
}

function rowPlace(p: Place, i: number, last: TripRow | null): RowPlace {
  const was = last?.places[i]
  const keep = was && was.node === p.node ? was : null
  const out: RowPlace = { node: p.node, hop: i === 0 ? null : (p.hop as RowPlace['hop']) }
  if (p.why) out.why = p.why
  // what the journey does not hold stays as the last version had it
  if (keep) {
    for (const k of ['nights', 'arrive', 'depart', 'stay', ...(p.why ? [] : ['why' as const])] as const) if (k in keep) (out as unknown as Record<string, unknown>)[k] = keep[k]
  }
  return out
}

/**
 * The row a Save stores. It starts from the last stored row of the id, so rank, why, option_id and the
 * trip's own ways and tickets survive, and what the journey does not hold (nights, stay) is carried over.
 * A journey that is the last row opened again keeps that row's totals, so opening a trip and pressing Save
 * is the same content. Any other journey takes the totals the screen shows. It throws when a way of the
 * journey is not in inout, as no honest row can be written without it.
 */
export function journeyToRow(j: Journey, last: TripRow | null, inout: InOut, totals: Totals): TripRow {
  const wayIn = rowWay(j, 'in', inout, last)
  const wayHome = rowWay(j, 'home', inout, last)
  if (!wayIn || !wayHome) throw new Error(`The ways of ${j.name} are not in the data, so it cannot be saved.`)
  const unchanged = !!last && sameJourney(rowToJourney(last), j)
  const row: TripRow = {
    id: j.id,
    version: (last?.version ?? 0) + 1,
    name: j.name,
    saved_at: new Date().toISOString(),
    by: 'planner',
    why: last?.why ?? j.why ?? '',
    rank: last && 'rank' in last ? last.rank : j.rank,
    option_id: last ? (last.option_id ?? j.optionId ?? null) : j.optionId,
    way_in: wayIn,
    way_home: wayHome,
    tickets: rowTickets([wayIn, wayHome], inout, last),
    places: j.places.map((p, i) => rowPlace(p, i, last)),
  }
  if (unchanged) {
    if (last && 'totals' in last) row.totals = last.totals
  } else row.totals = totals as unknown as Record<string, unknown>
  if (j.lastNights != null) row.lastNights = j.lastNights
  // undefined fields leave the row the way JSON would, and the stored copy never shares objects with the screen
  return JSON.parse(JSON.stringify(row)) as TripRow
}
