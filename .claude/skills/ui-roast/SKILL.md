---
name: ui-roast
description: The Design Audit of latam-trip and the living design log in docs/design/. The audit is the deeper, structured investigation of screens, journeys and the design system by the Opus senior-designer, written to a review file. Also says how a Design Roast (the design-roaster agent, one screenshot, in the conversation) is run and what of it gets recorded. Use when Simon or an agent asks for a roast, a design review, an audit or a retrospective, or asks what the design principles, recurring problems or settled decisions are.
---

# Design Audit and the design log

Two reviews, two agents, two mindsets.

| | Design Roast | Design Audit |
|---|---|---|
| Asks | What is fundamentally wrong with this screen | Why is it wrong, and what should we systematically change |
| Who | `design-roaster` on Opus, an outside creative director | `senior-designer` on Opus, the internal investigator |
| Input | One screenshot, the screen name, one line on what the screen is for | Several screens, a journey, the principles, decisions and history, the code where needed |
| Knows | The product and the screen's purpose, not the design decisions, reviews or code | The whole record, and builds on it |
| Output | A short, opinionated roast with a score, in the conversation | A structured review file in `docs/design/reviews/` |
| Record | Only what Simon accepts afterwards | Findings, evidence, proposed decisions, log updates |
| When | Whenever someone wants an honest look at a screen | When a roast or discussion raises a cross screen, structural or design system question, or Simon asks |

Neither is mandatory. A straightforward change goes straight to implementation. A roast does not require an audit, and an audit does not require a roast first. Simon decides, and "Simon" here means Simon or the agent coordinating the work.

## Running a roast

The roaster's instructions live in `plugin/agents/design-roaster.md` and nowhere else. This skill only says how to run one and what happens with it.

1. The shot must be a file. If it only exists as a paste in the conversation, ask Simon to drop it in `docs/design/shots/<screen>/` (git ignored) or give the path. One shot is enough, and Playwright is an option when nobody has one, not a step.
2. Dispatch `design-roaster`: "Roast this screenshot: <path>", the screen name and, when useful, one line on what the screen is for or which journey step it serves. Give it no design decisions, no earlier reviews and no explanation of why the screen looks the way it does. Independence means context about what the screen should achieve, not instructions about what it should look like.
3. Relay the roast as it is. Discuss. Simon agrees, disagrees, challenges and refines. Nothing is recorded yet.
4. Decide what happens next: implement the agreed direction, explore alternatives with `prototype`, run an audit for the questions the roast could not settle, or leave it.
5. Record only what was accepted. An accepted rule becomes a DES entry. A problem seen before on other screens becomes or updates a REC entry. An unsettled question becomes a Q entry. A roast with nothing accepted leaves no file behind. Keep the roast text only if Simon asks, as `docs/design/reviews/roast-<screen>-<date>.md`.

## Design Audit

The audit keeps the detailed format the log already uses. It investigates rather than reacts: several screens, the user journey end to end, responsive behaviour, cross screen consistency, information architecture, component patterns, interaction patterns, the design system, missing or duplicated information, and whether earlier decisions still hold.

Scope it. Name the screens, the journey and the question. Shots at 1440x900 and 375x812 of the states that matter, taken with Playwright or supplied, go in `docs/design/shots/<screen>/<NNN>/`. The reviewer reads the shots, `design-principles.md`, `design-decisions.md`, the REC and Q entries that apply and the last review of each screen, and code where a finding depends on what the app can do. It loads `apple-design`, `impeccable` and `emil-design-eng` when they help the investigation, not all of them every time.

### Method

- **Classify by kind.** Every finding says whether it is a semantic inconsistency (one treatment carries conflicting meanings), excessive prominence (more attention than its importance warrants), a usability problem (an action or a fact is hard to understand or use), or an aesthetic preference. A preference is never written up as a usability problem.
- **Justify.** Every recommendation says what is wrong, why, what it costs the user, why the proposed direction is better, and which kind it is.
- **Name the source of the problem**, so the fix lands in the right place: information architecture or data modelling, component consistency, design system such as semantic colour, interaction, data completeness. These are examples. The reviewer finds the real cause rather than forcing a category.
- **Consistency is not uniformity.** Ask for the same underlying structure and the same way of presenting contextual facts, not the same layout. A flight, a stay and an activity need different facts. Green on booked, paid and selected is a problem only if those meanings conflict in context.
- **Judge the journey, not the component.** For a booked flight: can the traveller understand what they booked, see that it is confirmed, find the reference, find check in, know what the ticket includes, know how to change it. A component can pass alone and fail the journey.
- **Stay operationally realistic.** Do not recommend what the app cannot support. Change is usually the primary action on a booking, remove is secondary and destructive and needs confirmation, and undo is suggested only where the operation really supports it.
- **Build on the record.** Before overturning a behaviour, check whether a decision explains it. Reopen a decision with a reason, as Reconsidered, instead of rediscovering it.

### The review file

`docs/design/reviews/review-NNN.md`, next number in the index, with:

1. **Header.** Screens, date, shots, journey, the question asked.
2. **Earlier findings.** On a screen reviewed before, each earlier finding marked resolved, partly resolved, regressed or superseded, with whether the change helped.
3. **Observations.** Direct and honest, what matters, not every category.
4. **Findings.** The ones that matter, ranked. Each with the problem and the shot, the root cause and its source area, the kind, the impact, the journey step it fails, the scope (screen, component, design system or information architecture), the priority (critical, high, medium or low) and a fix written so it can become a task.
5. **Restructuring.** What to remove, combine, separate, move, redesign, and what stays.
6. **Why.** The principle behind each change and how it applies here, not just its name.
7. **Fix order.**
8. **Recurring problems.** Which REC entries this confirms, which it does not, and any new candidate with its evidence.
9. **Proposed decisions.** As Proposed, never Accepted. Accepting is Simon's.
10. **Verdict and Keep.**
11. **Rulings.** Empty until Simon rules.

Priority scale: critical means the screen fails its core job, high means a journey step fails, medium and low are polish.

## The living design log

    docs/design/
      design-log.md          index: review history, recurring problems (REC-NNN),
                             open questions (Q-NNN)
      design-principles.md   accepted principles only (P-NNN), what the accepted
                             decisions add up to
      design-decisions.md    decisions (DES-NNN): decision, reasoning, alternatives,
                             applies to, date, status Proposed, Accepted,
                             Implemented or Reconsidered
      reviews/               audits as review-NNN.md, kept roasts, retros, fixes files
      shots/<screen>/NNN/    git ignored, the shots show private data

Ids never change once given. Three levels are kept apart:

- **Hypothesis.** A roast observation, a candidate REC, an open Q. Cheap to write, cheap to drop.
- **Accepted decision.** A DES entry Simon accepted, with its reasoning and the alternatives. This is the log's main content: decisions, why, what was challenged, what was superseded.
- **Principle.** A line in `design-principles.md`, only when accepted decisions add up to a rule that has held across screens.

The log records what is meaningful: accepted and rejected recommendations with the reason, recurring patterns, decisions and their rationale, hypotheses that need validation, decisions that were challenged or superseded. It does not record every observation of every roast. Earlier entries are preserved and amended, never rewritten.

**Recording a ruling.** Whoever has the context does it, usually the main session, or a Sonnet agent given this skill and the rulings when there are many. Write the ruling into the review's Rulings section in Simon's words, update the status of each finding, REC and Q touched, move an accepted DES to Accepted and a rejected one to Reconsidered with his reason, and add a principle only when a decision states one. A ruling that changes a DES updates every doc that cites its id. A fixes file, `review-NNN-fixes.md`, lists one task per accepted finding when the fixes will be built later. Commit `docs/design/` and never the shots.

**Periodic synthesis.** A retrospective, `reviews/retro-NNN.md`, is written when the evidence warrants it, not on a counter: several reviews since the last one, the same problem resurfacing, decisions that start to contradict each other, or Simon asking. It names the commonest problems, what helped most, contradictions between decisions, and which patterns have proven themselves through implementation and belong in the design system. That last part is what moves knowledge into `design-principles.md` and the apps' tokens and shared components. The design system changes through validated patterns and synthesis, not after every roast or feature.

## Rules for the audit and the log

The project's rules lead over any framework. Meaning lives in the form (icons, size, colour, position, the control itself), not in sentences. No question marks in the UI, no summary prose lines, no semicolons or dashes as separators. Restraint, but never hide what Simon needs. Prices are Danish kroner, times are local. Apple Wallet, Maps and Flighty are the references for the booking views.

Do not invent problems to fill a review. Do not redesign what works. Say whether a point is taste or usability. No generic advice such as "more whitespace" without saying where and why.

## Privacy

The repo is public. Nothing in `docs/design/` may hold names, booking references, prices paid or anything read off a ticket. Describe what a shot shows instead of quoting it. Shots stay in the git ignored `shots/` folder.
