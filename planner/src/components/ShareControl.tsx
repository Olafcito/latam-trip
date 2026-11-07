import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { liveShare, sendLink, shareTrip, shareUrl, stopSharing } from '../lib/shareTrip'
import { Check, Close, Link, Share } from './icons'

// FEAT-007. The owner's control for the link of one stored trip. It reads Share while the trip has no live link and
// Shared while it has one, and a tap sends the link: through the phone's share sheet, else to the clipboard, where the
// control itself turns to Copied for a moment. While the link is live, a cross beside it ends it.

type Phase = 'idle' | 'busy' | 'copied'

export function ShareControl({ id, name }: { id: string; name: string }) {
  const setNotice = useStore((s) => s.setNotice)
  const [token, setToken] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    let live = true
    setToken(null)
    liveShare(id).then((t) => live && setToken(t), () => {})
    return () => {
      live = false
    }
  }, [id])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const send = async () => {
    setPhase('busy')
    const made = token ? { ok: true as const, token } : await shareTrip(id)
    if (!made.ok) {
      setPhase('idle')
      return setNotice(`The trip could not be shared. ${made.message}`)
    }
    setToken(made.token)
    const sent = await sendLink(name, shareUrl(window.location, made.token))
    if (sent === 'failed') setNotice(`The link could not be copied. It is ${shareUrl(window.location, made.token)}`)
    if (sent !== 'copied') return setPhase('idle')
    setPhase('copied')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setPhase('idle'), 2000)
  }

  const stop = async () => {
    setPhase('busy')
    const done = await stopSharing(id)
    setPhase('idle')
    if (!done.ok) return setNotice(`The link could not be stopped. ${done.message ?? ''}`.trim())
    setToken(null)
  }

  const live = token != null
  const label = phase === 'copied' ? 'Copied' : live ? 'Shared' : 'Share'
  return (
    <span className="share" data-live={live || undefined}>
      <button
        type="button"
        className="btn small share-send"
        onClick={send}
        disabled={phase === 'busy'}
        title={live ? 'Send the link again' : 'Share a read only link'}
        data-copied={phase === 'copied' || undefined}
      >
        {phase === 'copied' ? <Check /> : live ? <Link /> : <Share />}
        <span aria-live="polite">{label}</span>
      </button>
      {live && (
        <button type="button" className="btn small share-stop" onClick={stop} disabled={phase === 'busy'} aria-label="Stop sharing" title="Stop sharing">
          <Close />
        </button>
      )}
    </span>
  )
}
