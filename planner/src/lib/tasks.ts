import { day } from './format'

// Tasks for Claude, in the format of docs/claude-tasks.md: a prefilled GitHub issue with the label
// claude-task, a "[type] summary" title, one human line and exactly one fenced json block. Simon
// presses Submit, and Claude works through the checklist later.

const REPO = 'Olafcito/latam-trip'

export interface Task {
  type: string
  from?: 'app'
  [k: string]: unknown
}

export interface TaskIssue {
  title: string
  body: string
  /** the prefilled new issue page */
  url: string
  task: Task
}

export function taskIssue(summary: string, line: string, task: Task): TaskIssue {
  const title = `[${task.type}] ${summary}`
  const body = `${line}\n\n\`\`\`json\n${JSON.stringify(task)}\n\`\`\`\n`
  const url = `https://github.com/${REPO}/issues/new?labels=claude-task&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`
  return { title, body, url, task }
}

/** A flight_prices task for every flight of one one-way leg, on the day and the days either side. Codes are IATA. */
export function flightPricesTask(leg: { from: string; to: string; date: string; fromName?: string; toName?: string }, flexDays = 3): TaskIssue {
  const task: Task = { type: 'flight_prices', legs: [{ from: leg.from, to: leg.to, date: leg.date, flex_days: flexDays }], all_flights: true, from: 'app' }
  const names = `${leg.fromName ?? leg.from} to ${leg.toName ?? leg.to}`
  const flex = flexDays === 1 ? 'a day either side' : `${flexDays} days either side`
  return taskIssue(
    `${leg.from} to ${leg.to} ${day(leg.date)}`,
    `Every one-way flight from ${names} on ${day(leg.date)} and ${flex}.`,
    task,
  )
}
