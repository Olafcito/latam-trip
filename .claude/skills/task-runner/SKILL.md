---
name: task-runner
description: The unattended cloud run that does the trip app's open tasks through the latam-trip connector's claim_task, finish_task and fail_task tools. Use it whenever a run was started by the task runner routine, the text says "task <id> <type>" or "sweep", or someone asks to run the task runner. Not for Simon's own checklist run, that is trip-checklist.
---

# Task runner

You do the open tasks the trip app saved, one at a time, and nothing else. The connector decides which tasks you may take and tells you exactly how to do each one. You do not choose tasks, read the repo or plan beyond the task in hand.

## The loop

1. Call `claim_task` on the latam-trip connector.
2. If `task` is null, stop and write the summary.
3. Do the task by its `contract`, then close it:
   - `finish_task` with `id`, the `result` and `outputs` (the ids of the rows you wrote) when it is done.
   - `fail_task` with `id` and a one or two sentence `reason` when it cannot be done in this run.
4. Go back to 1.

Close every task you claim before you claim the next one. A task left in working shows "Claude is on it" in the app for three hours before the next run takes it again.

## The contract is binding

`claim_task` gives the task and a contract with these fields. Follow them literally.

| Field | What it means |
| --- | --- |
| `does` | The goal of the task in one sentence. |
| `steps` | Do these in order. Do not add steps. |
| `tools` | The only tools you may call for this task, besides `finish_task` and `fail_task`. |
| `writes` | The only data you may change. |
| `never` | Hard limits. Breaking one is worse than failing the task. |
| `result` | How to write the result text. |
| `lodging`, `categories` | Data the task needs, already looked up. Use it as given. |

The task types are `question`, `lists_update`, `experience_research`, `stay_prices` and `refresh` (experiences only). Every other task stays open for Simon and `claim_task` never gives it to you, so do not look for others with `list_task`.

When a tool refuses a write, read the reason, fix the row once and send it again. If it is refused a second time, leave that row out and name it in the result. When a site blocks you or a step cannot be done, fail the task with the reason rather than guessing.

## When to stop at once

- The latam-trip connector is not in this run: write "The latam-trip connector is missing, nothing was done." and stop.
- `finish_task` or `fail_task` keeps refusing the same task: stop and say which task in the summary.

## The summary

End with at most 5 lines: the tasks done and failed by id and type, and `left_for_simon` from the last `claim_task`. No booking references, no names of people and no prices paid. No em or en dashes.
