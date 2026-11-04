---
name: feature-spec
description: Decide how much specification a feature of the planner or the web map needs, and write it in docs/product/ before any plan or code. Lightweight for small clear changes, a full FEAT spec for complex journeys, new data or real product decisions. Use whenever Simon describes something new to build or change, or asks what a feature should do, what its scope is or what was decided about it.
---

# Feature spec

Work gets as much specification as its uncertainty deserves, no more. Two levels.

| Level | When | What is written |
|---|---|---|
| Lightweight | A small change, clear requirements, one screen, no new data, no new pattern | A few lines in the conversation or the plan: the problem, the journey step it serves, what done looks like. Then implement |
| Comprehensive | A complex journey, several systems or tables, a real product decision, unclear requirements or architectural consequences | A `FEAT-NNN-<slug>.md` file in `docs/product/features/`, discussed with Simon, then planned and built |

Most work is lightweight. Say which level you chose and why in one line, and move on.

## The files

    docs/product/
      product-overview.md       what the app is, who uses it, when
      product-decisions.md      decisions (PROD-001): decision, reasoning,
                                alternatives, date, status Proposed, Accepted,
                                Reconsidered
      features/FEAT-NNN-<slug>.md   one spec per comprehensive feature

The older specs in `docs/superpowers/specs/` stay where they are and count as features already specified.

## A comprehensive spec

A `FEAT` file has these sections, in order. Its header gives the id, the date and the status: Discovery, Drafted, Reviewed, Approved, Planned, Built, Reviewed by design or Retired. Sections that do not apply are kept short, not padded.

1. **Problem.** What is wrong or missing today, in Simon's words.
2. **Journey.** The moments Simon goes through, numbered, on his laptop or his phone, before or during the trip, and what he needs to see or do at each. Everything below is written from it.
3. **Goals.** What should be better afterwards.
4. **Non goals.** What we are explicitly not building.
5. **User stories.** One or more per journey step: "As Simon, at <moment>, I want <thing> so that <reason>".
6. **Acceptance criteria.** Per story, checks a test or a screenshot can prove. No "works well".
7. **Functional requirements.** What the system must do: data, rules, states.
8. **UX requirements.** How it behaves on screen, by reference to `docs/design/` principles and decisions (DES ids). A new pattern with no decision behind it is flagged.
9. **Edge cases.** Worst case data and states: empty, very long, missing, offline, a date outside the trip, the phone. The `break-ui` worst cases that apply.
10. **Dependencies.** The screens, files, tables and the MCP this touches. Privacy says what is owner only.
11. **Checks.** Which acceptance criteria get a test, and which journey steps a design review judges.
12. **Open questions.** What is undecided, each with who decides.

## How a comprehensive spec gets written

1. **Discovery with Simon.** The main session, with `superpowers:brainstorming`, one question at a time. Settle the problem, the journey, the scope and the non goals, and ask whether the thing should exist at all. Write sections 1 to 4.
2. **Draft the rest.** The main session fills sections 5 to 12 itself from the journey, the product and design decisions and the code it touches, or hands that to a Sonnet agent given this skill and the file path when the spec is large. Every story comes from a journey step, every criterion can be proved, every dependency names a file or table. End with a Completeness line naming what is still thin.
3. **Independent review, when warranted.** For a spec that touches owner only data, the public bucket, the schema, or a product decision, or when Simon asks, a fresh Opus agent given this skill reviews it with the questions below, edits where it is sure, adds a Review section listing what changed, what it would cut and the questions only Simon can answer, and proposes PROD decisions as Proposed. Otherwise the main session asks itself the same questions and says that it skipped the separate review.
4. **Simon approves.** Show him the journey, the non goals and the open questions.
5. **Plan and build.** `superpowers:writing-plans` with the FEAT file as its spec, then build it. A design review of the result, through `ui-roast`, is an option when the screen warrants it, not a stage.

The review questions:

- Does the feature earn its place, and is it the smallest thing that serves the journey.
- Does every story serve a journey step, and does any journey step lack one.
- Are the non goals the right ones, and is anything in scope that should not be.
- Are the acceptance criteria provable, and do they catch the edge cases that would bite during the trip.
- What does it mean for the data: which tables, what is owner only, what reaches a built file in the public bucket.
- Does it conflict with a product or design decision. Say which, and whether the spec or the decision should give.
- Is there a simpler way the planner already half supports.

## Rules

Simon's planner rules hold in every spec: the earliest stop wins, no silent spare days, items open in place, the frontend shows all data the database holds. Plain sentences, no semicolons, no em or en dashes, no dashes as separators, no question marks in UI copy. The repo is public: no names, booking references or prices paid in any file.

## Documentation

Follow `docs/README.md`. Read the product and design decisions before writing, update the docs the feature changes in the same commit as the code, and record a PROD decision when the feature settles a rule. This skill owns `docs/product/`. A spec that is dropped is set to Retired, never deleted.
