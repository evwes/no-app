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

## What survives a container recycle

This container is ephemeral and `/tmp` does not survive it. Anything a cycle
depends on must be in the repo:

- `sec-funds.json` — SEC series/class index, committed for this reason
- `docs/filing-worklist*.json` — the queues
- `docs/filing-tests*.jsonl` — results, which also carry the skip-list

If a script fails on a missing file, check whether it is reaching into a
scratchpad path before assuming the data is gone.

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
- **Sampling frame decides the answer.** An assets-ranked queue gave 46% where a
  random sample gave 85%, because large plans fail a different way. State the
  frame with the number.
