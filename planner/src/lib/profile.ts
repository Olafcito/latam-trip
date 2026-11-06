// The signed in person's profile, one row per person in user_profiles (FEAT-006, task 5.3).
// It holds the same fields the connector's get_profile and update_profile keep, checked the same way as
// profile_errors in latam_trip_mcp/core.py, so a value the planner saves is one the connector accepts.
import { supabase } from './supabase'

export const PROFILE_FIELDS = ['home_airport', 'currency', 'max_hours', 'travel_style', 'rules'] as const
export type ProfileField = (typeof PROFILE_FIELDS)[number]

export type Profile = {
  home_airport: string | null
  currency: string | null
  max_hours: number | null
  travel_style: string | null
  rules: string | null
}

export type ProfilePatch = Partial<Profile>
/** The form's text, one string per field, as the person typed it. */
export type ProfileForm = Record<ProfileField, string>
/** A short reason per bad field, shown on the field itself. */
export type ProfileErrors = Partial<Record<ProfileField, string>>

export const emptyProfile = (): Profile => ({ home_airport: null, currency: null, max_hours: null, travel_style: null, rules: null })

const CODE = /^[A-Z]{3}$/
/** A NUL or a lone surrogate, which the database cannot store. */
function unstorable(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c === 0) return true
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = s.charCodeAt(i + 1)
      if (!(n >= 0xdc00 && n <= 0xdfff)) return true
      i++
    } else if (c >= 0xdc00 && c <= 0xdfff) return true
  }
  return false
}

export const WHY: Record<ProfileField, string> = {
  home_airport: 'Three letters, like CPH',
  currency: 'Three letters, like DKK',
  max_hours: 'Hours above 0',
  travel_style: 'Holds a character that cannot be saved',
  rules: 'Holds a character that cannot be saved',
}
const UNSTORABLE = 'Holds a character that cannot be saved'

/** The bad fields of a patch, by the rules of profile_errors. A null clears a field and is always fine. */
export function profileErrors(patch: Record<string, unknown>): ProfileErrors & { _?: string } {
  const keys = Object.keys(patch)
  if (keys.length === 0) return { _: 'Nothing to save' }
  const unknown = keys.filter((k) => !(PROFILE_FIELDS as readonly string[]).includes(k))
  if (unknown.length) return { _: `Unknown field ${unknown.sort().join(', ')}` }
  const errs: ProfileErrors = {}
  for (const k of keys as ProfileField[]) {
    const v = patch[k]
    if (v === null) continue
    if (k === 'home_airport' || k === 'currency') {
      if (typeof v !== 'string' || !CODE.test(v)) errs[k] = WHY[k]
    } else if (k === 'max_hours') {
      if (typeof v !== 'number' || !Number.isFinite(v) || !(v > 0)) errs[k] = WHY[k]
    } else if (typeof v !== 'string') {
      errs[k] = 'Must be text'
    }
    if (!errs[k] && typeof v === 'string' && unstorable(v)) errs[k] = UNSTORABLE
  }
  return errs
}

/** A profile as the form shows it. An empty field is an empty string. */
export function toForm(p: Profile): ProfileForm {
  return {
    home_airport: p.home_airport ?? '',
    currency: p.currency ?? '',
    max_hours: p.max_hours == null ? '' : String(p.max_hours),
    travel_style: p.travel_style ?? '',
    rules: p.rules ?? '',
  }
}

/** The form read back as values. Codes are upper case, a comma decimal counts, an empty field is null.
 *  Hours that are not a number come back as NaN, so profileErrors marks them. */
export function fromForm(f: ProfileForm): Profile {
  const text = (s: string) => (s.trim() === '' ? null : s.trim())
  const code = (s: string) => (s.trim() === '' ? null : s.trim().toUpperCase())
  const hours = f.max_hours.trim().replace(',', '.')
  return {
    home_airport: code(f.home_airport),
    currency: code(f.currency),
    max_hours: hours === '' ? null : /^\d*\.?\d+$|^\d+\.$/.test(hours) ? Number(hours) : NaN,
    travel_style: text(f.travel_style),
    // Rules keep their line breaks. Only the ends are trimmed.
    rules: text(f.rules),
  }
}

/** Only the fields that differ from what is saved. An empty patch means nothing to save. */
export function changes(saved: Profile, f: ProfileForm): ProfilePatch {
  const next = fromForm(f)
  const out: ProfilePatch = {}
  for (const k of PROFILE_FIELDS) {
    if (saved[k] !== next[k]) (out as Record<string, unknown>)[k] = next[k]
  }
  return out
}

/** The bad fields of the form as it stands, for the marks on the fields. */
export function formErrors(f: ProfileForm): ProfileErrors {
  const all = fromForm(f)
  const { _: _ignored, ...errs } = profileErrors(all as unknown as Record<string, unknown>)
  return errs
}

const pick = (row: Record<string, unknown> | null | undefined): Profile => {
  const p = emptyProfile()
  if (!row) return p
  for (const k of PROFILE_FIELDS) (p as Record<string, unknown>)[k] = row[k] ?? null
  return p
}

const COLUMNS = PROFILE_FIELDS.join(',')

/** The person's profile. With no row every field is empty and `empty` is true.
 *  Row level security keeps the select to the signed in person's own row. */
export async function loadProfile(ownerId: string): Promise<{ profile: Profile; empty: boolean }> {
  if (!supabase) throw new Error('Not connected')
  const { data, error } = await supabase.from('user_profiles').select(COLUMNS).eq('owner_id', ownerId).maybeSingle()
  if (error) throw new Error(error.message)
  return { profile: pick(data as unknown as Record<string, unknown> | null), empty: !data }
}

/** Save the changed fields. A row that exists is patched, a first save upserts the row keyed by owner_id.
 *  A patch the rules refuse is never sent. Gives the profile as stored. */
export async function saveProfile(ownerId: string, patch: ProfilePatch, exists: boolean): Promise<Profile> {
  if (!supabase) throw new Error('Not connected')
  const errs = profileErrors(patch as Record<string, unknown>)
  const bad = Object.values(errs)
  if (bad.length) throw new Error(bad.join(', '))
  const q = exists
    ? supabase.from('user_profiles').update(patch).eq('owner_id', ownerId)
    : supabase.from('user_profiles').upsert({ ...patch, owner_id: ownerId }, { onConflict: 'owner_id' })
  const { data, error } = await q.select(COLUMNS).single()
  if (error) throw new Error(error.message)
  return pick(data as unknown as Record<string, unknown> | null)
}
