// The built files of the project (spec 6.3). Show what the browser holds at once, then check whether it is still current.
//
// meta.json lists every file with its content hash. A file is kept in the Cache API under its hash, so a cached open needs no
// network, an empty cache is fine, and a build that changes one file downloads one file. Nothing here is the only copy of
// anything: wiping the cache loses nothing.

export interface FileCache {
  match(url: string): Promise<Response | undefined>
  put(url: string, res: Response): Promise<void>
}

export interface Keep {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface FilesOptions {
  /** the bucket URL up to and including the folder that holds data/web, ending in a slash */
  base: string
  fetch?: typeof fetch
  cache?: FileCache | null
  keep?: Keep | null
}

export interface BuildMeta {
  built_at?: string | null
  last_checked?: Record<string, string | null>
  files?: Record<string, string>
  [key: string]: unknown
}

const META_KEY = 'latam-files.meta'
const WEB = 'data/web/'

/** The VITE_DATA_BASE flag. Unset, the apps read the repo as they did before. */
export function dataBase(): string | null {
  const raw = (import.meta.env.VITE_DATA_BASE as string | undefined)?.trim()
  return raw ? raw.replace(/\/?$/, '/') : null
}

function memoryCache(): FileCache {
  const held = new Map<string, Response>()
  return {
    match: async (url) => held.get(url)?.clone(),
    put: async (url, res) => void held.set(url, res.clone()),
  }
}

async function browserCache(): Promise<FileCache | null> {
  try {
    if (typeof caches === 'undefined') return null
    const c = await caches.open('latam-files-v1')
    return { match: async (url) => c.match(url), put: (url, res) => c.put(url, res) }
  } catch {
    return null
  }
}

function browserKeep(): Keep | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export interface Files {
  /** one file of data/web, parsed. From the cache when it is held, else downloaded and kept */
  getFile<T>(name: string): Promise<T>
  /** fetches meta.json uncached, downloads the files whose hash changed and returns their names */
  refresh(): Promise<string[]>
  /** the meta.json last read, or null */
  meta(): BuildMeta | null
  /** called with the changed names after a refresh that changed something */
  onChange(cb: (names: string[]) => void): () => void
}

export function createFiles(opts: FilesOptions): Files {
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  const keep = opts.keep === undefined ? browserKeep() : opts.keep
  let cachePromise: Promise<FileCache> | null = null
  const cache = () =>
    (cachePromise ??= (opts.cache === undefined ? browserCache() : Promise.resolve(opts.cache)).then((c) => c ?? memoryCache()))
  const listeners = new Set<(names: string[]) => void>()
  let meta: BuildMeta | null = null
  const parsed = new Map<string, unknown>()

  const readKept = (): BuildMeta | null => {
    try {
      const raw = keep?.getItem(META_KEY)
      const m = raw ? (JSON.parse(raw) as BuildMeta) : null
      return m && typeof m.files === 'object' && m.files !== null ? m : null
    } catch {
      return null
    }
  }
  const writeKept = (m: BuildMeta) => {
    try {
      keep?.setItem(META_KEY, JSON.stringify(m))
    } catch {
      // storage blocked: the next open reads meta.json again
    }
  }

  const hashUrl = (hash: string, name: string) => `${opts.base}by-hash/${hash}-${name}`

  async function download(name: string, hash: string): Promise<string> {
    // the copy under its hash is the one the CDN may keep for good. The plain path is the fallback while a copy is new or gone
    let res = await doFetch(hashUrl(hash, name))
    if (!res.ok) res = await doFetch(opts.base + WEB + name, { cache: 'no-store' })
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
    const text = await res.text()
    await (await cache()).put(hashUrl(hash, name), new Response(text, { headers: { 'Content-Type': 'application/json' } }))
    return text
  }

  async function fetchMeta(): Promise<BuildMeta> {
    const res = await doFetch(opts.base + WEB + 'meta.json', { cache: 'no-store' })
    if (!res.ok) throw new Error(`meta.json: HTTP ${res.status}`)
    const m = (await res.json()) as BuildMeta
    if (!m || typeof m.files !== 'object' || m.files === null) throw new Error('meta.json: no files')
    return m
  }

  meta = readKept()

  async function getFile<T>(name: string): Promise<T> {
    if (name === 'meta.json') {
      if (!meta) {
        meta = await fetchMeta()
        writeKept(meta)
      }
      return meta as T
    }
    if (parsed.has(name)) return parsed.get(name) as T
    if (!meta) {
      meta = await fetchMeta()
      writeKept(meta)
    }
    let hash = meta.files?.[name]
    if (!hash) {
      // a file the last meta does not list: read the latest list once before giving up
      meta = await fetchMeta()
      writeKept(meta)
      hash = meta.files?.[name]
      if (!hash) throw new Error(`${name}: not in the build`)
    }
    const held = await (await cache()).match(hashUrl(hash, name))
    const text = held ? await held.text() : await download(name, hash)
    const value = JSON.parse(text) as T
    parsed.set(name, value)
    return value
  }

  async function refresh(): Promise<string[]> {
    let next: BuildMeta
    try {
      next = await fetchMeta()
    } catch {
      return [] // the old files stay in use
    }
    const old = meta?.files ?? {}
    const changed: string[] = []
    const failed: string[] = []
    for (const [name, hash] of Object.entries(next.files ?? {})) {
      if (old[name] === hash) continue
      // only files the app has read are worth downloading now, the others come when they are asked for
      const held = await (await cache()).match(hashUrl(hash, name))
      try {
        if (!held && (parsed.has(name) || old[name] !== undefined)) await download(name, hash)
        changed.push(name)
      } catch {
        failed.push(name)
      }
    }
    // a file that failed keeps its old hash, so the next refresh tries it again and the old copy keeps serving
    const files = { ...(next.files ?? {}) }
    for (const name of failed) if (old[name] !== undefined) files[name] = old[name]
    meta = { ...next, files }
    writeKept(meta)
    for (const name of changed) parsed.delete(name)
    if (changed.length) for (const cb of listeners) cb(changed)
    return changed
  }

  return {
    getFile,
    refresh,
    meta: () => meta,
    onChange(cb) {
      listeners.add(cb)
      return () => void listeners.delete(cb)
    },
  }
}

let shared: Files | null = null

/** The one instance of the app, or null when VITE_DATA_BASE is not set. */
export function files(): Files | null {
  const base = dataBase()
  if (!base) return null
  return (shared ??= createFiles({ base }))
}
