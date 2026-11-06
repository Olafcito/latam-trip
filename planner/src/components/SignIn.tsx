import { useState, type FormEvent } from 'react'
import { sendMagicLink } from '../lib/supabase'
import { AppMark } from './Consent'
import { Mail, Ticket } from './icons'

type View = { s: 'ask'; error?: string } | { s: 'busy' } | { s: 'sent' } | { s: 'invite' }

/** The one screen of a planner that saves to Supabase and has no session. Anyone gives an address and gets a sign in
 * link. A person with an account signs in with it, a new address with an open invite makes its account with it, and
 * any other address lands on the invite state. The answer sits on the address itself, so the screen says what came of
 * it with the address as its title and one line under it. */
export function SignIn() {
  const [email, setEmail] = useState('')
  const [view, setView] = useState<View>({ s: 'ask' })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || view.s === 'busy') return
    setView({ s: 'busy' })
    const r = await sendMagicLink(email)
    setView(r.s === 'error' ? { s: 'ask', error: r.message } : r)
  }

  const again = () => setView({ s: 'ask' })
  const asking = view.s === 'ask' || view.s === 'busy'
  const error = view.s === 'ask' ? view.error : undefined

  return (
    <div className="app">
      <main className="main consent-main">
        <section className="card consent signin" aria-live="polite">
          {asking ? (
            <form key="ask" className="signin-step" onSubmit={submit}>
              <header className="consent-head">
                <AppMark s={52} className="signin-mark" />
                <h1 className="consent-client">Latam trip</h1>
              </header>
              <div className="signin-fields">
                <label className="vh" htmlFor="signin-email">Email</label>
                <div className={`signin-field${error ? ' bad' : ''}`}>
                  <Mail s={16} />
                  <input
                    id="signin-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none"
                    autoCorrect="off" spellCheck={false} enterKeyHint="send" placeholder="Email" required autoFocus
                    value={email} onChange={(e) => setEmail(e.target.value)} readOnly={view.s === 'busy'}
                    aria-invalid={!!error} aria-describedby={error ? 'signin-error' : undefined}
                  />
                </div>
                {error && <p id="signin-error" className="signin-error" role="alert">{error}</p>}
                <button type="submit" className="btn primary signin-go" disabled={!email.trim() || view.s === 'busy'}>
                  {view.s === 'busy' ? 'Sending' : 'Send sign in link'}
                </button>
              </div>
            </form>
          ) : (
            <div key={view.s} className="signin-step">
              <header className="consent-head">
                <span className={`consent-avatar signin-badge ${view.s}`} aria-hidden="true">
                  {view.s === 'sent' ? <Mail s={22} /> : <Ticket s={22} />}
                </span>
                <h1 className="consent-client signin-addr">{email.trim()}</h1>
                <p className="consent-sub">{view.s === 'sent' ? 'Link sent, open it in this browser' : 'Sign up is by invite'}</p>
              </header>
              <div className="consent-actions">
                <button type="button" className="btn" onClick={again}>{view.s === 'sent' ? 'Use another email' : 'Try another email'}</button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
