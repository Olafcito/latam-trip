import type { TripRow } from './repoTrips'

// Saves that have not reached Supabase yet (spec 6.3). They sit in localStorage, in the order they were
// pressed, and leave only after a send went through. Two saves of one trip stay two entries, as they
// become two versions and the later one is the latest.

export const OUTBOX_KEY = 'latam-planner.outbox'

export interface Queued {
  row: TripRow
  queued_at: string
}

/** How a send ended. `queued` means it could not be tried now and must stay. */
export type SendOutcome =
  | { status: 'saved' }
  | { status: 'queued'; reason?: 'offline' | 'session' }
  | { status: 'deleted' }
  | { status: 'failed'; message: string }

export interface FlushReport {
  sent: number
  /** saves that can never go through, so they leave the outbox and are reported */
  dropped: { row: TripRow; reason: string }[]
  /** saves still waiting */
  left: number
  /** why the run stopped on a save that has to wait, when it did */
  stalled?: 'offline' | 'session'
}

function read(): Queued[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY)
    const list: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? (list as Queued[]).filter((q) => !!q && typeof q === 'object' && !!q.row) : []
  } catch {
    return []
  }
}

function write(list: Queued[]) {
  try {
    if (list.length) localStorage.setItem(OUTBOX_KEY, JSON.stringify(list))
    else localStorage.removeItem(OUTBOX_KEY)
  } catch {
    // storage blocked or full: nothing more can be kept
  }
}

let flushing: Promise<FlushReport> | null = null

export const outbox = {
  enqueue(row: TripRow) {
    write([...read(), { row, queued_at: new Date().toISOString() }])
  },
  size(): number {
    return read().length
  },
  list(): Queued[] {
    return read()
  },
  /**
   * Sends the saves in order. An entry is removed only after its send answered, and the first one that
   * has to wait stops the run, so the order never changes. Runs do not overlap.
   */
  flush(send: (row: TripRow) => Promise<SendOutcome>): Promise<FlushReport> {
    flushing ??= (async () => {
      const report: FlushReport = { sent: 0, dropped: [], left: 0 }
      try {
        for (;;) {
          const head = read()[0]
          if (!head) break
          let out: SendOutcome
          try {
            out = await send(head.row)
          } catch {
            break
          }
          if (out.status === 'queued') {
            report.stalled = out.reason ?? 'offline'
            break
          }
          // the send is over, so the head leaves. Saves queued while it ran sit behind it
          write(read().slice(1))
          if (out.status === 'saved') report.sent++
          else report.dropped.push({ row: head.row, reason: out.status === 'deleted' ? 'deleted' : out.message })
        }
      } finally {
        report.left = read().length
        flushing = null
      }
      return report
    })()
    return flushing
  },
}
