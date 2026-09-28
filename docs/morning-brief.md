# wampo morning brief — 2026-09-28, 07:3xZ (3:3x AM ET)

Second full night of the loop. The Routine fired every hour from 20:07Z through
07:27Z with no gaps. Everything below is measured. **Seven numbers I published
to my own record overnight turned out wrong and each is named as wrong here
rather than quietly dropped** — that is the most useful thing in this brief and
it has a section of its own.

## Shipped and LIVE on main

| what | who it reaches |
|---|---|
| **The American Funds fee table was calibrated for ONE share class and priced all of them.** `fund-er.js` heads that block with its own comment — `--- American Funds (R6) ---` — and no pattern beneath it tested the class | **2,065,081 ppl** / 2,227 plans / $9.26B. 10,387 fee cells withdrawn. `American Funds Eupac R4` and `American Balanced Fund Class A` were publishing the R-6 number; R-1…R-4, A, C and F-1 pay a 12b-1 fee that R-5, R-6 and F-2 do not |
| **Participant loans are not a menu choice** — typed and tinted, never dropped, so the money stays accounted for | **1,369,274 ppl** / 482 plans. Plus 17 crawlable pages / 279,408 ppl, where there is no type column so the qualifier goes in the name |
| **Caption class B, three arms**: the comma family, the bare-whitespace family, the leading parenthetical | **~580,000 ppl** across 3,542 rows. `Mutual Fund, Freedom Index 2030`; `Registered Investment Company Vanguard Inter-Term Bnd Index Fd Adm`; `Mutual funds (continued) Dodge & Cox International Stock Fund`. **+132 tickers gained, 0 lost** |
| **`Shares of registered investment companies` was displaying as "Shares of"** — a holding named after a preposition | **58,446 ppl** get their filed name back; the family falls 70 → 29 rows |
| **A new audit: the filing's own ticker as a check on ours** | 64 rows / **383,085 ppl** publish a symbol the filing itself contradicts. Live in the merge job as of run #484 |

## What was found wrong and is NOT fixed

- **We publish a symbol the filing contradicts for 383,085 participants.** The
  readable cases are share-class mismatches where the filing is right — VITSX
  (Institutional) published as VTSAX (Admiral), **MEIJX (MFS Value R4)
  published as MEIKX (R6)**, which is a defect on this record since 2026-09-15
  and was caught automatically for the first time last night. 1,426 rows agree,
  which is why the 64 are worth reading. **Fixing it means preferring the filed
  symbol at display, which publishes a filing string as a ticker — the
  fabrication surface this project is careful about. Your call.**
- **`audit-data.mjs` writes to the accuracy trail every time it runs**, locally
  included. Five junk lines from my own development runs were caught only
  because a stop hook flagged a dirty tree; one read `warn: 1970` from a
  deliberately inverted control. Reverted. The fix — gate the append, or split
  reporting from recording — changes a file the merge job depends on.
- **The pipeline is less durable than this project claims.** CLAUDE.md said the
  `:23` cron makes main's data move *hourly*. Measured over 660 hours and 152
  scheduled runs: **median gap 3.60h, mean 4.37h, worst gap 44.2 hours.** The
  mirror procedure is unaffected; the durability claim is not. Corrected in the
  file.

## What I got wrong overnight

Seven, and the rate is itself the signal:

1. **Fidelity K/K6** — I wrote up 7.6M participants as a defect. It is a
   documented decision, stated six lines above the patterns.
2. **The filed-ticker strip** — I reopened it believing the leading symbol
   blocked the lookup. It gains **zero** tickers; the blanks are missing table
   entries.
3. **"4,872 crawlable pages don't disclose their 12-row cap"** — my grep
   searched for a word the pages never use. They say *"top holdings"* and
   *"N more holdings in the interactive report"*; **4,852 of 4,872 disclose.**
4. **The follow-up probe on the remaining 20** — read the plan's ack where the
   generator falls back to the master trust's.
5. **"The generic-name audit under-counts"** — it does not; on the displayed
   name it reports *fewer* plans but *more* rows. The bases disagree both ways.
6. **A cron-cadence script returned 0 scheduled runs** — which would have read
   as "the cron has stopped". It was `fetch()` vs `curl`.
7. **A baseline timing returned 0s** because Node would not load a file saved
   with a `.headtmp` extension.

**Every one was caught the same way: an implausible number, or reading the
artifact instead of the proxy.** Nothing in the list reached a reader — but
(1), (2) and (5) had already been written into the permanent record before they
were caught, and correcting them is now a routine part of each cycle.

One correction ran the other way and is the most valuable single number here:
the filed-ticker class was **closed in the negative on 2026-09-16 at "1,305
participants"**. Re-derived: **1,066 rows / 136 plans / 1,341,198 participants /
$5.24B.** A thousandfold. Closed items go stale too.

## Waiting on you

1. **`data/fund-facts.json` is still empty** — `"funds": {}` since 2026-09-17,
   eleven days. It is described as the only place a verified ticker, fee or
   return may live, and it now blocks three separate items: the American Funds
   target-date tickers (**3,034,841 participants reachable**), correct per-class
   fees for the cells withdrawn last night, and the ticker-conflict resolution
   above. **capitalgroup.com and the Voya fact sheets are both blocked by this
   sandbox's egress proxy**, so I cannot source them from here.
2. **62 crawlable pages no run can ever repair** — `p/` holds 5,062 files
   against `TOP_N = 5000`. Now with a live instance: a fix shipped last night
   reached 17 of the 18 pages that needed it, and `p/651156742-001.html`
   (2,673 ppl) is outside every regeneration. Fixing it changes which URLs
   exist, so it is yours.
3. **The recordkeeper name** — 1,509 live plans / 1.48M ppl publish an auditor,
   lawyer or advisor as the recordkeeper. Pipeline change, sized, unstarted.
4. **Whether site-test's data-path trigger is worth a deploy key or PAT.**

## What continues today

The loop. Next by people affected: the ticker-conflict population once the
check has run a few cycles; caption class A (472 rows / 1.29M ppl publishing a
bare vehicle type as the whole name); and the `audit-data.mjs` write side
effect, which deserves its own cycle and its own control.

Store: **pv 188 at 99.8%**, confident 60,104, HIGH **4 = the baseline**, WARN
**608** (544 + the 64 new ticker conflicts — expected, not a regression), dl 128,
`analyze` 0. Nothing in flight.
