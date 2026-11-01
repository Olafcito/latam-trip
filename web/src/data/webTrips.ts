import { parseTrips, type TripState } from './trips'

// The trips of this app live in one documents row named web_trips, last write wins (spec 4.4). The first time a
// signed in browser opens the app after cutover, the trips it holds go there (spec 9.2). After that the row is
// the truth and every edit writes it. Nothing here runs before the cutover_done document exists.

export const WEB_IMPORTED_KEY = 'latam-web.imported'
export const WEB_TRIPS_DOC = 'web_trips'

export interface WebTripDeps {
  storage: Pick<Storage, 'getItem' | 'setItem'>
  /** the Supabase project ref, which the marker holds so a test project never blocks the real one */
  projectRef: string
  cutoverDone(): Promise<boolean>
  readDoc(name: string): Promise<unknown>
  writeDoc(name: string, data: unknown): Promise<void>
}

export interface WebSyncResult {
  /** the import did its work this time */
  ran: boolean
  reason?: 'before cutover' | 'already imported'
  /** the trips of the stored row, to show instead of the local ones. Null when there is no row. */
  stored: TripState | null
  /** the local trips were written to the row by this call */
  imported: boolean
  /** edits may be written from now on */
  live: boolean
}

const marked = (deps: WebTripDeps) => deps.storage.getItem(WEB_IMPORTED_KEY) === deps.projectRef

/**
 * Reads the stored trips and, once, moves the local ones into the row. A row that is already stored is kept.
 * The marker is set only after the row is there, so a failed write is tried again on the next open.
 */
export async function syncWebTrips(deps: WebTripDeps, local: TripState): Promise<WebSyncResult> {
  if (!(await deps.cutoverDone())) return { ran: false, reason: 'before cutover', stored: null, imported: false, live: false }
  const have = await deps.readDoc(WEB_TRIPS_DOC)
  const stored = have == null ? null : parseTrips(have)
  if (marked(deps)) return { ran: false, reason: 'already imported', stored, imported: false, live: true }
  if (stored) {
    deps.storage.setItem(WEB_IMPORTED_KEY, deps.projectRef)
    return { ran: true, stored, imported: false, live: true }
  }
  if (!local.trips.length) return { ran: true, stored: null, imported: false, live: false }
  await deps.writeDoc(WEB_TRIPS_DOC, local)
  // the marker follows the row, not the write call
  if ((await deps.readDoc(WEB_TRIPS_DOC)) == null) return { ran: true, stored: null, imported: false, live: false }
  deps.storage.setItem(WEB_IMPORTED_KEY, deps.projectRef)
  return { ran: true, stored: null, imported: true, live: true }
}

/** One edit of the trips. Before the import it does nothing, as it could overwrite a row that was never read. */
export async function pushWebTrips(deps: WebTripDeps, state: TripState): Promise<boolean> {
  if (!marked(deps)) return false
  await deps.writeDoc(WEB_TRIPS_DOC, state)
  return true
}
