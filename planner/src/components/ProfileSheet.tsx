import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { changes, emptyProfile, formErrors, loadProfile, saveProfile, toForm, type Profile, type ProfileErrors, type ProfileField, type ProfileForm } from '../lib/profile'
import { Bag, Cash, Check, Home, Hourglass, Note, Person } from './icons'
import { Modal } from './Modal'

// The signed in person's own profile, the row the connector's get_profile and update_profile keep.
// The way in is the round person mark at the end of the header, where people look for their own
// settings. The sheet is a grouped list like the booking form's: an icon and a name to a row, the
// value on the right. A bad field turns red on its own row and says why there, nowhere else.

/** The person mark in the header and the sheet it opens. */
export function ProfileButton({ ownerId }: { ownerId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="me" aria-label="Profile" title="Profile" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className="me-face"><Person s={16} /></span>
      </button>
      {open && (
        <Modal label="Profile" className="pf-md" onClose={() => setOpen(false)}>
          {(close) => <ProfileSheet ownerId={ownerId} onDone={close} />}
        </Modal>
      )}
    </>
  )
}

function Row({ icon, label, htmlFor, why, whyId, children, notes }: { icon: ReactNode; label: string; htmlFor: string; why?: string; whyId: string; children: ReactNode; notes?: boolean }) {
  return (
    <li className={notes ? 'bf-row bf-notes' : 'bf-row'} data-bad={why ? true : undefined}>
      <span className="bf-i" aria-hidden="true">{icon}</span>
      <label className="bf-k" htmlFor={htmlFor}>{label}</label>
      {notes ? children : <span className="bf-v">{children}</span>}
      {why && <span className="pf-why" id={whyId}>{why}</span>}
    </li>
  )
}

type Load = { state: 'loading' } | { state: 'failed'; why: string } | { state: 'ready'; saved: Profile; exists: boolean }

export function ProfileSheet({ ownerId, onDone }: { ownerId: string; onDone: () => void }) {
  const id = useId()
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [form, setForm] = useState<ProfileForm>(() => toForm(emptyProfile()))
  // a field is judged once it has been left or a save was tried, and from then on as it is typed
  const [judged, setJudged] = useState<Set<ProfileField>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const refs = useRef<Partial<Record<ProfileField, HTMLInputElement | HTMLTextAreaElement | null>>>({})

  useEffect(() => {
    let live = true
    loadProfile(ownerId).then(
      ({ profile, empty }) => {
        if (!live) return
        setLoad({ state: 'ready', saved: profile, exists: !empty })
        setForm(toForm(profile))
      },
      (e: unknown) => live && setLoad({ state: 'failed', why: e instanceof Error ? e.message : String(e) }),
    )
    return () => { live = false }
  }, [ownerId])

  const ready = load.state === 'ready'
  const all = formErrors(form)
  const shown: ProfileErrors = {}
  for (const k of judged) if (all[k]) shown[k] = all[k]
  const patch = ready ? changes(load.saved, form) : {}
  const dirty = Object.keys(patch).length > 0

  const typed = (k: ProfileField) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const v = e.target.value
    setForm((f) => ({ ...f, [k]: v }))
    setFailed(null)
  }
  const left = (k: ProfileField) => () => {
    if (form[k].trim() !== '') setJudged((s) => (s.has(k) ? s : new Set(s).add(k)))
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!ready || busy || !dirty) return
    const bad = (Object.keys(all) as ProfileField[]).filter((k) => all[k])
    if (bad.length) {
      setJudged((s) => new Set([...s, ...bad]))
      refs.current[bad[0]]?.focus()
      return
    }
    setBusy(true)
    try {
      await saveProfile(ownerId, patch, load.exists)
      onDone()
    } catch (err) {
      setFailed(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const said = load.state === 'failed' ? 'Could not load the profile' : failed ? 'Could not save' : null
  const field = (k: ProfileField) => ({
    id: `${id}-${k}`,
    name: k,
    ref: (el: HTMLInputElement | HTMLTextAreaElement | null) => { refs.current[k] = el },
    value: form[k],
    onChange: typed(k),
    onBlur: left(k),
    disabled: !ready || busy,
    'aria-invalid': shown[k] ? true : undefined,
    'aria-describedby': shown[k] ? `${id}-${k}-why` : undefined,
  })
  const code = { className: 'bf-in bf-code', maxLength: 3, autoComplete: 'off', autoCapitalize: 'characters', autoCorrect: 'off', spellCheck: false, enterKeyHint: 'next' } as const

  return (
    <form className="fl bf pf" aria-labelledby={`${id}-h`} aria-busy={load.state === 'loading' || undefined} data-loading={load.state === 'loading' || undefined} onSubmit={save} noValidate>
      <div className="fl-top bf-top">
        <header className="fl-h">
          <h3 id={`${id}-h`}>Profile</h3>
        </header>
      </div>

      <div className="bf-body">
        <ul className="bf-list">
          <Row icon={<Home s={16} />} label="Home airport" htmlFor={`${id}-home_airport`} why={shown.home_airport} whyId={`${id}-home_airport-why`}>
            <input {...field('home_airport')} {...code} placeholder="CPH" />
          </Row>
          <Row icon={<Cash s={16} />} label="Currency" htmlFor={`${id}-currency`} why={shown.currency} whyId={`${id}-currency-why`}>
            <input {...field('currency')} {...code} placeholder="DKK" />
          </Row>
          <Row icon={<Hourglass s={16} />} label="Longest journey" htmlFor={`${id}-max_hours`} why={shown.max_hours} whyId={`${id}-max_hours-why`}>
            <span className="bf-kr">
              <input {...field('max_hours')} className="bf-in pf-num" inputMode="decimal" autoComplete="off" enterKeyHint="next" placeholder="30" />
              <span aria-hidden="true">h</span>
            </span>
          </Row>
        </ul>

        <ul className="bf-list">
          <Row icon={<Bag s={16} />} label="Travel style" htmlFor={`${id}-travel_style`} why={shown.travel_style} whyId={`${id}-travel_style-why`}>
            <input {...field('travel_style')} className="bf-in" autoComplete="off" enterKeyHint="next" placeholder="Slow, social, beaches" />
          </Row>
          <Row icon={<Note s={16} />} label="Rules" htmlFor={`${id}-rules`} why={shown.rules} whyId={`${id}-rules-why`} notes>
            <textarea {...field('rules')} className="bf-in" rows={4} />
          </Row>
        </ul>
      </div>

      <footer className="fl-foot bf-foot">
        <p className="bf-said" role="status" data-bad={said ? true : undefined}>{said}</p>
        <button type="button" className="btn small" onClick={onDone} disabled={busy}>Cancel</button>
        <button type="submit" className="btn small bf-go" disabled={!ready || busy || !dirty}><Check s={14} />{busy ? 'Saving' : 'Save'}</button>
      </footer>
    </form>
  )
}
