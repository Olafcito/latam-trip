// Who may read a booking, and how often (FEAT-006 phase 2). Any signed in person, read from the JWT, gets a number of
// reads a month. The count lives in the database (migration 0029), the cap in the READ_BOOKING_MONTHLY_CAP secret.

export const DEFAULT_CAP = 30

/** The monthly cap from the secret, a whole number of at least 1, else the default. */
export function capOf(raw: string | undefined): number {
  const n = Number((raw ?? '').trim())
  return raw && raw.trim() && Number.isInteger(n) && n >= 1 ? n : DEFAULT_CAP
}

export interface Answer { status: number; body: Record<string, unknown> }

export interface Session {
  /** The signed in user's id, else null. */
  user(): Promise<string | null>
  /** Takes one read under the cap: true when there was room, false past it, null when the count could not be asked. */
  take(cap: number): Promise<boolean | null>
}

/** Null lets the request in, else the answer to give. */
export async function signedIn(s: Session): Promise<Answer | null> {
  return (await s.user()) ? null : { status: 401, body: { error: 'Sign in to read bookings.' } }
}

/** Null when a read was taken, else the answer to give. Past the cap the planner gets 429 monthly_cap. */
export async function turn(s: Session, cap: number): Promise<Answer | null> {
  const took = await s.take(cap)
  if (took === true) return null
  if (took === false) return { status: 429, body: { error: 'monthly_cap' } }
  return { status: 503, body: { error: 'The monthly count could not be checked.' } }
}
