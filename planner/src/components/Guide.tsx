import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AppMark } from './Consent'
import { Caret, Check, Copy } from './icons'

// The public guide to the connector and the plugin, at /?guide. It needs no session, so it can be linked to anyone.
// Meaning sits in form: numbered steps, a prompt in a chat bubble with its copy button, a tool group that opens.

/** The connector's address, the same as docs/connector.md. */
export const SERVER_URL = 'https://n1e8j7vob1.execute-api.eu-west-1.amazonaws.com/mcp'

export const guideRequested = (search: string) => new URLSearchParams(search).has('guide')

const PLUGIN_STEPS = ['/plugin marketplace add Olafcito/latam-trip', '/plugin install flight-crawler@latam-trip']
const CODE_ADD = `claude mcp add --transport http latam-trip ${SERVER_URL}`

const SCENARIOS: { title: string; prompt: string }[] = [
  {
    title: 'Find a first route',
    prompt: 'I want to travel to South America flying from Copenhagen. I am thinking of starting in Colombia, then backpacking north through Central America and flying home from there. I am travelling for 2 months, so please help me find an initial route.',
  },
  {
    title: 'Price the long flights',
    prompt: 'Price the long flights for my Colombia trip. Look at Copenhagen to Bogotá in early December and the way home from Central America in early February, and show me the cheapest in Danish kroner.',
  },
  {
    title: 'Find stays for the first nights',
    prompt: 'Find places to stay for my first 3 nights in Cartagena. I want a social hostel with a dorm bed or a cheap private room, close to the old town, with free cancellation.',
  },
  {
    title: 'Change a stop',
    prompt: 'Swap the stop in Medellín for Salento in my Colombia trip and show me the new route on the map.',
  },
  {
    title: 'Share it with a friend',
    prompt: 'Share my Colombia trip with my friend so we can plan the route together.',
  },
]

type Group = { name: string; tools: { names: string; what: string }[] }
const crud = (t: string) => ['list', 'get', 'add', 'update', 'delete'].map((v) => `${v}_${t}`).join(' ')

// Taken from docs/connector.md and latam_trip_mcp/core.py
const GROUPS: Group[] = [
  { name: 'Trips', tools: [
    { names: crud('trip'), what: 'Saved as versions, a change keeps the old ones' },
    { names: 'set_leg_date', what: 'Put one leg on a day' },
    { names: 'shift_leg', what: 'Move a leg and every later leg' },
  ] },
  { name: 'Flights and ways', tools: [
    { names: crud('flight'), what: 'Needs only from, to, date and price in DKK' },
    { names: crud('connection'), what: 'A bus, boat, train or other way between two places' },
  ] },
  { name: 'Places and things to do', tools: [
    { names: crud('place'), what: 'A town, beach or airport on the map' },
    { names: crud('experience'), what: 'Things to do at a place' },
    { names: 'list_add list_remove', what: 'Put a place or an experience on a saved list, or take it off' },
  ] },
  { name: 'Stays', tools: [
    { names: crud('lodging'), what: 'A place to stay, with photos, rating, distances and rooms' },
    { names: 'add_lodging_price', what: 'Prices for rooms that exist, in DKK' },
    { names: crud('stay'), what: 'The older crawled stay prices, read by everyone and changed only by the admin' },
  ] },
  { name: 'Bookings', tools: [
    { names: crud('booking'), what: 'A ticket or a bed that is paid for, one row per leg or stay' },
    { names: 'attach_booking_file', what: 'Attach a PDF or photo of up to 4 MB' },
    { names: 'attach_booking_upload', what: 'A signed upload link for a larger file' },
  ] },
  { name: 'Tasks', tools: [
    { names: crud('task'), what: 'Work for the research agents' },
    { names: 'claim_task finish_task fail_task', what: 'For the cloud task runner: take a task, store its result or close it as failed' },
  ] },
  { name: 'Account', tools: [
    { names: 'get_profile update_profile', what: 'Home airport, currency, longest journey, travel style and rules' },
    { names: 'export_account', what: 'A copy of every row the account holds' },
    { names: 'delete_account', what: 'Delete the account and everything in it, for good' },
  ] },
]

/** Puts text on the clipboard and shows a check for a moment. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  const timer = useRef<number>(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setDone(false), 1600)
    } catch {
      setDone(false)
    }
  }
  return (
    <button type="button" className="gd-copy" data-done={done || undefined} onClick={copy} aria-label={`Copy ${label}`} title={`Copy ${label}`}>
      <span className="gd-copy-i gd-copy-a" aria-hidden="true"><Copy s={15} /></span>
      <span className="gd-copy-i gd-copy-b" aria-hidden="true"><Check s={15} /></span>
      <span className="vh" role="status">{done ? 'Copied' : ''}</span>
    </button>
  )
}

function Snippet({ text, label }: { text: string; label: string }) {
  return (
    <div className="gd-snip">
      <code>{text}</code>
      <CopyButton text={text} label={label} />
    </div>
  )
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="gd-steps">
      {items.map((s, i) => <li key={i}><span>{s}</span></li>)}
    </ol>
  )
}

export function Guide() {
  return (
    <div className="app">
      <main className="main gd">
        <header className="gd-head">
          <AppMark s={44} className="gd-mark" />
          <h1>Plan a trip with Latam trip</h1>
        </header>

        <section aria-labelledby="gd-add">
          <h2 id="gd-add" className="gd-h"><span className="gd-n">1</span>Add it</h2>
          <div className="gd-pair">
            <article className="card gd-card">
              <h3>Claude</h3>
              <p className="gd-sub">The connector</p>
              <Steps items={[
                <>Open <b>Settings</b>, then <b>Connectors</b></>,
                <>Press <b>Add custom connector</b></>,
                <>Name it <b>Latam trip</b> and paste the server address. Leave the advanced fields empty</>,
              ]} />
              <Snippet text={SERVER_URL} label="the server address" />
              <p className="gd-sub">The plugin with its skills, in Claude Code</p>
              <Snippet text={PLUGIN_STEPS[0]} label="the marketplace command" />
              <Snippet text={PLUGIN_STEPS[1]} label="the install command" />
            </article>

            <article className="card gd-card">
              <h3>ChatGPT</h3>
              <p className="gd-sub">The connector only, without the plugin skills</p>
              <Steps items={[
                <>Open <b>Settings</b>, then <b>Apps</b>, then <b>Advanced settings</b> and turn on <b>Developer mode</b></>,
                <>Press <b>Create app</b> and name it <b>Latam trip</b></>,
                <>Paste the server address and choose <b>OAuth</b> as the authentication</>,
                <>Tick the box that trusts the app and press <b>Create</b></>,
              ]} />
              <Snippet text={SERVER_URL} label="the server address" />
              <ul className="gd-chips" aria-label="Plans with developer mode">
                {['Plus', 'Pro', 'Business', 'Enterprise', 'Edu'].map((p) => <li key={p}>{p}</li>)}
              </ul>
            </article>
          </div>
          <p className="gd-after">The first time, press Connect. Latam trip asks for your email address, sends it a sign in link and shows what the assistant may do. Press Allow.</p>
        </section>

        <section aria-labelledby="gd-start">
          <h2 id="gd-start" className="gd-h"><span className="gd-n">2</span>Start a trip</h2>
          <ul className="gd-scen">
            {SCENARIOS.map((s, i) => (
              <li key={s.title} className={i === 0 ? 'gd-first' : undefined}>
                <h3>{s.title}</h3>
                <div className="gd-bubble">
                  <p>{s.prompt}</p>
                  <CopyButton text={s.prompt} label={`the prompt ${s.title}`} />
                </div>
              </li>
            ))}
          </ul>
          <p className="gd-after">The trip appears in the planner under <b>Trips</b>, and on the <b>Map</b>.</p>
        </section>

        <section aria-labelledby="gd-tools">
          <h2 id="gd-tools" className="gd-h"><span className="gd-n">3</span>What the connector can do</h2>
          <div className="gd-groups">
            {GROUPS.map((g) => (
              <details key={g.name} className="card gd-group">
                <summary><span>{g.name}</span><Caret s={14} dir="d" /></summary>
                <ul>
                  {g.tools.map((t) => (
                    <li key={t.names}>
                      <code>{t.names}</code>
                      <span>{t.what}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
          <p className="gd-after">The same server works in Claude Code.</p>
          <Snippet text={CODE_ADD} label="the Claude Code command" />
        </section>
      </main>
    </div>
  )
}

/** The small way in from the sign in screen and the profile sheet. */
export function GuideLink({ className = 'gd-link' }: { className?: string }) {
  return <a className={className} href="/?guide" target="_blank" rel="noopener">How to use it</a>
}
