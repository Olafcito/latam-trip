import type { StayForm, StayFormKey, StayTarget } from './stayBooking'

// Reads a stay confirmation (a PDF, a screenshot, a saved mail or pasted text) with the read-booking function in its
// stay mode, and hands back the review form filled in with what it states. Stub: the parser batch builds it.

export interface StayRead {
  form: StayForm
  /** the fields the confirmation did not state */
  missing: StayFormKey[]
  /** what the confirmation says of the place, to compare with the lodging */
  place: { name: string | null; city: string | null; country: string | null }
}

export type StayReadResult = ({ ok: true } & StayRead) | { ok: false; message: string }

/** Reads files and text for one planned stay. city is the stop's town, so the reader knows which stay is meant. base is the form so far. */
export async function readStay(target: StayTarget, city: string, files: File[], text: string, base: StayForm): Promise<StayReadResult> {
  void target
  void city
  void files
  void text
  void base
  return { ok: false, message: 'Reading stay confirmations is not built yet.' }
}
