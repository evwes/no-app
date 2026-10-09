# wampo brief — 2026-10-09, 13:0xZ

Overwritten nightly. Decision-shaped: what shipped and what it changed in
numbers, what was found wrong, what is held, what is waiting on the owner.

## v203 is live on main, and its registration held exactly

**123 plans stop telling 59,316 participants their employer money is vested
today** on the strength of a sentence that says they vest at 65, or on death, or
on disability. Arcosa (5,875 ppl) now publishes the **2-year cliff** that was in
its notes all along; about 37 plans gain their real schedule out of the same
filing, the rest keep the quote and lose only the false label.

Measured on the complete store, against what was pre-registered before dispatch:

| registered | delivered |
|---|---|
| `vesting` falls 82–94 | 53,115 → **53,023 = falls 92** |
| `vestQuote` rises by the same, → 5,363–5,375 | 5,281 → **5,373 = rises 92** |
| QUOTE LOST 0 | fall and rise are the **same number** |
| confident / match / entries / warn unchanged | 60,182 / 43,312 / 65,495 / 556 |
| `pv` 202 → 203 at ~99.9% | **99.86%**, `partial-store` cleared, HIGH back to **4** |

Mirrored `bb4bed5a` → **`97f7ae97`**, a MATCHED pair: the data-producing code
moved with the store that code produced. Pages build on main's HEAD was
in flight at the time of writing — the deploy is not claimed until its
conclusion reads success, and the live site is unreachable from the sandbox, so
the verification is the mirrored tree plus a positive control, never a `curl`.

## It took three runs, and the two failures were ours, not v203's

**#604 read NONE of the universe and reported 99.7% coverage.** Both apt steps
ran `apt-get install … >/dev/null 2>&1 || true` with no `apt-get update`;
`apt-get install` is atomic, so prep (one package) succeeded while parse (two)
installed neither, and `pdftotext` was absent on all twenty shards. The publish
gate caught it and committed nothing. Three instruments were blind: the install
discarded both streams and its exit code; `fetch-4i`'s `pdftotext` branch was
the only error path that destroyed an entry and incremented no counter; and
`audit-data` knew two `e` codes where the store carried three. All fixed, with
an `extraction-failures` HIGH at 0.1% — a tenth of the download threshold,
because a 403 *preserves* the stored entry and an extraction failure
*destroys* it.

**#605 then hung one shard for 3h14m against nineteen siblings at 38–55
minutes.** Cause: ten `execFileSync`/`execFile` sites spawn `pdftotext`,
`pdftoppm`, `pdfimages` and `tesseract` and **not one passed `timeout`**.
`TIME_BUDGET_MIN` could not help — *a budget enforced at the top of a loop is
not a bound on the body of the loop.* Cancelled deliberately (the 355-minute
backstop would have produced the same 19/20 merge 2h45m later, and the work list
self-heals), and #607 finished the residue. Ceilings now on all ten sites with
`SIGKILL`, controlled both ways: a wedged process dies at 1507ms, a real filing
extracts 361,202 chars in 1076ms against a 180s ceiling (167× headroom).

**And the hang produced no evidence at all**, which is #604's defect one run
later: the 40-line failure tail was gated on `ec -ne 0`, so a *cancelled* step —
the one case where the log is the only evidence — reached it never. Now a `trap`
dumps it on success, failure, timeout and cancellation alike.

## Also shipped today

- **The SEC asserted tickers: 4,346 published rows / 1,938 plans / 2,316,219
  participants** gain a symbol, swaps 0, losses 0, 0 comparables. Its largest
  judgment was a **refusal**: 51,491 rows / 19.6M participants typed collective
  trust or separate account were withheld, because a pooled vehicle is not the
  registered fund — the symbol is right for the fund and wrong for the vehicle,
  so every count, fixture and whole-store diff read clean and only a draw
  printing each row's TYPE could see it.
- **The accelerated-vesting note: 59 plans / 51,205 ppl**, display-only.
- **`trace-filing --vs`** repaired — unrunnable since v201 and unable to observe
  a feature-only change, so it reported "no difference" for exactly the versions
  it was needed for.

## Settled rather than inherited

- **`dl` 48 → 93.** Fifth whole-population HEAD probe: **92 of 92 answered
  403** at probe time, so `e=download` remains an honest published claim and the
  rise is the EFAST2 bucket growing.
- **`e:"analyze"`** is a recurring ~one-per-run transient, each instance a
  different ack, each preserved and retried by the stale-pv mechanism. The
  original self-healed to `no-section` / `dx:"nohead"`, reproduced exactly
  through the real production path.

## Open, and honestly unresolved

- **122 acks clear the immediate-vesting bit where the registration said exactly
  123.** Likeliest explanation is one of the 123 sitting in the 46 acks still at
  pv 202, which would clear on a later run — direction "not yet applied", not
  "wrong" — but that is **not proved** and should be checked, not assumed.
- `audit-generic-names` stands above its 230 threshold, as recorded.

## Waiting on the owner

- **The SEC *comparable* half:** 188,846 rows / 35,353 plans / **49,065,090
  participants** would gain an asterisked approximation. That is a decision
  about how much hedged content the page should carry, not a correctness
  question — the asserted half is already shipped.
- The long-standing gated items are unchanged: the share-class symbol+fee
  population (11.1M ppl), our own store contradicting our own page (8.2M ppl),
  the fee pre-emption (13.3M ppl), stable-value fabricated ERs (7.4M ppl), and
  the American Funds no-share-class fee (10.5M ppl).
- **One click, unrelated to data:** the session's permission prompts come from
  the mode dropdown being on *Accept edits*; **Auto** runs non-file tool calls
  unattended. No session can set that for itself.
