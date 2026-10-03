# wampo morning brief — 2026-10-03, 10:3xZ (6:3x AM ET)

The night started with your question — *why does PSEG not show the formula
section, and what other filings are missing it* — and it turned out the page was
not only **missing** match formulas but **publishing wrong ones**, and then that
PSEG's **vesting** quote was wrong too. Five things shipped and all five are
live on main. Every run is green and nothing is held.

## Shipped and LIVE on main (`b00aa561`, Pages #845 green)

| what | who it reaches |
|---|---|
| **v198 — the formula a possessive hid.** PSEG writes *"an amount equal to 50% of each Participant's first 8% … as its matching contribution"*: the word *matching* arrives AFTER the numbers and a possessive sits between "of" and "first", which defeated all nine existing patterns at once | **345 plans / 422,623 ppl** — 226 that had no Formula line, and **117 whose placeholder became the real rate** (Life Care Centers, 32,465 ppl: `Discretionary — set year to year` → `25% of the first 6% of pay`) |
| **PSEG's match** | pn=004 reads **"50% of the first 8% of pay"**, pn=006 **"50% of the first 7% of pay"** |
| **v199 — 199 wrong formulas withheld rather than published.** A rate below its cap, with a better candidate for the rate in the same sentence, is a misread | **199 plans / 389,974 ppl** stop seeing a wrong number. They do not go blank — the filing's own quote stays |
| **v199 — mixed fractions.** CBRE files *"66-2/3% of the first 6%"* and the page published **"3% of the first 6%"**, because `3%` is literally the end of `66-2/3%` | **14 plans / 87,063 ppl**. CBRE alone is 55,809 people told their match was a twentieth of its real size |
| **NEW — PSEG's VESTING quote was a withdrawal rule.** Under "Employer-money vesting", above the line *"Quoted from the audited financial statements"*, PSEG published a sentence about losing future match if you withdraw within 24 months. Now withheld | **41 plans / 226,729 ppl**, every one of which published that quote as its **whole** answer. Charter Communications (120,688) published a **loan limit**; Vensure (42,571) published raw Form 5500 table text whose only vest-word sits inside the company name **VESTED METALS INTERNATIONAL LLC** |
| **A published name with no fund in it** — `Portfolio`, `Fund`, `shares`, `E.I.N. 20-` — now says "the filing names no specific fund" | **486 rows / 325 plans / 1,131,917 ppl / $5.93B**, plus 24 crawlable pages |
| **An empty parenthetical welded to a name.** Parker Hannifin published `Parker Stock Match Fund ( )` at 23.4% of its menu, $2,054,809,000 | **1,161 rows / 63 plans / 138,083 ppl / $8.9B** read as funds instead of as something broken |

**The clearest single case:** CommonSpirit Health, **127,392 participants**,
published `1% of the first 6% of pay` from a filing that says *"100% up to 1% of
compensation, plus 50% in excess of 1% up to 6%"*. Tier one's cap had been read
as the rate. It now shows the filing's words and no formula, which is the honest
answer until the tiered case is built.

## What was found wrong and is NOT fixed

- **Cisco Systems publishes `Collective Trusts(1) at NAV` at 77.9% of its menu —
  $25,144,872,000 in one row, 70,957 participants.** A Schedule H caption with
  its footnote marker, published as a fund. The largest instance of the
  category-table class, which is **on your list below**.
- **The 41 vesting plans now read "not stated in the audited notes"** — honest,
  but the filing usually *does* state a schedule and the extractor picked the
  wrong sentence. Fixing the selection is a parser change; the guard that
  shipped gives it a ready-made oracle.
- **Kaiser Foundation Health Plan publishes `Loan Repayments are included` as a
  holding** — a note sentence in the fund table, on plans with 182,954 and
  105,462 participants. Two rows, deliberately not fixed with a general
  predicate: in the same hour one such predicate produced 3,328 false positives
  including a $3.4B row in front of 91,385 readers.

## What was HELD, and why

- **An arm worth 114,149 participants was measured, then dropped.** It would have
  read American Airlines' *"receive 100% company matching contributions of up to
  4%"*. Validated against the 46,198 formulas the shipped parser already
  produces, it agreed only **93.1%** of the time, and its failures grabbed a
  neighbouring *non-elective* rate or a second tier. Not good enough for a number
  that size.
- **A guard against "not to exceed 50% of the first 8%" was designed and
  refused.** Widening the vocabulary reaches 44 plans / 71,188 ppl and reading
  them kills it: National Mentor Holdings is 41,694 of those and is **correct**.
  Seventy correct formulas withdrawn to fix two.

## Waiting on you (ranked by people, unchanged)

1. **13,274,448 ppl** — a generic fee estimate published where the fund's own
   issuer supplies a house-specific one. Errs both ways.
2. **11,144,696 ppl** — a filing states a share class, the page publishes a
   different class's symbol *and its fee*. **New evidence this morning makes
   this provable without any outside source:** Justworks (163,323 ppl) publishes
   *Total Stock Market Index **Institutional*** and *…**Admiral*** as two
   separate holdings and we print **VTSAX for both**. The plan's own two rows
   contradict each other, so at least one symbol is wrong by construction.
3. **10.5M ppl** — American Funds rows naming no share class keep the R-6 fee,
   while the ticker column already refuses that same inference.
4. **7,389,704 ppl** — stable-value accounts publishing a fabricated expense
   ratio, 4,571 of them at exactly 0.35.
5. **The category table published as a fund menu** — Cisco's $25.1B row above,
   Bayer's $4.87B, Paramount's 59.5%.

## What I got wrong overnight, named rather than dropped

- **I registered v198 at "+122, a ceiling" and it delivered 345.** The harness
  measured over the stored quote — an *output* of the extractor I was changing —
  so it asked whether the new pattern fires on the sentence the *old* one chose,
  and it counted only plans with no formula, missing the 117 whose formula was
  replaced.
- **Five screens for the vesting class were each refuted by reading their own
  members** — 3.9M participants, then 2, then 181, then 100, then 80. The first
  counted "no vesting arithmetic" and caught honest rules stated without numbers;
  the second missed PSEG itself; the rest kept admitting real quotes, one of them
  because `\w` cannot match a `%` sign.
- **A draw was one paragraph from publishing a wrong-ticker claim the page never
  made.** Intel's `BlackRock 2500 Index Fund F` resolves to an S&P 500 symbol,
  but the page labels that row an **approximation** with an asterisk. My script
  printed the symbol and dropped the asterisk flag.
- **Two "live site" checks returned zero bytes, not zero matches.** The sandbox
  cannot reach `evwes.github.io`, so `curl | grep -c` printed a plausible `0`.
  Deployment is now verified from the mirrored tree plus the Pages run.
- **`mirror.sh` told me main's data was stale right after I mirrored a matched
  pair.** The check compared code between branches and never asked what produced
  the store it was shipping. Fixed.

## Continuing without you

The hourly Routine fired on every hour through the night with no gaps. Seven
pipeline runs, all green; the last **four** incremental coverage lines are
byte-identical, which is correct when the work list is only the 48
permanently-403 acks. `dl` 48, all HEAD-probed **48 of 48 → 403**, so "withdrawn
from the EFAST2 bucket" remains an honest claim. Store complete at pv 199 over
99.93% of 69,046 acks; HIGH 4 and warn 556, both at baseline. The coverage trail
now records which parser version wrote each line, which it never did before.
