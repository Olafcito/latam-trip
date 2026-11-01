// The build that talks to Supabase keeps its browser storage under its own keys. The preview of that build
// shares an origin with the site that still runs on files, so a key both used would let one overwrite the other.
// The Supabase build reads the older key when its own is empty, and never writes, changes or removes the older key.

const env = () => import.meta.env as Record<string, string | undefined>

/** The key this build writes to for a key the file based build also uses. */
export function ownKey(key: string): string {
  const e = env()
  return e.VITE_SUPABASE_URL && e.VITE_SUPABASE_KEY ? key + '.sb' : key
}

/** The value under this build's own key, or else the value the file based build left under the older key. */
export function readOwn(key: string): string | null {
  const own = ownKey(key)
  const v = localStorage.getItem(own)
  return v != null || own === key ? v : localStorage.getItem(key)
}
