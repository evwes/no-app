---
name: wampo-cycle
description: Run one wampo continuous-improvement cycle (the hourly loop that must never stop) — reconcile git, verify the durable scheduler, dispatch or verdict the pipeline run, mirror main, take the next queue item with the wam agent, do the hands-on random draw, and re-arm the next wake. Use on every hourly Routine wake, on `/wampo-cycle`, or from a fresh session that has to take the loop over. `/wampo-cycle install` recreates the hourly Routine bound to the current session when list_triggers shows it gone or failing.
---

# wampo cycle — the loop that must never stop

Owner directive (2026-09-01, restated 2026-09-17): **work, report, continue —
hourly, around the clock, forever.** A cycle that finds nothing to do has
looked in the wrong place; there is always a queue item, a verdict, or a
random draw to read. Never idle, never poll a running job, never delay
finished work for a clock.

Everything below is the procedure. The **queue** and the project's open
findings live in `CLAUDE.md` ("Current state", "Known residuals", "FIELD
COVERAGE"), `docs/hourly-cycle-prompt.md` (the queue block under its
`---` divider) and `docs/accuracy-log.md` (newest entries = open defects).
Read those; do not copy numbers from memory — a number carried forward is a
number asserted again.

## 0. Arguments

- `/wampo-cycle` — run one cycle (default).
- `/wampo-cycle install` — the scheduler is gone: recreate it (section 7).
- `/wampo-cycle verdict <run-id>` — only the verdict + mirror path for a
  finished run (section 4).

## 1. Bootstrap (every wake)

1. `git fetch origin main claude/wampo-401k-live-nx1t4o`. Show
   `git log --oneline origin/main --not origin/claude/...` and the reverse.
   The pipeline commits data hourly to whichever branch ran; a fast-forward
   pull of the dev branch is normal. **If the working tree has uncommitted
   changes you did not make, a `wam` agent is mid-flight — do not pull, do
   not commit them, do not touch `scripts/`.**
2. First wake after a reprovision: append `<UTC> alive` to
   `docs/routine-heartbeat.log`, commit `[skip ci]`, push. A denied push is
   the finding; report the exact error and stop.
3. Once per session: `mcp__Claude_Code_Remote__list_triggers` must show
   `wampo hourly cycle (self-bind)` (`trig_017vdX5dSSYh5v68Cwe6EUBu`)
   enabled with a recent SUCCEEDED `last_run`. If it is gone, disabled, or
   failing, go to section 7 before anything else.
4. If a previous cycle in this session left work mid-flight (an agent
   running, a run dispatched, a check-in armed), continue it — do not start
   anew.

## 2. Run in flight?

`mcp__github__actions_list` (`list_workflow_runs`, `build-data.yml`, perPage
2). A run `in_progress`/`queued` on **either** branch means:
- pipeline files (`scripts/build-data.mjs`, `fetch-4i.mjs`, `lib-4i.mjs`,
  `merge-4i.mjs`, `scripts/.kick`, the workflow) are committed **only with
  `[skip ci]`** — a push without it cancels the run and its hours;
- a run in flight **on main** also blocks the mirror (a force push under a
  run that is about to commit to main is the unsafe case);
- keep working (sections 5–6); arm a `send_later` check-in for ~10 minutes
  after the run's expected end (full re-parse ≈ 55–90 min, OCR-heavy 3h+,
  no-op hour ≈ 7 min) with the verdict instructions of section 4, so the
  verdict does not wait for the next hourly wake.

## 3. No run in flight? Dispatch — every hour

`mcp__github__actions_run_trigger` `run_workflow`, `build-data.yml`,
`ref: claude/wampo-401k-live-nx1t4o`. **Then verify it exists in the run
listing within a minute** — the push trigger is intermittent, the dispatch
is not, and a run that never started once went unnoticed for two days.
Dispatch on the dev branch only; a scheduled run on main is GitHub's
backstop for hours with no session (its cron fires 4–8h late, measured).
Do not push code and let the push be the dispatch; commit `[skip ci]` and
dispatch explicitly.

**Hold the dispatch when the branch head carries a `PARSER_VERSION` above
the store's dominant `pv` and you intend to mirror first** — mirroring code
ahead of its store makes main's own cron run a duplicate full re-parse on
main. Order is: dispatch on dev, verdict, then mirror the matched pair.

## 4. Run just finished? Verdict, then mirror

Pull the branch, then measure (never take a report's numbers on trust; the
agent's FTBFX count was understated once and the fix was re-measuring):
1. pv distribution — one dominant pv ≥ 97% (`partial-store` HIGH otherwise;
   a cancelled run STILL commits via `if: always()`).
2. `tail -1 docs/coverage-history.jsonl` — `confident`, `high` (baseline 4),
   `overshoot` (must not rise), `dl` (must not jump; 91 permanently-403).
3. `node scripts/audit-generic-names.mjs` (threshold 230),
   `node scripts/audit-dominant-row.mjs` (must be 0).
4. Confidence losses reconciled ack by ack against the pre-run status
   (`git show <prev>:lineups-status.json`): every loss is a justified
   fabrication or the change is rolled back. `reparse-loss` HIGHs on a
   justified refusal set clear on the next run.
5. Whatever the change predicted, check it — the prediction was written
   next to the change in `docs/accuracy-log.md`.
6. Mirror **only** with `bash scripts/mirror.sh`. It refuses when main has
   commits the branch lacks (compare the stores with the main-vs-branch
   script pattern: 0 acks / 0 plans on main the branch lacks, main newer
   on 0 → `--force` is justified for the GIT check) and when the data gate
   sees losses (`--force-data` only with the reconciliation on the record,
   said so in the commit). Then confirm `pages-build-deployment` builds
   the new main; cancelled Pages runs superseded by a newer commit are
   normal, a red one is not.
7. Record: `docs/accuracy-log.md` verdict entry; `CLAUDE.md` "LIVE on main"
   bullet re-derived from the store (never edit the date on a copied line).

## 5. The queue item — finish it, with `wam`

Take the next item by **people affected**, defects before coverage, from the
live sources (CLAUDE.md residuals `reachable` column, FIELD COVERAGE,
accuracy-log newest entries, `docs/hourly-cycle-prompt.md` queue block).
**Spawn `wam`** (owner directive 2026-09-15) with: the item, its size in
participants, where the evidence is, the acks to trace, the gate/diff/
specimen/log requirements, and the standing rules — commit `[skip ci]`,
never dispatch or mirror, never touch `.kick`/the workflow, scripts to files
not heredocs. Run it in the background and **do not touch the tree while it
runs** (its commit would sweep your edits). It must return each item as
FIXED (commit, gate, diff, before/predicted sizes, what the run must show)
or DOCUMENTED AS UNREACHABLE (cause from evidence, page says the true
thing). Anything needing a `PARSER_VERSION` bump that is NEW COVERAGE (not a
repair) is the owner's call: record the proposal with its size and move on.

When it reports, **verify before dispatch**: parser gate green,
`node scripts/diff-lineups.mjs <pre-agent-commit>` (0 fabricated introduced,
every loss justified), and a `trace-filing` of the headline specimen.

## 6. The hands-on draw — every cycle

Draw **randomly, weighted by participants, from PUBLISHED lineups** (the
frame that found Walmart, UPMC, Medtronic, TJX) and read the rows against
the filing (`node scripts/trace-filing.mjs <ack>`). Every finding goes into
the queue block with a size or an explicit "unsized", and into
`docs/accuracy-log.md`. Size a class before fixing it (scripts to a file;
print members; a round number or a zero is reporting on the query). A
one-plan fix is recorded as one plan.

## 7. Resurrection — when the scheduler is gone

The loop has three layers; check them in this order and repair the first
broken one:
1. **The Routine** (durable; survives container restarts). From the session
   that owns the repo (push credential): `mcp__Claude_Code_Remote__get_session`
   for your own session id, then `create_trigger` with `name: "wampo hourly
   cycle (self-bind)"`, `cron_expression: "7 * * * *"`, `initiation:
   human_request`, no `create_new_session_on_fire` (self-bind — fresh-session
   Routines get no repo and no push credential; ~40 firings landed nothing),
   and the wake prompt below. Delete the dead trigger, update the id in
   `docs/hourly-cycle-prompt.md` and this file.
2. **In-memory `CronCreate`** (`7 * * * *`, same prompt) — only while the
   Routine cannot be created; it dies with the container.
3. **GitHub's own cron** on `build-data.yml` (hourly `:23`, daily, weekly)
   keeps parsing and auditing with no session at all; never remove it.

Wake prompt (verbatim):

> wampo hourly cycle wake. Invoke the `wampo-cycle` skill and follow it:
> reconcile git first (fetch origin main + claude/wampo-401k-live-nx1t4o,
> adopt any data-bot commits), then dispatch or verdict the pipeline run,
> mirror main, take the next queue item with the wam agent, do the random
> draw, and re-arm the next check-in. If work from a previous cycle in this
> session is mid-flight, continue it instead of starting anew. Never idle.

## 8. Before 7:00 AM ET

`docs/morning-brief.md` is overwritten nightly and mirrored: what shipped and
what it changed in numbers, what was found and whether it is fixed or
queued, what was mirrored, what was HELD and why, what waits on the owner
(ranked by participants, with a recommendation), what continues alone.

## Rules that are not optional

- Accuracy is the first principle: every defect gets a permanent
  `docs/accuracy-log.md` entry — wrong → change → prevention. Never delete.
- Nothing fabricated, nothing guessed; a blank is honest, a name reads as
  knowledge.
- Read stores through `scripts/lib-schema.mjs`; lineup shard hash is
  fetch-4i's `h*31+c >>> 0` `% 64`.
- Commits end with the session's attribution lines; no model identifiers in
  anything pushed.
- Repo stays PUBLIC (Actions minutes are free only because of that).
