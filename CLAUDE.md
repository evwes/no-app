# wampo — 401(k) plan intelligence (project memory)

Better version of 401k.live. Static site (GitHub Pages) + GitHub Actions data
pipeline. Everything filed comes from DOL EFAST2 public data; nothing is
guessed — unstated fields show "not yet verified". Interpretation follows the
official Form 5500 instructions in `docs/form5500-instructions-2025.txt`
(uploaded by the owner as truth source).

## Architecture

- **Frontend**: `index.html` + `app.js` + `styles.css` + `data.js` (curated
  overlay — fund NAMES/TICKERS + community-sourced features only; synthetic
  returns/ERs were stripped 2026-07-18, never reintroduce fabricated numbers)
  + `fund-er.js` (estimated expense-ratio pattern table — the only ER source,
  always labeled "est."). Vanilla JS, no build step. Pages should serve
  `main`. The expanded report renders inside a `.detail-clamp` div
  (width:0/min-width:100%) so it can't widen the plans table — wide content
  must wrap or scroll internally.
- **Data pipeline** (`.github/workflows/build-data.yml`): 3-stage matrix —
  `prep` (build-data.mjs: download EFAST2 datasets, write plans-all.json +
  mtias.json, compute shard count) → `parse` (up to 12 parallel jobs,
  fetch-4i.mjs in PARSE_SHARD mode, each writes results-N.json delta) →
  `merge` (merge-4i.mjs re-applies deltas on the LATEST fetched branch state
  with a reset+retry loop — measured necessity: a plain rebase transplant
  conflicted on the single-line JSON stores and killed a finished v9 run).
  Full universe re-parse ≈ 1.5h wall (12-way matrix, ~50 min parse jobs,
  ~600ms/filing incl. politeness delay). Weekly cron Mondays 06:00 UTC +
  push trigger on scripts/** (touch `scripts/.kick` to force a run).
  workflow_dispatch works from main.
- **Scripts**: `scripts/build-data.mjs` (dataset ingest), `scripts/lib-4i.mjs`
  (parser + feature extractor, exports PARSER_VERSION), `scripts/fetch-4i.mjs`
  (PDF fetch/parse loop), `scripts/merge-4i.mjs` (delta merge + index),
  `scripts/audit-data.mjs` (post-merge sanity audit, runs in the merge job —
  cross-checks the identities filings state redundantly: participant counts,
  415(c)-bounded contribution averages, lineup sums vs Sch H, top holding vs
  plan assets. Every production bug so far violated one of these BEFORE a
  user noticed; check the merge-job log tail after each run and investigate
  HIGH findings).

## Data files (all generated; never hand-edit)

- `plans-all.json` — whole universe, compact array-of-arrays with `fields`
  header. 100k+ rows: every 401(k)-type (2J) AND ERISA 403(b) (2L/2M) plan with ≥100
  participants at EITHER end of the plan year (BOY-only once hid first-year
  spinoffs like GE Vernova: 0 BOY, 33k EOY), from F_5500 (full form) AND F_5500_SF (`sf` flag = short-form
  filer, no audited attachment → excluded from PDF parsing). Newest filing per
  EIN|PN wins across years [2025, 2024, 2023]. Includes 8a characteristic
  codes (`codes`), plan-year-begin month (`pyb`), participants-with-balances,
  Sch H fee breakdown, benefits paid, `mtiaAck` (linked master trust).
- `mtias.json` — master trusts (Sch D links → MTIA filings); their 4i is
  parsed so member plans show trust holdings.
- `lineups-status.json` — per-ack metadata {pv, c, s, f, e}. `pv` =
  PARSER_VERSION that produced it; work list = acks with pv ≠ current.
- `data/lineups/NN.json` (64 shards, hash = sum(c*31) % 64) — full entries
  (funds, sma detail, features with source quotes). Fetched per-plan on demand.
- `lineups-index.json` — boot-time bitmask per ack: 1 lineup, 2 brokerage,
  4 features, 8 mega backdoor, 16 immediate vesting, 32 after-tax, 64 Roth.
  Regenerate anytime with `node scripts/merge-4i.mjs` (no deltas needed).

## Hard-won invariants / gotchas

- **Never one big JSON**: lineups.json hit GitHub's 100MB limit and died.
  Status + shards only.
- **TOP_N counts FULL-FORM rows**, not table rows — SF filers interleave in
  the assets sort and once silently dropped 11.5k plans from the queue.
- **PDF source**: `https://efast2-filings-public.s3.amazonaws.com/prd/YYYY/MM/DD/{ACK}.pdf`
  (date from ACK prefix). Reachable from the CCR sandbox (DOL website is NOT).
  One composite PDF per filing; ~9k filings render form pages only (no audit
  attachment) — verified: no public attachment endpoint exists, documented
  limitation in methodology.
- **4i layout traps** (all handled in lib-4i, keep regression cases green):
  leading `*` = party-in-interest (not footnote); "(thousands)" scaling only
  when region says so; multi-page heading clusters merged; description column
  usually holds the fund name; "Current Value | Shares Par" layouts (Siemens
  trusts) need sharesLast mode; "COST | MARKET VALUE | UNREALIZED GAIN/LOSS"
  layouts (Verizon Master Savings Trust) need gainLast mode or every value
  is the GAIN column; trustee statements file a class-level summary page +
  thousands of per-security detail pages — summary candidates (≥80% class-
  stem rows) get a score bonus and gain-last security floods a penalty so
  the honest summary wins; section headers must not glue into names.
- **Itemized securities**: classified via section headers + 2R code +
  aggregate-SDBA presence into participant brokerage picks vs managed-account
  innards (`smaKind`). Employer-stock matching must skip generic tokens
  (inc/corp/…).
- **Master trusts**: plans link via Sch D; prefer trusts whose own filing
  parsed confidently. Some trusts (Deere pension trust) are form-only PDFs —
  honest gap.
- **Fiscal years**: `pyb` month ≠ 01 → display "Plan Year Nov 2023–Oct 2024
  (fiscal)"; a "2023" label can be the newest filing (Deere). `pye` is set
  only for IRREGULAR years (short first/final years, e.g. GE Vernova
  Apr–Dec 2024) → "(short year)" label instead of the fiscal rule.
- **Features from audit notes** are quoted verbatim with regex extraction
  (match formula incl. tiers/dollar phrasing, vesting graded/cliff/immediate
  with employer-scope rules, Roth, after-tax, in-plan conversion → mega
  backdoor, auto-enroll %, auto-escalate, eligibility, loans, NEC%, safe
  harbor, true-up, brokerage brand, named investment menu — "Fund Name —
  description" paragraphs under an Investment Options heading, ≥3 names
  required; frontend shows the menu only when no lineup exists, labeled
  "per-option balances aren't public"). 2K = 401(m) (match AND/OR after-tax),
  not purely a match flag.
- **Bumping PARSER_VERSION re-parses everything overnight** — that is the
  intended, affordable path for parser changes. Weekly cron picks up new
  filings incrementally at the current version.
- **OCR fallback (v12)**: ~half of "no-section" filings are SCANNED auditor
  attachments; many others use broken font encodings (cipher-looking text).
  fetch-4i rasterizes the unreadable pages (pdftoppm 200dpi, ≤40 pages,
  ONE page per invocation — a damaged Type-3-glyph page crashes pdftoppm
  and range-mode silently lost every later page in the range) and
  tesseract-OCRs them 4-wide, then re-parses combined text. Download
  failures preserve the previous parse (merge: ack absent from
  delta.entries = keep stored entry; null = remove) — S3 403s are
  withdrawn-from-bucket filings, retried each run via stale pv. `ov` in status =
  OCR_VERSION attempted; work list re-adds no-section acks when OCR_VERSION
  moves. NOTE: OCR text is not cached — every PARSER_VERSION bump re-OCRs
  ~12k filings (~4h at 20 shards); prep shard formula sizes for
  max(work/5500, ocr/600) cap 20. Entries carry ocr:1 and the source string
  discloses OCR. Trailing "**" (>5% marker) after values is stripped in
  parseRows — that alone recovered most OCR rows.
- Data-bot commits rebase before push; when force-moving branches, mirror
  `claude/wampo-401k-live-nx1t4o` → `main` (`git push --force-with-lease=main
  origin claude/wampo-401k-live-nx1t4o:main`). CAUTION: the weekly cron runs
  on the DEFAULT branch only and commits data to main directly — before any
  mirror, `git fetch origin main` and check `git log origin/main --not
  origin/claude/...` for data-bot commits; rebase them into the branch first
  or the mirror discards a week of fresh filings. Push triggers fire on the
  dev branch only (main would double-run the identical parse); concurrency
  cancels an in-flight run when a newer push supersedes it — never push to
  scripts/** or the workflow file while a run you want to keep is in flight. History was squashed once to
  drop >100MB blobs; don't reintroduce giant files.

## Operating protocol (hard-learned)

- **ACCURACY IS THE FIRST PRINCIPLE (owner directive, 2026-07-25).** Every
  accuracy defect gets a permanent entry in `docs/accuracy-log.md`: what was
  wrong → the change → the prevention. Never delete entries. Every parser
  cycle must include hands-on filing review — sample the worst
  coverage/correctness class, compare extraction to the filing text, feed
  fixes back as patterns + regression specimens + log entries. This loop
  never stops.

- **Verify starts, not just finishes**: after ANY push meant to trigger a
  run, confirm within a minute that the run actually exists (list runs via
  API/MCP). A dropped webhook once went unnoticed for two days because
  monitoring only watched for the data commit. Never tell the owner
  "lands tonight" until the run is observed in_progress.
- Runner OOM (Jul 24): parse jobs need NODE_OPTIONS=--max-old-space-size,
  results flush every 250 filings, artifacts upload if: always() — crashed
  shards hand progress to the merge; retries converge.
- Repo must stay PUBLIC — private-repo Actions quota dies in one re-parse
  (~45 runner-hours). Changing visibility unpublishes GitHub Pages
  (re-enable in Settings → Pages, serve main).
- **Curated overlay never beats filed data** (flipped 2026-07-24):
  provider/match/vesting/tax flags prefer extraction; curated only fills
  gaps. data.js predates the pipeline and goes stale.
- **Smoke test** (site-test.yml → scripts/smoke-test.mjs) runs on every
  frontend push: boots the site, opens full-form/master-trust/short-form
  specimens picked from live data, fails on undefined/NaN leaks or missing
  explanation rows. Run locally before pushing frontend changes.
- **Correctness check** in audit-data.mjs: every displayed formula's numbers
  must appear in its own quote (Jul-24 baseline: 252/43,488 = 0.58%
  mismatches, mostly quotes truncated before the formula — fixed by
  windowing sentence() around the match; expect near-zero after v18).

## Testing pattern

Real filings, locally: S3 PDFs download in-sandbox. poppler-utils AND
tesseract-ocr install fine in the sandbox after `apt-get update` — use real
`pdftotext -layout` (matches production) rather than pdfplumber approximation. Regression set used
throughout: TK Elevator (2025100809...343377001), Microsoft, Pfizer, Walmart,
Black Hills (match "equal to N%...up to M%", after-tax enumeration), Kohler
(3-tier match, vesting TABLE, statement-row junk + master-trust unblock),
Coca-Cola (master trust, correctly non-confident), Siemens Medical trust
(sharesLast), Northrop Grumman (2026061611...907005 — match as column TABLE
"First 2%...100 %", cliff phrased "upon completion of three years",
after-tax as BASIS enumeration, eligibility %-window guard; its DC master
trust ...907002 is form-only, and the VEBA trust is a different entity —
don't confuse them). Frontend: python http.server + Playwright at
/opt/pw-browsers/chromium; verify TK page, tabs, filters, deep links
(#plan=EIN|PN|TICKER).

## Current state (2026-07-21)

- Universe 104,393 plans (incl. ERISA 403(b)s); 68,042 parseable filings
  at parser v35 + OCR v2; 53.2k confident lineups, 60.3k with features.
  v34/v35 (2026-08-03): repeated-page dedup (schedules render twice per
  filing!), EIN-heading + dotted-leader junk rows, statement-page penalty
  — net +817 confident lineups; statement fragments no longer displace
  real menus. Known residuals: 2 cipher-text junk-confident filings
  (S@CUrities class), a handful of legit dotted-leader menus losing rows
  (one confident Vanguard menu 17→12 — v36 candidate: strip leaders
  instead of dropping when the de-leadered name isn't form vocabulary).
  GitHub cron note: Monday 06:00 runs fire HOURS late (Jul 27 fired
  10:02) — don't diagnose a dropped schedule before ~noon UTC. Trust links
  898 (193 via EIN fallback); Elevance has NO MTIA filing in EFAST2 at all
  (checked 2023-25) — unlinkable, honest gap. Recordkeeper = platform-brand
  priority over top-fee line (NG shows Fidelity not Strategic Advisors,
  Kohler inherits Voya via trust); ITEM2 carries PROVIDER_OTHER_SRVC_CODES
  natively (col 15) — no separate codes table needed. Filters
  universe-wide via index bits. Mega-backdoor CHIP matches afterTax OR mega bits (~5.8k plans);
  strict documented-conversion count is ~200 — auditors rarely write the
  conversion step down.
- **Schedule R line 21b ingested (2026-08-02)**: plans-all `shr` field —
  D design-based safe harbor (incl. QACA), A ADP-tested (affirmative
  not-safe-harbor), N n/a. Dataset columns: PEN_401K_DESIGN_BASED_SAFE_IND
  + PRIOR/CURRENT_YEAR_ADP_IND (+ NA col 53). Universe: 22.7k D / 36.2k A /
  5.1k N; blanks = SF filers (no Sch R) + 3.5k full-form. 1,396 plans have
  notes-safe-harbor + Sch R ADP — legitimate disaggregation, display says
  so. Index bits added: 128 stated formula, 256 discretionary, 512
  affirmatively-none/frozen, 1024 notes-safe-harbor → match-type filter
  select in toolbar. Brokerage is three-state: 2R/SDBA yes; own confident
  lineup + no SDBA + no 2R → "None indicated" (trust lineups never infer).
- Owner to-dos: point GitHub Pages at `main`; custom domain.
- **EDGAR 11-K research (2026-08-03, specimens in hand)**: SEC blocks
  requests whose User-Agent contains parens/URLs — the plain documented
  "name email" UA works from GitHub Actions (all four hosts 200; do NOT
  enrich the UA string in scripts/fetch-11k.mjs). Sandbox cannot reach SEC
  or the Actions artifact blob host — the retrieval loop is: dispatch
  edgar-11k.yml → workflow pushes files to the throwaway `edgar-scratch`
  branch → git fetch. KEY FINDING: master-trust plans' 11-Ks are as opaque
  as their DOL filings — Verizon Management's FY2025 11-K schedule shows
  ONLY participant loans, and its Master Trust note discloses general
  types only. Lockheed moved into a trust too (FY2025 11-K loans-only,
  contradicting the prototype's FY2024 test). The "11-K unlocks
  master-trust menus" premise is FALSE. Remaining value: (1) freshness —
  Chevron-class non-trust public plans file real FY2025 fund schedules a
  YEAR before EFAST2 has them; (2) rescue for public plans whose EFAST2
  attachment is scanned/unreadable; (3) cross-validation. Specimens:
  Chevron = clean CIT menu + BrokerageLink + separate-account bond flood;
  Microsoft 16MB SDBA flood; J&J/Verizon/Lockheed = trust-opaque
  must-reject controls. Query ladder needs "&"→"and" variants (two
  Verizon sisters got 0 hits). Acceptance gate when built: schedule total
  within 0.5-2.0x Sch H assets, thousands-aware.
- Roadmap ideas (not started): static SEO pages per plan/recordkeeper, fee
  percentiles vs peers, compare view, correction-form issue template, OCR for
  scanned filings, (403(b) expansion shipped 2026-07-18; governmental/church 403(b)s exempt from filing — absent by law, note when asked).
