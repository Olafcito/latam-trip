import { cover, leadFrom, spotFor, type Spot } from './labelSpots'
import { nightWord, type Box, type Point, type RouteView, type ViewCountry, type ViewPlace, type ViewStop } from './routeView'
import { revealOf } from './tripBar'

// Moves the summary map. React draws what never moves, this owns what does: every flag, dot, label
// and the line sit on springs, so a tap can be taken back halfway and nothing jumps. A tap on a flag
// opens that country alone: the flag shrinks onto the place you reach first, the country's name goes,
// its places come out of the flag. A place that holds several stops opens the same way. The window
// draws its route once when it opens, and a country chosen in the bar lights the route up to it.

const SVG = 'http://www.w3.org/2000/svg'
const WAVE = 2 * Math.PI / 0.42
const FRAME_INSET = 14
/** A phone has no room for two neighbours side by side, closer than this they replace each other. */
const NEAR = 180
/** A word keeps clear of the line, measured every this many map units along it. */
const TRAIL = 10
/** A leg shorter than this carries no chevron. */
const SHORT_LEG = 56
/** How long the opening draw takes per leg, and its bounds, in ms. */
const DRAW_LEG = 170
const DRAW = [900, 1700]
const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

const mix = (a: number, b: number, t: number) => a + (b - a) * t
const n1 = (v: number) => +v.toFixed(1)
const mark = (taken: Box[], x: number, y: number, r: number) => { taken.push([x - r - 3, y - r - 3, x + r + 3, y + r + 3]) }

function add<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element) {
  const e = document.createElementNS(SVG, tag)
  for (const k in attrs) e.setAttribute(k, String(attrs[k]))
  parent.append(e)
  return e
}

interface Spring { v: number; t: number; w: number }
const snap = (s: Spring) => { s.v = s.t; s.w = 0 }

interface Country extends ViewCountry { o: Spring; g: SVGGElement; hit: SVGCircleElement | null; size: SVGGElement }
interface Place extends ViewPlace { c: Country; o: Spring }
interface Stop extends ViewStop { c: Country; p: Place }
interface Label {
  country?: boolean
  stop?: boolean
  c: Country
  p?: Place
  name: string
  nights: string
  at?: number | null
  g: SVGGElement
  tap: SVGRectElement | null
  lines: SVGTextElement[]
  lead: SVGLineElement
  /** no clear spot, shown while its flag is hovered or focused */
  peek: boolean
  leads: boolean
  /** where it sits now, so a peeking neighbour can step over it */
  box?: Box
  x: Spring
  y: Spring
  a: Spring
  al: Spring
  dir: number
  ws: number[]
  w: number
  h: number
  side?: number
  home?: Spot
}

export interface LiveOptions {
  interactive: boolean
  /** the title over the map, its words stay clear of it */
  head?: HTMLElement | null
  /** a country opened on the map, so the bar chooses it too */
  onOpen?: (key: string) => void
}

export interface LiveRoute {
  stop: () => void
  /** light the route up to this country, all of it for none */
  focus: (key: string | null) => void
}

export function liveRoute(svg: SVGSVGElement, view: RouteView, { interactive, head, onOpen }: LiveOptions): LiveRoute {
  const box = svg.parentElement!
  const need = <T extends Element>(sel: string) => svg.querySelector<T>(sel)!
  const dotsG = need<SVGGElement>('.rs-dots')
  const labelsG = need<SVGGElement>('.rs-labels')
  const legs = [...svg.querySelectorAll<SVGPathElement>('.rs-leg')]
  const route = svg.querySelector<SVGGElement>('.rs-route')
  const reveal = svg.querySelector<SVGPathElement>('.rs-reveal')
  const fromLine = need<SVGPathElement>('.rs-from')
  const toLine = need<SVGPathElement>('.rs-to')
  const chevrons = [...svg.querySelectorAll<SVGPathElement>('.rs-chev')]
  const ways = [...svg.querySelectorAll<SVGTextElement>('.rs-way')]

  // the strip never moves, so it paints right the first time
  const calm = !interactive || matchMedia('(prefers-reduced-motion: reduce)').matches
  const springs: Spring[] = []
  const track = (v: number) => { const s = { v, t: v, w: 0 }; springs.push(s); return s }
  function settle(s: Spring, dt: number) {
    if (calm) { snap(s); return false }
    const d = s.v - s.t
    const c = s.w + WAVE * d
    const e = Math.exp(-WAVE * dt)
    s.v = s.t + (d + c * dt) * e
    s.w = (s.w - c * WAVE * dt) * e
    if (Math.abs(s.v - s.t) > 0.001 || Math.abs(s.w) > 0.01) return true
    snap(s)
    return false
  }

  const C: Country[] = view.countries.map((c) => {
    const g = need<SVGGElement>(`[data-key="${c.key}"]`)
    return { ...c, o: track(0), g, hit: g.querySelector<SVGCircleElement>('.rs-hit'), size: g.querySelector<SVGGElement>('.rs-size')! }
  })
  const P: Place[] = C.flatMap((c) => c.places.map((p) => ({ ...p, c, o: track(0) })))
  const owner = new Map<number, Place>()
  P.forEach((p) => p.stops.forEach((i) => owner.set(i, p)))
  const S: Stop[] = view.stops.map((s, i) => { const p = owner.get(i)!; return { ...s, p, c: p.c } })
  const longest = Math.max(...C.map((c) => c.n), 1)
  const open = new Set<string>()
  const deep = new Set<string>()
  const opens = (p: Place) => new Set(p.stops.filter((i) => S[i].nights).map((i) => S[i].id)).size > 1
  const flagAt = (c: Country): Point => [mix(c.rest[0], c.out[0], c.o.v), mix(c.rest[1], c.out[1], c.o.v)]
  const real = (i: number): Point => [S[i].x, S[i].y]
  // you land at and leave from an airport, so the line from and to Copenhagen meets it there
  const port = (i: number) => i === 0 || i === S.length - 1

  function spot(i: number): Point {
    if (port(i)) return real(i)
    const s = S[i]
    const p = s.p
    const inPlace = p.kind === 'chain' && p.own.includes(i) ? real(i) : real(p.anchor)
    const r = real(i)
    const m: Point = [mix(inPlace[0], r[0], p.o.v), mix(inPlace[1], r[1], p.o.v)]
    const f = flagAt(s.c)
    return [mix(f[0], m[0], s.c.o.v), mix(f[1], m[1], s.c.o.v)]
  }

  const dots = interactive ? S.map((s, i) => {
    const main = s.p.kind === 'chain' ? s.p.ends.includes(i) : s.p.anchor === i
    const r = s.nights ? (main ? 9 : 7) : 4
    return { i, main, r, e: add('circle', { class: s.nights ? 'rs-dot' : 'rs-dot rs-pass', r, ...(opens(s.p) ? { 'data-t': s.p.id } : {}) }, dotsG) }
  }) : []

  const labels: Label[] = []
  function addLabel(l: Pick<Label, 'country' | 'stop' | 'c' | 'p' | 'name' | 'nights' | 'at'>) {
    const t = !interactive ? null : l.country ? l.c.key : opens(l.p!) ? l.p!.id : null
    const g = add('g', {
      class: 'rs-lab',
      ...(t ? { 'data-t': t } : {}),
      ...(t && !l.country ? { tabindex: 0, role: 'button', 'aria-label': `${l.name}, ${l.nights}` } : {}),
    }, labelsG)
    const lead = add('line', { class: 'rs-lead' }, labelsG)
    const tap = t ? add('rect', { fill: 'transparent' }, g) : null
    const lines = [add('text', { class: l.stop ? 'rs-stop' : 'rs-name' }, g), add('text', { class: 'rs-nights' }, g)]
    lines[0].textContent = l.name
    lines[1].textContent = l.nights
    labels.push({ ...l, g, tap, lines, lead, peek: false, leads: false, x: track(0), y: track(0), a: track(0), al: track(0), dir: 1, ws: [], w: 0, h: 0 })
  }
  // a country's nights stand in the bar, its name alone is on the map
  if (!view.bare) C.forEach((c) => addLabel({ country: true, c, name: c.name, nights: '' }))
  if (interactive) P.forEach((p) => {
    addLabel({ p, c: p.c, name: p.name, nights: nightWord(p.nights), at: p.kind === 'chain' ? null : p.anchor })
    if (opens(p)) [...new Set(p.stops.filter((i) => S[i].nights).map((i) => S[i].id))].forEach((id) => {
      const seen = p.stops.filter((i) => S[i].id === id)
      addLabel({ p, c: p.c, stop: true, name: S[seen[0]].name, nights: nightWord(seen.reduce((n, i) => n + S[i].nights, 0)), at: seen[0] })
    })
  })

  let peeking: string | null = null
  const under = (l: Label) => labels.some((o) => o !== l && o.peek && o.c.key === peeking && seen(o) && !!o.box && !!l.box && cover(o.box, l.box) > 0)
  // a peeking label steps over what lies under it, so it never reads on top of another word
  const shows = (l: Label) => (seen(l) && (l.peek ? peeking === l.c.key : !under(l)) ? 1 : 0)
  const seen = (l: Label) => (l.country ? !open.has(l.c.key) : open.has(l.c.key) && deep.has(l.p!.id) === !!l.stop)
  const point = (l: Label, f: (i: number) => Point): Point => {
    if (l.at != null) return f(l.at)
    const [a, b] = l.p!.ends.map(f)
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  }

  // Sizes are map units with a floor in screen pixels, so a phone keeps readable text while a wide map keeps the steps between levels.
  const inset = view.tilted ? 8 : FRAME_INSET
  // the far edge of the strip fades away, words there would fade with it
  const bounds: Box = [inset, view.tilted ? view.h * 0.24 : inset, view.w - inset, view.h - inset]
  const from: Point = [...view.from]
  const to: Point = [...view.to]
  let blocks: Box[] = []
  let big = 1
  let tapMin = 40

  function type() {
    const px = box.clientWidth / view.w
    // a window that is not open yet has no size, the observer comes back when it has
    if (!px) return false
    const stopSize = Math.max(17, 11 / px)
    const placeSize = Math.max(21, 12 / px)
    big = view.tilted ? 1 : Math.max(1, 14 / (28 * px))
    tapMin = 40 / px
    C.forEach((c) => c.hit?.setAttribute('r', String(n1(Math.max(c.r + 16, 22 / px)))))
    dots.forEach(({ e, r }) => { e.setAttribute('r', String(n1(r * big))); e.setAttribute('stroke-width', String(n1(2.5 * big))) })
    labels.forEach((l) => {
      // a country's name weighs as much as its stay
      const weigh = l.c.n ? 0.8 + 0.2 * Math.sqrt(l.c.n / longest) : 0.7
      const s = l.country ? (view.tilted ? 13 / px : 28 * big * weigh) : l.stop ? stopSize : placeSize
      const n = l.stop ? s : s * (view.tilted ? 0.9 : 0.8)
      const one = l.stop || !l.nights
      l.lines[0].setAttribute('font-size', String(n1(s)))
      l.lines[1].setAttribute('font-size', String(n1(n)))
      l.lines.forEach((t) => t.setAttribute('stroke-width', String(n1(3 / px))))
      l.g.style.display = ''
      l.ws = l.lines.map((t) => t.getComputedTextLength())
      l.w = l.stop ? l.ws[0] + 7 + l.ws[1] : Math.max(...l.ws)
      l.h = one ? s * 1.3 : s * 1.12 + n * 1.22
      l.lines[0].setAttribute('y', String(n1(one ? s * 0.35 : -l.h / 2 + s * 0.86)))
      l.lines[1].setAttribute('y', String(n1(one ? s * 0.35 : -l.h / 2 + s * 0.86 + n * 1.22)))
      if (l.stop) l.lines[1].setAttribute('x', String(n1(l.ws[0] + 7)))
    })
    const top = head ? (head.offsetTop + head.offsetHeight) / px : 0
    blocks = head ? [[0, 0, (head.offsetLeft + head.offsetWidth) / px, top]] : []
    ways.forEach((t, k) => {
      const end = k ? to : from
      const size = Math.max(20, 10.5 / px)
      end[1] = Math.max((k ? view.to : view.from)[1], top + size + 12)
      t.setAttribute('font-size', String(n1(size)))
      const w = t.getComputedTextLength()
      const x = Math.min(end[0] + 10, view.w - inset - w)
      t.setAttribute('x', String(n1(x)))
      t.setAttribute('y', String(n1(end[1] - 6)))
      blocks.push([x, end[1] - 6 - size, x + w, end[1] - 6 + size * 0.3])
    })
    home()
    return true
  }

  const flagTarget = (c: Country): [number, number, number] => (open.has(c.key) ? [...c.out, c.ro * big] : [...c.rest, c.r])
  function anchorOf(l: Label): [number, number, number] {
    const [x, y] = point(l, real)
    const [fx, fy, fr] = flagTarget(l.c)
    if (l.p === P.find((p) => p.c === l.c) && !l.stop) return [fx, fy, fr]
    return Math.hypot(x - fx, y - fy) < fr ? [fx, fy, fr] : [x, y, 10]
  }

  const fit = (l: Label, at: [number, number, number], hard: Box[], words: Box[], soft: Box[]) =>
    spotFor({ w: l.w, h: l.h, at, side: l.side }, hard, words, soft, bounds)

  // The line takes up room too, words laid over it are hard to read.
  function trail(taken: Box[], near: (i: number) => Point) {
    const at = (i: number) => (port(i) ? real(i) : near(i))
    const steps = (a: Point, b: Point) => Math.max(4, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / TRAIL))
    const dotted = (a: Point, b: Point) => {
      const n = steps(a, b)
      for (let k = 1; k < n; k++) mark(taken, mix(a[0], b[0], k / n), mix(a[1], b[1], k / n), 2)
    }
    dotted(from, at(0))
    dotted(at(S.length - 1), to)
    S.forEach((s, i) => {
      if (!i) return
      const a = at(i - 1)
      const b = at(i)
      const c = s.fly ? arc(a, b).c : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      const n = steps(a, b) + (s.fly ? 4 : 0)
      for (let k = 1; k < n; k++) {
        const t = k / n
        const u = 1 - t
        mark(taken, u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1], 2)
      }
    })
  }

  // A closed country keeps its side whatever its neighbours do, so opening one never moves the words of
  // another. The longest stays choose first. No word lies on the line, one with no room waits for hover.
  function home() {
    const hard = [...blocks]
    C.forEach((c) => mark(hard, ...c.rest, c.r))
    trail(hard, (i) => S[i].c.rest)
    const soft: Box[] = []
    const words: Box[] = []
    const stay = (l: Label) => l.c.places.reduce((n, p) => n + p.nights, 0)
    labels.filter((l) => l.country).sort((a, b) => stay(b) - stay(a)).forEach((l) => {
      l.home = fit(l, [...l.c.rest, l.c.r], hard, words, soft)
      if (l.home.peek) words.pop()
    })
  }

  function place() {
    const hard = [...blocks]
    C.forEach((c) => mark(hard, ...flagTarget(c)))
    trail(hard, (i) => (open.has(S[i].c.key) ? real(i) : S[i].c.rest))
    const soft: Box[] = []
    dots.forEach(({ i, main }) => { if (open.has(S[i].c.key) && (main || deep.has(S[i].p.id))) mark(hard, ...real(i), 7) })
    const list = labels.filter(seen)
    const words = list.filter((l) => l.country && !l.home!.peek).map((l) => l.home!.box)
    list.forEach((l) => {
      const best = l.country ? l.home! : fit(l, anchorOf(l), hard, words, soft)
      l.x.t = best.left
      l.y.t = best.mid
      l.al.t = best.sx < 0 ? 1 : best.sx > 0 ? 0 : 0.5
      l.dir = best.sx || 0
      l.side = best.k
      l.peek = best.peek
      l.box = best.box
      l.leads = !!best.lead
    })
    labels.forEach((l) => {
      l.a.t = shows(l)
      if (!seen(l)) l.side = undefined
      if (l.a.v < 0.02) [l.x, l.y, l.al].forEach(snap)
    })
  }

  function arc(a: Point, b: Point) {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len = Math.hypot(dx, dy) || 1
    const c: Point = view.tilted
      ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - len * 0.28] // on the strip a flight lifts off the table
      : [(a[0] + b[0]) / 2 + dy / len * 88, (a[1] + b[1]) / 2 - dx / len * 88]
    return { c, tip: [0.25 * a[0] + 0.5 * c[0] + 0.25 * b[0], 0.25 * a[1] + 0.5 * c[1] + 0.25 * b[1]], ang: Math.atan2(dy, dx) * 180 / Math.PI }
  }

  function draw() {
    const pts = S.map((_, i) => spot(i))
    let whole = `M${from.map(n1)} L${pts[0].map(n1)}`
    S.forEach((s, i) => {
      if (!i) return
      const a = pts[i - 1]
      const b = pts[i]
      const bend = s.fly ? arc(a, b) : null
      const tail = bend ? ` Q${bend.c.map(n1)} ${b.map(n1)}` : ` L${b.map(n1)}`
      legs[i - 1]?.setAttribute('d', `M${a.map(n1)}${tail}`)
      whole += tail
      const ch = chevrons[i - 1]
      if (!ch) return
      // every leg carries its direction at its middle, a short hop has no room for it
      const far = Math.hypot(b[0] - a[0], b[1] - a[1]) >= SHORT_LEG * big
      ch.style.display = far ? '' : 'none'
      const tip = bend ? bend.tip : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      const ang = bend ? bend.ang : Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI
      ch.setAttribute('transform', `translate(${tip.map(n1).join(' ')}) rotate(${n1(ang)}) scale(${(big * 0.8).toFixed(2)})`)
    })
    whole += ` L${to.map(n1)}`
    reveal?.setAttribute('d', whole)
    fromLine.setAttribute('d', `M${from.map(n1)} L${pts[0].map(n1)}`)
    toLine.setAttribute('d', `M${pts[pts.length - 1].map(n1)} L${to.map(n1)}`)
    C.forEach((c) => {
      c.g.setAttribute('transform', `translate(${flagAt(c).map(n1).join(' ')})`)
      c.size.setAttribute('transform', `scale(${mix(1, c.ro * big / c.r, c.o.v).toFixed(3)})`)
    })
    dots.forEach(({ i, main, e }) => {
      const s = S[i]
      const a = s.c.o.v * (main ? 1 : s.p.o.v)
      e.style.display = a < 0.02 ? 'none' : ''
      e.setAttribute('cx', String(n1(pts[i][0])))
      e.setAttribute('cy', String(n1(pts[i][1])))
      e.setAttribute('opacity', a.toFixed(2))
    })
    labels.forEach((l) => {
      const a = l.a.v
      const shown = a > 0.02
      l.g.style.display = shown ? '' : 'none'
      l.lead.style.display = shown && l.leads ? '' : 'none'
      if (!shown) return
      if (l.leads) {
        const from: [number, number, number] = l.country ? [...flagAt(l.c), mix(l.c.r, l.c.ro * big, l.c.o.v)] : anchorOf(l)
        const box: Box = [l.x.v, l.y.v - l.h / 2, l.x.v + l.w, l.y.v + l.h / 2]
        const [x1, y1] = leadFrom(from, box)
        const x2 = Math.min(Math.max(from[0], box[0]), box[2])
        const y2 = Math.min(Math.max(from[1], box[1]), box[3])
        Object.entries({ x1, y1, x2, y2 }).forEach(([k, v]) => l.lead.setAttribute(k, String(n1(v))))
        l.lead.setAttribute('opacity', a.toFixed(2))
      }
      l.g.setAttribute('transform', `translate(${n1(l.x.v - (1 - a) * l.dir * 10)} ${n1(l.y.v)})`)
      l.g.setAttribute('opacity', a.toFixed(2))
      if (!l.stop) l.lines.forEach((t, k) => t.setAttribute('x', String(n1((l.w - l.ws[k]) * l.al.v))))
      if (l.tap) {
        const h = Math.max(l.h, tapMin)
        l.tap.setAttribute('width', String(n1(l.w)))
        l.tap.setAttribute('y', String(n1(-h / 2)))
        l.tap.setAttribute('height', String(n1(h)))
      }
    })
  }

  let dead = false
  let last = 0
  let ticking = false
  function frame(now: number) {
    if (dead) return
    const dt = (now - last) / 1000
    last = now
    let moving = false
    for (const s of springs) if (settle(s, dt)) moving = true
    draw()
    ticking = moving
    if (moving) requestAnimationFrame(frame)
  }
  function kick() {
    if (ticking) return
    ticking = true
    last = performance.now()
    requestAnimationFrame(frame)
  }

  function apply() {
    C.forEach((c) => { c.o.t = open.has(c.key) ? 1 : 0 })
    P.forEach((p) => { p.o.t = open.has(p.c.key) && deep.has(p.id) ? 1 : 0 })
    place()
    svg.querySelectorAll<SVGElement>('[role="button"][data-t]').forEach((b) => {
      const t = b.dataset.t!
      b.setAttribute('aria-expanded', String(open.has(t) || deep.has(t)))
    })
    if (calm) { springs.forEach(snap); draw() } else kick()
  }
  const sync = () => { if (type()) apply() }

  // A label with no room of its own comes out while its flag is under the pointer or has focus.
  function peek(key: string | null) {
    if (key === peeking) return
    peeking = key
    labels.forEach((l) => { l.a.t = shows(l) })
    if (calm) { labels.forEach((l) => snap(l.a)); draw() } else kick()
  }
  const keyOf = (e: Event) => (e.target as Element).closest?.('[data-key]')?.getAttribute('data-key') ?? null
  const onOver = (e: Event) => peek(keyOf(e))
  const onLeave = () => peek(null)

  const shut = (c: Country) => { open.delete(c.key); c.places.forEach((p) => deep.delete(p.id)) }
  function toggle(t: string) {
    const c = C.find((x) => x.key === t)
    if (!c) { if (deep.has(t)) deep.delete(t); else deep.add(t) }
    else if (open.has(t)) shut(c)
    else {
      if (big > 1) C.forEach((o) => { if (o !== c && Math.hypot(o.out[0] - c.out[0], o.out[1] - c.out[1]) < NEAR) shut(o) })
      open.add(t)
      onOpen?.(t)
    }
    apply()
  }

  // Which part of the route is lit, set as state on the parts so their fade lives in the styles.
  function focus(key: string | null) {
    const r = revealOf(view, key)
    legs.forEach((p, k) => p.toggleAttribute('data-dim', !r.legs[k]))
    chevrons.forEach((p, k) => p.toggleAttribute('data-dim', !r.legs[k]))
    toLine.toggleAttribute('data-dim', !r.home)
    C.forEach((c, ci) => {
      c.g.toggleAttribute('data-dim', !r.countries[ci])
      c.g.toggleAttribute('data-here', c.key === key)
    })
    labels.forEach((l) => l.g.toggleAttribute('data-dim', !r.countries[C.indexOf(l.c)]))
  }

  // The window draws its route once, from home through every country and back, each flag arriving as
  // the line reaches it. Any press ends it at once, reduced motion never starts it.
  let drawing = 0
  function finishDraw() {
    if (!drawing) return
    cancelAnimationFrame(drawing)
    drawing = 0
    route?.removeAttribute('mask')
    svg.removeAttribute('data-drawing')
    C.forEach((c) => c.g.removeAttribute('data-wait'))
  }
  function startDraw() {
    if (calm || !route || !reveal || !legs.length) return
    const length = (e: SVGGeometryElement) => { try { return e.getTotalLength() } catch { return 0 } }
    const lens = [length(fromLine), ...legs.map(length)]
    const total = lens.reduce((a, b) => a + b, 0) + length(toLine)
    if (!total) return
    // where along the route each country's first stop is reached, as a share of all of it
    const reach = C.map((c) => lens.slice(0, c.first + 1).reduce((a, b) => a + b, 0) / total)
    const ms = Math.min(DRAW[1], Math.max(DRAW[0], legs.length * DRAW_LEG))
    route.setAttribute('mask', `url(#${reveal.closest('mask')!.id})`)
    svg.setAttribute('data-drawing', '')
    C.forEach((c) => c.g.setAttribute('data-wait', ''))
    reveal.style.strokeDashoffset = '1'
    const t0 = performance.now()
    const step = (now: number) => {
      const p = inOut(Math.min(1, (now - t0) / ms))
      reveal.style.strokeDashoffset = String(1 - p)
      C.forEach((c, ci) => { if (p >= reach[ci]) c.g.removeAttribute('data-wait') })
      if (p < 1) drawing = requestAnimationFrame(step)
      else finishDraw()
    }
    drawing = requestAnimationFrame(step)
  }
  const onClick = (e: Event) => {
    const t = (e.target as Element).closest<SVGElement>('[data-t]')?.dataset.t
    if (t) toggle(t)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const t = (e.target as Element).closest<SVGElement>('[role="button"][data-t]')?.dataset.t
    if (!t) return
    e.preventDefault()
    toggle(t)
  }

  if (interactive) {
    svg.addEventListener('click', onClick)
    svg.addEventListener('keydown', onKey)
    svg.addEventListener('pointerdown', finishDraw)
  }
  svg.addEventListener('pointerover', onOver)
  svg.addEventListener('pointerleave', onLeave)
  svg.addEventListener('focusin', onOver)
  svg.addEventListener('focusout', onLeave)
  draw()
  sync()
  if (interactive) startDraw()
  const seenSize = new ResizeObserver(sync)
  seenSize.observe(box)
  document.fonts.ready.then(() => { if (!dead) sync() })

  const stop = () => {
    dead = true
    finishDraw()
    seenSize.disconnect()
    svg.removeEventListener('click', onClick)
    svg.removeEventListener('keydown', onKey)
    svg.removeEventListener('pointerdown', finishDraw)
    svg.removeEventListener('pointerover', onOver)
    svg.removeEventListener('pointerleave', onLeave)
    svg.removeEventListener('focusin', onOver)
    svg.removeEventListener('focusout', onLeave)
    dotsG.replaceChildren()
    labelsG.replaceChildren()
  }
  return { stop, focus }
}
