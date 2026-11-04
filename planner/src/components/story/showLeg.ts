import { legId, type LegKey } from '../../lib/tripStatus'

// Takes the story to a leg and lights it for a moment, so the eye finds it after the scroll.

const LIT_MS = 1600
const timers = new WeakMap<Element, number>()

export function showLeg(key: LegKey): void {
  const el = document.getElementById(legId(key))
  if (!el) return
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' })
  window.clearTimeout(timers.get(el))
  el.removeAttribute('data-lit')
  // a second tap on the same leg starts the light again
  void (el as HTMLElement).offsetWidth
  el.setAttribute('data-lit', '')
  timers.set(el, window.setTimeout(() => el.removeAttribute('data-lit'), LIT_MS))
}
