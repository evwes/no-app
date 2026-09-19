# Morning brief — 2026-09-19 (written 02:0xZ / 10:0x PM ET; refreshed at the next verdict)

Live on main: **`3dde8717`, the v142 store**, Pages build #512 deployed it.
Since yesterday's brief: v139, v140, v141 and v142 shipped and are live;
**v143 is running as #380** (started 01:40Z, lands ~02:40Z); **v144 is
gated, committed and queued behind it**. Every version was verified against
its own prediction; every loss was read by row name before the mirror.

## What shipped and what it changed (numbers, not adjectives)

| version | what readers stopped seeing / started seeing | size |
|---|---|---|
| v139 | a 4i column caption glued onto a page's first holding (`maturity date American Funds EuroPacific…`) | 820 rows / 756 plans / 1.13M ppl lose the caption; 300 junk rows removed |
| v140 | Empower coded rows (`1VFIAX`) named from the filing's own LEGEND | 14,946 rows / 680 plans / 603,114 ppl renamed code → fund |
| v141 | kerned fonts (`Com m o n Co lle ctive Tru st`) no longer swallow a menu into one type-label row | Nelnet 6 → 30 rows; Hill Brothers' 86% merged row → 37 real rows; `fbo <person>` rows folded |
| display | kerned names rendered readably (`despaceKerned`) | 336 rows, +184 tickers, 0 lost |
| v142 | a KERNED caption or cover-page caption (`De scription Curre nt…`, `Em ploye r Ide ntification N um be r`) recognised with its spaces removed | 46 rows / 17 plans lose the prefix; Hill Brothers 38 → 60 rows; 18 EIN rows / 16 plans removed |
| v143 (running) | legend-less coded rows named from the SEC class index (`1FXAIX` → Fidelity 500 Index Fund); at a near-tie the readable region wins (Lulus 19 codes → 23 names; Fusion Medical's kerned copy → its clean statement) | 2,166 rows / 261 plans / 270,296 ppl; Children's Hospital Colorado 25 of 29 rows named |
| v144 (queued) | **the securities fold runs BEFORE the row cap, and untyped securities are recognised by name** — Boeing's 6,937 sleeve positions ($19.8B, 27% of the plan) become one row instead of filling the menu with 7,551 more "not shown" | 337 plans / 8.44M ppl carry a cut tail ($46.7B hidden); 65 plans / 1.51M ppl publish ≥30 untyped securities as menu rows |

Store (v142): confident lineups 60,107 (+0 / −0 across v139–v142, as
predicted each time); pv 142 at 99.85%; HIGH 4 (the baseline); overshoot
356 / 511,921 ppl; generic-names 128 (threshold 230); dominant-row 0;
`tkShare` 24.28%; download failures 104, every new one re-probed 403.

## Found and not yet fixed, by people affected

| item | size | status |
|---|---|---|
| (n) **NEW** a class SUBTOTAL beside its own itemisation (Marriott `COMMON STOCKS` $4.41B at 47.5% totals the 1,585 securities listed after it — the published sum double counts, honest ratio ~0.4 not 0.79) | Marriott 137,769 ppl; Peterson; unsized (needs a parse-time arithmetic check) | found in tonight's draw, queued |
| (f) B a trustee suffix or bare trustee row; C a two-line colon-less issuer (`[Company Vanguard Fiduciary Trust]`) | B 1,252 plans / 3.48M ppl (unseparated); C 6 plans | queued; A2 CLOSED (11 of 12 random names are filed verbatim — platform-branded sub-advised products, not a defect) |
| (k) a LEADING share-class / vehicle fragment as the whole row name (Energy Transfer `Trust` 78%) | 18 plans / 29,785 ppl at ≥30% | queued |
| (i) a holding published twice under two spellings (Apple, Printpack) | 262 / 450,981 | queued |
| window funds vs menu funds with no section evidence (AmEx 49 → 66 rows, Jones Walker 101 → 120 under v144) | 2 corpus plans, class unsized | recorded with v144; not fixable without section evidence |
| coded residue v143 cannot name (OCR `I` for `1`, non-fund codes `1KGPF`) | 967 rows / 236 plans / 242,029 ppl | recorded |
| `isEmployer` matches on `Wholesale` (Costco → BJ's Wholesale Club); `Transcanada Trust` bonds read as pooled | 2 rows | recorded with v144 |

**Tried and withdrawn tonight, with the control pinned:** a rule folding
every row under a brokerage HEADING swallowed U.S. Bancorp's whole $11.07B
Vanguard menu (its `Self-Directed Brokerage Account $214M` is a holding
line the section tracker took for a heading). Found by reading all 43
corpus moves one by one; the parser gate now pins U.S. Bancorp at 26 rows.

## Fully complete pages — as measured 2026-09-18, NOT re-derived tonight

59.0% of the 61,673 full-form live plans carried a menu, a recordkeeper, a
match answer and a vesting schedule (32.5% of the 111,782-plan universe).
What holds the rest back is match (11,767 missing only that) and vesting
(5,790), not the menu or the recordkeeper — both settled as NEW coverage,
not repairs, and the loop does not start them unasked.

## HELD, and why

- **fund-facts (ticker + expense ratio + YTD return)** — built; both
  retrieval routes remain closed (sandbox network policy; Yahoo 429s the
  runner). `data/fund-facts.json` is empty, honestly. Waiting on your
  choice of source: (a) an API key as a repo secret, (b) allowlist
  `investor.vanguard.com` / `www.morningstar.com`, (c) both.
- **No parser agent is spawned** until you say so; tonight's four versions
  were built inside the hourly loop itself, gate + corpus diff + traces
  each time, and the loop has not stopped since 23:3xZ.

## Waiting on you, ranked by people affected

1. **Match and vesting extraction as new coverage** (~13.5M + ~10M ppl).
2. **fund-facts source** — every plan page's fee and return cells.
3. **Recordkeeper source fix** (Schedule C line 1b / Schedule A carrier)
   — 2,241 plans / 2.0M ppl publish a wrong or missing name.
4. Whether to spawn the `wam` agent each cycle at the current usage tier.

## What continues alone

Hourly: reconcile, verdict any run, mirror, dispatch the next gated
version, the participant-weighted draw (tonight's 15 were 15 real menus
and named item (n)), the record. Next verdict: #380 (v143) — then v144
dispatches. The pipeline's own crons carry the data layer through any gap.
