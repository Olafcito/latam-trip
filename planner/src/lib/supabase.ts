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
 *  (?authorization_id=) is kept, so the link lands on the consent step. */
export function signInRedirect(loc: { origin: string; pathname: string; search?: string } = window.location): string {
  const id = new URLSearchParams(loc.search ?? '').get('authorization_id')
  const base = loc.origin + (loc.pathname === '/' ? '' : loc.pathname)
  return id ? `${base}${loc.pathname === '/' ? '/' : ''}?authorization_id=${encodeURIComponent(id)}` : base
}

/** Sends the magic link. Public sign ups are off, so only the owner's address gets one. */
export async function sendMagicLink(email: string): Promise<string | null> {
  if (!supabase) return 'Sign in is not set up.'
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: signInRedirect(), shouldCreateUser: false },
  })
  return error ? error.message : null
}
