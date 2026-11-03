# Bookings, places to stay, and the ways in and home

Date: 3 November 2026. Source: Simon's message of 3 November, with two screenshots (the pair view "Bogota in, Guatemala City home" and the flight sheet "Cartagena to San Andres").

## Why

The trip starts on 2 December. Simon has started buying tickets, and the planner cannot say so. It cannot hold a booking reference, a ticket PDF, a hotel he has chosen or the fact that a stay is paid. He also cannot change the flights to and from Copenhagen inside a trip, and the 2 December KLM ticket to Cartagena, home from Guatemala City, cannot be chosen anywhere. The places to stay that the app shows are early research he did not pick, and he wants them replaced by places he or Claude add on purpose, with photos, rooms and prices for the nights he is actually there.

Success is: every ticket and bed Simon has paid for is in the app, green, with its reference and attachments one tap away on his phone, and anything not yet booked is easy to plan, compare and lock in.

## Goals

1. Change the way in and the way home of an open trip, by date and by city, from the trip itself (section 3).
2. Mark any leg as booked, flights, buses, boats and the two long haul ways, with its reference, terms and attachments (section 4).
3. A clean model for places to stay: places Simon or Claude add, with photos, rooms and prices for the trip's dates, chosen per stop for all or part of the nights, and locked in when booked (section 5).
4. The trip route map without labels over flags or over each other (section 6).
5. A home airport control in the new trip picker, Copenhagen only for now (section 3.4).
6. The connector signs in with the same email sign in as the app, and has a page that says how to connect it to Claude and ChatGPT (section 2).
7. The fixes the review of the cutover found (section 1).

## Non goals

- No live hotel or flight search inside the app. Search stays with Claude and its own tools, as decided for the connector on 1 November.
- No payment or booking through the app. It records what was bought elsewhere.
- No second home airport now. The control exists so one can be added later.
- No change to the planner rules in the 30 October notes (earliest stop wins, no silent spare days, plus takes from Free nights).

## Anti goals

- A booking that leaks. The repo and the `web` bucket are public. Booking references, prices paid, names and attachments live only in owner only tables and a private bucket, and never in a built file.
- A booked leg that looks like any other leg. Booked must read at a glance, on a phone, in sunlight.
- Forms that feel like admin. Marking a flight booked from the flight Simon picked takes two taps. Every other field is optional.
- Research hostels creeping back. Nothing Simon did not add, or ask Claude to add, shows as a place to stay.

## Constraints

- Writing rules from CLAUDE.md: plain sentences, no semicolons as separators, no dashes as separators, no question marks in the UI. Prices in kroner, local clock times.
- Frontend work goes through the CLAUDE.md design skills (emil, impeccable, 21st components, apple-design, mobile-native, web-design-guidelines). Claude Design visuals are not a reference. Apple design leads for the booking views.
- One checkout, work on `main`, push without asking, keep `npm run typecheck` and `npm test` green in both apps and the Python suites green.
- New shared data goes in Supabase with owner only row level security, read live by the planner through supabase-js with realtime, like trips. It does not wait for a worker build.
- The connector (`latam_trip_mcp`) gets CRUD tools for every new table, following the `TYPES` pattern in `core.py`, with rows checked by a tripdb schema.

## 1. Fixes from the cutover review

Codex finished the cutover on 2 November. All suites pass (planner 302, web 216, tripdb 146 with 100 skipped without live tests, connector 28). An independent review and my own reading found these, to fix first:

1. `planner/src/store.ts` `setData` calls `setJourney`, which writes the open journey as the current draft. While an older version is open, a build swap therefore saves the old version as the draft, and a reload opens it as if it were the latest. `setData` must not persist while `viewing` is set.
2. `applyRemote` rebuilds `inout` from the latest rows only. While an older version is open, its ways are replaced by the latest version's. It must re apply the viewed row's ways.
3. Done on 3 November: `unresolved_journeys` was written on 3 November at 10:48 by a browser import. It holds a 1 November browser copy of `ctg-sal-xmas-cbb` (Cartagena, San Andres, Medellín, Cali and on) and a trip named `pc test`. The table has `ctg-sal-xmas-cbb` at v12. Compare the copy with every stored version of that trip. If one matches, drop the entry. If none does, save it as a new trip named "Cartagena in, Christmas in Cochabamba, browser copy 1 Nov", so nothing Simon built is lost. Drop `pc test`. No version matched, so it is now the trip `ctg-sal-xmas-cbb-browser-1nov`, and the document is gone. Then fix the import so a journey whose id is already in the table, with content equal to one of its versions, is skipped instead of listed.
4. The tests that ran the build pipeline on the real corpus are skipped since the corpus left the repo (`plugin/scripts/test_store_contract.py` real corpus class, `web/src/map/cardScan.test.tsx`). Rewrite them on a small committed fixture: a handful of places, connections, quotes and stays with the edge cases (no rating, null price, no coordinates), without the corpus size checks.
5. Tests that call `test_reset()` fail rather than skip now that `0012_cutover.sql` dropped it. Make them skip with a clear reason.
6. Stale comments that say the apps read the repo's `data/web` (`planner/vite.config.ts`, `web/src/data/remoteFiles.ts`), and the `data/sources` path strings in `tripdb.py` messages and `plugin/templates/trip.example.json`.

## 2. The connector: sign in and documentation

### 2.1 What is wrong

The connector's sign in page says "Enter your passphrase to connect Claude". The passphrase is a secret in AWS SSM that Simon never sees, so he cannot use it, and the page names Claude even when ChatGPT is connecting.

### 2.2 Sign in with the app's email link

The authorize page asks for nothing but a press of "Email me a sign in link". The owner's address is fixed on the server, read from the `owners` table and Supabase auth with the secret key, so it is never typed and never shown in full (it shows as `so…@gmail.com`).

1. `GET /authorize` stores a pending sign in (the OAuth parameters, a random id, a 10 minute ttl) and shows the page.
2. Pressing the button asks Supabase auth to send the magic link (`/auth/v1/otp`, `create_user: false`) with `redirect_to` set to `{base}/signin/done?flow=<id>`. That URL must be added to the Supabase redirect list.
3. The link can be opened anywhere, the Gmail app's browser included. `/signin/done` is a small page whose script reads the access token from the fragment and posts it to the server. The server checks it with `/auth/v1/user`, checks the user id is in `owners`, and marks the pending sign in as passed. The page then says "Signed in. You can close this tab."
4. The original authorize page polls `/signin/status?flow=<id>` every two seconds. When the flow has passed, it redirects to the client's `redirect_uri` with the code, exactly as the passphrase did. So ChatGPT or Claude gets its code in the window it opened, even when the link was opened in another app.
5. The passphrase stays as a quiet fallback link, "Use the passphrase instead", for when email is slow. Supabase's built in mail sends only a few emails an hour, which is the reason to keep it. The documentation says where the passphrase is and how to read it with the AWS CLI.

Page copy is neutral: "Connect Latam trip", "We'll email a sign in link to so…@gmail.com". It names no assistant.

The same rate limit (5 tries in 5 minutes) covers link requests.

The redirect list of the Supabase project needs `{base}/signin/done`. There is no management token in the repo, so the plan has a step where Simon adds it in the Supabase dashboard (Authentication, URL Configuration), with the exact URL. Until he does, Supabase sends the link to the site URL instead, so the done page also runs on the planner: when the planner opens with a `flow` in its address, it posts the session to the connector the same way and says "Signed in. You can close this tab." The flow then works either way.

### 2.3 Documentation

`docs/connector.md`, linked from `README.md` and `plugin/README.md`:

- what the connector is and its URL
- how to add it in Claude (web, desktop and phone share connectors: Settings, Connectors, Add custom connector), in Claude Code (`claude mcp add --transport http latam-trip <url>`), and in ChatGPT (Settings, Apps and Connectors, Advanced settings, Developer mode on, then Create, with the URL and OAuth)
- what the sign in looks like, and the passphrase fallback
- the tools, grouped by what they are for, generated from `TYPES` so the list cannot drift (a test fails when a type has no line)
- what to do when it fails: the 401 meaning, the redirect list, the email rate limit, how to sign out a client (delete its tokens)

## 3. The way in and the way home

### 3.1 Why the 2 December ticket is missing

`plugin/skills/flight-crawl-orchestrator/scripts/inout.py` keeps one option per arrival city, home city and kind (`best_opt`, keyed by `CTG-GUA-ticket`). The KLM open jaw on 2 December (`TQ:57e965fa590c`, 8,235 kr) loses to the 3 December fare on the same key, so no option points at its ways `If1ba527a82` and `H931d190c0d`, and the pair view shows one ticket row.

### 3.2 Options per day

Keep the best option per arrival city, home city, kind, day out and day home. The best of each old key keeps its old id (`CTG-GUA-ticket`), so saved trips keep working. The others get the days in the id (`CTG-GUA-ticket-1202-0203`). The pair view then lists every dated option, sorted as now, and each row already shows its days. Check `web/src/options`, `planner/src/lib/options.ts`, `tiers.ts` and the worker's `derived_options` step for code that assumes one option per key.

### 3.3 Changing them inside a trip

Today the Copenhagen rows in the story are passive (`picker={null}`). They become like every other leg:

- **The day** ("Thu 3 Dec") opens a calendar like `WhenPicker`, where each day shows the cheapest way that day between the same two cities, with the same kind first. Picking a day picks the best way that day.
- **The plane and time** ("17h 36m") opens a way sheet modelled on `FlightSheet`: the strip of days with a price each, then the ways of the day looked at, each like a ticket (airline, times, stops, hub nights, bags, price, Pick). Picking a ticket that covers both ways sets both, and the sheet says so ("One ticket. This also sets the way home on 3 Feb"). Picking a one way sets only that way.
- At the foot, next to "Search Momondo", a second button **"Change start and end"** opens the new trip picker ("where in, where home") in a mode that changes the open trip instead of starting a new one. Its title reads "Change start and end of <trip name>".

When a new arrival city is picked, the old first stop stays a stop and the new arrival city comes in before it, with the leg between found the way the map builder finds a leg for an added stop. When the home city changes, the stops stay and the last leg runs to the new home city the same way. The earliest stop rule applies to the new dates. If a picked way leaves before or lands after a booked leg (section 4), the change is still allowed and the story shows the clash as a warning, as it does for any leg.

### 3.4 Home airport

The header of the new trip picker gets a rounded pill button with the Danish flag and "Copenhagen" and a chevron. It opens a short scrolling list of flag and city rows, with Copenhagen, Denmark the only row and checked. It is wired to a `home` value in the store, default `CPH`, which the picker filters ways by, so a second airport later is data, not code. Find the component through 21st (a country or flag select) and fit it to the planner's tokens.

## 4. Bookings

### 4.1 Data

A new table `bookings`, owner only, live in the planner and in the connector.

| field | meaning |
|---|---|
| `id` | text, generated |
| `kind` | `flight`, `bus`, `boat`, `stay`, `other` |
| `status` | `booked` or `cancelled` |
| `from_code`, `to_code` | airports or map nodes, for travel |
| `depart`, `arrive` | local times, `2026-12-02T06:00`, or a day alone |
| `place_id`, `check_in`, `check_out` | for a stay |
| `lodging_id`, `room_id` | a stay's place and room (section 5), optional |
| `reference` | booking reference, confirmation code, PNR or reservation number, one field |
| `seller` | who sold it, KLM, Kiwi, Hostelworld |
| `url` | the booking's own page |
| `price_dkk`, `price`, `currency` | what was paid |
| `refundable` | `yes`, `no`, `partly` |
| `changeable` | `yes`, `no`, `fee` |
| `change_until`, `cancel_until` | last day to change or cancel for free |
| `cabin_bag`, `checked_bag` | text, as in quotes |
| `segments` | jsonb, the flights inside with numbers, times and the time in each airport between |
| `travellers` | int, default 1 |
| `trip_id` | the trip it was marked in, for the record only |
| `source` | `picked`, `manual`, `claude` |
| `notes` | text |
| `attachments` | jsonb list of `{path, name, type, size, added_at}` |
| `created_at`, `updated_at` | timestamps |

A ticket that covers several legs is one row per leg with the same reference and the same `ticket` value (a group id). The two ways of one long haul ticket are two rows. The ticket's price sits on the first row of the group and the others carry 0, so a total never counts it twice. "Picked flight" on a way that shares its ticket with the other way makes both rows at once.

Paid prices replace seen prices: in the trip totals, a booked leg counts its booking's price and the leg's own quote is ignored. Stays are not in the ticket total. The totals get a separate "Stays" line with booked stays at their paid price and planned stays at their price for the nights, marked as planned.

There are already booked flights in the trips, written by Claude before this table existed: hops whose flight has `source: "booked"` and a `quote_id` like `BOOKED:REDACTED`, with the booking in the operator text (for example the Travellink and LATAM booking on Cartagena to San Andrés). A one time step turns each of these into a bookings row, reference and seller read from that text, and Simon sees them green on first open.

**A booking is a fact about the world, not about one trip.** A leg of any trip shows as booked when a booked row has the same two ends and leaves on the day the planner shows for that leg, set or estimated. Marking a leg booked also sets the leg's day to the booking's day and its picked flight to the booked one, the same as picking a day and a flight by hand today, so a booked leg is always pinned and stays green when nights move elsewhere. A booking whose ends match a leg of the trip on another day shows on that leg as a warning ("Booked on 5 Dec"), like the existing clash warnings. A stay shows as booked on a stop when its place matches and its nights fall inside the stop. So if Simon keeps two variants of his route, both show the tickets he already has. `trip_id` only records where it was marked.

Attachments go in a new private Storage bucket `bookings`, path `<booking id>/<file name>`, owner only policies, opened with short lived signed URLs. Files up to 10 MB, PDF and images. On a phone the picker offers the camera.

### 4.2 How booked looks

- **On the route**, a booked leg's mode button has a permanent green ring, the same shape as its pressed state, and a small check. A booked stay shows a green bed mark beside its nights. The way in and the way home follow the same rule.
- **In the trips list**, a trip shows a small green ticket mark with a count ("3 booked") when any of its legs or stays is booked.
- **In the flight sheet**, the booked flight's Pick button becomes a green **Booked** button. It opens the booking.

### 4.3 The booking view

Clicking a booked leg opens the booking view instead of the flight sheet. It reads like a boarding pass in Apple Wallet: the two airport codes large with the cities under them, the day and times, then a strip with the reference large in a monospace face with a copy button, then the facts in rows (seller, price paid, bags, refundable, changeable with its last day, travellers), then the segments with the time in each airport between, then attachments as tiles that open the file, with an add tile, then notes, then the link "Open booking".

At the foot: **Change trip** goes to the flight sheet of the leg, where other days and flights can be looked at and the window closed to go elsewhere. **Edit** opens the form. **Remove booking** asks once, inline, and sets `cancelled` (the row is kept).

### 4.4 Marking a leg booked

The flight sheet, the way sheet and a bus or boat leg card get a **Mark as booked** button in the bottom right corner: a compact pill with a check, green outline on the dark sheet, filling green on press. It stands out by colour, not size. Choose it from 21st and fit it.

It opens a short sheet with three ways in, as a segmented control:

1. **Picked flight** (default when a flight is picked): the flight's times, airline, segments, price and bag terms are filled in. Simon adds the reference if he has it and presses Save. Two taps.
2. **Fill in yourself**: the same form, empty but for the leg's ends and day. Reference, seller, price, refundable, changeable with its day, bags, link, notes and attachments. Nothing is required.
3. **Ask Claude**: sends a task (`type: booking`) with the leg and a free text box ("It's in my Gmail from KLM" or a pasted email). Claude fills the booking through the connector, and the leg turns green when the row lands.

### 4.5 Connector tools

`add_booking`, `get_booking`, `list_booking`, `update_booking`, `delete_booking` (sets cancelled), through the `TYPES` pattern, with a `BOOKING` schema in tripdb. `attach_booking_file(id, name, content_base64)` for small files Claude has, such as a PDF from Gmail, limited to 4 MB of file (Lambda takes 6 MB a request, and base64 adds a third). For larger files, `attach_booking_upload(id, name, type)` returns a signed upload URL valid for 10 minutes and adds the attachment entry. `list_booking` takes `from`, `to`, `day` and `place` filters so Claude can check what is already bought.

## 5. Places to stay

### 5.1 What goes

The hostel cards from `profiles.hostels` and the rows in `stays` stop showing, in the planner's city card and in the map's city panel. The rows stay in the database. From now on a place to stay shows only when it is in the new tables.

### 5.2 Data

`lodgings`, owner only:

| field | meaning |
|---|---|
| `id` | text |
| `place_id` | the city, a map node |
| `name`, `kind` | `hostel`, `hotel`, `guesthouse`, `apartment`, `other` |
| `photos` | jsonb list of `{url, caption}` |
| `rating`, `reviews`, `rating_source` | out of 10 |
| `address`, `lat`, `lon` | |
| `to_center_km`, `to_beach_km` | optional |
| `tags` | text list, `beach`, `pool`, `social`, `quiet`, `kitchen`, `breakfast`, `aircon`, `workspace` |
| `summary` | what it is, written by Claude or Simon |
| `notes` | Simon's own notes |
| `links` | jsonb list of `{site, url}`, site one of `booking`, `hostelworld`, `airbnb`, `own`, `other` |
| `added_by` | `simon` or `claude` |
| `hidden` | boolean, a place set aside without deleting it |

`lodging_rooms`: `id`, `lodging_id`, `name` ("10 bed dorm", "Double room"), `beds`, `private`, `bathroom` (`private` or `shared`), `notes`.

`lodging_prices`: `id`, `room_id`, `check_in`, `check_out`, `total_dkk`, `per_night_dkk`, `site`, `url`, `refundable`, `cancel_until`, `observed_at`. A price is for a date range because that is how the sites quote.

### 5.3 Planned stays in a trip

A stop in a trip can hold where Simon means to sleep: `place.stays = [{lodging_id, room_id, nights}]` in the trip body, so it is versioned with the trip. The parts run in order from the stop's first night. `nights` is left out on the last part, which takes what remains, so one part with no nights covers the whole stop and follows it when legs move. Dates are never stored on a planned stay, they are worked out from the stop. Booked stays are `bookings` rows (kind `stay`), and a planned stay that matches a booked one shows as booked.

Booked stays lock nights: the minus on a stop that would cut into a booked stay, or a leg moved so the stop no longer covers it, still works but shows a warning naming the booking and its last free cancel day, like the existing leg clash warnings.

### 5.4 Prices for the trip's dates

On an open trip, a place's room prices are those whose range covers the nights of that stop, or of the planned part. When none match, the nearest observed price shows with its dates ("1,240 kr for 9 to 14 Dec") and a quiet "Ask Claude for these dates" that sends a `stay_prices` task with the lodging id, its room ids and the nights.

The `stay_prices` task changes with it. Claude writes prices only as `lodging_prices` rows for lodgings and rooms that already exist, through the connector. It never creates a lodging from a price task and never writes the old `stays` table again. `docs/claude-tasks.md`, the stay price skill and `tripdb add-stays` are updated to say so, and `add-stays` refuses with a message pointing at the connector.

### 5.5 How it looks

A place card has a photo strip that swipes, the name and kind, the rating as a small badge, distance tags (1.2 km to centre, on the beach), then rooms as rows with the price for the trip's nights, then buttons for its links (Booking.com, Hostelworld, own site), then notes. Booked shows the same green ring as a booked leg, with the reference.

Where it lives:

- **City card in a trip** gets a "Where to stay" section at the top: the planned or booked stays for the stop's nights as a small timeline, then the places in the city as cards, then "Add a place".
- **Map city panel** (web) shows the same cards for the city, priced for the open trip's nights when a trip is open.
- **Add a place** is a form with name, kind, links, photos by URL, rooms with prices, tags and notes. Pasting a Booking.com or Hostelworld link fills the site link.

The visual design goes through apple-design and impeccable, with 21st components for the photo carousel, the cards and the segmented controls.

### 5.6 Connector tools

`add_lodging` with rooms and prices nested, `get_lodging`, `list_lodging` by place, `update_lodging`, `delete_lodging` (sets hidden), `add_lodging_price`. A connector tool description tells Claude to add only places Simon asked for, with photos, rating, distances and rooms, and to fill prices for the trip's dates when it knows them.

## 6. The trip route map

`planner/src/components/story/RouteSummary.tsx` places each country label at a fixed side of its flag. In Central America the flags sit close, so "El Salvador" covers "22 nights" and the Nicaragua label runs into the El Salvador flag (seen on `ctg-sal-xmas-cbb` at 1440 wide).

Place labels by collision: for each country, in order of nights, try right, left, above, below and the diagonals, and take the first spot that clears every flag and every placed label and stays inside the canvas. When flags themselves overlap, shrink the discs of the cluster first, then let a label sit at the end of a short leader line. A label that still cannot fit shows on hover and focus only. Check at 375, 768 and 1440 wide on every stored trip.

## 7. Order of work

1. Section 1 fixes and section 2, the connector sign in and its page. Independent of each other.
2. Section 6, the route map.
3. Section 3, the ways in and home, pipeline first, then the story and the picker.
4. Section 4, bookings, data and connector first, then the views.
5. Section 5, places to stay, data and connector first, then the views.

Each step ends with typecheck and tests in both apps, the Python suites, a push to `main`, and a look at the running app at phone and desktop widths.

## 8. Calls I made

These were not in Simon's message:

- The new trip button is called "Change start and end", and the booking button "Mark as booked".
- A booking matches legs and stays by ends and day across all trips, rather than belonging to one trip.
- Research hostels are hidden, not deleted.
- The connector keeps the passphrase as a fallback behind the email link.
- One row per leg for a ticket covering several legs.
- Removing a booking marks it cancelled and keeps the row.
- The browser copy in `unresolved_journeys` is saved as its own trip when no stored version matches it.
- A ticket's price sits on the first row of its group, and paid prices replace seen prices in totals. Stays get a line of their own.
- Marking a leg booked pins its day and flight. Matching uses the day the planner shows.
- Planned stays store nights in order, not dates.
- Price tasks write only prices for lodgings that exist.
- The planner also finishes the connector sign in, so it works before the redirect URL is added.
