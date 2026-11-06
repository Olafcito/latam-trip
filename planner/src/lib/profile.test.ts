import { beforeEach, describe, expect, it, vi } from 'vitest'

// A fake client. Nothing here reaches the real table, and every value is made up.
const log: { op: string; args: unknown[] }[] = []
let row: Record<string, unknown> | null = null
let fail: string | null = null

function query(table: string) {
  const done = (value: Record<string, unknown>) => ({
    select: (cols: string) => ({
      single: async () => {
        log.push({ op: `${table}.select`, args: [cols] })
        if (fail) return { data: null, error: { message: fail } }
        row = { ...(row ?? {}), ...value }
        return { data: { ...row }, error: null }
      },
    }),
  })
  return {
    select: (cols: string) => ({
      eq: (k: string, v: string) => ({
        maybeSingle: async () => {
          log.push({ op: `${table}.read`, args: [cols, k, v] })
          if (fail) return { data: null, error: { message: fail } }
          return { data: row ? { ...row } : null, error: null }
        },
      }),
    }),
    update: (value: Record<string, unknown>) => ({
      eq: (k: string, v: string) => {
        log.push({ op: `${table}.update`, args: [value, k, v] })
        return done(value)
      },
    }),
    upsert: (value: Record<string, unknown>, opts: unknown) => {
      log.push({ op: `${table}.upsert`, args: [value, opts] })
      return done(value)
    },
  }
}

vi.mock('./supabase', () => ({
  supabase: { from: (t: string) => query(t) },
  remoteEnabled: () => true,
}))

import { changes, emptyProfile, formErrors, fromForm, loadProfile, profileErrors, saveProfile, toForm } from './profile'

const ME = 'owner-test'

beforeEach(() => {
  log.length = 0
  row = null
  fail = null
})

describe('profileErrors', () => {
  it('passes good values and nulls', () => {
    expect(profileErrors({ home_airport: 'CPH', currency: 'DKK', max_hours: 30, travel_style: 'slow', rules: 'no red eyes' })).toEqual({})
    expect(profileErrors({ home_airport: null, currency: null, max_hours: null, travel_style: null, rules: null })).toEqual({})
  })

  it('refuses an empty patch and unknown fields', () => {
    expect(profileErrors({})._).toBeTruthy()
    expect(profileErrors({ owner_id: 'x' })._).toMatch(/owner_id/)
  })

  it('wants three capital letters for codes', () => {
    for (const v of ['cph', 'CP', 'CPHX', 'C1H', 3]) {
      expect(profileErrors({ home_airport: v }).home_airport).toBeTruthy()
      expect(profileErrors({ currency: v }).currency).toBeTruthy()
    }
  })

  it('wants hours above 0, a finite number and not a bool', () => {
    for (const v of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, true, '30']) {
      expect(profileErrors({ max_hours: v }).max_hours).toBeTruthy()
    }
    expect(profileErrors({ max_hours: 0.5 })).toEqual({})
  })

  it('refuses text the database cannot store', () => {
    expect(profileErrors({ rules: 'a\u0000b' }).rules).toBeTruthy()
    expect(profileErrors({ travel_style: 'a\uD800b' }).travel_style).toBeTruthy()
    expect(profileErrors({ travel_style: 'a\uDC00' }).travel_style).toBeTruthy()
    expect(profileErrors({ rules: 'emoji \u{1F30E} is fine' })).toEqual({})
    expect(profileErrors({ rules: 42 }).rules).toBeTruthy()
  })
})

describe('the form', () => {
  it('shows an empty profile as empty fields', () => {
    expect(toForm(emptyProfile())).toEqual({ home_airport: '', currency: '', max_hours: '', travel_style: '', rules: '' })
  })

  it('reads codes in upper case, a comma decimal, and empty as null', () => {
    const p = fromForm({ home_airport: ' cph ', currency: 'dkk', max_hours: '30,5', travel_style: '  ', rules: ' one\ntwo ' })
    expect(p).toEqual({ home_airport: 'CPH', currency: 'DKK', max_hours: 30.5, travel_style: null, rules: 'one\ntwo' })
  })

  it('marks hours that are not a number', () => {
    expect(Number.isNaN(fromForm({ ...toForm(emptyProfile()), max_hours: '30h' }).max_hours)).toBe(true)
    expect(formErrors({ ...toForm(emptyProfile()), max_hours: '30h' }).max_hours).toBeTruthy()
    expect(formErrors({ ...toForm(emptyProfile()), max_hours: '0' }).max_hours).toBeTruthy()
    expect(formErrors(toForm(emptyProfile()))).toEqual({})
  })

  it('keeps only the changed fields, a cleared field as null', () => {
    const saved = { ...emptyProfile(), home_airport: 'CPH', max_hours: 30 }
    expect(changes(saved, toForm(saved))).toEqual({})
    expect(changes(saved, { ...toForm(saved), home_airport: '', currency: 'eur' })).toEqual({ home_airport: null, currency: 'EUR' })
    expect(changes(saved, { ...toForm(saved), max_hours: '30.0' })).toEqual({})
  })
})

describe('loadProfile', () => {
  it('gives an empty profile when there is no row', async () => {
    expect(await loadProfile(ME)).toEqual({ profile: emptyProfile(), empty: true })
    expect(log[0]).toEqual({ op: 'user_profiles.read', args: ['home_airport,currency,max_hours,travel_style,rules', 'owner_id', ME] })
  })

  it('gives the row when there is one', async () => {
    row = { home_airport: 'CPH', currency: 'DKK', max_hours: 30, travel_style: null, rules: 'TEST01' }
    expect(await loadProfile(ME)).toEqual({ profile: { ...row }, empty: false })
  })

  it('throws the read error', async () => {
    fail = 'boom'
    await expect(loadProfile(ME)).rejects.toThrow('boom')
  })
})

describe('saveProfile', () => {
  it('upserts the first save keyed by owner_id', async () => {
    const got = await saveProfile(ME, { home_airport: 'CPH' }, false)
    expect(log[0]).toEqual({ op: 'user_profiles.upsert', args: [{ home_airport: 'CPH', owner_id: ME }, { onConflict: 'owner_id' }] })
    expect(got).toEqual({ ...emptyProfile(), home_airport: 'CPH' })
  })

  it('patches a row that exists and sends only the patch', async () => {
    row = { home_airport: 'CPH', currency: 'DKK', max_hours: 30, travel_style: null, rules: null }
    const got = await saveProfile(ME, { currency: null }, true)
    expect(log[0]).toEqual({ op: 'user_profiles.update', args: [{ currency: null }, 'owner_id', ME] })
    expect(got.currency).toBeNull()
    expect(got.home_airport).toBe('CPH')
  })

  it('never sends a patch the rules refuse', async () => {
    await expect(saveProfile(ME, { currency: 'dk' }, true)).rejects.toThrow()
    expect(log).toEqual([])
  })

  it('throws the write error', async () => {
    fail = 'denied'
    await expect(saveProfile(ME, { currency: 'DKK' }, true)).rejects.toThrow('denied')
  })
})
