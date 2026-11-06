// Run from the repo root with: npx deno test supabase/functions/stay-rates/
import { bearer, callerOf, type Lookup } from './caller.ts'

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const KEY = 'TEST01-worker-key'

function lookup(users: Record<string, string>, admin: string | null): Lookup & { asked: string[] } {
  const asked: string[] = []
  return {
    asked,
    userOf: (token) => {
      asked.push(token)
      return Promise.resolve(users[token] ?? null)
    },
    adminId: () => Promise.resolve(admin),
  }
}

function equal(got: unknown, want: unknown, what: string): void {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  if (a !== b) throw new Error(`${what}: got ${a}, want ${b}`)
}

Deno.test('a signed in person writes to their own rows', async () => {
  const l = lookup({ 'token-b': B }, A)
  equal(await callerOf('Bearer token-b', KEY, l), { owner: B, worker: false }, 'B')
  equal(await callerOf('bearer  token-b ', KEY, l), { owner: B, worker: false }, 'any case and spacing')
})

Deno.test('the worker key writes to the admin, and is never sent on as a session', async () => {
  const l = lookup({}, A)
  equal(await callerOf(`Bearer ${KEY}`, KEY, l), { owner: A, worker: true }, 'worker')
  equal(l.asked, [], 'the key was not looked up as a session')
  equal(await callerOf(`Bearer ${KEY}`, KEY, lookup({}, null)), null, 'no admin, no worker write')
})

Deno.test('no session and an unknown token are refused', async () => {
  const l = lookup({ 'token-b': B }, A)
  equal(await callerOf(null, KEY, l), null, 'no header')
  equal(await callerOf('Bearer ', KEY, l), null, 'empty bearer')
  equal(await callerOf('Bearer TEST01-unknown', KEY, l), null, 'unknown token')
  equal(await callerOf(`Bearer ${KEY}`, undefined, l), null, 'no worker key set, the key is just an unknown token')
})

Deno.test('bearer strips the scheme', () => {
  equal(bearer('Bearer abc'), 'abc', 'scheme')
  equal(bearer(null), '', 'none')
})
