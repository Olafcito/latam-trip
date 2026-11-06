#!/usr/bin/env node
// Reads one lodging's Booking.com page in a headless browser and writes its photos, rooms and prices to a file.
// node plugin/scripts/booking/read.mjs LODGING_ID [--check-in YYYY-MM-DD --check-out YYYY-MM-DD] --out FILE
// Read only. It never clicks, signs in or books. Prints counts only.
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { looksLikeBotCheck, parsePage } from './parse.mjs'

// A plain desktop Chrome string. The default headless one is redirected without its dates.
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const DATE = /^\d{4}-\d{2}-\d{2}$/

class Failure extends Error {
  constructor(reason, code) {
    super(reason)
    this.code = code
  }
}

// Throws instead of calling process.exit, which can abort on Windows while a connection is closing.
function fail(reason, code = 1) {
  throw new Failure(reason, code)
}

function parseArgs(argv) {
  const args = { id: null, checkIn: null, checkOut: null, out: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--check-in') args.checkIn = argv[++i]
    else if (a === '--check-out') args.checkOut = argv[++i]
    else if (a === '--out') args.out = argv[++i]
    else if (!a.startsWith('--') && !args.id) args.id = a
    else fail(`unknown argument ${a}`, 2)
  }
  if (!args.id || !args.out) fail('usage: read.mjs LODGING_ID [--check-in D --check-out D] --out FILE', 2)
  if ((args.checkIn && !DATE.test(args.checkIn)) || (args.checkOut && !DATE.test(args.checkOut))) fail('dates must be YYYY-MM-DD', 2)
  if (Boolean(args.checkIn) !== Boolean(args.checkOut)) fail('give both --check-in and --check-out, or neither', 2)
  return args
}

function parseEnvFile(file) {
  const out = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.includes('=') || line.startsWith('#')) continue
    const i = line.indexOf('=')
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return out
}

/** SUPABASE_URL and SUPABASE_SECRET_KEY from the environment, else the first .env up the tree, else the main checkout's. */
function credentials() {
  let url = process.env.SUPABASE_URL
  let key = process.env.SUPABASE_SECRET_KEY
  const candidates = []
  for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
    candidates.push(path.join(dir, '.env'))
    if (path.dirname(dir) === dir) break
  }
  try {
    const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    candidates.push(path.join(path.dirname(path.resolve(common)), '.env'))
  } catch {
    // not in a git checkout
  }
  for (const file of candidates) {
    if (url && key) break
    if (!fs.existsSync(file)) continue
    const env = parseEnvFile(file)
    url ||= env.SUPABASE_URL
    key ||= env.SUPABASE_SECRET_KEY
  }
  if (!url || !key) fail('no SUPABASE_URL and SUPABASE_SECRET_KEY in the environment or any .env')
  return { base: `${url.replace(/\/$/, '')}/rest/v1`, headers: { apikey: key, Authorization: `Bearer ${key}` } }
}

async function rest(creds, query) {
  const res = await fetch(`${creds.base}/${query}`, { headers: creds.headers })
  if (!res.ok) fail(`Supabase answered ${res.status} for ${query.split('?')[0]}`)
  return res.json()
}

function browserPath() {
  const root =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    (process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
      : process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')
        : path.join(os.homedir(), '.cache', 'ms-playwright'))
  if (!fs.existsSync(root)) return undefined
  const shell = fs.readdirSync(root).filter((d) => d.startsWith('chromium_headless_shell-')).sort().pop()
  if (!shell) return undefined
  const dir = path.join(root, shell)
  for (const sub of fs.readdirSync(dir)) {
    const exe = path.join(dir, sub, process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell')
    if (fs.existsSync(exe)) return exe
  }
  return undefined
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const creds = credentials()

  const lodgings = await rest(creds, `lodgings?id=eq.${encodeURIComponent(args.id)}&select=id,links`)
  if (!lodgings.length) fail('no lodging with that id')
  const link = (lodgings[0].links ?? []).find((l) => l.site === 'booking')
  if (!link?.url) fail('the lodging has no Booking.com link')

  let { checkIn, checkOut } = args
  if (!checkIn) {
    const rooms = await rest(creds, `lodging_rooms?lodging_id=eq.${encodeURIComponent(args.id)}&select=id`)
    if (rooms.length) {
      const ids = rooms.map((r) => r.id).join(',')
      const [latest] = await rest(creds, `lodging_prices?room_id=in.(${ids})&select=check_in,check_out&order=check_in.desc&limit=1`)
      if (latest?.check_in && latest?.check_out) ({ check_in: checkIn, check_out: checkOut } = latest)
    }
  }
  if (!checkIn) {
    // The link the task runner stored carries the stay's dates, and without dates the room table is empty.
    const q = new URL(link.url).searchParams
    if (DATE.test(q.get('checkin') ?? '') && DATE.test(q.get('checkout') ?? '')) [checkIn, checkOut] = [q.get('checkin'), q.get('checkout')]
  }

  const url = new URL(link.url.split('?')[0])
  if (checkIn) {
    for (const [k, v] of Object.entries({ checkin: checkIn, checkout: checkOut, group_adults: 1, no_rooms: 1, group_children: 0, selected_currency: 'DKK' })) url.searchParams.set(k, v)
  }

  const browser = await chromium.launch({ headless: true, executablePath: browserPath() })
  let html
  try {
    const ctx = await browser.newContext({ locale: 'en-GB', userAgent: USER_AGENT })
    for (let attempt = 0; attempt < 2; attempt++) {
      const page = await ctx.newPage()
      await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await page.waitForSelector('#hprt-table, [data-testid="rt-name-link"]', { timeout: 30000 }).catch(() => {})
      await page.waitForFunction(() => /hotelPhotos:/.test(document.documentElement.innerHTML), null, { timeout: 5000 }).catch(() => {})
      const dropped = checkIn && !page.url().includes('checkin=')
      html = await page.content()
      await page.close()
      if (!dropped) break
      html = null
    }
  } finally {
    await browser.close()
  }

  if (!html) fail('Booking.com dropped the dates from the address twice')
  if (looksLikeBotCheck(html)) fail('the page shows a bot check')
  if (!/id="hprt-table"|rt-name-link/.test(html)) fail('no room table on the page')

  const { photos, rooms } = parsePage(html, { checkIn, checkOut, pageUrl: url.href })
  if (!rooms.length) fail('the room table held no rooms')

  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true })
  fs.writeFileSync(args.out, `${JSON.stringify({ lodging_id: args.id, photos, rooms }, null, 2)}\n`)
  const priced = rooms.filter((r) => r.prices.length).length
  console.log(`photos ${photos.length}, rooms ${rooms.length}, rooms with a price ${priced}, dates ${checkIn ? `${checkIn} to ${checkOut}` : 'none'}`)
}

main().catch((e) => {
  console.error(`read.mjs: ${String(e?.message ?? e).split('\n')[0].slice(0, 160)}`)
  process.exitCode = e instanceof Failure ? e.code : 1
})
