# Morning brief — 2026-09-16

## The headline

**You sent one screenshot — a Pratt Industries holding Google identifies in one
search — and it opened the largest measured gap this project has.** Only
**19.7% of the 1.68M holding rows we publish carry a fund identity**, and
`fund-er.js` is the only expense-ratio source, so ~80% of rows show a blank fee
cell. 52,434 plans / 82.2M participants have at least one.

It had never been counted, and the reason is worth one line: **an unidentified
row still renders, the values are right, and every arithmetic check passes.** A
silent blank is a defect no audit can raise.

## Shipped and LIVE on main (`8785bfed`)

Gate +0 gained / −0 lost, pv 124 at 99.9%, reader failures 0.

- **Fund-name matching repair** — identified rows **19.67% → 20.41%**, +12,716
  rows, **7,103 plans / 11.66M participants** gain at least one. Pratt now
  names both TRBCX spellings ($44.6M, 8.1% of the plan).
- **A wrong answer removed: 270 rows / 270 plans / 201,088 participants stopped
  publishing FTBFX for Fidelity *Advisor* Total Bond** — a different, more
  expensive fund. 100.0% of the dropped names contain `Adv`.
- **`audit-overshoot`** — a check keyed to arithmetic rather than to a list of
  bad names, because the name list has now been beaten three separate ways.
  Baseline 471 plans / 1.19M participants, written into the coverage trail so
  it is diffable and must fall.
- **The hourly pipeline actually runs hourly now** (below).

## The hourly run — cause found, fixed, and proven for five hours

You flagged it wasn't hourly. The cron was configured correctly; **GitHub
de-prioritises cron on free public runners** — measured yesterday at 10:00,
13:38, 18:16Z, gaps of 3.5 and 4.5 hours.

The real defect was elsewhere: **the reliable clock was waking a cycle that
then declined to dispatch.** The Routine fires at `:07` on the minute every
hour, but the cycle only dispatched "if a gated change is unshipped", so quiet
hours fell through to the unreliable cron. Now it dispatches every hour.
Runs #302–#307, one per hour, each verified `in_progress` within ~25 seconds.

## `wam` exists and has shipped its first item

`.claude/agents/wam.md`. **Defects first, then coverage**, ranked by
participants. Two terminal states only — FIXED, or DOCUMENTED AS UNREACHABLE
with a cause named from evidence. "Unknown" is not a state it may leave an item
in. The hourly cycle now hands it the queue item.

Its first item is the matching repair above. **I re-measured every number
before mirroring rather than relaying its report** — which is how the FTBFX
count turned out to be understated (224 reported, 270 actual).

## Waiting on you — ranked by participants

| # | item | reach | cost |
|---|---|---|---|
| 1 | **Fund table coverage** — RNWGX, VIGAX, VVIAX, VGSLX and ~20 more absent entirely | the bulk of the ~80% | `funds-and-tickers`, **no re-parse** |
| 2 | **Retail share class → institutional ticker** (`MFS VALUE CL A → MEIKX`) | 4,321 rows / 14.45M weighted | class-aware table rows, **no re-parse** |
| 3 | Fabricated/unusable published holdings — fragments, loan rows, 471 overshoots, code columns (720 plans / 688k ppl) | ~1.5M ppl | one `PARSER_VERSION` bump |
| 4 | Recordkeeper wrong name | 1,509 plans / 1.48M ppl | pipeline + prep run |
| 5 | Discretionary match shown as a standing "Formula" | ~4,469 pages | display only |

Plus the two settings: **GitHub Pages must serve `main`**, and the custom domain.

**Recommendation: 1 and 2.** Both are wrong-or-missing *expense ratios*, both
render client-side with no re-parse, and #2 is a wrong number on a live page
rather than a blank.

## What I got wrong yesterday, and corrected

- **"This is a defect, not new coverage."** I said that after confirming it on
  *one* fund. Running the discriminator showed it is **both**, and table
  absence dominates — `VANGUARD GROWTH INDEX FUND` misses even spelled
  perfectly, because VIGAX simply isn't in the table.
- **I quoted a documented caveat instead of testing it.** Project memory says
  `fundTickerInfo` "under-matches by design" on CITs. True of stable value —
  and it became cover for missing TRBCX. I had invoked that same caveat earlier
  the same day without ever measuring it.
- **A verification that verified nothing.** My first FTBFX check tested a
  string the old table couldn't match at all, so its null result carried no
  information. A negative result only means something if the case tested is in
  the population the claim is about.
- **A 400x over-count, caught by its own control before publication.** Tonight's
  random draw found rows with the value glued into the name. My predicate said
  87,382 rows / 26.9M participants; asking "are those digits *actually* the
  row's value" gave **217 rows / 3,029 participants**. The rest were target-date
  vintages and maturity dates. Sixth instance of this error, second caught
  inside its own cycle.

## What continues without you

Hourly dispatch, the audit, the findings issue, and the per-cycle random draw
from published lineups — the draw that found three defect classes on its first
run and one small one on its second. Both are recorded with sizes.
