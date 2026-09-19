# Morning brief — 2026-09-19 (written 10:3xZ / 6:3x AM ET; refreshed at the next verdict)

Live on main: **`8cd51309`, the v155 store** (Pages #518 deployed it at
10:33Z). Since the last brief: v148–v155 shipped and are live; **v156 is
running as #388** (dispatched 10:32Z). Fifteen parser versions since
23:3xZ last night, each gated, corpus-diffed, verified against its own
prediction, every lost lineup read by name. One structural change to the
pipeline this morning (below), and one cancelled cron run.

## What shipped and what it changed (numbers, not adjectives)

| version | what readers stopped seeing / started seeing | size |
|---|---|---|
| v144–v147 (live) | the securities fold before the row cap (Boeing's 6,950 positions as one row); duplicate renders once; wraps reassembled; ETF as a type phrase | hidden-tail class 337 → 240 plans; duplicates 522 → 110 rows |
| v148–v149 (live) | the doubled house stripped (`Vanguard Vanguard 500 Index`); class subtotals beside their itemisation removed — Marriott's real menu visible for the first time | 203 → 10 plans; Marriott 152,118 ppl, 31 → 49 rows |
| v150–v152 (live) | `^` marker stripped at line ends; employer-stock test on whole words; a dated coupon is a bond whatever noun it carries | 280 dated `Trust`/`Fund` notes leave menus for the fold (1.07M ppl) |
| v153 (live) | RECEIVABLES securitizations kept; class labels seen past `U.S.`/`&`; cover-page identifiers (`Sponsor ID #: 20-…`) are not $5M holdings | Marriott 37 rows at 0.980, no class line; 446 identifier rows / 362 plans gone |
| v154 (live) | an issuer cell ending in a type phrase names firm + vehicle; TIAA's statement label cleared | 16,915 → 197 rows |
| v155 (live) | a region that is mostly class labels is a statement; Form 5500 line references (`le 1f`, `2b(1)(D)`) are not holdings; render ties decided by readability, not document order | form-line lineups **75 → 0** (State Street, Deutsche Bank, Endeavor withdrawn); 35 junk lineups withdrawn; 775 lineups changed render |
| v156 (running) | the `(N)` footnote arm narrowed to Schedule H vocabulary (two real menus return); the tie-break measures abbreviation by vowel-bearing tokens, not length; `#` marker; Progressive's `of ` prefix | 627 rows / 108 plans / 317k ppl; ~272 renders flip back toward readable |

Live store (v155): confident **60,102** (−26 net vs v154: 33 junk
withdrawals, 9 gains, 2 over-reaches fixed in v156), lineups 59,750,
HIGH 4 + self-clearing `reparse-loss`, overshoot 353, `tkShare` 24.46,
download failures 104.

## What was found wrong today and where it stands

| item | size | status |
|---|---|---|
| render ties fell to document order, so junk rows coming or going flipped names | 187 lineups in #385, then 775 in #386 with a length-based tie-break choosing the abbreviated render half the time | v156: vowel-token share, no length |
| `(N) ` footnote read as a Schedule H line | Conditioned Air (267 ppl), Central City Concern (2,039), both 30+ real rows withdrawn in #386 | v156 |
| Terra Dotta (94 ppl, 15 real rows → `stmt`) on the OCR path | 1 plan | read with the v156 store |
| Cleveland-Cliffs: a 97% `Investments in Master Trust` row survives as a confident 13-row lineup | 5,188 ppl (+ class of 74 such rows) | queued: `isTrustPointerRow` vocabulary |
| `ds` stored as `absent`/`noattach` beside parsed rows | 84 plans (stored, not published) | fixed in fetch-4i, control on the next store |
| coded rows no legend names (`1ISM35I`) | 152 plans / 655 rows / 170k ppl | needs Empower's code list, outside EFAST2 |
| (o) NRECA's table of contents as holdings | 1 plan / 80,475 ppl | design question (yours, #5) |

## The pipeline change, and the cancel

Every mirror puts new code on main ahead of the store it will produce,
and main's hourly cron answered that with a full re-parse of its own:
#384 held all twenty runner slots for 3.5 hours; #387 then starved the
finished v155 run of its merge job for 77 minutes. **I cancelled #387 at
10:09Z.** Its merge still ran (by design, `if: always()`) and left main a
partial store (pv154 on 40,636 acks beside pv149 on 28,026) for about 20
minutes, until the complete v155 store mirrored over it at 10:32Z.
**Shipped:** scheduled runs are now incremental by construction
(`SCHEDULE_INCREMENTAL`): the cron ingests new filings and retries cheap
errors, and leaves version bumps to the dispatch that carries the
verdict. Control: the same store sizes 68,767 filings of work without
the flag and 106 with it. The 11:23Z cron is the first live test.

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
(or, as today, when main holds something worse), dispatch the next gated
version, the participant-weighted draw (five draws since last night, 73
of 75 real menus; every parser item today came from a draw or a verdict
read), the record. Next: #388's verdict → mirror → Cleveland-Cliffs'
pointer row → Terra Dotta.
