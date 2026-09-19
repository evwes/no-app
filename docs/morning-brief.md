# Morning brief — 2026-09-19 (written 07:1xZ / 3:1x AM ET; refreshed at the next verdict)

Live on main: **`6172a056`, the v149 store** (Pages #515 deployed it at
07:09Z). Since the last brief: v144–v149 are all LIVE; **v150–v154 are
running together as #385** (dispatched 07:09Z, queued behind main's own
cron run, so it lands late morning ET rather than in an hour). Twelve
parser versions shipped since 23:3xZ, each gated, corpus-diffed, and
verified against its own prediction; every lost lineup was read by name.

## What shipped and what it changed (numbers, not adjectives)

| version | what readers stopped seeing / started seeing | size |
|---|---|---|
| v139–v143 (live) | caption fragments and kerned type labels; legend-less Empower codes (`1FXAIX`) named from the SEC class index | 820 + 46 rows; **2,224 rows / 271 plans / 286,418 ppl** renamed code → fund |
| v144 (live) | the securities fold runs BEFORE the row cap — Boeing's 6,950 sleeve positions are one row instead of 7,551 "not shown" | hidden-tail class **337 plans / $46.7B → 240 / $7.2B** |
| v145–v147 (live) | a schedule's two renders count once; two-column wraps reassembled; "Exchange Traded Fund" is a type phrase; house + product phrase compose | duplicates **522 → 110 rows**; 7 lineups back + 23 Vanguard-ETF plans publish for the first time; 2,147 rows / 3.94M ppl lengthened |
| v148 (live) | the doubled house stripped in the store (`Vanguard Vanguard 500 Index`) | **203 → 10 plans**; 987 rows / 309 plans / 674k ppl |
| v149 (live) | a class SUBTOTAL beside its own itemisation removed before the restatement cut — Marriott's real menu (Vanguard Retirement trusts, $5.7B of collective trusts) visible for the first time | Marriott 152,118 ppl, 31 → 49 rows |
| v150 (running) | the `^` party-in-interest marker stripped like `*` | 2,038 rows / 164 plans / 476k ppl |
| v151 (running) | employer-stock test matches whole words (`america` no longer matches American Express; HCA's trust folds its healthCAre securities); a stricter rule built and REJECTED because it dropped U.S. Bancorp's and Southern Co's own stock | 24 rows / 21 plans |
| v152 (running) | a coupon with a maturity date is a bond whatever noun it carries (`TRANSCANADA TRUST 5.3% 03/15/2077` leaves the menu for the fold) | 280 rows / 42 plans / 1.07M ppl |
| v153 (running) | RECEIVABLES securitizations no longer skipped as statement lines; the class-label test sees past `U.S.` and `&`; a cover-page identifier (`Sponsor ID #: 20-5146075`) is not a $5.1M holding | Marriott 37 rows at 0.980, no class line; 446 identifier rows / 362 plans / 1.17M ppl; Barton & Gray's 17-fund menu back |
| v154 (running) | an issuer cell ending in a type phrase names firm + vehicle: TIAA's statement label `College Retirement Equities Fund variable annuities` cleared from every row; `Vanguard Group Registered investment company` → `[Vanguard Group]` with the row typed | 16,915 rows / 1,171 plans / 1.45M ppl |

Live store (v149): confident **60,122**, lineups 59,769, HIGH 4 (the
folded-aggregate baseline was re-based 60 → 120 with the v144 mechanism
recorded, so a standing mechanism no longer reads as a defect), overshoot
364, aggRow 109 / 1.16M ppl, `tkShare` 24.34, download failures 104.

## Losses accepted on the record since the last brief

v143 → v147: Energy Transfer and Sunoco (designed trust pointers), three
bond-sleeve plans folding to one row, Midland's junk names, an untraceable
fallback, one double-counting trust (~4,500 ppl). v147 → v149: Goodwill
Keystone (1,929 ppl — its old confidence was bought by a double-counted
class line over a scanned fragment) and Barton & Gray (198 ppl — a real
regression, fixed in v153 before the next mirror).

## Found and not yet fixed, by people affected

| item | size | status |
|---|---|---|
| (o) the schedule's table of contents as holdings (NRECA `Common collective trusts (pages 165-166)` 49%) | 1 plan / 80,475 ppl | recorded; the honest page is a class summary, a design question (yours, #5 below) |
| coded rows no legend names (`1ISM35I`) | 152 plans / 655 rows / 170k ppl from the plan's own filing | the filing publishes the code alone; needs Empower's own code list, outside EFAST2 |
| `ds` stored as `absent`/`noattach` beside ≥5 parsed rows | 84 plans | hygiene: not published (the census prints it only for nohead plans), but the status file contradicts itself |
| the one-member master trust refused at 2.0x (55 rows of class subtotals not adjacent to their runs) | 1 trust | open |
| (k) leading share-class fragments; (f) C two-line issuer; window-fund ambiguity (AmEx, Jones Walker) | small, each recorded | queued |

## HELD, and why

- **fund-facts (ticker + expense ratio + YTD return)** — built; both
  retrieval routes remain closed (sandbox network policy; Yahoo 429s the
  runner). `data/fund-facts.json` is empty, honestly. Waiting on a source
  decision: (a) an API key as a repo secret, (b) allowlist
  `investor.vanguard.com` / `www.morningstar.com`, (c) both.
- **The mirror was held 69 minutes under main's cron run #384 and then
  made anyway**, once measured: #384 is a 20-shard OCR run (~3h, main's
  cache is not the branch's), the workflow's concurrency is per-ref, and
  its merge rebases onto whatever main is when it lands. The reasoning is
  in the accuracy log; it is not a new rule.
- **No parser agent is spawned** until you say so.

## Waiting on you, ranked by people affected

1. **Match and vesting extraction as new coverage** (~13.5M + ~10M ppl).
2. **fund-facts source** — every plan page's fee and return cells.
3. **Recordkeeper source fix** (Schedule C line 1b / Schedule A carrier)
   — 2,241 plans / 2.0M ppl publish a wrong or missing name.
4. Whether to spawn the `wam` agent each cycle at the current usage tier.
5. Whether a class SUMMARY (NRECA, Paramount) should ever publish as a
   lineup — today the generic-names audit counts them and the page shows
   them.

## What continues alone

Hourly: reconcile, verdict any run, mirror only when the verdict is clean,
dispatch the next gated version, the participant-weighted draw (four
draws tonight, 58 of 60 real menus; items (n), (o), (p) and the TIAA
issuer label came from them), the record. Next: #385's verdict → mirror
→ the `ds` hygiene item.
