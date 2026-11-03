import { beforeEach, describe, expect, it, vi } from 'vitest'

// A fake client. Nothing here reaches the real table or bucket, and every value is made up.
const log: { op: string; args: unknown[] }[] = []
let rows: Record<string, { id: string; attachments: unknown[] }> = {}
let nextId = 0

function query(table: string) {
  const q = {
    insert: (values: unknown[], opts: unknown) => {
      log.push({ op: `${table}.insert`, args: [values, opts] })
      return { select: async () => ({ data: (values as object[]).map(() => ({ id: `new-${++nextId}` })), error: null }) }
    },
    upsert: async (value: unknown, opts: unknown) => {
      log.push({ op: `${table}.upsert`, args: [value, opts] })
      return { error: null }
    },
    update: (value: unknown) => ({
      eq: async (_k: string, id: string) => {
        log.push({ op: `${table}.update`, args: [value, id] })
        return { error: null }
      },
    }),
    select: () => ({
      eq: (_k: string, id: string) => ({ maybeSingle: async () => ({ data: rows[id] ?? null, error: null }) }),
    }),
  }
  return q
}

vi.mock('./supabase', () => ({
  supabase: {
    from: (t: string) => query(t),
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _file: unknown, opts: unknown) => {
          log.push({ op: `${bucket}.upload`, args: [path, opts] })
          return { data: { path }, error: null }
        },
        createSignedUrl: async (path: string, seconds: number) => {
          log.push({ op: `${bucket}.sign`, args: [path, seconds] })
          return { data: { signedUrl: `https://example.test/${path}` }, error: null }
        },
      }),
    },
  },
  remoteEnabled: () => true,
}))

import { attachFile, fileProblem, fileUrl, saveBookings } from './bookings'

const file = (name: string, type: string, size: number) => {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

beforeEach(() => {
  log.length = 0
  rows = { b1: { id: 'b1', attachments: [{ path: 'b1/old.pdf', name: 'old.pdf', type: 'application/pdf', size: 3, added_at: 'x' }] } }
  nextId = 0
})

describe('saveBookings', () => {
  it('inserts new rows together with the table defaults and updates a row with an id on its own', async () => {
    const r = await saveBookings([
      { kind: 'flight', reference: 'TEST01', ticket: 'T' },
      { id: 'b1', notes: 'test', created_at: 'x', updated_at: 'y' },
      { kind: 'flight', reference: 'TEST01', ticket: 'T' },
    ])
    expect(r).toEqual({ ok: true, ids: ['new-1', 'b1', 'new-2'] })
    expect(log[0]).toEqual({ op: 'bookings.insert', args: [[{ kind: 'flight', reference: 'TEST01', ticket: 'T' }, { kind: 'flight', reference: 'TEST01', ticket: 'T' }], { defaultToNull: false }] })
    expect(log[1]).toEqual({ op: 'bookings.upsert', args: [{ id: 'b1', notes: 'test' }, { onConflict: 'id', defaultToNull: false }] })
  })
})

describe('attachFile', () => {
  it('refuses a file over 10 MB or of another type before anything is sent', async () => {
    expect(await attachFile('b1', file('ticket.pdf', 'application/pdf', 10 * 1024 * 1024 + 1))).toEqual({ ok: false, message: 'ticket.pdf is over 10 MB, so it cannot be added.' })
    expect(await attachFile('b1', file('notes.txt', 'text/plain', 10))).toEqual({ ok: false, message: 'notes.txt is not a PDF or a photo, so it cannot be added.' })
    expect(log).toEqual([])
  })

  it('takes a photo whose type the browser left out by its extension, and refuses a path in the name', () => {
    expect(fileProblem(file('IMG_0001.HEIC', '', 100))).toBeNull()
    expect(fileProblem(file('a/b.pdf', 'application/pdf', 100))).toBe('The file needs a name like ticket.pdf.')
  })

  it('uploads to bookings/<id>/<name> and adds the entry beside the files already there', async () => {
    const r = await attachFile('b1', file('ticket.pdf', 'application/pdf', 1234))
    expect(r.ok).toBe(true)
    expect(log[0]).toEqual({ op: 'bookings.upload', args: ['b1/ticket.pdf', { contentType: 'application/pdf', upsert: true }] })
    const [{ attachments: files }, id] = log[1].args as [{ attachments: { path: string; size: number }[] }, string]
    expect(id).toBe('b1')
    expect(files.map((f) => [f.path, f.size])).toEqual([['b1/old.pdf', 3], ['b1/ticket.pdf', 1234]])
  })

  it('answers plainly when the booking is gone', async () => {
    expect(await attachFile('nope', file('ticket.pdf', 'application/pdf', 10))).toEqual({ ok: false, message: 'The booking is not there any more.' })
    expect(log).toEqual([])
  })
})

describe('fileUrl', () => {
  it('asks for a signed URL that lasts 10 minutes', async () => {
    expect(await fileUrl('b1/ticket.pdf')).toBe('https://example.test/b1/ticket.pdf')
    expect(log).toEqual([{ op: 'bookings.sign', args: ['b1/ticket.pdf', 600] }])
  })
})
