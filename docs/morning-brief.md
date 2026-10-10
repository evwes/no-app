# wampo brief — 2026-10-10, 07:1xZ

Overwritten nightly. Decision-shaped: what shipped and what it changed in
numbers, what was found wrong, what is held, what is waiting on the owner.

## Three things shipped overnight, all live on main

**A published fund name that contained itself at both ends.** Illinois Tool
Works' **$1,060,028,326** row — 24.8% of its whole menu — stopped publishing
`LENDING (TIER J) NT COLLECTIVE S&P500 INDEX FUND-DC-NON LENDING (TIER J)`.
93 stored rows repaired across 78 filings, of which **62 rows / 53 plans /
84,286 participants** are what a reader actually sees. Six `American Funds
<vintage> Target Date Fund R6` rows drop a trailing `American Funds` by
stripping the TAIL, because stripping the lead would have removed the house.
And `Admiral Shares Vanguard Windsor II Admiral Shares` keeps its numeral —
that is the hazard that cost a wrong fund name once before.

Ticker gained/lost/swapped **0 / 0 / 0**; fee **2 gained**, 0 lost; asterisk,
shown type and row membership all 0. Two crawlable pages moved and both were
read.

**An apostrophe in a share class was costing 318 rows their ticker.**
`norm("Inst'l Shares")` comes out as `"institutional l shares"` — the expansion
was already there and it left a **one-letter token** behind, which the matcher
treats as an unexplained leftover and declines the whole row on. Same fund:
class spelled out resolves VINIX, filed as `Inst'l` resolves nothing. So this
was never a registry gap. **318 rows / 292 plans / ~897,000 participants** gain
an asserted symbol — `PIMCO Income Inst'l` → PIMIX, `Fidelity Gov't Cash
Reserves` → FDRXX, `Victory Trivalent Int'l Small-Cap R6` → MSSIX.

Table diffed key by key: **added 176, removed 0, changed 0**, and 0 added keys
lack an apostrophe form, so the change reached exactly its own mechanism.
26 keys drawn uniformly and read: **26 of 26 correct.**

**A guard was claiming a matched code/store pair it cannot see.** `mirror.sh`
compares `PARSER_VERSION` to the store's `pv` — but `merge-4i.mjs` carries six
name-repair arms that rewrite the store at merge time and move no version, so
for a change to that file the equality holds *by construction*. Measured: main
took the new code beside a store still carrying the un-repaired name, under a
message saying the data was not stale. Benign this time; a merge-side arm that
*withdrew* a false claim would have mirrored with the claim still live.

## Mirrored to the live site

Five times, every one a fast-forward with `mirror-gate` clean (+0/−0 by ack,
0 plans / 0 participants by plan). Final state `ec9ccbc1`, verified by reading
the mirrored tree with a positive control — the stamp `63da561e` matches the
file's own content hash, so returning browsers fetch the new table rather than a
cached copy. The live site is unreachable from the sandbox, so that is the
verification, never a `curl`.

## What was found wrong — four of them mine, and that is the useful half

**My first before/after measured the harness, not the arm.** A snapshot plus one
merge run reported 2,645 changed names and 18,907 changed non-name fields for a
change that touches 93 rows and only names. A standalone merge is not a no-op
against a CI-written tree. The fix is a **differential run** — merge twice from
one committed baseline, once with the arm's call site neutered — so whatever
standalone does differently cancels exactly. It then read 93 / 0 / 0 / 0 with
1,730,838 rows byte-identical, and supplied the disjointness control for free.

**A condition I wrote was unreachable by construction.** The loop bound already
forced what it tested, so it was dead code reading as a guard. The test could
not build a case where it was the only protection — not because the probe was
poor but because production cannot reach one. Deleted; the invariant is asserted
instead.

**"The apostrophe hypothesis is refuted" was true of one resolver and false of
the other.** There are two, and a hypothesis refuted through one is untested
through the other. The first measurement expanded the apostrophe and asked the
page's pattern table, which gains 0 because it tolerates the apostrophe already.

**And a must-see pin matched the wrong row while printing `must-see ok`.** It
was keyed on a NAME many plans file, so it caught a different plan's copy — one
that publishes the correct symbol and is the *opposite* of the defect. A pin
keyed on a shared string does not identify a row; key it by ack.

## Held, and why

**The fee half of every ticker item.** Where a row's symbol is now withheld or
corrected, the expense ratio is still priced off the NAME, so a row that names
no fund can still publish a fee. A fee is sourced, never derived, and
`data/fund-facts.json` carries no figure for these funds — so the honest move is
to withdraw rather than to guess, and that is the owner's call.

**Two classes sized and deliberately not shipped.** A house CONTRACTION blocking
the same resolver the apostrophe repair just unblocked (Peet's Coffee publishes
`Vanguard Ext Mk Index Inst Fd` with no ticker and a 0.1 fee where the fund
really costs ~0.05) — a contraction vocabulary is the shape this record has twice
measured as harmful when guessed, so it needs the registry as witness. And a
custodian-words blocker on house supply, unsized.

## Waiting on the owner

Unchanged from yesterday and all large: the share-class symbol-and-fee class
(11.1M participants), our own store contradicting our own page (8.2M), the fee
pre-emption (13.3M), the CREF and TIAA Access vehicle families, the stable-value
fabricated ERs (7.4M), the American Funds no-share-class fee (10.5M), the
whole-table generic test, and the SEC **comparable** half — 188,846 rows /
49,065,090 participants, which would put a new asterisk on pages read by about
49M people and is a decision rather than a cleanup.

## Continuing today

Hourly cycles are running and the Routine is armed. Pipeline: #621 through #624
all `success` at baseline (HIGH 4, warn 556, pv 203 at 99.9%, `dl` 93, `ex` 0),
#625 dispatched and in flight. `site-test` 185 green on the ship's own SHA.

Next from the queue: the wrapping class's named residue (4 rows keeping a
dangling separator — read the existing end-anchored arm before adding a trim),
and the 194 rows / 488,810 participants the apostrophe repair newly makes the
matcher answer as a *comparable*, which belongs with the gated comparable half.
