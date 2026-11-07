# Documentation

Documentation is part of the work, not a step after it. Every doc in this repo describes the app as it is, has one owner and names the moment it is updated. This file is the map and the rules. Every skill and agent in `plugin/` points here, and the rules apply to installed skills too.

## Where each doc lives

| Doc | Place | Owner | Update when |
|---|---|---|---|
| Project rules | `CLAUDE.md` | Main session | A workflow, rule, command, agent or layout changes. Checked at a doc audit with the `claude-md-improver` rubric |
| Repo and app readmes | `README.md`, `planner/README.md`, `plugin/README.md` | The agent changing setup or commands | A run, build, test or install step changes |
| Data and tripdb | `data/README.md` | The agent changing a table or a `tripdb` command | A migration, a new table or column, a new or changed command |
| This map | `docs/README.md` | Main session, checked by `doc-keeper` | A doc is added, moved, retired or changes owner |
| Product overview | `docs/product/product-overview.md` | `feature-spec` | A screen or a user moment is added or removed |
| Product decisions | `docs/product/product-decisions.md` | `feature-spec` proposes, Simon accepts | A PROD decision is proposed, accepted or reconsidered |
| Product backlog | `docs/product/backlog.md` | Main session | Simon asks for something that is not specified yet, or a request becomes a FEAT spec or is dropped |
| Feature specs | `docs/product/features/FEAT-NNN-<slug>.md` | `feature-spec`, main session moves the status | A comprehensive feature is specified, its status changes, or scope changes during a build |
| Edge functions | `supabase/functions/<name>/README.md` | The agent changing the function | The request, the response, the secrets or the deploy steps change |
| Technical decisions | `docs/technical/technical-decisions.md` | The plan author proposes, Simon accepts | A plan picks or changes a library, schema, data flow, deploy shape or security boundary |
| Implementation plans | `docs/superpowers/plans/` | The `writing-plans` author | Written before a build. Marked done or superseded when merged |
| Older specs | `docs/superpowers/specs/` | Main session | Only to mark one superseded by a FEAT spec. New specs go in `docs/product/features/` |
| Build reports | `docs/superpowers/reports/` | Whoever ran the job | Never edited after writing |
| Design log index | `docs/design/design-log.md` | `ui-roast`, recorded by whoever has the ruling | An audit is written, a ruling lands, a REC or Q changes |
| Design principles | `docs/design/design-principles.md` | `ui-roast`, on Simon's ruling | A principle is accepted or retired |
| Design decisions | `docs/design/design-decisions.md` | `senior-designer` proposes, Simon rules, `ui-roast` records. A `design-roaster` roast proposes nothing, Simon accepts from it | A DES decision is proposed, ruled on, built or reconsidered |
| Reviews, retros | `docs/design/reviews/` | `senior-designer` writes, `ui-roast` records | Each audit, a roast Simon asks to keep, a retro when the evidence warrants one |
| Decision and harness log | `docs/harness-log.md` | Main session | A meaningful decision outside the PROD, DES and TECH logs, or a meaningful harness failure |
| Connector | `docs/connector.md` | The agent changing `infra/mcp` | A tool is added, renamed or removed, or sign in changes. The guide at `/?guide` lists the tools in `planner/src/components/Guide.tsx`, so it changes too |
| Privacy note | `docs/product/privacy-note.md` | The agent changing what is stored, backups or account deletion | A private table, a backup table, the retention, the caps or the export and delete tools change, and when the lawyer has reviewed it |
| Claude tasks | `docs/claude-tasks.md` | The agent changing task kinds or `tasks.py` | A task kind or its fields change |
| Task runner | `docs/task-runner.md` | The agent changing the task runner migrations, `latam_trip_mcp/runner.py`, the `task-runner` skill or the routine's prompt | The cloud task types, a contract, the trigger or the routine change |
| Momondo save | `docs/momondo-save.md` | The agent changing the save script | The script or its install steps change |
| Crawl learnings | `docs/learnings/` | `flight-crawl-orchestrator` | After each crawl round, one file per round |
| Doc audits | `docs/audits/doc-audit-NNN.md` | `doc-keeper` | Each doc audit, on demand |
| Historical briefs | `docs/design-brief.md`, `docs/claude-code-prompt-app-v2.md`, `docs/in-out/`, `docs/route-map/` | Nobody | Never. Kept for context. The live record is `docs/product/` and `docs/design/` |

A doc that is not in this table gets a row here or gets retired.

## Status words

Every requirement, decision and feature is in one of four states, and a doc never shows planned work as built.

| State | Feature spec | Decision |
|---|---|---|
| Proposed | Discovery, Drafted, Reviewed | Proposed |
| Approved | Approved, Planned | Accepted |
| Implemented | Built, Reviewed by design | Implemented |
| Deprecated | Retired | Reconsidered |

## Triggers

| When | Update |
|---|---|
| A comprehensive feature becomes work | A FEAT spec, and a PROD decision if it settles a rule. A lightweight change needs neither |
| A plan is written | The plan, and a TECH decision for each library, schema, data flow or deploy choice |
| A task changes behaviour | The docs that describe that behaviour, in the same commit as the code |
| A table, column or `tripdb` command changes | `data/README.md` |
| A connector tool changes | `docs/connector.md` |
| A run, build or test command changes | The readme for that app, and `CLAUDE.md` if it lists the command |
| A skill or agent is added, renamed or changes model | `CLAUDE.md` and this map |
| A plan is merged | The FEAT status to Built, the plan marked done |
| A roast, audit or retro is finished | The reply opens with markdown links to the file and its shots, before any discussion. A roast lives next to its shot in the git ignored `docs/design/shots/<screen>/<date>/` |
| Simon rules on a roast or an audit | The design log, principles and decisions, accepted outcomes only |
| A decision changes | Every doc that cites its id, found with Grep |
| A meaningful decision or harness failure outside the id logs | `docs/harness-log.md` |

## Every task

**Before the work.**
1. Read the docs that cover it, found through the table above.
2. Note the decisions, requirements and constraints that apply.
3. Check whether the work conflicts with them. A conflict is raised before building, not after.
4. List which docs the work will change.

A doc can be out of date. If the code and a doc disagree, read the git history of both before trusting either.

**During the work.** Update docs in the same commit or branch as the code they describe.
- Edit what exists instead of writing a second doc on the same subject.
- Remove instructions and specs that are no longer true. Keep history only where it explains a decision.
- Record a significant decision with its reasoning, as a PROD, DES or TECH entry.
- Link related docs by path and by id (FEAT, PROD, DES, TECH, REC, Q).
- Leave unrelated docs alone.
- Never invent a technical detail. If something is uncertain, write that it is uncertain.

Traceability runs one way through ids: a FEAT cites its PROD and DES ids, a plan cites its FEAT and TECH ids, a commit or test names the task it proves, and a review cites the FEAT journey.

**After the work.** A task that changed docs or recorded a decision says so in its report: docs updated, decisions recorded, known gaps. A task that changed neither says nothing about docs.

## Doc audits

The `doc-keeper` agent on Sonnet audits the docs when Simon asks, or when a run of work has left the docs visibly behind the code. It checks every doc in the table against the code and git history, runs the `claude-md-improver` rubric on `CLAUDE.md`, fixes what is plainly stale, and lists contradictions it cannot settle for Simon. It writes `docs/audits/doc-audit-NNN.md`. There is no counter and no schedule.

The agent doing a task keeps its own docs up to date, because it already has the context. There is no separate doc agent per task.
