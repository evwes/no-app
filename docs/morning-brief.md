# Morning brief — 2026-09-19 (written 05:0xZ / 1:0x AM ET; refreshed at the next verdict)

Live on main: **`c07b9f47`, the v147 store** (Pages #514 deployed it).
Since the last brief: v144–v147 are LIVE together — #381 (v144–v146) was
held off main over 15 small losses, v147 repaired the seven that were
mine, and #382 mirrored with every remaining loss read by name. **v148 +
v149 are running (#383, lands ~05:45Z)**; v150 is gated and committed
behind it. Every version was verified against its own prediction.

## What shipped and what it changed (numbers, not adjectives)

| version | what readers stopped seeing / started seeing | size |
|---|---|---|
| v139–v143 (live) | caption fragments and kerned type labels; legend-less Empower codes (`1FXAIX`) named from the SEC class index; the readable region wins a near-tie | 820 + 46 rows; **2,224 rows / 271 plans / 286,418 ppl** renamed code → fund |
| v144 (live) | the securities fold runs BEFORE the row cap, untyped securities recognised by name — Boeing's 6,950 sleeve positions are one row instead of 7,551 "not shown" | hidden-tail class **337 plans / $46.7B → 240 / $7.2B**; untyped-security floods 65 plans → 2 |
| v145 (live) | a schedule's two renders with wording drift count once; a statement word inside the SPONSOR's name no longer discards its rows (Energy Transfer's 78% "Trust" row) | duplicates **522 → 110 rows**; Energy Transfer + Sunoco now trust pointers |
| v146 (live) | both 4i columns wrapping with the value on the second line (Rush Copley's $109M "Fund Institutional Shares" is three Vanguard funds again); footnote letters and `N/R` cells out of names | (k) ≥30% fragments 17 → 13 |
| v147 (live) | repairs two defects v146 introduced ("Exchange Traded Fund" is a type phrase; the footnote strip stays off Form 5500 cover pages); a house plus a product phrase composes ("Invesco Stable Value Fund", not "Invesco") | 7 lineups back + 23 Vanguard-ETF plans publish for the first time; 121 bare-house rows fixed; **2,147 rows / 1,995 plans / 3.94M ppl** lengthened |
| v148 (running) | the doubled house stripped in the store, the display's own expression | 203 plans / 760 rows |
| v149 (running) | a class SUBTOTAL beside its own itemisation is removed before the restatement cut — Marriott's real menu (Vanguard target-date trusts, $5.7B of collective trusts) visible for the first time | Marriott 152,118 ppl, 31 → 49 rows; class 73 plans / 73,363 ppl |
| v150 (queued) | the `^` party-in-interest marker stripped like `*` (BAE `[^ The Vanguard Group]`) | 2,038 rows / 164 plans / 476,133 ppl |

Live store (v147): confident **60,122** (+15 over v143), lineups 59,769,
HIGH 5 (4 baseline + 1 self-clearing), overshoot 363, aggRow 110 (the
fold's class), generic-names 128, dominant-row 0, `tkShare` 24.34,
download failures 104 (all re-probed 403).

## Losses accepted on the record (v143 → v147, eight plans)

Energy Transfer and Sunoco GP (designed: master-trust pointers, not
menus); Century Companies, Riverside Contracting, Jackson Contractor
(bond sleeves that fold to one row and fail the 3-row floor — the old
50-row "menu" was a sleeve); Midland Holding (junk names refused);
Fullington (an untraceable fallback); one one-member trust refused at
2.0x, which v149 may bring back. ~4,500 ppl together, each read by name.

## Found and not yet fixed, by people affected

| item | size | status |
|---|---|---|
| (o) the schedule's table of contents as holdings (NRECA `Common collective trusts (pages 165-166)` 49%) | 1 plan / 80,475 ppl | recorded; the honest page is a class summary, a design question (yours, #5 below) |
| Marriott's two residual class rows (`CORPORATE BONDS`, `GOVT`) after v149 | 1 plan / 152,118 ppl | measured after #383 |
| coded rows the SEC index cannot name (non-ticker codes) | 930 rows / 228 plans / 224k ppl; 10 plans served from a 2023 fallback keep their codes | open, needs another source |
| (k) leading share-class fragments | 13 plans / ~4,700 ppl at ≥30% | Avi Systems (ESOP share-count wrap) and small residue |
| (f) C two-line issuer | 4 plans | queued |
| `isEmployer` matching the token "Wholesale"; window-fund ambiguity (AmEx, Jones Walker); Transcanada Trust bonds typed pooled | small, each recorded | queued |

## HELD, and why

- **fund-facts (ticker + expense ratio + YTD return)** — built; both
  retrieval routes remain closed (sandbox network policy; Yahoo 429s the
  runner). `data/fund-facts.json` is empty, honestly. Waiting on a source
  decision: (a) an API key as a repo secret, (b) allowlist
  `investor.vanguard.com` / `www.morningstar.com`, (c) both.
- **No parser agent is spawned** until you say so; tonight's twelve parser
  changes (v139–v150) were built inside the hourly loop, each gated and
  corpus-diffed, and the loop has not stopped since 23:3xZ.

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
dispatch the next gated version, the participant-weighted draw (three
draws tonight, 43 of 45 real menus; items (n), (o), (p) named), the
record. Next: #383's verdict → mirror → v150 → Marriott's residual class
rows, the coded residue.
