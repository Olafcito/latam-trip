import { useEffect, useId, useRef, useState, type ChangeEvent, type DragEvent, type Ref } from 'react'
import type { DraftLeg } from '../../lib/bookingDraft'
import { fileProblem, MAX_FILE_BYTES } from '../../lib/bookings'
import { gmailLogo } from '../../lib/purchase'
import { readBooking, type Known, type ReadDraft } from '../../lib/readBooking'
import { Close, Upload } from '../icons'

// Add booking, at the end of a leg that is not booked yet. Closed it is one row: the booking comes as a mail, a PDF
// or a screenshot. Open it takes files, chosen or dropped, and a pasted mail link or the text of the confirmation, and
// Add booking has them read. While they are read the row says so. What comes back opens the booking form filled in,
// with the files that can be kept on the booking. A read that fails keeps the panel as it was, with the reason. Fill in
// yourself opens the form empty, as it always could.

export type Read = ReadDraft & { files: File[] }

type Step = 'closed' | 'open' | 'reading'

const isEml = (f: File) => /\.eml$/i.test(f.name) || f.type === 'message/rfc822'

/** Why a file cannot be read, or null. A saved mail is read as text, the rest must be a file the booking can keep. */
function problem(f: File): string | null {
  if (!isEml(f)) return fileProblem(f)
  if (!f.size) return `${f.name} is empty.`
  return f.size > MAX_FILE_BYTES ? `${f.name} is over 10 MB, so it cannot be read.` : null
}

/** The short kind of a file on its tile: its extension, or PDF and MAIL for the two that matter most. */
function kindOf(f: File): string {
  if (isEml(f)) return 'MAIL'
  if (f.type === 'application/pdf') return 'PDF'
  const ext = f.name.includes('.') ? f.name.slice(f.name.lastIndexOf('.') + 1) : ''
  return (ext || 'IMG').slice(0, 4).toUpperCase()
}

export function AddBooking({ leg, known, onRead, onManual, ref }: {
  leg: DraftLeg
  /** the bookings made and the places, so a return leg that is booked already is not added again */
  known?: Known
  /** opens the booking form on what was read */
  onRead: (read: Read) => void
  /** opens the booking form to fill in by hand */
  onManual: () => void
  /** the row the focus comes back to when the form closes */
  ref?: Ref<HTMLButtonElement>
}) {
  const id = useId()
  const [step, setStep] = useState<Step>('closed')
  const [files, setFiles] = useState<File[]>([])
  const [text, setText] = useState('')
  const [said, setSaid] = useState('')
  const [over, setOver] = useState(false)
  const drop = useRef<HTMLInputElement>(null)
  const goBtn = useRef<HTMLButtonElement>(null)
  const failed = useRef(false)
  const opener = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)
  const reading = useRef<HTMLDivElement>(null)
  const live = useRef(true)
  // set again on each mount, since StrictMode runs the cleanup once before the page is used
  useEffect(() => {
    live.current = true
    return () => { live.current = false }
  }, [])
  // opening puts the focus on the files, closing back on the row, so the keyboard never lands on nothing
  useEffect(() => {
    if (step === 'open' && !wasOpen.current) drop.current?.focus({ preventScroll: true })
    if (step === 'closed' && wasOpen.current) opener.current?.focus({ preventScroll: true })
    // a read that failed hands the focus back to Add booking, with the reason read out beside it
    // the row that says it is reading takes the focus, so the keyboard is not left on the button that went away
    if (step === 'reading') reading.current?.focus({ preventScroll: true })
    if (step === 'open' && failed.current) goBtn.current?.focus({ preventScroll: true })
    failed.current = false
    wasOpen.current = step !== 'closed'
  }, [step])

  const add = (chosen: File[]) => {
    // what comes in while a read runs is not part of it
    if (step === 'reading') return
    const bad = chosen.map(problem).find(Boolean)
    const good = chosen.filter((f) => !problem(f))
    setFiles((now) => [...now, ...good.filter((f) => !now.some((x) => x.name === f.name && x.size === f.size))])
    setSaid(bad ?? '')
    setStep('open')
  }
  const choose = (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget
    const chosen = [...(input.files ?? [])]
    input.value = ''
    add(chosen)
  }
  const onDrag = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setOver(true)
  }
  const onDrop = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    setOver(false)
    add([...e.dataTransfer.files])
  }

  const ready = files.length > 0 || text.trim().length > 0
  const go = async () => {
    if (!ready || step === 'reading') return
    setSaid('')
    setStep('reading')
    let r: Awaited<ReturnType<typeof readBooking>>
    try {
      r = await readBooking(leg, files, text, known)
    } catch {
      r = { ok: false, message: 'The booking could not be read. Fill it in yourself.' }
    }
    if (!live.current) return
    if (!r.ok) {
      failed.current = true
      setSaid(r.message)
      setStep('open')
      return
    }
    const { ok: _ok, ...draft } = r
    // a saved mail was read as text, the booking keeps only the files the bucket takes
    onRead({ ...draft, files: files.filter((f) => !fileProblem(f)) })
  }
  const cancel = () => {
    setFiles([])
    setText('')
    setSaid('')
    setStep('closed')
  }

  return (
    <section className="ab" aria-labelledby={`${id}-h`} data-over={over || undefined} onDragOver={onDrag} onDragEnter={onDrag} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false) }} onDrop={onDrop}>
      <h4 id={`${id}-h`}>Add booking</h4>
      <p className="vh" role="status" aria-live="polite">{step === 'reading' ? 'Reading the booking' : said}</p>

      {step === 'closed' && (
        <button
          ref={(el) => {
            opener.current = el
            if (typeof ref === 'function') ref(el)
            else if (ref) ref.current = el
          }}
          type="button" className="ab-row" onClick={() => setStep('open')}
        >
          <span className="ab-tile" aria-hidden="true"><Upload /></span>
          <span className="ab-words"><b>Mail, PDF or screenshot</b><small>Or paste a mail link</small></span>
        </button>
      )}

      {step === 'reading' && (
        <div ref={reading} className="ab-row ab-reading" tabIndex={-1}>
          <svg className="ab-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9" /></svg>
          <b>Reading the booking</b>
        </div>
      )}

      {step === 'open' && (
        <>
          <div className="ab-panel">
            <label className="ab-drop" data-over={over || undefined}>
              <input ref={drop} type="file" name="files" accept=".pdf,.eml,image/*" multiple onChange={choose} aria-label="Choose files, a PDF, a saved mail or a screenshot" />
              <Upload /><span aria-hidden="true">Choose files</span>
            </label>
            {files.length > 0 && (
              <ul className="ab-files" aria-label="Files to read">
                {files.map((f) => (
                  <li key={f.name + f.size} className="ab-file">
                    <span className="ab-kind" data-kind={kindOf(f)} aria-hidden="true">{kindOf(f)}</span>
                    <span className="ab-name" title={f.name}>{f.name}</span>
                    <button type="button" className="ab-x" aria-label={`Remove ${f.name}`} title="Remove" onClick={() => setFiles((now) => now.filter((x) => x !== f))}><Close /></button>
                  </li>
                ))}
              </ul>
            )}
            <label className="ab-paste">
              <img src={gmailLogo()} alt="" />
              <textarea
                name="text" rows={1} value={text} onChange={(e) => setText(e.currentTarget.value)}
                aria-label="Paste mail link or text" placeholder="Paste mail link or text"
                autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done"
              />
            </label>
            {said && <p className="ab-said" aria-hidden="true">{said}</p>}
            <div className="ab-acts">
              <button ref={goBtn} type="button" className="btn ab-go" onClick={go} disabled={!ready}>Add booking</button>
              <button type="button" className="btn link ab-cancel" onClick={cancel}>Cancel</button>
            </div>
          </div>
          <button type="button" className="btn link small ab-self" onClick={onManual}>Fill in yourself</button>
        </>
      )}
    </section>
  )
}
