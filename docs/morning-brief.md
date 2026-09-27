# wampo morning brief — 2026-09-27, 06:1xZ (2:1x AM ET)

First full night of the agent loop since the owner's 2026-09-21→24 pause. The
Routine has fired itself **twelve times on schedule**, 20:07Z through 06:08Z,
with no gaps. Everything below was measured; the numbers that turned out wrong
are named as wrong rather than quietly dropped.

## Shipped and LIVE on main

| what | who it reaches |
|---|---|
| **v181** — a row the filing calls a subtotal is never a holding | 313,509 ppl. CVS Health's $2,690,925,949 line is labelled `Subtotal (not a holding)` with its false 0.35% estimated ER refused; two genuine double counts removed to the dollar (Cwpm, Douglas County — ratio 1.003 → **1.000**) |
| **v182 + v183** — a sleeve's own subtotal is the aggregate, and absorb only fires when the subtotal LINE is on the page | **307,068 ppl**. CVS's ~98 individual bonds stop being listed as fund choices beside the subtotal that totals them; $2.69B counted once, not twice |
| **filed-misspelling repair** (`app.js`, no re-parse) | ticker **150,335 ppl**; expense ratio **85,306 ppl / $749,399,699**. University of Maryland Medical System's twelve `Vangaurd` rows — 65.2% of its menu — now show VTWNX…VTINX at 0.080% |
| **`matchQuoteShown`** in the coverage trail | makes the AEP gap permanent: 5,397 counted, **1,785 shown**, 3,612 refused |

Every mirror passed the **data gate unforced at +0 / −0**. `--force` was used
only on the GIT check, over main's own cron commits, with the evidence produced
first each time (0 acks / 0 plans the branch lacked, plans array
byte-identical). `pages-build-deployment` #600 confirmed `success`.

## Store state

pv 183 covers **68,638 of 68,767 acks (99.81%)**. Confident **60,115**, lineups
59,764, HIGH **5** (the baseline), WARN 543, overshoot 331, aggRow 112, dl 128,
`analyze` 1. Universe 111,782 plans.

## Answered for the owner

**AEP is not a parser bug.** All seven "match" mentions in the 134-page filing
were read; none is a formula, so the page's *"no formula stated in the audited
notes"* is the honest answer, shown beside the $81,284,557 of employer money.
The SEC 11-K the owner linked **is** the right source and the earlier EDGAR
research scoped it wrongly — it asked only about fund schedules, never about the
Description of the Plan, where the formula lives. SEC is unreachable from this
sandbox, so it needs the documented `edgar-11k.yml` → `edgar-scratch` route.

## What was HELD, and why

- **v182 was NOT mirrored.** It fixed CVS exactly — all eight pre-registered
  values — and cost I. Rice & Co. (131 ppl) a real 38-row menu. The
  `reparse-loss` HIGH stopped the mirror, which is the machinery working. v183
  restored I. Rice **byte-identically** and left CVS untouched; **exactly one
  lineup entry changed in 68,767 acks**.
- **CVS's remaining $8,198,112,836 — 27.2% of the plan** — in four option
  subtotals is deliberately unfixed. The placement that reaches them was built
  and measured at 39 rows / ratio 1.061: it trades a double count for an
  overshoot and needs a threshold chosen from one filing. Withdrawn, with the
  reasoning left in the code comment.

## Measured and DELIBERATELY not fixed

Each failed the outcome test, not the size test:

| class | reach | why not |
|---|---|---|
| a value welded into a row name | 420 rows / **823,268 ppl** / $10.31B | 0 ticker wins — honesty defect only (UnitedHealth shows a street address inside a fund name) |
| a leading em-dash | 1,993 rows / **609,414 ppl** | cosmetic; the lookup already tolerates it |
| front-first wrapped issuer | 926 rows / **444,655 ppl** | 0 ticker wins, and rotation would corrupt real names |
| twin row carrying its own value | 6 pairs / 2 plans / 732 ppl | tiny; rides along with the next dedup change |
| 158 rows priced by a looser pattern | — | repairing them rewrites 158 PUBLISHED numbers; each needs verifying |

## Waiting on the owner

1. **Whether site-test's data-path trigger is worth a deploy key or PAT.** The
   trigger exists; GitHub's anti-recursion rule means the pipeline's own
   `GITHUB_TOKEN` pushes have never been able to fire it.
2. **The recordkeeper fix** (prefer service codes 15/64, then the line-1b
   platform or Schedule A carrier): up to **2,241 plans / 2,015,771 ppl**, of
   which **1,509 / 1,482,658 currently publish a DIFFERENT PROFESSION's name**
   — 103 auditors among them. A blank is honest; a name reads as knowledge.
3. **Match and vesting as NEW COVERAGE** (~1,634 plans / ~2.9M ppl reachable
   with no downloads; 0 path defects in 120 sampled, so it is new work rather
   than a repair). Not started unasked.
4. Custom domain DNS.

## What continues alone

#470 is in flight — a short incremental whose merge writes `matchQuoteShown`
for the first time. Then the queue is CVS's $8.2B residue, the `E.I.N. 23-`
survivor of the employer-ID class, and the hourly draw from published lineups.

## The night's method lessons, since they cost real time

- **An outcome test covers only the outcome it measures, and a fix can have
  two.** The misspelling repair was published as "$975M of fee cells" when the
  measurement had only asked `fundTickerInfo`; **rendering the page** showed
  twelve tickers against twelve blank expense ratios. Both halves now ship.
- **Read what a name refers to before asserting against it.** A predicted
  `coverageRatio` field was compared against my own `sum / assetsEOY` and
  printed `FAIL` on a correct number.
- **Print the matches, ranked, before quoting a count.** Four sizing predicates
  dissolved on inspection tonight — 54,287 rows that were real share classes,
  934,871 ppl that included `BANK OF AMERICA CORP`, 492 plans whose
  "duplicates" were coincident round values like $70, and 165 rows that were
  two defects sharing one regex.
- **`rows-dropped.txt` is not readable from a branch session** (never
  committed; `losses-triage.txt` and `swaps-degraded.txt` are gitignored). The
  HIGH and WARN still did their job.
