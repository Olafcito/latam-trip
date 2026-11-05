import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { clampPhoto, keyStep, photoAt, stepPhoto } from '../../lib/photoStrip'

// A strip of photos that snaps one per width: a finger swipes it, the arrows and the arrow keys step it. A step is
// shown at once in the count and the arrows, while the scroll still runs, and a swipe that takes over wins.

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function useStrip(count: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(0)
  // the photo a step is scrolling to, until the scroll lands there
  const want = useRef<number | null>(null)
  const frame = useRef(0)
  const timer = useRef(0)
  useEffect(() => () => {
    cancelAnimationFrame(frame.current)
    window.clearTimeout(timer.current)
  }, [])

  const read = () => {
    const el = ref.current
    return el ? photoAt(el.scrollLeft, el.clientWidth, count) : 0
  }
  const settle = () => {
    want.current = null
    setAt(read())
  }
  const onScroll = () => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const i = read()
      if (want.current !== null && want.current !== i) return
      want.current = null
      setAt(i)
    })
  }

  /** Scrolls to a photo, gliding unless asked not to or reduced motion is set, and returns where it goes. */
  const go = (i: number, glide = true) => {
    const to = clampPhoto(i, count)
    const el = ref.current
    if (!el) return to
    want.current = to
    setAt(to)
    el.scrollTo({ left: to * el.clientWidth, behavior: glide && !reduced() ? 'smooth' : 'instant' })
    // a browser without scrollend, or a swipe that took over the glide, still lands on what is in view
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(settle, 700)
    return to
  }
  const step = (dir: -1 | 1) => go(stepPhoto(want.current ?? at, dir, count))

  /** Left and right step the strip. Returns the photo stepped to, or null for any other key. */
  const onKeyDown = (e: KeyboardEvent): number | null => {
    const dir = keyStep(e.key)
    if (dir === null || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null
    e.preventDefault()
    e.stopPropagation()
    return step(dir)
  }

  return { ref, at, go, step, onScroll, onScrollEnd: settle, onKeyDown }
}
