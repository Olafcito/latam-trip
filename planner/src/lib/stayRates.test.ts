import { afterEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }))

const { addFromLink, fetchRates, hostelworldId, liveLink, remember, resetRates } = await import('./stayRates')

afterEach(() => {
  invoke.mockReset()
  resetRates()
})

describe('hostelworldId', () => {
  it('finds the property id in the link forms Hostelworld uses', () => {
    expect(hostelworldId('https://www.hostelworld.com/pwa/hosteldetails.php/TEST01-Hostel/Testville/123456')).toBe('123456')
    expect(hostelworldId('https://www.hostelworld.com/hosteldetails.php/Name/City/123456?from=2026-12-10&to=2026-12-13')).toBe('123456')
    expect(hostelworldId('https://hostelworld.com/st/hostels/p/123456/test01-hostel/')).toBe('123456')
    expect(hostelworldId('  https://www.hostelworld.com/pwa/hosteldetails.php/X/Y/12345 ')).toBe('12345')
  })

  it('gives null for other sites, the home page and nonsense', () => {
    expect(hostelworldId('https://www.booking.com/hotel/co/test01.html')).toBeNull()
    expect(hostelworldId('https://www.hostelworld.com/')).toBeNull()
    expect(hostelworldId('https://nothostelworld.com/p/123456')).toBeNull()
    expect(hostelworldId('test01 hostel')).toBeNull()
  })

  it('liveLink is the Hostelworld link of a place with a property id', () => {
    expect(liveLink({ links: [{ site: 'booking', url: 'https://www.booking.com/x' }, { site: 'hostelworld', url: 'https://www.hostelworld.com/pwa/hosteldetails.php/A/B/123456' }] })).toContain('123456')
    expect(liveLink({ links: [{ site: 'hostelworld', url: 'https://www.hostelworld.com/' }] })).toBeNull()
    expect(liveLink({ links: [] })).toBeNull()
  })
})

describe('fetchRates', () => {
  it('asks the function once per place and dates within the fresh window', async () => {
    invoke.mockResolvedValue({ data: { lodging_id: 'l1', fetched: true, rooms: 2, prices: 2 }, error: null })
    const a = fetchRates('l1', '2026-12-10', '2026-12-13', 1000)
    const b = fetchRates('l1', '2026-12-10', '2026-12-13', 2000)
    expect(await a).toEqual({ ok: true, lodging_id: 'l1', fetched: true, rooms: 2, prices: 2 })
    expect(await b).toBe(await a)
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('stay-rates', { body: { lodging_id: 'l1', check_in: '2026-12-10', check_out: '2026-12-13' } })
    await fetchRates('l1', '2026-12-10', '2026-12-14', 3000)
    expect(invoke).toHaveBeenCalledTimes(2)
    await fetchRates('l1', '2026-12-10', '2026-12-13', 1000 + 11 * 60000)
    expect(invoke).toHaveBeenCalledTimes(3)
  })

  it('a failed call is not remembered, and the error of the function is the message', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { context: new Response(JSON.stringify({ error: 'The place has no Hostelworld link.' }), { status: 400 }) } })
    expect(await fetchRates('l2', '2026-12-10', '2026-12-13', 1000)).toEqual({ ok: false, message: 'The place has no Hostelworld link.' })
    invoke.mockResolvedValueOnce({ data: null, error: new Error('down') })
    expect(await fetchRates('l2', '2026-12-10', '2026-12-13', 2000)).toEqual({ ok: false, message: 'Hostelworld could not be asked right now.' })
    expect(invoke).toHaveBeenCalledTimes(2)
  })
})

describe('addFromLink', () => {
  it('refuses a link that is not Hostelworld without a call', async () => {
    expect(await addFromLink('https://www.booking.com/hotel/x', 'SMR', '2026-12-10', '2026-12-13')).toEqual({ ok: false, message: 'That is not a Hostelworld link to a place.' })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('sends the link and the place', async () => {
    invoke.mockResolvedValue({ data: { lodging_id: 'new', fetched: true, rooms: 3, prices: 3 }, error: null })
    const r = await addFromLink(' https://www.hostelworld.com/pwa/hosteldetails.php/A/B/123456 ', 'SMR', '2026-12-10', '2026-12-13')
    expect(r).toEqual({ ok: true, lodging_id: 'new', fetched: true, rooms: 3, prices: 3 })
    expect(invoke).toHaveBeenCalledWith('stay-rates', { body: { url: 'https://www.hostelworld.com/pwa/hosteldetails.php/A/B/123456', place_id: 'SMR', check_in: '2026-12-10', check_out: '2026-12-13' } })
  })
})

describe('remember', () => {
  it('makes the next fetchRates within the fresh window skip the call', async () => {
    remember('l9', '2026-12-10', '2026-12-13', { ok: true, lodging_id: 'l9', fetched: true, rooms: 2, prices: 2 }, 1000)
    expect(await fetchRates('l9', '2026-12-10', '2026-12-13', 2000)).toMatchObject({ ok: true, lodging_id: 'l9' })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('does not remember a failed answer', async () => {
    remember('l9', '2026-12-10', '2026-12-13', { ok: false, message: 'down' }, 1000)
    invoke.mockResolvedValue({ data: { lodging_id: 'l9', fetched: true, rooms: 0, prices: 0 }, error: null })
    await fetchRates('l9', '2026-12-10', '2026-12-13', 2000)
    expect(invoke).toHaveBeenCalledTimes(1)
  })
})
