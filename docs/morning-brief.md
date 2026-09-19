# Morning brief — 2026-09-19 (refreshed 12:4xZ / 8:4x AM ET; first written 05:0xZ)

Live on main: **the v157 store** (mirrored 12:4xZ, Pages #521). Since
last night's brief: **v148 through v157 shipped and are live; v158 is
running** (dispatched 12:38Z). Seventeen parser versions since 23:3xZ,
each gated, corpus-diffed, verified against its own prediction, every
lost lineup read by name. One structural pipeline change, one cancelled
cron run, and a new reproduction method for the OCR path.

## What shipped and what it changed (numbers, not adjectives)

| version | what readers stopped seeing / started seeing | size |
|---|---|---|
| v144–v147 | the securities fold before the row cap (Boeing's 6,950 positions as one row); duplicate renders once; wraps reassembled; ETF as a type phrase | hidden-tail class 337 → 240 plans; duplicates 522 → 110 rows |
| v148–v149 | the doubled house stripped; class subtotals beside their itemisation removed — Marriott's real menu visible for the first time | 203 → 10 plans; Marriott 152,118 ppl, 31 → 49 rows |
| v150–v152 | `^` marker; employer-stock test on whole words; a dated coupon is a bond whatever noun it carries | 280 dated `Trust`/`Fund` notes leave menus for the fold (1.07M ppl) |
| v153 | RECEIVABLES securitizations kept; class labels seen past `U.S.`/`&`; cover-page identifiers are not $5M holdings | Marriott 37 rows at 0.980; 446 identifier rows / 362 plans gone |
| v154 | an issuer cell ending in a type phrase names firm + vehicle; TIAA's statement label cleared | 16,915 → 197 rows |
| v155 | a region that is mostly class labels is a statement; Form 5500 line references are not holdings; render ties decided by readability | form-line lineups **75 → 0** (State Street, Deutsche Bank, Endeavor); 35 junk lineups withdrawn |
| v156 | the `(N)` footnote arm narrowed; the tie-break measures abbreviation by vowel-bearing tokens (its length term had chosen the abbreviated render half the time); `#` marker; Progressive's `of ` prefix | 432 renders moved, **298 toward readable / 9 away**; 627 rows / 108 plans; State Street's real SSGA menu (21,533 ppl) |
| v157 | a master-trust pointer that is three quarters of the page is a pointer at any row count; `†` markers; `Employer I.D. #` | **Caterpillar (59,937 ppl)** and four more stop showing a "menu" that was one pointer row |
| v158 (running) | the caption-seeded retry runs for any unpublishable first pass (a dead heat between two junk regions no longer decides whether the real menu is looked for); a colon-less house+type group header is a header | Frx's 12 LifePath rows back; **ATH Holding / Elevance (94,689 ppl)** loses a $1.79B `The Vanguard Group` phantom that was two funds merged |

Live store (v157): confident **60,103**, lineups 59,751, HIGH 4 + 5
self-clearing, overshoot 346, `tkShare` 24.42, download failures 104.
Net since v143 last night: −19 confident, and every one of the losses
is a junk or pointer lineup read by name; the gains are real menus.

## Found today and where it stands

| item | size | status |
|---|---|---|
| ATH Holding's `The Vanguard Group` phantom (Explorer + Institutional 500 Index Trust merged under a colon-less header) | 94,689 ppl; bare house rows at ≥10% of a menu: 322 lineups / 472k ppl, share of this shape unknown until the run | v158 |
| OCR-path readings that moved between versions (Frx, Central City, Terra Dotta) | 3 plans / 2,334 ppl | reproduced locally through fetch-4i's real shard code in 20 s; Frx fixed in v158, the other two are OCR-cache drift, not regressions |
| `†`/`#` marker residue | 146 rows / 37 plans / 73,603 ppl | to read |
| Walmart `Investments Walmart Inc. Equity Securities`; Weyerhaeuser `through November 2039 …` glued onto a fund; Starbucks `[Target Date Funds Vanguard]` | 1 plan each (1.92M, 13,967, 307,988 ppl) | recorded, cosmetic |
| coded rows no legend names (`1ISM35I`) | 152 plans / 655 rows / 170k ppl | needs Empower's code list, outside EFAST2 |
| (o) NRECA's table of contents as holdings | 1 plan / 80,475 ppl | design question (yours, #5) |

## The pipeline change, and the cancel

Every mirror puts new code on main ahead of the store it will produce,
and main's hourly cron answered that with a full re-parse of its own:
#384 held all twenty runner slots for 3.5 hours; #387 then starved the
finished v155 run of its merge job for 77 minutes. **I cancelled #387 at
10:09Z**; its merge still committed a partial store to main for about 20
minutes until the complete v155 store mirrored over it. **Shipped:**
scheduled runs are incremental by construction (`SCHEDULE_INCREMENTAL`)
— the cron ingests new filings and retries cheap errors; version bumps
belong to the dispatch that carries the verdict. Control: 68,767
filings of work without the flag, 106 with it; **confirmed live on the
next cron (#389): one shard, two minutes.**

## HELD, and why

- **fund-facts (ticker + expense ratio + YTD return)** — built; both
  retrieval routes remain closed (sandbox network policy; Yahoo 429s the
  runner). `data/fund-facts.json` is empty, honestly. Waiting on a source
  decision: (a) an API key as a repo secret, (b) allowlist
  `investor.vanguard.com` / `www.morningstar.com`, (c) both.
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

Hourly: reconcile, verdict any run, mirror only when the verdict is clean
(or when main holds something worse), dispatch the next gated version,
the participant-weighted draw (six draws since last night, 88 of 90 real
menus; ATH, Progressive, Marriott, the TIAA label and the `^` marker all
came from draws), the record. Next: #391's verdict → mirror → the marker
residue → Walmart's and Weyerhaeuser's fragments.
