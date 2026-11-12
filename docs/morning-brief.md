# wampo morning brief — 2026-11-12

Overwritten each cycle. Decision-shaped: what shipped and what it moved, what
was found wrong, what reached readers, what is waiting on the owner.

## Found wrong, and fixed

**I published a false claim about my own work yesterday, and the next run
refuted it.** The commit and log entry for regen #12 said it "provably moves 0
ticker keys". It moved **459 keys in and 434 out** (18,093 → 18,118), raising
coverage 68,405 → 68,987 published rows / 21.54M → 21.65M readers. #9, #10 and
#11 really were stamps-only and I carried that pattern onto a run I had not
looked at — beside a shell line that printed "(0 keys moved)" as a hardcoded
string regardless of the diff. Corrected in `CLAUDE.md` and
`docs/accuracy-log.md`.

Two things followed, and the second is worth more than the correction:

- **The fingerprint narrowing I had proposed would have SUPPRESSED that regen**,
  leaving the table at 18,093 keys against a store needing 18,118. A proposed
  change to a correctness gate, refuted by measurement before being built.
- **Nothing was watching the ticker table against the DATA.** It is keyed on
  live fund names, and the stamp gate is code-only *by design* (a data-keyed
  fingerprint would redden on every hourly data commit with nothing wrong).
  v205 changed fund names; the table needed 459 new keys; the only reason it got
  them is an unrelated comment reddening a CODE fingerprint three days later.
  **The regens I had written up as wasteful were the only thing keeping the
  table fresh.**

## Shipped

**`sec-tickers.yml` could push the dev branch to main, bypassing `mirror.sh`.**
The job checked out `inputs.branch || github.ref_name` and pushed
`GITHUB_REF_NAME`. The input carries a default, so dispatched from `main` — a
normal place to dispatch from — it checked out the DEV branch, rebased onto main
and pushed `HEAD:main`. A rebase makes that a fast-forward, so it **succeeds**,
moving every data file on the branch to main with none of `mirror.sh` consulted:
not the plan-keyed data gate, not the in-flight-run refusal, not the record of
what a force push would destroy. **Reachable, proved by the repo's own log** —
run #1 was dispatched on main and its checkout logs `Switched to a new branch
'claude/wampo-401k-live-nx1t4o'`. It did no harm only because its key diff was
0/0/0 (so it exited before the push) and `contents: write` was then missing.
Both have since expired. Fixed with one `TARGET_REF` for checkout, fetch, rebase
and push, plus an explicit refusal to target main — guard sliced from the YAML
and exercised in both directions.

**Three watchers that did not exist:**

| watcher | what it closes |
|---|---|
| weekly `sec-tickers.yml` schedule (Sun 07:11 ET) | the table drifting with the data, which no gate can see |
| `site-test` dispatch after the regen pushes | the regen's own tip ending with no CI verdict |
| `.github/workflows/*.yml` in site-test's `paths` | `gate-coverage` reads every workflow and no workflow edit started it |

The first replaces "remember to dispatch after a bump" — *a manual step in a
verification path is the step that gets skipped.*

**And a self-inflicted one worth keeping.** The commit adding that workflow glob
produced **no run at all**, because its message *explains* the CI-skip mechanism
and so spells the bracketed token twice; GitHub scans the whole message. The
commit whose purpose was to stop this workflow leaving an unverified tip left
one. Settled by a disentangling test rather than argument — the first pair of
observations differed in two ways at once, so one more commit varied exactly one
of them and run #259 fired. Convention now in `CLAUDE.md`: spell it `skip-ci` in
prose. **It fails silently in the direction that looks like success.**

## Reaching readers

The mirror ships the regenerated table: **68,405 → 68,987 published rows** carry
an identified symbol, 21.54M → 21.65M readers. `mirror-gate` replayed clean —
pv 205 over 99.9% of 71,995 acks, **0 lineups lost, 0 plans stop being served**.

## Where the work is — derived, not copied

`node scripts/ledger-report.mjs`: **115,641 plans / 119,907,098 participants**.
Largest addressable gaps: contributions, then match (18.73M with an attachment
read and no match statement), vesting (12.44M likewise), custodian. The single
biggest cross-cutting item remains **2K: 31.78M readers across 58,681 plans**
where 401(m) cannot distinguish a match from after-tax.

## Waiting on the owner

Unchanged and not started unasked: the comparable half of the SEC matcher
(49.1M), the wrong-share-class fee families, the CREF accounts, the frozen
crawlable pages, and the held 33-row fee ship. The four standing decisions of
2026-11-05 still gate each ship on the differential, the seeded draw and a log
entry.
