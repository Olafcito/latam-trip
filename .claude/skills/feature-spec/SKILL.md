---
name: feature-spec
description: Turn a rough feature idea for the planner or the web map into an implementation ready specification in docs/product/features/, before any plan or code. Discovery with Simon on the heavy model, drafting on a Sonnet product-analyst, review on an Opus product-lead. Use whenever Simon describes something new to build or change, or asks what a feature should do, what its scope is or what was decided about it.
---

# Feature spec

No feature goes from a vague idea to code. It first gets a problem, a journey, a scope and acceptance criteria that a test or a roast can check.

Three skills, three questions, each reading the others' files:

| Skill | Asks | Writes |
|---|---|---|
| `feature-spec` | What should we build, and why | `docs/product/` |
| `ui-roast` | How does Simon experience it | `docs/design/` |
| `superpowers:writing-plans` | How do we build it | `docs/superpowers/plans/` |

Every step is a fresh agent or a fresh session handed file paths. The files are the truth, not the conversation.

## The files

    docs/product/
      product-overview.md       what the app is, who uses it, when
      product-decisions.md      decisions (PROD-001): decision, reasoning,
                                alternatives, date, status Proposed, Accepted,
                                Reconsidered
      features/FEAT-NNN-<slug>.md   one spec per feature

The older specs in `docs/superpowers/specs/` stay where they are and count as features already specified.

## The spec

A `FEAT` file has these sections, in order. Its header gives the id, the date and the status: Discovery, Drafted, Reviewed, Approved, Planned, Built, Roasted or Retired.

1. **Problem.** What is wrong or missing today, in Simon's words.
2. **Journey.** The moments Simon goes through, numbered, on his laptop or his phone, before or during the trip, and what he needs to see or do at each. Everything below is written from it.
3. **Goals.** What should be better afterwards.
4. **Non goals.** What we are explicitly not building.
5. **User stories.** One or more per journey step: "As Simon, at <moment>, I want <thing> so that <reason>".
6. **Acceptance criteria.** Per story, checks a test or a screenshot can prove. No "works well".
7. **Functional requirements.** What the system must do: data, rules, states.
8. **UX requirements.** How it behaves on screen, by reference to `docs/design/` principles and decisions (DES ids). A new pattern is flagged for the senior designer.
9. **Edge cases.** Worst case data and states: empty, very long, missing, offline, a date outside the trip, the phone.
10. **Dependencies.** The screens, files, tables and the MCP this touches. Privacy says what is owner only.
11. **Checks.** Which acceptance criteria get a test, and which journey steps the roast judges.
12. **Open questions.** What is undecided, each with who decides.

## The pipeline

1. **Discovery.** The main session, on the heavy model, with Simon. Use `superpowers:brainstorming` for the conversation, one question at a time. Settle the problem, the journey, the scope and the non goals, and ask whether the thing should exist at all. Then write a FEAT file with sections 1 to 4, status Discovery.
2. **Draft.** `product-analyst` on Sonnet fills sections 5 to 12 from the journey, the design log and the code it touches, then checks completeness. Status Drafted.
3. **Review.** `product-lead` on Opus reviews the whole spec: scope, whether the stories serve the journey, the architecture and privacy consequences, conflicts with product or design decisions. It edits the spec and lists what changed. Status Reviewed.
4. **Simon approves.** The main session shows him the journey, the non goals and the open questions. Status Approved.
5. **Plan.** `superpowers:writing-plans` with the FEAT file as its spec. Status Planned.
6. **Build.** `superpowers:subagent-driven-development` with Sonnet implementers. Status Built.
7. **Roast.** `ui-roast` judges the built screen against the FEAT journey. Status Roasted.

A trivial feature (one screen, no new data, no new pattern) skips step 3 and the analyst writes the whole spec. The main session says that it skipped the review and why.

## Who handles what

| Task | Model |
|---|---|
| Discovery, scope, non goals, ambiguity | Opus |
| Stories, acceptance criteria, formatting, completeness | Sonnet |
| Finding the files and tables a feature touches | Sonnet |
| Architecture, data model and privacy consequences | Opus |
| Conflicts with product or design decisions | Opus |
| The final review of a spec | Opus |

## Rules

Simon's planner rules hold in every spec: the earliest stop wins, no silent spare days, items open in place, the frontend shows all data the database holds. Plain sentences, no semicolons, no em or en dashes, no dashes as separators, no question marks in UI copy. The repo is public: no names, booking references or prices paid in any file.

## Documentation

Follow `docs/README.md`. Read the docs that cover the work before starting, update them in the same commit as the change, and end the report with five lines: docs read, docs updated, decisions recorded, known gaps and open discrepancies. This skill owns `docs/product/`. Setting a FEAT to Built adds one to the features counter in `docs/README.md`, and the fifth one since the last audit dispatches `doc-keeper`. A spec that is dropped is set to Retired, never deleted.
