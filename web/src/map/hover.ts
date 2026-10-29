// Hover lives outside React state: the map sets it on pointer moves and only the tooltip
// subscribes, so hovering never re-renders the panel or the map component.

export type Hover =
  | { kind: 'city'; id: string }
  | { kind: 'route'; cid: string; from: string; to: string }
  | { kind: 'overland'; from: string; to: string; note: string }
  | null

export interface Store<T> {
  get(): T
  set(v: T): void
  subscribe(fn: () => void): () => void
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial
  const subs = new Set<() => void>()
  return {
    get: () => value,
    set(v) {
      if (Object.is(v, value)) return
      value = v
      subs.forEach((fn) => fn())
    },
    subscribe(fn) {
      subs.add(fn)
      return () => subs.delete(fn)
    },
  }
}

export function hoverKey(h: Hover): string {
  if (!h) return ''
  if (h.kind === 'overland') return `o:${h.from}:${h.to}`
  return h.kind === 'city' ? `c:${h.id}` : `r:${h.cid}:${h.from}`
}
