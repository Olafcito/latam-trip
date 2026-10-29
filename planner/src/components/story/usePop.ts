import { useEffect, useId, useRef, useState, type PointerEvent } from 'react'

// A popover that a mouse opens by resting on it and a click pins open. A touch or a key only
// pins. It closes on a click outside, on Escape, or, when only hovered, when the mouse leaves.

const OPEN_MS = 140
const CLOSE_MS = 180

export function usePop(hover = true) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const id = useId()
  const clear = () => window.clearTimeout(timer.current)
  const later = (fn: () => void, ms: number) => { clear(); timer.current = window.setTimeout(fn, ms) }
  const close = () => { clear(); setOpen(false); setPinned(false) }

  useEffect(() => {
    if (!open) return
    const down = (e: globalThis.PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) close() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('keydown', key)
    }
  }, [open])
  useEffect(() => clear, [])

  const mouse = (e: PointerEvent) => e.pointerType === 'mouse'
  return {
    open,
    pinned,
    close,
    wrap: {
      ref: wrap,
      onPointerEnter: hover ? (e: PointerEvent) => { if (mouse(e) && !pinned) later(() => setOpen(true), OPEN_MS) } : undefined,
      onPointerLeave: hover ? (e: PointerEvent) => { if (mouse(e) && !pinned) later(() => setOpen(false), CLOSE_MS) } : undefined,
    },
    trigger: {
      'aria-expanded': open,
      'aria-controls': id,
      onClick: () => {
        clear()
        if (pinned) close()
        else { setPinned(true); setOpen(true) }
      },
    },
    panel: { id },
  }
}
