# wampo — 401(k) plan intelligence (project memory)

Better version of 401k.live. Static site (GitHub Pages) + GitHub Actions data
pipeline. Everything filed comes from DOL EFAST2 public data; nothing is
guessed — unstated fields show "not yet verified". Interpretation follows the
official Form 5500 instructions in `docs/form5500-instructions-2025.txt`
(uploaded by the owner as truth source).

## Architecture

- **Frontend**: `index.html` + `app.js` + `styles.css` + `data.js` (curated
  overlay) + `fund-er.js` (estimated expense-ratio pattern table). Vanilla JS,
  no build step. Pages should serve `main`.
- **Data pipeline** (`.github/workflows/build-data.yml`): 3-stage matrix —
  `prep` (build-data.mjs: download EFAST2 datasets, write plans-all.json +
  mtias.json, compute shard count) → `parse` (up to 12 parallel jobs,
  fetch-4i.mjs in PARSE_SHARD mode, each writes results-N.json delta) →
  `merge` (merge-4i.mjs assembles stores, commits). Full universe re-parse ≈
  5–6h. Weekly cron Mondays 06:00 UTC + push trigger on scripts/** (touch
  `scripts/.kick` to force a run). workflow_dispatch works from main.
- **Scripts**: `scripts/build-data.mjs` (dataset ingest), `scripts/lib-4i.mjs`
  (parser + feature extractor, exports PARSER_VERSION), `scripts/fetch-4i.mjs`
  (PDF fetch/parse loop), `scripts/merge-4i.mjs` (delta merge + index).

## Data files (all generated; never hand-edit)

- `plans-all.json` — whole universe, compact array-of-arrays with `fields`
  header. 95k+ rows: every 401(k)-type (code 2J) plan with ≥100 BOY
  participants, from F_5500 (full form) AND F_5500_SF (`sf` flag = short-form
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
  trusts) need sharesLast mode; section headers must not glue into names.
- **Itemized securities**: classified via section headers + 2R code +
  aggregate-SDBA presence into participant brokerage picks vs managed-account
  innards (`smaKind`). Employer-stock matching must skip generic tokens
  (inc/corp/…).
- **Master trusts**: plans link via Sch D; prefer trusts whose own filing
  parsed confidently. Some trusts (Deere pension trust) are form-only PDFs —
  honest gap.
- **Fiscal years**: `pyb` month ≠ 01 → display "Plan Year Nov 2023–Oct 2024
  (fiscal)"; a "2023" label can be the newest filing (Deere).
- **Features from audit notes** are quoted verbatim with regex extraction
  (match formula incl. tiers/dollar phrasing, vesting graded/cliff/immediate
  with employer-scope rules, Roth, after-tax, in-plan conversion → mega
  backdoor, auto-enroll %, auto-escalate, eligibility, loans, NEC%, safe
  harbor, true-up, brokerage brand). 2K = 401(m) (match AND/OR after-tax),
  not purely a match flag.
- **Bumping PARSER_VERSION re-parses everything overnight** — that is the
  intended, affordable path for parser changes. Weekly cron picks up new
  filings incrementally at the current version.
- Data-bot commits rebase before push; when force-moving branches, mirror
  `claude/wampo-401k-live-nx1t4o` → `main` (`git push --force-with-lease=main
  origin claude/wampo-401k-live-nx1t4o:main`). History was squashed once to
  drop >100MB blobs; don't reintroduce giant files.

## Testing pattern

Real filings, locally: S3 PDFs download in-sandbox; extract text with
pdfplumber (`layout=True` ≈ pdftotext -layout; poppler not installable in
sandbox — production uses pdftotext in Actions). Regression set used
throughout: TK Elevator (2025100809...343377001), Microsoft, Pfizer, Walmart,
Coca-Cola (master trust, correctly non-confident), Siemens Medical trust
(sharesLast). Frontend: python http.server + Playwright at
/opt/pw-browsers/chromium; verify TK page, tabs, filters, deep links
(#plan=EIN|PN|TICKER).

## Current state (2026-07-18)

- Universe 95,637 plans ($8.01T); all 62,377 parseable filings at parser v7+;
  ~44.7k confident lineups; ~50k with features; filters universe-wide via
  index bits. v9 run in flight (brokerage/managed split, full-text conversion
  scan, employer-token fix) — on landing, verify counts + Deere, mirror main.
- Owner to-dos: point GitHub Pages at `main`; custom domain.
- Roadmap ideas (not started): static SEO pages per plan/recordkeeper, fee
  percentiles vs peers, compare view, correction-form issue template, OCR for
  scanned filings, 403(b) expansion.
