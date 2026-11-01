import { useSyncExternalStore } from 'react'

// Counts the builds swapped in while the page stayed open. Readers that hold a copy of a file (the route map,
// the pair prices) load it again when this changes, as spec 6.2 says a finished build shows with no reload.

let rev = 0
const listeners = new Set<() => void>()

/** Forget what was read, and tell every reader to read again. */
export function dataChanged(clear: (() => void)[] = []): void {
  for (const c of clear) c()
  rev++
  for (const l of listeners) l()
}

export function useDataRev(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => void listeners.delete(cb)
    },
    () => rev,
  )
}
