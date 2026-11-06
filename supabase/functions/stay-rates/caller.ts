// Who asks for live rates, and whose rows the answer is written to (FEAT-006 phase 2). A signed in person is read from
// the JWT and writes to their own lodgings. The worker, with the worker key as its bearer, writes to the admin's.

export interface Caller { owner: string; worker: boolean }

export interface Lookup {
  /** The user id of a signed in session token, else null. */
  userOf(token: string): Promise<string | null>
  /** The one admin's user id, else null. */
  adminId(): Promise<string | null>
}

export const bearer = (header: string | null): string => header?.replace(/^Bearer\s+/i, '').trim() ?? ''

/** The caller and the owner of what it writes, or null when the request carries no session and no worker key. */
export async function callerOf(header: string | null, workerKey: string | undefined, lookup: Lookup): Promise<Caller | null> {
  const token = bearer(header)
  if (!token) return null
  if (workerKey && token === workerKey) {
    const admin = await lookup.adminId()
    return admin ? { owner: admin, worker: true } : null
  }
  const user = await lookup.userOf(token)
  return user ? { owner: user, worker: false } : null
}
