import { useState, type FormEvent } from 'react'
import { sendMagicLink } from '../lib/supabase'

/** The one screen of a planner that saves to Supabase and has no session: ask for the owner's address, send the link. */
export function SignIn() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const err = await sendMagicLink(email)
    setBusy(false)
    if (err) setError(err)
    else setSent(true)
  }

  return (
    <div className="app">
      <main className="main">
        <form className="card load-err" onSubmit={submit}>
          <p className="load-err-t" style={{ color: 'var(--text)' }}>Sign in</p>
          {sent ? (
            <p role="status">The link is on its way to {email}. Open it in this browser.</p>
          ) : (
            <>
              <label className="small muted" htmlFor="signin-email">Email</label>
              <input
                id="signin-email" type="email" autoComplete="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ font: 'inherit', fontSize: 16, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--surface-2)', color: 'var(--text)' }}
              />
              <button type="submit" className="btn primary" disabled={busy || !email.trim()}>{busy ? 'Sending' : 'Send the link'}</button>
              {error && <p className="small" role="alert" style={{ color: 'var(--err)' }}>{error}</p>}
            </>
          )}
        </form>
      </main>
    </div>
  )
}
