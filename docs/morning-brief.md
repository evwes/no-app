# Morning brief — 2026-09-19 (written 04:0xZ / 12:0x AM ET; refreshed at the next verdict)

Live on main: **`7d2349b1`, the v143 store** (Pages #513 deployed it).
Since the last brief: v139–v143 shipped and are live; **v144, v145 and
v146 ran together (#381) and are HELD OFF MAIN**; v147 is running (#382,
lands ~04:50Z); v148 is gated and queued behind it. Every version was
verified against its own prediction and every loss read by row name.

## What shipped and what it changed (numbers, not adjectives)

| version | what readers stopped seeing / started seeing | size |
|---|---|---|
| v139–v142 (live) | caption fragments glued onto first holdings; kerned-font type labels swallowing menus; kerned captions and cover-page captions | 820 + 46 rows; Hill Brothers 38 → 60 rows; Nelnet 6 → 30 |
| v143 (live) | legend-less Empower codes (`1FXAIX`) named from the SEC class index; at a near-tie the readable region wins | **2,224 rows / 271 plans / 286,418 ppl** renamed; Lulus 19 codes → 23 names; Fusion Medical kerned → clean |
| v144 (held) | the securities fold runs BEFORE the row cap, untyped securities recognised by name — Boeing's 6,950 sleeve positions are one row instead of 7,551 "not shown" | hidden-tail class **337 plans / $46.7B → 236 / $7.2B**; ≥15% tails 21 → 1; untyped-security floods 65 plans → 2 |
| v145 (held) | a schedule's two renders with wording drift count once (R&L Carriers' Morley fund); a statement word inside the SPONSOR's name no longer discards its rows (Energy Transfer's master-trust interest was a 78% holding named "Trust") | duplicates **522 → 109 rows**; Energy Transfer + Sunoco now trust pointers |
| v146 (held) | both 4i columns wrapping with the value on the second line (Rush Copley's $109M "Fund Institutional Shares" is three Vanguard funds again); footnote letters and `N/R` cells out of names | (k) ≥30% fragments 17 → 13; doubled house 238 → 202 plans (prediction was "near 0" — wrong, see v148) |
| v147 (running) | **repairs two defects v146 introduced**: "Exchange Traded Fund" is a type phrase (six ETF menus on one template collapsed to one row; ChowNow published it at 99.7% as confident); the footnote strip no longer fires on Form 5500 cover pages (Qvale); a house plus a product phrase composes ("Invesco Stable Value Fund", not "Invesco") | 7 lineups back; 121 bare-house rows / 102 plans fixed |
| v148 (queued) | the doubled house stripped in the store, the display's own expression | 202 plans / 760 rows |

Store as of #381 (branch): confident 60,092 (−15 vs v143; 7 of the
losses were mine and are fixed in v147, 2 designed, 6 honest refusals or
accepted costs — all small plans, ~4,500 ppl together); HIGH 20 (16
self-clearing `reparse-loss`); overshoot 365 (sums are now whole
schedules, not capped prefixes); aggRow 117 (the fold's class, predicted);
generic-names 128; dominant-row 0; download failures 104.

## Why main is held, and what unholds it

A version that loses lineups does not reach readers until each loss is
read and either fixed or justified. #381's losses are read (the record
names all 15). #382 (v147) must bring confident back to ≥60,100 and the
"name shortened to a bare house" count to ~0; then the branch mirrors and
v148 dispatches. Until then the live site shows the v143 store, which is
complete and audited.

## Found and not yet fixed, by people affected

| item | size | status |
|---|---|---|
| (n) a class SUBTOTAL beside its own itemisation (Marriott `COMMON STOCKS` $4.41B at 48% totals the securities listed after it; one master trust's 119-row region refused at 2.0x for the same reason) | 75 plans / 225,667 ppl (floor); Marriott 152,118 | queued — parse-time arithmetic, post-selection |
| (o) the schedule's table of contents as holdings (NRECA `Common collective trusts (pages 165-166)` 49%) | 1 plan / 80,475 ppl | recorded; the honest page is a class summary, a design question |
| (f) A1 doubled house | 202 plans / 375,590 ppl | v148 queued |
| (f) B trustee suffix / bare trustee row; C two-line issuer | 816 plans / 1.35M ppl (trustee-first, filed as is by 11 of 12 random reads); C 4 plans | B closed as not a defect; C queued |
| (k) leading share-class fragments | 13 plans / ~4,700 ppl at ≥30% | Avi Systems (ESOP share-count wrap) and small residue |
| bond-sleeve plans whose whole schedule folds to one row and fails the 3-row floor (Century Companies, Riverside, Jackson) | 3 plans / ~1,000 ppl | accepted; the old 50-row "menu" was a sleeve |
| coded rows the SEC index cannot name (non-ticker codes) | 930 rows / 228 plans / 224k ppl | open, needs another source |

## HELD, and why

- **fund-facts (ticker + expense ratio + YTD return)** — built; both
  retrieval routes remain closed (sandbox network policy; Yahoo 429s the
  runner). `data/fund-facts.json` is empty, honestly. Waiting on a source
  decision: (a) an API key as a repo secret, (b) allowlist
  `investor.vanguard.com` / `www.morningstar.com`, (c) both.
- **No parser agent is spawned** until you say so; tonight's ten parser
  changes (v139–v148) were built inside the hourly loop, each gated and
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
dispatch the next gated version, the participant-weighted draw (two draws
tonight: 28 of 30 real menus, items (n) and (o) named), the record. Next:
#382's verdict → mirror → v148 → (n).
