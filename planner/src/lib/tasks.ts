import { day } from './format'
import { supabase } from './supabase'

// Tasks for Claude (spec 8.3). A press inserts one row into the tasks table, with the task JSON of
// docs/claude-tasks.md in `data`. Claude lists the open rows with tasks.py, works through them and
// writes the answer to `result`, which shows in the app in place.

export interface Task {
  type: string
  from?: 'app'
  [k: string]: unknown
}

export interface TaskDraft {
  title: string
  /** the one human line */
  line: string
  task: Task
}

export interface TaskRow {
  id: number
  type: string
  status: 'open' | 'working' | 'done' | 'failed'
  title: string
  trip_id: string | null
  trip_version: number | null
  created_at: string
  done_at: string | null
  result: string | null
}

export function taskDraft(summary: string, line: string, task: Task): TaskDraft {
  return { title: `[${task.type}] ${summary}`, line, task }
}

/** A flight_prices task for every flight of one one-way leg, on the day and the days either side. Codes are IATA. */
export function flightPricesTask(leg: { from: string; to: string; date: string; fromName?: string; toName?: string }, flexDays = 3): TaskDraft {
  const task: Task = { type: 'flight_prices', legs: [{ from: leg.from, to: leg.to, date: leg.date, flex_days: flexDays }], all_flights: true, from: 'app' }
  const names = `${leg.fromName ?? leg.from} to ${leg.toName ?? leg.to}`
  const flex = flexDays === 1 ? 'a day either side' : `${flexDays} days either side`
  return taskDraft(
    `${leg.from} to ${leg.to} ${day(leg.date)}`,
    `Every one-way flight from ${names} on ${day(leg.date)} and ${flex}.`,
    task,
  )
}

const COLS = 'id,type,status,title,trip_id,trip_version,created_at,done_at,result'

export type InsertResult = { ok: true; id: number } | { ok: false; message: string }

/** One press is one row. The row carries the trip it was asked from, and the version of that trip. */
export async function insertTask(draft: TaskDraft, tripId: string | null, version: number | null): Promise<InsertResult> {
  if (!supabase) return { ok: false, message: 'Not connected.' }
  let res
  try {
    res = await supabase
      .from('tasks')
      .insert({ type: draft.task.type, title: draft.title, trip_id: tripId, trip_version: version, data: { ...draft.task, note: draft.line } })
      .select('id')
      .single()
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Could not reach the database.' }
  }
  if (res.error) return { ok: false, message: res.error.message }
  return { ok: true, id: (res.data as { id: number }).id }
}

/** The tasks asked from one trip, newest first. */
export async function loadTasks(tripId: string): Promise<TaskRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('tasks').select(COLS).eq('trip_id', tripId).order('id', { ascending: false }).limit(20)
  if (error) throw new Error(error.message)
  return (data ?? []) as TaskRow[]
}

/** Calls cb on every change of tasks. Returns the way to stop listening. */
export function subscribeTasks(cb: () => void): () => void {
  if (!supabase) return () => {}
  const client = supabase
  const channel = client.channel('tasks-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, cb).subscribe()
  return () => {
    void client.removeChannel(channel)
  }
}

export type AskState = 'idle' | 'sending' | 'sent' | 'failed'

/** What the ask button says. */
export function askLabel(state: AskState): string {
  return state === 'sending' ? 'Sending' : state === 'sent' ? 'Sent to Claude' : state === 'failed' ? 'Try again' : 'Ask Claude to check'
}

export const STATUS_WORD: Record<TaskRow['status'], string> = { open: 'Waiting for Claude', working: 'Claude is on it', done: 'Done', failed: 'Failed' }

/** A press while one is in flight or already sent does nothing, so one press is one row. */
export async function press(state: AskState, send: () => Promise<InsertResult>): Promise<{ state: AskState; error: string }> {
  if (state === 'sending' || state === 'sent') return { state, error: '' }
  const r = await send()
  return r.ok ? { state: 'sent', error: '' } : { state: 'failed', error: r.message }
}
