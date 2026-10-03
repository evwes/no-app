# wampo morning brief — 2026-10-03, 07:2xZ (3:2x AM ET)

The night started with your question — *why does PSEG not show the formula
section, and what other filings are missing it* — and the second half of it
turned out to be the smaller problem. **The page was not only missing match
formulas; it was publishing wrong ones.** Four things shipped and all four are
live on main. Every run is green and nothing is held.

## Shipped and LIVE on main (`d845b8d1`, Pages green)

| what | who it reaches |
|---|---|
| **v198 — the formula a possessive hid.** PSEG writes *"an amount equal to 50% of each Participant's first 8% … as its matching contribution"*: the word *matching* arrives AFTER the numbers and a possessive sits between "of" and "first", which defeated all nine existing patterns at once | **345 plans / 422,623 ppl** — 226 that had no Formula line, and **117 whose placeholder became the real rate** (Life Care Centers, 32,465 ppl: `Discretionary — set year to year` → `25% of the first 6% of pay`) |
| **PSEG specifically** | pn=004 reads **"50% of the first 8% of pay"**, pn=006 **"50% of the first 7% of pay"** |
| **v199 — 199 wrong formulas withheld rather than published.** A rate below its cap, with a better candidate for the rate in the same sentence, is a misread | **199 plans / 389,974 ppl** stop seeing a wrong number. They do not go blank — the filing's own quote stays |
| **v199 — mixed fractions.** CBRE files *"66-2/3% of the first 6%"* and the page published **"3% of the first 6%"**, because `3%` is literally the end of `66-2/3%` | **14 plans / 87,063 ppl**. CBRE alone is 55,809 people told their match was a twentieth of its real size |
| **A published name with no fund in it** — `Portfolio`, `Fund`, `shares`, `E.I.N. 20-` — now says "the filing names no specific fund" | **486 rows / 325 plans / 1,131,917 ppl / $5.93B**, plus 24 crawlable pages |
| **An empty parenthetical welded to a name.** Parker Hannifin published `Parker Stock Match Fund ( )` at 23.4% of its menu, $2,054,809,000 | **1,161 rows / 63 plans / 138,083 ppl / $8.9B** read as funds instead of as something broken |

**The clearest single case of the night:** CommonSpirit Health, **127,392
participants**, published `1% of the first 6% of pay` from a filing that says
*"100% up to 1% of compensation, plus 50% in excess of 1% up to 6%"*. Tier one's
cap had been read as the rate. It now shows the filing's words and no formula,
which is the honest answer until the tiered case is built.

## What was found wrong and is NOT fixed

- **Cisco Systems publishes `Collective Trusts(1) at NAV` at 77.9% of its
  menu — $25,144,872,000 in one row, 70,957 participants.** That is a Schedule H
  caption with its footnote marker, published as a fund. It is the largest
  instance of the category-table class, which is **on your list below** because
  the fix needs a firm-vs-product discriminator that does not exist yet.
- **Kaiser Foundation Health Plan publishes `Loan Repayments are included` as a
  holding** — a note sentence in the fund table, on plans with 182,954 and
  105,462 participants. Two rows, and I deliberately did **not** build a
  predicate for it: in the same hour, one such predicate produced 3,328 false
  positives including a $3.4B row in front of 91,385 readers. It batches with
  the other name repairs as a plan-specific pin.
- **The match-formula residue: 1,756 plans / 3.1M ppl** still show a magnitude
  claim with no Formula line, bucketed by cause. The largest tractable bucket is
  882 plans / 1.1M ppl.

## What was HELD, and why

- **An arm worth 114,149 participants was measured, then dropped.** It would
  have read American Airlines' *"receive 100% company matching contributions of
  up to 4%"*. Validated against the 46,198 formulas the shipped parser already
  produces, it agreed only **93.1%** of the time, and its failures grabbed a
  neighbouring *non-elective* rate (Wellesley College, Cass Information
  Systems) or a second tier. 93% is not good enough for a number that size.
- **A guard against "not to exceed 50% of the first 8%" was designed and
  refused.** Susquehanna (2,830 ppl) really does publish a capped rate as flat,
  but widening the vocabulary reaches 44 plans / 71,188 ppl and reading them
  kills it: National Mentor Holdings is 41,694 of those and is **correct**,
  because *"50 cents of every dollar not to exceed 50% of the first 3%"* is that
  formula, not a cap on it. Seventy correct formulas withdrawn to fix two.

## Waiting on you (ranked by people, unchanged)

1. **13,274,448 ppl** — a generic fee estimate published where the fund's own
   issuer supplies a house-specific one. Errs both ways.
2. **11,144,696 ppl** — a filing states a share class, the page publishes a
   different class's symbol *and its fee*. Recommendation: fix the symbol on the
   exact-match set and **withdraw** the fee rather than carry the wrong class's.
3. **10.5M ppl** — American Funds rows naming no share class keep the R-6 fee,
   while the ticker column already refuses that same inference. Both cannot be
   right.
4. **7,389,704 ppl** — stable-value accounts publishing a fabricated expense
   ratio, 4,571 of them at exactly 0.35.
5. **The category table published as a fund menu** — Cisco's $25.1B row above,
   Bayer's $4.87B, Paramount's 59.5%. Three pieces, not one version.

## What I got wrong overnight, named rather than dropped

- **I registered v198 at "+122, a ceiling" and it delivered 345.** My harness
  measured over the stored quote — an *output* of the extractor I was changing —
  so it asked whether the new pattern fires on the sentence the *old* one chose,
  and it counted only plans with no formula, missing the 117 whose formula was
  replaced. Now a standing method rule.
- **Six of my own measurements counted their own predicates**, each caught by
  reading the members rather than by any check: a 5.5M-participant "welded name"
  count that was ordinary parentheses; a 6.4M-participant "sentence" count whose
  `\bis\b` matched **`IS`, the abbreviation for Institutional Shares**; a
  "truncated name" mechanism I asserted from two examples and which the
  fingerprint refuted (the shape is 10 rows, not 323,680 participants); and
  three readings of one fee question that each printed a tidy `0 gained, 0 lost`
  while the instrument was answering nothing at all.
- **`mirror.sh` told me main's data was stale right after I mirrored a matched
  pair.** The check compared code between branches and never asked what produced
  the store it was shipping, so it was wrong on the only path the procedure ever
  takes. Fixed to compare the mirrored parser version against the store's own.

## Continuing without you

The hourly Routine fired on every hour through the night with no gaps. Six
pipeline runs, all green; `dl` moved 39 → 48 and **all 48 were HEAD-probed: 48
of 48 answered 403**, so "withdrawn from the EFAST2 bucket" remains an honest
claim and nine more filings were genuinely pulled. Store complete at pv 199 over
99.93% of 69,046 acks; HIGH 4 and warn 556, both at baseline. The last two
incremental runs produced **byte-identical** coverage lines, which is what an
incremental run should do.
