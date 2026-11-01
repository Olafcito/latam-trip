import { Warn } from './icons'
import type { DeriveState } from '../lib/remoteFiles'

/** The strip that tells the data has stopped updating (spec 6.3). A failed build leaves the old files live, so without this nobody would know. */
export function DataStrip({ state }: { state: Pick<DeriveState, 'last_error' | 'last_warning'> | null }) {
  if (!state || (!state.last_error && !state.last_warning)) return null
  return (
    <div className={'data-strip' + (state.last_error ? ' bad' : '')} role={state.last_error ? 'alert' : 'status'}>
      <Warn s={16} />
      <p>
        {state.last_error && (
          <>
            <strong>The data has stopped updating.</strong> The last build failed and the older files are still shown. <span className="mono small">{state.last_error}</span>
          </>
        )}
        {state.last_error && state.last_warning && ' '}
        {state.last_warning && <span>{state.last_warning}.</span>}
      </p>
    </div>
  )
}
