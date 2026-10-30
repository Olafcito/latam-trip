import { useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent, type PointerEvent } from 'react'

// A popover that a mouse opens by resting on it and a click pins open. A touch or a key only
// pins. It closes on a click outside, on Escape, when the focus moves out of it, or, when only
// hovered, when the mouse leaves. Escape and the close button hand the focus back to the trigger.
// It opens below its trigger, above it when there is more room there, and scrolls in the room it has.

const OPEN_MS = 140
const CLOSE_MS = 180

export function usePop(hover = true) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const id = useId()
  const clear = () => window.clearTimeout(timer.current)
  const later = (fn: () => void, ms: number) => { clear(); timer.current = window.setTimeout(fn, ms) }
  const close = () => { clear(); setOpen(false); setPinned(false) }
  const dismiss = () => { close(); btn.current?.focus() }

  useEffect(() => {
    if (!open) return
    const down = (e: globalThis.PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) close() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss() }
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('keydown', key)
    }
  }, [open])
  useEffect(() => clear, [])
  useLayoutEffect(() => {
    const el = box.current
    // on a phone the panel is a sheet at the bottom of the screen
    if (!open || !el || !wrap.current || getComputedStyle(el).position === 'fixed') return
    const r = wrap.current.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - 12
    const above = r.top - 12
    const up = el.offsetHeight > below && above > below
    el.dataset.up = String(up)
    el.style.setProperty('--room', `${up ? above : below}px`)
  }, [open])

  const mouse = (e: PointerEvent) => e.pointerType === 'mouse'
  return {
    open,
    pinned,
    close,
    dismiss,
    wrap: {
      ref: wrap,
      // a press on nothing focusable blurs to null, and the click outside already handles that
      onBlur: (e: FocusEvent) => { const to = e.relatedTarget as Node | null; if (to && !wrap.current?.contains(to)) close() },
      onPointerEnter: hover ? (e: PointerEvent) => { if (mouse(e) && !pinned) later(() => setOpen(true), OPEN_MS) } : undefined,
      onPointerLeave: hover ? (e: PointerEvent) => { if (mouse(e) && !pinned) later(() => setOpen(false), CLOSE_MS) } : undefined,
    },
    trigger: {
      ref: btn,
      'aria-expanded': open,
      'aria-controls': id,
      onClick: () => {
        clear()
        if (pinned) close()
        else { setPinned(true); setOpen(true) }
      },
    },
    panel: { id, ref: box },
  }
}
