import type { Lodging, LodgingRoom } from '../data/types'
import { day, dayRange } from './format'
import { addDays } from './time'
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

/**
 * A stay_prices task for rooms of a place to stay that exists, for the nights from first. Claude writes one price
 * per room on the place's own links and never adds a place or a room from it. The shape is what tasks.py needs.
 */
export function stayPricesTask(lodging: Pick<Lodging, 'id' | 'name'>, rooms: Pick<LodgingRoom, 'id' | 'name'>[], first: string, nights: number): TaskDraft {
  const check_out = addDays(first, nights)
  const task: Task = { type: 'stay_prices', lodging_id: lodging.id, room_ids: rooms.map((r) => r.id), check_in: first, check_out, from: 'app' }
  const what = rooms.length === 1 ? rooms[0].name : `${rooms.length} rooms`
  return taskDraft(`${lodging.name} ${dayRange(first, check_out)}`, `Prices of ${what} at ${lodging.name} for ${dayRange(first, check_out)}.`, task)
}

/**
 * A stay_search task for a stop and its dates (FEAT-003): the task runner looks on Booking.com for the most reviewed
 * places rated 8.0 or more and adds the ones not stored yet at the stop. The shape is what tasks.py needs.
 */
export function stayFindTask(place: { id: string; name: string }, checkIn: string, checkOut: string, top = 3): TaskDraft {
  const task: Task = { type: 'stay_search', place_id: place.id, check_in: checkIn, check_out: checkOut, top, from: 'app' }
  const range = dayRange(checkIn, checkOut)
  return taskDraft(`${place.name} ${range}`, `The ${top} most reviewed places on Booking.com in ${place.name} for ${range}.`, task)
}

/**
 * A stay_picks task for a stop and its dates (FEAT-004): queued by itself the first time Add accommodation opens at a
 * stop with nights and no Booking.com place. The task runner adds three good value places from Booking.com.
 */
export function stayPicksTask(place: { id: string; name: string }, checkIn: string, checkOut: string): TaskDraft {
  const task: Task = { type: 'stay_picks', place_id: place.id, check_in: checkIn, check_out: checkOut, from: 'app' }
  const range = dayRange(checkIn, checkOut)
  return taskDraft(`${place.name} ${range}`, `Three good value places on Booking.com in ${place.name} for ${range}.`, task)
}

/** A stay_search or stay_picks row of one place, with the dates it was asked for. */
export interface StayTask {
  id: number
  type: 'stay_search' | 'stay_picks'
  status: TaskRow['status']
  check_in: string
  check_out: string
}

const live = (t: StayTask) => t.status === 'open' || t.status === 'working'

/** Which Booking.com tasks are under way for the dates: the search a press asked for, and the picks. */
export function stayMarks(tasks: StayTask[], checkIn: string, checkOut: string): { search: boolean; picks: boolean } {
  const here = tasks.filter((t) => live(t) && t.check_in === checkIn && t.check_out === checkOut)
  return { search: here.some((t) => t.type === 'stay_search'), picks: here.some((t) => t.type === 'stay_picks') }
}

/**
 * True when opening the sheet should queue the picks (FEAT-004 S1): the stop has nights and is not booked, its check
 * in is today or later, no Booking.com place is stored at the place, hidden or not, no picks task was ever asked for
 * the place and dates, and none is under way at the place for other dates.
 */
export function wantsPicks(o: { nights: number; booked: boolean; checkIn: string; checkOut: string; today: string; hasBooking: boolean; tasks: StayTask[] }): boolean {
  if (o.nights <= 0 || o.booked || !o.checkIn || !o.checkOut || o.checkIn < o.today || o.hasBooking) return false
  return !o.tasks.some((t) => t.type === 'stay_picks' && (live(t) || (t.check_in === o.checkIn && t.check_out === o.checkOut)))
}

/** The local date as YYYY-MM-DD. */
export function localDay(d = new Date()): string {
  const two = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
}

/** A refused insert of a picks task for a place and dates that has one already, which counts as queued. */
export function alreadyQueued(message: string): boolean {
  return /duplicate key|tasks_stay_picks_once/.test(message)
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

/** The stay_search and stay_picks tasks of one place, newest first. A search is under way while open or working. */
export async function stayTasksAt(placeId: string): Promise<StayTask[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('tasks')
    .select('id,type,status,check_in:data->>check_in,check_out:data->>check_out')
    .in('type', ['stay_search', 'stay_picks'])
    .eq('data->>place_id', placeId)
    .order('id', { ascending: false })
    .limit(50)
  if (error) throw new Error(error.message)
  return (data ?? []) as StayTask[]
}

/** Calls cb on every change of tasks. Returns the way to stop listening. Each call gets a channel of its own, since the client hands back a subscribed one of the same name. */
export function subscribeTasks(cb: () => void): () => void {
  if (!supabase) return () => {}
  const client = supabase
  const channel = client.channel(`tasks-changes-${crypto.randomUUID()}`).on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, cb).subscribe()
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
