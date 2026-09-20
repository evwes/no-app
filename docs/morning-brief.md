# Morning brief — 2026-09-20 (written 06:4xZ / 2:4x AM ET)

Live on main: **the v172 store**, mirrored 07:0xZ. Overnight, **v169 through v173** — five
versions, each gated, corpus-diffed and checked against predictions written
before the run finished. Two of those predictions failed and one published
number was wrong; all three are below, because that is the more useful half of
the record.

## What reached readers overnight, largest first

| version | what changed | size |
|---|---|---|
| v169 | **UPS stops showing $1,470,493,000 of net appreciation as a holding.** A statement caption wraps, its value lands on the next line, and the parser read the orphan as a fund — at the *prior year's* column | **145,125 participants** |
| v170 | **Irisndt's 1,609 see forty-two holdings where one `JOHN HANCOCK` row of $21,512,753 stood at 53% of the plan** — eighteen filed holdings that had merged into one | six plans un-merge; the bare-firm class falls 20 → 14 |
| v169+v170 | holding names lose a stray trailing `+` or `~` that no filing legend explains | 1,939 rows across 268 plans |
| v171 | **the Form 5500 employer-ID line, refused by the parser for years and published anyway** — its skip rule required a `#` that filings do not write | 43 rows → 1 |

Live store: confident **60,117**, lineups 59,766, findings at **5**, overshoot
332, download failures 104.

## Mirrored this cycle, after a deliberate twenty-minute hold

**v172 is live.** It was held briefly because main runs its own hourly job and
force-pushing over it while it is about to write is the one unsafe moment; the
mirror went through as soon as that job landed. The hold cost nothing.

**Oracle's 101,985 participants stop seeing `Various investments, including
registered market funds and c` at $3,405,120,000** — 9.6% of a $35B plan,
published as if it were a single fund. Capital One gains three rows and $1.14B
of real funds.

**CORRECTED 19:5xZ — the same change also took $2.15B off Apple's page, and I
reported it as a clean win this morning.** Apple's filing names its brokerage
window in one column and describes it as "Various Accounts" in the other; the
description won, the rule fired, and the whole row went. **145,428 Apple
participants now see a menu accounting for 91.7% of their plan instead of
98.7%, with nothing saying where the rest is.** Six plans are affected this way
(160,758 people), all brokerage windows, and the fix is written and waiting on
the current run. The write-up of what went wrong is in the accuracy log — in
short, I checked three plans by row count and Apple's loss was a single row.

## Running now

**v173 (#409): a page break's `(continued)` marker published as the issuer** —
566 rows / 260 plans / **429,252 participants**.

The interesting half is why a *type label* gets promoted at all. `Common
Collective Trust` is refused everywhere. With the marker on it, the type test
strips the vocabulary and is left with the word `continued` — nine characters,
over its six-character floor — so the test returns false, and the word `Trust`
then satisfies the "is this a firm" test on the very next line. **A phrase the
parser refuses on every other page is promoted on the continuation page
alone.** Td Bank US Holding publishes it on eleven of its twenty-three rows.

## Found wrong, by us, in our own work

- **Two of v169's four pre-registered tests failed.** A marker class predicted
  at ~0 came in at 663 rows (the strip ran on the wrong part of the row, and
  *my first correction was also wrong*); and I predicted a metric could only
  fall when my own corpus diff had already recorded the counter-case. v170's
  predictions each had to name a measurement already in hand, and all four
  then passed.
- **A class size published in yesterday's brief was wrong and was corrected
  within the hour.** I wrote "274 plans / 790,790 people" for the prose class.
  That counts every plan containing any such row, most of them a ~1% loan-rate
  fragment. At a size that distorts a page it is 17 rows / 6,054 people — with
  Oracle just under the threshold while being 94% of the people and nearly all
  of the money. A count of a condition is not a count of an outcome.
- **A sizing script reported a clean, plausible, entirely false result today.**
  It fed 201 strings to the parser and reported 0 of 201 — because it read the
  result as a list when the function returns a record, so every answer was
  "nothing". A control with a known-good input returned zero too, which is what
  exposed it. The uniformity was the tell, and it was caught before the number
  was published rather than after.
- **A draft of today's parser note claimed the defect blanked the fee cell.**
  It does not: the lookup falls back to the bare fund name. Corrected before
  publishing. What v173 fixes is what the page *says*, and that is all.

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

- **Fold brokerage-window category rows into the SDBA aggregate** rather than
  deleting them — Progressive's eight rows, ~$499M. This is v172's own
  recorded cost and is next.
- Marsh & McLennan (35,907 ppl): a $3.39B prose row at 48% of a 3-row menu.
- JPMorgan Chase (299,277 ppl): a dollar value welded into a holding's name.
  One plan seen, not yet sized.
- A third trailing-marker layout (952 ppl); IBG Llc's page-header EIN (1,598).

## What continues alone

Hourly: reconcile, verdict any finished run, mirror only when it is safe and
the verdict is clean, dispatch the next gated version, draw randomly from
published lineups and read the rows, record. Next: **#409's verdict**, then the
brokerage fold.
