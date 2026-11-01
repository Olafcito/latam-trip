import { useCallback, useEffect, useRef, useState } from 'react'
import { askLabel, insertTask, loadTasks, press, STATUS_WORD, subscribeTasks, type AskState, type TaskDraft, type TaskRow } from '../lib/tasks'
import { remoteEnabled } from '../lib/supabase'

/** The button that puts one task in the queue, and the tasks of this trip with their answers in place. */
export function AskClaude({ draft, tripId, version, title }: { draft: TaskDraft; tripId: string; version: number | null; title?: string }) {
  const [state, setState] = useState<AskState>('idle')
  const [error, setError] = useState('')
  const [rows, setRows] = useState<TaskRow[]>([])
  const live = useRef(true)
  const refresh = useCallback(() => {
    loadTasks(tripId).then((r) => live.current && setRows(r)).catch(() => {})
  }, [tripId])
  useEffect(() => {
    live.current = true
    refresh()
    const stop = subscribeTasks(refresh)
    return () => {
      live.current = false
      stop()
    }
  }, [refresh])
  if (!remoteEnabled()) return null
  const onPress = async () => {
    if (state === 'sending' || state === 'sent') return
    setState('sending')
    const r = await press('idle', () => insertTask(draft, tripId, version))
    if (!live.current) return
    setState(r.state)
    setError(r.error)
    if (r.state === 'sent') refresh()
  }
  return (
    <>
      <button type="button" className="btn small link" onClick={onPress} disabled={state === 'sending' || state === 'sent'} title={title}>{askLabel(state)}</button>
      {error && <span className="ask-error" role="status">{error}</span>}
      {rows.length > 0 && (
        <ul className="ask-list" aria-label="Tasks for Claude">
          {rows.map((t) => (
            <li key={t.id} className={`ask-${t.status}`}>
              <strong>{t.title}</strong>
              <span>{STATUS_WORD[t.status]}</span>
              {t.result && <p>{t.result}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
