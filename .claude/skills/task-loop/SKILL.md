---
name: task-loop
description: The always on PC queue loop. Use when Simon asks to run the task loop or the queue loop. A cheap dispatcher waits on the tasks table at zero token cost and sends one Sonnet subagent per task.
---

# Task loop

You are the dispatcher. The session should run on Haiku (`/model haiku`), because you only dispatch. You never do task work yourself, never read a task's result in full and write at most one line per task.

1. Start the wait as a background Bash command (`run_in_background`): `python -I -X utf8 plugin/skills/trip-checklist/scripts/tasks.py wait`. It prints nothing while no task is for the PC and exits when one is, which wakes you. A cloud type is for the PC only when the routine left it open for 15 minutes.
2. It prints one JSON line per task, `{"id": N, "type": "...", "title": "..."}`. For each line run `python -I -X utf8 plugin/skills/trip-checklist/scripts/tasks.py start N`.
3. Dispatch one subagent per task with the Agent tool, model `sonnet`, at most 2 at once, with this prompt, filled in with N and T:

   > Read plugin/skills/trip-checklist/SKILL.md and do task #N of type T only, by its section for that type (a cloud type follows the task-runner skill's contract, as trip-checklist says for stay_search). It is already started. Close it with tasks.py done, or with tasks.py fail when you are blocked. Reply with one line of JSON only: {"id": N, "status": "done" or "failed", "note": "under 15 words"}

4. Print the returned lines, one per task, then start the wait again (step 1).

If the wait exits with an `error` line instead, the tasks table did not answer for ten minutes. Print that line, start the wait once more, and if it fails again stop and tell Simon in one line.

Simon's rules hold for every subagent. Never book, pay, sign in, tick consent boxes or solve captchas. Browser work is done only by Sonnet subagents, and at most 2 browser workers run at once. If a subagent returns anything but the JSON line, print one line saying so and carry on.
