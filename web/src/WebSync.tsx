import { useEffect, useRef, useState, type FormEvent } from 'react'
import { remoteEnabled, sendMagicLink, useSession, webTripDeps } from './data/supabase'
import { readTrips, type TripState } from './data/trips'
import { pushWebTrips, syncWebTrips } from './data/webTrips'

/**
 * Keeps the trips of this app in the web_trips row when Supabase is set up and the owner is signed in.
 * The stored row replaces what the browser holds on open, then every edit is written (last write wins).
 */
export function useWebTrips(trips: TripState, setTrips: (t: TripState) => void) {
  const { ready, session } = useSession()
  const [live, setLive] = useState(false)
  const last = useRef('')
  const userId = session?.user.id ?? null

  useEffect(() => {
    if (!remoteEnabled() || !ready || !userId) return
    let stop = false
    syncWebTrips(webTripDeps(), readTrips()).then(
      (r) => {
        if (stop) return
        if (r.stored) {
          last.current = JSON.stringify(r.stored)
          setTrips(r.stored)
        }
        setLive(r.live)
      },
      () => {},
    )
    return () => {
      stop = true
    }
  }, [ready, userId, setTrips])

  useEffect(() => {
    if (!live) return
    const text = JSON.stringify(trips)
    if (text === last.current) return
    const timer = setTimeout(() => {
      last.current = text
      void pushWebTrips(webTripDeps(), trips).catch(() => {
        last.current = ''
      })
    }, 600)
    return () => clearTimeout(timer)
  }, [trips, live])

  return { showSignIn: remoteEnabled() && ready && !userId }
}

/** One line under the bar: ask for the owner's address and send the link. Shown only while signed out. */
export function SignInStrip() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const err = await sendMagicLink(email)
    if (err) setError(err)
    else setSent(true)
  }
  return (
    <form className="signin" onSubmit={submit}>
      {sent ? (
        <span role="status">The link is on its way to {email}. Open it in this browser.</span>
      ) : (
        <>
          <label htmlFor="web-signin">Sign in to keep your trips on every device</label>
          <input id="web-signin" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="submit" disabled={!email.trim()}>Send the link</button>
          {error && <span role="alert">{error}</span>}
        </>
      )}
    </form>
  )
}
