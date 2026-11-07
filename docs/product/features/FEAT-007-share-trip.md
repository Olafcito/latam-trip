# FEAT-007 Share a trip by a link

**Id.** FEAT-007. **Date.** 2026-11-07. **Status.** Built on the branch `share-trip`, waiting for review and merge. **Cites.** PROD-007, PROD-008, TECH-009, TECH-014.

## 1. Journey

Simon has planned a trip in the planner and wants a friend to see it.

1. **Shares.** On the trip's dashboard he taps Share. On his phone the phone's own share sheet opens with the link, and he sends it in a chat. On a computer the link is copied, and the control itself turns to Copied for a moment. From then on the control reads Shared, with a small cross beside it.
2. **The friend opens it.** The link is the planner's address with `?share=<token>`. A friend who is not signed in sees the trip and the map straight away, read only, with no sign in (migration 0040, 2026-11-07). Each stop the owner plans to sleep at shows that place to stay, folded open (migration 0041, 2026-11-07). Keep a copy and Sign in take them to the sign in screen, and the email brings them back to the same shared trip.
3. **The friend looks.** The trip opens read only: the route, the places, nights and dates, the ways in and home, the costs of the market fares and View on map. A small link mark beside the name says it is shared with them. Nothing on the screen edits the trip.
4. **The friend keeps a copy.** One primary action, Keep a copy, saves the trip as a new trip of the friend's own, which they can change like any other.
5. **Simon stops sharing.** He taps the cross beside Shared. The link is dead at once. Anyone who opens it lands on their Trips list with one line saying the trip is no longer shared. Sharing again makes a new link, so the old one stays dead.

## 2. Scope

- Migration `0039_trip_shares.sql`: the `trip_shares` table and the functions `share_trip`, `stop_sharing` and `shared_trip`.
- The connector tools `share_trip` and `stop_sharing` (`docs/connector.md`).
- The planner: the Share control on the owner's dashboard, the `?share=` link, the read only dashboard, Keep a copy and the dead link notice.

Not in scope: sharing with named people, editing together, a public link that works without signing in, sharing bookings, and a list of everyone who opened a link.

## 3. Acceptance criteria

1. A signed in owner can share a stored trip and gets one live link per trip. Asking again gives the same link. Proved by `supabase/tests/test_rls.py` `ShareTest`.
2. Anyone who opens the link, signed in or not, reads the plan and where the owner plans to sleep: the name, the why, the ways and tickets, each place with its hop, nights and dates, and each planned stay with its place to stay, the planned room and the prices the sites quoted for it. Never the owner's id, who saved it, the totals, the owner's notes on a place or a room, a hidden place or a room no stay names, a price's address, bookings or quotes. Proved by `ShareTest`.
3. A stopped link, an unknown token and a deleted trip all answer nothing. A person cannot read or change another person's links. Proved by `ShareTest`.
4. The planner opens `/?share=<token>` read only under the id `shared-<token>`, with no steppers, no Pick in and out and no save. Proved by `planner/src/store.share.test.ts` and the shots.
5. Keep a copy saves a new trip of the viewer's own. Proved by `store.share.test.ts`.
6. An owner who opens their own link gets their own trip, editable. A dead link shows the Trips list with the notice. Proved by `planner/src/App.shareLink.test.ts`.
7. The sign in link keeps `?share=` when it is a token and drops anything else. Proved by `planner/src/lib/supabase.test.ts`.
8. `delete_account` removes the person's links, and `export_account` includes them. Proved by `latam_trip_mcp/test_account.py`.

## 4. Decisions made during the build

Each was an ambiguity decided with a safe default, so Simon can reverse any of them.

- **Read only under its own id.** The shared trip opens as `shared-<token>`. Nothing the viewer does can write to the owner's trip, to the viewer's own trips or to the draft this browser had open.
- **The latest saved version.** A link shows the newest stored version of the trip, so the friend sees changes Simon saves after sharing. A draft that is not saved is not shared.
- **Share is shown only for a stored trip.** A trip that only lives in this browser has no Share control until it is saved.
- **The share sheet on a touch screen only.** `navigator.share` is used when the pointer is coarse. On a computer the link goes to the clipboard, because a desktop share sheet sends the link to fewer places than a paste.
- **The owner's own link opens their own trip.** Row level security shows a person only their own links, so the planner can tell, and opens the trip editable rather than as a copy of itself.
- **The viewer's bookings and places to stay are never applied** to a shared trip, so the viewer's own booked flights cannot change its legs. The owner's planned stays come with the link and are read only.
- **Keep a copy** gives a new id, carries the ways and the places, and drops the stays, the rank and the version history.
- **The map pane is not used** for a shared trip. View on map opens the modal map, so the shared trip never becomes the trip on the Map tab.
- **Stopping has no confirmation.** It is quick to undo by sharing again, which gives a new link, and the old one stays dead.
- **State is shown in form.** Share, Shared and Copied are the same control with its icon changing, the cross is the stop, and the viewer's mark is a link icon with an accessible name and a tooltip. No line of prose.

## 5. Left for Simon

- **Sign in for a friend without an account.** Looking needs no sign in since 0040. Keeping a copy does, and Supabase's built in email only reaches the project's team, two messages an hour. Until the custom SMTP sender of FEAT-006 is set up, a friend outside the team can look but cannot keep a copy.
- **The redirect allowlist.** Supabase's Auth redirect URLs must accept the planner's address with a query, such as `https://<planner host>/**`, or the sign in email of a friend lands on the planner without `?share=` and they see their own Trips list.
