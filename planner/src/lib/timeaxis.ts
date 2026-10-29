// The month axis over the Trips timetable: where each month starts and each week turns, as a
// fraction of the shared domain the trip strips use.

const DAY = 86400000
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface MonthMark { f: number; label: string; t: number }

/**
 * The first of every month inside the domain. A domain that starts mid month also names that month
 * at 0, unless the next month starts within minGap of it and the two names would touch.
 */
export function monthMarks([d0, d1]: [number, number], minGap = 0.08): MonthMark[] {
  const span = Math.max(1, d1 - d0)
  const start = new Date(d0)
  const out: MonthMark[] = []
  let y = start.getUTCFullYear()
  let m = start.getUTCMonth()
  if (start.getUTCDate() !== 1 || start.getUTCHours() !== 0) {
    out.push({ f: 0, label: MON[m], t: d0 })
    m++
  }
  for (;;) {
    if (m > 11) { m = 0; y++ }
    const t = Date.UTC(y, m, 1)
    if (t > d1) break
    out.push({ f: (t - d0) / span, label: MON[m], t })
    m++
  }
  if (out.length > 1 && out[0].f === 0 && out[0].t === d0 && out[1].f < minGap) out.shift()
  return out
}

/** Every Monday inside the domain, as fractions. */
export function weekMarks([d0, d1]: [number, number]): number[] {
  const span = Math.max(1, d1 - d0)
  let t = Math.ceil(d0 / DAY) * DAY
  t += ((8 - new Date(t).getUTCDay()) % 7) * DAY
  const out: number[] = []
  for (; t <= d1; t += 7 * DAY) out.push((t - d0) / span)
  return out
}
