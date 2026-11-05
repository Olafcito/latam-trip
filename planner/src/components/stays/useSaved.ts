import { useCallback, useState } from 'react'

// The places marked saved, by their id: the bookmark on a search card and the heart on a place are the same mark.
// Kept in this browser only, as a convenience. A browser that keeps nothing still marks for as long as the page is open.

const KEY = 'latam.saved-places'

function read(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

export function useSaved(): [ReadonlySet<string>, (id: string) => void] {
  const [saved, setSaved] = useState(read)
  const toggle = useCallback((id: string) => {
    setSaved((now) => {
      const next = new Set(now)
      if (!next.delete(id)) next.add(id)
      try {
        localStorage.setItem(KEY, JSON.stringify([...next]))
      } catch {
        // nothing kept, the mark lasts the page
      }
      return next
    })
  }, [])
  return [saved, toggle]
}
