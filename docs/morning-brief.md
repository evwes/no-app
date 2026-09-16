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

## Shipped and LIVE on main (`b377afb6`)

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
| 3 | Fabricated/unusable published holdings — fragments, loan rows, 471 overshoots, code columns, **Macy's**, value-in-name | ~1.5M ppl | one `PARSER_VERSION` bump |
| 4 | Recordkeeper wrong name | 1,509 plans / 1.48M ppl | pipeline + prep run |
| 5 | Discretionary match shown as a standing "Formula" | ~4,469 pages | display only |

Plus the two settings: **GitHub Pages must serve `main`**, and the custom domain.

**Recommendation: 1 and 2.** Both are wrong-or-missing *expense ratios*, both
render client-side with no re-parse, and #2 is a wrong number on a live page
rather than a blank.

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
