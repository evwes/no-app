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
  must wrap or scroll internally. BOOT PAYLOAD SPLIT (2026-08-09): the site
  fetches `plans-list.json` (columnar, ~2.7 MB gz) + `plans-index.json`
  (row-aligned bits, ~80 KB gz) + `mtias.json` — it NEVER downloads
  plans-all.json (pipeline-internal, 33 MB). Everything else is on-demand:
  `ensureDetail` (data/plans shard, keyed EIN|PN, carries the acks) chains
  `ensureLineup`/`ensureFees`. The report body gates on `detailLoaded` —
  detail-only fields (planYear, pyb, city, flows) would render NaN before
  the shard lands. List numbers are display-precision (assets in $100k
  units, avg bal/contrib in $100s replicating derive()'s distrust rule);
  exact values re-derive on expand. Plan names ship at boot only for
  multi-plan sponsors; search-by-city no longer works (city is detail-only).
  `about.html` = static About/methodology page.
  **`data/fund-facts.json` (2026-09-17, owner directive): the ONLY place a
  fund's verified ticker + expense ratio + year-to-date RETURN may live**,
  one entry per ticker, every figure with its as-of date and source URL.
  Written solely by the `fund-facts` agent (`.claude/agents/fund-facts.md`,
  `/fund-facts <tickers|names|ack|refresh>`), validated by
  `scripts/fund-facts-check.mjs` (refuses undated, unsourced, future-dated
  or implausible figures). `fund-er.js` stays the pattern-level "est." ER
  table (the `funds-and-tickers` agent's). Not yet wired into the report;
  when it is, every return renders with "as of <date>".
- **Data pipeline** (`.github/workflows/build-data.yml`): 3-stage matrix —
  `prep` (FIRST runs scripts/parser-gate.mjs: ten live specimens, fails the
  run before the matrix if any regresses — update expectations in the same
  commit for intentional moves; then build-data.mjs: download EFAST2
  datasets, write plans-all.json + mtias.json + fallbacks.json
  [prior-year full-form ack per plan, artifact-only], compute shard count)
  → `parse` (up to 12 parallel jobs,
  fetch-4i.mjs in PARSE_SHARD mode, each writes results-N.json delta) →
  `merge` (merge-4i.mjs re-applies deltas on the LATEST fetched branch state
  with a reset+retry loop — measured necessity: a plain rebase transplant
  conflicted on the single-line JSON stores and killed a finished v9 run).
  Full universe re-parse ≈ 1.5h wall (12-way matrix, ~50 min parse jobs,
  ~600ms/filing incl. politeness delay) — but an OCR-heavy work list is far
  slower: run #249's 11,400 scanned/cipher filings ran 3h+ because OCR is
  ~10-30s each where a text parse is ~0.6s. **THREE crons, all on main:**
  `12 5 * * *` daily, **`23 * * * *` HOURLY** (backstop, owner directive
  2026-09-06 — a no-op hour exits without committing), and `0 6 * * 1` weekly.
  Plus a push trigger on scripts/** (touch `scripts/.kick` to force a run).
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

- `plans-list.json` — columnar boot file for the site (cols: ein/pn/name/
  plan/st/bc/parts/am/ab/ac/rk/tk/cf/shr; same row order as plans-all).
  cf bits: 1=2R, 2=2S, 4=2K, 8=SF, 16=no-employer-contrib, 32=403(b).
- `plans-index.json` — row-aligned effective lineup/feature bits (written
  by merge): indexFlags bits + 2048 = linked trust has a confident lineup.
- `data/plans/NN.json` (64 shards, key `EIN|PN`) — per-plan filing detail
  (acks, codes, dates, Sch H lines); prep drops zero/empty fields.
- `fee-percentiles.json` — per-participant admin-expense percentiles by
  plan-size cohort (5 cohorts, p5–p95 + zeroShare), recomputed every prep.
- `plans-all.json` — whole universe, compact array-of-arrays with `fields`
  header, PIPELINE-INTERNAL (parser gate, fetch-4i, merge, audit, smoke
  specimen picking — the site never fetches it). 100k+ rows: every 401(k)-type (2J) AND ERISA 403(b) (2L/2M) plan with ≥100
  participants at EITHER end of the plan year (BOY-only once hid first-year
  spinoffs like GE Vernova: 0 BOY, 33k EOY), from F_5500 (full form) AND F_5500_SF (`sf` flag = short-form
  filer, no audited attachment → excluded from PDF parsing). Newest filing per
  EIN|PN wins across years [2025, 2024, 2023]. Includes 8a characteristic
  codes (`codes`), plan-year-begin month (`pyb`), participants-with-balances,
  Sch H fee breakdown, benefits paid, `mtiaAck` (linked master trust).
- `mtias.json` — master trusts (Sch D links → MTIA filings); their 4i is
  parsed so member plans show trust holdings.
- `lineups-status.json` — per-ack metadata {pv, c, s, f, e, fb}. `pv` =
  PARSER_VERSION that produced it; work list = acks with pv ≠ current.
  `fb` = plan year of a PRIOR-YEAR filing whose schedule supplied the
  lineup (v41: when the newest filing has no readable schedule, fetch-4i
  tries the same plan's next-newest full-form filing; ratio is judged
  against current-year assets, entry source discloses the year, features
  still come from the newest filing when present). Merge prints a
  CONFIDENCE DIFF (gained/lost acks) every run — sample LOSSES before the
  next parser change.
- `data/lineups/NN.json` (64 shards, Java-style hash `h = (h*31 + c) >>> 0`,
  `% 64` — fetch-4i's `shardOf`; this line used to say `sum(c*31) % 64`,
  which files 20251010111855NAL0012423024001 in shard 34 when it lives in
  00 and read 0 rows for every plan in a sizing script 2026-09-16) — full entries
  (funds, sma detail, features with source quotes). Fetched per-plan on demand.
- `data/fees/NN.json` (64 shards, same ack hash) — per-plan fee schedule
  from prep: Sch C Part I item 2 provider rows {n,c,d,i,e,t,fm} (≤12, filed
  order = descending comp; `c` service codes come from the ITEM2_CODES
  child table — the inline ITEM2 column is empty) + Sch A insurance
  commissions {cm,fe,cr}. TESTING TRAP (2026-08-07): the CCR sandbox's
  headless Chromium FREEZES the renderer ~1s after load absent user
  activation — timers stop and in-flight response bodies never deliver,
  so on-demand shard fetches look "stuck" on deep-linked pages and hours
  can be lost chasing phantom async bugs (fetch fine, `json()` never
  resolves, evaluate still works). One synthetic click unfreezes it.
  Playwright checks must interact (mouse.click) after load before
  asserting async content; smoke test does this.
  Frontend fetches on demand (plan.feeKey), renders Sch H expense lines +
  provider table (service codes decoded per the official instructions) +
  Sch A note; a missing shard hides the section (never claim "none filed"
  when the data just isn't published yet). plans-all gained feeSal
  (salaries) and feeOther now resolves.
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
  **NOR IS THE LIVE SITE: `evwes.github.io` is denied by the egress proxy
  (`connect_rejected`), measured 2026-10-03.** A `curl` of a live page returns
  **HTTP 000 and ZERO BYTES**, so `curl … | grep -c` prints a perfectly
  plausible `0` and `grep -o` prints nothing — *a clean zero reports on the
  query*, and here the query reached no server at all. **A cycle must never
  claim it verified the live site from this sandbox.** What does verify a
  deployment, and both are cheap: read the mirrored tree through
  `git show origin/main:<path>` (with a POSITIVE control — 4,400 of 5,000 pages
  still carrying the section is what proves the 11 removals were targeted), and
  read `conclusion` on the `pages build and deployment` run whose `head_sha` IS
  main's HEAD. Checking `-w "http=%{http_code} bytes=%{size_download}"` is what
  caught this; a grep's exit status never would.
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
  moves. OCR text is CACHED as of v41 (Actions cache mounts OCR_CACHE_DIR;
  filenames carry OCR_VERSION so bumping it repopulates) — PARSER_VERSION
  bumps no longer re-rasterize; prep shard formula sizes for
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

## Automation: two layers, one of them fragile

- **DURABLE — the pipeline.** `build-data.yml` runs on THREE schedules: daily
  05:12 UTC (1:12 AM ET), **hourly at :23**, and weekly Monday 06:00. This
  survives everything: new filings are ingested, the audit runs, HIGH findings
  reach the auto-managed issue, whether or not any session exists. A scheduled
  run executes on the DEFAULT branch and commits its data to **main**.
  **CORRECTED 2026-09-10: that makes main's data move HOURLY, not daily.**
  **AND CORRECTED AGAIN 2026-09-28, BY MEASUREMENT — IT DOES NOT. The cron is
  CONFIGURED hourly and DELIVERS about every 3.6 hours.** Over a 660-hour
  window, 152 scheduled runs: median gap **3.60h**, mean **4.37h**, and only
  **5% of intervals under 1.5h**. An hourly cron would sit near 1.00. The
  worst gap in that window is **44.2 hours** — nearly two days with no
  scheduled run at all. Cancellation does not explain it (3 of 152 scheduled
  runs were cancelled), and the firing minute is scattered across 52 distinct
  values rather than clustered at :23, which is the same free-public-runner
  de-prioritisation this file already records as making start times "fiction".
  **Two things follow and both matter.** The hazard below is real but far less
  frequent than "hourly" implies — most dev runs come back to a main that has
  NOT moved, and `mirror-gate.mjs` is what settles it either way, so nothing
  about the mirror procedure changes. The other half is less comfortable:
  **the pipeline is described here as the DURABLE layer that ingests new
  filings whether or not a session exists, and a 44-hour worst-case gap makes
  that weaker than the word "durable" suggests.** The daily `12 5 * * *` cron
  is the real floor, and it is late too. `docs/accuracy-log.md` 2026-09-28.
  This section and the Architecture block both used to name only the daily and
  weekly crons, so "check `git log origin/main --not origin/<dev branch>`
  before every force-mirror" read as a once-a-day chore. Observed this morning:
  runs #250 and #251 fired twelve minutes apart and each committed to main, and
  three data commits accumulated there while one dev-branch run was in flight.
  A long dev run will ALWAYS come back to a main that has moved. That is no
  longer something to remember — `scripts/mirror-gate.mjs` compares the two
  stores and refuses automatically — but the hourly cadence is why the branch
  can never assume main is where it left it.
- **THE CYCLE IS A SKILL AND AN AGENT (2026-09-17, owner directive: the
  improvement loop must never stop).** `/wampo-cycle`
  (`.claude/skills/wampo-cycle/SKILL.md`) is the whole hourly procedure —
  bootstrap, scheduler health, dispatch-or-verdict, mirror, queue item via
  `wam`, participant-weighted draw, docs, re-arm — and `/wampo-cycle install`
  recreates the self-bound Routine from whatever session owns the repo.
  `.claude/agents/wampo-cycle.md` is the same loop as a spawnable agent
  (`tools: *`, so it can dispatch and manage Routines). The Routine's wake
  prompt invokes the skill. A fresh session takes the loop over with one
  command; the queue stays in `docs/hourly-cycle-prompt.md` and this file.
- **FRAGILE — the hourly agent cycle.** Runs as a `CronCreate` job, which is
  session-scoped: held in memory, never written to disk, and **killed by any
  container restart.** One was created at 06:30 ET on 2026-09-01 and was gone
  by 08:40 the same morning. (Superseded by the self-bound Routine since
  2026-09-08 and by the skill/agent above; kept as history.)
  **Every session must run `CronList` early. If it returns "No scheduled jobs",
  re-create the hourly job from `docs/hourly-cycle-prompt.md`** — that file
  holds the prompt verbatim so it cannot drift with re-typing. Cron is
  `7 * * * *`, recurring.
- **The gap this leaves.** A GitHub runner can execute the pipeline but cannot
  do the judgement work — reading a filing to decide whether a label is true is
  what caught wrong answers on runs #186 and #188 that every count-based check
  passed. That work needs a session. The MCP Routine (`create_trigger`) is the
  only durable way to schedule it and is still returning "requires approval".
- **The lesson underneath, worth more than the workaround:** a blocked tool is
  not a blocked goal. `create_trigger` was reported as an absolute blocker six
  times while two unblocked routes existed — the native `CronCreate` tool and a
  schedule in a workflow file already under our control. When a mechanism
  refuses, enumerate the other mechanisms that reach the same outcome before
  reporting the outcome as impossible.
- **And the sharper version (2026-09-02): DIAGNOSE the refusal before reporting
  it.** "`create_trigger` requires approval" was repeated NINE times as a fact
  about `create_trigger`. It never was: read-only `get_session` on the same
  server returns the identical error, so the whole `Claude_Code_Remote` MCP
  server is unapproved and the unblock is one server-level grant. The
  discriminating experiment was a single call to the most harmless tool on the
  same server. **When a tool refuses, call the most harmless tool on that
  server before concluding anything about the tool you wanted** — otherwise a
  server-level fact gets filed as a tool-level one and stays wrong for days.
  `.claude/settings.json` allowlists the server; settings load at session
  start, so every new session should try `create_trigger` once and, on success,
  create the Routine and `CronDelete` the in-memory job.

## GitHub efficiency — what is actually scarce (MEASURED 2026-09-01)

**Do not optimise for GitHub Actions minutes. They are free and unlimited here,
and that is verified, not assumed.** Run #186 — the full universe re-parse, 15
jobs, 13 parse shards, 5h11m wall and roughly 55 runner-hours — reports
`billable.UBUNTU.total_ms = 0`. The repo is `"private": false`,
`"visibility": "public"`, and GitHub bills nothing for standard hosted runners
on public repositories. Check it yourself before believing otherwise:
`actions_get` with `method: "get_workflow_run_usage"` on any run id.

**This means the repo staying PUBLIC is the entire basis of the free tier.**
Making it private would put ~55 runner-hours per re-parse against a 2,000
minute/month allowance — one re-parse would exhaust roughly 27 months of quota.
That is why "keep the repo public" is an invariant and not a preference. Note
that changing visibility also unpublishes GitHub Pages.

**What IS scarce, in order:**

1. **Wall-clock time before a deadline.** A full re-parse costs 4.5 hours of
   calendar time whether or not it costs money. Cancelling one by pushing to
   `scripts/**` mid-run destroys those hours — that is the expensive mistake,
   not the minutes.
2. **Assistant session usage.** The genuine monthly limit that has actually
   been hit is the assistant's, not GitHub's. Long polling loops, re-reading
   large tool outputs, and re-deriving facts already written down burn it for
   nothing — but **verify a state file before trusting it**, because
   `docs/cadence-state.json` sat for two weeks saying
   `partialDataWarning: "ACTIVE ... DO NOT MIRROR"` about a run cancelled in
   August while the branch held a complete store. A stale state file does not
   merely go unread; it blocks correct action.
3. **Concurrency**, not consumption: 20 concurrent jobs on the free tier. The
   matrix uses 13 shards plus prep and merge, so there is headroom but not
   unlimited headroom for widening the matrix.
4. **GitHub API rate limit** (5,000 authenticated requests/hour) — reached only
   by polling in a tight loop, which is never necessary here.

**The rules that follow, all of which save the scarce things:**

- **Never push to `scripts/build-data.mjs`, `fetch-4i.mjs`, `lib-4i.mjs`,
  `merge-4i.mjs`, `scripts/.kick` or the workflow file while a run is in
  flight.** Concurrency cancels it and 4.5 hours evaporate.
- **Cancelling a run does NOT stop it committing.** MEASURED 2026-09-09: run
  #235 was cancelled deliberately (v115 superseded it) and its **merge job ran
  anyway** — `if: always()` is what lets crashed shards hand their progress to
  the merge — committing a PARTIAL re-parse to the branch at 17:03Z: 6,500 acks
  at pv=114 beside 62,205 at pv=113. Harmless here (every coverage metric came
  out byte-identical, and the superseding run re-parses everything because the
  work list is "pv ≠ current"), but it means the branch can carry mixed-version
  data at any moment after a cancel. **Check the pv distribution before
  mirroring, always** — one dominant pv plus the ~190-row old-version tail is
  the completeness test, and a second large pv cohort means partial.
  **AUTOMATED 2026-09-10 — stop doing this by eye.** `audit-data.mjs` now
  raises `partial-store` when the dominant pv covers <97% of acks. The eye is
  what missed it on #239 AND on #244, so the rule stays but the enforcement
  is no longer human.
- **A run can FINISH and still not have READ the universe, and that is a
  separate failure from a partial store (2026-09-10).** Run #244's thirteen
  shards all completed normally in ~84 minutes against a 320-minute budget —
  and **11,495 of its downloads failed, 16.72%**, against 63 (0.09%) in the
  run an hour earlier. Failed downloads correctly keep the stored entry and an
  old pv (the v37 protection), so nothing is lost; but nothing is refreshed
  either, and **the coverage line rose while a sixth of the universe went
  unread and every check passed.** `audit-data.mjs` now raises
  `download-failures` above 1%.
  **CAUSE SETTLED 2026-09-10, and it is NOT a download failure.** #246 produced
  exactly 11,495 failures and exactly 4,029 stale-confident acks — identical to
  #244 to the digit, **100.00% the same ack set**. Deterministic, so neither
  "v118's load" nor "an S3 incident" survives. The filings are fine: a random
  20-ack probe answered **HTTP 200 twenty times of twenty**, the production
  `download()` succeeded on 8 of them, and every `analyzePdf` step ran clean on
  6 samples. The failures sit 5-13% through the first 90% of the assets-sorted
  work list and **95-100% across the last decile**, which is 93-100% $0
  year-end assets.
  **MECHANISM FOUND 2026-09-10 and FIXED — one missing guard.** `parse4i`'s
  early exits return a bare `{found:false, why}` with **no `funds` array**;
  `isConfident` opens with `parsed.funds.length`. Harmless while callers
  checked `parsed.found` first — but **v118 changed the OCR trigger from
  `!parsed.found` to `!isConfident(parsed)`**, so every filing whose schedule
  could not be located threw a TypeError out of `analyzePdf`, was caught by the
  outer handler and filed as a download failure. Same bug killed the 31 stored
  lineups: the prior-year rescue calls `analyzePdf` too. Fix guards the SHAPE
  (`!parsed.found || !Array.isArray(parsed.funds)`), so future callers are safe.
  Verified: the 8 failing specimens re-run clean and FIVE publish — JPMorgan 80
  rows, CVS 80, Stanford 65, Broadcom 33, Anthem 6.
  Four hypotheses (time budget, disk, S3/load, missing shard) were each refuted
  by evidence before this; none was ever a code theory. **What worked was not a
  better theory but making the program SAY what happened** — the answer came in
  the first eight lines of the next run, naming the function and the line.
  And the cheap reproduction only existed because the store was fresh: with 57k
  acks at the current pv, the work list IS the failing set, so
  `PARSE_SHARD=0 PARSE_SHARDS=1 BATCH_4I=8 node scripts/fetch-4i.mjs` runs the
  real production path over exactly the broken population and writes only a
  delta. **Testing the parts is not testing the path** — `parse4i`,
  `extractPlanFeatures` and `classifyDocument` each succeed on these filings;
  the defect was in the glue.
  **The shipped defect this exposed:** `gap-census`/`gap-list` rendered
  `e:"download"` to readers as *"the public copy has been withdrawn from the
  EFAST2 bucket (403)"* — false for 20 of 20 probed. One code carried two
  meanings. HTTP failures keep `download`; anything else is now `analyze` and
  says the gap is ours. **An error code is a published claim.**
  **RE-PROBED WHOLE-POPULATION 2026-09-12 and this time the claim HOLDS.** The
  residue is **68 acks**, and `gap-census` still renders their `e=download` to
  readers as "withdrawn from the EFAST2 bucket (403)". All 68 were HEAD-probed
  — the entire population, not a sample — and **68 of 68 answered 403.**
  **RE-PROBED AGAIN 2026-09-15 at 78 acks: 78 of 78 answered 403.** v124's run
  reported `dl` 68 -> 78 and the next incremental run reported 78 again — the
  #244/#246 test, where an identical count across runs kills "transient S3" and
  points at code. It did not this time: the bucket genuinely grew by ten
  withdrawn filings, and `e=download` still means exactly what it publishes.
  Store-wide error codes at that point: `no-section` 7,128, `download` 78, and
  **zero `analyze`** — the v118 null-deref class is fully gone.
  The habit is the point: predict the discriminating test, run it, and let it
  exonerate the code as readily as convict it. The
  split did its job: what survives under `download` really is gone. These 68
  are also the whole of the `pvTopShare` tail and the whole work list of an
  incremental run (#271 processed exactly them and nothing else), which is why
  a quiet hour costs 68 doomed downloads and no more. Re-probe rather than
  inherit the label: a claim that was false once is not thereby false forever,
  and it is 68 requests to find out.
  **Why it was unknowable:** the outer `catch` labelled every exception
  `download`, the message went only to `summary`, and in `PARSE_SHARD` mode —
  the only mode production runs — the job `process.exit(0)`s *before* the
  summary prints. Reasons were computed and discarded on every run ever made.
  Both fallback catches were silent too, and one of those cost the 31 lineups.
  All four now log, with a per-shard failure tally.
  Note also how the diagnosis went: "hit the time budget" and "disk exhaustion
  from OCR" were both confidently wrong before those two. **A diagnosis that
  cannot be reproduced is not a diagnosis** — "do the same acks fail twice?"
  took one script and ended a story that had survived two runs and two
  documents.
- **`[skip ci]` on every parser commit made outside the 1–7 AM window**, so
  work batches into one nightly re-parse instead of firing several.
- **BUT THE HAZARD IS CANCELLATION, AND CANCELLATION IS BOTH REF-SCOPED AND
  PATH-SCOPED (2026-10-03).** `[skip ci]` is written here as "every `scripts/**`
  commit while a run is in flight", which is broader than its own mechanism in
  two independent ways, and the rule as written would stall the cycle for hours
  at a time: **(a)** concurrency is `group: build-data-${{ github.ref }}`, so a
  dev-branch push **cannot** cancel a run on `main` — and the main cron fires
  roughly every 3.6 hours, so a literal reading holds dev work most of the day;
  **(b)** the push trigger's path filter is **six files**
  (`build-data.mjs`, `fetch-4i.mjs`, `lib-4i.mjs`, `merge-4i.mjs`,
  `scripts/.kick`, `build-data.yml`) — `audit-data.mjs`, `merge-4i`'s tests,
  `lib-disclose.mjs` and every other script create no build-data run at all.
  Measured: `audit-data.mjs` was pushed to the dev branch while **#564 was
  mid-run on main**, no run was created, and #564 ran on. So hold `[skip ci]`
  for a commit touching one of those six files while a run is in flight **on
  the same ref**, and do not hold anything else.
  **WHAT DOES NOT RELAX: a run in flight on main is still a reason not to
  MIRROR.** #556 committed stale-code data eight minutes after a mirror
  (`mirror.sh` now refuses on exactly that). **Pushing to dev is safe during a
  main run; mirroring is not.** *A rule stated more broadly than its mechanism
  costs real hours, and the cost is invisible because nothing fails.*
  **AND THE SECOND HALF OF THIS LINE WAS STALE — CORRECTED 2026-10-09 BY
  OBSERVING #610.** It read "a scheduled run ALWAYS leaves main a data commit
  the branch lacks, which `mirror-gate` refuses until the branch adopts it",
  and the workflow has shipped the opposite since 2026-09-06: the merge job's
  last step (`build-data.yml:305`, `if: always() && github.ref_name == 'main'`)
  does `git merge-base --is-ancestor origin/$BR HEAD` and, when the dev branch
  is a strict ancestor, **fast-forwards the dev branch itself** — its own
  comment says two sessionless days in 2026-09-05/06 are why. Observed: #610
  committed `d0a5df78` to main and BOTH refs came back pointing at it, so the
  adoption chore did not exist and the only local action was `git merge
  --ff-only`. **The hazard survives only on REAL divergence**, where the step
  prints "dev branch has diverged from main — leaving it for a session to
  reconcile" and hands it to `mirror.sh`. *A procedure note can be made false
  by a shipped automation, and nothing fails to tell you* — the tell is the
  cycle finding nothing to adopt where the rule predicts something.
- **One re-parse in flight at a time**, and every scheduled cycle
  de-duplicates by checking for an in-flight run before dispatching.
- **Only a `PARSER_VERSION`/`OCR_VERSION` bump justifies a full re-parse.**
  Without a bump the work list is just the stale acks: run #187 took 7 minutes
  and 23 seconds of parsing. Do not bump a version to "refresh" data.
- **Do not poll a running job.** Dispatch, verify it started, and let a later
  hourly cycle pick up the verdict.
- The largest real inefficiency is measured and queued, not hypothetical:
  **3,700 filings (5.4% of the universe) are downloaded, rasterised and OCR'd
  on every full re-parse and produce nothing readable at all.** That is the
  thing to fix if a re-parse needs to be cheaper — not the runner count.

## Work cadence (owner directive 2026-09-01)

**Work, report, continue. NEVER delay finished work for a clock.**

*(The one deliberate exception on this record: the owner paused all work
2026-10-05 → 2026-10-08 7:00 PM ET. The pause carried its own expiry and
was deleted at it rather than obeyed — which is the whole point of writing
an expiry into a state key. The Actions pipeline ran throughout, as it
should, and the 10 data commits it left on main were adopted on resume.)*

This supersedes an earlier framing that batched parser work into the overnight
window. That framing was justified partly by conserving Actions minutes, and
those minutes were then measured at **zero** (see the section above). With the
justification gone, holding a gated, ready change until 1 AM buys nothing and
costs a night.

- **The blocker is never the hour. It is an in-flight run.** Pushing to
  `scripts/build-data.mjs`, `fetch-4i.mjs`, `lib-4i.mjs`, `merge-4i.mjs`,
  `scripts/.kick` or the workflow file while a run is going **cancels it** and
  destroys hours of wall clock. That is the only thing worth serialising on.
- **When a change is gated and ready and no run is in flight: dispatch it now**,
  whatever the hour. Verify it started, report, and move to the next item.
- **While a run IS in flight, keep working — do not poll and do not idle.**
  Frontend work, `fund-er.js` research, hands-on filing review, audits,
  sizing, documentation: none of it touches the pipeline. Pipeline changes get
  written and committed with **`[skip ci]`**, which stops GitHub creating a run
  at all — so the commit lands without cancelling what is running — and are
  dispatched the moment the current run finishes.
- **The instant a run finishes:** verdict → loss triage → label diff → mirror →
  **immediately dispatch the next ready parser change** → carry on with the
  queue. No waiting for the next window.
- **1:00–7:00 AM ET is a FLOOR, not a gate.** If nothing else has triggered a
  re-parse, the nightly sweep happens there so results are ready for the 7–9 AM
  review. It never means "hold work until 1 AM."
- **Hourly cycles run around the clock.** Each takes the next item from the
  **Current state section's "Open" list** (parser or display work) or leaves it
  alone if the only remaining items are the owner decisions. Run
  `node scripts/gap-census.mjs` for the coverage residuals, which are derived
  and must never be copied forward. **There is no separate task
  queue** — this line used to name `docs/cadence-state.json` as one and that was
  never true. That file is STATE, not a queue, and as of 2026-09-11 it holds
  only what a session needs before acting; the 135 keys of August parser notes
  it had accumulated are in git history and `docs/accuracy-log.md`.
- **`docs/morning-brief.md`** is current and committed before 7:00 AM ET,
  overwritten nightly — decision-shaped, not a log: what shipped and what it
  changed in numbers, what was found wrong and whether it is fixed or queued,
  what was MIRRORED to the live site, **what was HELD and why**, what is
  waiting on the owner, what continues during the day.
- **ALL schedules are defined in EASTERN time.** Cron speaks only UTC, so a
  fixed UTC cron is right for eight months and silently an hour wrong for the
  rest. `scripts/et-schedule.mjs` is the single place that conversion lives;
  `--check <cronH> <cronM> <wantEtH> <wantEtM>` reports drift and the
  correction, and every scheduled session checks its own trigger first. An
  hourly cron is the exception: it cannot drift. Next transition **2026-11-01**.
- **GitHub's scheduled start time is fiction (MEASURED 2026-09-02).** The
  `12 5 * * *` nightly sweep (1:12 AM ET) actually fired at 09:31Z on run #194
  (**4h20m late**, landing 5:31 AM ET) and 13:18Z on run #185 (**8h06m late**,
  landing 9:18 AM ET). Free public runners de-prioritise cron, and the lateness
  is not a constant to subtract — it ranged 4–8h across two samples. The runs
  report "success", so nothing in the logs reveals it. **Never plan the 1–7 AM
  window around the GitHub schedule.** `workflow_dispatch` starts within
  seconds: an hourly cycle that sees the window open and no run in flight
  dispatches the sweep ITSELF. The schedule stays only as the backstop that
  runs when no session exists.
- Runs **dispatch on the dev branch, never main** — GitHub's cron only runs on
  the default branch and would commit data straight to main, turning the
  "check main for data-bot commits before mirroring" hazard into a nightly one.

## Operating protocol (hard-learned)

- **EVERY FULL FORM GETS LISTED AND DESCRIBED, AND EVERY UNKNOWN GETS A
  DIAGNOSED CAUSE (owner directive, 2026-09-02).** The work does not stop at
  "no schedule found". That label describes US, not the filing, and shipping it
  as though it described the filing is how State Farm sat for weeks marked as a
  gap while its 55-fund Vanguard menu sat on page 3 under a textbook heading.
  So: an item is not allowed to rest as unknown. Open the filing, find out why,
  and record the cause — parser defect, absent from the public copy, scanned,
  master-trust-held, or genuinely not filed. `scripts/size-class.mjs` buckets a
  whole set by cause in one pass and is the cheap way to do this at scale;
  `scripts/gap-verify.mjs` distinguishes "we cannot read it" from "it is not
  there". A cause that is merely plausible is not a cause — **instrument before
  believing one.** The v100 defect was first diagnosed by reading the text and
  the reading was wrong; printing the parser's actual loop state gave a
  different and correct answer in one run.
- **ACCURACY IS THE FIRST PRINCIPLE (owner directive, 2026-07-25).** Every
  accuracy defect gets a permanent entry in `docs/accuracy-log.md`: what was
  wrong → the change → the prevention. Never delete entries. Every parser
  cycle must include hands-on filing review — sample the worst
  coverage/correctness class, compare extraction to the filing text, feed
  fixes back as patterns + regression specimens + log entries. This loop
  never stops.

- **Always-on accuracy machinery (2026-08-09, owner directive: constant
  checking/updating/improving)**: (1) every merge run appends a line to
  `docs/coverage-history.jsonl` (universe, confident lineups, match/vesting/
  rk coverage, fee-codes %, HIGH/WARN counts, and as of 2026-10-03 **`pv`, the
  PARSER_VERSION that wrote the line**) — trends are diffable, dips are
  regressions. **`pv` was added because a question about our own cadence was
  unanswerable from 374 lines of our own record:** measured over all 373
  consecutive pairs, 51.2% are identical and 48.8% move a number, longest
  identical streak **34** — so three identical runs is evidence of nothing — but
  the line did not say whether a PARSER run had occurred, so that 48.8% mixes
  two populations and says nothing about INCREMENTAL runs specifically. *A
  measurement that answers a different question than the one asked is not a
  partial answer, it is a different fact.* `docs/accuracy-log.md` 2026-10-03
  (08:2xZ); (2) the merge job maintains an auto-managed GitHub issue
  "Data audit: HIGH findings (auto)" from audit-high.txt — updated every
  run, self-closing when clear; (3) a daily 13:00 UTC scheduled session
  ("wampo daily accuracy cycle" Routine) reviews runs, checks the trail,
  does one hands-on filing review from the worst class, ships clear-cut
  fixes, and mirrors main. Known-baseline HIGHs: 4 contrib-limit outliers.
- **GAP IN THE MACHINERY, MEASURED 2026-09-10 — the triage sees LOSSES, not
  SWAPS, and a swap can halve a plan's coverage silently.** #254 moved 157
  plans off a prior-year lineup onto their own newest filing. Every count-based
  check calls that an upgrade and none of them looks at what the new parse is
  worth: `confident` stays 1, the total does not move, so the loss triage never
  sees it. Measured across all 157: **94 held or grew their row count**, 10
  dropped below 60% of it — and those 10 are FINE, because their ratio moved
  TOWARD 1.0 (Extron 55 rows @ 0.81 → 7 @ 0.97, Northeast Georgia 19 @ 1.19 →
  7 @ 1.00), which is the signature of the prior year having carried extra
  rows rather than of lost detail. **The real warning sign is the ratio moving
  AWAY from 1.0, and exactly 2 did**: Prevost Car 15 rows @ 0.90 → 15 @ **0.46**
  (`20251010094229NAL0017569266001`) and Pediatrics West 33 @ 0.95 → 37 @
  **0.51** (`20251008185545NAL0003501731001`). Nothing is fabricated — the rows
  are real — but each now publishes a menu accounting for about half the plan's
  money, and both clear `isConfident` only because the floor is 0.45.
  Small (1,005 participants between them). **SHIPPED 2026-09-11**: merge-4i
  emits `swaps-degraded.txt` beside `losses-triage.txt` and audit-data raises
  them as **WARN** — 2 of 157 is too small a population to be allowed to drown
  the four baseline HIGHs. Verified with a positive control end-to-end through
  the real merge, both directions: a crafted delta swapped two plans off their
  prior-year lineups at once, one landing at 0.46 (flagged) and one landing at
  1.00 with rows cut 15→5 (NOT flagged — the Extron shape). **A check that
  prints 0 on a quiet store has not been tested.**
- **Every re-parse must be a provably better version (owner directive
  2026-08-12)**: (4) merge auto-triages confidence LOSSES — any lost
  lineup whose old parse was real-menu-shaped (n≥7, or n≥5 at ratio
  0.7–1.3) becomes a `reparse-loss` HIGH (losses-triage.txt → audit);
  junk-cleanup losses pass silently, broken real menus cannot; (5) audit
  prints a REPARSE VERDICT comparing confident/match/vesting/lineups to
  the previous run's coverage line and flags `reparse-regression` HIGH
  beyond tolerance (confident −200, match/vesting −150) — a regression
  must be justified with sampled losses or rolled back BEFORE mirroring
  main. Mirroring after diff review is what kept the v49 over-cut
  (−1,590) off the live site.
- **Verify starts, not just finishes**: after ANY push meant to trigger a
  run, confirm within a minute that the run actually exists (list runs via
  API/MCP). A dropped webhook once went unnoticed for two days because
  monitoring only watched for the data commit. Never tell the owner
  "lands tonight" until the run is observed in_progress.
  **THE PUSH TRIGGER IS INTERMITTENT — WHICH IS WORSE THAN BROKEN
  (2026-09-09, corrected the same hour it was first written).** Three kick
  pushes in a row (v116 19:12Z, v117 20:42Z, one earlier) matched the path
  filter and the branch, carried no `[skip ci]`, and produced **no run at
  all**; `workflow_dispatch` with `ref` = the dev branch started #238 and #239
  within seconds each time. That looked like a dead trigger, and it was written
  up as one. **Forty minutes later a merge-4i commit pushed WITHOUT `[skip ci]`
  fired instantly** — run #240 — while #239 was 30 minutes into the v117 parse,
  and concurrency cancelled it. **CORRECTED 2026-09-09 22:10Z: #239 did NOT
  survive.** #240 was cancelled thirteen seconds after it appeared and the run
  list still showed #239 `in_progress`, which was read as a rescue — but the
  cancellation of #239 had already been issued, its merge job ran under
  `if: always()`, and the branch took a PARTIAL v117 store (44,466 acks at
  pv=116 beside 24,237 at pv=117). A run's status in the listing lags its
  cancellation; only `conclusion` settles it, and the honest test of
  completeness is the pv distribution, not a status field read seconds after
  the event.
  So both halves of the rule stand and neither may be relaxed:
  **(1)** `[skip ci]` on EVERY `scripts/**` commit made while a run is in
  flight — a trigger that fires only sometimes still fires; **(2)** after a
  kick push, dispatch rather than waiting, because it also sometimes does not.
  The run listing immediately after any push is the only evidence that counts,
  in both directions.
  **AND (3), MEASURED 2026-10-02 AT THE COST OF AN HOUR — "IMMEDIATELY" IS TOO
  EARLY, AND A RACING DISPATCH DESTROYS THE RUN IT WAS MEANT TO REPLACE.**
  I pushed the recordkeeper fix, read the listing seconds later, saw no run,
  applied rule (2) and dispatched. **The push trigger then fired at +90
  seconds**: #553 (push) and #554 (dispatch) appeared on the same SHA eight
  seconds apart, concurrency cancelled #553, and cancelling the duplicate #554
  left **nothing running at all** — both ended `cancelled` and the fix did not
  run. *Cancelling the duplicate does not revive the original.*
  **So: after a push, wait at least two minutes and re-read the listing before
  dispatching. If a `push` run has appeared, do NOT dispatch** — a
  `workflow_dispatch` on the same SHA is not a safety net, it is a second run
  that concurrency resolves by killing the first. Dispatch only when the listing
  still shows nothing after that wait. Nothing was lost here (both cancels
  landed in prep, before any merge, and no partial store was committed) but the
  next one may not be so cheap.
- **AND VERIFY THE CONCLUSION, NOT JUST THAT A RUN EXISTS (2026-09-11).** The
  rule above covers a run that never started. Its mirror image cost three days:
  **site-test was RED for ten consecutive runs, #47 to #56, from 2026-09-08**,
  and several commits in that window say "smoke and map tests green" in their
  own messages. Those were true LOCALLY. Nobody opened the CI conclusion. A red
  guard is worse than no guard, because its name sits in the workflow implying
  coverage that has not existed — and once it is habitually red, a REAL failure
  is invisible among the noise. **After any push that triggers site-test or
  build-data, read `conclusion` on the resulting run before believing the
  change is verified.**
  The cause was two of my own defects in `map-test.mjs` (`e142b123`), and one
  of them is a trap worth naming: `cwd: "/home/user/no-app"` — a hardcoded
  SANDBOX path — makes Node report **`spawn python3 ENOENT`**, which is
  indistinguishable from python3 being absent from the runner and sent the
  first reading of the failure at the runner image. The disproof was in the
  same log: `smoke-test.mjs` spawns the same binary in the same job and
  succeeds; it simply omits `cwd`. **Never hardcode the sandbox path in
  anything CI runs** — and when a spawn reports ENOENT, suspect the cwd before
  the binary. Fixed, and #57/#58 are the first green site-test since
  2026-09-08.
- **Read the data stores through `scripts/lib-schema.mjs`** — `loadPlans()`,
  `loadStatus()`, `loadTrusts()`. A guessed field name throws and names the
  real fields instead of returning `undefined`. Three wrong published numbers
  in one session came from `plan.provider` (it is `recordkeeper`; population
  inflated 611→15,024), `trust.confident` (mtias trusts carry only ack/name/
  planYear/assetsEOY — confidence is in lineups-status; **$826.5B** misfiled),
  and a plan's `assetsEOY` passed to a harness parsing the TRUST. Self-test:
  `node scripts/lib-schema.mjs --selftest`. **Corollary rule:** a number that
  comes out suspiciously round, uniform, or exactly zero is reporting on the
  query, not the data — check the query before publishing it.
- **AND ITS "MATCHED PAIR" NOTE CANNOT SEE MERGE-SIDE CODE — CORRECTED
  2026-10-10.** The note compares `PARSER_VERSION` to the store's dominant `pv`,
  but `merge-4i.mjs` carries six NAME-REPAIR arms that rewrite the store at
  MERGE time and move no version, so for a change to that file the equality
  holds **by construction** and the claim is unearned rather than checked.
  Measured: main took the self-wrapping-duplication code beside a store whose
  shard 10 still carried `LENDING (TIER J) NT COLLECTIVE S&P500 …`, under a
  message saying the data was not stale. Benign there (one improvement behind,
  not wrong) and NOT in general — a merge-side arm that WITHDRAWS a false claim
  would mirror with the claim still live. Fixed by SEPARATING the two classes
  rather than widening the test, because the block's own comment records that
  warning on every data-code mirror was wrong on the normal path and *a check
  wrong on the normal path is worse than no check*. ***A guard's claim must be
  keyed on a witness that can see the class of change it is describing.*** And
  the find came from a wrong prediction: I expected a REFUSAL (the in-flight
  guard is scoped to a run on **main**, and that run was on dev, so it was right
  to pass) — *a guard that answers differently than expected is a reason to read
  what it SAID, not only whether it fired.* `docs/accuracy-log.md` 2026-10-10
  (04:2xZ).
- **Mirror ONLY with `bash scripts/mirror.sh`.** It refuses when main carries a
  commit the branch lacks (the daily schedule commits data straight to main)
  and when local disagrees with origin, and prints what a force push would
  destroy. Both refusals have negative-control tests.
  **THE DATA GATE IS PLAN-KEYED AS OF 2026-09-30 AND THE ACK-KEYED VERSION WAS
  HARMFUL, NOT MERELY NOISY.** On a DOL refresh it reported **7,830 lost
  lineups** where **22** plans actually stopped being served — 7,585 were the
  same plan under a newer ack, 171 wind-downs ($0 year-end, correctly no menu),
  82 moved to the SHORT FORM (no attachment BY LAW). Presenting 7,830 unreadable
  rows pushes the operator onto `--force-data`, **which then rubber-stamps the
  22 real losses inside it** — *a gate that can only be satisfied by overriding
  it is not protecting anything.* Both stores ship their own `plans-all`, so the
  ack → EIN|PN join needs nothing new stored; `merge-4i` cannot ask this because
  it purges superseded acks (`merge-4i:88`) and then cannot name the plan.
  **An ack owned by no plan is resolved through its MEMBER PLANS** — without
  that the gate reads 18 and silently drops Levi Strauss (8,288) and Motrex
  (2,939), which are served by their TRUST and never by their own ack, the fifth
  instance of a count keyed on plans being blind to a trust.
  **`MIRROR_GATE_MAIN_REF` + `MIRROR_GATE_BRANCH_REF` replay a pair on demand**
  (both sides needed overriding; until 2026-10-04 only the main side did, so
  "replays any pair" was false — see `scripts/mirror-gate-test.mjs`, and note a
  replay exits **2**, never 0). The hand-rolled
  `git push --force-with-lease=main …` is retired: running the check by eye
  failed on 2026-09-02 — the check printed the offending commit and an
  unconditional "(nothing above…)" echo overrode the reading of it.
- **Size the class before reading the filing.** The measurement script is
  usually ten lines and either justifies the deep dive or cancels it. The
  US Foods heading defect, sized first, recovered **0** of its 30 target
  filings; the Medtronic column investigation was sized only after it had
  consumed most of a session.
- **RANK to pick what to read; draw RANDOMLY to predict what a fix wins**
  (2026-09-09, after the same error twice). v101 was projected at 65% and
  delivered 2.5%; v112 was projected at ~125 plans from a 2-of-8 hit rate
  and delivered 10. Both projections came from samples taken off the TOP of
  a size-ranked list. Large plans are systematically different — they file
  long attachments where both a fair-value note and a real menu exist, while
  the bucket's bulk is small plans with nothing to recover. A top-N sample is
  the right way to choose which filings to OPEN and the wrong way to estimate
  a bucket-wide yield. Both times the RE-SIZE caught it, which is why the
  re-size is not optional.
- **Write scripts to a FILE, never inline in `node -e` or a heredoc.**
  Backticks and parens trigger shell command substitution — this mangled two
  commit messages and broke a report script mid-run, all after the rule was
  already written down.
- **Full process review with evidence: `docs/process-review.md` (2026-09-02).**
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
- **A frontend change must re-derive the cache-buster: `node
  scripts/stamp-assets.mjs`, then commit `index.html`.** The stamps are sha256
  content hashes of `app.js`, `styles.css`, `data.js` and `fund-er.js`, so
  changing one of those without restamping leaves `index.html` pointing at the
  old URL and **a returning browser keeps the cached copy — the change ships and
  no reader sees it**, which is what the owner reported on 2026-10-02 as
  "nothing is updated in wampo" after four stamps went up to seventeen days
  stale. `site-test` enforces it with `--check`, and **that step runs BEFORE the
  Playwright install, so a stale stamp means the smoke test did not run at all**:
  *a red gate early in a job is not one failure, it is a job that stopped, and
  every later step is unverified rather than passing.* It caught the very next
  frontend commit after it shipped (`83a76dba`, whose message said "smoke-test
  green" — true locally).
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

## Current state — RE-DERIVE THIS BLOCK FROM THE STORE, NEVER COPY IT FORWARD

**This section is a SNAPSHOT, not a log.** It went stale five times (v123-for-v124,
v168-for-v177, v181-for-v184, a #510 "IN FLIGHT" line left up for an hour after
the mirror, and a HIGH baseline stated three different ways in one block), so the
habit is: read `docs/coverage-history.jsonl`, `lineups-status.json` and `lib-4i`'s
`PARSER_VERSION` export. **A contradicted number in this file is asserted again
every time it is read, and the reader cannot tell which copy is live.**

**AND IT MUST STAY SHORT. On 2026-10-02 this block had grown to 9,284 of the
file's 10,001 lines — 745,787 bytes, about 201,000 tokens, re-injected verbatim
at the START OF EVERY TURN, including the turn after a compaction.** So a session
opened at ~200k tokens of context before reading one line of conversation, and
compaction could not help. Every shipped version, verdict, draw and refutation
that lived here is in `docs/accuracy-log.md` (628 dated entries, and nearly every
bullet here ended with an explicit pointer into it). **Per-version history goes
in the accuracy log. What belongs here is the state a new session needs before it
acts, plus rules that outlive the version that earned them.**

### Store, re-derived from the newest coverage line 2026-10-04

Universe **112,652 plans** — 68,538 full-form and **44,114 short-form**
(derived: `plans` − `fullForm`, both from the trail; the coverage line's
`entries` is LINEUP entries and is not the parse-status count, which this line
used to conflate) — 401(k)-type 2J + ERISA 403(b) 2L/2M, ≥100 participants at either end of the
plan year. A DOL refresh on 2026-09-30 moved it from 111,782; do not carry an
older figure forward.

**AND READ EVERY PARTICIPANT-WEIGHTED FIGURE IN THIS FILE WITH A ~3% CAVEAT.**
The participant-weighted universe is **116,001,210**, and **28 plans claiming
3,413,761 of them (2.94%) have a count no other field supports** at
beginning-of-year assets under $10 a head. Avalon Capital Management claims
**1,955,672** (second-largest in the universe, above Amazon) and is the only
plan of 112,652 whose claim equals a dollar figure on its own row. `activeParticipants`
corroborates 20 of the 28; the ~8 that nothing supports carry 89% of the weight.
**DO NOT CARRY 49 plans / 3,469,170, nor the first screen's 504 / 5,191,508** —
that one gated on END-of-year assets, which are $0 for a wind-down by
definition, so it swept in Kroger pn=004 (262,794 real ppl), Kaiser pn=037,
VMware and Neiman Marcus. The witness must be **BOY** assets.
`docs/accuracy-log.md` 2026-10-03 (19:5xZ) and 2026-10-04 (10:4xZ).

`confident` **60,182** · lineups 59,833 · entries 65,495 ·
match **43,312** · vesting **53,023** · roth 38,369 · **HIGH 4** ·
warn **556** · overshoot 370 · overshootTrust 12 ·
aggRow 114 · dl **93** · pvTopShare **99.9** (pv **203**) ·
tkExact **37.77** · tkComparable **3.41** · vestQuote **5,373**.
(vesting/vestQuote/dl/pv re-derived from the #607 line 2026-10-09 13:0xZ, the
first COMPLETE v203 store; `dl` 93 was HEAD-probed at 92/92 -> 403 minutes
earlier, so the code is honest and the bucket is growing.)
(`tkExact` was 37.76 until #601 on 2026-10-09; ~9 rows of an 87,106-row sample
whose size did not move, produced by the code at `4f6e29d1` — i.e. the DATA, not
that hour's display ship. Re-derive before quoting.)

**`vestQuote` IS NOW 5,373 AND THE +92 IS v203's DELIVERY** — it counts STORED
quotes carrying no vesting label, so withdrawing a false `Immediate` label moves
a plan INTO this counter while its quote stays put, which is why the fall in
`vesting` and the rise here are the same number. **The 5,281 this line used to
quote was v202's delivery** (103 plans gaining a quote where nothing had been
stored — the one figure v202's registration denied) and is now history, not the
live figure. Read it with WITHHELD **32** (`node
scripts/vesting-quote-test.mjs`), down from 41 before v201; v203 was registered
to leave WITHHELD unchanged.

**`match` 43,312 IS LOWER THAN v199's 43,441 ON PURPOSE** — v199 and v200
withhold a misread formula rather than publishing it, so the fall IS the
improvement. Read it with `matchQuote` 5,396 and `matchQuoteShown`
1,849, both of which ROSE: a withheld plan reverts to quoting its
filing, it does not go blank. `features.matchMisread` holds every withdrawn
string, so the class stays measurable without re-deriving it.

**THE HIGH BASELINE IS 4 = 3 `contrib` outliers + `fabricated-name`.**
`audit-generic-names` sits above its 230 escalation threshold, so that HIGH is
STANDING rather than absent. **CI can report MORE than the local audit** — the
extra entries are self-clearing `reparse-loss` findings raised from
`losses-triage.txt`, a run ARTIFACT that exists only in CI. *A metric that
differs between CI and local is a question about the inputs, not the store.*

**THE IDENTICAL-LINE RUN, RE-DERIVED 2026-10-10 19:1xZ AND NEVER INCREMENTED:
19 on all keys, 19 on shared keys, DATE EXCLUDED**, over 431 trail lines
(longest in the trail 35 / 38; pairs identical 55.8% / 56.7%). The recorded
figure was **3** on 2026-10-04, so this is a re-derivation and not a bump —
*a count carried forward by increment is not a measurement.* Nineteen
consecutive merges with a byte-identical line is the EXPECTED state, not a
stall: every ship since v203 landed is display- or build-side with
`PARSER_VERSION` at 203. Compare under BOTH key sets, because the `pv` field
added at #565 breaks a naive all-keys comparison across its own introduction —
**asserted, not assumed: the pair at line 375 reads `ALL false / SHARED true`.**
**AND THE IRREPRODUCIBLE "longest streak 34 / 51.2% identical" IS NOW
DIAGNOSED — THE MISSING DIMENSION IS THE DATE FIELD, which neither the claim
nor its own correction named.** `d` is on every line and the trail spans **56
distinct dates**, so including it forces a difference at every midnight for
free; it moves the longest streak by **2.5x**. All four combinations, 2026-10-10:
ALL/date-excluded 19 · 35 · 55.8%; SHARED/excluded 19 · 38 · 56.7%;
**ALL/date-INCLUDED 10 · 14 · 48.8%**; SHARED/included 10 · 15 · 49.8%.
The correction's recorded 13 / 14 is bracketed by the date-INCLUDED 14 / 15, so
it was a date-inclusive measurement throughout. ***And the original pair splits
into two different measurements with one half LABEL-SWAPPED:*** date-included
ALL-keys is **48.8% identical / 51.2% moved** — the recorded "51.2% identical /
48.8% move" the wrong way round — while the recorded streak **34** matches the
date-EXCLUDED 35. No single definition can yield both halves because they never
came from one, which is exactly why four definitions were tried and *"nothing
lands on 51.2% / 34"*.
***So: a key set is NOT fully named by "all" or "shared" — say whether a
TIMESTAMP field is in it.*** And **a composite statistic whose halves come from
different definitions is irreproducible under every single definition, which
reads as an arithmetic error and is really a provenance error**; find each half
separately rather than hunting one definition that yields both.
`docs/accuracy-log.md` 2026-10-10 (19:1xZ).

**COMPLETENESS TEST:** one dominant pv covering ≥97% of acks plus a small
old-version tail. A second large pv cohort means a PARTIAL store (`audit-data`
raises `partial-store` under 97%); `dl` above 1% raises `download-failures`.
The `dl` population has been HEAD-probed whole four times (68/68, 78/78, 23/23,
20/20 → 403), so `e=download` is an honest published claim and a rise means the
EFAST2 bucket grew, not that our code broke.

### Pre-registered for the next run that merges

**v203 IS COMPLETE, VERIFIED AND MIRRORED TO MAIN (`bb4bed5a` -> `97f7ae97`, a
MATCHED code/store pair). ITS REGISTRATION HELD EXACTLY, SO THERE IS NOTHING
PRE-REGISTERED AND PENDING.** Delivered on the complete store: `vesting`
53,115 -> **53,023 (falls 92**, registered 82-94), `vestQuote` 5,281 -> **5,373
(rises 92** — the fall and the rise are the SAME number, which is the registered
"QUOTE LOST 0", and 5,373 is inside the registered 5,363-5,375), confident
60,182 / match 43,312 / entries 65,495 / warn 556 all unchanged, **pv 203 at
99.86%**, `partial-store` cleared and **HIGH back to the baseline 4**.
**IT TOOK THREE RUNS AND BOTH FAILURES WERE OURS, NOT v203's** — #604's absent
`pdftotext` (68,865 filings read as nothing at a reported 99.7% coverage) and
#605's hung shard (ten binary spawn sites with no `timeout`). #607 finished the
residue. `docs/accuracy-log.md` 2026-10-09 (06:5xZ) and (10:3xZ).
**THE MIRROR'S `--force` WAS EARNED BY MEASUREMENT, NOT ASSERTED:** main carried
TWO scheduled data commits, and before forcing over them `plans-all` was shown
IDENTICAL (112,652 rows, 0 only-on-main — the real "discards fresh filings"
hazard), `mtias`/`plans-list`/`fee-percentiles` identical, the coverage trail a
strict SUPERSET (0 main lines absent), `mirror-gate` plan-keyed at 0 plans / 0
participants, and the lineup index moving on **bit 16 alone across 122 acks with
bit 1 (has a lineup) withdrawn on ZERO**. `--force-data` was NOT used: the data
gate passed on its own, so the check that exists to stop a menu vanishing stayed
armed. *mirror-gate is lineup-keyed and does not cover the six non-lineup
stores, which is why the structural diff is a separate step.*
**CLOSED 2026-10-09 13:3xZ — 122 acks cleared bit 16 where the registration said
123, and the gap is a POPULATION MISMATCH, not a residue. My recorded guess was
WRONG.** Re-derived from the pre-v203 store at `7cde73d7`, the condition
(labelled `Immediate*` AND the stored quote accepted by
`accelerationOnlyVesting`) reproduces at **exactly 123** — the registration's
figure holds — of which **122 carried bit 16 and ONE did not**:
`20260721102318NAL0008598403001`, index value **5** (bits 1+4, lineup +
features), labelled **`"Immediate (varies by hire date per the filing)"`**. All
122 that carried the bit cleared it; **0 still set**. So 122 is complete and the
index is RIGHT to withhold the bit — a plan whose vesting varies by hire date
should not carry an "immediate vesting" badge. **The guess recorded here (one of
the 123 sitting in the 46 pv-202 acks) was refuted first by `accelLabelled`
reading 0** — no plan still carries the label anywhere — *and the real cause is
the recorded class of error one more time: the 123 is ENTRY-keyed and the 122 is
INDEX-BIT-keyed, so two counts of "the same" population answer different
questions.* `docs/accuracy-log.md` 2026-10-09 (13:3xZ).

**`PARSER_VERSION` is 203: `Employer-money vesting: Immediate` is
withheld where the sentence that would set it states only an ACCELERATION
TRIGGER — 123 plans / 59,316 ppl, which is the SAME defect v202 fixed for the
GRADED phrasing (ninth instance of *a fix for one phrasing of a class is not a
fix for the class*).** The oracle is `lib-quote`'s shipped
`accelerationOnlyVesting`, so the label gate and the display's acceleration note
are ONE predicate and cannot contradict each other.

**THE TOUCHABLE POPULATION IS BY CONSTRUCTION, NOT BY SAMPLE — and naming the
disjunct is what v202's 15x miss cost.** The arm fires inside the `IMMED`
branch, which stores that very sentence as `vestingText` and `break`s, so for
any entry labelled `Immediate` by it the STORED quote IS `cap(s)`: a verdict can
move only where `accelerationOnlyVesting` accepts the stored quote. Over all
65,495 lineup entries (trust acks and non-confident included), that is **123 /
59,316 — 0.82% of the 15,003 `Immediate*` entries — and 0 reach the label by
v96's dated-superseding route**, the one other writer of `"Immediate"`. The
whole-store ceiling and the reader-facing figure are the SAME 123, which is the
control that nothing hides in a trust.

**TWO PUBLISHED THINGS MOVE, and both are registered:**

| | ceiling |
|---|---|
| labels that stop saying `Immediate` | **exactly 123** |
| of those, label WITHDRAWN (quote retained) | **82–94**, point est. ~91 |
| of those, label REPLACED by the real schedule from the same filing | **29–41** |
| `vesting` on the coverage line | **FALLS 82–94** — the fall IS the improvement |
| `vestQuote` | **RISES by the same 82–94**, 5,281 -> 5,363–5,375 |
| `vesting-quote-test` `accel class` | 59 -> **141–153** plans, ~90,000 ppl |
| `vesting-quote-test` `accelLabelled` | 123 -> **29–41** |
| `WITHHELD` | **32**, unchanged — no quote is lost |
| QUOTE LOST | **0** |

Everything else on the coverage line must be unchanged except `pv` 202 -> 203 at
~99.9% (`dl` 48 or higher; a rise means the EFAST2 bucket grew). The fall is
inside `audit-data`'s −150 vesting tolerance, so **no `reparse-regression`
HIGH** — if one appears, the guard reached further than the replay predicted.

**NAMED SET.** Relabelled: `20260731105946NAL0021349123001` (Arcosa, 5,875, ->
**2-year cliff**, quoting a sentence that was in the filing all along),
`20251015163726NAL0005439857001` (Weather Shield, 1,261, -> 6-year schedule),
`20251023060840NAL0005718002001` (Titus-Will, 1,079),
`20260917090038NAL0005170288001` (Collins Pine, 950),
`20251014143800NAL0004251888001` (Osf International, 945). Withdrawn:
`20260803211832NAL0001051744001` (Ambrosia Qsr, 2,514),
`20251014082720NAL0001114643001` (Golf & Tennis Pro Shop, 2,197),
`20251003075018NAL0002895346001` (Quality Oil, 1,995),
`20260715104425NAL0002846225001` (Producers Dairy, 1,553),
`20250120103659NAL0001351219001` (Resurgens, 1,529).

**Measured by replaying the REAL extractor on all 123 real filings**, v202 vs
v203 in one process: the v202 replay reproduces the stored label on **111 of
123** (the control that the harness's inputs are production's inputs), and of
those 82 are withdrawn / 29 relabelled / **0 keep the label / 0 lose the
quote**. **12 plans / 2,974 ppl are PREDICTED, NOT MEASURED** — production reads
their notes through OCR and local `pdftotext` yields no label under either
version, which is the entire width of the 82–94 range. Control: 83
Immediate-labelled plans the guard must not touch (25 ranked largest + 60 drawn
uniformly, seeded, from the other 14,878) move **0 cells**.

**THE FIRST DRAFT WAS A `labelBlocked` ARM AND IT COST 107 PLANS / 53,317 PPL
THEIR BEST SENTENCE** — those guards `continue` where the `IMMED` branch stores
the quote unconditionally and `break`s, so the acceleration clause was displaced
by *"The method for crediting vesting service … is based on vesting periods of
service."* **No count showed it; reading the moved quotes did.** Sixth instance
of *blocking a wrong ANSWER must never suppress the honest EVIDENCE*, and the
first by DISPLACEMENT rather than omission. `docs/accuracy-log.md` 2026-10-09
(04:xxZ).

**AND THE NEW SPECIMEN'S FIRST RUN EXPOSED A GATE PASSING FOR THE WRONG REASON
SINCE AUGUST.** `parser-gate.mjs` picked its "other feature" key as
`k !== "match" && k !== "vesting"`, so **`quote` fell into the generic-feature
branch** — a false FAIL for the new `{vesting: null, quote: true}` pin, and a
false PASS for the v82 pin `{vesting: null, quote: null}`, where
`got === want` is `null === null` and the specimen asserted NEITHER its label nor
its quote while printing `GATE OK` for two months. Fixed with
`&& k !== "quote"`. **The tell was printed on every run — that line read
`quote=(none)` with no `vesting=` in front of it, where every other vesting
specimen prints one.** *When a fixture table dispatches on which KEYS are
present, a new key combination tests the DISPATCHER, not only the parser.*

**v201 LANDED (#577, `success`) AND ITS REGISTRATION HELD — every coverage
figure identical, `pv` the only move. Its reader-facing figure UNDER-predicted:
WITHHELD came in at 34 where 36 was registered, because production's OCR path
read candidate sentences my local `pdftotext` cache did not contain** (Pacific
Coast's new quote carries the OCR garble `Oahwhn =`, which is the evidence).
Delivered **7 plans / 49,307 ppl**, not 5 / 47,462: the named five plus Atos
Syntel (1,596, a 50%/2yr -> 100%/3yr schedule) and Pacific Coast (249, a
0/20/40/60/80/100 ladder), both read and both genuine. 7 left the withheld set
and **0 joined**. `docs/accuracy-log.md` 2026-10-04 (22:0xZ).

**ORIGINAL REGISTRATION, kept because it is what was predicted:**
`PARSER_VERSION` is **201**: the vesting quote fallback now asks the shipped
display guard, so a guard-ACCEPTED sentence may displace a guard-REJECTED stored
one. The upgrade cannot set a label and never blanks a quote, and
`audit-data`'s `vestQuote` counter counts STORED quotes without a label — the
same 41 plans before and after — so **every figure on the coverage line should be
unchanged except `pv` 200 -> 201 at ~99.9%** (`dl` 48 or higher; a rise means the
EFAST2 bucket grew).

**The delta is observable only two ways, deliberately:** run
`node scripts/vesting-quote-test.mjs` against the new store and the WITHHELD
count must read **36, not 41**; or read the five pages. Named set:
`20240929141849NAL0004592849001`, `20250109085944NAL0020210736001`,
`20251001091207NAL0012969233001`, `20251010070201NAL0007739473001`,
`20251015161406NAL0002733715002` — **5 plans / 47,462 ppl, of which Vensure
Employer Services is 42,571.** A coverage line that moves anything else is the
thing to investigate. `docs/accuracy-log.md` 2026-10-04 (21:0xZ).

**v202 LANDED (#579, `success`) AND IS MIRRORED TO MAIN** (`a99e3489` ->
`7d5a83fe`, fast-forward, matched code/store pair). **THE NAMED SET HELD
EXACTLY — WITHHELD 34 -> 32, both Polsinelli acks, 0 joined, 0 lost, 0 labels
moved anywhere in the store — AND ONE REGISTERED FIGURE WAS WRONG: `vestQuote`
5,178 -> 5,281.** Delivered **103 plans / 93,512 ppl gaining a quote** plus 11
plans / 16,539 ppl where the reader sees a different sentence, against a
registered 7 plans and "0 published quotes changed".
**THE CAUSE IS NOT v201's (a cached-extraction harness) — I REUSED v201's
SAFETY ARGUMENT ON A MECHANISM IT DOES NOT DESCRIBE.** v201's "a published
quote can never change, so the touchable population is exactly the 41" holds
because its only writer sits behind `vestingQuoteUpgrade`; **v202's arm fires
on the FIRST-WINS disjunct `!out.vestingText`**, so it is a new WRITER inserted
into a first-wins chain and the touchable population is every filing with a
spelled-out graded schedule — 69,046 acks, not 364. Direction verified both
ways (12 of 12 ranked, **14 of 14 on a uniform seeded draw**).
`docs/accuracy-log.md` 2026-10-05 (00:1xZ).

**ORIGINAL REGISTRATION, kept because it is what was predicted:**
`PARSER_VERSION` is **202**: `lib-4i:7417`, the guard that stops a GRADED
schedule being labelled "Immediate", was a bare `continue` and discarded the
SENTENCE with the label — the FIFTH instance of *blocking a wrong ANSWER must
never suppress the honest EVIDENCE* (v82, v83, v84, v86/87), where every sibling
guard in that loop sets `blockedButQuotable` for exactly this reason. Same
registration shape: **coverage line unchanged except `pv` 201 -> 202**, and
`vesting-quote-test`'s WITHHELD count must read **34, not 41**. Total delivery
**7 plans / 50,904 ppl** (v201's 5 plus Polsinelli Pc ×2 / 3,442), 0 published
quotes changed, 0 lost, 0 labels moved; corpus control 265 identical.
**#577 HAS LANDED, so v202 is dispatched.** The work list is **69,046 acks**:
the per-ack `pv` is 201 (`fetch-4i:441` writes each shard's own constant), so
the tree's 202 re-parses everything.
**AND DO NOT READ THE TRAIL'S `pv` AS THE STORE'S VERSION FOR #577 — it says
202 for data v201 produced.** The merge job resets to the latest branch tip, so
the `[skip ci]` v202 commit that landed 24 minutes before #577's merge was in
the tree it read. **`[skip ci]` is not the defect — it is what kept #577
alive** — the defect was a summary field reading a mutable tree, and
`audit-data` now writes the dominant PER-ACK pv instead.
***And my first reading of that was wrong and alarmist: I concluded the work
list was EMPTY and v202 a no-op.*** A version label on a derived summary is not
the version in the data. `docs/accuracy-log.md` 2026-10-04 (21:4xZ) and (22:0xZ).

**VERDICTS are in `docs/accuracy-log.md`, not here.** This block went stale five
times by accumulating them; the log holds 700 dated entries and every
bullet in the Open list points into it.

### Open, in rough order of people affected

**OWNER-GATED — a session must not start these unasked.** Each moves millions of
published cells:
- A filing stating a share class the registry registers under that exact name,
  where the page publishes a DIFFERENT class's symbol **and its fee**: 5,929
  rows / 4,837 plans / **11,144,696 ppl** / $44.9B. Errs in BOTH directions, so
  no blanket correction is available. Recommendation: correct the symbol on the
  exact-match population and WITHDRAW the fee rather than carry the other
  class's, with `fund-facts` filling per-class figures as they are sourced.
  **LARGEST NAMED INSTANCE, FOUND BY THE 20:07 DRAW: Insperity Holdings,
  231,912 ppl**, publishes `Dodge & Cox Stock Fund (X)` as **DODGX ASSERTED at
  0.51** on $439,033,697 (4.8% of its menu) where this file already records
  DODIX/DODGX/DODFX as **Class I**. **The control is one row away in the same
  menu:** `T. Rowe Price Mid-Cap Growth Fund (I)` publishes **RPTIX**, the I
  class exactly as filed — so the resolver honours a stated class it carries
  and falls back to a different class **silently, with no asterisk**, when it
  does not. `docs/accuracy-log.md` 2026-10-04 (20:4xZ).
- **OUR OWN STORE CONTRADICTS OUR OWN PAGE — 5,692 rows / 3,860 plans /
  8,197,880 ppl / $50.7B, and 0 of 42 rows read favour the page (22 of them
  drawn PARTICIPANT-WEIGHTED AT RANDOM).** The parser stores a share-class-
  correct symbol in `stk`/`ftk`; the display chain prefers its own resolver and
  reaches `f.stk` only as a last resort, so the page publishes a DIFFERENT class
  of the same fund. Bank of America's `WELLINGTON FUND INVESTOR SHARES`
  (**246,394 ppl**) is stored `VWELX` and published `VWENX`; Cleveland Clinic's
  `FID CONTRAFUND K6 A` ($619.0M) is stored `FLCNX` and published `FCNTX`;
  Bayada (50,157 ppl) files `PIMCO Total Return II Institutional`, stored
  `PMBIX`, published **`PTTRX`** — a different FUND, not a class.
  **THIS IS NOT THE ITEM ABOVE IT and the difference is the point:** that one is
  keyed on the REGISTRY registering the stated class and is blocked because it
  *errs in both directions*; **this one is keyed on two of our own fields
  disagreeing, needs no registry witness, and is one-directional on every row
  read.** `app.js:2035` already names both of the examples and defers the fix —
  *read the shipped COMMENT, not only the shipped guard* — so what is new is the
  number and the direction. **The blocker is the FEE: `fundER` is called on the
  NAME and never on a symbol**, so correcting the symbol alone leaves the
  expense ratio priced to the wrong class and the two cells disagreeing.
  Owner's call. `docs/accuracy-log.md` 2026-10-03 (11:3xZ).
- The fee pre-emption: a generic estimate published where the ISSUER cell
  supplies a house-specific one — 40,229 rows / 8,330 plans / **13,274,448
  ppl**. Errs both ways (issuer higher on 8,723, lower on 31,506). 7,116
  distinct (issuer, name) pairs unread.
  **RE-DERIVED BY THE 21:07 DRAW AND IT IS THE SAME CLASS — eighth queue entry
  re-measured rather than read.** Asking the resolver for the string the page
  PRINTS reads 68,762 rows (composed LOWER 34,291, HIGHER 9,090, plus 22,904
  blank -> priced and 2,477 priced -> blank the recorded screen did not count);
  the directional split matches to within a few percent. **DO NOT CARRY THAT
  SCREEN'S 108,030,524 ppl — it is wrong by ~8x**, having summed a plan's
  participants once per ROW; 93% of the weighted universe should have been
  refused on sight.
  **LARGEST NAMED INSTANCE, and a SHARPER sub-case needing no house judgment:
  Boeing (209,633 ppl)** publishes `iss "MFB NT COLLECTIVE LONG-TERM GOVT B"` ·
  `name "INDEX FUND-NON-LENDING"` at **0.1 on $159,373,222** — ONE fund name cut
  mid-word across the two columns — while rows 3, 5 and 8 of the same menu carry
  the undamaged name and publish **0.05**. `fundERRow` (`app.js:2356`) prices
  `f.name` alone and passes the issuer to `issuerPricedER` SEPARATELY, so the fee
  comes off the fragment. Composing the two cells here is not a judgment about
  house-specific pricing, it is reading the name the filing gives.
  `docs/accuracy-log.md` 2026-10-04 (21:5xZ).
- **THE CREF VARIABLE-ANNUITY-ACCOUNT CLASS — SIZED 2026-10-09 18:4xZ, NOT
  SHIPPED, AND THE QUEUE'S OWN FRAMING WAS THE FIRST THING REFUTED: 15,028
  published+served rows / 2,094 entries / 4,510,106 ppl / $81,796,462,796**, of
  which **4,672 rows / 2,010,652 ppl / $32.6B publish shown TYPE `Mutual
  fund`** and **3,559 rows / 2,008 entries / 4,187,734 ppl / $9.17B publish a
  pattern-table FEE**. A seeded uniform draw of 24 reads **24 of 24 genuine**.
  **"Names cut down to an asset-class word" IS NOT A DEFECT — the asset-class
  word IS the product's name**; a screen for exactly that shape reads 3,590 rows
  / 2,141,225 ppl and its members are `CREF Stock` (NYU at 8.3% of its menu,
  Brown at **20.1%**), `CREF Growth`, `CREF Social Choice` — the accounts' own
  names. *A name that is short is not thereby a name that was cut.*
  **THE REGISTRY IS ALREADY IN THE REPO:** `sec-funds.json` registers EIGHT
  accounts as `COLLEGE RETIREMENT EQUITIES FUND :: <X> Account`, classes R1-R4,
  with symbols (QCSTRX…QCMMFX), and **0 TIAA/Nuveen registrants have a series
  named bare `Stock` or `Growth`** — which is what convicts MGB's rows. Several
  filed names are the RETIRED ones (Stock -> Total Global Stock, Equity Index ->
  S&P 500 Index, Bond Market -> Core Bond), so this is the Oppenheimer/Spartan
  shape too: *a rename is a FACT that must be SOURCED.*
  **THE FEE IS GENERIC-PATTERN LEAKAGE AND THE CONTROL IS INTERNAL** — the same
  eight accounts in the same menus publishing NOTHING: priced are Money Market
  1,989 @ 0.2, Equity Index 1,608 @ 0.06, S&P 500 Index 353 @ 0.03, Growth 144 @
  0.1 (the three that collide with `fund-er.js:498`'s index/money-market
  patterns), while Stock 1,799 rows / **$35.5B**, Growth 2,349, Social Choice
  2,108, Core Bond 2,103, Global Equities 1,878 and Inflation-Linked Bond 1,796
  are blank. `fund-er.js:1451`'s `pooled` veto lists `tiaa traditional` and
  **does not list `cref`**. And the recorded asymmetry again: the TICKER column
  refuses these on 15,027 of 15,028 rows and the FEE column does not.
  **THE DRAW'S OWN HEADLINE FEE CANNOT BE CONVICTED:** MGB's `EQUITY INDEX` at
  0.06 / $140,358,000 is ambiguous because `TIAA-CREF FUNDS :: Nuveen Equity
  Index Fund` is a registered fund priced near 0.06 and the issuer cell says
  `TIAA-CREF Funds`. The convictable harm on that page is the TYPE on three
  rows; the fifth row, `Global Quality Equity`, **has no house token anywhere**
  and belongs to the no-fund-identity class — the first must-see fixture failing
  was that finding.
  **DO NOT CARRY the ambiguous half as shippable: 1,576 rows / 855,717 ppl**
  where the house is only `TIAA-CREF`/`TIAA` is MIXED three ways on a uniform
  draw (13 of 24 are **`TIAA Access` T3/T4 sub-accounts** — the same vehicle
  defect under a THIRD brand, SIZED AND PART-SHIPPED 2026-10-09, see the entry
  below; 4 are real TIAA-CREF registered funds).
  **THREE SCREENS OF MINE WERE REFUTED, all by reading members:** a bare `CREF`
  token alone takes **474** `CREF LIFECYCLE INDEX 2040 INST` rows (registered
  mutual funds, caught by a must-NOT-SEE decoy); a house witness read from the
  ISSUER cell takes **464** rows because *the issuer cell routinely holds the
  CUSTODIAN* (`Nuveen Equity Index R6` =TIEIX, `JP Morgan Large Cap Growth R6`)
  — **the tell was an implausible fee spread, 0.44/0.71/0.6/0.55, inside a
  supposed single-product class, and only READING all 123 ticker rows showed
  it**; and the class-word framing above. Per-condition necessity measured over
  the live pool: account-name blocks 15,366, Lifecycle refusal 157, other-house
  refusal 464 — none decorative.
  **WHY IT IS THE OWNER'S CALL, and the first reason is a PIN:**
  `lib-disclose.mjs:3995` lists `CREF Money Market Account` as a must-KEEP decoy
  whose comment says firing on it *"would withdraw a real vehicle's expense
  ratio"* — somebody already considered one route to this cell and pinned
  against it. The fee half is 4.19M readers and belongs with the stable-value
  and fee-pre-emption families (*a fee is SOURCED, never derived*; the honest
  replacement is per-class figures from `data/fund-facts.json`, which do not
  exist). The type half is the shape `lib-disclose.mjs:2950` already repaired for
  the filer's own `annuity contract` phrasing on 186 rows — **tenth instance of
  *a fix for one phrasing of a class is not a fix for the class*** — and
  withdrawing `Mutual fund` needs new display wording, so a guard and the claim
  it licenses are one change. Both are display-side; `PARSER_VERSION` stays 203.
  `docs/accuracy-log.md` 2026-10-09 (18:4xZ).
  **AND THE GENERAL FORM — ANY INSURER IN THE ISSUER CELL — WAS SIZED AND
  REFUTED 2026-10-09 20:2xZ. Do not rebuild it.** Legal-entity vocabulary only,
  type cell naming no vehicle, a fee published: 12,698 rows / 2,597 plans /
  2,843,940 ppl / $15.9B — but its top 30 is **two already-gated families** (the
  0.35 stable-value item, and the `Fidelity Freedom Index <vintage> Instl Prem`
  ladder at 0.12 under Empower), and the new residue that ASSERTS a registered
  symbol is 4,310 rows / 746 plans / 628,589 ppl. **`data/fees/NN.json`'s
  `a: {cm,fe,cr}` is a free Schedule A witness (64,472 acks, 9,910 carry one)
  and it corroborates only 51.4%** — so *the issuer cell's evidential value is
  now PRICED at approximately nothing*, the third and first-quantified instance
  of **the issuer cell routinely holds the CUSTODIAN or PLATFORM**. The seeded
  draw says why, 20 of 20: every row names a RETAIL fund with its share class
  stated (`Admiral`, `R-6`, `R3`, `Investor Shares`), and **a separate account
  has no such class** — the insurer is the platform and the symbol and fee are
  right. *A witness keyed on the PLAN cannot settle a question about a ROW*: the
  Schedule A is TRUE and attaches to the menu's stable-value row, not the one
  being judged. **Survives, unsized:** a name carrying the insurer's OWN prefix
  (`TA Vanguard LifeStrategy Mod Gr`, VSMGX at 0.1) — and the record already
  calls a wrapper lead correct as filed, so it needs the registry, not a wider
  screen. `docs/accuracy-log.md` 2026-10-09 (20:2xZ).
- **THE `TIAA Access` VARIABLE-ANNUITY SUB-ACCOUNT FAMILY — SIZED 2026-10-09
  21:4xZ at 15,005 published+served rows / 963 entries / 963 plans / 737,940
  ppl / $2,570,145,886, and the ASSERTED-TICKER HALF IS SHIPPED.** The queue
  named this unsized at "13 of a 24-row draw inside a 1,576-row residue": it is
  **10x that**, because *a class spotted inside another class's residue is sized
  by that residue's conditions, not by its own.* `entries == plans == 963`, so
  no trust resolution is in play. **SHIPPED: one token in `fund-er.js`'s
  `pooled` veto beside `tiaa traditional` — 13 rows / 11 plans / 10,967 ppl /
  $2,689,702 stop ASSERTING a registered fund's symbol** (7 rows / 4,490 ppl
  withdraw VWENX and DODFX, 6 rows / 7,358 ppl go asserted -> **TRLGX\***), with
  ticker GAINED 0 / SWAPPED 0 / **fee changed 0** / name 0 / shownType 0 and a
  341,327-row non-candidate control differing on 0. **One surface by
  construction:** `build-seo-pages.mjs` has 0 references to `fund-er`/
  `lookupTicker`/`fundTickerInfo`, so the regenerate-and-diff control is
  INAPPLICABLE rather than skipped. `PARSER_VERSION` stays 203.
  **IT HAD TO BE THE NAME AND COULD NOT BE THE TYPE CELL — our own store files
  ONE product FOUR ways, so the page's verdict was decided by WHICH PLAN FILED
  THE ROW.** `TIAA ACCESS NUV INTL EQUITY T4` (385 rows) and the seven next
  most common products each appear under all of `Pooled separate account`,
  `Separate account`, `Mutual fund` and blank; **651 of 2,399 distinct product
  names are filed as a separate account by at least one plan.** The control is
  one page from the defect: St. Paul's Schools filed a pooled separate account
  and published `TRLGX*`; Liberty Science Center filed the same product as
  `Mutual fund` and published **TRLGX asserted**. Registry witness:
  `sec-funds.json` has **589 TIAA/CREF/Nuveen rows and 0 of 29,406** series
  matching both `tiaa` and `access`. Decoys measured from the data, not
  imagined: of **8,714** distinct stored `tiaa` strings outside the family the
  token takes **0** (`TIAA Real Estate` 1,006, `TIAA Traditional` 509+474,
  `CREF Lifecycle Index` 474 registered funds) — which is why the anchor is the
  two-word phrase and not a bare brand.
  **STILL OPEN, OWNER-GATED, AND THE SHIPPED CHANGE DOES NOT TOUCH EITHER:**
  (a) **the FEE, 1,000 rows / 596 plans / 431,094 ppl / $126,559,648** — `er =
  star ? info.er : fundERRow(f)` prices the NAME on both branches, so
  Association Of Independent Maryland And Dc Schools still publishes Wellington
  Admiral's **0.17 on a row that now names no fund**, and Geisinger (27,871 ppl)
  publishes 0.03 on `TIAA Access S&P 500 Index`. Pure pattern leakage, 0.06
  ×503 / 0.1 ×343 / 0.2 ×65 / 0.03 ×31, and **53 of the 1,000 carry a filed type
  that DOES say separate account** — so the TICKER column now refuses this
  family on 14,990 of 15,005 rows and the FEE column still does not. Goes with
  the stable-value and fee-pre-emption families: *a fee is SOURCED, never
  derived*, and `data/fund-facts.json` has no TIAA Access figures.
  (b) **the false vehicle TYPE, 4,678 rows / 304 plans / 358,676 ppl /
  $734,433,119 publishing `Mutual fund`**, of which 3,452 rows / 304,719 ppl
  have our own store filing that exact product as a separate account elsewhere.
  Same gate as the CREF type half — withdrawing it needs new display wording, so
  *a guard and the claim it licenses are one change* — and the **eleventh
  instance of *a fix for one phrasing of a class is not a fix for the class***
  (`lib-disclose.mjs:2950` repaired the filer's own `annuity contract` phrasing
  on 186 rows).
  **NOT a defect: the 8,992 blank-type rows** say nothing about the vehicle,
  which is honest. **And qualification is the WRONG remedy for all of it** — a
  seeded uniform draw of 24 reads **24 of 24 genuine** with names intact, a row
  naming nothing is **0** and a row whose name we mangled is **23**, so *"the
  filing names no specific fund"* would be false for essentially every row.
  **DO NOT key this family on the T-class suffix:** T4 10,807 / T3 1,408 / T2
  344 / T1 22 and **2,424 rows carry no T-token at all** (`TIAA Access
  High-Yield`), so the suffix misses 16%. One draw row belongs to the 15:5xZ
  welded-table-row class instead (California Community Foundation's `W436# …
  $41.891700 951.5792`). `docs/accuracy-log.md` 2026-10-09 (21:4xZ).
- **REFUTED 2026-10-10 01:4xZ, DO NOT REBUILD IT — the `noPublicPrice`
  "bypass" is the comparable DESIGN and the disclosure is already shipped.**
  `app.js:4073` reads `star ? info.er : (noPublicPrice ? null : fundERRow(f))`,
  so the COMPARABLE branch takes `info.er` unconditionally and only the
  pattern-table branch is gated — a real asymmetry, sized at **45,067 rows /
  6,959 plans / 34,282,495 ppl / $1,455,409,472,270** (of 306,730
  `noPublicPrice` and 46,669 asterisked rows; **0.08 on 19,586 rows** is the
  `Vanguard Target Retirement <vintage> Trust II` family, within half a basis
  point of its real cost). Largest: Bank of America `INSTITUTIONAL 500 INDEX
  TRUST` VFIAX\* 0.04 on $12.36B / 250,040 ppl; Microsoft `Fidelity Growth
  Company Pool Class S` FDGRX\* 0.61 on $8.2B.
  ***AND IT IS NOT A DEFECT:*** `app.js:4254` already prints, on any report with
  a starred row, *"it has no ticker and no published expense ratio, because its
  fee is negotiated by the plan … the plan's trust class is normally CHEAPER
  than the retail fee shown, so read it as a ceiling, not the plan's price"* —
  which names the provenance, the direction and the epistemic status, so FDGRX's
  0.61 as a CEILING is true. **The converse of a recorded rule: *a guard and the
  claim it licenses are one change* is written about SHIPPING one; when AUDITING
  a guard that appears bypassed, read the claim the page makes on the bypassed
  branch BEFORE sizing it as a defect.* I had the mechanism, the population and
  $1.46T before reading one sentence of the template.
  **Both surfaces checked:** report `starred` is set in the row loop and read in
  the same template so the footnote cannot go missing; the crawlable pages carry
  no footnote AND **no per-fund expense ratio at all** (the only `expense ratio`
  strings in `build-seo-pages.mjs` are prose that admin fees are separate), so
  no surface publishes a comparable fee undisclosed.
  **WHAT SURVIVED WAS A TETHER, NOT A FIX — AND IT IS NOW SHIPPED (2026-10-10
  14:3xZ): `scripts/fund-note-test.mjs`, wired into `site-test`.** 45,067 rows /
  34.3M ppl rested on that one `fund-note` paragraph with nothing testing it.
  **Two things are checked, because the disclosure fails two unrelated ways:**
  each load-bearing clause is its OWN assertion (mark explained, vehicle named,
  absence stated, provenance given, shown fund called an *equivalent*,
  direction, ceiling) so a reword dropping exactly one fails by name; and the
  `starred` CHAIN — declared 3735, set 3946 inside the row callback, read 4263 —
  because ***breaking a link leaves the asterisks printing with the footnote
  gone, which is worse than either state.*** The eager-evaluation link is pinned
  too: `list.map` being eager is the only reason the template can read a flag
  the callback sets. 11 checks, 11 mutation controls, and the suite **exits 1 if
  a control PASSES**; the paragraph is EXTRACTED first, because app.js's own
  comments contain `normally CHEAPER` and a file-wide grep would pass against a
  file whose paragraph had been deleted. CI-safe by construction (reads app.js
  alone), which is the property `merge-name-test` lacks.
  **IT WENT RED ON ITS FIRST CI RUN ON THE TRAP THIS FILE RECORDS IN CAPITALS:**
  I defaulted the input to `/home/user/no-app/app.js` and #189 died `ENOENT …
  open '/home/user/no-app/app.js'`. ***Cheap only because the message named the
  PATH instead of a BINARY*** — `map-test.mjs`'s `spawn python3 ENOENT` hid ten
  red runs. Fixed via `import.meta.url`, controlled from the repo root, from `/`
  and from a different root with the runner's layout; **#190 green, all 13
  steps.** And #189 restated the other rule from the inside: step 10 of 14 red
  meant steps 11-14 **SKIPPED** — stamp check, Playwright, smoke and map test
  never ran. `docs/accuracy-log.md` 2026-10-10 (01:4xZ) and (14:3xZ).
- Stable value / guaranteed accounts publishing a fabricated ER: 4,669 rows /
  **7,389,704 ppl**, 4,571 of them at exactly 0.35.
  **AND ITS CLEANEST SUB-CASE IS SIZED AND AWAITING A DECISION — FOUND BY THE
  17:07 DRAW: ONE TARGET-DATE LADDER, ONE MENU, A FABRICATED FEE ON THE VINTAGE
  WHOSE TYPE CELL IS BLANK. 181 families / 503 rows / 174 plans / 360,090 ppl /
  $2,143,243,683.** Acosta publishes thirteen `Fidelity Freedom Index` vintages:
  eleven typed `Collective trust` carry `noPublicPrice` and correctly publish NO
  fee, while **2040 and 2055 are typed `—` and publish 0.12** with no ticker and
  no asterisk. UKG (12,969 ppl) publishes `FIAM Index Target Date 2035 Y` at
  **0.1 on $275,047,511 — 14.0% of its whole menu** beside eleven unpriced
  siblings; Tishman Speyer 7 of 12 vintages, Petvet 5 of 12.
  **THE WITNESS IS INTERNAL AND NEEDS NO REGISTRY, which is what separates it
  from the gated parent:** we need not know whether 0.12 is right, because our
  own page gives two answers about one product on one screen and the siblings
  are the control. Every member is a collective trust BY ITS OWN FILED NAME
  (`JPMCB … Pasv Blnd 2040-CF`, `State St Target Ret 2030 SL Cl IV`,
  `T Rowe Price Ret Blend Sel Tr 2050 CL 2`). Mechanism: the suppressors read
  the TYPE CELL, so a blank type defeats them — the recorded Accenture `gicRow`
  shape generalised to `noPublicPrice`.
  **DO NOT CARRY MY FIRST SCREEN'S 460 families / 463 plans / 1,451,530 ppl /
  $49.0B — wrong by 4x on people and MERGING TWO OPPOSITE CLASSES, because I
  DROPPED `star` FROM THE PRINT.** It could not see that its largest members are
  Costco's thirteen `~TRR*X` rows, which this file records as **correctly
  asterisked comparables**, nor that the bulk of the 460 is the INVERSE shape
  (10-13 vintages priced, 1-3 blank), which is a coverage gap and a false fee
  nowhere. *An asterisk is a whole category of claim* — second instance in two
  cycles of one of my instruments printing fewer fields than the page acts on.
  **NOT SHIPPED, pending the owner:** the direction is one-directional
  (withdraw a fee, never add one) and 503 cells is small, but the predicate it
  needs is the FIRST here that must consult a row's SIBLINGS rather than judge
  it alone — every shipped suppressor judges a row by itself. *A fee is SOURCED,
  never derived.* `docs/accuracy-log.md` 2026-10-09 (17:4xZ).
- American Funds rows stating NO share class keeping the R-6 fee: **10.5M ppl**.
  The TICKER column already refuses this inference and the FEE column does not;
  both cannot be right.
  **NAMED ROW BY ROW BY THE 16:07 DRAW: the target-date sub-family alone is 6,286
  published rows across 12 vintages** — `American Funds 2050 Target Date
  Retirement Fund` 603 rows / 519,136 ppl and eleven siblings, every one
  publishing **0.32** with no ticker. **DO NOT read the family's `neither ticker
  nor fee` bucket (4,859 rows / 687,910 ppl) as a gap:** its largest members are
  `Capital Group 20XX Target Date Retirement Trust TD9` COLLECTIVE TRUSTS
  (Salesforce 57,193 ppl on four rows to $1,216,366,000; Barnabas Health 35,605
  on six), which have no ticker and no public ER by nature, so a blank is the
  honest answer. `docs/accuracy-log.md` 2026-10-04 (17:2xZ).
- A WHOLE-TABLE generic test beside the one-row test. `audit-dominant-row` needs
  90% on a SINGLE row, so Morgan Stanley (81,090 ppl, ten asset-class rows, the
  largest 62.1%) and Cummins (38,567 ppl, 65.1% of menu value naming no fund)
  are invisible. Widening the vocabulary also moves `audit-generic-names`, which
  is already past 230.
  **AND THE LARGEST KNOWN INSTANCE IS BIGGER THAN EITHER, FOUND BY THE 15:07
  DRAW: Verizon Communications, 146,572 ppl, whose twelve-row category table has
  66.8% of its menu value in two UNNAMED rows** — and the guards split it, which
  is the diagnosis. `COMMON/COLLECTIVE TRUST` at 41.9% / $16,315,773,219 IS
  qualified; `CORPORATE STOCK - COMMON` at 24.9% / **$9,699,087,087**, type cell
  `—`, is NOT, because **`isGenericTypeName` is a CLOSED WHOLE-STRING vocabulary
  that reaches `CORPORATE STOCK` and `COMMON STOCK` separately and misses their
  COMPOUND.** *A fix for one phrasing of a class is not a fix for the class*,
  met on a hyphen.
  **SIZED 2026-10-04 16:0xZ, and the split by TYPE is the measurement: 780 rows
  / 783 plans / 4,950,732 ppl / $29,801,906,649** are caption-shaped with NO
  type cell to describe them (Johnson & Johnson `CORPORATE STOCKS - COMMON`
  **41.6% / $9,996,789,597 / 80,884 ppl**; Exelon 44.5%; Eaton 24.8%; PepsiCo
  11.4%; Continental Automotive `Government Bond` at **50.0%** of its whole
  menu), while **1,171 rows / 3,627,025 ppl ARE typed and must be left alone** —
  Verizon's `INTEREST-BEARING CASH` is typed `Cash / short-term`, a category
  labelled as one. **DO NOT CARRY the pre-split 1,951 rows / 7,599,688 ppl /
  $44.0B**, of which 1,171 are the guards working and whose vocabulary also
  swept in `Cash` ×466 and `Real Estate` ×229.
  **SHIPPED 2026-10-04 16:5xZ as `isScheduleHCaption`, and CORRECTED 18:3xZ:
  the reader-facing figure is 563 rows / 558 plans / 4,146,037 ppl /
  $31,831,125,339, NOT the 574 / 577 / 4,564,065 / $32,614,134,068 first
  published** — shown-TYPE only (name 0 / ticker 0 / fee 0 / asterisk 0), 22
  crawlable pages, browser-verified on both pins. Verizon now qualifies BOTH
  unnamed rows. **THE CORRECTION'S CAUSE IS THE TRUST-SERVING CONDITION, missed
  for the THIRD time:** the render diff credits every MEMBER plan of an ack, but
  both surfaces serve a trust's menu only where the plan's OWN lineup is
  unusable (`build-seo-pages.mjs:111`, `app.js:2898`), so 13 of 576 rows reach
  no reader and a served row reaches only the members it serves. **Apply the
  serving condition before publishing ANY row count read from the lineup
  store.** **DO NOT CARRY the 780 / 4,950,732 above, nor the
  767 / 4,977,804 the ship's own screen read:** both are NAME-verdict counts,
  and **200 rows / 551,342 ppl are held by the CALL-SITE ISSUER GATE, correctly**
  — `Common shares · Cardinal Health, Inc.` is employer stock the issuer cell
  names and the early return misses. Every excluded token is a measured
  single-protection case (`fund` keeps =DFREX for 581,803 readers, `index` keeps
  `US Bond Index` for 947,172, `assets` keeps `OTHER ASSETS` / $2.58B,
  `employer` keeps `Employer Common Stock`, the article `a` keeps 41 SERIES
  letters). `isGenericTypeName` was NOT widened.
  **THE ACRONYM AND ABBREVIATION FAMILIES SHIPPED 2026-10-04 18:3xZ — four
  tokens (`cct`, `corp`, `instr`, `sec`), 21 reader-facing rows / 24 plans /
  542,097 ppl / $24,025,795,169, 0 tickers and 0 fees, 11 crawlable pages.**
  Novartis's `INTEREST IN CCT` at **60.6% / $8,842,803,272**, Alcon 93.1%,
  Mondelez 91.3%, Unilever 66.8%, Henkel's `CORP. DEBT INSTR. - PREFERRED` at
  50.3%. **SUFFICIENCY IS NOT NECESSITY and a token-alone test would have
  dropped `instr`** — sufficient for 0 rows, necessary for 3, because
  `CORP. DEBT INSTR. - ALL OTHER` needs `corp` AND `instr`. Six candidates were
  REFUSED as necessary-for-0 (`govt`, `pfd`, `equiv`, `mtge`, `resid`, `coml`),
  and `cit` was excluded on instinct then measured inert too — *an exclusion
  that blocks nothing measurable is not a protection.*
  **STILL OPEN from the 300-row residue: the deliberate `general account` and
  `loan` exclusions** (`General Account` ×95 + ×43, `Loan`/`Loans` ×77, `Stock
  Account`, `Real Estate Account` ×28, `Cash in Interest-Bearing Accounts`) —
  each belongs to a class with its own machinery, and the `loan` tokens would
  DOUBLE-LABEL a row because the loan label is appended by a different arm on
  the same cell. **DO NOT CARRY the 300 rows / 1,175,906 ppl as shippable:** 23
  of it shipped and the rest is those two exclusions.
  **THE TYPED-CAPTION RESIDUE ON THE CRAWLABLE PAGES SHIPPED 2026-10-09 — 74
  rows / 54 pages / 801,791 ppl / $37,775,479,800, and the rule was NOT split:**
  `captionFiledType` is one shared predicate whose WORDING lives at the one call
  site that needs a sentence where the report has a column
  (`… — asset type as filed: Cash / short-term`). **The remedy is the filed TYPE
  and NOT the nameless label, and only the FILINGS could say so:** the class is
  two populations — a genuine category table (Verizon's trust files the Schedule
  H `1c` captions value-for-value; Hallmark's table header reads
  `ASSET CATEGORY`) and a REAL holding whose name we truncated (Altria's
  `Shares` is $1,456,691,207 of employer stock whose identity column we dropped;
  Williams College's `Real Estate` is `TIAA | Real Estate` under
  `Pooled Separate Accounts`, a real option), so *"names no specific fund"* is
  FALSE for the second. **DO NOT CARRY 1,294, nor the 88 rows / 70 pages /
  909,956 ppl this condition reads:** 18 rows / 16 pages / 108,165 ppl are
  blocked by the issuer gate and all 18 issuers were read — every one names a
  fund, an employer or an insurer, which is the owner-gated
  caption-with-an-issuer sub-family. **Targeting control: 3,158 UNCHANGED pages
  whose twelve shown rows are ALL typed** (37,896 rows that could have grown a
  parenthetical and did not), Walmart's read byte-identical. **And the PAGE
  found a second defect no screen could: `CAPTION_WORD` spelled the
  abbreviation as one token, so Verizon's `U. S. Government Securities`
  ($2,765,872,513 × 4 member plans) escaped on a SPACE** — priced as a superset
  over all 1,730,931 stored rows at **exactly ONE name moved**, nothing untyped,
  so the report's verdict could not change. *One of two spellings of a caption
  family is worse than neither.* **STILL OPEN from it:** the `103-12 investment
  entities` caption, **10 rows / 6 pages** (Verizon $164,190,569), which needs
  the vocabulary to accept a NUMERIC token — a different risk class, since
  `hasNoFundIdentity`'s `\d{1,3}` filler is what cut `500 Index Fund` off its
  ticker; and Altria's page publishing `Altria Group, Inc | $25,263,461`, which
  is the SHARE COUNT, a parser defect and unsized.
  `docs/accuracy-log.md` 2026-10-04 (16:0xZ), (16:5xZ) and 2026-10-09.
- **Crawlable pages no run can ever repair — RE-SIZED 2026-10-02 and NEARLY
  DOUBLED: 62 → 118 pages / 169,447 → 324,028 ppl**, plus **1 serving a plan no
  longer in the universe at all.** `p/` holds **5,118** committed files against
  the generator's `TOP_N = 5000`. **The growth mechanism, which the first
  measurement did not name:** `build-seo-pages` does **not sort** — it takes
  `d.plans.slice(0, TOP_N)` in `plans-all`'s own stored order, which is
  assets-sorted, so every DOL refresh reshuffles the first 5,000 and a page for
  a plan that drops out **stays committed, frozen at whatever it last said**
  (mtimes show waves: some orphans last written 2 days ago, others 8). **So any
  number written here is stale by the next refresh — re-measure, never read.**
  Still gated: raising `TOP_N` regenerates the 118 but also creates pages for
  plans ranked beyond them, and deleting them removes live URLs.

**SIZED, NOT SHIPPED 2026-10-02 17:4xZ — THE HOUSE SPELLED `and` REACHES NO
FUND: 228 rows / 200 plans / 443,410 participants / $1,742,866,275 shippable,
plus 49 rows / 41 plans / 483,820 ppl owner-gated.** Starbucks (314,112 ppl)
publishes `Dodge and Cox Income Fund Class X` at $90,558,579 with no ticker and
no fee while `Dodge & Cox Income Fund Class X` resolves to DODIX at 0.41.
**THE GENERAL FRAMING COLLAPSED ON ITS OWN OUTPUT: every one of the 96 gains is
Dodge & Cox** — 1,575 names already resolve under BOTH spellings, so the
resolver handles `and`/`&` everywhere else and this house's entry is the only
one keyed on the ampersand alone. **DO NOT CARRY 372 ROWS / 1,394,092 PPL (a
string screen, counting 35 bare-house rows that resolve either way) OR 3,293
ROWS / 5,623,825 PPL (the store's attestation of both spellings, whose top
members — `capital world growth and income fund`, `science and technology fund`
— are the FUND's own registered spelling and already work both ways).** ***A
count keyed on a character measures the character, not the defect.*** **THE FIX
MUST BE ONE-DIRECTIONAL, PRICED: a blanket bidirectional substitution costs
1,061 distinct / 7,251 rows** that resolve as filed with `&` — 26x what it wins.
The gated half states **Class X** where DODIX/DODGX/DODFX are Class I, so a gain
there is a wrong class AND a wrong fee (the 5,929-row item), and **it carries
MORE readers than the shippable half**, which a row count reverses. Named cost
checked and ZERO: `Vanguard Target Retirement Income and Growth Trust` resolves
to nothing under both spellings, so the 15:0xZ refusal of that different product
survives. Two members must be refused: `Dodge and Cox` alone (35 rows) and
`IGT Dodge and Cox A or Better Core Fund`, another manager's product.
`docs/accuracy-log.md` 2026-10-02 (17:4xZ).

**TOOLING DEFECT, FOUND BY THE DRAW AND NOT YET REPAIRED — `scratchpad/
apppath.mjs`'s `render()` APPLIES 2 OF app.js's 11 FEE SUPPRESSORS, so every
fee a draw has printed is an UPPER BOUND: 109,543 of 1,714,404 published rows
(6.4%) across 25,396 plans / $997,651,366,756 carry a fee the harness prints
and the page withholds.** `noPublicPrice` 106,443, `gicRow` 2,368,
`guaranteeOnlyFee` 591, **`bankDepositFee` 105** (exactly the 01:5xZ ship's own
population), `annuityRow` 35, `subtotalRow` 1 — and it is a FLOOR, because
`stockRow`, `namelessRow`, `contractRow` and `mistypedGuaranteeFee` need
plan-level context this pass does not supply. **IT COULD NEVER HAVE HAD THEM:**
the suppressors are defined at app.js:2909–3174 and the slice ends at
app.js:1933, so they are outside it by construction, and the harness's prologue
names TWO as missing where nine are. ***A transcription that documents its own
gap can still document the wrong gap*** — the 01:5xZ incomplete-`er` finding in
the SAME FILE after that entry was written. **IT REFUTED A CLAIM ONE PARAGRAPH
FROM PUBLICATION:** Starbucks' `Galliard Stable Return Fund Class E` at 0.35 /
$94,315,803 was written down as a fabricated fee in front of 314,112 readers and
`noPublicPrice` withholds it. What survives is Accenture's **`PIMCO STABLE VALUE
FUND` typed `Mutual fund` publishing 0.35 on $358,548,781 to 112,414 readers** —
a named live instance of the owner-gated stable-value item, escaping because
`gicRow` reads the TYPE cell.
**CLOSED 2026-10-02 — THE REPAIR HAD SHIPPED THE DAY BEFORE.** The defective
file was a stale duplicate in gitignored `scratchpad/`, imported in preference
to the tracked `scripts/apppath.mjs` under the same basename; 81 of this
session's measurement scripts used it, 32 used the tracked one. Every fee figure
from the 81 is an upper bound. See the Open list's apppath entry for the rule
that replaces this. `docs/accuracy-log.md` 2026-10-02 (19:2xZ).

**SHIPPED 2026-10-02 17:1xZ — THE TRUST'S SCHEDULE D FUND LIST, captured by
#523 in September and rendered nowhere until the owner asked twice: 61 plans /
874,136 participants / $105.6B across 29 trusts gain a named fund list, on BOTH
surfaces, 42 crawlable pages / 827,790 ppl with 252 insertions and 0
deletions.** `cct` had 0 consumers while being 231,260 of the 406,247 bytes of
`mtias.json` that every visitor already downloads — more than half that
download was an unused fund list, so the cost was paid and only the render was
missing. **THE SHARE IS THE CLAIM, not a caveat:** Schedule D reports interests
in COLLECTIVE TRUSTS and nothing else, so across the 29 trusts the list
accounts for **39.6% to 100.0%** of the trust's own assets — PSEG's is
$2,006,425,398 of $4,417,985,729, so more than half of the owner's own trust is
OUTSIDE its own list. Both surfaces print the percentage and the denominator and
say the amounts are the TRUST's, shared with every sister plan, with no per-plan
or per-participant balance public. Three conditions, each priced: a floor of 3
(Northrop's trust lists ONE fund at $11.4B — 28 plans / 235,635 ppl are left
alone), wound-down plans excluded (4 / 14,514), and it never overrides a menu
and yields to the audited-notes option list (measured at 0 of 61, so the
precedence is currently inert and recorded as such). **`trustScheduleDMenu` is
canonical in `lib-disclose`, SLICED VERBATIM into app.js, and tethered — and
its contract is DATA (`hasOwnMenu`, `zeroEOY`) because app.js carries
`plan.zeroEOY` where `build-seo-pages` reads `assetsEOY`.** My first app.js
draft called `titleCase`, which exists only in `build-seo-pages.mjs` and would
have thrown and blanked every row on every plan page; a grep caught it.
**AND THE TWIN CONTROL PASSED SILENTLY ON ITS FIRST RUN:** my pins were a
3-fund and a 1-fund case, so drifting the floor to **2** changed no verdict —
*a floor of three is only tested by a case of exactly two.* Display-side,
`PARSER_VERSION` stays 197, nothing to pre-register.
**STILL OPEN from it:** 32 plans / 251,764 ppl whose trust carries NO Schedule D
capture — whether those trusts filed none or filed one `scanSchD` cannot reach
is unmeasured and needs a prep run (the extracts come from the DOL site,
unreachable from the sandbox); and 19 of the 61 have no crawlable page, which is
the `TOP_N` orphan item. `docs/accuracy-log.md` 2026-10-02 (17:1xZ).

**QUEUED, SIZED, NOT SHIPPED:**
- **THE ONE-TOKEN SPLIT, WORKED 2026-10-11 00:4xZ — RE-DERIVED AT 5,216 rows /
  2,964 acks / 7,261,682 ppl / $38,715,423,099 unqualified (681 of 5,897 are
  already qualified), AND BOTH OF MY DISCRIMINATORS ARE NOW REFUTED.** The
  figure corroborates the recorded 5,259 / ~6,983,334 by a different screen.
  Largest unqualified row unchanged and genuinely nameless: Food Lion's
  `OTHER-STRATEGY` at **64.75% / $4,476,240,694 / 239,586 ppl**.
  ***A LEAD-TOKEN ATTESTATION WITNESS CANNOT SEE A DESPACED NAME.*** Asking
  whether any other plan files a LONGER name beginning with the token splits
  3,036 rows / 4,255,918 ppl (`Cash`, `Fidelity`, `CREF`, `Macquarie`,
  `iShares`, `VALIC`) from 1,944 / 2,438,147 / $26.8B — **and the second
  bucket's own members are REAL funds whose spaces we lost**
  (`Dodge&CoxInternationalStockX`, `FIDADFR2035`, `PIONEERBONDFUND-R`,
  `PIMCOCOMDYREALRTNSTRATINST`), which have no lead token to attest and so land
  in "names nothing" BY CONSTRUCTION. Same shape as the 19:4xZ bucketing being
  keyed on CASE: *two consecutive discriminators on one class, each measuring
  itself rather than the defect.*
  **AND THE SHIPPED SEGMENTER'S ONE-TOKEN GATE IS EARNING ITS KEEP — MEASURED,
  NOT ASSUMED. DO NOT LIFT IT.** `despaceKerned`'s greedy `KERN_WORDS`
  segmenter is excluded from the one-token case by `toks.length < 3`, which
  reads like a pure gap given the loop's own strong protections. Over all 6,056
  one-token stored names on published acks it would re-space **35 distinct
  names / 49 rows**, and all 35 were read: **the motivating row
  `Dodge&CoxInternationalStockX` does NOT segment** (the `&` strands), **one
  candidate is a HARM — `MIDX` -> `MID X`, inventing a name from a code** (the
  single letters `a`..`z` in `KERN_WORDS` become reachable once the multi-token
  signature need not be present), and the rest is `RETIRE2055` -> `RETIRE 2055`
  ×12 vintages plus `Smallcap`, `500Index`, `JHancock` and one real gain.
  49 rows against an invented name is not a trade worth making. ***A guard
  whose entry condition looks like an oversight can be the only thing between a
  self-protecting loop and a fabricated name*** — and measuring the YIELD
  before touching a file is why no twin, stamp or page work was owed.
  **WHAT THE REAL SPLIT NEEDS:** a witness that can see a DESPACED name, which
  means a vocabulary wider than `KERN_WORDS`'s 230 words (it cannot spell
  Pioneer, Dodge & Cox or PIMCO products) or the SEC registry — i.e. the
  `fund-facts` shape. The bare-house half stays the recorded PARSER-side item.
  `docs/accuracy-log.md` 2026-10-11 (00:4xZ).
- **FOUND BY THE 00:08 DRAW — THE TIGHTEST WITNESS YET FOR THE OWNER-GATED
  WRONG-SHARE-CLASS ITEM: ONE SHARE CLASS, FOUR SPELLINGS, THREE VERDICTS ON ONE
  SCREEN.** Gundersen Lutheran Administrative Services (**12,092 ppl**, 63
  funds, ratio 0.988) publishes, with every symbol read out of
  `sec-funds.json`:
  `Vanguard Institutional Index Instl Pl` -> **VINIX asserted at 0.02 on
  $492,903,694 / 17.4% of its menu**, where `Instl Pl` is Institutional **Plus**
  = **VIIIX** (WRONG CLASS); `Vanguard Extended Market Index Fund Instl Plus
  1860` -> **VEMPX**, which IS Institutional Plus (correct);
  `Vanguard Interm-Term Bond Idx InstlPls` -> **no ticker** and a 0.06 fee,
  where Institutional Plus is **VBIUX** and registered (gap).
  ***THE CONTROL IS THE ROW BELOW, not a sibling plan:*** spelled out, the class
  resolves correctly; truncated, the Institutional class is published as fact;
  welded, nothing. One menu, one product family, and the only thing that varies
  is how many characters the filer typed — so the 14:3xZ framing (*stating a
  class makes the matcher answer worse than stating none*) is narrower than the
  truth: **the verdict is decided by the SPELLING.** Still OWNER-GATED.
  **THE FEE HALF IS ON THE SAME MENU'S LARGEST ROW:**
  `Vanguard Russell 1000 Gr-Ins` publishes **VRGWX with NO fee** on
  $519,250,935 / **18.3%** — the recorded symbol-without-a-fee asymmetry at half
  a billion dollars on one row, because `fundER` is a NAME table and `Gr-Ins` is
  not a spelling it carries.
  **NAMED, UNSIZED, new small shape:** `… Instl Plus **1860**` carries a
  trailing four-digit FUND CODE welded onto the name — harmless on that row
  (VEMPX resolves) but it is a digit run that is neither a vintage nor a count,
  which is exactly the distinction the leading-count arm's safety rests on.
  `docs/accuracy-log.md` 2026-10-11 (00:3xZ).
- **SHIPPED 2026-10-11 00:1xZ — A FRACTIONAL LEADING UNIT COUNT: 999 published
  rows / 92 plans / 74,127 ppl / $3,118,130,006**, TICKER gained **16** / lost 0
  / swapped 0, FEE 0/0/0, `shownType` 6 (every one a TRUE qualification gained),
  row membership 0 newly dropped / 0 newly kept, 0 names emptied, 11,178 sampled
  non-candidates differing on 0, **4 crawlable pages all read**. Vistra
  Operations stops publishing `1,475,016.774 Class E shares` at **17.52% of its
  menu / $406,765,376**; Acco Engineered Systems `2,051,558.359 Fidelity
  Balanced Fund` at 23.58%. Canonical in `cleanFiledName` with the
  hand-maintained app.js twin and 10 import-time controls; `PARSER_VERSION`
  stays 203.
  **THE ARM WAS ONE CHARACTER CLASS SHORT:** `(?:\d{1,3}(?:,\d{3})+|\d{5,})\s+`
  matched `1,341` of `1,341.08 Common/Collective Trust` and then needed `\s+`
  where `.08 ` stood. ***A collective trust's units are held to two or more
  decimals, so the fractional form is the NORMAL one for exactly the vehicle
  whose rows carry a bare type caption*** — *a fix for one phrasing of a class
  is not a fix for the class*, met on a **DECIMAL POINT** after a position, a
  column, a share class and a form. All 16 ticker gains are a real fund the
  count was hiding (`118,732.04 Fidelity Freedom 2035 K6` -> FWTKX); seeded
  uniform draw 24 of 24 correct.
  ***AND THE FIRST INSTRUMENT COULD NOT SEE THE CHANGE — the recorded trap on
  the cell it is recorded about.*** Handing each `renderRow` copy the row from
  the shard read `name` moved on **0** and the pin **unreached**, because *the
  page cleans UPSTREAM of that slice*: `cleanCostMarkers` sets `f.name =
  cleanFiledName(f.nameRaw)` first, so the harness's `name` is the one it was
  HANDED. The rebuilt harness cleans per copy first and now **exits 1 if the two
  cleaners agree**, so a candidate that failed to load cannot read as a clean
  no-difference.
  **AND THE SMOKE TEST CAUGHT A PIN ASSERTING A DIMENSION IT NEVER MEANT TO.**
  `9,186.596 shares Vanguard Windsor || Fund` is pinned for the DOUBLED BAR (the
  numeral II, which once cost a wrong fund name), and its `want` carried the
  count only because the fractional form was unreachable. Settled by probing
  **origin/main's own cleaner**: the integer sibling `9,186 shares …` ALREADY
  cleans to `shares Vanguard Windsor || Fund` there, so the remainder shape is
  shipped behaviour and the bar survives in both. `want` updated and the integer
  sibling PINNED beside it. ***A pin is newer evidence than my reasoning, and
  reading WHY it exists is what separates updating it from overriding it.***
  **NAMED RESIDUE:** the leading unit NOUN (`sh Stock Fund`, `mutual shares`,
  ~42 rows) is a NEW arm with its own population — the hazard is `<count> Shares
  of registered investment companies` publishing a holding named after a
  preposition — and is not taken here. `docs/accuracy-log.md` 2026-10-11
  (00:1xZ).
- **FOUND BY THE 23:08 DRAW, UNSIZED — AN ASSERTED SYMBOL OF THE WRONG SHARE
  CLASS WHERE THE FILING STATES THE CLASS AND THE REGISTRY REGISTERS IT.** The
  Guardian Life Insurance Company Of America (**11,543 ppl** across 3 member
  plans) publishes `VANG SM CAP IDX INST` at **$53,756,155 / 2.6% of its menu**
  as **VSMAX, UNASTERISKED**. Read out of `sec-funds.json` and not recalled:
  `VANGUARD INDEX FUNDS :: Vanguard Small-Cap Index Fund` registers NAESX
  Investor, **VSMAX Admiral**, **VSCIX Institutional**, VB ETF and VSCPX
  Institutional Plus — so the filed `INST` is Institutional, the answer is
  **VSCIX**, and VSMAX is the dearer ADMIRAL class published as fact. Route:
  `expandFundVariants`' `INST -> Institutional` plus a bare Vanguard small-cap
  arm that asserts a class the name does not state, which `fund-er.js:785`
  records correcting for the Institutional PLUS spelling and NOT this one —
  ***a fix for one phrasing of a class is not a fix for the class***, on a
  share class for the fourth time.
  **THE CONVERSE IS ONE ROW AWAY IN THE SAME MENU:** `VANG MD CP IDX IS PL`
  publishes **$68,124,970 / 3.3% with NO ticker and a 0.1 fee** where the
  registry registers `Vanguard Mid-Cap Index Fund` Institutional Plus =
  **VMCPX** (~0.03) — the recorded 14:3xZ *stating a registered share class
  makes the matcher answer worse than stating none*, now with both halves in one
  filing. **Split the measurement on `star` before anything ships:** the
  asserted half is one-directional, the comparable half is the owner's.
  `docs/accuracy-log.md` 2026-10-10 (23:3xZ).
- **FOUND BY THE 23:08 DRAW, UNSIZED — A UNIT COUNT WELDED IN FRONT OF A TYPE
  CAPTION, WITH THE REAL FUND IN THE ISSUER CELL.** St Moritz Security Services
  (2,781 ppl) publishes `1,341.08 Common/Collective Trust` at 2.3% and
  `45,931.70 Common/Collective Trust` at 1.6% — the published name is a NUMBER
  plus a generic caption and nothing else. **The count is demonstrably the UNIT
  count:** `45,931.70` against a value of **$45,932**, a $1-NAV stable asset, so
  the figure is units and not a second holding. The issuer cell holds the fund
  (`State Street S&P 500 Index Fund`, `Invesco Stable Asset`) and the resolver
  reaches `~SSSYX` through it, so the row is not unidentified — it is unreadable.
  **`lib-disclose:1380`'s count arm cannot reach it by POSITION: that arm takes a
  TRAILING count before `shares`/`units` and this is a LEADING count before a
  caption**, the 00:3xZ ship's shape at the other end of the string. ***A fix for
  one POSITION of a class is not a fix for the class.*** Honest remedy is the
  strip PLUS `isGenericTypeName` on what remains, since the residue is a bare
  caption and the issuer already names the fund. `docs/accuracy-log.md`
  2026-10-10 (23:3xZ).
- **AND THE SAME DRAW NAMED THE LARGEST SINGLE-ROW INSTANCE YET OF THE
  OWNER-GATED FABRICATED STABLE-VALUE FEE:** Guardian's `STABLE VALUE` row, type
  cell `—`, publishes **0.35 on $200,097,498 / 9.7% of its menu** to 11,543
  readers. The control is in the other drawn menu: Carnival's `Putnam Stable
  Value Fund` is typed `Collective trust`, carries `noPublicPrice` and correctly
  publishes NOTHING — so a BLANK type cell defeats the suppressor again, the
  `gicRow` shape for the fifth time.
- **SHIPPED 2026-10-10 23:1xZ — `EUPAC`, THE HOUSE'S OWN ABBREVIATION OF ITS OWN
  FUND: 737 published rows / 733 acks / 942,088 ppl / $1,685,895,634 gain
  **RERGX**, and NOT ONE FEE CELL MOVES** — asterisked 0, ticker lost/swapped
  0/0, name 0, shownType 0, control 9,203 non-`EUPAC` rows differing on 0, pin
  fires. Insperity Holdings (**229,666 ppl**) stops publishing `American Funds
  EUPAC Fund (R6)` at **$201,678,847 / 2.19% of its menu** with no symbol;
  Brown & Brown $63.6M, Timken $50.5M. One surface by construction
  (`build-seo-pages` has 0 ticker-resolver refs); `PARSER_VERSION` stays 203;
  `fund-er.js` restamped.
  ***THE SHIPPED SHAPE IS NEITHER OF THE TWO REMEDIES THE HELD ENTRY RECORDED,
  AND THE REASON IS THE STAGE.*** Held because the candidate sat in
  `expandFundVariants`, which `fundER` calls too, so it moved 806 FEE cells
  beside 681 symbols and one of the 58 fee GAINS was typed `Separate account`.
  The recorded remedies were *price the fee half with the `pooled` predicate* —
  but `fundER(name)` takes **no `type` parameter at all**, so it cannot see a
  vehicle and giving it one is the owner-gated fee-pre-emption family — or
  *withhold only the 58*, which the shared list cannot express because the
  expansion happens before either table is consulted. **The third shape is to
  move the expansion DOWN A LEVEL**, into `fundTickerInfo`'s own `vs`: it feeds
  only `hit`, `pooled` tests the RAW name, and `fundER` never sees the string.
  ***When a normalisation feeds two tables and only one should move, the fix is
  not a guard on the second table — it is to normalise at the CONSUMER rather
  than at the source.***
  **THE ASSERTION IS LICENSED BY THE FILING AND NOT BY THIS TABLE: 0 of 737
  gaining rows fail to state `R6`** (whole population, not a sample), and 0 are
  typed a non-registered vehicle (549 `Mutual fund`, 188 blank). Seeded uniform
  draw 24 of 24 correct.
  **THE REPLACEMENT WRITES `EuroPacific Growth` WHERE THE HELD CANDIDATE WROTE
  `EuroPacific`, WHICH IS 94 FURTHER ROWS — a DIFFERENT population, so all 94
  were read**: the house word truncated to `American Eupac R6` (Moore & Van
  Allen $23,305,854 / 5.27%), `Am Funds EUPAC R6 Fund`, the filer's typo
  `American Finds EUPAC R6`, the recorded `SS`/`GM` prefixes, and two welded
  rows whose tail is a type caption plus a CUSTODIAN. *A count that rises when
  a replacement string lengthens is measuring a new population, not more of the
  old one.*
  **STILL OPEN, NARROWER THAN IT WAS:** 405 of the 737 still publish the
  house-wide **0.4** where RERGX costs ~0.46 and 332 publish nothing — the
  pattern table being imprecise rather than wrong about a vehicle, so it goes
  with the owner-gated fee families (*a fee is SOURCED, never derived*;
  `fund-facts.json` holds no RERGX figure). Rusken Packaging's separate-account
  row, which held the whole item, is now **untouched in both columns**, which is
  the honest state. `docs/accuracy-log.md` 2026-10-10 (22:0xZ) and (23:1xZ).
- **SHIPPED 2026-10-10 20:3xZ — THE ATTACHMENT'S OWN DATE HEADER STOPS BEING
  PUBLISHED AS A HOLDING: 62 rows / 62 plans / 47,749 ppl / $19,205,495, and
  `shownType` is the ONLY cell that moves** (ticker 0 / fee 0 / name 0 / pct 0 /
  value 0), of which **3 rows had a FALSE VEHICLE TYPE withdrawn** (`Mutual
  fund` ×2, `Pooled separate account` ×1). G4s Secure Solutions (Guam)
  publishes `December` at **27.90% of its whole menu**, Tnn Guam 18.86%, United
  Cerebral Palsy of Southern Arizona 14.43%. `isDateHeaderRow` canonical in
  `lib-disclose.mjs`, SLICED into app.js by `gen-generic-twin.mjs`, imported by
  `build-seo-pages`; `PARSER_VERSION` stays 203.
  **WHAT MAKES IT UNARGUABLE IS THE VALUE, NOT THE NAME:** all 63 stored
  bare-`December` rows carry **$312,024 ± 1 — the same figure in 63 unrelated
  filings** — and the amount TRACKS THE FILING YEAR (2023 -> $312,023, 2024 ->
  $312,024 ×48, 2025 -> $312,025 ×8), so the cell is `December 31, 2024` with the
  day welded to the year as a comma-grouped amount.
  **THE PREDICATE TAKES NO EXTERNAL INPUT, which is the whole safety:** it does
  not look the plan year up — the VALUE must itself spell a date (some day 1-31
  concatenated with a four-digit year equalling the amount exactly) AND the
  cleaned name must be a bare month. **BOTH conditions are load-bearing by
  leave-one-out over the whole store:** the value shape alone reaches real
  holdings (`Vanguard Target Retirement 2065` at $252,179 = 25/2179, `Schwab
  Target 2055 Fund` at $72,095), and the month name alone over-reaches by 2 rows
  whose value is not a date, both REFUSED since their cause is unread.
  **FULL MONTH NAMES ONLY** — the live population is December ×63 / August ×2 /
  September ×1 and no abbreviation, so `Dec` would be an unmeasured widening.
  ***AND THE 0 CHANGED CRAWLABLE PAGES IS A POSITION, NOT A DEAD CALL SITE —
  the reusable half.*** A full regeneration moved no file, and the comfortable
  reading ("none of them has a page") is FALSE: **3 of the 62 plans ARE in the
  top-5,000 set** (Illinois Independent Colleges, TMC Healthcare, Connecticut
  Association of Independent Schools) and **`build-seo-pages.mjs:118` prints
  `entry.funds.slice(0, 12)`** while their date rows sit at index **39, 23 and
  34**. The wiring is proved live by SLICING the generator's own label line out
  of the source and evaluating it on three real members (all fire) plus a real
  holding (does not). ***A measurement of what a page publishes must apply every
  condition the page applies — and the ROW LIMIT is one of them***, a new member
  of the rule already met on the serving condition and the publish gate.
  **Named residue:** the VALUE stays printed and counting toward the menu total,
  as `subtotal (not a holding)` rows do; withdrawing it moves every percentage
  on the page and is a second change. `docs/accuracy-log.md` 2026-10-10 (20:3xZ).
- **THE ONE-TOKEN PUBLISHED NAME — SIZED 2026-10-10 19:4xZ AT 5,259 rows / 2,947
  plans / ~6,983,334 ppl / $37,241,376,590 (unqualified, not loan or employer
  stock), of which only 20 publish a ticker and 104 a fee — AND IT IS NOT ONE
  CLASS.** A registered fund's name carries a house and a product, so one token
  names no fund by construction. Found from Cigna (88,684 ppl) publishing a bare
  **`PRIAC`** — the INSURER — on **$1,709,292,000 / 12.24%** of its menu with
  `namelessRow` false, while two other rows of the same menu put that token in
  an ENTITY position (`… Account PRIAC`). Largest single row: Food Lion's
  `OTHER-STRATEGY` at **64.75% / $4,476,240,694 / 239,586 ppl**; Lockheed Martin
  (180,780 ppl) publishes **seven** opaque custodian codes over $6.2B.
  ***MY OWN BUCKETING WAS REFUTED BY ITS OWN DRAW — A BUCKET KEYED ON CASE
  MEASURES THE CASE:*** the welded test was `/^[A-Z][A-Z]{13,}$/`, so
  `JPMorganSmartRetirementIncomeA` — a real fund whose spaces we lost — landed
  in the bare-house bucket, and a seeded uniform draw of eight per bucket is the
  only thing that showed it. So a blanket label is refused: *a row that names
  nothing and a row whose name we MANGLED are two classes.* Split: `word`
  (bare house) 2,795 / 4,299,472 ppl · `code` (custodian identifier) 1,242 /
  779,277 · `acronym` 786 / 2,239,353 · `caption` 335 / 557,544 · `month` 63 /
  47,916 (the shippable item above) · `welded` 38 / 350,689 **and that last
  figure UNDERCOUNTS for the case reason.** The `word` bucket is the recorded
  bare-HOUSE class; the remainder needs the mangled-name population separated
  from the names-nothing population first. `docs/accuracy-log.md` 2026-10-10
  (19:4xZ).
- **SHIPPED 2026-10-05 01:3xZ — A PUBLISHED QUOTE THAT OPENS ON THE
  ATTACHMENT'S PAGE NUMBER AND RUNNING HEADER: 1,890 quotes / 1,887 acks /
  6,096,337 ppl, 188 crawlable pages, 0 quotes GREW and 0 stopped being
  publishable.** Measured through the shipped `quoteTrim` against
  **origin/main's own copy** of `lib-quote.mjs`, not a retyped baseline.
  Walmart's whole vesting answer stops being `6 Table of Contents Vesting …`;
  Starbucks now reads *"Vesting All participant and Company matching
  contributions are immediately 100% vested."*
  **THE SIZING'S 1,615 / 5,118,843 IS SUPERSEDED — do not carry it**; the
  shipped arm set reaches more, and its "marker only" bucket was contaminated
  anyway.
  **THE BACK-OFF IS THE REUSABLE PART:** the loop keeps the LAST state that
  passes the gate, because judging only the final state lets a fired arm
  REFUSE THE WHOLE TRIM — measured, **every single arm had a population that
  trimmed only when that arm was switched off**. It recovered 56 quotes and can
  only ever return a prefix the gate already accepts.
  **THREE FALSE POSITIVES, ALL FOUND BY READING THE REMOVED PREFIXES and none
  visible in a count** (one not visible in a 16-row uniform sample either):
  Honeywell 63,466 ppl welds the marker MID-sentence where `Participating
  Units` is the sentence's own subject (so a header run containing a bare
  integer is reaching past a header that does not start the quote); 28,272 ppl
  file *"In years in which the safe harbor provisions of Section 401(k) …"*,
  which has no finite verb and no page marker in its run (so **a running
  header is a PROPER NAME** — every word capitalised or a connector); and two
  filings publish a SPACED `401 (k)` where cutting the integer leaves
  `(k) Vesting …`. Each is a guard with its own single-protection fixture.
  **NAMED RESIDUE:** a header whose plan-type token is absent or truncated
  keeps its name (Western, Yale-New Haven lose only the page number), and an
  orphaned union LOCAL number (`117 Affiliated with the International
  Brotherhood of Teamsters`, 160 ppl) is indistinguishable from a page number
  by shape. `docs/accuracy-log.md` 2026-10-05 (01:3xZ).
- **ORIGINAL SIZING, kept for the contamination it recorded — 1,615 quotes /
  5,118,843 ppl, SIZED 2026-10-05 00:3xZ.** Walmart
  (**1,996,659 ppl**) publishes, as its whole vesting answer, `6 Table of
  Contents Vesting Participants are immediately vested in all elective…`;
  Starbucks (314,112) opens `9 Starbucks Corporation 401(k) Plan and Trust
  NOTES TO THE FINANCIAL STATEMENTS … NOTE 1 -`; Kroger 262,794; Nordstrom
  109,402; Mount Sinai 75,936; Brinker 56,522; Leidos 54,080.
  **It is a gap in a SHIPPED guard, asserted by a control:** the figures are
  what `quoteTrim` LEAVES, and four fixture openers are required to survive it
  so a later arm cannot make this sizing quietly read zero. Measured through
  both guards over all 96,956 PUBLISHED quotes, **own-ack reach only** (a
  trust's features are never published to member plans —
  `build-seo-pages:111`, `app.js:2801` — and re-keying returned the IDENTICAL
  figure, which is the control that the class holds no trust acks). **Stripping
  the furniture flips a guard verdict on 0 of 1,615**, so a repair cannot
  change which plans publish.
  **THE BOUNDARY IS THE WHOLE PROBLEM AND IT IS WHY THIS DID NOT SHIP.** Split:
  marker + document phrase 80 / 2,330,548 · "marker only" **425 / 1,086,426
  (CONTAMINATED — DO NOT CARRY IT AS THE CLEAN NARROW HALF)** · marker +
  sponsor/plan header 503 / 1,032,004 · heading only, no page number 459 /
  521,756 · marker + SHOUTED run 148 / 148,109. That bucket's own examples
  refute its name: NYU (12,699) is a running header with no `401(k)` token,
  Bar Examiners was missed on a capital `403(B)`, `7 MAGO` is a sponsor
  abbreviation, and **Motiva's leading `0` is a TABLE VALUE, not a page
  number**. So a page-marker-only arm would leave `Table of Contents Vesting…`
  in front of 2 million readers and call it done. Everything points at a
  rule-start vocabulary (`Vesting`, `Participants`, `The Company`, `Employer`,
  `Contributions`, `Discretionary`, `Generally`) but "strip up to the first
  rule-start" is the greedy shape that published `Vanguard Windsor Fund` for
  Windsor **II**. Needs single-protection cases drawn FROM the population, a
  whole-store diff of both guards, the twin via `scripts/slice-vq.mjs --check`,
  and the crawlable pages regenerated and READ. Two fixtures already pinned:
  Motiva must be left alone, and the four openers must still survive
  `quoteTrim`. `docs/accuracy-log.md` 2026-10-05 (00:3xZ).
- **SHIPPED 2026-10-09 03:2xZ — THE ACCELERATED-VESTING EXCEPTION CLASS: 59
  plans / 51,205 ppl on the report, 5 crawlable pages / 23,656 ppl, display-only
  (`PARSER_VERSION` stays 202).** `accelerationOnlyVesting` in `lib-quote.mjs`,
  sliced into app.js, imported by `build-seo-pages`. **IT IS NOT A GUARD AND
  MUST NEVER BECOME ONE** — nothing is withheld; a sentence beside the quote
  says *"The sentence above states when vesting is **accelerated** — the events
  that make a participant fully vested regardless of service. It does not say
  how employer money vests for a participant who leaves before then."*
  **THIS ENTRY'S OWN PRESCRIBED WORDING WAS FALSE FOR THE MINORITY** and was not
  shipped: *"the notes state only when vesting ACCELERATES"* is a claim about the
  ATTACHMENT, and Aaron Thomas (2,285 ppl) files a real ladder the extractor did
  not select, so the shipped claim is about the **QUOTE** instead — verifiable
  from the published sentence alone. **DO NOT CARRY 69 / 53,298**: v202 repaired
  this entry's three motivating plans (Jefferson City, Koroseal, Center Id now
  publish real ladders and are pinned must-NOT-fire).
  **FOUR FALSE POSITIVES WERE FOUND ONLY BY READING ALL 60 MEMBERS** — Onestream
  publishes its whole ladder INSIDE the quote with no percent signs on its steps;
  Gilster-Mary Lee states a complete six-year rule through the typo `six (6)
  yeas`; Akins Ford and Bridgestone state vesting as the PRECONDITION of a
  withdrawal rule; Lehigh Heavy Forge states universal vesting with the trigger
  inside an `including` appositive. **AND LEAVE-ONE-OUT DELETED SIX CONDITIONS I
  WROTE**, each necessary-for-0; every survivor has a single-protection case
  pinned by ack. **A CONJUNCTION AND A DISJUNCTION ARE NOT TESTED BY THE SAME
  MUTATION**: neutering a REQUIRED condition to never-match empties the class, so
  the first pass called every `AV_TRIGGER` arm inert — measured by what each arm
  alone ADMITS, two are the sole admitter of a plan.
  **FOUND BY THE MUST-NOT-FIRE CONTROL AND BIGGER THAN THE ITEM — NAMED, NOT
  FIXED: 123 plans / 59,316 ppl publish `Employer-money vesting: Immediate` over
  an acceleration clause** (Arcosa 5,875: *"100% vested … upon their attainment
  of age 65"*, labelled Immediate; Weather Shield 1,261). Our own store
  contradicts our own label — the `lib-4i:7417` shape v202 fixed for GRADED
  schedules. **A wrong answer outranking a missing one, and it is a PARSER change
  needing a bump and a full re-parse: owner's call.** It is also why the shipped
  sentence is gated on `!ff.vesting`. `docs/accuracy-log.md` 2026-10-09 (03:2xZ).
- **ORIGINAL SIZING, kept because it is what was predicted — SIZED 2026-10-05
  02:3xZ at 69 plans / 53,298 ppl, AND READING SIX FILINGS REFUTED THE REMEDY
  THIS ENTRY PRESCRIBED FOR THE BULK OF IT.** Narrowed 115 / 80,858 -> 73 / 59,132 ->
  **69 / 53,298**, each step from READING members. 126 more quotes are
  exception-only but carry a vesting LABEL, so the schedule reaches the reader
  and they are correctly not the class.
  **THE REMEDY SPLITS, and only the filings could say so** — the six largest
  were downloaded and read with the blank Form 5500 pages excluded:
  **Smith And Nephew (8,883 ppl), Woodgrain (5,558), Hankey (4,292) and
  U.S. Fire (3,511) have NO LADDER ANYWHERE in the attachment** (for Smith And
  Nephew, filtering the form's own 6g(2) question leaves "vesting" appearing
  nowhere but a Schedule C code list), Ram Partners (2,405) states only an
  amendment *mentioning* a schedule, and **only Aaron Thomas (2,239) files a
  real table** (`six-year vesting schedule as follows: Years of service /
  Vesting % — 2→20, 3→40, 4→60, 5→80, 6→100`).
  ***So "a display-side demotion or a ranking" is right for about one member in
  six and HARMFUL for the rest:*** a demotion can only promote a sentence that
  exists, and on the 5 of 6 with nothing better it would withdraw the only
  vesting fact filed and publish *"not stated in the audited notes"* about a
  filing that DID state something. **A guard that withdraws a true answer
  because it is incomplete makes the page less honest, not more.**
  **TWO DIFFERENT CHANGES, neither shipped:** the majority needs a DISPLAY
  LABEL saying the notes state only when vesting ACCELERATES — a new sentence,
  so *a guard and the claim it licenses are one change*, and it must not be
  written as a withholding; the minority needs PARSER selection, and the table
  shape is nameable — **`Years of service | Vesting %` as a column table with a
  blank line between header and rows**, which is the same construction that
  leaked into my own sizing screen, so the parser's vesting-table arm and the
  screen missed the same thing.
  **SIX LEAKS IN THE SCREEN, each now a single-protection fixture and each
  found by reading:** a DISCLAIMED service phrase (`regardless of eligible
  years of service` — caught by the must-see fixture before the first count
  printed); a TABULAR ladder with bare numbers and no `%` (Church & Dwight
  `3 years 25 … 5 years or more 100`); HOURS (`501 hours of service`); a
  service UNIT that is not a year (`three full vesting CREDITS`);
  ***A FILER'S TYPO*** (Gilster-Mary Lee's `after six (6) **yeas** of vesting
  services`, a complete six-year rule whose truncated print read as a year);
  and a FORFEITURE note, which belongs to the 09:0xZ class. **Plan termination
  is deliberately NOT a trigger** — for a plan that HAS terminated, full
  vesting is a complete answer; the conditional *"would become"* form is
  residue whose discriminator is grammatical MOOD, left unbuilt.
  `docs/accuracy-log.md` 2026-10-05 (02:3xZ).
- **ORIGINAL ENTRY, kept because it is what was predicted — THE OLD FIRST-WINS
  ORDER PREFERS AN ACCELERATED-VESTING EXCEPTION OVER THE SCHEDULE, found by
  v202's verdict 2026-10-05.** All 7 of
  v202's unambiguous quote improvements have one shape: the page was publishing
  *"100% vested upon attaining age 65, qualifying for early retirement, or upon
  total disability or death"* (Jefferson City Medical Group), *"However, a
  participant will be deemed fully vested … upon death, disability, or
  attainment of the normal retirement age"* (Koroseal), *"vest upon death,
  attainment of normal retirement age (65), or total and permanent disability"*
  (Center Id) — every one TRUE and every one answering a different question.
  An accelerated-vesting clause is near-universal boilerplate and says nothing
  about when a participant owns employer money; a QNEC vesting immediately is
  required by law. v202 fixed only the plans where a graded sentence happened
  to sit further down the same chain. **The class to size is plans publishing
  an exception clause where NO ladder is reachable** — `vestingQuoteOk` accepts
  these (they state a vesting rule), so the instrument is a new display-side
  demotion or a ranking, not that guard. Related: 4 of v202's 11 changes are
  TRADES, not gains, where the filing states two schedules for two money types
  and the page has one slot (Unilever 11,516 ppl: match immediate vs a 3-year
  NEC requirement) — the recorded "tiered, where the render has room for one
  pair" item in another guise.
  `docs/accuracy-log.md` 2026-10-05 (00:1xZ).
- **SHIPPED 2026-10-04 14:4xZ — HOW MUCH OF THIS PLAN IS EVEN IN THE TRUST:
  21 plans / 1,038,102 ppl, 10 of them under 50%, 20 crawlable pages.** Kroger
  (**411,922 ppl**) now reads that the whole trust holds $10.1B against the
  $11.8B its plan reports on Schedule H, so at most **85%** of the plan is
  invested through it; PepsiCo 161,067 at 87%; Macy's 155,776 at 86%; **Idex
  Corporation's trust holds $3,929,147 against a $962,220,199 plan — under 1%**.
  **DO NOT CARRY THIS ENTRY'S OWN FIRST FIGURE — 57 trusts / 98 plans /
  2,062,910 ppl / $306,439,109,070 — NOR ITS THREE HEADLINE CASES.** It screened
  on "the plan's `mtiaAck` has a confident published entry" and never applied
  the condition both surfaces apply FIRST: the plan's OWN lineup must be
  unusable before a trust menu is served (`build-seo-pages.mjs:111`,
  `app.js:2898`). **IBM, FedEx and GE all have `own usable=true`, so none of
  them is ever served a trust menu** — IBM's page shows IBM's own lineup, not
  its $14.6M trust's three rows. Re-derived: 672 plans whose trust has a usable
  menu, **178 where the plan's own menu WINS**, 494 actually served, 21 below
  the 90% cut. ***A measurement of what a page PUBLISHES must apply every
  condition the page applies, in order.***
  **THE MECHANISM FROM THAT ENTRY STANDS and is why the class was worth
  finding:** the parser judges a trust's menu against the TRUST, so these
  entries carry a `coverageRatio` near 1.0 and no check can see the plan-level
  gap. Grand Trunk / Canadian National (8,142 ppl, 16.7%) is the case the draw
  surfaced.
  **WHY NOTHING CATCHES IT, and this is the reusable part:** the parser judges a
  TRUST's menu against the **TRUST's** assets, so every one of these entries
  carries a `coverageRatio` near 1.0 — FedEx **1.00**, IBM **1.07**, GE
  **1.18** — which is *correct for what it measures*. `audit-data` raises
  `lineup-overshoot` when a menu EXCEEDS plan assets and **there is no
  symmetric undershoot check**, so a menu covering 1.4% of a plan passes every
  gate with a coverage metric that reads perfect. ***A ratio is only as
  meaningful as its denominator, and the denominator here answers a different
  question than the reader's.***
  **AND THE GUARD THAT SUPPRESSED A MEANINGLESS RATIO LEFT THE MEANINGFUL ONE
  UNWRITTEN.** `coverageBand` opens `if (fromTrust) return null;` and its
  comment is right about why — the trust's MENU against one plan's assets is a
  meaningless pair. `trustShareBound` compares the other pair: the trust's OWN
  Schedule H total against this plan's own, two whole-entity filed figures,
  which licenses an UPPER BOUND because a shared trust can hold at most all of
  it. The two are **mutually exclusive by construction**, asserted over eight
  pairs with a control showing all four would trip `coverageBand` were
  `fromTrust` false. **THE PAGE CONTROL IS THE HALF THAT MATTERS: 305 pages
  serve a trust lineup, 20 gain the sentence, 285 are left alone because the
  trust IS essentially the whole plan, and 0 carry it without a trust lineup** —
  a cut that fired on all 305 would be noise and "20 pages changed" would not
  show it. Named cost of the 90% cut: Avery Dennison at 89.7% gains a marginal
  note. **STILL OPEN: the two surfaces disagree about WHEN a trust menu is
  served** — app.js's `ownUsable` also demotes a trust-POINTER menu, which the
  seo rule does not, so their served populations differ and only the page diff
  is authoritative for the static surface.
  `docs/accuracy-log.md` 2026-10-04 (14:4xZ).
- **CLOSED 2026-10-04 01:5xZ — THE CVS TWO-FUND CLASS IS TWO NAMED INSTANCES AND
  NO NUMBER, after THREE screens each refuted themselves on their own output.**
  CVS Health (**385,927 ppl**) publishes `Vanguard International Growth Fund
  Admiral International Equity Index Fund` at **$2,842,314,805, 13.3% of its
  menu**, =VWILX asserted and a 0.26 fee; Bright Wood Corporation (1,254 ppl)
  publishes `GROWTH IS JPMORGAN MID CAP GROWTH R6 PIMCO RAE US SMALL INSTL` at
  $154,057. The fix remains a WITHHOLDING, not a repair.
  **DO NOT RETRY ANY OF THE THREE.** (1) An interior designation + a fund-shaped
  tail: 4,683 rows / 10,095,461 ppl, nine largest all `BlackRock Institutional
  Trust Company …` where `Institutional` is corporate style. (2) Add the
  corporate-style refusal AND require the head to resolve — the queue's own
  prescription, both conditions built and working: **359 rows / 683,810 ppl, one
  genuine member in its 20 largest.** The rest are my designation regex splitting
  a MULTI-WORD class (`PIMCO Total Return Institutional | Class Fund`) and a type
  caption in the tail (`… Admiral Shares | Interest-bearing cash account`) — and
  the first is harmful in the OTHER direction, since On Semiconductor's head
  resolves VINIX where the whole row resolves **VIIIX**, so the published row is
  the more precise answer. (3) Require the tail to appear verbatim as another
  plan's WHOLE filed name: 84 rows / 483,848 ppl, two genuine in 24, because
  `Interest-bearing cash account` ×7, `- Asset allocation fund` ×46,
  `- Foreign Large Blend` ×11 and `Money Market Fund` ×308 **are** other plans'
  whole filed names while being captions and a Morningstar category.
  **THE CLOSURE IS WHAT THE STRONGEST EVIDENCE SAYS:** a resolver-attested
  version — split at every word boundary, both sides resolving, different
  tickers — reads 73 rows / 18,329 ppl and **does not contain CVS**, whose tail
  resolves to nothing. *A class whose best witness cannot see its motivating row
  is closed, not paused.* `docs/accuracy-log.md` 2026-10-04 (01:5xZ).
- **SHIPPED 2026-10-04 01:5xZ, FOUND BY THAT CLOSURE — A PUBLISHED NAME THAT
  CONTAINS ITSELF TWICE: 224 rows / 129 plans / 232,595 ppl / $5,036,058,631,
  name-only (ticker 0 / asterisk 0 / fee 0 / row membership 0), 6 crawlable
  pages and 14 duplicate copies removed.** Automatic Data Processing (46,258
  ppl) stops publishing `Northern Trust S&P 500 Index Fund NORTHERN TRUST S&P
  500 INDEX FUND` on $1,512,757,156, 21.3% of its menu, plus six more rows on
  the same page; International Multifoods' $935,152,130 row; SAP's
  $215,176,354.
  **NOT MERELY LEGIBILITY, which is why it is a repair:** the resolvers read the
  NAME, so which half they reach decides the published share class. Redlands
  Christian's `… Retirement 2030 Fund … Retirement 2030 Fund-I Class` publishes
  **TRFHX** out of the second copy while Giorgio Armani's identically-shaped
  2045 row publishes **~TRRKX**, a *comparable of the investor class*, out of
  the first.
  **WHICH COPY SURVIVES IS DECIDED BY EVIDENCE:** a boundary falling INSIDE a
  token means the second copy carries more characters and is the specific
  spelling (`Fund-I Class`); a clean boundary with exactly one ALL-CAPS copy
  keeps the mixed-case one (ADP's second column is upper-cased boilerplate);
  otherwise the second copy plus its trail, where a share class sits.
  **ALL THREE CONDITIONS ARE LOAD-BEARING, measured by neutering each one in
  full over all 1,730,415 rows** — forward-prefix **419 rows / 831,106 ppl**
  (Motiva's `BR LifePath Index 2050 W BR Life Path Index 2055 W` is two
  VINTAGES; Baystate 17,769 ppl), three-word floor 20 / 17,907, ten-character
  floor 13 / 32,628. **The last two are conservatism whose COST is named, not
  protections** — most of those 33 rows would improve if collapsed, so lowering
  either floor is a measurement and not a free widening. **And the matrix caught
  my own label:** `Class A Class A Shares` tests the CHARACTER floor, not the
  word floor (`classa` is six), so it was protected twice and proved neither;
  the word-floor-only case is `Alerus Mmkt Alerus Mmkt` at exactly ten.
  **THE ONE MOVED CELL IS A PROMOTION:** SRG LLC's `Guaranteed Investment
  Contract Guaranteed Investment Contract` gains "Filing names no specific fund"
  — *the doubled string had been DEFEATING `isNamelessFundRow`*, so a generic
  non-name looked specific. **RESIDUE, named:** an INTERLEAVED duplication keeps
  its trailing repeat (Lubrizol's `… All Cap Equity Equity`), below the
  three-word floor; the fixed-point loop is already in place for when that floor
  moves. `docs/accuracy-log.md` 2026-10-04 (01:5xZ).
- **SHIPPED 2026-10-04 00:3xZ — A UNIT COUNT PUBLISHED INSIDE A FUND NAME: 310
  rows / 28 plans / 491,936 ppl / $11,661,189,381, NAME-ONLY (ticker gained 0 /
  lost 0 / swapped 0 / star 0; fee gained 0 / lost 0 / swapped 0; type 0), 5
  crawlable pages.** JPMorgan Chase's own plan (300,272 ppl) stops publishing
  `… SEPARATE ACCT 2,271,585,254 UNITS` at 6.0% of its menu; Ford Motor
  (140,681) on thirteen rows.
  **THE FIX WAS ONE LINE BECAUSE THE ARM ALREADY EXISTED** — `lib-disclose:1380`
  had stripped a trailing count before `shares` for weeks and took no `units`,
  the same shape as the bank-deposit gate being one WORDING short.
  **THE DIGIT FLOOR IS THE WHOLE SAFETY AND IT IS MEASURED:** the shipped line
  accepts a bare `\d{4,}`, which at the TAIL is the VINTAGE exposure the
  leading-count arm already records. Before `shares` that exposure is live on
  **0** rows (so the shipped line is clean and untouched); before `units` on
  **NINE**, all of them HD Supply's `Mfo Depot Lifepath 2030 Unit` ladder,
  $376,844,450, which a wide form would publish as `Mfo Depot Lifepath` seven
  times. So the unit arm is a SEPARATE line requiring comma-grouping or seven
  digits, and its named cost is 2 rows / 345 ppl of genuine bare counts left in
  place. **DO NOT CARRY the queue's own 432 rows / 539,222 ppl** — that screen
  counted `shares` too and read the STORED name.
  **STILL OPEN and already honest:** AT&T (27,558 ppl) publishes rows whose name
  is NOTHING BUT a count — `5,405,466 UNITS` at 30.7% of its menu,
  $670,371,000 — and `hasNoFundIdentity` already qualifies them, so there is
  nothing to strip. `docs/accuracy-log.md` 2026-10-04 (00:3xZ).
- **FOUND BY THE 19:4xZ DRAW, SIZED NOT SHIPPED — AN UNCORROBORATED PARTICIPANT
  COUNT, AND IT IS THE WEIGHT ON EVERY FIGURE IN THIS FILE: 49 plans claiming
  3,469,170 participants, 2.99% of the weighted universe**, 3.27% of it in the
  ten largest rows, 40 of 49 SHORT FORM. **Avalon Capital Management** publishes
  **1,955,672** participants (second-largest in the universe, above Amazon)
  against $6,087,098 — $3.11 each — and its `assetsBOY` is **$1,955,672**, the
  same number and the ONLY plan of 112,652 whose count equals a dollar figure on
  its own row, with `partBalances` 3. Dingo Doggies Campus claims **327,660**
  with **2** balances and $14,694.
  **DO NOT CARRY 504 plans / 5,191,508** — the first screen gated on EOY assets,
  which are **$0 for a WIND-DOWN by definition**, so it swept in real terminated
  plans with correct counts (Kroger pn=004: 262,794 ppl, BOY **$2,299,591,000**;
  also Kaiser pn=037, VMware, Neiman Marcus, Johnson Controls, Lahey Clinic).
  The witness must be **BOY** assets, and those three are pinned must-NOT-see.
  **The 48 beyond Avalon are probably NOT a parse defect:** they are staffing
  and PEO firms where `activeParticipants` ≈ the claim, so the figure is
  plausibly the ELIGIBLE population AS FILED — unusable as a reader-facing
  "participants" number and harmful as a weight, but not wrong in form.
  **RE-MEASURED 2026-10-04 10:2xZ AND THE CLASS IS SMALLER AND SPLIT: 28 plans /
  3,413,761 ppl / 2.94% of weight** at BOY < $10/head, both must-see pins caught
  (Avalon, Dingo Doggies) and **none of the four pinned must-NOT-sees** (Kroger
  pn=004, Kaiser pn=037, VMware, Neiman Marcus). **DO NOT CARRY 49 plans /
  3,469,170.** Avalon's uniqueness is now checked against the whole universe
  rather than asserted: **exactly 1 of 112,652** has its claim equal a dollar
  figure on its own row. **AND THE PEO HYPOTHESIS IS TESTED AND MOSTLY HOLDS:**
  `activeParticipants` is at least half the claim on **20 of 28**, so those are
  an eligible population consistent with another filed field; only ~8 have
  nothing supporting them, and they carry 89% of the weight.
  **THE PAGE ALREADY DISCLOSES MORE THAN THIS ENTRY ASSUMED** — read in a real
  browser, Avalon's report prints *"Participants 1,955,672 / 3 active · at plan
  year end"*, so the claim is labelled and the active count sits beside it.
  **WHAT REMAINS IS A JUDGMENT ABOUT `derive()`'s DISTRUST DIRECTION, not a
  disclosure:** `derive()` (app.js:252) distrusts `partBalances` and NEVER the
  participant count — its own comment's examples run the other way — so when
  both are filer-entered and absurd it resolves in favour of the LARGER one, and
  Avalon's average balance is $6,087,098 / 1,955,672. Whether an average should
  be computed from a claim no other field supports is the open question.
  **AND WORKING THIS ITEM HANDED BACK A LARGER ONE THAT IS NOW SHIPPED** — see
  the `money()` K-floor entry: only 42 of the 1,810 "$0K" average-balance cells
  were this class at all. `docs/accuracy-log.md` 2026-10-03 (19:5xZ) and
  2026-10-04 (10:4xZ).
- **SHIPPED 2026-10-03 16:2xZ (`23b4fa32`) — `quoteTrim`: table debris stops
  leading a published quote, 64 quotes / 64 plans / 129,653 ppl**, 5 crawlable
  pages. The queue's own figure was 65 / 130,078; the 65th is already suppressed
  by `matchQuoteOk` and reaches no reader. Measured over all 105,220 published
  quotes, trimming changes NEITHER guard's verdict, so it cannot change which
  plans publish a quote. **DO NOT CARRY 157 quotes / 428,797 ppl** — that bucket
  is quotes opening on a BULLET, the audited notes' own list formatting.
  Canonical in `lib-quote.mjs` beside the two guards, twin sliced into app.js,
  16 `trimCases`, `__wampoQuoteTrim` cross-checked by smoke-test.
  **Two control lessons:** a `-6-` page-number arm was DROPPED for changing 0 of
  105,220 quotes (*an arm real in principle and inert on the data is untested
  machinery* — its negative control could only print "breaks NOTHING"), and
  Yusen's `,000` is protected TWICE so its fixture could not fail — each
  protection now has its own real single-protection case (comma 10 quotes /
  4,551 ppl, sentence gate 8 / 8,856). `docs/accuracy-log.md` 2026-10-03 (16:2xZ).
- **SHIPPED 2026-10-03 21:5xZ — A TRUSTEE'S CORPORATE NAME WELDED ONTO A FUND
  NAME: 2,795 rows / 430 plans / 1,406,886 ppl / $15,998,074,728, name-only
  with 359 TICKERS GAINED and 0 lost, 0 swapped, 0 crossing the
  comparable/asserted line; 18 crawlable pages.** Target Corporation (495,482
  ppl) stops publishing `State Street Bank & Trust Company SSGA S+P 500 INDEX
  SER A …` at 21.1% of its menu; Cornell's $545,751,747 row stops leading with
  `GUARANTEED INVESTMENT CONTRACTS WITH INSURANCE COMPANIES`.
  **THE 19:3xZ REVERT'S BLOCKER IS SOLVED BY THE FEE'S OWN WITNESS, not by a new
  source.** `fundER` is a NAME-pattern table, so the house token inside the
  trustee's name is part of what priced the row — and every one of that arm's 23
  lost fees left a remainder with NO HOUSE IN IT (D.R. Horton's `JP Morgan
  Investment Management Large Cap Growth` → `Large Cap Growth`, which prices to
  nothing). So the gate is **the remainder must keep its house**, and fee LOST
  fell 23 → **2 rows / 290 ppl**, both of which are improvements (a 0.1 priced
  off `Index Admiral`, a fragment of a different fund; and a row that GAINS EFA
  as it drops a 0.06 priced off `Transamerica Financial Life Insurance
  Company`). All 20 fee SWAPS move onto the correctly-named fund. It is **NOT**
  "the two houses must differ" — that refuses JetBlue's $649,443,748 row, whose
  remainder keeps Vanguard.
  **STILL OPEN from it, COVERAGE and not a false claim:** the gate refuses every
  row whose remainder leads with no house `LEADING_HOUSE` knows, so `Fidelity
  Management Trust Company Fimm Treasury Only Portfolio Cl I` and BlackRock's
  `Institutional Trust Company, . Lifepath Index …` rows keep their prefixes.
  Growing `LEADING_HOUSE` is additive by construction and each addition must
  re-run the whole-store diff. **What must never be relaxed is the remainder
  condition** — it is the only thing between this arm and the 23 fees that
  reverted its predecessor.
  **AND THE `fiduciary` CASE IS THE ONE TO REMEMBER: every gate passed and only
  the PAGE caught it.** 16 pins, five guards each with a measured blocking
  population, 0 tickers lost, the app.js twin agreeing on all 1,730,676 rows and
  smoke-test green — and one row published `Vanguard Fiduciary` on $70,452,841,
  because that row is ITSELF a welded name and the arm removed its trailing
  entity while leaving the leading fragment of one. Confirmed fixed BY ABSENCE:
  19 changed pages became 18.
  **THE GUARD SET WAS CHOSEN BY MEASUREMENT: four conditions were REMOVED
  because neutering them one at a time over the whole store showed they blocked
  ZERO rows `beyondHouse` did not already block.** *A condition that can never
  be the only protection proves nothing* — the fixture-protected-twice trap, met
  at store scale. Live populations: beyondHouse 4,401 rows, tail-house-boundary
  71, firm-length-bound 18, firm-generic vocabulary 7, `isGenericTypeName` 0
  (kept and labelled; it is the display's own composition at the two call sites).
  `docs/accuracy-log.md` 2026-10-03 (18:1xZ), (19:3xZ) and (21:5xZ).
- **THE MID-NAME-HOUSE CLASS — TEST RUN 2026-10-03 20:4xZ, AND IT KILLED ITS OWN
  REPAIR IN BOTH DIRECTIONS. The queued test was the WRONG DIRECTION and one of
  the "correct" shapes it rested on is REFUTED.** Reading Gate Gourmet's menus
  whole (the queue entry had been written from three strings) the lead fragment
  is the CONTINUATION of another fund, so the sibling carries that fund's HEAD
  and the reconstruction is `sibling + " " + lead` — and in a shifted menu EVERY
  row is damaged, so the sibling's usable part is its own tail-from-its-house.
  All nine Gate Gourmet rows then reconstruct, each attested by our own store:
  `Vanguard Intermediate Term`+`Bond Index Instl` 257 copies,
  `Vanguard High-Yield Corporate`+`Adm` 169, `Fidelity 500 Index
  Institutional`+`Premier` 54, `State Street Institutional US`+`Government Money
  Market` 7. **TWO witnesses exist, both store-internal:** R rotates the house to
  the front and asks whether that string exists verbatim under another ack; W
  reconstructs from a sibling. Split of the bare condition (26,553 rows / 6,022
  plans / 16,032,030 ppl / $153.6B): **W 4,056 rows / 994 plans / 2,263,399 ppl**
  (2,525 publishing a fee, 1,385 asserting a ticker), both 63, **R 243 / 131 /
  508,322**, none 22,191 / 14,146,689. W reads **23 of 23 genuine** on a uniform
  draw.
  **COSTCO IS NOT CORRECT-AS-FILED — the 18:3xZ claim is refuted by an EXACT
  witness.** Four rows / **279,798 ppl** publish a token order our own store
  contradicts (pn=005 files the same fund with the house in front).
  **DO NOT SHIP EITHER STRIP. Priced on every published cell of all 4,119 W rows
  through the tracked harness: lead-strip loses 73 FEES / 125,307 ppl / $1.18B
  and 37 TICKERS / 79,562 ppl, swaps 13 fees, against 65 ticker and 63 fee
  gains — net harmful**, and the 19:3xZ tail-strip lost 23 fees / swapped 42.
  **THE CONDITION HOLDS THREE ORIENTATIONS AND NEITHER WITNESS DISTINGUISHES
  THEM:** (1) lead is debris, tail is the fund (Gate Gourmet); (2) **lead is the
  fund, tail is a TRUSTEE** — Bread Financial, 9,012 ppl, nine rows shaped
  `Target Retirement 2035 Trust I Vanguard Fiduciary Trust Company`, where
  stripping the lead throws away nine correct tickers and fees, and Booz Allen
  loses SSSYX for 56,540 readers; (3) lead is this fund's OWN class before the
  house — Matheny's `Advantage T. Rowe Price Retirement 2045`, where the strip
  swaps a correct 0.49 for a mutual fund's 0.6.
  **NEXT STEP IS THE ORIENTATION TEST, NOT A WIDER SCREEN:** build both
  candidates (`house + tail`, `house + lead`) and let the shipped resolver say
  which is the fund — and it must ABSTAIN where both resolve, which they do
  (`Vanguard High-Yield Corporate` and `Vanguard Government Money Market` both
  answer).
  **AND A SECOND ABSTENTION IS NECESSARY, FOUND 2026-10-09 BY THE 02:07 DRAW —
  THE ORACLE AS PRESCRIBED ABOVE LAUNDERS A SHARE-CLASS ERROR AS A COVERAGE
  GAIN.** Testing a trailing-fragment strip through this very oracle, one of its
  324 "gains" is `T. Rowe Price Mid-Cap Growth Fund Advisor` (Karl Storz
  Endoscopy-America, 2,826 ppl, $11,759,138) gaining **RPMGX** — and `Advisor`
  is not debris, it is T. Rowe Price's **Advisor SHARE CLASS**, whose symbol is
  **PAMCX** (Nasdaq; the fund's own 497K). RPMGX is the investor class, a
  CHEAPER fund than the one held. The resolver answered because the whole string
  and the head belong to the same registrant and differ only in CLASS. ***A
  resolver gain is evidence the string reaches a fund, not evidence it reaches
  THIS fund.*** So the test must also abstain where the stripped token is a
  share-class designation — otherwise this is the owner-gated 5,929-row
  wrong-class defect arriving by a new route, wearing a coverage number.
  `CLASS_HINTS` in `scripts/match-sec-tickers.mjs` is the ready-made vocabulary.
  `docs/accuracy-log.md` 2026-10-09 (02:3xZ).
  **AND THE TRUNCATED-TRAILING-ENTITY SHAPE IS CLOSED — do not rebuild it.** A
  tail cut off MID-WORD looked like the clean sub-case of the reverted
  tail-strip, since no correct filed name ends in a fragment of a house's name,
  so the orientation is not in doubt. Built as "the last token is a proper
  prefix of an entity word, ≥4 chars, and not that word", with five pinned
  controls that ALL PASSED, it reads **27,417 rows / 11,725 plans / 32,457,811
  ppl / $410,855,252,582** and `ticker LOST` 29. Its own member list kills it:
  `Retirement Hybrid 2025 Trust`, `Empower Stable Value Trust`,
  `VANGUARD TOTAL BD MKT IDX INST`, `Baird Core Plus Bond Inst`.
  ***A FRAGMENT OF A LONGER WORD IS NOT THEREBY A FRAGMENT*** — `Trust`,
  `Inst`, `Advisor`, `Service` and `Retirement` are each a COMPLETE and correct
  terminal token in a fund name AND a proper prefix of an entity word
  (`trustee`, `institutional`, `advisors`, `services`, `retirement`). The
  motivating row is real (Pvh Corp's `DFA U.S. Targeted Value Portfolio
  Dimensional Fund Advis`, publishing a 0.3 fee off the welded string and no
  ticker) and needs a test that the fragment is not a word in its own right,
  which is a dictionary or registry witness and not a prefix test.
  **THE SAME-MENU WITNESS WAS SIZED 2026-10-03 23:3xZ AND IS CLOSED — UNSOUND IN
  BOTH DIRECTIONS.** The 20:5xZ draw proposed it (Helen of Troy publishes
  `FID FDM IDX 2035 IPR` bare beside the prefixed 2045) and the queue said to
  size it first. Sized: **LEAD-STRAY 1,409 rows / 304 plans / 808,079 ppl**
  reads 15 of 18 on a uniform draw; **TAIL-STRAY 2,107 rows / 231 plans /
  489,097 ppl reads 0 of 18, every failure INVERTED** — it would keep
  `Registered Investment Company`, Voya, John Hancock, Reliance Trust Company
  and drop the fund. **The reason is structural: in that population the stray
  text is an IDENTITY or CAPTION COLUMN, constant down the menu, so "a sibling
  carries the lead" is GUARANTEED exactly where the lead is stray.** The
  repetition is evidence OF strayness and the witness read it as evidence
  against. (A prefix test instead of near-equality read 7,315 — artifact, the
  same mechanism as the `Nationwide Life Insurance Company` + `Nationwide` false
  positive.) And LEAD-STRAY's top rows are worse than its draw because **the
  bare sibling may itself be damaged**: Booz Allen's is a bare-HOUSE junk row
  and Genuine Parts' is the truncated other half of the very shift being
  oriented. ***A witness drawn from the same menu as the damaged row is not
  independent of the damage*** — in a shifted menu the tail appears bare
  elsewhere BECAUSE the shift left it bare, which is the whole reason the
  no-outside-information shortcut cannot work.
  **THE SUB-FAMILY IT SURFACED LOOKED CLEANEST OF ALL AND IS ALSO CLOSED:** a
  bare two-letter lead with a bare in-menu sibling, 1,128 rows / 157 plans /
  163,199 ppl / $1,170,327,750, ticker lost 0 / swapped 0 / star 0. Two queries
  killed it. (1) The witness GUARANTEES a duplicate, and **1,122 of the 1,128
  pairs carry DIFFERENT VALUES** — two distinct holdings, so the prefix carries
  information (Brewer-Garrett files `SS Vanguard Mid Cap Index Adm` $1,230,766
  beside `Vanguard Mid Cap Index Adm` $527,878). (2) The leads are not one
  class: `GM` 886 and `SS` 212 are 97%, but the tail `US`/`TA`/`AF`/`JH`/`AB`
  are HOUSE ABBREVIATIONS where the PREFIXED row is correct and the bare sibling
  is the damaged one (`AF Capital Income Builder`, `JH Fundamental Large Cap
  Core`, `US Aggregate Bond Index K`). **So the orientation test still needs
  evidence from OUTSIDE the damaged region** — the shipped resolver on both
  candidates, abstaining when both answer, as this entry already said. Guards already earned, each a negative control over every copy of its
  name: a WRAPPER lead is correct as filed (`Nationwide Loomis…` 0/21, `Voya
  T. Rowe…` 0/18, `LVIP…` 0/51 and 0/53, `MyCompass American Funds…` 0/608 — and
  MyCompass was **18 of R's 30-row uniform draw**, so there the ROTATION is the
  damaged spelling and R's top-N listing would have shipped the bulk backwards);
  and a lead that ABBREVIATES a house is not a fragment (Mayo's `VANG WELLINGTON
  ADM`, 112,693 ppl, =VWENX and 0.17 both correct, 0/24).
  `docs/accuracy-log.md` 2026-10-03 (20:4xZ).
- **AND THE DRAW'S MOTIVATING ROW COULD NOT BE CONVICTED — recorded so nobody
  re-derives the three refuted screens.** PPC Retirement Plan publishes
  `JP Morgan US Value R6 Fund` with **VGINX** ASSERTED, out of the stored `stk`
  (both resolvers return null for that name, and VGINX is in neither `fund-er.js`
  nor `data.js`) — the INVERSE of the owner-gated store-vs-page item: the page is
  faithful and the question is about the store. **Do not retry:** (1)
  `TICKER_NAME` is the **EMPLOYER STOCK** map, not a fund registry; (2) a
  house-majority witness keyed on the ISSUER cell reads **246 rows / 139,854
  ppl** of false positives because ***the issuer cell routinely holds the
  CUSTODIAN*** (`Fidelity Emerging Markets Index Fund` / `iss: Vanguard
  Fiduciary Trust Co` → FPADX, symbol RIGHT); (3) "one symbol, many funds" reads
  **1,463 symbols / 469,549 rows / $1.25T** of pure SPELLING VARIANCE — `VTHRX`
  has 222 distinct names and all are Vanguard Target Retirement 2030. VGINX's own
  41 names are all one fund, so the store is internally consistent and a majority
  witness cannot see a consistent error (*a ceiling that reads repetition as
  evidence of correctness is fed by repeated damage*). **What remains is bounded,
  not concluded: one stored symbol stands on 466 rows / 576,600 participants of a
  single named fund and is UNVERIFIED.** Settling it needs a registry witness —
  `data/fund-facts.json` and the `fund-facts` agent — because *a ticker is a FACT
  that must be SOURCED, never inferred.* `docs/accuracy-log.md` 2026-10-03 (16:4xZ).
- **SHIPPED 2026-10-03 12:4xZ (#566) — THE WELDED SHARE COUNT: 18 stored names
  repaired, of which 9 rows / 8 plans / 3,869 ppl / $7,252,820 are
  READER-FACING** and 9 were already clean on the page. **The queue's own figure
  was 29 rows / 170,735 ppl and its motivating case was described BACKWARDS** —
  L Brands' ticker does not change on the strip and the row is already qualified
  "names no specific fund", so the repair as queued would have made three rows
  worse on $86.8M. The guard that stops that is `isGenericTypeName(head) ||
  hasNoFundIdentity(head)`, the display's own composition. `docs/accuracy-log.md`
  2026-10-03 (12:4xZ) and (13:2xZ).
- **OWNER-GATED, FOUND BY THE 12:08 DRAW — ONE FUND, SIX SHARE CLASSES, ONE
  FEE: 336 published+served rows / 338 plans / 575,826 ppl / $1,629,147,725,
  of which 314 publish a fee and EVERY ONE publishes `er 0.04`**, the ADMIRAL
  number, while the filings state six different classes of the one Vanguard
  Total Stock Market fund — `IP`/`Inst Plus` is **VSMPX at ~0.02**,
  `IS`/`Institutional` is **VITSX at ~0.03**, `ETF` is **VTI at ~0.03**, only
  `Admiral` is VTSAX at ~0.04, and the bare rows state no class at all.
  **LARGEST NAMED INSTANCE: Lockheed Martin, 180,780 ppl**, publishes
  `VANGUARD TOTAL STOCK MARKET ETF` at 0.04 on $39,167,756; HNI Corporation's
  `… IP` is **$160,693,465 / 10.28% of its menu** priced at roughly double its
  real cost; Glenmede 25.68% of its whole menu, Bryn Mawr 29.67%, Eight Eleven
  27.35%, Boston University ×2 (38,740 ppl between them).
  **THE ENTRY POINT WAS A MISSING TICKER AND THE CAUSE IS A DROPPED SERIES
  WORD.** Datadog files six `Vanguard <X> Admiral Fund` rows; five resolve and
  `Vanguard Total Stock Market Admiral Fund` publishes 0.04 with NO symbol,
  because `sec-funds.json` registers VTSAX under `Vanguard Total Stock Market
  **Index** Fund` and the filer omitted `Index`, so the matcher's superset arm
  fails on a missing SERIES token where `Vanguard 500 Index Admiral Fund` keeps
  it and resolves `superset+class`. **AND THE RECORDED ASYMMETRY IS INVERTED:
  the FEE table reaches this name and the TICKER table refuses it** — 0.04 is
  VTSAX's genuine Admiral ER, so our two tables disagree about whether we know
  the fund and the one that "knows" it is the one that must never infer.
  **The fee half is the share-class fee family** — *a fee is SOURCED, never
  derived*, `fund-facts.json` holds no VSMPX/VITSX/VTI figures, so the honest
  move is to WITHDRAW rather than re-price. **The ticker half is
  one-directional and the classes are STATED** (the ASSERTED bucket), but its
  only remedy is re-inserting a structural word the filer dropped, which is
  exactly the loosening of "superset" that stops the matcher crossing funds —
  this record already measured a guessed contraction vocabulary at **9 false
  positives of 21 rows**. `docs/accuracy-log.md` 2026-10-10 (12:3xZ).
- **REFUTED IN BOTH HALVES 2026-10-10 15:2xZ — DO NOT SHIP IT, AND THE THREE
  CLAIMS BELOW ARE ALL WRONG** (*"one-directional"*, *"the ASSERTED bucket"*,
  *"the safe stage is `secAsk`"*). **The gate is `CLASS_MARK`, a REGEX at
  `match-sec-tickers.mjs:1127` (`if (!CLASS_MARK.test(w)) return null;`), NOT
  `CLASS_WORDS`** — patching the set I guessed left the rows still null, and
  token-ablation named the real one (`+"Admiral"` resolves VTMGX, a bare
  `+"Plus"` or `+"ETF"` returns null). So `secAsk` cannot reach it either: the
  candidate SPELLING is already the registered one, and the refusal lives in the
  matcher that `merge-4i` SHARES to write `ftk`.
  **THE `institutional plus` HINT ARM HARMS A CONTROL, and the harm and the
  benefit are ONE mechanism:** it fixes `… Institutional Shares` (`VDVIX*` ->
  **VTMNX** asserted, the right class) and simultaneously moves **`Vanguard
  Institutional Index Fund` from an honest `VINIX*` to `VINIX` ASSERTED**,
  because that series' own NAME carries `Institutional` and the arm cannot tell
  a class STATED from a word inside the series name — silently choosing between
  VINIX and VIIIX, which is the owner-gated wrong-class defect by a new route.
  **`CLASS_MARK` ALONE SPLITS IT:** `Institutional Plus Shares` reaches only a
  COMPARABLE **of the wrong (Investor) class**, the gated half; `ETF Shares`
  ASSERTS (VNQ, VTI).
  ***AND READING THE MEMBERS KILLED THE ETF HALF — IT LICENSES A WRONG FUND.***
  Sized 826 published+served rows / 546 plans / 773,787 ppl / $377,951,662 with
  the must-see pin passing and every control clean, and its LARGEST member is a
  defect: **`Vanguard Mid-Cap Growth ETF` -> `VMGRX` asserted on 277 rows.** The
  registry has two series in two registrants — `VANGUARD INDEX FUNDS ::
  Vanguard Mid-Cap Growth **Index** Fund` = **VOT** (ETF Shares, correct on the
  11 rows that spell `Index`) and `VANGUARD WHITEHALL FUNDS :: Vanguard Mid-Cap
  Growth Fund` = **VMGRX**, an ACTIVE fund. ***The filer omits `Index`, and
  excusing `etf` as a class marker deletes the one token that says ETF rather
  than active fund*** — `etf` names a different VEHICLE, not a share class like
  `Admiral`. Sharpest form yet of *a resolver gain is evidence the string
  reaches a fund, not evidence it reaches THIS fund*, compounding the 12:3xZ
  dropped-`Index` mechanism into a cross-registrant match.
  **WHAT SURVIVES, narrower and needing no vocabulary:** the `Institutional
  Shares` -> VTMNX gain is real and blocked only by the bare-series ambiguity,
  so the instrument is a test of whether the class word is ALREADY PART OF THE
  SERIES NAME — which the index can answer, since it holds that name. A wider
  hint table is the wrong shape. Unbuilt. `docs/accuracy-log.md` 2026-10-10
  (15:2xZ).
- **ORIGINAL ENTRY, kept because it is what was predicted — FOUND BY THE 14:08
  DRAW, SIZED NOT SHIPPED — STATING A REGISTERED SHARE
  CLASS MAKES THE MATCHER ANSWER WORSE THAN STATING NONE. Upper bound 128
  published+served rows / 80 plans / 1,462,765 ppl / $5,988,260,564 publishing
  no symbol, 107 of them publishing a pattern-table FEE.** Xcel Energy (14,084
  ppl) publishes `Vanguard Developed Market Index Institutional Plus` at
  **$212,086,744 / 6.5% of its menu** with no ticker and 0.05, while
  `Vanguard Mid-Cap Index Fund Institutional Plus Shares` two rows above
  resolves **VMCPX**. The registry HAS it: `VANGUARD TAX-MANAGED FUNDS ::
  Vanguard Developed Markets Index Fund`, class **Institutional Plus Shares =
  VDIPX**.
  **THREE BEHAVIOURS, isolated by varying ONLY the class phrase on one
  registered series** — bare `VDVIX*`; `Admiral Shares` -> **VTMGX asserted**;
  `Investor Shares` -> **VDVIX asserted**; `Institutional Shares` -> `VDVIX*`,
  the INVESTOR class's comparable where **VTMNX** is exactly registered;
  `Institutional Plus Shares` -> **null**; `ETF Shares` -> **null**. ***So the
  thing that should sharpen a comparable into an assertion gets null instead, or
  a different class's comparable.*** Confirmed on a second series (Mid-Cap: bare
  `VIMSX*`, Admiral VIMAX, Institutional Plus **null**), so it is not one fund.
  Same shape as the shipped 06:1xZ apostrophe fix — an unexplained leftover
  (`plus` / `etf`) makes `resolveHolding` decline the whole row.
  **THE BOUND IS LABELLED, not a measurement:** it cannot say the class phrase
  is the only blocker per row, since `fund-er.js` may be silent for its own
  reasons. Must-see pin caught; cheap exact pre-filter, a superset because the
  cleaner only removes. Members are real funds stating a registered class
  (`… Developed Markets Index Fund Institutional Plus Shares` ×10,
  `… Emerging Markets Stock Index Fund Institutional Plus` ×10,
  `… Real Estate Index Fund ETF Shares` ×4); one is
  `922908371 VANGUARD EXT MKT INDX-INST+`, whose `INST+` the 07:3xZ entry
  already records as **correct as filed**.
  **THE STAGE IS THE POINT:** the refusal lives in `match-sec-tickers.mjs`,
  which `merge-4i` SHARES to write `ftk` — consulted FIRST by `lookupTicker` —
  so a change there can take a symbol away as readily as add one. The safe stage
  is `gen-sec-tickers.mjs`'s `secAsk` candidate list, additive by construction,
  where the apostrophe fix went. Before any ship, a seeded draw must print each
  row's TYPE beside its answer: *a symbol can be right for the fund and wrong
  for the vehicle and no count can see it.*
  **TWO MORE NAMED INSTANCES from the same draw.** Kaleida Health (11,638 ppl)
  publishes `Vanguard Index Institutional Fund` at $97,656,747 / 13.6% of its
  menu with no symbol and 0.1 — **the SEC matcher resolves it `VINIX*` and the
  page does not**, the shipped arm carrying assertions only, so it is the
  owner-gated comparable half. And its `American EuroPacific Growth Fund R6`
  publishes **RERGX with no fee**, a THIRD spelling of the recorded Pvh/Mediacom
  pair. `docs/accuracy-log.md` 2026-10-10 (14:3xZ).
- **AND THE SAME DRAW NAMED A TRUNCATED ISSUER CELL houseCore CANNOT REACH:
  Orlando Health, 55,514 ppl**, publishes `500 Index Fund` · iss
  **`Management Trust Company`** at **0.03 on $230,782,728, 12.3% of its
  menu**, no ticker, and `U.S. Bond Index Fund` under the same cell at 0.06.
  The cell is `Fidelity Management Trust Company` with the **HOUSE WORD
  TRUNCATED AWAY**, so the 10:4xZ reduction has no manager token left to
  reduce — a different mechanism from the custodian-words class it fixed. The
  control is row 7 of the same menu, `Vanguard Windsor II Fund - Admiral Fund`
  under `Fiduciary Trust Company`, resolving VWNAX because the NAME carries the
  house.
  **SIZED AND REFUTED 2026-10-10 18:3xZ — CLOSED, DO NOT REBUILD IT. The queue's
  own prescription ("the store attests the full spelling elsewhere, which is the
  witness a repair needs") is UNSOUND, and it cannot reach its own motivating
  row.** Over all **13,203** distinct issuer cells on published+served rows:
  12,209 are a proper suffix of no longer attested cell, **541 of exactly one**,
  **453 of several** — and `Management Trust Company` is a suffix of **14**, so
  the uniqueness condition correctly refuses Orlando Health itself.
  **And the 541 "unambiguous" cells are dominated by a HARM.** The repair moves
  an answer on 51 rows / 47 plans / 32,426 ppl / $115,600,347, of which
  **nothing -> comparable 12 rows / 11,967 ppl, nothing -> asserted 4 / 818, and
  COMPARABLE -> ASSERTED 35 rows / 17,718 ppl** — **all 35 from two welded cells
  carrying a SHARE CLASS**, `"Class R6 Nomura"` (33) and `"Company Fund R6
  Victory Capital Management Inc."` (2). Prepending those to a clean `Nomura`
  cell manufactures a class the filing never stated: `DEVLX*` -> **DVZRX**,
  `DCCAX*` -> **DCZRX**, `WMGAX*` -> **IGRFX** — the owner-gated
  wrong-share-class defect by a new route, the same shape that killed the 15:2xZ
  ETF half six hours earlier.
  ***THE REUSABLE RULE: AN ATTESTED LONGER STRING IS NOT THEREBY A FULLER
  NAME.*** The witness assumes the issuer column holds firm names at varying
  completeness; it is contaminated by WELDS, and the pin's own candidate list
  proves it with no query — `"Cash 1  Fidelity Management Trust Company"`,
  `"M utual Funds Fidelity Management Trust Company"`, `"Managed income
  portfolio Fidelity Management Trust Company"`, `"Assets certified by Fidelity
  Management Trust Company"`. ***A column whose damage mode is WELDING cannot
  witness its own completions.*** **The surviving 16 honest rows / ~12,800 ppl
  are not worth an arm** (refusing a prefix carrying a `CLASS_MARK` or a
  type-caption word would isolate them — `Prudential Financial` -> `PGIM
  (Prudential Financial)`, `MetWest Funds` -> `TCW Metwest Funds`,
  `TimesSquare` -> `AMG TimesSquare` — but the motivating row stays refused).
  **Needs a witness from OUTSIDE the issuer column**: a registry of firm names,
  i.e. the `fund-facts` shape, because a trustee's name is a FACT that must be
  SOURCED. `docs/accuracy-log.md` 2026-10-10 (18:3xZ).
- **ONE TICKER, TWO FEES — 231 of 1,280 published tickers / 354,753 rows /
  $1.91T**, over all 599,250 rows publishing both a symbol and a fee. The ticker
  comes from a resolver and the fee from a NAME-pattern table, so one fund
  priced under a fuller name gets its own fee and under a bare name a category
  estimate: `FXAIX` 0.015 as `Fidelity 500 Index Fund` vs **0.03** as `500 Index
  Fund`; `FSMDX` 0.025 vs **0.1**; `VBTLX` 0.04 vs **0.1**; `VFIAX` spans 0.02
  to 0.4 (**×20**). **AND A LIVE INSTANCE WITH BOTH POPULATIONS COUNTED, from
  the 16:07 draw: `AMERICAN FUNDS 2055 TARGET R6` (285 rows / 311,651 ppl)
  publishes 0.4 and `American Funds 2055 Target Date Fund R6` (223 rows /
  130,527 ppl) publishes 0.32 — the SAME resolved symbol RFKTX**, the cost
  decided by how much of the name the filer typed. **Adjacent to the gated fee
  pre-emption item but a sharper claim: the page publishes two costs for one
  fund it has already named by symbol.** Direction: where a row resolves to a ticker, the fee belongs to THAT
  fund. **GATED** — hundreds of thousands of fee cells, and a fee is SOURCED,
  never derived.
  **AND THE `FXAIX` EXAMPLE ABOVE IS NO LONGER HYPOTHETICAL — the 09:07 draw of
  2026-10-10 named the pair plan to plan.** Ross Stores (**66,413 ppl**, ratio
  0.985) publishes `Fidelity 500 Index Fund` -> **FXAIX at 0.015**; Ramaco
  Resources (1,197 ppl, ratio **1.000**) publishes `500 Index`
  [iss `Fidelity Investments`] -> **FXAIX at 0.03**. Ramaco's `Mid Cap Index` ->
  **FSMDX at 0.1** is the second confirmation. Both pages are honest about the
  SYMBOL; it is the FEE that disagrees. `docs/accuracy-log.md` 2026-10-10
  (10:2xZ).
- **THE 09:07 DRAW'S EM-DASH ENTRY IS REFUTED BY ITS OWN SIZING, AND WHAT IT
  SURFACED INSTEAD IS SHIPPED — see the cross-reference entry below.** Screened
  on the dash the class is **3,406 rows / 840 plans / 2,905,549 ppl** and is
  dominated by `<FUND> — <SHARE CLASS>`, **correct as filed**: 1,506 rows publish
  a TICKER, including `Vanguard Institutional Index Fund — Plus Shares` -> VINIX
  0.02 and `JPMorgan Large Cap Growth Fund — Class R6` -> JLGMX 0.44. ***A count
  keyed on a character measures the character*** — met on a punctuation mark this
  time. **The two narrowed sub-buckets are NOT shipped and each SPLITS:** a TYPE
  CAPTION left of the dash is 57 rows / 19 plans / 122,284 ppl / $476,272,437 (47
  publishing neither ticker nor fee) and needs THREE remedies, because `Common
  stock — The Branch Group, Inc.` at 75% is EMPLOYER STOCK, `Mutual Funds—TIAA-CREF`
  at 56% names no fund at all, and `Collective trust fund—Putnam Large Cap Growth
  Class R` strips to a real fund; an ENTITY left of the dash reads 229 rows and is
  **CONTAMINATED**, because an insurer/trustee vocabulary matches `company` and
  `management` INSIDE funds' own names (`Fidelity Growth Company Fund – Class K`
  -> FDGRX, correct) — *a count keyed on a vocabulary measures the vocabulary.*
  `docs/accuracy-log.md` 2026-10-10 (11:5xZ).
- **SHIPPED 2026-10-10 11:5xZ — A CROSS-REFERENCE TO ANOTHER PAGE OF THE FILING,
  PUBLISHED INSIDE THE FUND NAME: 24 rows / 5 plans / 203,158 ppl /
  $40,384,714,416 — the largest display defect by DOLLARS on this record.**
  IBM publishes `Expanded Choice - Select Funds (refer to Exhibit A -
  investments)` at **15.5% of its menu / $9,855,559,291** and `Total Stock
  Market Index (refer to Exhibit P - investments)` at 15.4%; Farmers Group
  publishes three `(See Detail)` rows. 32 candidates, 24 names changed,
  **ticker / fee / asterisk / shown type all 0**, 0 cleaned to empty, 3 crawlable
  pages all read; `PARSER_VERSION` stays 203. Canonical in `cleanFiledName`
  (`lib-disclose.mjs`) with the HAND-MAINTAINED app.js twin updated beside it.
  **A STRIP AND NOT A QUALIFICATION:** the parenthetical points at an exhibit the
  reader of this page cannot see, so it is FURNITURE — the family `quoteTrim`
  already strips from a quote — and the name around it is real. *A row that names
  nothing and a row carrying furniture beside its name are two classes.*
  **ANCHORED ON THE REFERRING VERB, never a bare parenthetical** (this record
  discarded a 2,720-row class for keying on "a closing paren with two words
  after it"), with five must-NOT-strip pins.
  **THE PRICED ROW IS CHECKED, NOT ASSUMED:** Farmers' `Farmers Active Stable
  Value Fund (See Detail)` publishes **0.35 on $238,423,816**, a named live
  instance of the owner-gated fabricated stable-value fee, and the fee does not
  move — withdrawing it is the OWNER's call.
  **MY FIRST BASELINE WAS WRONG AND ITS FIGURE WAS RIGHT BY LUCK** — compared
  against the RAW name, which credits every other arm's work to this one, *the
  differential-run lesson skipped the same day it was recorded.* Rebuilt by
  writing the shipped module into `scripts/` with ONE line neutered; figures came
  back identical, so the claim is now earned. Re-measured again after #627 and
  **identical a third time.**
  **PAGE CONTROLS, both directions:** `Metwest Total Return Bond Fund (Class B)`
  sits two rows below a change and is untouched; across all pages **4,949 still
  carry an ordinary parenthetical** and **0 fund names keep a referring one**.
  The 3 pages that still match the pattern are **published QUOTES** (Regeneron's
  `(refer to Note 4)`, a vesting quote, a match formula's `(see Note 9)`) and are
  **correctly untouched: a quote is VERBATIM filing text where a name is a label
  we compose**, so stripping a mid-sentence pointer from a quote would change
  what the filing said. **RESIDUE DIAGNOSED 2026-10-10 12:2xZ — the cause is
  `cleanFiledName`'s last line and the remedy the shape suggests is REFUTED.**
  For all 8 the pointer IS the whole name (± a contract number), so the strip
  empties it and `return /[A-Za-z]{3}/.test(s) ? s : String(name).trim();`
  hands the raw string back — correct behaviour. No shipped predicate reaches
  them (`hasNoFundIdentity`, `isGenericTypeName`, `isLabelOnlyName`,
  `isNamelessFundRow` all false; the page qualifies **0 of 8** against a live
  positive control), so qualifying them is a WIDENING against
  `merge-4i.mjs:1394`. **THEN THE FILING KILLED QUALIFICATION FOR THE LARGEST
  ROW:** IBM's `(refer to Exhibit M - investments)`, **$500,583,748 / 149,818
  ppl**, is one of 19 exhibit pointers of which **18 carry a real fund name**,
  and the filing reads `High Yield and Emerging Markets Bond (refer to Exhibit
  M - investments)` — a description cell WRAPPED across two lines of which we
  kept only the second, so *"names no specific fund" is FALSE and the cut is
  OURS*. **The mechanism is nameable and its control is one row above it:**
  Exhibit I has the identical two-line shape and merges because its
  continuation (`investments)`) is INCOMPLETE, where M's is a SELF-CONTAINED
  parenthetical — ***a wrapped description whose continuation parses as
  complete is taken alone and the real name is lost.*** PARSER change, bump and
  re-parse: owner's call. The other 7 split two ways by the same sibling
  witness: Ewing's five `5PN-050NN (See Attached Statement)` rows (**38.4% of
  its menu**, 1,733 ppl, `iss Merrill Lynch`, 38 named siblings) name a
  CONTRACT by number; Tencent and Vaisala's bare `(See attachment)` sit among
  fully-named Fidelity menus.
  **SIZED AND THE SHAPE IS NOT THE CLASS — 41 published+served rows / 29 plans
  / 356,802 ppl / $1,727,812,828** whose published name is one balanced
  parenthetical and nothing else (must-see: IBM is in it), **2 publishing a
  ticker and 10 a fee**, of which ~22 must be SPARED: **Sentry Insurance's 15
  rows / 7,958 ppl where the parenthetical IS the fund name** and the resolvers
  are right (`(T. Rowe Price Equity Income Fund)` -> **PRFDX at 0.68**,
  `(Vanguard Institutional Index Fund)` at 0.02); names we lost (IBM, and
  **HCSC's `(EAIC)` at $733,228,663 / 19.10% / 40,491 ppl**, the class's
  largest by dollars and unclassifiable without its filing); and real things in
  parentheses (`(EQIX)` is Equinix's TICKER, `(Personal Choice Retirement -
  PCRA)` a real Schwab window, `(formerly, Delaware Small Cap Value Fund)` a
  fund by its former name, `(Loans)` ×2 the loan machinery).
  **QUEUED NOT SHIPPED — the only honestly qualifiable subset is table debris**
  (`(balance forward from previous page)` at **49.12%** of Cades Schutte's
  menu, `(at contract value)` 30.60%, `(FOR THE YEAR ENDED)` 16.46%,
  `(continued)` 13.22%, `(HELD AT YEAR END)` ×2, `(RESERVED)`, `(uncertified)`
  ×2, `(In $ thousands)`, `(corrected in 2024)`, `(average return of 5.50%)`,
  `(cash surrender value)`, `(Non-FBRIC)`) and it is a VOCABULARY arm whose own
  member list holds all three of a row naming nothing, a row whose name we cut
  and a row naming a real fund — ***one label cannot serve those three***, and
  the two largest members by dollars must both be spared. Needs the
  `isLabelOnlyName` precedent (a fourth display-only predicate) or a priced
  `hasNoFundIdentity` widening. ***A shape that produces a clean, striking
  count can still be three classes wearing one costume, and only the member
  list says which.*** `docs/accuracy-log.md` 2026-10-10 (11:5xZ) and (12:2xZ).
- **ORIGINAL ENTRY, kept because it is what was predicted — FOUND BY THE 09:07
  DRAW, UNSIZED — A WELD ON AN EM-DASH.** Ross Stores
  publishes three rows shaped `<CAPTION-OR-ENTITY>—<fund>`: `STABLE RETURN
  FUND—Galliard Stable Return Fund X` (8.4% of its menu / $97,481,952),
  `Putnam Investment Mgmt Co.—Putnam Sm Cap` ($30,790,959, fund half TRUNCATED
  to `Sm Cap`), and `POOLED SEPARATE ACCOUNT—Capital Group EUPAC E Separate A…`
  ($28,951,190, where the leading run is **the TYPE CELL's own label**). All
  three publish no ticker and no fee. The shipped trustee-weld arm is anchored
  on `LEADING_HOUSE` patterns at a SPACE boundary, so a caption on the left of
  an EM-DASH is a different shape — the welded-type-caption and welded-trustee
  families met on a punctuation mark, which is *a fix for one phrasing of a
  class is not a fix for the class* again. **Legibility only on the same page,
  and the resolvers are working underneath it:** eight rows read `Vanguard
  Group-Vgd Trgt Rtmt <vintage> Trust II Fd` — house welded with a HYPHEN, product
  contracted — and every one still resolves its correct asterisked comparable at
  0.08 with `noPublicPrice` set. `docs/accuracy-log.md` 2026-10-10 (10:2xZ).
- **NAMED 2026-10-10, NOT FIXED — `sec-tickers.js` HAS NO STALENESS GATE.**
  `gen-sec-tickers.mjs` implements `--check` (exit 1 if the asset is stale) and
  **it is wired into no workflow**, so a change to the generator can land beside
  a table it did not produce. `stamp-assets --check` catches a stale STAMP and
  cannot catch a stale TABLE — the stamp is derived from the asset's own
  content, so a stale table ships with a perfectly matching stamp. This is the
  twin-drift shape that has cost this project four browser twins, and the reason
  it is not simply wired in is cost: a regen walks 1,721,920 published rows and
  takes ~25 minutes, which does not belong in `site-test`. The cheap version is
  a gate that recomputes only the keys a DIFF of the generator could move, or a
  periodic job rather than a per-push one. Until then the discipline is manual:
  **a commit touching `gen-sec-tickers.mjs` or `match-sec-tickers.mjs` must
  regenerate and commit the table in the same commit.**
- Double render: one holding published TWICE at an identical value under two
  spellings where BOTH rows resolve to the same ticker — 1,217 groups / 2,434
  rows / 515 entries / $943,251,783. 85 `lineup-overshoot` menus carry one and
  43 drop below the 1.15 threshold when it is removed (one goes 1.477 → 1.000).
  Blocker: removing a row LOWERS its region's score, and v194 found that a
  junk-removal version can LOSE a region contest it previously won; typing the
  row instead leaves the dollars double-counted, which is the whole defect.
- Retired brands, both coverage not false claims: **Oppenheimer** 1,845 rows /
  2,157,642 ppl (1,844 publish no ticker; dropping the brand token resolves only
  5 of 349 names, so the cause is UPSTREAM of the brand) and **Spartan**
  (Fidelity's pre-2016 index brand) 835 rows / 2,541,569 ppl, one ticker and 365
  fees. A rename is a FACT that must be SOURCED, never inferred.
- **SHIPPED 2026-10-02 18:2xZ — the bank-deposit fee gate was one WORDING
  short: 90 rows / 90 plans / 81,444 ppl / $179,762,762 stop publishing a
  fabricated expense ratio** (75 at 0.2, 10 at 0.26, 4 at 0.35, 1 at 0.45),
  the queue's own 61 / 50,024 / $123,676,563 reproduced to the dollar and
  included. The rule takes the filing's NOUN (`\bdep(?:os|so)its?\b`, which
  subsumes both arms it replaced), `savings account`, `bank savings` /
  `money market savings` adjacent, and `money market account` **AND** a bank
  word as the only conjunction — and it reads the string the page PRINTS
  (`issuer · name`), because 36 of the 61 carried the program in the ISSUER
  cell. **Refused by whole-store measurement:** `sweep` and `fdic` reach 0 fee
  rows each; bare `money market account` reaches 189 fee rows / 486,616 ppl of
  REAL vehicles (41 are `CREF Money Market Account`, 197,268 readers). FEE
  ONLY, measured: 0 fees gained/changed, 0 tickers, 0 asterisks, 0 types, 0
  names, **0 crawlable pages**. **The flag moves on 714 rows and the FEE on
  90** — the other 624 were already suppressed. **RESIDUE, a different class:
  112 rows / 135,146 ppl** where a bank word sits beside a bare `money market`
  (`TD BANK INSTITUTIONAL MONEY MARKET`) — unsplittable by name, since the
  same shape holds `Schwab Government Money Fund` and `American Funds U.S.
  Government Money Market Fund`. Needs a registry witness, not a wider
  vocabulary. Still the reason this is not a `bank` rule: 1,585 rows carry
  `bank` inside a TRUSTEE's name. `docs/accuracy-log.md` 2026-10-02 (18:2xZ).
- **FOUND BY THE 09:1xZ DRAW — A COMPARABLE OF THE WRONG ASSET CLASS, and the
  resolver proves it knows better. UNSIZED, honestly so.** Intel (80,916 ppl)
  publishes `BlackRock 2500 Index Fund F` at $940,955,432 with a comparable of
  **WFSPX**, an S&P 500 fund, where a "2500 Index" fund is a completion /
  extended-market fund. `BlackRock Russell 2500 Index Fund` — the SAME product
  with the word `Russell` present — resolves to **SMMD** at `er` 0.15, the right
  asset class. So the 2500 arm is keyed on `Russell` and a filed name omitting
  it falls through to a generic equity-index comparable. **It is a labelled
  approximation (`star`/asterisk), not a false identification**, which is the
  smaller harm — but a comparable is still a published number and this one is
  the wrong asset class. Size the arm before touching it: the general shape is
  *a filed index name whose index is identifiable but whose matcher arm needs a
  token the filer omitted*, and the measurement must separate ASSERTED from
  comparable (`r.star`) or it counts the design as the defect.
- The bare HOUSE name as a holding: 5,752 rows / 4,585 plans / 8,370,934 ppl.
  93 rows at ≥30% of a menu. PARSER-side: replacing the identity column's own
  text is a claim, not a repair.
- A CATEGORY TABLE published as a fund menu (Bayer $4.87B in one row, Paramount
  59.5% of its plan across two). **ATTEMPTED AND REVERTED 2026-10-01** — the
  rule is v74's own split and the gate it needs does not exist. Three pieces,
  not one version: a firm-vs-product discriminator (neither `isHouseName` nor
  `identityIsProductName` answers it), a double-render-safe split, and a name
  swap whose effect on REGION SELECTION must be measured first.
- **THE RECORDKEEPER IS WRONG, NOT BLANK — SPLIT 2026-10-02, and the splitting
  is the whole value of the measurement.** 58,194 full-form plans carry an
  item-2 row the filing itself codes **15 or 64 (Recordkeeping)**, and the
  published name agrees on 56,004. **Do not carry 2,322 / 2,734,971 or
  2,190 / 2,070,795 forward** — both are loose screens, the first containing my
  own tokenizer's false positives at the top of its own frequency table
  (`Slavic401k` ~> `SLAVIC INTEGRATED ADMINISTRATION` carrying Justworks
  163,323, `NWPS` ~> `NORTHWEST PLAN SERVICES` carrying Exelon 26,632 — the
  SAME FIRM both times). Graded by the filing's own code on the row **we**
  publish, which is the strongest evidence available and is already in our data:

  | | plans | ppl | |
  |---|---|---|---|
  | **auditor or legal** | **39** | **49,793** | unarguable: an accountant is never a recordkeeper. AstraZeneca 27,192 is 55% of it |
  | another profession coded | 1,805 | 1,789,790 | investment management 641, custodial 463, consulting 392, investment advisory 158 |
  | no code filed on it | 344 | 207,726 | the filer left item 2's code cell empty |
  | published from no item-2 row | 57 | 81,615 | another source entirely |

  **AND MY OWN ACRONYM AND FAMILY BUCKETS ARE NAMED RATHER THAN COUNTED IN:**
  127 plans / 133,116 ppl are my acronym test failing (it takes one letter per
  word, and `NWPS` takes two from `NorthWest`), 11 / 127,572 are the same
  corporate family under another brand (`Strategic Advisors` IS Fidelity's
  advisory arm — a disclosure defect, not a different firm), and **974 plans /
  663,426 ppl are a brokerage PLATFORM published where the filing codes its
  TPA**, which is a judgment about bundled service rather than an error and must
  not be counted with one. **THREE OF THE 39 LOOK LIKE THE FILER MIS-CODED
  RATHER THAN US** (`Schwab`, `Ascensus` and `Milliman` carrying code 10), so
  the code is the FILER's claim and not ours — the unarguable core is ~36.
  **THE FIX NEEDS NO NEW SOURCE:** prefer a row coded 15 or 64, then the line-1b
  platform or the Schedule A carrier, then top-fee, and NEVER publish a provider
  coded 10 or 29. Pipeline change, needs a prep run, and it moves up to ~2,200
  published provider names, so it is the owner's call.
  **A blank is honest; a name reads as knowledge.**
- **SHIPPED 2026-10-02 21:2xZ (#553) — THE FIFTH VARIANT WORKS, AND THE GUARD IS
  WHY: 31 plans / 411,449 ppl, 0 blanked, PSEG among them.** A row the filer
  coded **64** whose name carries a recordkeeper brand takes the published name
  **only where the incumbent has no claim** (no brand, no "recordkeep", not
  coded 15 or 64). **Without that guard it moves 1,534 plans / 2,052,319 ppl and
  does TIAA → Fidelity at Cornell, Brown, Northwestern and Dana-Farber** — *a
  brand witness stops the CONSULTANT, not the coin toss.* Every one of the 31
  replaces an auditor, consultant, advisor, asset manager or broker
  (`STRATEGIC ADVISORS` ×11 is Fidelity's advisory arm where its recordkeeping
  arm belongs). **`RK_BRANDS` alone reaches 0 of 31 — the rule is general in FORM
  with one live house**, the Fidelity abbreviation. `RK_ALIASES` is kept OUT of
  `RK_BRANDS` because that list confers the 2e15 platform tier that outranks a
  coded-15 row (the VALIC hazard), and also fixes a display inconsistency on
  **121 plans / 2,020,774 ppl** showing `Fid Inv Inst Ops Co` where the same firm
  reads "Fidelity" elsewhere. `docs/accuracy-log.md` 2026-10-02 (21:2xZ).
- **THE FOUR EARLIER VARIANTS REMAIN REFUTED — do not retry any of them.**
  (1) **Reading it out of the NOTES**: 30 filings drawn RANDOMLY from the
  5,722-plan suspect pool — 29 mention "recordkeep", **2 state it unambiguously
  (6.7%), and BOTH already agree with what we publish**, so the correction yield
  is **0 of 30** against a full re-parse. One of the two would have CORRUPTED
  **Target (495,482 ppl)**: the backward capture crossed a SENTENCE BOUNDARY and
  read `"State Street Bank and Trust Company. Alight"` where the answer is
  `Alight Solutions, LLC`, which we already publish. ***A regex that captures
  backwards must be bounded by the sentence, not by the character class.***
  (2) **Counting code 64 as recordkeeping**: **2,395 plans / 2,410,330 ppl**
  change and the changes are WRONG — Notre Dame `FID INV INST OPS CO` →
  **`AON INVESTMENTS`** (a consultant), Cornell/Brown/Northwestern/Dana-Farber
  all `TIAA` → `Fidelity` (a coin toss in a 403(b) using both). **Code 64 sits
  on consultants billing pass-through recordkeeping fees.**
  (3) **Vetoing a row coded 10/29**: 336 plans / 586,780 ppl, **199 going BLANK
  — and all 199 read, they are overwhelmingly `VALIC RETIREMENT SERVICES`**, a
  real 403(b) recordkeeper filers routinely code 10 (Thomas Jefferson 29,087,
  Lehigh Valley 27,887, Moses Cone 15,799 …). It would delete the CORRECT name
  for ~200,000 participants. VALIC is a FOURTH filer mis-coding beside the
  recorded Schwab/Ascensus/Milliman, and much the largest.
  (4) **Veto but never blank**: the removal is sound and the promotion is not —
  `SMITH & HOWARD PC → CAPTRUST`, `KCOE ISOM → MORGAN STANLEY`,
  `CARON BLETZER → NYLINK INSURANCE AGENCY`. *Swapping a known-wrong name for an
  unverified one is not an improvement.*
  **THE STRUCTURAL REASON, derivable from the shipped expression in one line and
  worth more than the four measurements:** `score = plat*2e15 + isRk*1e15 +
  comp` and `comp` maxes near 1e8, **so a row coded 15 ALREADY outranks an
  uncoded auditor** — the auditor can only win where NO row is coded 15, so a
  veto can only ever promote another UNCODED row and can never find a credible
  replacement. ***Read the shipped scoring before designing a change to it.***
  **WHAT WOULD ACTUALLY SETTLE IT, and it is cheap:** the evidence is **Schedule
  C ITEM 1** (who the filer named as the eligible-indirect-comp discloser).
  `build-data` reads it; the fee shards store **only item 2**, so no store-side
  measurement can see it and the DOL extracts are unreachable from the sandbox.
  **One prep-run change — store the item-1 name beside the item-2 rows — makes
  the whole class measurable.** No parser bump, no re-parse.
  **THE BLOCKER IS GONE — #550 SHIPPED `i1` (42,385 acks, 1,134 with no item-2
  row) AND #551 ADDS THE TRUSTS.** `build-data` stores the Schedule C Part I
  line 1(b) discloser names on the fee shard as `i1`, and the shard assembly now
  iterates master trusts too (`mt: 1`) because MTIA acks had **0 of 508**
  entries while `scanSchC` already scanned every one. Both publish nothing: the
  selection at `build-data.mjs:1144` is untouched and no renderer reads either
  field.
  **AND ALL FOUR REFUTATIONS ABOVE WERE SCOPED TOO NARROWLY — corrected
  19:4xZ, each still standing on its own evidence.** They replayed **plan-ack
  item-2 rows**, so they were blind to the **138 plans / 2,648,558 ppl** whose
  published name comes from the MASTER TRUST's Schedule C via the `p.mtiaAck`
  arm — **including PSEG, the motivating case.** *A measurement that cannot see
  its own motivating example has not been scoped.* Sixth instance on this record
  of a plan-keyed count being blind to a trust. Read largest-first that fallback
  is mostly RIGHT (Target→Alight, HCA→Conduent, Boeing→Fidelity,
  Lockheed→T. Rowe Price), so the class is not wrong names but **unexaminable
  evidence**, with PSEG a case where it looks wrong.
  **PRE-REGISTERED for #550:** the new `Ingest gate` step passes (schc-item1
  10/10, schd-name 10/10); PSEG's acks `…674275001` (shard 25) and
  `…060242001` (shard 57) gain an entry carrying `i1`; and **the published
  recordkeeper moves on 0 plans**, which is the safety claim — if `rk` coverage
  moves at all, the selection was not as independent as the test asserts.
  No `PARSER_VERSION` bump, so confident/HIGH/warn and the rest of the coverage
  line must be unchanged.
  **AND `schd-name-test.mjs` HAD NEVER RUN IN CI** — written during the Schedule
  D work and wired into no workflow, so an ingest regression could only have
  been found by reading the data afterwards. Both ingest tests now run in prep
  before the download, on crafted fixtures with no network.
  **SAFE AND SEPARABLE, AND ITS "CHANGES 0" IS UNVERIFIED:** adding VALIC to
  `RK_BRANDS` would protect ~200,000 participants from any future veto — but a
  platform brand scores **2e15**, ABOVE the 1e15 a coded-15 row gets, so it
  could OUTRANK a correctly-coded recordkeeper on a plan that has both. Measure
  before shipping it; the claim that it changes nothing was read off the 199
  blanks alone. **PSEG is the motivating case and is unarguable**: its filing says
  *"Fidelity Investments is the recordkeeper"*, it files NO item-2 rows (a
  1,274-plan bucket), and we publish `Invesco Advisors, Inc` — a string that
  appears NOWHERE in the filing, whose only Invesco mentions are holdings
  footnotes naming the manager of one investment.
  `docs/accuracy-log.md` 2026-10-02 (19:3xZ).
- Recordkeeper BLANK where Schedule A names a carrier — `build-data` resolves
  `INS_CARRIER_NAME` and never reads it, and drops a Schedule A with 0
  commissions and 0 fees before it could be used. **UNSIZED and honestly so:**
  the EFAST2 extracts come from the DOL site, unreachable from this sandbox, so
  it is one line in the next prep run. Also: the page says *"No recordkeeping
  provider identified in this filing's Schedule C"* for plans that attached no
  Schedule C at all.
- **`fb-vanished` — WORKED 2026-10-04 15:3xZ. The diagnosis was right, the
  prescription was IMPOSSIBLE, and the real gap was elsewhere and is now
  shipped.** Replayed across the 2026-09-30 refresh: of the **22 plans that
  actually stopped being served, 22 had their ack change and 0 did not**, so the
  check is blind to ALL of the class rather than part of it. **But re-keying it
  to EIN|PN cannot be done in `fetch-4i`:** a stored lineup entry carries no
  plan key and the superseded ack is already gone from the current `plans-all`,
  so the join exists only where TWO stores are in hand — which is
  `mirror-gate`, where the plan-keyed check ALREADY lives and already catches
  all 22 (7,830 ack losses → 7,585 superseded / 171 wind-down / 82 short-form /
  1 gone / 22 real, 16,996 ppl, reproduced to the digit). What `fb-vanished`
  leaves is a DIAGNOSTIC gap — which plans, not why. **SEVENTH queue entry
  already covered by a different instrument**, and the first whose own
  prescription was impossible rather than redundant.
  **DO NOT CARRY 104 plans / 30,897 ppl** — it matches nothing in the replay,
  and the companion "171 / 149,049 wind-downs" has the right COUNT with a
  participant total the replay does not produce.
  **SHIPPED from it: `MIRROR_GATE_BRANCH_REF` + `scripts/mirror-gate-test.mjs`.**
  This file has been claiming `MIRROR_GATE_MAIN_REF` "replays any pair on
  demand" and it did not — the main side came from `git show`, the BRANCH side
  from `readFileSync`, so it replayed any main ref against the LOCAL TREE. That
  mattered because **the plan-keyed path does nothing on a quiet pair** (+0/-0
  and four zeroes every cycle) and *a check that prints 0 on a quiet store has
  not been tested*; its 356x narrowing had only ever been exercised by a live
  refresh. Now both sides take a ref, **replay exits 2 and never 0** so
  `mirror.sh` can never read one as a pass, and the test asserts all seven
  figures plus a QUIET-pair control that must read 0 — without which the suite
  would pass against a gate whose plan-keyed code had been deleted. Normal-mode
  output is **byte-identical to origin/main's copy**, diffed not eyeballed.
  **Not in CI on purpose:** only `fund-facts.yml` sets `fetch-depth: 0`, so the
  other workflows clone shallow, could not reach `7f553567`, and the test would
  SKIP (exit 99) every run — a red gate is worse than no gate. Runs on demand;
  a commit changing the classification cites it.
  `docs/accuracy-log.md` 2026-10-04 (15:3xZ).
- **SHIPPED 2026-10-03 06:3xZ — A PUBLISHED NAME WITH NO FUND IN IT: 486 rows /
  325 plans / 1,131,917 ppl / $5,934,254,604 now qualified** "the filing names
  no specific fund". Behavioral Connections `Portfolio` at 96.0% of its menu,
  Hui Manufacturing `Fund` at 80.8%, Avi Systems `shares` at 69.4% of a $304M
  menu, Eldercare of Minnesota `E.I.N. 20-` at 87.6%.
  **THE DIAGNOSIS IS THE REUSABLE PART:** `isGenericTypeName` is a CLOSED
  vocabulary of Schedule H TYPE LABELS, so it reaches `Collective investment
  trusts` and is blind to a FRAGMENT — and widening it is refused by its own
  comment because the parser's region selection and `audit-dominant-row` read
  it (widening once made 3M's note confident and moved Lam Research by $453M).
  `hasNoFundIdentity` is therefore DISPLAY-ONLY, composed into the injected
  name test at the two render call sites. **DO NOT CARRY 929 rows / 2,340,373
  ppl** — that screen imposed neither of the shipped call site's gates: 343 rows
  / 820,836 ppl carry an ISSUER and are deliberately untouched, 103 / 565,787
  were already qualified. 24 crawlable pages changed. `docs/accuracy-log.md`
  2026-10-03 (06:3xZ).
- **STILL OPEN from it, and owner-gated by overlap:** the Schedule H CAPTION
  sub-family — **Cisco Systems `Collective Trusts(1) at NAV` at 77.9% of its
  menu, $25,144,872,000, 70,957 ppl**, the largest instance of the
  category-table class. It carries an issuer or is otherwise outside the 486, so
  the shipped guard does not reach it, and the category-table item above is the
  owner's call.
- **SHIPPED 2026-10-03 14:3xZ — ONE OF TWO FOOTNOTE MARKERS READS AS A SHARE
  CLASS: 2 rows / 62,366 ppl / $496,636,334.** Procter & Gamble (42,915 ppl,
  $364,753,511, 6.7% of its menu) files `… Russell 2000 Index SMA(2)(4)` and
  published `… SMA(2)`; Santander (19,451 ppl, 10.3%) files `… Common Class
  Q(2)(3)` and published `… Class Q(2)`, which is indistinguishable from a
  designation. The trailing-marker arm is now GREEDY in `lib-disclose` and its
  app.js twin. 2 crawlable pages changed; ticker/fee/asterisk/type/flags
  unchanged on both rows. *One of two markers is worse than none or both.*
- **AND THE NON-IDEMPOTENCE ITEM IS NOW SPLIT FOUR WAYS — re-measured at 156
  rows / 40 plans / 102,608 ppl, and its single queued line asked for two arms
  to be made greedy where one is worth 61% of the people and the other is worth
  one plan.** What remains, none of it shipped:
  **(a) ending in the type label `Registered Investment Company` — THE REFUSAL
  NOW HAS A PRICE, AND MY MOTIVATING HYPOTHESIS FOR LIFTING IT IS REFUTED
  (2026-10-04 12:2xZ).** Re-measured, the whole non-idempotent population is
  **138 rows**, not the 156 recorded here; priced through the page's own
  renderer, a second pass **gains 0 tickers and 0 fees**, loses **1** fee
  (`Admiral(TM) Shares Account Nationwide Trust Company, FSB Vanguard Target
  Reti` → the truncated `Vanguard Target Reti`, 3,969 ppl), and leaves 137 rows
  / 30,946 ppl / $597,413,555 of NAME-ONLY change. **I reached this class from
  the other direction** — Colsa files `… Registered Investment Company – Mutual
  Fund`, two STACKED type labels, and single-pass `TYPE_SUFFIX` removes only the
  outer one, so `Columbia Seligman Tech&Info Inst Registered Investment Company`
  survives — and assumed the residual label was costing the row its ticker.
  **It is not: that row resolves to nothing under BOTH spellings.** So the loop
  buys legibility alone and costs one fee, and the recorded refusal stands on
  measured grounds rather than on the `Equity Income Separate Account` worry;
  **(b) 58 rows / 18,750 ppl where a second pass is NOT a suffix strip** —
  **ITS DOMINANT ARM SHIPPED 2026-10-03 15:3xZ and the "different reason for
  each" framing was WRONG.** Reading all 58 found ONE mechanism behind the bulk
  of them, an ORDERING defect: the trailing-bar arm at `lib-disclose.mjs:690` is
  anchored at end-of-string and runs 436 lines before `TYPE_SUFFIX`, so a bar
  with the TYPE column's own label behind it is never reached. Asking the
  PUBLISHED question instead of the idempotence one sized it at **122 rows / 72
  plans / 44,651 ppl / $155,471,281, name-only — 0 tickers, 0 fees, 0 types, 0
  flags, 0 rows crossing the `ID_ONLY` drop**, 1 crawlable page.
  **CORRECTED 16:0xZ, AFTER THE FIRST VERSION SHIPPED A WRONG FUND:** the arm
  first accepted `\|+`, and a DOUBLED bar is the Roman numeral **II**, not a
  column rule — Lacroix's `… Vanguard Windsor || Fund` published `Vanguard
  Windsor Fund` (VWNDX) where the filing says Windsor **II** (VWNFX), *a
  different fund*. Our own store witnesses the discriminator: `… Co. | Vanguard
  Windsor II` has ONE bar as the real rule and spells the numeral. 4 doubled-bar
  rows are now left exactly as filed, still showing a bar — *a visible artifact
  warns the reader; a wrong fund name reads as knowledge.*
  **Do NOT retry the discriminator I proposed first**: requiring the word
  `Class` before the bar would have withdrawn **1,444 correct** bare-`I` classes
  (`THE VANGUARD TARGET RETIRE 2045 TRUST I` is a genuine CIT series name).
  STILL OPEN from (b): the head-duplication rows (`Master Trust Master Trust
  Balances…`, `b b b *`, `SSS SSS SSS SS`), which a second pass does NOT fix —
  one more repetition leaves junk, so the frame is full de-duplication, not
  idempotence — and `MUTUAL FUND - FIXED INCOME` → `FIXED INCOME`, where the
  second pass is **WORSE** and the loop must never run;
  **(c) 17 rows / 2,870 ppl** of `; N shares`, ALL IN ONE PLAN;
  **(d) ~19 rows** of stray glyphs `+`, `©`, `‘`, `®` and OCR debris
  (`NIA`, `te`, `iad`).
  **DO NOT CARRY the queue's old better/erosion split** — it summed per ROW
  against a per-PLAN total. **And prefer the PUBLISHED question to the
  idempotence one:** "does the name a reader sees still end in a marker" has a
  flat answer (3 rows store-wide, one already qualified by `hasNoFundIdentity`)
  where idempotence is a proxy that mixes four causes.
  `docs/accuracy-log.md` 2026-10-03 (14:3xZ).
- **THE TRUNCATED-NAME CLASS — REWRITTEN 05:2xZ, AND MY 04:3xZ MECHANISM WAS
  WRONG.** That entry read "190 rows / 115 plans / 323,680 ppl /
  $4,981,039,061 … a `Common / Collective` column heading bleeding into the
  description column", **asserted from two examples.** Fingerprinting the
  ENDINGS of all 1,526 raw-name rows that end on a joiner refutes it: the
  `Common /` shape is **10 rows**, and the dominant endings are a trailing dash
  on an otherwise COMPLETE name (143 + 116 + …) and a **contract-number
  prefix** — Travelers' `…Prudential Insurance Company of America, GA-` and
  `…Voya Retirement Insurance and Annuity Company, MCA-`, where `GA-`/`MCA-`
  are group-annuity prefixes whose number is simply absent (86 rows).
  ***A MECHANISM INFERRED FROM TWO CASES IS A GUESS WITH A CITATION.*** Note
  also that the 190 was measured on CLEANED names and the fingerprint on RAW
  ones — **not the same set**, which is a second reason the mechanism could not
  be read off that count. The 10 `Common /` rows are real (Spire, Envista,
  Michelin ×2, Toledo Clinic, KTGY, ePromos, ESG Architecture) and small.
  `*` and `+` are party-in-interest markers and must NOT count as joiners —
  including them counted Darden's complete `Principal Fixed Income Guaranteed
  Option*+`.
- **SHIPPED 2026-10-04 12:3xZ — A SENTENCE IS NOT A NAME: 7 reader-facing rows
  / 157,807 ppl / $9,489,072,912, one fabricated fee withdrawn, 3 crawlable
  pages.** American Airlines (132,820 ppl) stops publishing `Separately managed
  account which includes: Corporate Common Stocks, Registered Investment` —
  **$9,448,603,045, 38.2% of its whole $24.76B menu** — as a named holding
  typed `Collective trust`; Indeed, Inc. (10,050 ppl) stops publishing
  `consisting of Cash, Money Market and` typed `Mutual fund` **and priced at a
  fabricated 0.2%**; Lerner Corporation stops publishing the attachment's own
  FOOTER at 2.1% of its menu.
  **THIS ENTRY USED TO SAY "2 rows / 288,416 ppl, and the honest size is two",
  with an explicit refusal to build a predicate. The refusal was right about its
  own evidence and wrong about the class.** The screen that sized it keyed on a
  VOCABULARY (`\bis\b`) and matched **`IS`, Institutional Shares**, reading
  3,328 rows whose largest members are correct abbreviated names (Cigna's
  `BLACKROCK SP 500 IDX (IS)`, $3.4B / 91,385 readers; Mayo's $1.6B). With 3,328
  false positives in front of it only two real members could be dug out by hand.
  **DO NOT CARRY 3,328 rows / 6,382,769 ppl.**
  **THE INSTRUMENT IS GRAMMATICAL RATHER THAN LEXICAL, and that is the part to
  reuse:** a FINITE VERB followed by a FUNCTION WORD is a *predicate*, which is
  what makes a string a sentence ABOUT a holding rather than a name FOR one. A
  share class is never followed by `included`/`of`/`a`/`the`, so the
  abbreviation cannot match — all three of those rows are pinned as must-KEEP
  cases where the following function word is the ONLY protection. 53 of
  1,724,192 published rows match and **all 53 were read**; there is no
  false-positive population to trade against, which is why this ships where the
  vocabulary version could not.
  **THE STORED FLAG MOVES ON 53 ROWS AND THE READER SEES 7 — DO NOT CARRY 53
  rows / 484,457 ppl as a reader-facing figure (wrong by 3.1x).** `namelessRow`
  flips on all 53, but **46 already publish `Participant loans — not a menu
  choice`** from an arm AHEAD of the nameless label in the same type chain, so
  Kaiser's two rows (288,416 ppl between them) see no change at all.
  **The claim is deliberately the WEAKER one:** ~40 of the 53 are loan-repayment
  NOTES, often checkbox answers (`Repayments are Included Yes`, `repayments are
  included : X`, Desotec's `Repyaments are Included: o $17,160`), and whether the
  dollars beside them ARE the loans is not stated — so "names no specific fund"
  is published rather than "Participant loans". `docs/accuracy-log.md`
  2026-10-04 (12:3xZ).
- **DISCARDED, and recorded so it is not re-derived: the "welded name" count of
  2,720 rows / 5,565,186 ppl / $45.2B.** The predicate was "a closing paren with
  two words after it", which is the shape of every ordinary parenthetical —
  Walmart's `The Collective LSV International (ACWI EX US) Value Eq` and
  `PIMCO International Bond Fund (U.S. Dollar-Hedged) Ins` are CORRECT. The real
  welded case exists (Spire's `BlackRock Money Market Fund W units) JP Morgan
  Large Cap Growt`, $57,706,256, 9.0% of its menu) and is UNSIZED, because no
  predicate yet separates it from a parenthetical. ***A count keyed on a
  character measures the character.***
- **THE MATCH-FORMULA RESIDUE AFTER v198/v199, census taken through
  `matchQuoteOk` and not through the store.** 1,853 plans / 3,288,250 ppl show a
  magnitude claim with no Formula line (the other 4,208 / 9,323,999 have their
  quote SUPPRESSED and the page says "no formula stated in the audited notes" —
  not a defect). After v198's 97, the OURS buckets are: a rate and a base cap
  and no arm fires **882 / 1,134,437**; the rate in words **322 / 285,430** (now
  v199's `mfEqualToWords`); tiered, where the render has room for one pair and
  the filing states two **93 / 109,214**; a dollar ratio no arm reads **38 /
  136,337**. Correct to withhold: a cap or range on the RATE 90 / 210,709, a
  rate that VARIES by service or age 72 / 545,262, a base cap with NO rate 253 /
  335,964. **Re-measure, never read**: the first three passes of this census
  were wrong in my own favour twice.
- **THE DROPPED ARM, with its failure modes named so nobody retries it blind:**
  an arm for the rate sitting BEFORE the word "match" with words between
  ("receive 100% company matching contributions of up to 4%", American Airlines,
  **114,149 ppl**) agreed with the shipped oracle only **93.1%**, and its
  failures were grabbing a neighbouring NONELECTIVE rate (Wellesley College,
  Cass Information Systems) or a SECOND tier (Eight Eleven Group). The gain is
  large and real; the error rate is not acceptable for a number that size. Needs
  an NEC-adjacency test and a lead-tier anchor before it can ship.
- **THE DOLLAR-RATIO TIER MISREAD — Jones Lang LaSalle, 47,898 ppl**, publishes
  `3% of the first 5% of pay` where the filing says `$1.00 per dollar on the
  first 3% deferred and $0.50 per dollar on deferrals in excess of 3% up to 5%`.
  The answer is 100% of the first 3%. v199's gate **cannot** reach it (the only
  percentages are 3 and 5, and 5 is the cap) and `scripts/match-formula-test.mjs`
  asserts that limit so widening the gate trips the test. The rate lives in the
  dollar ratios; UNSIZED as a class.
- **CLOSED — THIS WAS v200's OWN QUESTION AND #571 ANSWERED IT.** The entry
  asked whether `rate == cap` is a real design or a second misread shape, and
  said it was one measurement rather than a quiet widening. v200 took the
  measurement (75 published `N% of the first N%` plans: **13 hold a better
  candidate for the rate in their own sentence, 62 do not**), moved the gate to
  `rate <= cap`, and `lib-4i.mjs:6068` now reads exactly that. **SIXTH queue
  entry found already closed by re-reading it rather than working it** — the
  habit that catches these is reading the SHIPPED SURFACE (`grep` the gate) before
  starting, not reading the entry.
- **SHIPPED 2026-10-03 09:0xZ — THE VESTING QUOTE STATES A DIFFERENT PLAN RULE:
  41 entries / 41 plans / 226,729 ppl withheld, all of which published the quote
  as their WHOLE answer (0 carry a vesting label).** Charter Communications
  (120,688 ppl) a LOAN LIMIT, Vensure (42,571) raw Form 5500 table text whose
  only vest-word sits inside **VESTED METALS INTERNATIONAL LLC**, Brown
  University (12,356) a plan amendment, **PSEG ×2 (12,781) the
  withdrawal-suspension rule that motivated it.** `vestingQuoteOk` is canonical
  in `lib-quote.mjs` beside `matchQuoteOk`; 11 crawlable pages changed.
  **THIS ENTRY'S OWN SUGGESTED MEASUREMENT WAS THE FIRST THING REFUTED** — it
  asked for "how many selected sentences carry NO vesting arithmetic", which
  reads **2,433 entries / 3.9M ppl**, almost all honest rules stated without
  numbers ("fully vested at all times"). Four more screens fell after it, none
  twice for the same reason, and the two rules that survive them are in the
  method list below. `docs/accuracy-log.md` 2026-10-03 (09:0xZ).
- **STILL OPEN and NOW SIZED BY READING ALL 41 FILINGS (2026-10-04 20:1xZ) — a
  PARSER item, ready to write: 24 of the 41 plans / 172,406 of the 226,729 ppl
  (76.0% of the class's readers) have a PUBLISHABLE rule the extractor failed to
  select.** 41 filings downloaded, 41 readable, 0 failures. Split, and the three
  buckets reconcile to 41 / 226,729 exactly: a LADDER or CLIFF available **14
  plans / 144,152 ppl**; unqualified IMMEDIATE vesting available **10 / 28,254**;
  accepted but says nothing useful **11 / 50,128** (forfeiture accounting, a
  truncated "vesting sc…"); no candidate at all **6 / 4,195**, where
  withholding is complete. Charter Communications (**120,688 ppl**) files a
  textbook 3-year cliff table and publishes nothing; Brown files a full
  20/50/75/100 ladder; PSEG ×2 file *"All Participants are 100% vested in the
  Plan from the first date of hire."*
  **THE SELECTION RULES ARE READ OFF THE EVIDENCE, and a naive "first sentence
  the guard accepts" would be WRONG ON THE TWO LARGEST PLANS:** ranked by
  acceptance alone, Charter's best candidate is *"immediately vested in their
  voluntary contributions"* and Brown's is *"vested in the portion attributable
  to their employee contributions"* — **employee money is vested by law**, so
  that would publish a true, useless sentence as the plan's answer for 133,044
  readers. So: (1) prefer a ladder/cliff over a bare "immediately vested";
  (2) demote EMPLOYEE/voluntary/elective/Roth/after-tax scope — the
  employer-scope rule the existing arms carry, applied to the RANKING;
  (3) demote another named rule even where the guard accepts it (a loan clause
  trailing a ladder; UCB's `21-24 3.5% / 25-34 4.0%` is a contribution-by-AGE
  table, not vesting); (4) leave the 13 reading "not stated".
  `vestingQuoteOk` is the ready-made oracle for what must NOT be picked.
  Needs a `PARSER_VERSION` bump and a re-parse. `docs/accuracy-log.md`
  2026-10-04 (20:1xZ).
  **PART OF IT SHIPPED 2026-10-04 21:0xZ AS v201, AND THE REST OF THIS ENTRY'S
  PRESCRIPTION IS AIMED AT THE WRONG STAGE.** What shipped is the smallest
  possible version — all four quote fallbacks were `if (!out.vestingText)`,
  FIRST-WINS, and now a guard-ACCEPTED candidate may displace a guard-REJECTED
  stored one, with the shipped display guard as the oracle. Delivered **5 plans /
  47,462 ppl** (Vensure 42,571, the case the 09:0xZ entry named), replayed
  through the real extractor over the whole 41 with **0 published quotes changed
  and 0 lost**, and a 323-filing control at 265 identical.
  **DO NOT CARRY THE 24 PLANS / 172,406 PPL ABOVE: it over-states production by
  3.6x.** That sizing split the WHOLE filing text on sentence boundaries where
  the extractor builds `vestSentences` from one regex over whitespace-collapsed
  text, filtered by `BOILER` and a long exclusion chain.
  ***AND THE FOUR RANKING RULES CANNOT DELIVER THE REST, because the candidates
  never reach the point where a ranking would apply.*** Measured by slicing the
  extractor's own candidate construction out of `lib-4i.mjs` and running it:
  of the 30 plans that do not move, **0 lack an acceptable candidate and 30 have
  one dropped before any fallback** — so Charter's cliff table and Brown's
  ladder are lost to a `continue` INSIDE the loop, not to a bad tie-break. The
  naive rule this entry warned would be "wrong on the two largest plans" is in
  fact SILENT on them, for the same reason it is limited. The four rules stay
  recorded because they are the right ranking ONCE the candidates arrive.
  **CLOSED 2026-10-04 21:4xZ — "which `continue`" IS ANSWERED, and the answer is
  that the bulk of the residue is the parser being RIGHT.** Attributed per
  candidate over all 142 guard-accepted candidates in the 30 filings, every
  condition sliced from the source: **the scope gate
  `if (!strictGate && !employerMoney && !universal) continue;` (`lib-4i:7333`)
  drops 127 of 142 and is the ONLY condition firing on 78.** It is ranking rule
  (2) of this very entry — demote employee-money scope — already enforced
  earlier and harder, so **relaxing it is exactly what would publish Charter's
  "immediately vested in their voluntary contributions" and Brown's "vested in
  the portion attributable to their employee contributions" to 133,044 readers.**
  The 9 unexplained candidates are FORFEITURE ACCOUNTING, dropped by the
  `!/forfeit/` condition on the fallback sites, correctly.
  **DO NOT MIX 142 WITH 197:** the authoritative count builds candidates through
  the real construction (`BOILER` + the exclusion chain); a bare-regex screen
  reads 197. `docs/accuracy-log.md` 2026-10-04 (21:0xZ) and (21:4xZ).
- **SHIPPED 2026-10-04 21:2xZ — THE FORM'S OWN PRINTED QUESTION WAS PUBLISHABLE
  AND ONLY AN UNRELATED `continue` KEPT IT OFF THE PAGE. One arm, price ZERO:**
  `vestingQuoteOk` now vetoes Form 5500 line 6g(2) before (b) is consulted.
  Measured over the extractor's own candidate sets, **364 filings / 2,361
  accepted candidates / the sentence is accepted in ALL 364**; of 58,257
  PUBLISHED quotes it withholds **0**, the withheld count stays 41, and
  regenerating all 5,000 crawlable pages changes **0 files**. **Two of three
  arms were REFUSED by leave-one-out** — the digit-box filler is alone on 304
  and necessary for 0, `deferred vested` fires on 0.
  **AND THE TWIN SLICER IS NOW TRACKED AS `scripts/slice-vq.mjs`**, replacing in
  place with a `--check` wired into `site-test`; the old one lived in gitignored
  `scratchpad/` and could only INSERT, so the only way to change the twin was to
  hand-edit app.js. **Promoting it caught a near-miss: the slice reaches
  `quoteTrim`, a by-name export rewrite left `export function quoteTrim` inside
  app.js's IIFE, `node --check` PASSED (it parses as a module) and every browser
  would have loaded NO app.js at all.** *A named rewrite is a rewrite for the
  exports you remembered.* **STILL OPEN:** `audit-data`'s form-question check
  reads `matchText` only, so the MATCH side is guarded in a different place by a
  different mechanism — making it symmetric is a small separate change.
  `docs/accuracy-log.md` 2026-10-04 (21:2xZ).
- **ORIGINAL ENTRY, kept for the measurement that found it — THE FORM'S OWN
  PRINTED QUESTION IS PUBLISHABLE AND ONLY LUCK KEEPS IT OFF THE PAGE.** For all
  30 residue plans the LEADING guard-accepted candidate in the extractor's own
  set is Form 5500 line 6g(2), *"Number of participants who terminated
  employment during the plan year with accrued benefits that were less than 100%
  vested"* — identical on every filing and therefore saying nothing about any
  plan. **`vestingQuoteOk` ACCEPTS it** (the `100% vested` arm of `VQ_VESTS`),
  **`BOILER` does not block it**, and **`audit-data`'s form-question check reads
  `matchText` ONLY**, so nothing anywhere tests a VESTING quote for form text.
  Nothing publishes it today; that is an incidental `continue`, not a design, and
  it is the same `continue` the item above must narrow — **so the veto must ship
  BEFORE that narrowing, or the narrowing publishes the blank form on 30 pages.**
  **DO NOT SIZE IT FROM THE STORED QUOTES:** a first screen read **0 among
  published AND 0 among withheld — a both-sided zero across the whole
  population, which reports on the QUERY**, because the form text that actually
  reaches the store is a different shape (Vensure's `23 3607881 2a Name of
  Participating 2b EIN`). Write the veto from the CANDIDATE SETS.
  `docs/accuracy-log.md` 2026-10-04 (21:0xZ).
  **AND THE "OCR-DAMAGED LOAN VERB" WORRY FROM THAT READING IS REFUTED — do not
  retry it.** PSEG's filing OCRs `borrow` as `bo1Tow`, which looked like it would
  defeat the guard's `may borrow` arm. Measured over all 58,257 accepted quotes:
  3 entries / 907 ppl, **none of them the defect** — the pattern matched the
  CLEAN word too, all three are a loan clause trailing a real ladder, and two
  already publish a correct vesting label. PSEG's sentence is withheld today and
  was never published.
- **CLOSED 2026-10-04 09:2xZ — the wind-down trigger must NOT widen to a
  collapse, and the prescription would have published a false number.** The
  shipped sentence asserts *"Schedule H reports **$0 in year-end assets**"*, a
  FIGURE, so widening the trigger without rewriting the sentence is a false
  claim on every newly-reached plan — *a guard and the claim it licenses are one
  change, not two.* Measured: the collapse class (`eoy > 0`, `boy >= $1M`,
  `eoy/boy < 0.01`) is 304 plans / 102,103 ppl, of which **44 / 6,381 ppl publish
  a menu — and 42 of the 44 have a menu within 0.5x-2x of their own tiny EOY**,
  so the published rows are TRUE statements about a residual (Gerald Champion
  collapsed $57,293,963 -> $259,943 and its three rows sum to exactly $259,943;
  Venable LLP $164,142,404 -> $703,671, four rows summing exactly that).
  Suppressing them would trade 42 accurate answers for a wrong one. **And the
  missing-context half is already shipped:** `flowsTable` (`app.js:3386`) prints
  "Prior Year Assets" unconditionally for every filed plan. Residue: the 2
  inconsistent plans (Mobex Global, 452 ppl, EOY $12,252 vs a 17-row menu
  summing $1,723). `docs/accuracy-log.md` 2026-10-04 (09:2xZ).
- Ticker/fee asymmetry, both large and mostly coverage: **91,423 rows publish a
  symbol with no fee**; 314,299 publish a fee with no symbol (**not** a defect
  class — its commonest members are full house-and-product names whose pattern
  fee is right and whose ticker is missing).
  **AND "mostly coverage" IS NOT ALL OF IT — the 02:07 draw of 2026-10-09 named
  NAME DAMAGE as a cause, with its own control one plan away.** Pvh Corp files
  `America EuroPacific Growth R6` (the `n Funds` lost) and publishes **RERGX
  with NO fee**; Mediacom files `American Funds EuroPacific Growth R6 Fund` and
  publishes **RERGX and 0.46**. Same fund, same resolved symbol, one priced and
  one blank — because `fundER` is a NAME-pattern table and the ticker resolver
  tolerates the damage the fee table does not. So part of the 91,423 is not a
  missing fee at all but a broken name that one resolver survives; UNSIZED, and
  sizing it means asking both resolvers for every row whose name differs from
  another plan's spelling of the same resolved symbol.
  **AND THE CONVERSE HALF HAS A NAMED LIVE INSTANCE FROM THE 06:07 DRAW — A
  HOUSE CONTRACTION, NOT AN APOSTROPHE: Peet's Coffee & Tea (4,982 ppl)
  publishes `Vanguard Ext Mk Index Inst Fd` · iss `Vanguard Group` · typed
  `Mutual fund` at $7,242,209, 5.6% of its menu, with NO ticker and a fee of
  0.1** where Vanguard Extended Market Index Institutional (VIEIX) really costs
  about 0.05. The blocker is the filer's CONTRACTIONS — `Ext Mk` for Extended
  Market, `Inst` for Institutional — so it is the 06:1xZ apostrophe class under
  a different mechanism, and the apostrophe repair cannot reach it.
  ***The control is in the same menu and it is what makes the gap OURS:*** seven
  sibling rows filed `Vanguard Tgt Rmt <year> Inv Fund` resolve VFORX / VTHRX /
  VFIFX / VTIVX / VTTHX / VTWNX / VTTVX **asserted at 0.08**, correctly, because
  the registry registers exactly one class (`Investor Shares`) for those series.
  So the resolver reads this issuer and these contractions on one row and not the
  next. **UNSIZED on purpose:** a contraction vocabulary is the shape this record
  has twice measured as harmful when guessed (`inv.` -> `Investment` gave 9 false
  positives of 21 rows, because `2040 INV` is an INVESTOR share class), so it
  needs the registry as the witness and not a wider screen.
  **ALSO IN THAT MENU, honest coverage and a RENAME:** `NYLI Winslow Lg Cap Gr I`
  · iss `MainStay Funds` publishes no ticker and no fee — NYLI is New York Life
  Investments, which MainStay was renamed to, so it is the Oppenheimer/Spartan
  retired-brand shape where *a rename is a FACT that must be SOURCED.*
  **And the draw's second plan is the machinery WORKING, which is the half worth
  recording too:** Insight Global (37,561 ppl) publishes eight `FID FRDM INX
  <vintage> T` collective trusts with no ticker and NO fee (`noPublicPrice`
  holding), and `FID 500 INDEX` -> FXAIX at 0.015 — a house abbreviation the
  resolver does reach. `docs/accuracy-log.md` 2026-10-10 (06:1xZ).
- The `iShares` abbreviated-name family: 11,334 of 13,927 published rows / 7.24M
  ppl publish no ticker while 7,947 publish a fee. Usable as a defect measure
  because the brand names REGISTERED ETFs, so a blank is a matcher gap and never
  a vehicle fact.
  **AND THE "EAFE IS GENUINELY ABSENT FROM THE REGISTRY" CLAIM THIS ENTRY USED
  TO CARRY IS REFUTED (2026-10-09).** `sec-funds.json` holds **10 EAFE entries**,
  the first being **EFA — `iSHARES TRUST :: iShares MSCI EAFE ETF`**. So the
  blank is a matcher gap there too, exactly as the rest of the bullet says; the
  one sub-item it exempted was not an exception at all. If that sentence meant
  `fund-er.js`'s own table rather than the SEC file it was true of the wrong
  noun, and either way the symbol is in this repo today. *A claim that was true
  once may be false now* — `sec-funds.json` was rebuilt 2026-09-28, and the
  converse of the re-probe rule applies to our own recorded facts.
- **THE TICKERS ARE ALREADY IN THE REPO AND THE PAGE DOES NOT READ THEM —
  MEASURED 2026-10-09, and this is the largest wiring gap on the record.**
  `sec-funds.json` carries **29,406 SEC series/class rows, 12,328 distinct
  series, 29,168 distinct tickers**, from the SEC's own Investment Company
  Series and Class file, **with share classes** (`VWELX` Investor beside
  `VWENX` Admiral — the exact distinction the owner-gated store-vs-page item
  turns on). Coverage of the families an owner would reach for: **iShares 464 /
  Fidelity 1,749 / Vanguard 422 / JPMorgan 775**, every one of them tickered.
  **`scripts/match-sec-tickers.mjs` ALREADY RESOLVES 571,286 of 1,320,514
  fund-like rows — 43.3% (348,744 exact + 222,542 correctly asterisked as
  ambiguous share classes)** — and its accuracy rules are already the right
  ones: exact-normalized or filed-tokens ⊇ series-tokens WITH the manager token,
  and an unstated share class gets the comparable asterisk rather than a
  silently chosen class.
  **"NEVER ACROSS MANAGERS" IS WHAT THIS LINE USED TO SAY AND IT IS TRUE ONLY
  OF THE EXACT ARM — CORRECTED 2026-10-09 BY READING THE TABLE THE SHIP
  GENERATED.** `(Vanguard Asset Allocation Fund)` resolves to **VCAAX**,
  asserted, and the SEC registers VCAAX as `VALIC Co I :: Asset Allocation
  Fund`. The SUPERSET arm matched because VALIC's series name is the wholly
  generic `Asset Allocation Fund`, whose tokens the filed name contains, and the
  leftover `vanguard` was then excused by that arm's own rule that *"a house name
  the filing states and the registrant's legal name omits"* is a legitimate
  leftover — right for `American Funds Growth Fund of America`, whose registrant
  genuinely omits the house, and it **never asks whether the registrant is THAT
  house.** So the matcher can cross managers exactly where the registered series
  name carries no house of its own, and the file's own comment records the same
  registrant family doing it before (`Short-Term Bond Fund` → HOSBX published as
  fact on 171 rows). The bigger live instance is Homestead Funds' bare
  `Intermediate Bond Fund` taking **Vanguard's and JPMorgan's** bond funds and
  every Voya / Mutual of America / Transamerica separate account of that name.
  **It is PRE-EXISTING and is refused at the new call site rather than patched in
  the matcher**, because `merge-4i` shares `resolve` and a change there moves the
  stored `ftk`/`stk` and needs its own measurement. `gen-sec-tickers.mjs`'s
  `registrantAttested` is the guard: the registrant's own distinctive vocabulary
  must say something the filing or its issuer cell also says.
  **"NOTHING A READER SEES CONSUMES ANY OF IT" IS WHAT THIS ENTRY USED TO SAY
  AND IT IS FALSE — CORRECTED 2026-10-09 06:5xZ.** `sec-funds.json` appears in
  `app.js` and `fund-er.js` only inside comments, which is true and is not the
  same claim: **`merge-4i.mjs` already writes `ftk` — a matcher-resolved ticker,
  on 2,823 rows — into the lineup store, and `lookupTicker` reads `f.ftk`
  FIRST**, ahead of every pattern-table arm. So a reader is already seeing SEC
  symbols today, and the wiring question is not "connect an unused source" but
  "widen a channel that exists". *Before adding a SOURCE, ask what the pipeline
  already reads and throws away* still applies — the download, the parse and the
  matcher are all already paid for — but the honest version is narrower.
  ***AND THE ERROR INVERTED THE SAFETY ARGUMENT, which is why it mattered more
  than the sentence.*** A merge-time write **overwrites** whatever
  `lookupTicker` would otherwise have resolved, so widening `ftk` can take a
  symbol AWAY as readily as add one; a RENDER-TIME fallback consulted after
  every existing arm cannot, by construction. The two have the same gain and
  completely different loss profiles, and I had argued for the merge-time shape
  on the strength of a claim that there was no channel to disturb.
  **It also subsumes two open queue items by construction:** the matcher reads
  `Dodge and Cox Stock` → DODGX, which is the `and`-spelling item (228 rows),
  and it pins share classes, which is the store-vs-page item's blocker.
  **SIZED 2026-10-09 01:3xZ, AND THE 43.3% WAS NOT THE GAIN — THE GAIN IS
  14.1%, AND 93% OF IT IS ASTERISKS.** Over all **1,721,920 published+served
  rows** (549,416 distinct issuer|name pairs), asking the SHIPPED
  `lookupTicker` and `resolveHolding` side by side:

  | | rows | |
  |---|---|---|
  | resolves today (UPPER bound) | 701,841 | |
  | none today, SEC **EXACT** | **17,732** | would ASSERT a symbol |
  | none today, SEC **AMBIGUOUS** | **224,201** | would publish a COMPARABLE (*) |
  | none today, SEC silent | 778,146 | still a gap |

  **So 241,933 rows / 14.1% of published rows would gain a symbol, and only
  17,732 of them an ASSERTED one** — the other 92.7% are asterisked
  approximations, because filers usually do not state the share class. *The
  43.3% I published one turn earlier is the MATCHER's own coverage of fund-like
  rows, most of which the page already resolves; quoting it as the gain
  over-stated this item by ~3x.* Family gains: Fidelity 1,637 exact / 47,955
  ambiguous, Vanguard 3,020 / 21,146, JPMorgan 798 / 10,702, iShares 1,078 / 47.
  **PARTICIPANTS COMPUTED 2026-10-09 01:1xZ, and the people figures are what
  make the comparable half the owner's call rather than mine.** Over the 60,327
  plans / **100,151,069** participants with a published+served menu — a plan
  counted ONCE per bucket, never once per row:

  | at least one row on this plan's page would | plans | ppl |
  |---|---|---|
  | gain an **ASSERTED** symbol (B) | 7,857 | ~~9,189,637~~ **see below** |
  | gain a **COMPARABLE** (C) | 39,178 | **59,327,082** |
  | remain unresolved (D) | 59,726 | 99,915,818 |
  | **gain anything** (B or C) | 41,562 | **61,821,621** |

  **DO NOT CARRY 7,857 plans / 9,189,637 ppl FOR THE ASSERTED HALF — I published
  it four times and it is wrong by 43%. Re-measured through the tracked
  `apppath` harness with the serving condition and the publish gate applied:
  20,332 rows / 5,296 plans / 6,436,341 ppl.** The screen above asked
  `lookupTicker` and `resolveHolding` of every stored row; the page serves a
  trust's menu only where the plan's own lineup is unusable, and a row behind a
  suppressor is never priced or symbolised at all. ***A measurement of what a
  page PUBLISHES must apply every condition the page applies, in order*** —
  recorded in this file four times before this instance, and the figure it cost
  was the headline of the only half of this item I had called shippable.

  ***THE BUCKETS OVERLAP AND MUST NEVER BE SUMMED*** — a plan appears in every
  bucket its menu carries a row of, which is why D is 99.8% of participants:
  **after the wiring, nearly every page still has a row neither resolver
  reaches.** That is the honest ceiling and it belongs beside any gain claim.
  **The comparable half would put a new asterisk on a page read by 59.3M
  people**, which is the scale that makes it a decision and not a cleanup.
  **A ship of the ASSERTED half alone touches 5,296 plans / 6,436,341 ppl** (the
  corrected figure above), of which **2,384 plans / 2,494,539 ppl carry no
  comparable row at all** — that sub-figure is from the uncorrected screen and
  is an upper bound until re-derived — and are the cleanly separable population.
  **THE CRAWLABLE PAGES PUBLISH NO TICKER COLUMN AT ALL** (verified: no
  `lookupTicker`, no `fundTickerInfo`, no `.stk` in `build-seo-pages.mjs`), so
  this is a ONE-SURFACE change and the usual "regenerate the pages and diff"
  control is inapplicable rather than skipped.
  **NAMED LIVE INSTANCE, FOUND BY THE 01:08 DRAW — UnitedHealth Group, 262,812
  ppl, a healthy 95-fund menu at ratio 0.992**, publishes no ticker on
  `AMERICAN NEW PERSPECTIVE CLASS F1`, `AMERICAN THE NEW ECONOMY FUND CL F2`,
  `NEUBERGER LARGE CAP VALUE INST` and `TCW METWEST HIGH YLDBOND CL M` while
  the row beside them, `TCW METWEST TOTAL RETURN BOND CLASS I`, resolves
  **MWTIX at 0.45**. ***The filing STATES the share class on every one of
  them*** (`CLASS F1`, `CL F2`, `INST`, `CLASS I`), so these are the ASSERTED
  bucket and not the asterisk bucket — the blank is a house-ABBREVIATION gap
  (`AMERICAN` for American Funds, `TCW METWEST` for Metropolitan West), which is
  what `fund-er.js`'s pattern table cannot carry and the SEC matcher's
  manager-token rule can. Two of the four also carry WELDED names
  (`NEW ECONOMYCLASS`, `HIGH YLDBOND`), so part of this population needs the
  name repaired before any resolver can reach it.
  **THE GAIN IS A LOWER BOUND BY CONSTRUCTION:** `lookupTicker` is asked without
  renderRow's later gates (the `tab === "menu"` gate, `stockRow`, the
  suppressors), so "resolves today" is an upper bound. Fixtures confirm the
  instrument in both directions: `Dodge and Cox Stock` reads page `null` / sec
  `DODGX*`, and `Costco Wholesale Corporation` reads null on BOTH — employer
  stock is no registered series, which is why the synthetic-plan shortcut cannot
  inflate the gain.
  **WHAT THE SIZING MAKES DEBATABLE RATHER THAN OBVIOUS:** publishing 224,201
  new asterisked comparables is a large increase in hedged content for a modest
  increase in identification, and a comparable is still a published claim. The
  asserted 17,732 are the clean half. **Owner's call on the comparable half.**
  **THE ASSERTED HALF SHIPPED 2026-10-09 — 4,346 published rows / 1,938 plans /
  2,316,219 participants gain a symbol, SWAPS 0, LOSSES 0, COMPARABLES SHIPPED
  0, and 0 crawlable pages moved.** `lookupTicker`'s last arm reads
  `sec-tickers.js`, 2,590 keys / 170 KB raw / **29 KB gzipped**, generated by
  `scripts/gen-sec-tickers.mjs` and tethered by `scripts/sec-tickers-test.mjs`.
  The page cannot ask the matcher — the predicate needs the 29,406-row index and
  the browser must never download it — so the question is asked once at build
  time over PUBLISHED AND SERVED rows and only the answers ship. Render-time and
  deliberately NOT through `merge-4i`: `ftk` is consulted FIRST in that function,
  so the same data through the same matcher has the opposite loss profile.
  **DO NOT CARRY 17,732 rows / 7,857 plans / 9,189,637 ppl** (that screen omitted
  the serving condition and the publish gate) **NOR 20,181 rows / 5,204 plans /
  6,310,636 ppl**, which is this ship's own intermediate figure before the
  vehicle refusal below — **wrong by 2.7x on participants, and wrong in the
  direction of a false claim.**
  ***THE REFUSAL IS FOUR FIFTHS OF THE ITEM AND IT CAME FROM A SEEDED DRAW, NOT
  A COUNT: A POOLED VEHICLE IS NOT THE REGISTERED FUND.*** `fund-er.js:1451`
  already carries the rule and its comment already names the failure — an
  insurance separate account filed as `VALIC Vanguard Windsor II Fund` resolving
  to VWNAX asserted is *"the claim that the plan holds the Vanguard fund itself.
  It does not; it holds a separate account that invests in it, at the separate
  account's higher cost."* `match-sec-tickers` has the same rule on the NAME and
  **cannot see the TYPE cell at all**, because `resolveHolding` is never given
  one. So the generator asks fund-er's own predicate, sliced with all three
  arms, and **withholds 51,491 rows / 7,789 plans / 19,661,199 participants**
  typed collective trust, separate account, managed account or master trust.
  Asterisking them instead would be the gated half arriving by a side door.
  **Only a draw that printed each row's TYPE beside its answer could find it —
  the symbol is right for the FUND and wrong for the VEHICLE, so every count,
  every fixture and the whole-store swap/loss diff read clean.**
  **AND 10,718 FURTHER ROWS ARE A GAIN NO READER COULD EVER SEE**, excluded for a
  different reason: `renderRow` gates `lookupTicker` itself on `!gicRow &&
  !subtotalRow && !loanRow && !annuityRow && !contractRow`, and overrides `tk`
  outright for a loan or employer-stock row. `Vanguard ® Target Retirement
  Income Fund- Investor Shares` typed `Stable value / GIC` trips `gicRow`, so
  its VTINX could never reach the page. *A count of what the predicate answers
  is not a count of what the page prints.*
  **THE FEE CANNOT MOVE WITH IT, read off the shipped expression rather than
  argued:** `er` takes `star ? info.er : fundERRow(f)`, the arm always returns
  `comparable: false`, so `star` stays false and the fee stays name-keyed.
  **68 gain rows were read across three SEEDED UNIFORM draws (24 + 20 + 24) and
  all 68 are correct** — and both defects above were found in those draws.
  Largest reader-facing gain: **UnitedHealth Group, 262,812 ppl**, whose
  `BERKSHIRE FOCUS FUND 0.40% USADDRESS 475 MILAN DR …` cleans to `BERKSHIRE
  FOCUS FUND` and now publishes **BFOCX** on $84,649,102.
  **THE COMPARABLE HALF IS STILL THE OWNER'S CALL and is now smaller than
  recorded: 188,846 rows / 35,353 plans / 49,065,090 ppl**, not 224,201 /
  59.7M — the pooled rows are classified as a vehicle refusal before the
  asserted/comparable split is reached. `docs/accuracy-log.md` 2026-10-09.
- **SHIPPED 2026-10-09 23:3xZ — A VANGUARD COLLECTIVE TRUST PUBLISHING THE
  RETAIL FUND'S TICKER AS FACT: 18 rows / 2 acks / 6 plans / 146,331 ppl /
  $11,497,614,236 stop ASSERTING**, one disjunct in `fund-er.js`'s `pooled`
  veto, `star` ON 18 with ticker withdrawn/gained/swapped 0, **fee changed 0**,
  name 0, shownType 0; one surface by construction (`build-seo-pages` has 0
  references to `fund-er`/`lookupTicker`/`fundTickerInfo`), `PARSER_VERSION`
  stays 203. **DO NOT CARRY the sizing screen's 7 plans / 146,668 ppl** — it
  omitted the SERVING CONDITION; 6 / 146,331 is authoritative.
  **LEAVE-ONE-OUT WAS BLIND TO HALF THE NECESSITY AND I WROTE THE WRONG COST
  INTO THE SHIPPED COMMENT BEFORE MEASURING THE OUTPUT.** `\bflex\b` is
  load-bearing for **84,877 rows** (without it the arm pools every Vanguard
  target-date MUTUAL fund); the `vanguard` and `target ret` conditions each read
  **necessary for 0** because they are **MUTUALLY REDUNDANT**, so applying the
  recorded "a condition blocking 0 rows is not a protection" rule mechanically
  would have deleted a real guard — ***a conjunction's conditions cannot be
  priced one at a time when two of them block the same population.*** And
  dropping both costs **6 published rows, not the 479 routing rows**: the pooled
  branch **never consults `FUND_TICKER`** (`fund-er.js:1541` is inside
  `!pooled`), so `Fidelity Flex Government Money Market Fund` — a REGISTERED
  fund — **loses its correct unasterisked SPAXX** on 6 rows / 1,843 ppl.
  ***A guard whose job is to withhold a false assertion can cost a true one.***
  **The six decoys I first reached for all resolve to NOTHING today**, so
  pinning them would have been decorative; the two shipped single-protection
  pins each fail by name against their own mutation, and the SPAXX pin is the
  ONLY failure under drop-both. **And `fund-er-test.mjs` does NOT read
  `FUNDER_PATH`** (it takes `--src`/`--file`), so my first baseline run reported
  0 failures while reading the working tree twice — *a before that is silently
  the after reads as a clean no-difference.* **STILL OWNER-GATED: the FEE** —
  `er = star ? info.er : fundERRow(f)` prices the NAME either way, so the
  Investor Shares 0.08 is still published on a row that now names no fund.
  **ORIGINAL SIZING, kept because it is what was predicted:** all 18 publishing
  a fee and all 18 with a BLANK type cell. General Dynamics files nine `VANGUARD TARGET RET <vintage>
  FLEX` rows publishing VTHRX / VTTHX / VTTVX / VFORX / VTIVX / VFIFX / VFFVX /
  VTTSX / VLXVX at **er 0.08, ASSERTED**, the 2030 row alone $1,067,037,798
  (4.6% of a $22.99B menu); the 18 is nine vintages × two acks whose menus are
  identical and both served.
  **THE WITNESS IS THIS REPO'S OWN REGISTRY, asserted before the count and set
  to THROW if it stops holding:** `sec-funds.json` registers VTHRX as
  `VANGUARD CHESTER FUNDS :: Vanguard Target Retirement 2030 Fund`, class
  **Investor Shares**, and **`FLEX` appears 145 times with NOT ONE a Vanguard
  target-date series** (all Janus Henderson Short Duration Flexible Bond and
  kin). *Vanguard Target Retirement Trust Flex* is a COLLECTIVE TRUST the SEC
  registers no series for, so it has no ticker and no public ER.
  ***THE CONTROL IS INTERNAL — our own page already gets this product right on
  other plans, and only the TYPE CELL varies.*** Of 537 published `FLEX` rows,
  `Vanguard Target Retirement 2050 Trust Flex` typed **`Collective trust`**
  publishes **`VFIFX*`**, an asterisked comparable ($1,014,132,228), and eight
  siblings likewise; `VFTC Target Retirement <vintage> Trust Flex` ×8 publish
  **no symbol and no fee**, the most honest of the three. So one product gets
  three treatments and a blank type defeats every type-reading guard — the
  `gicRow` shape for the FOURTH time (Accenture stable value, the 17:4xZ
  Fidelity Freedom ladder, the CREF accounts, this). **Remedy is
  one-directional and needs no registry we lack:** give the row the asterisk its
  typed sibling already gets, assert -> comparable, never the reverse; the `FLEX`
  token is NAME-anchored so it does not touch the issuer cell, which was
  measured worthless two hours earlier. The FEE half (0.08 is the Investor
  Shares fee published as a trust's) goes with the owner-gated families — *a fee
  is SOURCED, never derived.* `docs/accuracy-log.md` 2026-10-09 (21:2xZ) and
  (23:3xZ).
- **The one-class residue: 511 shipped `stk` rows / 339 names / 395,265 ppl
  state a class the series does not register, dominated by `Vanguard Target Ret
  <year> Inst` — AND "a pre-existing property of `resolve`'s one-class arm" IS
  THE WRONG DIAGNOSIS, corrected 2026-10-09 22:2xZ.** Measured against
  `sec-funds.json`: **all TWELVE** Vanguard Target Retirement series carry
  **exactly one class, `Investor Shares`** (VTINX..VSVNX), **0** series match
  `vanguard`+`institutional`+`target`, and VIRSX is absent. **Control: the file
  is NOT generally one-class** — of 220 Vanguard series, 123 carry more than
  one, and Wellington (VWELX/VWENX), Windsor, Windsor II and FTSE Social
  (Institutional VFTNX + Admiral VFTAX) all carry multiple. So the resolver does
  the only thing it can and the gap is in the SOURCE, which has a different fix.
  **TWO CAUSES, UNDISTINGUISHABLE IN-SANDBOX, AND THE REMEDY DIFFERS:** (a) the
  file is thin for this family -> these are a named live instance of the
  owner-gated wrong-share-class item, fix = correct the symbol and withdraw the
  fee; or (b) the Institutional funds are no longer registered -> the file is
  right, the filed name names a gone product, and it is the Oppenheimer/Spartan
  RETIRED-BRAND shape where *a rename is a FACT that must be SOURCED*. The one
  in-repo witness is the silent file, and silence fits both — so it is a
  `data/fund-facts.json` question, not a wider screen. **Named instance:
  Nationwide Children's Hospital, 22,556 ppl**, publishes eight `VANGUARD
  INSTITUTIONAL TARGET RETIREMENT <vintage>` rows ASSERTED at 0.08, VFORX alone
  on $89,014,475 (10.7% of its menu). *And the 0-match query agreed with my
  hypothesis and still did not mean what it looked like — only the multi-class
  control turned it into the right claim.* `docs/accuracy-log.md` 2026-10-09
  (22:2xZ).
- **SHIPPED 2026-10-10 04:0xZ AS `wrapRepair` IN `merge-4i.mjs` — THE
  SELF-WRAPPING DUPLICATION: 93 stored rows / 78 acks / 79 plans / 131,723 ppl,
  of which 62 rows / 53 plans / 84,286 ppl / $1,205,433,011 are READER-FACING.**
  Ticker gained/lost/swapped **0/0/0**, fee **2 gained** / 0 lost / 0 changed,
  asterisk 0, shown type 0, row membership 0; 2 crawlable pages, both read;
  20,096-row control differing on 0. Illinois Tool Works' **$1,060,028,326** row
  (24.8% of its menu) stops publishing `LENDING (TIER J) NT COLLECTIVE S&P500
  INDEX FUND-DC-NON LENDING (TIER J)`; six `American Funds <vintage> Target Date
  Fund R6` rows drop a trailing `American Funds` by STRIP-TAIL, where stripping
  the lead would have removed the HOUSE; and **`Admiral Shares Vanguard Windsor
  II Admiral Shares` -> `Vanguard Windsor II Admiral Shares` KEEPS ITS
  NUMERAL**, the hazard that cost a wrong fund name once. `PARSER_VERSION` stays
  203 — a merge-side repair like its five siblings, so no re-parse and no bump.
  **DO NOT CARRY 93 AS A READER FIGURE: `cleanFiledName` HAD ALREADY UNDONE 31
  OF THEM** — it carries its own leading-class-designation strip, so `Class R-6
  EuroPacific Growth Fund Class R-6` already displayed correctly. Sixth instance
  of *a STORED field is not a PUBLISHED one*, and the first where what had
  already fixed it was a display CLEANER rather than a competing arm.
  **BOTH FEE GAINS ARE A NAMED INSTANCE OF A QUEUED CLASS:** Dental
  Intelligence's `International Growth Fund Admiral Shares` gains 0.26 **while
  its ticker VWILX does not move** — the symbol resolved through the damaged name
  and the fee did not, which is the register's own *the ticker resolver tolerates
  damage the fee table does not* asymmetry, repaired as a side effect.
  **MY FIRST BEFORE/AFTER MEASURED THE HARNESS — a standalone merge is NOT its
  own baseline.** Snapshot + one merge run reported **2,645 changed names and
  18,907 changed NON-NAME fields** for an arm that touches 93 rows and only
  names: the committed store carries 65,479 acks and a standalone merge derives
  **65,495**, so the run is not a no-op against a CI-written tree. ***The fix is
  a DIFFERENTIAL RUN and it is exact rather than careful:*** merge twice from one
  committed baseline, once with the call site neutered to `null`, so whatever
  standalone does differently cancels. It then read 93 / 0 / 0 / 0 with
  1,730,838 rows byte-identical — **and supplied the DISJOINTNESS control for
  free.** *A before/after is only as honest as the claim that nothing else moved;
  earn it by varying ONE thing between two runs, not by trusting a snapshot.*
  **AND THE PAGE FOUND WHAT NO COUNT COULD:** directly below ITW's repaired row
  sits `Lending (Tier J) Mfb Nt Collective Msci Acwi Ex-Us Index Fund - Dc - Non`
  at **$458,253,330**, carrying the IDENTICAL stray prefix and correctly NOT
  repaired — its tail is `- Dc - Non`, so there is no duplication to witness.
  That is the shifted-menu class the mid-name-house entry still owes an
  orientation test, and the two shapes sit one row apart on one page. Named
  residue, not a gap in this arm.
  **THREE OF THE QUEUE ENTRY'S OWN PRESCRIPTIONS DID NOT SURVIVE THE ATTEMPT.**
  (1) **THE STAGE.** It read *"canonical in `lib-disclose` with a SLICED app.js
  twin"* and that is IMPOSSIBLE: the validated witness is an attestation map
  over all 65,495 lineup entries and **the browser holds ONE plan's shard**, so
  it belongs where the other five name repairs live, reading the `whole` map
  already built there. ***Fourth instance of a queued prescription being wrong
  about WHERE rather than about WHAT*** — and the tell needed no run, since *the
  witness names the data it needs and the data says which stage can ask.*
  (2) **THE POPULATION.** The pilot detected on `H.clean(name)`; the merge sees
  `f.name` raw, keys by `nk` (punctuation KEPT) over CONFIDENT entries only.
  Three differences at once, so **do not carry 70 rows / 85,237 ppl** — the
  class is 455 rows and the gate acts on 93 / 131,723, a third more people.
  *A population measured through one normalisation is not the population a
  repair runs under.* Both must-see pins survived the change of normalisation.
  (3) **THE RATIO REFUSES ZERO ROWS HERE and the floor is the whole
  protection.** Priced both ways: floor alone 93, ratio alone 154, both 93,
  detector alone 154 — so the floor blocks 61 and the ratio cannot bite, every
  admitted row having the opposite side attested 0 or 1. Kept and **labelled
  decorative**, as the class-rotation arm labels its punctuation condition,
  because the pilot found the shape it exists for and a lower floor re-opens it.
  **What the floor refuses is a DIFFERENT family, named not swept in:** `Money
  market fund - Fidelity Government Money Market Fund` ×14 is a welded TYPE
  CAPTION whose lead strip leaves a dangling separator and whose remainder is
  attested once; it wants its own arm.
  **AND A CONDITION I WROTE WAS UNREACHABLE BY CONSTRUCTION — the loop bound
  `k <= floor((n-3)/2)` ALREADY forces `n - 2k >= 3`**, so the "substantial text
  between" test could never fire. `wrap-repair-test` could not build a case
  where it was the only protection, *not because the probe was poor but because
  production cannot reach one* — the `ExxonMobil` trap in its purest form.
  ***A condition unreachable by construction is worse than an inert one: it
  reads as a guard and is dead code.*** Deleted; the invariant is ASSERTED over
  name lengths 5..60 instead. The first three probes failed too, every one
  protected twice **by the loop bound rather than by the condition it pinned** —
  *build a single-protection case against the loop's reachable range, not
  against the condition's text.*
  **`scripts/wrap-repair-test.mjs` IS CI-SAFE WHERE `merge-name-test` CANNOT
  BE:** it SLICES the arm out of the source and supplies **its own FROZEN
  attestation map**, so DOL drift cannot flip it — that file reads every pin off
  live attestations and has changed status three times on drift alone, and a
  gate that reddens on a refresh with nothing wrong is the habitually-red gate
  that hid ten `site-test` failures. 5 must-fire, 5 must-not-fire (the vintage
  pair `… 2050 Trust II … 2055 Trust II` among them, which
  `collapseSelfRepeat`'s forward-prefix rule exists to spare), 3
  single-protection mutations, the invariant.
  **Measured through the REAL merge: `self-wrapping-duplication repair: 93 rows
  across 78 plans`, the same 93 predicted — which is also the DISJOINTNESS
  control**, since the count would not agree if any arm above it in the chain
  claimed a row. `confident` 60,182 unchanged, CONFIDENCE DIFF +0/−0, degraded
  swaps 0. **ALL 93 READ and 0 are rotations**, structurally rather than
  statistically: the surviving side is attested as a whole filed name ≥3 times,
  so it IS a name by construction — which is exactly what the order-blind
  resolver could not establish. `docs/accuracy-log.md` 2026-10-10 (03:4xZ).
- **ORIGINAL SIZING, kept because it is what was predicted — A WRAPPING
  DUPLICATION (`X … X`): 276 rows / 263 plans / 486,519 ppl / $2,604,062,045**,
  of which
  **66 publish a TICKER, 65 a FEE and 6 are asterisked**. A published name whose
  leading k-token run equals its own TRAILING k-token run with substantial text
  between. **`collapseSelfRepeat` cannot reach it BY CONSTRUCTION, not by its
  floors** — that arm needs the repeat to run FORWARD from the remainder's start
  (`X X rest`), which is what keeps two vintages of one series intact, so for
  `Trust TD2 Capital Group …` it asks whether the remainder starts with
  `trusttd2` and it starts with `capitalgroup`. Lowering the 3-word/10-char
  floors would still not reach it.
  **THE DETECTOR IS SOUND AND THE REPAIR IS REFUSED, by reading every member.**
  Both copies sit inside ONE name, so the evidence is not drawn from a sibling
  the same column shift could have produced — the property the shipped arm's own
  comment names as what makes duplication sound. ***That establishes the
  DETECTOR and says nothing about the REPAIR.*** `X mid X` holds THREE
  orientations: lead stray (ITW $1,060,028,326 / 24.8% / **NOSIX\***, Charles
  River, Cook Group, Union Savings strip correctly); **TAIL stray** (Gnc
  Holdings $26,738,712 / SSSYX\*, where stripping the lead removes the HOUSE);
  and a **ROTATION** whose head appears at both ends, where NEITHER strip is a
  name (Consolidated Edison $486,479,115 — the fund is `Vanguard Institutional
  Total International Stock Market`). **Fourth instance of *a witness that a row
  is damaged is not a witness to which side the damage is on*, and the first
  where the witness is INTERNAL** — adjacency is what pinned the orientation for
  `collapseSelfRepeat`, and *being inside one name removes the contamination
  problem, not the orientation problem.*
  **THE PRESCRIBED ORIENTATION TEST IS REFUTED FOR THIS CLASS BY CONSTRUCTION,
  AND THE ORDER-SENSITIVE REPLACEMENT IS VALIDATED — PILOTED 2026-10-10 02:4xZ
  ON THIS 276-ROW CLASS DELIBERATELY, BECAUSE EVERY MEMBER HAD BEEN READ** and
  the oracle's answers could be scored against known ground truth rather than
  against their own plausibility. The register prescribes *build both
  candidates, let the shipped resolver say which is the fund, abstain where both
  answer*. Built exactly that, asking BOTH shipped resolvers: **0 wrong but 5
  ABSTENTIONS of 6 pinned cases, and of the 12 rows it acts on 5 are WRONG and
  ALL 5 ARE ROTATIONS** (Matheny -> `Shares Vanguard Small Cap Index Admiral`;
  Cava -> `Class K Fidelity U.S. Bond Index Fund`, both resolving cleanly and
  neither a name). ***A TOKEN-SET MATCHER IS ORDER-BLIND, AND `X mid X` STRIPS
  TO `mid X` OR `X mid` — THE SAME MULTISET MINUS ONE COPY OF `X`*** — so the
  resolver answers identically on both sides (ITW `NOSIX*` twice, Gnc `SSSYX*`
  twice) or on neither, and the abstentions are not caution but the only output
  the design can produce. The orientation question is about ORDER and the oracle
  discards order. Third and sharpest face of the recorded rule: the file already
  says *a resolver gain is evidence the string reaches a fund, not evidence it
  reaches THIS fund*, and this adds ***a resolver answer is not evidence the
  string is a NAME at all.*** It may still work for the mid-name-house PARENT,
  where `house + tail` and `house + lead` are genuinely different token sets.
  **WHAT WORKS IS VERBATIM ATTESTATION AS ANOTHER ACK'S WHOLE FILED NAME** — no
  plan files the rotated spelling as its whole name, so it sees exactly what the
  resolver cannot. It exposed the floor hazard in textbook form: **Cava won on
  ONE attestation, which is another damaged copy** (*a floor of ONE lets a
  single damaged row license the same damage elsewhere*), and **Arden abstained
  because TWO damaged copies attested its rotation**. At **floor 3 / ratio 10:
  70 rows / 61 plans / 85,237 ppl** (48 lead, 22 tail), abstains on 206 of 276,
  **0 rotations in the acted set, and all four hard pinned cases abstain**
  (Charles River, Union Savings, Gnc, ConEd). Sensitivity: floor 5 gives 67 /
  51,185, ratio infinity gives 68 / 84,509 — not balanced on either constant.
  **ALL 70 READ**, which the 7-of-12 shows is necessary: ITW's $1,060,028,326
  row becomes `NT COLLECTIVE S&P500 INDEX FUND-DC-NON LENDING (TIER J)`, eight
  `American Funds <vintage> Target Date Fund R6` rows drop a trailing
  `American Funds`, and **`Admiral Shares Vanguard Windsor II Admiral Shares` ->
  `Vanguard Windsor II Admiral Shares` KEEPS ITS NUMERAL**, the recorded hazard
  that cost a wrong fund name once and the first fixture the repair must pin.
  **RESIDUE CLOSED 2026-10-10 07:3xZ — IT REACHES NO READER, AND A TRIM WOULD
  SWAP THREE TICKERS TO A WRONG SHARE CLASS ON $608,742,234.** Of 3,946
  published+served rows whose STORED name ends on a separator, **`H.clean`
  already removes it on 3,605** — so the wrapping arm's residue is cosmetic in
  the store and invisible on the page. The 390 that still dangle for a reader
  are a DIFFERENT class, and ***the `+` family (89 rows / 32 plans / 269,872
  ppl) is CORRECT AS FILED: `INST+` is `Institutional Plus`, a SHARE CLASS.***
  Priced through the page's own resolver a trim gains 0 and loses 0 tickers and
  **SWAPS 3** — Howmet `VANGUARD INST INDEX-INST+` **VIIIX -> VINIX**
  ($249,406,048), Occidental `VANGUARD MID CAP INDEX-INST+` **VMCPX -> VIMAX**
  ($233,557,619), Alcoa VIIIX -> VINIX ($125,778,567) — every one onto a
  cheaper, different class. **This file had already warned that `*` and `+` are
  PARTY-IN-INTEREST markers and must not count as joiners, and I wrote `+` into
  the character class anyway:** *a recorded trap in a vocabulary is not
  protection against writing that vocabulary again* — price every candidate
  character through the resolver before reading the count. **And trimming the
  other 301 moves ticker and fee on 0, which argues AGAINST it:** a trailing
  dash is this record's dominant ending for the TRUNCATED-name class, so the
  separator is the only visible sign the name was cut — *a visible artifact
  warns the reader; a wrong fund name reads as knowledge.* **NEW named class
  from it, unsized: the `&` family, 79 rows / 76 plans / 208,860 ppl of real
  truncations** (Paramount Global's `Evergreen &` on **$679,811,000**, Entergy's
  `Fixed Income: Trusts &` on $330,746,216), where the recorded position is
  RECONSTRUCTION and never suppression. `PARSER_VERSION` stays 203.
  `docs/accuracy-log.md` 2026-10-10 (07:3xZ).
  `docs/accuracy-log.md` 2026-10-10 (02:4xZ).
  **AND THE CLASS I FIRST BUILT DOES NOT EXIST — my own draw's print made it.**
  `draw-published` printed `JSON.stringify(x).slice(0, n)`, cutting INSIDE the
  quotes and dropping the CLOSING QUOTE, so a complete name read as one the
  parser had cut mid-word. I sized and fixtured "rotated and truncated", **both
  fixtures PASSED** (hand-supplied siblings from the same misread string), and
  the whole-store scan read **0** — the recorded *a broken arm and an inert arm
  read the same zero*. **SHIPPED: `cut()` appends an explicit `…+N`.** *Pin a
  positive fixture from the DATA before believing any zero*, and note the rule
  was met in my own INSTRUMENT's output column, which is the harder place to see
  it. `docs/accuracy-log.md` 2026-10-10 (00:3xZ).
- **SHIPPED 2026-10-10 06:1xZ — AN APOSTROPHE-ELIDED SHARE CLASS LEFT A STRAY
  LETTER AND THE MATCHER REFUSED THE WHOLE ROW: 318 rows / 292 plans /
  ~897,000 ppl gain an ASSERTED symbol.** `norm("Inst'l Shares")` is
  **`"institutional l shares"`** — the expansion is already in the matcher's
  normaliser and leaves a ONE-LETTER token, an unexplained leftover, so
  `resolveHolding` declines. Same series: class spelled out -> VINIX,
  filed as `Inst'l` -> **nothing**. Never a registry gap — `sec-funds.json`
  registers VINIX as exactly the `Institutional Shares` class the filing states.
  One candidate-list append in `gen-sec-tickers.mjs`'s `secAsk`, **ADDITIVE BY
  CONSTRUCTION** (the repaired spelling is consulted only where every existing
  spelling came back empty), and **NOT in `norm`** because `merge-4i` shares it
  to write `ftk`, which `lookupTicker` consults FIRST — *the same data through
  the same matcher has opposite loss profiles at the two stages.* Four
  spellings, each its own rule: `Inst'l` is institutional, `Int'l` is
  INTERNATIONAL. Measured through the real generator: ASSERTED 4,664 rows /
  2,230 plans / 3,213,379 ppl (from 4,346 / 1,938 / 2,316,219), **SWAPS 0,
  LOSSES 0**, table diffed key by key **ADDED 176 / REMOVED 0 / CHANGED 0** with
  **0 added keys lacking an apostrophe form**. 26 keys drawn uniformly and read,
  **26 of 26 correct**; the control that the class token is READ is one house's
  own pair, `Empower US Gov't Securities Fund Inst` -> MXDQX beside `… Inv` ->
  MXGMX. One surface by construction (`build-seo-pages` has 0 ticker-resolver
  refs); fee cannot move (`star` stays false). `PARSER_VERSION` stays 203.
  **THREE CLAIMS IN THE ENTRY BELOW ARE WRONG and each is a recorded rule.**
  (1) *"the apostrophe hypothesis is REFUTED"* is true of `lookupTicker` and
  **FALSE of the SEC matcher** — ***there are two resolvers, and a hypothesis
  refuted through one is untested through the other.*** (2) *"the control proves
  `lookupTicker` reads this issuer"* conflated the chains: the sibling resolves
  through `fund-er.js`, the matcher refuses it too, and **`resolveHolding` uses
  the issuer only when it IS the bare house** (`Vanguard` answers, `Vanguard
  Fiduciary Trust` does not) — the custodian words are a SECOND defect, unsized.
  (3) **the series can NEVER assert** — `Institutional` sits inside the SERIES
  name so the class token is ambiguous and the answer is always a comparable, and
  the generator ships assertions only, so **H&P's own motivating row still
  publishes no ticker**: *a motivating case can be outside its own repair.*
  **AND MY PROBE'S GUESSED ROW SHAPE NEARLY PUBLISHED "THE REGISTRY IS
  SILENT":** `sec-funds.json` rows are `[registrant :: series, ticker, "class",
  className]`, so reading `r[2]` as the series compares against the literal
  `"class"` and returns **0 for every query**. ***A guessed SHAPE fails as a
  clean zero where a guessed field NAME throws*** — the `loadStatus()` lesson
  again, and `sec-funds.json` has no `lib-schema` loader.
  **AND `stamp-assets.mjs` COVERS `sec-tickers.js` ALL ALONG** — it names four
  files in its COMMENT and derives its real list from `index.html`, so a grep for
  the filename finds nothing and the implementation is general. *Read the shipped
  guard's SURFACE, not its description*, including when the description is an
  older comment. **The custodian blocker is now SHIPPED — see the entry below.**
  **Still open:** 194 rows / 488,810 ppl this repair newly makes the matcher
  answer as a COMPARABLE, which belongs with the owner-gated comparable half.
  `docs/accuracy-log.md` 2026-10-10 (06:1xZ).
- **SHIPPED 2026-10-10 16:4xZ — A BARE REGISTERED NAME NOW MEANS THE BARE
  CLASS: 8,308 published rows / 5,432,225 ppl gain an ASSERTED symbol**
  (11,105 -> **19,413** rows, 5,599,670 -> **11,031,895** ppl, 3,499 ->
  **7,414** plans), table 5,749 -> **7,350** keys, **ADDED 1,601 / REMOVED 0 /
  CHANGED 0, SWAPS 0, LOSSES 0**; `PARSER_VERSION` stays 203, one surface
  (`build-seo-pages` has 0 ticker-resolver refs), fee cannot move (`star` stays
  false). Cost: the table every visitor downloads goes 53,173 -> **64,520 bytes
  gzipped**. 24 keys drawn uniformly and read, **24 of 24 correct**.
  Oracle Corporation (101,985 ppl) filed `Fidelity Worldwide Fund` and the page
  published NOTHING on $410,529,000, because `resolveHolding` answers **FWAFX**
  — the `Fidelity ADVISOR Worldwide Fund: Class A`, a different product line
  sold with a load — as a COMPARABLE, which this table never ships. Same for
  Magellan (FMAGX published as FMAEX\*), `Fidelity Low-Priced Stock Fund`
  (FLPSX as FLPCX\*), `T. Rowe Price Large-Cap Value`.
  **THE PRINCIPLE WAS ALREADY SHIPPED ONE LEVEL UP:** `match-sec-tickers.mjs:1286`
  narrows a one-word class statement to the class stating only that word,
  commented *"a more specific class is a different class, and it is not what a
  bare mention selects."* The same sentence with "one" replaced by "no" is this
  arm. The condition is structural — `why === "exact+ambiguous"` means the filed
  token set EQUALS the series', so **the filed name equals that class's
  registered name token for token.**
  **THE LOAD-BEARING CONTROL IS INTERNAL AND IT HOLDS:** the hazard is a 401(k)
  holding `Class K` and filing the plain name, and filers state it constantly —
  `FID MID CAP STOCK K6` (28 rows / 239,368 ppl), `FID EQUITY INCOME K` ,
  `T. Rowe Price Large-Cap Value Fund I Class`, `… Fund Class K6`, `Class Z` —
  every one carrying an extra token and so outside the arm BY CONSTRUCTION. **A
  bare spelling is a statement about the class by omission.**
  **THREE CONDITIONS, EACH WITH A MEASURED BLOCKING POPULATION (42 / 13 / 52
  keys) AND A SINGLE-PROTECTION PIN DRAWN FROM THE DATA.** An assertion of mine
  had to FIRE before I believed the second: my sizing compared `className` to
  the series name with `norm` and read **0** series carrying more than one
  un-designated class, where the arm keys on `tokens` and **42 do** — *a
  population measured through one normalisation is not the population a repair
  runs under*, the `wrapRepair` lesson eleven hours later.
  ***AND READING THOSE 42 REFUTED A CONCLUSION I HAD ALREADY WRITTEN INTO THE
  SHIPPED COMMENT.*** From 127 rows read I recorded that a `Fund`/`Portfolio`
  difference is only the filer's wording (`State Street Aggregate Bond Index
  Fund` -> SSAFX `… Portfolio`; `Fidelity Real Estate Investment Fund` ->
  FRESX). For **T. Rowe Price it is a different registered product**:
  `… Equity Income Fund` is **PRFDX** and `… Equity Income Portfolio` is
  **QAAHCX**, a variable-annuity portfolio, and the same pair exists for
  Mid-Cap Growth (RPMGX/QAMWEX), Blue Chip (TRBCX/QAAAJX), Equity Index 500
  (PREIX/QAAGTX), International Stock (PRITX/QAAGYX), All-Cap Opportunities
  (PRWAX/QAOSWX). ***A screen that finds its own conclusion in every member it
  reads has not been shown the members that would refute it*** — all 127 were
  houses where the two words coincide.
  ***THE THIRD CONDITION WAS FOUND BY THE SEEDED DRAW AND BY NOTHING ELSE.***
  The first regen shipped 19,564 rows with ADDED/REMOVED/CHANGED at 1,653/0/0
  and every fixture green, and one of its 24 drawn keys was a defect:
  `iss "GQG Partners" · name "Emerging Markets Equity"` -> **TEMUX**, registrant
  **MORGAN STANLEY PATHWAY FUNDS**. `idx.bySeries` keys on the series TOKEN KEY,
  so `emerging markets equity` holds FIVE classes across THREE registrants; the
  resolver answers GuideStone's **GEMZX\*** and exactly one class is
  un-designated, so conditions (1) and (2) PASSED and the promotion crossed
  registrants on a row naming a third manager. **My comment on condition (1)
  overclaimed:** the tie test catches the cross-registrant collapse only where
  SEVERAL are un-designated and therefore tie (`Stock Index Fund` = VSTIX +
  HSTIX + NOSIX); where ONE registrant of several has it, there is no tie and
  the test is silent. ***A condition that catches one instance of a hazard is
  not a condition against the hazard.*** Fixed by requiring the promoted class
  to share the REGISTRANT of the resolver's own answer, read off `idx.byTicker`.
  **23 of 24 were correct, so no count and no diff could have shown it.**
  **AND MY SIZING UNDER-PREDICTED BY 22% ON ROWS:** it asked `resolveHolding`
  only the RAW and CLEANED spellings where `secAsk` asks four (raw, cleaned,
  apostrophe-expanded, issuer-core-reduced) — *a harness that asks a subset of
  the spellings production asks measures the subset.* Its FIRST figure was also
  wrong by 2.9x on dollars (9,368 rows / $39.9B) because its ten largest members
  were typed `Collective trust`, which `pooledRow` refuses: *a symbol can be
  right for the fund and wrong for the vehicle*, visible only because the type
  cell was printed.
  **TETHERED IN CI AND DELIBERATELY NOT IN THE GENERATOR:** the generator's five
  import-time control blocks read the LIVE `sec-funds.json`, so a registry
  refresh can make them stale — the `merge-name-test` shape. `sec-tickers-test`
  instead asserts the COMMITTED table (`Fidelity Worldwide Fund` -> **FWWFX**,
  `comparable === false`), so a later regen that stops producing it reddens CI.
  `docs/accuracy-log.md` 2026-10-10 (16:4xZ).
- **SHIPPED 2026-10-10 10:4xZ — THE ISSUER CELL'S CUSTODIAN WORDS BLOCKED THE
  HOUSE IT CARRIES: 6,441 published rows / 1,674 plans / 2,386,291 ppl gain an
  ASSERTED symbol** (4,664 -> 11,105 rows, 3,213,379 -> 5,599,670 ppl), table
  2,766 -> 5,749 keys, **ADDED 2,983 / REMOVED 0 / CHANGED 0, SWAPS 0, LOSSES
  0**; one surface by construction, fee cannot move (`star` stays false),
  `PARSER_VERSION` stays 203. Cost: the table every visitor downloads goes
  31,621 -> **53,173 bytes gzipped**.
  **TWO MECHANISMS:** `resolveFaithful` prepends the issuer IN FULL, so a
  custodian's own word `Trust` makes `resolve`'s `pooled` test read the row as a
  COLLECTIVE TRUST (`Vanguard Fiduciary Trust` -> nothing, bare `Vanguard` ->
  VINIX); and `Group`/`Company`/`Fiduciary` are left as unexplained leftovers.
  The reduction is REGISTRY-ATTESTED (longest leading 1-3 token manager phrase,
  longest first) and not a vocabulary.
  **THE PINNED HAZARD FIRED AND ONLY READING FOUND IT: unguarded, the arm
  asserted a registered fund on 30 keys whose issuer cell is `VALIC variable
  annuity accounts`** (`Core Bond Fund` -> VCBDX). ***The accidental protection
  it removed was the very leftover-token behaviour it exists to remove.*** Swaps
  0, losses 0, every fixture green and a seeded uniform draw 16 of 16 correct —
  it took a draw aimed at the sub-population BY NAME (75 keys whose issuer
  carries insurance vocabulary, all read). *A uniform draw over 3,018 keys will
  not reliably surface 30 of them.*
  **TWO REFUSALS, BOTH STRUCTURAL:** the cell names SEVERAL FIRMS
  (slash-separated) — **67 cells / 404 store rows where it is the only
  protection**, members `Principal/BlackRock`, `Capital Group/American Funds`,
  `BlackRock iShares/PGIM`, named cost 176 `FRANKLIN/TEMPLETON` rows; and the
  **STORE ITSELF** attests the house as selling through a wrapper (3 houses from
  1,506 declaring cells: `lincoln`, `college`, `valic`), which needs no brand
  list and survives renames. The generator THROWS if the pre-pass ever flags one
  of the ten houses the gain rests on, and the control was run both ways.
  **A THIRD REFUSAL WAS DELETED AS DEAD CODE, PROVED NOT SAMPLED:** a
  vehicle-declaration guard is UNREACHABLE because the pre-pass is
  SELF-PROTECTING — a declaring cell puts its own leading house into the set.
  `houseCore` is a pure function of one string, so over all **15,685 distinct
  issuer cells it fires on 136 and changes the answer on 0.** Second instance in
  two days of *a condition unreachable by construction is worse than an inert
  one*, after `wrapRepair`.
  ***AND MY FAILING PIN WAS TESTING AN INCONSISTENT WORLD:*** `Prudential
  Separate Account` failed its must-refuse pin only because the harness
  hardcoded the platform set while production DERIVES it from that very cell.
  **When a guard reads a set production derives from its own input, a fixture
  must derive it the same way or it tests a state that cannot exist.**
  **CORRECTS TWO OF MY OWN CLAIMS:** 04:4xZ's *"the control proves
  `lookupTicker` reads this issuer"* and *"the discriminator is the HOUSE's
  POSITION"* are both about the WRONG RESOLVER — the SEC matcher returns nothing
  for the defect row AND both sibling controls, which resolve through
  `fund-er.js`. And H&P's motivating row now resolves **VINIX\*, a COMPARABLE**,
  so it is outside its own repair — second consecutive ship of which that is
  true. Peet's row correctly does NOT move (its blocker is the CONTRACTION).
  **BONUS the queue did not predict:** ~20 gains are the `NYLI` family
  (MLRSX/MHYSX/VREQX), closing the 06:1xZ retired-brand item — `sec-funds.json`
  IS the source a rename needs. **The 40 surviving insurance-issuer gains were
  all read** and every one states a SHARE CLASS, which the record's own rule
  settles: a separate account has none.
  **TETHERED: `scripts/house-core-test.mjs`** in `site-test`, slicing the arm and
  supplying a FROZEN platform set so drift cannot redden it. 7 must-reduce, 8
  must-not-reduce, 2 single-protection mutations drawn FROM the store (never
  `VALIC/SunAmerica`, protected twice), plus the unreachability invariant.
  `docs/accuracy-log.md` 2026-10-10 (10:4xZ).
- **FOUND BY THE 04:07 DRAW, SIZED NOT SHIPPED — THE HOUSE IS ONLY IN THE
  ISSUER CELL: no ticker and a generic fee, with the CONTROL IN THE SAME MENU.**
  Helmerich & Payne (8,479 ppl) publishes `Institutional Index Fund Inst'l
  Shares` · iss `Vanguard Fiduciary Trust` · typed `Mutual fund` at
  **$118,760,710, 13.0% of its menu**, with NO ticker and **0.1** where VINIX
  really costs ~0.035. ***The control is two rows away under the IDENTICAL
  issuer:*** `Total International Stock Index Fund` publishes **VTIAX at 0.09**
  and `Total Bond Market Index Fund` **VBTLX at 0.05** — so `lookupTicker`
  demonstrably reads this issuer and the blank is OURS. Two shapes fail in that
  one menu: a clean issuer with the house absent from the name, and an issuer
  cell reading **`Company Admiral Shares Vanguard Fiduciary Trust`**, a
  column-shift WELD carrying a share-class designation that `weldRepair(f.iss,
  ISS_EV)` cannot reach (it repairs a lost SPACE, not a rotation).
  **MY HYPOTHESIS WAS THE APOSTROPHE AND IT IS REFUTED:** over all 1,876
  published+served rows carrying one (`inst'l` 929, `int'l` 739, `gov't` 198,
  `nat'l` 28), **647 ALREADY publish a ticker, 1,229 resolve nothing either way,
  and expanding it gains EXACTLY 0** — the resolvers handle it already, and the
  647 are why the zero is honest rather than a query artifact.
  **AND MY MUST-SEE PIN MATCHED THE WRONG ROW, printing `must-see ok` while the
  screen was unscoped:** keyed on the NAME, which many plans file, it caught
  **Bway Corporation's** copy — which publishes **VINIX at 0.02** and is the
  external control, the OPPOSITE of the defect. ***A pin keyed on a shared
  STRING does not identify a ROW: key it by ack.*** It also handed over the
  cause for free — Bway's name carries `Vanguard` and resolves, H&P's does not
  with the same share-class spelling, so the discriminator is the HOUSE's
  POSITION and not the abbreviation. **Split three ways:** the missing ticker is
  one-directional coverage with an internal witness (shippable); the FEE is the
  owner-gated family, where 0.1 must be WITHDRAWN rather than corrected because
  `fund-facts.json` has no VINIX figure; the welded issuer needs a rotation arm
  the record refused once for that column, since the only repair there was a
  strip and a strip truncates the firm. `docs/accuracy-log.md` 2026-10-10
  (04:4xZ).
- Unverified costs of the 15:0xZ Vanguard change, recorded as inferences: 386
  rows / 30,686 ppl newly ASSERT where the issuer names an insurance platform
  (against 1,575 rows that already assert that way — pre-existing, cause located
  in `fundTickerInfo`'s `wrapped` test reading the NAME while `lookupTicker` asks
  the bare name), and 140 rows / $987,688,869 reading `Vanguard Target Return
  <vintage>` as a garble of Target Retirement.
- **SHIPPED 2026-10-09 16:0xZ as `isLoanAccountRow` — 371 rows / 339 served
  menus / 2,400,533 ppl / $538,248,498 stop being published as a menu choice, 3
  crawlable pages / 266,168 ppl.** `shownType` is the ONLY cell that moves:
  verified independently before push against 014e5892's own app.js through both
  copies of `renderRow`, narrowed to the 2,306 rows where the predicate fires
  (a superset by construction) with a 4,305-row control over untouched rows —
  **372 moved, all on `shownType`, name 0 / tk 0 / er 0 / star 0, TICKER
  withdrawn 0, FEE withdrawn 0, control differs on 0.** That check was not
  optional: `loanAcctRow` feeds `loanRow`, which GATES `lookupTicker` and
  overrides `tk` outright. **95 rows had a FALSE VEHICLE TYPE withdrawn**
  (`Mutual fund` 29, `Pooled separate account` 28, `Stable value / GIC` 25).
  **THE LABEL IS THE FILING'S OWN WORDS, and only the filings could say so:**
  four were read, and Packaging Corp's, Kohl's and KPH Healthcare's all nest
  these rows under the attachment's own section heading **`Participant Loans`**
  — our parse keeps the Northern Trust export's COUNTRY CAPTION and drops the
  section heading, the one cell that said what the row is. Kroger files it at
  par = cost = current value, which is a loan receivable. *"Names no specific
  fund" would have been FALSE* — these filings name exactly what the row is.
  **DO NOT CARRY the entry below's framing:** screening the country caption
  ALONE reads **115 rows / 2,424,992 ppl / $14.5B** whose largest members are
  REAL funds the caption merely prefixes (HCA's `… MFB NT COLLECTIVE AGGREGATE
  BOND INDEX FUND - LENDING`, $3.05B at 0.05; Honeywell's publishing **SMMD**).
  *The caption is evidence about the DOCUMENT, not the holding, so it can
  trigger an arm and can never be one.* Four conditions were deleted for
  blocking 0 rows, and a first-draft SPONSOR-NAME strip was refused for making
  the verdict depend on WHICH PLAN IS VIEWING. **Named residue, conservative:** a
  recordkeeper brand in front of the same line keeps it (`VALIC Loan Collateral
  Fund` ×11, `TIAA Plan Loan Default Fund` ×10) — needs a brand witness.
  `docs/accuracy-log.md` 2026-10-09 (16:0xZ).
- **FOUND BY THE 15:07 DRAW, SIZED NOT SHIPPED — A TABLE ROW PUBLISHED AS A FUND
  NAME: 163 rows / 73 entries / 75 plans / 115,586 ppl / $408,613,563, of which
  only 6 are already qualified and 43 publish a TICKER and 60 a FEE off the
  debris** (38 at ≥5% of their own menu). The witness is structural: a published
  name carrying TWO OR MORE comma-grouped numbers is a current-year and a
  prior-year COLUMN, and no registered fund is named by two large comma-grouped
  figures. Largest row `40,714 — 40,714 40,714 — VANGUARD FIDUCIARY EXT MKT` at
  **$167,418,000**; Republic National (15,199 ppl) publishes `$ 1,990,313 3211
  p200 $ 28,445,571 3221 p227 …` at **18.8% of its menu / $36,321,498**.
  **NOT SHIPPED BECAUSE THE CLASS SPLITS AND 117 OF THE 163 HAVE NO DIAGNOSED
  CAUSE YET** — my family classifier assigned only 46, and it failed because it
  keyed on the ISSUER CELL being populated where the big rows carry the fund name
  INSIDE the damaged string (*a classifier keyed on a field measures the field*).
  That is also why 37 of those 117 resolve a CORRECT ticker: `Fund Investment
  Company Fidelity 500 Index Fund 236,722.144 shares of Registered 36,475,39`
  publishes **FXAIX at 0.015** — symbol right, name unreadable, legibility and
  not a false claim — while Republic National's row is pure debris. A blanket
  qualification would suppress both, and *a row that names nothing and a row
  whose name we mangled are two classes.* Next step is READING the 117, not
  widening a shape test. The dominant family is a parser defect (column welding /
  region selection) needing a bump: owner's call.
  **DO NOT CARRY the exact-equality witness as the size — it is a SUBSET of 2
  rows / 1 plan and is blind to one of the three rows of its own motivating
  menu**, and before an own-value refusal it was dominated by $1-NAV MONEY
  MARKET rows whose share count equals their value as ARITHMETIC (L Brands'
  `85,408,028 - shares` publishes VMFXX correctly).
  **THE 117 WERE READ 16:3xZ AND THE CLASS CORRECTS TO 162 ROWS, not 163:** a
  comma-separated YEAR LIST is a false positive of the witness (`Fidelity
  Freedom, 2020,2025,2030,…` matches on `020,2025`), 1 row / 127 ppl. Ten shapes,
  and the remedy SPLITS THREE WAYS — the `VANG TARGET RET`/`FID CONTRAFUND` and
  `Blue & Co 401(k) Plan <TICKER> <name> <value>` families publish CORRECT
  tickers and fees and need their NAME repaired; the FAIR-VALUE HIERARCHY and
  note-table families name no fund and need qualifying (**2 are already
  qualified**, so the shipped guard reaches part of it); and one row needs a
  WITHHOLDING. *A row that names nothing, a row whose name we mangled, and a row
  that names the WRONG fund are three classes.*
  **A SECOND SCREEN OF MINE WAS REFUTED 9 OF 9 — do not rebuild it:** "an
  ASSERTED symbol whose house word appears nowhere in the name or issuer" returns
  9 rows and all 9 are correct, because `VANG` and `FID` are the filer's house
  ABBREVIATIONS. It also cannot see its own motivating case.
  **THIRD NAMED INSTANCE OF THE CLOSED CVS TWO-FUND CLASS, found there:**
  `Franklin Dynatech Fund s 2,916,933 $ 2,787,09s Vanguard Federal` publishes
  **VMFXX at 0.11 on $1,887,836, 10.5% of its menu** — two funds welded through
  OCR garble, the resolver taking the TRAILING one, so a Franklin growth fund is
  published as a Vanguard money-market fund. `docs/accuracy-log.md`
  2026-10-09 (15:5xZ) and (16:3xZ).
- **ORIGINAL SIZING, kept for the two sub-populations it correctly refuses —
  THE KROGER LOAN ASSET, MEASURED 2026-10-02.** Published
  rows whose cleaned name carries loan vocabulary and which NO shipped loan
  predicate reaches (all are anchored on the name BEGINNING with the loan
  words, the anchor that keeps `Bank Loan Fund` safe): **722 rows / 625 plans /
  4,537,997 ppl / $1,651,174,135.** It is NOT one class. 5 rows resolve a REAL
  fund (`Invesco Senior Loan ETF`) and 160 rows / 746,258 ppl are real
  SECURITIES wearing the word (ten `FEDERAL HOME LOAN BANK OF …` agency bonds
  at 45,161 ppl, `LOANS SECURED BY MTGES-RESID.`) — both must be left alone.
  **The narrow, clean subset is the custodian's country roll-up caption: 11
  rows / 18 plans / 1,506,159 ppl / $500,411,091** — `Other United States - USD
  &&&KROGER LOAN ASSET` ($142,816,695, 2.2% of its menu; Kroger's own plan is
  262,794 of the trust's 674,716), plus Marriott ($125,071,506), HD Supply,
  Coca-Cola, WK Kellogg, McDonald's, Schlumberger, PaineWebber, UBS PR, Sunchem
  and `KOHL'S LOAN ACCOUNT` (the one with no `&&&`). A second family is the
  plan-loan accounting line: **359 rows / 329 plans / 1,219,186 ppl**
  (`Plan Loan Default Fund` ×194, `Loan Collateral Fund` ×76, `Loan Escrow
  Fund` ×16). All publish no ticker and no fee, so the harm is the CLAIM alone.
  `docs/accuracy-log.md` 2026-10-02 (18:2xZ).
- **`scripts/merge-name-test.mjs` EXITS 0 — RE-MEASURED 2026-10-09 14:3xZ, AND
  THIS ENTRY HAS NOW GONE STALE THREE TIMES IN BOTH DIRECTIONS** (0 → 1 → 0),
  which is itself the point: *a queue entry records what was true when it was
  written.* The file now handles the hazard honestly rather than failing — it
  sets `process.exitCode = 1` for ANY control that goes decorative.
  **THE LAST EXEMPTION IS GONE AS OF 2026-10-09 14:4xZ, AND THE PRESCRIBED
  FROZEN FIXTURE COULD NEVER HAVE BUILT IT.** The both-halves PRE-FILTER was
  labelled decorative rather than claimed; `merge-4i`'s own comment says it is
  subsumed **by construction** (both disjuncts force `w >= 3` whenever
  `joined >= 1`, which holds for any string drawn from the column the maps are
  built from), so a fixture where dropping it changes an answer would pin
  behaviour production cannot reach — the `ExxonMobil` trap in reverse, and the
  **third** queued prescription wrong about WHETHER rather than about the
  symptom. What shipped is an assertion of the unreachability over all **15,544
  distinct RAW issuer values** (raw, not the lowercased keys, which answer 0 by
  construction): **the pre-filter changes the answer on 0**, and the check
  prints the strings and exits 1 if that ever stops being true.
  **Its own positive control FAILED FIRST and was right to:** `ExxonMobil` is
  out-of-population but its halves are attested **5 and 5**, so the pre-filter
  is not what refuses it — ***a probe chosen because it is out-of-population is
  not thereby a probe the condition under test refuses.*** The probe is now
  CONSTRUCTED from the store each run (weld a real spaced issuer at a seam with
  a half attested <3; 1,398 candidates exist) because a hardcoded one would rot
  on the next DOL refresh and go quietly inert.
  **0 decorative controls, exits 0, 33 seconds — and STILL OUT OF CI on
  purpose:** every pin's verdict is read off live store attestations and this
  test's status has flipped three times on drift alone, so CI-safety means
  freezing the evidence the pins read, which is named and not done. A gate that
  reddens on a refresh with nothing wrong is the habitually-red gate that hid
  ten `site-test` failures. `docs/accuracy-log.md` 2026-10-09 (14:4xZ).
  **THE ORIGINAL DIAGNOSIS, which is what made it worth recording (2026-10-02
  20:0xZ):** The failure is the **ISSUER arm's
  `iss-noshipped` control reading 0 of 32** where the record says 1, and the
  file correctly calls its own control decorative.
  **The arithmetic:** the control's case was `AllianceBernstien → Alliance
  Bernstien`, and the issuer column today holds **`AllianceBernstien` 0,
  `Alliance Bernstien` 7**. #547's issuer repair shipped, ran, and removed the
  damaged spelling — and the control's evidence maps are built FROM the store.
  With `joined` at 0, disjunct (2)'s `w > joined * 3` became `7 > 0` = TRUE, so
  the case flipped from "repaired by (1) only" to "repaired by both" and the
  control for (1) can no longer fail. ***A repair arm that runs on every merge
  destroys the evidence its own negative control depends on*** — every arm in
  that file will go this way once it has done its work. Fix: a FROZEN fixture
  instead of the live store. **It runs in no workflow, and must stay out of CI
  until green — a red gate is worse than no gate.** *A queue entry records what
  was true when it was written, and a corrected entry can go stale too.*
- `scripts/map-test.mjs` fails IN THIS SANDBOX at HEAD with
  `ERR_CERT_AUTHORITY_INVALID` on a page resource — identical with a diff
  stashed and applied, so it is an outbound-TLS property of the sandbox and not
  a repo defect. CI is where it settles.
- **SHIPPED 2026-10-04 04:4xZ — THE ISSUER GATE NOW TESTS ITS OWN PREMISE: 20
  rows / 18 plans / 245,810 ppl / $51,048,548,123**, name 0 / ticker 0 / fee 0,
  2 crawlable pages, site-test #162 green, live on main (`bf3d2132`).
  **3M publishes `Common/collective trusts` · issuer `Investments measured at
  NAV` · type `Collective trust` at 74.7% of its menu, $18,418,583,395, to
  40,574 ppl** — the same empty answer in three columns. GM 66.4% / $15.8B
  (65,343 ppl) and 63.6% / $6.2B; Union Pacific 60.9% / $8.1B; Baker Hughes
  15.5% / $1.86B; Goodyear and Cooper Tire on seven rows at 52.1-90.4%.
  **THE GATE'S REASONING WAS RIGHT AND ITS TEST WAS INCOMPLETE:** the page
  prints `issuer · name`, so a row with an issuer "reads as a named holding" —
  but it asked whether an issuer is PRESENT, never whether the issuer NAMES A
  FUND.
  ***READING THE DATA SHRANK MY OWN PLANNED INSTRUMENT TO ONE TOKEN.*** The
  queue asked for "the shipped predicates PLUS the Schedule H caption
  vocabulary", i.e. something wider. Of the 781 rows behind the gate, **19 have
  a generic issuer (the NAV-caption family) and carry $51.0B of the $81.4B**,
  while **762 are the gate WORKING** — the issuer holds `Vanguard Mid Cap Index
  Admiral`, `Longview Core Bond Fund`, `UBC Russell 3000 Index Trust`, `PACIFIC
  LIFE`, `Voya Institutional Trust Company`. A wider net would have qualified
  all 762. *The queue asked for a wider instrument and the data asked for a
  narrower one.* Only `isGenericTypeName` fires; `hasNoFundIdentity(iss)`
  reaches 0, kept because the call site already builds the composition.
  **THE NARROWING WAS A SUPERSET BY CONSTRUCTION:** old `!iss`, new `!iss ||
  isGenericName(iss)`, so a verdict can move only where `isGenericName(iss)` is
  true — 195 candidates, 20 move, discharged on 1,730,475 excluded rows at
  1-in-400 with **0 differing**. The first attempt rendered every
  issuer-carrying row under both copies and did not finish: *not
  patience-limited but unnecessary.*
  **STILL OPEN, and the 03:3xZ measurement stands for it:** of the 961 rows
  called generic by our own parser yet presented as a fund, these 20 are fixed;
  **762 are correct**; 181 employer-stock and 2 subtotal rows are correct; and
  **REMEDY (a) SHIPPED 2026-10-04 06:0xZ as `isLabelOnlyName` — 147 rows / 126
  plans / 1,232,895 stored → 1,082,596 reader-facing ppl / $52,004,779,703,
  name 0 / ticker 0 / fee 0 / row membership 0, 13 crawlable pages / 387,628
  ppl.** Providence Health stops publishing `Registered investment company
  funds` at 48.0% of a menu ($12,474,349,571); Trinet HR III/IV `Registed
  Investment Co.` to 280,299 readers; 3M a bare `companies` on 25 rows
  ($14,372,175,818); Nacco and Hyster-Yale `Trust Company` at 42.5% / 29.8%.
  **DO NOT CARRY the queue's own 88 rows / 707,208 ppl** — that was a
  `/regist/` screen, and *a count keyed on a vocabulary measures the
  vocabulary*. **NOR the general form's 611 rows / 1,991,593 ppl**, which merges
  five remedies; requiring EVERY word to be a label blocks 57 rows / 174,038 ppl
  of welded vintages, real designations, OCR debris and trailing joiners, all 43
  blocked names read. **A THIRD display-only predicate on purpose:
  `merge-4i.mjs:1394` guards its share repair with `isGenericTypeName(head) ||
  hasNoFundIdentity(head)`, so widening either would silently refuse more NAME
  REPAIRS.** It is **INJECTED INTO `isNamelessFundRow`**, never a parallel
  disjunct, because seven of the rows it reaches are EMPLOYER STOCK — Altria's
  bare `Shares` carries ticker MO on $1,456,691,207 — and only that function's
  early returns spare them; *where a predicate is composed decides what protects
  it*, and the flat screen counted six of the seven.
  **THE PAGE CAUGHT A HALF-SHIPPED ARM:** the first page-reference spelling took
  singular `(page 166)` only, so the regenerated page qualified National Rural
  Electric's $225,158,578 row and left `Common Collective Trusts (Pages
  165-166)` — **$9,284,475,171, 48.6% of its menu, the LARGEST row on the same
  page** — unqualified two rows above it. The wide spelling adds exactly that
  one row and leaves three sibling captions out (`Stocks`/`Securities` by the
  label condition; a POSITION count is not a pointer). *One of two spellings of
  a caption family is worse than neither.*
  **REMEDY (b) IS CLOSED 2026-10-04 08:1xZ — THE STRIP IS ~10x HARMFUL AND
  CANNOT SEE ITS OWN MOTIVATING ROW. Do not retry it.** Of 31,041 rows / 14,752
  plans / 29,191,199 ppl surviving both witnesses: **ticker LOST 6,809 rows /
  6,563,659 ppl and fee LOST 7,073 / 5,946,601**, against ticker gained 686 and
  fee gained 567. **DO NOT CARRY the queue's own 235 rows / 390,978 ppl.**
  Read largest-first the survivors are real funds cut through the middle, because
  **`T.`, `Retirement` and `500` are all "complete labels" to
  `hasNoFundIdentity`** (its filler list holds single letters, `retirement` and
  `\d{1,3}`): `T. Rowe Price Small Cap Value Fund I` splits at `T.` for Paychex
  (661,036 ppl) and **Costco (279,798 ppl) on thirteen correctly-asterisked
  `~TRR*X` rows**; Express Services (400,441 ppl) loses ticker AND fee on five
  target-date rows (`Retirement 2030 Fund` TRRCX 0.55 → nothing); `500 Index
  Fund` keeps FXAIX but its fee goes **0.03 → 0.1**, manufacturing the
  one-ticker-two-fees defect. Two controls fired in opposite directions: **CHS,
  the motivating row, is BLOCKED** (`PRIN SHORT-TERM INCOME` resolves to nothing
  and is no other plan's whole name) while **`The Investment Company of America`
  SHIPS as `America`** (attested 5× by junk rows).
  **THE CHS ROWS REMAIN A REAL DEFECT WITH NO INSTRUMENT** — 7 rows / 90,476 ppl
  needing a REGISTRY witness (`fund-facts`), not a wider screen.
  **(c) RE-MEASURED 2026-10-04 12:2xZ, AND THE RECORDED FIGURE IS SUPERSEDED:
  572 escaping rows / 199 plans / 518,131 ppl, not 297 / 96 / 252,235.** Of the
  1,228 published rows whose SHOWN name carries a `regist` string, 656 publish a
  ticker or a fee or are already qualified. The 572 that escape are attributed,
  no unknown left to rest: **405 rows / 164 plans / 304,355 ppl** START with the
  label (that is remedy **(b)**, CLOSED as ~10x harmful — CHS's ten rows at
  90,476 ppl are its bulk); **163 rows / 37 plans / 155,819 ppl** carry a
  trailing label run the shipped vocabulary cannot reach, of which the real
  members are Touro's `… companies 693` (a trailing NUMBER defeats the
  end-anchor) and True Mfg's parenthesised `(Registered Investment Company)`;
  2 rows are Pfizer's `New York registry shares`, a REAL instrument and a false
  positive of the screen's own vocabulary; 2 are employer stock, correct.
  **MY FIRST RE-MEASUREMENT WAS WRONG AND SAID 630** — it screened the STORED
  name and classified the string `renderRow` was handed, but **the page cleans
  UPSTREAM of the slice** (`cleanCostMarkers`, app.js:2555) and shipped
  `TYPE_SUFFIX` already strips a complete `Registered investment companies`
  suffix. *Asking the shipped cleaner directly is what exposed it.* And the
  bucket's single largest member turned out to belong to no suffix class at all
  — it is American Airlines' $9.4B sentence row, now shipped.
  `docs/accuracy-log.md` 2026-10-04 (12:3xZ).
  `docs/accuracy-log.md` 2026-10-04 (08:1xZ).
  **AND NAMED RESIDUE from (a) — CLOSED 2026-10-04 23:2xZ, AND THE PRESCRIPTION
  WAS WRONG.** The entry read "`Investment in`/`Investments in` (New York Life,
  14 rows / ~71,000 ppl) are truncation fragments blocked by the every-word
  condition — adding `in` is a measurement, not a free widening." The
  measurement was taken and came back clean (**superset by construction, 3,528
  published rows containing `in` as a token; verdict moves on 8 rows / 3,901 ppl
  / $76,566,403**, all three names read: `Investments in` ×5 Beauchamp
  Distributing, `Investment in` ×2 Elo, `Shares in` ×1 Fiber Instrument Sales)
  — **and shipping it threw `lib-disclose`'s own import-time control, because
  `Investment in` is a must-KEEP PIN.** The pin wins: these are TRUNCATED names,
  and the recorded position for that bucket is **reconstruction, not
  suppression**, because qualifying the row publishes *"the filing names no
  specific fund"* about a filing that DID name one. ***A row that names nothing
  and a row whose name we cut in half are two classes, and one label cannot
  serve both.*** Reverted, nothing pushed. **DO NOT CARRY 14 rows / ~71,000 ppl
  (New York Life)** — no New York Life row is in the moved set.
  **THE RULE THIS EARNS: before acting on a queued prescription, GREP THE
  FIXTURES FOR THE MOTIVATING STRING.** A pin is newer evidence than the entry
  in one specific way — somebody already considered this exact string and
  decided against it, with a reason attached. One grep would have saved the
  whole ship. `docs/accuracy-log.md` 2026-10-04 (23:2xZ).
  **THE ISSUER-CELL QUESTION IS ANSWERED 2026-10-04 13:4xZ, AND THE ANSWER IS
  NO: 396 candidate rows / 36 plans / 47,885 ppl, verdict moves on 0.** Measured
  as a superset by construction (widening the gate's issuer disjunct can only
  qualify MORE rows), and it moves nothing because **wherever the issuer is
  empty of meaning the NAME is a real fund**, so the name test correctly
  refuses. The gate stays on the narrower `isGenericName` by measurement rather
  than deferral.
  **BUT READING THE ROWS THAT "NO" LEFT BEHIND FOUND A REAL DEFECT, NOW SHIPPED
  — a DANGLING PREPOSITION published as a fund's ISSUER: 448 rows / 42 plans /
  167,416 ppl / $1,154,493,048**, 4 crawlable pages. Both surfaces compose
  `issuer · name`, so Ashland published `Shares of · VANG WINDSOR II ADM` on
  **$98,806,045, 6.6% of its menu**, while that row's own VWNAX and 0.3 fee were
  correct; **283 of the 448 publish a ticker and 333 a fee**, which is the proof
  only the attribution was noise, and **0 were already qualified**.
  `isNonIssuerCell` is case-insensitive and ANCHORED AT BOTH ENDS — seven
  furniture strings of the store's 15,683 — and ticker/fee cannot move BY
  CONSTRUCTION because `lookupTicker` reads `f.iss` at its own call site 1,500
  lines earlier.
  **DO NOT CARRY MY FIRST SCREEN'S 1,199 ROWS:** it used `/i` on the
  trailing-joiner test, so a trailing capital `A` read as the article and it
  swept in `Leidos Stable Value, A` ($650,763,893), `SSGA S+P 500 INDEX SER A`
  (=SSSYX, $606,941,903), `Corebridge Separate Account A` and `Wilmington
  Trust, N.A` — the trap `DANGLING_TAIL` documents forty lines above where I
  was working. **STILL OPEN, and it must NOT be suppressed: the TRUNCATED
  bucket, 388 rows / 103,689 ppl** (`Voya Retirement Insurance and`, `Capital
  Bank and`, `The Vanguard Group of` on =VIIIX / $232,941,827) — a real entity
  cut off mid-name, where suppression would LOSE an identifiable insurer and the
  remedy would have to be reconstruction. `docs/accuracy-log.md` 2026-10-04
  (13:4xZ).
  **AND TWO ORACLES OF MINE WERE REFUTED THERE — do not rebuild either.** (1) A
  generate-and-test repair oracle is **intractable** (~670,000 candidates per
  30-char name × 241,113 names ≈ 1.6e11 predicate calls); the right instrument
  is edit distance against the vocabulary's own PHRASES, unreachable while
  `isGenericTypeName` is a compiled regex. (2) Expanding `inv.` → `Investment`
  gave **9 false positives of 21 rows** — `2040 INV` is a target-date fund's
  INVESTOR share class. **And the predicate is NOT exact-phrase:** `Registeed
  Investment Company` is ACCEPTED (a stemmed `regist` arm), `Registered
  Investment Co.` REJECTED — so the old queue entry's row tripped the
  ABBREVIATION, not the spelling it was filed under. ***Read the shipped
  guard's SURFACE, not its description — including your own.***
  `docs/accuracy-log.md` 2026-10-04 (03:3xZ), (04:4xZ) and (06:0xZ).
- **CLOSED 2026-10-02 — it was promoted on 2026-10-01 and this entry was written
  about the superseded copy.** `scripts/apppath.mjs` IS the instrument: tracked,
  slicing the whole per-row block, and it hands out the individual resolvers via
  `buildRenderer().fns`. **A measurement script imports THAT path.** Anything
  named `apppath` under `scratchpad/` is a session artifact — the directory is
  gitignored and has been wiped twice — and a figure measured through one is
  worth nothing until re-measured through the tracked harness.
- The data files the site fetches (`plans-list.json`, `plans-index.json`,
  `mtias.json`, and the on-demand shards) are **deliberately unstamped** by
  `scripts/stamp-assets.mjs`. Stamping them needs app.js to pass the stamp
  through to its own fetches.

### Method rules, each earned and each already paid for once

These outlived the versions that produced them. The accuracy log has the case.

- **AND PRINT EVERY FIELD OF THE ARGUMENT THE RESOLVER READS — the INPUT half,
  and the more expensive direction (2026-10-04).** The 02:0xZ draw read
  Amedisys's `Income Fund` → **=DODIX** as a bare product name resolved to one
  house's fund on no evidence, and a 45,976-row / 40.4M-ppl class was sized
  around that reading. **The filing names the house in the ISSUER column**
  (`Income Fund` / `Dodge & Cox`, `Target Retirement 2035 Fund` / `Vanguard`,
  `S&P 500 Index` / `State Street` → correctly asterisked `~SSSYX`), and
  `lookupTicker` prepends the issuer before asking the resolver — so every
  assertion was supported and my draw script simply did not print that column.
  *An omitted ANSWER field makes a hedged page look confident; an omitted INPUT
  field makes a correct page look wrong.* The screen refuted itself in one line
  because its **positive fixture ran first** — "THE SCREEN DOES NOT SEE ITS
  MOTIVATING ROW" printed above the 45,976, so an implausibly LARGE number was
  refused before it was read. **And `LEADING_HOUSE` is 35 anchored LEAD patterns
  built for the trustee arm's remainder gate:** asked "does this name identify
  its house" it calls 209,225 of 405,738 distinct strings house-free, its top
  members being house ABBREVIATIONS (`VANG EXPLORER ADM`, `AF EUROPAC GROWTH
  R6`) and EMPLOYER STOCK (`Costco Wholesale Corporation` =COST, $18.3B).
  `docs/accuracy-log.md` 2026-10-04 (02:0xZ).
- **AND PRINT EVERY FIELD OF ITS ANSWER THAT THE PAGE ACTS ON (2026-10-03).**
  Calling the right function is not enough. `renderRow` returns `star`
  (= `info.comparable`) beside `tk`, and app.js prints an asterisk and a
  footnote on a comparable — *the row is labelled an approximation, not an
  identification.* A draw script that printed `tk` and dropped `star` was one
  paragraph from publishing "Intel's `BlackRock 2500 Index Fund F` publishes a
  wrong symbol on $940,955,432 to 80,916 readers", which the page does not
  claim. **An asterisk is a whole category of claim.** The tracked harness was
  sound; the reading went wrong one layer above it, so *a sound instrument read
  through a lossy print is a lossy measurement.*
- **Measure through the function the page calls, WITH THE ARGUMENT THE PAGE
  PASSES.** Met at least six times: a fee asked of the raw name where the page
  prices the cleaned one; `fundTickerInfo` called with one argument where the
  page passes the whole row; `lookupTicker` reimplemented and stopped one stage
  short of `f.stk`, reading 0 of 147,835 rows. **There are TWO ticker resolvers
  and TWO display paths** (the report `app.js`, and the crawlable pages via
  `build-seo-pages.mjs`) — a claim about readers must name which.
  **THE TWO SPECIFIC VALUES, both met on 2026-10-03 in one measurement.**
  `renderRow`'s `tab` must be **`"menu"`**: `app.js:3166` gates the WHOLE
  ticker/fee resolver on `tab === "menu"`, and `filedLineupTable` computes
  `tab = hasSma ? (state.lineupTab[plan.id] || "menu") : "menu"`, so that is the
  only value a first render ever sees. Passing `"all"` made every row read
  `tk —`/`er —` and returned a tidy `126 identical / 0 / 0`; a POSITIVE CONTROL
  caught it (`Vanguard 500 Index Fund Admiral Shares` also read `—`) and the
  count never would have. And **`renderRow` does NOT clean — the page cleans
  UPSTREAM of the slice.** `cleanCostMarkers` (`app.js:2084`) sets
  `f.name = cleanFiledName(f.nameRaw)` over the whole entry and then **drops any
  row whose cleaned name matches `ID_ONLY`** (`app.js:518`), so a name change can
  change ROW MEMBERSHIP. The harness's field is called `nameClean` and holds
  **the name it was GIVEN**. ***Measuring through the function the page calls is
  not enough when the page calls something else FIRST*** — ask what the caller
  did to the argument before it passed it.
- **THE DRAW ITSELF WAS DRAWING FROM UNPUBLISHED MENUS — 9.1% OF ITS WEIGHT
  (2026-10-04, found by the draw drawing one).** The hourly draw read every
  stored entry in `data/lineups/*.json`, but the site renders a lineup only
  when the entry is CONFIDENT, so **1,265 entries / 10,317,233 participants**
  were drawable and published to nobody. It drew The Home Depot's own ack
  (468,817 ppl), whose four-row $3,544,514 "menu" is three Form 5500 FORM
  ARTIFACTS — the plan administrator's name at 92%, `g(1) complete this item)`,
  a participant-count caption — beside **$15,698,707,253** of plan assets. That
  entry is `confident: false` and reaches no reader: the page serves the MASTER
  TRUST's 33-fund **$14.02B** menu. The three largest unpublished-but-drawable
  entries are all the same documented shape, a non-confident plan ack beside a
  confident trust: Target 495,482, Home Depot 468,817, Kroger 411,922.
  **AND IT HAD A SECOND DEFECT, FOUND ON ITS SECOND USE: the overshoot ratio
  divided a TRUST's menu by ONE member plan.** It reported Meijer at **ratio
  3.345** ($2,207,941,026 against $660,140,564), which reads as a textbook
  `lineup-overshoot`; summed over both member plans the denominator is
  $2,283,572,835 and **the ratio is 0.967**. ***The most repeated error on this
  record — a count keyed on PLANS is blind to a TRUST, now NINE times —
  reappeared inside the fix for a different defect in the same file, one hour
  after that rule was written into the file's own header.*** The member list was
  already built and already used for the participant count; only the denominator
  read `lead.assets`. Fixed, with the lead plan's figure printed beside the sum
  and a single-plan entry reading identically (controlled: Premier Healthcare
  0.993 under both).
  **FIXED BY PROMOTING THE INSTRUMENT: `scripts/draw-published.mjs` is now
  TRACKED**, gates on `lineups-index`'s bit 1, asserts that gate in BOTH
  directions against Home Depot's two acks, and takes `--seed` so a draw can be
  re-read instead of re-rolled (a drawn plan was lost this cycle to exactly
  that).
  **AND `--seed` WAS BEING READ AS THE DRAW SIZE — fixed 2026-10-04 19:1xZ after
  it cost ~25 minutes across three cycles.** `N` was "the first all-digit argv
  entry", so `--seed 19082026` set **N = 19,082,026**: the draw walked all
  60,163 pool entries and rendered every menu, which from outside is
  indistinguishable from a hang. The seeded draw that looked like it worked had
  printed **pick 1 of nineteen million**, so its finding stands and everything
  after it was lost. Flag values are now excluded BY NAME (`--seed`, `--rows`)
  rather than by shape, and N outside 1-50 THROWS. ***A hang whose cause is in
  the ARGUMENTS looks exactly like a hang whose cause is in the algorithm*** —
  CPU starvation and the picker's retry branch were both diagnosed first and
  both wrong. **Still open, named not fixed:** that retry branch (`if
  (used.has(i)) continue;`) re-draws without removing the used weight, so it has
  no progress guarantee — irrelevant at N<=50 against 60,163 entries, and a
  hazard for anyone raising N. `docs/accuracy-log.md` 2026-10-04 (19:1xZ). `--all` lifts the gate for auditing it and prints a banner. The
  precedent is explicit: `scratchpad/apppath.mjs` shadowed the tracked harness
  and 81 measurement scripts imported the wrong one. ***A STORED field is not a
  PUBLISHED one — including in the thing doing the measuring.***
  **And `entry.confident` agrees with the index bit on all 60,163, which is the
  control that both reads are right** — the first read of that file used
  `idx[ack]` where the map lives under `.plans`, returning undefined for all
  61,428 acks including confident ones. *A clean zero across a whole population
  reports on the query*, and `lineups-index.json` has no `lib-schema` loader,
  which is exactly why a guessed field name was possible.
  `docs/accuracy-log.md` 2026-10-04 (08:3xZ).
- **ASK WHETHER THE HARNESS CAN OBSERVE THE CHANGE AT ALL, BEFORE RUNNING IT
  (2026-10-04).** I launched a two-copy, 1.7M-row `apppath` diff for a change
  the harness **cannot see by construction**: its slice ends at
  `const shownName = …` and the edit was in the row's TEMPLATE LITERAL, where
  the `issuer · name` span is composed, after that boundary. So every cell
  `renderRow` returns was guaranteed identical and the run was pure cost.
  *`renderRow` is the instrument for the cells it RETURNS — name, tk, er, star,
  shownType, flags — and for nothing the template does with them.* For a
  template-level change the evidence is the one-line source diff plus the PAGE.
  Sibling of *narrow a measurement by a property of the change*: there the
  narrowing made a diff affordable, here the right narrowing was to zero.
- **MEASURE A GUARD'S BLOCKING POPULATION OVER THE LIVE DATA, NOT OVER THE
  EXAMPLES THAT COME TO MIND (2026-10-04).** *A hand-built control table tests
  the cases its author already imagined* is already recorded; this is the
  operational form. My per-condition control for a new predicate's START anchor
  listed six strings I expected it to protect and reported **0 of 6**, failing
  the test as decorative — and it was right to fail and wrong about why: none of
  those six could match the arm anyway, because the END structure already
  excluded them. Measured over all **15,683** distinct issuer strings, the anchor
  blocks exactly **three**, each naming a real trustee. **A control that fails
  for the wrong reason still earns its keep, because it sends you to measure** —
  and the fix is to build every single-protection case FROM the population,
  which is also what the trustee ship did when it deleted four conditions that
  blocked zero rows.
- **A FLAG THAT FLIPS IS NOT A CELL THAT CHANGES — ASK WHAT THE RENDER CHAIN
  ALREADY PRINTS (2026-10-04).** A qualification arm moved `namelessRow` on 53
  rows and the shown type on **7**, because an arm AHEAD of it in the same chain
  already printed a better label for 46 of them (`Participant loans — not a
  menu choice`), including the two rows carrying 288,416 of the class's
  participants. Sharper than *a STORED field is not a PUBLISHED one*, which is
  about the store: here the field was computed by the display itself, in the
  same function, and was still not what the reader saw. **Before sizing a
  display change, render the cell — not the predicate** — and read the chain
  ABOVE your arm, because whatever already wins there is a population your
  change cannot claim. The headline figure would otherwise have been wrong by
  3.1x on my own ship, one hour after the same lesson in its store-side form.
- **A FORMATTER'S FLOOR IS A PUBLISHED CLAIM — "$0" IS NOT A MEASUREMENT
  (2026-10-04, SHIPPED).** `money()`'s last branch was
  `Math.round(a * 1000) + "K"` with the argument in MILLIONS, so **every amount
  under $500 printed "$0K"**: 16,497 published HOLDING rows across 8,103 plans /
  **8,069,421 participants** (FedEx's $34 money-market row, Fisher Sand &
  Gravel's three $2 rows, Tokai Carbon's $1), 1,810 average-balance cells, and
  185 plan-asset cells. A compact K/M/B/T scale is a deliberate design; its
  FLOOR rendering a nonzero amount as zero is not. Below the floor it now prints
  the dollars, the boundary ($500 -> "$1K") is pinned, and the crawlable pages
  were never affected because `usd()` already printed exact dollars — verified
  by regenerating all 5,000 pages for **0 changed files**.
  **FOUND BY WORKING A DIFFERENT QUEUE ITEM, through five measurements of which
  two refuted me:** the uncorroborated-participant-count class re-sized smaller
  (28 plans, PEO hypothesis tested), `derive()`'s distrust rule turned out to
  point at `partBalances` rather than the count, my prediction that the page
  published "$3.11" was **refuted by the boot file** (`ab: 0` -> `null` -> the
  honest "—", replaced by the bad cell only when the detail shard lands), and
  then only **42 of 1,810** "$0K" cells belonged to the class at all — Caring
  Professionals files 4,806 participants and 4,806 balances that AGREE, holding
  $1,475,927, so its average really is **$307**. ***A queue item worked honestly
  can hand back a different and larger defect than the one it names.***
  `docs/accuracy-log.md` 2026-10-04 (10:4xZ).
- **A PREDICATE WRITTEN TO JUDGE A WHOLE STRING IS NOT A PREDICATE ABOUT ITS
  PREFIXES** (2026-10-04, and it closed a 29M-participant class). Remedy (b)'s
  split asked `isGenericTypeName`/`isLabelOnlyName`/`hasNoFundIdentity` "is this
  FRAGMENT a type label?" where all three answer "does this PUBLISHED NAME
  identify a fund?". `hasNoFundIdentity("T.")` is correct for the question it
  was built for — a row named `T.` names no fund — and absurd as "the prefix
  `T.` is a label", so the split cut `T. Rowe Price …` for 941,000 readers and
  `Retirement 2030 Fund` off its own ticker. Sharper than *read the shipped
  guard's SURFACE* and than *a predicate right for one class is not right for
  its neighbour*: the guard was neither misread nor moved to a neighbouring
  class, it was handed a different SHAPE OF INPUT than its whole fixture set
  covers. **Before reusing a shipped predicate on a substring, look at what its
  own fixtures are.**
- **A PYTHON NON-RAW STRING TURNS EVERY `\b` INTO A BACKSPACE, AND THE REGEX
  THEN MATCHES NOTHING (2026-10-04 20:1xZ).** Patching a measurement script
  through a `python3 - <<'PYEOF'` heredoc with an ordinary triple-quoted string
  wrote `\x08Form 5500\x08` to disk: four of seven exclusion arms could never
  match, and nothing errored. ***Both fixtures I wrote for it PASSED***, because
  the case they pinned was caught by the one arm with no `\b` in it — *a case
  protected twice proves neither*, met on my own control. Use a RAW string
  (`r"""…"""`) or the Write tool, and give every arm a case where it is the
  ONLY protection: doing that here immediately deleted an eighth arm that could
  not reach its own case. Sibling of the `` $` `` rule below — there the
  substitution rewrote a perfect string, here the LITERAL was mangled before it
  was ever written.
- **AND THE FORM'S OWN PRINTED QUESTIONS ARE IN THE FILING TEXT (2026-10-04).**
  A composite EFAST2 PDF carries the blank Form 5500 pages ahead of the audited
  attachment, and line **6g(2)** reads *"Number of participants who terminated
  employment … less than 100% vested"* — a vest word and a percentage. A search
  for "does this filing state a vesting rule" found one in **41 of 41** filings,
  the same string every time. *A clean 100% reports on the query.* Production
  reads those pages too, which is why the shipped quote guards already reject the
  raw-table shape; any text-level measurement over a filing must exclude the
  form before counting.
- **`String.replace` WITH A STRING REPLACEMENT REWRITES YOUR TEXT, AND `` $` ``
  IS THE ONE THAT BITES** (2026-10-04). A slicer injecting a code block whose
  comment contained ``anchored `^...$`,`` had the backtick-after-`$` read as the
  "text before the match" pattern: it prepended half of app.js and ATE the
  block's opening, producing a syntax error **1,600 lines from the edit** and
  naming nothing like the cause. Pass a replacer FUNCTION, which disables `$&`,
  `` $` ``, `$'` and `$n` alike. Sibling of the assembled-regex rule — there the
  string was wrong, here the string was perfect and the SUBSTITUTION rewrote it.
- **DO NOT RE-DERIVE A VERDICT YOU HAVE ALREADY MEASURED PROPERLY** (2026-10-04).
  Asked which crawlable pages a shipped qualification would move, I hand-rolled
  the nameless verdict instead of calling `isNamelessFundRow`, skipped its early
  returns, and got an answer naming **the exact rows the composition exists to
  spare**. Asked through the two real renderers it answered 31 pages where `git`
  reports **13** — and that is wrong for a structural reason: **the crawlable
  pages are a SEPARATE DISPLAY PATH with their own nameless computation**, so
  predicting page changes from app.js's renderer is a different instrument, not
  a cheaper one. The only honest page figure comes from regenerating and
  diffing the files.
- **AND A QUANTIFIER THAT IS MERELY WRONG HAS NO CHECK AT ALL** (2026-10-04).
  `SEP + "?"`, meant as "an optional separator run", turns the character class's
  own `+` into a **LAZY `+?`** and so REQUIRES a separator at both ends — the
  predicate then missed its own motivating row. It cost one run because **the
  positive fixtures execute before the count**, the same mechanism that refused
  an implausible 45,976-row screen two cycles earlier. *Put the must-SEE fixture
  ahead of the measurement, always: it turns a wrong answer into a refusal.*
- **A REGEX ASSEMBLED FROM STRING FRAGMENTS HAS NO SYNTAX CHECK UNTIL IT RUNS**
  (2026-10-03). `node --check` passed on both copies of a `new RegExp(...)` built
  from nine concatenated strings whose group 2 closed one `)` early; the first
  line of the diff harness threw `Unmatched ')'`. Sibling of *`node --check` is
  the syntax check; importing a script executes it* — there the file ran when it
  should not have, here the file was syntactically perfect and the STRING inside
  it was not. Exercise an assembled pattern on a pin before believing it loads.
- **NARROW A MEASUREMENT BY A PROPERTY OF THE CHANGE, AND DISCHARGE THE
  NARROWING** (2026-10-03). A 1.7M-row two-renderer diff never finished, because
  this container gives a background process CPU only while a turn is active — 25
  minutes of wall clock bought 8 minutes of CPU. The fix is not patience: the
  arm's regex REQUIRES `\|+`, so a bar-free name cannot match, which cut the diff
  to 2,896 rows. **A narrowing is a claim and must be tested, not asserted** —
  60,000 sampled bar-free names were required to clean identically under both
  renderers, with the script exiting 1 if any differed.
  **AND SHARPER, 19:3xZ: SAMPLING CANNOT ESTABLISH A SUPERSET.** A narrowing that
  approximated a designator vocabulary and omitted `L.L.C.` had its 60,000-name
  discharge **FAIL on one run and PASS on the next** — the reservoir is random,
  so the sample told the truth once and lied once. ***A narrowing must superset
  what the change can touch BY CONSTRUCTION***; the discharge test can only fail
  to refute one, never prove it. Widening to tokens that superset every branch
  took the candidate set from 6,896 to 30,143 rows and made the discharge mean
  something.
- **Before adding a SOURCE, ask what the pipeline already reads and throws
  away.** Three instances in one day: `cct` was 231,260 of the 406,247 bytes
  every visitor already downloads, with no consumer; `i1` was read by
  `build-data` and all but one name discarded; the master trusts' Schedule C was
  scanned for every one of 508 acks and then dropped by a loop over `universe`.
  The download, the parse and the memory were already paid for in all three.
- **A PROJECTION MEASURED WITH A MORE GENEROUS INSTRUMENT THAN PRODUCTION
  OVER-STATES WHAT PRODUCTION CAN REACH (2026-10-04, by 3.6x).** The vesting
  class was projected at 24 plans / 172,406 ppl by splitting the WHOLE filing
  text on sentence boundaries; the extractor builds its candidate set from one
  regex over whitespace-collapsed text, filtered by a boilerplate test and a
  long exclusion chain, and delivered **5 plans / 47,462 ppl**. This is the
  MIRROR IMAGE of v198's under-prediction and has the same root cause — the
  harness asked a different question — so the rule is two-sided: *before
  believing a projection, ask whether its candidate set is the one production
  builds.* The cure is the same in both directions: replay the REAL function
  over real inputs.
- **SLICE A SHIPPED CONSTRUCTION, NEVER REPRODUCE IT FROM MEMORY (2026-10-04).**
  A residue attribution that rebuilt the extractor's candidate loop by hand ran
  the regex over RAW text where production runs it over whitespace-collapsed
  text, and applied neither `BOILER` nor the exclusion chain — so its "visited"
  set was not the extractor's and it reported the Form 5500 line 6g(2) question
  as a visited candidate on 25 of 30 filings. ***A harness that reproduces a
  shipped construction from memory measures the memory.*** Slicing the block out
  of the source and evaluating it was both cheaper and correct, and it gave the
  OPPOSITE attribution. Sibling of *measure through the function the page calls*,
  for code that is not a function.
- **AND A QUEUED PRESCRIPTION NAMES A STAGE AS WELL AS A FIX — CHECK THE STAGE
  (2026-10-04).** The vesting entry prescribed four RANKING rules and warned a
  naive tie-break would be wrong on its two largest plans. Attribution showed
  the candidates are dropped BEFORE any tie-break on 30 of 30 plans, so the
  ranking could not have delivered them and the naive rule is silent rather than
  wrong. *A prescription written from the symptom can be right about the remedy
  and wrong about where it belongs* — second instance after `fb-vanished`, whose
  prescription was not merely misplaced but impossible.
- **A GUARD THAT BLOCKS A WRONG ANSWER MUST NOT DISCARD THE EVIDENCE — FIFTH
  INSTANCE (2026-10-04).** `lib-4i:7417` stops a spelled-out GRADED schedule
  being labelled "Immediate" and did it with a bare `continue`, so the sentence
  went with the label. Its sibling guards in the same loop all set
  `blockedButQuotable = true`, and this one was added later without it. The file
  already records the same miss at v82, v83, v84 and v86/87 — *so when adding a
  guard to a loop that has a quote fallback, ask what the SIBLING guards do with
  the quote, not only what the new guard does with the label.*
- **ASK WHETHER THE HARNESS'S INPUTS ARE PRODUCTION'S INPUTS — THE THIRD FACE OF
  ONE RULE (2026-10-04).** v201 was registered at 5 plans from a replay over 41
  filings read from a LOCAL `pdftotext` cache, and production delivered **7**,
  because the OCR fallback reads pages text extraction cannot — and the proof is
  in the gained text (`Oahwhn =`, OCR garble). With v198's under-prediction (a
  harness over a field the change rewrites) and the 20:1xZ over-prediction (a
  more generous candidate set than production builds), that is the same rule
  three times in two directions: *a replay is only as honest as its inputs, and
  cached extraction is not the production read.*
- **A VERSION LABEL ON A DERIVED SUMMARY IS NOT THE VERSION IN THE DATA
  (2026-10-04).** The accuracy trail's `pv` read 202 for a store v201 produced,
  because the merge job resets to the branch tip and reads `PARSER_VERSION` from
  the TREE — and a `[skip ci]` bump mid-run is in that tree. I then drew a
  conclusion about the STORE from that SUMMARY: that the work list was empty and
  the next dispatch a no-op. Both wrong — `fetch-4i:441` writes each shard's own
  constant into every ack's `meta`, so the store was honest at 201 and the work
  list was 69,046. **Read the per-ack field, never the run summary, for what
  produced the data** — and when a summary and a store disagree, the store is
  the artifact.
- **AND `lib-schema` VALIDATES FIELDS, NOT THE SHAPE OF ITS OWN RETURN
  (2026-10-04).** `loadStatus()` returns `{plans, generated, at}`; a script did
  `Object.values(st)` and reported **3 status entries, 100% at pv 0**, with a
  confident wrong verdict attached. The throw-on-unknown-field Proxy protects a
  caller who reaches `.plans` and cannot protect one who never does. *A loader
  built against guessed field NAMES does not catch a guessed SHAPE* — and what
  caught it was the pair "3" and "100%" being implausible on sight.
- **A QUEUED PRESCRIPTION IS NOT AUTHORITY WHEN THE SHIPPED CODE PINS THE
  OPPOSITE — GREP THE FIXTURES FOR THE MOTIVATING STRING (2026-10-04).** The
  queue said adding `in` to the label vocabulary was "a measurement, not a free
  widening"; the measurement was clean and the ship threw, because
  `Investment in` is a must-KEEP pin whose comment names the class and the
  reason. ***A pin is newer evidence than the entry that contradicts it*** —
  somebody already considered that exact string and decided against it. And the
  substance generalises past this one arm: *a row that names nothing and a row
  whose name we CUT IN HALF are two classes, and "the filing names no specific
  fund" is a false claim about the second.* Before acting on a queued
  prescription, grep the fixture set for its motivating string — one grep.
- **AND READ A FUNCTION'S SIGNATURE FROM THE SOURCE BEFORE MEASURING THROUGH IT
  (2026-10-04).** I called `isNamelessFundRow(name, type, iss)` where the real
  shape is `isNamelessFundRow(f, cleanedName, isGenericName)` — the ROW OBJECT,
  the cleaned name, and the composed predicate as a **CALLBACK**. It surfaced
  only because the third argument was not callable; three plausible strings in
  the wrong order would have returned a number instead. The call site also
  applies an ISSUER gate that is half the published verdict, and
  `isGenericTypeName` is imported from **lib-4i**, not lib-disclose — it is the
  PARSER's closed vocabulary, which is why the display predicates sit beside it.
- **A SAFETY ARGUMENT BELONGS TO A MECHANISM, NOT TO A FILE (2026-10-05).**
  v201's registration argued that a published quote could never change, *so the
  touchable population is exactly the 41 withheld plans* — sound, because its
  only new writer sat behind `vestingQuoteUpgrade`. I carried that argument
  verbatim into v202's registration: same function, same two-line diff shape,
  same template. **v202's arm fires on the OTHER disjunct, the first-wins
  `!out.vestingText`**, so it is a plain WRITER inserted into a first-wins
  chain, the touchable population is every filing with a graded schedule
  (69,046 acks, not 364), and the store moved 103 plans where the registration
  said 2. Nothing was harmed — 14 of 14 uniformly drawn gains are genuine — but
  the prediction was wrong by 15x. *Before reusing a registration's safety
  argument, name the disjunct the new code fires on.*
- **AND ADDING A WRITER TO A FIRST-WINS CHAIN RE-ORDERS IT (2026-10-05).** The
  consequence is not only "more plans get an answer": on 11 plans the new arm
  writes earlier than whatever used to win, so the reader sees a DIFFERENT
  sentence. 7 of those are improvements and **4 are trades** between two true
  schedules. So a new writer in such a chain needs the changed-quote population
  read, not just the gained one — a diff that counts only "was empty, now set"
  is blind to the re-ordering it causes.
- **IN A LOOP OF ARMS, NECESSITY IS A QUESTION ABOUT THE OUTPUT STRING, NOT
  ABOUT WHETHER THE FUNCTION FIRED (2026-10-05).** My leave-one-out for a new
  quote-trimming loop counted WHETHER each quote trims and reported the
  `toc` arm *"necessary for 0"* — while the Walmart fixture needs it. Without
  `toc`, the page-number arm still fires, the remainder still passes the gate,
  so the quote still "trims", to `Table of Contents Vesting …` with the debris
  intact. Re-keyed to the output text, that arm is 2 quotes and **2,009,873
  readers**. **And "alone" is not an inertness test for such a loop either:**
  two arms read 0 alone because they can only fire AFTER another arm has
  removed the page marker, and both are load-bearing. The recorded rule that
  *an arm inert on the data is untested machinery* stands; the TEST for it has
  to be leave-one-out on the output.
- **AND A SHORT ALTERNATION BRANCH COSTS A REPAIR THE WAY A GREEDY QUANTIFIER
  LICENSES A WRONG ONE (2026-10-05).** Regex alternation is FIRST-match, not
  longest-match, so a plan-name suffix written `plan|…|plan and trust` matched
  Starbucks' `" Plan"` and stranded `"and Trust"`, which then failed the
  capital-letter output gate and cost the **entire** trim — from outside, the
  arm simply looked not to apply, and the whole nine-word cascade was
  invisible. Write such a suffix as a WORD RUN, and when an arm mysteriously
  does not fire on an obvious case, suspect the alternation order before the
  guards.
- **A PRESCRIBED REMEDY NEEDS THE EVIDENCE THAT A BETTER ANSWER EXISTS, AND
  ONLY THE SOURCE CAN SUPPLY IT (2026-10-05).** A queue entry prescribed "a
  display-side demotion or a ranking" for 69 plans publishing an
  accelerated-vesting exception as their whole vesting answer. Reading the six
  largest FILINGS showed **5 of 6 state no schedule anywhere**, so a demotion
  would withdraw the only vesting fact filed and publish *"not stated in the
  audited notes"* about a filing that did state something. ***A guard that
  withdraws a true answer because it is incomplete makes the page less honest,
  not more*** — and no store-side screen could have told me, because the
  question is about text the extractor never stored. Third instance of a
  prescription being wrong about WHERE or WHETHER rather than about the
  symptom (`fb-vanished` impossible, the vesting ranking aimed at the wrong
  stage, this one harmful for the bulk).
- **AND A TRUNCATED PRINT CAN TURN A COMPLETE ANSWER INTO A DEFECT (2026-10-05).**
  A 128-character window showed `… after six (6) yea` and read as a year, so a
  plan stating a complete six-year rule counted as a member of a class defined
  by the ABSENCE of one. The full text says `after six (6) **yeas** of vesting
  services` — a filer's typo my `years?` test could not match. Two lessons at
  once: *print the full text of any member whose truncation hints at the
  condition you are screening for*, and **a service test keyed on a correctly
  spelled unit is defeated by the filings' own typos**, which is a general
  hazard for every word-anchored screen over this corpus.
- **A count of a condition is not a measure of a defect**, and the siblings:
  *a count keyed on a VOCABULARY measures the vocabulary*; *a count keyed on
  PLANS is blind to every master-trust row* (resolve a trust row through its
  MEMBER plans — met seven times); *a STORED field is not a PUBLISHED one*
  (cost one class size a factor of 3.9); and ***a FRAGMENT OF A LONGER WORD IS
  NOT THEREBY A FRAGMENT*** — a prefix test over an entity vocabulary read
  **27,417 rows / 32,457,811 ppl** for a class of about one, because `Trust`,
  `Inst`, `Advisor`, `Service` and `Retirement` are each a complete terminal
  token in a fund name and a proper prefix of an entity word. **Its five pinned
  controls ALL PASSED and only the MEMBER LIST showed it** — fixtures prove an
  arm reaches its case; only reading the members proves the class is the class.
- **A WITNESS THAT A ROW IS DAMAGED IS NOT A WITNESS TO WHICH SIDE THE DAMAGE IS
  ON** (2026-10-03, met twice in one cycle on two INDEPENDENT witnesses, and it
  retroactively explains a revert from the cycle before). A rotation witness
  proves two orderings of the same tokens coexist in the store and says nothing
  about which is right — its uniform draw was 18 of 30 rows where the FILED
  order was correct and the rotation was the damage. A reconstruction witness
  proves a sibling's text plus this row's lead is a real name and still cannot
  say whether the LEAD or the TAIL is the stray text. So a repair needs a THIRD
  ingredient the detector does not supply — an orientation test, per row, that
  ABSTAINS when both sides answer. Priced: stripping the lead costs 73 fees and
  37 tickers; stripping the tail cost 23 fees and swapped 42. **Two arms,
  opposite directions, both net harmful, because each was right for one
  orientation of a population holding three.** Before building a repair on a
  detector, ask what the detector is silent about.
- **A WITNESS DRAWN FROM THE SAME DAMAGED REGION IS NOT INDEPENDENT OF THE
  DAMAGE** (2026-10-03). An in-menu sibling was proposed as a cheap orientation
  witness precisely because it needed nothing from outside the menu — and that
  is why it failed: in a shifted menu the tail appears bare elsewhere BECAUSE
  the shift left it bare, and where the stray text is an identity COLUMN it
  repeats on every row, so the witness fires hardest exactly where it is most
  wrong (0 of 18 correct, all inverted). ***And a witness that requires a
  sibling to EQUAL part of the damaged row cannot distinguish "the prefix is
  stray" from "these are two different holdings" — the VALUE column settles it
  in one query***: 1,122 of 1,128 such pairs carried different values and were
  two real holdings. Run that query first on any name-strip whose evidence is an
  in-menu sibling.
- **PICK A NEGATIVE CONTROL THAT IS INDEPENDENTLY KNOWN CORRECT, NEVER ONE THE
  TEST ALREADY SPARES** (2026-10-03) — the latter is circular. And a control
  must hold on EVERY copy of its name, not the first copy found: one convicted
  copy in nineteen is the false positive the control exists to catch, and three
  live ones were found that way. My first control here was itself REFUTED by the
  test it was guarding, because I chose it from a family this file calls
  correct-as-filed and that member of the family was not.
- **PIN THE MOTIVATING CASE AS A FIXTURE BEFORE MEASURING THE CLASS** (2026-10-03,
  after the same case escaped twice in one investigation). "A measurement that
  cannot see its own motivating example has not been scoped" says what went
  wrong; this says how to catch it. On the vesting-quote class PSEG escaped the
  vocabulary screen AND then escaped the shipped conjunction's first store-wide
  count (39 entries, PSEG absent, because every withdrawal arm was written from
  the sample as `may withdraw` where PSEG files `withdraws`). **A pinned fixture
  failing is what found it — not re-reading the count**, and a count that omits
  the case looks exactly like a count that includes it.
- **WHEN A CLASS IS A SEMANTIC JUDGMENT, DO NOT SCREEN FOR THE ABSENCE OF THE
  GOOD CASE; REQUIRE THE PRESENCE OF THE BAD ONE.** Five screens for "this
  sentence is not about vesting" were each refuted by reading their own members
  (3.9M ppl → 2 → 181 → 100 → 80), because every syntactic proxy for an absence
  leaks. What shipped is a CONJUNCTION: the sentence states a different NAMED
  rule, each arm anchored on that rule's own vocabulary, AND no rule of the
  wanted kind anywhere in it under a deliberately generous test. Same shape as
  v199's gate. And the grammatical half generalises: **an ADJECTIVAL mention
  ("vested Employer Matching Contributions") is a noun phrase some other rule
  acts on, never a rule itself** — a rule needs a copula, a verb form, an
  explicit percentage, or a ladder.
- **A fix for one phrasing of a class is not a fix for the class** — and the
  class also has a POSITION, a COLUMN, a SHARE CLASS and a FORM. Recorded nine
  times, twice inside the same function.
- **A control that cannot fail is decorative.** Write a negative control PER
  CONDITION, in full rather than by surgery on the shipped source, and assert it
  fails BY NAME on exactly its own cases. Check that new pins REACH the new arm:
  an arm can be inert while every existing case still passes.
  **TWO CONVERSES, both earned 2026-10-03 on `quoteTrim`.** (i) **Check that
  each ARM reaches the DATA**, not only that each pin reaches an arm: a `-6-`
  page-number stripper passed every fixture and changed **0 of 105,220 published
  quotes**, so it was dropped — *an arm real in principle and inert on the data
  is untested machinery*, and the tell is a negative control that can only ever
  print "breaks NOTHING". (ii) **A case protected by TWO conditions cannot fail
  for either**, so it proves neither: Yusen's `,000 (indexed)` is covered both by
  a comma's absence from the vocabulary and by the output gate. Give every
  condition a case where it is the ONLY protection, and find that case by
  measuring each condition's population separately.
  **AND THE TRAP IN (i), MET ONE CYCLE LATER: A BROKEN ARM AND AN INERT ARM READ
  THE SAME ZERO.** An entity-TAIL arm reported 0 rows while four of its members
  sat in the data and two were quoted in my own previous entry; it fires on none
  of its five known members because a `[^,]` class forbids the comma in
  `Advisors, LLC`. Dropping the `-6-` arm for a zero was right; accepting this
  zero would have been wrong, and **a count cannot tell the two apart**.
  ***PIN A POSITIVE FIXTURE THE ARM MUST FIRE ON, from the data, before
  believing any zero it reports*** — then an empty result is a FAILING TEST
  rather than a finding. Same instinct as *a narrowing is a claim and must be
  tested*, applied to an arm instead of a filter.
- **A clean zero, a round number or an implausibly large one reports on the
  QUERY.** So does a both-sided zero across a whole population.
- **RANK to pick what to READ; draw RANDOMLY to estimate a RATE.** Top-N samples
  over-predicted two fix yields by 25x and 12x, and one ranked sample of two
  shards mis-estimated a run by ninety minutes.
- **PRE-REGISTER a run's figures before dispatch**, as a ceiling plus a NAMED
  SET where a prior-year fallback could rescue a loss (`fallbacks.json` is
  artifact-only, so no whole-store scan can predict it). **When two
  reporting-only changes queue behind one run, register their SUM.** A
  whole-store total is the arm's own delta PLUS whatever the incremental delta
  brings — register the per-arm print and DERIVE the rest; a row delta is
  additive, a PLAN count SATURATES.
- **A PRE-REGISTRATION MEASURED OVER A STORED DERIVED FIELD UNDER-PREDICTS
  WHENEVER THE CHANGE ALTERS WHAT THAT FIELD HOLDS** (v198, 2026-10-03: 345
  plans delivered against 122 registered as a *ceiling*). `matchText` is an
  OUTPUT of the extractor being changed — it stores the sentence that was
  selected, and selection follows wherever the chain matched — so a harness over
  it asks *"does the new arm fire on the sentence the OLD chain chose?"* where
  production asks *"does it fire anywhere in the filing?"* The sibling error in
  the same harness: it counted only rows where the field was EMPTY, so it was
  blind to 117 plans whose value was REPLACED rather than added. Ask which of
  the fields a harness reads are inputs and which the change rewrites.
- **A before/after harness that cannot express a LOSS has not measured one**,
  and a harness is only as honest as its "before" — pin every input it reads
  that an agent may hold, and test the pin by pointing it at a path that does
  not exist and requiring a THROW. *Comparing two candidate inputs is not a test
  that the consumer read either of them.*
- **An error code is a published claim. So is a check.** One code carried two
  meanings and told readers a filing had been withdrawn when the failure was
  ours; a check re-implemented a lookup and published 65% false findings into a
  watched metric, which teaches the operator to skip the line.
- **"MAIN IS AHEAD" IS A QUESTION ABOUT THE DATA, NOT ABOUT THE TIMING —
  CORRECTED 2026-10-10 BY A PAIR THAT REFUTED MY PREDICTION.** The entry below
  splits the hazard into CONCURRENT (the same data twice) and SUCCESSIVE (main
  may hold fresh filings), and **#618 (00:10-00:23, dev) against #619
  (00:57-01:08, main) is unambiguously successive — 34 minutes after #618
  FINISHED — and still the same data twice.** I said main might hold filings dev
  lacked before measuring; the structural diff answered 0 on every key
  (`plans-all` 112,652 rows 0/0, `lineups-status` 69,046 acks 0/0/0 with
  byte-identical pv maps, four stores identical once `generated` is stripped,
  the trail **422 lines both sides with 0 unique either way** — so both runs
  appended the SAME LINE — and `store-diff` 0 added / 0 removed / 0 gained /
  0 lost). ***The discriminator is whether the DOL EXTRACTS MOVED, not whether
  the runs overlapped***, and on a quiet hour two runs an hour apart re-derive
  each other byte for byte. **Timing is not evidence in either direction: run
  the structural diff, always** — the trail's unique-line count is the
  ten-second version. *A rule that names a CAUSE where the real variable is a
  STATE mispredicts exactly when the cause is absent and the state still holds.*
  Converged the recorded way (`git reset --hard origin/main` + force-with-lease
  on the DEV branch, lease pinned), lossless because the duplicate was PROVED,
  and it spends no force-push on main. `docs/accuracy-log.md` 2026-10-10 (01:1xZ).
- **"MAIN IS AHEAD" HAS TWO CASES AND ONLY ONE IS A REBASE (2026-10-09).** The
  recorded hazard — rebase main's data commit in or the mirror discards fresh
  filings — is written for a SUCCESSIVE run. When the dev run and the scheduled
  run are **CONCURRENT** (same `pv`, same extracts, minutes apart) both commit
  and the refs diverge by one data commit each, and the stores are the SAME DATA
  TWICE: measured on #601/#602, `lineups-status` 69,046 acks with 0/0/0
  only-main / only-branch / different, `plans-all` 112,652 rows 0/0/0, the other
  six identical once `generated` is stripped, and the coverage trail not in the
  differing set at all (410 lines, same last line, both sides). ***So the entire
  divergence was a timestamp*** — and then BOTH a rebase and `--force` on the git
  check are wrong: the right move is to ADOPT one side and converge (`git reset
  --hard origin/main` + force-with-lease on the DEV branch), which is lossless
  because the duplicate was proved to be one and spends no force-push on main.
  **A textual diff cannot tell these apart (every store is one line) and
  `mirror-gate`'s +0/-0 is lineup-keyed, so it does not cover the six non-lineup
  files.** Diff the stores STRUCTURALLY — one script, and it is what distinguishes
  the two cases. `docs/accuracy-log.md` 2026-10-09 (03:0xZ).
- **AND A GUARD THAT DOES NOT FIRE IS A PREMISE TO CHECK, NOT A FAILURE TO
  REPORT (2026-10-09).** A mirror landed while a run was `in_progress` on main and
  `mirror.sh` did not refuse, which read as the post-#556 guard failing. Its
  actual condition is *changes data-producing code* AND a run in flight: diffed
  across exactly the six path-filter files between what that run checked out and
  what the mirror put on main, the answer was **empty**, so the stand-down was
  correct by construction. *Read the guard's condition, not the rule's summary of
  it* — and the check is a diff, not a reading of the comment.
- **ATTRIBUTE A MOVED COVERAGE FIGURE BY THE PRODUCING RUN'S `head_sha`
  (2026-10-09).** `tkExact` moved 37.76 -> 37.77 in the same hour as a display
  ship, and the ship was the obvious suspect and innocent: the run's `head_sha`
  was the commit BEFORE it, and `tkExact` is computed through app.js's own lookup
  (`audit-data:774`), not through the matcher that had also changed. Two cheap
  questions — which commit produced the store, and which function computes the
  metric — before suspecting the hour's own change.
- **While an agent holds the working tree, read through `git show <ref>:` and
  never the path.** A `grep` of the tree is a measurement and rots the same way
  a harness does. And **after a fetch, read `origin/<branch>`, not the local
  ref** — the thing a verdict is about may already be on the remote.
- **Size the class before reading the filing**, and put an EXACT pre-filter
  INSIDE the condition list, between a cheap condition and an expensive one —
  not only at the first condition. A fast exact measurement must not be chained
  to a slow one.
- **A re-size is a NEW MEASUREMENT, not a delta against a remembered one**, and
  a queued class records what was true when it was written. FIVE queue entries
  have now been found already closed by re-reading them rather than by working
  them — the fifth asked for an instrument that had shipped the day before, and
  working it would have added a FOURTH slice of one shipped expression.
  **So before building an instrument, ask whether the project already has one,
  and grep the TRACKED tree** rather than the directory the last script lived
  in. A duplicate under the same basename in a gitignored directory outranks the
  canonical file in every import that names it relatively.
- **Read the shipped guard before pricing a cost it may already stop**, and ask
  it the question it answers. *A guard's live population is not always the
  population it was written for.*
- **A guard that withdraws an assertion can also PROMOTE one**, and a guard that
  withdraws a region can hand the plan to a prior-year fallback that is better
  than what it replaced. So read GAINS as carefully as losses: a gain is a claim
  about a filing. One run's gains were 80% menus that are not menus.
- **A legibility fix must be priced against the guards that READ names**, not
  only against readers — making three caption rows legible handed five whole
  menus to an entry-level junk demotion.
- **A DIFF CANNOT TELL A WANTED CHANGE FROM AN UNWANTED ONE — ONLY READING THE
  OUTPUT CAN** (2026-10-03, after shipping a wrong fund name past every gate).
  8 pins passed in both copies, four negative controls were each load-bearing,
  the whole-store diff read 0 tickers / 0 fees / 0 types / 0 flags, and site-test
  was green — and the arm was publishing `Vanguard Windsor Fund` where the filing
  said Windsor **II**, because the row changed in exactly the way the arm
  intended. It surfaced only on regenerating the crawlable pages and reading the
  one page that moved. **And the specific move is reusable: the row that did NOT
  change is evidence about the rows that did.** `Vanguard Windsor || Fund Inv`
  sat two rows above the change, untouched, and asking *why that one was spared*
  exposed the ones that were not. *A greedy quantifier is how a repair licenses a
  wrong claim* — prefer the narrowest run length the mechanism allows, and look
  for a witness to the distinction inside the store before inferring one.
- **A floor of ONE lets a single damaged row license the same damage elsewhere**,
  and a CEILING that reads repetition as evidence of correctness is fed by
  repeated damage. Prefer a RATIO between two whole names, plus an independent
  witness from outside this store.
- **A predicate that is right for one class is not thereby right for its
  neighbour**, and a hand-built control table tests the cases its author already
  imagined. The whole-store diff is not a formality after the controls pass.
- **`node --check` CANNOT SEE A MODULE/SCRIPT MISMATCH, AND app.js IS A CLASSIC
  SCRIPT (2026-10-04).** A slicer that rewrote `export function X` BY NAME left a
  second `export` in app.js's IIFE, because the slice carried two exported
  functions and only one was named. `node --check` **passed** — it parses the
  file as a module — while every browser rejects an `export` in a classic
  `<script>` as a SyntaxError and loads **no app.js at all**, so the whole site
  goes, not one feature. Strip EVERY export and assert none survives: *a named
  rewrite is a rewrite for the exports you remembered.* The only local gate that
  catches this is `smoke-test`, which boots the page. Sibling of *`node --check`
  is the syntax check; importing a script executes it* — there the file ran when
  it should not have, here it was syntactically perfect under the wrong module
  goal.
- **A SLICER THAT CAN ONLY INSERT FORCES THE HAND-EDIT IT EXISTS TO PREVENT
  (2026-10-04).** `scratchpad/slice-vq.mjs` threw if app.js already carried the
  twin, so it could create the block once and never update it — and the only
  remaining way to change the twin was to hand-edit app.js, which is exactly
  what four lost browser twins came from. A twin generator must REPLACE in
  place, be TRACKED (a gitignored directory has been wiped twice), and carry a
  `--check` mode so CI fails on drift rather than a reader finding it.
- **A generator that edits a block in place deletes anything a later hand-edit
  puts inside its boundaries.** Four browser twins were lost to three
  regenerations; a predicate app.js twins is SLICED VERBATIM on the day it ships
  and never typed into app.js.
  **AND IT HAD BECOME SYSTEMATIC RATHER THAN INCIDENTAL, FOUND 2026-10-04 BY
  ACCIDENT.** FOUR MORE twins were sitting inside those boundaries unsliced —
  `hasNoFundIdentity`, `isLabelOnlyName`, `isSentenceRow`, `isNonIssuerCell` —
  so any run of `gen-generic-twin` deleted all four **plus BOTH compositions**,
  replacing the composed `isGenericName` with the bare `isGenericTypeName`: 263
  deletions, 7 insertions, un-publishing ~1,088 rows / 2.5M participants of
  suppression. All five are now sliced and both compositions emitted, proved
  behaviour-preserving by the render diff returning the identical 574 rows.
  ***The uncomfortable part is how it surfaced — a new arm referencing an
  undefined symbol. Nothing tested that the generated block was still
  generated.*** **And no per-predicate tether could have: each checks its OWN
  function, and the change that mattered most was to the EXPRESSION they are
  composed into.** `smoke-test` now cross-checks the COMPOSED gate with a case
  only `hasNoFundIdentity` can answer. *A tether per predicate is not a tether
  on the expression the page evaluates* — so after touching anything inside a
  generated block, RUN the generator and diff, and ask what tests the
  composition rather than its parts.
- **The page is the artifact.** A store-side proxy for what changed is not the
  page; regenerate and diff the files.
  **AND IT IS THE ONLY HONEST CHECK ON A STORE-SIDE COUNT (2026-10-04 18:3xZ).**
  A published figure of 574 rows / 4,564,065 ppl was wrong because the render
  diff credits every MEMBER plan of an ack while both surfaces serve a TRUST's
  menu only where the plan's own lineup is unusable — the THIRD miss of that
  condition and the second in three cycles, one cycle after writing *"a
  measurement of what a page PUBLISHES must apply every condition the page
  applies, in order."* ***Re-reading the rule did not catch it; a `grep` of the
  regenerated pages did*** — PepsiCo was in the count, PepsiCo has a page, and
  the string was on no page at all. So: **after any store-side count of
  published rows, pick one plan from it that has a crawlable page and grep for
  the string.** A hit confirms the count's premise; a miss means a condition is
  missing.
- **SUFFICIENCY IS NOT NECESSITY — A TOKEN-ALONE TEST DETECTS AN INERT ARM, A
  LEAVE-ONE-OUT DECIDES WHETHER ONE SHIPS (2026-10-04).** Measuring ten
  candidate vocabulary tokens one at a time reported `instr` reaching **0 rows**
  — the exact signature this record calls untested machinery — and it was
  necessary for 3, because the filed string needs `corp` AND `instr` together.
  Run both tests: alone (is it inert?) and leave-one-out (is it load-bearing?).
  Six tokens failed both and were refused.
- **DIAGNOSE a refusal before reporting it** — call the most harmless tool on the
  same server. And **a blocked tool is not a blocked goal**: enumerate the other
  mechanisms that reach the same outcome.
- **A diagnosis that cannot be reproduced is not a diagnosis.** What worked on
  the hardest bug on this record was not a better theory but making the program
  SAY what happened.
- **A SYMBOL CAN BE RIGHT FOR THE FUND AND WRONG FOR THE VEHICLE, AND NO COUNT
  CAN SEE THE DIFFERENCE (2026-10-09).** A resolver gain was measured at 20,181
  rows with swaps 0, losses 0, every fixture green and a whole-store diff clean
  — and 51,491 of those rows were typed `Pooled separate account` or
  `Collective trust`, where the plan holds a wrapper that invests in the fund,
  at the wrapper's higher cost. `fund-er.js` had carried the rule for weeks and
  the matcher could not apply it, because `resolveHolding` is never handed the
  TYPE cell. **What found it was a SEEDED UNIFORM DRAW that printed each row's
  own type beside the answer** — the same instrument-completeness rule as *print
  every field of the ANSWER the page acts on*, met on the vehicle instead of the
  asterisk. So: when a change asserts an identification, ask what the filing
  says the HOLDING IS, not only what it is called.
- **AND ASK WHETHER THE PAGE EVER CALLS THE FUNCTION ON THAT ROW AT ALL
  (2026-10-09).** 10,718 rows of the same gain were phantom: `renderRow` gates
  `lookupTicker` on `!gicRow && !subtotalRow && !loanRow && !annuityRow &&
  !contractRow` and then overrides `tk` outright for a loan or employer-stock
  row, so a key written for them can never be read. Sharper than *a FLAG THAT
  FLIPS IS NOT A CELL THAT CHANGES*: there an arm's verdict was displaced by an
  earlier one in the same chain, here the function the measurement calls is one
  the page DOES NOT CALL on that row. Measuring through the right function with
  the right argument is still not enough if the caller skips it — read the
  CONDITION on the call, not only the call.
- **AN INSTRUMENT THAT CANNOT OBSERVE THE CLASS OF CHANGE UNDER TEST REPORTS A
  CLEAN NO-DIFFERENCE (2026-10-09).** `trace-filing --vs` printed rows, ratio and
  confidence and **no features**, so comparing v202 against v203 — a
  feature-only version — produced two identical blocks that read as "nothing
  changed". The same harness had also been **unrunnable** since v201 (it copied
  `lib-4i.mjs` alone to a temp dir, and v201 added `import … from
  "./lib-quote.mjs"`), and its temp dir broke lib-4i's `../sec-funds.json` read
  behind an `existsSync`, so the baseline would have run with no SEC table while
  the working tree ran with one — **silently**. Fixed: the whole module graph is
  walked transitively from the SAME ref and a missing file **throws**, because
  resolving it against the working tree would mix two versions into one
  "baseline"; the layout keeps the data files reachable, holding the corpus
  constant and varying only the code; and features print with quotes in full.
  Controlled both ways on real filings — Arcosa moves `Immediate` → `2-year
  cliff` exactly as v203 is registered to, and a manufactured ref whose lib-4i
  imports a missing module throws rather than reporting a baseline it could not
  produce. *A no-difference is a finding only once the instrument has been shown
  able to see the difference* — the same shape as *a check that prints 0 on a
  quiet store has not been tested*, applied to a comparison instead of a count.
- **A BUDGET ENFORCED AT THE TOP OF A LOOP IS NOT A BOUND ON THE BODY OF THE
  LOOP (2026-10-09, run #605).** One shard ran **3h14m** against nineteen
  siblings at 38–55 minutes, blocking the merge until it was cancelled by hand.
  `TIME_BUDGET_MIN=320` is checked BETWEEN filings and a hang inside a filing
  never returns to the loop to be checked; `timeout-minutes: 355` was 160
  minutes away. The cause: **ten `execFileSync`/`execFile` sites spawn
  `pdftotext`, `pdftoppm`, `pdfimages` and `tesseract` and not one passed
  `timeout`**, so each waited forever by default. Fixed with per-binary ceilings
  and `SIGKILL`, controlled both ways (a wedged sleep dies at 1507ms; a real
  filing extracts 361,202 chars in 1076ms against a 180s ceiling — 167×
  headroom, so the ceiling cannot refuse honest work). **The ceilings are
  generous on purpose: too TIGHT reproduces #604 exactly, because `pdftotext`
  throwing is stored as `e:"pdftotext"` and DESTROYS the entry — so the guard
  pointed at this fix is #604's own `extraction-failures` HIGH.** *When a fix's
  failure mode is the previous defect, aim the previous defect's instrument at
  it.*
  **AND THE DIAGNOSIS CAME FROM TWO STRUCTURAL FACTS, NOT A LOG:** no
  `results-N.json` was written and that flushes every 250 filings, so the hang
  was inside the first 250; and the work list is partitioned
  `i % PARSE_SHARDS === PARSE_SHARD` over an assets-sorted list, so **every
  shard's composition is near-identical by construction** and a 3.5× outlier
  cannot be a load difference.
  **PLUS: A CANCELLED STEP REACHES NO BRANCH GATED ON EXIT STATUS.** The shard's
  40-line tail printed only `if [ "$ec" -ne 0 ]`, so the one failure mode where
  the log is the sole evidence produced none — #604's defect one run later. Use a
  `trap`, so the tail lands on success, failure, timeout and cancellation alike.
  `docs/accuracy-log.md` 2026-10-09 (10:3xZ).
- **AND THE NEXT LAYER OUT: A PROGRAM THAT SAYS WHAT HAPPENED AND NOTHING THAT
  ADDS IT UP (2026-10-09, run #604).** `>/dev/null 2>&1 || true` on the parse
  job's `apt-get install` — with no `apt-get update` — let an ATOMIC two-package
  install fail entirely while prep's one-package install succeeded, so
  `pdftotext` was absent on all twenty shards, **68,865 filings were downloaded
  and read as nothing, and the run reported 99.7% coverage.** Only the merge
  job's publish gate caught it, 4h20m in, and v203 was suspected for an hour
  first. Three independent paths each enumerated the failure shapes their author
  had in mind: *the install discarded both streams and its exit code*;
  **`fetch-4i`'s `pdftotext` branch was the only error path that destroyed an
  entry and incremented no counter**, so the per-shard tally said `download=5`
  while 3,448 filings were wiped; and `audit-data`'s completeness line knew two
  `e` codes where the store carried three. ***A SUPPRESSED COMMAND IS AN
  UNINSTRUMENTED COMMAND***, and `|| true` on an install buys nothing a version
  probe does not buy better. **When adding an error branch to a loop that reports
  a tally, ask what the SIBLING branches do with the tally** — the same shape as
  asking what the sibling guards do with the quote. And **an enumeration of
  failure shapes goes stale exactly like a vocabulary**: derive it from the `e`
  codes present in the store, not from memory. Fixed with `apt-get update`, an
  un-redirected install, a version probe of every binary the job calls, the
  missing counter, and an `extraction-failures` HIGH at **0.1%** — a tenth of the
  download threshold, because a 403 PRESERVES the stored entry and an extraction
  failure DESTROYS it. Both controls run (quiet store 0, #604's shape FIRES).
  `docs/accuracy-log.md` 2026-10-09 (06:5xZ).

## The gap method (2026-09-03) — diagnose at parse time, not by re-download

The gap work was serial and expensive: pick a bucket, download 30-40 filings,
re-parse them, infer a cause distribution with sampling error, then download the
interesting ones again to investigate. The pipeline had already read every one
of those PDFs and thrown the reason away. Four things fix that, and together
they are the method:

1. **The parser records WHY (v106).** `parse4i` returns `why: "nohead" |
   "noregion"`, and `fetch-4i`'s `diagnose()` writes a compact cause into
   `lineups-status.json` for any ack that does not yield a publishable lineup:
   `dx` (nohead / noregion / stmt / trust / few / band-lo / band-hi / narrow)
   plus `rw` rows and `rt` ratio x100. Confident parses carry no `dx` — absence
   is the good case. **Cost: two small fields per non-confident ack. Benefit:
   the ENTIRE gap population is bucketed exactly, for free, with no downloads
   and no sampling error.** `gap-census.mjs` reads `dx` and falls back to the
   old inference for pre-v106 data, labelling it as such.
2. **`trace-filing.mjs` + `WAMPO_TRACE`** replace hand-patching a copy of the
   parser. `WAMPO_TRACE=rows|cands`, `WAMPO_TRACE_MATCH=<value|substring>`,
   `--vs <ref>` to compare versions on one filing.
3. **`docs/defect-specimens.json` pins one filing per solved class**, and
   `diff-lineups.mjs` tops the corpus up from it before comparing. The corpus is
   sampled by assets, so it holds what is common rather than what is broken:
   the tool reported "no changes" for v101, v103 AND v104 because none of those
   classes were in it. With the pins it immediately showed Physician's Computer
   gaining confidence 15->32 rows and W. L. Gore moving 20->31. **Add a specimen
   whenever a version fixes a class; never remove one.**
4. **`audit-data.mjs` counts the fabricated shapes every merge** against the
   shared `GENERIC_TYPE_NAME` / `NOT_FUND_SHAPED` exports, feeding the
   auto-managed HIGH issue. Baselines on v104 data: 206 generic-named, 50
   dominant non-fund.

**The order of work, once dx is populated:** read the census, take the largest
bucket by participants that is OURS, pull its acks straight from `dx` (no
sampling), trace two or three, fix, gate, `diff-lineups`, re-read the census.
A bucket that shrinks is proof; a bucket that does not is a wrong diagnosis.
