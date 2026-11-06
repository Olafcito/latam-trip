import { describe, expect, it } from 'vitest'
import { cancelChip } from './BookedBox'

const none = { refundable: null, cancel_until: null, changeable: null, change_until: null }

describe('cancelChip', () => {
  it('says Free cancellation when the ticket cancels for free until a date, the date in its tooltip', () => {
    const c = cancelChip({ ...none, refundable: 'yes', cancel_until: '2026-12-08' })
    expect(c?.word).toBe('Free cancellation')
    expect(c?.fact).toMatch(/^Free cancellation until /)
  })

  it('says Refundable when it refunds with no date, and puts what changes cost in the tooltip', () => {
    expect(cancelChip({ ...none, refundable: 'yes', changeable: 'fee' })).toEqual({ word: 'Refundable', fact: 'Refundable. Changes for a fee' })
  })

  it('gives no chip for a ticket that is partly or not refundable, or not saved', () => {
    expect(cancelChip({ ...none, refundable: 'no', cancel_until: '2026-12-08' })).toBeNull()
    expect(cancelChip({ ...none, refundable: 'partly' })).toBeNull()
    expect(cancelChip({ ...none, changeable: 'yes' })).toBeNull()
  })
})
