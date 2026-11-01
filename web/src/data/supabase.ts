import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import type { WebTripDeps } from './webTrips'

// The web app saves its trips to Supabase when VITE_SUPABASE_URL and VITE_SUPABASE_KEY (the publishable key) are set.
// Without them it keeps the trips in this browser, as it always did. It has its own origin, so its own sign in.

const env = () => import.meta.env as Record<string, string | undefined>

export function remoteEnabled(): boolean {
  const e = env()
  return !!e.VITE_SUPABASE_URL && !!e.VITE_SUPABASE_KEY
}

export const supabase: SupabaseClient | null = remoteEnabled()
  ? createClient(env().VITE_SUPABASE_URL!, env().VITE_SUPABASE_KEY!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null

export function projectRef(): string {
  try {
    return new URL(env().VITE_SUPABASE_URL ?? '').hostname.split('.')[0]
  } catch {
    return ''
  }
}

export interface SessionState {
  ready: boolean
  session: Session | null
}

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

/** Sends the magic link. Public sign ups are off, so only the owner's address gets one. */
export async function sendMagicLink(email: string): Promise<string | null> {
  if (!supabase) return 'Sign in is not set up.'
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: window.location.origin + window.location.pathname, shouldCreateUser: false },
  })
  return error ? error.message : null
}

async function readDoc(name: string): Promise<unknown> {
  if (!supabase) return null
  const { data, error } = await supabase.from('documents').select('data').eq('name', name).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? (data as { data: unknown }).data : null
}

async function writeDoc(name: string, data: unknown): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('documents').upsert({ name, data, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
}

export function webTripDeps(): WebTripDeps {
  return {
    storage: localStorage,
    projectRef: projectRef(),
    cutoverDone: async () => (await readDoc('cutover_done')) != null,
    readDoc,
    writeDoc,
  }
}
