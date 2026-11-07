# Privacy note for latam-trip

**Draft. Waiting for Simon's lawyer.** Nothing here has had a legal review, and it is not to be shown to an outside person as final. The facts come from the product spec FEAT-006, `data/README.md`, `docs/connector.md` and TECH-009, TECH-010 and TECH-013. The gaps a lawyer must fill are listed at the end.

## What latam-trip is

latam-trip is a trip planner that you use through your own Claude and the planner website. You sign in as yourself with your email address. Simon runs the service and hosts the data.

## What is stored about you

Each item is stored against your own account and no one else's.

| What | Why |
|---|---|
| Your sign in, which is your email address | To let you in and to keep your data apart from everyone else's |
| Your profile: home airport, currency, longest journey, travel style and rules | So the skills search for flights and places the way you want |
| Your trips, saved as versions | To plan and keep your route |
| The links you made to share a trip, and when you stopped each | So a friend can open the trip you shared, and a stopped link stays dead |
| Your flight and fare quotes | To compare prices for your trips |
| Your bookings: the legs, dates and booking details you add | To show your plan and keep booked legs from moving |
| Your booking files, such as PDFs and photos, in a private folder | So tickets and confirmations are with the booking |
| Your places to stay, with photos, ratings, distances, rooms and prices | To compare where to sleep |
| Your tasks and their log | The research jobs you queue, and what happened to them |
| Your inbox of submitted items and your inbox token | So a page or a mail you submit lands on your account |
| Your own documents, such as lists and saved plans | To keep your planner state |
| Usage counts: how many reads of a pasted booking you made this month, how many tasks you added today, and how many writes the connector made this minute | To enforce the limits that protect the service |

There are also limits per person on how much you can store: 2000 rows in most tables, larger caps for the tables that only grow, 100 tasks a day, 200 MB of booking files and 60 connector writes a minute.

Your assistant reads pages in your own browser. latam-trip runs no browser of its own for you and keeps no copy of the pages. What your assistant copies from a page into your places and quotes is stored as above.

## Who can see it

- **You.** Row level security in the database keeps every private table and the booking folder to the rows with your own account id. Your assistant uses your own sign in, so it sees what you see.
- **No other traveller.** Another person's account cannot read or change your rows. The one exception is a trip you share by a link, which they can read but not change (below). The public files of the map are built from the shared catalogue and Simon's own rows only, never yours.
- **Simon, as the administrator.** He holds the project's secret key. He uses it for the shared catalogue, for the service tables and for backups, and the backups hold some of your rows (see below).
- **Claude API.** When you add a booking by pasting a confirmation or a file, the planner's `read-booking` function sends that text or file to the Claude API on latam-trip's own key to read it. It keeps nothing else, logs nothing of the content, and is capped at a number of reads a month for each person.
- **Your own Claude.** What your assistant reads through the connector is handled under your own Claude subscription and its terms.

## A trip you share by a link

You can share one of your trips by a link, from the planner or through your Claude (FEAT-007). Anyone who has the link and signs in sees the trip read only: its name and why, its places with their nights and dates, and the ways in and home with their market fares. They never see your bookings, your places to stay, what you paid, the trip's totals, your name, your email or your account id. A link shows the latest saved version of the trip, so later changes you save are shown too. You can stop sharing at any time, and the link is dead at once. Sharing again makes a new link. A person who keeps a copy has their own trip from then on, and stopping the link does not take their copy away. Your links are deleted with your account and are part of your export.

## The shared catalogue

Places, connections, airports, place photos and descriptions, experiences and the built map files are not private. Every signed in person reads them, and the map files are public. Only the administrator writes them. Nothing you add to your private rows goes into the catalogue.

## Backups and how long they keep your data

A scheduled job takes a backup every day and stores it in a private storage bucket. Each backup is deleted 90 days after it was written, and the bucket keeps no older versions.

- **In the backups:** your quotes, trips, documents, inbox and inbox token, tasks, task log and usage counts.
- **Not in the backups:** your bookings, your places to stay with their rooms and prices, your profile and your booking files. These leave with a delete.

When you delete your account, your rows are removed from the live project at once. The copies in the backups made before the delete remain until they expire, so at most 90 days after the last backup taken before your delete. No one restores a backup for one person, and a restore of an old backup cannot bring your account back.

## How to export your data

Ask your Claude to call the connector's `export_account` tool. It gives every row your account holds, table by table with your profile, and the paths of your booking files. It does not give the file contents.

## How to delete your account

Ask your Claude to call the connector's `delete_account` tool. You type your own account email, and Claude cannot fill it in for you. It removes your booking files first, then your tasks and rows and your account, and tells you how many rows went from each table. It cannot be undone. Your sign in stops working at once. The record that your address signed up goes too, and you can sign up again later as a new account.

## A limit that may matter to you

A signed upload link for a large booking file stays valid for 2 hours. If a file is sent to such a link after you delete your account, it lands in your old folder and nothing removes it yet. Do not send a file to an upload link after you delete (TECH-013).

## Gaps for the lawyer

This draft does not yet say, and Simon and the lawyer must settle:

- who is the responsible party and how to reach them,
- the legal basis, the terms of use and whether the rules for automated reads of Booking.com and Airbnb pages in your own browser are acceptable,
- the hosting region and the processors (the database host, the cloud account that runs the connector and backups, and the Claude API) by name,
- how long the live data of an active account is kept,
- how a person asks for a correction, a complaint or help, and how a person who lost access to their email deletes their account.
