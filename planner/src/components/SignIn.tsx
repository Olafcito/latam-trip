import { useState, type FormEvent } from 'react'
import { sendMagicLink } from '../lib/supabase'
import { Check, External } from './icons'

/** An address of a plausible shape: something, an at, a domain with a dot. The server has the last word. */
export const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim())

/** The inbox to open for an address, when it is one we can link to. */
export function inboxOf(email: string): { name: string; url: string } | null {
  const d = email.trim().toLowerCase().split('@')[1] ?? ''
  if (d === 'gmail.com' || d === 'googlemail.com') return { name: 'Gmail', url: 'https://mail.google.com' }
  if (/^(outlook|hotmail|live)\./.test(d)) return { name: 'Outlook', url: 'https://outlook.live.com/mail' }
  if (d === 'icloud.com' || d === 'me.com') return { name: 'iCloud Mail', url: 'https://www.icloud.com/mail' }
  return null
}

/** The one screen of a planner that saves to Supabase and has no session: the address, then the link. */
export function SignIn() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const ok = looksLikeEmail(email)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!ok || busy) return
    setBusy(true)
    setError(null)
    const err = await sendMagicLink(email.trim())
    setBusy(false)
    if (err) setError(err)
    else setSent(true)
  }

  const inbox = inboxOf(email)

  return (
    <div className="app si-page">
      <main className="si">
        <div className="si-card">
          <div className="si-mark" aria-hidden><span>LatAm</span></div>
          <h1 className="si-title">LatAm planner</h1>
          <p className="si-when">Dec 2026 to Feb 2027</p>
          {sent ? (
            <div className="si-sent" role="status">
              <span className="si-ok" aria-hidden><Check s={18} /></span>
              <p className="si-sent-t">Link sent to</p>
              <p className="si-addr">{email.trim()}</p>
              <p className="si-hint">Open it in this browser.</p>
              {inbox && (
                <a className="btn primary si-go" href={inbox.url} target="_blank" rel="noreferrer">
                  Open {inbox.name}<External s={12} />
                </a>
              )}
              <button type="button" className="btn link si-again" onClick={() => { setSent(false); setError(null) }}>Use another address</button>
            </div>
          ) : (
            <form className="si-form" onSubmit={submit} noValidate>
              <label className="sr" htmlFor="signin-email">Email</label>
              <input
                id="signin-email" className="si-input" type="email" inputMode="email" autoComplete="email"
                autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus required
                placeholder="you@example.com" value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null) }}
                aria-invalid={error ? true : undefined} aria-describedby={error ? 'signin-err' : undefined}
              />
              <button type="submit" className={'btn si-send' + (ok ? ' primary' : '')} aria-disabled={!ok || busy} data-busy={busy || undefined}>
                {busy ? 'Sending' : 'Send me a link'}
              </button>
              {error && <p id="signin-err" className="si-err" role="alert">{error}</p>}
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
