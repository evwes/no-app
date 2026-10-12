# wampo brief — 2026-10-12, 05:3xZ

Overwritten nightly. Decision-shaped: what shipped and what it changed in
numbers, what was found wrong, what is held, what is waiting on the owner.

## One thing shipped, and then it corrected itself

**A plan's own forfeiture or expense account stopped being published as a menu
choice — 58 rows / 58 plans / 411,316 participants, and 28 of them had a FALSE
VEHICLE TYPE withdrawn** (`Mutual fund` 13, `Cash / short-term` 9, `Collective
trust` 4, `Stable value / GIC` 1, `Separate account` 1). Publix Super Markets
(225,961 ppl) stops publishing `Fees paid by participants` as an investment
option; Takeda's `Nonvested forfeited accounts`, BAE Systems' `12(b)(1) Fee
Account`, Privia Health's `Unallocated Forfeitures`.

The shown TYPE is the only cell that moves — name, ticker, fee, asterisk and
menu share all zero, measured as a differential through both copies of the
page's own row renderer against main's own file, with a 20,369-row
non-candidate control differing on nothing. `PARSER_VERSION` stays 203.
**Mirrored to main; `site-test` green on the shipped commit; the deployment is
confirmed by `pages build and deployment #1020`.**

The claim is deliberately the weaker one. A forfeiture account is a *real*
unallocated plan asset, so "the filing names no specific fund" would be false
of it. What is false is that a participant could choose it — so the label is
the loan family's, and the value stays printed and keeps counting toward the
menu total.

## What was found wrong, and the first item is my own number

**I published a fabricated dollar figure as a headline and have corrected it.**
The ship above was headlined *"Hartford Fire Insurance publishes `Master
Expense Account 4` at 13.04% of its menu / $961,793,000 — one row carrying 96%
of the class's money."* Reading the filing ninety minutes later: it says `$ 4`
in a schedule marked `($ In Thousands)`. **The real value is $4,000, and the
class's honest dollar size is about $21.5M rather than $983M.** The label
claim stands, the rule still fires, and the row, plan and participant counts
are unaffected — every priced column was measured correctly. The error was
quoting the largest number in a correct measurement as a fact about the plan.

**And chasing that figure found a parser defect worth more than the ship.**
Hartford's menu (31,128 ppl, coverage ratio **1.03**) publishes `Clearing
Account 92` at **$4,383,081,000** and `Master Expense Account 4` at
**$961,793,000**. The filing's own category summary reads `Clearing Account 92`
then `Collective Investment Trusts 4,383,081`; `Master Expense Account 4` then
`Mutual Funds 961,793`. **Where a summary row's value is small enough to sit
inline with its name, the parser consumes it as a name token and pairs that
name with the *following* row's value** — putting $5,344,874,000, 74.5% of that
page's own $7.17B, on the wrong names, and dropping the two largest real
sections from the published menu entirely.

*Nothing could have caught it:* a mis-pairing conserves the sum, so the ratio
reads 1.03, `lineup-overshoot` cannot fire and no coverage key can move. The
defect is selected for by smallness and then publishes the largest figures on
the page, which is why it reads as plausible.

## Waiting on the owner

- **The mis-pairing above is parser-side** — a `PARSER_VERSION` bump and a full
  re-parse. It should be sized by *shape* first (an inline value in a
  two-column summary), because the recorded summary-candidate scoring bonus
  steers the parser toward exactly this construction. The cheap new witness is
  **absence**: a summary's named section missing from the parsed menu while its
  arithmetic still closes.
- The long-standing owner-gated families are unchanged: the wrong-share-class
  symbol-and-fee item (11.1M readers, with a one-directional 9.1M slice), our
  own store contradicting our own page (8.2M), the fee pre-emption (13.3M),
  fabricated stable-value expense ratios (7.4M), and the SEC comparable half
  (49.1M).

## What was held, and why

**A labelling arm for the bare `Clearing`/`Holding` account class.** The screen
reads 270 rows / 250,260 participants / $4.85B and is **85% `General Account` —
a real insurer vehicle my own shipped pin already protects**: 52 rows typed
`Stable value / GIC` by the filer, issuer cells naming MN Life, Empower Annuity
and Transamerica, and one carrying a group-annuity contract number. Of 22
distinct names, `clearing` carries 99.998% of the candidate dollars in two
rows, and `sweep` one row at $70. So the class is about thirty rows by count
and one row by dollars — and that row turned out not to be a labelling question
at all.

## What continues today

- **#644 is in flight** — an incremental sweep dispatched on the dev branch at
  05:2xZ because no pipeline run had fired in 5.5 hours, above the measured
  3.6-hour median, with the 1–7 AM ET floor open. Registered to come back
  **byte-identical on all 35 coverage keys** (no store-side change since #643);
  a `dl` rise above 93 means the EFAST2 bucket grew. Verdict and mirror on
  completion.
- The hourly cycle is healthy: the self-bound Routine fired twice in the last
  seventy minutes, which is stronger evidence than any listing.
