import { describe, expect, it } from 'vitest'
import { draftProblem, type LodgingDraft } from './lodgings'
import { placeDraft, type PlaceForm, type RoomForm } from './placeDraft'

// Made up places and addresses only. A real name or price never goes in this file.

const form = (over: Partial<PlaceForm>): PlaceForm => ({ name: 'TEST01 hostel', kind: 'hostel', links: [], photos: [], rooms: [], tags: [], notes: '', ...over })
/** a room as the form starts it: a name, and one price row with the stop's dates in it and no total */
const room = (over: Partial<RoomForm> = {}): RoomForm => ({
  key: 'r', name: 'TEST01 dorm', beds: '', own: '', bath: '',
  prices: [{ key: 'p', check_in: '2026-12-05', check_out: '2026-12-09', total: '' }], ...over,
})
const ok = (d: LodgingDraft | string) => {
  if (typeof d === 'string') throw new Error(d)
  return d
}

describe('a place added by hand', () => {
  it('saves with only a name', () => {
    const d = ok(placeDraft('B', form({})))
    expect(d).toMatchObject({ place_id: 'B', name: 'TEST01 hostel', kind: 'hostel', rooms: [], links: [], photos: [], notes: null, added_by: 'simon' })
    expect(draftProblem(d)).toBeNull()
  })

  it('saves with a name and a room and nothing else, the price row with only the dates in it left out', () => {
    const d = ok(placeDraft('B', form({ rooms: [room()] })))
    expect(d.rooms).toEqual([{ name: 'TEST01 dorm', beds: null, private: null, bathroom: null, notes: null, prices: [] }])
  })

  it('takes a price with its total in kr, rounded', () => {
    const d = ok(placeDraft('B', form({ rooms: [room({ beds: '6', own: 'shared', bath: 'private', prices: [{ key: 'p', check_in: '2026-12-05', check_out: '2026-12-09', total: '1.240,50' }] })] })))
    expect(d.rooms[0]).toMatchObject({ beds: 6, private: false, bathroom: 'private' })
    expect(d.rooms[0].prices).toEqual([{ check_in: '2026-12-05', check_out: '2026-12-09', total_dkk: 1241, per_night_dkk: null, site: null, url: null, refundable: null, cancel_until: null }])
  })

  it('asks for the dates of a price with a total', () => {
    expect(placeDraft('B', form({ rooms: [room({ prices: [{ key: 'p', check_in: '', check_out: '', total: '900' }] })] }))).toBe('A price needs the day you check in and the day you check out.')
  })

  it('asks for a total it can read', () => {
    expect(placeDraft('B', form({ rooms: [room({ prices: [{ key: 'p', check_in: '2026-12-05', check_out: '2026-12-09', total: 'cheap' }] })] }))).toBe('A price needs what it costs in kr.')
  })

  it('asks for a name, for the place and for each room', () => {
    expect(placeDraft('B', form({ name: '  ' }))).toBe('Give the place a name.')
    expect(placeDraft('B', form({ rooms: [room({ name: '' })] }))).toBe('Give each room a name.')
  })

  it('refuses beds under 1', () => {
    expect(placeDraft('B', form({ rooms: [room({ beds: '0' })] }))).toBe('A room has at least 1 bed.')
  })

  it('takes https links and photos only, and says which site a link is on', () => {
    expect(placeDraft('B', form({ links: ['http://test01.example/rooms'] }))).toBe('A link starts with https://.')
    expect(placeDraft('B', form({ links: ['https://'] }))).toBe('A link starts with https://.')
    expect(placeDraft('B', form({ photos: ['javascript:alert(1)'] }))).toBe('A photo address starts with https://.')
    const d = ok(placeDraft('B', form({ links: [' https://www.booking.com/hotel/test01.html ', ''], photos: ['https://test01.example/a.jpg'] })))
    expect(d.links).toEqual([{ site: 'booking', url: 'https://www.booking.com/hotel/test01.html' }])
    expect(d.photos).toEqual([{ url: 'https://test01.example/a.jpg', caption: null }])
  })
})
