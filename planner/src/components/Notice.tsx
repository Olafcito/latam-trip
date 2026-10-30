import { useStore } from '../store'

/** The one line the app has to say, until it is dismissed or the next trip opens. */
export function Notice() {
  const notice = useStore((s) => s.notice)
  const setNotice = useStore((s) => s.setNotice)
  if (!notice) return null
  return (
    <p className="tt-notice" role="status">
      {notice}
      <button type="button" className="btn link small" onClick={() => setNotice(null)}>Dismiss</button>
    </p>
  )
}
