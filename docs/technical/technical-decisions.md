# Technical decisions

Ids never change. Status is Proposed, Accepted, Implemented or Reconsidered. The plan author proposes, Simon accepts. A decision cites the FEAT or plan it came from, and a plan cites the TECH ids it relies on.

Format of an entry:

## TECH-NNN Short name

- **Decision.** What was chosen.
- **Reasoning.** Why, and what was weighed against it.
- **Applies to.** Files, tables or services.
- **Source.** The FEAT, plan or spec path.
- **Date.** **Status.**

## TECH-001 Reading bookings with the Claude API in an edge function

- **Decision.** Add booking reads a confirmation (a PDF, a screenshot, a saved .eml or pasted mail text) in the Supabase edge function `read-booking`. The planner sends the files inline as base64 with the leg and the text. The function checks the caller with `public.is_owner()`, asks the Claude Messages API for one forced `booking` tool call and returns its input. It stores no file, reads and writes no table and logs nothing of the content. The form opens filled in, and Simon checks and saves.
- **Reasoning.** The app has no mailbox access, so the confirmation has to come to it. Gmail API access was rejected because a public app reading mail needs Google's restricted scope review. A pasted Gmail link is kept as the booking's mail link and nothing more. The function holds the Anthropic key as a Supabase secret, so no key reaches the browser, and the owner check keeps others from spending it. Forwarding mail to an address of the app is the later step for other users.
- **Applies to.** `supabase/functions/read-booking/`, `planner/src/lib/readBooking.ts`, the `ANTHROPIC_API_KEY` and `READ_BOOKING_MODEL` function secrets.
- **Source.** The Add booking task of the `feat/add-booking` worktree.
- **Date.** 2026-11-05. **Status.** Implemented.

## TECH-002 Open tasks start a Claude routine

- **Decision.** A trigger on `tasks` insert calls the fire endpoint of a Claude Code routine with pg_net, sending only the task id and type, with the URL and token in Supabase Vault. The routine runs the checklist for the task types that need no browser and no mailbox. A half hour pg_cron sweep fires it again for anything left open.
- **Reasoning.** The routine runs as Simon with his connectors, so Booking.com prices keep coming through the Booking.com connector and no API key is added. A GitHub Actions runner was weighed: it has no claude.ai connectors, needs an Anthropic API key and Supabase secrets, and Booking.com and Hostelworld block datacenter browsers. Browser tasks stay on Simon's machine.
- **Applies to.** `supabase/migrations/0017_task_runner.sql`, `docs/task-runner.md`, the routine "Trip checklist on new tasks".
- **Source.** Simon's request on 2026-11-05 for searches that run by themselves.
- **Date.** 2026-11-05. **Status.** Accepted.
