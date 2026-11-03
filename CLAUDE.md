# latam-trip

Simon's planner for a two-month solo trip through Central America, Colombia and Bolivia (December 2026 to February 2027). Supabase holds shared trip and research data. The repo holds the Claude plugin, worker and two React apps.

## One checkout, one branch

- There is exactly one working copy of this repo on this machine: `C:\Users\Simon\Documents\github\latam-trip`. Never create a git worktree or a second clone. If you need to set work aside, make a WIP commit on a branch.
- `main` is the only long-lived branch and the one you work on. Commit in small steps and push to `origin/main` without asking.
- Short-lived branches are fine for a feature or an experiment, but they are merged into `main` and deleted as soon as the work is in. Before deleting a branch, confirm `git log main..<branch>` is empty.
- No git identity is configured on this machine. Commit with `git -c user.name=Claude -c user.email=noreply@anthropic.com`, matching the existing history.

## Supabase data

Supabase is the shared source of truth. Use `tripdb query TABLE` to read rows, `tripdb doc-get NAME` to read documents, `tripdb file NAME` to read built files, and `tripdb status` to inspect worker state. `data/README.md` describes the tables and commands. Never create or commit a local copy of live rows or documents.

## tripdb

`plugin/scripts/tripdb.py` is the supported way to write data: `python -I -X utf8 plugin/scripts/tripdb.py --root . <command>`, and `--help` lists the commands. It checks every row against its table's schema and refuses bad rows with the reason. Run its tests after changing it:

    python -I -X utf8 -m unittest discover -s plugin/scripts -p "test_*.py"

The scheduled build worker runs its own copy of `tripdb.py` and the pipeline scripts. A change to either reaches the worker only through `bash infra/deploy.sh --enable-schedules`. `tripdb status` shows the deployed worker version and latest build state.

Planned trips live in the trips table. `tripdb save-trip FILE` saves a trip as its next version and prints its id. The planner opens it at `/?trip=<id>`.

## Layout

- `web/`: the route map (React, Vite, MapLibre) with the Options pane for whole trips, long-haul tickets and regional flights. `cd web && npm run dev`.
- `planner/`: the two-tab trip app, Map and Trips. The Map tab imports `web/` through the `@map` alias. `cd planner && npm run dev`.
- `plugin/`: the flight crawler plugin, its agents, skills and scripts. It is the only home for code outside the two apps.
- `data/`: `README.md` only. Shared tables and documents live in Supabase.
- `docs/`: design briefs, the Claude task hand-over (`docs/claude-tasks.md`) and `docs/learnings/`, the notes each crawl round left about the sites.

## Frontend design

Any work that changes how `web/` or `planner/` looks or moves goes through these project skills in `.claude/skills/`. The aim is an app that feels crafted, not vibe coded.

### Show it, do not say it

This is the main design rule, on desktop as much as on the phone. Information is shown with interface, not with sentences. The failure to avoid is answering every new fact with one more line of small grey text under a row or a title, until rows read like paragraphs and nothing stands out.

Before adding any text, decide what it should be instead:

- **A fact about a thing** becomes an icon, a chip or a badge on it. Bags are bag icons that read included or a price, the way Momondo and Google Flights show them. A night arrival is a moon, a long layover an hourglass, a self transfer a warning mark. The detail sits behind a tooltip or a tap.
- **An action** becomes an icon button or a control on the thing it changes, not a text button. Tapping the route codes edits the start and end, instead of a "Change start and end" button.
- **A choice** becomes tabs, a segmented control or a toggle.
- **A consequence**, such as the way home moving when a ticket is picked, shows on the thing it changes (the return date in its own chip), not as a sentence under the row.
- **Meta lines** such as "2 ways, prices for both ways" or "checked 2 days ago" are dropped, or shrink to an icon with a tooltip.

If a component would carry more than one line of secondary text, stop. Redesign the whole component with `apple-design`, `emil-design-eng` and 21st.dev, and do not add another line.

New icons go in the apps' own sets (`planner/src/components/icons.tsx`, `web/src/map/icons.tsx`) and keep their style.

### Skills, in order

1. **Lead with `apple-design`** for every frontend task, not only phone work. It sets the hierarchy, restraint, materials, typography and motion, and Wallet, Maps and Flighty are the references for the booking views.
2. **`emil-design-eng`** for component design, polish and the small details that make it feel finished.
3. **Find components with the 21st.dev MCP** (`search`, `get_component`, `get_inspiration`, `get_theme`) before hand building a common component such as a picker, chip, segmented control, sheet or ticket card. Adapt what it returns to the app's tokens in `planner/src/styles`, never paste it in as is.
4. **Shape and critique with `impeccable`**, and run its anti-pattern and polish passes before calling the UI done.
5. **Motion:** `animate` to build an animation, `review-animations` to critique one, `improve-animations` to audit the app, `find-animation-opportunities` for where motion is missing, `remove-animations` when it feels over-animated, `animation-performance` when it drops frames, `animation-vocabulary` to name an effect.
6. **Phone:** `mobile-native` for the fixes that make the web app feel installed. Simon uses it on his phone while travelling.
7. **Before a frontend commit:** `web-design-guidelines` as the checklist for alignment, spacing, accessibility and interaction details, and `break-ui` to try the screen with worst-case data.
8. On request only: `prototype` for several versions behind a picker, `pick-ui-library` to choose a library.

Ideas from Claude Design (the Claude app) are welcome, but its look is not the reference. Build from 21st.dev components and the app's own tokens.

`hyperframes` and its siblings are for making videos, slideshows and motion pieces from HTML. They are not used for the app.

### Skills in .claude/

- `.claude/skills` holds two kinds of skills. Skills from `plugin/skills` are generated copies: edit them in `plugin/` and run `python -I plugin/scripts/sync_claude_dir.py --root .`, never by hand in `.claude/`. Skills installed with `npx skills add` are listed in `skills-lock.json`. The sync leaves them alone, and `npx skills update -p` updates them.
- The 21st.dev MCP lives in Simon's user config (`claude mcp add --scope user`), not in the repo, because it carries his API key. Never commit a key.

## Checks before a commit that touches an app

    cd web && npm run typecheck && npm test
    cd planner && npm run typecheck && npm test

## Writing

Plain sentences. No semicolons as separators and no em or en dashes anywhere, in docs, commit messages or UI text. Prices are in Danish kroner, times are local clock times.
