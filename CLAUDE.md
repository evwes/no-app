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
  (`mirror.sh` now refuses on exactly that), and a scheduled run always leaves
  main a data commit the branch lacks, which `mirror-gate` refuses until the
  branch adopts it. **Pushing to dev is safe during a main run; mirroring is
  not.** *A rule stated more broadly than its mechanism costs real hours, and
  the cost is invisible because nothing fails.*
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
match **43,312** · vesting 53,115 · roth 38,369 · **HIGH 4** ·
warn **556** · overshoot 370 · overshootTrust 12 ·
aggRow 114 · dl **48** · pvTopShare **99.9** (pv **200**) ·
tkExact **37.76** · tkComparable **3.41**.

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

**THE IDENTICAL-LINE RUN, RE-DERIVED 2026-10-04 18:4xZ AND NEVER INCREMENTED: 3
on all keys, 3 on shared keys**, over 386 trail lines. *A count carried forward
by increment is not a measurement* — if a number in this file advances every
cycle, re-derive it (compare the trail tail under BOTH key sets, because the
`pv` field added at #565 breaks a naive all-keys comparison across its own
introduction).
**AND THE "longest identical streak 34 / 51.2% of pairs identical" RECORDED IN
THE ALWAYS-ON MACHINERY SECTION COULD NOT BE REPRODUCED — do not quote it.**
Measured over the record's own 373-pair window, four key-set definitions give
**44.8% to 75.1% identical and longest streaks of 13 to 66**: all keys 44.8% /
13, shared keys 45.6% / 14, confident+match+vesting 67.8% / 66, `confident`
alone 75.1% / 66. Nothing lands on 51.2% / 34. ***The statistic is dominated by
WHICH KEYS are compared — a 5x spread in the streak — so quoting it without
naming the key set is meaningless***, which is the reusable part and why the
current run above names both sets. The 48.8%-move claim built on it inherits the
same problem.

**COMPLETENESS TEST:** one dominant pv covering ≥97% of acks plus a small
old-version tail. A second large pv cohort means a PARTIAL store (`audit-data`
raises `partial-store` under 97%); `dl` above 1% raises `download-failures`.
The `dl` population has been HEAD-probed whole four times (68/68, 78/78, 23/23,
20/20 → 403), so `e=download` is an honest published claim and a rise means the
EFAST2 bucket grew, not that our code broke.

### Pre-registered for the next run that merges

**v201 IS PRE-REGISTERED AND THE PREDICTION IS "NOTHING MOVES BUT `pv`".**
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
- Stable value / guaranteed accounts publishing a fabricated ER: 4,669 rows /
  **7,389,704 ppl**, 4,571 of them at exactly 0.35.
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
  Also open and deliberately not split: the crawlable pages have no type column,
  so the 1,294 TYPED captions print there unqualified (Hallmark's
  `U.S. Government Securities $312,377,367`). Two copies of a rule is how two
  surfaces drift. `docs/accuracy-log.md` 2026-10-04 (16:0xZ) and (16:5xZ).
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
  fact SILENT on them, for the same reason it is limited. **The remaining work is
  to find which `continue` drops them and whether it may be narrowed — a
  different change from the ranking.** The four rules stay recorded because they
  are the right ranking ONCE the candidates arrive.
  `docs/accuracy-log.md` 2026-10-04 (21:0xZ).
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
- The `iShares` abbreviated-name family: 11,334 of 13,927 published rows / 7.24M
  ppl publish no ticker while 7,947 publish a fee. Usable as a defect measure
  because the brand names REGISTERED ETFs, so a blank is a matcher gap and never
  a vehicle fact. The **EAFE** series is genuinely ABSENT from the registry
  (308 + 316 rows) — a separate unsized item, not an entity defect.
- The one-class residue: 511 shipped `stk` rows / 339 names / 395,265 ppl state
  a class the series does not register, dominated by `Vanguard Target Ret <year>
  Inst`. A pre-existing property of `resolve`'s one-class arm; refusing it in one
  family alone would make two siblings of one registrant disagree.
- Unverified costs of the 15:0xZ Vanguard change, recorded as inferences: 386
  rows / 30,686 ppl newly ASSERT where the issuer names an insurance platform
  (against 1,575 rows that already assert that way — pre-existing, cause located
  in `fundTickerInfo`'s `wrapped` test reading the NAME while `lookupTicker` asks
  the bare name), and 140 rows / $987,688,869 reading `Vanguard Target Return
  <vintage>` as a garble of Target Retirement.
- **THE KROGER LOAN ASSET — MEASURED 2026-10-02, predicate stated.** Published
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
- **`scripts/merge-name-test.mjs` EXITS 1 AGAIN, AND THE CAUSE IS A GATE THAT
  ERASES ITS OWN EVIDENCE (2026-10-02 20:0xZ).** This entry read "EXITS 0, not
  1" — measured and true when written, wrong now; it exits 1 both stashed to
  HEAD and with a diff applied. The failure is the **ISSUER arm's
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
  **AND NAMED RESIDUE from (a):** `Investment in`/`Investments in` (New York
  Life, 14 rows / ~71,000 ppl) are truncation fragments blocked by the
  every-word condition — adding `in` is a measurement, not a free widening.
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
- **A count of a condition is not a measure of a defect**, and the siblings:
  *a count keyed on a VOCABULARY measures the vocabulary*; *a count keyed on
  PLANS is blind to every master-trust row* (resolve a trust row through its
  MEMBER plans — met seven times); *a STORED field is not a PUBLISHED one*
  (cost one class size a factor of 3.9).
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
