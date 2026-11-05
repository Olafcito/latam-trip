# Technical decisions

Ids never change. Status is Proposed, Accepted, Implemented or Reconsidered. The plan author proposes, Simon accepts. A decision cites the FEAT or plan it came from, and a plan cites the TECH ids it relies on.

Format of an entry:

## TECH-NNN Short name

- **Decision.** What was chosen.
- **Reasoning.** Why, and what was weighed against it.
- **Applies to.** Files, tables or services.
- **Source.** The FEAT, plan or spec path.
- **Date.** **Status.**

No entries yet. The first doc audit fills this from the decisions already written in `docs/superpowers/specs/` and `docs/superpowers/plans/`, citing each source, and marks anything it is unsure of as Proposed.

## TECH-002 Open tasks start a Claude routine

- **Decision.** A trigger on `tasks` insert calls the fire endpoint of a Claude Code routine with pg_net, sending only the task id and type, with the URL and token in Supabase Vault. The routine runs the checklist for the task types that need no browser and no mailbox. A half hour pg_cron sweep fires it again for anything left open.
- **Reasoning.** The routine runs as Simon with his connectors, so Booking.com prices keep coming through the Booking.com connector and no API key is added. A GitHub Actions runner was weighed: it has no claude.ai connectors, needs an Anthropic API key and Supabase secrets, and Booking.com and Hostelworld block datacenter browsers. Browser tasks stay on Simon's machine.
- **Applies to.** `supabase/migrations/0017_task_runner.sql`, `docs/task-runner.md`, the routine "Trip checklist on new tasks".
- **Source.** Simon's request on 2026-11-05 for searches that run by themselves.
- **Date.** 2026-11-05. **Status.** Accepted.
