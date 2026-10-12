# wampo brief — 2026-10-12, 09:2xZ

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

## Shipped: we stopped hedging 890,938 readers on an answer we had right

**The page was publishing an asterisked *comparable* — its label for "a
comparable registered fund, not the one held" — on a symbol the registry
registers as exactly the share class the filing states. 579 rows / 157 plans /
890,938 participants / $2.86B now drop that asterisk, and `star` is the only
cell that moves: ticker, fee, name, shown type and row membership all zero,
with 21,424 sampled non-candidates differing on nothing.** `site-test #213` is
green on the shipped commit and `pages build and deployment #1025` confirms it
live on main's HEAD. Paychex Retirement Llc
(661,036 ppl) publishes `~SSDEX` on `State Street Target Retirement 2045 Fund
Class K` at $170,115,724 — and SSDEX *is* Class K of that series. Nine rows of
that one menu, $1.17B.

Every other share-class item on the record is a wrong class published as fact.
This is the right class published as a hedge, and an asterisk is a whole
category of claim. **The control sits inside the same menu:** eleven rows state
Class K on a filer-typed `Mutual Fund` — read out of the filing itself, which
also confirms every value to the dollar — two publish their Class K symbol as
fact, and nine are asterisked. The discriminator is only whether our own
pattern table happens to carry a hardcoded arm for that vintage.

**Why the SEC table cannot fix it is the interesting part:** its keys are
emitted only where the page resolves *nothing*, which is its whole safety
claim — so an answer the page already publishes is outside its reach by
design. Safety and blindness are the same property.

**Two of my own claims were refuted before it shipped, and both mattered.**
The row count: my candidate screen asked the resolver without the issuer, where
the page asks *with* it first — so 110 rows looked unreachable, in the
direction that makes a change look safer than it is. The fee: the first
differential moved 29 fee cells, every one 0.02 → 0.03 on a fund whose real
cost is about 0.02, because one flag was deciding two questions — whether a row
is an approximation *and* where its fee comes from. Fixed by preferring the
resolver's own figure, with the starred branch left byte-identical; my first
draft of that merged the branches and would have gained a pattern fee on 194
other rows.

**One false positive, found only by reading all 57 names in the class** — and
it is the second-largest row by dollars. `State Street S&P 500 Index
Non-Lending Series Fund Class K` ($264,712,802; Nutrien at 11.94% of its menu)
is a *collective trust*, and the "Class K" the filing states is the trust's own
unit class, not a registered share class. Every instrument read clean on it.

## What was corrected in my own work

My first screen of that class read 3,969 rows / 4,548,795 participants and was
refuted three ways by its own output: the registry's class column holds the
*series* name for several registrants, 3,002 rows were pooled vehicles where
the asterisk is right (Microsoft's 183,509-participant row is a commingled
pool), and the alarming fee movements were all pooled rows. The honest class is
six times smaller on rows.

## What continues today

- **#644 and #645 are both complete and verified.** #644's registration held in
  its strongest form: of the 35 coverage keys, the only one that moved is the
  date field. Main and the dev branch had each taken a data commit; the
  structural diff proved them the same data twice — trail 445 lines both sides
  with zero unique either way, 69,046 status acks with zero differing entries,
  all nine stores identical once timestamps are stripped — so they were
  converged rather than rebased, losslessly. Mirrored; `pages build and
  deployment #1022` confirms the deployment on main's HEAD.
- The audit issue is at its baseline 4 HIGHs: three contribution outliers and
  the standing `fabricated-name` finding.
- The hourly cycle is healthy: the self-bound Routine fired on schedule again
  at 07:26, which is stronger evidence than any listing.
