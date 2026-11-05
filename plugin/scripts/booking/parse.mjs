// Pure parsers for a Booking.com hotel page. They take the page HTML and return plain data.
// No browser and no network here, so everything is testable from a saved page.

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** Visible text of an HTML fragment, with scripts, styles, templates and icons dropped. */
export function textOf(html) {
  return decodeEntities(
    String(html ?? '')
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<template[\s\S]*?<\/template>|<svg[\s\S]*?<\/svg>/g, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
}

/** Whole nights between two YYYY-MM-DD dates, or null. */
export function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return null
  const a = Date.parse(`${checkIn}T00:00:00Z`)
  const b = Date.parse(`${checkOut}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return null
  return Math.round((b - a) / 86400000)
}

// ---------- photos ----------

/** The property's photos in page order, at most max, as large urls. */
export function parsePhotos(html, max = 8) {
  const urls = []
  const block = arrayBlock(html, 'hotelPhotos')
  if (block) for (const m of block.matchAll(/large_url:\s*'([^']+)'/g)) urls.push(m[1])
  if (!urls.length) {
    for (const m of html.matchAll(/https:\/\/cf\.bstatic\.com\/xdata\/images\/hotel\/max1024x768\/\d+\.(?:jpg|webp)\?k=[0-9A-Za-z]+[^"'\s)]*/g)) urls.push(m[0])
  }
  const seen = new Set()
  const out = []
  for (const u of urls) {
    const key = u.replace(/\?.*$/, '')
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ url: u.replace(/&amp;/g, '&'), caption: null })
    if (out.length >= max) break
  }
  return out
}

/** The text of a JS array literal `name: [ ... ],` on the page, up to its closing bracket line. */
function arrayBlock(html, name) {
  const start = html.indexOf(`${name}: [`)
  if (start < 0) return null
  const end = html.indexOf('\n],', start)
  return html.slice(start, end < 0 ? start + 400000 : end)
}

/** room id -> first room photo url, from the page's allRoomPhotos list. */
export function parseRoomPhotos(html) {
  const block = arrayBlock(html, 'allRoomPhotos')
  const map = new Map()
  if (!block) return map
  for (const m of block.matchAll(/large_url:\s*'([^']+)'[\s\S]*?associated_rooms:\s*\[([^\]]*)\]/g)) {
    for (const id of m[2].matchAll(/'(\d+)'/g)) if (!map.has(id[1])) map.set(id[1], m[1].replace(/&amp;/g, '&'))
  }
  return map
}

// ---------- room facts from the name and bed text ----------

const DORM = /\bdorm|dormitory|\bbed in\b|\bbunk|capsule|\b\d+-bed\b|\bshared room/i
const PRIVATE = /room|suite|apartment|studio|bungalow|cabin|villa|house|chalet|cottage|loft|penthouse|twin|double|single|triple|quadruple|family|private/i

/** true for a private room, false for a dorm bed, null if unclear. */
export function classifyPrivate(name) {
  if (DORM.test(name)) return false
  if (PRIVATE.test(name)) return true
  return null
}

/** "private", "shared" or null. */
export function classifyBathroom(name) {
  if (/shared (bath|toilet|facilit)|without (a )?(private )?bath/i.test(name)) return 'shared'
  if (/bathroom|ensuite|en suite/i.test(name)) return 'private'
  return null
}

/** Total bed count from text such as "1 single bed and 2 double beds", or null. */
export function parseBeds(text) {
  // "1 double bed or 2 single beds" are alternatives, so the larger set counts
  let best = null
  let source = String(text ?? '')
  // "Choose your bed" lists the options one after another, so each option is its own part
  if (/choose your bed/i.test(source)) source = source.replace(/(beds?)\s+(?=\d)/gi, '$1 or ')
  for (const part of source.split(/\bor\b/i)) {
    let total = 0
    let found = false
    for (const m of part.matchAll(/(\d+)\s+[a-z-]+(?:\s[a-z-]+)?\s+beds?\b/gi)) {
      total += Number(m[1])
      found = true
    }
    if (found && (best === null || total > best)) best = total
  }
  return best
}

// ---------- rate facts ----------

/** Whole kroner from text such as "DKK 1,307", or null when the currency is not DKK. */
export function parseDkk(text) {
  const m = /DKK\s*([\d.,]+)/.exec(String(text ?? ''))
  if (!m) return null
  const n = Number(m[1].replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n) : null
}

/** A date such as "3 December 2026" as YYYY-MM-DD. A missing year is taken from the stay. */
export function parseDate(text, checkIn = null) {
  const m = /(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?/.exec(String(text ?? ''))
  if (!m) return null
  const word = m[2].toLowerCase()
  const month = word.length >= 3 ? MONTHS.findIndex((name) => name.startsWith(word.slice(0, 3))) : -1
  if (month < 0) return null
  let year = m[3] ? Number(m[3]) : checkIn ? Number(checkIn.slice(0, 4)) : null
  if (year === null) return null
  const iso = (y) => `${y}-${String(month + 1).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`
  if (!m[3] && checkIn && iso(year) > checkIn) year -= 1
  return iso(year)
}

/** { refundable, cancel_until } from the cancellation text of one rate. */
export function parseCancellation(text, checkIn = null) {
  const t = String(text ?? '')
  if (/partial/i.test(t)) return { refundable: 'partly', cancel_until: null }
  if (/free cancellation/i.test(t)) {
    const m = /free cancellation\s+(?:before|until|up to|by|on)\s+([^.•]*?\d{1,2}\s+[A-Za-z]+(?:\s+\d{4})?)/i.exec(t)
    return { refundable: 'yes', cancel_until: m ? parseDate(m[1], checkIn) : null }
  }
  if (/non-?\s?refundable/i.test(t)) return { refundable: 'no', cancel_until: null }
  return { refundable: null, cancel_until: null }
}

// ---------- the room table ----------

function tableHtml(html) {
  const start = html.search(/<table[^>]*\bid="hprt-table"/)
  if (start < 0) return null
  const end = html.indexOf('</table>', start)
  return html.slice(start, end < 0 ? html.length : end)
}

function attr(tag, name) {
  const m = new RegExp(`${name}="([^"]*)"`).exec(tag)
  return m ? m[1] : null
}

/**
 * Rooms with their cheapest rate for the stay.
 * opts: { checkIn, checkOut, pageUrl } where the dates are YYYY-MM-DD.
 */
export function parseRooms(html, opts = {}) {
  const { checkIn = null, checkOut = null, pageUrl = null } = opts
  const table = tableHtml(html)
  if (!table) return parseUnpricedRooms(html, opts)

  const nightsFromHeader = Number(/Price for (\d+) nights?/i.exec(textOf(table.slice(0, 4000)))?.[1]) || null
  const nights = nightsBetween(checkIn, checkOut) ?? nightsFromHeader
  const photos = parseRoomPhotos(html)

  const rooms = new Map()
  const room = (id) => {
    if (!rooms.has(id)) rooms.set(id, { id, name: null, bedText: null, available: null, rates: [] })
    return rooms.get(id)
  }

  for (const row of table.split(/(?=<tr[\s>])/).slice(1)) {
    const tag = /^<tr[^>]*>/.exec(row)?.[0] ?? ''
    const blockId = attr(tag, 'data-block-id')
    const link = /<a[^>]*class="[^"]*hprt-roomtype-link[^"]*"[^>]*>/.exec(row)?.[0]
    const linkId = link ? attr(link, 'data-room-id') : null
    const id = linkId ?? blockId?.split('_')[0]
    if (!id) continue
    const r = room(id)

    if (link) {
      const name = /hprt-roomtype-icon-link[^>]*>([\s\S]*?)<\/span>/.exec(row)?.[1]
      if (name && !r.name) r.name = textOf(name)
      const beds = /hprt-roomtype-bed[\s\S]*?(?=hprt-roomtype-block|<\/th>)/.exec(row)?.[0]
      if (beds && !r.bedText) r.bedText = textOf(beds)
    }
    const left = /only_x_left[^>]*>([\s\S]*?)<\/span>/.exec(row)
    if (left && r.available === null) r.available = Number(/(\d+)/.exec(textOf(left[1]))?.[1]) || null

    const priceCell = /hprt-table-cell-price[\s\S]*?<\/td>/.exec(row)?.[0]
    // The price to pay sits in bui-price-display__value. A discounted rate shows its old price struck through
    // before it, so the whole cell is only read when that element is missing.
    const shown = priceCell && /bui-price-display__value[^>]*>([\s\S]*?)<\/(?:span|div)>/.exec(priceCell)?.[1]
    const total = priceCell ? (parseDkk(textOf(shown ?? '')) ?? parseDkk(textOf(priceCell))) : null
    if (total === null) continue
    const cancel =
      /data-testid="cancellation-subtitle"[\s\S]*?<\/li>/.exec(row)?.[0] ??
      /hprt-table-cell-conditions[\s\S]*?(?=hprt-conditions-modal_trigger|<\/td>)/.exec(row)?.[0] ??
      ''
    r.rates.push({ total, ...parseCancellation(textOf(cancel), checkIn) })
  }

  const out = []
  for (const r of rooms.values()) {
    if (!r.name) continue
    const best = r.rates.reduce((a, b) => (a === null || b.total < a.total ? b : a), null)
    out.push({
      site_id: r.id,
      name: r.name,
      beds: parseBeds(r.bedText),
      private: classifyPrivate(r.name),
      bathroom: classifyBathroom(r.name),
      photo: photos.get(r.id) ?? null,
      notes: null,
      prices: best
        ? [
            {
              check_in: checkIn,
              check_out: checkOut,
              total_dkk: best.total,
              per_night_dkk: nights ? Math.round(best.total / nights) : best.total,
              url: pageUrl ? `${pageUrl}#RD${r.id}` : null,
              refundable: best.refundable,
              cancel_until: best.cancel_until,
              available: r.available,
            },
          ]
        : [],
    })
  }
  return out
}

/** The page without dates lists room types only, with a "Show prices" button instead of a price. */
function parseUnpricedRooms(html, opts) {
  const photos = parseRoomPhotos(html)
  const out = []
  const seen = new Set()
  for (const m of html.matchAll(/<th[^>]*scope="row"[^>]*>([\s\S]*?)<\/th>/g)) {
    const link = /<a[^>]*data-testid="rt-name-link"[^>]*\bid="room_type_id_(\d+)"[^>]*>([\s\S]*?)<\/a>/.exec(m[1])
    if (!link || seen.has(link[1])) continue
    seen.add(link[1])
    const name = textOf(link[2])
    const bedText = [...m[1].matchAll(/<span[^>]*>\s*(\d+\s+[^<]*?beds?)\s*<\/span>/gi)].map((b) => b[1]).join(' and ')
    out.push({
      site_id: link[1],
      name,
      beds: parseBeds(bedText),
      private: classifyPrivate(name),
      bathroom: classifyBathroom(name),
      photo: photos.get(link[1]) ?? null,
      notes: null,
      prices: [],
    })
  }
  return out
}

/** Everything the reader needs from one page. */
export function parsePage(html, opts = {}) {
  return { photos: parsePhotos(html), rooms: parseRooms(html, opts) }
}

/** True when the page is a bot check or challenge instead of the hotel page. */
export function looksLikeBotCheck(html) {
  if (/id="hprt-table"|rt-name-link|hotelPhotos:/.test(html)) return false
  return /captcha|verify you are (a )?human|are you a robot|challenge-platform|awswaf|px-captcha|Just a moment/i.test(html)
}
