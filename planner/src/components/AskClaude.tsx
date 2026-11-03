import { useCallback, useEffect, useRef, useState } from 'react'
import { askLabel, insertTask, loadTasks, press, STATUS_WORD, subscribeTasks, type AskState, type TaskDraft, type TaskRow } from '../lib/tasks'
import { remoteEnabled } from '../lib/supabase'

/**
 * The button that puts one task in the queue, and the tasks of this trip with their answers in place.
 * With same, only the tasks that ask what this draft asks are listed, and one still waiting or being worked on
 * holds the button, so the same question is not put twice, after a reload either. Another draft is another
 * question, so the button is pressed afresh for it.
 */
export function AskClaude({ draft, tripId, version, title, className = 'btn small link', idle, same = false }: {
  draft: TaskDraft
  tripId: string
  version: number | null
  title?: string
  className?: string
  /** what the button says before it is pressed */
  idle?: string
  same?: boolean
}) {
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
  useEffect(() => {
    setState('idle')
    setError('')
  }, [draft.title])
  if (!remoteEnabled()) return null
  const mine = same ? rows.filter((t) => t.title === draft.title) : rows
  const waiting = same ? mine.find((t) => t.status === 'open' || t.status === 'working') : undefined
  // with same, the one still waiting says so on the button, so the list holds the answers
  const shown = same ? mine.filter((t) => t.status === 'done' || t.status === 'failed') : mine
  const held = state === 'sending' || state === 'sent' || !!waiting
  const onPress = async () => {
    if (held) return
    setState('sending')
    const r = await press('idle', () => insertTask(draft, tripId, version))
    if (!live.current) return
    setState(r.state)
    setError(r.error)
    if (r.state === 'sent') refresh()
  }
  const label = waiting && state !== 'sending' ? STATUS_WORD[waiting.status] : state === 'idle' && idle ? idle : askLabel(state)
  return (
    <>
      <button type="button" className={className} onClick={onPress} disabled={held} title={title} data-state={waiting ? 'sent' : state}>{label}</button>
      {error && <span className="ask-error" role="status">{error}</span>}
      {shown.length > 0 && (
        <ul className="ask-list" aria-label="Tasks for Claude">
          {shown.map((t) => (
            <li key={t.id} className={`ask-${t.status}`}>
              {!same && <strong>{t.title}</strong>}
              <span>{STATUS_WORD[t.status]}</span>
              {t.result && <p>{t.result}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
