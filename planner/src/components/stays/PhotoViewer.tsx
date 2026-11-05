import { useEffect, useState, type MouseEvent } from 'react'
import { Modal } from '../Modal'
import { Bed, Close, Photos } from '../icons'
import { StripArrows } from './StripArrows'
import { useStrip } from './useStrip'

// Photos large, over the whole screen: the planner's one window, grown from the photo that opened it and shrunk back
// there, with focus going back to it. One photo per width as in the place's strip, so a finger swipes it, and with a
// mouse the arrows at the sides and the arrow keys step it. Escape, the close button or a click beside the photo closes it.

export interface ViewPhoto {
  url: string
  alt: string
}

export function PhotoViewer({ photos, start, label, onClose }: { photos: ViewPhoto[]; start: number; label: string; onClose: () => void }) {
  const s = useStrip(photos.length)
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set())
  // after the window opens, so the strip has its width: straight to the photo that opened it, and the keys to the strip
  useEffect(() => {
    s.go(start, false)
    s.ref.current?.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const many = photos.length > 1
  return (
    <Modal label={label} onClose={onClose} className="phv" bare>
      {(close) => {
        // a click on the dark beside the photo, not on the photo itself
        const beside = (e: MouseEvent) => {
          if (!(e.target instanceof Element) || !e.target.closest('img, .phv-none')) close()
        }
        return (
          <div className="phv-in" onKeyDown={s.onKeyDown}>
            <div ref={s.ref} className="phv-strip" tabIndex={0} role="group" aria-label={label} onScroll={s.onScroll} onScrollEnd={s.onScrollEnd} onClick={beside}>
              {photos.map((p, i) => (
                <div key={p.url} className="phv-slide">
                  {broken.has(p.url) ? (
                    <span className="phv-none" role="img" aria-label={p.alt}><Bed s={40} /></span>
                  ) : (
                    <img src={p.url} alt={p.alt} loading={i === start ? undefined : 'lazy'} decoding="async" referrerPolicy="no-referrer" draggable={false}
                      onError={() => setBroken((b) => new Set(b).add(p.url))} />
                  )}
                </div>
              ))}
            </div>
            {many && <span className="pv-count phv-count" aria-hidden="true"><Photos s={12} />{s.at + 1} / {photos.length}</span>}
            <button type="button" className="pv-round phv-x" aria-label="Close" title="Close" onClick={close}><Close /></button>
            <StripArrows at={s.at} count={photos.length} step={s.step} />
          </div>
        )
      }}
    </Modal>
  )
}
