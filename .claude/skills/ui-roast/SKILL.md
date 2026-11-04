---
name: ui-roast
description: The two design reviews of latam-trip and the living design log in docs/design/. Design Roast is a short creative critique of one screenshot by the Opus senior-designer, given the shot directly. Design Audit is the deeper, structured investigation of screens, journeys and the design system. Use when Simon or an agent shares a screenshot and wants to know what is wrong with it, asks for a roast, a design review or an audit, or asks what the design principles, recurring problems or settled decisions are.
---

# Design Roast and Design Audit

Two different questions, kept apart.

| | Design Roast | Design Audit |
|---|---|---|
| Asks | What is fundamentally wrong with this screen | Why is it wrong, and what should we systematically change |
| Input | One screenshot, given to the reviewer directly | Several screens, a journey, the log, the code where needed |
| Who | `senior-designer` on Opus, fresh context | `senior-designer` on Opus, with the design skills it needs |
| Output | 3 to 5 big problems and a direction, short, in the conversation | A structured review file in `docs/design/reviews/` |
| Record | Only what Simon accepts afterwards | Findings, evidence, proposed decisions, log updates |
| When | Whenever someone wants an honest look at a screen | When a roast or discussion raises a cross screen, structural or design system question, or Simon asks |

Neither is mandatory. A straightforward change goes straight to implementation. A roast does not require an audit, and an audit does not require a roast first. Simon decides, and "Simon" here means Simon or the agent coordinating the work.

## Design Roast

The screenshot is the input. No preparation agent, no brief, no mandatory Playwright run, no skill pipeline. The reviewer is given the path of the shot and the name of the screen, and, if it helps, the journey step the screen serves in one line. It forms its own judgement from what it sees.

Independence matters. The reviewer is not told what was built or why, and it is not handed another agent's interpretation. It may open `docs/design/design-principles.md` and the last review of the screen if it wants context, but existing decisions inform its opinion, they do not dictate it. It is allowed to challenge a decision, saying so plainly.

How to run one:

1. The shot must be a file. If it only exists as a paste in the conversation, ask Simon to drop it in `docs/design/shots/<screen>/` (git ignored) or give the path. Shots at 375 wide and 1440 wide are both welcome but one is enough. Playwright is an option when nobody has a shot, not a step.
2. Dispatch `senior-designer` with the path, the screen name and the word roast. Relay what it returns as it is.
3. Discuss. Simon agrees, disagrees, challenges and refines. Nothing is recorded yet.
4. Decide what happens next: implement the agreed direction, explore alternatives with `prototype`, run an audit for the questions the roast could not settle, or leave it.
5. Record only what was accepted. An accepted rule becomes a DES entry. A problem seen before on other screens becomes or updates a REC entry. An unsettled question becomes a Q entry. A roast with nothing accepted leaves no file behind. Keep the roast text itself only if Simon asks, as `docs/design/reviews/roast-<screen>-<date>.md`.

The reviewer's brief, which the agent file repeats:

> Your job is not to conduct a comprehensive UI audit. Your job is to look at this screen, identify what makes it feel poorly designed, and tell us what fundamentally needs to change. Think like a creative director reviewing a product, not a QA engineer inspecting a component.

The shape of a roast, as a guide not a template:

| Section | Holds |
|---|---|
| Overall impression | How the screen feels and where it stands, honestly |
| Biggest problems | 3 to 5 high impact issues, most important first |
| Why they matter | A sentence or two per problem on what it costs the traveller |
| Design direction | What should change conceptually, with possible directions, not implementation detail |
| What works | What to preserve through any change |

Emerging design system problems go in when the shot shows them. Taste is marked as taste. The whole thing is short enough to read in two minutes and is written in the reviewer's own voice.

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

## Rules for both

The project's rules lead over any framework. Meaning lives in the form (icons, size, colour, position, the control itself), not in sentences. No question marks in the UI, no summary prose lines, no semicolons or dashes as separators. Restraint, but never hide what Simon needs. Prices are Danish kroner, times are local. Apple Wallet, Maps and Flighty are the references for the booking views.

Do not invent problems to fill a review. Do not redesign what works. Say whether a point is taste or usability. No generic advice such as "more whitespace" without saying where and why.

## Privacy

The repo is public. Nothing in `docs/design/` may hold names, booking references, prices paid or anything read off a ticket. Describe what a shot shows instead of quoting it. Shots stay in the git ignored `shots/` folder.
