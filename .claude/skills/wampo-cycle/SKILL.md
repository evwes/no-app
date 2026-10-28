---
name: wampo-cycle
description: Open one wampo work cycle — reconcile git (including the case where the container comes up with the dev branch pointing at main's tip), report scheduler health, then hand the cycle to the wampo-daily agent, which owns the loop. Use on a scheduled wake, on `/wampo-cycle`, or from a fresh session taking the loop over.
---

# wampo cycle — the preamble, then hand off

**This skill is deliberately thin.** It used to carry the whole 183-line
procedure, and that procedure was ALSO written into the agents — so two
descriptions of one loop drifted until this file was telling sessions to spawn
`wam`, an agent that no longer exists, and calling the cadence hourly four days
after the owner cut it to daily. *A duplicated procedure does not stay
duplicated; it stays in two states and the reader cannot tell which is live.*

So what lives here is only what an agent cannot reliably do for itself: get the
checkout into a known state, and say whether the scheduler is actually running.
**The loop itself is `.claude/agents/wampo-daily.md`.** Read that, not this, for
what the cycle does.

## 1. Reconcile git — every wake, before anything else

```
git fetch origin main claude/wampo-401k-live-nx1t4o
git log --oneline origin/main --not origin/claude/wampo-401k-live-nx1t4o
git log --oneline origin/claude/wampo-401k-live-nx1t4o --not origin/main
```

**A fresh container can come up with the local dev branch pointing at MAIN's
tip, with none of the branch's work in the checkout.** Measured 2026-10-25: the
local ref was a data commit, `scripts/unresolved-funds.mjs` and the nine agent
files were absent, and `PARSER_VERSION` read main's value. Nothing was lost —
origin's dev branch was intact — but a session that trusts the checkout is
measuring main while believing it is measuring the branch.

Check it and recover before any measurement:

```
git rev-parse HEAD; git rev-parse origin/claude/wampo-401k-live-nx1t4o
# if they differ and the tree is clean:
git reset --hard origin/claude/wampo-401k-live-nx1t4o
```

**Do NOT use `git pull --ff-only` here.** The refs genuinely diverge — the
branch carries commits main does not, and the merge job can fast-forward the dev
ref under you — so `--ff-only` fails exactly when you most need the reconcile to
work. Fetch and reset against the explicit remote ref.

If the working tree has uncommitted changes you did not make, an agent is
mid-flight: do not pull, do not commit them, do not touch `scripts/`.

## 2. Report scheduler health — do not silently change it

`mcp__Claude_Code_Remote__list_triggers` is the **only** authority on the
cadence. The session-start banner is hardcoded and has been wrong twice: it said
"hourly at :07" for three wakes after the cadence changed, and it still asserts
the daily routine "wakes THIS web session" while that routine reads
`enabled: false`.

Two wampo tasks exist today:

- **`wampo daily cycle (self-bind)`** (`trig_017vdX5dSSYh5v68Cwe6EUBu`),
  `CRON_TZ=America/New_York 59 7 * * *`, bound to the session that owns the
  repo. **It is DISABLED as of 2026-10-25 and has not fired since 2026-10-19.**
- **`Wampo unresolved funds (Sunday)`** (`trig_01522BhCucS2ghmrYcJxPkJm`),
  `CRON_TZ=America/New_York 44 7 * * 0`, which delivers the owner's weekly
  unresolved-fund worklist.

**Report the state; do not arm, disable or rewrite a task unasked.** Enabling
the loop changes what runs against the live branch every morning, which is the
owner's call and not a housekeeping step. Its stored prompt also needs checking
before it is armed — it still carries "v204 IS HELD AND MUST NOT BE MIRRORED", a
verdict that was retracted and a mirror that was then performed.

**Fresh-session tasks are dead** and must never be created: their sessions get
no repo source and no push credential, and ~40 firings landed nothing
(`docs/hourly-cycle-prompt.md`, diagnosed 2026-09-08). Two such tasks are still
enabled and still no-ops — `Wampo daily sweep` and `Wampo weekly status` both
target `/Users/ea/...` on the owner's Mac, which no cloud session can reach, and
both report SUCCESS in seconds. A task that must survive has to be self-bound to
a session that holds the repo.

## 3. Hand the cycle to `wampo-daily`

Spawn the **`wampo-daily`** agent. It reads the field ledger
(`node scripts/ledger-report.mjs`), takes the Tier A field with the most readers
missing an answer, dispatches that field's owner, verifies the number moved, and
mirrors. **It owns the one pipeline dispatch per batch** — no field agent
dispatches, because a parser change costs 3.5 hours of wall clock and the
batching is what makes six field agents affordable.

The field owners are `tier-a-contributions`, `tier-a-plan-terms`,
`tier-a-custodian`, `tier-a-fees`, `tier-a-lineup` and `plan-report`;
`wampo-integrity` is the weekly adversarial pass. `wam`, `wampo-cycle`,
`filing-forensics` and `funds-and-tickers` are RETIRED — if a prompt or document
tells you to spawn one, that document is stale.

## Rules that outlive any cadence

- **A cycle with nothing worth shipping says so in one line and stops.** The old
  "never idle, there is always something" directive is **withdrawn** (owner,
  2026-10-19): idling is cheaper than a small ship that costs a full pipeline
  run. Three consecutive quiet cycles is a signal about the queue, not a failure.
- **Never mirror by hand.** `bash scripts/mirror.sh` only. It refuses when main
  carries a commit the branch lacks and when local disagrees with origin, and
  both refusals have negative-control tests.
- **Never push `build-data.mjs`, `fetch-4i.mjs`, `lib-4i.mjs`, `merge-4i.mjs`,
  `scripts/.kick` or `build-data.yml` while a run is in flight on the same
  ref** — concurrency cancels it and hours evaporate. `[skip ci]` is scoped to
  those six files; putting it on anything else just suppresses the gate that
  would have checked the change.
- **A version constant is the statement that counts.** A parser change held in
  prose while `PARSER_VERSION` is bumped and wired is not held: the push trigger
  covers that file, and the next push without `[skip ci]` answers the gap with a
  full re-parse. Park a held change by reverting the bump and its call sites.
- **Read the numbers out of the store, never out of a document.** `CLAUDE.md`'s
  "Current state" is a snapshot that has gone stale five times; the trail
  (`docs/coverage-history.jsonl`, `docs/ledger-history.jsonl`),
  `lineups-status.json` and `lib-4i`'s `PARSER_VERSION` are the authority.
- **Verify `conclusion` on CI, not that a run exists.** site-test was red for
  ten consecutive runs while commit messages said the tests were green — true
  locally, nobody opened CI.
