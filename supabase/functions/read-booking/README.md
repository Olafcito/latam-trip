# read-booking

Edge function behind Add booking in the planner. It takes the leg being added, the pasted confirmation text and up to 5 files (PDF, JPEG, PNG, WebP, GIF, 10 MB together, base64 inline), asks the Claude API for the booking through one forced tool, and returns `{ booking }` or `{ error }`. Any signed in person may call it, read from the session JWT, up to `READ_BOOKING_MONTHLY_CAP` reads a calendar month (UTC), 30 when the secret is unset. Without a session it answers `401`. Past the cap it answers `429 { error: 'monthly_cap' }` and asks Claude nothing. A read is counted once the request is known to be readable, before Claude is asked, and a second read with the fallback model is part of the same one. The count is `public.take_read_booking(cap)` (migration 0029), called as the caller so it counts their reads alone, in `read_booking_usage` by owner and month, which no client reads. When the count cannot be asked it answers `503` and asks Claude nothing. It stores nothing else, reads and writes no other table, and logs nothing of the content.

The planner sends at most 5 files, 10 MB together and 5 MB for an image, and does not send a HEIC photo, which the function refuses. A saved .eml goes as text. A body that is not an object, or a files entry that is not, gets a 400 with the CORS headers.

Request: `{ leg: { kind, from, to, day }, text, files: [{ name, type, data }] }`.
Response: `200 { booking: { legs, reference, seller, price, ..., not_found } }` or `4xx/5xx { error }`.

## Stay mode

When `leg.kind` is `stay`, the function uses a second tool and a stay prompt instead of the flight ones. The leg is `{ kind: 'stay', place, day, nights }`, the town, the first night and the number of nights. Files, limits and errors are the same.

Response: `200 { booking: { stays: [...] } }`. It is a list because one confirmation can hold several bookings, such as two one-night bookings at the same hostel. The stay that matches the leg comes first. Each stay can hold:

- `property { name, address, city, country }`, with the address as written
- `check_in`, `check_out` (YYYY-MM-DD), `check_in_time`, `check_out_time` (HH:MM local), `nights`, `guests`, `rooms`, `room_name`
- `provider` (booking, hostelworld, airbnb, own, other), read from the confirmation's logo, wording and reference format and never from the mail domain alone, `seller` (the provider's name as written), `seller_url` (only for other or own)
- `reference`, `total`, `paid` (at booking, a deposit), `balance` (due at the property), `per_night`, each money as `{ amount, currency }` in the currency the confirmation shows
- `refundable`, `cancel_until`, `cancel_policy` (under 120 characters), `not_found`

The total is the full price of the stay, the deposit plus the balance. A deposit is never the total. With only a deposit and a balance the total is their sum when both are in one currency, else it is left out and named in `not_found`.

The first read is complete when every stay has a reference, a total, a check-in and a check-out. Anything less is read once more with `READ_BOOKING_FALLBACK`, as for flights. The flight path is unchanged.

It reads with `READ_BOOKING_MODEL` first. When that answer has no reference, no price, or a leg without a departure, it reads once more with `READ_BOOKING_FALLBACK` and returns that answer. If the second read fails, the first answer is returned.

Secrets: `ANTHROPIC_API_KEY` (required), `READ_BOOKING_MODEL` (optional, default `claude-haiku-5-5`), `READ_BOOKING_FALLBACK` (optional, default `claude-sonnet-5-5`) and `READ_BOOKING_MONTHLY_CAP` (optional, a whole number of at least 1, default 30). `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set by Supabase.

From the repo root, with the project ref from the Supabase dashboard (the subdomain of `SUPABASE_URL`):

    npx supabase secrets set ANTHROPIC_API_KEY=... --project-ref <ref>
    npx supabase functions deploy read-booking --project-ref <ref>

Tests of the cap and the sign in check, without the network, from the repo root:

    npx deno test supabase/functions/read-booking/
