import { Eye } from './icons'

/** The mark on a trip someone shared by a link: it is theirs, and you only look. Shows nothing on your own trip. */
export function SharedChip({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span className="dash-shared" title="Shared with you, read only">
      <Eye />Shared with you
    </span>
  )
}
