# latam-trip

Simon's planner for a two-month solo trip through Central America, Colombia and Bolivia (December 2026 to February 2027). Supabase holds shared trip and research data. The repo holds the Claude plugin, worker and two React apps.

## One checkout, one branch

- There is exactly one working copy of this repo on this machine: `C:\Users\Simon\Documents\github\latam-trip`. Never create a git worktree or a second clone. If you need to set work aside, such as edits left by stopped agents, commit them with explicit paths on `wip/YYYY-MM-DD-<topic>`, push it and switch back to a clean `main`. Never leave unfinished edits in `main`.
- `main` is the only long-lived branch and the one you work on. Commit in small steps and push to `origin/main` without asking.
- Short-lived branches are fine for a feature or an experiment, but they are merged into `main` and deleted as soon as the work is in. Before deleting a branch, confirm `git log main..<branch>` is empty.
- No git identity is configured on this machine. Commit with `git -c user.name=Claude -c user.email=noreply@anthropic.com`, matching the existing history.

## How plan work runs

Multi step work runs on superpowers. No feature goes from an idea to code without a problem, a journey, a scope and acceptance criteria. The `feature-spec` skill writes them to `docs/product/features/FEAT-NNN-<slug>.md`: discovery with Simon, a Sonnet `product-analyst` drafts, an Opus `product-lead` reviews. Then `writing-plans` turns the approved spec into a plan, `subagent-driven-development` runs it and `ui-roast` judges the result against the same journey. Speed beats ceremony, and tokens are a budget.

- **Cheap models first.** Subagents run on Sonnet (model `sonnet`), Haiku for mechanical work such as copying, sweeps and transcription. Opus only for a hard design or architecture call that Sonnet got wrong. A few agents at a time, stopped as soon as they are not needed. Name the model on every dispatch, because an omitted model inherits the session's Opus. Hand inputs over as file paths and ask for a few lines back, because everything an agent returns stays in the main session's context.
- **Two tiers.** The cheap agent prepares and records, the heavy agent judges, and Simon rules.

  | Agent | Model | Does |
  |---|---|---|
  | `design-analyst` | Sonnet | Roast shots, briefs, recording rulings in `docs/design/`, fixes files |
  | `senior-designer` | Opus | The roast itself, retrospectives every 5th review, audits every 15th |
  | `product-analyst` | Sonnet | Fills a FEAT spec from its problem and journey |
  | `product-lead` | Opus | Reviews a drafted FEAT spec for scope, data and privacy |
  | `doc-keeper` | Sonnet | The doc audit after every 5 built features, with the `claude-md-improver` rubric on this file |

  A new or changed agent file loads only when a session starts. Until then, dispatch `general-purpose` with the model named and tell it to read `plugin/agents/<name>.md` first.
- **Journey first.** A spec opens with the user journey it serves, the moments Simon goes through and what he needs to see or do at each. The spec is written from the journey, and the same journey is what the work is judged against at the end.
- **Fresh context for every task.** Each task is a new agent handed file paths, never a long running agent resumed for the next job. Files are the record, not conversation history, and a new screen or plan starts in a new main session.
- **Roast every finished page.** The `ui-roast` skill runs it. The `design-analyst` agent on Sonnet takes the before shots at 375 and 1440 with Playwright and writes a brief from the design log. The `senior-designer` agent on Opus roasts the shots against the user journey, knowing nothing of what was built or why. Simon rules on each finding, the analyst records it in `docs/design/` and writes the fixes, and the next roast of that screen checks them. Simon gets the screenshots too.

- **The main session coordinates.** It dispatches, keeps the ledger and rules on findings. It does not do the work itself, and controller steps such as applying migrations, data scripts, deploys and history rewrites go to subagents too.
- **Batch small work.** Related small tasks go to one implementer. Each task stays its own commit, so one reviewer walks the batch commit by commit and gives each task a spec verdict and a quality verdict.
- **Run disjoint work in parallel, in this checkout.** Plans or batches whose files do not overlap run at the same time in the one working copy, never in a worktree. Each agent stages only its own paths and never stashes, resets or checks out over another agent's work.
- **Check fixes against the diff.** The main session checks a fix round itself. A separate re-review is only for fixes that touch owner only data, the private bucket or what goes into built files.
- **Ship together.** The ship steps of several plans go out together, under one final review of the whole branch, which is the safety net.
- **Rule, do not ask.** Decide an ambiguity, write the ruling in the ledger and keep going. Ask Simon only before something irreversible he has not already approved, such as rewriting pushed history.

## Documentation

Docs are part of the work and describe the app as it is. `docs/README.md` is the map: every doc with its place, owner and triggers, the status words, and the doc audit counters. The rules there apply to every task and every skill, installed ones included.

- Before a task, read the docs that cover it and check the work against their decisions. During it, update those docs in the same commit or branch as the code. Never show planned work as built, and write down uncertainty instead of guessing.
- Every task that changes code or docs ends its report with docs read, docs updated, decisions recorded, known gaps and open discrepancies.
- Decisions carry ids that never change: PROD in `docs/product/`, DES in `docs/design/`, TECH in `docs/technical/`.

## Privacy

The repo and the `web` bucket are public. Booking references, prices paid, names and attachments live only in owner only tables and a private bucket, never in a built file, a commit, a doc or a test fixture. Fixtures use `TEST01`.

- `.env` holds the Supabase keys. Never print or commit it.
- Roast shots go in `docs/design/shots/`, which is git ignored because the shots show private trip data. The reviews and the design and product logs describe what a shot shows, never what a ticket says.
- No AWS account id or profile name in any file.
- Leave the untracked `Microsoft/`, `_to_delete/` and `.playwright-mcp/` alone, and stage explicit paths only.

## Supabase data

Supabase is the shared source of truth. Use `tripdb query TABLE` to read rows, `tripdb doc-get NAME` to read documents, `tripdb file NAME` to read built files, and `tripdb status` to inspect worker state. `data/README.md` describes the tables and commands. Never create or commit a local copy of live rows or documents.

## tripdb

`plugin/scripts/tripdb.py` is the supported way to write data: `python -I -X utf8 plugin/scripts/tripdb.py --root . <command>`, and `--help` lists the commands. It checks every row against its table's schema and refuses bad rows with the reason. Run its tests after changing it:

    python -I -X utf8 -m unittest discover -s plugin/scripts -p "test_*.py"

The scheduled build worker runs its own copy of `tripdb.py` and the pipeline scripts. A change to either reaches the worker only through `bash infra/deploy.sh --enable-schedules`. `tripdb status` shows the deployed worker version and latest build state.

Planned trips live in the trips table. `tripdb save-trip FILE` saves a trip as its next version and prints its id. The planner opens it at `/?trip=<id>`.

## Layout

- `web/`: the route map (React, Vite, MapLibre) with the Options pane for whole trips, long-haul tickets and regional flights. `cd web && npm run dev`.
- `planner/`: the two-tab trip app, Map and Trips. The Map tab imports `web/` through the `@map` alias, so a change in `web/src/map` shows in both apps. `cd planner && npm run dev`. Simon's desktop icon serves `main` at `http://localhost:5198`, so branch work does not show there until it is merged.
- `plugin/`: the flight crawler plugin, its agents, skills and scripts, `tripdb.py` among them.
- `infra/`: deploy scripts for the build worker (`deploy.sh`, `worker/`), the trip MCP (`mcp/`) and the planner site (`site_setup.sh`, `site_upload.sh`, `preview.sh`). The repo is public, so no AWS account id or profile name goes in any file.
- `data/`: `README.md` only. Shared tables and documents live in Supabase.
- `docs/`: `README.md` maps every doc and its owner. Also the Claude task hand-over (`docs/claude-tasks.md`), `docs/learnings/` with the notes each crawl round left about the sites, `docs/technical/` with TECH decisions and `docs/audits/` with the doc audits.
  - `docs/product/`: the product overview, product decisions (PROD ids) and feature specs (`features/FEAT-NNN-<slug>.md`), kept by `feature-spec`.
  - `docs/design/`: the living design log kept by `ui-roast`. `design-log.md` is the index of reviews, recurring problems (REC), open questions (Q) and counters, `design-principles.md` holds accepted principles, `design-decisions.md` holds DES ids, and `reviews/` holds each review, brief, fixes file, retro and audit. Files here are the record, not conversation history.
  - `docs/superpowers/specs/` and `plans/`: the older specs and the implementation plans.

## Frontend design

Any work that changes how `web/` or `planner/` looks or moves goes through the project skills in `.claude/skills/` listed below. The aim is an app that feels crafted, not vibe coded.

### Let the interface carry the information

This is the main design rule, on every screen size. Meaning lives in the form of the interface, not in sentences about it. Prose is the last resort.

- **Encode meaning in form.** Before writing a line, ask which visual property can carry it: an icon, a state, a position, a colour, a weight or the control itself. A fact sits on the thing it describes, a choice is a control, and a consequence shows where it lands.
- **Let the thing be the control.** People act on the object itself rather than on a button that describes the action. If a control needs a label to explain it, the mapping is weak.
- **Build hierarchy, not volume.** Order, size, weight, spacing and contrast decide what is seen first. The most important thing is the most obvious, and secondary detail recedes instead of piling up.
- **Disclose progressively.** Show the common path first. Detail waits one level deeper, in a tooltip, a tap, an expanded state or a sheet.
- **Practise restraint, not emptiness.** Every element earns its place. Cut meta text, repeated labels and explanations of what the interface already shows, but never hide what people need. Give it a better form instead.

Text growing inside a component is a design problem, not a copy problem. When a component starts collecting subtext or layers of secondary lines, stop and rethink the whole component with `apple-design`, `emil-design-eng` and 21st.dev rather than appending another line. A status written as a grey line under a row usually wants to be a mark on the row itself.

An icon that carries meaning gets an accessible name and a tooltip. New icons go in the apps' own sets (`planner/src/components/icons.tsx`, `web/src/map/icons.tsx`) and keep their style.

### Skills, in order

1. **Lead with `apple-design`** for every frontend task, not only phone work. It sets the hierarchy, restraint, materials, typography and motion, and Wallet, Maps and Flighty are the references for the booking views.
2. **`emil-design-eng`** for component design, polish and the small details that make it feel finished.
3. **Find components with the 21st.dev MCP** (`search`, `get_component`, `get_inspiration`, `get_theme`) before hand building a common component such as a picker, chip, segmented control, sheet or ticket card. Adapt what it returns to the app's tokens in `planner/src/styles`, never paste it in as is.
4. **Shape and critique with `impeccable`**, use its `distill` pass when a screen grows crowded, and run its anti-pattern and polish passes before calling the UI done.
5. **Motion:** `animate` to build an animation, `review-animations` to critique one, `improve-animations` to audit the app, `find-animation-opportunities` for where motion is missing, `remove-animations` when it feels over-animated, `animation-performance` when it drops frames, `animation-vocabulary` to name an effect.
6. **Phone:** `mobile-native` for the fixes that make the web app feel installed. Simon uses it on his phone while travelling.
7. **Before a frontend commit:** `web-design-guidelines` as the checklist for alignment, spacing, accessibility and interaction details, and `break-ui` to try the screen with worst-case data.
8. On request only: `prototype` for several versions behind a picker, `pick-ui-library` to choose a library.

Ideas from Claude Design (the Claude app) are welcome, but its look is not the reference. Build from 21st.dev components and the app's own tokens.

`hyperframes` and its siblings are for making videos, slideshows and motion pieces from HTML. They are not used for the app.

### Skills in .claude/

- `.claude/skills` holds two kinds of skills. Skills from `plugin/skills` and every agent in `.claude/agents` are generated copies: edit them in `plugin/` and run `python -I -X utf8 plugin/scripts/sync_claude_dir.py --root .`, never by hand in `.claude/`. The sync deletes and recopies them, so a hand edit in `.claude/` is lost. Skills installed with `npx skills add` are listed in `skills-lock.json`. The sync leaves them alone, and `npx skills update -p` updates them.
- The 21st.dev MCP lives in Simon's user config (`claude mcp add --scope user`), not in the repo, because it carries his API key. Never commit a key.

## Checks before a commit that touches an app

    cd web && npm run typecheck && npm test
    cd planner && npm run typecheck && npm test

## Writing

Plain sentences. No semicolons as separators and no em or en dashes anywhere, in docs, commit messages or UI text. Prices are in Danish kroner, times are local clock times. The UI never shows a question mark or a prose summary line.

Run Python with `-I -X utf8`.
