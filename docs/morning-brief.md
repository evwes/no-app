# Morning brief — 2026-09-18 (written 06:1xZ, refreshed 12:3xZ / 8:3x AM ET)

Live on main: **`05a9d93a`, the v138 store**, Pages deploying it. Seven parser
versions shipped in 30 hours (v132 → v138), every one verified against its
own prediction and every loss read by row name before the mirror.

## What shipped and what it changed (numbers, not adjectives)

| version | what readers stopped seeing / started seeing | size |
|---|---|---|
| v132 | Delta's $782M ZIP+4 "holding"; Allina's real 22-fund menu; bare house names merged | overshoot 451 → 390; house ≥90% 48 → 5 plans |
| v133 | CUSIPs read as $ values (HCA's $7.93B `CUSIP:` row); menus folded into "managed account" rows (Duke, H&R Block); 8 degraded swaps repaired | 34 trust lineups / 2.1M ppl; band ≥30% 56 → 48 plans |
| v134 | fair-value category totals beside the menu they total | overshoot 390 → 364 |
| v135 | prose (a description's wrapped tail) as a holding; a one-row trust pointer read as a pointer | prose ≥10% of menu **171 → 100 plans, 315k → 104k ppl**; BJC's all-junk lineup gone |
| v136 | Dominion Energy's real menu back; First American's page names its master trust; statement-of-changes lines as holdings | 47 plans / 340,403 ppl / $2.12B phantom value; HIGH back to 5 (= 4 baseline + 1 designed) |
| v137 | a PLURAL type label (`Collective investment trusts`) at ≥90% of a lineup is a statement, not a menu — ATH Holding / Elevance (94,427 ppl) was publishing the v105 shape; the guard knew the singular only. Its refusal triggered the prior-year fallback, so those 94,427 readers now see the 2023 filing's REAL 29-row menu, disclosed as 2023. A first draft that widened the shared regex made 3M's derivatives ledger publishable and was caught by the corpus diff before shipping | confident −2 (two master trusts, designed); HIGH 4; dominant-row 0; the generic-names audit gains 24 plans it could not see (108 → 128) |
| v138 | **the parser showed only the largest 80 rows of a schedule and the page called the rest "not itemised"** — Boeing's 217,061 participants were missing $15.5B (21% of their plan) that the filing lists; 12 plans / 481,363 ppl / $27.6B hidden at ≥15%, Goldman Sachs 61%. Cap 120, what is cut is now recorded and the page says "N smaller holdings are not shown … about P% of the plan" | LIVE 12:2xZ; confident +0/−0 as predicted; Boeing's page checked and renders the sentence |
| fund table | "Van" contraction + 22 Vanguard funds the table never carried (your Ocala page) | **+43,962 rows / ~15,900 plans / 18.5M ppl gain a ticker; 0 lost; 0 flipped** |

Store: confident lineups 60,103; pv 138 at 99.85%; generic-names audit 128
(threshold 230); dominant-row 0; download failures 99, all 99 re-probed 403.

## Fully complete pages (your question at 03:2xZ)

A page is complete when it carries a menu, a recordkeeper, a match answer and
a vesting schedule. **59.0% of the 61,673 full-form live plans (57.4% of
their participants); 32.5% of the whole 111,782-plan universe.** Short-form
filers (43,523 plans) attach no notes by law and can never be complete. What
holds the other 41% back is match (11,767 plans missing only that) and
vesting (5,790), not the menu (97.6% covered) or the recordkeeper (97.7%).
Those two are NEW extraction coverage, measured earlier as 0 path defects in
120 sampled sentences — the loop does not start them unasked.

## Found and not yet fixed, by people affected

| item | size | status |
|---|---|---|
| (h) the filing's CLASS SUBTOTAL published as a holding (Morgan Stanley: six asset classes, no fund; Marriott `COMMON STOCKS` 49%) | 98 plans / 336,152 ppl at ≥30% of the menu; letter-spaced subclass 42 / 123,497 | queued, arithmetic fix shaped |
| (j) cosmetic strips: type column glued to names, trailing punctuation, share counts | 1,237 / 4.42M; 268 / 1.0M; 84 / 191k | queued; an `app.js` display strip needs no re-parse |
| (f) a type header or share-class fragment promoted to the issuer bracket | 375 + 357 plans / ~1.47M ppl | queued |
| (i) a holding published twice under two spellings, both full value | 262 / 450,981 | queued |
| (g) remaining description tails as holdings | 100 / 104,478 | queued |
| (l) fold the per-security flood BEFORE the row cap (Boeing's 7,551 cut rows are brokerage/managed innards the fold never saw) | the 12 + 26 capped plans above | found 10:2xZ, queued |
| (k) a LEADING share-class / vehicle fragment as the whole row name (Rush Copley `Fund Institutional Shares` 35%; Energy Transfer `Trust` 78%) | 18 plans / 29,785 ppl at ≥30%; 46 / 80,877 at ≥10% | found 09:2xZ, sized, queued |
| Docomo Pacific: the prior-year fallback published broken-font noise names | 1 plan / 476 ppl | recorded; a fallback-quality note |
| Lehigh Valley Imaging (OCR-path regression) | 198 ppl | its fresh dx is in the store, unread |

## HELD, and why

- **fund-facts (ticker + expense ratio + YTD return), your directive
  yesterday — built, and BOTH retrieval routes are closed.** The agent, the
  `/fund-facts` skill, `data/fund-facts.json` and a checker that refuses
  undated or unsourced figures exist. The sandbox cannot reach any fund-data
  host (network policy, every host probed), and Yahoo answers HTTP 429 to
  GitHub's runner IPs on every endpoint (runs #1 and #2). The file is empty,
  honestly; the daily schedule is off; nothing false is shown.
  **DECISION NEEDED:** (1) an API key as a repo secret — Alpha Vantage
  (free; dated YTD from adjusted closes, no ER) or Financial Modeling Prep /
  Polygon (fund profiles with expense ratios) — and the fetcher is rewritten
  against it in one commit; (2) allowlist `investor.vanguard.com` and
  `www.morningstar.com` in the environment's network policy; (3) both.
- **No new parser agent is spawned** until the usage picture is clearer.
  Three agents were killed by usage limits in 24 hours (17:0xZ, 21:3xZ,
  and the loop itself stopped 03:2x–06:0xZ); each kill costs the item in
  progress, and each restart re-derives it. If the weekly limit is the
  binding constraint, agent spawns are the cost to cut — the loop's own
  hourly cycle (verdict, mirror, draw, record) costs a fraction of one.

## Waiting on you, ranked by people affected

1. **Match and vesting extraction as new coverage** — 11,767 + 5,790 +
   5,086 plans, ~13.5M + ~10M participants; the largest gap on the site and
   settled as new work, not a repair.
2. **fund-facts source** (above) — every plan page's fee and return cells.
3. **Recordkeeper source fix** (Schedule C line 1b / Schedule A carrier)
   — 2,241 plans / 2.0M ppl publish a wrong or missing name; pipeline
   change, needs a prep run.
4. Whether to keep spawning parser agents at the current usage tier.

## What continues alone

Hourly: reconcile, verdict any run, mirror, the participant-weighted draw
(seven draws yesterday found five new defect classes, all sized and
queued), the record. The pipeline's own crons carry the data layer through
any gap.
