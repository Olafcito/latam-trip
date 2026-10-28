// Local airport times to absolute time with airports[code].utc_offset (winter time).

/** "2026-12-03T06:00" at UTC+1 -> epoch ms. */
export function toUtcMs(local: string, utcOffset: number): number {
  const y = +local.slice(0, 4)
  const mo = +local.slice(5, 7) - 1
  const d = +local.slice(8, 10)
  const h = +local.slice(11, 13) || 0
  const mi = +local.slice(14, 16) || 0
  return Date.UTC(y, mo, d, h, mi) - utcOffset * 3600000
}

/** Door-to-door hours between a local departure and a local arrival in different time zones. */
export function doorToDoorHours(depart: string, departOffset: number, arrive: string, arriveOffset: number): number {
  return (toUtcMs(arrive, arriveOffset) - toUtcMs(depart, departOffset)) / 3600000
}

/** Add whole days to a "YYYY-MM-DD" date. */
export function addDays(date: string, n: number): string {
  const t = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) + n * 86400000
  return new Date(t).toISOString().slice(0, 10)
}

/** Every date from a to b inclusive. */
export function dateRange(a: string, b: string): string[] {
  const out: string[] = []
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d)
  return out
}
