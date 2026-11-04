import { km, type LonLat } from '../lib/geo'

/** How close a row must be to the open route to count as along it. */
export const ROUTE_KM = 120

/** Rows whose point lies within `withinKm` of a vertex of `line` or of the midpoint of a segment. */
export function alongRoute<T>(rows: T[], at: (row: T) => LonLat | undefined, line: LonLat[], withinKm: number): T[] {
  const probes: LonLat[] = [...line]
  for (let i = 1; i < line.length; i++) {
    probes.push([(line[i - 1][0] + line[i][0]) / 2, (line[i - 1][1] + line[i][1]) / 2])
  }
  return rows.filter((row) => {
    const p = at(row)
    return !!p && probes.some((q) => km(p[1], p[0], q[1], q[0]) <= withinKm)
  })
}
