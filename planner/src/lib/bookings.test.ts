import { beforeEach, describe, expect, it, vi } from 'vitest'

// A fake client. Nothing here reaches the real table or bucket, and every value is made up.
// It has no upsert, so a row with an id can only change through update, as on the real table.
const log: { op: string; args: unknown[] }[] = []
let rows: Record<string, { id: string; attachments: unknown[] }> = {}
let nextId = 0
/** runs inside the upload, the moment another writer could add an entry */
let duringUpload: () => void = () => {}

function query(table: string) {
  return {
    insert: (values: unknown[], opts: unknown) => {
      log.push({ op: `${table}.insert`, args: [values, opts] })
      return { select: async () => ({ data: (values as object[]).map(() => ({ id: `new-${++nextId}` })), error: null }) }
    },
    update: (value: Record<string, unknown>) => ({
      eq: (_k: string, id: string) => {
        log.push({ op: `${table}.update`, args: [value, id] })
        const hit = rows[id]
        if (hit) Object.assign(hit, value)
        return Object.assign(Promise.resolve({ error: null }), {
          select: async () => ({ data: hit ? [{ id }] : [], error: null }),
        })
      },
    }),
    select: () => ({
      eq: (_k: string, id: string) => ({
        maybeSingle: async () => ({ data: rows[id] ? structuredClone(rows[id]) : null, error: null }),
      }),
    }),
  }
}

vi.mock('./supabase', () => ({
  supabase: {
    from: (t: string) => query(t),
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _file: unknown, opts: unknown) => {
          log.push({ op: `${bucket}.upload`, args: [path, opts] })
          duringUpload()
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

import { attachFile, cancelBooking, fileProblem, fileType, fileUrl, saveBookings, storageName } from './bookings'

const file = (name: string, type: string, size: number) => {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

const old = { path: 'b1/old.pdf', name: 'old.pdf', type: 'application/pdf', size: 3, added_at: 'x' }

beforeEach(() => {
  log.length = 0
  rows = { b1: { id: 'b1', attachments: [old] } }
  nextId = 0
  duringUpload = () => {}
})

describe('saveBookings', () => {
  it('inserts new rows together with the table defaults and updates a row with an id by its own fields only', async () => {
    const r = await saveBookings([
      { kind: 'flight', reference: 'TEST01', ticket: 'T' },
      { id: 'b1', notes: 'test', created_at: 'x', updated_at: 'y' },
      { kind: 'flight', reference: 'TEST01', ticket: 'T' },
    ])
    expect(r).toEqual({ ok: true, ids: ['new-1', 'b1', 'new-2'] })
    expect(log[0]).toEqual({ op: 'bookings.insert', args: [[{ kind: 'flight', reference: 'TEST01', ticket: 'T' }, { kind: 'flight', reference: 'TEST01', ticket: 'T' }], { defaultToNull: false }] })
    expect(log[1]).toEqual({ op: 'bookings.update', args: [{ notes: 'test' }, 'b1'] })
  })

  it('refuses a row whose id is not in the table', async () => {
    expect(await saveBookings([{ id: 'gone', notes: 'test' }])).toEqual({ ok: false, message: 'The booking is not there any more.' })
  })
})

describe('cancelBooking', () => {
  it('sets the row cancelled and keeps it', async () => {
    expect(await cancelBooking('b1')).toEqual({ ok: true })
    expect(log).toEqual([{ op: 'bookings.update', args: [{ status: 'cancelled' }, 'b1'] }])
    expect(rows.b1).toBeDefined()
  })
})

describe('the file checks', () => {
  it('takes the type from the extension when the browser gives none or one the bucket does not take', () => {
    expect(fileType(file('IMG_0001.HEIC', '', 100))).toBe('image/heic')
    expect(fileType(file('IMG_0001.heic', 'application/octet-stream', 100))).toBe('image/heic')
    expect(fileType(file('scan.png', 'image/png', 100))).toBe('image/png')
    expect(fileProblem(file('IMG_0001.heic', 'application/octet-stream', 100))).toBeNull()
  })

  it('refuses a path in the name', () => {
    expect(fileProblem(file('a/b.pdf', 'application/pdf', 100))).toBe('The file needs a name like ticket.pdf.')
  })

  it('makes a Storage key of plain letters, digits, dots and underscores, keeping the extension', () => {
    expect(storageName('Færge billet Ø-å.pdf')).toBe('Faerge_billet_O_a.pdf')
    expect(storageName('ticket.pdf')).toBe('ticket.pdf')
    expect(storageName('ææ.PDF')).toBe('aeae.PDF')
    expect(storageName('漢字.jpg')).toBe('file.jpg')
  })
})

describe('attachFile', () => {
  it('refuses a file over 10 MB or of another type before anything is sent', async () => {
    expect(await attachFile('b1', file('ticket.pdf', 'application/pdf', 10 * 1024 * 1024 + 1))).toEqual({ ok: false, message: 'ticket.pdf is over 10 MB, so it cannot be added.' })
    expect(await attachFile('b1', file('notes.txt', 'text/plain', 10))).toEqual({ ok: false, message: 'notes.txt is not a PDF or a photo, so it cannot be added.' })
    expect(log).toEqual([])
  })

  it('uploads to bookings/<id>/<name> and adds the entry beside the files already there', async () => {
    const r = await attachFile('b1', file('ticket.pdf', 'application/pdf', 1234))
    expect(r.ok).toBe(true)
    expect(log[0]).toEqual({ op: 'bookings.upload', args: ['b1/ticket.pdf', { contentType: 'application/pdf', upsert: true }] })
    const [{ attachments: files }, id] = log[1].args as [{ attachments: { path: string; size: number }[] }, string]
    expect(id).toBe('b1')
    expect(files.map((f) => [f.path, f.size])).toEqual([['b1/old.pdf', 3], ['b1/ticket.pdf', 1234]])
  })

  it('keys a Danish name safely and keeps the name for display', async () => {
    const r = await attachFile('b1', file('Bådbillet ø.heic', 'application/octet-stream', 50))
    expect(r).toMatchObject({ ok: true, attachment: { path: 'b1/Badbillet_o.heic', name: 'Bådbillet ø.heic', type: 'image/heic', size: 50 } })
    expect(log[0].args[0]).toBe('b1/Badbillet_o.heic')
  })

  it('keeps an entry another writer added while the file was uploading', async () => {
    const theirs = { path: 'b1/theirs.pdf', name: 'theirs.pdf', type: 'application/pdf', size: null, added_at: 'y' }
    duringUpload = () => rows.b1.attachments.push(theirs)
    await attachFile('b1', file('ticket.pdf', 'application/pdf', 10))
    expect((rows.b1.attachments as { path: string }[]).map((a) => a.path)).toEqual(['b1/old.pdf', 'b1/theirs.pdf', 'b1/ticket.pdf'])
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
