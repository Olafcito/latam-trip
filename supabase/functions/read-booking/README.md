# read-booking

Edge function behind Add booking in the planner. It takes the leg being added, the pasted confirmation text and up to 5 files (PDF, JPEG, PNG, WebP, GIF, 10 MB together, base64 inline), asks the Claude API for the booking through one forced tool, and returns `{ booking }` or `{ error }`. Only the signed in owner may call it (`public.is_owner()`). It stores nothing, reads and writes no table, and logs nothing of the content.

The planner sends at most 5 files, 10 MB together and 5 MB for an image, and does not send a HEIC photo, which the function refuses. A saved .eml goes as text. A body that is not an object, or a files entry that is not, gets a 400 with the CORS headers.

Request: `{ leg: { kind, from, to, day }, text, files: [{ name, type, data }] }`.
Response: `200 { booking: { legs, reference, seller, price, ..., not_found } }` or `4xx/5xx { error }`.

Secrets: `ANTHROPIC_API_KEY` (required) and `READ_BOOKING_MODEL` (optional, default `claude-sonnet-5-5`). `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set by Supabase.

From the repo root, with the project ref from the Supabase dashboard (the subdomain of `SUPABASE_URL`):

    npx supabase secrets set ANTHROPIC_API_KEY=... --project-ref <ref>
    npx supabase functions deploy read-booking --project-ref <ref>
