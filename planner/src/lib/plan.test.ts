import { describe, expect, it } from 'vitest'
import { createPlan, planOf } from './plan'

describe('planOf', () => {
  it('reads the trip id from the document', () => {
    expect(planOf({ id: 'ctg-sal-xmas-cbb' })).toBe('ctg-sal-xmas-cbb')
  })
  it('is nothing for anything else', () => {
    expect(planOf(null)).toBeNull()
    expect(planOf({ id: '' })).toBeNull()
    expect(planOf({ id: 4 })).toBeNull()
    expect(planOf('ctg')).toBeNull()
    expect(planOf([{ id: 'x' }])).toBeNull()
  })
})

function fake(start: unknown = null, fail = false) {
  const box = { doc: start, writes: [] as unknown[] }
  const deps = {
    read: async () => box.doc,
    write: async (v: unknown) => {
      if (fail) throw new Error('offline')
      box.writes.push(v)
      box.doc = v
    },
  }
  return { box, deps }
}

describe('createPlan', () => {
  it('loads the stored plan', async () => {
    const { deps } = fake({ id: 'a' })
    const plan = createPlan(deps)
    await plan.getState().load()
    expect(plan.getState().id).toBe('a')
    expect(plan.getState().ready).toBe(true)
  })

  it('saves a new plan as one document', async () => {
    const { box, deps } = fake()
    const plan = createPlan(deps)
    await plan.getState().set('b')
    expect(plan.getState().id).toBe('b')
    expect(box.writes).toEqual([{ id: 'b' }])
  })

  it('goes back to the old plan when the save fails', async () => {
    const { deps } = fake({ id: 'a' }, true)
    const plan = createPlan(deps)
    await plan.getState().load()
    await plan.getState().set('b')
    expect(plan.getState().id).toBe('a')
    expect(plan.getState().error).toBe('offline')
  })

  it('stays empty when the read fails', async () => {
    const plan = createPlan({ read: async () => { throw new Error('no') }, write: async () => {} })
    await plan.getState().load()
    expect(plan.getState().id).toBeNull()
    expect(plan.getState().ready).toBe(true)
  })
})
