import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  classifyBathroom,
  classifyPrivate,
  looksLikeBotCheck,
  nightsBetween,
  parseBeds,
  parseCancellation,
  parseDate,
  parseDkk,
  parsePage,
} from './parse.mjs'

const read = (name) => fs.readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8')
const opts = { checkIn: '2026-12-08', checkOut: '2026-12-10', pageUrl: 'https://www.booking.com/hotel/xx/test.html?checkin=2026-12-08' }
const page = parsePage(read('hotel.html'), opts)
const room = (part) => page.rooms.find((r) => r.name.includes(part))

test('photos: eight in page order with no caption', () => {
  assert.equal(page.photos.length, 8)
  assert.deepEqual(Object.keys(page.photos[0]), ['url', 'caption'])
  assert.equal(page.photos[0].caption, null)
  assert.match(page.photos[0].url, /^https:\/\/cf\.bstatic\.com\/xdata\/images\/hotel\/max1024x768\//)
  assert.equal(new Set(page.photos.map((p) => p.url)).size, 8)
})

test('rooms: one entry per room type with a string id', () => {
  assert.equal(page.rooms.length, 5)
  for (const r of page.rooms) {
    assert.equal(typeof r.site_id, 'string')
    assert.match(r.site_id, /^\d+$/)
    assert.equal(r.notes, null)
    assert.equal(r.prices.length, 1)
  }
  assert.equal(new Set(page.rooms.map((r) => r.site_id)).size, 5)
})

test('dorm bed: not private, shared bathroom, cheapest rate is the non refundable one', () => {
  const r = room('14-Bed')
  assert.equal(r.private, false)
  assert.equal(r.bathroom, 'shared')
  assert.equal(r.beds, 1)
  const p = r.prices[0]
  assert.equal(p.total_dkk, 231)
  assert.equal(p.per_night_dkk, 116)
  assert.equal(p.refundable, 'no')
  assert.equal(p.cancel_until, null)
  assert.equal(p.available, null)
})

test('a discounted rate gives the price shown, not the old one struck through before it', () => {
  const html = read('hotel.html')
  const at = html.indexOf('<div class="bui-price-display__value')
  const struck = html.slice(0, at) + '<div class="bui-price-display__original"><s>DKK&nbsp;9999</s></div>' + html.slice(at)
  const totals = (h) => parsePage(h, opts).rooms.flatMap((r) => r.prices.map((p) => p.total_dkk))
  assert.deepEqual(totals(struck), totals(html))
  assert.ok(!totals(struck).includes(9999))
})

test('free cancellation rate gives the cancel date and a price per night', () => {
  const r = room('Triple Room')
  assert.equal(r.private, true)
  assert.equal(r.beds, 3)
  const p = r.prices[0]
  assert.equal(p.refundable, 'yes')
  assert.equal(p.cancel_until, '2026-12-03')
  assert.equal(p.total_dkk, 664)
  assert.equal(p.per_night_dkk, 332)
  assert.equal(p.check_in, '2026-12-08')
  assert.equal(p.check_out, '2026-12-10')
  assert.match(p.url, /#RD\d+$/)
  assert.ok(p.url.endsWith(`#RD${r.site_id}`))
})

test('only N left becomes available', () => {
  assert.equal(room('Private Bathroom').prices[0].available, 7)
  assert.equal(room('Two Double Beds').prices[0].available, 2)
  assert.equal(room('Triple Room').prices[0].available, 1)
  assert.equal(room('Private Bathroom').bathroom, 'private')
})

test('each room keeps its cheapest rate plan', () => {
  assert.equal(room('Two Double Beds').prices[0].total_dkk, 611)
  assert.equal(room('Private Bathroom').prices[0].total_dkk, 774)
})

test('room photos come from the associated room list', () => {
  for (const r of page.rooms) assert.match(r.photo, /^https:\/\/cf\.bstatic\.com\//)
})

test('a page without dates lists rooms with empty prices', () => {
  const p = parsePage(read('hotel-nodates.html'))
  assert.equal(p.rooms.length, 6)
  assert.deepEqual(p.rooms.map((r) => r.prices.length), [0, 0, 0, 0, 0, 0])
  const bath = p.rooms.find((r) => r.name === 'Single Room with Bathroom')
  assert.equal(bath.bathroom, 'private')
  assert.equal(bath.beds, 1)
  assert.equal(p.rooms.find((r) => r.name === 'Classic Triple Room').beds, 3)
  assert.equal(p.rooms.find((r) => r.name === 'Family Room').beds, 2)
})

test('parseCancellation', () => {
  assert.deepEqual(parseCancellation('Free cancellation before 3 December 2026'), { refundable: 'yes', cancel_until: '2026-12-03' })
  assert.deepEqual(parseCancellation('Free cancellation'), { refundable: 'yes', cancel_until: null })
  assert.deepEqual(parseCancellation('Free cancellation until 20 Dec', '2026-12-25'), { refundable: 'yes', cancel_until: '2026-12-20' })
  assert.deepEqual(parseCancellation('Non-refundable'), { refundable: 'no', cancel_until: null })
  assert.deepEqual(parseCancellation('Partially refundable'), { refundable: 'partly', cancel_until: null })
  assert.deepEqual(parseCancellation('Pay at the property'), { refundable: null, cancel_until: null })
})

test('parseDkk reads whole kroner and ignores other currencies', () => {
  assert.equal(parseDkk('DKK 1,307'), 1307)
  assert.equal(parseDkk('Price DKK 231 Includes taxes'), 231)
  assert.equal(parseDkk('DKK 1,234,567'), 1234567)
  assert.equal(parseDkk('US$ 35'), null)
})

test('parseDate and nightsBetween', () => {
  assert.equal(parseDate('3 December 2026'), '2026-12-03')
  assert.equal(parseDate('30 Dec', '2027-01-05'), '2026-12-30')
  assert.equal(parseDate('nothing'), null)
  assert.equal(nightsBetween('2026-12-08', '2026-12-10'), 2)
  assert.equal(nightsBetween('2026-12-10', '2026-12-08'), null)
  assert.equal(nightsBetween(null, '2026-12-08'), null)
})

test('parseBeds sums beds and treats alternatives as one choice', () => {
  assert.equal(parseBeds('1 single bed and 2 double beds'), 3)
  assert.equal(parseBeds('1 bunk bed'), 1)
  assert.equal(parseBeds('1 double bed or 2 single beds'), 2)
  assert.equal(parseBeds('Choose your bed (if available) 1 extra-large double bed 2 large double beds'), 2)
  assert.equal(parseBeds('Sleeps 2'), null)
  assert.equal(parseBeds(null), null)
})

test('private and bathroom guesses from the room name', () => {
  assert.equal(classifyPrivate('Bed in 6-Bed Mixed Dormitory Room'), false)
  assert.equal(classifyPrivate('Bed in Female Dormitory Room'), false)
  assert.equal(classifyPrivate('Capsule Bed'), false)
  assert.equal(classifyPrivate('Double Room'), true)
  assert.equal(classifyPrivate('Something Unusual'), null)
  assert.equal(classifyBathroom('Twin Room with Shared Bathroom'), 'shared')
  assert.equal(classifyBathroom('Double Room with Private Bathroom'), 'private')
  assert.equal(classifyBathroom('Double Room'), null)
})

test('a bot check page is recognised and a hotel page is not', () => {
  assert.equal(looksLikeBotCheck('<html><body>Please verify you are human. captcha</body></html>'), true)
  assert.equal(looksLikeBotCheck(read('hotel.html')), false)
  assert.equal(looksLikeBotCheck('<html><body>hello</body></html>'), false)
})
