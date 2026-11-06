import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'

// Prototype harness: the itinerary in its current look or the editorial one, behind the prototype skill's picker.
// The choice lives in ?look=, since ?v= already names a trip version. Delete this file when a look is chosen.

export type Look = 'current' | 'editorial'
export const LOOKS: { id: Look; name: string }[] = [
  { id: 'current', name: 'Current' },
  { id: 'editorial', name: 'Editorial' },
]

export const LookContext = createContext<Look>('current')
export const useLook = () => useContext(LookContext)

const fromUrl = (): number => {
  const n = Number(new URLSearchParams(location.search).get('look'))
  return n >= 1 && n <= LOOKS.length ? n - 1 : 0
}

/** The chosen look and a counter that re-mounts it for a replay. */
export function useLookChoice() {
  const [at, setAt] = useState(fromUrl)
  const [run, setRun] = useState(0)
  const choose = useCallback((i: number) => {
    if (i < 0 || i >= LOOKS.length) return
    setAt(i)
    setRun((r) => r + 1)
    const u = new URL(location.href)
    u.searchParams.set('look', String(i + 1))
    history.replaceState(history.state, '', u)
  }, [])
  const replay = useCallback(() => setRun((r) => r + 1), [])
  return { look: LOOKS[at].id, at, run, choose, replay }
}

export function LookPicker({ at, choose, replay }: { at: number; choose: (i: number) => void; replay: () => void }) {
  const nav = useRef<HTMLElement>(null)
  const hi = useRef<HTMLSpanElement>(null)
  const items = useRef<(HTMLButtonElement | null)[]>([])
  const [ready, setReady] = useState(false)

  useLayoutEffect(() => {
    const el = items.current[at]
    if (!el || !hi.current) return
    hi.current.style.width = `${el.offsetWidth}px`
    hi.current.style.transform = `translateX(${el.offsetLeft}px)`
  }, [at])
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(id)
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return
      const n = Number(e.key)
      if (n >= 1 && n <= LOOKS.length) choose(n - 1)
      else if (e.key === 'ArrowRight') choose(Math.min(at + 1, LOOKS.length - 1))
      else if (e.key === 'ArrowLeft') choose(Math.max(at - 1, 0))
      else if (e.key === 'r' || e.key === 'R') replay()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [at, choose, replay])

  return (
    <nav ref={nav} className="proto-picker" aria-label="Prototype variants" data-ready={ready || undefined}>
      <span ref={hi} className="proto-picker-highlight" aria-hidden="true" />
      {LOOKS.map((l, i) => (
        <button
          key={l.id} ref={(el) => { items.current[i] = el }} type="button" className="proto-picker-item"
          data-active={i === at || undefined} aria-current={i === at ? 'true' : undefined} onClick={() => choose(i)}
        >{l.name}</button>
      ))}
      <span className="proto-picker-divider" aria-hidden="true" />
      <button type="button" className="proto-picker-item proto-picker-replay" aria-label="Replay animation (R)" onClick={replay}>↻</button>
    </nav>
  )
}
