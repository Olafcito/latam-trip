// DES-013: an unknown value is never rendered as zero and never as the words "unknown" or "not
// known". It is a hollow mark, dimmed, with the explanation only in the title for anyone who asks.
// Shared by the planner and the web map so one state means "not known" everywhere.
export function Unknown({ title }: { title: string }) {
  return (
    <span className="unk" title={title}>
      ○
    </span>
  )
}
