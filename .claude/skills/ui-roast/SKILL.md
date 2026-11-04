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

The roast is the first line of review for UI work. A screen that was built or changed gets roasted before Simon looks at it, and an ongoing task can be picked up with a shot at any time. The audit is not mandatory. A roast does not require an audit, and an audit does not require a roast first. Simon decides what follows, and "Simon" here means Simon or the agent coordinating the work.

## Running a roast

The roaster's instructions live in `plugin/agents/design-roaster.md` and nowhere else. This skill only says how to run one and what happens with it.

1. The shot must be a file. If it only exists as a paste in the conversation, ask Simon to drop it in `docs/design/shots/<screen>/<date>/` (git ignored) or give the path. One shot is enough, and Playwright is an option when nobody has one, not a step. When Playwright takes it, give `browser_take_screenshot` the absolute path, because a relative one resolves against the folder above the repo. Confirm the file exists before dispatching, a roaster sent to a missing file wastes a Read and a retry.
2. Dispatch `design-roaster`: "Roast this screenshot: <path>", the screen name and the user story in one or two lines: who comes to this screen, in which moment, to do what. A roast without the story judges the wrong job, so write it out from the spec's journey or the product overview, never leave it at the screen's name. Give it no design decisions, no earlier reviews and no explanation of why the screen looks the way it does. Independence means context about what the screen should achieve, not instructions about what it should look like. The roaster reads `visual-design-foundations` before the shot, that is in its brief and needs no mention. The roaster reads the screen as a stranger would, so it will question things the code explains, such as a tooltip or a conditional label. That is the point, not a flaw to correct in the brief.
3. Deliver it as two clickable links. Write the roast as it came to `docs/design/shots/<screen>/<date>/roast.md`, next to the shot and git ignored like it: a title, the date and screen, the purpose line the roaster was given, an image line `![...](desktop.png)`, then the roast verbatim. No ruling sheet, no coordinator's note inside it. The reply then starts with one line in this shape, the links as markdown links to the workspace relative paths, which Simon can click on his PC and his phone: "Roast done, see here: [desktop.png](docs/design/shots/<screen>/<date>/desktop.png) and [roast.md](docs/design/shots/<screen>/<date>/roast.md)." Then the roast text. No Artifact page, no `SendUserFile`, those cost tokens for nothing. The session that dispatched the roaster does this, never the roaster. A roast without those two links in the reply has not been delivered.
4. Discuss, naturally. Simon reacts to the roast as a conversation, agrees with one thing, challenges another, asks the roaster to rethink the concept. No numbered rulings, no accept or reject table. The coordinating agent gives its own view where it differs and, when asked, says what the code explains that the roaster could not see, such as a tooltip. It never corrects the roast itself.
5. Decide what happens next: implement the agreed direction, explore alternatives with `prototype`, run an audit for the questions the roast could not settle, or leave it.
6. Record only what was accepted. An accepted rule becomes a DES entry. A problem seen before on other screens becomes or updates a REC entry. An unsettled question becomes a Q entry. Add a short "Outcome" section at the end of the roast file saying what was accepted and what was left. The roast stays in the git ignored shots folder, so it may quote whatever the shot showed. It moves to `docs/design/reviews/roast-<screen>-<date>.md` only if Simon asks and only after a check that it quotes nothing private.

## The roast loop after a build

A screen built or rebuilt from a spec goes through one roast loop before Simon sees it. The loop count is n, and n=1 unless Simon sets another number. Before the loop comes a gate: a spec that changes a screen's concept, such as a list becoming a grid or a strip becoming a timeline, is shown to Simon as a shot of a prototype or a mock before the batches are built. A roast ruling in a spec is a sentence, not a picture, and on 2026-11-04 four batches were built on fourteen such sentences before anyone saw the screen. One loop is:

1. Shoot the built screen to `docs/design/shots/<screen>/<date>/after.png` in the main checkout, at 1440 by 900 unless the spec is about the phone. When a before shot exists it is `before.png` with its roast in `roast-before.md`, taken and roasted the same way before the build started.
2. Roast it once, as in "Running a roast", and write it to `roast-after.md`. The roaster gets the after shot and, when it exists, the before shot too, with the screen name and the user story, nothing about what was just built or what changed. With two shots it says first which one does the job better. A roast of the after shot alone cannot say whether the screen lost ground.
3. Send one fix round to a fresh implementer. The coordinator picks from the roast what fits the spec's journey: things the spec asked for and the build missed, and usability problems the spec did not foresee. A concept change the roast proposes, or anything the spec rejected in its roast rulings, is left for Simon and named in the reply. When the before roast and the after roast ask for the same concept change, that is one question put to Simon at the top of the reply, not a line in the roast file. The fix round gets the roast's own words for the points chosen, the spec and the files, nothing else.
4. Shoot the fixed screen to `final.png`. No second roast at n=1. Then write an Outcome section at the end of `roast-after.md` with two lists, what the fix round changed as shot in `final.png`, and what was left for Simon with the reason for each (a concept change, a spec ruling, a data gap). Without it the loop is not finished. The reply opens with the links to every shot and roast file, then the same two lists.

Rulings on the roast, DES, REC and Q entries, still happen only after Simon has read it.

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

When the review file is written, the session that dispatched the audit starts its reply with "Audit done, see here:" and markdown links to the review file and each shot it cites, workspace relative paths. Same for a retrospective and a fixes file. The audit, unlike the roast, has numbered findings and Simon rules on them by number.

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
