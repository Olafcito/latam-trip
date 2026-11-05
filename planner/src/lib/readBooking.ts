import type { Booking } from '../data/types'
import type { BookingFields, DraftLeg } from './bookingDraft'

// Add booking: a ticket file, a saved mail or the pasted text of a confirmation is read by the read-booking
// function (supabase/functions/read-booking), which asks Claude for the booking's fields. What comes back
// opens the booking form filled in, to check and add. A pasted link alone is kept as the mail link and
// nothing is read, since the app has no access to the mailbox.

/** What a read gives the form: the rows of the leg, the fields it fills, and the fields the read could not find. */
export interface ReadDraft {
  rows: Partial<Booking>[]
  fields: BookingFields
  /** the form fields the confirmation did not hold, shown amber in the form */
  missing: (keyof BookingFields)[]
}

export type ReadResult = ({ ok: true } & ReadDraft) | { ok: false; message: string }

/** The link in text that is a link and nothing else, as pasted from Gmail. */
export function mailLinkOf(text: string): string | null {
  void text
  throw new Error('not built yet')
}

/** Reads a booking from files and pasted text for one leg. */
export async function readBooking(leg: DraftLeg, files: File[], text: string): Promise<ReadResult> {
  void leg; void files; void text
  throw new Error('not built yet')
}
