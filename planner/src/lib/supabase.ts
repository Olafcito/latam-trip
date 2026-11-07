import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'

// Everything that reaches Supabase sits behind VITE_SUPABASE_URL (with VITE_SUPABASE_KEY, the
// publishable key). Without them the planner behaves as it did before and this file does nothing.

const env = () => import.meta.env as Record<string, string | undefined>

/** True when the planner is set up to read and save through Supabase. */
export function remoteEnabled(): boolean {
  const e = env()
  return !!e.VITE_SUPABASE_URL && !!e.VITE_SUPABASE_KEY
}

/** The client, or null when the planner runs on files only. */
export const supabase: SupabaseClient | null = remoteEnabled()
  ? createClient(env().VITE_SUPABASE_URL!, env().VITE_SUPABASE_KEY!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null

export interface SessionState {
  /** false while the stored session is still being read */
  ready: boolean
  session: Session | null
}

/** The signed in session. Without a client the app is ready at once and has no session. */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ ready: !supabase, session: null })
  useEffect(() => {
    if (!supabase) return
    let live = true
    void supabase.auth.getSession().then(({ data }) => {
      if (live) setState({ ready: true, session: data.session })
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setState({ ready: true, session }))
    return () => {
      live = false
      data.subscription.unsubscribe()
    }
  }, [])
  return state
}

/** The page's own address without query or hash, and no trailing slash when it is the root. A consent request
 *  (?authorization_id=) and a shared trip (?share=, FEAT-007) are kept, so the link lands where the person was going. */
export function signInRedirect(loc: { origin: string; pathname: string; search?: string } = window.location): string {
  const from = new URLSearchParams(loc.search ?? '')
  const keep = new URLSearchParams()
  const id = from.get('authorization_id')
  if (id) keep.set('authorization_id', id)
  const share = from.get('share')
  if (share && /^[A-Za-z0-9_-]{22,64}$/.test(share)) keep.set('share', share)
  const base = loc.origin + (loc.pathname === '/' ? '' : loc.pathname)
  const query = keep.toString()
  return query ? `${base}${loc.pathname === '/' ? '/' : ''}?${query}` : base
}

/** What came of asking for a link: sent, or a failure with a line to show. */
export type LinkOutcome = { s: 'sent' } | { s: 'error'; message: string }

/** Reads Supabase's answer to a link request. Sign up is open (PROD-009), so a new address gets its link like a person
 *  who has an account. A project with sign up turned off refuses a new address with signup_disabled or otp_disabled,
 *  and that reads as closed to new accounts. */
export function linkOutcome(error: { status?: number; code?: string; message?: string } | null): LinkOutcome {
  if (!error) return { s: 'sent' }
  if (error.code === 'signup_disabled' || error.code === 'otp_disabled') return { s: 'error', message: 'New accounts are closed for now' }
  if (error.status === 429 || error.code === 'over_email_send_rate_limit') return { s: 'error', message: 'Too many links asked for, wait a minute' }
  if (!error.status) return { s: 'error', message: 'Could not reach the sign in' }
  return { s: 'error', message: 'Could not send the link' }
}

/** Sends the sign in link to any address. A new address becomes an account on first use, and a person who has one
 *  signs in the same way, so there is one way in for everyone. */
export async function sendMagicLink(email: string): Promise<LinkOutcome> {
  if (!supabase) return { s: 'error', message: 'Sign in is not set up' }
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: signInRedirect(), shouldCreateUser: true },
    })
    return linkOutcome(error)
  } catch {
    return { s: 'error', message: 'Could not reach the sign in' }
  }
}
