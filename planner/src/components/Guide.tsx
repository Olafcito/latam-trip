import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { AppMark } from './Consent'
import { Caret, Check, Copy } from './icons'

// The public guide to the connector and the plugin, at ?guide. It needs no session, so it can be linked to anyone.
// Meaning sits in form: one setup at a time under a switch, a prompt in a chat bubble with its copy button, a tool group that opens.

/** The connector's address, the same as docs/connector.md. */
export const SERVER_URL = 'https://n1e8j7vob1.execute-api.eu-west-1.amazonaws.com/mcp'

export const guideRequested = (search: string) => new URLSearchParams(search).has('guide')

const PLUGIN_STEPS = ['/plugin marketplace add Olafcito/latam-trip', '/plugin install flight-crawler@latam-trip']
const CODE_ADD = `claude mcp add --transport http latam-trip ${SERVER_URL}`

/** slot is the part of a prompt a reader is expected to change, shown marked. */
const SCENARIOS: { title: string; prompt: string; slot?: string }[] = [
  {
    title: 'Find a first route',
    slot: 'Copenhagen',
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

// Taken from docs/connector.md and latam_trip_mcp/core.py. The stay tools that write are closed for everyone, so only the reads show.
const GROUPS: Group[] = [
  { name: 'Trips', tools: [
    { names: crud('trip'), what: 'Save, read, change and delete trips. A change keeps the old versions' },
    { names: 'set_leg_date', what: 'Put one leg on a day' },
    { names: 'shift_leg', what: 'Move a leg and every later leg' },
    { names: 'share_trip stop_sharing', what: 'Give a friend a read only link to a trip, or end it' },
  ] },
  { name: 'Flights and ways', tools: [
    { names: crud('flight'), what: 'Keep a flight with its day and price in DKK' },
    { names: crud('connection'), what: 'Keep a bus, boat, train or other way between two places' },
  ] },
  { name: 'Places and things to do', tools: [
    { names: crud('place'), what: 'A town, beach or airport on the map' },
    { names: crud('experience'), what: 'Things to do at a place' },
    { names: 'list_add list_remove', what: 'Put a place or an experience on a saved list, or take it off' },
  ] },
  { name: 'Stays', tools: [
    { names: crud('lodging'), what: 'A place to stay, with photos, rating, distances and rooms' },
    { names: 'add_lodging_price', what: 'Prices for rooms that exist, in DKK' },
    { names: 'list_stay get_stay', what: 'The older crawled stay prices, read only' },
  ] },
  { name: 'Bookings', tools: [
    { names: crud('booking'), what: 'A ticket or a bed that is paid for, one row per leg or stay' },
    { names: 'attach_booking_file attach_booking_upload', what: 'Attach a PDF or photo to a booking' },
  ] },
  { name: 'Tasks', tools: [
    { names: crud('task'), what: 'Work for the research agents' },
    { names: 'claim_task finish_task fail_task', what: 'Take a task, store its result or close it as failed' },
  ] },
  { name: 'Account', tools: [
    { names: 'get_profile update_profile', what: 'Home airport, currency, longest journey, travel style and rules' },
    { names: 'export_account', what: 'A copy of every row the account holds' },
    { names: 'delete_account', what: 'Delete the account and everything in it, for good' },
  ] },
]

type Assistant = 'claude' | 'chatgpt'

/** Puts text on the clipboard and shows a check for a moment. When the clipboard is closed it selects the text, so a long press or Ctrl+C finishes it. */
function CopyButton({ text, label, source }: { text: string; label: string; source: RefObject<HTMLElement | null> }) {
  const [state, setState] = useState<'idle' | 'done' | 'select'>('idle')
  const timer = useRef<number>(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const copy = async () => {
    window.clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(text)
      setState('done')
      timer.current = window.setTimeout(() => setState('idle'), 1600)
    } catch {
      if (source.current) window.getSelection()?.selectAllChildren(source.current)
      setState('select')
      timer.current = window.setTimeout(() => setState('idle'), 4000)
    }
  }
  return (
    <button type="button" className="gd-copy" data-done={state === 'done' || undefined} data-select={state === 'select' || undefined} onClick={copy} aria-label={`Copy ${label}`} title={`Copy ${label}`}>
      <span className="gd-copy-i gd-copy-a" aria-hidden="true"><Copy s={15} /></span>
      <span className="gd-copy-i gd-copy-b" aria-hidden="true"><Check s={15} /></span>
      <span className="gd-copy-t" aria-hidden="true">Select and copy</span>
      <span className="vh" role="status">{state === 'done' ? 'Copied' : state === 'select' ? 'Select and copy' : ''}</span>
    </button>
  )
}

function Snippet({ text, label }: { text: string; label: string }) {
  const ref = useRef<HTMLElement>(null)
  return (
    <div className="gd-snip">
      <code ref={ref}>{text}</code>
      <CopyButton text={text} label={label} source={ref} />
    </div>
  )
}

function Prompt({ s }: { s: (typeof SCENARIOS)[number] }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const at = s.slot ? s.prompt.indexOf(s.slot) : -1
  return (
    <div className="gd-bubble">
      <p ref={ref}>
        {at < 0 ? s.prompt : <>{s.prompt.slice(0, at)}<mark className="gd-slot">{s.slot}</mark>{s.prompt.slice(at + s.slot!.length)}</>}
      </p>
      <CopyButton text={s.prompt} label={`the prompt ${s.title}`} source={ref} />
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

const SETUP: Record<Assistant, { note?: string; steps: ReactNode[] }> = {
  claude: {
    steps: [
      <>Open <b>Settings</b>, in the menu on a phone or under your name on a computer, then <b>Connectors</b></>,
      <>Press <b>Add custom connector</b></>,
      <>Name it <b>Latam trip</b> and paste the server address. Leave the advanced fields empty<Snippet text={SERVER_URL} label="the server address" /></>,
      <>Press <b>Connect</b> and enter your email address</>,
      <>Open the sign in link that arrives in your mail</>,
      <>Come back to Claude and press <b>Allow</b></>,
    ],
  },
  chatgpt: {
    note: 'Needs ChatGPT Plus, Pro, Business, Enterprise or Edu, in a browser at chatgpt.com',
    steps: [
      <>Open <b>Settings</b>, in the menu on a phone or under your name on a computer, then <b>Apps</b>, then <b>Advanced settings</b> and turn on <b>Developer mode</b></>,
      <>Press <b>Create app</b> and name it <b>Latam trip</b></>,
      <>Paste the server address and choose <b>OAuth</b> as the authentication<Snippet text={SERVER_URL} label="the server address" /></>,
      <>Tick the box that trusts the app and press <b>Create</b></>,
      <>Press <b>Connect</b> and enter your email address</>,
      <>Open the sign in link that arrives in your mail</>,
      <>Come back to ChatGPT and press <b>Allow</b></>,
    ],
  },
}

export function Guide({ initial = 'claude' }: { initial?: Assistant }) {
  const [who, setWho] = useState<Assistant>(initial)
  const setup = SETUP[who]
  return (
    <div className="app">
      <main className="main gd">
        <header className="gd-head">
          <AppMark s={44} className="gd-mark" />
          <div className="gd-intro">
            <p className="gd-kicker">YOUR TRIP, ONE GOOD FIRST STEP</p>
            <h1>Plan your journey with Latam trip</h1>
            <p className="gd-deck">Connect your assistant, describe the trip you have in mind, and shape the route together.</p>
          </div>
          <div className="gd-route-mark" aria-hidden="true"><span /><i /><i /><i /><span /></div>
        </header>

        <section aria-labelledby="gd-add">
          <h2 id="gd-add" className="gd-h"><span className="gd-n">1</span>Add the connector</h2>
          <p className="gd-section-note">Choose your assistant to see the right setup steps.</p>
          <div className="gd-switch" role="group" aria-label="Your assistant">
            {(['claude', 'chatgpt'] as const).map((a) => (
              <button key={a} type="button" aria-pressed={who === a} onClick={() => setWho(a)}>{a === 'claude' ? 'Claude' : 'ChatGPT'}</button>
            ))}
          </div>
          <article className="card gd-card">
            {setup.note && <p className="gd-sub">{setup.note}</p>}
            <Steps items={setup.steps} />
          </article>
        </section>

        <section aria-labelledby="gd-start">
          <h2 id="gd-start" className="gd-h"><span className="gd-n">2</span>Start a trip</h2>
          <p className="gd-section-note">Try a prompt as written, or copy it and make it your own.</p>
          <ul className="gd-scen">
            {SCENARIOS.map((s, i) => (
              <li key={s.title} className={i === 0 ? 'gd-first' : undefined}>
                <h3>{s.title}</h3>
                <Prompt s={s} />
              </li>
            ))}
          </ul>
          <p className="gd-after">The trip appears in the planner under <b>Trips</b>, and on the <b>Map</b>.</p>
        </section>

        <section aria-labelledby="gd-tools">
          <h2 id="gd-tools" className="gd-h gd-h-quiet">What the connector can do</h2>
          <div className="gd-groups">
            {GROUPS.map((g) => (
              <details key={g.name} className="card gd-group">
                <summary><span>{g.name}</span><Caret s={14} dir="d" /></summary>
                <ul>
                  {g.tools.map((t) => <li key={t.names}>{t.what}</li>)}
                </ul>
                <details className="gd-names">
                  <summary>Tool names</summary>
                  <p>{g.tools.map((t) => t.names).join(' ')}</p>
                </details>
              </details>
            ))}
          </div>
        </section>

        <section aria-labelledby="gd-dev" className="gd-dev">
          <h2 id="gd-dev" className="gd-h gd-h-quiet">For developers in Claude Code</h2>
          <p className="gd-sub">The plugin with its skills</p>
          <Snippet text={PLUGIN_STEPS[0]} label="the marketplace command" />
          <Snippet text={PLUGIN_STEPS[1]} label="the install command" />
          <p className="gd-sub">The connector alone</p>
          <Snippet text={CODE_ADD} label="the Claude Code command" />
        </section>
      </main>
    </div>
  )
}

/** The small way in from the sign in screen and the profile sheet. Relative, so it works under /preview/. */
export function GuideLink({ className = 'gd-link' }: { className?: string }) {
  return <a className={className} href="?guide" target="_blank" rel="noopener">How to use it</a>
}
