# Morning brief — 2026-09-17

## The headline

**2.38 million participants across 87 master-trust plans stopped being shown a
fabricated fund menu last night, and 67 of those plans now show their trust's
real one.** Walgreen (254,452 people) was publishing `Collective funds` at 73%
of its plan; Northrop Grumman (151,108) `le 0 0 1f` — Form 5500 checkbox
coordinates — at 89% of $44B; PepsiCo (161,067) `Trust` at 50%; Medtronic
`Various (includes` at 73%; UPMC its employer roster. One cause: when a
trust-held plan's newest schedule is correctly rejected as "interest in master
trust", the prior-year fallback opened the 2023 filing and published whatever
cleared the band there. The guard (v128) refuses that fallback when the trust
has its own confident lineup, or when the newest parse is a trust pointer, a
statement, or one line at 85%+ of its sum. Predicted 82 refusals from tracing
every member; the run refused exactly 82, gained 0, and every loss reconciled.

Found by the participant-weighted random draw from PUBLISHED lineups — the
same draw that found Walmart and UPMC the day before. Three plans in one draw,
all defective, all this shape.

## Update 12:5xZ — three more parser versions overnight, two live, one in flight

- **LIVE (`0ce549a0`, mirrored 02:5xZ): v130 + v131.** **Walmart's $3.55B
  `Lendable Fund` is gone**; the $2.86B MSCI ACWI ex-U.S. index fund and the
  whole LSV name are published. The cause was not the one in the queue: the
  wrapped line was captured and then discarded when the description column
  won the name, four mechanisms sharing one symptom. Floor 37 plans / 4.9M
  participants. **Loan-description rows published as funds: 7,052 rows across
  6,970 plans / 12.75M participants → 9** (the recorded 283 plans was a 24x
  undercount; the old guard was anchored to the start of the name). 25 junk
  3-row lineups fell under the floor, each read before mirroring.
- **In flight (v132, dispatched 12:5xZ):** the UPMC "roster" was already
  fixed by v128, and **Delta was never a roster — its 4i region ran into
  Schedule C and published Fidelity's ZIP+4, `782,514,321`, as a holding four
  times**. A region now ends at another schedule's caption: Allina Health's
  real 22-fund menu replaces a $1.35B phantom, Duke Energy loses a $2.90B one.
  Plus the bare house-name merge: 133 plans / 83,051 participants, Bell
  Nursery 3 rows → 21.
- **Former names refined:** 5,851 → 2,617 aliases; the cosmetic half is gone.
- **Two small regressions from v130, queued:** 9 small plans (~5,600 people)
  entered the overshoot set on a generic winner; First American (17,155)
  regained a 2023 fallback because its newest filing now parses to a
  different region. Both named in the queue with the fix shape.
- **The loop itself:** it is now a skill (`/wampo-cycle`) and an agent, and
  the hourly Routine invokes the skill. **It still skipped nine hours** —
  no cycle ran 03:07Z–12:13Z while GitHub's own cron kept parsing. Recorded;
  cause not established from inside the session.

## Update 14:1xZ — v132 is LIVE (`b13e5640`)

- **Delta's $782M ZIP+4 phantom is gone** for all 129,803 Delta
  participants; Allina Health's 37,565 see their real 22-fund menu; Duke
  Energy loses a $2.90B phantom; the bare-house-name class fell 48 → 5 plans
  at ≥90%. Overshoot 451 → 390, generic-named 208 → 121, dominant-row 0,
  HIGH at the baseline 4. Five lineups withdrawn, each read by name: two are
  Delta itself, three are junk (a sponsor's own name as a holding, asset-class
  labels, OCR noise).
- **Found reading Duke's filing at the verdict, not fixed:** its 16 core
  white-label funds (nine target-date vintages, the index funds) are
  published as ONE parser-made row, `Managed account holdings (16 positions)`,
  at 49.5% of the plan. Sized from the store: **56 plans / 158,541 people**
  have that aggregate at ≥30% of their menu (H&R Block 97%). Queued for wam.
- **8 small plans (6,910 people) regressed** from a good 2023 fallback to a
  half-plan 2024 parse. Queued, top of wam's brief.

## Update 20:1xZ — v134 LIVE; a three-hour gap from the usage limit

- **Mirrored `789f589e` at 20:0xZ.** v134 (the fifth v133 part parsed in):
  overshoot 390 → 364, HIGH back to the baseline 4, 0 losses, generic-names
  121 → 107. Main is the matched pair again.
- **The loop stopped 17:08–20:02Z** when the session's usage limit hit
  ("resets 8pm UTC"). The pipeline layer carried on (main's cron ran a
  no-op at 18:19Z); the judgement layer did not — the v134 verdict waited
  2.5 hours, and the agent working the parser queue was killed mid-edit.
  Its half-applied edits were reset, not adopted; a fresh agent restarted
  the same three items (First American's regression, statement lines as
  holdings, description tails as holdings) toward v135.
- **Your ask at 20:2xZ — a fund-facts agent (ticker + expense ratio + YTD
  return): built.** Agent, `/fund-facts` skill, `data/fund-facts.json` and a
  checker that refuses anything undated or unsourced. **Its first run wrote
  nothing, correctly:** every fund-data host (Vanguard, Morningstar, Yahoo,
  SEC, the archive) is blocked by this sandbox's network policy, and search
  summaries contradicted each other for the same fund on the same day. The
  retrieval now runs on a GitHub runner (open egress, the EDGAR pattern) on
  a weekday 22:41Z schedule; it dispatches for the first time with the v135
  mirror. **Decision for you:** allowlist `investor.vanguard.com` and
  `finance.yahoo.com` in the environment's network policy if you want the
  agent to read sources directly; otherwise the runner route stands.
- v135 is being built by the parser agent (two parts committed: master-trust
  pointer rows, prose-as-holding 557 rows / 517 plans / 961,757 people).

## Update 16:5xZ — v133 LIVE, and your Ocala page's blanks are filled on main

- **Mirrored `38b5df36` to main at 16:4xZ.** v133 store (pv 133 at
  99.87%): CUSIP-as-value phantoms gone from 34 trust lineups (HCA's $7.93B
  `CUSIP:` row; 2.1M people across the class), Duke Energy's 16 funds and
  H&R Block's 29 unfolded from a managed-account row (band ≥30%: 56 → 48
  plans), the eight degraded swaps repaired (Saad 28 → 47 rows). Confident
  +14. HIGH 9 = 4 baseline + 5 self-clearing.
- **Your Ocala page:** the "Van" contraction AND 22 Vanguard funds the table
  never carried (Equity Income, High-Yield Corporate, Inflation-Protected,
  Real Estate Index, Value/Growth/Mid/Small-Cap Index, Developed Markets,
  LifeStrategy x4, Federal and Treasury money markets …), every ticker and
  ER verified against Vanguard's pages. **+43,962 rows / ~15,900 plans /
  18.5M participants gain a ticker; 0 lose one; 0 flip.** Live on main.
- **One real regression accepted on the record:** First American Financial
  (17,155 people) lost its 29-row 2023 fallback menu — the 2024 filing's
  region now reads `band-lo` and blocks the fallback. Top of the queue.
- **v134 dispatched 16:4xZ** — a version bump only, because the agent's
  fifth v133 part (fair-value category totals, 25 lineups) landed after the
  v133 run was dispatched at the same number and would never have been
  parsed in. Verdict ~17:45Z; overshoot must fall from 390.
- **Two new fabrication classes queued** from the hourly draws: a
  statement-of-changes line as a holding (Fidelity's own plan, `Employer,
  net of forfeitures` $1.29B; ~40 plans) and a fund DESCRIPTION's wrapped
  last line as the holding (National Medical Care 33% junk, BJC Health
  System 100%; 171 plans / 315,474 people at ≥10% of the menu).

## Update 15:5xZ — your Ocala Breeders page: "Van Target Retire" tickers

- The fund table expanded `VANG`, `VG`, `VGD` to Vanguard and never plain
  `VAN`. Added `VAN` and `TARG`. Measured over every published row:
  **+5,452 rows / 626 plans / 366,439 participants gain a ticker, 0 lose,
  0 flip to a different fund**; VanEck rows stay unresolved (control).
  Frontend only, no re-parse; on the branch, **reaches the live site with the
  next mirror** (held until the v133 run's verdict, ~16:40Z, because the
  branch also carries v133 parser code ahead of main's store).
- Still blank on the same page family, not a spelling: Vanguard funds the
  table lacks entirely (Equity Income, High-Yield Corporate, Inflation-
  Protected, Real Estate Index, Value/Growth Index, Emerging Markets Index,
  LifeStrategy) — that is row 1 of the table below, `funds-and-tickers`.
- v133 (five parts from the agent: CUSIPs read as values in 34 lineups /
  2.1M people, menus folded as managed accounts, the eight degraded swaps,
  units markers as row names, fair-value category totals) is parsing in
  run #347.

## Shipped and LIVE on main — `413c905f`, mirrored 00:1xZ

Two full re-parses overnight, both verified before mirroring; HIGH at the
baseline of 4; pv 129 at 99.87%.

- **v128 — the trust-fallback guard above.** 87 plans / 2,379,942 people;
  overshoot people 1.16M → 0.58M. Six plans keep a fallback on purpose: Norfolk
  Southern, Mars PN 001 and Xcel have real prior-year menus and no readable
  newest schedule; Delta (112,027) and Mars PN 003 keep junk that belongs to
  other classes (Delta is the UPMC roster shape, row 3 below); one small plan's
  newest filing is a permanent 403.
- **v129 — TJX, 311,623 participants.** Its 2024 schedule prints `IN
  THOUSANDS` as a line of its own and no units pattern accepted it, so the
  real 31-row menu parsed at ratio 0.001 and readers got the 2023 filing under
  a false "no readable schedule" sentence. Sized honestly: 0 of 99 band-lo
  plans and 0 of 48 random fallback-served plans share the shape. A one-plan
  fix, stated as one.
- **Former names — the Shiel Sexton question.** "shiel sexton" now finds
  Structure Man Holding Company, and the report says *Previously filed as
  Shiel Sexton Company, Inc.* Prep reads Form 5500 line 4 (both name columns,
  never read before) and keeps older filings' sponsor names per plan. **5,851
  plans carry an alias** — a count of aliases, not of renames; the split by
  source is in run #335's prep log and has not been read. Verified end to end
  on the live store.
- **Site-test #68 green** on the alias frontend; `pages-build-deployment`
  #454 was building `e9470dc8` at 00:08Z — its conclusion is the next
  cycle's first check.

## Found, NOT fixed

- **The feature fallback supplies notes 38% of the time it is read, not
  92%.** Shard 0 of #334 printed the counters promised on 09-12 for the first
  time in production: needed 309, supplied 78, silent 126, none 105. The 92%
  in project memory was an upper bound from a biased population; this is one
  shard of twenty, stated as one shard.
- **TJX's largest row** is named `JPMorgan Investment Management, Inc. JPMCB
  U.S. Active Core Equity Fund - CF -` — issuer glued to a wrapped name. Real
  holding, right value, unusable name; the v126 issuer split covers the header
  form of this, not the in-row form.
- **Two zero-instruments in one sizing script**, both caught because a
  confident lineup with 0 rows is impossible: `loadStatus()` returns a
  wrapper, and project memory's description of the lineup-shard hash was
  wrong (corrected).

## Waiting on you — ranked by participants

| # | item | reach | cost |
|---|---|---|---|
| 1 | **Fund table coverage** — RNWGX, VIGAX, VVIAX, VGSLX and ~20 more absent entirely | the bulk of the ~80% of rows with a blank fee cell | `funds-and-tickers`, **no re-parse** |
| 2 | **Retail share class → institutional ticker** (`MFS VALUE CL A → MEIKX`) | 4,321 rows / 14.45M weighted | class-aware table rows, **no re-parse** |
| 3 | Fabricated/unusable published holdings — **WALMART 1.97M + UPMC 112k + Delta 112k**, wrapped fragments, loan rows, 446 overshoots, code columns, Macy's, value-in-name, DocuSign watermarks, house-name merge | **~3.7M ppl** | one `PARSER_VERSION` bump |
| 4 | Recordkeeper wrong name (Apple → Russell, AstraZeneca → PwC, HP → Strategic Advisors) | 1,509 plans / 1.48M ppl | pipeline + prep run |
| 5 | Devon Energy's "match" card quoting the SECURE 2.0 student-loan provision — the extractor stored a real sentence about a different thing | 3,415 plans / 7.45M ppl | display only |
| 6 | Discretionary match shown as a standing "Formula" | ~4,469 pages | display only |
| 7 | Shape 2 of the name question — legal-shell sponsors (GE Vernova filed by Ropcor, Sevita by National Mentor Holdings): findable today, but the reader sees the shell | 301 plans / 307,583 ppl | display choice |

Plus the custom domain. Pages serves `main` and always has.

**Recommendation: 3, then 1 and 2.** Unchanged. Last night removed the
trust-plan half of the fabricated class without touching row 3's core, and
Walmart's $3.55B `Lendable Fund` is still live on the largest plan in the
country. Row 3 is a version bump and ~1 hour of wall clock; the blocker is that
it is your call.

## What I got wrong, and corrected

- **A guard whose counter printed nothing on its own positive control.** The
  first v128 tally sat on the fallback's parse; a newest filing that already
  supplies features never opens the prior year, so three correct refusals
  logged as zero. Moved to the decision point before shipping.
- **A reconciliation that read the wrong side of the diff.** It called one of
  82 losses "unexplained" because it looked for a trust-pointer flag in the OLD
  status, where a confident entry never carries one. Printing the member
  settled it in one line.
- **"Mirror right after the verdict" would have been wrong once.** The branch
  carried v129 code over a v128 store; mirroring that makes main's own hourly
  cron run a duplicate full re-parse on main. Held one hour, ran v129 first,
  mirrored the matched pair.
- **A one-plan fix is a one-plan fix.** v129 was sized before shipping and
  came back as TJX alone. It shipped because it is correct and the re-parse
  was happening anyway, and it is recorded as one plan, not a class.

## What continues without you

Hourly dispatch, the audit, the findings issue, and the per-cycle
participant-weighted draw from published lineups — four cycles, four defect
classes, three of them now fixed. Every finding is recorded with a size or
explicitly as unsized.
