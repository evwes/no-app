# wampo morning brief — 2026-10-03, 04:4xZ (12:4x AM ET)

The night's work answered the question you asked at the end of yesterday — *why
does PSEG not show the formula section, and what other filings are missing it* —
and the second half turned out to be the smaller problem. **The page was not
only missing match formulas. It was publishing wrong ones.** Two parser versions
shipped and both are live.

## Shipped and LIVE on main (`70d3cbb7`, Pages green)

| what | who it reaches |
|---|---|
| **v198 — the formula a possessive hid.** PSEG writes *"an amount equal to 50% of each Participant's first 8% … as its matching contribution"*: the word *matching* arrives AFTER the numbers and a possessive sits between "of" and "first", which defeated all nine existing patterns at once | **345 plans / 422,623 ppl** gain or correct a Formula line — 226 that had none, **117 whose placeholder became the real rate** (Life Care Centers, 32,465 ppl: `Discretionary — set year to year` → `25% of the first 6% of pay`) |
| **PSEG specifically** | pn=004 now reads **"50% of the first 8% of pay"**, pn=006 **"50% of the first 7% of pay"** |
| **v199 — 205 wrong formulas withheld rather than published.** A rate below its cap, with a better candidate for the rate sitting in the same sentence, is a misread | **199 plans / 389,974 ppl** stop seeing a wrong number. They do not go blank: the filing's own quote stays |
| **v199 — mixed fractions.** CBRE files *"66-2/3% of the first 6%"* and the page published **"3% of the first 6%"**, because `3%` is literally the end of `66-2/3%` | **14 plans / 87,063 ppl** corrected. CBRE alone is 55,809 people who were told their match was a twentieth of its real size |
| **v199 — the retry.** Once the gate rules a formula a misread, a later pattern cannot do worse, so it tries again | **11 plans** get a correct formula instead of none — Beacon Mobility's `3% of the first 4%` → `100% of the first 3%` |

**The clearest single case of the night:** CommonSpirit Health, **127,392
participants**, published `1% of the first 6% of pay` from a filing that says
*"100% up to 1% of compensation, plus 50% in excess of 1% up to 6%"*. Tier one's
cap had been read as the rate. It now shows the filing's words and no formula,
which is the honest answer until the tiered case is built.

## What was found wrong and is NOT fixed

- **A published name with nothing identifying in it: 929 rows / 586 plans /
  2,340,373 ppl / $82.4B.** Cisco Systems publishes **`Collective Trusts(1) at
  NAV` at 77.9% of its menu — $25,144,872,000 in one row, 70,957 participants**.
  That is a Schedule H caption with its footnote marker, published as a fund.
  Avi Systems publishes `shares` at 69.4% of a $304M menu. Some are OCR
  wreckage: `E.I.N. 20-` is an employer-ID fragment published as a holding.
- **A published name truncated mid-air: 190 rows / 323,680 ppl / $4.98B.**
  Barclays publishes `BLACKROCK EQUITY INDEX FUND Common /` at 22.3% of its menu
  ($785,330,815, 19,531 ppl), and Spire Services publishes `Class R6 Common /`.
  **Two plans out of a random draw of three**, so a `Common / Collective` column
  heading is bleeding into the name column and cutting off the rest.
- **The match-formula residue: 1,756 plans / 3.1M ppl** still show a magnitude
  claim with no Formula line, bucketed by cause in `CLAUDE.md`. The largest
  tractable bucket is 882 plans / 1.1M ppl.

## What was HELD, and why

- **An arm worth 114,149 participants was measured, then dropped.** It would
  have read American Airlines' *"receive 100% company matching contributions of
  up to 4%"*. Validated against the 46,198 formulas the shipped parser already
  produces, it agreed only **93.1%** of the time, and its failures grabbed a
  neighbouring *non-elective* rate (Wellesley College, Cass Information Systems)
  or a second tier. 93% is not good enough for a number that size.
- **A guard against "not to exceed 50% of the first 8%" was designed and
  refused.** Susquehanna (2,830 ppl) really does publish a capped rate as flat.
  But widening the vocabulary reaches 44 plans / 71,188 ppl, and reading them
  kills it: National Mentor Holdings is 41,694 of those and is **correct**,
  because *"50 cents of every dollar not to exceed 50% of the first 3%"* is that
  formula, not a cap on it. Seventy correct formulas withdrawn to fix two.

## Waiting on you (ranked by people, unchanged from yesterday)

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

## What I got wrong overnight, named rather than dropped

- **I registered v198 at "+122, a ceiling" and it delivered 345.** My harness
  measured over the stored quote — which is an *output* of the extractor I was
  changing — so it asked whether the new pattern fires on the sentence the *old*
  one had chosen. It also counted only plans with no formula, so it was blind to
  the 117 whose formula was replaced. Now a standing method rule.
- **Three of my own measurements counted their own predicates**, each caught by
  reading the members: a "welded name" count of 5.5M participants that was just
  ordinary parentheses; a "headless name" count that fired on *Class I Vanguard
  Target Retirement Income Trust Select*, where the fund is fully named; and a
  gate condition that was vacuous because the cap is always larger than the rate
  it was being compared against — that one printed **398 of 398** and I read
  past it once before catching it.
- **`mirror.sh` told me main's data was stale right after I mirrored a matched
  pair.** The check compared code between branches and never asked what produced
  the store it was shipping — so it was wrong on the only path the procedure ever
  takes. Fixed to compare the mirrored `PARSER_VERSION` against the store's own
  dominant version.

## Continuing without you

The hourly Routine fired on every hour through the night. `dl` moved 39 → 48 and
all **48 were HEAD-probed: 48 of 48 answered 403**, so "withdrawn from the EFAST2
bucket" remains an honest claim and nine more filings were genuinely pulled.
Store complete at pv 199 over 99.93% of 69,046 acks; HIGH 4 and warn 556, both
at baseline.
