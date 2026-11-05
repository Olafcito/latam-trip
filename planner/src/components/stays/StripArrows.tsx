import { useRef } from 'react'
import { Caret } from '../icons'

/** Back and on over a strip, for a mouse. Each hides at its end, and hands its focus to the other one as it goes. */
export function StripArrows({ at, count, step }: { at: number; count: number; step: (dir: -1 | 1) => number }) {
  const prev = useRef<HTMLButtonElement>(null)
  const next = useRef<HTMLButtonElement>(null)
  if (count < 2) return null
  const press = (dir: -1 | 1) => {
    const to = step(dir)
    if (dir < 0 && to === 0) next.current?.focus({ preventScroll: true })
    if (dir > 0 && to === count - 1) prev.current?.focus({ preventScroll: true })
  }
  return (
    <>
      <button ref={prev} type="button" className="pv-round pv-arr" data-dir="l" data-off={at <= 0 || undefined} aria-hidden={at <= 0 || undefined} tabIndex={at <= 0 ? -1 : undefined}
        aria-label="Previous photo" title="Previous photo" onClick={() => press(-1)}>
        <Caret dir="l" s={18} />
      </button>
      <button ref={next} type="button" className="pv-round pv-arr" data-dir="r" data-off={at >= count - 1 || undefined} aria-hidden={at >= count - 1 || undefined} tabIndex={at >= count - 1 ? -1 : undefined}
        aria-label="Next photo" title="Next photo" onClick={() => press(1)}>
        <Caret dir="r" s={18} />
      </button>
    </>
  )
}
