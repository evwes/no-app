# Overnight / unattended protocol

Standing rules for cycles that run while the owner is asleep. **Read this at the
start of every cadence firing** — scheduled trigger messages are snapshots and
go stale, this file does not.

## Usage limits

**Owner directive, 2026-08-24: if the session is paused by a usage limit,
restart 5 minutes after the reset — not at the next scheduled slot.**

In practice, on the first firing after a gap:

1. Schedule the next cycle **5 minutes out**, not 15, until the backlog is
   worked off.
2. Say in the report **how long the gap was and how many cycles were missed**.
   A silent gap looks identical to a night of work that found nothing, and the
   owner cannot tell those apart from the commit log alone.
3. Do not try to "catch up" by testing 10 × the missed cycles in one batch. The
   filings still have to be read; a larger batch just produces a longer
   unverified queue.

## Keeping the chain alive

The cadence is a chain of one-shot `send_later` calls, because the cron minimum
is hourly and 15 minutes is what the owner asked for. A chain has one failure
mode: a cycle that dies before re-arming ends the night.

- **Re-arm FIRST**, before running anything. The re-arm costs one tool call and
  makes every subsequent failure survivable.
- Long-horizon backstops are armed several hours out. If the chain is alive they
  add an extra cycle, which is harmless — `filing-batch.mjs` skips
  already-tested acks, so a duplicate firing simply advances the queue.
- `create_trigger` and `update_trigger` require approval the owner cannot give
  while asleep. Do not plan around them overnight.
- **Check `docs/cadence-state.json` before arming anything.** If the fire time
  recorded there is still in the future, a chain is already armed: run the cycle
  and arm nothing. A one-shot chain re-arms itself, so a cycle that arms "just
  in case" permanently doubles it — and `list_triggers`, `update_trigger` and
  `delete_trigger` all need an approval nobody is awake to give, so a duplicate
  chain cannot be pruned afterwards. Update and commit the file whenever you do
  arm.

## When the dedicated agent keeps dying

Two consecutive failures with `API Error: 529 Overloaded` on 2026-08-24 (05:04
and 05:20), the second producing no output at all. A 529 is server-side and
transient, but respawning into an overloaded API costs a full agent spin-up to
learn that it is still overloaded, and each spin-up re-reads the protocol and
the log before doing any work.

**Rule: after two consecutive 529 failures, stop respawning.** Carry the
investigation in the cadence cycles instead — those are ordinary turns and have
kept working throughout — and try the agent again after roughly an hour. Note
in the report that the agent is down and why, so a gap in its report numbering
is not read as a gap in the work.

The related fix already applied to its brief: commit BEFORE starting a long
write. The first 529 landed mid-write to the gap inventory; nothing was lost
only because it had committed the preceding report first.

## What survives a container recycle

This container is ephemeral and `/tmp` does not survive it. Anything a cycle
depends on must be in the repo:

- `sec-funds.json` — SEC series/class index, committed for this reason
- `docs/filing-worklist*.json` — the queues
- `docs/filing-tests*.jsonl` — results, which also carry the skip-list

If a script fails on a missing file, check whether it is reaching into a
scratchpad path before assuming the data is gone.

## Owner directive, 2026-08-25: FIX IT YOURSELF, ALWAYS

> "EVERY PROBLEM AT EVERY POINT SHOULD BE FIXED BY YOURSELF AT ALL TIMES.
> YOU ARE A CONTINUOUSLY LEARNING/IMPROVING PROGRAM."

This supersedes the earlier caution about queuing parser work for approval.
A defect found in a cycle is a defect to FIX in that cycle — including
`lib-4i.mjs` and a PARSER_VERSION bump. Do not park specimens and wait.

What does NOT change, because it is what makes a fix a fix rather than a
gamble:

1. **The parser gate must pass** (`node scripts/parser-gate.mjs`) before any
   parser change is pushed. If an expectation moves, the move is reviewed and
   updated in the same commit, with the reason written down.
2. **Verify before/after on the specimen that motivated the change**, and on
   at least one specimen the change could plausibly break.
3. **One re-parse in flight at a time.** Pushing `scripts/**` while a run is
   in flight cancels it — check first, and if a run is live, land the change
   after it (the fix is not lost, it is sequenced).
4. **The re-parse verdict still has to be read** before mirroring: compare
   `lineups-status.json` before/after (the like-for-like count), sample the
   losses, and only mirror when the losses are junk or explained.

Autonomy is in deciding and doing. The evidence discipline is what makes the
autonomy worth having.

## What must not happen unattended

- **No `lib-4i.mjs` or `PARSER_VERSION` changes.** A parser change mid-measurement
  destroys the measurement, and a re-parse cannot be reviewed by anyone at 4am.
- **No mirroring to `main`.** Mirroring moves whatever data commits sit on the
  branch; it has already put a regression live once.
- **No pushes to `scripts/**` while a pipeline run is in flight** — concurrency
  cancels the run.
- Frontend changes must pass `scripts/smoke-test.mjs` before commit.
  `CHROMIUM_PATH=$(ls -d /opt/pw-browsers/chromium*/chrome-linux/chrome | head -1)`.

## What the work is

Not confirmed counts of defects already understood. **Information the filings
carry that wampo does not report, or reports wrongly, and why** —
`docs/wampo-gap-inventory.md` is the standing record, in three categories of
increasing severity:

1. **omissions** — the filing carries it, wampo does not show it
2. **fabrications** — wampo shows a value that is not in the filing at all
3. **contradictions** — wampo asserts what the filing denies, on filings that
   parsed successfully

Per-cycle narrative goes in `docs/fund-test-log.md`.

## Traps that have each produced a false finding once

- Every filing embeds the **blank Form 5500 pages**, so the form's *question*
  text is never evidence the answer is yes.
- The **manager vocabulary** keeps admitting words that name every fund rather
  than one house — `"t"`, `"bond fund"`, `"institutional"`. If a check passes
  something it was written to reject, suspect the vocabulary before the filing.
- The **classifier is a queue, not a measurement.** Confirm every
  non-`NAMES_MATCH` verdict by reading the filing.
- **A stored name that carries parser residue can never be found in the filing.**
  Prior-year (`fb`) and OCR entries were the known cases; #14 added a third —
  the cost column's `N/R` glued to every name made ACI Worldwide score
  `WRONG_REGION 0/12` on a schedule the parser read correctly. Before believing
  a WRONG_REGION verdict, strip the suffix and search again.
- **Sampling frame decides the answer.** An assets-ranked queue gave 46% where a
  random sample gave 85%, because large plans fail a different way. State the
  frame with the number.
