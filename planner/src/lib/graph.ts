import type { CrawledFlight, MapData, MapEdge } from '../data/types'

/** Hours of an edge: road duration, or the fastest crawled flight. */
export function edgeHours(e: MapEdge): number | null {
  return e.duration_h ?? e.fastest_hours ?? e.oneway_min_hours ?? null
}

/** Price of an edge: road price, or the cheapest crawled one-way. */
export function edgePrice(e: MapEdge): number | null {
  return e.price_dkk ?? e.oneway_min_dkk ?? e.fastest_price_dkk ?? null
}

export interface Arc {
  edge: MapEdge
  to: string
  reversed: boolean
}

/** Connections leaving a node. Edges marked both (most roads) work in both directions; crawled flights only as crawled. */
export function arcsFrom(map: MapData, nodeId: string): Arc[] {
  const out: Arc[] = []
  for (const e of map.edges) {
    if (e.from === nodeId) out.push({ edge: e, to: e.to, reversed: false })
    else if (e.to === nodeId && e.both) out.push({ edge: e, to: e.from, reversed: true })
  }
  return out
}

export function arcsSorted(map: MapData, nodeId: string): Arc[] {
  return arcsFrom(map, nodeId).sort((a, b) => (edgeHours(a.edge) ?? 1e9) - (edgeHours(b.edge) ?? 1e9))
}

export type PathMetric = 'hours' | 'price'

export interface PathResult {
  nodes: string[]
  arcs: Arc[]
  cost: number
}

/** Dijkstra over map.json edges by hours or price. Edges without that number are skipped. */
export function shortestPath(map: MapData, from: string, to: string, metric: PathMetric): PathResult | null {
  if (from === to) return { nodes: [from], arcs: [], cost: 0 }
  const dist = new Map<string, number>([[from, 0]])
  const prev = new Map<string, { node: string; arc: Arc }>()
  const done = new Set<string>()
  const adj = new Map<string, Arc[]>()
  const arcsOf = (n: string) => {
    let a = adj.get(n)
    if (!a) adj.set(n, (a = arcsFrom(map, n)))
    return a
  }
  while (true) {
    let cur: string | null = null
    let best = Infinity
    for (const [n, d] of dist) if (!done.has(n) && d < best) { best = d; cur = n }
    if (cur == null) return null
    if (cur === to) break
    done.add(cur)
    for (const arc of arcsOf(cur)) {
      const w = metric === 'hours' ? edgeHours(arc.edge) : edgePrice(arc.edge)
      if (w == null) continue
      const nd = best + w
      if (nd < (dist.get(arc.to) ?? Infinity)) {
        dist.set(arc.to, nd)
        prev.set(arc.to, { node: cur, arc })
      }
    }
  }
  const nodes = [to]
  const arcs: Arc[] = []
  let n = to
  while (n !== from) {
    const p = prev.get(n)!
    arcs.unshift(p.arc)
    nodes.unshift(p.node)
    n = p.node
  }
  return { nodes, arcs, cost: dist.get(to)! }
}

/**
 * The overland way between two places by hours, with no flight in it. Given countries, it goes
 * through them in that order, the way a long bus leg is written up, or there is no way.
 */
export function groundPath(map: MapData, from: string, to: string, countries?: string[] | null): PathResult | null {
  const land = countries?.length ? countries : null
  const country = new Map(map.nodes.map((n) => [n.id, n.country]))
  const start = land ? land.indexOf(country.get(from) ?? '') : 0
  const end = land ? land.length - 1 : 0
  if (start < 0) return null
  const out = new Map<string, Arc[]>()
  const add = (n: string, arc: Arc) => out.set(n, [...(out.get(n) ?? []), arc])
  for (const e of map.edges) {
    if (e.mode === 'flight' || edgeHours(e) == null) continue
    add(e.from, { edge: e, to: e.to, reversed: false })
    if (e.both) add(e.to, { edge: e, to: e.from, reversed: true })
  }
  interface Step { node: string; at: number; cost: number; prev: Step | null; arc: Arc | null }
  const seen = new Map<string, Step>([[`${from}|${start}`, { node: from, at: start, cost: 0, prev: null, arc: null }]])
  const done = new Set<string>()
  while (true) {
    let cur: Step | null = null
    let key = ''
    for (const [k, s] of seen) if (!done.has(k) && (!cur || s.cost < cur.cost)) { cur = s; key = k }
    if (!cur) return null
    if (cur.node === to && cur.at === end) break
    done.add(key)
    for (const arc of out.get(cur.node) ?? []) {
      const at = !land || country.get(arc.to) === land[cur.at] ? cur.at : country.get(arc.to) === land[cur.at + 1] ? cur.at + 1 : -1
      if (at < 0) continue
      const k = `${arc.to}|${at}`
      const cost = cur.cost + edgeHours(arc.edge)!
      if (cost < (seen.get(k)?.cost ?? Infinity)) seen.set(k, { node: arc.to, at, cost, prev: cur, arc })
    }
  }
  const last = seen.get(`${to}|${end}`)!
  const nodes: string[] = []
  const arcs: Arc[] = []
  for (let s: Step | null = last; s; s = s.prev) {
    nodes.unshift(s.node)
    if (s.arc) arcs.unshift(s.arc)
  }
  return { nodes, arcs, cost: last.cost }
}

/** Crawled flights of an edge, cheapest first. */
export function crawledFlights(e: MapEdge): CrawledFlight[] {
  return [...(e.flights ?? [])].sort((a, b) => a.price_dkk - b.price_dkk)
}
