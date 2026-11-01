import { useEffect, useState } from 'react'
import { loadPairDates } from '../data/pairDates'
import { readQuoteLink } from '../data/load'
import { clock, day, kr } from '../lib/format'
import { pricesOn, type PairDates } from '../lib/prices'
import { Modal } from './Modal'

/** Where a quoteLink goes: the quotes of one pair on one day, from pair_dates. Opens when the address holds ?quote=. */
export function QuoteSheet() {
  const [ask, setAsk] = useState(() => (typeof window === 'undefined' ? null : readQuoteLink(window.location.search)))
  const [pd, setPd] = useState<PairDates | null>(null)
  useEffect(() => {
    if (!ask) return
    let live = true
    void loadPairDates().then((d) => live && setPd(d))
    return () => {
      live = false
    }
  }, [ask])
  if (!ask) return null
  const quotes = pricesOn(pd, ...(ask.pair.split('-') as [string, string]), ask.date)
  const close = () => {
    setAsk(null)
    const u = new URL(window.location.href)
    u.searchParams.delete('quote')
    window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash)
  }
  return (
    <Modal label={`Quotes for ${ask.pair} on ${ask.date}`} onClose={close}>
      {(done) => (
        <div className="quote-sheet">
          <h2>{ask.pair.replace('-', ' to ')}, {day(ask.date + 'T00:00')}</h2>
          {!pd && <p className="muted">Loading the prices.</p>}
          {pd && !quotes.length && <p className="muted">No price is known for this day.</p>}
          <ul>
            {quotes.map((q, i) => (
              <li key={i}>
                <strong>{kr(q.p)}</strong>
                {q.d && q.a && <span> {q.d && clock(`${ask.date}T${q.d}`)} to {clock(`${ask.date}T${q.a}`)}</span>}
                <span className="muted"> {q.s === 0 ? 'direct' : `${q.s} stop${q.s === 1 ? '' : 's'}`}, {q.c.join(', ')}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="btn" onClick={done}>Close</button>
        </div>
      )}
    </Modal>
  )
}
