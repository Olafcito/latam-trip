import type { InOut, Way } from '../data/types'
import { journeyIsValid, nodeForAirport, type Journey, type Totals } from './journey'
import type { SaveResult } from './remoteTrips'
import { tripWayId, type TripRow } from './repoTrips'
import { journeyToRow, tripRowErrors } from './tripRow'

// Moves what one browser holds into Supabase (spec 9.2). It runs after cutover, once per browser and project,
// on the port where the journeys live. Nothing here runs before the cutover_done document exists.
// The web app imports its own trips on its own origin, see web/src/data/webTrips.ts.

export const IMPORTED_KEY = 'latam-planner.imported'
const SAVED_KEY = 'latam-planner.journeys'
const HIDDEN_KEY = 'latam-planner.hidden'

export interface ImportDeps {
  storage: Pick<Storage, 'getItem' | 'setItem'>
  /** the Supabase project ref, which the marker holds so a test project never blocks the real one */
  projectRef: string
  inout: InOut
  cutoverDone(): Promise<boolean>
  readDoc(name: string): Promise<unknown>
  writeDoc(name: string, data: unknown): Promise<void>
  /** the latest stored version of every trip that is not deleted */
  latest(): Promise<TripRow[]>
  save(row: TripRow): Promise<SaveResult>
  remove(id: string): Promise<{ ok: boolean }>
  totals(j: Journey): Totals
}

export interface ImportReport {
  ran: boolean
  reason?: 'before cutover' | 'already imported'
  imported: string[]
  unresolved: string[]
  failed: string[]
  deleted: string[]
}

const none = (reason: ImportReport['reason']): ImportReport => ({ ran: false, reason, imported: [], unresolved: [], failed: [], deleted: [] })

function read<T>(deps: ImportDeps, key: string, fallback: T): T {
  try {
    const raw = deps.storage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

/** The ids of the ways of a journey in this build, or null when a way is gone or does not meet the journey's ends. */
function resolve(j: Journey, map: Record<string, string>, inout: InOut, last: TripRow | null): Journey | null {
  const pick = (id: string, dir: 'in' | 'home') => {
    if (last && id === tripWayId(j.id, dir)) return { id, way: dir === 'in' ? last.way_in : last.way_home }
    const to = map[id] ?? id
    return { id: to, way: inout.ways[to] as Way | undefined }
  }
  const wi = pick(j.wayIn, 'in')
  const wh = pick(j.wayHome, 'home')
  if (!wi.way || !wh.way) return null
  const first = j.places[0]?.node
  const end = j.places.at(-1)?.node
  if (!first || first !== nodeForAirport(inout, wi.way.to)) return null
  if (!end || end !== nodeForAirport(inout, wh.way.from)) return null
  return { ...j, wayIn: wi.id, wayHome: wh.id }
}

async function addUnresolved(deps: ImportDeps, list: Journey[]) {
  if (!list.length) return
  const have = await deps.readDoc('unresolved_journeys')
  const old = Array.isArray(have) ? (have as Journey[]).filter(journeyIsValid) : []
  const ids = new Set(list.map((j) => j.id))
  await deps.writeDoc('unresolved_journeys', [...old.filter((j) => !ids.has(j.id)), ...list])
}

/** One import of the journeys and hidden ids of this browser. A second call, or one before cutover, does nothing. */
export async function importBrowser(deps: ImportDeps): Promise<ImportReport> {
  if (deps.storage.getItem(IMPORTED_KEY) === deps.projectRef) return none('already imported')
  if (!(await deps.cutoverDone())) return none('before cutover')

  const rawMap = await deps.readDoc('way_id_map')
  const map = rawMap && typeof rawMap === 'object' ? (rawMap as Record<string, string>) : {}
  const rows = new Map((await deps.latest()).map((r) => [r.id, r]))
  const report: ImportReport = { ran: true, imported: [], unresolved: [], failed: [], deleted: [] }
  const unresolved: Journey[] = []

  const journeys = read<unknown[]>(deps, SAVED_KEY, []).filter(journeyIsValid)
  for (const j of journeys) {
    const top = rows.get(j.id) ?? null
    const old = !!top && (j.version ?? 0) < top.version
    // a local edit of an old version must not overwrite a newer stored one, so it gets an id of its own
    const id = old ? `${j.id}-v${j.version ?? 0}` : j.id
    const own = j.wayIn === tripWayId(j.id, 'in') || j.wayHome === tripWayId(j.id, 'home')
    const res = old && own ? null : resolve(j, map, deps.inout, top)
    if (!res) {
      unresolved.push(j)
      report.unresolved.push(j.id)
      continue
    }
    const fresh = { ...res, id }
    let row: TripRow
    try {
      row = journeyToRow(fresh, old ? null : top, deps.inout, deps.totals(fresh))
    } catch {
      unresolved.push(j)
      report.unresolved.push(j.id)
      continue
    }
    if (tripRowErrors(row).length) {
      unresolved.push(j)
      report.unresolved.push(j.id)
      continue
    }
    const out = await deps.save(row).catch((): SaveResult => ({ status: 'failed', message: 'save threw' }))
    if (out.status === 'saved') report.imported.push(id)
    // a trip deleted in another window is settled, so it must not hold the marker back
    else if (out.status === 'deleted') report.deleted.push(id)
    else report.failed.push(j.id)
  }

  // hidden names a version. A newer one reappears today, so it is deleted only when no newer one is stored
  const hidden = read<Record<string, number>>(deps, HIDDEN_KEY, {})
  for (const [id, version] of Object.entries(hidden)) {
    const top = rows.get(id)
    if (!top || top.version > Number(version)) continue
    const out = await deps.remove(id)
    if (out.ok) report.deleted.push(id)
    else report.failed.push(id)
  }

  await addUnresolved(deps, unresolved)
  // a failure leaves the marker unset, so the next start tries again. Saves of the same content are skipped
  if (!report.failed.length) deps.storage.setItem(IMPORTED_KEY, deps.projectRef)
  return report
}
