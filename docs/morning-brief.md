# Morning brief — 2026-09-16

## The headline

**One screenshot you sent — a Pratt Industries holding Google identifies in one
search — opened the largest measured gap this project has.** Only **20.4% of
the 1.7M holding rows we publish carry a fund identity**, and `fund-er.js` is
the only expense-ratio source, so ~80% of rows show a blank fee cell. 52,434
plans / 82.2M participants have at least one.

It had never been counted, and that is the pattern worth noticing: **an
unidentified row still renders, the values are right, and every arithmetic
check passes.** A silent blank is a defect no audit can raise.

## Shipped and LIVE on main

**Now `622c3540`, mirrored 15:0xZ** — this brief was written at `b377afb6` and
the sections below describe that state. Every mirror since has been gate +0/−0
at pv 124, and all of them documentation only: nothing in "Waiting on you" has
moved, because every item there needs either your decision or a re-parse.

Gate +0 / −0 on every mirror, pv 124 at 99.9%, HIGH at the baseline of 4.

- **Fund-name matching repair** — identified rows **19.67% → 20.41%**, +12,716
  rows, **7,103 plans / 11.66M participants** gain at least one. Pratt now
  names both TRBCX spellings ($44.6M, 8.1% of the plan).
- **A wrong answer removed: 270 rows / 270 plans / 201,088 participants stopped
  publishing FTBFX for Fidelity *Advisor* Total Bond** — a different, more
  expensive fund. 100.0% of the dropped names contain `Adv`.
- **`audit-overshoot`** — keyed to arithmetic rather than to a list of bad
  names. Baseline 471 plans / 1.19M participants, in the trail so it must fall.
- **`tkShare` in the trail** — the fee column's coverage, never previously
  recorded in any unit. 1-in-20 deterministic sample, validated at 20.38%
  against 20.41% full.
- **The hourly pipeline actually runs hourly** — ten consecutive hours as of
  05:00Z, each dispatch verified `in_progress` within ~25 seconds.

## Found SINCE this brief was written — and the first one is the biggest defect on record

Added midday. Both came from a change of sampling frame: the per-cycle random
draw had always been uniform over plans, which mostly reads plans almost nobody
is in. Weighting the draw by participants — "what does a randomly chosen reader
see" — hit two verified defects in its first four plans.

- **WALMART, 1,970,230 participants — the largest plan in the country.** It
  publishes `Lendable Fund` at **$3,547,236,088**. No such fund exists. The
  filing wraps three BlackRock names over two lines each and we keep only the
  second line, so `Intermediate Government Bond Index Non-`, `Long Term
  Government Bond Index Non-` and `MSCI ACWI ex-U.S. IMI Index Non-` all become
  `Lendable Fund` and merge. Their values sum to the published row **to the
  dollar**. A **$2.86B international equity index fund is invisible** to every
  participant looking for their international allocation. The same filing shows
  `US) Value Equity Fund` at $1.83B — a real fund truncated to its continuation
  line. Ratio 0.93, every guard silent.
- **UPMC, 112,002 participants.** The entire published menu is the filing's
  `Multiple-Employer Plan Participating Employer Information` roster —
  `University of Pittsburgh Physicians` at 34.7% / $1.47B, 41 of 80 rows UPMC
  subsidiaries, and the column we read as a share count is an **EIN**. The real
  4i schedule is in the same PDF and totals $54.5M, a ratio of 0.011 against a
  $4.90B plan, so it was rejected while the roster's 0.87 was accepted. **The
  guard meant to reject fabrications selected one**, because an apportionment
  table sums to ~100% of the plan by construction.

Both need the re-parse in row 3 below. Neither was started.

## Found overnight, NOT fixed — and one is large

- **Macy's, 163,125 participants, $4.64B.** Its published menu carries, at
  **24.7% / $1,177,000,000**, a row named *"savings and 50% on the next 5% of
  basic savings. Forfeited nonvested accounts of participa"* — **a
  match-formula sentence from the audit notes, published as a holding.**
  Another row is named `category`. Ratio 1.03, so every guard is silent.
- **UnitedHealth Group, 262,812 participants** — fund names with an address
  column and the filing's own expense ratio glued on
  (`AMERICAN INVESTMENT CO. OF AMERICA F2 0.15% USADDRESS 3500 WISEMAN BLVD`).
  The fund underneath is right; the name is unusable and blocks its ticker.
- **Value-in-name: 217 rows / 13 plans / 3,029 participants** —
  `FIDELITY 500 INDEX FUND 1976786`, where the digits are the row's own value.

## Waiting on you — ranked by participants

| # | item | reach | cost |
|---|---|---|---|
| 1 | **Fund table coverage** — RNWGX, VIGAX, VVIAX, VGSLX and ~20 more absent entirely | the bulk of the ~80% | `funds-and-tickers`, **no re-parse** |
| 2 | **Retail share class → institutional ticker** (`MFS VALUE CL A → MEIKX`) | 4,321 rows / 14.45M weighted | class-aware table rows, **no re-parse** |
| 3 | Fabricated/unusable published holdings — **WALMART 1.97M + UPMC 112k**, fragments, loan rows, 471 overshoots, code columns, Macy's, value-in-name, DocuSign watermarks | **~3.6M ppl** (was ~1.5M before the midday finds) | one `PARSER_VERSION` bump |
| 4 | Recordkeeper wrong name | 1,509 plans / 1.48M ppl | pipeline + prep run |
| 5 | Discretionary match shown as a standing "Formula" | ~4,469 pages | display only |

Plus one setting: **the custom domain**. ~~GitHub Pages must serve `main`~~ —
**corrected 10:1xZ: that was already done and had been for some time.** The
`pages-build-deployment` workflow builds from `main` and succeeded on every
mirror today, so each one reached readers within ~2 minutes. It was listed as a
blocker in this file and in project memory; it never was one.

**Recommendation, CHANGED at midday: 3, then 1 and 2.**

This brief opened the day recommending 1 and 2, on the reasoning that they are
wrong-or-missing expense ratios that render client-side with no re-parse. That
reasoning still holds and they are still cheap. But Walmart moved row 3 from
~1.5M participants to ~3.6M, and changed its *kind*: 1 and 2 are a blank or a
wrong fee on a fund that exists, while row 3 now includes **a $3.55B holding
that does not exist at all, on the largest plan in the country, hiding a $2.86B
fund from 1.97M people.** A fabricated holding outranks a wrong expense ratio.

Row 3 costs a `PARSER_VERSION` bump and a ~1.5h re-parse, which is wall clock
rather than money — Actions minutes here are measured at zero. The blocker is
only that it is your call, not that it is expensive.

## What I got wrong, and corrected

The day's most useful output may be this list rather than the fixes.

- **"This is a defect, not new coverage"** — said after confirming it on *one*
  fund. The discriminator showed it is **both**, and table absence dominates:
  `VANGUARD GROWTH INDEX FUND` misses even spelled perfectly.
- **I quoted a documented caveat instead of testing it.** Project memory says
  `fundTickerInfo` "under-matches by design" on CITs — true of stable value,
  and it became cover for missing TRBCX.
- **A verification that verified nothing.** My first FTBFX check tested a
  string the old table couldn't match at all. A negative result only means
  something if the case tested is in the population the claim is about.
- **"Committed but production-untested"** — false; `merge-4i` checks out the
  latest branch state, so a `[skip ci]` commit made mid-run executes in that
  same run.
- **Project memory said Parser v123** while every mirror gate printed pv 124.
  Re-derived the whole line from the store rather than editing the number.
- **THREE over-matching sizing predicates in one night**: value-in-name said
  87,382 rows / 26.9M ppl (truth **217 / 3,029**); asset-class said 8,172
  (mostly legitimate — `Mid Cap Index Fund` is what real white-label options
  are called); narrative prose said 3,651 rows / **8.1M ppl** (Macy's is the
  only confirmed case in the top sixteen). **None of those numbers may be
  quoted.** All three were caught by printing the members in the same run that
  produced the total — which is now written down as the operational form of
  "count the outcome, not the condition."

## What continues without you

Hourly dispatch, the audit, the findings issue, and the per-cycle random draw
from published lineups — the draw that found three defect classes on its first
run, one small one on its second, and Macy's on its third. Every finding is
recorded with a size, or explicitly recorded as unsized.
