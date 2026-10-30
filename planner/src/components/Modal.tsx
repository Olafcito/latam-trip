import { useCallback, useLayoutEffect, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode, type SyntheticEvent } from 'react'
import { Close } from './icons'

// The one window of the planner, on the native dialog: the page behind goes inert, focus stays in
// it and comes back to what opened it. It grows from what opened it and shrinks back there. The
// close runs the leaving animation first, so every way out is the same path.

interface Props {
  label: string
  onClose: () => void
  className?: string
  /** its content brings its own close button */
  bare?: boolean
  children: (close: () => void) => ReactNode
}

export function Modal({ label, onClose, className, bare, children }: Props) {
  const box = useRef<HTMLDialogElement>(null)
  // a press that started on the backdrop: a text selection dragged out of the window closes nothing
  const pressed = useRef(false)

  useLayoutEffect(() => {
    const d = box.current
    if (!d) return
    const from = document.activeElement as HTMLElement | null
    if (!d.open) d.showModal()
    d.focus({ preventScroll: true })
    if (from && from !== document.body) {
      const a = from.getBoundingClientRect()
      const b = d.getBoundingClientRect()
      d.style.transformOrigin = `${a.left + a.width / 2 - b.left}px ${a.top + a.height / 2 - b.top}px`
    }
    return () => {
      d.close()
      if (from?.isConnected && from !== document.body) from.focus({ preventScroll: true })
    }
  }, [])

  const close = useCallback(() => {
    const d = box.current
    if (!d || d.dataset.closing) return
    d.dataset.closing = 'true'
    Promise.allSettled(d.getAnimations().map((a) => a.finished)).then(onClose)
  }, [onClose])

  const onCancel = (e: SyntheticEvent) => {
    e.preventDefault()
    close()
  }
  // the listeners on document, of the gallery and a popover, stay out of it
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    e.preventDefault()
    close()
  }
  const onPointerDown = (e: PointerEvent) => {
    pressed.current = e.target === e.currentTarget
  }
  const onClick = (e: MouseEvent) => {
    if (pressed.current && e.target === e.currentTarget) close()
  }

  return (
    <dialog ref={box} className={`md${className ? ` ${className}` : ''}`} aria-label={label} tabIndex={-1} onCancel={onCancel} onKeyDown={onKeyDown} onPointerDown={onPointerDown} onClick={onClick}>
      <div className="md-in">
        {!bare && <button type="button" className="md-x" aria-label="Close" onClick={close}><Close /></button>}
        {children(close)}
      </div>
    </dialog>
  )
}
