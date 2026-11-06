import { useEffect, useState, type ReactNode } from 'react'
import { answerConsent, readConsent, type Ask, type Step } from '../lib/consent'
import { Link, Lock, Person, Warn } from './icons'

type View = { s: 'loading' } | Step | { s: 'busy'; ask: Ask; action: 'approve' | 'deny' } | { s: 'leaving'; host: string } | { s: 'error' }

/** The scope names Supabase can grant, in the words the page shows. */
const SCOPE: Record<string, string> = { email: 'Email address', openid: 'Sign in', profile: 'Name', phone: 'Phone number' }

/** An icon that carries a row's meaning, named for screen readers and on hover. */
function Mark({ name, children }: { name: string; children: ReactNode }) {
  return (
    <span className="consent-mark" role="img" aria-label={name} title={name}>
      {children}
    </span>
  )
}

const leave = (url: string) => window.location.replace(url)

/** Supabase's consent step: an assistant asks to use the planner as the signed in person. The client and the host the
 * code goes back to are what the person judges, so they lead. A host outside claude.ai and a local client is refused
 * with no way to allow it. */
export function Consent({ id, token, onClose, go = leave }: {
  id: string
  token: string
  onClose: () => void
  go?: (url: string) => void
}) {
  const [view, setView] = useState<View>({ s: 'loading' })

  useEffect(() => {
    let live = true
    readConsent(id, token).then(
      (step) => {
        if (!live) return
        if (step.s === 'follow') {
          setView({ s: 'leaving', host: new URL(step.url).hostname })
          go(step.url)
        } else setView(step)
      },
      () => live && setView({ s: 'error' }),
    )
    return () => {
      live = false
    }
  }, [id, token, go])

  const answer = async (ask: Ask, action: 'approve' | 'deny') => {
    setView({ s: 'busy', ask, action })
    try {
      const next = await answerConsent(id, token, action)
      if (!next) return setView({ s: 'gone' })
      setView({ s: 'leaving', host: ask.host })
      go(next)
    } catch {
      setView({ s: 'error' })
    }
  }

  const ask = view.s === 'ask' || view.s === 'busy' ? view.ask : null
  const busy = view.s === 'busy' ? view.action : null
  return (
    <div className="app">
      <main className="main consent-main">
        <section className="card consent" aria-live="polite" aria-busy={view.s === 'loading' || view.s === 'leaving'}>
          {view.s === 'loading' && <div className="consent-wait" aria-label="Loading" />}
          {ask && (
            <>
              <header className="consent-head">
                <span className="consent-avatar" aria-hidden="true">{ask.client.slice(0, 1).toUpperCase()}</span>
                <h1 className="consent-client">{ask.client}</h1>
                <p className="consent-sub">Connect to Latam trip</p>
              </header>
              <ul className="consent-rows">
                <li>
                  <Mark name="Returns to"><Link s={15} /></Mark>
                  <span className="consent-host">{ask.host}</span>
                </li>
                <li>
                  <Mark name="Acts as"><Person s={15} /></Mark>
                  <span className="consent-val">{ask.email ?? 'Your account'}</span>
                </li>
                {ask.scopes.length > 0 && (
                  <li>
                    <Mark name="Shares"><Lock s={15} /></Mark>
                    <span className="consent-scopes">
                      {ask.scopes.map((sc) => <span key={sc} className="consent-scope">{SCOPE[sc] ?? sc}</span>)}
                    </span>
                  </li>
                )}
              </ul>
              <div className="consent-actions">
                <button type="button" className="btn" onClick={() => void answer(ask, 'deny')} disabled={!!busy}>
                  {busy === 'deny' ? 'Denying' : 'Deny'}
                </button>
                <button type="button" className="btn primary" onClick={() => void answer(ask, 'approve')} disabled={!!busy}>
                  {busy === 'approve' ? 'Allowing' : 'Allow'}
                </button>
              </div>
            </>
          )}
          {view.s === 'leaving' && (
            <header className="consent-head">
              <h1 className="consent-client">{view.host}</h1>
              <p className="consent-sub">Going back</p>
            </header>
          )}
          {view.s === 'refused' && (
            <>
              <header className="consent-head">
                <span className="consent-avatar warn" aria-hidden="true"><Warn s={20} /></span>
                <h1 className="consent-client">{view.host ?? 'Unknown address'}</h1>
                <p className="consent-sub">Not allowed to connect to Latam trip</p>
              </header>
              <div className="consent-actions">
                <button type="button" className="btn" onClick={onClose}>Open the planner</button>
              </div>
            </>
          )}
          {view.s === 'gone' && (
            <>
              <header className="consent-head">
                <h1 className="consent-client">This request has run out</h1>
                <p className="consent-sub">Start the connection again from Claude</p>
              </header>
              <div className="consent-actions">
                <button type="button" className="btn" onClick={onClose}>Open the planner</button>
              </div>
            </>
          )}
          {view.s === 'error' && (
            <>
              <header className="consent-head">
                <span className="consent-avatar warn" aria-hidden="true"><Warn s={20} /></span>
                <h1 className="consent-client">Could not reach the sign in</h1>
                <p className="consent-sub">Check the connection and open the link again</p>
              </header>
              <div className="consent-actions">
                <button type="button" className="btn" onClick={onClose}>Open the planner</button>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
