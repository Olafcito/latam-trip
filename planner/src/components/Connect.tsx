import { useEffect, useState } from 'react'
import { approveFlow, flowInfo, type FlowInfo } from '../lib/connect'

type Step = { s: 'loading' } | { s: 'ask'; info: FlowInfo } | { s: 'busy'; info: FlowInfo } | { s: 'done'; info: FlowInfo } | { s: 'gone' } | { s: 'error'; info: FlowInfo | null }

/** Opened from the connector's sign in email: the owner allows an assistant to reach the trip data. */
export function Connect({ flow, token, onClose }: { flow: string; token: string; onClose: () => void }) {
  const [step, setStep] = useState<Step>({ s: 'loading' })

  useEffect(() => {
    let live = true
    flowInfo(flow).then(
      (info) => live && setStep(info ? { s: 'ask', info } : { s: 'gone' }),
      () => live && setStep({ s: 'error', info: null }),
    )
    return () => {
      live = false
    }
  }, [flow])

  const allow = async (info: FlowInfo) => {
    setStep({ s: 'busy', info })
    const ok = await approveFlow(flow, token).catch(() => false)
    setStep(ok ? { s: 'done', info } : { s: 'error', info })
  }

  const info = 'info' in step ? step.info : null
  return (
    <div className="app">
      <main className="main">
        <div className="card load-err connect" aria-live="polite">
          {step.s === 'loading' && <p className="load-err-t" style={{ color: 'var(--text)' }}>Connect</p>}
          {(step.s === 'ask' || step.s === 'busy') && (
            <>
              <p className="load-err-t" style={{ color: 'var(--text)' }}>Connect {step.info.client} to Latam trip</p>
              <p className="small muted">
                {step.info.client} on {step.info.host} can then read and change your trips, places, stays and prices.
                You can remove it again in its connector settings.
              </p>
              <div className="connect-actions">
                <button type="button" className="btn" onClick={onClose} disabled={step.s === 'busy'}>Cancel</button>
                <button type="button" className="btn primary" onClick={() => void allow(step.info)} disabled={step.s === 'busy'}>
                  {step.s === 'busy' ? 'Allowing' : 'Allow'}
                </button>
              </div>
            </>
          )}
          {step.s === 'done' && (
            <>
              <p className="load-err-t" style={{ color: 'var(--text)' }}>Connected</p>
              <p className="small muted">The sign in page on {step.info.host} goes on by itself. You can close this tab.</p>
              <button type="button" className="btn" onClick={onClose}>Open the planner</button>
            </>
          )}
          {step.s === 'gone' && (
            <>
              <p className="load-err-t" style={{ color: 'var(--text)' }}>This sign in has run out</p>
              <p className="small muted">Links last ten minutes and work once. Start the connection again from the assistant.</p>
              <button type="button" className="btn" onClick={onClose}>Open the planner</button>
            </>
          )}
          {step.s === 'error' && (
            <>
              <p className="load-err-t">Could not connect</p>
              <p className="small muted">
                {info ? `${info.client} was not allowed. Only the owner's sign in can connect it.` : 'The connector did not answer. Check the connection and open the link again.'}
              </p>
              <button type="button" className="btn" onClick={onClose}>Open the planner</button>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
