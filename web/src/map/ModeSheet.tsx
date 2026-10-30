// The shell of a mode's panel. On a wide screen a tall panel that folds to a slim bar. On a phone a sheet on three
// detents that follows the finger 1:1, can be caught in flight and carries the throw on. Ported from 21st Drawer 31360.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react'
import { Chevron, Close } from './icons'
import { SPRING_CALM, SPRING_THROWN, TAP_SLOP, THROW, detentOffsets, dragTo, nextDetent, reducedMotion, releaseVelocity, settleOn, springDone, springStep, trimTrail, type Detent, type DetentOffsets, type SpringShape, type TrailPoint } from './sheet'

/** What RouteMap hands a mode's panel for its shell. */
export interface ModeShell {
  narrow: boolean
  collapsed: boolean
  /** A card is open over the panel. */
  cardOpen: boolean
  panelRef: RefObject<HTMLElement | null>
  onCollapse(collapsed: boolean): void
  /** Leaves the mode. */
  onClose(): void
  /** Where the sheet rests, kept when the mode changes under it. */
  detentMemo: RefObject<Detent | null>
  /** How far each list was scrolled, by its name. */
  scrollMemo: Record<string, number>
}

interface ModeSheetProps extends ModeShell {
  title: string
  count: string
  /** Stands between the title and the list, and never scrolls away. */
  bar?: ReactNode
  /** The list's name in scrollMemo. */
  scrollKey: string
  children: ReactNode
}

interface Drag {
  id: number
  from: number
  at: number
  moved: boolean
  /** Caught in flight: the release is a throw or a stop, never a tap. */
  caught: boolean
  onHandle: boolean
  trail: TrailPoint[]
}

const HANDLE_LABEL: Record<Detent, string> = { peek: 'Open the list', half: 'Expand the list', full: 'Shrink the list' }

export function ModeSheet({ title, count, narrow, collapsed, cardOpen, panelRef, onCollapse, onClose, detentMemo, scrollMemo, scrollKey, bar, children }: ModeSheetProps) {
  const body = useRef<HTMLDivElement>(null)
  const [detent, setDetent] = useState<Detent>(() => (collapsed ? 'peek' : detentMemo.current === 'full' ? 'full' : 'half'))
  const rest = useRef(detent)
  const spot = useRef(0) // where the sheet is on screen this frame, the value every motion starts from
  const speed = useRef(0)
  const frame = useRef(0)
  const offsets = useRef<DetentOffsets>({ full: 0, half: 0, peek: 0 })
  const keyEl = useRef<HTMLElement | null>(null)
  const drag = useRef<Drag | null>(null)
  const skipClick = useRef(false)
  const latest = useRef({ collapsed, onCollapse })
  useLayoutEffect(() => {
    latest.current = { collapsed, onCollapse }
  })

  const measure = useCallback(() => {
    const el = panelRef.current
    const root = el?.closest<HTMLElement>('.rmap')
    if (!el || !root) return false
    offsets.current = detentOffsets(el.offsetHeight, root.clientHeight, parseFloat(getComputedStyle(el).paddingBottom) || 0)
    keyEl.current = root.querySelector<HTMLElement>('.ctl-bottom')
    return true
  }, [panelRef])

  /** Only ever a transform, set right on the element, so a drag costs no layout. The key rides on the sheet below half. */
  const place = useCallback(
    (y: number) => {
      spot.current = y
      const el = panelRef.current
      if (el) el.style.transform = `translate3d(0, ${y}px, 0)`
      if (keyEl.current) keyEl.current.style.transform = `translateY(${Math.max(0, y - offsets.current.half)}px)`
    },
    [panelRef],
  )

  /** Once it rests: the part of the sheet below the screen must not hide the last rows. */
  const settled = useCallback(
    (y: number) => {
      place(y)
      speed.current = 0
      detentMemo.current = rest.current
      if (body.current) body.current.style.paddingBottom = `${y + 8}px`
    },
    [place, detentMemo],
  )

  const glide = useCallback(
    (to: Detent, velocity: number, shape: SpringShape) => {
      cancelAnimationFrame(frame.current)
      frame.current = 0
      const target = offsets.current[to]
      if (reducedMotion()) return settled(target)
      let s = { x: spot.current, v: velocity }
      let last = performance.now()
      const tick = (now: number) => {
        s = springStep(s, target, Math.min(now - last, 34) / 1000, shape)
        last = now
        speed.current = s.v
        if (springDone(s, target)) {
          frame.current = 0
          return settled(target)
        }
        place(s.x)
        frame.current = requestAnimationFrame(tick)
      }
      frame.current = requestAnimationFrame(tick)
    },
    [place, settled],
  )

  const land = useCallback(
    (to: Detent, velocity: number, shape: SpringShape) => {
      rest.current = to
      setDetent(to)
      const fold = to === 'peek'
      if (latest.current.collapsed !== fold) latest.current.onCollapse(fold)
      glide(to, velocity, shape)
    },
    [glide],
  )

  useLayoutEffect(() => {
    if (!narrow || !measure()) return
    const el = panelRef.current!
    const scroller = body.current
    if (detentMemo.current || reducedMotion()) {
      settled(offsets.current[rest.current])
    } else {
      place(el.offsetHeight)
      glide(rest.current, 0, SPRING_CALM)
    }
    const sizes = new ResizeObserver(() => {
      if (!measure() || drag.current) return
      if (frame.current) glide(rest.current, speed.current, SPRING_CALM)
      else settled(offsets.current[rest.current])
    })
    sizes.observe(el)
    return () => {
      sizes.disconnect()
      cancelAnimationFrame(frame.current)
      frame.current = 0
      el.style.transform = ''
      if (keyEl.current) keyEl.current.style.transform = ''
      if (scroller) scroller.style.paddingBottom = ''
    }
  }, [narrow, measure, place, settled, glide, panelRef, detentMemo])

  // the panel can fold from outside it: a new mode opens it again
  useEffect(() => {
    if (!narrow) return
    if (collapsed && rest.current !== 'peek') land('peek', speed.current, SPRING_CALM)
    else if (!collapsed && rest.current === 'peek') land('half', speed.current, SPRING_CALM)
  }, [narrow, collapsed, land])

  // Show on map folds the card to a bar, and a full sheet would still hide the map under it
  useEffect(() => {
    if (narrow && cardOpen && rest.current === 'full') land('half', 0, SPRING_CALM)
  }, [narrow, cardOpen, land])

  useLayoutEffect(() => {
    if (body.current) body.current.scrollTop = scrollMemo[scrollKey] ?? 0
  }, [scrollKey, scrollMemo, collapsed, narrow])

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current || !e.isPrimary || e.button !== 0) return
    const target = e.target as Element
    if (target.closest('a, input, button:not(.msheet-handle)')) return
    const caught = frame.current !== 0
    cancelAnimationFrame(frame.current)
    frame.current = 0
    speed.current = 0
    target.setPointerCapture(e.pointerId)
    skipClick.current = false
    drag.current = { id: e.pointerId, from: e.clientY, at: spot.current, moved: false, caught, onHandle: !!target.closest('.msheet-handle'), trail: [{ t: e.timeStamp, y: e.clientY }] }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    const { full, peek } = offsets.current
    d.moved ||= Math.abs(e.clientY - d.from) >= TAP_SLOP
    d.trail = trimTrail([...d.trail, { t: e.timeStamp, y: e.clientY }], e.timeStamp)
    place(dragTo(d.at + e.clientY - d.from, full, peek, Math.max(peek, 1)))
  }

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    drag.current = null
    const tap = !d.moved && !d.caught
    skipClick.current = !tap
    if (tap) {
      // the handle's click takes it from here
      if (!d.onHandle && rest.current === 'peek') land('half', 0, SPRING_CALM)
      else glide(rest.current, 0, SPRING_CALM)
      return
    }
    const { full, peek } = offsets.current
    const velocity = releaseVelocity(d.trail, e.timeStamp)
    const inside = spot.current >= full && spot.current <= peek
    land(settleOn(offsets.current, spot.current, velocity), inside ? velocity : 0, Math.abs(velocity) >= THROW ? SPRING_THROWN : SPRING_CALM)
  }

  const onPointerCancel = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return
    drag.current = null
    land(settleOn(offsets.current, spot.current, 0), 0, SPRING_CALM)
  }

  const onHandleClick = () => {
    if (skipClick.current) skipClick.current = false
    else land(nextDetent(rest.current, 'tap'), speed.current, SPRING_CALM)
  }

  const onHandleKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    land(nextDetent(rest.current, e.key === 'ArrowUp' ? 'up' : 'down'), speed.current, SPRING_CALM)
  }

  const grip = narrow ? { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } : undefined

  return (
    <section ref={panelRef} className={`panel mode${collapsed ? ' collapsed' : ''}`} aria-label={title}>
      {!narrow && collapsed ? (
        <div className="pslim">
          <span className="pslim-name">{title}</span>
          <button className="x sm" aria-label="Expand panel" onClick={() => onCollapse(false)}><Chevron up={false} /></button>
          <button className="x sm" aria-label="Close" onClick={onClose}><Close /></button>
        </div>
      ) : (
        <>
          <div className="msheet-grip" {...grip}>
            {narrow && (
              <button type="button" className="msheet-handle" aria-label={HANDLE_LABEL[detent]} aria-expanded={detent !== 'peek'} onClick={onHandleClick} onKeyDown={onHandleKey}>
                <span />
              </button>
            )}
            <div className="mhead">
              <div className="mhead-t">
                <h2 className="pname">{title}</h2>
                <p className="mcount" aria-live="polite">{count}</p>
              </div>
              <div className="hbtns">
                {!narrow && <button className="x" aria-label="Collapse panel" onClick={() => onCollapse(true)}><Chevron up /></button>}
                <button className="x" aria-label="Close" onClick={onClose}><Close /></button>
              </div>
            </div>
          </div>
          {bar && <div className="mbar">{bar}</div>}
          <div ref={body} className="mscroll" onScroll={(e) => { scrollMemo[scrollKey] = e.currentTarget.scrollTop }}>
            {children}
          </div>
        </>
      )}
    </section>
  )
}
