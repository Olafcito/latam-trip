import { useEffect, useId, useRef, useState } from 'react'
import { loadVersions } from '../lib/remoteTrips'
import { rowToJourney } from '../lib/repoTrips'
import { remoteEnabled } from '../lib/supabase'
import { savedWhen, versionEntries, type VersionEntry } from '../lib/versions'
import { useStore } from '../store'

// The version tag as a quiet control. It lists the stored versions of a trip, newest first, and opens the one picked
// in the normal trip view. While an older version is open it reads "version 3 of 6" with a way back to the latest.
// Only a trip with more than one stored version has it, and only with Supabase.

export function VersionMenu({ id, version }: { id: string; version: number }) {
  const viewing = useStore((s) => (s.viewing?.id === id ? s.viewing : null))
  const stored = useStore((s) => s.rows[id]?.version)
  const latest = viewing?.latest ?? stored ?? version
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<VersionEntry[] | 'error' | null>(null)
  const wrap = useRef<HTMLSpanElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    let live = true
    setEntries(null)
    loadVersions(id).then(
      (rows) => live && setEntries(versionEntries(rows)),
      () => live && setEntries('error'),
    )
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      live = false
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open, id])

  if (!remoteEnabled() || latest < 2) return null

  const goLatest = () => {
    const s = useStore.getState()
    if (s.viewing?.id === id) return s.backToLatest()
    const row = s.rows[id]
    if (row) s.openTrip(rowToJourney(row))
  }
  const pick = (e: VersionEntry) => {
    setOpen(false)
    if (e.latest) goLatest()
    else useStore.getState().openVersion(e.row, latest)
  }
  const shown = viewing?.version ?? version

  return (
    <span className="vers" ref={wrap}>
      <button
        type="button"
        className="tag vers-btn"
        aria-expanded={open}
        aria-controls={listId}
        title="Older versions of this trip"
        aria-label={viewing ? `Version ${shown} of ${latest}, other versions` : `Version ${shown}, other versions`}
        onClick={() => setOpen((o) => !o)}
      >
        {viewing ? `version ${shown} of ${latest}` : `version ${shown}`}
      </button>
      {viewing && <button type="button" className="vers-back" onClick={goLatest}>Latest</button>}
      <div id={listId} className="vers-pop" role="group" aria-label="Versions of this trip" data-open={open || undefined}>
        {entries === null && <p className="vers-note">Reading the versions</p>}
        {entries === 'error' && <p className="vers-note">The versions could not be read.</p>}
        {Array.isArray(entries) && (
          <ul className="vers-list">
            {entries.map((e) => (
              <li key={e.version}>
                <button type="button" className="vers-item" aria-current={e.version === shown ? 'true' : undefined} onClick={() => pick(e)}>
                  <span className="vers-n">v{e.version}</span>
                  <span className="vers-when">{savedWhen(e.savedAt)}</span>
                  <span className="vers-by">{e.by}</span>
                  {e.title && <span className="vers-title">{e.title}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </span>
  )
}
