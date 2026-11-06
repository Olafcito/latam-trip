// Run from the repo root with: npx deno test supabase/functions/read-booking/
import { capOf, DEFAULT_CAP, type Session, signedIn, turn } from './gate.ts'

const A = '00000000-0000-4000-8000-00000000000a'

function equal(got: unknown, want: unknown, what: string): void {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  if (a !== b) throw new Error(`${what}: got ${a}, want ${b}`)
}

/** A session whose count works like take_read_booking: one read a call while under the cap. */
function session(user: string | null, used = 0, broken = false): Session & { used: () => number } {
  let reads = used
  return {
    used: () => reads,
    user: () => Promise.resolve(user),
    take: (cap) => {
      if (broken) return Promise.resolve(null)
      if (reads >= cap) return Promise.resolve(false)
      reads++
      return Promise.resolve(true)
    },
  }
}

Deno.test('the cap comes from the secret, 30 when it is unset or not a whole number of at least 1', () => {
  equal(capOf(undefined), DEFAULT_CAP, 'unset')
  equal(DEFAULT_CAP, 30, 'default')
  equal(capOf(''), 30, 'empty')
  equal(capOf(' 12 '), 12, 'set')
  equal(capOf('0'), 30, 'zero')
  equal(capOf('-4'), 30, 'negative')
  equal(capOf('2.5'), 30, 'fraction')
  equal(capOf('many'), 30, 'not a number')
})

Deno.test('a person without a session is refused, a signed in one passes', async () => {
  equal(await signedIn(session(null)), { status: 401, body: { error: 'Sign in to read bookings.' } }, 'no session')
  equal(await signedIn(session(A)), null, 'signed in')
})

Deno.test('reads past the monthly cap answer 429 monthly_cap', async () => {
  const s = session(A, 28)
  equal(await turn(s, 30), null, 'the 29th')
  equal(await turn(s, 30), null, 'the 30th')
  equal(await turn(s, 30), { status: 429, body: { error: 'monthly_cap' } }, 'the 31st')
  equal(s.used(), 30, 'a refused read is not counted')
})

Deno.test('a count that cannot be asked lets no read through', async () => {
  equal((await turn(session(A, 0, true), 30))?.status, 503, 'broken count')
})
