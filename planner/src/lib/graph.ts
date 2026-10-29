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

/** Crawled flights of an edge, cheapest first. */
export function crawledFlights(e: MapEdge): CrawledFlight[] {
  return [...(e.flights ?? [])].sort((a, b) => a.price_dkk - b.price_dkk)
}
