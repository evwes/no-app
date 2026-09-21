# Morning brief — 2026-09-21 (written 01:2xZ / 9:2x PM ET Sunday)

Live on main: **the v176 store**. Eight versions shipped since yesterday
morning — v169 through v176 — and the honest headline is not the count.

**I broke Apple's page yesterday morning, reported it as a win, and found it
myself twelve hours later.** Most of what follows comes from that.

## What reached readers, largest first

| | who | what |
|---|---|---|
| v174 | **1.17M participants across 506 plans** | fund names lose a bare `(1)` that no legend on the page explains — FMR on 110 of its 120 rows, Edustaff on 17 of 17, Thermo Fisher on 24 of 28 |
| v173 | **429,252 participants across 260 plans** | a page break's `(continued)` stops being printed as the name of the firm behind a fund |
| v176 | **145,428** | **Apple's $2,153,504,672 brokerage window is back**, after v172 deleted it |
| v169 | 145,125 | UPS stops showing $1,470,493,000 of net appreciation as if it were a holding |
| v174 | 21,847 | Chubb stops listing 125 individual stocks as though they were the fund menu — and $38M the row cap had hidden is now counted |
| v176 | 9,282 | **Thrivent stops publishing a $1,700,835,259 "fund" that does not exist** |

Live store: confident 60,117, lineups 59,766, findings 5, overshoot 332.

## What I got wrong, in order

This is the useful half, and today it is longer than the half above.

1. **v172 deleted $2,153,504,672 from Apple's menu** — 7% of a $30.8B plan —
   and I wrote it up as a clean win. Apple's filing names its brokerage account
   in one column and describes it as "Various Accounts" in the other; my rule
   read the description, decided it was not a fund name, and dropped the whole
   row. The page went from accounting for 98.7% of the plan to 91.7% with
   nothing saying where the rest had gone.
2. **My first fix for it would have invented a holding.** Trustmark files three
   separate Schwab rows; naming all three from the same column merges them into
   one $13,916,207 line that exists nowhere. Caught before shipping.
3. **My second fix published a $1.7B phantom.** Thrivent's whole balance sits
   under the bare word "Thrivent", and the fix turned a plan that had correctly
   published *nothing* into one publishing a single 99.2% "fund". It passed all
   three tests I had written for it. **Passing the tests you thought to write
   is not the same as being right.**
4. **I sized that class at 6 plans when it was 129**, by using a hand-written
   word list in place of the actual rule.

All four are fixed. Nothing from (2) or (3) ever reached the live site; (1) was
live for about fifteen hours and is repaired.

## Why it kept happening, and what now stops it

Every one of those defects was **invisible to the standing check**. The corpus
diff re-parses about a thousand filings chosen by size, and it reported "clean"
over all three, because none of those plans is in the sample.

What caught them was the same thing each time, done by hand: compare the whole
store before and after a run and read what moved, ranked by money and by
people. **That is now a permanent tool and part of the routine before every
publish.** Run against yesterday's data it puts Apple's $2.15B first and
Thrivent's $1.7B second — both would have been on screen within seconds
instead of surviving for hours.

Two more gaps closed behind it:

- **Nothing was watching plans that quietly lose a row.** A lineup that stays
  published, keeps its source and simply shows less money moved no existing
  check at all — Apple's was a 27 → 26 row change carrying $2.15B. There is now
  a check for exactly that, tested in both directions.
- **The audit has been under-counting its own warnings since 11 September.**
  One report said "5 findings" while the record it wrote the same minute said
  6, and a whole category of warning had never once been printed. Fixed twice:
  the second time because fixing the count still left those findings buried
  beneath 543 routine lines, and counting them is not reading them.

## Waiting on you, ranked by people affected

1. **Match and vesting extraction as new coverage** (~13.5M + ~10M ppl).
2. **fund-facts source** — fee and return cells stay empty until a retrieval
   route is approved: an API key as a repo secret, an allowlist for two fund
   company domains, or both.
3. **Recordkeeper source fix** — 2,241 plans / 2.0M ppl publish a wrong or
   missing provider name.
4. Whether to spawn the parser agent each cycle at the current usage tier.
5. Whether a class SUMMARY should ever publish as a lineup.

## Open and queued, with sizes

- **The brokerage fold — 269 plans / 630,032 ppl.** Where a filing says part of
  the plan is "various investments" and does not itemise it, we now drop that
  line rather than show a total, which leaves the menu quietly incomplete.
  Whether to publish it under an honest label is question 5 above.
- Pechanga (4,520 ppl): a balance-sheet total published as a holding at 63.7%
  of its menu. One plan, and the one-word fix touches a shared rule, so it
  waits for a version that is not also changing something else.
- Marsh & McLennan (35,907 ppl): a $3.39B prose row at 48% of a 3-row menu.
- JPMorgan Chase (299,277 ppl): a dollar value welded into a holding's name.
  One plan seen, not yet sized.

## What continues alone

Hourly: reconcile, verdict any finished run, **whole-store diff**, mirror only
on a clean verdict, dispatch the next gated version, draw randomly from
published lineups and read the rows, record.
