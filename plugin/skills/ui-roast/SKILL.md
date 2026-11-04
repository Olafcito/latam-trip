---
name: ui-roast
description: Roast a finished screen of the planner or the web map and keep the living design knowledge base in docs/design/. Two agents, a cheap design-analyst on Sonnet and a heavy senior-designer on Opus, each in a fresh context. Use when a page or pane is built, when Simon asks for a roast or a design review, for a retrospective or audit, or to answer what the design principles, recurring problems or settled decisions are.
---

# UI roast

The heavy model makes the design judgements. The cheap model keeps the memory. Simon decides. Nothing gets fixed until he has ruled.

## Fresh context for every task

Every step below is a new agent with a new context. Hand over file paths, never history. The files in `docs/design/` are the truth, not any conversation, so any model or session can pick the work up. The main session only dispatches, passes paths and relays Simon's rulings. It does not read shots or reviews beyond the short tables it shows Simon. A long running main session is itself a cost: start a fresh one for each screen.

## The files

    docs/design/
      design-log.md          index: review history, recurring problems (REC-001),
                             open questions (Q-001), escalations, counters
      design-principles.md   accepted principles only
      design-decisions.md    decisions (DES-001): decision, reasoning, alternatives,
                             applies to, date, status Proposed, Accepted,
                             Implemented or Reconsidered
      reviews/review-NNN.md  one per review, findings F1 and on
      reviews/review-NNN-brief.md, review-NNN-fixes.md, retro-NNN.md, audit-NNN.md
      shots/<screen>/NNN/    git ignored, the shots show private data

Ids never change once given. A finding is an observation. It becomes a rule only through a decision Simon accepts.

## The pipeline for one screen

1. **Prep.** `design-analyst` on Sonnet, mode prep. Before shots at 1440x900 and 375x812 of every journey state with Playwright, then a brief: the journey, the shots, the components, the decisions and problems that apply, the open findings of the last review, candidate issues, and the escalation block.
2. **Review.** `senior-designer` on Opus, given only the brief path. It writes the review.
3. **Simon rules.** The main session shows him the shots and the findings table: id, finding, priority, suggested fix. He accepts, rejects or changes each.
4. **Record.** `design-analyst` on Sonnet, mode record, with his rulings. It updates the log and writes the fixes file.
5. **Fix.** A fresh implementer on Sonnet takes the fixes file, through the usual journey, spec and test first rules in CLAUDE.md.
6. **Check.** The next review of that screen starts at step 1 and marks every earlier finding resolved, partly resolved or regressed.

Every fifth review, a fresh `senior-designer` writes a retrospective. Every fifteenth review it writes an audit.

## Who handles what

| Task | Model |
|---|---|
| Shots, brief, history, statuses, duplicates, formatting | Sonnet |
| Exact duplicate of a known problem | Sonnet settles |
| An accepted decision clearly applies | Sonnet settles |
| Flagging a possible recurring problem | Sonnet flags |
| Validating that a problem is systemic | Opus |
| Any screen review, or a comparison of two versions | Opus |
| A new component with no precedent | Opus |
| Conflicting principles or decisions | Opus |
| An information architecture change | Opus |
| Unclear hierarchy, a possible accessibility problem | Opus |
| Retrospectives and audits | Opus |

## The escalation block

The analyst ends every brief with this block, so the designer gets focused context instead of the whole history.

    {
      "escalation_required": true,
      "reason": "possible information architecture problem",
      "affected_components": ["booked-flight-sheet", "day-strip"],
      "related_decisions": ["DES-004"],
      "related_problems": ["REC-002"],
      "question": "Should the booking facts sit apart from the day navigation"
    }

## The roast

The senior designer critiques what matters, not every category: hierarchy, information architecture, layout and spacing, typography, colour and contrast, components, consistency, cognitive load, affordances, the phone. It reports:

1. **The roast.** Direct and honest observations.
2. **Findings.** The 3 to 5 that matter, ranked. Each with the problem and the shot, the root cause, the impact, the journey step it fails, the scope (screen, component, design system or information architecture), the priority (critical, high, medium or low) and the fix, written so it can become a task.
3. **Restructuring.** What to remove, combine, separate, move, redesign, and what stays.
4. **Why.** The principle behind each change and how it applies to this screen, not just its name: Nielsen, Gestalt, progressive disclosure, recognition over recall, WCAG.
5. **Fix order.** First, second and third.
6. **Verdict and Keep.** The overall call, and what works and must survive a fix.

The project's rules lead over the framework. Meaning lives in the form (icons, size, colour, position, the control itself), not in sentences. No question marks in the UI, no summary prose lines, no semicolons or dashes as separators. Restraint, but never hide what Simon needs. Prices are Danish kroner, times are local.

Do not invent problems to fill a review. Do not redesign what works. Say whether a point is taste or usability. No generic advice such as "more whitespace" without saying where and why.

## Privacy

The repo is public. Nothing in `docs/design/` may hold names, booking references, prices paid or anything read off a ticket. Describe what a shot shows instead of quoting it.

## Documentation

Follow `docs/README.md`. Read the docs that cover the work before starting, update them in the same commit as the change, and end the report with five lines: docs read, docs updated, decisions recorded, known gaps and open discrepancies. This skill owns `docs/design/`. A ruling that changes a DES decision updates every doc that cites its id.
