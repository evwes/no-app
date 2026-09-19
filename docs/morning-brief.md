# Morning brief — 2026-09-20 (written 23:1xZ / 7:1x PM ET Sept 19)

Live on main: **the v167 store** (mirrored 21:2xZ). **v168 is running as
#401** and is the largest-reach fix of the day. Since yesterday's brief:
**v158 through v168** — eleven versions, each gated, corpus-diffed and
verified against a prediction made before the run. Three of them fixed
regressions that the project's own verdicts had caught in the versions
shipped hours earlier, which is the loop working rather than a wobble.

## What reached readers today, largest first

| version | what changed for readers | size |
|---|---|---|
| v166 | **Meta Platforms stops showing one "fund" of $18,809,051,400 at 82% of the plan** — the ASC 820 line that reconciles NAV-valued assets — and gets its real 20-fund State Street and Vanguard menu | **84,993 participants**; the line was published as a holding by 104 plans / 274,765 ppl |
| v165 | SEC Form 11-K cover pages stop parsing as holdings: `Washington, D.C.` was a $20,549 fund, taking the SEC's own ZIP as its value | 20 rows / 13 plans / **302,810 ppl**, Publix (225,961) among them |
| v162 | a category plus a vehicle is a type phrase, not a fund — PennyMac publishes thirteen Fidelity Freedom vintages where one $157,047,874 `Asset Allocation Mutual Fund` stood | class 323 → 137 lineups; at ≥20% of a menu 117 → 11 |
| v167 | a description that is only a firm may not beat a real fund name — **Rcb Bank's 968 see a real T. Rowe Price Retirement menu** where a 68.4% `Blended investments` phantom stood | 5 plans un-merge; the class falls 28 → 23 |
| v164 | a fragment identity no longer wins just because the description was refused (`First Eagle` was the whole name of a row whose filing says `First Eagle Global Fund`) | 21 rows / 16 plans |

Live store: confident **60,115**, lineups 59,764, findings at **5** (the
four baseline plus one that clears itself), overshoot 344, download
failures 104.

## Running now, and it is the biggest single defect found in weeks

**v168 (#401): one unanchored word was deleting a whole fund family from
every menu in the store.** The skip rule for financial-statement lines is
built by string concatenation, and its alternation sits after the group
that anchors it has already closed — so every arm is a substring test.
For `appreciat` that means **every row naming a fund with "Appreciation"
in it was dropped**, as a holding and as a buffered name. *T. Rowe Price
Capital Appreciation* is one of the largest funds in the country.

| measure | value |
|---|---|
| published rows containing "appreciat" | 55 of 1,721,905 |
| corpus filings gaining rows under the fix | 63 of 989 (6.4%) |
| confidence lost in the corpus | 0 |

Duke University 96 → 98 rows, Emory 81 → 82, plus Sherwin-Williams,
Southwest Airlines, Ecolab, Dillard's, American University. Three plans
gain several rows because a fuller render stops losing its region contest
on the deleted row: Panorama Mortgage goes 17 → 28 at the same ratio,
with `TIAA-CREF Large-Cap Growth Index Fund` replacing `Nuveen Large Cap
Gr Indx R6`.

## Found wrong, by us, in our own shipped work

- **v163 merged eight real TIAA and CREF holdings** into one row at 58%
  of a 190-participant plan. No count could see it; the whole-store row
  diff found it. **Fixed in v167**, which also reached five more plans.
- **v166's own entry named a risk and did not guard against it.** Its NAV
  rule condemned any region containing the line, and beneath a real menu
  that line is a small footnote rather than the note's subtotal. Ford Gum
  and ZF Chassis lost real 29-row menus for about two hours. **Fixed in
  v167** with a materiality bar at 25% of the region.
- **A shipped predicate over-matched for the first time.** Sizing the
  bare-house class returned 81 plans / 331,365 ppl, led by Compass Group
  at 263,796 — whose menu is real, and whose `Fidelity TRIM 2030 Trust
  Company` rows matched a "house name" test built for a different
  population. The honest figure is **48 plans / 39,896 ppl**.

## Waiting on you, ranked by people affected

1. **Match and vesting extraction as new coverage** (~13.5M + ~10M ppl).
2. **fund-facts source** — every plan page's fee and return cells sit
   empty until a retrieval route is approved: an API key as a repo
   secret, an allowlist for two fund-company domains, or both.
3. **Recordkeeper source fix** — 2,241 plans / 2.0M ppl publish a wrong
   or missing provider name.
4. Whether to spawn the parser agent each cycle at the current usage tier.
5. Whether a class SUMMARY should ever publish as a lineup. Four
   all-generic menus returned to the site in v167 because v166 had been
   removing them for the wrong reason; this question decides them.

## What continues alone

Hourly: reconcile, verdict any finished run, mirror only on a clean
verdict, dispatch the next gated version, draw randomly from published
lineups and read the rows, record. Next: **#401's verdict**, then whether
the bare-house class loses its largest member, Northeast Georgia Health
System — 14,038 participants who have been shown `T. Rowe Price` as a
$479,484,734 holding while the fund's real name sat one line above it in
the same filing.
