import { create } from 'zustand'
import { readDoc, writeDoc } from './remoteTrips'
import { remoteEnabled } from './supabase'

// Which trip is the current plan, the one Simon lives by. One owner only document, current_plan,
// holding { id }. Without Supabase it sits in this browser. A plan id that matches no trip marks nothing.

export const PLAN_DOC = 'current_plan'
const PLAN_KEY = 'latam.currentPlan'

/** The trip id in the document, or nothing when it holds anything else. */
export function planOf(doc: unknown): string | null {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null
  const id = (doc as { id?: unknown }).id
  return typeof id === 'string' && id ? id : null
}

export interface PlanDeps {
  read(): Promise<unknown>
  write(doc: unknown): Promise<void>
}

export interface PlanState {
  id: string | null
  ready: boolean
  error: string | null
  load(): Promise<void>
  set(id: string): Promise<void>
}

export function createPlan(deps: PlanDeps) {
  return create<PlanState>((set, get) => ({
    id: null,
    ready: false,
    error: null,
    load: async () => {
      try {
        set({ id: planOf(await deps.read()), ready: true, error: null })
      } catch {
        set({ ready: true })
      }
    },
    set: async (id) => {
      const before = get().id
      set({ id, error: null })
      try {
        await deps.write({ id })
      } catch (e) {
        set({ id: before, error: e instanceof Error ? e.message : String(e) })
      }
    },
  }))
}

const local: PlanDeps = {
  read: async () => {
    try {
      const v = localStorage.getItem(PLAN_KEY)
      return v ? JSON.parse(v) : null
    } catch {
      return null
    }
  },
  write: async (doc) => localStorage.setItem(PLAN_KEY, JSON.stringify(doc)),
}

const remote: PlanDeps = { read: () => readDoc(PLAN_DOC), write: (doc) => writeDoc(PLAN_DOC, doc) }

export const usePlan = createPlan(remoteEnabled() ? remote : local)
