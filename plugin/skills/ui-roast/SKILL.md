---
name: ui-roast
description: Roast a finished screen of the planner or the web map from screenshots and its user journey, then log the findings and the suggested fixes in the living design log at docs/design/design-log.md. Use when a page or pane is built, when Simon asks for a roast or a design review, or when asking what the design principles, recurring problems or settled design decisions are.
---

# UI roast

A brutally honest senior product designer reviews one screen against the journey it serves. The roast does not fix anything. It writes findings and suggested fixes into the design log, and Simon and the main session decide what gets fixed. The log grows into the app's design system.

## Before the roast

1. Read `docs/design/design-log.md`: the principles, the decisions and the history of this screen. Do not reopen a settled decision without new evidence.
2. Take the before shots with the Playwright MCP browser at 1440x900 and 375x812, every state the journey passes through, plus the worst case you can reach. Save them in `docs/design/shots/<screen>/<review>/` with plain names (`trip-1440.png`, `trip-375-scrolled.png`). That folder is git ignored because the shots show private data. Reuse fresh shots if the dispatch gives them.
3. Look at every shot with the Read tool.

The reviewer judges only what the shots show against the journey. It does not read the code or the spec of the screen. A screen is roasted by a fresh agent on Sonnet that never built it.

## The roast

Critique what matters, not every category: visual hierarchy, information architecture, layout and spacing, typography, colour and contrast, components, consistency, cognitive load, affordances, the phone.

The project's rules lead. Meaning lives in the form (icons, size, colour, position, the control itself), not in sentences. No question marks in the UI, no summary prose lines, no semicolons or dashes as separators. Restraint, but never hide what Simon needs. The most important thing is the most obvious. Prices are Danish kroner, times are local.

Do not invent problems to fill a review. Do not redesign what works. Taste is not usability, so say which one a finding is. No generic advice such as "more whitespace" without where and why.

## What goes in the log

Add one entry to "Screen reviews" with the date, the review number and the shot folder, then:

- **Verdict.** One short paragraph.
- **Findings.** The 3 to 5 that matter, ranked. Each: what is wrong in which shot, its root cause, which journey step it fails, its scope (screen, component, design system or information architecture), its priority (critical, high, medium or low), and the concrete fix you suggest, written so it can become a task.
- **Keep.** What works and must survive a fix.

Then update the rest of the log:

- A problem seen on two screens or more moves to "Recurring problems" as a design system issue, linked from each screen.
- A fix that would set a rule goes to "Decisions" as Proposed with its reasoning, the alternatives and where it applies. Only Simon or the main session moves it to Accepted. Implemented means it shipped, Reconsidered means new evidence reopened it.
- On a revised screen, compare with its last review. Mark findings resolved, partly resolved or regressed, and say whether the change made the design better.
- Open ideas go to "Open questions".
- After every fifth review, write a short retrospective: the commonest problems, what helped most, the principles emerging, what to standardise next.

Keep observations, hypotheses and decisions apart. A roast finding is an observation. It becomes a rule only through a decision.

## Privacy

The repo is public. The log never holds names, booking references, prices paid or anything read off a ticket. Describe a shot ("the booked flight sheet") instead of quoting it.

## Return

Return only the verdict and the number of critical and high findings. Everything else is in the log.
