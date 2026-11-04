import { describe, expect, it } from 'vitest'
import { draftProblem, type LodgingDraft } from './lodgings'
import { blankForm, placeDraft, quickTotal, roomName, withLink, type PlaceForm } from './placeDraft'

// Made up places and addresses only. A real name or price never goes in this file.

/** the form as it opens on a stop of two nights, with only a name typed */
const form = (over: Partial<PlaceForm> = {}): PlaceForm => ({
  link: '', name: 'TEST01 hostel', kind: 'hostel', perNight: '', check_in: '2026-12-05', check_out: '2026-12-07', area: '',
  room: '', beds: '', own: '', bath: '', photos: [], tags: [], notes: '', ...over,
})
const ok = (d: LodgingDraft | string) => {
  if (typeof d === 'string') throw new Error(d)
  return d
}

describe('a place added by hand', () => {
  it('saves with only a name, as one room you can choose and no price', () => {
    const d = ok(placeDraft('B', form()))
    expect(d).toMatchObject({ place_id: 'B', name: 'TEST01 hostel', kind: 'hostel', links: [], photos: [], notes: null, address: null, added_by: 'simon' })
    expect(d.rooms).toEqual([{ name: 'Dorm bed', beds: null, private: null, bathroom: null, notes: null, prices: [] }])
    expect(draftProblem(d)).toBeNull()
  })

  it('names the room after the kind of place when the room has no name', () => {
    expect(roomName('hostel')).toBe('Dorm bed')
    expect(roomName('hotel')).toBe('Room')
    expect(ok(placeDraft('B', form({ kind: 'apartment' }))).rooms[0].name).toBe('Apartment')
    expect(ok(placeDraft('B', form({ room: ' TEST01 private ' }))).rooms[0].name).toBe('TEST01 private')
  })

  it('takes a price per night and keeps the total for the dates beside it, both rounded', () => {
    const d = ok(placeDraft('B', form({ perNight: '120,50' })))
    expect(d.rooms[0].prices).toEqual([{ check_in: '2026-12-05', check_out: '2026-12-07', total_dkk: 241, per_night_dkk: 121, site: null, url: null, refundable: null, cancel_until: null }])
  })

  it('puts the site and the link on the price when there is a link', () => {
    const d = ok(placeDraft('B', form({ link: ' https://www.hostelworld.com/hostels/p/1/test01/ ', perNight: '90' })))
    expect(d.links).toEqual([{ site: 'hostelworld', url: 'https://www.hostelworld.com/hostels/p/1/test01/' }])
    expect(d.rooms[0].prices[0]).toMatchObject({ site: 'hostelworld', url: 'https://www.hostelworld.com/hostels/p/1/test01/', total_dkk: 180, per_night_dkk: 90 })
  })

  it('keeps the area as the address', () => {
    expect(ok(placeDraft('B', form({ area: ' TEST01 old town ' }))).address).toBe('TEST01 old town')
  })

  it('takes the room details and amenities from Details', () => {
    const d = ok(placeDraft('B', form({ room: 'TEST01 six bed', beds: '6', own: 'shared', bath: 'private', tags: ['social', 'pool'], notes: ' TEST01 note ' })))
    expect(d.rooms[0]).toMatchObject({ name: 'TEST01 six bed', beds: 6, private: false, bathroom: 'private' })
    expect(d.tags).toEqual(['social', 'pool'])
    expect(d.notes).toBe('TEST01 note')
  })

  it('asks for a price it can read', () => {
    expect(placeDraft('B', form({ perNight: 'cheap' }))).toBe('A price needs what it costs in kr.')
  })

  it('asks for the dates of a price, the check out after the check in', () => {
    expect(placeDraft('B', form({ perNight: '90', check_in: '' }))).toBe('A price needs the day you check in and the day you check out.')
    expect(placeDraft('B', form({ perNight: '90', check_out: '2026-12-05' }))).toBe('You check out after the day you check in.')
  })

  it('asks for a name', () => {
    expect(placeDraft('B', form({ name: '  ' }))).toBe('Give the place a name.')
  })

  it('refuses beds under 1', () => {
    expect(placeDraft('B', form({ beds: '0' }))).toBe('A room has at least 1 bed.')
  })

  it('takes https links and photos only', () => {
    expect(placeDraft('B', form({ link: 'http://test01.example/rooms' }))).toBe('A link starts with https://.')
    expect(placeDraft('B', form({ link: 'https://' }))).toBe('A link starts with https://.')
    expect(placeDraft('B', form({ photos: ['javascript:alert(1)'] }))).toBe('A photo address starts with https://.')
    const d = ok(placeDraft('B', form({ link: 'https://www.booking.com/hotel/test01.html', photos: [' https://test01.example/a.jpg ', ''] })))
    expect(d.links).toEqual([{ site: 'booking', url: 'https://www.booking.com/hotel/test01.html' }])
    expect(d.photos).toEqual([{ url: 'https://test01.example/a.jpg', caption: null }])
  })
})

describe('the total under the price', () => {
  it('is the price per night times the nights', () => {
    expect(quickTotal('120', '2026-12-05', '2026-12-08')).toEqual({ nights: 3, total: 360 })
    expect(quickTotal('1.240', '2026-12-30', '2027-01-01')).toEqual({ nights: 2, total: 2480 })
  })
  it('is nothing without a price or with dates that do not make a night', () => {
    expect(quickTotal('', '2026-12-05', '2026-12-08')).toBeNull()
    expect(quickTotal('cheap', '2026-12-05', '2026-12-08')).toBeNull()
    expect(quickTotal('120', '2026-12-05', '2026-12-05')).toBeNull()
    expect(quickTotal('120', '', '2026-12-05')).toBeNull()
  })
})

describe('the form as it opens and as a link fills it', () => {
  it('opens as a hostel on the free nights of the stop', () => {
    const f = blankForm('2026-12-05', 3)
    expect(f).toMatchObject({ kind: 'hostel', check_in: '2026-12-05', check_out: '2026-12-08', name: '', link: '', perNight: '' })
  })

  it('opens with no dates off a stop', () => {
    expect(blankForm(null, 0)).toMatchObject({ check_in: '', check_out: '' })
    expect(blankForm('2026-12-05', 0)).toMatchObject({ check_in: '2026-12-05', check_out: '' })
  })

  it('takes the name from a Booking address when the name is empty', () => {
    const f = withLink(blankForm(null, 0), 'https://www.booking.com/hotel/co/test01-casa-azul.en-gb.html')
    expect(f.name).toBe('Test01 Casa Azul')
    expect(f.link).toBe('https://www.booking.com/hotel/co/test01-casa-azul.en-gb.html')
  })

  it('keeps a name typed by hand', () => {
    const f = withLink({ ...blankForm(null, 0), name: 'TEST01 mine' }, 'https://www.booking.com/hotel/co/test01-casa-azul.html')
    expect(f.name).toBe('TEST01 mine')
  })

  it('swaps a name it read from the last link for the name of the next', () => {
    const a = withLink(blankForm(null, 0), 'https://www.booking.com/hotel/co/test01-one.html')
    const b = withLink(a, 'https://www.hostelworld.com/hostels/p/123/test01-two/')
    expect(b.name).toBe('Test01 Two')
  })

  it('leaves the name when the link names nothing', () => {
    const a = withLink(blankForm(null, 0), 'https://www.booking.com/hotel/co/test01-one.html')
    expect(withLink(a, 'https://example.com/x').name).toBe('Test01 One')
  })
})
