import type { Box, Point } from './routeView'

// Where the camera of the trip map looks: the point of the map at the middle of the canvas and how
// far in it is. The land zooms, flags and words keep their size, so all of them go through here.

export interface Cam { x: number; y: number; k: number }
interface Size { w: number; h: number }

/** The whole map, as it is drawn. */
export const still = ({ w, h }: Size): Cam => ({ x: w / 2, y: h / 2, k: 1 })

export const toScreen = (c: Cam, { w, h }: Size, p: Point): Point => [(p[0] - c.x) * c.k + w / 2, (p[1] - c.y) * c.k + h / 2]
export const toWorld = (c: Cam, { w, h }: Size, p: Point): Point => [(p[0] - w / 2) / c.k + c.x, (p[1] - h / 2) / c.k + c.y]

/**
 * The camera that shows this box of the map in the room the title and the bar leave free, at most
 * `most` times in and never further out than the whole map. It never looks past the edge of the world.
 */
export function frameFor(box: Box, size: Size, room: Box, most: number, pad = 40): Cam {
  const bw = Math.max(box[2] - box[0], 1)
  const bh = Math.max(box[3] - box[1], 1)
  const k = Math.min(most, Math.max(1, Math.min((room[2] - room[0] - 2 * pad) / bw, (room[3] - room[1] - 2 * pad) / bh)))
  const keep = (v: number, half: number, all: number) => Math.min(all - half, Math.max(half, v))
  return {
    k,
    x: keep((box[0] + box[2]) / 2 - ((room[0] + room[2]) / 2 - size.w / 2) / k, size.w / 2 / k, size.w),
    y: keep((box[1] + box[3]) / 2 - ((room[1] + room[3]) / 2 - size.h / 2) / k, size.h / 2 / k, size.h),
  }
}
