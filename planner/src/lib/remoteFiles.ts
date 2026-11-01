import { files as shared, type BuildMeta } from '@map/data/remoteFiles'
import { supabase } from './supabase'

// The built files of the project through the cache (web/src/data/remoteFiles.ts), plus what only the planner has:
// the Realtime feed of derive_state, which says when a build finished and whether the last one failed.

export type { BuildMeta }
export { createFiles, dataBase } from '@map/data/remoteFiles'

/** The row of derive_state that the strip and the refresh read. */
export interface DeriveState {
  last_error: string | null
  last_warning: string | null
  last_finished: string | null
  manifest_hash: string | null
  worker_version: string | null
}

/** One file of data/web, parsed. Needs VITE_DATA_BASE. */
export function getFile<T>(name: string): Promise<T> {
  const f = shared()
  return f ? f.getFile<T>(name) : Promise.reject(new Error('VITE_DATA_BASE is not set'))
}

/** Reads meta.json uncached and downloads the files whose hash changed. Returns their names, none on any failure. */
export function refresh(): Promise<string[]> {
  return shared()?.refresh() ?? Promise.resolve([])
}

export function currentMeta(): BuildMeta | null {
  return shared()?.meta() ?? null
}

/** Called after a refresh changed files, with their names. Returns the way to stop. */
export function onFilesChanged(cb: (names: string[]) => void): () => void {
  return shared()?.onChange(cb) ?? (() => {})
}

export async function loadDeriveState(): Promise<DeriveState | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('derive_state')
    .select('last_error,last_warning,last_finished,manifest_hash,worker_version')
    .eq('id', 1)
    .maybeSingle()
  return error ? null : (data as DeriveState | null)
}

/** Calls cb with the new derive_state on every change. A finished build changes it. Returns the way to stop. */
export function subscribeBuilds(cb: (state: DeriveState) => void): () => void {
  if (!supabase) return () => {}
  const client = supabase
  const channel = client
    .channel('derive-state')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'derive_state' }, (payload) => {
      if (payload.new && typeof payload.new === 'object') cb(payload.new as DeriveState)
    })
    .subscribe()
  return () => {
    void client.removeChannel(channel)
  }
}
