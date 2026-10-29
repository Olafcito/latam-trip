import { useLayoutEffect, useRef } from 'react'

/**
 * Marks a row that scrolls sideways with data-prev and data-next, so the CSS can fade the side
 * with more behind it (the ReUI stepper's edge fade), and lets the keyboard scroll it.
 */
export function useEdgeFade<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const over = el.scrollWidth - el.clientWidth > 1
      el.toggleAttribute('data-prev', over && el.scrollLeft > 1)
      el.toggleAttribute('data-next', over && el.scrollLeft < el.scrollWidth - el.clientWidth - 1)
      if (over) el.tabIndex = 0
      else el.removeAttribute('tabindex')
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    el.addEventListener('scroll', update, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', update)
    }
  }, [])
  return ref
}
