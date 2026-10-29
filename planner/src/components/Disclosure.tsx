import { useId, useState, type ReactNode } from 'react'

// A row that opens to show more. Ported from the behaviour of the HeroUI Disclosure on 21st.dev
// (id 14029): a real button with aria-expanded and aria-controls, a chevron that turns, and a
// panel that is always mounted so its height can animate. Height runs on grid-template-rows from
// 0fr to 1fr, so nothing is measured in JavaScript. A closed panel is inert: no focus, no reading.

export function useDisclosure(initial = false) {
  const [open, setOpen] = useState(initial)
  const id = useId()
  return {
    open,
    trigger: {
      type: 'button' as const,
      'aria-expanded': open,
      'aria-controls': id,
      onClick: () => setOpen((o) => !o),
    },
    panel: { id, open },
  }
}

/** The opening part. Put it right after its trigger. */
export function DisclosurePanel({ id, open, className, children }: { id: string; open: boolean; className?: string; children: ReactNode }) {
  return (
    <div id={id} className={`disc${className ? ` ${className}` : ''}`} data-open={open} inert={!open}>
      <div className="disc-in">{children}</div>
    </div>
  )
}

/** The chevron at the end of a trigger: points down, turns up when open. */
export function Chevron({ open }: { open: boolean }) {
  return (
    <svg className="disc-chev" data-open={open} width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}
