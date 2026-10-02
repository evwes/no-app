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
  **residuals table's `reachable` column** (parser work) or leaves it alone if
  the only remaining items are the owner decisions. **There is no separate task
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
  rk coverage, fee-codes %, HIGH/WARN counts) — trends are diffable, dips
  are regressions; (2) the merge job maintains an auto-managed GitHub issue
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
  `MIRROR_GATE_MAIN_REF=<ref>` replays any pair on demand. The hand-rolled
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

## Current state — RE-DERIVED FROM THE STORE 2026-09-30 02:5xZ

**Re-derive this block from the store; never edit its date.** An earlier
version of this header said "Store at v168 … `PARSER_VERSION` in the tree is
168 and NOTHING IS IN FLIGHT" while the tree was at 177 and a run was in
flight — the first bullet a new session reads, wrong, exactly the hazard this
file warns about elsewhere and aimed at itself. It has now gone stale three
times (v123-for-v124, v168-for-v177, and v181-for-v184 across a container
restart), so the fix is the habit: read `lineups-status.json` and `lib-4i`'s
export, do not copy the line. **It went stale a FOURTH time on 2026-09-29
across a container restart**, reading "IN FLIGHT: #510 … THE MIRROR IS HELD ON
PURPOSE" for an hour after #510 had been verdicted AND mirrored. Same shape,
same cause: the restart is what separates the cycle that writes a status line
from the cycle that would have cleared it.

- **Universe 112,652 plans, RE-DERIVED FROM THE STORE 2026-09-30 19:0xZ AFTER A
  DOL DATASET REFRESH — do not carry the old 111,782 forward** (401(k)-type 2J
  + ERISA 403(b) 2L/2M, ≥100 participants at either end of the plan year):
  **68,538 full-form**, 44,114 short-form, 69,046 parse-status entries. The
  refresh added a September ack month of **10,222 filings** and moved plan year
  2025 from 33,008 to **44,548**.
- **STORE: pv 196 covers 69,027 of 69,046 acks (99.97%)** — one dominant pv plus
  a 19-row old-version tail (pv192 11, pv189/180/37 2 each), which is the
  completeness test, not a partial store.
  Confident **60,170**, lineups 59,822, entries 65,479,
  WARN **608**, overshoot **372** / 436,224 ppl — **the rise is 83 entrants of
  which 83 are acks NEW to the store and 0 pre-existing**, so the baseline
  travels with the universe —
  overshootTrust 12, aggRow 113, **dl 19** (the 142 dead 403s largely resolved
  because a newer filing replaced the withdrawn one). **HIGH is back to 4:**
  `audit-generic-names` fell back under its 230 threshold on the new store, so
  the `fabricated-name` HIGH cleared and the baseline is the 4 `contrib`
  outliers again.
  **THE HIGH BASELINE IS 4 AND THIS PARAGRAPH SAID 5 UNTIL 2026-10-02 01:5xZ,
  WHEN IT COST A PRE-REGISTRATION.** #541 was registered at HIGH **5** off this
  line and the run read **4**; `audit-data` on #541's own store prints
  `== HIGH (4)` composed of **3 `contrib` + 1 `fabricated-name`**, which is what
  the 18:0xZ correction further down already said and what the line above this
  one ("HIGH is back to 4") said too. So the file carried THREE statements of
  one baseline — 4, then 5, then 4 — and a pre-registration read the middle one.
  *A contradicted number in this file is asserted again every time it is read,
  and the reader cannot tell which copy is live.* The crossing below is real and
  its arithmetic is unchanged; only the TOTAL was wrong, because a fourth
  `contrib` outlier had left the store on the DOL refresh.
  `audit-generic-names` reads **235 plans / 477 rows** against the
  `fabricated-name` escalation threshold of 230, so that HIGH is STANDING
  rather than absent: HIGH = **3** `contrib` + `fabricated-name`. The threshold was
  deliberately NOT moved (raising a threshold to accommodate one's own widening
  is how a regression gets normalised) and the flag text names the re-basing, so
  the crossing is self-explaining. **CI reports 7** — the extra two are
  self-clearing `reparse-loss` entries raised from `losses-triage.txt`, a run
  ARTIFACT that exists only in CI; *a metric that differs between CI and local is
  a question about the inputs, not the store*. What the owner item asks for is
  unchanged: a WHOLE-TABLE generic test beside the one-row test.
  `audit-dominant-row` **0 plans / $0.0B** by BOTH the plan-keyed count and the
  trust-aware standalone script — the standalone's single trust is the one lineup
  v196 withdrew. **`matchQuote` 5,397 of which only
  1,785 are SHOWN to readers** — the condition/outcome pair shipped 2026-09-27.
- **`site-test` #137 READS `conclusion: success` ON `c1eb43be`**, the exact commit
  carrying BOTH the `(continued)` caption fix and the `ticker-conflict` repair,
  and the one commit on top of it is verified **docs-only** — so that green
  covers every executable line shipped in this cycle. **It also settles a flag
  the agent raised rather than hid: `map-test.mjs` FAILS IN THIS SANDBOX with
  `ERR_CERT_AUTHORITY_INVALID` on the Google Fonts stylesheet** (the proxy
  intercepting TLS), and the agent's own control was that it fails identically on
  HEAD. CI runs the same job and passed, so **the failure is the sandbox and not
  the test** — recorded because *local red is no more evidence than local green*,
  and the only thing that settles either is the CI conclusion.
- **#541 RAN `success` AND EVERY REGISTERED STORE FIGURE PASSED** (data
  `1c9e4046`): confident **60,170**, lineups 59,822, entries 65,479, overshoot
  **372**, overshootTrust 12, aggRow 113, **dl 19**, pv 196 at **100%**,
  `tkExact` **37.2** (inside "at most +0.05") and `tkComparable` **3.27** held.
  **`ticker-conflict` 15 → 3 against the registered "about 2", AND THE THREE
  SURVIVORS ARE EXACTLY THE TWO CLASSES THE SHIP NAMED AS OUT OF SCOPE** — St.
  Jude's transposed `(VBITX)`, refused on purpose, plus `PIMCO Total Return A
  (PTTAX)` and `CLASS (CMTFX) TIAA-CRF …`, both carrying the bracket **mid-string
  with debris after it**, which is the 80-row class the anchor excludes. *A
  residue that is entirely the classes the change named is the strongest form of
  a passed registration.*
  **THE HIGH MISS IS THIS FILE'S OWN CONTRADICTION, NOT THE STORE'S.** I
  registered **5** and the run read **4** = 3 `contrib` + `fabricated-name`;
  CLAUDE.md carried THREE statements of one baseline in one block (4, then 5,
  then an 18:0xZ correction back to 4) and the pre-registration read the middle
  one. The 5-line is rewritten in place to name its own cost, because *a
  contradicted number is asserted again every time it is read and the reader
  cannot tell which copy is live.* Direction safe: AT baseline, not above.
  **AND `warn` 601 → 556 RECONCILES EXACTLY TO TWO OF MY OWN CHANGES, NEITHER A
  DATA IMPROVEMENT: −33** from the 00:3xZ `ticker-conflict` repair, which shipped
  `[skip ci]` **after #540 had already run**, so no run ever recorded its
  predicted 601 → 568 and **568 never appears in the trail**; **−12** from this
  ship. 33 + 12 = 45. **The trail steps down 45 in one line and must not be read
  as the data improving** — 45 fewer FALSE or stale findings, 0 fewer real
  defects. *When two reporting-only changes queue behind one run, register their
  SUM, not each in turn.* No CI-versus-local divergence: the local audit on
  #541's own store reproduces `HIGH (4)` / `WARN (556)` exactly.
- **#542 RAN `success` AND IS MIRRORED — 2026-10-02 03:2xZ (`b43969cb →
  790816d5`), UNFORCED ON BOTH CHECKS, data gate +0 / −0 BY ACK AND BY PLAN.
  EVERY PRE-REGISTERED FIGURE PASSED AND THE PRODUCTION MERGE REPRODUCED THE
  LOCAL ONE TO THE ROW.** Read out of the ARTIFACT (the merge log's blob host is
  `connect_rejected`): `stk` on **479,546 rows across 48,104 plans, 113,848 on a
  blank type cell**, all three to the digit, and `ftk` on **2,823 rows / 128
  entries** = the registered 2,166 / 75 plus 657 / 53 exactly. Diffing all 64
  lineup shards at `a6dd5be9` against the data commit: **`name` 0, `stk` 0,
  `ftk` 0, 0 row-count changes, 0 acks added or removed**, 1,730,535 rows both
  sides — and `data/lineups/**` is not in the data commit's file list, the same
  statement from the other direction. Coverage line: confident **60,170**,
  lineups 59,822, entries 65,479, **HIGH 4**, warn **556**, overshoot 372,
  overshootTrust 12, aggRow 113, dl 19, pv 196 at **100%**, `tkComparable` 3.27,
  `tkShare` 24.47 — and **`tkExact` 37.2 → 37.32, the figure the agent
  registered only after its own "this cannot move" argument was refuted by
  running it.** *An argument that a figure cannot move is still a prediction*,
  and here the weaker, measured claim is the one that passed.
  **`site-test` #139 reads `conclusion: success` ON `a6dd5be9`**, and the two
  commits on top are verified docs-only (CLAUDE.md, 3 insertions) and data-only
  (nine single-line JSON stores), so that green covers every executable line
  shipped. 1,077,891 participants now have the iShares S&P 500 Index Fund named.
- **THE 03:1xZ DRAW FOUND THE 14:2xZ SHIP'S OWN GATE ONE WORDING SHORT —
  QUEUED, SIZED, HANDED OFF, NOT SHIPPED: 261 rows / 243 plans / 539,691
  participants / $3,473,519,783 publish a fabricated expense ratio that the
  shipped rule exists to withhold, and 250 of the 261 publish exactly 0.35.**
  Seed 20261002031, pool 59,822 published lineups / 91,581,640 ppl; **Walsh
  University (690 ppl, 56 rows @ 0.999)** and **Aya Healthcare Services (63,406
  ppl, $582,970,258, 30 rows @ 0.998, OCR'd)**. Walsh publishes **`TIAA Stable
  Value Contract - Fully Benefit-Responsive` typed `Mutual fund` at 0.35** —
  `fund-er.js`'s generic `/stable value|guaranteed|gic/` fallback, the number
  withdrawn from 89 rows on 2026-09-29, refused again by v196 and withdrawn from
  a further 117 at 14:2xZ.
  **ASKED OF THE SHIPPED SOURCE:** `annuityFeeIsGuaranteeOnly`'s first condition
  is `/\bannuity contracts?\b/ || /\b(?:investment|insurance) contracts?\b/`, so
  `Stable Value Contract`, `Guaranteed Income Contract`, `Guaranteed Interest
  Contract` and `at contract value` are outside it BY CONSTRUCTION — **the NINTH
  instance of *a fix for one phrasing of a class is not a fix for the class*,
  and the SECOND inside this one function**, whose own comment records the
  eighth and widened one wording to three in the same breath.
  **POSITIVE CONTROL, THE PAIR, run before any count:** through the page's own
  render `Unallocated investment contract - Guaranteed Income Fund` publishes
  **no fee** and `TIAA Stable Value Contract - Fully Benefit-Responsive`
  publishes **0.35**. One wording apart.
  **217 DISTINCT NAMES IN THREE FAMILIES, and the split decides how the widening
  may be written:** an unlisted DESIGNATION (`Guaranteed Income Contract` 6,
  `Guaranteed Interest Contract` 4, `TIAA Stable Value Contract` 7, `Fixed
  Interest Contract`); a **filer's MISSPELLING of a listed wording**
  (`Guaranteed Investement Contract`, `Guaranteed Invest Contract` — four rows
  that miss `investment contracts?` by a keystroke, which is what a vocabulary
  makes possible); and **`at contract value`, a MEASUREMENT BASIS and not a
  designation** (`Key Guaranteed Portfolio Fund, at contract value` 5, `Lincoln
  Stable Value (at contract value)`, `CMFG Stable Value, at contract value`).
  **THAT THIRD FAMILY IS EXACTLY WHY 2026-09-29 REFUSED THE BARE WORD
  `contract`** — it measured 117 further rows and read all 103 names,
  *"overwhelmingly REAL FUNDS wearing a caption"*. **What makes the widening
  tractable anyway is that the gate's SECOND condition is the real safety and it
  already ships:** `(wording) && priceOf(rest) == null` strips the
  guarantee-priced words and asks the same table again, so `at contract value
  Fidelity 500 Index` survives because its remainder prices while `Key
  Guaranteed Portfolio Fund, at contract value` does not. **So the open question
  is not whether to widen but WHAT THE SECOND CONDITION COSTS once the first is
  widened, and that is a measurement rather than an argument** — how many rows a
  bare `\bcontract` first condition reaches whose remainder DOES price, and
  whether they are the 2026-09-29 population exactly. **5 of 261 publish a
  ticker**, so for 256 the whole effect is withdrawing one invented number.
  **NOT the owner-gated stable-value item** (4,669 rows / 7,389,704 ppl): every
  one of these 261 additionally carries the filing's own word `contract`.
  **ALSO LIVE IN THOSE TWO MENUS, queued and not bundled:** Aya's **`NUVEEN
  LIFECYCLE !NDEX 2060 INST` at 13.2% / $76,586,960 with no ticker and no fee**
  while six sibling vintages publish 0.1 — the OCR `!`-for-`I` class, recorded
  2026-09-21 at **7 rows / 7 plans**, so **a 7-row class with a 63,406-ppl member
  is worth re-sizing before it is called small again**; Aya's `ANNUITIES` at
  $10,026,017 with a BLANK type beside a correctly-typed `Investments at Net
  Asset Value` (a bare ASSET CLASS outside `isGenericTypeName`, the owner-queued
  whole-table item); **`Aya Healthcare Services, Inc.` — its own sponsor name —
  as a $1,276,573 holding**; Walsh's `TIAA Traditional Annuity Contract TIAA
  Traditional Annuity Contract - Fully Benefit-Respon`, a whole phrase **doubled
  then truncated**, which v149's adjacent-repeat arm cannot reach; and EQNVX,
  HSNVX and ASVDX each publishing a **symbol with no fee beside it** (the
  91,423-row class). `docs/accuracy-log.md` 2026-10-02 (03:2xZ).
- **SHIPPED 2026-10-02 03:0xZ, DATA IN THE SAME COMMIT — THE SEC REGISTRY STORED
  ITS OWN NAMES HTML-ESCAPED AND ONE ESCAPE DENIED A WHOLE FUND ITS KEY: 1,550
  rows / 1,547 menus / 1,077,891 participants GAIN an exact ticker, 0 changed, 0
  lost, 0 fees and 0 asterisks moved.** `sec-funds.json` carried
  `BlackRock Funds III :: iShares S&amp;P 500 Index Fund`, and `norm()` strips `&`
  and `;` as punctuation, so the series keyed as **`ishares s amp p 500 index`**
  and **no filed name written `S&P` could reach it.**
  **THE DISCRIMINATING PAIR IS ONE REGISTRANT, ONE FAMILY, ONE DIFFERENCE:**
  `iShares S&P 500 Index Fund Class K` resolved to NOTHING while
  `iShares U.S. Aggregate Bond Index Fund Class K` resolved to **WFBIX EXACT**.
  The sibling is pinned as a must-be-UNCHANGED control, which is what says a KEY
  was repaired rather than the matcher loosened.
  **THE SIZE I WAS HANDED WAS 7 ENTRIES AND ONE ENTITY; THE FILE HOLDS 18 AND
  THREE.** That measurement asked a CLOSED LIST, and an open scan finds **`&reg;`
  on 16 occurrences and `&#153;` on 3, BOTH MORE FREQUENT THAN `&amp;`**, over 6
  registrants not 3. ***A count keyed on a vocabulary measures the vocabulary, not
  the population.*** **And the two it missed are the ones `norm()` ALREADY tried to
  handle** — it opens by stripping the decoded `®™℠`, so the escaped form walks
  past the very line written for it and leaves `reg`, or the bare digits `153`, as
  identity-bearing tokens.
  **THREE POPULATIONS AND THE HANDOFF'S HEADLINE IS THE WIDEST: `resolveHolding`
  answers 2,046 rows / 422 names / 1,519,634 ppl; the merge STORES 1,919 (the
  `secTypeAdmits` gate); a READER gains 1,550 / 1,077,891** — 29% narrower, the
  stored-versus-published distinction a sixth time. **The gap reconciles to the
  row: 1,550 + 369 the page already answered + 0 suppressed = 1,919**, and the 369
  are attributed rather than guessed — no stored field carried a ticker on any of
  the 1,919, and those resolve through `fund-er.js` **only where the string names
  BLACKROCK**, so the 1,550 that gain are exactly the rows naming only `iShares`.
  **THE ONLY LOSS WAS ON THE FILED SIDE AND IT IS THE METHOD FINDING.** Three rows
  / 988 ppl are named `iShares S&amp;P 500 Index Fund Class K Shares` — **the
  escape is in the STORED HOLDING NAME** — and resolved only because the registry
  carried the SAME damage; decoding one side alone loses them. ***The handoff's
  harness had a gain bucket and a change bucket and NO LOSS BUCKET, so its
  "0 lost" was true by construction*** — *a before/after harness that cannot
  express a loss has not measured one.* `resolveHolding` decodes both sides; lost
  0.
  **ADDITIVE BY CONSTRUCTION, MEASURED: the decode is the identity on any string
  with no entity reference, and changes 2 of 417,260 distinct published names and
  0 of 15,714 issuer cells** — so **the issuer half is DECORATIVE on this store and
  is labelled so in the source.** **NO BUCKET MERGED:** 10 keys move, the new key
  pre-existed for 0, `bySeries` 12,328 both sides, 0 membership changes.
  **RESIDUE COUNTED AND SHIPPED ON PURPOSE: 340 rows / 87 names / 256,257 ppl
  state a class the series does not register** (it registers exactly one,
  `WFSPX | Class K Shares`), against 882 stating K and 328 stating none.
  **NO CONTRADICTING-CLASS GUARD SHIPS AND THE SIBLING IS WHY: 40 rows / 31,915
  ppl ALREADY publish WFBIX for a name stating Investor A / Inst / I / Z**, so the
  residue is a PRE-EXISTING property of `resolve`'s one-class arm — **sized
  store-wide at 511 shipped `stk` rows / 339 names / 395,265 ppl**, dominated by
  `Vanguard Target Ret <year> Inst`. That is its own queued item; refusing it only
  here would make two siblings of ONE registrant disagree.
  **MY FIRST RESIDUE SCREEN WAS 2.5x TOO BIG BY ITS OWN FALSE POSITIVE: `S&P`
  norms to `s p` and my hand-rolled class list contained `s`** — the `a`/`an`/`as`
  trap in a fourth place — so the shipped figure counts LEFTOVER TOKENS against the
  series' own words. **Do not carry the handoff's "about 88" forward.**
  **NOT DONE, each with its measured reason:** the **EAFE family is not widened
  to** (308 + 316 rows resolve to nothing because that series is **genuinely absent
  from the registry** — a separate unsized item, not an entity defect);
  **`merge-4i`'s own `secWords` witness still carries `amp`/`reg`** and is left
  alone because **0 published rows have an adjacent pair that would JOIN to
  either**; and **`&#153;` plus the PFG half of `&reg;` are LATENT and pinned as
  such** — instrumented, the bucket IS reached and the filed name IS a superset,
  and the **MANAGER GATE** refuses them because `ershares` / `pfg jpmorgan` are
  `managerPhrase(SERIES)` keys that `filedMgrs` can never hold (the 2026-10-01
  09:4xZ defect in a family `houseLeads` does not qualify). *A repair whose key
  lands and whose gate refuses is latent, not shipped.* The `&reg;` half is not
  wholly latent — `Mutual Fund Return Stacked … Class A` → RDMAX is pinned.
  **SECOND-ORDER EFFECT MEASURED, because the witnesses are built from the same
  strings: `idx.words` loses EXACTLY `reg` and `amp` and nothing else**; managers
  503, houseLeads 234, byTicker 29,168 unchanged.
  **GATES:** `--selftest` **187/187 with 16 new pins, added BECAUSE NOT ONE of the
  134 existing cases reaches the arm** (zero carry an entity, zero expect an
  affected answer); **`--nodecode` fails BY NAME ON EXACTLY 9 AND IN BOTH
  DIRECTIONS** — 8 must-resolves return to `—` and `iShares S&amp;amp;P 500 Index
  Fund Class K` **resolved to WFSPX in the before state**, which the shipped
  single-pass decode refuses; **every existing control's count is IDENTICAL at
  HEAD** (nolead 2, nocorrob 3, noword 2, notrail 2/2, nohouse 3, nophrase 4,
  nowitness 1, nofloor 1, faithless 1, takecomparable 1), so 171 → 187 is exactly
  the new pins. parser-gate, smoke, fund-er-test 83/26/19/18/28, merge-name-test
  20/20 and `lib-disclose --selftest` 25/25 all green. The control uses a **drop
  flag the function reads** (the `GATE_DROP` precedent) and **REBUILDS the index**
  under it, because dropping it only on the filed side would leave the repaired
  keys in place and the control could not fail on the registry half.
  **DATA IN THE SAME COMMIT AS THE CODE** (#528's precedent), the real merge's
  whole effect attributed field by field: **`row.stk` on 1,919 rows and NOTHING
  ELSE** — 0 acks added or removed, 0 row-count changes, 1,730,535 rows both sides,
  and `lineups-status`, `lineups-index`, `plans-index` and `plans-all` all
  identical once `generated` is removed.
  **REPORT path only as a GUARANTEE FROM THE IMPORT LIST:** `build-seo-pages.mjs`
  imports `lib-quote`, `lib-disclose` and `lib-4i` and **reads no `stk`, no `ftk`
  and no `fund-er.js`** — 0 matching references; regenerating all 5,000 pages
  leaves `git diff --stat p/` empty, which corroborates rather than constitutes it.
  **PRE-REGISTERED for #542 — VERDICTED AND MIRRORED, see the 03:2xZ bullet
  above; dispatched 02:30Z on `a6dd5be9` (not the 03:0xZ this line first said —
  the run record settles it) and observed `in_progress` (the push fired
  `site-test` #139 on the exact commit but NOT build-data — the documented
  intermittent trigger, handled by dispatching):** the merge log prints
  **`sec tickers: 479546 rows across 48104 plans (113848 on a blank type cell)`**
  — all three read off the local merge, and **the plan count is the merge's own
  measured number rather than 47,915 + 189, because set membership saturates**;
  `filed tickers` **2,166 / 75** and `filed tickers (trailing parenthetical)`
  **657 / 53** unchanged (the handoff said 658 and the merge prints 657);
  CONFIDENCE DIFF **+0 / −0**, rows-dropped **0**; confident **60,170**, lineups
  59,822, entries 65,479, **HIGH 4** (3 `contrib` + `fabricated-name`), warn
  **556**, overshoot 372, overshootTrust 12, aggRow 113, dl 19, pv 196 at **100%**.
  **AND I REGISTERED `tkExact` AS UNABLE TO MOVE AND THE MEASUREMENT REFUTED IT
  BEFORE THE DISPATCH: it is 37.2 → `37.32`.** The argument was that 1,550 cells
  against 1.72M rows cannot shift the figure — but the audit prints it to TWO
  decimals (`toFixed(2)`), so a 0.09% population moves it by 0.12. ***An argument
  that a figure cannot move is still a prediction and has to be run*** — the
  stronger claim is only stronger when it is true. **So `tkExact` 37.32 is
  REGISTERED AS A MEASURED VALUE.**
  **`tkComparable` 3.27 and `tkShare` 24.47 DO hold, and `tkShare`'s reason is
  the structural one: `audit-data`'s own comment records that it calls
  `fundTickerInfo` with ONE argument, so it cannot read the stored `stk` at all.**
  No comparable answer is ever stored, so `tkComparable` cannot move either.
  `ticker-conflict` holds at **3**, #541's three named survivors.
  **No fee, asterisk or shown type can move: `fundER` is called on the NAME and
  never on a symbol**, measured at 0 through the page's own render.
  `docs/accuracy-log.md` 2026-10-02 (03:0xZ).
- **SHIPPED 2026-10-02 05:5xZ, `[skip ci]` — THE STRIP AND THE PRICER DISAGREED
  ABOUT ONE ABBREVIATION, SO THE CONTRACT GATE REFUSED 24 ROWS IT WAS WRITTEN
  FOR: 10 plans / 145,237 participants / $1,087,454,960, every one at 0.35.**
  `annuityFeeIsGuaranteeOnly` removes the words `fund-er.js` prices a guarantee
  on and asks the SAME table again, so the two patterns are halves of one rule
  in two files — and **the two sets are not nested in either direction**: the
  strip's `\bsa?gic\b` is {sgic, sagic} and the pricer's `\b(?:sa)?gic\b` is
  {gic, sagic}. So on `GIC METLIFE CONTRACT #GAC 32226` ($280,882,048) the
  strip leaves `GIC`, the remainder prices, and the gate's second condition is
  false. Found by the **C2 negative control** of the 05:1xZ ship — *a control
  per condition pays twice, once as a gate and once as a defect finder.*
  **THE HANDOFF'S BLOCKER WAS A PREDICTION AND IT PRICED AT ZERO.** It read
  *widening the shared constant moves the TYPE rule across its whole 2,915-row
  population*; **measured, it moves 0**, and structurally — across all
  **1,724,078** published rows only **TWO** reach `isInvestmentContractRow` and
  contain `gic`, both spelling it `SAGIC`, which the old arm already stripped,
  so the widening is the **identity** there; `mistypedStockFeeIsGuaranteeOnly`
  reaches **0** `gic` rows. **The other route was BUILT and diffed MEMBER BY
  MEMBER:** a fee-gate-local second strip gives 24 rows, **0 only in A, 0 only
  in B**. Same change by outcome, so the choice fell to prevention — and a
  third pattern for one concept is the defect, not the fix.
  **OUTCOME whole-store through the page's own render, exact superset pre-filter
  (raw, or raw despaced, contains `gic`) = 7,453 rows rendered twice:** fee
  **withdrawn 24**, gained 0, changed 0, all `0.35 → null`; **0 tickers, 0
  asterisks, 0 shown types**. The 114 rows condition 1 reaches here split 24
  newly withdrawn / **90 already publishing no fee**, and **0 publish a fee
  after the change**. All 23 distinct names read — MetLife, Pacific Life,
  Prudential, Metropolitan Tower, Transamerica Premier, Lincoln National,
  Jackson National, United of Omaha, Principal Life, Minnesota Life, each with
  its own contract number — **not one a registered fund, 0 publishing a
  ticker.**
  **20 OF THE 24 REACH A READER AND 4 CANNOT.** 13 rows are TRUST-held and are
  resolved through MEMBER PLANS (Corteva 24,519; Illinois Tool Works 27,157 +
  554), so the handoff's plan-keyed **7 plans / 93,007 ppl** reproduces exactly
  and is a FLOOR — *a count keyed on plans is blind to every trust row*, a
  seventh time. The other **4 rows / $205,305,328** sit in ack
  `20240930153047NAL0011507794003`, **confident, OCR'd, and referenced by no
  plan, no `mtiaAck` and absent from `mtias.json`** — no reader can fetch it.
  **SIDE FINDING, SIZED, NOT FIXED: 19 confident lineup entries / 261 rows /
  $8,386,319,789 are referenced by no plan and no plan's `mtiaAck`** and are
  stored-but-unreachable. The scan reproduces `confident` **60,170** exactly.
  **THE PREVENTION IS DERIVED, NOT TYPED, and it lives in `smoke-test.mjs`**
  because that is the one place both files load: (1) the FUND_ER entry is
  located by **BEHAVIOUR** — the one row of 159 whose pattern matches the bare
  word `guaranteed` — its alternatives expanded to 5 literal witnesses, each of
  which the strip must empty, **failing CLOSED** on any alternative the
  expander cannot reduce; (2) **and the strip must not reach inside a word**,
  asserted on the pattern against `strategic`/`logic`/`magic`, because it
  **cannot be pinned as a gate verdict** — every `strategic` row prices at null
  since the 2026-09-29 boundary fix, so the gate answers true for an unrelated
  reason. A typed probe list was refused: it is the vocabulary this gate already
  replaced once.
  **A NEGATIVE CONTROL PER CONDITION, each written out in full, each failing BY
  NAME on exactly its own cases, and the third is the argument for three:** the
  pre-change arm → **7 pins + the witness `gic`**; a bare `\bgic\b` → **1 pin
  (`SAGIC Group Annuity Contract 21016`) + the witness `sagic`**; dropping the
  leading `\b` → **0 pins, 0 cross-check witnesses, 6 boundary witnesses**.
  Each was also run through the REAL smoke test and failed there by name, and
  **drifting the app.js twin alone fails the tether on exactly 7 of 45** while
  the cross-check stays green.
  **8 NEW PINS (37 → 45), added BECAUSE NOT ONE of the 37 existing cases
  reaches the new arm and 0 of the 37 change verdict.** The one must-KEEP is
  **CRAFTED and said to be** — the live store holds no real fund wearing a GIC
  caption.
  **AND THE FIRST DRAFT OF THE CROSS-CHECK MEASURED THE HARNESS:** it selected
  the entry with `re instanceof RegExp`, and `fund-er.js` runs in a **vm context
  with its own intrinsics**, so that is FALSE for all 159 entries. It fails
  closed, so it would have broken the smoke test rather than passed quietly —
  ***a cross-context type test measures the context.***
  **TWO STALE JUSTIFICATIONS CORRECTED IN PLACE, and the second is the
  finding.** `lib-disclose`'s comment justified `sa?gic` by citing fund-er's
  missing leading boundary — true when written, **false since 2026-09-29, and
  the stale half is exactly where this gap sat**; and the `Stable Val` residual
  note stated the general fact (*the strip and the pricer disagree about an
  abbreviation*) and **priced it for one row**, while the same disagreement in
  the gic arm was costing 24. ***A defect described in general and priced in
  particular is a class nobody has counted.***
  **NOT DONE, with its reason: `Stable Val` remains (1 row / 537 ppl)** and is
  **not a pattern-level disagreement** — fund-er matches it through its own
  ABBREVIATION EXPANSION, invisible to any comparison of the two sources.
  **SURFACE: REPORT path only as a GUARANTEE FROM THE IMPORT LIST** —
  `build-seo-pages.mjs` has **0** references to `fund-er`, `fundER`, `fundERRow`,
  `fundTickerInfo`, `GUARANTEE_PRICED_WORDS` or `annuityFeeIsGuaranteeOnly`;
  regenerating all 5,000 pages leaves `git diff --stat p/` empty.
  **DISPLAY-SIDE: `PARSER_VERSION` stays 196, `lib-4i` untouched, no run, no
  store change — SO THERE IS NOTHING TO PRE-REGISTER.** The twin is a VERBATIM
  SLICE and was verified byte-present after regeneration. GATES:
  `lib-disclose --selftest` 25/25, parser-gate green (frozen tether 7/7), smoke
  green printing `strip/pricer cross-check: 5 witnesses`, fund-er-test
  83/26/19/18/28, merge-name-test 20/20 22/22 25/25 20/20 22/22 15/15.
  `docs/accuracy-log.md` 2026-10-02 (05:5xZ).
- **OWNER-GATED, SIZED, NOT SHIPPED 2026-10-02 06:4xZ — THE FILING STATES A SHARE
  CLASS THE REGISTRY REGISTERS UNDER THAT EXACT NAME AND THE PAGE PUBLISHES A
  DIFFERENT CLASS'S SYMBOL, AND ITS FEE: 5,929 rows / 4,837 plans / 11,144,696
  participants / $44,906,358,919, of which 5,916 ALSO PUBLISH THE OTHER CLASS'S
  FEE.** 594 distinct names, measured against the store at `601a7a67`.
  **FOUND BY INDEPENDENTLY CHECKING THE 05:5xZ DRAW RATHER THAN BY A SWEEP:** it
  reported Mohegan Tribe (7,703 ppl) publishing `Dodge & Cox Income X` → **DODIX
  at 0.41**, and `sec-funds.json` carries DODIX as **"Class I"** and DOXIX as
  **"Class X"** — exact, and that row is one of 1,409 like it. *A draw's job is
  to be checked.*
  **THE DECISION RULE NEEDS NO INFERENCE AND NO VOCABULARY OF ABBREVIATIONS,
  which is what separates it from the owner-gated items it resembles:** the filed
  name ENDS in a class word, the published symbol's own registered class is NOT
  that word, and **the SAME series registers a class under that exact name** —
  the 05:4xZ Institutional-Plus ship's own rule asked of every class marker
  instead of one. Buckets: X 2,505 rows, K 1,489, K6 1,073, R3 258, A 251, R4
  172, M 88, R 45, R2 36, I 9, C 2, Y 1. Pairs: DODIX→DOXIX 1,409, **SPAXX→FNBXX
  1,073** (the K6 family named six times), DODGX→DOXGX 783, FCNTX→FCNKX 366,
  **PTTRX→PTTAX 182**. Largest readers: Wells Fargo **248,225** (`Dodge & Cox
  Stock Class X` → DODGX at 0.51, $1,163,744,387), Whole Foods 123,250, Mayo
  Clinic 112,693, Nordstrom 109,402, **Ernst & Young 97,058 at 10.6% /
  $1,924,969,364**.
  **AND IT ERRS IN BOTH DIRECTIONS, WHICH IS STRONGER EVIDENCE THAN A ONE-SIDED
  BIAS AND CHANGES THE REMEDY:** X and K/K6 publish the EXPENSIVE base class for
  a holding the filing says is institutional; A and R do the reverse (`PIMCO Total
  Return Fund Class A` publishes **PTTRX**, so the fee is too LOW). No blanket
  direction is available.
  **MY SCREEN'S FALSE POSITIVES ARE NAMED: ~9 of 5,929 (0.15%)**, all in the
  single-letter buckets, which I read in full — the whole `C` bucket states
  *Institutional* with a footnote letter, the `Y` row states `Class I` at the
  front. **The honest limit: I read the single-letter buckets in full and the
  HEADS of X / K / K6 / R-n, not all 594 names** — well-screened, not fully read.
  **NOT SHIPPED on the standing rule: a session must not move 11.1M
  participants' ticker AND fee cells unasked.** Larger than the 2,767 rows /
  8,441,775 ppl Institutional→Admiral framing, and **unlike that one the fee is
  NOT class-blind** — DODIX 0.41 is not DOXIX's figure, so correcting the symbol
  alone leaves a correct symbol beside the wrong number.
  **RECOMMENDATION, owner's call: correct the SYMBOL on the exact-match
  population and WITHDRAW the fee rather than carry the other class's, with
  `fund-facts` filling the per-class figures as they are sourced — they compose.**
  **AND THE HARNESS TRAP, THIRD CYCLE RUNNING:** the first measurement rendered
  all 1,724,078 rows and did not finish; the predicate's own first condition is
  an EXACT pre-filter through the same `clean` the render calls, so the render is
  asked only of the hits. `docs/accuracy-log.md` 2026-10-02 (06:4xZ).
- **AND THE 05:5xZ SHIP WAS VERIFIED INDEPENDENTLY BEFORE ITS MIRROR, WITH TWO
  CORRECTIONS OF MY OWN AND ONE OF ITS WRITE-UP'S.** Every figure reproduced
  through a before/after render — withdrawn **24** / gained 0 / changed 0, all
  `0.35 → null`, **0 tickers, 0 asterisks, 0 shown types**, $1,087,454,960 across
  10 acks / 23 distinct names, reader reach **10 plans / 145,237 participants**,
  13 rows trust-held and resolved through MEMBER PLANS, 4 in an ack no plan
  references. **MY POSITIVE CONTROL WAS DECORATIVE AND IS NAMED RATHER THAN
  HIDDEN:** `fundER("GIC METLIFE CONTRACT #GAC 32226")` returns 0.35 on BOTH
  sides, correctly — the fee TABLE never changed, **the GATE did** — so *a control
  has to exercise the thing that moved*, and the render pair is what
  discriminated. **AND `DISCLOSE_PATH` IS READ, against that ship's own claim:**
  `apppath.mjs:81` is `await import(process.env.DISCLOSE_PATH || …)`, so the
  "read nowhere in the repo" statement is true of the REPO and false of the
  HARNESS — and it matters, because that commit changed `lib-disclose.mjs` too,
  so **a before side pinning only `APPJS_PATH` runs the NEW canonical suppressors
  and can report a false zero.** Pin both. **The 05:5xZ draw also understated its
  own best control: Walmart's wrapped family is 8 rows whole, not four** —
  `Russell 1000 Index Non-Lendable Fund` at **$15,822,151,755 = 28.1%** leading
  them, with **0** of v130's old fragments, on an ack v130 never saw.
- **THE FEE PRE-EMPTION RE-SIZED, SPLIT, AND THE FIRST DEFECT FOUND WAS IN MY
  OWN INSTRUMENT — QUEUED, NOT SHIPPED: 40,229 rows / 8,330 plans / 13,274,448
  participants / $130,863,488,196** publish a generic fee estimate where the
  issuer cell supplies a house-specific one. The class was recorded at **36,790
  / 7,510 / 11,443,967 / $115,117,759,657** (2026-10-01 02:0xZ). **THE GROWTH IS
  NOT ATTRIBUTED AND MUST NOT BE GUESSED** — a DOL refresh added 10,222 filings
  and moved the universe 111,782 → 112,652, v196 and v197 both changed what
  publishes, and ~15 display ships landed in between; the honest statement is
  that the class is larger and the cause of the difference is **unmeasured**.
  *A re-size is a new measurement, not a delta against a remembered one.*
  **MY FIRST SCREEN ASKED THE WRONG QUESTION AND A HAND PROBE CAUGHT IT, NOT A
  COUNT.** It asked *do the two `fundER` answers differ* and never *does the page
  SHOW the bare figure* — `{Northern Trust} S&P 500 Index Fund` renders **0.05,
  the ISSUER figure**, because `issuerPricedER` already wins there. One line
  (`if (o.er !== bare) continue;`) moved it **40,994 → 40,229**, cutting **385
  plans / 1,232,657 ppl / $38.1B** off the loose count. ***A screen for "the two
  answers differ" is not a screen for "the wrong one wins."***
  **DIRECTION ERRS BOTH WAYS, which is stronger than a one-sided bias: issuer
  HIGHER on 8,723 and LOWER on 31,506.**
  **THE SPLIT NEEDS NO VOCABULARY — ask whether the BARE NAME already names a
  fund:** (A) it does, **1,611 rows / 210 plans / 409,845 ppl / $10.4B**;
  (B) it does not, **38,618 / 8,144 / 12,879,857 / $120.5B**.
  **AND MY (A) LABEL WAS REFUTED BY ITS OWN OUTPUT.** I labelled (A) *"correcting
  would INTRODUCE an error"*, and its most frequent member is `{Vanguard
  Fiduciary Trust Company} Vanguard Target Retirement 2025 Fund 0.08 → 0.045
  [VTTVX]` ×20 with nine sibling vintages — the issuer being Vanguard's own
  **TRUST COMPANY**, so where the row really is a collective trust 0.045 is right
  and 0.08 is the mutual fund's. **ASKED THE FILING'S OWN WITNESS, THE TYPE
  CELL** (772 `Mutual fund`, 551 blank, 202 `Collective trust`, 65 `Pooled
  separate account`, 21 `Cash / short-term`): **(A1) the type names a POOLED
  vehicle so the ISSUER rate is better — 267 rows / 35 plans / 261,408 ppl**, and
  **(A2) genuinely contested — 1,344 / 175 / 148,437, of which 1,030 are ALREADY
  ASTERISKED**, leaving **314 rows asserting a contested figure unlabelled.**
  **AND (B) IS NOT UNIFORM: 2 rows / 2 plans / 400,628 ppl are the clearest
  wrong-direction shape and carry the largest reader population in the whole
  split** — `{T. Rowe Price} Mid Cap Value Index Fund` **0.1 → 0.65** at Express
  Services (400,441 ppl), T. Rowe's **ACTIVE** fund priced onto a name saying
  **Index**, and `{T Rowe Price} Index K Retirement 2035 I` 0.1 → 0.58 at
  Firstbank. ***A row count is the wrong axis for a reader-facing risk.***
  **SPEED — THE EXACT-PRE-FILTER RULE ONE LEVEL DEEPER THAN THIS RECORD APPLIES
  IT:** the first pass rendered all **539,038** issuer-bearing rows (~20 min),
  but the two `fundER` calls need no render, so the render is asked only of the
  **43,526 disagreements** — twelvefold, and every later pass ran in minutes. The
  pre-filter belongs **inside the condition list**, between a cheap condition and
  an expensive one, not only at the first condition.
  **STILL NOT SHIPPED on unchanged blockers:** 13.3M fee cells is larger than any
  fee change on this record, the **7,116 distinct (issuer, name) pairs are
  unread**, and the families whose correct answer is BLANK are open — one sized
  below. `docs/accuracy-log.md` 2026-10-02 (09:4xZ).
- **AND FAMILY (1) OF THOSE BLOCKERS SURVIVED ITS OWN FIX AS A WORDING GAP, NOT
  A COLUMN GAP — MY CONTROL REFUTED MY PREMISE: 61 rows / 61 plans / 50,024
  participants / $123,676,563 publish a fee for a bank deposit program that
  charges none.** `isBankDepositRow` shipped 2026-10-01 01:5xZ withdrawing 105
  rows. **I asserted the residue was a COLUMN gap — the bank in the ISSUER cell
  where the predicate reads the NAME — and wrote a positive control for it; the
  control printed `isBankDepositRow("Schwab Bank Savings") = false`.**
  `BANK_DEPOSIT_NAME` is `\bdeposit\s+acc(?:oun)?ts?\b|\bbank\s+deposit\b`, which
  `Schwab Bank Savings` matches on **neither column** — so it is *a fix for one
  WORDING of a class is not a fix for the class*, and the screen built on my
  premise reads 3 rows, measuring the premise.
  **AND THE 01:5xZ ENTRY'S OWN COMMENT RECORDS HOW THE WORDING WAS LOST: the
  vocabulary was CUT FROM FOUR ARMS TO TWO** because two *"reach 0 rows in the
  store"*. That pruning was right about those arms and asked them **against the
  names the gate already reached**, so it could never see a wording outside all
  four. ***A per-arm control measures the arms against the population the gate
  already has, not against the class*** — the *a count keyed on a vocabulary
  measures the vocabulary* shape, met for the first time in the PRUNING
  direction.
  **DO NOT CARRY 1,646 ROWS OR 1,255,820 PPL FORWARD:** a generous
  `bank|savings|sweep|fdic|deposit` screen reads that, and **1,585 of them are
  the word `bank` inside a TRUSTEE's name** (`{Charles Schwab Trust Bank} Schwab
  S&P 500 Index Fund`, `{Capital Bank and Trust Company} American Funds 2030
  Target Date Retirement Fund`) — the trustee-vs-house trap, and why `bank` can
  never be the rule. **THE CORE, the string naming a deposit or sweep PROGRAM:
  61 rows, 22 distinct pairs, ALL 22 READ and NOT ONE a registered fund**; 55
  publish **0.2** (the generic money-market fallback) and 6 publish 0.26; **0
  publish a ticker**, so app.js's `!tk` costs nothing. Essentially ONE program —
  Charles Schwab Bank Savings in 21 of 22 spellings (`{SCHWAB BANK SAVINGS}
  Money Market / Cash Equivalent` alone is 36 rows) plus one `{DB&T FDIC-Insured
  Investment Account}`. **And one member misspells the vocabulary word itself —
  `Money Market Depsoit Account`**, reached only through the `fdic` arm in its
  issuer cell: a transposition defeating a vocabulary inside the class whose fix
  WAS a vocabulary, hours after v197 shipped a transposition test for that
  reason. A deposit charges no fund expenses, so the harm is a FABRICATED number
  and the remedy is the shipped one widened past one wording. Display-side.
- **AND MY OWN ESTIMATE OF #544 WAS LOW BY NINETY MINUTES, while the judgement
  attached to it holds.** At 08:2xZ I recorded *"expected finish ~08:30Z plus the
  merge"* from two finished shards. At 09:4xZ: **13 of 20 shards `success`, 7
  still inside `Parse filings`**, the longest FINISHED shard having run **3h08m**
  (shard 14, 06:12:10 → 09:20:03) and the seven live ones past 3h30m. Healthy,
  do not re-dispatch — and the **job list is still the only thing carrying that**:
  the run-level `updated_at` has read `06:11:46Z` for three and a half hours.
  *An estimate from the first two members of a twenty-member population is a
  ranked sample, and the rule about ranked samples is already on this record.*
- **THE 08:2xZ DRAW FOUND A WHOLE FUND FAMILY PUBLISHING NO SYMBOL BESIDE 17,665
  SIBLINGS THAT DO — QUEUED, SIZED, SPLIT BY PROBE INTO TWO MECHANISMS, NOT
  SHIPPED: 1,008 published rows / 161 plans / 699,584 participants /
  $13,917,833,776.** Seed 20261002082, pool **60,170 published lineups / 60,151
  with a reader / 103,489,995 ppl**. **Dave & Buster's (42,611 ppl, 27 rows @
  0.965)** and **Lowe's (289,398 ppl, 25 rows @ 0.988)**, both largely clean, and
  Lowe's twelve asterisked Vanguard target-date TRUST rows are the 2026-09-21
  demotion visibly working. Whole-store, Vanguard house + an abbreviated family
  word + a vintage: **18,673 rows / 2,051 plans / 5,107,915 ppl**, of which
  **17,665 publish a symbol** (3,988 asterisked, 13,677 asserted) and **1,008
  publish none**; 590 distinct names, **66 of the blanks still publish a FEE**.
  **(A) AN ABBREVIATION REACH FAILURE, the repaired name resolves:** `Vangrd Trgt
  Retire 2055 Fd` → nothing against `Vanguard Target Retirement 2055 Fund` →
  **VFFVX\***; `Vanguard Institutional TR 2060` → **VTTSX\*** repaired; same for
  `Vangrd Trgt Retire Inc Fd`, `VANGUARD TGT RETIREM'T INCOME`, `Vanguard Tar Ret
  2070 Tr I`, `Vangrd Trgt Rtire 2040 Trst II`. One recordkeeper template,
  `Vangrd Trgt Retire <year> Fd`, is ~250 rows.
  **(B) A CLASS DESIGNATION INFIXED BETWEEN THE FAMILY WORDS AND THE VINTAGE, and
  here the repaired name does NOT resolve, which is what makes it a separate
  item:** `Vanguard Target Retire Trust Plus 2040` → nothing **and the fully
  spelled `Vanguard Target Retirement Trust Plus 2040` → nothing too**, while
  `Vanguard Target Retirement 2040` → VFORX\* and Lowe's `Vanguard Target
  Retirement 2035 Trust A` → VTTHX\*. The table wants the vintage ADJACENT to the
  family. **This half is the money** — JetBlue's four rows at $404,046,506 /
  $366,362,083 / $346,378,523 / $314,890,205 (7.7–6.0% of its menu), Ferguson's
  four, Relx's three. **v532's shape one POSITION along** (that ship rotated a
  class off the FRONT; this one sits in the MIDDLE) — *a fix for one position of a
  class is not a fix for the class*, a fifth surface.
  **THE REMEDY IS SETTLED HERE WHERE IT WAS REFUSED ELSEWHERE, BY THE TYPE CELL:**
  the asterisked labelled comparable is CORRECT, because the footnote asserts the
  holding is a collective trust with no ticker and no published ER — **true of
  every one of these rows, all typed `Collective trust`** — which is exactly the
  route REFUSED at 23:2xZ for the Institutional→Admiral item, where that claim was
  FALSE of registered mutual funds. ***The same remedy is right for one class and
  wrong for its neighbour, and the type cell decides.***
  **TWO CORRECTIONS OF MY OWN, both caught by a control before publication.**
  **(1) DO NOT CARRY 1,191 ROWS OR 619,546 PPL FORWARD** — a bounded `TR` +
  vintage reads 1,191 rows of which **1,191 resolve to nothing**, and in a store
  where 37.3% of rows carry an exact ticker **a 0% resolution rate is the tell,
  not the size**: `Tr` is overwhelmingly **TRUST** (`T Rowe Price Ret Blend Slct Tr
  2030 Cl 5`, `Voya Trgt Solution Tr: 2030 8`, `STATE ST TR 2050 K`), collective
  trusts with no registered symbol BY DESIGN. ***`Tr` abbreviates TRUST before it
  abbreviates Target Retirement*** — the `nt `/`INST+`/`Trust Class` trap a fourth
  time. **(2) I read `Retire` as the truncation and the probe refuted it:
  `Vanguard Target Retire 2040` ALREADY resolves to VFORX\***, so the blocker was
  the infixed class one token from where I was looking.
  **ALSO LIVE, all queued:** Lowe's `SEI Trust Company` **$17,720,978** typed
  `Collective trust` — the bare-house class with a named 289,398-reader instance;
  Dave & Buster's `Vanguard Equity Inc` at **0.17 with no symbol**, `PIMCO Income
  A` at 0.51 with no symbol, `JVMRX` and `AVPAX` each a symbol with no fee, and
  four rows resolving to nothing. Two guards visibly working: Putnam Stable Value
  publishes no fee, and SPAXX prices at **0.42**, its real gross figure.
  `docs/accuracy-log.md` 2026-10-02 (08:4xZ).
- **#544 IS HEALTHY AT 08:2xZ AND ITS RUN RECORD SAYS NOTHING EITHER WAY — A
  STALE `updated_at` IS NOT EVIDENCE OF A STALL.** The run-level field has read
  **`06:11:46Z` for two hours**, which reads exactly like a hung job; the JOB
  LIST settles it — **prep `success`, 20 parse shards, `parse (19)` success at
  08:07:51Z and `parse (16)` at 08:12:06Z after ~2h each, the other 18 still
  inside their `Parse filings` step.** Prep sized **20 shards, which is the
  cap**, so `max(work/5500, ocr/600)` saturated on the OCR term and this is the
  record's own **~3h OCR-heavy case, not the ~1.5h one** — expected finish
  ~08:30Z plus the merge. **The complement of the recorded rule that a run's
  STATUS lags its cancellation: a run's `updated_at` lags its progress, and only
  the job list carries either.** Do not re-dispatch, do not poll — the merge
  runs under `if: always()` and a later cycle takes the verdict.
  **AND THE VERDICT MUST COVER TWO COMMITS, NOT ONE.** `45eb462f` (the OCR
  `!`-glyph repair, `[skip ci]`, PARSER_VERSION unchanged at 197) is on the
  branch, and **merge-4i checks out the LATEST branch state**, so #544's merge
  will run that file — the mechanism recorded for `tkShare` on #514. Its own
  pre-registration is `name` on **393 rows / 280 entries**, `stk` **+28 / −0 /
  0 changed**, and nothing else; reader gains 46 tickers / 31 fees / 9 asterisks
  / 2 typings across 280 plans / 365,305 ppl. **Register the SUM of the two, not
  each in turn** — the 00:3xZ/#541 lesson about two reporting changes queueing
  behind one run.
- **THE 11:5xZ DRAW FOUND #545's OWN FIX ONE COLUMN SHORT, AND THE TWO CANDIDATE
  EVIDENCE SOURCES DISAGREE IN A WAY THAT DECIDES THE DESIGN — QUEUED, SIZED,
  NOT SHIPPED: 188 rows / 52 entries / 52 plans / 119,370 participants /
  $1,585,923,998 publish a FIRM whose name has lost a space.** Seed 20261002114,
  pool **59,378 published plans / 100,067,338 ppl**. **Gehl Foods (1,110 ppl, 26
  rows @ 0.984)** reads clean and publishes `Enter N Fund` with issuer
  **`JanusHenderson`** — the same damage `weldRepair` repairs in the NAME column,
  standing in the ISSUER column, which that arm never reads. *A fix for one
  COLUMN is not a fix for the class*, and it matters beyond honesty because
  **`lookupTicker` PREPENDS the issuer**, so damaged issuer text can block a
  match the repaired form would make.
  **30 distinct transformations, every one a real firm:** `John HancockLife
  Insurance Company` 36 + 32, `T. RowePrice` 19, `OppenheimerFunds` 17,
  `StateStreet Global Advisors` 15, `AmericanFunds` 10, `JanusHenderson` 6,
  `GoldmanSachs` 5, `GreatGray Trust Company` 4, `WilmingtonTrust` 3.
  **THE DESIGN CONSTRAINT IS MEASURED AND IT IS THE FINDING: the attestation
  evidence must come from the COLUMN BEING REPAIRED.** Asked with the NAME
  column's maps — which is what the shipped arm holds — the same function reads
  **827 rows / 697,199 ppl, and 668 of those are `AllianceBernstein` →
  `Alliance Bernstein`**, the one wrong repair #545 names as its cost,
  **amplified 42-fold.** The issuer column's own evidence does not reach it at
  all. ***Do not carry 827 or 697,199 forward.***
  **ALSO NAMED: the arm repairs ONE SEAM PER CALL**, so `TRowePrice` → `TRowe
  Price` (12 rows) and `T.RowePrice` → `T.Rowe Price` (2) are half-repairs and
  need a loop or a second pass; and the issuer strip's own standalone test is the
  natural second witness here, since `stripIssuerLead` already measures what
  stands alone as a COMPLETE issuer.
  **MERGE-SIDE, so it waits on #545 — and when it ships, register the SUM** of
  whatever else is queued behind the same merge, not each in turn (the #541
  lesson).
  **AND THE SECOND DRAW PUTS A LOAN ASSET IN FRONT OF 262,794 READERS: The
  Kroger Co. (262,794 ppl, trust-held, 8 rows) publishes `Other United States -
  USD &&&KROGER LOAN ASSET` at 2.2% / $142,816,695 as a holding.** The other
  seven rows are the trust's own unitised sleeves (`MFO KROGER US LARGE CAP UNIT
  S` 43.1%), correct with no registered symbol by design. **Every loan predicate
  is anchored on the name BEGINNING with the loan words** — the anchor that keeps
  `Bank Loan Fund` safe — so a name beginning `Other United States - USD` is
  outside all of them BY CONSTRUCTION, the shape recorded on 2026-10-01 at
  11:4xZ met in a third position. Sized at 1 row here; the class is unmeasured.
  **FOUR QUEUED ITEMS HAVE NAMED LIVE INSTANCES IN GEHL'S ONE MENU:** `500 Index
  Fund` [iss `Fidelity`] publishes **0.03 where the issuer figure is 0.015** —
  the fee pre-emption's own largest named member, 1,092 rows, in front of a
  reader; `Total International Stock Index Fund` [iss `Fidelity`] publishes **a
  fee of 0.06 and NO ticker** (the 314,299-row asymmetry); `Growth R6 Fund` and
  `Total Return Bond Fund` carry **no issuer at all** and resolve to nothing; and
  `Lifetime Hybrid 2070 Fund` has a **BLANK type cell beside twelve siblings
  typed `Collective trust`**, a filer-level inconsistency and benign. Two shipped
  guards visibly working: all twelve Principal collective-trust vintages publish
  no fee and no ticker, and `Stable Value Z Fund` publishes no fee.
  `docs/accuracy-log.md` 2026-10-02 (11:5xZ).
- **IN FLIGHT: #545, fired from the push on `07b304ca` and observed `in_progress`
  — v529's GUARD PORTED BACK INTO `weldRepair`, WHICH REPAIRS A REGRESSION OF MY
  OWN FROM #544: 488 rows / 329 lineup entries / 329 plans / 286,318
  participants / $696,610,357, stored `stk` +110 / −0 / 0, display ticker +58 /
  −0 / 0, fee +284 / −0 / 39 changed and 0 LOST, asterisks +20 / −0.**
  `weldRepair` refused `EquityIncome Adm` because `cnt("EquityIncome") = 3` and
  its ceiling cuts at `> 2` — **refused by ONE occurrence, and all three
  occurrences feeding that ceiling are DAMAGE**: this row, `Fidelity VIP
  EquityIncome Fund`, and an all-caps address weld. That row then lost an SEC
  ticker on #544, which I had registered as −0.
  **IT IS v529's OWN RECORDED FINDING MET IN THE ARM v529 DID NOT FIX.** Its
  comment fifty lines below says the ceiling *"CANNOT TRANSFER"* to the all-caps
  arm because *a ceiling that reads repetition as evidence of correctness is fed
  by repeated damage*, and it built a RATIO between two WHOLE NAMES plus an
  INDEPENDENT REGISTRY WITNESS instead. **Both belong here too: the witness
  protects a CamelCase house name by evidence OUTSIDE this store, where a ceiling
  protects it by its own frequency and can therefore be bought off by damage.**
  **SHIPPED AS A DISJUNCTION so it is STRICTLY ADDITIVE — 0 rows
  repaired-only-before over all 1,724,201 confident rows — AND THAT DISJUNCT IS
  SUBSUMED ON THIS STORE (0 repairs lost across all 415,221 distinct published
  names), so it is LABELLED AS SUCH rather than carried as reassurance**, with
  the test asserting the 0 so a later store that makes it load-bearing surfaces
  as a surprise. It is **not** subsumed structurally: a repaired name attested
  exactly 3 beside a damaged one attested 1 satisfies `w >= 3` and fails
  `w > joined * 3`.
  **THE WITNESS ASKS CONTAINMENT, NOT EQUALITY, and only the OUTCOME TEST could
  show that:** the naive substitution LOST PCRIX on 3 rows, because `realreturn`
  is not a registry word while the registry spells the series
  `CommodityRealReturn` — ***the damaged token can be a proper SUBSTRING of a
  registry word.*** It also lost VSGAX on 2 rows where the ratio is stricter than
  the old floor, which the disjunction removes by construction. Reading 270
  transformations caught neither.
  **AND MY FIRST MEASUREMENT OF THIS CHANGE WAS MEASURING ITSELF — DO NOT CARRY
  1,153 ROWS OR 775,449 PPL FORWARD.** It RESTATED the predicate instead of
  slicing it: `merge-4i`'s own `nk` is **`trim().toLowerCase()`**, not the
  punctuation-normalising version I wrote, and its SEAM is
  `/\b[A-Za-z]{3,}[a-z][A-Z][a-z]{2,}[A-Za-z]*\b/g`, far tighter than mine — so
  `NewWorld` cannot match it at all and the 466-row `American Funds NewWorld R6`
  family I had counted as the headline **is not reachable by this arm**.
  ***The restatement was caught by its own pins: three cases written off those
  numbers FAILED against the shipped function.*** Redone by slicing the block out
  of BOTH refs and running the shipped bodies, with the two sides asserted to
  disagree on the motivating row.
  **COST NAMED: 16 rows across four strings split `AllianceBernstein`**, whose
  official spelling is one word and which no registry word contains. 0 tickers,
  0 fees and 0 asterisks move on them, and **the store's own filers write it
  spaced 72 times against joined 14**, so the row ends up agreeing with the
  majority filed spelling. Three further rows move a fee toward the GENERIC
  estimate (`Federal MoneyMarket Investor` 0.11 → 0.2, two `… IndexFund` rows
  0.05 → 0.1), **both in the OVERSTATING direction.** All 270 distinct
  transformations read; nothing else destroys a real name.
  **AND THE EXISTING DRIFT CONTROL WENT DECORATIVE THE MOMENT `weldRepair` GREW A
  DISJUNCTION.** Its target string moved, `String.replace` silently did nothing,
  and the harness printed *"disagrees on 0 of 20"* **as though that were a
  result** — the failure this record has paid for four times, here caused by my
  own edit. It is ASSERTED now and fails on 15 of 27. **7 new pins (20 → 27),
  added because NOT ONE of the 20 existing cases reaches the widened disjunct** —
  every must-REPAIR there is accepted by the shipped rule and every must-KEEP
  refused by a condition the ratio also refuses, **so the whole arm could have
  been inert and that table would still have read 20/20.**
  A negative control PER CONDITION, each asserted to have landed and each failing
  BY NAME on exactly its own cases (6 / 1 / 1 / 1). parser-gate green (frozen
  tether 7/7), smoke green, fund-er-test 83/26/19/18/28, `lib-disclose
  --selftest` 25/25.
  **MERGE-SIDE, no `PARSER_VERSION` bump (197), so the work list stays the 40
  stale acks. PRE-REGISTERED:** the merge log prints **`lost-space repair: 489
  rows across 329 plans`** (HEAD's arm reads 1 row / 1 plan on this
  already-repaired store, which is the right before-value and not a stall);
  **`sec tickers: 479691 rows across 48109 plans (113870 on a blank type cell)`**
  — rows **+85** and plans **+0, DERIVED from measured set membership rather than
  summed** (the #531 lesson: a row delta is additive, a plan count SATURATES);
  CONFIDENCE DIFF **+0 / −0** and `rows-dropped` **0**, because this renames and
  never drops a row or moves a sum; confident **60,167**, lineups 59,819, entries
  65,480, **HIGH 4** (3 `contrib` + `fabricated-name`), warn 556, overshoot 372,
  overshootTrust 12, aggRow 114, dl 39, pv 197 at ~100%; `tkExact` **37.32 at
  most +0.01** (58 display gains against 1.72M rows, and `audit-data` calls
  `fundTickerInfo` with ONE argument so the stored `stk` cannot move it),
  `tkComparable` 3.27, `tkShare` phase.
  `docs/accuracy-log.md` 2026-10-02 (11:4xZ).
- **#544 RAN `success` AND IS MIRRORED — 2026-10-02 10:5xZ (`96d93309 → 8e66338a`),
  GIT CHECK UNFORCED, `--force-data` OVER FOUR WITHDRAWALS THE GATE NAMES AS
  EXACTLY THE PRE-REGISTERED SET. STORE COMPLETE: pv 197 covers 69,006 of 69,046
  (99.9%), fetch failures 39 (0.06%), reader failures 1.** The designed outcome
  passed to the digit: `== FABRICATED-HOLDING SHAPES` reads **0 dominant
  non-fund** — the figure that only exists because v197 repaired
  `audit-data.mjs:462`, so **the run's own audit watched the four withdrawals it
  exists to watch** — beside **255 generic-named** against the registered 257.
  `warn` **556**, `overshoot` **372**, `overshootTrust` 12, and **`tkExact`
  37.32 / `tkComparable` 3.27 held EXACTLY**, which were registered as
  structurally unable to move rather than inside a tolerance: the stronger claim
  was the true one.
  **THE CEILING HELD AND THE NAMED SET DID NOT, WHICH IS A MISS AND IS REPORTED
  AS ONE.** `confident` **60,170 → 60,167, net −3** against a registered ceiling
  of −4 at most / +0 — but the registration also NAMED every loss, and the run
  produced **6 losses and 3 gains**. The four named ones all landed and the
  mirror gate names precisely them (The Eby Group 2,054, Ortho Benefits 570,
  Skico 499, Electromed 250). *A ceiling met by a different set is not a pass*,
  so all nine were read before the override.
  **THE TWO UNNAMED LOSSES ARE CORRECT WITHDRAWALS REACHED BY A DIFFERENT
  MECHANISM: 3,069 participants stop being shown an asset-class statement as a
  menu.** Central Hudson Gas & Electric (1,600) and Advantagecare Physicians
  (1,469) both moved OFF a `fb=2023` fallback onto their newest filing's region
  at ratio **2.815** and **2.682**, refused by the ratio guard — and neither
  before-state named a single fund, Advantagecare's two largest rows carrying the
  **identical $128,422,645**, a double render.
  **THE THREE UNREGISTERED GAINS WERE READ TOO, because a gain is a claim about a
  filing** (the 2026-09-29 lesson that 80% of one run's gains were menus that are
  not menus): Coastal Pediatric Associates (206 ppl, **32 real American
  Funds/Fidelity rows @ 1.018**), Horizon Roofing (217, 18 real Empower/Invesco
  rows @ 0.879), Elevator Constructors Local 1 (4,276, 92 rows @ 0.849, largely
  real with one junk `REPORTING INSTRUCTIONS` row at $25,579,723).
  **ALL FIVE UNREGISTERED MOVEMENTS ARE ONE MECHANISM IN BOTH DIRECTIONS — every
  one carries `fb=2023`.** A version that changes which regions are CONTESTED
  moves plans off and onto prior-year fallbacks, and `fallbacks.json` is
  artifact-only, so **no whole-store scan can predict either direction.** That is
  precisely why the registration was a ceiling plus a named set; what this run
  shows is that the ceiling is the half that survives and **the named set should
  have been registered as "the losses I can see from the store", not as "the
  losses".**
  **`dl` 19 → 39 AND THE CODE IS EXONERATED BY MEASUREMENT: all 20 newly-failed
  acks HEAD-probed — the whole population, not a sample — and 20 of 20 answered
  403.** The **fourth unanimous run** of the #244/#246 discriminating test
  (68/68, 78/78, 23/23, now 20/20), so `e=download` is still an honest published
  claim and the EFAST2 bucket simply grew. All 20 read `pv196→196`, so they were
  never re-parsed, and **14 keep their confident stored lineup** under the v37
  protection — nothing is lost, nothing is refreshed.
  **HIGH 4 → 10 IS AT BASELINE AND THE ARITHMETIC IS EXACT: the local audit on
  #544's own store reads `HIGH (4)` = 3 `contrib` + `fabricated-name`, and CI's
  10 is that 4 plus SIX self-clearing `reparse-loss` entries — one per confidence
  loss** — raised from `losses-triage.txt`, a run ARTIFACT that exists only in
  CI. 4 + 6 = 10. *A metric that differs between CI and local is a question about
  the inputs, not the store*, and this is the first instance where the CI-only
  count IS the loss count, which makes it a reconciliation rather than a puzzle.
  **AND `aggRow` 113 → 114 IS NOT A SECOND EVENT — IT RECONCILES TO THE PERSON TO
  ONE OF THE THREE GAINS.** `aggRowPpl` rose by exactly **4,276**, Elevator
  Constructors' own participant count, and that plan publishes **`Managed account
  holdings (699 positions)` at 54.2% / $785,288,188** of its 92-row menu. So the
  movement is a CAVEAT ON A GAIN rather than a finding — under the 120 baseline,
  so WARN. ***An unregistered figure that reconciles exactly to one you did
  register is the same event counted twice.*** `entries` 65,479 → 65,480 is the
  one new status entry; `match` +4, `vesting` +5, `roth` +5, `matchQuote` +1 are
  the gained plans' features; and **`tkShare` 24.47 → 24.48 with `tkSampled`
  87,070 → 87,067 is SAMPLING PHASE**, the recorded mechanism — the audit samples
  every 20th row by position and three fewer rows re-phases the whole sample.
  **THE SECOND COMMIT'S REGISTRATION MISSED IN THE ONE DIRECTION THAT MATTERS AND
  THE MISS IS A REGRESSION: `stk` +28 / −2 / 0 CHANGED, where −0 was
  registered.** `45eb462f` (the OCR `!`-glyph repair, `[skip ci]`,
  `PARSER_VERSION` unchanged) rode this run because merge-4i checks out the
  LATEST branch state; its `name` figure came in **406 rows / 291 entries against
  the registered 393 / 280**, direction good and every sample a correct `!`-glyph
  repair. **But two rows LOST an SEC ticker — 489 ppl / $226,833 — and both are
  the OPPOSITE of the shape I predicted.** I expected the 03:0xZ "two wrongs made
  a right" case, a REPAIRED name losing a ticker the DAMAGED name had matched.
  These are clean, correct, resolving names that got **damaged**: `Vanguard
  Equity Income Adm` → `Vanguard EquityIncome Adm`, and `… Ultra Short Term Bond
  Admiral` → `… Admiral al`. Both are OCR'd with `ov: 8` unchanged on both sides,
  so only `pv` moved.
  **AND THE ATTESTATION TEST SPLITS THEM, which is what turns one regression into
  one named cost and one queued question.** `Ultra Short Term Bond Admiral` is
  attested **2 times — ONE SHORT of #517's floor of 3** — so that strip correctly
  REFUSED it: this is the floor's own named cost, not a miss, and *a floor of one
  lets a single damaged row license the same damage elsewhere* is why the floor
  may not come down for it. But `Equity Income Adm` is attested **87** against
  the damaged `EquityIncome Adm` at **1** — a textbook CamelCase seam at 87:1
  that **v519's weld repair should reach and did not.** QUEUED as a question to
  be asked of the shipped function rather than guessed at; two wrong diagnoses of
  this row have already been written down and discarded in one cycle.
  `docs/accuracy-log.md` 2026-10-02 (10:5xZ).
- **WHAT #544 (v197) CARRIED — VERDICTED AND MIRRORED, see the bullet above. ONE PREDICATE, TWO ARMS, AND THE BLAST RADIUS IS ZERO
  WHERE IT MATTERS BY CONSTRUCTION: 222 rows / 171 plans / 628,541 participants /
  $7,012,007,386 stop publishing a vehicle-type label as a holding, 0 lost, 0 of
  them publishing a ticker; 70 rows / 69 plans / 261,795 ppl reach a reader; 4
  lineups / 3,373 ppl are WITHDRAWN.** `isGenericTypeName` is anchored `^…$`
  deliberately, and two populations sat just outside it. **ARM A, a misspelling:**
  R&L Carriers (22,449 ppl) publishes `Registered invesmtent company` at 2.7% of
  an otherwise clean 31-row menu — **hours after the contract fee gate recorded
  `investment` misspelled SEVEN ways defeating one vocabulary, the same word
  misspelled defeats a second, unrelated one.** **ARM B, one leading word:**
  General Motors' two plans publish `Plans Master Trust` at 12.9% and 14.4%
  ($1,264,065,000 and $3,424,814,000, blank type cell, 136,838 readers), where
  `isGenericTypeName("Master Trust")` is TRUE — v190 shipped exactly that name —
  and one leading word defeats the anchor. *A fix for one FORM of a name is not a
  fix for the name.*
  **ARM A IS DERIVED FROM THE VOCABULARY'S OWN LANGUAGE AND IS NOT A LIST OF
  MISSPELLINGS.** `GTA_SOURCE` is alternation and `?` optionals with no `*` or
  `+`, so its language is **FINITE**: `gtaLanguage()` enumerates it (342 strings,
  256 despaced terms ≥10 letters, **every one asserted to be accepted by the regex
  it came from**) and the test is ONE EDIT — including a **TRANSPOSITION**, which
  is what `invesmtent` is — from a member.
  **MY FIRST PREDICATE WAS REFUTED BY ITS OWN OUTPUT AND THE SIZE WAS THE TELL:
  do not carry 14,911 rows or 17,195,958 ppl forward.** A one-edit-per-TOKEN test
  against a word set reads 14,911 rows whose commonest members are **REAL FUNDS**
  (`MFS Mid Cap Value R6` 936, `Key Guaranteed Portfolio Fund` 472), because a
  one-edit neighbourhood around `value`/`stock`/`fund`/`portfolio` reaches
  ordinary fund names. Asking whether the WHOLE NAME is then a term gives
  **14,911 → 220.**
  **AND A GENERAL LEADING-WORD STRIP IS CATASTROPHIC, measured before it was
  written: 3,296 rows / 887 leads, dominated by REAL FUNDS** — `Target Retirement
  2035 Trust` 222, `American Mutual Fund` 216, `INVESCO QQQ TRUST` 123, `iShares
  Gold Trust` 32, plus the firms `Northern Trust`, `Wilmington Trust`, `FIRST BANK
  & TRUST`. **Do not carry 3,296 forward.** So arm B is a `GENERIC_DECO` entry and
  not a vocabulary one; whole-population, of the **160** names beginning with
  plan/plans/plan's it reaches **5** and KEEPS **155**, including `Plan Loan
  Default Fund` (194 rows, a real TIAA fund). The sibling lead `other` was
  measured and REFUSED — 121 rows, **all 121 already `NOT_FUND_SHAPED`**.
  **THE REGION-CONTEST HAZARD IS CLOSED BY CONSTRUCTION, NOT BY LUCK.** v196
  widened `GENERIC_TYPE_ANY_EXTRA`, and `GENERIC_TYPE_ANY` feeds `isClassLabel` →
  `isStatement`'s label-share arm → **the REGION CONTEST**, which demoted two
  whole regions and cost two lineups on a +0/−0 registration. Every consumer was
  enumerated from source first; both v197 arms live inside `isGenericTypeName`, as
  v189's despaced arm does, and **`GENERIC_TYPE_ANY`, `GENERIC_TYPE_NAME` and
  `GENERIC_TYPE_DESPACED` are all byte-identical to HEAD**, so `isClassLabel` is
  the IDENTITY. Corroborated rather than argued: over **415,346 distinct published
  row names `isClassLabel` changed on 0**, and **`labely` moved on 0 of 60,170
  entries.**
  **THE CONDITION THAT MATTERS MOST WAS FOUND BY READING THE POPULATION:**
  v188 leaves `Separate Account A, at fair value` uncaught ON PURPOSE (a capital
  `A` may be a real designation, case being the only signal), the decoration strip
  reduces it to `Separate Account A` — one edit from the vocabulary — and **it is
  published at 90.3% of its menu**, so the arm would WITHDRAW a lineup a pinned
  must-KEEP exists to protect, **by a side door that never touches the
  case-sensitive footnote arm**. The single-character last-token guard is
  therefore asked **PER CANDIDATE** and not of the filed name; it also refuses
  `Common Stock B` and `Class E Common Stock` (QuikTrip files the latter at
  $3,535,256,080). The other two conditions: a **ten-letter floor**, because
  `truist` is one edit from `trust` and a bank would become an asset-class label;
  and **the letters-only form must not already BE a term**, because letters-only
  strips digits so `22,782.2669 mutual fund shares` reduces to `mutualfund`, one
  edit from its own plural — a welded SHARE-COUNT row, **a different class, not
  folded in**.
  **ALL 165 DISTINCT NAMES READ, not sampled, not one naming a fund.**
  **ARM B'S OWN CONTRIBUTION IS 3 ROWS / 3,573 PPL AND NOT GM'S 136,838 — THE
  HANDOFF'S ATTRIBUTION WAS WRONG.** Arm A reaches GM by itself
  (`plansmastertrust` is one insertion from `planmastertrust`, already in the
  language): arm A alone 216 rows, both arms 3 rows / 141,497 ppl / $4,782,194,617,
  arm B alone 3 rows. *A population an arm COVERS is not what it CONTRIBUTES*, and
  **the two arms are not independent — arm B's strip can remove the very
  difference arm A would have measured.**
  **A DEFECT IN THE INSTRUMENT I WAS ABOUT TO REGISTER A NUMBER FROM, fixed in the
  same commit: `audit-data.mjs:462` tested `NOT_FUND_SHAPED` ALONE while the guard
  it audits tests `NOT_FUND_SHAPED || isGenericTypeName`**, so the in-pipeline
  dominant-row metric has been **blind to that whole half of the guard since
  v105** — through v137, v187, v189, v190, v192 and v196 — printing `0 dominant
  non-fund` into the coverage line while the standalone and the guard both read 4.
  *A CHECK PUBLISHES A CLAIM.* **Attributed: the repair contributes 0 on the
  pre-change store**, so all 4 findings are v197's, and **the repair is what lets
  the run's own audit SEE the four withdrawals it exists to watch.** Threshold
  untouched at 60.
  **`audit-generic-names` 237 → 261 plans / 508 → 565 rows and THE 230 THRESHOLD
  IS NOT MOVED** — already exceeded, so `fabricated-name` is STANDING either side
  and **HIGH holds at 4** (3 `contrib` + `fabricated-name`): at baseline, not
  above.
  **GATES: `scripts/generic-typo-test.mjs`, IN THE REPO** because the harnesses
  that sized this item were wiped by a container restart — **102 pins and SEVEN
  NEGATIVE CONTROLS, one per condition**, each written out in full rather than by
  surgery and each failing BY NAME on exactly its own cases (61 / 3 / **0,
  labelled DECORATIVE on the pins and controlled on the STORE instead** / 3 / 7 /
  66 / 3). **TWO OF MY OWN EXPECTATIONS WERE WRONG AND THE CONTROLS CAUGHT BOTH:**
  `Assset` was pinned from memory as one edit from `assets` and differs in THREE
  positions (decorative, removed); and the transposition control is **7 cases, not
  the 2 I registered** — `Gauranteed`, `Mutula`, `acocunt`, `Investmnet` and
  `invesmtent` are all transpositions, so **plain Levenshtein would miss 7 of the
  66 flagged pins.**
  **THE TWIN FAILED CLOSED on the first regeneration** rather than emitting a copy
  missing the arm; `oneEdit` and `isTypoGenericTypeName` are sliced VERBATIM and
  the 256 terms emitted as data (the compiled-regex precedent). Probes 64 → 95,
  **added after measuring that only 2 of the 64 existing probes reach the new arms
  and NEITHER changes verdict.** Drifting the twin fails by name on exactly the 12
  arm-A cases; drifting the leading-plan alternative on exactly `Plan Assets`.
  **AND A HARDCODED `slice(0, 22)` BOUNDARY IN A TWO-SIDED PIN LIST IS GONE** —
  insert a must-FLAG case below that line and it is pinned as a REAL FUND; the
  split is now derived from the first must-KEEP name and asserted.
  **I ALSO WALKED INTO A TRAP THIS FILE ALREADY NAMES:** my first twin-drift
  control called `gen-generic-twin.mjs --check`, there is no such mode, so it
  **REGENERATED the twin and erased the drift**, reporting 0 of 6 — verbatim the
  2026-09-30 failure, repeated by the person who had read it. Redone read-only.
  **8 crawlable pages / 186,394 ppl**, every changed cell read (GM ×2, Permanente
  30,066, Garmin 9,892, Mack Trucks 4,659, NYU Langone 2,804, Buchanan 1,326,
  Tighe & Bond 809). `diff-lineups HEAD`: **CONFIDENCE LOST 1** (The Eby Group,
  **3→3 rows, ratio 0.99→0.99** — the rows do not move, only the classification),
  **0 fabricated rows introduced**; 3 specimens pinned. parser-gate, smoke,
  `lib-disclose --selftest` 25/25, fund-er-test 83/26/19/18/28, merge-name-test
  all green.
  **PRE-REGISTERED, a CEILING plus a NAMED SET** (a withdrawn region may be
  rescued by a prior-year fallback and `fallbacks.json` is artifact-only, so no
  whole-store scan can predict it): `confident` **60,170 → 60,166, −4 at most /
  +0**, every loss inside {The Eby Group 2,054, Ortho Benefits 570, Skico 499,
  Electromed 250}; `== FABRICATED-HOLDING SHAPES` **257 generic-named, 0 dominant
  non-fund**; **HIGH 4**; warn **556**; overshoot **372**, overshootTrust 12,
  aggRow 113, dl **19**, pv 197 at ~100%; lineups 59,822 → 59,818, entries 65,479
  unchanged. **`tkExact` 37.32, `tkComparable` 3.27 and `tkShare` 24.47 CANNOT
  move** — v197 writes no `stk`, no `ftk` and no name, and `fundER` is called on
  the NAME and never on a symbol, which is a stronger claim than a tolerance.
  `docs/accuracy-log.md` 2026-10-02 (06:3xZ).
- **THE 05:5xZ DRAW, TWO CLEAN MENUS AND NO NEW CLASS.** Seed 20261002055, pool
  **60,312 published lineups / 100,136,907 ppl**. **Walmart (1,996,659 ppl, 42
  rows @ 0.952) reads clean end to end on a NEWER ack
  (`20260909124139NAL0004116481001`), and it re-confirms v130 on a filing v130
  never saw** — all four wrapped BlackRock/LSV names whole and separate at their
  own values (`MSCI ACWI ex-U.S. IMI Index Non-Lendable Fund` $4,711,712,195,
  `The Collective LSV International (ACWI EX US) Value Equity Fund`, the Long
  Term and Intermediate Government Bond Index funds), where the 2026-09-16
  defect merged three of them into one `Lendable Fund` row. Its one queued row
  is **`Fiera Asset Management USA` at 3.2% / $1,773,620,398**, the bare-house
  class's largest named instance. **The Mohegan Tribe Of Indians Of Connecticut
  (7,703 ppl, 26 rows @ 0.979)** carries live instances of four queued items and
  no new one: **twelve `American Funds Target Date <year>` rows at 32.1% of the
  menu, each publishing 0.32 with NO ticker and NO share class stated** (the
  owner-gated R-6 fee item and the American Funds target-date ticker gap in one
  plan); `JP Morgan Large Cap Growth` at **23.0% / $112,588,862 publishing 0.44
  with no symbol**; **`Dodge & Cox Income X` → DODIX at 0.41** where the SEC
  registers Class X as **DOXIX** — v528's own named residue in the other
  direction, the filing stating X and the page publishing the I-class symbol;
  and two rows resolving to nothing. Two shipped guards visibly working:
  `Invesco Stable Value Tr Cl 4` publishes no fee, and Walmart's `Managed
  account holdings (492 positions)` is folded rather than flooding the menu.
- **THE 05:4xZ DRAW FOUND A GENERIC TYPE NAME DEFEATED BY A KEYSTROKE AND, IN
  THE SAME SCREEN, A BIGGER DEFECT ITS BUCKET LABEL GOT WRONG — THREE CLASSES,
  SEPARATELY SIZED, NONE SHIPPED.** Seed 20261002054, pool **58,893 published
  lineups / 91,511,061 ppl**; **R&L Carriers (22,449 ppl, 31 rows @ 0.957)** and
  **Soils Engineering Services (161 ppl, 32 rows @ 0.930)**. R&L's otherwise
  clean menu publishes **`Registered invesmtent company` at 2.7% / $12,028,498
  with a BLANK type cell** — **hours after the 05:1xZ ship recorded `investment`
  misspelled seven ways defeating one vocabulary, the same word misspelled
  defeats a second, unrelated one.**
  **(A) THE HONESTY CLASS: 141 rows / 124 plans / 97,591 participants /
  $1,389,531,915**, 95 distinct names, **all read, not one naming a fund**
  (`Mutuai Fund` 10, `Mututal Fund` 7, `Guranteed Investment Contract` 6,
  `Pooled Seperate Account` 5, `Common/Coliective Trust` 3, `Commen Stock`),
  **0 publishing a ticker and 0 a fee**, so the harm is the CLAIM alone.
  **AND 4 OF THEM WOULD BE WITHDRAWN RATHER THAN RETYPED, WHICH MAKES THIS A
  CONFIDENCE DEFECT TOO:** `dominanceIsAggregate` needs a single NON-FUND row at
  ≥90% and learns *non-fund* from `isGenericTypeName`, **so a typo in the label
  hides the row from the dominance guard as well as from the reader** — The Eby
  Group **97.4% / $15,475,635**, Electromed 96.3%, Ortho Benefits 95.0%, Skico
  91.1% (3,373 ppl), every one a v105-shaped asset-class statement published as a
  menu. Nine more at 50–90% (4,381 ppl / $431,465,850), led by **Buchanan
  Ingersoll & Rooney at 53.0% / $342,742,907 named `Matual Funds`**.
  **(B) 22 rows / 11 plans / 35,799 ppl ARE THE SHIPPED DESIGN WORKING AND MUST
  NOT BE "FIXED":** the name is misspelled and the **ISSUER carries the fund**,
  so a reader gets the right symbol — Chewy's `Common/colfective trust` [iss
  `VANGUARD TARGET 2065`] → **VLXVX at 0.08**, Salisbury House's eleven `Common
  colletctive trust <number>` rows [iss `Trp Ret Blend <year> Trust A`] → TRBLX
  and siblings at 0.41. `isNamelessFundRow` is asked only where there is NO
  issuer, so the design already protects them; recorded so a later cycle does not
  retype them into losing a correct ticker.
  **(C) AND THE SCREEN'S LARGEST HIT IS NOT A MISSPELLING AT ALL — 2 rows / 2
  plans / 136,838 PARTICIPANTS / $4,688,879,000. General Motors' two plans
  publish `Plans Master Trust` at 12.9% and 14.4% with a BLANK type cell.**
  Asked of the shipped predicate: `isGenericTypeName("Master Trust")` is **true**
  — v190 shipped exactly that name for exactly this reason — and
  `isGenericTypeName("Plans Master Trust")` is **false**, because the predicate is
  anchored `^…$` and **one leading word defeats it.** *A fix for one FORM of a
  name is not a fix for the name.* My screen reached it only through a
  plural→singular repair (`Plans` → `plan`), so **the bucket LABEL is wrong and
  the MEMBERS are not** — *a label being wrong is not the same claim as a member
  being wrong*, recorded at 01:5xZ and met again the same day, this time with the
  mislabelled member the largest finding in the cycle. Its own item; never folded
  into (A).
  **AND MY FIRST PREDICATE WAS REFUTED BY ITS OWN OUTPUT — DO NOT CARRY 14,911
  ROWS OR 17,195,958 PPL FORWARD.** A one-edit-per-token test against the
  vocabulary's 37 words reads 14,911 rows / 12,352 plans / 17.2M ppl whose most
  frequent members are **REAL FUNDS** (`MFS Mid Cap Value R6` 936, `MFS Value
  Fund` 678, `Key Guaranteed Portfolio Fund` 472), because a one-edit
  neighbourhood around `value`, `stock`, `fund`, `portfolio` reaches ordinary fund
  names; **the implausible size was the tell.** What works is STRUCTURAL and not a
  vocabulary: **repair each token to its vocabulary neighbour and ask whether the
  WHOLE NAME is then generic** — `GENERIC_TYPE_ANY` is anchored `^…$`, so a
  repaired name carrying any identifying word still fails, which keeps real funds
  out BY CONSTRUCTION and needs no list of misspellings. v189's despaced test one
  damage kind along, and the same answer the 05:1xZ ship reached one function
  away. **14,911 → 165.**
  **TWO HARNESS NOTES, both rules already on this record.** The first run **did
  not finish**, because it called the full render on all 1,724,078 rows when the
  predicate reads only the NAME; `clean` alone is an EXACT pre-filter (the same
  function the render calls for `cleaned`), and the render is then asked only of
  the 165 hits — *a fast exact measurement must not be chained to a slow one*, two
  cycles running. **And the draw harness was weighting by the wrong column**,
  summing `participants` where `build-data` packs `parts = partEOY ||
  participants` and the page publishes that — the defect that cost a published
  figure 323,826 against 311,555 on 2026-10-01. Patched, with the cost named in a
  comment so it is not undone; that is why the pool reads 58,893 / 91,511,061.
  **ALSO LIVE IN THE TWO MENUS, queued:** R&L's `JPMorgan Large Cap Growth Fund`
  at 11.0% / $49,615,959 publishing **0.44 with no ticker** (the 91,423-row
  fee-without-symbol class); five further R&L rows resolving to nothing; eleven
  `American Funds Target Date <year>` rows at 0.32 with no symbol (the owner-gated
  R-6 item, 22,449 ppl here alone); and **Soils' whole 32-row menu is recordkeeper
  abbreviations with every type cell blank** — twelve `NUVN LFCYCIND <year> R6`
  rows publishing nothing (the TIAA-CREF → Nuveen rename family) and `VNGRD BAL
  INDX ADML` publishing the generic **0.1** where the name states the house, a
  named instance of the queued fee pre-emption. `docs/accuracy-log.md` 2026-10-02
  (05:4xZ).
- **SHIPPED AND MIRRORED 2026-10-02 05:4xZ (`2adf1fcb → 614f4095`), UNFORCED ON
  BOTH CHECKS, data gate +0 / −0 BY ACK AND BY PLAN; `site-test` #140 reads
  `conclusion: success` ON THE EXACT SHIPPED COMMIT — THE CONTRACT FEE GATE HAD
  A VOCABULARY WHERE IT NEEDED A WORD: 225 rows / 222 plans / 458,245
  participants / $2,443,025,511 stop publishing a fabricated expense ratio, 224
  of them the generic 0.35.** No `PARSER_VERSION` bump and no store change, so
  **the push fired `site-test` and NOT build-data** — the documented
  intermittent trigger, and immaterial here because an incremental run's whole
  work list is the 19 dead 403s. Gates reproduced independently on the merged
  tree before the mirror: `smoke-test` green, `lib-disclose --selftest` 25/25.
  `annuityFeeIsGuaranteeOnly`'s first condition read three wordings — `annuity`,
  `investment`, `insurance` contract — so `TIAA Stable Value Contract`,
  `Guaranteed Income Contract`, `Guaranteed Interest Balance Contract` and `Key
  Guaranteed Portfolio Fund, at contract value` were outside it BY CONSTRUCTION.
  **The NINTH recorded instance of *a fix for one phrasing of a class is not a
  fix for the class*, and the SECOND inside this one function** — whose own
  comment records the eighth, written one day earlier, when the same gate was
  widened from one wording to three.
  **THE VOCABULARY DIED ON ITS OWN MEASUREMENT AND THAT IS THE FINDING: the
  phrase immediately preceding `contract` takes 67 DISTINCT FORMS, and
  `investment` is MISSPELLED SEVEN WAYS inside them** — `Investement`,
  `Invest`, `INVESTMNT`, `Intvestment`, `Investm ent`, `Inves tment`, plus
  `annity` for `annuity` on 4 rows. *A vocabulary is defeated by a keystroke*,
  and this population defeats one with seven; any widened list ships one wording
  short of the next filing. Condition one is now the bare
  `CONTRACT_WORD = /\bcontracts?\b/i`.
  **WHAT MAKES THAT SAFE IS THE GATE'S OWN SECOND CONDITION, WHICH WAS THE RULE
  ALL ALONG, AND IT WAS RE-MEASURED RATHER THAN INHERITED.** 2026-09-29 refused
  the bare word FOR THE TYPE RULE after reading 103 names and finding them
  *"overwhelmingly REAL FUNDS wearing a caption"*; that reading still holds, and
  the residue test absorbs them — widened, the gate **REACHES 86 such rows and
  REFUSES all 30 that publish a fee**, because `Fidelity International Index`
  (FSPSX), `Vanguard Value Index Fund Adm` (VVIAX), `MFS Value R6` (MEIKX) and
  `T. Rowe Price Retirement 2045 Fund` (TRRKX) all still price once the
  guarantee words come out. *The caption is not what the gate reads; the
  remainder is.*
  **OUTCOME WHOLE-STORE THROUGH THE PAGE'S OWN RENDER, BEFORE SIDE ON HEAD's
  app.js, EVERY COLUMN POSITIVE-CONTROLLED FIRST:** fee withdrawn **225**, fee
  gained **0**, fee changed **0**, **0 tickers, 0 asterisks, 0 shown types
  moved**. 4,381 rows rendered twice under an exact pre-filter that is a
  SUPERSET — raw says `contract` OR raw with whitespace removed does, because
  `cleanFiledName` despaces kerned text and a raw name can GAIN the word.
  **ALL 183 DISTINCT NEWLY-FLAGGED NAMES READ: 182 are an insurance guarantee, a
  stable-value contract, a bare legal designation or a filer's table line welded
  into a name** (`Change in contract value versus fair value in Morley Stable
  Value Fund`, `259,569.72 Guaranteed Income Contract`); **not one names a
  registered fund.**
  **THE 183rd IS A REAL FUND AND THE CALL SITE KEEPS IT, with the condition
  priced before it was added.** `Contract BlackRock Russell 1000 Growth CIT`
  (Wilson & Company, 1,009 ppl, $10,359,013) publishes IWF's 0.18 as a labelled
  comparable from the resolved TICKER, which the residue test cannot see because
  `priceOf` is the bare pattern table — so app.js ANDs the gate with **`!tk`**,
  the `isBankDepositRow` pattern. **The pre-change gate flags 2,915 published
  rows and 0 OF THEM PUBLISH A TICKER**, so `!tk` moves no shipped verdict and is
  load-bearing on exactly one row. *A condition that changes one verdict is named
  as changing one verdict.* Reconciles to the dollar: 226 reached − 1 kept = 225.
  **THE HANDOFF'S 261 IS 5 TOO HIGH AND THE CAUSE IS THIS RECORD'S OWN RULE** —
  it pre-filtered on the RAW stored name where the gate reads the CLEANED one, and
  5 rows lost the word to the unclosed-parenthetical strip (`Guaranteed Income
  Fund - Empower Annuity Insurance Company (contract Insurance Company Gen`).
  ***Measure through the function the page calls, WITH THE ARGUMENT THE PAGE
  PASSES.*** Direction matters: those 5 carry no contract word in the gate's input,
  so they are the **owner-gated stable-value item** and are deliberately
  unreachable — one is pinned as a must-KEEP to mark that line. The handoff's
  `/\bcontract/i` also has **no trailing boundary** and matches `contractual`
  (3 published rows), the `nt `-shaped trap; the shipped predicate uses both.
  **COMPLETE ACCOUNT OF THE 261:** 5 unreachable + 225 withdrawn + 1 kept by
  `!tk` + 9 correctly kept (real funds) + **21 kept INCORRECTLY** = 261.
  **THE DEFECT CANNOT RECUR IN THIS DIRECTION, STRUCTURALLY: `CONTRACT_WORD` is
  provably WIDER than both phrase regexes**, a stronger guarantee than the shared
  constant it replaces, and **an import assertion checks that derivation on every
  load in BOTH halves** — the source's shape and a live witness, because *a test
  on `.source` is a claim about a STRING and not about what the regex does*. It
  sits after `isInvestmentContractRow` for two measured reasons: beside the gate
  it would read `CONTRACT_DESIGNATION_NAME` in its temporal dead zone, and inside
  either generator slice it would be copied into app.js, **where a module-load
  throw breaks every row on every plan page rather than failing a gate.**
  **QUEUED, SIZED, NOT SHIPPED — FOUND BY THE C2 CONTROL: THE STRIP AND THE
  PRICER DISAGREE ABOUT ONE ABBREVIATION, 24 rows / 8 plans / ≥93,007 ppl /
  $1,087,454,960, ALL AT 0.35.** `GUARANTEE_PRICED_WORDS` carries `\bsa?gic\b`,
  matching `sgic`/`sagic` and **NOT the bare `GIC`**, while `fund-er.js`'s own
  fallback prices any `\bgic\b` — so `GIC METLIFE CONTRACT #GAC 32226`
  ($280,882,048) keeps `GIC` in its residue, the residue prices, and **the gate
  refuses a row it was written for.** 23 distinct names, every one a real
  insurance contract. Exactly the recorded `Stable Val` shape one function along,
  and **NOT fixed here for that entry's own reason**: the constant is SHARED with
  `isInvestmentContractRow`, so widening it moves the TYPE rule across its whole
  2,915-row population. **93,007 is a FLOOR** — 16 of the 24 rows sit in MASTER
  TRUSTS with no `plans-all` row, the trust-blindness met a sixth time.
  **GATES:** `lib-disclose --selftest` 25/25, parser-gate green (frozen tether
  7/7), smoke green, fund-er-test **83/26/19/18/28**, merge-name-test 20/20
  22/22 25/25 20/20 22/22 15/15. **16 new pins (21 must-SUPPRESS / 16 must-KEEP,
  total 37), added BECAUSE NOT ONE of the 21 existing cases reaches the new arm
  and 0 of them change verdict** — measured, the v189 decorative failure; every
  candidate pin verified against the SHIPPED predicate before being written down.
  **A NEGATIVE CONTROL PER CONDITION, each written out in full rather than by
  surgery, each failing BY NAME on exactly its own cases:** C1 dropped → the old
  vocabulary fails on exactly the 10 new must-SUPPRESS (1,265 whole-population
  changes); C2 dropped → fails on exactly the 11 must-KEEPs carrying a contract
  word (140 rows / 171,568 ppl); C3 dropped → fails on exactly 1 row; the twin
  drifted → smoke fails by name on exactly 10 of 37; the import assertion fires
  in both halves and the shipped file loads clean.
  **SURFACE AS A GUARANTEE FROM THE IMPORT LIST: `build-seo-pages.mjs` has 0
  references to `fund-er` and imports no `fundER`/`fundERRow`/`fundTickerInfo`,
  so the crawlable pages cannot render a per-fund ER under any input** — REPORT
  path only; regenerating all 5,000 pages leaves `git diff --stat p/` empty, which
  corroborates rather than constitutes it. **DISPLAY-SIDE: no `PARSER_VERSION`
  bump, no run, no store change.**
  **TWO HANDOFF ERRORS NAMED: `DISCLOSE_PATH` is documented in `apppath.mjs`'s own
  prologue and READ NOWHERE in the repo** (and is unnecessary — apppath slices
  app.js, which carries the twin, so `APPJS_PATH` alone is a complete before
  state); and **`lib-disclose --selftest` is not where this arm's pins live** —
  its 25 cases are `coverageBand`/`frozenClaimOk` only, and the tether is in
  `smoke-test.mjs` where the REAL fee table is loaded rather than a stub.
  `docs/accuracy-log.md` 2026-10-02 (05:1xZ).
- **THE 01:4xZ DRAW FOUND A HOLDING PUBLISHED TWICE UNDER TWO NAMES, AND ALL
  THREE ARMS OF THE SHIPPED DEDUP ARE BLIND TO IT BY CONSTRUCTION — QUEUED,
  SIZED, SPLIT, PARSER-SIDE, NOT SHIPPED.** Seed 20261002014. **Avangrid
  Management Company (10,256 ppl, $2.56B, 32 rows, ratio 1.098, OCR) publishes
  `accounts` $86,116,587 beside `Fidelity Brokerage Accounts` $86,116,587**, and
  `Company stocks` $390,010 beside `Iberdrola S.A. Sponsored ADRs Company Stock`
  $390,010.
  **ASKED OF THE SOURCE RATHER THAN ASSUMED:** `collapseDoubleRender`'s ARM A and
  ARM B group rows by `DR_KEY`, the normalised NAME, so two renderings whose
  names differ can never share a bucket; ARM C's test is exact — the longer name
  must be the shorter plus **THIS ROW'S OWN VALUE, digit for digit** — and here
  it is the shorter plus a SHARE CLASS. **ARM C's own comment already named this
  population:** *"it catches 6 of the ~12 twins … and deliberately leaves the
  rest: the others differ in more than the glue, and guessing at them is the
  v174 hazard."* This is the rest, sized.
  **WHOLE-STORE AND IT NEEDED NO RENDER: 5,319 groups / 1,923 menus / 3,294,805
  ppl / $12,321,465,059** carry two rows at an identical value under different
  names. **DO NOT CARRY THAT FORWARD** — this record rules Oracle's four
  near-identical pairs CORRECT (a 50/50 manager split), and the unrelated-name
  half is **4,851 groups / 3,223,572 ppl / $11.83B** of mostly that. The signal
  is where one name is CONTAINED in the other: **469 pairs / 344 menus / 322,959
  ppl / $491,867,233.**
  **AND READING THE 469 SPLITS THEM AGAIN — the claimable core is 70 pairs /
  ~53 menus / ~40,233 ppl / $113,215,337**, the groups where the extra text
  identifies NOTHING: a share CLASS only (51 pairs / $104,037,133), a vehicle
  WORD only (12), or both (7) — `allspring core bd` / `… r6`, `vanguard 500
  index` / `… adm`, `fidelity 500 index` / `… fund`. Two rows at one value where
  one states a class and the other does not cannot be two holdings.
  **ONE OF THE 51 WAS WRITTEN UP AS MY CLASSIFIER'S FALSE POSITIVE AND THAT
  WRITE-UP WAS WRONG — CORRECTED THE SAME CYCLE.** `group annuity contract` →
  `group annuity contracts` is an English PLURAL that my share-class regex
  admitted as a bare `s`, so the **BUCKET LABEL** is wrong and the **MEMBERSHIP
  is not**: a plural identifies nothing either, so the pair sits in the
  decidable core more plainly than any share-class case. It is the **LARGEST
  nested pair in all 469 by menu share — 26.6% twice over / $77,231,653 / 3,329
  ppl — i.e. 74% of that bucket's whole dollar figure**, so calling it a false
  positive would have retired the one member big enough to see. *A label being
  wrong is not the same claim as a member being wrong, and I published the
  stronger one.*
  **THE TWO LARGE BUCKETS ARE AT LEAST THREE MECHANISMS AND MUST NOT BE ONE
  COUNT** (217 pairs / 184,831 ppl "3+ other words", 182 / 112,045 "1–2 other
  words"): a TRUNCATED twin (`instl us govt` / `… money market premier`), a
  BARE-HOUSE twin (`bny mellon` / `bny mellon sm md cp gr y`, `fidelity` /
  `fidelity contrafund k6 fund` — the queued bare-house class intersecting), and
  a BARE-CAPTION twin (Avangrid's `accounts`). **Do not carry 217 or 184,831
  forward.**
  **AND MY NESTING TEST IS WEAKER THAN A PREFIX TEST:** it asks `b.includes(a)`
  so it fires MID-STRING (`money market` inside `vanguard treasury money market
  fund`), which is much weaker evidence of a twin than a prefix truncation; any
  shipped rule must state the position.
  **ONLY 152 OF 469 SIT IN A MENU WHOSE RATIO EXCEEDS 1.02** (109,065 ppl), so
  two thirds are invisible to the overshoot audit as well as to the dedup — the
  Paramount blindness again.
  **ALSO LIVE IN THAT MENU, ALL QUEUED:** `Fidelity Diversified International K6`
  → **FDIVX at 0.65**, the owner-gated different-SERIES item with a named
  10,256-ppl instance; `statements` at **11.1% / $313,497,660** correctly typed
  *"Filing names no specific fund"* (v191 working — claim withdrawn, money still
  in the denominator); `Calvert US Large Cap Core IDX R6` publishing the generic
  0.1 with no ticker.
  **AND THE SECOND DRAW NAMES A BRAND-LEVEL COVERAGE GAP, NOW SIZED: 13,927
  published `iShares` rows across 6,248 menus / 7,243,157 participants, of which
  11,334 publish NO TICKER** — 2,593 publish one and **7,947 publish a FEE**, so
  ~5,354 rows price a holding they cannot name, the fee-asserts-where-the-ticker-
  refuses asymmetry at BRAND scale. Caputo's New Farm Produce (987 ppl) is where
  it was found: TEN `{iShares Core}` rows naming real ETFs (IXUS, AGG, ITOT,
  IDEV, ISTB, DGRO, IJR, HDV, IEMG) and not one resolves, while `{Vanguard} Mid
  Cap Index Adm` → VIMAX resolves on the same page and `{Vanguard} Total Stock
  Market ETF` publishes **a fee of 0.04 and no symbol**. **CORRECTED 03:0xZ — THE
  CONTROL HERE ASKED THE WRONG RESOLVER.** It read *"a bare `iShares Core S&P
  Total U.S. Stock Market ETF` resolves to nothing, so the zero is the tables'
  and not the query's"*; **asked of `resolveHolding` it resolves to ITOT EXACT**,
  as do IXUS, AGG and DGRO. It went through the DISPLAY path, where `fund-er.js`
  answers none of them, so it **read a working matcher as a failing one** —
  *there are TWO ticker resolvers and a control has to name which one it asked.*
  The cause is the ABBREVIATED FILED NAME (`iShares Core S&P Total US Stock Mkt`
  resolves under neither) plus the entity defect shipped at 03:0xZ. Largest unresolved names `ISHARES MSCI EAFE
  INTL INDEX K` 316, `iShares MSCI EAFE International Index Fu` 308, `iShares S&P
  500 Index K` 249, and **`iShares` alone on 96 rows** — the bare-house class
  inside the brand. **This bullet said "NOT SIZED" an hour earlier because the
  sizing had been chained to a 1.7M-row render; splitting it out took one script
  and no render** — *a fast exact measurement must not be chained to a slow one.*
  **AND THE ISSUER-KEYED HALF OF THAT SWEEP IS NOT A DEFECT MEASURE — publish no
  number from it.** No-ticker rows grouped by issuer put `{principal life
  insurance c}` 16,343, `{principal global investors}` 8,932, `{mutual of
  america}` 8,908 and `{great gray trust company}` 4,852 at the top of 11,599,
  and all of those are separate accounts, collective trusts or stable value with
  no registered symbol **by design** — the recorded *"63.9% have no ticker is
  true and is not a defect measure"* trap, reproduced by the instrument written
  after it. The iShares figure is usable because the brand names REGISTERED
  ETFs, so a blank there is a matcher gap and never a vehicle fact.
  `docs/accuracy-log.md` 2026-10-02 (01:5xZ).
- **SHIPPED AND MIRRORED 2026-10-02 01:4xZ (`0e6782aa → 6552150e`), UNFORCED ON
  BOTH CHECKS, data gate +0 / −0 BY ACK AND BY PLAN; #541 AND `site-test` #138
  BOTH FIRED FROM THE PUSH ON THE EXACT COMMIT — THE SAME FILED SYMBOL IN THE
  OTHER POSITION: 458 rows GAIN one / 47 entries / 91,455 ppl / $900,341,480,
  13 CORRECT one / 9 entries / 17,090 ppl / $127,294,498, 0 LOST.** v528's
  anchor is load-bearing (it is what stops `INDEX`, a registered symbol, being
  read as one), so the TRAILING parenthetical is outside it BY CONSTRUCTION —
  and it was the whole of the 00:3xZ check's remaining 15 findings. *A fix for
  one POSITION of a class is not a fix for the class*, fourth surface.
  **NO NEW PREDICATE, AND THAT IS THE WHOLE DESIGN: rotate the parenthetical to
  the front and ask the SHIPPED function**, so all three conditions apply
  unchanged; **a rotation also DELETES NOTHING.** **ADDITIVE BY MEASUREMENT: of
  the arm's 657 hits, `resolveFiledTicker` already answers on 0.**
  **ALL 13 CORRECTIONS READ AND EVERY ONE IS A SHARE CLASS THE FILING BOTH
  STATES AND PRINTS** — FCNTX → **FLCNX** (the K6 defect named six times), FOCPX
  → FOCKX, FDGRX → FGCKX, JMGMX → JMGZX, DODIX → DOXIX, PRDGX → PDGIX, HACAX →
  HNACX, MWTIX → MWTSX, VBTLX → VBTIX. **Two are a sourced bite out of the
  owner-gated Institutional→Admiral item**: St. Jude Children's Research (11,703
  ppl) published VEXAX and VTIAX, the ADMIRAL retail classes, beside names
  stating Institutional, and its filing prints `(VIEIX)` and `(VTSNX)`.
  **AND MY OWN REFUSAL OF THIS AN HOUR EARLIER WAS A SCOPING ERROR, the
  transferable result.** The product-token guard was killed on a cost of **292
  SHIPPED `ftk` rows / 494,432 ppl** — but `resolveFiledTicker` has **exactly one
  production caller**, so a trailing arm is a SEPARATE FUNCTION and a guard on it
  **cannot withdraw a shipped answer.** The 292 was never its price; its price is
  the NEW COVERAGE it refuses, and refusing a repair is the safe direction.
  ***A whole-population cost has to be priced against the population the guard
  will actually be asked about*** — I measured both populations in one pass and
  then reasoned about the union.
  **THE SHIPPED GUARD IS A CONTRADICTION TEST AND NOT A CORROBORATION TEST, and
  that distinction is what three candidates died on:** ask the filer's WORDS what
  fund they name, independently of the symbol, and refuse only when they name one
  INCOMPATIBLE with the symbol's. **It is SILENT where the words resolve to
  nothing**, which is the whole GAIN population's shape, so it costs neither the
  renames nor the abbreviations.
  **THREE SIMPLER GUARDS KILLED BY MEASUREMENT, recorded so they are not
  retried.** (a) *a shared token the SERIES carries and the ENTITY does not* —
  **REFUSES `Fidelity Contrafund K6`**, `contrafund` being in both, destroying
  the arm's main prize; it read as "correct on all four pinned cases" an hour
  earlier **only because K6 WAS NEVER PINNED**, *a pinned set proving the cases
  its author already imagined*. (b) *no series token absent from the filed name*
  — refuses **71 of the 186 AGREE rows, 38% of the rows whose answer we
  independently know**, because the registry abbreviates and renames too (`VG
  TOTAL STOCK MKT IDX ADM`, `Target Retire 2045 Inv`, `Federated GOVT
  Obligations PRM`, the whole TIAA-CREF → Nuveen family). (c) *the symbol's
  series must equal the series the name resolves to* — refuses the K6 family
  again. **The shipped test refuses 2 of 657 and 0 of 186 AGREE**, against 29 and
  71; that AGREE column is the discriminating control and exists only because
  this arm has a population whose answer is known independently.
  **BOTH REFUSALS READ, BOTH GENUINE FILER TYPOS NAMING A DIFFERENT FUND:** St.
  Jude's transposed `(VBITX)` (the registry registers VBITX as **Short-Term** and
  VBTIX as **Total Bond Market**), and **`Fidelity Freedom Index 2055 Fund
  Investor Class (FIDFX)` where FIDFX registers as `Fidelity Mid Cap Value
  Fund`** (941 ppl) — **a second instance of exactly the class the guard was
  written for, which THE GUARD found rather than the reading.** v528's principle
  does not cover them: its named cost is *"the symbol is the more precise"* and
  every case behind it is a share-CLASS disagreement WITHIN one fund.
  **NOT FEE-NEUTRAL, AND v528's "BY CONSTRUCTION" DOES NOT TRANSFER** — 2 fees
  and 3 asterisks move, all one mechanism: **a row leaves a labelled COMPARABLE
  and becomes an ASSERTION**, because a printed symbol is not an approximation
  (v528 read and approved the identical move on `SSSYX`, which is literally one
  of the three). The fee moves are **the comparable table's number replaced by
  the fund's own, traced not assumed**: `fundTickerInfo("Schwab Trust Vanguard
  Total Bond Mkt Index (VBTLX)")` returns `{er: 0.05, comparable: true}` while
  `fundER` and the bare `… Admiral Shares` both say **0.04**; WFSPX goes **null →
  0.03**. **One down, one up, two different tables — so the direction is not a
  bias.**
  **THE MID-STRING BRACKET IS NOT SWEPT IN AND IS SIZED: 80 rows carry a
  non-terminal bracketed five-cap token and 30 would resolve without the anchor**
  — a DIFFERENT class, the bracket trailing with **OCR debris after it**
  (`(AMCPX) 125,380 +e`, `(RFFTX) NIA`). **MERGE-side, so the shipped `NIA` and
  tail-residue strips cannot help: they are DISPLAY-side and the debris is still
  in the store when the arm is asked.** Checking it is also what made the
  anchor's control non-decorative.
  **GATES:** `--selftest` **171/171** with 18 new pins, **added because NOT ONE
  of the 153 existing cases reaches this arm**; a negative control PER CONDITION
  failing by name on exactly its own cases (2 / 2); parser-gate, fund-er-test
  83/26/19/18/28, merge-name-test, `lib-disclose` 25/25 and smoke green;
  `ftContent` lifted to module scope so both arms ask one question.
  **DATA IN THE SAME COMMIT AS THE CODE** (#528's precedent): `ftk` on 657 rows /
  53 entries **and nothing else** — 0 acks added or removed, 0 row-count changes,
  all 69,046 `lineups-status` entries byte-identical, both index files identical
  once `generated` is removed. **REPORT path only as a GUARANTEE** —
  `build-seo-pages.mjs` reads no `ftk`, no `stk` and no `fund-er.js`.
  **PRE-REGISTERED for #541:** `filed tickers (trailing parenthetical): 657 rows
  across 53 plans`; `filed tickers` **2,166 / 75** and `sec tickers` **477,627 /
  47,915 (113,424 blank)** unchanged; CONFIDENCE DIFF **+0 / −0**, rows-dropped
  0; confident **60,170**, lineups 59,822, entries 65,479, **HIGH 5**, overshoot
  372, dl 19, pv 196 at 99.97%; **`ticker-conflict` must fall 15 → about 2**, the
  residue being the two typos it cannot bless; `tkExact` at most +0.05 and
  `tkComparable` can only FALL by the 3 promoted asterisks.
  `docs/accuracy-log.md` 2026-10-02 (01:4xZ).
- **SUPERSEDED BY THE BULLET ABOVE — SHIPPED 2026-10-02 01:4xZ with a CONTRADICTION
  test in place of the refuted product-token guard; its 459 / 14 figures are the
  UNGATED count and the shipped ones are 458 / 13. Kept because its three dead
  guards must not be retried and because the scoping error it contains is the
  finding: THE TRAILING-PARENTHETICAL EXTENSION OF v528.** The 00:3xZ check fix left 15 `ticker-conflict` findings
  and every one carries the symbol in a **trailing parenthetical** — outside
  v528's LEADING anchor by construction — so this is the complement of a shipped
  rule, the cheapest coverage there is to find.
  **IT NEEDS NO NEW PREDICATE AND THAT IS THE WHOLE DESIGN: rotate the
  parenthetical to the front and ask the SHIPPED function**, so conditions (1)
  lead, (2) the registered series shares a content word with the remainder and
  (3) that token is a word of three letters or more all apply unchanged. A
  rotation also DELETES NOTHING. Of 1,724,078 rows, **754 end in a bracketed
  five-capital token**; **95 are REFUSED by (2)/(3)** (the safety evidence),
  **186 AGREE** with what we publish (the control that the shape is read right),
  and **0 of 754 are already answered by v528** — the symbol never also leads, so
  the extension is strictly additive *by construction*.
  **THREE OF THE 14 CORRECTIONS ARE A SOURCED BITE OUT OF THE OWNER-GATED
  INSTITUTIONAL→ADMIRAL ITEM SIZED ONE HOUR EARLIER:** St. Jude Children's
  Research (11,703 ppl) prints `(VIEIX)` and `(VTSNX)` beside names stating
  Institutional where we publish **VEXAX and VTIAX, the ADMIRAL retail classes**
  — the filing's own symbol adjudicating it, which is the one route into that
  8.4M-participant class needing no source the project lacks. Also `Fidelity
  Contrafund K6 (FLCNX)` → FLCNX against FCNTX, the K6 defect named five times.
  **AND IT IS BLOCKED BY ONE ROW, FOUND BECAUSE THE SAME SYMBOL APPEARED IN TWO
  LISTS.** `VBITX` is a GAIN on `Vanguard Short-Term Bond Index Fund
  Institutional (VBITX)` and a CORRECTION on `Vanguard Total Bond Market Index
  Fund Institutional (VBITX)` — **one symbol cannot be two funds.** The registry
  settles it: VBITX is **Short-Term**, VBTIX is **Total Bond Market**. St. Jude's
  filing **transposed two letters**, so shipping as designed publishes the
  Short-Term fund's symbol for a Total Bond Market holding to 11,703 readers,
  trading a wrong CLASS for a wrong FUND.
  **v528's RECORDED PRINCIPLE DOES NOT COVER IT AND THE DIFFERENCE IS EXACT:**
  its named cost is *"the filer wrote both … the symbol is the more precise"*,
  and every case behind that sentence is a share-CLASS disagreement within one
  fund. A transposition names a **different fund**, where the symbol is not more
  precise but wrong.
  **CONDITION (2) CAN BE SATISFIED BY THE HOUSE TOKEN ALONE, PROVED BY PROBE, AND
  THE SHIPPED COMMENT CLAIMS OTHERWISE** (it unions `content(entity)` with
  `content(series)`): `VBITX Vanguard Target Retirement 2050 Fund` → **VBITX**,
  `FXAIX Fidelity Puritan Fund` → **FXAIX**. *A measured claim in a comment has
  to be the claim the code makes.* **In the shipped population it is LATENT** —
  an entity-only/series-only split reads **1 live row of 2,166** (`DPRRX Delaware
  REIT R`, 409 ppl) and **that row is CORRECT**, a renamed fund.
  **AND MY SECOND TEST MEASURED ITSELF, so no figure from it is published: DO NOT
  CARRY 292 / 494,432 OR 162 / 59,093 FORWARD AS A DEFECT SIZE.** Flagging a row
  when every shared token also appears in the registrant's name is refuted by its
  own output — `FXAIX - Fidelity 500 Index` shares only `[fidelity]` because the
  rest are a digit and vehicle words **and is exactly right**, and `RPTTX - T.
  Rowe Price Diversified Mid Cap Growth` is flagged while sharing SIX tokens
  **because T. Rowe Price's registrant name IS its fund name.** The
  `identityIsProductName` failure of the reverted category build, in a second
  place.
  **THE CANDIDATE GUARD WAS THEN BUILT, PRICED AND KILLED — one sentence from
  being published as "the next thing to measure".** *Require the shared set to
  contain a token the SERIES carries and the ENTITY does not*: correct on all
  four pinned cases, and whole-population it would **REFUSE 292 shipped rows
  reaching 494,432 participants, almost all of them CORRECT** (FXAIX at 116,682
  ppl, `Vanguard Explorer Adm`, `Vanguard Ttl Bd Mkt Idx InstPl`, `John Hancock
  Disciplnd Val R6`, `Loomis Sayles Sml Cp Grw Instl`), plus 162 extension rows
  including the whole TIAA-CREF → Nuveen rename family. **Dead** — the third
  plausible guard this session killed by its whole-population cost rather than by
  its controls.
  **AND THE REASON IS WORTH MORE THAN THE GUARD: A TRANSPOSITION AND A RENAME ARE
  INDISTINGUISHABLE FROM THE STRING ALONE** — in both the printed symbol's series
  disagrees with the filed name, and the registry holds only the CURRENT name.
  Two further tests fail on named families: *no series token absent from the filed
  name* costs the rename family, and *the symbol's series must match the series
  the NAME resolves to* costs **the K6 family, the extension's main prize.**
  **SO TWO INDEPENDENT ITEMS ARE NOW BLOCKED ON THE SAME MISSING DISCRIMINATOR —
  the structural result of this cycle.** The category-table fix needs *does column
  B name a PRODUCT or a FIRM* (23:3xZ, reverted) and this needs *do the shared
  tokens include a PRODUCT token or only the house*. `isHouseName`,
  `identityIsProductName` and a registrant-name test have each been measured and
  refused for it. **Whatever is built for one should serve both, and neither
  should ship before it exists.** `docs/accuracy-log.md` 2026-10-02 (00:4xZ).
- **SHIPPED 2026-10-02 00:3xZ, `[skip ci]` — 65% OF A CHECK'S PUBLISHED FINDINGS
  WERE FALSE: `ticker-conflict` 48 → 15, `warn` 601 → 568.** The check looks for
  rows where we publish a symbol *the filing itself contradicts*, and it computed
  what we publish from **the three `fund-er.js` attempts and nothing else** —
  while `lookupTicker` returns **`f.ftk` FIRST** (v528's filed-symbol rule) **and
  `f.stk` LAST**. Measured whole-population through the page's own render: **31
  of its 48 findings were FALSE**, the page already publishing the filed symbol
  **through the very `ftk` that `FILED_TK` had just re-extracted from the same
  name** (`VITSX - Vanguard Total Stock Market Index Inst` reported as publishing
  VTSAX while the row carries `ftk: "VITSX"`).
  **THE 2026-09-30 `tkExact` DEFECT IN A SECOND PLACE AND WORSE IN KIND.** That
  one re-implemented `lookupTicker`, stopped one stage short of `f.stk` and read
  **0** of 147,835 rows — a coverage metric wrong in private. ***A check
  PUBLISHES A CLAIM***, into `coverage-history.jsonl` and the auto-managed issue,
  and **a false alarm in a watched metric teaches the operator to skip the
  line** — which is how `site-test` stayed red for ten consecutive runs.
  **THE FIX BOTH REMOVED AND ADDED, the half a count would hide:** the chain is
  now the page's own order, and it **exposed 2 findings the old chain was blind
  to** (only `stk` answers, so `got` was null and the row was skipped) —
  reconciled to the row, **48 − 31 + 2 = 19**.
  **AND THOSE 2 ARE v528's DISCOVERY ONE LEVEL UP:** `IMPAX US SUSTAINABLE
  ECONOMY INST` — **`IMPAX` is the HOUSE's own name**, and `FILED_TK` reads any
  leading all-caps five-letter token ending in X as a symbol. So a **registry
  gate** ships with it, whole cost measured first: of the 19, **4 extract an
  unregistered string and in all four OUR ANSWER IS RIGHT** (`…Admiral(VXMAX)`
  where we publish VSMAX, `Fidelity 500 Index Fund (FXALX)` where we publish
  FXAIX — the filer's typo both times), and across all **3,152** rows `FILED_TK`
  matches, **224 (7.11%)** extract one. **The registry is NOT a general answer to
  the `INDEX` trap and the source says so — INDEX is registered**; it answers only
  *is this string a symbol at all*. **FAILS OPEN AND SAYS SO**, because the gate
  only removes findings.
  **FINAL: 48 → 15** (31 removed as already-correct, 2 as typos, 2 added by `stk`
  then gated out), **and all 15 agree with the page's render** — the property the
  check was always meant to have. **A NEGATIVE CONTROL PER CONDITION, each
  failing by name: dropping the `ftk`/`stk` stages reads 46** (the 31 return)
  **and dropping the registry gate reads 19** (the 4 return); HIGH holds at 4.
  **THE 15 ARE A CLEAN CLASS, NOT A RESIDUE: every one carries the symbol in a
  TRAILING PARENTHETICAL** (`… Institutional (VIEIX)`, `Fidelity Contrafund K6
  (FLCNX)`, `JPMorgan Mid Cap Growth Fund Class R6 (JMGZX)`) — **outside v528's
  LEADING anchor by construction**, so none has an `ftk` to consult. A sized
  extension of v528 whose corroboration is the filing's own printed symbol;
  *a fix for one POSITION of a class is not a fix for the class*, third surface.
  **`warn` 601 → 568 IS A LOSS OF FALSE FINDINGS, NOT OF COVERAGE** — 33 fewer
  lines, 0 fewer real defects. The trail steps down once and **must not be read
  as the data improving.** No published number moves; `audit-data` is a reporting
  step. `docs/accuracy-log.md` 2026-10-02 (00:3xZ).
- **#540 (cron, on MAIN) RAN `success` AND ITS ONE MOVING FIGURE WAS CHASED TO A
  CAUSE: `warn` 603 → 601 IS NOT IN THE STORE.** Everything else byte-identical
  to #539 — confident 60,170, lineups 59,822, entries 65,479, HIGH **4 =
  baseline**, overshoot 372, dl 19, pv 100, tkExact 37.2. The stores compare
  **byte-identical** (`plans`/`fields`/`count` in plans-all, `plans` in
  lineups-status, and `fee-percentiles`/`mtias`/`lineups-index`/`plans-index`/
  `map-points` hash equal once `generated` is removed), and **a local audit on
  that store reads 601**, matching #540 — so the two WARNs in #537–#539 came from
  a **CI-only run artifact** and 601 is the store's own number. *A metric that
  differs between CI and local is a question about the inputs, not the store*,
  already recorded for HIGH and now with its WARN-side instance.
  **AND THE `git diff` STAT WAS NO EVIDENCE IN EITHER DIRECTION:** these are
  single-line JSON stores, so *"9 files changed, 9 insertions, 8 deletions"* is
  what a timestamp-only change looks like **and what a total rewrite looks
  like.** The branch adopted main's data commit by fast-forward.
- **THE 23:2xZ DRAW, AND IT FOUND THE 05:4xZ SHIP'S DEFECT ONE SHARE CLASS ALONG
  — QUEUED, SIZED, SPLIT, OWNER-GATED, NOT SHIPPED: a filing stating the plain
  INSTITUTIONAL class publishes the ADMIRAL retail symbol, 2,767 rows / 1,571
  entries / 8,441,775 participants / $52,790,525,018.** Seed 20261001232, pool
  **59,822 published lineups / 91,581,640 ppl** weighted by `partEOY ||
  participants`; **Hoag Memorial Hospital Presbyterian** (11,699 ppl, 35 rows)
  and **Prospect Medical Holdings** (13,551 ppl, 28 rows), both clean at 0.997
  and 0.990. Prospect publishes `Vanguard Sm Cap Index Inst Fd` → **VSMAX** and
  `Vanguard Mid Cp Idx Instl Fund` → **VIMAX**, both ADMIRAL, a RETAIL class,
  where the SEC registers the Institutional class as **VSCIX** and **VMCIX**.
  The 05:4xZ ship covered Institutional **PLUS** (295 rows / 2,270,590 ppl);
  *a fix for one share class is not a fix for the class* — the shape this record
  has filed under POSITION, under COLUMN, under PHRASING and now under CLASS,
  twice in one day.
  **DO NOT CARRY 3,273 ROWS OR 14,759,239 PPL FORWARD AS THE CLASS.** That is the
  raw hit count and **481 rows / 7,127,366 ppl / $175,145,739,186 of it is the
  2026-09-21 demotion WORKING** — `Vanguard Institutional 500 Index Trust` →
  VFIAX\* at **$45,398,177,338** is a collective trust whose registered
  equivalent really is the 500 Index Fund. The dollar headline is almost entirely
  that half. **TYPE CELL CORROBORATES THE SPLIT: not one collective-trust row is
  in the unasterisked set** (2,233 `Mutual fund`, 524 blank, 7 `Cash /
  short-term`, 3 `Company stock`).
  **DECIDABLE WITHOUT AMBIGUITY, which is what makes the large half tractable:**
  1,983 hits sit in series carrying BOTH `Institutional Shares` and
  `Institutional Select Shares`, and a filing writing plain `Institutional` /
  `Inst'l` / `Inst` means the class REGISTERED under that exact name, so an exact
  class-name match settles it. **9 target symbols, 588 distinct filed names**:
  VBTIX 734 rows / 4,062,751 ppl, VSCIX 583 / 4,043,494, VMCIX 504 / 3,039,998,
  VTSNX 455 / 2,666,731, VIEIX 303 / 1,489,614, VITSX 183 / 859,776, + 5 rows.
  The 25 NOT decidable are named: 14 are `Vanguard 500 Index Fund`, whose series
  registers only `Institutional Select Shares` because the plain institutional
  S&P 500 vehicle is a **separate registered series** (VINIX), and 11 are funds
  with no institutional class at all.
  **NO BETTER ANSWER IS ALREADY STORED, AND THAT ZERO WAS CONTROLLED BEFORE IT
  WAS BELIEVED:** `stk` is absent on **2,767 of 2,767**, while the store carries
  **477,627** `stk` rows overall and the very entry that produced the finding has
  `MFEKX` on its MFS row. Unlike Bayada's PTTRX/PMBIX four hours earlier, the
  correct symbol is NOT on the row.
  **THE FEE IS NOT WRONG-BY-CLASS; IT IS CLASS-BLIND — the measurement that
  decides the remedy.** Asked of the function the page calls, the bare name,
  `… Admiral Shares` and `… Institutional Shares` return the **identical symbol
  and the identical number** for all six material funds (VBTLX 0.04, VSMAX 0.05,
  VIMAX 0.05, VTIAX 0.04, VEXAX 0.05, VTSAX 0.04). `fund-er.js` holds one entry
  per fund with the Admiral symbol attached and **the class word is read by
  NEITHER table.** So this is **not** the LifeStrategy case, where the fee
  travelled to a fund with twice the equity exposure: correcting the symbol
  cannot move the fee onto another fund's number. *A defect that looks like its
  predecessor can differ in the one respect that decides the remedy.*
  **FOUR ROUTES AND THE ONE THAT LOOKED FREE IS REFUSED BY ITS OWN FOOTNOTE.**
  (1) **ticker only** — strictly better on the symbol, no worse on the fee, but
  it moves 8.4M ticker cells and *a session must not do that unasked* (the rule
  written for the 5,826,968-ppl different-SERIES item); (2) **ticker + a SOURCED
  Institutional ER** — the right answer, and the job is **nine figures, six
  material**, the smallest sourcing task on this record; `data/fund-facts.json`
  is its designed home, refuses undated and unsourced figures, and **has been
  empty since 2026-09-17**, while vanguard.com is unreachable from the sandbox,
  so *a fee is SOURCED, never derived* makes it the `fund-facts` agent's;
  (3) **withdraw** — the American Funds move, but that was a FABRICATED fee and
  this is a correct fund under the wrong class label; (4) **demote to the
  labelled comparable** — looked free, needs no source, 481 siblings already
  carry it, and **REFUSED on reading `app.js:3100`**, whose footnote asserts
  *"That holding is a collective trust or separate account — it has no ticker and
  no published expense ratio"*, false of every one of these registered mutual
  funds. ***The asterisk is not a generic "approximate" marker; its footnote
  makes a specific claim about the VEHICLE***, so route 4 trades a wrong share
  class for a wrong vehicle — and **every count would have scored it a win.**
  **RECOMMENDATION, owner's call: route 1 now, route 2 as `fund-facts` fills in
  the nine per-class figures — they compose.**
  **AND THE DRAW HARNESS PRINTED `ratio 0.000` FOR BOTH PLANS, which is my field
  name and not the data** — a stored entry carries no `ratio`, so it had to be
  recomputed as menu-sum over `assetsEOY`. *A clean zero reports on the query*,
  and two independent plans reading exactly 0.000 is the tell.
  **ALSO LIVE IN THE SAME TWO MENUS, all of it already queued:** Hoag's
  `American Fund Europacfic Growth R6` resolves to **nothing** while Prospect's
  correctly-spelled `Am Fds EuroPacific Grth R6 Fd` → RERGX at 0.46 — *the filer
  dropped one letter and the row lost its fund*, and `Europacfic` IS an ordered
  subsequence of `EuroPacific`, so the LifeStrategy reach rule's shape reaches
  it; `PGIM Total Return Bond Fund - Class R6` ($24,364,986) resolves to nothing
  with the class stated; `Vanguard Equity-Income Fund Admiral Shares` publishes
  **VEIRX with no fee**; five further rows resolve to nothing (the matcher
  family). **And two shipped guards are visibly working:** Hoag's `2039; interest
  ranges from 4.25% to` renders as *"Participant loans — not a menu choice"* —
  the 11:4xZ ship reaching a reader twelve hours later — and all twelve of
  Prospect's Vanguard target-date TRUST rows carry the asterisk rather than
  asserting the mutual fund. `docs/accuracy-log.md` 2026-10-01 (23:4xZ).
- **BUILT, TRACED AND REVERTED 2026-10-01 23:3xZ — THE CATEGORY-TABLE FIX IS
  ALREADY IN `lib-4i` AS v74, AND THE GATE IT NEEDS DOES NOT EXIST. NOTHING WAS
  PUSHED; `PARSER_VERSION` IS BACK AT 196.** The queued rule — *a description
  shared by three or more rows whose IDENTITY cells differ is a CATEGORY* — reads
  as new and is **v74's own split**, scoped to rows the leading-share-count strip
  renamed (`_sl`). Its comment states the cost of unscoping it: a brokerage
  listing carries `Preferred stock` dozens of times under different issuers, and
  splitting them *"moved $19.4M out of the displayed list."* **So the work was
  never to write a rule; it was to widen a scope past a named cost** — the item
  was more nearly done than the queue said and harder, for the same reason.
  **BOTH FILINGS READ IN FULL, BOTH SUMS CONFIRMED TO THE DIGIT.** Bayer
  (`20260731094136NAL0024409521001`, **28,899 ppl**, $11.84B) files columns
  *labelled* `COLUMN A / B / C`; twelve `Vanguard Target Retirement … Trust Plus`
  rows carry `Target Retirement Trust Fund` in column C and sum to
  **$4,865,552,105**, the stored figure. Fifteen `Bayer Corporation Fixed Fund`
  rows over insurer identities sum to **$576,630,671**, also exact. Paramount
  (**33,764 ppl**) carries a strategy label on EVERY row.
  **AND THE SAME FILING WANTS THE OPPOSITE ANSWER TWICE, which is the finding the
  queue did not have.** Bayer's twelve vintages are twelve menu choices and must
  SPLIT; its fifteen fixed-fund rows are ONE option in fifteen wrap contracts and
  must NOT — this record already rules the wrap-contract-issuer family *correct as
  filed* at Textron. Paramount repeats it: nine LifePath vintages must separate,
  four `Large Cap US Equity Fund` sleeves (`Dodge & Cox`, `Wellington Management
  Company`, `Sanders Capital`, `Sustainable Growth Advisors`, filed under
  **Separately Managed Accounts**) must not. *The category test is TRUE and not
  SUFFICIENT: it does not say which column serves the reader.*
  **THE DISCRIMINATOR WANTED IS *does column B name a PRODUCT or a FIRM*, AND
  NEITHER CANDIDATE PREDICATE ANSWERS IT — ASKED DIRECTLY RATHER THAN ASSUMED.**
  `isHouseName` is TRUE for `Wellington Management Company` and `Dodge & Cox` and
  **FALSE for `Transamerica Life Insurance`, `Massachusetts Mutual` and `New York
  Life 29709`** (it is `HOUSE_ONLY` plus a corporate-suffix test at ≤5 words, so a
  firm ending in `Insurance` is not a house to it); `identityIsProductName`
  (v102's word-count-≥3 screen) calls `Wellington Management Company` a PRODUCT.
  **Four plain firms, two TRUE and two FALSE.** *Ask the guard before designing
  around it* — asked here, it refused the design.
  **THE BUILD'S OWN TRACE CONVICTED IT ON THREE COUNTS, each an observation from
  the shipped path and not a prediction.** (1) **The name is still the category**
  — the split works and twelve rows read `{Vanguard Target Retirement 2035 Trust
  Plus} Target Retirement Trust Fund`, the fund only in the issuer cell; making
  the fund the NAME is far larger, because v67's comment states the design
  explicitly (*"names stay byte-identical to v66, so dedup keys, region scores,
  confidence and the parser gate are untouched by design"*) and v161 records a
  real 34-row menu lost when a rule moved which REGION won. (2) **It INTRODUCED a
  double count** — Bayer 17 rows @ 0.993 → **34 @ 1.024**, two rows twice at
  identical values, because the filing renders the schedule twice across a page
  break and the double-render dedup (`e.vals.has(r.value)`) is what collapsed
  them; a fresh per-issuer key bypasses it and the `while (seen.has(alt))` loop
  mints a second key for the same issuer and value. **The v100/Dove Schools shape
  rebuilt by a fix written to REMOVE fabrications**, the fourth time a de-merging
  change has done it. (3) **It mis-attributed $1,954,847,000 to a $112M fund** —
  Paramount published `{Vanguard FTSE Social Index Fund} Passively Managed Fund`
  at that figure, three funds' values summed onto the smallest one's identity.
  *A PARTIAL split is worse than no split: the merged row at least named no fund.*
  **MY DIAGNOSIS OF (3) WAS WRONG TWICE** before the predicate probe settled it (I
  blamed `isHouseName` calling a fund a house, then `_dw` going unset), and the
  honest outcome was to revert rather than keep guessing.
  **RE-QUEUED AS THREE PIECES, NOT ONE:** (a) a firm-vs-product discriminator that
  cannot be either existing predicate; (b) a split that is **double-render-safe**,
  keyed so an equal value under an equal issuer still collapses first; (c) the
  name swap, whose effect on REGION SELECTION must be measured before it is
  believed. **Not shippable in one version.** `docs/accuracy-log.md` 2026-10-01
  (23:3xZ).
- **FOUND EN ROUTE, PRE-EXISTING ON THE LIVE v196 STORE AND EXACT — PARAMOUNT
  GLOBAL PUBLISHES ITS FOUR SMA SLEEVES TWICE: $627,746,000 DOUBLE-COUNTED, 9.9%
  of a $6,362,245,213 plan claimed twice, 33,764 readers.** The menu carries
  `Large Cap US Equity Fund` **$627,746,000** — the four Separately Managed
  Account rows merged on their shared column-C label — **and** `DODGE & COX`
  $161,677,000, `SANDERS CAPITAL FUND` $156,513,000, `WELLINGTON MANAGEMENT CO`
  $156,091,000 and `SUSTAINABLE GROWTH ADVISORS` $153,465,000, each typed `Stable
  value / GIC`, and **the four sum to 627,746 to the thousand.** That is why the
  plan reads **ratio 1.194** and sits in the `overshoot` set: *the overshoot is
  not noise, it is this.*
  **THE DOUBLE-RENDER DEDUP CANNOT SEE IT BY CONSTRUCTION**, which is what makes
  it a distinct item rather than an instance of a solved one: that dedup pairs a
  row rendered twice at the SAME NAME and the same value, and v145's second key
  only drops filler a recordkeeper varies — here the two renderings have
  **entirely different names**, the column-C label on one side and the managers'
  own names on the other, so neither key can pair them. **The identical values are
  the only witness available.**
  Adjacent to the category-merge item and NOT the same defect — fixing the merge
  would leave the four manager rows, fixing this would leave the merge. Sized at
  one plan and deliberately not generalised; the whole-store question is **how
  many plans carry a merged category row whose value equals the sum of other rows
  in the same menu**, computable from the store with no downloads.
- **SHIPPED AND MIRRORED 2026-10-01 20:1xZ (`8343219d → 155a3aa8`), UNFORCED ON
  BOTH CHECKS, data gate +0 / −0 BY ACK AND BY PLAN — A CONSERVATIVE ALLOCATION
  NO LONGER PUBLISHES AS A GROWTH ALLOCATION: 422 rows / 410 plans / 311,555
  participants / $202,887,862.** `Vanguard LifeStrategy Cnsrv Gr Inv` and 137
  sibling spellings published **VASGX, the 80/20 Growth Fund**, as fact for a
  holding the filing names Conservative Growth, which the SEC registers as
  **VSCGX, the 40/60 Fund** — twice the equity exposure, no asterisk, and the fee
  followed it. A REACH failure and not a missing entry: the unabbreviated name
  already resolved to VSCGX at 0.12, so **both right answers were in the repo**
  and only the vowel-dropped spellings could not reach them. The rule is an
  **ordered SUBSEQUENCE of the registered word anchored on its first letter**,
  with no vocabulary of abbreviations — a closed list is what hid the class.
  **THE FEE WAS A SECOND REACH FAILURE IN A SECOND TABLE:** `FUND_ER` carries the
  identical shape 600 lines above `FUND_TICKER`, so shipping the symbol alone
  would have left a correct symbol beside another fund's number. Both ship
  together.
  **VERIFIED INDEPENDENTLY AND THE PARTICIPANT FIGURE IS CORRECTED: 311,555, not
  the 323,826 in the commit message.** Three of four headline figures and every
  outcome column reproduce to the digit — ticker **+2 / −0 / 416 flipped**, fee
  **+3 / −0 / 395 changed**, all 395 `0.1 → 0.12` and **upward**, 0 asterisks, 0
  shown types — and the participant gap reconciles exactly: `participants` (line
  5) sums to 323,826 and **`partEOY || participants`, which is what `parts` packs
  and the page publishes, sums to 311,555.** All 410 carry a `partEOY`, so the
  `||` never falls through. ***A reader-reach figure has to be summed over the
  field the page publishes*** — the measure-through-the-page rule one level down,
  at a column name.
  **THE BEFORE/AFTER WAS MADE POSSIBLE BY AN EXACT PRE-FILTER, not a sweep:** a
  first attempt rendered all 1,724,078 rows twice and did not finish; all four
  changed arms open with the same `LS` prefix, asserted against the shipped
  source, so **6,156 rows** is the whole reachable population. The BEFORE side
  reverts both blocks through `apppath.mjs`'s `ER_PATCH` pairs, which THROW on a
  stale patch string.
  **THE ADVERSARIAL RISK THE DESIGN INVITES IS REAL AND ITS LIVE EXPOSURE IS
  ZERO:** `Core`, `Cost`, `Cat`, `Cove` and `Co` are ordered subsequences of
  *conservative* and `Mor`, `More`, `Mode`, `Md` of *moderate*, so the arm would
  claim a hypothetical `LifeStrategy Core Growth` — and **none of the 144 distinct
  transformations takes that path**, all read. `Cap`, `Cash`, `Class`, `Corp`,
  `Mid`, `Modified`, `Market`, `Master`, `Mutual`, `Managed` are refused.
  **CORROBORATION INSIDE THE CHANGED SET:** four rows **print VSCGX themselves**
  and `Vanguard LifeStrategy 40/60 Cons Gro` prints its registered allocation.
  **RESIDUE:** 16 rows / 9,009 ppl keep VASGX where the name garbles a non-Growth
  allocation; and one welded row naming THREE funds moves VSMGX → VSCGX, i.e. to
  whichever arm the table reaches first. Gates re-run independently: parser-gate,
  smoke, fund-er-test 83/26/19/18/28, `lib-disclose --selftest` 25/25,
  merge-name-test all pinned sets; `site-test` #136 dispatched on the exact commit
  because it shipped `[skip ci]`. `docs/accuracy-log.md` 2026-10-01 (19:4xZ,
  20:0xZ).
- **#539 (cron, on MAIN) RAN `success`** (data `8343219d`): the coverage line is
  **byte-identical** to #537's and #538's — confident 60,170, lineups 59,822,
  entries 65,479, HIGH **4 = the baseline**, warn 603, overshoot 372,
  overshootTrust 12, aggRow 113, dl 19, pv 100, tkExact 37.2 — which is the
  correct outcome for a scheduled incremental whose work list is the dead 403s.
- **A FEE WITHOUT A TICKER IS 314,299 ROWS AND IT IS NOT A DEFECT CLASS — DO NOT
  CARRY 314,299 OR 69,688,869 FORWARD AS ONE.** Over all **1,724,078** published
  rows: ticker AND fee 593,576; **ticker, no fee 91,423**; **FEE, NO TICKER
  314,299 / 50,064 plans / 69,688,869 ppl / $723,805,384,407** across 74,382
  distinct names; neither 714,983. **The headline invites the wrong reading and my
  first framing took it** — the population's most frequent members are
  `American Funds New World Fund` (940), `Vanguard Growth Index Fund` (717),
  `American Funds EuroPacific Growth Fund` (689), `American Balanced Fund` (610):
  **full house-and-product names whose pattern fee is RIGHT and whose TICKER is
  missing**, so the bulk is the queued ticker-coverage gap seen from the other
  side. The genuinely fee-shaped half is the **143,083 publishing an unattributed
  fallback** (0.1 / 0.2 / 0.35), and its largest single member — a bare
  `500 Index Fund`, 1,092 rows — is already owned by the fee pre-emption item.
  *A count of a condition is not a measure of a defect*, and the tell was that the
  condition's commonest members are rows the site gets right.
- **THE 19:0xZ DRAW, AND A TICKER READ AS A WRONG HOUSE TWICE BY ME AND RIGHT BY
  THE REGISTRY BOTH TIMES.** Seed 20261001190; **Bayada Home Health Care (50,157
  ppl, $398,592,342, 19 rows @ 0.990)** and **Group Plan Systems (12,833 ppl, 53
  rows @ 0.983)**. Bayada publishes **OLGAX** and **HRAUX**, whose letters suggest
  no house beside them; **I reconstructed the rows FROM THE SYMBOLS** — writing
  them up as `Oppenheimer Developing Markets Y` and `Hartford Schroders US Small
  Cap Opps`, two plausible houses whose initials fit — and **neither row exists.**
  The actual rows are `JPMorgan Large Cap Growth Fund Class A` and `Carillon Eagle
  Mid Cap Growth Fund Class R6`, and the registry registers OLGAX and HRAUX as
  exactly those, class included. ***A ticker is not a reading; the series name
  is*** — this record's own rule about the code, committed by the person writing
  it down, one commit from publication. Whole-population: **892 rows / 158
  distinct / 1,163,449 ppl carry one of the two symbols and every one is
  correct.**
  **THE REAL DEFECT IS OWNER-GATED AND NOW HAS ITS NAMED LIVE INSTANCE:** Bayada
  publishes `PIMCO Total Return II Fund Institutional Class` → **PTTRX at 0.51**,
  the Institutional class of *Total Return Fund* with no II, on **7.1% of a $398M
  plan** — while **the row's own stored `stk` is PMBIX**, the registered
  Institutional class of *Total Return Fund II*. The different-SERIES item (3,491
  rows / 5,826,968 ppl) with **the correct answer already stored on the same
  row**; its same-series sibling is two rows below (`Vanguard Total Bond Market
  Index Fund Investor Shares` → **VBTLX, ADMIRAL**, at 0.04, `stk` VBMFX).
  **Four further live instances of queued items in one menu** — `American Funds
  EuroPacific Growth Fund Class R-6` publishes 0.46 and no ticker although the
  class is stated; `Vanguard Selected Value Fund Investor Shares` publishes VASVX
  and no fee; `Dryden S&P 500 Index Fund` typed `Pooled separate account`
  publishes nothing; `Blackrock Eq Dividend K`, `Invesco Small Cap Value Fund
  Class R6` and `Harding Loevner … Institutional Class` resolve to nothing — plus
  Group Plan Systems' `American Funds American Balanced Fund` at **0.28 with no
  class stated** and `TD Bank, N.A.` typed `Mutual fund`. **And the shipped loan
  guard is visibly working in the same menu:** `Repayments are` renders as
  *"Participant loans — not a menu choice"*.
- **QUEUED, SIZED, READ, NOT SHIPPED — A PAGE-BREAK CAPTION LEADING A FUND'S
  NAME: 32 rows / 30 entries / 15,636 participants / $96,666,568**, 32 distinct
  names, **every one read and not one a fund actually named `Continued …`**:
  `continued Vanguard Target Retirement Fund 2045`, `Continued Fidelity Freedom
  Index 2030 Fund Investor Class`, `(Continuation) PIMCO RealPath Blend 2055
  INST`, `Continued from previous page Principal LifeTime Hybrid 2035 Fund`.
  **The 2026-09-28 fix closed this class in the TRAILING position and the leading
  one is outside it BY CONSTRUCTION** — the leading-parenthetical arm requires the
  string to OPEN with a vehicle TYPE. *A fix for one POSITION of a class is not a
  fix for the class*, the sibling of that entry's own COLUMN observation.
  **Part honesty and part coverage, measured: 8 of 32 already publish a ticker and
  16 a fee** (`fund-er.js` reaches through the caption on many), and the ones to
  win are `Continued Vanguard Value Index Fund` and `continued Vanguard Wellesley
  Income Admiral Class Fund`, which publish nothing while their bare names
  resolve. **THREE MEMBERS ARE PURE CAPTION AND MUST BE TYPED, NOT STRIPPED**
  (`(continued)` alone, `Continued from page 10`, `Continued Balance Brought
  Forward`) and two are loan prose that must keep its loan typing. Display-side,
  no vocabulary beyond the caption word.
- **SHIPPED AND MIRRORED 2026-10-01 18:3xZ (`3c1d398a → 2aceb00c`), UNFORCED ON
  BOTH CHECKS, data gate +0 / −0 BY ACK AND BY PLAN; #538 dispatched on the
  exact commit and observed `in_progress` — A ROW TYPED EMPLOYER STOCK THAT
  NAMES A DIFFERENT COMPANY PUBLISHED THE SPONSOR'S SYMBOL: 51 store rows / 57
  (plan,row) pairs / 47 plans / 1,061,663 participants / $4,659,144,002.**
  `tk` was `stockRow ? (plan.ticker || null) : …`, so where a row was judged
  employer stock the page did not WITHHOLD a symbol — it published the
  sponsor's own, whatever the row was named. Bank of America's 250,040 saw
  `INTERNATIONAL BUSINESS MACHS` and `EXXON MOBIL CORP` as **BAC**; FedEx's two
  plans (310,374) `Master Trust` as **FDX**; and the GE spin-off read wrong in
  BOTH directions — GE's plan (105,231) printed `GE Vernova Common Stock` as GE
  where GE Vernova is GEV, and Ropcor's (33,134, GE Vernova's own filer)
  printed `GE Common Stock` as GEV. **All 51 read; 0 correct symbols
  withdrawn.** It WITHDRAWS and never asserts: arm II identifies the other
  company and the symbol is still not published, because the `Company stock`
  type came from a section heading our parse inherited and what the holding IS
  remains unknown. Whole-store over 53,822 cells with the BEFORE side loading
  HEAD's app.js AND HEAD's lib-disclose: ticker **−57 / +0 / 0 flipped**, fee
  +0 / −0 / 0, **0 asterisks, 0 shown types**, every column positive-controlled
  first. **RESIDUE NAMED:** two Rockwell rows (15,827) keep ROK on `ELEVANCE
  HEALTH INC` and `OLIN CORP`.
  **THE QUEUE'S 87 ROWS / 1,187,546 PPL IS SUPERSEDED and was 1.7x too large in
  rows** — every false positive it named is verified KEPT (`COMMON STOCK` at
  PepsiCo 167,015, `Common stock` at Cisco 72,556, `MCDONALD'S CORPORATION`
  32,808, `Employer Stock` at Equifax 10,302, `IFF Common Stock` 7,094, `AIT
  INC` 5,948, `Corporate common stock` at Glacier 4,651) — and three instances
  it did not name are new (`The Coca Cola Company` at COKE, 19,154, **the
  bottler and not KO**; a second ADM plan 11,181; a second CSX plan 5,776).
  **A RESIDUE TEST WAS WRITTEN FIRST AND ITS OWN OUTPUT KILLED IT:**
  whole-store it withdraws 85 rows, destroying IBM's own 149,818-ppl row, PPG's
  `Investment in PPG Industries, Inc.`, Markel's `common stock, cost of` and
  Schwab's Ameritrade row — *an employer-stock row legitimately carries
  arbitrary prose about the FUND*, so an empty residue is not available as
  evidence. 42 pins in the generator, 35 in `smoke-test.mjs`, **both tethers
  shown to FAIL** (one drifted condition fails smoke by name on exactly 1 of
  35, a drifted `sponsorNameKey` on 6 of 6); a negative control per condition
  built directly from the shipped body (token 325, short 11, caption 13, arm II
  7, public name 1, rest-is-caption 1 — the GE row), and **three conditions
  measure DECORATIVE and are labelled as such in the source.** parser-gate,
  smoke, fund-er-test (62/26/19/18/18), merge-name-test and `lib-disclose
  --selftest` green; `diff-lineups` 0 in every direction. **REPORT path only as
  a GUARANTEE: `build-seo-pages.mjs` renders two columns and has no symbol cell
  for a holding at all.**
  **AND I TOLD THE AGENT THIS ITEM WAS ALREADY SHIPPED, WHICH IS THE MOST
  EXPENSIVE THING IN THE CYCLE.** I grepped `app.js` and found
  `employerStockSymbolOk`, `sponsorTickerIndex` and the call site, and reported
  the item closed by the 14:5xZ commit. **At `3c1d398a`, the commit actually
  mirrored, all three are 0 and line 2702 is still the bare `stockRow ?
  (plan.ticker || null)`** — every line I read was the agent's own uncommitted
  work, and had it believed me it would have abandoned a real build reaching
  1,061,663 readers. I sent that claim in the same message as the warning that
  *a harness slicing a file mid-edit measures nothing*. ***A `grep` of the
  working tree is a MEASUREMENT and rots the same way a harness does: while an
  agent holds the tree, read through `git show <ref>:` and never the path.***
  **AND THE SEVENTH INCOMPLETE TRANSCRIPTION, with my diagnosis of it half
  wrong.** I reported `apppath.mjs` feeding `plan.publicName` and
  `plan.otherSponsors` where app.js computes `TICKER_NAME[plan.ticker]` and
  `sponsorTickerIndex()`, and concluded arm II was DISABLED in the harness. The
  agent's control refutes that — dropping the index moves its count **51 → 44**
  naming exactly the 7 arm-II rows, dropping the public name **51 → 52** naming
  exactly `GE Vernova` — so its callers supplied what the contract named and
  **mine threw**, because I passed a `loadPlans` proxy. *A field absent for one
  caller is not an absent field.* The drift risk was real for a future caller
  and is closed by the harness building the index itself. **Three further gaps
  in that `render` were real**, one of them that `er` called
  `fundERFiled(f.name)` where app.js calls `fundERRow(f)`, so every "publishes
  a fee today" figure through it UNDER-COUNTS — **both of this cycle's fee
  figures were re-asked through the repaired harness and are unchanged** (97
  target-date rows: 15 tickers / 36 fees; 835 Spartan rows: 1 / 365), the extra
  arm reaching 0 rows in either population. `docs/accuracy-log.md` 2026-10-01
  (17:5xZ, 18:3xZ).
- **#537 RAN `success` AND IS MIRRORED — 2026-10-01 17:2xZ (`7429639f →
  3c1d398a`), UNFORCED ON BOTH CHECKS, data gate +0 / −0 BY ACK AND BY PLAN.
  EVERY PRE-REGISTERED FIGURE PASSED AND THE PRODUCTION MERGE REPRODUCED THE
  LOCAL ONE EXACTLY.** Read out of the ARTIFACT, the merge log's blob host
  being `connect_rejected`: `sec tickers` **477,627 rows across 47,915 plans
  (113,424 on a blank type cell)**, all three to the digit; `filed tickers`
  2,166 / 75 unchanged; and diffing the data commit against the commit I wrote
  gives **`name` 0 differing rows, `stk` 0, `ftk` 0, 0 acks added or removed, 0
  row-count changes.** CONFIDENCE DIFF **+0 / −0**; `confident` back to
  **60,170** from #536's 60,165, so the junk gate held; lineups 59,822, entries
  65,479, HIGH 4, warn 603, overshoot 372, overshootTrust 12, aggRow 113, dl
  19, pv 196 at 99.97%, `tkExact` 37.2 and `tkComparable` 3.27 unmoved as
  registered. `site-test` #134 `conclusion: success` on `adc213f4`.
- **THE HIGH BASELINE IS 4 AND BOTH DESCRIPTIONS OF ITS COMPOSITION ABOVE ARE
  WRONG — CORRECTED 2026-10-01 18:0xZ.** It is **3 `contrib` +
  `fabricated-name`** (Attentive Mobile, Napa Management Services,
  Transystems), not "the 4 `contrib` outliers again" and not "4 `contrib` +
  `fabricated-name`" = 5. `audit-generic-names` reads **237 plans / 508 rows**
  against the 230 escalation threshold, so that HIGH is STANDING, and a fourth
  contrib outlier left the store on the DOL refresh. **There is no CI-vs-local
  divergence here** — `audit-data` and the standalone script both read 237. *The
  total being right by coincidence while both readings of it are stale is this
  file's own staleness hazard aimed at itself.*
- **QUEUED, SIZED, HANDED OFF, NOT SHIPPED 2026-10-01 18:3xZ — A CONSERVATIVE
  ALLOCATION PUBLISHED AS A GROWTH ALLOCATION: 295 rows / 295 plans / 243,131
  participants / $151,258,543 assert VASGX, the LifeStrategy 80/20 Fund, for a
  name that says Conservative Growth**, where the SEC registers it as **VSCGX,
  the 40/60 Fund** — twice the equity exposure, no asterisk. `Vanguard
  LifeStrategy Cnsrv Gr Inv` and 62 sibling spellings lose the
  `Cnsrv`/`Consv`/`Cons` token and the remainder matches the Growth arm; one
  member is named `Vanguard LifeStrategy **40/60** Cons Gro`, printing VSCGX's
  own registered allocation beside our 80/20 answer.
  **IT IS A REACH FAILURE AND NOT A MISSING ENTRY, which is what makes the
  correction fully sourced inside the repo:** the unabbreviated `Vanguard
  LifeStrategy Conservative Growth Fund` already resolves to **VSCGX at 0.12**
  while every abbreviation gives **VASGX at 0.1**, so the fee travels with the
  wrong fund and errs in the **flattering** direction, and both right answers
  are already present (`sec-funds.json`, `fund-er.js`). **The sharpest pin is
  one page publishing all three:** WellSpan Health (28,242 ppl) shows Growth →
  VASGX (right), Moderate Growth → VSMGX (right) and `Cnsrv Gr Inv` → **VASGX
  (wrong)**. **Row count equalling plan count, 295 / 295, is itself
  corroboration** — a plan files one such row. `fund-er.js:800` already records
  that LifeStrategy has only ever had the Investor class, so there is no
  share-class question, only which of four funds (VASIX 20/80, VSCGX 40/60,
  VSMGX 60/40, VASGX 80/20).
  **FOUND BY THE GATE ON A DIFFERENT, UNSHIPPED ITEM, WHICH IS THE ARGUMENT FOR
  THE GATE.** The pooled-split entry (9,050 rows / 4,420,537 ppl) is blocked on
  reading its 2,001 names against their registered funds; read against the
  registry's own SERIES names that is **1,808 agree / 180 disagree / 14 no
  series**, and the disagreements are mostly MY check's weakness because **the
  registry abbreviates too** — `American Funds EuroPacific R6` → RERGX reads as
  a mismatch only because the series is `EUPAC Fund`, and `JPMorgan LgCp Grw
  Fnd R6` → JLGMX and `Fid Intl Indx` → FSPSX are correct and unmatchable by a
  content-word test. **So that item's blocker shrinks from 2,001 names to about
  180** — and this defect was inside the residue, LIVE rather than latent.
  Remaining: the whole-store before/after through all four resolvers; whether
  the `Moderate` arm has the same reach failure (`Vanguard Life Strat Mod Gr`
  resolves to null today); and the 2,845 LifeStrategy rows suppressed by the
  pooled type split, which must not start publishing as a side effect. **`VG
  LifeStrat Inc` → null where VASIX is the 20/80 Income fund is a BLANK and so
  coverage, not a defect — do not bundle it.**
- **THE 17:1xZ DRAW FOUND A CATEGORY TABLE PUBLISHED AS A FUND MENU AND THE
  CAUSE IS PROVED TO THE DOLLAR IN TWO FILINGS — QUEUED PARSER-SIDE, SIZED, NOT
  SHIPPED.** Seed 20261001170; NTT Data Americas (22,449 ppl, 26 rows @ 0.993)
  and **Bayer Corporation (30,109 ppl, $11.84B, 17 rows @ 0.993)**, whose
  largest row is `Target Retirement Trust Fund` at **41.4% / $4,865,552,105**
  with a blank type, no ticker and no fee.
  **THE PARSE TOOK COLUMN C.** Bayer's 4i schedule lists **twelve vintages
  individually** — `Vanguard Target Retirement 2020 … 2070 Trust Plus` and
  `… Income Trust Plus` — every one carrying `Target Retirement Trust Fund` in
  **column C, Description of Investment**, while column B holds the real
  vintage. **The twelve sum to $4,865,552,105: not "about", the stored
  figure.** Its twenty `Bayer Corporation Fixed Fund` rows merge the same way.
  **READING A SECOND FILING WIDENED THE CLASS PAST TARGET-DATE. Paramount
  Global (36,431 ppl)** publishes **two** merged category rows totalling
  **59.5% of its plan**: `Target Retirement Date Fund` **$1,914,109,000** =
  nine BlackRock LifePath vintages (exact) and **`Passively Managed Fund`
  $2,606,618,000** = five rows (exact), with six shared descriptions in all and
  `International Equity Fund` merging four more. **So the class is not a
  target-date vocabulary — its largest member is `Passively Managed Fund` — and
  the merge CROSSES the filing's own section headings.** What 36,431 people
  cannot see is that their plan holds a **$1,525,754,000 BlackRock S&P 500
  Index Fund**, with Mawer, GQG Partners, INVESCO, Pzena, Wasatch and Cramer
  Rosenthal McGlynn behind the same four labels.
  **THREE WITNESSES ARE BLIND BY CONSTRUCTION:** neither phrase is a bare
  vehicle type so `isGenericTypeName` is false; 41.4% and 34.3% sit under
  `audit-dominant-row`'s 90% floor; and **a merge does not change the sum, so
  the ratio cannot see it** — Bayer is 0.993, a figure that reads as a clean
  parse. This is the gap this file names in the abstract (*"`GENERIC_TYPE_NAME`
  covers investment VEHICLES and not ASSET CLASSES"*) with a cause and a dollar
  figure, and it is where the owner-queued WHOLE-TABLE test points.
  **THE EXISTING MECHANISM IS RIGHT AND ITS VOCABULARY IS THE HOLE, which the
  same filing proves in the other direction:** Bayer's first fifteen rows share
  `Registered Investment Company` — also ≥3 rows, also differing identities —
  and the parser correctly preferred column B there, because that phrase IS in
  the vocabulary. **So the structural replacement is already visible in the
  data: a description shared by three or more rows whose IDENTITY cells differ
  is a CATEGORY, not a fund name.** No new vocabulary, no new source.
  **SIZED BY AN ABSENCE and the figure is a LOWER BOUND on one arm:** the store
  holds the merged row, so what can be counted is the loan-maturity class's own
  test — a menu naming a target-date allocation with NOT ONE VINTAGE — giving
  **97 rows / 75 plans / 211,105 participants / $12,670,197,497** at ≥5% of a
  menu, with **Paramount's $2.61B row OUTSIDE it.** Largest: Bayer $4.87B;
  Paramount $1.91B; Sephora (24,602) at **72.2%**; Topbuild (19,534) at
  **74.5%**; Polaris (11,172) **62.3% across TWO** rows; Saint Louis
  University's two plans 47.8% and 43.7%.
  **DO NOT CARRY 213 ROWS OR 220,916 PPL FORWARD, AND 97 IS NOT CLEAN
  EITHER.** My first screen read 213 / 99 / 220,916 because its vintage test
  was WORD-bounded and `BlackRock LifePath Index 2050K` has a letter after the
  year; digit-bounded it reads 97, and **at least 13 are still my own false
  positives** — `Vanguard Target Retirement Income` (5 rows, **the Income
  vintage IS a vintage**, VTINX at 0.08) and `State Street Target Retirement
  2060**1**` (8 rows, a FOOTNOTE DIGIT defeating a digit boundary, every answer
  correct). *Two false-positive classes in one screen inside ten minutes, both
  caught by reading the members rather than the count.*
  **AND THE FEE QUESTION ANSWERS THE OPPOSITE WAY FROM WHAT THE SIZE SUGGESTS —
  it is an HONESTY defect, not a fabricated-fee one.** 15 of 97 publish a
  ticker and 36 a fee, mostly the false positives being right, and **every
  headline member publishes NO ticker and NO fee**. The genuinely wrong numbers
  are about four rows: Lighthouse For The Blind (639 ppl) prices a bare
  `Vanguard Target Retirement` at 0.08 on **55.1% / $23,846,480**, Polaris's
  `Common collective trust (CCT) lifecycle` resolves to **VFORX\***, the 2040
  fund, on $132,373,289, and Original Footwear's `Nuveen Lifecycle Index Funds`
  prices a plural category at 0.1 on 69.5% of its menu.
  **A THIRD NAMED INSTANCE OF THE 90% THRESHOLD LIMIT:** Bear Mountain
  Healthcare (1,807 ppl) publishes `Vanguard Target Retirement` at **87.8%**,
  2.2 points under the floor, beside Tides Center 84.4%, Finch Paper 88.2%,
  Flashparking 82.2%, Fiber Instrument 89.4%. The answer is unchanged — the
  floor must not come down, General Motors leading at 66.4% with real funds
  behind it — so this needs the parser fix, not a threshold move. **PARSER-SIDE
  and it needs a bump plus a region-contest change in `lib-4i`**; **ATTEMPTED AND
  REVERTED 23:3xZ — read the v197 bullet above before touching this again: the
  rule is v74's, and the gate it needs does not exist.** Paramount also publishes `Evergreen &` at
  9.0% / $679,811,000, a truncated name and a third defect in one menu.
  `docs/accuracy-log.md` 2026-10-01 (17:2xZ).
- **AND A FAMILY NOW IN TWO CONSECUTIVE DRAWS IS THE LARGEST NAMEABLE-FUND GAP
  OPEN — QUEUED, SPLIT, NOT SHIPPED: 835 rows / 350 plans / 2,541,569
  participants / $49,924,416,708 carry a `Spartan` name, and exactly ONE
  publishes a ticker while 365 publish a FEE.** `Spartan` was Fidelity's index
  brand until the 2016 rename, so nothing in `fund-er.js` or the SEC index
  answers to it. NTT Data's three `Spartan … Index Pool Class E` rows are
  **32.4% of its menu** (`Spartan 500 Index Pool Class E` alone 23.7% /
  $680,617,115), almost exactly Unum's 32.1% one cycle earlier. Truist
  Financial (59,476 ppl) **32.0% across 5 rows**, The Crawford Group (98,721)
  15.3%, Ernst & Young (96,780) 12.2%, Tesla (89,700) 15.8%, CBRE (51,826)
  19.9%, Quest Diagnostics (62,875) 13.7%, Microsoft's 183,509 at 0.3%.
  **THE ASYMMETRY IS ONE THIS RECORD HAS NAMED BEFORE: the fee column asserts
  where the ticker column refuses** — 834 of 835 publish no symbol and 365
  publish an estimated ER, so `fund-er.js` prices a holding it cannot name.
  **AND THE FAMILY SPLITS ON ONE FILED WORD, which decides what may be claimed
  for each half.** `Spartan 500 Index **Fund**` (27 rows), `Fidelity Spartan
  500 Index Fund` (18), `Spartan 500 Index` (16), `Spartan Extended Market
  Index Fund` (15), `Spartan International Index Fund` (13) and siblings name a
  REGISTERED fund that still exists under its current name, so an EXACT ticker
  is reachable — a rename mapping, and **a rename is a FACT that must be
  SOURCED, never inferred from the brand.** `Spartan 500 Index **Pool** Class
  C/D/E` (33 + 18 + 12 + 10 + 8 … rows) is a COMMINGLED POOL with no registered
  class, where a labelled comparable is the most that may be published — what
  44,484 other pooled rows already carry. Table work for `funds-and-tickers` or
  sourced `data/fund-facts.json` entries; **not startable by a session alone,
  because every mapping needs its rename documented per fund.**
- **THE 16:1xZ DRAW, AND ITS SIZING PREDICATE DIED ON A LESSON THIS RECORD
  ALREADY CARRIES VERBATIM.** Seed 20261001164; **Textron (36,001 ppl, 33 rows
  @ 0.975)** and **Unum Group (12,797 ppl, 32 rows @ 0.989)**, both largely
  clean.
  **THE REAL FIND IS ONE ROW: Textron publishes `Wells Fargo/BlackRock` at
  $8,503,000 typed `Cash / short-term` with 0.45 beside it** — two houses
  separated by a slash, which is no fund at all, carrying a fabricated number.
  Its issuer cell is a TRUNCATED section caption (`Security-backed (Synthetic)
  Investment Contracts (in Managed`). The bare-house class is queued
  PARSER-side because replacing the name is a claim; **withdrawing the FEE is
  DISPLAY-side and is the shape of five fixes already shipped this week**, and
  `isNamelessFundRow` cannot reach it because that predicate asks whether the
  name is a bare VEHICLE TYPE and a bare HOUSE is not one.
  **BUT IT IS NOT SIZED, AND THE ATTEMPT MUST NOT BE RETRIED THE SAME WAY.** My
  screen built the house vocabulary from strings that stand alone in the ISSUER
  column at least fifty times, and it returned **63,602 rows / 9,319 plans /
  14,555,895 ppl** whose top entries are `Vanguard Target Retirement 2040
  Fund`, `Vanguard Institutional Index` and `Vanguard Wellington` — **real
  funds with correct tickers and correct fees.** The cause is written in this
  file already: *"The identity column legitimately carries fund names since
  v126, so frequency cannot tell a firm from a product."* An issuer cell
  reading `Vanguard Target Retirement 2030` put `target` and `retirement` into
  the house set. **DO NOT CARRY 63,602 OR 14,555,895 FORWARD** — and the
  implausible size was the tell, which is the only reason no number was
  published from it.
  **AND A NAMED LIVE INSTANCE OF AN OWNER-GATED ITEM: Unum publishes `Fidelity
  Puritan K6 Fund` → FPURX at 0.47**, where the SEC registers the K6 fund as a
  separate SERIES — the different-SERIES override (3,491 rows / 5,826,968 ppl,
  `Puritan 21` of them), still the owner's call.
  **AND A COVERAGE GAP IN THE SAME MENU: Unum's three `Spartan … Index Pool
  Class D` rows are 32.1% of its menu with 0 tickers and 0 fees** — Fidelity's
  former index brand as a commingled pool, the matcher family. Textron's four
  insurance-company rows (`Pacific Life`, `Voya`, `Metropolitan Tower`,
  `Prudential`) at ~$1.7M each are the recorded wrap-contract-issuer family and
  are correct as filed.
- **SHIPPED AND MIRRORED 2026-10-01 16:2xZ (`cb01bacd → adc213f4`), UNFORCED ON
  BOTH CHECKS, data gate +0 / −0; #537 AND `site-test` #134 BOTH FIRED ON THE
  EXACT COMMIT — A REPAIR THAT MAKES A JUNK ROW LEGIBLE HANDED FIVE WHOLE MENUS
  TO A JUNK GUARD, 61,261 PARTICIPANTS.**
  **#536's PRE-REGISTRATION FAILED AND THAT IS WHAT CAUGHT IT.** `confident` was
  registered **+0 / −0** and the run produced **60,165 against 60,170**, on a
  change that structurally cannot drop an entry.
  **CAUSE, DIAGNOSED RATHER THAN GUESSED:** the five losses diff
  **byte-identical** against the commit I wrote — same row counts, 0 field
  changes, `name` moved on **0** rows — with only `c` flipped and `pv` unchanged
  at 196, so fetch-4i never re-parsed them. **`merge-4i:136` is a JUNK-NAME
  DEMOTION that is ENTRY-level:** one row whose name carries Form 5500
  vocabulary withdraws the whole lineup. Most of the cipher class is v193's
  COVER-PAGE family IN CIPHER, and decoding `3ODQ 1DPH`, `$GG OLQHV 6d` and
  `(PSOR\HU ,GHQWLILFDWLRQ` produces exactly what `JUNK_NAME_RE` reads
  (`^plan name`, `add lines? \d`, `employer identification`) — all five to the
  pattern. **Fiserv's 37-row Vanguard menu (39,782 ppl) was convicted by three
  caption rows among it**, with Lifespan 19,490, Plastic Ingenuity, McElroy and
  Antonini.
  **THE DEMOTION IS NOT WRONG; IT IS AIMED ELSEWHERE** — its own comment says it
  exists for a STORED entry whose PDF became undownloadable, where the
  parser-side guards can never reach the junk. These five are fresh parses at
  the current pv with no error code, and the right answer to three caption rows
  in a thirty-seven-row menu is to drop or type those ROWS. ***A guard's live
  population is not always the population it was written for.***
  **AND THE "COMPOSITION WIN" THE FIRST WRITE-UP CLAIMED WAS A COMPOSITION
  LOSS.** I recorded making the captions legible as a benefit because an arm
  that reads words could then see them; **one arm that reads words is a guard
  that withdraws the plan.** *Price a legibility fix against the guards that
  READ names, not only against the readers.*
  **SHIPS: 17 rows / 10 plans / 125,017 participants / $83,643,044**, 12
  distinct, against 23 / 13 / 127,006 before the gate; `confident` back to
  **60,170**, CONFIDENCE DIFF **+0 / −0** through the real merge. **COST NAMED:
  6 rows / 5 plans / 61,261 ppl keep their ciphered captions**, exactly as
  before this arm existed, and those five plans keep their MENUS. The fund-name
  half is untouched — Edelman's VWNAX, both Retriever Nuveen rows, Petra's
  Putnam.
  **OUTCOME ON THE ARTIFACT: 2 crawlable pages change and both are
  RESTORATIONS** — Fiserv regains `Vanguard Institutional 500 Index Trust
  $926,549,000` and 26 rows behind it, Lifespan the same.
  **THE REGRESSION NEVER REACHED A READER:** main was still at the commit
  carrying my local merge, where all five are confident, and only the dev branch
  held #536's data — so the hold between a run's verdict and its mirror is what
  contained it.
  15 pins, **three flipped to `null` with the justification in the file, and the
  DECODE claim they were written to assert pinned SEPARATELY against the
  gate-dropped variant (3/3)**; a negative control per condition failing by name
  on exactly its own cases (1 / 1 / 2 / 1 / **3**). parser-gate, smoke,
  fund-er-test (62/26/19/18/18) green. `docs/accuracy-log.md` 2026-10-01
  (16:2xZ).
- **THE 15:4xZ DRAW, AND ITS FINDING IS AN INCONSISTENCY INSIDE ONE MENU —
  QUEUED, CAUSE DIAGNOSED, SIZED, NOT SHIPPED: a POOLED row whose name is in
  `FUND_TICKER` but not in `FUND_COMPARABLE` publishes NOTHING, 9,050 rows /
  2,861 plans / 4,420,537 participants / $28,599,516,351 across 2,001 distinct
  names.** Seed 20261001154. **Walmart (1,970,230 ppl, 42 rows @ 0.952) reads
  CLEAN end to end** — v130's wrapped-name fix still holds, `MSCI ACWI ex-U.S.
  IMI Index Non-Lendable Fund` whole at $4.71B — with only the queued bare-house
  row `Fiera Asset Management USA` at 3.2% / $1.77B.
  **Spanish Cove Housing Authority (200 ppl) is where it shows: 21 rows, every
  one typed `Pooled separate account` by Standard Insurance Company, and exactly
  ONE publishes anything** — `T. Rowe Price Mid-Cap Growth` → RPMGX\* at 0.77 —
  while `Vanguard Windsor II Adm`, `Fidelity 500 Index`, `MFS Value R6` and
  `JPMorgan Large Cap Growth R6` publish blanks.
  **CAUSE ASKED OF THE SHIPPED FUNCTION RATHER THAN REASONED ABOUT:**
  `fundTickerInfo` splits on `pooled`, and when the TYPE names a non-registered
  vehicle it consults **only `FUND_COMPARABLE`** — the hand-verified table — and
  never `FUND_TICKER`. So two rows of one menu are treated differently for a
  reason about OUR TABLES rather than about the filing.
  **IT IS NOT A REVERSAL OF THE 2026-09-21 DEMOTION BUT THE THIRD OPTION THAT
  DEMOTION DID NOT TAKE.** That change withdrew 878 rows asserting
  `comparable:false` — *the plan holds VWNAX* — and its comment is right: a
  separate account filed as `VALIC Vanguard Windsor II Fund` does not hold the
  Vanguard fund, it holds an account investing in it at a higher cost. The
  weaker claim, `comparable:true` with the asterisk and footnote, is exactly
  what the 44,484 pooled rows that DO publish already carry.
  **AND MY OWN FIRST PROBE COMMITTED THE MISTAKE IT WAS WRITTEN TO FIND:** its
  `bare` and `+issuer` columns called `fundTickerInfo` with a BLANK type, so it
  tested the lookup and not the demotion and reported every name resolving.
  *Measure through the function the page calls, WITH THE ARGUMENT THE PAGE
  PASSES* — inside the probe written to find a case of it.
  **NOT SHIPPED on SIZE and on reading, not on evidence:** 4.4M participants
  gaining an asserted-by-asterisk comparable is larger than any ticker change
  since the manager gate, and all 2,001 distinct names must be read against
  their registered funds first. Largest members: Lowe's 303,546 (1 row),
  Insperity 229,666, Accenture 115,910, T-Mobile 96,694 (15.3% of menu), DaVita
  78,487 (17.7%); and **Mapes Food Services (224 ppl) is 100.0% of its menu**.
  **HARNESS NOTE: the sweep rendered all 1.7M rows and could not finish; the
  predicate's own first condition — the TYPE names a pooled vehicle — is an
  exact pre-filter and it ran in minutes.** *A structural fact beats a sweep*,
  and this is the mirror of the cross-column audit's pre-filter, which was exact
  but NOT fast.
- **SHIPPED AND MIRRORED 2026-10-01 15:4xZ (`4c4527ad → da6a5ea3`), UNFORCED ON
  BOTH CHECKS, data gate +0 / −0 BY ACK AND BY PLAN; #536 AND `site-test` #133
  BOTH FIRED ON THE EXACT COMMIT AND WERE OBSERVED QUEUED — A BROKEN FONT
  SHIFTED A RUN OF THE NAME BY +29: 23 rows / 13 plans / 127,006 participants /
  $87,902,604**, 18 distinct transformations, all read. `$GPLUDO` is `Admiral`,
  `1XYHHQ` is `Nuveen`. Edelman Financial Engines (2,315 ppl) published
  `Vanguard Windsor ,, $GPLUDO )XQG` at 2.8% of its menu; the bulk by
  participants is v193's Form 5500 COVER-PAGE family IN CIPHER (Fiserv 39,782,
  Philips 29,491, Gallagher 29,477, Lifespan 19,490), which every arm that reads
  words is blind to by construction. The data ships in the SAME COMMIT as the
  code (#528's precedent) because the local merge's whole effect was attributed
  field by field: **`name` on 23 rows, `stk` on 2, 0 acks added or removed, 0
  row-count changes**, index files differing only in `generated`.
  **THE QUEUED MECHANISM IS REFUTED BY THE POPULATION.** It read: *a token
  PRECEDED by a control character is in the same ciphered run, because 0x03 IS
  the ciphered space.* But 0x03 is **also** how this font encodes an ORDINARY
  space — that is the 128-row class shipped at 14:0xZ — so Fairway Market's
  `AEGON<03>US<03>High<03>Yi eld` carries a control separator before every token
  and is PLAIN TEXT throughout; licensing off the separator decodes it to
  `^bdlk rp e v  o l`.
  **WHAT IS TRUE IS THE SAME OBSERVATION USED AS A FENCE RATHER THAN A LICENCE,
  and it makes the run a CHARACTER SPAN instead of a token list.** A plain space
  is 0x20 and the shift cannot produce 0x20, so it BOUNDS the run — which keeps
  Antonini Freight Express's own `ANTONINI FREIGHT EXPRESS, INC. 401(K) & PROFIT
  SHARING PLAN` whole while decoding the `(PSOR\HU ,GHQWLILFDWLRQ` after it.
  **AND IT SOLVES THE HALF-DECODE THE QUEUE PREDICTED, FOR FREE: a span decodes
  its SEPARATORS too**, 0x03 → `" "` and 0x19 → `"6"`, so `&ODVV<03>5<19>` comes
  out **`Class R6`** rather than the `Class 5` a token rule would publish, and
  `,,` comes out `II`. *A mechanism that removes the need for a guard is worth
  more than the guard.*
  **THERE IS NO FILED-ATTESTATION TEST AND THE MEASUREMENT IS WHY.** The draft
  carried the issuer strip's two-sided witness — the token as filed attested
  NOWHERE — and that test **COSTS 6 ROWS reaching 118,240 participants**,
  because the attestation maps are built from the STORED names and this font
  appears in several filings: `FRPSOHWH`, `WKLV` and `LWHP` are each attested in
  their CIPHERED form (6 / 14 / 8). **Third instance of that trap and the FIRST
  in the refusal direction** — *a floor that reads repetition as evidence of
  authenticity is fed by repeated damage.* A RATIO in its place is **DECORATIVE
  at every factor up to 3** (0 rows against no test at all), so it is not
  shipped.
  **FOUR CONDITIONS, a negative control per condition over the whole
  population, each failing by name on exactly its own cases (2 / 1 / 2 / 1):**
  the plain-space FENCE (15 rows changed, all damaged); the mid-word TRIM,
  because 0x30-0x3d is BOTH a literal digit AND a ciphered uppercase Q-Z so it
  cannot fence — Retriever needs `5` → `R` while Lifespan's Form 5500 line
  references `6d`/`6e` were publishing as `Sd`/`Se`; the decode attested ≥3,
  **which is what protects `AEGON` rather than the fence** (`ETF` → `bqc`); and
  a ciphered space inside the run, **whose COST IS NAMED and PINNED** — it
  refuses 2 CORRECT `LQVWUXFWLRQV` → `instructions` repairs.
  **OUTCOME THROUGH ALL FOUR RESOLVERS:** display ticker **+1 / −0 / 0 flipped**
  (Edelman gains VWNAX), fee +1 / −0 / 0 changed, SEC `stk` **+2 / −0 / 0**,
  `ftk` +0 / −0 / 0, **0 asterisks moved.**
  **TWO COSTS, both named. The queue predicted this would CORRECT Edelman's fee
  — 0.3 where `Vanguard Windsor II Admiral` is 0.26 — AND IT DOES NOT.**
  `fund-er.js:203` has ONE Windsor entry, so the fee was wrong independently of
  legibility and the row now carries a correct symbol beside the same wrong
  number: *the cipher hid the share class; it was not why the fee was wrong.*
  And `Nuveen Small Cap Blend Index Fund Class R` gains the generic
  unattributed index 0.1 on a name that states a house, in the understating
  direction.
  **MERGE-SIDE BY NECESSITY, not by convention:** `cleanFiledName` replaces
  every control character with a space, so the ciphered digits are gone before a
  display arm could decode them and `Class R6` could never be recovered.
  ALL-CAPS ciphered text is out of reach BY CONSTRUCTION (the seed is a ciphered
  LOWERCASE word) and is left as named under-reach. 15 pins in
  `scripts/merge-name-test.mjs`, slicing the shipped function rather than
  restating it. parser-gate, smoke, fund-er-test (62/26/19/18/18) green.
  **1 crawlable page / 2,315 ppl**, its one changed cell read.
  **PRE-REGISTERED for #536:** the merge log prints `cipher-run repair: 23 rows
  across 13 plans`; `sec tickers: 477627 rows across 47915 plans (113424 on a
  blank type cell)`; `filed tickers` **2,166 / 75** unchanged; CONFIDENCE DIFF
  **+0 / −0**, `rows-dropped` 0; confident **60,170**, lineups 59,822, entries
  65,479, HIGH **4**, warn 603, overshoot 372, overshootTrust 12, aggRow 113,
  dl 19, pv 100 unchanged. **`tkExact` 37.2 and `tkComparable` 3.27 CANNOT
  move** — 2 new `stk` rows against 1.72M cannot shift a two-decimal figure —
  and saying *why* a figure cannot move is a stronger claim than bounding it.
  `docs/accuracy-log.md` 2026-10-01 (15:4xZ).
- **NOTHING IS IN FLIGHT. #517 RAN `success` AND IS MIRRORED — 2026-09-30 09:2xZ
  (`5608e91f → 10e574ec`), UNFORCED ON BOTH CHECKS, data gate +0 / −0. EVERY
  PRE-REGISTERED TEST PASSED, AND THE TWO RUN-ONLY FIGURES WERE READ OUT OF THE
  ARTIFACT RATHER THAN THE LOG.** The merge log lives on a blob host the sandbox
  cannot reach (`connect_rejected`), so instead of quoting a line I diffed the 64
  lineup shards at `08547e9d` against the data commit: **names changed 3,291 rows
  across 671 entries**, exactly as registered, and **`sec tickers` 347,357 rows
  across 37,107 entries** against 346,855 / 37,097 before — **+502 / −0 / 0
  changed**, also exact. REPARSE VERDICT `confident +0, match +0, vesting +0,
  lineups +0`; coverage line byte-identical to #515's (confident 60,103, HIGH 5,
  warn 610, overshoot 316, dl 142, pv 196 at 99.8%). *A figure computed from the
  artifact does not depend on a log being readable*, and the measurement the log
  line reports is one the store can be asked directly.
  The hold was released the moment the verdict existed, which is what it was for.
  **WHAT #517 CARRIED — AN OCR COLUMN-BLEED RESIDUE ON THE HOLDING NAME: 3,291 rows / 671 plans /
  565,760 participants / $5,593,466,858** — the item queued at 06:3xZ and
  re-homed at 07:4xZ. `Nuveen Real Estate Sec Sel R6 ial`, `PGIM High Yield Fund
  R6 ial`, `Voya Index Solution 2050 P Z lal`.
  **THE TEST IS THE ISSUER STRIP'S OWN AND ONLY THE MERGE CAN ASK IT: does the
  head appear as a COMPLETE published name elsewhere?** `PGIM High Yield Fund R6`
  stands alone **627** times, `Small Cap Index` 898, `International Index` 514;
  the damaged strings do not, so **`Vanguard Total Bond Market Index Ad` is seen
  twice and REFUSED — the named risk is handled structurally, not by
  vocabulary.** Floor **3, not 1** (1 → 3,841 rows, 2 → 3,519, 3 → 3,309,
  5 → 3,136), because *a floor of one lets a single damaged row license the same
  damage elsewhere.*
  **AND THE GATE WAS STILL FED BY ITS OWN MISTAKE ONCE.** `Putnam Stable Value
  Fund 15 bps` strips to a head **attested THIRTY times**, because those thirty
  rows had already lost their `bps` — the basis-point unit that is the whole
  meaning of the number. `bps` joins the keep list AND a head ending in a bare
  number is refused; the numeric guard costs **8 rows that look like correct
  repairs**, accepted because refusing a repair is the safe direction.
  **TWO SURPRISES IN THE OUTCOME TEST AND BOTH ARE WINS.** (1) **The residue was
  MANUFACTURING FEES: `af` reads as AMERICAN FUNDS** and put **0.4%** on
  `Vanguard Strategic Equity Fund af` and on `FIDELITY ZERO TOTAL MARKET INDEX
  af` — whose real fee is zero — **and `mm` as MONEY MARKET**, 0.2% on two equity
  funds; 3 withdrawn, 2 corrected. *A residue is not inert: two letters can name
  a house.* (2) **502 rows GAIN an SEC ticker, 0 lost, 0 changed** (RFKTX, FSSNX,
  PIMIX, PFPWX, IHOVX — each states a class and gets that class), **and I
  measured through the wrong resolver first**: `stk` comes from
  `match-sec-tickers.mjs`, not `fund-er.js`. *There are TWO ticker resolvers and
  an outcome test has to ask both* — so the queue entry's "honesty fix, not a
  coverage fix" was wrong.
  **AND A DELTA AGAINST A REMEMBERED NUMBER IS NOT A MEASUREMENT:** I first read
  the gain as +583 by differencing against #499's recorded 346,774; the store's
  own before-value is **346,855**, and the reconciliation (0 of 65,240 entries
  skipped) gives exactly **502**.
  `ind`/`idx`/`ext` are kept as TRUNCATED WORDS — `Vanguard Total Bond Market
  ind` is `… Market Index`, **the one genuine ticker loss (VBTLX) in the first
  measurement**, caught by the outcome test and not by reading.
  **PRE-REGISTERED:** the log prints `ocr tail-residue strip: 3291 rows across
  671 plans`; `sec tickers` **347,357 rows across 37,107 plans**; CONFIDENCE DIFF
  **+0 / −0**; `confident` **60,103**, HIGH **5**, `overshoot` **316**, `dl`
  **142**, pv 196 at 99.79% unchanged. Gates: real merge reproduces to the row,
  `rows-dropped` 0, parser-gate / smoke / fund-er-test green, **12 crawlable
  pages**, every changed cell read.
  `docs/accuracy-log.md` 2026-09-30 (08:3xZ).
- **SHIPPED 2026-09-30 09:3xZ, `[skip ci]` — A SHARE CLASS STATED AT BOTH ENDS OF
  ONE NAME IS STATED ONCE: 57 rows / 47 plans / 77,331 participants /
  $188,195,155.** `Class K Fidelity Contrafund Class K`, `Class R-6 EuroPacific
  Growth Fund Class R-6`, `R6 American Funds Wash Mutual R6`. All 52 distinct
  transformations read, every one a real fund name.
  **THE ARGUMENT IS INTERNAL AND THAT IS WHY IT NEEDS NO STORE:** the same
  designation appears twice in one string, so removing one copy cannot change
  which fund is named. The issuer strip and #517's OCR tail strip both rest on a
  whole-store attestation *only `merge-4i` can ask*; this one is self-evident per
  row, so it lives in `cleanFiledName` and reaches BOTH surfaces with no run.
  **v149's doubled-house arm sits three lines above it and cannot reach the
  shape** — that one needs the repeat ADJACENT, and here the fund's whole name
  sits between the two copies.
  **TWO NEIGHBOURING POPULATIONS REFUSED, BOTH LARGER THAN WHAT SHIPS:** **331
  rows / 334,922 ppl** lead with a class the remainder never repeats (`Class R6
  Fidelity Global ex U.S. Index Fund`) — the filer writing the class FIRST, where
  stripping destroys the only statement of it; and **80 rows / 171,594 ppl** state
  two DIFFERENT classes (`Class R1 Macquarie Mid Cap Growth R6`), where one is
  wrong and nothing says which.
  **MY HYPOTHESIS ABOUT THE MECHANISM WAS REFUTED BY ITS OWN TEST.** I expected
  the lead to be the PREVIOUS ROW'S TAIL, checkable directly from the stored filed
  order — **6 of 119 in one half, 2 of 331 in the other.** The refutation is what
  bought the split: the non-corroborated rows sit in BLOCKS (`Class R6 … 2035`
  directly under `Class R6 … 2040`), which is a house style. *A refuted mechanism
  is not a wasted measurement when it re-partitions the population* — the test
  meant to confirm a cause is what stopped 331 rows being "repaired".
  **AND THE ROW THAT FOUND IT IS IN THE REFUSED HALF** — Innovative Employee
  Solutions' (5,856 ppl) `II Class R1 Blackrock LifePath Index 2030 Fund S`, whose
  lead really is the previous row's tail and whose classes disagree, is pinned on
  the must-KEEP side. *The drawn case is evidence about a class; it is not
  entitled to be the case the fix repairs.*
  **A GENERIC REMAINDER IS REFUSED BY `isGenericTypeName` WITH NO NEW
  VOCABULARY:** QuikTrip (16,054 ppl) files `Class E Common Stock` at
  **$3,535,256,080** and Moog `Class B Common Stock` at $369,929,005, where the
  letter is a real designation of the employer's own stock — **those four rows are
  69% of the candidate population BY VALUE**, and the guard protecting most of the
  money is one already written.
  **+0 tickers, −0 lost, 0 flipped, +0 fees, −0 lost, 0 changed** through both
  resolvers — an HONESTY fix, and here that holds **by construction**:
  `lookupTicker` tries the RAW name FIRST and `stk` is a STORED field a display
  arm cannot reach. The exact inverse of #517, where the second resolver is where
  the surprise was.
  13 pins (6 must-strip / 7 must-keep) 13/13, **added because NOT ONE of the 67
  existing filed-name cases reaches the new arm**; negative control fails by name
  on exactly the 6, and drifting the app.js twin fails the smoke tether on exactly
  **6 of 80**. parser-gate, smoke and fund-er-test (46/26/19/18) green. **4
  crawlable pages / 15,171 ppl**, every changed cell read.
  **AND A FLAG OF MINE WAS WRONG:** the same draw's Commonspirit Health (46,022
  ppl) publishes `JP Morgan US Value R6` → **VGINX**, which I flagged as a
  wrong-house assertion on the strength of the `V` prefix. `sec-funds.json` says
  `JPMorgan Trust I :: JPMorgan U.S. Value Fund`, Class R6 — **the resolution is
  correct and the reading was mine.** *A ticker is not a reading; the series name
  is*, recorded about the code and applying to the person reading it.
  `docs/accuracy-log.md` 2026-09-30 (09:1xZ).
- **`site-test` #115 reads `conclusion: success`** on `19e800fc`, the exact
  mirrored commit, and the one commit on top of it is verified **docs-only**, so
  that green covers every executable line of the doubled-class fix. Dispatched
  deliberately because it shipped under `[skip ci]` and local green is not CI
  green.
- **SHIPPED AND MIRRORED 2026-09-30 11:4xZ (`8b5bad78 → a4a5e312`), UNFORCED ON
  BOTH CHECKS, data gate +0 / −0; `site-test` #116 reads `conclusion: success`
  ON THE EXACT SHIPPED COMMIT — THE ISSUER MAY ADD A MANAGER AND NEVER REPLACE
  ONE, IN THE TICKER COLUMN TOO: 16 rows / 17 plans / 52,838 participants /
  $78,246,497 stop publishing a COMPETITOR'S fund as fact.** `{Fidelity}
  Vanguard Total Bond Market Institutional` → **FTBFX, Fidelity's own Total
  Bond Fund** (University of Miami's four plans 31,932 ppl, RIT 8,365,
  Presbyterian Health Plan 2,885); `{T. Rowe Price}` landing TRLGX, TRMCX,
  RPMGX, PRFDX and OTCFX on JPMorgan, Putnam, MFS, Neuberger Berman, TIAA-CREF
  and PIMCO holdings. All 16 read, not one right. **Nine lose a ticker with
  nothing to replace it — the accepted cost, because a wrong number outranks an
  absent one.** Both changes are corrections verified against `sec-funds.json`
  (VTINX → VTWNX off Target Retirement INCOME; FTBFX → JMGMX, the SEC's Class
  R6 of that fund). **0 gained, 0 asterisks moved, 0 correct answers lost.**
  **TWO DRAFTS DIED ON THE WHOLE-STORE DIFF AND NEITHER DIED ON ITS CONTROLS.**
  (1) Reusing `issuerPricedER` with the ticker as its value passed a 15-case
  table and whole-store **withdraws 3,470 CORRECT answers** — *a predicate that
  is right for one class is not thereby right for its neighbour*, and *a
  hand-built control table tests the cases its author already imagined*.
  (2) **THE HOUSE-LIST VERSION THEN MEASURED 275 ROWS / 68 ENTRIES / 151,874
  PARTICIPANTS PROMOTED from a labelled COMPARABLE to an ASSERTION — larger in
  people than the 31 rows it repairs, and in the unsafe direction.** Blocking a
  contradicting issuer lets the bare name resolve, and where the prefixed answer
  was already asterisked the only effect is to remove the asterisk. **Cleveland
  Clinic's 81,999 would have been told `DODGE & COX STOCK X A` is DODGX, which
  the SEC registers as Class I where Class X is DOXGX**, and every `Vanguard
  Instl Target Ret <year> Instl` row would have asserted the INVESTOR class.
  **0 moved the other way.** So the guard blocks only an ASSERTION: a comparable
  answer is already labelled an approximation, and refusing it withdraws no
  claim. ***A guard that withdraws an assertion can also PROMOTE one.***
  **THIRTEEN GENUINE CORRECTIONS ARE REFUSED WITH THE 275 AND NAMED IN THE
  CODE** — twelve `{Fidelity Management Trust Company} T. Rowe Price Retirement
  <year> I Fund` rows moving to the -I Class the filing STATES, and TRBCX →
  TBCIX twice — because **refusing a repair is the safe direction.**
  **AND THE MEASUREMENT WAS WRONG TWICE BEFORE IT WAS RIGHT.** The stand-in
  harness that produced 17/14 was a hand-transcribed closure ending in `return
  null`; the real `lookupTicker` has **two further fallback stages after the
  loop** (the house-misspelling repair, and the stored SEC `stk`). Slicing the
  SHIPPED body out of app.js moved a row between buckets; passing the WHOLE fund
  row, as the page does, changed nothing here but is the second half of the same
  rule — ***measure through the function the page calls, WITH THE ARGUMENT THE
  PAGE PASSES.***
  `leadingHouse` canonical in `lib-disclose`, twinned verbatim, **tethered on 18
  pinned cases (9 must-detect / 9 must-be-null), negative-controlled THREE
  ways** — two dropped twin entries fail by name on exactly those 2, a platform
  added to the canonical list on exactly 1, and **unanchoring the rule on
  exactly 2, a control that existed only after the first one showed the
  ANCHORING was untested** (no pinned case had a real house INSIDE the string
  behind a non-house). *A control that cannot fail is decorative*, met again.
  parser-gate, smoke, fund-er-test (46/26/19/18) green. **REPORT path only as a
  GUARANTEE: `build-seo-pages.mjs` never imports `fund-er.js`**; `git diff
  --stat p/` empty. `docs/accuracy-log.md` 2026-09-30 (11:5xZ).
- **SHIPPED AND MIRRORED 2026-10-01 03:2xZ (`0c90d086 → 792a0582`), UNFORCED ON
  BOTH CHECKS, data gate +0 / −0 BY ACK AND BY PLAN — THE FILING PRINTS THE
  TICKER AND WE PUBLISHED A DIFFERENT ONE: 35 rows / 21 plans / 361,656
  participants / $945,898,023 corrected, plus 899 rows / 72 plans / 461,917 ppl
  that GAIN one.** The data shipped in the SAME COMMIT as the code, which no
  previous merge-side item has done, because the local merge's whole effect was
  measured field by field against HEAD: **`ftk` on 2,166 rows across 75 entries,
  0 acks added or removed, nothing else moved**, and the three index files differ
  only in `generated`. A reader is served now; **#528 and `site-test` #123 both
  fired from the push on the exact commit and were observed `in_progress`**, so
  the run exists to confirm the production merge reproduces it.
  **PRE-REGISTERED for #528:** the merge log prints `filed tickers: 2166 rows
  across 75 plans`; `sec tickers` unchanged at **459,695 rows across 47,534
  plans (109,662 on a blank type cell)**; CONFIDENCE DIFF **+0 / −0**; coverage
  line byte-identical — confident **60,170**, lineups 59,822, entries 65,479,
  HIGH **4**, warn 608, overshoot 372, overshootTrust 12, aggRow 113, dl 19,
  pv 196 at 100%.
  **THE NAIVE RULE IS DEAD AND A CONTROL KILLED IT: `INDEX` IS a registered
  ticker** (CYBER HORNET S&P 500), so one of the commonest words in a fund's name
  is a symbol. **Three structural conditions survive and not one is a
  vocabulary:** the symbol must LEAD the name, its registered SERIES must share a
  content word with the remainder, and **that word must be three letters or
  more** — the third existing only because the first two shipped and `INDEX`
  still got through TWICE, corroborating once on the numeral **500** and once on
  the **`p`** of `S&P`. *Reading the transformations caught what the control could
  not: my control had pinned the one spelling of the collision I had already
  imagined.* 1,232 rows already AGREE with the symbol they print, which is the
  control that the shape is common and usually read right.
  **NO TYPE GATE, AND THE MEASUREMENT DECIDED THAT RATHER THAN CAUTION:**
  applying `secTypeAdmits` refuses **63 rows and every one is a correctly-named
  money-market or bond fund** typed `Cash / short-term` or `Government
  securities` — an asset CATEGORY, not a contradicting vehicle — and across all
  937 hits **not one carries a collective-trust or separate-account type**,
  because the SEC registers no collective trust and so none can lead with a
  registered symbol.
  **FEE-NEUTRAL, MEASURED RATHER THAN ARGUED: over all 2,166 rows the field
  reaches the fee moves on 0 and 0 symbols are LOST. ONE ASTERISK DOES MOVE,
  where my own comment said none could** — `SSSYX STATE STREET EQUITY 500 INDEX
  FUND - CLASS K` goes from a labelled COMPARABLE to an ASSERTION, correctly
  (the SEC registers SSSYX as Class K against five siblings, the filing states
  Class K and prints the symbol, and the fee is 0.02 either side). *A guard that
  withdraws an assertion can also PROMOTE one*, and *a measured number in a
  comment has to be the number that shipped.*
  **COST NAMED, 6 rows:** `MVCKX … CL R5` (4), `MFWLX … R5` and `STRYX Pioneer
  Strategic Income K Fund` print a symbol the SEC registers to a different class
  than the name's own class word states; the filer wrote both and the symbol is
  the more precise. **All 16 distinct corrections and all 470 distinct gains
  read, not one a wrong house.**
  **THE POPULATION IS A FILER TEMPLATE AND NOT A SPREAD:** Oasis Outsourcing
  (113,807 ppl), G & A Partners (46,552), Vensure (43,373), Emory Healthcare +
  Emory University (72,174) — PEO multiple-employer plans printing the symbol in
  the identity column.
  **THE PREDICATE LIVES ONCE AND HAS NO BROWSER TWIN TO DRIFT** — it needs a
  29,406-row index the page must never download, so it is asked at merge and
  stored. `--selftest` 116/116 with 17 new pins and **a negative control PER
  CONDITION** failing by name on exactly its own cases (2 / 3 / 2); **the first
  lead control was DECORATIVE and passed**, because the variant corroborated
  against the text AFTER the match rather than the whole remainder, so dropping
  the anchor changed no verdict. The ORDER is tethered in `smoke-test.mjs` on
  **four pairs that are their own negative control** — the same name with the
  field and without it, the `without` half required to answer DIFFERENTLY — and
  moving the branch below the fund-er attempts fails it by name.
  **REPORT path only as a GUARANTEE:** `build-seo-pages.mjs` renders no ticker
  and reads no such field. parser-gate, smoke, fund-er-test (46/26/19/18/18)
  green, and **`site-test` #123 reads `conclusion: success` ON THE EXACT SHIPPED
  COMMIT `792a0582`** — the first CI green covering the precedence tether and the
  934 changed ticker cells, read rather than assumed. Pages #752/#753 built the
  two mirrors `success`, so readers have it. `docs/accuracy-log.md` 2026-10-01
  (03:2xZ).
- **PREVIOUSLY QUEUED (superseded by the bullet above; its 898-row figure was the
  pre-condition-(3) count and the shipped number is 899):**
  `VITSX - Vanguard Total Stock Market Index Inst.` publishes **VTSAX**, the
  Admiral class (9 rows); `MWTSX - Metropolitan West Total Return Cl P` publishes
  MWTIX (Class I); `MEIJX - MFS Value Fund Cl R4` publishes **MEIKX, R6 — this
  record's own 2026-09-15 defect in a new instance, with the filing handing us the
  answer**; `DOXIX … Cl X` publishes DODIX; `HNACX … Rt` publishes HACAX.
  **All 16 distinct read and the filing is right in every one** — the name's own
  class words agree with the filed symbol's registered class.
  **THE NAIVE RULE IS DEAD AND A CONTROL KILLED IT: `INDEX` IS a registered
  ticker** (CYBER HORNET S&P 500), so one of the commonest words in a fund's name
  is a symbol. **What survives is structural: the ticker must LEAD the name and its
  registered SERIES must share a content word with the remainder** — the filing
  corroborating its own symbol, with no vocabulary. 1,232 rows already agree, which
  is the control that the shape is common and usually read right.
  **FEE-NEUTRAL BY CONSTRUCTION**, which no other share-class item has been:
  `fundERRow` is called on the NAME and never on a symbol, and **0 of the 35 are
  asterisked**, so correcting `tk` cannot move a fee and no `fund-facts` entry is
  needed. **This is the one route out of the share-class problem that requires no
  source the project lacks** — the ticker is in the filed text, so using it is
  reading the filing, not deriving. Remaining: the predicate, its twin, a tether
  with a per-condition negative control, and the whole-store diff.
- **SHIPPED AND MIRRORED 2026-10-01 05:1xZ (`075870fa → 7aec77df`), `[skip ci]`
  BEHIND #529 — AN OCR'd `N/A` COLUMN IS NOT PART OF A FUND'S NAME: 351 rows /
  42 plans / 109,341 participants / $2,007,684,420** across 345 distinct
  transformations. Chimes International (3,791 ppl, OCR'd) named its Vanguard
  target-date rows `Mutual fund NIA 391,719 (eb)`; elsewhere the debris trails a
  name that is entirely real — `Principal LifeTime 2035 RS Fund NIA`, `American
  Funds Fundamental Investors R3 Fund NIA`, `PIMCO Total Return RFund NIA`.
  `NIA` is the OCR of a column header the filer left blank.
  **AND MY OWN QUEUE ENTRY CALLED THIS A COVERAGE FIX AN HOUR EARLIER AND THE
  OUTCOME TEST SAYS IT IS NOT.** I had written that 303 of these rows publish no
  ticker and 277 no fee and inferred the strip would win them; measured by running
  the display path twice, once under HEAD and once under the change: **0 tickers
  gained / 0 lost / 0 flipped, 0 fees gained / 0 lost / 0 changed, 0 asterisks
  moved.** The resolvable ones already resolved through the ISSUER prefix on the
  raw name and the rest resolve under neither. ***"303 rows publish no ticker" is
  a COUNT OF A CONDITION, not a measure of what a fix wins*** — the `band-hi`
  lesson, in my own queue entry, one hour old.
  **A CLEAN ZERO REPORTED ON THE QUERY FIRST:** the initial whole-store diff said
  **0 rows changed**, because `cleanFiledName` has a TWIN in app.js and the page
  runs that one — editing the canonical copy alone changes nothing a reader sees.
  **The smoke tether caught it by name on two cases it already carried.**
  **TWO PINNED CONTROLS MOVED AND THE JUSTIFICATION IS IN THE FILE**, because
  updating a control is how a regression gets normalised: they were written to
  assert the CAPTION is not stripped and the DEBRIS left standing as the name, and
  that intent is now pinned on its own; what changed is the opposite half. **The
  new standalone pin was first written with a value I had GUESSED** — HEAD produces
  a different one and the pin records HEAD's, verified, because a debris-LED name
  never reaches this trailing-anchored arm.
  The rule drops tokens only from the END and needs no vocabulary: an OCR'd N/A, a
  bare figure, or short bracket noise, with **at least one dropped token an N/A**
  and a two-real-word head surviving. `bwNoise` already knows `NIA` and cannot
  reach these because it is a REFUSAL inside the LEADING-caption arm — *a fix for
  one position of a class is not a fix for the class.*
  **IT COMPOSES WITH THE CAPTION STRIP AND THAT IS WHERE IT PAYS MOST:** `PGIM
  Global Real Estate Registered investment company NIA` → `PGIM Global Real
  Estate`, `Real Estate Separate Account Nia` → `Real Estate`, and `Group Annuity
  Contract Nia Nia` becomes a bare vehicle type so the row now reads *"the filing
  names no specific fund"* — a true statement replacing debris.
  **4 crawlable pages / 62,163 ppl**, every changed cell read (Northwest
  Carpenters 23,478, Amalgamated Transit Union 21,095, Southern District UBC
  15,271, NYIT 2,319). Twinned verbatim, 12 pins, smoke and fund-er-test green.
  **`site-test` dispatched on the current head deliberately, because it shipped
  `[skip ci]` and local green is not CI green.**
  `docs/accuracy-log.md` 2026-10-01 (04:4xZ).
- **#529 RAN `success` AND IS MIRRORED — EVERY PRE-REGISTERED FIGURE PASSED.** The
  coverage line is byte-identical except **`tkExact` 36.18 → 36.19**, exactly what
  was registered ("at most 0.02 from the 79 new `stk`"): confident 60,170, lineups
  59,822, HIGH 4, warn 608, overshoot 372, dl 19, pv 100, `tkShare` 24.47. Read
  out of the ARTIFACT: the run's store carries **459,774 `stk` rows**, and diffing
  `stk` against the commit I wrote gives **0 differing rows**.
  **AND ONE NAME DIFFERS, WHICH IS A MECHANISM AND NOT A DEFECT.** The run
  repaired `Vanguard EmergingMkts Stock Idx Adm` → `Vanguard Emerging Mkts Stock
  Idx Adm` (VEMAX, correct) where the local merge did not — v519's CamelCase arm,
  not the new one. The attestation maps are built from the STORED names, so **the
  147 committed caps repairs raised the attested count of a repaired form and
  pushed a sibling over its floor of 3.** *A correct repair can license a further
  correct repair on the NEXT run*, so **"147 rows" is not a fixed point** and a
  changed count later must not be read as a regression. The same feedback with
  DAMAGE in place of a repair is the floor-of-one trap, which is why the floor is
  3 and the caps guard is a ratio. `site-test` #124 reads `conclusion: success` on
  `a8ab1078`.
- **SHIPPED AND MIRRORED 2026-10-01 04:2xZ (`b7b3645c → a8ab1078`), UNFORCED ON
  BOTH CHECKS, data gate +0 / −0 — A LOST SPACE INSIDE AN ALL-CAPS FILED NAME:
  147 rows / 126 entries / 132 plans / 299,782 participants / $721,375,392**
  across 49 distinct transformations, all read. `AMERICAN FUNDS NEWWORLD R6` (68
  rows), `DODGE & COX STOCKFUND X`, `JANUSHENDERSON TRITON N`, `GOLDMANSACHS US
  MORTGAGES R6`, `FIDELITY BLUECHIP GROWTH`, `MSCIEAFE International Index`.
  **#529 and `site-test` #124 both fired from the push on the exact commit and
  were observed `in_progress`.**
  **PRE-REGISTERED for #529:** the merge log prints `all-caps lost-space repair:
  147 rows across 126 plans` and `all-caps repair: 3252 registered name words
  available as the witness`; `sec tickers` **459,774 rows across 47,543 plans
  (109,673 on a blank type cell)**, up 79 rows / 9 plans; `filed tickers` **2,166
  / 75** unchanged; CONFIDENCE DIFF **+0 / −0**, `rows-dropped` 0; confident
  **60,170**, HIGH **4**, warn 608, overshoot 372, dl 19, pv 100 — all unchanged.
  `tkExact` may rise by at most 0.02 from the 79 new `stk`, and `tkShare` is a
  1-in-20 sample so a hair of movement there is phase and not signal.
  **THE DRAWN ROW IS REFUSED BY THE CEILING, NOT THE FLOOR:** its repaired whole
  name is attested **1,299 times** while `VANGUARDTARGET` is itself attested
  **eight**, so *a ceiling that reads repetition as evidence of correctness is fed
  by repeated damage* — the floor-of-one lesson at a ceiling of two. The guard is
  a **RATIO between two WHOLE NAMES**.
  **AND THE RATIO ALONE WAS NOT ENOUGH, WHICH ONLY THE OUTCOME TEST COULD SHOW.**
  It admitted `SMALLCAP WORLD R6 FUND` → `SMALL CAP WORLD R6 FUND` and that row
  **LOST its ticker** — the SEC registers the series as `SMALLCAP WORLD FUND INC`,
  one word, so American Funds' own spelling is the joined one. **Reading all 62
  transformations did not catch it**; the whole-store ticker diff did. The arm now
  asks an **INDEPENDENT WITNESS and no vocabulary** — a token the SEC registers
  inside a fund's own name is a word and may never be split — which also refuses
  `CONTRAFUND`, `EUROPACIFIC`, `LIFESTRATEGY`, `BLACKROCK`, `JPMORGAN`,
  `MASSMUTUAL` and `ALLSPRING`. **It FAILS CLOSED**, and that branch was
  exercised by accident when a harness context lacked `readFileSync`: the arm
  skipped itself, said so, and the positive control failed by name.
  **TWO CONDITIONS THAT LOOK LIKE GUARDS CANNOT FIRE and are labelled as such:**
  a floor of 3 is subsumed by the ratio (the row's own name is attested at least
  once), and both-halves-attested follows from the repaired name being published
  at all — removing either changes **0 of the rows**, measured, so the second
  stays only as a pre-filter.
  **OUTCOME THROUGH ALL FOUR RESOLVERS, because the name is STORED and moves
  every one:** `fund-er.js` **+9 tickers / −0 / 0 flipped** and **+18 fees / −0 /
  70 CHANGED**; SEC `stk` **+79 / −0 / 0**; `ftk` **+0 / −0 / 0**. **All four
  distinct fee changes are an EXISTING specific entry finally reaching a legible
  name** — `/american funds.*new world/` → 0.57 against the generic 0.4 (68 rows),
  `/fidelity government cash reserves/` → 0.25 against 0.2, MSCI EAFE 0.1 → 0.06
  — and **two of the three move the fee UP**, the direction that cannot be a
  flattering bias.
  **A HARNESS ARTEFACT caught because its own list named the arm's two largest
  members:** a factor sweep reported `NEWWORLD` and `STOCKFUND` as outside the
  factor-3 set, because the baseline was filled during that iteration and the
  comparison ran before it. The counts hold (254 / 193 / 163 / 135 / 45 / 34 / 15
  at factors 1/2/3/5/10/25/100); the membership lists did not.
  22 pins, **a negative control PER CONDITION** failing by name on exactly its own
  cases (ratio → `EUROPACIFIC`; witness → exactly the two `SMALLCAP World` rows).
  Real merge reproduces to the row; field by field the store moved `name` on 147
  and `stk` on 79 **and nothing else**. **2 crawlable pages / 10,520 ppl** (Timken
  7,861, Samtec 2,659), both read — and **`titleCase` had been lowercasing the
  seam**, so the page showed an ordinary-looking word where the store showed
  capitals, the same transform that hid v519's seam. parser-gate, smoke,
  fund-er-test (46/26/19/18/18) green. `docs/accuracy-log.md` 2026-10-01 (04:2xZ).
- **AND #528's VERDICT: the production merge reproduced the local one EXACTLY.**
  `conclusion: success`, mirrored 04:2xZ unforced, data gate +0 / −0 by ack and by
  plan; the coverage line **byte-identical** (confident 60,170, HIGH 4, warn 608,
  overshoot 372, dl 19, pv 100, tkExact 36.18, tkComparable 3.27, tkShare 24.47);
  `filed tickers` **2,166 rows / 75 plans** read out of the ARTIFACT, and diffing
  `ftk` across all 64 shards against the commit I wrote gives **0 differing rows**.
  `data/lineups/**` is not even in the data commit's file list.
- **PREVIOUSLY QUEUED (superseded by the bullet above; its 163 / 146 / 321,605
  figures are the pre-witness count and the shipped ones are 147 / 132 /
  299,782):** `AMERICAN FUNDS NEWWORLD R6` (67 rows), `DODGE & COX
  STOCKFUND X` (16), `JANUSHENDERSON TRITON N` (8), `MFS NEWDISCOVERY VALUE FUND
  R6` (6), `GOLDMANSACHS US MORTGAGES R6`, `MSCIEAFE International Index`.
  Found by the 03:3xZ draw on **Texas Children's (21,233 ppl, 29 rows @ 0.990)**,
  which publishes `VANGUARDTARGET RETIREMENT INCOME`.
  **v519's weld repair cannot see it BY CONSTRUCTION** — its seam needs a
  lowercase letter followed by an uppercase one inside a word, which an all-caps
  name never has. The repair EVIDENCE transfers unchanged (does the repaired
  WHOLE NAME stand alone, floor 3); only the seam finder differs: **split an
  unattested token into two attested ones.**
  **AND THE DRAWN ROW IS REFUSED BY THE CEILING, NOT THE FLOOR, WHICH IS THE
  TRANSFERABLE HALF.** Its repaired whole name is attested **1,299 times**, so
  the floor is satisfied; what refuses it is `cnt(t) > 2`, the guard protecting a
  CamelCase house name — and **`VANGUARDTARGET` is itself attested EIGHT times.**
  *A ceiling that reads repetition as evidence of correctness is fed by repeated
  damage* — the floor-of-one lesson at a ceiling of two. The caps arm needs a
  **RATIO** (repaired whole name ≫ damaged whole name) rather than an absolute
  count of one token. With the ceiling kept the class is **31 rows / 145,679
  ppl**; with the ratio, 163 / 321,605.
  **THE WHOLE-NAME FLOOR IS LOAD-BEARING AND ITS COST IS MEASURED: dropping it
  admits a further 279 rows / 2,895,174 ppl that DESTROY real words and real
  names** — `VARIATION MARGIN …` → **`VARI ATION`**, `AUTONATION, INC` → `AUTO
  NATION`, `THE INTERPUBLIC GROUP` → `INTER PUBLIC`, **`NEWTOWER TRUST COMPANY`
  → `NEW TOWER`**, `CAREAGLE SMALL CAP GROWTH` → `CAR EAGLE`. **Do not carry
  279 or 2,895,174 forward as a class size** — it is the guard's measured cost.
  Remaining: the outcome test through both resolvers, the tether, and the
  whole-store diff. MERGE-SIDE, so it waits on #528.
  **AND THE SAME DRAW'S SUSPICIOUS ROW WAS ALREADY HANDLED:** HNTB Holdings
  (7,744 ppl) publishes `range from 4.25% to`, and asking the shipped predicate
  rather than reading by eye says `isLoanDescriptionRow` is **true** — those
  readers are already told it is a participant-loan row. *Ask the guard before
  sizing a defect.*
  **TWO NAMED LIVE INSTANCES OF OWNER-GATED ITEMS, same draw:** Texas Children's
  publishes **`FIDELITY CONTRAFUND K6` → FCNTX at 0.45** where the K6 fund is
  FTKFX (the different-SERIES override, 21,233 ppl in this plan alone), and
  **`LINCOLN STABLE VALUE` → 0.35 on a BLANK type cell** (the `gicRow`-reads-the-
  type item, 4,782 rows / 7,839,651 ppl). `docs/accuracy-log.md` 2026-10-01
  (03:5xZ).
- **SHIPPED AND MIRRORED 2026-10-01 05:4xZ (`26ab367d → 18f16a5b`), UNFORCED ON
  BOTH CHECKS, data gate +0 / −0 BY ACK AND BY PLAN; `site-test` #126 reads
  `conclusion: success` ON THE EXACT MIRRORED COMMIT — A FILING STATING
  INSTITUTIONAL PLUS GETS THE INSTITUTIONAL PLUS CLASS: 295 rows corrected /
  224 plans / 2,270,590 participants / $33,414,762,661, plus 4 gained, 0 LOST, 0
  asterisks moved.** VINIX is the **Institutional** class; VSMAX, VIMAX, VEXAX,
  VBTLX, VTIAX and VTSAX are **ADMIRAL, a RETAIL class**, so six of the seven
  answers erred in the flattering direction. Every corrected symbol is read out of
  `sec-funds.json`: VIIIX, VSCPX, VMCPX, VEMPX, VSMPX, VBMPX, VTPSX. *A fee is
  SOURCED, never derived, and so is a share class.*
  **THE QUEUED FIGURE BELOW WAS WRONG AND LOW — the class is 394 rows / 263 plans
  / 3,303,464 ppl, not 239 / 176 / 2,109,185** — because that predicate read only
  the spelled-out spelling; and the whole-store diff came in larger still, since
  the marker can live in the **ISSUER** cell. *A hand sizing predicate
  under-matches what the display path does.*
  **TWO INDEPENDENT ROUTES REACH THE SAME SEVEN SYMBOLS, and the second is the
  filings.** The contamination check found **ten** before-rows already publishing
  these symbols where 4 were expected — and 10 of 10 come from **`ftk`**, #528's
  filed-ticker rule, on rows where the filer printed the symbol. *A check run to
  detect contamination instead corroborated the answer from a second source.* One
  corrected row says it alone: `Vanguard Institutional Index Fund Institutional
  Plus (VIIIX)` printed the symbol in brackets and we published VINIX beside it.
  **ORDER-FREE AND MEASURED:** the filer writes the class FIRST on 5 rows and the
  objection that such a lead is the previous row's tail is refuted by the stored
  filed order on **0 of 5**; a row naming TWO of the seven funds, which order-free
  matching would decide by table position, is **0 rows**.
  **THE REGISTRY REFUSES THE TWO WELDS BY ITSELF** — `Instl Plus Shares Vanguard
  PRIMECAP Fund` and `Institutional Plus Shares Fidelity Contrafund Class K` name
  a series registering no Institutional Plus class, so there is no entry to reach
  and no vocabulary of weld shapes is needed.
  **A NEGATIVE CONTROL PER CONDITION over the whole 433,408-row population:**
  order-freedom is **LOAD-BEARING** (4 rows / 8,053 ppl, Skanska ×3 + Arctera);
  the `vanguard` requirement protects **1 row and NOT for the reason it was
  written** (Aultman Health, 10,728 ppl, declined because its RAW name omits the
  house, which keeps a trust-held row from being called the mutual fund — ***a
  guard's live population is not always the population it was written for***); and
  the contradicting-class lookahead is **DECORATIVE ON THIS STORE, 0 rows**,
  labelled as such in the source while its FIXTURE still flips one pinned case.
  **FEE-NEUTRAL, MEASURED RATHER THAN ARGUED: 0 gained / 0 lost / 0 changed**, and
  `names moved` 0. All **114 distinct corrections and 3 distinct gains read**, not
  one a wrong house. 16 pins added **because NOT ONE of the 46 existing
  must-resolve cases reaches the new arm**; the pre-change file fails by name on
  exactly the 14 must-corrects and holds both must-keeps. parser-gate, smoke,
  fund-er-test (62/26/19/18/18) green. **REPORT path only as a GUARANTEE.**
  `docs/accuracy-log.md` 2026-10-01 (05:4xZ).
- **AND A THIRD INCOMPLETE TRANSCRIPTION, IN TWO HARNESSES, BOTH FIXED BEFORE ANY
  NUMBER WAS PUBLISHED.** `apppath.mjs` carried app.js's `stockRow` regex WITHOUT
  the `!mistypedStock` gate, so every mistyped row read back the SPONSOR'S symbol:
  it reported **H&R Block's Vanguard Institutional Index row (27,766 ppl) as
  publishing HRB** — a false live defect — and repairing it moved this class's own
  count 133 → 135. **The draw harness was worse, because the draw's whole job is
  to show what a reader sees:** it hand-transcribed `lookupTicker` as three
  `fundTickerInfo` attempts and read **neither `ftk` nor `stk`**, so `DFA U.S.
  Targeted Value Portfolio` printed `tk=-` where the page publishes **DFFVX**, and
  every State Street Target Retirement row printed `er=-` where the page publishes
  **0.09**. Both columns wrong, in the instrument used to find defects. Three
  instances in one session (the `er` chain at 01:5xZ, `stockRow`, the draw), so the
  fix is ONE instrument: **the draw now renders through `apppath.mjs`**, which
  slices app.js's body from source and imports the canonical suppressors.
  ***A transcription of a shipped expression rots as the expression grows; three
  instruments rot three times.***
- **SHIPPED AND MIRRORED 2026-10-01 14:5xZ (`9cc20b5a → 7d85e3b2`), UNFORCED ON
  BOTH CHECKS, data gate +0 / −0 — TWO COLUMNS ASKED THE SAME PREDICATES IN A
  DIFFERENT ORDER: 1 row / 775 participants.** `tk` branched on `stockRow`
  first while `shownType` branches on `loanRow` first, so a row that is BOTH —
  type cell claiming employer stock, name a loan balance — printed one answer in
  each column: **Nektar Therapeutics published `Outstanding Loan Balance`
  labelled *"Participant loans — not a menu choice"* with NKTR beside it.**
  **EXACT, NOT DIFFERENTIAL: 1 of 2,146 loan rows store-wide**, computed from
  the shipped expression's own terms. `tk` lives only in app.js — no twin, no
  ticker column on the crawlable pages — so 0 of 5,000 pages change.
  **AND MY BEFORE/AFTER HARNESS COULD NOT ASK THE QUESTION, WHICH ITS OWN
  POSITIVE CONTROL SAID FIRST:** it printed `before tk=null` for a row HEAD
  publishes as NKTR, because `apppath.mjs` slices app.js only to
  `lookupTicker`'s close — the `tk` EXPRESSION is a transcription inside the
  harness's own `render`, so `APPJS_PATH` cannot change it and I had already
  edited the transcription. *A before/after harness is only as honest as its
  "before", and here the "before" lived in the HARNESS rather than in the file
  under comparison.* `docs/accuracy-log.md` 2026-10-01 (14:5xZ).
- **THE CROSS-COLUMN AUDIT, and its larger result is what it RULED OUT.** Asked
  of all 1,724,078 published rows: *where does the page print a TYPE that cannot
  carry a fund expense ratio or a fund symbol, and print one anyway?*
  **FOUR OF NINE BUCKETS ARE THE SHIPPED DESIGN WORKING AND MY BUCKET LIST WAS
  WRONG TO INCLUDE THEM** — `Collective trust / pooled separate` reads **42,838
  rows with a fee and 44,457 with a symbol across 32,240,433 ppl** and **every
  one is ASTERISKED**, a labelled comparable, which is the 2026-09-21 demotion
  doing its job. *Quoting that as a defect would have been the largest false
  alarm on this record.*
- **QUEUED, SIZED, SPLIT, NOT SHIPPED — A `Company stock` ROW NAMING A
  DIFFERENT, IDENTIFIABLE COMPANY PUBLISHES THE SPONSOR'S SYMBOL.** Bank of
  America (250,040 ppl) prints `INTERNATIONAL BUSINESS MACHS` and `EXXON MOBIL
  CORP` as **BAC**; FedEx's two plans print `Master Trust` as **FDX** (177,265 +
  133,109); **GE (105,231) prints `GE Vernova Common Stock` as GE where GE
  Vernova is GEV, and Ropcor (33,134) prints `GE Common Stock` as GEV — the same
  defect in both directions**; P&G (42,264) → `The J.M. Smucker Company`;
  American Express (38,871) → `LXP INDUSTRIAL TRUST`; Fidelity National
  Financial (24,092) → `F&G Annuities & Life` and `Cannae Holdings`;
  ConocoPhillips (13,175) → `Phillips 66 Stock Fund`; Agilent (9,150) → `Uber
  Technologies Inc`; H&R Block (27,766) → `MFS International Equity Fund Class
  3A`.
  **DO NOT CARRY 87 ROWS / 1,187,546 PPL FORWARD AS THE CLASS** — a large part is
  my screen's own false positives: a bare `Common Stock` / `Employer Stock` /
  `Corporate common stock` caption really IS the sponsor's stock, `AIT INC` and
  `IFF Common Stock` are ACRONYMS of the sponsor, and `MCDONALD'S CORPORATION`
  fails to match sponsor `Mcdonalds Corporation And Subsidiaries` on the
  APOSTROPHE — **the third time punctuation in a sponsor name has cost this
  record a match.**
  **THE SHIPPED GUARD'S MISS IS DIAGNOSED, NOT GUESSED:** `isMistypedStockRow`
  returns false when **the NAME itself claims stock** — which is what keeps a
  genuine `Employer Common Stock` row safe and **exactly what lets a SPUN-OFF
  company's *stock fund* read as the sponsor's own** — and otherwise requires
  `POOLED_CONSTRUCTION_NAME`, so a row naming a single other COMPANY or an
  ordinary mutual fund is outside it by construction.
  **THE DISCRIMINATOR IS IN THE REPO AND UNUSED: `plans-all` carries 112,652
  sponsor names WITH their tickers**, and Phillips 66, Keysight Technologies,
  Uber Technologies, GE Vernova and Cannae Holdings are themselves sponsors in
  our own universe — so *a row naming another plan's sponsor is naming another
  company*, with no new vocabulary and no new source.
- **AND THE STORED-TICKER LEAK IS DOING ACCIDENTAL GOOD, WHICH IS WHY THE
  OBVIOUS FIX IS THE WRONG TRADE.** `tk` falls back to the stored symbol
  wherever a suppressor sets `info = null`, and **27 rows / 2 plans / 7,002 ppl
  reach a reader ONLY because of it**: **Hilti, Inc. (5,197 ppl) has its ENTIRE
  27-row menu typed `Stable value / GIC`** while the names are `Vanguard
  Institutional Index Fund Institutional Shares`, `MFS Growth Fund R6`, `Dodge &
  Cox Stock Fund Class X`, and Adams Fairacre Farms (1,805) the same — correct
  tickers, every fee withheld by `gicRow`. Closing the leak naively withdraws 27
  correct answers to remove one wrong one; **Hilti's real defect is the TYPE,
  upstream in the parser.**
  Also found, small: `Fidelity Select Brokerage & Investment Management
  Portfolio` typed `Brokerage window` because `brokerageRow` matches the NAME
  (2 rows / 9,070 ppl, ticker right, type wrong); and 1 master-trust row
  publishing the generic 0.35.
  **METHOD NOTE, because I claimed both and only one was true: the audit's
  pre-filter is EXACT but not FAST.** It is the union of the suppressors' own
  first conditions, so nothing that could match is excluded — but one of those
  is *the row has no issuer*, true of most published rows, so it rendered
  **1,311,859 of 1,724,078**. A standing version needs the nameless arm's SECOND
  condition in the filter too.
- **SHIPPED AND MIRRORED 2026-10-01 14:2xZ (`66da4f3e → 9da3b858`), UNFORCED ON
  BOTH CHECKS, data gate +0 / −0 BY ACK AND BY PLAN — THE FEE HALF OF THE
  CONTRACT RULE SHIPPED FOR ONE WORDING: 117 rows / 117 plans / 191,275
  participants / $749,120,771 stop being shown a fabricated expense ratio**, and
  **every one of the 117 publishes exactly 0.35** — `fund-er.js`'s generic
  `/stable value|guaranteed|gic/` fallback, the same number withdrawn from 89
  rows on 2026-09-29 and refused again by v196. **0 tickers move, 0 shown types
  move.**
  **BOTH HALVES OF THIS RULE SHIPPED IN THE SAME COMMIT WITH DIFFERENT REACH.**
  `annuityFeeIsGuaranteeOnly` opens with `ANNUITY_CONTRACT_NAME.test(s)`, so
  `investment contract` / `insurance contract` is outside the FEE rule BY
  CONSTRUCTION — while `isInvestmentContractRow`, four lines below it, was
  written for all three wordings DELIBERATELY, its own comment recording that
  shipping only the phrase an item was filed under is v131's mistake. **The TYPE
  half learned the lesson and the FEE half, written the same hour, did not** —
  the eighth instance of *a fix for one phrasing of a class is not a fix for the
  class.*
  **THE PREDICATE IS REUSED AND NOT RETYPED:** the gate now also tests
  `CONTRACT_DESIGNATION_NAME`, the TYPE rule's **own constant**, so the two
  halves cannot drift apart again; `ANNUITY_CONTRACT_NAME` stays separate
  because `isAnnuityContractRow` uses it to TYPE a row `Annuity contract`.
  **ALL 89 DISTINCT NAMES READ**, not one a registered fund — Baptist Healthcare
  19,840 ppl, Parkview Health 18,080, Bob Evans 15,749, Steel Dynamics 11,783.
  **IT IS NOT THE OWNER-GATED STABLE-VALUE ITEM AND MUST NOT BE READ AS A BITE
  OUT OF IT.** That one re-derives this cycle at **4,669 rows / 4,525 plans /
  7,389,704 ppl** (4,571 at 0.35) and STAYS GATED; these 117 additionally carry
  the filing's own word `contract`, which is the condition already decided.
  **MY FIRST FIX WAS INERT AND THE MEASUREMENT SAID SO BEFORE IT WAS WRITTEN
  UP.** The escape hatch really is circular — `isInvestmentContractRow` stands
  down when the remainder `namesAFund`, and the only thing making `Guaranteed
  Income Fund` name a fund is the generic fallback whose number is the problem —
  so I proposed screening `namesAFund` with `annuityFeeIsGuaranteeOnly`. **It
  reaches 0 rows**, because that function answers FALSE on every one of them for
  the gate reason above. *The tool for the circularity was unreachable, not
  absent*, and a clean zero reported on the query.
  5 must-suppress + 2 must-keep pins **added because NOT ONE of the 15 existing
  cases says `investment` or `insurance` contract**; the sharpest is `Fully
  benefit-responsive investment contract Key Guaranteed Portfolio Fund` six
  lines above the must-KEEP `Key Guaranteed Portfolio Fund` — same fund name,
  the filing's own word `contract` the whole difference. Negative control fails
  by name on exactly the 5 and holds all 16 others. parser-gate, smoke,
  fund-er-test (62/26/19/18/18) green. **REPORT path only as a GUARANTEE**;
  `git diff --stat p/` empty. `docs/accuracy-log.md` 2026-10-01 (14:2xZ).
- **AND A FOURTH HAND-WRITTEN TWIN DELETED BY A REGENERATION, caught in the same
  cycle by the smoke tether.** `isLoanVocabularyRow` (11:4xZ) and
  `isBankDepositRow` (01:5xZ) were typed into app.js's GENERATED block, and this
  cycle's `gen-generic-twin.mjs` run replaced the block and took both — the page
  threw `isLoanVocabularyRow is not defined`, so **every row on every plan page
  would have failed to render.** Both are now VERBATIM SLICES with their hooks
  in `MARK_ENDS` and a drift probe each, as `isCollectiveTrustName` and
  `isLoanAnswerRow` were on 2026-09-30. **Four twins lost to three regenerations
  is not a slip, it is the default outcome of hand-writing one**, so the rule is
  now stated at the TOP of the generator: *a predicate app.js twins is sliced
  there on the day it ships and never typed into app.js.* The tether caught all
  four on the very next change — the argument for the tether, not an excuse for
  the habit.
- **THE 14:0xZ DRAW, and both of its apparent findings resolved without a new
  defect.** Seed 2026100114; Bob Evans Restaurants (15,749 ppl, 13 rows @ 1.000)
  and Oracle (101,985 ppl, 40 rows @ 0.911). Bob Evans' guaranteed-income row is
  what found the item above. **Oracle's FOUR PAIRS OF NEAR-IDENTICAL VALUES are
  a 50/50 manager split and not a double render, and the pair differing by
  exactly $1,000 is what says so** — `DFA Emerging Markets Core Equity`
  $107,457,000 beside `RBC Emerging Markets Equity Fund Class I` $107,456,000 is
  a $214,913,000 sleeve halved and rounded, which a parse artifact cannot
  produce. *Recorded because two rows with the same value will look like a
  defect to the next cycle too.* Also live in the same menu and already queued:
  `Empower Trust Company, LLC` at 3.0% of Bob Evans (the bare-house class) and
  `BlackRock Inflation Protected Bond Instl` resolving to nothing (the matcher
  family).
- **SHIPPED AND MIRRORED 2026-10-01 14:0xZ (`8b491049 → 6cbde627`), UNFORCED ON
  BOTH CHECKS, data gate +0 / −0 BY ACK AND BY PLAN — A CONTROL CHARACTER WHERE A
  SPACE BELONGS: 128 rows / 32 plans / 139,537 participants / $169,299,036**, and
  it is not only an honesty fix: **+9 tickers / −0 / 0 flipped, +21 fees / −0 /
  4 CHANGED, 1 asterisk gained** to a labelled comparable. A broken PDF font
  shifts its whole run by +29, so the SPACE (0x20) arrives as 0x03 and the
  browser renders **nothing** — Fiserv's 39,782, Philips' 29,491, Arthur J.
  Gallagher's 29,477 and Brown University Health's 19,490 saw
  `VanguardTargetRet2065`.
  **THE OBVIOUS READING IS WRONG AND MY OWN PREDICATE'S REFUSALS SAID SO.** A +29
  shift invites shifting the string back; **of 114 rows carrying the shifted
  space, 100 decode to GARBAGE**, because their LETTERS were never shifted —
  `Fidelity<0x03>Investments<0x03>Money<0x03>Market` is plain text and decodes to
  `cidelity fnvestments joney j~rket`. **THE SHIFT IS PER-RUN AND NOT PER-STRING:**
  Edelman's row is plain `Vanguard Windsor` followed by a ciphered `,, Admiral
  Fund`, so decoding the whole string destroys the half that was already right.
  **THE ONE RISK IS A CONTROL CHARACTER INSIDE A WORD**, where a space SPLITS what
  v519's arm would WELD, **and it does not happen here: of 217 control characters
  with a letter on BOTH sides, the joined form is a published word while the left
  fragment is not on 0** — whole population, and the test fires on a crafted
  `Vangua<0x03>rd`, so *the zero is the data's and not the query's*.
  **THE CLASS IS EVERY C0 CHARACTER AND DEL, not the +29 image of a space**:
  `Vanguard Target Retirement Fund<0x02>2050` is the same defect one code point
  along, so the rule is the character class and not the mechanism's story.
  **THE COMPOSITION IS WHERE IT PAYS AND IT IS PINNED:** once a trailing control
  character is a space, `TYPE_SUFFIX` sees a vehicle caption it could not see
  before. **COST NAMED, both inside that composition:**
  `Royce<0x03>Pennsylvania<0x03>Mutual<0x03>Fund` → `Royce Pennsylvania`, losing a
  `Mutual Fund` that is genuinely part of the name (0 ticker, 0 fee); and
  Electrolux's Fidelity government money-market row gains the **generic 0.2** where
  its name states the house — a named live instance of the queued fee pre-emption,
  fed by one row and not caused here.
  All 116 distinct transformations read; **all 4 fee changes are an EXISTING
  specific entry finally reaching a legible name** (`AF New World Fund` 0.4 → 0.57
  moves UP, the direction that cannot be a flattering bias). 7 new `nameCases` and
  8 new pins **added because NOT ONE of the 84 existing cases carries a control
  character**; the module control fails by name on exactly the 8 of 99, the twin
  control on exactly 7 of 103. parser-gate, smoke, fund-er-test (62/26/19/18/18)
  green. **2 crawlable pages / 5,713 ppl**, both cells read. `site-test` #130 and
  Pages #775 both fired on the exact shipped commit and were observed running.
  `docs/accuracy-log.md` 2026-10-01 (14:0xZ).
- **QUEUED, SIZED, MEASURED, NOT SHIPPED — THE CIPHERED RUN, the other half of
  the same font: 16 rows, and the draft DIED ON TWO THINGS THE MEASUREMENT
  FOUND.** `1XYHHQ 6PDOO &DS %OHQG ,QGH[ )XQG &ODVV 5` is `Nuveen Small Cap Blend
  Index Fund Class R`; Edelman's (2,315 ppl) is `Vanguard Windsor II Admiral
  Fund`, **publishing 0.3 where that class's real figure is 0.26**.
  **(1) THE DRAFT TOKENISED ON `\s+` AND `\u0003` IS NOT `\s` IN JAVASCRIPT**, so
  against the STORED name — which still carries its control characters — the arm
  would have fired on **0 rows while every gate passed**. *An arm that cannot fire
  is worse than an absent one, because its name implies coverage.*
  **(2) A FLOOR OF THREE CHARACTERS LEAVES A ONE-CHARACTER TOKEN AS FILED**, so
  `&ODVV<0x03>5` would publish `Class 5` where the filing says **Class R** — a
  wrong share class asserted, in the same cycle that found a wrong share class
  costing a fee.
  **THE FIX FOR (2) IS THE MECHANISM TALKING AND IT IS THE NEXT CYCLE'S WORK: the
  shift is per RUN, and 0x03 IS the ciphered space, so a token PRECEDED by a
  control character is in the same ciphered run** (a plain space would be 0x20).
  One token passing the two-sided witness then licenses every token in that run,
  including single characters, and `,,` decodes to `II` while `Vanguard Windsor`,
  preceded by a plain space, is left alone.
  **THE WITNESS IS THE ISSUER STRIP'S, TWO-SIDED, AND A TOKEN'S SHAPE CANNOT
  REPLACE IT:** +29 maps a lowercase letter into `D`-`]`, so a ciphered word and
  an ordinary ALL-CAPS word are the same shape — a shape-only rule turned Antonini
  Freight Express's own `FREIGHT EXPRESS` into `cobfdeq bumobpp`. `FREIGHT` is
  attested and kept; `$GPLUDO` is attested nowhere and `Admiral` is.
  **AND THE ORDER BETWEEN THE TWO ARMS MATTERS:** the shipped display arm deletes
  ciphered DIGITS with the other control characters (0x13-0x1c are the +29 images
  of 0-9), so the decode must run on the STORED name in `merge-4i` and never after
  it. Draft at `scratchpad/cipher-arm.patch`. MERGE-SIDE, so it needs a run.
- **THE 11:4xZ DRAW FOUND ONE REAL DEFECT AND REFUTED MY GENERALISATION OF IT IN
  THE SAME PASS.** Seed 20261001114; Edelman Financial Engines (2,315 ppl, 15
  rows @ 0.991) and Campbell Transportation (711 ppl, 30 rows @ 0.928, OCR'd).
  **THE DEFECT IS ONE ROW: Edelman publishes
  `Vanguard Windsor\u0003,,\u0003$GPLUDO\u0003)XQG` at $16,761,074 = 2.8% of
  its menu WITH AN EXPENSE RATIO OF 0.3 BESIDE IT.** Shift the printable range by
  one and the filing says **`Vanguard Windsor II Admiral Fund`**, whose real
  figure is 0.26 — the legible prefix `Vanguard Windsor` is what `fundER`
  matched, and **the share class, on which the whole fee depends, is in the
  unreadable part.**
  **AND THE OBVIOUS GENERALISATION IS FALSE, measured before anything was
  written.** *"A control character means the name is unreadable"* reaches **128
  rows / 32 plans / 139,537 ppl**, of which 46 publish a ticker or a fee — and
  **45 of those 46 are LEGIBLE names where `\u0003` is simply the SPACE**, every
  answer correct (`Vanguard\u0003Target\u0003Ret\u00032065` → VLXVX,
  `Fidelity 500 Index\u0003` → FXAIX, `Target Rtmt 2025\u0003` → VTTVX). *A
  control character is not a signal about the name.* **Do not carry 128 or
  139,537 forward.**
  **WHAT IS LEFT IS THE CIPHER ENCODING ITSELF AND IT IS NOT SIZED.** A first
  predicate was written and **abandoned because it matches almost every fund
  name** — any name carrying ` - Adm` or `, Inc` satisfies it. It is my regex,
  not a population, and **no number from it is recorded**. *An implausible match
  rate is the tell, and the honest entry is the one with no figure in it.*
  **A CLEANER MEMBER IS VISIBLE IN THE SAME 128:** four rows named
  `a(2) 7RWDO QXPEHU RI DFWLYH SDUWLFLSDQWV` — *"Total number of active
  participants"* — and three more `g(1) FRPSOHWH WKLV LWHP`: **v193's Form 5500
  COVER-PAGE family IN CIPHER**, which every arm that reads words is blind to by
  construction.
  **TWO OWNER-GATED ITEMS HAVE NAMED LIVE INSTANCES IN THE SAME DRAW:** Campbell
  publishes **thirteen `<year> Target Date Retirement Fund` rows issued by
  American Funds, 51.7% of its menu, 0 tickers and 0 fees** (the R-6 item and the
  American Funds target-date gap in one plan), and **`T. Rowe Price` at 6.5% /
  $2,312,673 typed `Collective trust`** is the bare-house class.
  **AND THE 09:4xZ MANAGER-GATE FIX IS VISIBLY DELIVERING IN THE SAME MENU:**
  `MFS Value R6` → **MEIKX** through the stored SEC field, the R6 class the
  filing states. *A draw taken two hours after a ship is a cheap independent
  check that it reached a reader.* `docs/accuracy-log.md` 2026-10-01 (12:0xZ).
- **SHIPPED AND MIRRORED 2026-10-01 11:4xZ (`3fac688a → bc12604e`), UNFORCED ON
  BOTH CHECKS, data gate +0 / −0 BY ACK AND BY PLAN — THE LOAN ANCHOR WAS TOO
  STRICT: 1,488 rows / 1,465 plans / 1,168,452 participants / $1,769,996,593**
  stop being shown a participant-loan line as a menu holding. **0 tickers / 0
  fees / 0 asterisks move and 0 typings are LOST** — an honesty fix, every arm
  additive by construction. Three causes, each outside an existing rule BY
  CONSTRUCTION rather than by oversight.
  **(1) AN APOSTROPHE — 1,234 rows / 1,234 plans / 674,947 ppl, the largest
  shape in the class.** `LOAN_ROW` accepts `Participant Loan Account` and
  refuses `Participant's Loan Account`: the lead is `participant[- ]?`, so after
  the noun the pattern meets `'s` where it wants `loans?`. **THAT THE ROW COUNT
  AND THE PLAN COUNT ARE IDENTICAL IS ITSELF CORROBORATION** — a plan files ONE
  participant-loan line. All 13 distinct names read.
  **(2) A LEADING ADJECTIVE — 218 further rows**, the seventh instance of a
  missing entry in an anchored list hiding a class and the first where **no list
  can be widened**, because the missing entry is an adjective.
  **(3) A MISSING PREPOSITION — 36 rows**, `rates of 4.25% to`.
  **ARM (2) NEEDS NO VOCABULARY OF ITS OWN AND THAT IS THE WHOLE DESIGN:**
  `loanDescriptionResidue` already strips the loan words, and `fund`, `trust`,
  `portfolio` and `etf` are DELIBERATELY ABSENT from that list, so every real
  holding keeps a residue and is refused without one fund name being enumerated
  — `Bank Loan Fund` → {bank, fund}, `Senior Loan Portfolio`, `Invesco Senior
  Loan ETF`, J&J's `LOANS SECURED BY MTGES-RESID.` → {mtges, resid}, `FEDERAL
  HOME LOAN BANK OF BOSTON`, `VOLKSWAGEN AUTO LOAN ENHANCED TRUST`.
  **A `NOTE` IS A SECURITY BEFORE IT IS A LOAN, AND THE DRAFT'S OWN OUTPUT SAID
  SO:** a first version asking only for a loan-or-note word caught **37 rows of
  `Note @ 1.500% Maturing 2/15/2030` and `Note 3.150% due 03/15/2027`** —
  Treasury and corporate notes in a real bond sleeve, every one of which empties
  the residue exactly as a loan line does. **COST NAMED, 6 rows** of genuine loan
  fragments refused with the bonds.
  **THE NAIVE REPAIR OF (3) WAS MEASURED AND REFUSED:** adding `of` to the
  connective alternation needs no second number, so it reaches `Fixed rate of
  3.00%` and two siblings — ordinary crediting rates — and that predicate
  REPLACES the name. One token in the arm that already exists for `from`.
  **COST NAMED, 1 row:** Northeast Community Bank's `Participation Loans`.
  All 103 distinct newly-typed names read, not one a fund.
  **AND A FIFTH INCOMPLETE TRANSCRIPTION IN THE DRAW HARNESS, MINE AND AN HOUR
  OLD, CAUGHT BECAUSE TWO OF MY OWN COUNTS DISAGREED.** The first outcome test
  read "1 ticker, 0 fees" and was worthless twice: it rendered the BEFORE through
  the WORKING TREE's app.js, so every suppressor under test read as applied; and
  once fixed the AFTER still reported **1,269 type changes against the
  predicate's 1,488**, because `apppath.mjs`'s `loanRow` lists four arms and I
  had added a fifth to app.js without adding it here. ***A before/after harness
  is only as honest as its "before", and a transcription rots as the expression
  grows — including when the author of the growth is you, the same hour.***
  **Two disagreeing counts are the tell; neither was published until the gap was
  named.**
  25 pins on the new arm (12 must-flag / 13 must-keep, the must-keeps including
  the three bond rows); the two existing tethers grow to 24 and 27. **A negative
  control PER CONDITION, each built DIRECTLY rather than by surgery on the
  shipped source, failing by name on exactly its own cases: 5 / 3 / 3, plus
  `Interest rate 1.75%` for the loan-word condition.** parser-gate, smoke and
  fund-er-test (62/26/19/18/18) green. **7 crawlable pages**, every changed cell
  read, one per page. `site-test` #129 fired on the exact shipped commit.
  `docs/accuracy-log.md` 2026-10-01 (11:4xZ).
- **PREVIOUSLY QUEUED (superseded by the bullet above; its 693 / 564 / 1,350,736
  figures are a candidate count and the shipped ones are 1,488 / 1,465 /
  1,168,452, the gap being rows no arm could decide):** THE LOAN ANCHOR IS TOO
  STRICT: 693 rows / 564 plans / 1,350,736 participants / $2,827,697,085 of loan
  prose that NO shipped guard types, against 955 rows the guards already
  serve. Largest shape **`OUTSTANDING LOAN BALANCE`, 85 rows across spellings**,
  with `Outstanding Plan Loans`, `Outstanding participants' loans`, `Loans to
  Plan Participants`, `Loans Issued at`, `Loans with`. `LOAN_ROW` is anchored on
  the name BEGINNING with the loan word — the anchor that keeps `Bank Loan Fund`
  safe — so a row beginning with `Outstanding` is outside it BY CONSTRUCTION;
  **the sixth-plus instance of a missing entry in an anchored list hiding a
  class**, the missing entry here being a leading adjective. Second, smaller arm:
  `LOAN_DESC_RANGE` reads `rates? … (rang|between|vary|from)` and **omits `of`**,
  so `rates of 4.25% to` (15 rows) states a range the predicate cannot see.
  **THE MUST-KEEP SET IS WHY IT IS QUEUED AND NOT SHIPPED:** a real holding may
  quote a crediting rate (`Stable Asset Fund II (interest rate 3.20%)`,
  `Guaranteed Income Fund (1.90% interest rate)`, Griswold's pinned Principal
  GIC), and **`LOANS SECURED BY MTGES-RESID.` is J&J's real MORTGAGE holding**,
  already pinned from the 2026-09-28 loan work.
- **AND THE ROUTE THERE IS A DEAD DISCRIMINATOR WORTH NOT RETRYING: "a name that
  ends in a function word is a wrapped sentence" IS NOT A CLASS.** The first list
  read **37,687 rows / 20,243,075 ppl** and is almost all REAL FUNDS, because
  `a`, `an`, `as`, `is` are SHARE-CLASS DESIGNATIONS before they are English
  words — `Columbia Small Cap Index A`, `Western Asset Core Bond IS`, `Vngrd 500
  Index Fd As`. Narrowed to prepositions and conjunctions it reads **1,489 /
  2,526,764** and is **at least FIVE mechanisms, two of which must be LEFT
  ALONE**: a TRUNCATED REAL NAME that stripping makes worse (`PIMCO GNMA and`,
  `American Funds Capital World Growth and`), and a TRUNCATED SHARE CLASS —
  **`in` is the largest tail word at 541 rows and is dominated by `FIDELITY
  FREEDOM INDEX 2060 IN`, a cut `Institutional`.** **Do not carry 37,687,
  20,243,075, 1,489 or 2,526,764 forward.**
  **AND MY SKIP FILTER IS WHY THE LOAN HALF LOOKED UNSERVED:** it excluded rows
  whose shown type matched `/loan/i` and the label those rows carry is **`Not a
  menu choice`**, so the pass reported `already typed: 0` and I read it as
  evidence. Asking the predicates BY NAME, `isLoanDescriptionRow` already serves
  `rates ranging from 4.25% to` and its siblings. ***Ask the guard — and when a
  guard's answer is a LABEL, match the label it actually prints.***
  `docs/accuracy-log.md` 2026-10-01 (11:0xZ).
- **#534 and #535 (cron, on MAIN) RAN `success`** (data `edf23db9`, `8b491049`):
  the coverage line is **byte-identical** to #533's — confident 60,170, lineups
  59,822, entries 65,479, HIGH **4 = the baseline**, warn 603, overshoot 372, dl
  19, pv 100, tkExact 37.2 — which is the correct outcome for a scheduled
  incremental whose work list is the dead 403s, not a stall.
- **PREVIOUSLY: #533 RAN `success` AND IS MIRRORED — 2026-10-01 10:1xZ
  (`0b3e9b1a → b7d4e0ef`), UNFORCED ON BOTH CHECKS, data gate +0 / −0 BY ACK AND
  BY PLAN. EVERY PRE-REGISTERED FIGURE PASSED, AND THE PRODUCTION MERGE
  REPRODUCED THE LOCAL ONE EXACTLY.** Read out of the ARTIFACT (the merge log's
  blob host is `connect_rejected`): `sec tickers` **477,625 rows across 47,915
  plans (113,423 on a blank type cell)**, all three to the digit, and diffing the
  data commit against the commit I wrote gives **`stk` 0 differing rows, `name`
  0, 0 acks added or removed, 0 row-count changes.** Coverage line byte-identical
  but for the one figure registered to move: **`tkExact` 36.34 → 37.2**, with
  `tkComparable` 3.27 and confident 60,170, lineups 59,822, entries 65,479, HIGH
  4, warn 603, overshoot 372, overshootTrust 12, aggRow 113, dl 19, pv 100 all
  held. **`tkShare` held at 24.47 EXACTLY**, which is the sharper registration
  #532's verdict said to prefer over a tolerance — it is a separate
  one-argument sample that cannot read the stored field, so it could not move,
  and saying *why* a figure cannot move is a stronger claim than bounding it.
  `site-test` #128 reads `conclusion: success` on `0b3e9b1a`, the exact mirrored
  commit, so CI green covers every executable line shipped.
- **SHIPPED AND MIRRORED 2026-10-01 09:4xZ (`de63cf2d → 0b3e9b1a`), UNFORCED ON
  BOTH CHECKS, data gate +0 / −0 BY ACK AND BY PLAN — THE MANAGER GATE REFUSED
  ITS OWN EXACT MATCHES: 13,591 rows / 9,943 plans / 11,640,610 participants /
  $19,246,511,528 gain a named fund, 0 lost, 0 flipped, 0 fee moves, 0 asterisks
  moved.** The largest ticker change on this record. The data ships in the SAME
  COMMIT as the code (#528's precedent) because the local merge's whole effect
  was attributed field by field; **#533 and `site-test` #128 both fired on
  `0b3e9b1a` and #533 was observed `in_progress`**, so the run confirms the
  production merge rather than delivering it.
  **THE CAUSE WAS INSTRUMENTED, NOT REASONED ABOUT** — every `return null` in
  `resolveUncached` labelled, and the first one reached named itself. **The key
  is the registrant's LEGAL ENTITY name and a filing writes the BRAND**
  (`MFS SERIES TRUST IV` → `mfs series`); `mgrKeys` carries
  `managerPhrase(SERIES)` too but `filedMgrs` is drawn from MANAGERS, built from
  registrants ALONE, so that key is unreachable BY CONSTRUCTION.
  **AND THE WHOLE POPULATION IS AN ACRONYM HOUSE, which states the mechanism
  exactly:** `managerPhrase` extends past a lead of four characters or fewer, and
  an acronym brand IS such a lead — all fourteen families are two to four letters
  (MFS, AMG, TCW, AQR, GMO, RBC, CRM, BBH, SA, LKCM, YCG, RMB, EA, AGF).
  **THE RULE IS ONE SENTENCE, NO VOCABULARY AND NO THRESHOLD: a series-leading
  token is a HOUSE when every registrant that registers a series under it is
  itself named after it** — 234 of 1,256 qualify — plus the series' own manager
  phrase present in the filed name as a whole phrase.
  **TWO SIMPLER RULES WERE REFUTED BY READING THEIR OWN OUTPUT and both are
  pinned so the refutation cannot be undone silently.** *"The series leads with
  its OWN registrant's leading token"* is satisfied for free by a registrant
  named after its product and published **`American Funds Washington Mutual R6`
  → AMERICAN MUTUAL FUND, a DIFFERENT FUND**; *"the series-leading token is
  RARE"* measures rarity and not house-ness, and handed **`BlackRock Floating
  Rate Income Portfolio Class K` to John Hancock's**; a third, *"the token leads
  SOME registrant"*, gave `{Goldman Sachs} Short Duration Fund` American
  Century's.
  **THE PHRASE CONDITION IS LOAD-BEARING AND ITS CONTROL NAMES WRONG ANSWERS**
  (without it `MFS Massachusetts Investor Growth Fund` resolves to `MFS Growth
  Fund`), and **its cost is named**: `Utilities (MFS)` and `{AQR Capital
  Management} Managed Futures Strategy Fund` are refused because the house sits
  in a bracket or an issuer cell.
  **AND IT CARRIES A SAFETY PROPERTY THE GATE OTHERWISE SUPPLIES BY HAND:** a
  bucket is shared by every registrant with the same series key, so under this
  test **the bucket is SINGLE-HOUSE by construction** and no competitor's class
  can be returned.
  **0 WRONG HOUSES OVER THE WHOLE POPULATION, screened not sampled:** of 2,595
  distinct pairs, 409 name another house and **all 409 are MFS's own legal name
  `Massachusetts Financial Services` (206) or a TRUSTEE in the issuer cell**
  (Fidelity 65, Empower 65, Principal 14, Vanguard 9) — the answer following the
  FILED NAME, which is `resolveHolding`'s own *add a manager, never replace one*.
  **All 202 distinct claims read**, the MFS R3/R4/R6 ticker ladder exact
  throughout; the 30 whose filed name lacks the house token read individually,
  every one the wrapped-name shape, nine of them `M FS Lifetime <year> R6` where
  **v531's join arm repairs the broken font and this arm then admits it — two
  arms composing.**
  **MY FIRST FOOTPRINT WAS A PROXY AND LOW BY A FACTOR OF TEN, 1,648 against
  15,830.** It judged the gate's FIRST refused candidate; `resolveHolding` calls
  `resolve` several times and the arm applies inside every one. ***A capture at
  an inner site is not the predicate's verdict when the caller calls it many
  times*** — *measure through the function the caller calls*, a fifth time.
  Stored **15,830 rows / 11,273 entries** against **13,591 reaching a reader**,
  reconciled rather than conflated. 20 pins **because not one of the 132
  existing cases reaches the arm**; a negative control per condition failing by
  name on exactly its own cases (3 / 4), and **the variant clears the resolver's
  memo on both sides — not housekeeping, because `resolve` memoizes on the filed
  name and every drop would otherwise pass.** **Two of three new class pins were
  written from memory and were wrong.** Real merge reproduces it: `stk` on
  15,830 rows **and nothing else**. Largest: Paychex Retirement 645,304, Allegis
  193,721, Oracle 101,985, **Circle K 71,309 — the plan whose immaculate menu
  exposed it.** **PRE-REGISTERED:** `sec tickers: 477625 rows across 47915 plans
  (113423 on a blank type cell)`; `filed tickers` 2,166 / 75 unchanged;
  CONFIDENCE DIFF +0 / −0, rows-dropped 0; confident 60,170, HIGH 4, warn 603,
  overshoot 372, dl 19, pv 100 unchanged; **tkExact 36.34 → 37.2**, tkComparable
  3.27, **tkShare 24.47 exactly** (a separate one-argument sample that cannot
  read the stored field). REPORT path only as a GUARANTEE.
  `docs/accuracy-log.md` 2026-10-01 (09:4xZ).
- **AND THE 09:4xZ DRAW CORRECTED TWO OF MY OWN READINGS BEFORE EITHER WAS
  FILED AS A DEFECT.** Seed 20261001094, Baylor Scott & White (57,248 ppl, 26
  rows @ 1.000) and Trader Joe's (73,932, 16 rows @ 1.000).
  **(1) `December 2034` at $58,243,000 looked like an unguarded loan row and the
  shipped guard answers TRUE** — `isLoanMaturityRow` fires, app.js:2569 and
  `build-seo-pages.mjs:256` both wire it, so those readers are already told it is
  a participant loan. **What was stale is the DRAW HARNESS: a FOURTH incomplete
  transcription in `apppath.mjs`**, whose `loanRow` had only `LOAN_ROW` and
  `isLoanDescriptionRow` where app.js also has `isLoanAnswerRow` and
  `isLoanMaturityRow` — and that feeds `shownType` AND the fee suppression, so it
  would have over-reported a fee on the same rows. Repaired by importing both
  from `lib-disclose`. *Ask the guard before sizing a defect*, and *a transcription
  of a shipped expression rots as the expression grows.*
  **(2) `iShares U.S. Aggregate Bond Index Fund` → WFBIX read as a wrong house on
  the strength of the symbol's letters, and the registry says `BlackRock Funds
  III :: iShares U.S. Aggregate Bond Index Fund`, Class K** — the legacy Wells
  Fargo symbol carried over on acquisition. **Correct.** *A ticker is not a
  reading; the series name is* — met for the second time on this record, two days
  apart.
  **WHAT THE DRAW DID FIND, all of it already on the queue and none of it new:**
  `Dodge & Cox Stock Fund Class X` → **DODGX asserted** where the SEC registers
  Class X as DOXGX, and `Vanguard Inst Total Intl Stk Mrkt Idx TRBSWVTI` →
  **VTIAX, the ADMIRAL retail class**, on a name stating Inst — two live
  instances of the owner-gated different-class item; and Trader Joe's four
  `American Funds ...` rows publishing 0.26–0.40 while **stating no share class
  at all**, the owner-gated R-6 inconsistency, 73,932 ppl in this plan alone.
  **One small NEW member:** `All investments held in` typed `Mutual fund` at
  $2,023,000 — a wrapped-sentence tail as a holding, v191's `Statements` family
  one phrase along, 0.0% of the menu.
- **PREVIOUSLY QUEUED (superseded by the two bullets above; its 4,590-row figure
  is the first proxy's and the shipped one is 13,591 reaching a reader out of
  15,830 stored):** **QUEUED 2026-10-01 08:4xZ, CAUSE DIAGNOSED, NOT SHIPPED — THE MANAGER GATE
  REFUSES ITS OWN EXACT MATCHES: 4,590 rows / 3,294 plans / 4,924,153
  participants / $8,448,467,583 would newly name a fund.** This is the
  fund-identification gap the queue held at 139,910 rows / 38.7M ppl with the
  cause recorded only as *"a MATCHER gap, not a data gap"* — which names a file
  and not a mechanism.
  **`MFS Mid Cap Growth Fund` MATCHES ITS SERIES EXACTLY (`why=exact`) AND THE
  GATE THEN REFUSES IT.** Instrumented, not reasoned about: every `return null`
  in `resolveUncached` labelled, and the first one reached names itself. The
  candidate's keys are `["mfs series", "mfs mid"]` and `filedMgrs` is **empty**,
  because `managerPhrase("MFS SERIES TRUST IV")` extends past a lead of four
  characters or fewer and takes the corporate form with it. ***The key is the
  registrant's LEGAL ENTITY name and a filing writes the BRAND.*** The
  all-furniture guard cannot see it — it rejects a phrase where EVERY word is
  furniture, and `mfs series` is half furniture.
  **TWO OF MY OWN FRAMINGS WERE REFUTED BY THEIR OWN MEASUREMENT:** I expected
  `mfs series` to be ABSENT from `MANAGERS` and it is **present** (only 57 of
  12,323 series have no live key), so it is live and *unreachable*, a narrower
  fault; and I expected the shape `<house> <corporate-form>` to be the
  signature, but **`american funds` has exactly that shape and is hit
  constantly**. *A condition count is not a loss count, and I counted the wrong
  condition twice.*
  **THE RAW FIGURE IS 10,580 rows / 7,171 plans / 10,508,871 ppl / $28.9B AND
  MOST OF IT IS THE GATE WORKING — do not quote it as the class.** Its top
  refused series are `High Yield Portfolio`, `S&P 500 Index Account`, `SMALL CAP
  VALUE FUND` — house-less registered names that would otherwise be handed to
  any house's holding, the exact failure the gate's own comment was written for.
  **5,991 rows are correctly refused.**
  **THE SEPARABLE HALF IS STRUCTURAL AND NEEDS NO VOCABULARY: the series name
  itself names a house and the filed name names the same one** — 4,219 distinct
  pairs, `MFS Value Fund` → the series `MFS Value Fund` **as an exact string**,
  `PGIM Total Return Bond R6` → `PGIM TOTAL RETURN BOND FUND`, `AB Small Cap
  Growth Z` → `AB Small Cap Growth Portfolio`.
  **NOT SHIPPED on SIZE, not on evidence:** 4.9M participants gaining an
  asserted ticker is larger than any ticker change on this record, all 4,219
  pairs must be read against their registered series first, and it is
  merge-side so it needs a run. **The next cycle's work is reading the 4,219,
  not re-measuring them.** Sized by the 08:0xZ draw (seed 20261001080), whose
  **Circle K (71,309 ppl, 25 rows @ 0.964) is immaculate** — the defect a clean
  menu exposes is coverage, not a false claim.
  `docs/accuracy-log.md` 2026-10-01 (08:4xZ).
- **#532 RAN `success` AND IS MIRRORED — 2026-10-01 08:2xZ (`13507fcc →
  de63cf2d`), UNFORCED ON BOTH CHECKS, data gate +0 / −0 BY ACK AND BY PLAN.
  EVERY PRE-REGISTERED FIGURE PASSED, INCLUDING THE PLAN COUNT THAT MISSED LAST
  TIME.** Read out of the artifact: `sec tickers` **461,795 rows across 47,588
  plans (110,205 on a blank type cell)**, all three to the digit, and diffing
  the data commit against the commit I wrote gives **`name` 0, `stk` 0, 0 acks
  added or removed, 0 row-count changes** — the production merge reproduced the
  local one exactly. Coverage line byte-identical; `tkExact` held at 36.34,
  inside the registered "at most 0.02", though **57 new `stk` rows against 1.72M
  cannot move a two-decimal figure and saying THAT would have been the sharper
  registration than a tolerance**. `site-test` #127 `conclusion: success` on
  `c47559ab`. **The plan count passed because it was derived from a measured
  overlap rather than a sum** — #531's lesson, one cycle later.
- **PREVIOUSLY IN FLIGHT: #532 and `site-test` #127, both fired from the push on
  `c47559ab` and observed queued — A SHARE CLASS ROTATED TO THE FRONT OF A FUND'S NAME: 672
  rows / 179 plans / 288,327 participants / $2,267,257,067** across 474 distinct
  transformations. `Fund I Class T. Rowe Price Retirement 2045`, `Institutional
  Premium Class Fidelity Freedom Index 2055 Fund`, `Institutional Class Fidelity
  500 Index`. The data ships in the SAME COMMIT as the code (#528's precedent),
  because the local merge's whole effect is attributed field by field, so a
  reader is served now and the run confirms the production merge reproduces it.
  **THE SAME ROTATION THIS RECORD MEASURED IN THE ISSUER COLUMN 2026-09-30
  (15:2xZ) AND REFUSED, and the difference is that here the repair IS the
  rotation.** There the only move was a STRIP and a strip truncates the firm.
  **It must not strip: dropping `Admiral Fund` from `Admiral Fund Vanguard Total
  Bond Market Index` would withdraw VBTLX**, the class word being the only thing
  separating it from four sibling classes. ***A rotation DELETES NOTHING***, so
  even where the order is arguable every word of the filed name survives — a
  bound a strip never has.
  **THE WITNESS IS THE REGISTRY'S CLASS-NAME COLUMN, the same evidence v529
  reads to REFUSE splitting `SMALLCAP` and v531 to JOIN `Small Cap`, in a third
  direction.** Priced whole-store at **835 further rows**, overwhelmingly CORRECT
  names the ratio alone would destroy — `Cash, non-interest bearing` →
  `non-interest bearing Cash,`, `Robeco Boston Partners Mid Cap Value` → `Mid Cap
  Value Robeco Boston Partners`, and the `SACG`/`GM` prefixes, **which want a
  STRIP and not a rotation**. Fails closed.
  **OUTCOME, AND THE TICKER COLUMN IS WHERE IT PAYS: display ticker +7 / −0 / 19
  FLIPPED, stored `stk` +57 / −0 / 0 changed, fee +0 / −0 / 5 changed, 0
  asterisks. All 15 distinct flips are the T. Rowe Price Retirement `-I Class`
  THE FILING STATES** — TRRKX → TRIKX, TRRJX → TRFJX, TRRDX → TRHDX — the
  wrong-share-class defect this record has named five times, corrected because
  the filing hands us the answer. The 5 fee moves are two names reaching
  `fund-er.js`'s own SOURCED Admiral rate 0.05 → 0.07, both **UP**.
  **READING THE TRANSFORMATIONS FOUND DAMAGE NO COUNT COULD SEE:** the ratio
  alone convicts `Core Bond Fund - VALIC` → `- VALIC Core Bond Fund` and five
  siblings, because **the registry's class-name column holds a FULL FUND NAME for
  some registrants**, and admits `(a) 500 Index Fund` because the registry lists
  a class literally named `A`.
  **AND MY FIRST OUTCOME NUMBERS WERE MEASURED ON THE WRONG PREDICATE.** The
  sizing pass took the best rotation FIRST and asked the witness afterwards; the
  shipped rule asks it INSIDE the search and can pick a different `k`. Different
  searches — 18 and 18 belonged to a predicate that is not the one shipping, and
  the shipped one reads **19 and 57**. *Measure through the function the caller
  calls*, met four times this session.
  **THE PUNCTUATION CONDITION IS DECORATIVE ON THIS STORE (0 rows) and is
  labelled as such**; what refuses VALIC is `nk`'s exact normalisation, and the
  check is controlled against a CRAFTED map where it does fire. **And the RATIO
  control was decorative against pins I chose from memory** — both hand-written
  must-keeps are refused by a neighbour, so the whole-store control named real
  ones and those became the pins, including **`Class K BlackRock LifePath Index
  Retirement`, a NAMED COST**: a correct repair the ratio refuses.
  22 pins, a negative control per condition failing by name on exactly its own
  cases (3 / 3 / 2 of 2). Real merge reproduces to the row; field by field the
  store moved `name` on 672 and `stk` on 57 **and nothing else**, the index files
  differing only in `generated`. **13 crawlable pages / 44,181 ppl**, every
  changed cell read. parser-gate, smoke, fund-er-test (62/26/19/18/18) green.
  **PRE-REGISTERED:** merge log `class-rotation repair: 672 rows across 179
  plans`; `sec tickers: 461795 rows across 47588 plans (110205 on a blank type
  cell)`; `filed tickers` **2,166 / 75** unchanged; CONFIDENCE DIFF **+0 / −0**,
  `rows-dropped` **0**; confident **60,170**, lineups 59,822, entries 65,479,
  HIGH **4**, warn 603, overshoot 372, dl 19, pv 100 unchanged.
  `docs/accuracy-log.md` 2026-10-01 (08:2xZ).
- **#531 RAN `success` AND IS MIRRORED — 2026-10-01 07:2xZ (`c42259df →
  13507fcc`), UNFORCED ON BOTH CHECKS, data gate +0 / −0 BY ACK AND BY PLAN. THE
  ROW FIGURE PASSED EXACTLY AND THE PLAN FIGURE MISSED BECAUSE OF MY OWN
  ARITHMETIC.** `sec tickers` **461,738 rows**, +1,964, and diffing `stk` row by
  row across all 64 shards against the commit I wrote gives **GAINED 1,964 / LOST
  0 / CHANGED 0** — the production merge reproduced the local one to the row.
  Coverage line byte-identical except `tkExact` 36.19 → **36.34**, as registered.
  **I registered 48,555 = 47,543 + 1,012, adding *entries the join TOUCHES* to
  *entries that already carry any `stk`*; 967 of the 1,012 were already in that
  set**, so the answer is 47,543 + 45 = **47,588**, which is what the run
  printed. ***A row either has a field or does not, so a row delta is additive;
  a plan count is a count of a SET, and set membership SATURATES.*** The same
  shape as *a count of a condition is not a measure of what a fix wins*, one
  level up. Register the row figure and derive the entry figure from a measured
  overlap, never as a sum.
- **PREVIOUSLY IN FLIGHT: #531, dispatched 2026-10-01 07:0xZ on `1cce81bb` and
  observed `in_progress` — THE FILING SPLIT A WORD THE REGISTRY JOINS: 1,927 rows / 997
  plans / 1,569,418 participants / $5,009,993,968 gain a ticker, 0 flipped, 0 fee
  moves, 0 asterisk moves.** MERGE-SIDE (it writes the stored `stk`), so the run
  was what delivered it, and the mirror was held until the verdict for v193's
  reason: no display half, so mirroring early delivers nothing to a reader.
  **BOTH ARE DONE — see the verdict bullet above; this entry is history.**
  **THE EXACT MIRROR OF v529's ALL-CAPS ARM, SAME WITNESS:** that arm reads the
  registry to REFUSE splitting `SMALLCAP`; this one reads it to JOIN `Small Cap`
  → **RLLGX**, and **v529's own recorded loss is inside this population.**
  **STRICTLY ADDITIVE BY CONSTRUCTION** — unreachable unless `resolveFaithful`
  returned null, so it can only fill a blank.
  **THE QUEUED FIGURE BELOW WAS WRONG ON THREE COUNTS AND THE CALL SITE SAYS SO
  IN ITS OWN COMMENT:** it passed `cleanFiledName(f.name)` where `merge-4i`
  passes **`f.name`**, applied **no `secTypeAdmits` gate**, and counted **only
  confident entries** — the defect recorded at `merge-4i:501`, which cost that
  entry 36 against 29. **Do not carry 1,706 / 914 / 1,462,375 forward.** Fourth
  instance of that one rule in a single session.
  **ALL FOUR NEGATIVE CONTROLS WERE DECORATIVE AGAINST PINS I CHOSE FROM MEMORY,
  AND MEASURING THEM WHOLE-STORE REWROTE TWO CONDITIONS.** The **FLOOR** shipped
  at three letters a side and the control priced it at **196 correct repairs
  refused** — a broken font splits a word anywhere, so the short seam is the
  common case (`Grow th`, `T arget`, `Schw ab`, `FIDELIT Y`, `Admira l`,
  `Investo r`, `V anguard`), **0 of the 196 changed an answer** — now one letter,
  worth 324 rows. The **WITNESS** then **FIRED IN THE WRONG DIRECTION**, refusing
  135 correct repairs of short words (`M id`, `C ap`, `Stoc k`, `DF A`, `GNM A`),
  **and it was reading only HALF the registry** — the class-name column was never
  in it, so `Class`, `Inst` and `Admiral` were missing from a set whose whole
  claim is to be the registry's own spelling. ***A guard can fire in the WRONG
  DIRECTION, and only the whole-store control shows which; half a registry is not
  the registry.*** The **ORDERING** is load-bearing: asking the join first moves
  **66 rows / 66 plans** onto a competitor's fund (`Empower S&P Small Cap 600
  Index Inst` from Empower's MXERX to Principal's PSSIX). **ONLY AN EXACT
  ANSWER** holds back 2,599 comparable rows.
  **WITNESS COST NAMED, 7 rows / 7 plans**, all filer abbreviations the registry
  cannot witness (`M KT`, `Ins T`, `T ot`, `AD M`, `M M`, `A Dm`, `A F`), pinned
  as a cost.
  All **1,132 distinct names read across 122 families**, not one a wrong house,
  and a whole-population screen agrees — **0 of 1,132 share no content word with
  the registered name**. **The OCR-split half CLOSES the 2026-09-30 06:3xZ
  residue item**, which was re-queued because *"no syntactic rule separates
  `… Index Ad min` from `… R6 ial`"*: the registry witness is that rule.
  **AND THE SECOND RESOLVER CORROBORATES IT** — 35 rows already resolve through
  `fund-er.js`, which reaches `Adm iral` and `JPM organ` on its own, and in all
  30 distinct cases it offers the SAME symbol.
  16 pins, one per condition **taken from the store by the control that named
  it**; each control fails by name on exactly its own case (1 of 132 each).
  `--selftest` 132/132, parser-gate, smoke, fund-er-test (62/26/19/18/18) green.
  **PRE-REGISTERED:** merge log `sec tickers: 461738 rows across 48555 plans`
  (+1,964 / +1,012 against 459,774 / 47,543); `filed tickers` **2,166 / 75**
  unchanged; CONFIDENCE DIFF **+0 / −0**, `rows-dropped` **0**; confident
  **60,170**, lineups 59,822, entries 65,479, HIGH **4**, overshoot 372, dl 19,
  pv 100 unchanged; `tkExact` rises and `tkShare` movement is phase. No fee and
  no asterisk can move. **REPORT path only as a GUARANTEE.**
  `docs/accuracy-log.md` 2026-10-01 (07:4xZ).
- **PREVIOUSLY QUEUED 2026-10-01 05:5xZ (superseded by the bullet above; its
  figures are the wrong-argument count and the shipped ones are 1,927 / 997 /
  1,569,418) — THE FILING SPLIT A WORD THE
  REGISTRY JOINS: 1,706 rows / 914 plans / 1,462,375 participants /
  $4,228,023,207 would newly name a fund EXACTLY.** Found by the 05:4xZ draw on
  **Penn Engineering & Manufacturing (1,262 ppl, 26 rows @ 0.990)**, whose
  immaculate menu's largest family — ten `JPMorgan Smart Retirement <year> Fund`
  rows, **55.9% of the menu** — publishes no ticker and no fee, because the SEC
  registers the series as `JPMorgan SmartRetirement 2035 Fund`, **one word**.
  **Novant Health (51,913 ppl, 41 rows @ 0.980)** reads clean.
  **IT IS THE EXACT MIRROR OF v529's ALL-CAPS ARM AND THAT ARM'S RECORDED LOSS IS
  IN THIS POPULATION.** v529 added a registry witness to REFUSE splitting
  `SMALLCAP`; this arm uses the SAME witness to JOIN `Small Cap World` →
  `SmallCap World` → **RLLGX**. One witness, both directions. Outcome test inline:
  the original must resolve to nothing and the join EXACTLY (never comparable).
  Families: American Funds SmallCap World (RLLGX/RSLEX/RSLFX), Principal
  SmallCap/LargeCap (PCSMX, PSMVX, PLGIX), JPMorgan SmartRetirement (SRJYX, JSMYX,
  JSAYX, JTSYX, JFFYX, JAKYX, JNSYX, SMTYX), Columbia SmallCap, Hartford MidCap,
  PIMCO CommoditiesPlus.
  **ONE DEAD DISCRIMINATOR, recorded so it is not retried: "both halves are
  registered words on their own" is NOT a usable guard.** It splits the class
  1,526 / 180 and its *risky* half is dominated by CORRECT repairs — `Small` and
  `Cap`, `Smart` and `Retirement` are each registered words somewhere, yet joining
  them is right every time.
  **AND THE 180-ROW SAFE HALF CLOSES AN ITEM THAT WAS STUCK FOR A STATED REASON.**
  The 2026-09-30 06:3xZ OCR entry was re-queued because *"no syntactic rule
  separates `… Index Ad min` (a split `Admiral`, must keep) from `… R6 ial` (must
  strip)"*. **The registry witness is that rule, in the join direction:**
  `Vanguard 500 Index Adm iral` → VFIAX, `JPM organ Large Cap Growth R6` → JLGMX,
  `Van Guard Small Cap Index Adm` → VSMAX, `Mass Mutual` → MassMutual, `All
  Spring` → AllSpring, `PIMCO Commodity RealReturn` → PCRIX — and it names the K6
  class this record has flagged four times, **`Fidelity Contra Fund K6` → FLCNX**.
  MERGE-SIDE (it needs the 29,406-row index), so it stores `stk` and needs a run.
  Remaining: read the 865 distinct transformations, and the whole-store diff
  through all four resolvers.
- **PREVIOUSLY QUEUED (superseded by the bullet above; its 239 / 176 / 2,109,185
  figures are the spelled-out-only count and the shipped ones are 295 / 224 /
  2,270,590): a filing stating
  INSTITUTIONAL PLUS gets a cheaper class — 239 rows / 176 plans / 2,109,185 ppl /
  $26,156,539,626, and 0 rows get it right.** The arm does not exist rather than
  misfiring: `VINIX` on `… Institutional Plus Shares` 61 rows, `VBTLX` 29, `VSMAX`
  25, `VIMAX` 14, `VTSAX` 11, `VTIAX` 9, `VEXAX` 10; 130 further rows assert
  nothing, which is honest. **Every one carries `stk=-`**, so the SEC index
  resolves none and the wrong answer is `fund-er.js`'s alone — the 2026-09-29
  "Premier is not Institutional" shape, a class folded into its neighbour's hint.
  Found by the 02:1xZ draw on **Harvard (39,385 ppl)**; **Walmart (1,970,230 ppl,
  42 rows @ 0.950) reads CLEAN end to end** in the same draw, which is what says
  v130's wrapped-name fix still holds. `docs/accuracy-log.md` 2026-10-01 (02:2xZ).
- **THE PRE-EMPTION FOOTPRINT IS NOW EXACT, 2026-10-01 02:0xZ: 36,790 rows /
  7,509 entries / 7,510 plans / 11,443,967 participants / $115,117,759,657, across
  5,667 distinct transformations.** The upper bound overstated it by **249 rows /
  150,610 ppl / $2.9B** (0.7% / 1.3%), in the predicted direction, and the new
  breakdown shows the mechanism: **1,689 rows DIFFER but publish no fee today**,
  the population the three missing suppressors blank. **Do not carry 37,039 or
  11,594,577 forward.** Exact rather than sampled because `issuerPricedER` returns
  null without an issuer, so a row with no issuer cell cannot qualify — 539,038
  carry one. *A pre-filter derived from the predicate's own first condition costs
  no accuracy.* **Still not shippable**, but on the 01:3xZ read's blockers (the
  families whose answer is BLANK, and reading the 5,667), not on the size.
  `docs/accuracy-log.md` 2026-10-01 (02:0xZ).
- **SHIPPED 2026-10-01 01:5xZ, `[skip ci]` — AN FDIC-INSURED BANK DEPOSIT HAS NO
  EXPENSE RATIO: 105 rows / 101 plans / 130,291 participants / $88,585,280.**
  Schwab Bank Savings, Charles Schwab Trust Bank, TD Bank USA N.A., Banc of
  California, the Merrill Lynch and Raymond James Bank Deposit Programs, `Wells
  Fargo Bank, N.A.-Bank Deposit Sweep`. **A deposit pays interest and charges no
  fund expenses, so the number does not describe a cost imprecisely — it describes
  one that does not exist.** Withdrawn: 0.2 on 91 rows, 0.26 on 11, 0.45 on 2,
  0.35 on 1. All 78 distinct names read. FEE ONLY.
  **Surfaced by the read of the fee pre-emption**, where `{Schwab Savings} Money
  Market Deposit Account` publishes 0.2 against an issuer-specific 0.26 and
  **BOTH are wrong** — *a row whose correct answer is BLANK cannot be fixed by
  choosing between two numbers.*
  **THE GATE IS THE ROW'S OWN TICKER, not `namesAFund`**, whose `fundER` arm
  answers 0.2 for any money-market remainder and so is true of this class by
  construction. Of 110 candidates exactly **three** resolve to a registered fund,
  each a real fund WELDED onto the caption (VMFXX ×2, VFIAX ×1), and all three
  keep their fee.
  **MY FIRST DRAFT ASKED THE WRONG STRING AND COST ONE OF THE THREE:** it called
  `fundTickerInfo` on the NAME where `lookupTicker` prepends the ISSUER, so the
  Vanguard row whose fund lives only in the identity column published **a symbol
  with no price beside it.** Fixed by asking no second resolver — the predicate is
  the NAME and the call site ANDs `!tk`.
  **THE VOCABULARY IS TWO ARMS AND WAS FOUR**, the per-arm control catching that
  `deposit acct` is subsumed by `acc(?:oun)?ts?` and `demand deposit` reaches 0
  rows: dropping either changed no verdict, so both went.
  **COST NAMED, 1 row:** `{Gabelli Funds} … Gabelli U.S. Treasury Money Market
  Fund Class AAA` names a fund in words, resolves to no ticker, and loses the
  GENERIC 0.2 rather than Gabelli's own figure — refusing a fee is the safe
  direction. 20 pins (14 must-detect / 6 must-be-false), a negative control per
  arm failing by name on exactly 3 and exactly 9. parser-gate, smoke, fund-er-test
  46/26/19/18/18 green. **REPORT path only as a GUARANTEE.**
  `docs/accuracy-log.md` 2026-10-01 (01:5xZ).
- **AND IT FOUND A DEFECT IN MY OWN INSTRUMENT THAT CORRECTS A PUBLISHED NUMBER.**
  The scratchpad harness rendering app.js's display path carried an **incomplete
  transcription of the `er` expression** — missing `contractRow`,
  `mistypedGuaranteeFee` and `namelessRow` — so every "publishes a fee today"
  figure taken through it OVERCOUNTED. Caught only because a verification pass
  reported the deposit rows still publishing after the suppressor shipped.
  **This item's own sizing said 110 / 106 / 138,550 and the shipped figure is
  105 / 101 / 130,291**; and **the 00:3xZ pre-emption footprint of 37,039 rows /
  11,594,577 ppl came through the same harness and is an UPPER BOUND — re-measure
  it before that item ships, do not carry it as exact.** The harness now imports
  all four suppressors from `lib-disclose` rather than restating them, and returns
  `erBefore` so a withdrawal is measured rather than inferred. *A transcription of
  a shipped expression rots as the expression grows.*
- **AND THE `nt` FIGURE WAS RE-ASKED THROUGH THE CORRECTED HARNESS AND HOLDS TO
  THE DIGIT: 970 rows / 501 entries / 506 plans / 1,291,747 ppl / $3,688,721,567,
  0 withdrawn.** The three missing suppressors reach no row in that population.
  **The measurement ran BACKWARDS** — the fix is shipped, so the current file is
  "after" and a patched copy restores the defect as "before", with the same probe
  as a positive control in the opposite direction. **So of the three figures the
  harness defect touched, two are settled and one is not:** `nt` is exact, the
  bank-deposit figure was corrected 110 → 105 before publication, and **the
  pre-emption footprint stays an UPPER BOUND.** `docs/accuracy-log.md` 2026-10-01
  (01:5xZ).
- **SHIPPED 2026-10-01 01:4xZ, `[skip ci]` — `nt ` HAD NO LEADING WORD BOUNDARY,
  SO NORTHERN TRUST PRICED ANOTHER HOUSE'S FUND: 970 rows / 506 plans /
  1,291,747 participants / $3,688,721,567.** `fund-er.js:222` was
  `/(northern trust|nt |ntgi).*index/i` — a space closes `nt ` and **nothing
  opens it** — so it matched the last two letters of any ordinary word and
  published Northern Trust's 0.05 collective-index estimate. Triggers are filing
  abbreviations: **`INT `** for International/Intermediate (`VANGUARD TOTAL INT
  STOCK INDEX` 33 rows, `NUVEEN INT EQ INDEX R6` 25, `SCHWAB FUNDMTL INT SMMID
  INDEX` 8), **`Government `**, **`Management `** (Fidelity Management Trust
  Company's whole index range), **`Retirement `** (`MyWayRetirement Index 2060`,
  Voya `flexPATH Index+`), **`Quant `**, **`Installment `**.
  **All 730 distinct transformations read and 0 rows lose a fee** — each resolves
  to a correctly attributed house or to the honest generic. The number often goes
  UP, which is the point: *an estimate derived from the wrong manager is replaced
  by one that names no manager.*
  **THE SAFETY CHECK IS THE WHOLE POPULATION: exactly ONE changed name mentions
  "northern" and it is `MFC NORTHERN LTS FD TR …` — Northern *Lights* Fund Trust,
  matched through `INT `.** No genuine NT attribution is lost.
  **SAME MECHANISM AS THE 2026-09-29 `gic` FIX** (boundary on the END, none at the
  START, matching "strateGIC" across 5,604 rows), so the whole table was audited:
  of 323 regex literals, **six short alternatives are reachable from inside a
  word**, and `nt` is the only one whose tail-matches are ordinary words — 67,603
  of the store's 415,861 distinct names against `ssga` 4, `dfa` 8, `acwi` 1,
  `msci` 3, `ntgi` 0.
  **AND OCCURRENCE IS NOT RESOLUTION — my claim about those twelve was unfounded
  until tested.** I wrote that all twelve are OCR welds the boundary RESCUES,
  having measured only that the names CONTAIN the token; bounding each and
  re-asking, **seven actually resolve through it** (all six `dfa` plus one
  `SALASSgA` row) and for those the claim holds — a boundary would withdraw a
  CORRECT fee. The other five never reach the pattern. *A count of occurrences is
  not a count of resolutions*, and a failing fixture of mine was the tell.
  **THE SIBLING'S STRICTER RULE WAS MEASURED AND REJECTED:** trusting a bare `nt`
  only beside "collective" (as `ntSp500Re` does) costs **52 rows / 37,289 ppl of
  GENUINE NT attribution** (`NT Agg Bond Index Fund NL T4`) and withdraws one
  entry's fee entirely ($424,363,958). That pattern asserts a TICKER; this one a
  labelled estimate.
  **Prevention: a THIRD fixture table, `ER_MUST_EQUAL`, pinning an exact VALUE** —
  the two existing tables test only PRESENCE and so could not see a wrong number,
  which is why this passed every green run. 18 cases, negative control fails by
  name on exactly the 11 and holds all 7. parser-gate, smoke, fund-er-test
  46/26/19/18/18 green. No twin (app.js's only "northern trust" is its kerning
  list). **REPORT path only as a GUARANTEE.** `docs/accuracy-log.md` 2026-10-01
  (01:4xZ).
- **WHAT IT EXPOSES AND WHY THE ORDER IS THIS WAY:** `Fidelity Management Trust
  Company Freedom Index 2035 IPR` now reads the generic 0.1 where the right figure
  is **0.12** — the number the pre-emption read below identified for that
  Institutional Premium class. This fix removes a wrong HOUSE; the call-order fix
  supplies the right NUMBER. A wrong attribution first, the better figure second.
- **THE 5,803 WERE READ 2026-10-01 01:3xZ, AND THE DECISION IS PER ISSUER — THERE
  ARE 126 OF THEM.** 5,803 is the count keyed on the RAW issuer; keyed on the
  FORM-STRIPPED firm (the string `issuerPricedER` uses) it is **5,674** over the
  same 37,039 rows — and **{Vanguard} 17,808 + {Fidelity} 15,249 = 89%**, each
  pricing its own funds. **356 rows (0.96%) sit outside the five plain houses**,
  where the trustee/platform risk had to live, and most of that is a genuine
  correction: `{Fidelity Investments} Government Money Market Fund` → **0.42 is
  SPAXX's real gross ER** (274 rows / 469,990 ppl), `{Fidelity Freedom} Index 2040
  Fund IPR` → 0.12, `{Blackrock Lifepath} Index 2050` → 0.09.
  **FOUR FAMILIES STILL NEED JUDGMENT and the fix above does not resolve them:**
  (1) **a bank MONEY-MARKET DEPOSIT ACCOUNT has no expense ratio at all** —
  `{Schwab Savings} Money Market Deposit Account`, 63 rows, where 0.2 and 0.26 are
  both wrong and the answer is BLANK; (2) a Northern Trust **COLLECTIVE TRUST**
  priced as a fund, 3 rows but **594,565 ppl**, the queued CIT item intersecting;
  (3) `{T. Rowe Price} Stable Value Fund CTF A` 0.35 → 0.30 where **both numbers
  are fabrications** (owner-gated); (4) `{Schwab Capital} Target 2030 Index Fund`
  → 0.04 against a published 0.08, 8 rows, unsettled.
  **So the pre-emption stays UNSHIPPED for a sharper reason than "read it first":
  its own population contained a live wrong number (now fixed above) and three
  families whose correct answer is BLANK rather than either value.**
- **MEASURED, OWNER-GATED, NOT SHIPPED 2026-10-01 01:3xZ — THE TWO TICKER SOURCES
  DISAGREE ABOUT A DIFFERENT *FUND*, NOT A DIFFERENT CLASS.** `lookupTicker` asks
  `fund-er.js` FIRST and the stored SEC `stk` LAST, so fund-er wins every
  disagreement. Over the **257,558 rows where both assert** they agree on 252,288
  and **disagree on 5,270**, and the split never asked before is the finding:
  **3,491 rows / 2,753 plans / 5,826,968 ppl / $36,740,275,720 publish a ticker
  belonging to a DIFFERENT REGISTERED SERIES**, against 1,779 / 838 plans /
  1,852,958 ppl that are the same series under another class; **0 unregistered.**
  **#526's cross-check UNDERSTATED THIS** — it recorded "the SEC being right about
  a share class", a claim about the CLASS field, where the registry's SERIES names
  say otherwise: `Fidelity Total Bond K6` publishes **FTBFX** (*:: Fidelity Total
  Bond **Fund***) where the filing resolves to **FTKFX** (*:: Fidelity Total Bond
  **K6** Fund*), a separate registered series. The whole K6 family is this shape
  (Total Bond 679 rows, Contrafund 522, Blue Chip Growth 383, Balanced 137, Growth
  Company 106, Diversified Intl 95, Low-Priced Stock 68, Puritan 21), and so is
  **`Vanguard PRIMECAP Core Fund` → VPMAX**, a different REGISTRANT (Chester vs
  Fenway), 19 rows.
  **AND THE FEE FOLLOWS THE WRONG SYMBOL:** that row publishes 0.45, FTBFX's
  figure. In the sameSeries half `Vanguard 500 Index Inv` publishes VFIAX at 0.02
  where the filing states Investor (VFINX) — **the table's figure for the class WE
  assigned, not the one the filing states.** The Investor-class figures are
  deliberately NOT quoted: vanguard.com is unreachable from the sandbox and *a fee
  is SOURCED, never derived*; what is measured is the MISMATCH, not its size.
  **Found by the 01:0xZ draw** (seed 20261001010, pool 59,822 / 89,744,230) on
  **Bayada Home Health Care (43,227 ppl, 19 rows @ 0.990)**, whose `PIMCO Total
  Return II Fund Institutional Class` publishes **PTTRX** (*Total Return Fund*, no
  II) while its `stk` is **PMBIX**, the registered Institutional class of Total
  Return Fund II. Butler America Aerospace (803 ppl, 29 rows @ 1.000) is
  immaculate. *A draw that reads clean on names can still be wrong on numbers.*
  **RECOMMENDATION, owner's call: prefer `stk` where the two name different
  SERIES and withdraw the fee on those rows rather than carry the old fund's;
  leave the class half to `fund-facts` per-class figures.** A session must not move
  5.8M participants' ticker cells unasked. `docs/accuracy-log.md` 2026-10-01.
- **QUEUED 2026-10-01 00:1xZ, THE LARGEST HONESTY DEFECT CURRENTLY OPEN — THE
  GENERIC FEE ESTIMATE PRE-EMPTS THE HOUSE-SPECIFIC ONE, AND THE SITE PUBLISHES
  UP TO FOUR EXPENSE RATIOS FOR ONE TICKER: 196 of 1,174 tickers carry more than
  one ER.** `fundERRow` is `fundERFiled(f.name)` and only then
  `issuerPricedER(…)`; the issuer arm was made **strictly additive on purpose**
  (2026-09-29) so it runs only where the bare name returns null — and a bare
  `Mid Cap Index Fund` does NOT return null, it returns `fund-er.js`'s GENERIC
  estimate (0.1% unattributed index fund, 0.2% unattributed money market). ***A
  guard built to add nothing can also prevent a correction.***
  **The correct value always sits on the name that STATES THE HOUSE:** FXAIX
  17,083 rows at 0.015 against **2,818 at 0.03** (`Fidelity 500 Index Fund` vs
  bare `500 Index Fund`); FSMDX 10,951 at 0.025 against **1,811 at 0.1**; FSSNX
  9,742 against **1,737 at 0.1**; VSMAX 12,264 at 0.05 against **2,300 at 0.1**;
  VIMAX 11,716 against **2,209**; VMFXX 4,971 at 0.11 against **884 at 0.2**.
  **FOOTPRINT, measured through the shipped functions with the positive control
  firing first** (`issuerPricedER("500 Index Fund", {Fidelity})` = **0.015**
  against a bare `0.03`): **37,039 rows / 7,610 entries / 7,611 plans /
  11,594,577 participants / $118,036,414,865**, across **5,803 distinct
  transformations**. A further 73,445 rows have the two answers AGREE (harmless)
  and 689,826 have no issuer answer at all (the generic estimate is the only one
  and stays).
  **DO NOT QUOTE 290,119 ROWS / 72,169,343 PPL AS THE CLASS SIZE** — that is
  every row carrying a conflicted ticker and it mixes the 17,083 CORRECT FXAIX
  rows with the 2,818 wrong ones.
  **AND "EVERY CONFLICT ERRS HIGH" WAS WRONG — corrected 00:3xZ.** True of the
  conflicted-ticker table, false of the pre-empt population: `{Fidelity}
  Government Money Market Fund` → SPAXX publishes **0.2 where the specific entry
  says 0.42** (553 rows) and `{Vanguard} Real Estate Index Admiral` → VGSLX
  publishes **0.1 against 0.13** (188), so at least **741 rows UNDERSTATE** and
  the fix moves numbers both ways. *A direction claim read off one population is
  not a direction claim about its neighbour* — and moving both ways is the
  stronger evidence, since a change that only ever moved fees down could be a
  bias in the specific table.
  **The headline "a row whose TICKER is known" also overstates the
  precondition:** `{Vanguard} Growth Index Fund` carries **no ticker** on 190
  rows and still publishes the generic 0.1 against a specific 0.05. The defect is
  the fee lookup's call order, with or without a symbol beside it.
  **NOT SHIPPED: 11.6M participants is larger than any fee change on this record,
  all 5,803 transformations should be read first** (`issuerPricedER` can itself
  be wrong where the issuer names a trustee or a platform — its own measured
  risk), and *a fee is SOURCED, never derived*. **The next cycle's work is
  reading the 5,803, not re-measuring them.**
  **FOUND BY READING TWO MENUS SIDE BY SIDE and by no count:** the 23:1xZ draw's
  Supreme Service & Specialty (733 ppl) writes `Vanguard Target Retirement 2030
  Fund` → **VTHRX 0.08**, Hightower Holding (1,736) writes `Vanguard Target
  Retrmnt 2030` → **VTHRX and a blank fee**. Same fund, same class, one price.
- **ADJACENT, LARGER, GATED ON THE ABOVE — A ROW WHOSE TICKER IS KNOWN STILL
  CANNOT BE PRICED: 39,651 rows / 12,591 plans / 16,047,315 participants /
  $99,785,853,495 would gain a fee** from the site's own published (ticker → ER)
  pair. No new source, and the class claim was already made by the ticker — but
  the fee inherits the ticker's correctness, 56 readings is thin for 16M people,
  and **propagating a pair that is not well defined spreads the contradiction
  instead of filling a blank.** That ordering is the finding.
- **AND THE 23:1xZ DRAW CONFIRMED #526 ON THE SURFACE: all 16 new tickers across
  both menus are correct**, read against their registered classes — `American
  Century Small Cap Val R6` → **ASVDX, the R6 Class** against eight siblings, and
  ten Vanguard Target Retirement vintages each exact only because its series has
  one registered class. **`site-test` #120 `conclusion: success` on `1cf1107b`,
  the exact mirrored commit — the first CI green covering the 45,894 new ticker
  cells**, the local smoke run having tested the OLD store.
  `docs/accuracy-log.md` 2026-10-01 (00:1xZ).
- **NOTHING IS IN FLIGHT. #526 RAN `success` AND IS MIRRORED — 2026-09-30 23:1xZ
  (`09a16988 → 8f9e0f35`), UNFORCED ON BOTH CHECKS, data gate +0 / −0 by ack AND
  by plan. EVERY PRE-REGISTERED FIGURE PASSED TO THE ROW.** `tkExact` **36.18**,
  `tkComparable` **3.27**, `tkShare` **24.47**, and every other figure
  byte-identical to #523's line — confident 60,170, lineups 59,822, entries
  65,479, HIGH 4, warn 608, overshoot 372, overshootTrust 12, aggRow 113, dl 19,
  pv 196 at 100%. The run-only figure was read out of the ARTIFACT rather than
  the log (the merge log's blob host is `connect_rejected`): diffing the 64
  lineup shards at `56637757` against the data commit gives **459,695 rows
  across 47,534 entries** — exactly as registered — and the gain **109,662 rows
  / 11,282 entries / 11,346 plans / 13,751,840 ppl / $261,166,139,187, LOST 0,
  CHANGED 0**, identical to the local merge to the digit. *The production merge
  reproduced the local one exactly.*
  **AND THE REPORT-PATH GUARANTEE WAS CONFIRMED IN PRODUCTION, not only by
  reading the import list: `git diff --stat 56637757 8f9e0f35 -- p/` is EMPTY**,
  0 of 5,062 crawlable pages changed while 13.7M participants' rows gained a
  ticker. #525 (the push trigger) was cancelled by concurrency on the same
  commit, so nothing was lost either way.
  **WHAT IT CARRIED: A BLANK TYPE CELL IS NOT A CONTRADICTION, AND
  TWO RESOLVERS WERE APPLYING OPPOSITE STANDARDS TO IT: 45,894 rows / 9,151
  entries / 9,182 plans / 9,610,149 participants / $85,992,537,937 gain a fund
  ticker they do not have**, across 13,668 distinct names; the STORED footprint
  is **109,662 rows / 11,346 plans / 13,751,840 ppl / $261,166,139,187, LOST 0,
  CHANGED 0**, the gap being 63,748 rows `fund-er.js` already answers and 20 in
  non-confident entries (reconciled exactly, not called close).
  **Found by the 22:0xZ draw restricted to acks NEW to the store after the DOL
  refresh** (7,872 newly published menus / 12,409,763 ppl, seed 20260930220 —
  12,095 acks no cycle had ever reviewed), on **Innoviva Specialty Therapeutics
  (316 ppl, 30 rows @ 0.996)**, whose menu is immaculate, whose **28 of 30 type
  cells are blank, and not one row carries a ticker — while 23 of the 30 resolve
  EXACTLY.**
  **THE INCONSISTENCY IS BETWEEN TWO RESOLVERS, NOT INSIDE ONE.**
  `fundTickerInfo(name, type)` reads the type to **DEMOTE** a collective trust or
  a separate account to a labelled comparable — never to REQUIRE corroboration —
  so `fund-er.js` has always asserted from the name alone on a blank cell, and
  does so on **63,748 of these very rows today**. The SEC index alone demanded
  the filing's own word.
  **THE WIDENING CANNOT ASSERT A SHARE CLASS THE FILING DID NOT STATE, AND THAT
  IS STRUCTURAL:** `resolve` returns EXACT only where the class is stated or the
  series has ONE registered class — `Fidelity Contrafund` → **comparable**
  FCNTX, `Vanguard 500 Index Fund` → comparable VFINX, `Dodge & Cox Stock Fund`
  → comparable DODGX, and a comparable is never stored. **AND THE VEHICLE SCREEN
  IT LOOKS LIKE IT NEEDS IS THE INDEX'S OWN DOING** — written, measured at **0
  rows**, NOT shipped: the SEC registers no collective trust, so `… Target
  Retirement 2030 Trust II` is null and `… Trust Select` is a comparable. *A
  guard that cannot fire is decoration, and naming why it cannot is worth more
  than carrying it.*
  All **40 distinct names drawn at random read against their own registered
  SERIES, 40 of 40 correct**; the one that read as a mis-resolution is not
  (`2025 Target Date Retirement CL R6` → RFDTX, registered as *American Funds
  2025 Target Date Retirement **Income** Fund* — the registrant's own name for
  the past-dated vintage).
  **TWO-SOURCE CROSS-CHECK on the admitted population: 61,965 of 63,158 agree
  (98.11%), 1,193 disagree, and every disagreement read is the SEC being right
  about a share class** (`Fidelity Total Bond K6` → FTBFX where it is FTKFX;
  `Wellington Fund Investor Shares` → VWENX, the ADMIRAL class). Nothing changes
  for them — `fund-er.js` is read FIRST — so this sizes the queued override item
  and withdraws nothing.
  **AND THE COVERAGE METRIC COULD NOT SEE THE FIELD IT MEASURES.**
  `audit-data`'s `tkExact` re-implements `lookupTicker` and **stopped one stage
  short of `f.stk`**, reading **0 of the 147,835 rows that field already
  carried**. Fixed in the same commit, and the two effects are separated because
  they are different claims: on the SAME live store the instrumentation fix
  alone moves `tkExact` **24.67 → 33.58**, and the widening then **33.58 →
  36.18**. `tkShare` deliberately untouched at 24.47.
  **PRE-REGISTERED:** merge log `sec tickers: 459695 rows across 47534 plans
  (109662 on a blank type cell)`; CONFIDENCE DIFF **+0 / −0**; `tkExact`
  **36.18**, `tkComparable` **3.27**, `tkShare` **24.47**; everything else
  byte-identical to #523's line — confident **60,170**, lineups **59,822**,
  entries **65,479**, HIGH **4**, warn **608**, overshoot **372**,
  overshootTrust **12**, aggRow **113**, dl **19**, pvTopShare **100**.
  No fee is possible (`fundER` is called on the NAME, never on a ticker);
  **REPORT path only as a GUARANTEE — `build-seo-pages.mjs` reads no `stk` and
  imports no `fund-er.js`**. `secTypeAdmits` sliced BY NAME in
  `scripts/merge-name-test.mjs`, 20 pins 20/20, **a negative control per arm
  failing by name on exactly its own cases** (drop the blank arm → the widening
  is inert; drop the mutual-fund arm → the 147,835 already shipping are
  withdrawn). smoke green, fund-er-test 46/26/19/18 green.
  `docs/accuracy-log.md` 2026-09-30 (22:4xZ).
- **PREVIOUSLY: #523 RAN `success` AND IS MIRRORED — 2026-09-30 19:0xZ
  (`556b7eda → 52a9171f`), git check UNFORCED, `--force-data` over an ACK-KEYED
  count that a plan-keyed re-ask cut by a factor of 28. THE PRE-REGISTRATION
  FAILED AS STATED AND THE CAUSE WAS NOT THE CHANGE: DOL PUBLISHED A FRESH
  BATCH BETWEEN THE DISPATCH AND THE PREP.** A September ack month that did not
  exist in the before-store at all (**10,222 filings**), plan year 2025
  **33,008 → 44,548** while 2024 fell 70,493 → 59,977 as *newest filing per
  EIN|PN wins* swapped thousands of plans onto a new return. Universe
  **111,782 → 112,652**, `dl` **142 → 19** (the dead 403s resolved because a
  newer filing replaced the withdrawn one), `pvTopShare` **99.8 → 100**, HIGH
  **5 → 4**, confident 60,103 → **60,170**, overshoot 316 → **372**.
  **ATTRIBUTION, PER ACK, AND IT IS TOTAL.** Over the **100,557 plans present in
  both stores at the SAME ack, `cctVals` — my change's only published output —
  changed on 0**. Confident acks gained 7,897, **7,897 of them new to the
  store**; lost 7,830, **7,830 gone from it**. `overshoot` reproduces to the
  unit from `audit-data`'s own rule and of its **83 entrants, 83 are new acks
  and 0 pre-existing**. Not one pre-existing ack moved in any direction.
  ***PRE-REGISTER THE CHANGE'S FOOTPRINT, NOT THE STORE'S TOTALS, WHEN THE RUN
  RE-INGESTS ITS OWN INPUTS.*** "No published number may move" silently asserts
  that DOL published nothing — a claim about a third party's release schedule,
  not about the code. The testable claim was *my change moves nothing* and it
  held at 100.00%; the untestable one is what failed.
  **AND `mirror-gate.mjs` IS ACK-KEYED, SO A REFRESH MAKES IT UNREADABLE.** It
  refused with **7,830 lost lineups**; ack-keyed it cannot tell a withdrawal
  from a SUPERSESSION. Re-asked plan-keyed: **275 plans lost a menu / 188,394
  ppl, 197 gained one / 227,803**, net **+39,409 readers served**.
- **A SUPERSEDED ACK'S PARSE IS PRUNED AND THE PLAN CAN LOSE ITS MENU: 104
  plans / 30,897 participants — CORRECTED 19:3xZ FROM THE 168 / 149,811 I
  PUBLISHED AN HOUR EARLIER, AND THE ERROR IS THE ONE THIS RECORD NAMES MOST
  OFTEN.** I read SIX cases, saw assets grow in all six, and generalised to 168.
  **Measured whole-population: 163 of the 168 report $0 year-end assets on the
  new filing** — wind-downs, where the plan terminated and a final-year return
  correctly has no menu, and where *`assetsEOY` = 0 means the ratio guard can
  never accept a region* **by construction**. Across all 275 plan-keyed losses:
  **171 / 149,049 wind-downs against 104 / 30,897 real.** Overstated **4.8x on
  people**. ***RANK TO PICK WHAT TO READ; DRAW RANDOMLY TO ESTIMATE A RATE*** —
  broken one cycle after `boy-count-contradicted` flagged 219 correct wind-downs
  for the identical reason, and **one column (`assetsEOY`) splits the population
  in a single pass.** **Do not carry 168 or 149,811 forward.**
  **AND THE MECHANISM CLAIM WAS WRONG TOO — THE FALLBACK IS NOT MUTE.** I
  inferred "fired on 0 of 168" from `fb` being absent; **27 carry `ffb`**, set
  only inside the fallback candidate loop, so a prior-year PDF was downloaded
  and read and its NOTES were used. It declined the LINEUP, and `fetch-4i:872`
  says why in its own comment — *"Ratio is judged against the CURRENT year's
  assets"* — so **167 of 168 fall outside `0.45 < ratio < 1.6`** once the prior
  sum meets the new assets. The guard is working. *An absent field says the
  lineup was not taken, never that nothing was tried.*
  **WHAT SURVIVES IS REAL AND TRACTABLE: Levi Strauss & Co. (8,288 ppl) went
  $1,027.6M → $1,176.5M and lost its published menu**, with its sister plan
  (902) and Standard Retirement Services (2,480, $29.7M → $43.1M).
  **AND `fb-vanished` CANNOT SEE ANY OF THEM:** `fetch-4i:923` reads
  `buckets[shardOf(plan.ack)][plan.ack]` and fires only on
  `prevEntry.confident && prevEntry.fb`, so a plan whose ack just changed has
  **no stored entry under the new ack at all** — the same ack-keyed blindness as
  `mirror-gate`, in the check written for this exact failure. **THE SHIPPABLE
  PIECE: key the look-back on EIN|PN, not on the ack.**
- **WHAT #523 WAS FOR LANDED EXACTLY.** The name column resolved — `NOT FOUND`
  would have shown as zero — and **379 of 508 master trusts now carry a named
  Schedule D list, 4,334 rows, $936,597,264,187**. Reach: **93 full-form plans /
  1,124,285 participants** linked to a trust where neither side publishes a menu
  (Albertsons 236,172, Northrop Grumman 151,108, Mars 66,642, Medtronic 55,692),
  of which **65 plans / 888,650 sit behind a trust listing THREE OR MORE funds**.
  That split is load-bearing: **Northrop Grumman's trust lists ONE fund at
  $11.4B**, a trust holding a single collective trust, which is not a menu.
  **The owner's own filing is served** — PSEG PN 004 and PN 006, 12,781 ppl, 15
  named Vanguard collective trusts, the funds highlighted in what they sent.
  **Nothing is published**: `cct` is read only by build-data's own reporting
  line, verified by grep. Publishing it is a separate labelled claim.
  **TWO HARNESS CATCHES:** a guessed `sponsor` printed blank for ten plans and
  `loadPlans` named `sponsorName`; and an overshoot proxy keyed on a stored `rt`
  read **0 on both sides** — *a clean zero reports on the query* — so the
  shipped rule was read out of `audit-data` instead.
  `docs/accuracy-log.md` 2026-09-30 (18:5xZ).
- **WHAT #523 CARRIES — THE TRUST'S OWN SCHEDULE D WAS NEVER SCANNED, the
  second and larger half of the owner-sent PSEG finding.** `scanSchD`'s
  `wantedAcks` is built from `universe`, which holds PLANS only; an MTIA filing
  `continue`s out of the plan loop at `build-data.mjs:208`, so **a master
  trust's ack was never in the wanted set and every row of every trust's
  Schedule D was skipped** — including the one place a trust-held plan's fund
  menu is written down. For PSEG it is not that the names were read and
  dropped; **that filing's Schedule D was never looked at.** (The 18:0xZ entry's
  discard finding is real and is the plan-level half.)
  Two lines of ingest: MTIA acks join `wantedAcks`, and the entity-code-C
  branch keeps `{n, v}` beside the value set the CIT typing already uses.
  **NOTHING IS PUBLISHED.** A Schedule D menu is the TRUST's holdings, not a
  plan's 4i slice, so publishing it is a separate claim needing its own
  labelled wording — and the deciding numbers cannot be measured in-sandbox
  because the EFAST2 extracts come from the DOL site, which is unreachable
  from here. **So the run IS the measurement.**
  **The population it could serve, measured in-sandbox: 123 full-form plans /
  1,363,069 participants / $197.1B** linked to a trust where NEITHER side
  publishes a lineup (Albertsons 222,465, Northrop Grumman 151,821, Delta
  112,713, Medtronic 56,318), against **488 plans / 8,269,176 already served by
  a confident trust** — the precedent that makes this shape legitimate.
  **PRE-REGISTERED, first line first:** the prep log must print `SCH_D
  collective-trust NAMES: resolved at index N (NAME)`, and **`NOT FOUND` means
  the column name is wrong and THAT is the finding** (v195's `activeBOY`
  instrumentation, same reason); then `Schedule D collective-trust menus: N of
  M trusts carry one (R rows), reaching P member plans / Q participants`.
  **No published number may move** — no bump, so `confident` 60,103, lineups,
  HIGH 5, `warn`, `overshoot` 316, `dl` 142 must be byte-identical to #517's.
  **HARNESS NOTE:** my first count of the 123 printed `plan's own lineup
  confident: 0` and `trust confident: 0` — `lineups-status.json` nests under
  `.plans` and I read the top level. *A clean zero reports on the query*,
  caught before the number was written down.
  Prevention: **`scripts/schd-name-test.mjs`, IN THE REPO**, slicing the
  shipped `scanSchD` out of `build-data.mjs` (its module top level downloads
  DOL extracts, so it cannot be imported) and running a crafted Schedule D in
  the PSEG shape — **10/10**, with the negative control renaming the name
  column out of the header: capture goes to **0** *and the log says NOT FOUND*
  while the MTIA links still resolve. Read via `new URL(…, import.meta.url)`
  and run from two working directories.
  `docs/accuracy-log.md` 2026-09-30 (18:2xZ).
- **THE OTHER THREE PSEG DEFECTS, all read from the owner's filings and none
  shipped:** **(1)** we publish `Invesco Advisors, Inc` as the recordkeeper
  where the filing reads *"Fidelity Investments is the recordkeeper"* and our
  own `sdbaBrand` independently says Fidelity BrokerageLink — a named instance
  of the 1,509-plan / 1,482,658-ppl wrong-provider class. **(2)** vesting is
  stated under its own heading — *"All Participants are 100% vested in the Plan
  from the first date of hire"*, with line 6h = 0 corroborating — and we
  publish none; the sentence we STORED is the 24-month withdrawal suspension.
  **Discriminator isolated against the production extractor: the immediate arm
  needs the adverb ADJACENT to the verb** (`immediately 100% vested` parses,
  `100% vested from the first date of hire` does not, nor `fully vested … at
  all times`). **(3)** the match is `50% of each Participant's first 8%` (PN
  004) / `7%` (PN 006), stored and unparsed. **My hypothesis was the possessive
  and its own test refuted it** — removing `each Participant's` changes
  nothing. The discriminator is WORD ORDER: `matching contribution is 50% of
  the first 8%` parses, `an amount equal to 50% of the first 8% … as its
  matching contribution` does not. A named instance of the largest queued match
  family (1,011 plans / 1,464,750 ppl).
- **SHIPPED 2026-09-30 17:4xZ, `[skip ci]` — AN UNCLOSED PARENTHETICAL IS A
  TRUNCATION: 260 rows / 141 entries / 455,663 participants / $2,429,129,653.**
  Found by the 17:1xZ draw on **Hawai'i Pacific Health (10,929 ppl)**, whose
  42-row menu publishes `Charles Schwab Institutional – Personal Choice
  Retirement Account (comprising of common st` at $78,619,557. A filer does not
  open a bracket and never close it, so an unbalanced `(` is evidence about OUR
  read.
  **THE NAIVE RULE WAS CONVICTED BY ITS OWN OUTCOME TEST AND LOST TWELVE FEE
  ANSWERS — because an unclosed `(` is OFTEN AN OCR'D LETTER OR DIGIT, and then
  the real fund name sits AFTER it, not before.** `Vanguard Real (state Index
  Admiral` is Real ESTATE, `American Funds 206( Target Date R6` is 2060, `Fund
  Non-Lending (Tier III Northern Trust S&P 500 Index Fund Non-Lending` (5,674
  ppl) carries the whole fund inside the bracket. Two structural conditions and
  no vocabulary refuse all of them: **a SPACE before the bracket**, and **the
  surviving HEAD longer than the tail it drops**, with a three-word floor so a
  strip can never leave a fragment. Narrowed: 339 rows → 260, and **0 tickers
  gained / 0 lost / 0 flipped, 0 fees gained / 0 lost / 0 changed** through
  app.js's own `lookupTicker` and `fundERRow`, both positive-controlled first.
  **AND THE RAW-NAME PROXY READ 263 / 247 WHERE THE FUNCTION READS 260 / 244.**
  The arm runs on the PARTIALLY-CLEANED string, and `cleanFiledName` ends by
  returning the RAW name when the result holds no three consecutive letters —
  keeping one all-numeric OCR row (1,003 ppl) out of the count even though the
  predicate fires on it. *Measure through the function the page calls, with the
  argument the page passes* — met again, and this time the gap was small and in
  the safe direction, which is exactly when it is easiest to publish.
  All 244 distinct transformations read. **ACCEPTED COST:** five rows across
  four names carry a share class INSIDE the bracket, and Iona University's two
  TIAA rows lose the CONTRACT type the same way (`Traditional, Non-Benefit
  Responsive (Ra` — RA and SRA are different TIAA contracts). Each becomes less
  specific, none becomes wrong, and none loses a ticker or a fee.
  **THE RULE IS CONSERVATIVE RATHER THAN CLAIRVOYANT AND THE PINS SAY SO:** one
  TIAA Access row is repaired and its sibling REFUSED, separated only by whether
  the description happens to be longer than the name — both pinned, on opposite
  sides.
  **MY FIRST PIN SET LEFT TWO OF THE THREE CONDITIONS UNTESTABLE** — every
  must-keep I chose was refused by the three-word floor first, so dropping
  HEAD-LONGER changed 0 of 13 verdicts. *A control that cannot fail is
  decorative*, caught by running the per-condition control instead of assuming
  it discriminated. 16 pins (6 must-strip / 10 must-keep), **added because NOT
  ONE of the 74 existing filed-name cases carries an unbalanced bracket**; a
  negative control per condition, each variant written DIRECTLY rather than by
  surgery on the shipped source, fails by name on exactly its own cases, and
  drifting the app.js twin fails the smoke tether on exactly the 6.
  parser-gate, smoke, fund-er-test (46/26/19/18) green. **11 crawlable pages /
  102,983 ppl** (Sony 26,151, PayPal 15,948, Zions 14,506), every changed cell
  read. `docs/accuracy-log.md` 2026-09-30 (17:3xZ).
- **SHIPPED AND MIRRORED 2026-09-30 16:4xZ (`53c7d723 → 07980160`), UNFORCED ON
  BOTH CHECKS, data gate +0 / −0 — AN AUDIT FIRM'S OFFICE LIST IS NOT A HOLDING:
  7 rows / 7 plans / 28,677 participants / $229,607.** Found by the 16:1xZ draw
  on **Chewy (20,339 ppl, OCR'd)**, whose 23-row Vanguard menu ends in `Boca
  Raton, Florida 33431 Fort Myers, Florida 33907 Naples, Florida 34108 Orlando,
  Florida` at $32,801 — the auditor's letterhead off the bottom of a scanned page.
  **THE WHOLE POPULATION IS SEVEN ROWS AND ONE STRING**, the same Florida firm in
  seven unrelated filings (Fontainebleau Development 5,245, Turnberry ×2,
  Flightstar, Vertical Bridge), every one with a **blank issuer, a blank type, 0
  tickers and the IDENTICAL $32,801**. *An arm whose whole population is one name
  is read by reading it.*
  **TWO OR MORE `<City>, <State> <ZIP>` GROUPS — no vocabulary of places, and both
  conditions negative-controlled BY NAME.** Dropping the floor to ONE convicts
  `Boca Raton, Florida 33431` and **`Ernst & Young LLP, One Kennedy Square,
  Detroit, Michigan 48226`** — this record's own General Motors finding, where the
  single address really is what the filing says. Dropping the ZIP convicts
  `Colonial Trust of Richmond, Virginia and Baltimore, Maryland Common Fund`, **a
  case added BECAUSE the control could not fail without it** — no pinned name had
  two bare state names and no ZIP, so *a control that cannot fail is decorative*
  caught an untested condition before it shipped. 13 pins 13/13, each variant
  built DIRECTLY rather than by surgery on the shipped source.
  **TYPED, NOT DROPPED (v181), THOUGH THE VALUE IS NOT PLAN MONEY:** the identical
  $32,801 across seven unrelated plans is what says it is a reading artifact, and
  dropping it moves sums, ratios and confidence — **queued as a PARSER-side
  change.** REPORT path only, and here that is an OBSERVATION not a guarantee:
  `build-seo-pages` does import the predicate and `git diff --stat p/` is empty
  because all seven rows sit below the top-twelve cut. parser-gate, smoke,
  fund-er-test (46/26/19/18) green.
  **AND THE CLASS THE DRAW APPEARED TO FIND WAS NOT ONE.** The same menu publishes
  `CommornCollective Trusts` with issuer `{VANGUARD TARGET 2030}`, read as the two
  columns being the wrong way round and sized at **487 rows / 205 entries /
  784,499 ppl / $4.9B** — then REFUSED, because **the filing is right and so is
  the render**: Form 5500 column (b) is *"Identity of issue"* and (c) is
  *"Description of investment"*, so a fund in (b) with a vehicle type in (c) is
  the STANDARD layout, and both surfaces render `issuer · name`, so the reader
  sees the fund FIRST. **Do not carry 487 or 784,499 forward.** *Reading the
  render stopped it, and it took one grep.*
  `docs/accuracy-log.md` 2026-09-30 (16:3xZ).
- **THREE FURTHER ISSUER PREDICATES MEASURED AND REFUSED 2026-09-30 15:3xZ, ALL
  BY THE SAME MECHANISM — recorded so they are not retried.** The 15:1xZ draw hit
  **Parametrix (1,057 ppl)**, immaculate, and **WinCo Foods (29,596 ppl)**, whose
  issuer column contradicts three of its own rows (`Principal High Yield A` by
  **`{Prudential Investments}`**, `Virtus Duff & Phelps Glbl Real Est A` by
  **`{New Horizons Fund}`** — a T. Rowe Price *fund*, not a firm).
  **IT REACHES NO READER, MEASURED:** slicing the shipped `lookupTicker` out of
  app.js with its helpers and passing the whole row as the page does, **all three
  resolve to `null`, as do all 19 WinCo rows**, with `{Vanguard} 500 Index Fund →
  VFIAX` as the positive control. The harm is the issuer DISPLAY alone.
  **(1)** *issuer attested as a published fund NAME and sharing no token with this
  row's name* — **342,395 rows / 38,543,094 ppl**, and it convicts the store's
  MOST CORRECT rows (`{Vanguard}` on `Target Retirement 2050 Fund`), because
  `Vanguard` clears the floor as a holding NAME only thanks to the separate
  bare-house defect. ***The gate is fed by the store's own damage*** — the
  floor-of-one lesson at a floor of three.
  **(2)** *issuer ends in the singular `Fund`, because a firm's name does not* —
  **3,104 / 1,817,731**, and its DOMINANT member is CORRECT: `College Retirement
  Equities Fund` really is the registered issuer of `CREF Stock R1`, which my
  token test could not see because **CREF is that issuer's own acronym**.
  **(3)** the same with an acronym-and-containment escape — **2,322 / 1,727,347**,
  still essentially ONE filer template (the TIAA/CREF platform in column (b)).
  **Do not carry 342,395, 3,104 or 2,322 forward.** Column (b) is statutorily
  *"Identity of issue"*, so a fund name there can be faithful — which is exactly
  why no purely structural test separates it from the contradicting case.
  `docs/accuracy-log.md` 2026-09-30 (15:3xZ).
- **SIZED, MEASURED AND REFUSED 2026-09-30 15:2xZ — THE ISSUER'S CLASS-DEBRIS
  LEAD IS A ROTATION, AND THE OBVIOUS STRIP TRUNCATES THE FIRM. 333 rows / 134
  entries / 198,007 ppl / $1,169,273,658, and NOT SHIPPABLE.** The 14:2xZ draw's
  open class (`{Growth Fund; Class R6 Vanguard}`, `{Inst'l Shr Invesco}`). Built
  on the one structural fact left after two refutations — *a share class is never
  a firm*, true in the ISSUER column and false in the NAME column.
  **THE MECHANISM CLAIM WAS REFUTED BY ITS OWN TEST: the lead is the PREVIOUS
  row's tail on 3 of 333**, and the row's OWN name on 19 — and reading the 314
  that test refuses shows nearly all are correct repairs, so neither
  corroboration is a usable guard either.
  **THE REAL MECHANISM IS A ROTATION: the issuer's own name wraps and the halves
  are re-joined in the WRONG ORDER with the row's share class between them.**
  `Company Class K6 Fidelity Management Trust`, `LLC R1 Great Gray Trust
  Company,`, `Company Adm Minnesota Life Insurance`. So **the naive strip
  publishes a TRUNCATED FIRM on the largest members of the class it was written
  for** — `Fidelity Management Trust` for a firm attested **9,361** times as
  *Fidelity Management Trust Company*, `Great Gray Trust Company,` for *…, LLC*
  (1,021), `Minnesota Life Insurance` (1,342). **45 rows / 32,947 ppl measured,
  and 45 is a FLOOR SET BY MY OWN VOCABULARY** — `Company CIT Z Principal Global
  Investors Trust` (12) and `Company Trust II Vanguard Fiduciary Trust` (9) are
  the same rotation, sitting in the other bucket only because `CIT Z` and `Trust
  II` are not in the class run. *A split whose boundary is a vocabulary is only
  as good as that vocabulary.*
  **TWO GUARDS MEASURED AND REFUSED, BOTH THE SAME TRAP.** *"The lead must not
  stand alone as an issuer"* refuses **34 CORRECT repairs**, because `Admiral
  Vanguard → Vanguard` has a lead standing alone **once** and that once is itself
  damage — the floor-of-one trap. And the rotation test unguarded yields
  **`Vanguard Fund` (21), `Fidelity Advisors` (389), `American Funds Company`
  (54), `Fidelity Trust` (27)**, none a firm: **a floor of three is nowhere near
  enough when the damaged form is itself attested in the hundreds.**
  Two base false positives named: `MFS Institutional International Equity` →
  `International Equity`, and `Admiral American` → `American` (its row named
  `Funds New Perspective R6` — the filer's `American Funds` split across the two
  columns). **Do not carry 333 forward as a class size.** It needs the ROTATION
  arm built FIRST and preferred over the strip, with a remainder test that is not
  an attestation floor. `docs/accuracy-log.md` 2026-09-30 (15:2xZ).
- **SHIPPED AND MIRRORED 2026-09-30 15:0xZ (`7f553567 → 311e29c3`), UNFORCED ON
  BOTH CHECKS, data gate +0 / −0 — A SCHEDULE H PARTICIPANT-DIRECTION CAPTION IS
  NOT A HOLDING: 16 rows / 16 plans / 294,238 participants / $6,813,553,902.**
  **Microsoft's 183,509 participants** are shown `Participant-directed` at
  **$6,602,388,247 = 8.6%** of their menu with a BLANK type — the 13:5xZ draw's
  own unsized residue, now closed. Morgan Stanley Domestic Holdings (81,090) and
  Gunderson Dettmer (948) are the other two crawlable pages.
  **`Participant-directed` / `Non-participant-directed` is the STATUTORY SPLIT on
  Schedule H line 4i, not a fund** — the filer captioning their two halves, which
  `isNamelessFundRow` is blind to by construction because it asks whether the name
  is a bare VEHICLE type and this is a DIRECTION.
  **THE RAW COUNT IS 192 AND 174 OF THEM ARE CORRECT: the neighbour is the real
  brokerage aggregate** (`Participant-directed brokerage accounts`), a genuine
  holding a plan genuinely offers. Splitting on the tail word is what separates
  them, so the arm ships a POSITIVE vocabulary of what the caption may be
  FOLLOWED BY — `investments`, `accounts`, `assets` and nothing else — never a
  blocklist. *A count that mixes a correct row with a defective one is not a
  class size.*
  **AND THE ANCHOR AND THE TAIL ARE JOINT, which I credited to the tail alone
  until the control said otherwise:** both negative controls — dropping the tail
  vocabulary and unanchoring the rule — **fail by name on exactly the same 5**,
  the four brokerage rows plus `Participant Directed Retirement Fund`, a real
  fund whose name merely opens with the words. **My first control was a harness
  artefact** — string surgery on the shipped source broke the tail instead of
  widening it, convicting the must-FLAG side, which is a control failing in the
  direction that looks like success. Rebuilt each variant directly.
  **TWO MORE ROWS ARE REFUSED BY THE NO-ISSUER GATE AND THAT IS RIGHT:** where
  the identity column names a real fund, the caption is a wrapped tail and the
  row is not nameless. 16, not 18.
  **0 of the 16 publish a ticker and `fundER` prices 0**, so the harm is the
  CLAIM alone. TYPED, NOT DROPPED (v181) — the value is the participant-directed
  half of the plan, stays in the denominator, and no other row's percentage
  moves. `isDirectionCaptionRow` canonical in `lib-disclose`, twinned verbatim in
  app.js, wired into `build-seo-pages.mjs` so it reaches BOTH surfaces, tethered
  on 18 pinned cases (10 must-flag / 8 must-keep). parser-gate, smoke and
  fund-er-test (46/26/19/18) green; **3 crawlable pages / 265,547 ppl**, every
  changed cell read. **`site-test` #117 reads `conclusion: success` ON THE EXACT
  MIRRORED COMMIT** — dispatched deliberately because the change shipped under
  `[skip ci]` and local green is not CI green.
  `docs/accuracy-log.md` 2026-09-30 (15:0xZ).
- **NOTHING IS IN FLIGHT. #520 RAN `success` AND IS MIRRORED — 2026-09-30 14:2xZ
  (`b6e61585 → 7f553567`), the git check FORCED over main's one cron commit with
  the evidence first (plans array byte-identical, 0 acks / 0 newer status
  entries / 0 confident-only on main) and the DATA GATE UNFORCED at +0 / −0.
  ALL SEVEN PRE-REGISTERED TESTS PASSED, AND THE ONE THAT READ AS A MISS WAS THE
  VERDICT HARNESS.** Both run-only figures computed from the ARTIFACT — the
  merge log's blob host is `connect_rejected` — by diffing the 64 lineup shards
  at `924d75b0` against the data commit: **issuer changed on 7,702 rows across
  559 entries**, and **of those, 5,145 rows across 178 entries** were then
  reached by the section-caption strip, **both exact**. *The composition landed
  as designed.* Names changed on **0** rows (this arm touches the ISSUER column
  and nothing else); entries **60,103 → 60,103**, rows **1,720,271 → 1,720,271**,
  coverage line byte-identical.
  **`sec tickers` READ 347,204 / 37,063 AGAINST THE 347,386 / 37,107 REGISTERED
  — AN APPARENT 182 WITHDRAWN ANSWERS, IN THE WORST DIRECTION FOR A CHANGE WHOSE
  WHOLE CLAIM IS THAT IT WITHDRAWS NONE. It is not a withdrawal: diffing `stk`
  row by row across all 64 shards gives 0 lost, 0 gained, 0 changed.** My verdict
  script counted only **confident** entries (60,103) where the registering
  measurement counted every **stored** entry (65,240). Under either predicate the
  figure is UNCHANGED — 347,204 both sides confident-only, 347,386 both sides
  all-entries.
  ***A VERDICT HARNESS HAS TO ASK THE QUESTION WITH THE PREDICATE THE
  REGISTRATION USED.*** This is v190's stored-vs-published gap — which cost a
  class size a factor of 3.9 — biting a **VERDICT** instead, where it is worse:
  a false miss invites a withdrawal that never happened to be explained away, and
  a false pass hides a real one. Ask the store for before AND after with ONE
  predicate rather than differencing against a figure an earlier cycle's script
  recorded.
  **7 crawlable pages / 60,590 ppl**, exactly the pre-dispatch count, and a local
  regeneration adds nothing — the surfaces agree.
  `docs/accuracy-log.md` 2026-09-30 (14:2xZ).
- **WHAT #520 CARRIED: A STATEMENT BULLET AND A PAGE NUMBER
  ARE NOT PART OF A FIRM'S NAME: 7,702 rows / 559 entries / 403,982
  participants / $5,661,540,544.** 567 plans are shown `— Fidelity
  Investments`, `. Mutual of America`, `-0- VOYA FINANCIAL`, `‘Vanguard` or
  `| Principal Life Insurance Company` as **the firm behind their fund**;
  app.js:2619 renders `f.iss` with only the party-in-interest `*` removed and
  `build-seo-pages` prints it too, so the leader reaches **both surfaces**.
  Found by the 14:2xZ draw on **Capital Blue Cross (2,862 ppl)**, whose 29-row
  Vanguard menu is immaculate but whose issuer column carries the PREVIOUS
  row's wrapped tail — `{Growth Fund; Class R6 Vanguard}`, `{Inst'l Shr
  Invesco}`, `{Class L Vanguard}`. **That class stays OPEN; this arm is the
  piece decidable per row, and much the larger.**
  **AN HONESTY FIX AND NOT A COVERAGE FIX, MEASURED THROUGH ALL THREE
  RESOLVERS:** app.js `lookupTicker`, app.js `fundERRow` and merge's own SEC
  `resolveHolding` each report **0 gained / 0 lost / 0 changed** over the whole
  affected population — `fund-er.js` already matches straight through a leading
  `—`, a bare `.` and even `-0-`. ***A clean zero reports on the query***, so
  each arm was POSITIVE-CONTROLLED first: `500 Index Fund` {} → {Vanguard}
  gains VFIAX, 0.03 and VFINX on the three paths.
  **TWO PREDICATES WERE MEASURED AND REFUSED FIRST AND NEITHER NUMBER MAY BE
  CARRIED FORWARD.** The longest proper SUFFIX that stands alone as a complete
  issuer is **50,057 rows / 18,301,077 ppl** and is overwhelmingly real firms
  being truncated (`Fidelity Management Trust Company` → `Management Trust
  Company`, `Charles Schwab` → `Schwab`). Adding the mirror condition — the
  PREFIX stands alone nowhere — still leaves **18,949 / 6,753,683** with `BNY
  Mellon` → `Mellon` and `PGIM Jennison` → `Jennison`, because *a real firm's
  leading word is almost never used as an issuer on its own.*
  **THE RUN IS EVERY NON-LETTER AND NOT LETTERS-AND-DIGITS**, which is where
  the reading paid: the naive run stops at the digit and leaves `0- VOYA
  FINANCIAL`. **27 leaders carry a digit and every one is a PAGE NUMBER or a
  statement legend** — `-0- JOHN HANCOCK` and its fifteen siblings, `-18-
  Sponsor:`, `-14- American Funds`, `%4 John Hancock`.
  **THE TWO FURTHER CONDITIONS EACH PROTECT A DIFFERENT FAMILY.** The run must
  END in punctuation or space, **which makes a digit-leading FIRM safe BY
  CONSTRUCTION rather than by a head count** — zero issuers lead with a digit
  across all 535,864 values, but `3M Company` would otherwise become `M
  Company`, and *a rule whose safety rests on a population that can change is a
  rule waiting to break.* And the remainder must begin with a CAPITAL — the
  sibling arm's own gate — which leaves OCR wreckage **exactly as filed** rather
  than half-repairing it (`/anguard Group`, a `V` read as a slash).
  **All 403 distinct values read, the WHOLE population, not one remainder
  anything but a real firm or fund name**; zero lead with a `*`, so the marker
  cannot be consumed.
  **IT RUNS BEFORE THE CAPTION STRIP SO THE TWO COMPOSE**, and that is the
  largest single transformation: `. GROUP ANNUITY CONTRACT Mutual of America`
  (**5,145 rows**) loses its dot here and is then a caption the sibling already
  knows, landing on `Mutual of America`. The order also feeds that strip's own
  evidence — 403 damaged variants were splitting the standalone count away from
  their clean forms.
  **TRUE REACH IS 403,982 AND NOT 396,518:** one of the 559 entries is a MASTER
  TRUST with no `plans-all` row, reaching a member plan of 7,464, overlap 0.
  *A count keyed on plans is blind to every trust row* — the recurring miss.
  **PRE-REGISTERED:** the merge log prints `issuer leading-junk strip: 7702 rows
  across 559 plans` and `issuer section-caption strip: 5145 rows across 178
  plans`; CONFIDENCE DIFF **+0 / −0**, `rows-dropped` **0**; `sec tickers`
  unchanged at **347,386 / 37,107**; `confident` 60,103, HIGH 5, `warn` 610,
  `overshoot` 316, `dl` 142, pv 196 at 99.79% — all unchanged.
  `scripts/merge-name-test.mjs` slices `stripIssuerLead` BY NAME, 25 pins 25/25,
  **a negative control per condition**: dropping the fence disagrees by name on
  exactly `3M Company`, dropping the capital gate on exactly the four OCR and
  non-name cases. **7 crawlable pages / 60,590 ppl**, every changed cell read.
  parser-gate, smoke, fund-er-test (46/26/19/18) green.
  `docs/accuracy-log.md` 2026-09-30 (14:4xZ).
- **PREVIOUSLY: #519 RAN `success` AND IS MIRRORED — 2026-09-30 13:3xZ
  (`1fb86faf → 869c5f03`), UNFORCED ON BOTH CHECKS, data gate +0 / −0. EVERY
  PRE-REGISTERED FIGURE PASSED TO THE ROW, AND BOTH RUN-ONLY FIGURES WERE READ
  OUT OF THE ARTIFACT RATHER THAN THE LOG** (the merge log's blob host is
  `connect_rejected` from the sandbox): diffing the 64 lineup shards at
  `e1dcebc4` against the data commit gives **names changed 140 rows across 98
  entries**, exactly as registered, and **`sec tickers` 347,386 rows across
  37,107 entries**, also exact. Coverage line byte-identical — confident
  60,103, HIGH 5, warn 610, overshoot 316, dl 142, pv 196 at 99.8%.
  *A figure computed from the artifact does not depend on a log being
  readable.*
  **AND THE PAGES CHANGED, WHICH THE PRE-RUN `p/` DIFF COULD NOT HAVE SHOWN:**
  that diff was empty because it was taken against the OLD store. The run's own
  generator regenerated **4 crawlable pages / 30,824 participants** and a local
  regeneration adds nothing further, so the surfaces agree. All four changed
  cells read, one per page, every one the intended repair: Equitable Financial
  (12,994) `Hoodriver Small Cap Growth` → `Hood River …`; Privia Health (7,546)
  `Invescocomstock Fund A` → `Invesco Comstock …`; Nidec Motor (5,770)
  `Vanguard Total Bondmarket Index Fund: Inst'l Shr` → `… Total Bond Market …`;
  Tift Regional (4,514) `Health Sciencesopps Instl` → `Health Sciences Opps …`.
  **`titleCase` had been HIDING the seam** — it lowercases the second half, so
  the page rendered `Hoodriver` as one ordinary-looking word where the store at
  least showed `HoodRiver`. *A display transform can make a defect harder to
  see than the data it renders.*
  **WHAT #519 CARRIED — A LOST SPACE INSIDE A PUBLISHED FUND NAME.** **A LOST SPACE INSIDE A PUBLISHED
  FUND NAME: 140 rows / 98 plans / 140,349 participants / $291,925,206.**
  `Vanguard Total Bond**M**arket Index Adm`, `JPMorgan**M**id Cap Growth Fund
  R6`, `Fidelity**T**otal Bond K6 Fund`, `Empower**G**uaranteed Interest Fund`.
  **IT IS NOT THE HONESTY FIX IT WAS QUEUED AS.** All **137 distinct
  transformations read**, every one a real fund name: `fund-er.js` **+17
  tickers / −0 / 0 flipped** and **+18 fees / −0 / 9 CHANGED**, every change a
  correction away from a generic pattern (`Vanguard Developed Markets Index
  Admiral` 0.1 → 0.05, `Fidelity Mid Cp Index Fund` 0.1 → 0.025); the SEC index
  **+29 / −0 / 0**, including **`FidelityTotal Bond K6 Fund` → FTKFX**, the K6
  share class this record has named as a defect four times.
  **AND THE 29 IS THE REAL MERGE'S NUMBER WHERE MY HARNESS SAID 36** — the SEC
  block stores `stk` only where the FILING types the row a registered mutual
  fund, and my outcome test called `resolveHolding` without that gate, so seven
  gains sit on rows that never reach the field. ***Measure through the function
  the caller calls***, and the real merge is what settled it.
  **MEASURED ON THE RAW STORED NAME, which is what the merge holds: 140 / 98 /
  140,349.** The same predicate over `cleanFiledName`'s output reads **151 / 108
  / 151,454** — the DISPLAY string, and the queue entry below carried it. *The
  second half of the same rule: with the argument the caller passes.*
  **ONE REPAIR PER NAME and it costs nothing** — whole-store, **zero** names
  offer more than one attested repair.
  **PRE-REGISTERED:** the merge log prints `lost-space repair: 140 rows across
  98 plans`; `sec tickers` **347,386 rows across 37,107 plans**; CONFIDENCE DIFF
  **+0 / −0** and `rows-dropped` **0** (names change, no sum or ratio moves);
  `confident` **60,103**, HIGH **5**, `warn` **610**, `overshoot` **316**, `dl`
  **142**, pv 196 at 99.79% — all unchanged.
  **THE MIRROR IS HELD UNTIL THE VERDICT ON PURPOSE**, for v193's narrow
  reason: this has **no display half**, so mirroring early delivers nothing to a
  reader and only puts unverified code on main.
  **Prevention: `scripts/merge-name-test.mjs`, IN THE REPO** because the last
  generator that lived in a session scratchpad was wiped by a container restart.
  It SLICES the shipped `weldRepair` out of `merge-4i` rather than restating it,
  asserts **20 pinned cases 20/20**, and its negative control removes the one
  condition — the repaired whole name must stand alone — and **fails by name on
  exactly the 7** it protects (six real firm names and the double render) while
  all six must-repairs and all seven CamelCase must-keeps hold. parser-gate,
  smoke, fund-er-test (46/26/19/18) green; `git diff --stat p/` empty.
  `docs/accuracy-log.md` 2026-09-30 (12:5xZ).
- **PREVIOUSLY QUEUED 2026-09-30 12:0xZ — A LOST SPACE
  INSIDE A PUBLISHED FUND NAME: 151 rows / 108 plans / 151,454 participants /
  $300,291,381.** *(Shipped above; those figures are the DISPLAY string's and
  the shipped ones are 140 / 98 / 140,349.)* Found by the 11:5xZ draw on
  **Preferred Podiatry Management
  (593 ppl)**, whose otherwise immaculate 32-row menu publishes `Great Gray
  Trust**I**nternational Stock R1 Fund`.
  **THE OBVIOUS PREDICATE IS NOT A CLASS AND THE SIZE WAS THE TELL: 93,171 rows
  / 39,461,818 ppl** carry a lowercase-to-uppercase seam, and **CamelCase is how
  these funds are NAMED** — `LifePath` 28,826, `BlackRock` 24,868, `EuroPacific`
  7,938, `SmartRetirement` 5,221, `MassMutual` 3,634. **Do not carry 93,171 or
  39,461,818 forward.**
  **NOR DOES TOKEN RARITY DISCRIMINATE:** unattested joined token + both halves
  ordinary words gives **529 rows / 689,387 ppl** and is **at least three
  mechanisms** — (A) REAL firm names that are merely rare (`FirstEnergy common
  stock`, 16,802 ppl / $458,084,933; `ExxonMobil Stock Fund`; `BancPlus
  Corporation`; `LifePoint Health Stable Value`), which must NEVER be split;
  (B) the genuine lost space; (C) a **DOUBLE RENDER welded at the seam**
  (`Dodge & Cox IncomeDodge & Cox Income`). *A rare-but-real CamelCase name and
  a lost space are indistinguishable by count* — the mirror of the floor-of-one
  lesson. **Do not carry 529 or 689,387 forward either.**
  **THE DISCRIMINATOR THAT WORKS IS THE ISSUER STRIP'S OWN, ASKED OF THE WHOLE
  REPAIRED NAME** — does the repaired string appear elsewhere as a COMPLETE
  published name? All the distinct repairs read, **every one a real fund**:
  `Vanguard Total BondMarket Index Fund` (repaired name attested **81×**),
  `VanguardGrowth Index Adm` (1,271×), `JPMorganMid Cap Growth Fund R6` (128×),
  `BlackrockTotal Return Fund` (202×), `EmpowerGuaranteed Interest Fund` (46×).
  **(A) and (C) are refused BY CONSTRUCTION** — `First Energy common stock` is
  attested nowhere. **Needs the WHOLE STORE, so it is MERGE-SIDE** beside the
  issuer strip and #517's OCR tail strip, floor **3 and not 1**. Next ship.
- **PREVIOUSLY QUEUED, SIZED, WRITTEN, MEASURED AND REFUSED 2026-09-30 10:1xZ —
  THE ISSUER
  MAY ADD A MANAGER AND NEVER REPLACE ONE, AND `lookupTicker` NEVER GOT THE
  RULE: 17 published rows name a COMPETITOR'S fund as fact.** *(Superseded by
  the shipped bullet above; its 17/14 figures are the stand-in harness's and the
  shipped numbers are 16/2.)* It has prepended
  the issuer since v67 and tries the prefixed string **FIRST**, so a
  contradicting issuer does not merely fill a blank — it can OVERRIDE.
  `{Fidelity} Vanguard Total Bond Market Institutional` → **FTBFX, Fidelity's own
  Total Bond Fund**: **University of Miami's four plans, 31,932 participants /
  $52,478,012**, Rochester Institute of Technology 8,365, Presbyterian Health
  Plan 2,885. `{T. Rowe Price} JPMorgan Large Cap Growth Fund` → TRLGX, and the
  same issuer onto Putnam, MFS, Neuberger Berman, TIAA-CREF and PIMCO holdings.
  All 17 read, not one right.
  **THE FEE PATH IS CLEAN AND THAT WAS VERIFIED, NOT ASSUMED:** `issuerPricedER`
  sliced verbatim out of app.js publishes **0** fees across the whole population,
  with the positive control `{Vanguard} 500 Index Fund → 0.02` proving the arm is
  reachable. **My first measurement said 275** — it asked `fundER(iss + name)`
  directly, the raw prefix and not the page, because `issuerPricedER` lives in
  app.js and not in `fund-er.js`. *Measure through the function the page calls*,
  walked into again and this time EXONERATING the code.
  **THE FIX WAS WRITTEN, CONTROLLED 15/15 AND KILLED BY THE WHOLE-STORE DIFF.**
  `issuerPricedER` is generic over its resolver, so it can be reused VERBATIM with
  the TICKER as its value — no new vocabulary, the shape this record prefers.
  **Whole-store it withdraws 3,470 rows that are overwhelmingly CORRECT**:
  `{State Street} S&P 500 Index` → SSSYX, `{Fidelity} S&P 500 Index` → FXAIX, the
  whole State Street Target Retirement family at Galls. Its arm (2) drops the
  name's first load-bearing word and refuses when the answer is unchanged — right
  for the FEE table, wrong for the TICKER table, because `State Street 500 Index`
  still resolves. ***A predicate that is right for one class is not thereby right
  for its neighbour.*** **And my 15 controls were DECORATIVE in the one direction
  that mattered** — every must-KEEP I chose survives the guard, not one had the
  shape that breaks it. *A hand-built control table tests the cases its author
  already imagined, so the whole-store diff is not a formality after the controls
  pass; it is the only thing that saw this.*
  **THE CORRECT DISCRIMINATOR IS MEASURED: 17 withdrawn / 14 CHANGED / 0 gained /
  0 correct answers lost**, 20 entries / 55,809 ppl. It needs a house LIST, which
  this record warns is wrong in the unsafe direction, so it ships only with every
  affected row read — and all 31 were. **THE 14 CHANGED ARE ALL CORRECTIONS AND
  WERE NOT PREDICTED**, each verified against `sec-funds.json`: twelve
  `{Fidelity Management Trust Company} T. Rowe Price Retirement <year> I Fund`
  rows move from the base class to the **-I Class the filing states** (TRRHX →
  TREHX); `Vanguard Target Ret 2020 Inv` from **VTINX, Target Retirement INCOME**,
  to VTWNX; `JPMORGAN MID CAP GROWTH R6` from FTBFX to JMGMX. **And TRBCX → TBCIX
  closes this record's own recorded investor-vs-I-class defect from a direction
  nobody was looking.**
  **THE RAW CLASS MUST NOT BE CARRIED FORWARD: 12,734 rows / 1,822 plans /
  2,048,738 ppl is AT LEAST FIVE MECHANISMS** — platform issuers 10,917 (Voya,
  Transamerica, the separate account's real sponsor), same-firm brand pairs 1,327
  (**TIAA↔Nuveen is the whole of it, and Nuveen IS TIAA's asset manager**), a
  welded issuer carrying two firms 7, trustees and custodians dominating the rest,
  and only then the genuine contradiction. **Do not quote 12,734 or 2,048,738.**
  `docs/accuracy-log.md` 2026-09-30 (10:1xZ).
- **SHIPPED AND MIRRORED 2026-09-30 07:4xZ (`fda28a8c → af83067b`), UNFORCED ON
  BOTH CHECKS, data gate +0 / −0 — A BARE MATURITY DATE IS THE PARTICIPANT-LOAN
  ROW: 68 rows / 67 plans / 135,334 participants / $153,709,833.** Found by the
  07:1xZ draw on **Eastman Kodak (8,020 ppl, 22 rows @ ratio 1.000)**, whose
  BlackRock and T. Rowe Price menu is immaculate but for one row named
  **`March, 2032)`** at $2,463,992.
  **THE THIRD MEMBER OF THE WRAPPED-LOAN FAMILY AND THE ONE THE OTHER TWO CANNOT
  REACH:** `isLoanDescriptionRow` needs the loan RANGE words, `isLoanAnswerRow`
  the ANSWER words, and here the description wraps over THREE lines with the
  value on the third, so the row is named by a fragment carrying neither.
  **THE CAUSE WAS READ IN THREE FILINGS, NOT INFERRED** — Kodak, **Baylor Scott
  & White (57,248 ppl)** and TotalEnergies all put `Participant Loans` /
  `Notes receivable from participants` in the IDENTITY column with the maturity
  date on the value-bearing line, and Kodak's own statement of net assets
  repeats the figure as `Notes Receivable from Participants 2,463,992`.
  **AND THE POPULATION CORROBORATES IT WITH NO DOWNLOADS: 68 of 68 sit in a menu
  with NO loan row at all, 0 beside one.** A plan whose schedule itemises
  participant loans and appears to have none is a plan whose loan row lost its
  name — *a class-wide absence can corroborate a cause read in three cases*, and
  it is what makes the claim safe for all 68 rather than the 3 that were read.
  All 50 distinct names read, not one a fund, **0 publishing a ticker and
  `fundER` pricing 0**, so the harm is the CLAIM alone. **TYPED, NOT DROPPED
  (v181)** — the value is the loan balance, stays in the denominator, and no
  other row's percentage moves. **A BARE YEAR IS EXCLUDED ON PURPOSE:** `2065`
  as a whole name is a target-date vintage far more often than a maturity, so
  the month name is required.
  Over **1,720,271 published rows the predicate flags exactly 68 across 50
  names and 0 were already typed** by an existing loan rule — strictly additive.
  17 pinned cases 17/17; the negative control drifts the twin and **fails by name
  on exactly the 8 must-flags** while holding all 9 must-keeps. parser-gate,
  smoke and fund-er-test (46/26/19/18) green; **exactly ONE crawlable page**
  changes (Peterson Holding, 2,518 ppl). `site-test` #114 dispatched on
  `af83067b` because the change shipped `[skip ci]`.
  `docs/accuracy-log.md` 2026-09-30 (07:3xZ).
- **AND THE OCR-RESIDUE ITEM IS BLOCKED AT THE DISPLAY PATH AND RE-HOMED, which
  is why the above was found.** Its narrowing gate was *does the HEAD already
  name a fund* — an outcome test through `fund-er.js` — and
  **`build-seo-pages.mjs` must NEVER import `fund-er.js`**, that absence being
  the standing guarantee the crawlable pages cannot render a per-fund ER. So a
  display rule must be purely syntactic, and **no syntactic rule separates
  `Vanguard Total Bond Market Index Ad min` (a split `Admiral`, must keep) from
  `Nuveen Real Estate Sec Sel R6 ial` (must strip).** Two discriminators
  measured and both dead: the tails' ~1:1 rows-to-distinct ratio is just name
  uniqueness, and a closed vocabulary of the residue tokens contains `bad`,
  `we`, `id`, `bid`, `ad` — words. **RE-QUEUED TO `merge-4i`**, which holds the
  whole store and can ask the standalone test the issuer strip already uses,
  with a floor above ONE (*a floor of one lets a single damaged row license the
  same damage elsewhere*).
- **QUEUED, SIZED, NOT SHIPPED 2026-09-30 06:3xZ — AN OCR COLUMN-BLEED RESIDUE
  ON AN OTHERWISE IMMACULATE FUND NAME: 2,493 rows / 689 plans / 613,748
  participants / $5,404,521,731**, narrowed by outcome from a raw population of
  6,054 / 1,272 / 1,874,788. Found by the 06:1xZ draw on **Logistics Plus (608
  ppl, 31 rows @ 0.995, OCR'd)**, three of whose American Century rows read
  `One Choice 2055 ee` / `One Choice 2060 ee` / `One Choice 2035 ae`.
  **IT IS AN HONESTY FIX AND NOT A COVERAGE FIX, MEASURED: +0 tickers, +0 fees,
  0 flipped** — `fund-er.js` already matches through a trailing residue, as it
  does through a trailing `+` and a leading stray quote, and **742 of the 2,493
  already publish a ticker and 2,469 a fee.**
  **THE RAW 6,054 IS AT LEAST FOUR DEFECTS and must not be carried forward:**
  (A) the OCR bleed proper, 5,095 rows in OCR'd entries (`ae` 600, `al` 399,
  `ial` 396, `il` 331, `ee` 304); **(B) `of`, 140 rows, a TRUNCATION where
  stripping makes the name worse** — `American Funds Growth Fund of` cut before
  `America`; (C) `at`/`in`, wrapped-sentence tails, already a recorded class;
  (D) `xx`, 129 rows, a masked figure.
  **THE GUARD IT STILL NEEDS IS NAMED BY THE POPULATION: an OCR-SPLIT WORD
  looks identical to a residue** — `Vanguard Total Bond Market Index Ad min` is
  `Admiral`, and stripping `min` leaves `… Index Ad`. The discriminator is the
  03:3xZ prefix rule run backwards (the preceding token plus the tail must not
  itself be a word), and it needs building and tethering first.
  `docs/accuracy-log.md` 2026-09-30 (06:3xZ).
- **NOTHING SHIPPED 2026-09-30 06:1xZ AND THAT IS THE FINDING — THREE OF FOUR
  PARSER-SIDE QUEUE ITEMS WERE STALE AND THE FOURTH WAS NEVER A MEASUREMENT.**
  Re-sized against the pv-196 store: the `Company stock`-typed-fund item is
  **CLOSED** (85 of 86 already reached by `isMistypedStockRow`, which also blanks
  the type cell — the guard shipped 2026-09-29, one bullet away from the entry
  queuing it); the party-in-interest weld **61 rows → 1** and the Form 5500 cover
  page **41 → 0**, both closed by v193. **And my "real contract wearing a loan
  caption" sizer returned 0 BY CONSTRUCTION:** it asked for
  `isLoanDescriptionRow` true AND a surviving issuer, but that predicate requires
  an EMPTY residue and an issuer IS residue, so the conjunction can never fire.
  **Do not carry that 0 forward** — it reports on the query. *A queued class must
  be re-sized against the current store before a run is spent on it; the list
  records what was true when it was written.* `docs/accuracy-log.md` 2026-09-30
  (06:1xZ).
- **SHIPPED 2026-09-30 03:1xZ, `[skip ci]` behind #514 — THE PARTICIPANT COUNT
  THAT EVERY MEASUREMENT HERE IS WEIGHTED BY CAN BE A FILER TYPO: 390 plans /
  768,216 participants whose headline count is above TEN TIMES every other
  participant field on the same filing, where their own fields imply about
  12,957.** Found by the 03:0xZ draw on **Iti Intermodal (363206648|001), 294,352
  participants against $8,709,186** — and **READ IN THE PDF**: line 5 reads
  `294352` while **line 6a(1), active participants at that SAME INSTANT, reads
  `328`**; line 6d is 401 and balances 338. `build-data.mjs:206` takes line 5
  whenever line 5 is ≥100, which is the right field, so **our ingest is faithful
  and the keystroke is the filer's.**
  **The consequence is not one plan.** `participants` is the headline on the plan
  page and the WEIGHT on every reader-reach figure this project publishes —
  including the draw that found it, which spent one of two slots here. **Up to
  755,259 participants, 0.68% of the universe, may be fictional, and 294,352 of
  them are ONE plan (0.26% on its own).** Any future class containing it gains
  294,352 spurious readers.
  **Shipped is ONE aggregate `boy-count-contradicted` WARN and nothing else**, so
  the class enters the trail without drowning it and no published number moves —
  because **the test finds a CONTRADICTION and does not say which side is
  wrong.** Line 6a(1) is the same-instant witness that settles it and **prep does
  not ingest it: one line in `build-data.mjs`, and the concrete next step.** Only
  ONE member has a crawlable page (Sun Pharmaceutical, 2,439 against 71 actives
  on $308,559,232 — already a standing `avg-balance` WARN for the same reason).
  **#514's coverage line will read `warn` 609, not 608**: merge-4i checks out the
  LATEST branch state, so a `[skip ci]` commit made mid-run takes effect in that
  run's own merge — the recorded `tkShare` mechanism, not a regression. Negative
  control: with the bar raised past the class the audit returns to 608 exactly.
  `docs/accuracy-log.md` 2026-09-30 (03:1xZ).
- **SHIPPED 2026-09-30 03:3xZ, `[skip ci]` behind #514 — A TRUNCATED WORD IS NOT A
  SURVIVING FUND NAME: 21 rows / 21 plans / 91,184 participants / $51,879,475.**
  Hyatt (44,487) published `Plan participants Notes with interest rates ranging
  from 3.25% to 10.50%, with various mat`; TriHealth (18,586) `with 4.25%–9.50%
  annual interest rate`; Churchill Downs (8,531) `… maturity dates thr`.
  **The guard's RESIDUE TEST is what let them through and it must stay** — it is
  what keeps Griswold's `… 0.15% to 0.62% … Principal`, a GIC whose surviving
  word is a house name. **But these residues are not names: they are words the
  rule ALREADY STRIPS, cut mid-token by the column width** — `mat` `thr` `dat`
  `matu` `matur` `throug` `Bear` `bear` `balan` `partic` `par` `Ap` `Col` `Coll`
  `Colla` `annual` `ye`, and Metro CU's OCR-split `Inte re st`. So the arm is
  structural and adds no vocabulary: **a residue token that is a PROPER PREFIX of
  a stripped word is that word**, with the vocabulary DERIVED from
  `LOAN_DESC_WORDS.source` under an import assertion.
  **The queued figure was 13 / 70,205 and it is 21 / 91,184** (measured at v183,
  store now pv 195), and three of the extra rows are shapes the queue had
  separated out as their own defects — including the OCR-split family.
  **Over 1,710,454 published rows exactly 21 change and 0 are LOST**, all 21
  names read, **0 publishing a ticker, a `stk` or a fee.** **THE NAMED RISK IS
  REFUSED BY SOMETHING STRONGER THAN THE PREFIX TEST:** `Bear Stearns High Yield`
  keeps `Stearns`, `Columbia Short Term Bond` keeps `Columbia` — *a real name
  arrives WHOLE*, so the arm can only consume an already-abbreviated token.
  REPORT path only, `git diff --stat p/` empty over all 5,000 regenerated pages.
  Tether 14 → 20, twin probes 14 → 19, negative control fails by name on exactly
  the 6 new must-flags; **no specimen pinned, deliberately** — `diff-lineups`
  compares PARSER output and this is a display rule.
  `docs/accuracy-log.md` 2026-09-30 (03:3xZ).
- **OWNER'S CALL, SIZED, NOT SHIPPED — AN ASSERTED TICKER WHOSE OWN REGISTERED
  CLASS CONTRADICTS THE FILING: 5,861 rows / 3,977 plans / 8,288,788
  participants, of which 5,854 / 8,282,460 ALSO publish the other fund's FEE.**
  Found by the 03:3xZ draw on **U-Haul Holding (35,385 ppl)**, whose `Total Bond
  K6 Fund` renders **FTBFX at 0.45%** where `sec-funds.json` says FTBFX is
  `Fidelity Total Bond Fund` and the K6 fund is **FTKFX** — not asterisked, not a
  labelled comparable, published as fact. `Fidelity Contrafund K6` → FCNTX (318
  rows), `FID GOVT MMKT K6` → SPAXX (345), `Vanguard Small-Cap Index Fund
  Investor Shares` → **VSMAX, the ADMIRAL class**, priced at Admiral's 0.05% —
  **the Vanguard half errs in the FLATTERING direction.**
  **LARGER THAN EVERY PREVIOUS MEASUREMENT OF THIS DEFECT**, which this record
  has now named four times: the 2026-09-28 SEC cross-check said 744 names / 3,844
  rows / 5,962,185 ppl because it counted only names where BOTH sources resolve
  exactly. The narrower and more damning question — *does the asserted answer's
  own registered class contradict the class the filing states* — reaches 5,861 /
  8,288,788.
  **THE THIRD OPTION THIS RECORD HAD NOT CONSIDERED.** 2026-09-28 refused to
  override the ticker because that leaves the retail FEE beside the K6 symbol,
  and that holds. (1) ticker only — refused. (2) BOTH — the right answer, but *a
  fee is SOURCED, never derived* and `fund-er.js` has no K6 numbers, so it needs
  `data/fund-facts.json` populated per share class. (3) **WITHDRAW BOTH** — which
  is exactly the move made for the 10,387 American Funds fee cells, *a wrong
  number outranks an absent one*, and was never considered here.
  **Not shipped: route 3 costs 8.3M participants a ticker and a fee they have
  today**, the same line drawn for the R-6 item. **Recommendation: route 3 now,
  route 2 as `fund-facts` fills in per-class figures — they compose.**
  Harness note: my first pass read `sec-funds.json` entries as OBJECTS and asked
  `f.ticker`, which would have sized the class at **0**; they are ARRAYS
  (`["Registrant :: Series", ticker, "class", "Class Name"]`), and the sizer now
  asserts FTKFX and FTBFX both resolve before counting.
  `docs/accuracy-log.md` 2026-09-30 (03:5xZ).
- **NOTHING IS IN FLIGHT. #515 RAN `success` AND IS MIRRORED — 2026-09-30 05:1xZ
  (`e4550e5d → 10d45d5b`), UNFORCED ON BOTH CHECKS, data gate +0 / −0. EVERY
  PRE-REGISTERED TEST PASSED AND THE WITNESS CONVICTED 119 PLANS IN TWO
  DIRECTIONS.** `fields` is **39** with `activeBOY` last; **both columns
  resolved** (67,749 of 68,259 full-form and 43,212 of 43,523 short-form carry a
  non-zero value, 99.3% each); **`warn` 609 → 610** exactly as registered, the
  extra being `eoy-count-contradicted`; and **no published number moved** —
  `confident` 60,103, lineups 59,753, entries 65,240, `overshoot` 316, `dl` 142,
  `tkShare` 24.42 all byte-identical. Unregistered and correct: **`high` 7 → 5**,
  #514's two self-clearing `reparse-loss` entries clearing, so **HIGH 5 = 4
  `contrib` + `fabricated-name` is the standing baseline.**
  **THE THREE VALUES MATCH THE FILINGS I READ BY EYE, TO THE PERSON: Iti
  Intermodal 328, Sun Pharmaceutical 1,477, Sound Harbor 3.** Three independent
  confirmations in one read that the column name is right, the ingest is faithful
  and the readings were right.
  **THE SPLIT, of 171 real contradictions (219 of the 390 being wind-downs whose
  filings are correct): line 6a(1) convicts LINE 5 on 86 (426,701 ppl), convicts
  the END-of-year subtotal on 33 (151,953 ppl), 1 unsettled, 51 with no 6a(1)
  filed.** The 33 matter most because **the end-of-year subtotal is what the site
  PUBLISHES** — `parts = partEOY || participants`, unconditionally.
  **AND IT SETTLED THE CASE I HAD EXPLICITLY LEFT AMBIGUOUS: Inova Health System
  Foundation publishes 842 where line 5 says 22,529 and 6a(1) says 22,057**, so
  line 5 is honest and the published count is wrong by a factor of 27.
  Fontainebleau is the same shape (208 published, 5,245 filed, 6a(1) 5,178).
  *A field that resolves a case you already read and could not settle is worth
  more than one that confirms a case you could.*
  **MY POSITIVE CONTROL UNDERSTATED THE CLASS BY TWO ORDERS OF MAGNITUDE and that
  is not a defect in it** — it set three witnesses by hand (1 / 1 / 1 / 168) and
  production has 99.3% coverage. *A control proves the branches are reachable and
  correctly wired; it cannot size a population whose inputs it chose.*
  **AND THE PRINT FIX DELIVERED: #515's log is the FIRST run log ever to carry
  these five class-level findings as text** — the two above plus
  `folded-aggregate` (112 menus / 1,156,064 ppl, worst RTX Savings Plan Master
  Trust 61%), `lineup-overshoot` (316 / 397,499, worst BNSF 1.37x) and
  `trust-overshoot` (12 / 203,974, worst Paramount Global Master Trust 1.36x).
  Three of the five were counted in the coverage line and never printed.
  **NEXT, AND IT IS A DECISION RATHER THAN A MEASUREMENT:** the 33 have a filed
  witness on both sides, so `parts` could prefer line 5 where 6a(1) corroborates
  it — 33 published counts move, which is the owner's call.
  `docs/accuracy-log.md` 2026-09-30 (05:1xZ).
- **WHAT #515 SHIPPED: THE SAME-INSTANT PARTICIPANT WITNESS, AND IT ANSWERS
  IN BOTH DIRECTIONS.** Line 6a(1) — active participants at the BEGINNING of the
  plan year — is the only count taken at the same instant as line 5. **Iti
  Intermodal** files line 5 = 294,352 with **6a(1) = 328**, so line 5 is the
  keystroke. **Sun Pharmaceutical** files line 5 = 2,439 with **6a(1) = 1,477**,
  6b = 0, 6c = 0, **6d = 71**, while assets GREW **$225,321,641 → $308,559,232** —
  so line 5 is HONEST and the wrong number is **line 6d**, the filer having
  completed 6a(2) and left 6b and 6c blank. **`build-data` packs `parts = partEOY
  || participants`, so 6d is what the site PUBLISHES: that page shows 71
  participants against $308,559,232**, which is the standing $4.3M `avg-balance`
  WARN, and it is OURS. One field, two opposite verdicts. Stored as `activeBOY`
  appended at the END of plans-all's `FIELDS` so no existing index moves, for both
  the full form and the short form (5d(1)), and **both branches LOG whether the
  column resolved** — the extract headers are unreachable from a sandbox, so the
  run is what says the name is right.
  **AND MY OWN 03:1xZ WARN FLAGGED 219 CORRECT FILINGS.** A plan that terminated
  mid-year honestly reports a huge opening count and a tiny closing one, because
  the money left with the people: **SVB Financial 7,926 → 3 against $1.19B →
  $2.2M**. An assets COLLAPSE tells a wind-down from a keystroke, so of the 390,
  **219 are wind-downs and 171 are real contradictions** — *ONE count was several
  defects*, met again in my own work one cycle later.
  **AND THE 03:1xZ CLAIM THAT `participants` IS THE PAGE HEADLINE WAS WRONG.**
  `parts` prefers 6d, so **Iti's page shows 401, not 294,352**, and only **156 of
  the 390 reach a reader with the contradicted count — 155 of them SHORT-FORM,
  which is structural because the SF branch never writes `partEOY` at all.**
  **AND A FLAG NOBODY CAN READ IS A FLAG THAT DOES NOT EXIST.** Class-level
  findings are raised after the per-plan loop and `audit-data` cut each severity at
  40 rows, so `boy-count-contradicted` counted toward `warn` on every run since it
  shipped and **its text never once appeared in a run log** — nor had
  `folded-aggregate` (112 menus / 1,156,064 ppl), `lineup-overshoot` (316 /
  397,499) or `trust-overshoot` (12 / 203,974). The discriminator needs no registry
  and cannot go stale: **a per-plan rule fires many times, a class-level rule fires
  ONCE**, so any rule with a single finding prints past the cut. Four lines added
  on the live store, all four of them classes.
  Positive control through the shipped audit, all four verdict branches at once on
  a crafted store carrying the two 6a(1) values READ FROM THE FILINGS: line 5
  convicted 1, end-of-year convicted 1, unsettled 1, no witness 168. Negative
  control on the live store, where the column does not exist: **0 / 0 / 0 / 171**.
  **PRE-REGISTERED:** the prep log prints `line 6a(1) active-at-BOY column:
  resolved at index N (NAME)` and the SF equivalent, and **if either says NOT FOUND
  the column name is wrong and that is the finding**; `fields` gains `activeBOY` as
  the 39th entry; **`warn` 609 → 610**, the extra being `eoy-count-contradicted`
  firing on Sun Pharmaceutical; `boy-count-contradicted`'s text appears in a run
  log for the first time with a non-zero three-way split; `confident` 60,103,
  HIGH 5, `overshoot` 316, `dl` 142, pv 196 at 99.79% all unchanged. **No published
  number moves — the count selection is untouched.**
  `docs/accuracy-log.md` 2026-09-30 (04:5xZ).
- **OWNER'S CALL, SIZED, NOT SHIPPED — `gicRow` AND `fund-er.js` CONTRADICT EACH
  OTHER AND THE ARBITER IS AN EMPTY COLUMN: 4,782 rows / 4,648 plans / 7,839,651
  participants / $28,686,273,454 publish an estimated fee on a holding whose own
  filed NAME says stable value or a guaranteed account.** Found by the 04:3xZ draw
  on **Tallahassee Memorial Healthcare (5,789 ppl)**, whose `Lincoln Stable Value
  (at contract value)` is typed `Mutual fund` and prices at **0.35%**.
  `gicRow` is `/stable value|\bgic\b/i.test(f.type)` — **the TYPE cell, never the
  NAME** — so the site's own position that such a holding must carry no estimated
  ER is enforced only where the filer filled in a type. Where the cell is blank,
  `fund-er.js`'s generic `/stable value|guaranteed|gic/` fallback prices the row at
  **0.35%: the exact number withdrawn from 89 rows on 2026-09-29 and refused again
  by v196 this morning. 4,719 of the 4,782 publish exactly 0.35%.** `TIAA Stable
  Value` 303 rows / 365,642 ppl, `Guaranteed Income Fund` 239 / 541,292, `Putnam
  Stable Value Fund` 107 / 537,620.
  **RISK MEASURED AND ALMOST NIL: 4,781 of 4,782 publish NO ticker**, and the one
  that does is a weld of two holdings. **The machinery needs no new vocabulary** —
  `annuityFeeIsGuaranteeOnly(name, fundER)` already asks *does this row's fee come
  only from the guarantee fallback?*, and asking it of a row whose NAME states a
  stable-value account regardless of its type cell is the whole change.
  **NOT SHIPPED on the R-6 precedent: a session must not withdraw a fee cell from
  7.8M participants unasked. Recommendation: withdraw the 4,719 generic-0.35% rows
  and leave the 63 carrying a house-specific pattern** (T. Rowe Price 0.30%, Wells
  Fargo 0.45%), which at least name a house and a product.
  `docs/accuracy-log.md` 2026-09-30 (04:5xZ).
- **PREVIOUSLY: #514 (v196) RAN `success` AND IS MIRRORED — 2026-09-30
  04:2xZ (`076d369f → 84fc8ed4`), the git check UNFORCED and `--force-data` over
  three losses, each read row by row and REPRODUCED from its own `fbAck` first.
  FIVE OF SIX PRE-REGISTERED TESTS PASSED:** standalone `audit-dominant-row`
  **1 → 0** while the plan-keyed count held at **0** both ways;
  `audit-generic-names` **235 plans / 477 rows** against 238 ± 3; the
  `fabricated-name` HIGH **appeared, as registered**; `overshoot` **317 → 316**
  and `dl` **142**; and `warn` **609 not 608**, exactly as the mid-run commit
  predicted — merge-4i checks out the LATEST branch state, so the
  `boy-count-contradicted` check executed in #514's own merge.
  **`confident` MISSED — 60,103, net −3 / +0, where −1 / +0 was registered with a
  single named loss — AND THE CAUSE IS A CONSUMER OF THE WIDENED VOCABULARY I
  NEVER PRICED.** I sized v196 against `isGenericTypeName`'s consumers: the
  dominance guard, both audits, `diff-lineups`, the two display paths.
  **`GENERIC_TYPE_ANY` is ALSO read by `isClassLabel`, which is read by
  `isStatement`'s label-share arm inside the REGION CONTEST** (`judged.length >= 3
  && labely / judged.length >= 0.6`). So a vocabulary widening does not only
  withdraw one row's CLAIM — **it can demote a whole REGION from menu to
  statement**, which `isConfident` then refuses. Scott M & A Corp's five rows give
  `labely` 2/5 = 0.40 at v195 and **3/5 = 0.60 at v196, the threshold to the
  digit**; neither arm of `dominanceIsAggregate` fires on either row set under
  either version, which is what pointed at `isStatement` rather than at the guard.
  **AND THE DEMOTED REGION IS ONE NO WHOLE-STORE SCAN CAN SEE:** both extra
  losses published from a PRIOR-YEAR FALLBACK, and a fallback region exists only
  inside a run — `fallbacks.json` is artifact-only and the store holds the
  fallback's OUTPUT, never the candidate the next run judges. *Price a vocabulary
  change against the regions a run will CONTEST, not only against the rows the
  store already publishes.*
  Reproduced from each entry's own `fbAck` on the real text: **`stmt` flips 0 → 1
  in both with the row sets BYTE-IDENTICAL** — ratio, sums and names unmoved, only
  the classification (Scott 5 rows @ 1.329, Paragon Anesthesia 3 @ 0.912).
  **All three withdrawals are correct and the miss is in the SAFE direction.**
  Scott (456 ppl) published `Investments` at 47.7% **and `Pooled Separate
  Accounts` at 47.7% carrying the identical $5,371,156** — a double render — plus
  loans, an unallocated insurance general account and a group annuity: **not one
  of five names is a fund**. Paragon (140) published `Investments Registered
  investment companies at fair value` at **75.6%**. Hallmark's three rows are a
  trustee's statement of changes. **596 participants stop being shown an
  asset-class statement as a menu and no real menu was lost.**
  `docs/accuracy-log.md` 2026-09-30 (04:2xZ).
- **WHAT #514 SHIPPED (v196), for the record: A NAME THAT IS NOTHING BUT
  DECORATION ESCAPED THE
  DECORATION-AWARE GUARD: 166 rows / 164 plans / 501,561 participants /
  $29,813,863,521 on the report and 20 crawlable pages / 352,780 ppl** (J&J
  72,991, Cisco 72,556) stop being shown a measurement basis as a holding.
  Northwood Investors (2,277) published `at Fair Value` at **86.8%** of a
  three-row menu; Universal Orlando (23,662) `At fair value` at **75.3%**; Cisco
  `Collective Trusts(1) at NAV` at **77.9%**; Vitas (13,326) `Investments using
  NAV practical expedient` at **63.0%**; Calpine (3,014) a bare `Investments` at
  **79.8%**.
  **THE ARM THAT PRODUCED THE HOLE IS v188's OWN.** `stripGenericDecoration`
  already carried `[,;]?\s*at fair value$`, so `At fair value` strips to the
  **EMPTY STRING** — and an empty remainder is in no vocabulary, so the anchored
  predicate asked its question of nothing and answered false. **A guard that
  strips decoration and then looks for a vocabulary word is blind to a name that
  is nothing BUT decoration**, and the one basis spelling it already knew is
  exactly the one that empties the string. There is no word to add, so the arm is
  structural; **its whole population over all 1,710,451 published rows is 11
  distinct names / 37 rows, every one read, not one a fund** — an arm with no
  vocabulary is read by reading its population.
  Three further arms carry the family, all terminal-anchored and CHAINED: the
  `practical expedient` tail; the basis in every stored spelling, with a trailing
  footnote taken along rather than through a general parenthesised-LETTER strip,
  so v188's case-SENSITIVE caution stays as narrow as it was and `Separate Account
  A, at fair value` is still a pinned must-keep; a parenthesised NUMBER, which
  unlike a letter cannot be a share class; and a leading `investments`/`assets`.
  **`(?:at|using)` is REQUIRED on the NAV arm** — a bare `\bnav\b` eats `PIMCO
  Short-Term Floating NAV Portfolio II`.
  Whole-store against git HEAD's own lib-4i: **174 rows newly generic, 0 lost, all
  63 DISTINCT NAMES read**, none a fund.
  **AND `namelessRow` JOINS THE FEE SUPPRESSORS, which was not on the queue.**
  app.js's `er` listed eight suppressors and not this one — two of its sibling
  comments assert "the fee suppression above is independent of this ordering" and
  of this arm it was not true, so **a row the page itself declares names no
  specific fund was free to publish an estimated ER derived from that non-name.**
  787 nameless rows are reached today, `fundER` prices 34, and **32 are already
  suppressed by their TYPE cell reading `Stable value / GIC`, so the guard
  withdraws NOTHING that publishes today.** It exists because v196's own widening
  creates the first two escapes — `Guaranteed interest contract(s), at contract
  value` with a BLANK type at Mote Marine (443 ppl) and Vernet US (232), **2 rows
  / 675 ppl / $7,512,380**, each of which would print the generic **0.35%**
  guarantee fallback, the exact number withdrawn from 89 rows on 2026-09-29.
  *A widening that adds rows to a population must be measured against what that
  population PUBLISHES, not only against what it says.*
  **EXACTLY ONE LINEUP IS WITHDRAWN AND THE PLAN-KEYED PASS COULD NOT SEE IT.**
  Keyed on plans the ≥90% answer was **0**; the standalone `audit-dominant-row`
  said **1**. The difference is a MASTER TRUST with no `plans-all` row — **the
  fifth time a count keyed on plans was blind to a trust.**
  `20251015101938NAL0002134947003`, HALLMARK CARDS INCORPORATED MASTER TRUST US
  TIPS INDEX: `BEGINNING NET ASSET VALUE:` $125,940,081 = **92.9%**, `5% OF ASSET
  VALUE:` $6,297,004, and the trustee's own name at $3,328,262 — an OCR'd
  statement-of-changes page, **not one of the three a fund**, read by Hallmark's
  **8,492** participants through the trust link. `audit-data`'s in-pipeline count
  is plan-keyed too and stays 0 either way.
  **THE REGENERATION DELETED TWO TWINS AND THE TETHER CAUGHT IT.**
  `isCollectiveTrustName` (00:5xZ) and `isLoanAnswerRow` (01:2xZ) were
  hand-written INTO app.js's GENERATED block in their own cycles; running
  `gen-generic-twin.mjs` replaced the block and took both with it, and the smoke
  test failed on the very next change with `isLoanAnswerRow is not defined`.
  **A generator that edits a block in place deletes anything a later hand-edit
  puts inside its boundaries** — sibling of the end-marker failure this file
  already carries. Both are now VERBATIM SLICES with drift checks reaching both
  arms; the end-marker list grew by one; and **`isGenericTypeName`'s own body is
  sliced verbatim too**, it being the last hand-retyped piece in a generator whose
  whole purpose is that nothing is hand-maintained.
  **`audit-generic-names` 214 plans / 438 rows → 238 / 482 ON THE SAME STORE,
  PAST THE 230 THRESHOLD, AND THE THRESHOLD IS NOT MOVED.** v189 left that number
  to the owner and wrote that "a later run crossing 230 is a real signal"; this is
  that run. The crossing is the audit seeing more of a class that was always
  published, and raising a threshold to accommodate one's own widening is how a
  regression gets normalised. The flag text names the re-basing so the HIGH is
  self-explaining. **What it points at is the owner item already queued: a
  WHOLE-TABLE test beside the one-row test.**
  **PRE-REGISTERED against the pv-195 store it reads:** `confident` **−1 / +0**,
  ceiling −1, the single loss `20251015101938NAL0002134947003`; standalone
  `audit-dominant-row` **1 → 0** while `audit-data`'s plan-keyed count holds at
  **0** both ways; `audit-generic-names` **238 ± 3** and a `fabricated-name`
  **HIGH APPEARS, which is EXPECTED**; `overshoot` holds at **317** or falls by at
  most 1; `dl` **142**.
  Gates: import assertions 16 must-catch / 11 must-keep, parser-gate green with no
  expectation moved, `diff-lineups` over 318 corpus filings **0 in every
  direction**, fund-er-test 46/26/19/18 0 failures, smoke green. **Four negative
  controls, one per arm, each failing BY NAME on exactly the cases it reaches**
  (5, 5, 2 and 4 of 13) with all 8 must-keeps holding under every variant — and
  **the leading-noun control was DECORATIVE on its first run**, missing 0 of 10
  because my probe list held no name needing it. `docs/accuracy-log.md`
  2026-09-30 (02:2xZ).
- **SHIPPED 2026-09-30 00:1xZ, `[skip ci]` behind #511 — A TRAILING PLUS IS A
  FOOTNOTE MARKER, EXCEPT WHEN IT IS THE NAME: 861 rows / 289 lineups / 195,234
  participants**, and **5 crawlable pages / 25,999 ppl** (the top-twelve cut).
  **+0 tickers gained, −0 lost, 0 flipped** through app.js's real `lookupTicker`
  order, so it is an **HONESTY fix and not a coverage fix** — `fund-er.js`
  already matches through a trailing marker, exactly as through the leading
  stray quote. Found by the 23:5xZ draw on **Mercy Health (12,559 ppl)**, 9 of
  whose 61 otherwise-immaculate rows carry it.
  **THIS PROJECT'S OWN STANDALONE DISCRIMINATOR SAID 388 OF 388 WERE SAFE AND
  WAS WRONG.** The no-space form (`… Sep Acct+`) covers 710 further rows, and
  the test that made the 2026-09-21 issuer strip safe — *does the remainder
  appear as a COMPLETE published name elsewhere?* — answered unanimously with
  witnesses of 64, 72 and 74 rows. **False unanimity, and the mechanism is
  already on this record: "a floor of ONE lets a single damaged row LICENSE the
  same damage elsewhere, so the gate can be fed by its own mistakes."**
  **Reading the residue holds REAL plusses:** `VANGUARD EXT MKT INDX-INST+` is
  Institutional **PLUS**, a different and cheaper class than `-INST`;
  **`iShares TR 20+` is the 20+ Year Treasury Bond ETF**; `Target Date 2065+`;
  `SOFR30A+`. So the no-space arm fires only after a **POSITIVE vocabulary of
  what the plus may FOLLOW** — a vehicle noun — reaching 635 rows / 95,032 ppl
  and refusing 75. **~65 of those 75 are markers too and are LEFT AS FILED and
  named**, because no purely syntactic rule separates them from `INST+` and **a
  wrong share class is worse than a visible marker.**
  **THE ORDER OF THE ARMS IS LOAD-BEARING:** stripped AFTER the column-bar
  repair, `Vanguard Extended Market Idx | +e` ended at `… Idx |`; stripped
  FIRST it **recovers its share class as `… Idx I`.** 861 rows changed and this
  one was INSIDE them, so the count called it an improvement — a nine-string
  probe caught it, the third cycle running that reading the transformations
  found damage no count could see.
  Whole-store before/after with **BOTH modules loaded**; 9 tether cases + 9
  must-keep controls added after checking **not one of the 36 existing cases
  reaches either arm**; negative control fails by name on **exactly the 5
  must-strips** and holds all 4 must-keeps. smoke green, fund-er-test
  46/26/19/18 0 failures, every changed cell on all 5 pages read.
  `docs/accuracy-log.md` 2026-09-30 (00:1xZ).
- **SHIPPED 2026-09-30 00:5xZ, `[skip ci]`, NOT YET MIRRORED — A COLLECTIVE TRUST
  PRICED AS A MUTUAL FUND: 48 rows / 20 plans / 30,432 ppl / $691,004,818** stop
  publishing an estimated RETAIL fee on a holding whose own filed name states a
  collective-trust unit class. `noPublicPrice` read `f.cit` and the TYPE cell and
  **never the NAME**. A Trust II unit class is normally CHEAPER than the fund the
  table prices, so the number was wrong in the **flattering** direction.
  **THE QUEUED FIGURE WAS 214 AND IT IS 47 — the gap is the finding.** That
  screen matched any name ending in `Trust`. Split into arms and read: explicit
  `CIT`/`collective trust` **19 rows, all read, all real**; terminal ROMAN-numeral
  unit class **29, all 28 distinct read, all real**. **Both other arms REFUSED:**
  a bare terminal `Trust` is **201 rows dominated by `American Funds American
  High-Income Trust`, a REGISTERED MUTUAL FUND** whose own name ends in that
  word, beside genuine CITs no syntactic test separates from it; and **`Trust
  Class` is NEUBERGER BERMAN'S OWN RETAIL SHARE-CLASS NAME** (81 rows, only 6 of
  them CITs). Shipping the queued predicate would have **withdrawn the fee from
  ~230 rows of registered funds.** *A vehicle word in a fund's name is not always
  a vehicle* — the `INST+` finding an hour earlier, again.
  **THE MEASUREMENT FAILED TWICE FIRST, both on shapes this record names:** a
  **suspiciously clean ZERO**, because the harness required a TICKER before
  checking the fee and app.js prices through `fundERRow` whenever `star` is false
  — *a fee publishes with no ticker at all*; and a two-minute **sweep** where
  testing the arm first takes seconds — *a structural fact beats a sweep*.
  **167 labelled-comparable rows were REACHED AND LEFT ALONE** (counted, not
  assumed — app.js reaches this test only when `star` is false), **0 of the 48
  publish a ticker**, and `\bcit\b` is anchored terminal so **`CIT Group`, the
  lender, cannot match**.
  **AND I PUBLISHED 47 BEFORE DIFFING THE MEMBER LISTS — THE COMMIT SAYS 47 AND
  IT IS 48.** The missing row is `Voya Stable Value Fund 20 CIT` (Juneau
  Construction, 261 ppl), whose STORED name ends `CIT a`, a trailing footnote
  letter. The predicate is TERMINAL-ANCHORED, so it reads **false on the raw name
  and true on the cleaned one** — and **app.js:1214 is `f.name =
  cleanFiledName(f.nameRaw)`, so the page passes the CLEANED name and the shipped
  code was right.** My harness read the store's RAW name. ***Measure through the
  function the page calls* has a second half: WITH THE ARGUMENT THE PAGE
  PASSES.** An unanchored predicate never notices — the annuity rule reads raw or
  cleaned alike — so a terminal anchor is where it bites, and this is the first
  anchored predicate handed `f.name`. Direction is safe: understated. 15 tether cases (6 must-flag / 9 must-keep); negative
  control fails by name on exactly the 6 and holds all 9. smoke green,
  fund-er-test 46/26/19/18 0 failures. **REPORT path only, as a GUARANTEE:
  `build-seo-pages.mjs` never imports `fund-er.js`.**
  `docs/accuracy-log.md` 2026-09-30 (00:5xZ).
- **`site-test` #113 reads `conclusion: success`** on `f1ad15e5`, the exact
  mirrored commit carrying the trailing-plus fix — dispatched deliberately
  because that change shipped under `[skip ci]` and local green is not CI green.
- **THE MIRROR WAS HELD ON #512 AND THEN TAKEN.** The :23 cron was in flight ON
  MAIN at 00:32Z — the one mirror hazard that is real — so the branch waited, and
  its data commit was reconciled with the evidence first: **0 acks the branch
  lacked**, **1 newer on main** (`G & E HOCKER'S MTIA PLAN`, the documented
  analyze-stuck TRUST, **confident on both sides**, so nothing lost and the stale
  branch pv means the next incremental re-reads it), **1 confident on main only**
  (the Caterpillar withdrawal above). Gate **+4 gained / −1 lost**.
- **#513 (v195) RAN `success` AND IS VERDICTED. THE STORE TESTS PASSED EXACTLY —
  `confident` 60,106 (+0 / −0), `overshoot` 317 to the unit, `dl` 142, HIGH 4 =
  the baseline — AND THE TWO CLASS COUNTS MISSED, which found a second
  mechanism.** Rows named `included`/`Included`/`Yes` were registered 24 → 0 and
  came in at **7**; rows matching `^loan repayments? are` were registered 0 → ~21
  and came in at **19**. The registration assumed ONE mechanism for the whole
  class, so reverting the skip had to restore every one. It did not: **where the
  layout gives each fragment its OWN VALUE, `Loan Repayments are` and `included:`
  are two ROWS and no line-joining rule can reunite them.** Kentucky Rebuild
  Corporation (159 ppl) publishes `Included:` at **$210,579** AND `Repayments are`
  at **$205,396**, two rows with two figures, adjacent in a value-sorted 24-row
  menu; all seven carry `ov8`, so the column split is an OCR artefact.
  **THE OUTCOME LANDED IN FULL: all 26 rows across BOTH spellings are typed
  `Participant loans — not a menu choice`,** because the display half was built to
  answer for the restored phrase and the remnant alike. *A prediction about which
  STRING the store will hold is a different claim from a prediction about what a
  reader will see, and only the second is the point.*
  **AND THE VERDICT'S OWN RESIDUE SHIPPED IN THE SAME CYCLE (02:5xZ, `[skip ci]`):
  the answer line missing its leading `Loan` — 60 rows / 60 plans / 78,071
  participants / $9,385,509.** All 13 distinct names read, not one a fund, **0
  publishing a ticker and 0 a fee**, largest 9.1% of a menu. The `are` is
  load-bearing and its cost was measured first: a bare opening `repayments?`
  reaches a further 28 rows of the loan-DESCRIPTION family (`repayment schedules
  through August 2029 with interest rates ranging from 2.88% to`), a separate
  queued item, and both forms are pinned must-KEEPs. Tether 14 → 20, negative
  control fails by name on exactly the 4 new must-flags. REPORT path only.
  `docs/accuracy-log.md` 2026-09-30 (02:5xZ).
- **PREVIOUSLY IN FLIGHT: #513 (v195), dispatched 2026-09-30 01:1xZ on `b123f0f1`.
  IT IS A REVERT OF v194's OWN ARM, and the reason outlives it.**
  **v194's verdict recorded `loan-repayment rows 21 → 0` and PASSED. The rows did
  not go away — they stopped saying what they were.** `SKIP_ROW` is anchored `^`
  and this family **WRAPS**: `Loan Repayments are` / `included:  240,932`. So the
  arm matched the FIRST line, cleared `nameBuf` and continued, leaving the
  continuation to name the row. **23 published rows / 23 plans / 33,695
  participants went from `Loan Repayments are included:` to `included`**, and
  Northwood Investors' (2,277 ppl) to **`Yes`**; Keysight's carries **$4,160,976**.
  **THE CHECK COULD NOT HAVE CAUGHT IT, AND THAT IS THE TRANSFERABLE PART: a check
  keyed on the VOCABULARY the rule removes is guaranteed to read 0 whether the fix
  worked or destroyed the name.** Sibling of *a check must not reuse the THRESHOLD
  of the rule it checks*, and of `diff-lineups` reading the narrower
  `GENERIC_TYPE_NAME`. **What would have caught it is counting the ROWS, not the
  phrase** — and the per-plan row count was unchanged, which is exactly the blind
  spot v193's item (D) named. **v194 walked into it from the other side while
  fixing it.**
  **TWO HALVES, NEITHER OF THEM THE ARM.** v195 REVERTS it, because skipping the
  first line of a wrapped answer yields a cryptic name where the original was
  self-describing; the `lib-4i` comment now records the wrap so it cannot be
  re-added. **And the DISPLAY half is ALREADY LIVE (mirrored `e35bda25 →
  b123f0f1`)**: `isLoanAnswerRow` answers for **BOTH** the restored phrase and the
  remnant still in the store, so **a reader is served before and after the
  re-parse**. **TYPED, NOT DROPPED (v181)** — the value is the plan's loan balance,
  so it stays in the denominator and **no other row's published percentage moves**.
  **OUTCOME: 23 rows / 23 plans / 33,695 ppl / $7,070,319 typed `Participant loans
  — not a menu choice`, and 0 of them publish a fee or a ticker today** — the harm
  was the claim alone, and v194 had made it harder to recognise.
  14 tether cases (6 must-flag / 8 must-keep — `Included Value Fund` and `Yes Bank
  Ltd` OPEN with the remnant words, `Bank Loan Fund` and `Loan Repayment
  (Interest)` are not answer lines, `Participant loans` / `Loan Fund` are already
  typed by `LOAN_ROW`); negative control fails by name on exactly the 6 and holds
  all 8. Wired into `build-seo-pages.mjs` too; **`git diff --stat p/` empty**
  because every one of the 23 rows is 0.0–2.6% of its menu, below the top-twelve
  cut. parser-gate green, smoke green, fund-er-test 46/26/19/18 0 failures.
  **PRE-REGISTERED against the pv-194 store it reads:** rows named
  `included`/`Included`/`Yes` **24 → 0**; rows matching `^loan repayments? are`
  **0 → ~21** (the self-describing name RETURNS); `confident` **+0 / −0** (typed,
  never dropped, so no sum or ratio moves); `audit-dominant-row` **0**;
  `audit-generic-names` **214 ± 2**; `overshoot` holds at **317**.
  `docs/accuracy-log.md` 2026-09-30 (01:2xZ).
- **TOOLING FACT, 2026-09-30: `mcp__github__actions_list` IGNORES its
  `workflow_id`, `branch`, `event` and `status` filters** and returns the
  repository's newest runs regardless — a dispatch was verified only by widening
  `perPage` until the build-data run appeared among them. Do not read a single-row
  listing as evidence about a particular workflow.
- **NOTHING IS IN FLIGHT. #511 (v194) RAN `success` AND IS MIRRORED — 2026-09-30
  01:0xZ (`dba53e34 → 35c36a9f`), `--force` on the git check over main's one cron
  commit and `--force-data` over the single loss, both with the evidence first.
  SIX OF SEVEN PRE-REGISTERED TESTS PASSED EXACTLY:** statement-caption rows
  **7 → 0**, loan-repayment rows **21 → 0**, `audit-dominant-row` **0**,
  `audit-generic-names` **214 plans / 438 rows** against 214 ± 2; `overshoot`
  318 → **317** and `dl` **142** unchanged both passed.
  **`confident` MISSED — 60,106, net +3, where net −3 was registered — AND THE
  MISS IS IN THE SAFE DIRECTION BECAUSE TWO REGISTERED LOSSES CAME BACK AS WINS.**
  Refusing the caption region handed them to the prior-year fallback: **The
  Mcclatchy Company (3,595 ppl) is `c=1`, `fb=2023`, 37 rows at ratio 0.99** topped
  by `Vanguard Institutional Index Fund Instl Plus Shares`, so those readers go
  from a **$592,952,331 statement-of-changes phantom at 87.4%** to a real 37-row
  Vanguard menu; **Indy Connection (229)** gains 9 real T. Rowe Price rows.
  *A guard that withdraws is sometimes a guard that PROMOTES* — #481's pattern
  again, and why a prediction of "withdrawn" is about one REGION and not about the
  filing, which is what makes a NAMED SET the right registration.
  The rest behaved: **Caterpillar PN 037 (485) lost as predicted** and now shows
  its master-trust pointer at 97.5% (the one row `--force-data` covered);
  **Edgewater (697) held at 35 rows / 0.67**; **Pedulla (185) is back at 25 rows /
  0.78**, where I predicted 26.
  **TWO MISSES OF MINE, both the same shape and both queued.** Northwood Investors
  (2,277) did NOT fall under the three-row floor — it still publishes 3 rows topped
  by `at Fair Value` at 86.8%, so removing the loan caption **promoted another junk
  row into its place**, invisible to every count. And **my own arm created one**:
  dropping the line `Loan Repayments are` at Benchmark Landscape promoted its
  wrapped continuation to a holding named **`included:` at 94.6%** of a 27-row
  menu. Not reader-facing (`dx=tiny`) but it is v194's cost. **A line-level skip
  can promote the continuation of the line it skipped.**
  `docs/accuracy-log.md` 2026-09-30 (01:0xZ).
- **WHAT #511 SHIPPED (v194), for the record:** Two classes, both v193's OWN COST.
  **(1) A STATEMENT-OF-NET-ASSETS CAPTION AS A HOLDING — 7 rows / 4 plans / 5,006
  ppl / $690,053,564.** The statement-lines alternation read `beginning of
  year|end of year`, allowing **no `the` and no `period`**, so `End of the year`,
  `Beginning of the year`, `End of period` and `Beginning of period` were outside
  it BY CONSTRUCTION — **the sixth recorded time a missing entry in an anchored
  list hid a class.** Over all 1,719,942 published rows the widening reaches
  exactly 7 across 4 names and **the old spellings match ZERO of them.**
  **The Mcclatchy Company (3,595 ppl) publishes `Beginning of period` at
  $592,952,331 = 87.4%** of a 24-row menu whose second row is `Deductions Payment
  of benefits` — the statement of CHANGES, and **87.4% is under
  `audit-dominant-row`'s 90% floor**, the Tides Center / Finch Paper gap again.
  Caterpillar PN 037 stops publishing a caption table and its **master-trust
  pointer wins at 97.5%** instead; **Edgewater (697 ppl) goes 3 rows → 35.**
  **(2) AND IT EXPLAINS THE PEDULLA REGRESSION, whose queued hypothesis was
  WRONG.** Not the `three[- ]digit` arm: **the winning REGION changed.** v193
  correctly removed two junk rows from the real menu (an address-box row at
  $238,900, `@ Total non`), which moved that region's **ratio 0.805 → 0.784, AWAY
  from 1.0, and its score −0.0495 → −0.0959**; the two-row caption region,
  untouched at **−0.0628**, overtook it. **REMOVING A FABRICATED ROW LOWERS ITS
  REGION'S SCORE, so a junk-removal version can LOSE a region contest it
  previously won, and what it loses can be the real menu** — invisible to
  `losses-triage` (the lineup may survive), `swaps-degraded` (the source year does
  not change) and `rows-dropped` (the count can move either way). **A FOURTH
  BLIND SPOT, and the first one no existing check watches at all.** Reproduced
  from the stored entry's own **`fbAck`** plus production's OCR constants sliced
  out of `fetch-4i` rather than retyped. Pedulla now publishes **26 rows at 0.785
  — one better than the 27 it had.**
  **(3) `loan repayments?` joins the same alternation, also v193's cost:** its
  cost-marker weld arm restored `Loan Repayments are included:` on **20 published
  rows / 20 plans / 28,920 ppl / $7,519,157** (Keysight's is $4,160,976). All 8
  distinct published names read, not one a fund. v181's loan treatment is
  untouched — a participant-loan HOLDING never says "repayment".
  **PRE-REGISTERED against the pv-193 store the run READS:** `confident` **net
  −3 / +1**, ceiling −4 / +1, every loss inside {McClatchy 3,595, Northwood
  Investors 2,277, Caterpillar PN 037 485, Indy Connection 229} and the gain
  Pedulla 185, Edgewater staying confident at 3 → 35 rows; `audit-dominant-row`
  **0** (McClatchy's 87.4% sat UNDER the floor, so it cannot move this);
  `overshoot` **must FALL from 318**; both classes read out of the store at **0**;
  `audit-generic-names` **214 ± 2**.
- **AND THE #510 VERDICT I WROTE AN HOUR EARLIER NEEDED CORRECTING — the most
  expensive thing in the cycle.** It read *"6,154 participants gained against
  1,014 lost"*: **counted, not read.** I applied *only reading them tells the two
  apart* to the LOSSES and not to the GAINS. Reading all five: **Northwood
  Investors (2,277)** publishes `at Fair Value` $46,540,940, `Employee 401(k)
  Deferral` and a loan caption — **not one a fund**; **Anderson Regional (1,911)**
  is 94.9% a master-trust pointer welded with `Mutual and`, plus `$_saz`;
  **Leading Technology Composites (551)** is 89.3% `Value of Int in Regist Invest
  Co.`, a generic type label, plus `© General investments: a ee` at $1; **Bison
  Gear (215)** is three rows of **$1 each**. Only Novel Home Health Care's names
  are real. **So 4,954 of the 6,154 — 80% — gained a menu that is not a menu.**
  v194 withdraws Northwood on the three-row floor, reached from the other
  direction entirely. *A gain is a claim about a filing and has to be read like a
  loss.*
- **TWO HYPOTHESES OF MINE REFUTED BY THEIR OWN MEASUREMENT — recorded so they
  are not retried.** **(1) "A confident plan on negligible assets is a scaling
  defect" — NO.** 992 published lineups / **348,529 ppl** sit under the $1M floor
  `diagnose()` uses, and the largest is **Indeed Flex, 21,443 participants against
  $86,516**, which I read as impossible. Every one checked is internally
  consistent: True Care Ventures and Cottage Homecare have `assetsBOY 0` and a
  mid-year `pyb` (first-year plans), Golden Touch has $5,040 of employer
  contributions against $858,050. These are staffing and home-health plans where
  nearly every participant is **eligible and not saving**. *A
  participant-to-assets ratio is not a plausibility test, because Form 5500 counts
  eligibility.* **Do not carry 992 or 348,529 forward as a defect.**
  **(2) The "menu of pennies" residue is WIND-DOWN, not new:** 5 plans / 1,588
  ppl, and Bison Gear PN 003 reads **`assetsBOY $8,750,323 → assetsEOY $2,094`**
  (its sister plan $14,289,087 → $641). **QUEUED, small, DISPLAY-side:** the
  wind-down explanation rung gates on **exactly $0**, so a plan that collapsed to
  $2,094 escapes it and publishes three $1 rows instead. It should trigger on a
  COLLAPSE in assets, not only on zero.
- **OWNER-REPORTED AND MIRRORED 2026-09-28 18:0xZ, UNFORCED, DATA GATE
  +0 / −0 (`7f772a8 → 1f43a78`): a plan is findable by its own name.** #491
  passed its pre-registered test to the kilobyte — `plans-list.json` ships
  **36,491** plan names against 4,844, gz **2,677 → 3,069 KB**, and the
  coverage line is byte-identical (confident 60,103, HIGH 4). **Verified in a
  real browser on the regenerated file, not the patched one**: `advance auto
  parts` returns *Advance Stores Company, Inc. — Advance Auto Parts, Inc.
  401(k) Plan*, and `gapshare`, `usaa retirement` and `landmark properties`
  return theirs. 32,711 plans / 32,581,567 participants were unfindable by
  their own brand phrase.
- **OWNER-REPORTED, SIZED, NOT SHIPPED — THE FUND LOOKUP EXISTS AND WAS NEVER
  CONNECTED.** The owner sent Landmark Properties Real Estate Partners (1,067
  ppl) where **24 of 29 rows / 86.1% of the menu carry no ticker**, and asked
  why a web search names `Fidelity Frdm Idx 2015 Ins Pre` in one click. Answer:
  **nothing in wampo has ever looked a fund up** — `fund-er.js` is a hand
  table with no Freedom Index entry at all. But `scripts/fetch-sec-funds.mjs`,
  `match-sec-tickers.mjs` and four more scripts have existed since 2026-08-23,
  all defaulting to `sec-funds.json` at repo root, **and it had never been
  fetched — no `sec-scratch` branch existed.** Dispatched `sec-funds.yml
  mode=build`: **29,406 share classes / 12,328 series** from SEC's own
  `investment-company-series-class-2026.csv`, now committed at root with its
  source URL. It holds the owner's fund as `Institutional Premium Class`
  **FIWFX**.
  **Worth, as an OUTCOME through the shipped path, counted only where the
  FILING types the row a registered mutual fund: 293,704 rows / 37,887 plans /
  55,391,441 participants / $561.5B** newly named (147,042 exact, 146,662 an
  ambiguous class behind the asterisk), against 663,283 / 70.4M / $1.50T
  unnamed today.
  **NOT SHIPPED on a MEASURED error rate:** a random 30 found **one clear false
  positive** — `BlackRock High Yield Portfolio K Fund` → **CPHYX**, a Class A
  of a series registered as bare `High Yield Fund`, because the manager gate
  was satisfied by an issuer column reading `Principal Trust Company`. **The
  issuer column often holds a TRUSTEE, not the house**, already on this record
  from the 2026-09-16 issuer-prefix work. Queued in three pieces, smallest
  claim first: (1) **24,324 names / 129,411 rows** that resolve EXACTLY from
  the filed name alone; (2) the trustee-vs-house guard; (3) the recordkeeper
  abbreviations (`frdm`, `ins pre`, `lc gr`, `sht drtn inc`, `inf-pr`).
  **The ambiguous half must not carry a FEE** — `fund-er.js` prices a ticker,
  and a Class A number on an R-6 holding is the claim 10,387 fee cells were
  withdrawn for this morning.
  **THIRTEENTH INSTANCE OF A MEASUREMENT REPORTING ON THE HARNESS:** my first
  read of the same 30 flagged FOUR manager-less matches and three were correct
  — the print showed the FILED name while the ISSUER-PREFIXED string had done
  the resolving, so `Carillon Reams Core Plus BD R6` read as naming no manager.
  **A draw is only as honest as the string it prints.**
  `docs/accuracy-log.md` 2026-09-28 (18:0xZ).
- **AND PIECE (2) IS DONE — MIRRORED 2026-09-28 18:4xZ, UNFORCED, DATA GATE
  +0 / −0 (`135bc92 → 01ebe0d`). Still reaches NO reader**, because
  `match-sec-tickers.mjs` is wired into neither display path; it is what makes
  the index safe to wire. **A share class never interrupts a fund name**, so
  `Vanguard Institutional Target Retirement 2070` no longer publishes VSVNX —
  the retail series — **as fact**; a leftover word between two series tokens is
  excused only when a class of that series NAMES it (the index's own evidence,
  which is what keeps `Fidelity Advisor Mid Cap Value Fund Class Z`).
  **`hintsOf` reads EVERY class word**, so `Principal Real Estate Securities
  Instl R6` stops asserting the Institutional ticker for an R-6 holding — and
  it cuts upward too, `Alger … Institutional Fund Class I` moving from
  ambiguous to **ALARX asserted**. **A footnote marker in brackets is not a
  share class** (`… R5 Class (i)` keeps DDFIX).
  **THE GUARD WAS RESTRICTED AFTER MEASURING ITS COST:** over every
  `CLASS_MARK` word it withdrew 1,523 names / 4,828 rows; over the
  institutional family alone it withdraws **791 / 3,639, of which 711 names /
  3,504 rows are the Vanguard Institutional family itself**. The 732 it stopped
  withdrawing are ordinary fund names — `Fidelity Select Natural Resources`,
  `Fidelity Adv Total Bond Z`. Whole-store: **278,025 of 278,994 pairs
  unchanged**, 44 demoted to the asterisk, 134 re-tickered.
  **FOURTEENTH HARNESS INSTANCE: a 44-character truncation** made eighteen
  demotions print identically and resolve unchanged when retyped — the stored
  names are `… Investor Class K` and `… Investor Class (i)`, two causes, one of
  them mine. **A truncated print is a different string.**
  **`node scripts/match-sec-tickers.mjs --selftest` — 23 pinned cases,
  must-change and must-keep in one table, 23/23; the pre-change matcher fails
  by name on 9 and holds 14.** Residual pinned, not fixed: `premier` sits in
  the `institutional` arm of `CLASS_HINTS`, so `Royce Premier Fund` has a class
  asserted its filing never stated. `docs/accuracy-log.md` 2026-09-28 (18:3xZ).
- **AND PIECE (3) — MIRRORED 2026-09-28 19:5xZ, UNFORCED, DATA GATE +0 / −0.
  Still reaches NO reader.** Two defects, both "a DIFFERENT fund", both closed.
  **(1) The ISSUER cell supplied a manager and licensed the issuer's own fund**
  — `BlackRock High Yield Portfolio K Fund` [iss `Principal Trust Company`] →
  **CPHYX**; `Columbia Small Cap Value` [iss Empower] → **Empower**'s;
  `Invesco Core Bond r6` [iss Vanguard] → **Vanguard**'s; `Janus Balanced` [iss
  Fidelity] → **Fidelity**'s. `resolveHolding(idx, name, issuer)` is now the
  one shared call rule: **the issuer may ADD a manager and never REPLACE one.**
  **(2) FOUND BY (1) AND INDEPENDENT OF IT — the same junk vocabulary let the
  superset pass DROP A DISCRIMINATOR, with no issuer involved:** `Vanguard
  SmallCap Value Index Fund` published **Vanguard Value Index** (large cap),
  `Vanguard Smallcap Index Institutional` published **VINIX, an S&P 500 fund**,
  `Vanguard Short-Term Inflation-Protected` published the **intermediate** TIPS
  fund, `Fidelity Growth Strategy` published **Fidelity Growth Company**. An
  asset word can no longer be excused as a house word.
  **THE OBVIOUS TEST WAS WRONG AND THE MEASUREMENT CAUGHT IT FIRST:** asking
  *does the filed name name a manager* cost **1,758 names / 3,330 rows of
  CORRECT answers**, because `MANAGERS` holds `emerging`, `selected`, `world`
  and `mutual fund`. **A COUNT THRESHOLD CANNOT RESCUE IT — `emerging` carries
  18 series and `mutual fund` 44 against `blackrock` 39 and `american funds`
  49.** Whole-store: **278,775 of 278,994 pairs unchanged**, 211 names / 269
  rows withdrawn, **8 rows GAINED**, 248,660 participant-weighted touched.
  **COST NAMED: 28 rows / 48,265 ppl-weighted are the TIAA-CREF → Nuveen
  RENAME** — accepted because that answer was also asserting the wrong share
  class (filed `Inst`, returned `Premier`) and nothing distinguishes a rename
  from the BlackRock case.
  **FIFTEENTH HARNESS INSTANCE: I judged ~26 withdrawals to be correct answers
  being destroyed, reading the list by filed name and old ticker. Printing the
  old answer's SERIES showed every one was a different fund.** A ticker is not
  a reading; the series name is.
  **`--selftest` is now 45 cases in two tables** (32 on `resolve`, 13 on
  `resolveHolding`), 45/45; the pre-change file fails by name on 5 of the 32
  and the old caller pattern fails on the BlackRock row.
  `docs/accuracy-log.md` 2026-09-28 (19:4xZ).
- **#496 (v190) RAN `success` AND THE VERDICT CORRECTS MY OWN HEADLINE.** Store
  complete: pv 190 at 99.81%. **PASSED exactly: `audit-generic-names` 212 → 213**
  (the number was measured, not estimated) and **`audit-dominant-row` 0**.
  **DID NOT LAND: `confident` −5.** It is 60,103, unchanged — and the cause is
  my PREMISE, not the guard: the five named plans read **`c=0`, `pv=190`, no
  `fb`**, so the guard fired and they were **already non-confident at v189**.
  **THE CLASS SIZE I PUBLISHED WAS A STORED-ENTRY COUNT.** "58 rows / 53 plans /
  1,528,497 ppl / $67.8B" gated on `funds.length >= 3` and **never on `c`**.
  Published-only: **16 plans / 392,657 ppl → 15 / 390,005**. Overstated ~3.9x on
  people. **A stored lineup entry is not a published one** — size a reader-facing
  class through the PUBLICATION gate. Eighteenth harness instance, the first
  caused by a missing JOIN rather than a bad predicate.
  **What reached readers is the DISPLAY half:** FedEx's row is 2.7% of its menu,
  never a withdrawal candidate, and what v190 gives those 177,265 readers is the
  row TYPED as naming no fund. One plan left the class — Akin Gump (2,652 ppl),
  9 rows → 5, still confident — and **the merge's own `rows-dropped` check caught
  it unprompted** (`warn` 608 → 609). `dl` 129 → 131.
  `docs/accuracy-log.md` 2026-09-29 (00:2xZ).
- **NOTHING IS IN FLIGHT. #501 (v192) RAN `success`** (data commit `cfd7e89`)
  and **passed all three pre-registered tests exactly**: `audit-generic-names`
  **217 → 217 plans, rows 439 → 441** — predicted to the row —
  `audit-dominant-row` **0**, `confident` **+0 / −0**, HIGH 4 = the baseline,
  coverage line otherwise byte-identical to #500's.
  **MIRRORED 2026-09-29 06:3xZ (`f92f178 → cfd7e89`), UNFORCED ON BOTH CHECKS**,
  data gate +0 / −0, pv 192 at 99.8%.
  **THE PREDICTION-METHOD CORRECTION IS CONFIRMED BY THIS RUN:** #500's figure
  was computed against the store the run REPLACES and missed by 2; v192's was
  computed against the store it would actually RUN on and landed exactly, on
  both the plan count and the row count. *State a store-dependent prediction
  against the store the run will read.*
- **MIRRORED 2026-09-29 12:5xZ (`ceaad14a → c755a7c2`), UNFORCED ON BOTH
  CHECKS**, data gate +0 / −0. **AN INVESTMENT CONTRACT IS NO LONGER TYPED
  `Mutual fund`: 263 rows / 260 plans / $1,698,096,097**, and **89 rows / 89
  plans / 104,327 ppl / $261,037,800 stop publishing a fabricated fee — all 89
  at 0.35%**, the generic guarantee fallback. v192's shape one legal noun
  along: the NAME is faithful and the TYPE is the claim, so no name-based guard
  could ever have seen it. Report path only (`git diff --stat p/` empty over
  all 5,000 pages, verified independently after regenerating).
  **`insurance contract` SHIPPED WITH `investment contract` AS ONE RULE** — all
  47 distinct insurance-contract names read, not one a registered fund —
  because shipping only the phrase the item was filed under is v131's recorded
  mistake. **The bare word `contract` was REFUSED on measurement:** 117 further
  rows, all 103 distinct names read, overwhelmingly REAL FUNDS wearing a
  caption (`at contract value Fidelity 500 Index`, `Contract MFS Value R6`) —
  `contract value` is a measurement basis, not a vehicle.
  **THE ESCAPE HATCH IS ON THE EVIDENCE:** 5 rows say `investment contract` AND
  name a fund (DODIX 0.41%, RERGX 0.46%), where the contract words are a
  caption our parse welded on and the `Mutual fund` type is TRUE. The
  discriminator is the sibling rule's structure asked of IDENTITY rather than
  price — strip the designation, ask whether anything identifiable is left.
  **MY INDEPENDENT REPLICATION MATCHED THE FEE TO THE DOLLAR AND THE
  PARTICIPANTS TO THE PERSON (89 / 89 / 104,327 / $261,037,800; 386,175) AND
  CAME UP ONE ROW AND $568,463,522 SHORT — AND THE MISSING ROW IS THE
  FINDING.** It is `Guranteed Investment Contracts` (the filer's typo) at
  **$568,463,522 in THE PERMANENTE MEDICAL GROUP, INC. MASTER TRUST**, which
  has **no row in `plans-all`**, so my plan-keyed scan dropped it and the
  agent's did not. The agent's number was right and mine was short.
  **BUT A TRUST ROW CARRIES NO PARTICIPANTS OF ITS OWN AND STILL REACHES
  READERS THROUGH ITS MEMBER PLANS: 2 Permanente plans / 30,108 participants /
  $10.09B**, none of them inside the 386,175. **True reader reach is 416,283,
  not 386,175 — the headline understated it by 7.8%.** *A participant count
  keyed on plans is blind to every master-trust row; size a trust-held class
  through the trust's MEMBERS.* The dollar gap reconciled exactly
  ($1,129,632,575 + $568,463,522), which is what made the one-row difference
  findable — **"close" is not a verification; diff the member lists.**
  **A HARNESS ERROR OF MINE EN ROUTE:** I wrote `namesAFund` with a
  `/[A-Za-z]{3}/` precondition app.js does not have. It changed nothing here,
  but app.js:959 is `fundER(n) != null || !!fundTickerInfo(n)` and the rule is
  to transcribe, not approximate.
  `docs/accuracy-log.md` 2026-09-29 (12:4xZ).
- **MIRRORED 2026-09-29 12:1xZ (`f567c558 → ceaad14a`), UNFORCED ON BOTH
  CHECKS**, data gate +0 / −0, pv 192 at 99.8%. **#507 ran `success`** and its
  coverage line is byte-identical to #505's and #506's — confident 60,103, HIGH
  **4 = the baseline**, WARN 608, dl 131 — which is the pre-registered outcome
  for an incremental carrying a DISPLAY-only change whose whole work list is
  the dead 403s, not a stall.
- **MIRRORED 2026-09-29 17:0xZ (`f153382b → ecd2572f`) — A TARGET-DATE FUND WAS
  WEARING THE EMPLOYER'S TICKER: 184 rows / 62 plans / 355,635 participants /
  $10,909,455,123.** `stockRow` does not merely suppress — **`app.js:2153` is
  `const tk = stockRow ? (plan.ticker || null) : …`, so it PUBLISHES the
  SPONSOR'S own stock symbol.** Duke Energy's 35,803 participants saw sixteen
  pooled funds — nine target-date vintages, three index funds, four blend funds,
  **$5,575,809,000 = 50.1% of the menu** — each tagged **DUK**. A wrong SYMBOL,
  not a wrong label, which makes it materially worse than the queue entry it was
  filed under (79 rows / 14 plans / 111,072 ppl — *a class size travels with the
  predicate that produced it*).
  **CAUSE READ IN THE FILING:** Duke's 4i prints under the filer's own headings
  `Common Stock Funds` / `Institutional Funds` / `Commingled Funds`, and
  `lib-4i` adopts a heading only when the heading itself classifies —
  `Institutional Funds` names no vehicle, so `Common Stock Funds` stayed in
  force over the whole block. **A section heading that names no known vehicle
  does not reset the type.** Parser-side, recorded for a bump; the display half
  shipped because the evidence to withdraw the claim is in the stored name+type.
  **MY INDEPENDENT REPLICATION MATCHED EVERY HEADLINE EXACTLY** — 184 rows,
  $10,909,455,123, 167 distinct names, 27 symbols withdrawn, 6 corrected
  (HRB → VEXAX, CNX → VSMAX), 46 tickers gained, **102 ERs gained**, 9 fees
  REFUSED as guarantee-only (which would have recreated the 0.35% withdrawn
  from 89 rows the same morning), 0 rows flagged that were not stock rows.
  **AND ONE NUMBER WAS SHORT: 62 plans / 355,635 ppl, not 61 / 353,959.** The
  two flagged master trusts reach **FIVE** member plans, not three — and the
  missed one is **`Willis Towers Watson Us, Llc` (1,676), which differs from
  `Willis Towers Watson Us Llc` (25,967) BY A SINGLE COMMA.** Second time this
  record has lost a plan to sponsor-name punctuation (cf. Alpha Source,
  2026-09-27). Overlap checked, not assumed: 0 of the 5 is also directly
  flagged, so the union is a plain sum. Direction is the safe one.
  Gates re-run on the merged tree: parser-gate green, smoke-test green, **`git
  diff --stat p/` empty** over all 5,000 pages (REPORT path only); `site-test`
  #110 `success` on `5ce3599c`, and the follow-up `ecd2572f` verified
  **comment-only** so that green covers every executable line shipped.
  `docs/accuracy-log.md` 2026-09-29 (15:5xZ, 17:0xZ).
- **CLOSED 2026-09-30, re-sized at pv 196 — THE FORM 5500 COVER PAGE AS A FUND
  MENU IS 0 ROWS.** Queued at 41 rows / 31 plans / 165,425 ppl (PNC Financial
  79,485, Eastman Chemical 15,910, NBCUniversal 11,612); **v193's (A) and (D)
  arms closed it whole** and this bullet was never retired.
- **#508 (cron, on MAIN) RAN `success`** (data `8522c450`): coverage line
  **byte-identical** — confident 60,103, HIGH **4 = the baseline**, WARN 608,
  overshoot 326, dl 131, pv 192 at 99.8%. Correct for a scheduled incremental
  whose work list is the dead 403s. **The store did not move under the running
  agent and that was VERIFIED, not assumed: plans array byte-identical, 0 of
  68,767 status entries changed, `data/lineups/**` untouched** — only
  `generated` differs. Branch, main and local level at `8522c450`.
- **#510 (v193) RAN `success` AND IS MIRRORED — 2026-09-29 23:2xZ
  (`f6a15f14 → f58d1d89`), `--force-data` over five losses, every one read and
  diagnosed first. FOUR fabricated-row classes, 385 published lineups / 693,409
  participants.**
  **THE NET TEST PASSED AND THE NAMED CONDITION DID NOT, and the second matters
  more.** `confident` **+5 / −5, net 0** against a ceiling of ±5 — but the
  pre-registration said any loss would be "a lineup of fewer than five rows" and
  **two were not**: Pedulla Excavating **27 rows → 0** and Benchmark Landscape
  **26 → 27** (losing confidence while GAINING a row). *A ±5 ceiling met by five
  losses and five gains is not the same fact as five SMALL losses, and only
  reading them tells the two apart.* `audit-dominant-row` **0** PASSED,
  `overshoot` **326 → 318** PASSED, `audit-generic-names` **214 against the 217
  registered** — missed by 3, direction good.
  **6,154 participants GAINED against 1,014 lost** (Novel Home Health Care
  0 → 14 rows, Anderson Regional 4 → 10), and four of the five losses are guards
  working. **Two queued from the verdict:** Pedulla is a REAL regression with a
  hypothesis and not a cause (`no-section`/`noattach` on an OCR'd 2023 fallback,
  `ov` unchanged, so a v193 arm plausibly removed a SEEDING line — *instrument
  before believing it*), and v193 ADDED a junk row at Benchmark,
  `Loan Repayments are included:` at $240,932, first by value in a menu whose
  next row is $7,318 — a loan caption restored by the (C) weld arm.
  (A) the Form 5500 COVER PAGE as a fund menu 58 rows / 36 lineups / 168,079 ppl;
  (B) Schedule H line 4a's DELINQUENT-CONTRIBUTIONS grid 120 / 111 / 166,688;
  (C) the party-in-interest marker WELDING two real holdings 58 / 46 / 95,833
  (William Beaumont Hospital's 49,582 see `BlackRock Global Allocation Fund * 8
  Delaware VIP Diversified Income Fund`); (D) **found by measuring (A) and the
  largest — 193 rows / 193 lineups / 263,209 ppl**: the cover prints the address
  box beside the NAICS box, so `541370` reads as a $541,370 holding, up to 42.1%
  of a menu. **(D) surfaced only because removing the DocuSign row promoted this
  line in its place — one junk row swapped for another, row count unchanged,
  invisible to every count.**
  **EVERY CLASS RE-SIZED AT pv 192 BEFORE ANYTHING WAS WRITTEN and three of the
  four moved** (A was queued at 41/31/165,425, B at 98/96/157,098) — *a class
  size travels with the predicate that produced it.*
  **(C)'s QUEUE PREDICATE WAS WRONG, NOT MERELY STALE:** "anything, a marker,
  anything" returns **247 rows / 172,909 ppl**, dominated by two OTHER shapes (a
  leading row number, and the issuer welded on with no figure between). **Do not
  carry 247 or 172,909 forward.** The discriminator is the FIGURE between marker
  and second name — `**` sits in column (d) Cost, so what follows is the (e)
  Current Value, and a 1–2 digit value fails `valueRe`'s 3-character floor.
  **PRE-REGISTERED against the pv-192 store the run reads**, with the harness
  first shown to reproduce the shipped figures: `confident` **+0 / −0** (ceiling
  ±5, any loss a lineup under five rows); `audit-generic-names` **217 → 217**;
  `audit-dominant-row` **0**; HIGH **4 = the baseline**; `overshoot` falls or
  holds; VFCP / cover / docusign rows → **0** while `DOCUSIGN INC` holds at 1 row
  / $162,450.
  **THE MIRROR WAS HELD UNTIL THE VERDICT ON PURPOSE, and the reason was
  narrower than the old rule:** code ahead of the store is safe by
  `SCHEDULE_INCREMENTAL` and #510 was on the DEV branch, so neither hazard
  applied — but v193 is a PURE PARSER change with **no display half**, so
  mirroring it early would have delivered nothing to a reader and only put
  unverified parser code on main. Held, verdicted, then mirrored in the same
  cycle.
  **TWO GATE EXPECTATIONS MOVED AND BOTH RECONCILE TO THE DOLLAR** (checked
  independently, because updating a gate expectation is how a regression gets
  normalised): Physician's Computer 32 → 31 rows, sum down **exactly $124,842**,
  its own line 4a row; Costco **menu rows unchanged at 35** with the securities
  flood up $480,000. Both are gains in correctness.
  **COST NAMED PLAN BY PLAN, ~1,900 ppl against 693,409:** Vortex Companies (830)
  is the one clear degradation, bisected to the single phrase `three[- ]digit`;
  three swap BETTER (Republic National Distributing's 15,199 gain real names for
  `IMDIZX`). **`swaps-degraded` and `rows-dropped` see none of these** — the
  known third blind spot.
  **THE AGENT'S OWN HARNESS ERROR, recorded because the shape recurs:** its first
  pre-registration printed `confident LOST 44`, naming JPMorgan Chase and CVS.
  Entirely the harness — it compared the STORED entry against a fresh local
  `pdftotext` parse, and those acks carry `ov=8`/`fb`, so their stored entries
  come from the production path. *The only honest delta is base-parse vs
  work-parse on the same text.*
- **#509 (cron, on MAIN) RAN `success`** (data `f6a15f14`): coverage line
  **byte-identical** — confident 60,103, HIGH **4 = the baseline**, WARN 608,
  overshoot 326, dl 131, pv 192 at 99.8%. Correct for a scheduled incremental
  whose work list is the dead 403s.
  **IT MOVED BOTH REFS AND THAT IS BY DESIGN, verified in the workflow rather
  than assumed:** `build-data.yml`'s `Keep the dev branch level with main` step
  runs only on scheduled runs and only when the dev branch is a strict ANCESTOR
  of main, making the sync a pure fast-forward. It exists because scheduled
  commits used to strand main ahead until a session noticed — two days of that
  on 2026-09-05/06. **The CLAUDE.md automation section still describes the
  hand-reconcile as the only route; the runner now does the safe half itself.**
- **MIRRORED 2026-09-29 19:4xZ (`187152c1 → ae96a25a`), UNFORCED ON BOTH
  CHECKS**, data gate +0 / −0. **THE FEE LOOKUP NEVER SAW THE ISSUER COLUMN, AND
  NOW DOES: 59,521 rows / 8,483 plans + 3 trusts (4 members) / 12,404,738
  participants / $171,674,834,061 gain an expense ratio that was BLANK.** The
  largest reader-facing coverage item on the queue, closed. `lookupTicker` has
  prepended the 4i IDENTITY cell since v67; the fee asked `fundERFiled(f.name)`,
  the cleaned name ALONE — so a row whose house lives only in the identity
  column (the normal shape since v126) resolved a ticker and published a blank
  fee beside it. **Strictly additive BY CONSTRUCTION**: the issuer arm runs only
  after the bare name returns null.
  **THE GATE IS THE WORK and it REUSES `resolveHolding`'s shipped rule** — *the
  issuer may ADD a manager and never REPLACE one* — in three parts: the issuer
  contributes a firm and NOT its corporate form (a trustee's `… TRUST Company`
  was satisfying a pattern's VEHICLE condition and publishing the collective-
  trust price); the issuer must not supply the answer BY ITSELF (kills three of
  the four recorded false positives, each `fund-er.js`'s bare house arm firing
  on issuer text, and closes a route that would have manufactured the exact
  0.35% withdrawn from 89 rows this morning); and past a leading share-class
  designation the fund's own first word must be LOAD-BEARING.
  **NO HOUSE VOCABULARY SHIPS** — one was built to READ the residue with and its
  most frequent hit is `{Vanguard} Wellington Admiral Fund`, a real Vanguard
  fund carrying its SUB-ADVISER. *A house list is wrong in the unsafe
  direction.*
  **MY INDEPENDENT REPLICATION MATCHED EVERY SAFETY-CRITICAL FIGURE EXACTLY** —
  59,521 rows, **$171,674,834,061 to the dollar**, CHANGED 0, LOST 1, and **0
  gains at 0.35**.
  **MY FIRST HARNESS COULD NOT HAVE SEEN THE LOSS:** it loaded the NEW
  `fund-er.js` for BOTH sides, so the one non-additive part — the `AF_LOAD_CLASS`
  widening, which edits `fundER` itself — was invisible to the comparison meant
  to police it. *A before/after harness is only as honest as its "before".*
  Tested exactly instead, and that needed no sweep: over all **392,610 distinct
  published names exactly ONE** resolves differently (`AMERICAN BALANCED FUND
  A-CLASS` 0.28 → null, one row, Pediatric Academic Association, 555 ppl).
  `AMERICA-CLASS` stays unmatched; R-6 names keep their fee.
  **ONE NUMBER SHORT, THE FAMILIAR ONE: 12,404,738 ppl, not 12,398,051** — three
  flagged rows sit in MASTER TRUSTS, which have no `plans-all` row. **Third time
  on this record.** Direction is the safe one.
  **AND THE SURFACE CLAIM IS STRONGER THAN THE ONE MADE FOR IT:**
  `build-seo-pages.mjs` **never imports `fund-er.js`**, so the crawlable pages
  cannot render a per-fund ER under any input. *An empty `p/` diff is an
  observation; an absent import is a guarantee.*
  **A STALE MEASURED NUMBER IN A SHIPPED COMMENT, corrected:** app.js read
  "59,526 gained, 0 lost" — the figure from before the A-CLASS arm existed.
  *A measured number in a comment has to be the number that shipped.*
  parser-gate green (frozen tether 7/7), smoke-test green, fund-er-test
  46/26/12/11 0 failures. `docs/accuracy-log.md` 2026-09-29 (19:3xZ).
- **QUEUED, SIZED, NOT SHIPPED — A COLLECTIVE TRUST PRICED AS A MUTUAL FUND:
  396 rows / 129 plans + 4 trusts (9 members) / 653,154 ppl / $6,947,802,798.**
  Found by the 19:0x draw (seed 20260929191) on **American Woodmark (7,727
  ppl)**, whose menu is otherwise immaculate: eleven `Vanguard Target Retirement
  … Trust II` rows, ten typed `Collective trust` and priced at nothing, and
  **one — type cell BLANK — publishing 0.045**. Same holding, same filed name,
  priced on one row and not the other ten.
  **`noPublicPrice` reads the TYPE cell and never the NAME**, so a row whose own
  filed name states a collective-trust unit class escapes it whenever the type
  is blank (257) or wrongly says `Mutual fund` (132).
  **THE COUNT THAT MATTERS IS SMALLER AND THE SPLIT IS THE FINDING: 182 of the
  396 publish a LABELLED comparable** (the 2026-09-21 demotion working as
  designed) and only **214 publish an UNLABELLED retail fee**. A Trust II unit
  class is normally CHEAPER than the retail fund the ticker names, so the number
  is wrong in the direction that flatters.
  **8 OF THE 328 DISTINCT NAMES ARE FALSE POSITIVES OF MY OWN SCREEN, read and
  named:** `MFS Series Trust II - MFS Growth Fund`, `JPMorgan Trust II - …`,
  `Funds Series Trust I - Columbia Contrarian Core` — **a registrant's series
  trust is not a collective-trust unit class.** Reader-facing class is ~205 rows,
  not 396. *A vehicle word in a fund's name is not always a vehicle.*
  **The control says the site already knows this: 28,950 rows /
  $318,059,621,621** carry the same name shape WITH a collective-trust type and
  are correctly unpriced. The rule is right and is asked of the wrong cell.
  Display-side, on the annuity/investment-contract pattern; the labelled-
  comparable half must be left alone.
- **QUEUED, SIZED, SAFE, NOT SHIPPED — A TRUNCATED WORD IS NOT A SURVIVING FUND
  NAME: 13 rows / 13 plans / 70,205 participants / $39,532,590.** Found by the
  17:0x draw (seed 20260929170) on **Aimbridge Parent (53,606 ppl)**, whose
  25-row menu is otherwise immaculate and publishes `with varying maturity dates
  through August 2034, bearing interest at 4.25% to 9.50% per an` at $6,206,114.
  **The guard exists and its RESIDUE TEST is what lets these through:**
  `isLoanDescriptionRow` requires `loanDescriptionResidue(s).length === 0`, and
  that condition is load-bearing — it is what keeps Griswold's pinned Principal
  GIC. **The residue is not a name; it is a loan word cut mid-token by the
  column width.** All thirteen distinct residues read: `mat` `thr` `dat` `matu`
  `Bear` `balan` `partic` `Ap` `Col` `bear` `par` `matur` `rangi` — each a word
  the guard already strips, arriving one truncation short of the regex that
  would have removed it. Discriminator: **a surviving token that is a proper
  PREFIX of a stripped word is that word, cut short.** Largest is Hyatt
  Corporation (44,487 ppl, $27,202,834 typed `Collective trust`).
  **THE OBVIOUS WIDER RULE WAS MEASURED AND REFUSED, AND THAT IS THE MORE
  VALUABLE HALF.** This record's investment-contract rule — *strip the
  designation, ask whether anything IDENTIFIABLE is left* — withdraws **146 rows
  / 223,746 ppl** and is WRONG, because **`namesAFund` cannot see a wrap
  contract, by design, exactly as `fundTickerInfo` cannot name a CIT.** It would
  have destroyed six genuine synthetic-GIC wrap contracts in a master trust
  reaching 16,245 ppl — JP Morgan Chase / Prudential / Transamerica / Nationwide
  / American General / State Street Global Wrap, **$220,384,728 of real assets**
  — plus `MetLife, Contract #1071020`. *A predicate that is right for one class
  is not thereby right for its neighbour.*
  **AND THE FIRST SCREEN WAS A HARNESS ARTEFACT WHOSE SIZE WAS THE TELL:** a
  broad `\bloans?\b` arm returned **2,174 rows / 6,090,255 ppl / $3.34B**,
  dominated by REAL securities — `Freddie Mac Whole Loan Securities Trust`
  (299,277 ppl), `VOLKSWAGEN AUTO LOAN ENHANCED TRUST`, `FEDERAL HOME LOAN BANK
  OF BOSTON`. **Do not carry 2,174 or 6,090,255 forward.**
  **SURFACE: the REPORT only** — 0 of 5,062 committed pages carry these strings,
  and Hyatt/Churchill Downs/North Memorial all HAVE pages, so the rows sit below
  the top-twelve cut. Risks pinned not rounded away: `bear` could be `Bear
  Stearns` and `Col` `Columbia`; in this store neither is, and the rule is asked
  only of rows already matching the loan-RANGE regex.
  **Two further defects separated out, not to be folded back into one count:**
  a REAL CONTRACT WEARING A LOAN CAPTION (8 rows / ~56,566 ppl / $272M, the
  Global Wrap + MetLife + Cooper Health `Fidelity Management Trust Company`
  family) and OCR-SPLIT LOAN WORDS (North Memorial, 8,260 ppl, `Notes recei va
  bl e with interes t`). `docs/accuracy-log.md` 2026-09-29 (17:1xZ).
- **OWNER'S CALL, SIZED, NOT SHIPPED — THE TICKER COLUMN REFUSES TO ASSERT R-6
  AND THE FEE COLUMN ASSERTS IT: 36,252 rows / 8,609 plans / 10,482,854
  participants / $60,701,413,608.** Found by the 16:1x draw on **DoorDash
  (10,627 ppl)**, whose menu is otherwise immaculate — every Vanguard row has an
  exact SEC ticker — while **13 American Funds rows at $217,616,136 = 52.2% of
  the menu publish 0.32% and not one states a share class.**
  **READ THE SHIPPED GUARD FIRST:** `fund-er.js`'s 2026-09-28 rule is
  `AF_HOUSE && AF_LOAD_CLASS && !AF_NOLOAD_CLASS` — it withdraws only where the
  name states a class that PAYS a 12b-1 fee (R-1–R-4, A, C, F-1). R-5/R-6/F-2
  correctly KEEP the number (62,003 rows / 20,682,855 ppl, not at issue). **A
  name stating NO class was never considered and keeps it too.**
  **Not a rounding slice: in 1,879 plans / 1,507,297 ppl those no-class rows are
  ≥25% of the menu's VALUE** — HonorHealth 76.2%, TA Operating 68.6%,
  Knight-Swift 67.2%, Barrett Business Services 65.8%, Edward D. Jones 32.8% of
  54,690 ppl.
  **THE FINDING IS AN INCONSISTENCY BETWEEN TWO COLUMNS, not a broken guard.**
  This record already rules on the identical fact in the TICKER column — *"19,618
  rows state none and must stay blank; assigning R6 there recreates this
  record's own defect verbatim"* — so the site **applies opposite standards to
  the same missing fact.** Both cannot be right.
  **THE COUNTER-ARGUMENT IS REAL:** such a holding usually IS R-6, the cell is
  labelled "est.", and withdrawing costs 10.5M participants a fee cell — far
  larger than the 10,387 the 2026-09-28 guard removed. Against it: *a fee is
  SOURCED, never derived*, and the ticker column already refuses the inference.
  **A session must not ship a 10.5M-participant withdrawal unasked, and must not
  leave the two columns disagreeing unrecorded either.**
  `docs/accuracy-log.md` 2026-09-29 (16:2xZ).
- **QUEUED AND IT IS THE LARGEST READER-FACING COVERAGE ITEM CURRENTLY OPEN —
  THE TICKER LOOKUP GETS THE ISSUER PREFIX AND THE FEE LOOKUP NEVER HAS.**
  `lookupTicker` prepends the row's ISSUER on every attempt; the fee is
  `fundERFiled(f.name)` — **the cleaned name ALONE**. So a row whose house
  lives only in the identity column (the normal shape since v126 promoted
  issuer headers) resolves a ticker and publishes a BLANK fee. One argument.
  **FOUND BY AN ASYMMETRY ON THE PAGE, not by any count:** the 14:0x draw's
  TruGreen (14,396 ppl) publishes **17 tickers of 24 rows and 3 fees**;
  Cardinal Services publishes **12 tickers and ZERO fees**, all twelve clean
  Vanguard target-date funds. `Retirement 2030 Active Fund` [iss `T. Rowe
  Price`] renders TRRCX beside an empty fee cell.
  **SIZED WHOLE-STORE through app.js's FULL `er` expression** (every
  suppressor transcribed, so this is what a reader would actually gain):
  **WOULD GAIN A FEE — 80,955 rows / 12,197 plans / 17,888,184 participants /
  $209,357,139,112**; **WOULD CHANGE AN EXISTING FEE — 42,883 rows / 9,105
  plans / 12,895,467 ppl**, and on the samples read the prefixed answer is MORE
  correct (`{Fidelity} 500 Index Fund` 0.03 → **0.015**, `{Vanguard} Federal
  Money Market` 0.2 → **0.11**).
  **NOT A ONE-LINE CHANGE, and the reason is already on this record:** the
  issuer often holds a TRUSTEE or a RECORDKEEPING PLATFORM, so prefixing it
  prices a competitor's fund at this platform's rate — `{American Funds}
  American Century Small Cap Growth R6` → 0.4%, `{American Funds Plans} DODGE &
  COX GLOBAL BOND - I` → 0.4%, `{Dimensional Fund Advisors} Schwab Fundamental
  International` → 0.3%, `{T. Rowe Price Trust Company} MFS Mid Cap Value` →
  0.65%. **The discriminator is already shipped elsewhere:** `resolveHolding`'s
  2026-09-28 rule — *the issuer may ADD a manager and never REPLACE one* — plus
  the American Funds share-class guard held in force on the prefixed string.
  **Trustee-shaped risk is small and mostly benign: 380 rows / 113 plans /
  257,547 ppl**, dominated by the house's OWN trust company (T. Rowe Price
  Trust Company 130, Vanguard Fiduciary Trust Company 111).
  **HARNESS ERROR, caught by reading the flagged list: my wrong-house screen
  said 630 rows / 1,009,129 ppl and its most frequent entry is `{Vanguard}
  Wellington Admiral Fund` — a REAL Vanguard fund whose name carries its
  SUB-ADVISER.** Do not carry 630 forward. *A firm's name inside a fund's name
  is not always a second house.*
  **A fee here is SOURCED, never derived**, so the change-existing half needs
  verification per family before any of it ships and the gain half needs the
  ADD-never-REPLACE gate first. `docs/accuracy-log.md` 2026-09-29 (15:5xZ).
- **CLOSED 2026-09-30, AND IT WAS CLOSED BY A GUARD THAT SHIPPED THE SAME CYCLE
  THAT QUEUED IT — A ROW TYPED `Company stock` WHOSE FILED NAME NAMES A POOLED
  FUND.** Queued at 79 rows / 14 plans / 111,072 ppl; re-sizes at pv 196 to
  **86 / 17 / 113,251 / $6,376,539,686**, of which **85 are already reached by
  `isMistypedStockRow`** (shipped 2026-09-29, `lib-disclose.mjs`), which gates
  `stockRow` at app.js:2346 **and blanks the type cell at app.js:2441**
  (`const filedType = mistypedStock ? "" : (f.type || "")`). So the sponsor's
  ticker is already withheld, the false type is already gone and the fee is
  already free to resolve — the whole reader-facing harm the entry describes was
  closed one bullet away, and neither bullet knew about the other.
  **THE 1 RESIDUE IS MY OWN SIZING SCREEN'S FALSE POSITIVE:** `Freedom Bank
  Unitized Stock` (126 ppl) matched on the token `freedom`, chosen for the
  Fidelity Freedom family — a real employer stock fund whose SPONSOR is a bank
  called Freedom, and the shipped guard is right to refuse it. *A house token
  inside a sponsor's name is not a house.*
  **AND THE WIDENING IS REFUSED ON ITS MEASURED INCREMENT:** asking the same
  question with v133's `FUND_PRODUCT` vocabulary reaches **+370 rows /
  1,786,883 ppl** that MIX real employer stock funds which must keep the typing
  (`DaVita Stock Fund`, `Crown Holdings, Inc. Stock Fund`, BNSF's `Company Stock
  Fund`) with real funds that should be retyped (`Fidelity Leveraged Company
  Stock Fund`, Crescent River's iShares/SPDR ETFs). The discriminator is
  sponsor-vs-house, a lookup and not a vocabulary.
  `docs/accuracy-log.md` 2026-09-30 (06:1xZ).
- **ALSO FROM THAT DRAW, unsized:** Microsoft (183,509 ppl) publishes
  `Participant-directed` at **8.6% / ~$6.7B** with a blank type; and
  University of Maryland Medical System still shows `Fidelity Total Bond Fund
  K6 → FTBFX` at 0.45% where the K6 fund is **FTKFX** — the wrong-share-class
  shape this record has now recorded four times.
- **MIRRORED 2026-09-29 13:4xZ (`c755a7c2 → 8785b2fb`), UNFORCED ON BOTH
  CHECKS**, data gate +0 / −0; `site-test` #109 `conclusion: success` on the
  exact commit, read not assumed. **A LEADING STRAY QUOTE IS NOT PART OF A
  FUND'S NAME: 229 rows / 143 plans / 138,737 participants / $474,878,302** on
  the report, **4 crawlable pages / 25,745 ppl**. `‘Vanguard 500 Index Fund Admiral
  Shares`, `'VANGUARD EXPLORER ADM`, `‘American Funds New Perspective R6`.
  **THE PAGE FIGURE CORRECTED MY OWN PROXY — I predicted 6 pages / 61,185 and
  the regenerated files say 4 / 25,745.** The proxy asked whether a plan has a
  page and an affected row and never whether that row is inside the page's
  **top-twelve cut**: JetBlue's is rank 22 of 26, Synovus's 46 and 51 of 66, so
  both change in the report and not on the page. **A third distinct flavour of
  "the page is the artifact".**
  **THE ARM EXISTS AND ITS VOCABULARY IS THE HOLE — v188's diagnosis exactly,
  and the evidence that it is an oversight rather than a decision is SEVEN
  LINES ABOVE IT:** `cleanFiledName`'s LEADING-quote arm reads `[”“"]`, double
  quotes only, while the TRAILING strip on the previous line already carries
  the wider `[”“"'’‘™®©]`. One character class, one arm, and its own sibling
  disagrees with it.
  **THE STORE COUNT IS NOT THE READER COUNT AND THE GAP IS THE FINDING: 282
  rows lead with stray punctuation in the store and 50 are ALREADY repaired**
  (the arm catches the straight `"` and the curly LEFT double `“`), so what
  reaches a reader is 232 — and the widening fixes 229 of them.
  **EVERY ONE OF THE 205 DISTINCT TRANSFORMATIONS WAS READ and not one removes
  anything but the quote**; `‘TIAA Access Lifecycle 2050 T'4` keeps its
  INTERIOR apostrophe because the arm is anchored `^`, and
  `‘Voya … Company ‘Vangrd Tot int Stk In F Adm` loses only the leading one.
  **THE RESIDUE OF 4 IS THE PRE-EXISTING GUARDS WORKING, not a miss:** two are
  balanced quoted terms (`"Brokerage" Account` — the FMC `Institutional "Plus"
  Shares` control shape) and two leave a SINGLE word (`“RAX`, `‘Uncoln`),
  which the arm's own ≥2-word floor refuses. No new guard is needed.
  **OUTCOME TEST THROUGH `lookupTicker`'s REAL CALL ORDER: +1 ticker, −0, 0
  flipped.** It is an HONESTY fix and not a coverage fix, and that is the
  honest framing: `lookupTicker` tries the RAW name FIRST, and `fund-er.js`
  matches through a leading quote on almost every row already.
  **AND THE ONE GAIN IS CORRECT, after I nearly filed it as a fabrication
  risk.** `‘Target 2060 Mutual Fund &` (American Security Mortgage, 177 ppl)
  gains **VTTSX, exact, `comparable: false`** — because the row carries
  `iss: "Vanguard"` and **the page PREPENDS the issuer**, so the string that
  resolves is `Vanguard Target 2060 Mutual Fund &`.
  **HARNESS INSTANCE, AND A NEW SHAPE OF IT: I hand-probed `fundTickerInfo`
  WITHOUT the issuer prefix, got `null` on six forms, and believed the hand
  probe over my own harness — which had included the issuer and was right.**
  A name that looks house-less may be resolving through the identity column.
  *A hand probe that contradicts your own harness is the more likely to be
  wrong of the two.*
  **Tether: 5 probes + 6 pinned controls, added after checking that NOT ONE of
  the 27 existing probes leads with a quote of any kind** — the twin agreed
  whether or not it carried the arm. Negative control fails **by name on
  exactly the 4 must-strips** and holds both must-keeps.
  `docs/accuracy-log.md` 2026-09-29 (13:3xZ).
- **TWO DEAD DISCRIMINATORS FROM THE 13:2xZ DRAW (Sony, 26,151 ppl, $6.21B, a
  broken-font filing at ratio 0.685) — recorded so they are not retried.**
  **(1) The ISSUER column carrying a kerned generic TYPE label is 29 rows / 2
  plans / 26,824 ppl** — essentially Sony alone — **and must NOT be "fixed"**:
  its `Corporate Stock - Common` issuer is a **pinned negative control** from
  the 2026-09-21 issuer strip. *Read the shipped guard before pricing a cost it
  may already stop.*
  **(2) "A NAME THAT READS TOTAL IS A SUBTOTAL" IS NOT A CLASS, and the
  implausible size was the tell TWICE.** First screen **8,538 rows / 5,555
  plans / 8,622,589 ppl**; adding a names-no-fund gate cut it to **3,431 /
  3,160 / 5,470,501** and it was STILL dominated by real funds — `Total Return
  Bond Fund` 383, `Total Bond Market Index Fund` 349, `Total Stock Market Index
  Fund` 311 — because `fund-er.js` cannot name them without a house prefix, so
  the ticker gate does not discriminate. **Do not carry 8,538 or 3,431
  forward.** Sony's own `Tota II C.ommon,,and Pref.erred Stock` does not
  reconcile either: at $430,494,438 it is **1.325x** the sum of the 26 stock
  rows beneath it, so it cannot be claimed as a double-count. *A first word is
  not a signature* — v181's `Subtotal (not a holding)` identifies the family
  structurally and that stays the only sound route.
- **ALSO FROM THE 12:0xZ DRAW, AND IT MUST NOT BE CARRIED FORWARD AS ONE
  CLASS: a FORFEITURE account published as a menu holding, 133 rows / 132
  plans / 302,996 ppl / $51,651,782, is AT LEAST THREE DEFECTS.** Reading the
  105 distinct names: a bare forfeiture suspense account (`Forfeiture Account`,
  `Forfeiture/Asset Holding Account` — real plan money, not a menu choice, so
  v181's loan treatment: TYPE the row, never drop it); a REAL FUND holding the
  forfeitures (`Galliard Stable Return Fund - Forfeiture Asset Holding Acct`,
  `Putnam Stable Value Fund- Forfeitures Account`, `US Government Money Market
  Fund - Forfeitures` — these must KEEP their identity and their fee); and
  audit PROSE (`2024 and 2023, balance on forfeited nonvested accounts amount
  to $14,175 and`). The "ONE count was several defects" rule, met again at
  three — size each arm separately before any of it is worked.
- **MIRRORED 2026-09-29 11:2xZ (`82de7561 → f567c558`), DATA GATE UNFORCED
  +0 / −0**; `--force` covered the GIT check alone over main's one cron commit,
  evidence first: 0 acks, 0 plans, 0 newer pv, 0 confident the branch lacks,
  plans array byte-identical. **#505 ran `success`** (data `a50ab3f`), pv 192 at
  99.81%, coverage line byte-identical, HIGH **4 = the baseline**.
  **AN ANNUITY CONTRACT'S GUARANTEE IS NOT A FUND EXPENSE RATIO: 146 rows / 139
  plans / 318,640 participants / $2,410,183,731** stop publishing an estimated
  **0.35%** on a holding the filing names as an annuity contract and nothing
  else. The discriminator is structural and deliberately NOT the `er === 0.35`
  proxy that sized the class: **remove the words the fee table prices a
  guarantee on, ask the same table again** — a rule keyed on a magic constant
  breaks in silence the day that constant moves.
  **THE COMMIT SAYS 144 AND THE NUMBER IS 146**, found by replicating app.js's
  FULL `er` expression and refusing to accept a near-match. My pass returned 146
  twice — once hand-rolled, once with every suppressor aligned to app.js's real
  definitions (`stockRow` reads type PLUS name; `subtotalRow` is anchored;
  `annuityRow` takes the RAW name). Diffing the member lists gave three names,
  one a curly-quote artefact of my dump and **two real** — `Stable Value Fund -
  Group Annuity Contract Empower …` and its `- Key` sibling — both with a
  **BLANK type and no `cit`**, so `gicRow` and `noPublicPrice` never fired and
  the shipped predicate answers `true`. They change. Direction is the safe one:
  two MORE invented fees withdrawn than claimed, every one from 0.35, and **0
  flagged rows whose name does not say "annuity contract".** *"Close" is not a
  verification; diff the member lists.*
  **AND MY OWN HANDOFF FIGURE WAS WRONG THE OTHER WAY — 178.** It reproduces
  exactly and is a harness figure: it tested the RAW stored name where the page
  prices the CLEANED one (2 rows), and ignored **`noPublicPrice`** — 34 rows /
  33 plans / 52,905 ppl typed `Pooled separate account` or `Collective trust`,
  **never priced at all**. **Third consecutive cycle a fee or ticker class was
  filed at the wrong size because the measurement stopped one function short of
  the render**, and the second time in one day for me.
  **The gate is priced, not assumed:** removing it withdraws **14,630 further
  fee cells / 8,240 plans / 17,239,191 ppl / $192.0B**, including `Fidelity VIP
  Contrafund Portfolio` and the whole Target Retirement family. Class B survives
  **structurally** — for all 20 must-keep names the strip is a NO-OP. Re-run
  independently: parser-gate green, smoke-test green, `git diff --stat p/`
  **empty** (REPORT path only). `docs/accuracy-log.md` 2026-09-29 (11:2xZ).
- **QUEUED, SIZED, NOT SHIPPED — AN INVESTMENT CONTRACT TYPED `Mutual fund`:
  223 rows / 220 plans / 330,533 participants / $1,447,476,149.** The
  annuity-type shape one legal noun along, and **larger in participants than the
  annuity fix itself.**
- **CLOSED 2026-09-30, re-sized at pv 196 — THE PARTY-IN-INTEREST WELD IS 1
  ROW.** Queued at 61 rows / 48 plans / 97,408 ppl (`PIMCO REAL RETURN FUND
  CLASS A * 55 PIMCO TOTAL RETURN FUND CLASS A`); **v193's (C) arm shipped
  exactly this** and the bullet was never retired.
- **QUEUED, OWNER'S CALL — THE FUND-IDENTIFICATION GAP, sized honestly: 139,910
  rows / 28,693 plans / 38,745,363 participants** carry a filed name stating
  BOTH a house AND a share class, typed a registered mutual fund by the filing,
  and resolve to **nothing**. Dominated by the **R6 institutional class** (`MFS
  Mid Cap Value R6` 606, `PGIM Total Return Bond R6` 409, `Putnam Large Cap
  Value R6` 357, `BLACKROCK TOTAL RETURN K` 244).
  **THE CAUSE IS NOT WHAT I GUESSED:** I expected the SEC index's `comparable`
  half, which this record already gates. **Seven of eight probe names return
  `null` outright**, and the index is not missing them — `MFS Mid Cap Value
  Fund` is present with NINE share classes. **A MATCHER gap, not a data gap.**
  Live risk from the same probe: `Putnam Large Cap Value R6` resolves to
  **PEYAX, the Class A ticker**, via `superset+ambiguous` for a filing saying
  R6 — the wrong-share-class shape this record forbids carrying a fee.
  **NEW COVERAGE, not a defect** (the cell is blank, which is honest), so not
  started.
  **THREE OF MY OWN NUMBERS EN ROUTE WERE HARNESS ARTEFACTS, each caught by
  implausibility:** an "abbreviation" class at **45.5M ppl** (my token list held
  `MFS`, `AF`, `NT` — full house names); a whole-store **63.9% of rows have no
  ticker**, true but NOT a defect measure (the top entries are brokerage
  windows, master trusts and CITs, which have no ticker BY DESIGN); and an
  index probe reading **`entries: 0`** because my accessor tried
  `classes`/`rows`/`data` where the file's key is `funds`. *A zero, a round
  number and an implausibly large number all report on the query.*
- **MIRRORED 2026-09-29 09:2xZ (`a0a4fb8 → b52b02e`), DATA GATE UNFORCED
  +0 / −0**; `--force` covered the GIT check alone over main's one cron commit,
  evidence first: **0 acks and 0 plans the branch lacked, 0 newer on main, 0
  confident on main the branch lacks, plans array byte-identical.**
  **#502 ran `success`** (data commit `8984818`), store complete at pv 192 /
  **99.81%**, coverage line byte-identical to #501's — confident 60,103, HIGH
  **4 = the baseline**, WARN 608, overshoot 326, dl 131. Correct for an
  incremental whose whole work list is the dead 403s, not a stall.
  **AN INSURANCE ANNUITY CONTRACT IS NO LONGER TYPED `Mutual fund`: 186 rows /
  153 plans / 216,782 participants / $2,084,149,902** — TIAA Traditional, CREF
  variable, Empower and PRIAC group annuities, Lincoln, SAGIC. American
  University's LARGEST holding (13.5% / $182,342,343) was one.
  **v190's and v192's shape one COLUMN along:** those stopped a NAME making a
  false claim; here the name is faithful and the TYPE is the claim, so **no
  name-based guard could ever have seen it.** Display-side, no bump —
  `isAnnuityContractRow` canonical in `lib-disclose`, extracted verbatim into
  app.js by the generator, tethered. The row is TYPED, never dropped; value
  and percentage untouched. REPORT path only (the crawlable pages carry no
  type and no ER column, `git diff --stat p/` empty).
  **AND MY OWN QUEUE ENTRY'S "NO FABRICATED FEE" WAS FALSE — the more
  expensive half.** I asked `fundTickerInfo(...).er` and the stored `f.tk` /
  `f.stk`; the page prices a row through **`fundER(name)`**, whose generic
  `/stable value|guaranteed|gic/` fallback priced **34 of the 186 rows at
  0.35%** (33 plans / 77,264 ppl / $153,841,087). **The site already refuses
  that number for every row typed `Stable value / GIC` (`gicRow`), so the
  wrong TYPE was the only reason the fee escaped — one defect was feeding
  another.**
  **AND I REPRODUCED THE ERROR WHILE CHECKING IT:** my verification reached for
  `fundERFiled` in `fund-er.js`, got "function present: false", and printed a
  clean **`0 priced`** that looked like confirmation. `fundERFiled` lives in
  **app.js** and wraps `fundER`; calling `fundER` gives 34. *Measure through
  the function the page calls* — failed twice in twenty minutes, once writing
  the item and once checking it, and **the tell both times was a suspiciously
  clean zero.**
  Verified independently: 186 / 153 / 216,782 / 146 distinct names reproduce
  exactly; the tether's negative control fails **by name on exactly 4 of 14**,
  and the 4 are precisely the rows the type gate protects. smoke + parser gate
  green.
  **ADJACENT, SIZED, NOT SHIPPED, and LARGER: 184 rows / 150 plans / 322,394
  ppl / $2,411,652,415 publish an estimated ER on a holding the filing names
  an annuity contract**, typed blank (162), `Cash / short-term` (15),
  `Separate account` (5), ETF (1), `Corporate debt` (1) — outside this item
  because their type makes no mutual-fund claim, but the FEE is the same
  unsourced number. `docs/accuracy-log.md` 2026-09-29 (09:2xZ).
- **CLOSED 2026-09-30 (14:5xZ), re-sized at pv 196 — SCHEDULE H LINE 4a's
  DELINQUENT-CONTRIBUTIONS TABLE IS 1 ROW.** Queued at 98 rows / 96 plans /
  157,098 ppl; **v193's (B) arm shipped exactly this** (120 / 111 / 166,688) and
  the bullet was never retired. The residue is a single fragment,
  `Check here if Late Participant` (228 ppl, $203,406), which does not OPEN with
  the compliance words the shipped arm anchors on. **Fourth stale queue entry
  found by re-sizing rather than by working it** — *a queued class records what
  was true when it was written.* The original entry follows, as history.
- **ORIGINALLY QUEUED — SCHEDULE H LINE 4a's DELINQUENT PARTICIPANT
  CONTRIBUTIONS TABLE IS PUBLISHED AS FUND HOLDINGS: 98 rows / 96 plans /
  157,098 participants / $19,336,239.** All **81 distinct names read** and not
  one is a fund: `Corrected Outside VFCP Correction in VFCP ☑`, `Plan Corrected
  VFCP in VFCP 51 Check Here if Late`, `Amount Date Date Withheld Withheld
  Remitted`. The DOL's own COMPLIANCE schedule read as a menu — the family
  this record already names (UPMC's employer roster, the fair-value note, the
  statement of changes). Largest is 5.3% of its menu, so **no dominance guard
  can see it**; type blank on 80 of 98 and `Mutual fund` on 5; **0 ticker, 0
  ER, 0 `stk`, checked through `fundER`.** Discriminator is the compliance
  vocabulary itself (`VFCP`, `PTE 2002-51`, `Amount Withheld`, `Date
  Remitted`), which cannot appear in a fund name. Parser-side like v131's
  loan-description removal, so it needs a bump. **Two log entries recorded
  single instances of this as one-off junk; it is a class of 96 plans and was
  never sized.**
  **THE COUNT THAT FOUND IT IS NOT A CLASS.** The 09:0xZ draw on Marriott
  (137,769 ppl, `VANGUARD RETIREMENT RETIREMENT INCOME`, `FIDELITY INVESTMENTS
  MONEY MONEY PORTFOLIO`) led me to size "a word repeated back-to-back" at
  **497 rows / 286 plans / 905,232 ppl** — and reading all 445 distinct names,
  that signature spans **at least SIX unrelated defects**: the VFCP table, the
  `nia` OCR column, `TIAA# TIAA Traditional` (32 rows — the doubled house with
  a legend marker between, which v149's prefix fix cannot reach), OCR mush, a
  bare `Vanguard Vanguard`, and real doubled-word damage (`Dodge & Cox Income
  Fund, Fund, Class X`, `T. Rowe Price Price Value Fund`). **497 must not be
  carried forward as a class** — the "ONE count was four defects" rule, met
  again at six.
- **MIRRORED 2026-09-29 07:5xZ (`f7ff3fe → 119c88b`), UNFORCED ON BOTH CHECKS**,
  data gate +0 / −0. **AN OCR'D N/A COLUMN AND A SHARE COUNT WERE PUBLISHING AS
  HOLDING NAMES: 44 rows / 5 plans / 21,338 participants** get the FILED name
  back instead of `NIA NIA 233,946 dy` or `that invests at least 80% of`.
  0 strips gained, **0 tickers gained or lost** (0 of 44 resolve under either
  form, so the claim holds whatever the call order), **0 crawlable pages — the
  REPORT path only, and `git diff --stat p/` is what says so.**
  **FOUND BY MEASURING A QUEUED ITEM AND THEN NOT SHIPPING IT.** The queue held
  *lower the four-token floor*. Reading every remainder it refuses — **474 rows
  / 223 plans / 460,163 ppl, the whole population** — killed that item and found
  this one, **which reaches readers TODAY where everything behind the floor does
  not**. ONE token: all **32 distinct read, NOT ONE publishable**. TWO tokens:
  half junk and not screenable. THREE tokens: **237 distinct, overwhelmingly
  real fund names**, junk in five NAMED families — four of which also occur
  ABOVE the floor, which is what shipped (`bwNoise` for the share-count and
  N/A-column families; `measure`/`that`/`investing` in the furniture).
  **THE FLOOR DID NOT MOVE AND A PINNED CONTROL FROM LAST CYCLE IS WHY:** the
  draft stripped `Stable Value Fund Standard Insurance Company` to a bare
  ISSUER. ~8 rows do that and they feed the open bare-house class; no clean
  screen exists, because a corporate suffix cannot tell it from **`Fidelity
  Growth Company`, a real fund**. So **~248 real fund names stay unreached at
  three tokens** — named, not waved at.
  **A CONTROL I WROTE WAS DECORATIVE:** I pinned `Mutual Fund 2045 Retirement
  Trust Select` expecting a numeric test to eat a target-date VINTAGE, but
  `code` refuses any lead of six digits or fewer BEFORE the screen is reached,
  so it was already refused. The narrowing it prompted was reverted as redundant
  and the pin moved to a **seven**-digit lead. **A candidate dropped on measured
  cost:** `admiral` in the furniture withdraws **34 strips where a real fund
  name survives the caption**. DRIFT 0 over 1,720,602 rows; pre-change twin
  fails by name on exactly the 44; pre-change module STRIPS 4 of 6 must-keeps;
  12/12 pins, smoke + parser gate green.
  `docs/accuracy-log.md` 2026-09-29 (07:5xZ).
- **QUEUED, SIZED, SAFE, NOT SHIPPED — AN ANNUITY CONTRACT TYPED `Mutual fund`:
  186 rows / 153 plans / 216,782 ppl / $2,084,149,902.** Found by the 07:4xZ
  draw on **American University** (7,009 ppl), whose largest holding is
  `Traditional Fixed Annuity Contracts - Non-Fully Benefit Responsive` typed
  **`Mutual fund`** — TIAA Traditional, CREF variable, Empower group annuity,
  PRIAC. **v192's shape in a different column.** Discriminator anchored and in
  the filing's own words: `\bannuity contracts?\b` in the NAME. Of 1,405 rows
  whose name says so, 934 carry a blank type and only these 186 claim `Mutual
  fund`. **NO FABRICATED FEE, checked before pricing the item: 0 publish a
  ticker, 0 an ER, 0 carry `stk`** — the harm is the CLAIM alone. `type` is a
  STORED field, so parser-side and needs a bump, or a display typing on v181's
  loan pattern.
- **A NAMED LARGE MEMBER FOR THE OWNER-QUEUED WHOLE-TABLE CLASS: Cummins Inc.
  (38,567 ppl, $7.49B).** Its 7-row menu is an asset-class table —
  `Common/collective trust funds` **60.7% / $5,016,457,254** plus `Registered
  investment companies` 4.4%, so **65.1% of the menu's VALUE names no fund**.
  `isGenericTypeName` is TRUE on both, the share clears the audit's 25% floor,
  **so Cummins is already one of the 217 plans `audit-generic-names` counts —
  and nothing withdraws it**, because `audit-dominant-row` needs 90% on a
  SINGLE row and the largest is 60.7%. The Morgan Stanley / General Motors gap
  exactly: the implied change is a **whole-table** test beside the one-row test.
- **MIRRORED 2026-09-29 07:2xZ (`cfd7e89 → f7ff3fe`), UNFORCED ON BOTH CHECKS**,
  data gate +0 / −0; `site-test` #107 `conclusion: success`, Pages #673
  `success`. **A CAPTION WELDED STRAIGHT ONTO A FUND NAME, AND AN INITIAL THAT
  IS NOT A SHARE CLASS: 287 of 1,720,602 published rows / 258 plans /
  2,393,636 participants**, on BOTH display paths; 12 crawlable pages /
  2,074,330 ppl, Walmart among them. **Found by the 06:2xZ participant-weighted
  draw on Walmart (1,921,006 ppl)**, whose menu carries `Investments Walmart
  Inc. Equity Securities`.
  **MEASURING WHY THE 997 QUEUED ROWS WERE REFUSED SPLIT THEM THREE WAYS, and
  only two shipped.** **(A) `investments` was missing from the bare-whitespace
  arm's vocabulary — 418 rows / 2,599,053 ppl-weighted. THE PLURAL ONLY, and
  the safety test named its own discriminator:** the bare SINGULAR `investment`
  withdraws a resolution from **34 rows and every one is a real fund whose own
  name starts with the word** (`INVESTMENT CO OF AMERICA Class R-4` → RICEX,
  `Investment Grade Bond R6` → JIGEX). **(B) An INITIAL is not a share-class
  code — 129 rows / 38 plans / 62,598 ppl:** `bwOpensWithAName` strips
  punctuation before judging, so `T. Rowe Price Overseas` arrived as the bare
  `T` and hit the one-letter code arm — **the same letter that traps the
  matcher's manager vocabulary, a different predicate in a different file a
  week apart.** The discriminator is the PERIOD the strip threw away.
  **(C) 456 rows are the four-token floor refusing short real names**
  (`Registered Investment Company Fidelity 500 Idx`) — NOT TOUCHED, because
  that floor was chosen by the data and lowering it is its own measurement.
  **READING THE DISTINCT TRANSFORMATIONS CAUGHT TWO ROWS OF DAMAGE THE COUNTS
  CALLED CLEAN**, third cycle running: `Investments using NAV (CCT funds)` and
  `Investments valued at NAV Morley Stable Value` lost their first word — the
  furniture list held `invested`/`measured`/`including` and was missing
  **`valued` and `using`.** Both pinned.
  **DRIFT 0 over all 1,720,602 rows**; the pre-change twin drifts by name on
  exactly the 287; tether +9 pinned cases +4 probes, **added because not one
  existing case reaches these arms**; reverted twin fails by name on exactly
  the 2 must-strip probes.
  **STILL QUEUED, sized at v192 so they are not re-counted:** the four-token
  floor **456 rows / 116 plans / 169,683 ppl**; `;` 101 rows, `—` 46, `_` 26,
  `(` 53; **`/` (232) must NOT be stripped** — `Money Market / Cash Equivalent`
  is a compound type — and `,` (104) is already refused by the comma family's
  measurement-basis screen.
  **A harness error caught by an implausible zero:** the first outcome test
  returned 0 rows because my "has a connective" filter counted the SPACE after
  the caption as one. `docs/accuracy-log.md` 2026-09-29 (06:3xZ, 07:2xZ).
- **PREVIOUSLY IN FLIGHT: #501 (v192), dispatched 2026-09-29 05:2xZ on `99b2c73`, observed
  queued — a FULL re-parse on the version bump. A BARE `PREFERRED STOCK`
  DESIGNATION IS NOT A FUND NAME: 29 rows / 21 plans / 310,633 ppl /
  $9,859,671** stop being shown a holding named only `Preferred stock` with
  nothing saying it names no fund. 0 rows lose a typing they have.
  **FOUND BY THE PARTICIPANT-WEIGHTED DRAW** on Bank of America (250,040 ppl),
  whose 38-row menu ends in individual securities — `EXXON MOBIL CORP`,
  `INTERNATIONAL BUSINESS MACHS`, four `PREFERRED STOCK` lines typed
  **`Mutual fund`**. The money is 0.00% of a $64.9B menu; the CLAIM is the harm.
  **v190'S SHAPE ONE WORD ALONG:** `isGenericTypeName` is TRUE for `Common
  Stock` / `Common Stocks` / `Common and Preferred Stock` and FALSE for
  `Preferred stock`, so the class was outside the vocabulary BY CONSTRUCTION —
  **the third cycle running that a missing entry in an anchored list hid a
  class.** Of **205 distinct published names containing `preferred` the arm
  flags 5 and KEEPS 200**, every one read and every one a real fund.
  **THE COST I WENT IN EXPECTING TO WEIGH WAS ALREADY PREVENTED:** the 84 rows
  named `Common Stock` typed `Company stock` keep their type, because
  `isNamelessFundRow` excludes `company stock` and is asked only when there is
  **no issuer** — which also protects the 12 rows whose issuer names the
  security. *Read the shipped guard before pricing a cost it may already stop.*
  **A CONTROL I WROTE FAILED MY OWN EXPECTATION:** `PREFERRED STOCK 795` pinned
  must-KEEP is actually FLAGGED — `COMMON STOCK 600` already read true pre-v192,
  because v188's `stripGenericDecoration` strips a trailing number and re-asks.
  **TWO OF MY OWN NUMBERS WERE HARNESS ARTEFACTS:** a sponsor-word screen said
  1,033 rows / 3.56M ppl (it flagged `APi Group Corporation` ← Api Group), and
  my first participant total row-summed to 1,613,811 where **plan-distinct is
  810,644** — BofA carries four such rows. *A participant-weighted count must be
  plan-distinct.*
  **PRE-REGISTERED against the v191 store it runs on:** `audit-generic-names`
  **217 → 217** (rows 439 → 441), `audit-dominant-row` **0**, `confident`
  +0 / −0. 28 controls green; negative control **7 of 7 miss, 9 of 9 hold**;
  twin probes 34 → 44 and the pre-v192 twin **drifts on exactly the 4
  must-flags**, run without calling the generator first.
  `docs/accuracy-log.md` 2026-09-29 (05:2xZ).
- **#500 (v191) RAN `success`** (data commit `42e67c1`): **`confident` +0 / −0
  PASSED**, **`audit-dominant-row` 0 PASSED**, HIGH **4 = the baseline**, WARN
  608, dl 131. **`audit-generic-names` came in at 217 against the 219 I
  registered, and the METHOD is the finding.** The 219 was computed with v191's
  predicate against the **v190 store** — but a parser bump CHANGES the store,
  rows move, and a plan's generic share crosses the 25%-of-value threshold in
  both directions. **A count that depends on the store the run will produce
  cannot be predicted from the store it replaces.** Direction right (+6
  predicted, +4 delivered), harness wrong in kind. New variant of a shape this
  record carries twice — v190's stored-vs-published class size and #497's
  `f.stk`-vs-`lookupTicker`. Unregistered and named: `overshoot` 325 → 326.
- **MIRRORED 2026-09-29 05:1xZ (`b7dad2b → f92f178`), UNFORCED ON BOTH CHECKS**,
  data gate +0 / −0 — carried v191 CODE over the v190 store, which is safe by
  `SCHEDULE_INCREMENTAL`, to get v191's DISPLAY half to report readers without
  waiting for the re-parse. Pages #671 built it `success`.
- **PREVIOUSLY IN FLIGHT: #500 (v191), dispatched 2026-09-29 04:0xZ on `037e00e`, observed
  queued — a FULL re-parse on the version bump. A WRAPPED SENTENCE'S TAIL IS NOT
  A FUND NAME: 22 rows / 22 plans / 29,795 ppl / $666,201,616** publish a holding
  named only `Statements` — the continuation line of *"…the accompanying
  financial Statements"* — the largest at **74.0% of its menu** (Avangrid, 1,187
  ppl, `Statements` $46,566,930 of a 5-row menu).
  **FOUND BY THE PARTICIPANT-WEIGHTED DRAW**, and it is v190's own shape one
  vocabulary entry later: `GENERIC_TYPE_ANY_EXTRA` is anchored `^…$`, so the
  question is only *is this WHOLE name a bare type word*, and `statements` was
  simply absent from that list. **The singular `statement` matches 0 rows today
  and ships anyway** — the same wrapping produces it and the anchor makes it
  safe.
  **PRE-REGISTERED: `audit-generic-names` 213 → 219, MEASURED not estimated;
  `audit-dominant-row` stays 0; `confident` +0 / −0** (the guard needs a single
  non-fund row at ≥90% and the largest here is 74.0%, so no lineup should be
  withdrawn — any loss must sit inside the named 22).
  **MY FIRST AUDIT DELTA WAS THE WRONG POPULATION: 750 → 768, +18.**
  `audit-generic-names` counts a published plan only when the generic rows carry
  **≥25% of the menu's VALUE**; reproducing that rule gives **213 exactly, the
  number the run reported**, and the delta is +6. *A count that does not
  reproduce the shipped number is measuring something else.*
  18 controls green (must-FLAG and must-KEEP, including `(See Attached
  Statement)`, `Misstatements net of tax impact`, `Real Estatement Index Fund -
  Admiral` and `Statement of Net Assets Available for Benefits`); negative
  control fails by name on 5 of 5 and holds 6 of 6; 7 new twin probes (27 → 34),
  twin regenerated; `parser-gate.mjs` all green.
  `docs/accuracy-log.md` 2026-09-29 (03:3xZ, 04:1xZ).
- **#499 PASSED ITS PRE-REGISTERED TEST TO THE ROW** (`conclusion: success`, data
  commit `b7dad2b`): **`sec tickers: 346,774 rows across 37,090 plans`**, exactly
  predicted; coverage line byte-identical (confident 60,103, HIGH 4, overshoot
  325, WARN 608, dl 131); CONFIDENCE DIFF +0 / −0. Every named control read out
  of the store, not the log: the ten Fidelity Freedom Index **Premier** classes
  publish on **5,198 rows** (FRLPX 554, FQIPX 552, FTYPX 550, FPIPX 547, FNIPX
  540, FUIPX 539, FMKPX 531, FVIPX 517, FLIPX 488, FKIPX 380); the Institutional
  Premium classes hold (FFIZX 330, FFLDX 331, FFOPX 330); **TLHPX 0** — the
  Nuveen Lifecycle series has no institutional class and stops asserting one;
  and the four must-keeps stand (RPFIX 7, IUGXX 8, VTIFX 17, ACAYX 4, FIHLX 92).
  **MIRRORED 2026-09-29 04:0xZ (`0981231 → b7dad2b`), UNFORCED ON BOTH CHECKS**,
  data gate +0 / −0.
- **PREVIOUSLY IN FLIGHT: #499, dispatched 2026-09-29 03:0xZ on `3b82ea2`.
  NO PARSER BUMP — it exists to let the MERGE rewrite `stk`.** **PREMIER IS NOT
  INSTITUTIONAL: 9,329 rows / 7,862,491 ppl gain an EXACT ticker and 1,005 rows
  / 2,096,588 stop being told the wrong share class, 0 flipped.**
  `CLASS_HINTS` folded `premier` into the `institutional` arm, so three of
  Fidelity Freedom Index's four classes (Investor / Institutional Premium /
  Premier / Premier II) returned one hint; the selector needs `hit.length === 1`,
  never resolved, and handed back the **Investor** class behind an asterisk for
  a filing saying **PREMIER**.
  **FOUND BY SIZING AN OWNER-SENT TABLE BEFORE APPLYING IT.** 54 target-date
  ticker/fee rows: **30 of 54 verified against `sec-funds.json`, ~12 wrong**
  (`TRRIX`→Retirement **Balanced**, `LIFKX`→**Lord Abbett Inflation Focused R4**,
  `SWYLX`→Schwab **2020**; `VTXVX`→VTTVX, `FGIFX`→FXIFX, `FDKVX`→FDKLX,
  `SWYIX`→SWYMX, `FIJX` four characters; LIJKX/LIHKX/LIWIX each on two years).
  **Absence was NOT treated as refutation** — BlackRock LifePath and JH
  Multimanager have zero classes in the extract. **0 of 54 FEES are verifiable
  here.**
  **AND THE TABLE WAS THE WRONG SHAPE:** of 60,716 no-ticker rows in those six
  families, **21,706 / 33.3M ppl STATE NO CLASS** and must stay blank, while
  **16,630 / 17.4M DO state one** and were blocked by the hint defect.
  **THE LOSSES ARE MOSTLY CORRECTIONS, TESTED:** 1,005 of 1,033 had the old
  answer asserting **Premier** for a filing that never says premier — `Nuveen
  Lifecycle Index 2030 Inst` → TLHPX, and that series **has no institutional
  class at all**. Genuine residue **28 rows / 16,779 ppl**.
  **FOUR DRAFTS WRONG, EACH CAUGHT BY A CONTROL:** (23rd harness instance) I
  patched `STRUCTURAL` and the diff returned **0 rows changed** — it builds no
  key, `NOISE` does; an unconditional series-owns filter stripped the ONLY class
  signal from `Federated Hermes Instl High Yield Bond` and broke two pins;
  narrowing to one hint routed through `c.hint`, which returns `institutional`
  for every Alger class because the class names embed the fund name; the
  membership fix then broke `Vanguard … Institutional Shares` because
  `Institutional Select` answers to `institutional` too.
  **TWO PINS WERE WRONG AND WERE UPDATED WITH EVIDENCE:** `Institutional High
  Yield Bond Fund R6` was pinned **FIHAX\*** (Class A, asterisked) where FIHLX
  IS that series' R6 class; `Freedom Fund 2050` was pinned **FFPFX (Premier)**
  as the ambiguous representative where FFFHX is the base retail class.
  **AND IT CLOSES THE `Royce Premier Fund` RESIDUAL** pinned unfixed 2026-09-28.
  **`--selftest` 84/84**, nine new cases including **four must-stay-AMBIGUOUS**;
  negative control fails by name on 5 of 5 must-change, holds 6 of 7 must-keep.
  Residue pinned not fixed: `Instl Prem` refused because `prem` is not a class
  marker (~1,350 rows).
  **PRE-REGISTERED: `sec tickers: 346,774 rows across 37,090 plans`** (+8,296,
  +55 plans, measured); CONFIDENCE DIFF +0 / −0; coverage line otherwise
  byte-identical (confident 60,103, HIGH 4, overshoot 325).
  **OWNER-GATED, NOTHING WRITTEN: the FEE half.** `data/fund-facts.json` refuses
  undated/unsourced figures and the table had neither. Fees need a source URL,
  an as-of date and a SHARE CLASS per row. `docs/accuracy-log.md` 2026-09-29.
- **#497 PASSED ITS PRE-REGISTERED TEST TO THE ROW** (`conclusion: success`,
  data commit `14aef95`): `sec tickers` **338,478 rows across 37,035 plans**,
  exactly predicted; coverage line holds (confident 60,103, HIGH 4, overshoot
  325, dl 131); **0 `of American` rows still carry a Growth Portfolio ticker**.
  Tallies reconcile exactly — RGAGX 570→574, RBFGX 543→555, RIDGX 169→171,
  RGACX 80→81, RGAEX 90→91 = +20, less 5 flipped = **+15 net**, as predicted.
  **MIRRORED 2026-09-29 02:2xZ (`c54247d → 14aef95`), UNFORCED ON BOTH
  CHECKS**, data gate +0 / −0.
  **A CHECK LINE I WROTE WAS THE WRONG TEST:** it asserted store-wide `RGWGX 0`
  and read 85 — but plans genuinely hold that fund, so the count must be
  nonzero. *A whole-store count of a ticker is not a test of a name-specific
  fix.*
- **LIVE AND QUEUED — A MAGNET SERIES KEY: 57 rows / 30,965 ppl are SHOWN a
  Growth Portfolio ticker for a filing naming a different fund.** All 102 rows
  carrying RGWGX/RGPCX reach readers through `stk` (`fund-er.js` answers none).
  Read name by name: **45 rows say `Growth Portfolio` and are correct**; 39 /
  20,428 ppl say `Growth Fund` (The Growth Fund of America — one row,
  `Fund; Class R-6 American Funds Growth Fund of`, keeps the `of`); 9 / 4,851
  say `Growth and Income`; 3 / 2,858 say `EUPAC Growth` (RERGX); 6 ambiguous.
  **MECHANISM:** `portfolio` sits in `NOISE`, dropped from both sides, so the
  series `American Funds Growth Portfolio` has the key **`{american, growth}`**
  — a house token plus an asset word and nothing else, which every American
  Funds growth-ish name is a superset of.
  **TWENTY-SECOND HARNESS INSTANCE: I named the wrong constant.** I reported it
  as `STRUCTURAL`, patched that set, and the whole-store diff returned **0 rows
  changed** — a control failing to fail. `STRUCTURAL` is read only by
  `managerPhrase`/`anonDistinct` and **builds no key**; `NOISE` does.
  **THE OBVIOUS FIX IS DEAD, MEASURED: removing `portfolio` from `NOISE` costs
  5,901 correct rows / 5,830,477 ppl / 1,196 names** — Dimensional registers
  `U.S. Targeted Value Portfolio` and filings write `DFA US Targeted Value I`,
  so the whole DFA family withdraws (DFFVX 640, DFREX 477, DFIVX 216 …) against
  180 gained. **`portfolio` must stay in `NOISE`** — the exact mirror of that
  list's own comment on why `series` must stay OUT.
  **SHIPPED 2026-09-29 04:5xZ, `[skip ci]` behind #500 — AND THE CANDIDATE RULE
  THIS BULLET USED TO STATE WAS WRONG.** It said *"require the NOISE words to
  AGREE"*; that is draft (2) below and the whole-store diff killed it.
  **71 rows / 71 plans / 52,172 ppl stop being SHOWN a Growth Portfolio ticker
  as fact**, 0 gained, 0 flipped, 0 correct answers withdrawn. `fund-er.js`
  answers **0 of 71**, so every one genuinely reaches a reader; the diff's 110
  changed rows are 71 at the surface because the 39 asterisked ones were never
  stored. **The queued figure of 57 / 30,965 was too SMALL** — it counted
  RGWGX/RGPCX and the class also reaches readers through RGWEX and RGWFX.
  **TWO DRAFTS DIED ON THE SAME FAMILY, the one that killed the `portfolio`
  fix a cycle earlier:** (1) *key = house tokens + asset words* withdrew
  **2,510 rows / 2.68M ppl**, because `mgrKeys` holds `managerPhrase(series)`
  and `U.S. Targeted Value Portfolio` yields `us targeted`, covering two thirds
  of its own key; (2) the vehicle-noun test alone still withdrew **992 / 1.17M**
  — **Dimensional registers every series as a `Portfolio` and filings write
  `Fund` or nothing**, so `DFA Global Equity I` is a correct answer whose
  registrant just uses the other word.
  **The discriminator is what the key still SAYS once the filed name's house is
  removed:** `global equity` keeps TWO asset words and two asset words name a
  product; `american growth` keeps ONE, and one asset word cannot choose among
  the dozens of growth funds a house registers. The vehicle noun is asked only
  there. `fidelity balanced` keeps one too and is untouched — Fidelity's series
  is a `Fund` and so is the filing.
  **A PIN I WROTE WAS DECORATIVE AND THE CONTROL SAID SO:** `Growth Fund R6`
  with an empty issuer refuses anyway and never reaches the new rule; the store
  row carries `iss = "American Funds"`. **The control went 6 of 7 → 8 of 8 on
  that correction alone.** `--selftest` **100/100**, 16 new cases; negative
  control **8 of 8 must-change, 8 of 8 must-keep**.
  **PRE-REGISTERED: `sec tickers: 346,703 rows across 37,086 plans`** against a
  harness reproducing the current line at **346,774 / 37,090 exactly**;
  CONFIDENCE DIFF +0 / −0; coverage line otherwise byte-identical.
  `docs/accuracy-log.md` 2026-09-29 (02:2xZ, 04:5xZ).
- **PREVIOUSLY IN FLIGHT: #497, dispatched 2026-09-29 01:2xZ on `20cfa79`.
  NO PARSER BUMP — it exists only to let the MERGE rewrite `stk`.** A filed
  `of American` is a typo that names a DIFFERENT REAL FUND: `American Funds The
  Growth Fund of American R6` resolved EXACTLY to **RGWGX**, a class of
  `American Funds Growth Portfolio`, because after structural words that series'
  key is only `{american, growth}` — so the MISSPELLED `american` is one of its
  tokens while the right series needs `america`, which the filing never types.
  Nothing in the matcher can see it; the string is wrong, so the string is
  repaired, in `resolveHolding` — the one shared call rule.
  **The test is a POSITIVE vocabulary of what may FOLLOW**, never a blocklist:
  the American Funds forms end the entity at `America` and are followed by
  nothing, a share class or a vehicle word, while all four real entities in the
  store continue with a proper noun (`of American Airlines, Inc.`, `of American
  United Life Insurance Company`, `of American Trust Company`, `Best of American
  Fixed`).
  **READER-FACING: 15 rows / 11,299 ppl GAIN a correct ticker** (RBFGX, RIDGX,
  RGAEX), **2 rows / 562 ppl stop publishing a different fund as fact**
  (Trailboss RGWGX → RGAGX, Evans Transportation RGPCX → RGACX), 0 lost, 17
  plans, $20,129,610.
  **AND THE NUMBER THIS ITEM WAS FILED UNDER WAS WRONG THE SAME WAY AS
  YESTERDAY'S:** the queue said "4 rows publish a wrong fund as fact" and that
  counted **`f.stk`, a STORED field**. `lookupTicker` asks `fund-er.js` FIRST
  and `f.stk` LAST, and fund-er matches straight through this typo and answers
  RGAGX correctly — so three of those rows never showed a reader anything wrong.
  **2 rows / 562 people against the 75,937 the item was filed under, a factor of
  135.** *A stored field is not a published one — measure through the function
  the page calls.* **Nineteenth harness instance**, one day after the identical
  shape cost a class size.
  Whole-store through the merge's own gate and storage rule: **977,783 of
  977,803 rows unchanged, 0 lost, CHANGES OUTSIDE THE PHRASE 0.**
  **`--selftest` 75/75**, 13 new cases (7 must-change, 6 must-keep); the
  pre-change file fails by name on exactly the 7 and holds all 6.
  **PRE-REGISTERED: `sec tickers: 338,478 rows across 37,035 plans`** (+15 rows,
  +1 plan) — against a harness that reproduces the CURRENT line at **338,463 /
  37,034 exactly**; CONFIDENCE DIFF +0 / −0; coverage line byte-identical
  (confident 60,103, HIGH 4, overshoot 325).
  `docs/accuracy-log.md` 2026-09-29 (01:1xZ).
- **QUEUED, AND NOW WITH A HARD GATE AND A NUMBER: the SEC index's `comparable`
  half contains WRONG-HOUSE answers, not merely uncertain share classes.**
  Found by the 01:3xZ participant-weighted draw: `Blackrock Emerging Markets`
  resolves to **TWMIX — `AMERICAN CENTURY WORLD MUTUAL FUNDS INC :: EMERGING
  MARKETS FUND`**. Sized on the one family verified ticker by ticker: **1,350
  rows / 1,340 plans / 1,277,392 ppl-weighted / $1,416,343,099** resolve to
  TWMIX from a filed name that does not say American Century (DFA 171,
  BlackRock, Delaware, Vanguard, JPMorgan, Invesco, Lazard, VanEck, Victory,
  Driehaus, Brandes, Wasatch, Northern, Putnam, PIMCO, Franklin Templeton, John
  Hancock); ~400 are a bare `Emerging Markets` naming no house and are honestly
  ambiguous. **NOTHING REACHES A READER** — merge stores only non-`comparable`
  answers — so this is a gate on shipping that half, not a live defect. The
  manager gate is evidently not applied on the comparable path.
  **TWO SIZING ATTEMPTS FIRST AND BOTH MEASURED THE HARNESS. (20)** `leadManager`
  flags 8,684 rows and its top entries — `American Funds New World Fund` →
  NEWFX, `New Perspective` → ANWPX, `American Balanced` → ABALX — are all
  **correct**, because those registrants name no house; #495's wall reappearing
  inside a measurement of it. **(21)** Checking the REGISTRANT instead cut it to
  6,894 and produced three flagship false positives (`ASVIX [NORTHERN FUNDS]`,
  `ANOIX [BRIDGEWAY]`, `PRRAX [John Hancock]`) because **my map was keyed on
  the SERIES name, which is not unique** — direct lookup says ASVIX and ANOIX
  are American Century's and PRRAX is Principal's. *A lookup keyed on a name
  that is not unique is not a lookup* — the shard-hash error in a new dress.
  **Do not carry 8,684 or 6,894 forward.**
- **SHIPPED 2026-09-29 00:1xZ — v190's display half, and the tether would not
  have caught the drift.** app.js's generated twin of `isGenericTypeName` still
  carried the PRE-v190 pattern (`build-seo-pages.mjs` imports the predicate live,
  so only the REPORT path was stale — the two-display-paths split again).
  Regenerated from the compiled source. **NOT ONE of the generator's 16 probe
  names reached the new arm**, so the twin agreed whether or not it carried v190
  — v189's failure one version later. Eleven probes added (five must-FLAG, six
  must-KEEP including both v189 pins and four real trust-NAMED funds), 16 → 27.
  **MY FIRST NEGATIVE CONTROL MEASURED MY OWN HARNESS:** I reverted the twin and
  then called `gen-generic-twin.mjs --check` before probing — there is no
  `--check` mode, so it simply REGENERATED the twin and found no drift. Re-run
  without that step: **5 of 7 probes drift by name**, both must-keeps agree.
  **Seventeenth harness instance, and the first where the harness step silently
  repaired the very thing it was meant to detect.** Full smoke test green.
- **PREVIOUSLY IN FLIGHT: #496 (v190), dispatched 2026-09-28 23:1xZ on `fe983e8`
  — a FULL re-parse on the version bump.** **A BARE TRUST DESIGNATION IS
  NOT A FUND NAME: 58 rows / 53 plans / 1,528,497 ppl-weighted / $67.8B**
  publish a holding named only `Master Trust`, `Trust`, `Interest in Master
  Trust` or `Plan interest in master trust`. **Found by the participant-weighted
  draw** on FedEx (177,265 ppl), whose 26-row Vanguard menu is otherwise clean
  at ratio 0.972 and carries `Master Trust` at $664,474,627.
  **The cause is structural, not an omission:** `trust` reached
  `GENERIC_TYPE_NAME` only ever INSIDE `collective (?:investment )?trust`, never
  standing alone, so the bare name was outside the vocabulary BY CONSTRUCTION
  and the dominance guard, both audits, `diff-lineups` and the browser twin were
  all blind to it.
  **Split by what the reader is TOLD: 27 rows / 711,611 ppl have a BLANK type
  column**; 22 / 488,910 already read `Master trust interest`; 3 / 311,006
  `Company stock`; 6 / 16,970 `Collective trust`. **Eight rows are ≥50% of their
  own menu and five ≥90%** — the v105 shape, a plan whose entire menu says
  `Master Trust`.
  **IT DOES NOT CONTRADICT v189 and the code comment says so where the next
  reader will stand:** v189 kept `master trust` out of `TYPE_SUFFIX` because
  that arm STRIPS the words off a LONGER name; this test is anchored `^…$` on
  the WHOLE name. One vocabulary entry was settling two different questions.
  **PRE-REGISTERED:** `confident` −5 at most, every loss inside {Corteva 26,098,
  New York Life 19,598, New York Life 15,104, DuPont 13,884, PPC 1,600};
  `audit-generic-names` **212 → 213, MEASURED not estimated**;
  `audit-dominant-row` stays 0; Jones Day (88.2%) and Ahold Delhaize (70.0%)
  stay published, under the 90% floor this change does not touch.
  **THE THRESHOLD NUMBER I EXPECTED WAS WRONG:** I predicted 212 → ~265, past
  the 230 escalation threshold this record reserves for the owner, and nearly
  queued the item on that basis. 52 of the 53 plans were already counted.
  **Sixteenth instance of a measurement correcting an estimate about to be
  published.** 12 controls green (six must-FLAG, six must-KEEP including both
  v189 pins and four real trust-NAMED funds); `parser-gate.mjs` all green.
  `docs/accuracy-log.md` 2026-09-28 (23:1xZ).
- **MIRRORED 2026-09-28 23:1xZ (`bb7cdc5 → b6b3793`), UNFORCED ON BOTH CHECKS**
  — a plain fast-forward, data gate +0 / −0. Pages #664 built the prior mirror
  `success`.
- **#495 PASSED ITS PRE-REGISTERED TEST TO THE ROW** (`conclusion: success`,
  data commit `b6b3793`): `sec tickers` **338,463 rows across 37,034 plans**,
  exactly predicted; coverage line byte-identical (confident 60,103, HIGH 4,
  overshoot 325, dl 129). Read out of the store: the American Funds flagship
  family now publishes on **1,669 rows / 1,443 plans / 1,459,357 ppl-weighted**
  (RGAGX 570, RBFGX 543, RIDGX 169, RGAEX 90, RGACX 80 …), **`HOSBX` and
  `PRTBX` still 0**, and **`RIGGX` holds at 107 rows** — the must-keep the
  first draft of that rule would have destroyed.
- **PREVIOUSLY IN FLIGHT: #495, dispatched 2026-09-28 22:2xZ on `bb7cdc5`, observed queued.
  NO PARSER BUMP.** **GROWTH, BOND AND INCOME FUND OF AMERICA RESOLVE AT LAST —
  203 rows / 158 plans / 141,142 ppl gain a ticker, 0 withdrawn, 0 flipped.**
  All 102 distinct filed names read; every one an American Funds flagship
  (RGAGX/RGAEX/RGAFX/RGACX/AGTHX, RBFGX/RBFEX/RBFFX/RBFCX,
  RIDGX/RIDEX/RIDFX/RIDCX/AMECX, RAMEX/RAMCX/RAMFX), each stating a share class
  and getting that class. **Cause: the manager gate needs a house on BOTH sides
  and these have it on neither** — American Funds registers its three largest
  funds under their bare product names, and the escape hatch for house-less
  registrants required the FILED name to supply a house, so it could never fire
  for the family it was written for. **The discriminator is this cycle's own,
  used in the opposite direction:** a house-less series may answer a house-less
  filed name only when its key is not ENTIRELY descriptive — `short term bond
  america` keeps `america`, Homestead's `short term bond` keeps nothing.
  **A FIRST DRAFT WITHDREW 127 CORRECT ROWS** (`American Funds International
  Growth and Income R6` → RIGGX, three descriptive words) and the whole-store
  diff caught it before anything shipped: the test is asked ONLY when the filed
  name names no house. **AND A PINNED EXPECTATION I WROTE WAS WRONG**, caught by
  the selftest before commit — the bare `International Growth and Income Fund
  R6` must REFUSE and resolves through its issuer cell instead. *The rule is
  about what the STRING can discriminate, not which fund a reader knows is
  meant.* **Restores 6 of the 7 rows the previous fix cost**; `Lord Abbett Short
  Term Duration Income Fund R6` → LDLVX stays refused and is named, not rounded
  away (1 row / 123 ppl). Real merge: `sec tickers 338,260 → 338,463` across
  37,028 → 37,034 plans, CONFIDENCE DIFF +0 / −0. **`--selftest` 62/62**; the
  pre-change gate fails by name on exactly the 5 new must-gain cases and holds
  the other 57. `docs/accuracy-log.md` 2026-09-28 (22:3xZ).
- **MIRRORED 2026-09-28 22:3xZ (`85621bd → bb7cdc5`), DATA GATE UNFORCED
  +0 / −0**; `--force` covered the GIT check alone over main's one cron commit,
  evidence first: **0 acks and 0 plans the branch lacked, 0 acks newer on main,
  0 confident on main the branch lacks, plans array byte-identical.**
- **#493 PASSED ITS PRE-REGISTERED TEST TO THE ROW** (data commit `1d1480a`):
  `sec tickers` **338,260 rows across 37,028 plans**, exactly predicted; the
  coverage line byte-identical (confident 60,103, HIGH 4, overshoot 325, dl
  129). Read out of the store, not the log: **`HOSBX` 0 rows and `PRTBX` 0
  rows** — the wrong houses are gone — and the flips landed (TASTX 5, TISIX 21,
  VFIRX 80, CFSTX 1). Pages #662 built the mirror `success`.
- **PREVIOUSLY IN FLIGHT: #493, dispatched 2026-09-28 21:4xZ on `bd8e0fa`. NO PARSER BUMP — it exists to let the MERGE rewrite `stk`.**
  **A DESCRIPTIVE SERIES NAME WAS MANUFACTURING A HOUSE AND THE MANAGER GATE
  PUBLISHED IT: 187 rows / 204 plans / 278,339 ppl / $116,678,251 stop being
  told their short-term bond holding is HOMESTEAD's.** `managerPhrase` extends
  past a generic lead, so HOMESTEAD FUNDS INC's bare-named `Short-Term Bond
  Fund` series yielded the phrase **`short term`** — rejected only when EVERY
  word is descriptive, and **`term` was the one descriptive word missing from
  the list**. So `short term` became a manager key, and it is a token of every
  house's short-term bond fund: the gate admitted Homestead for Vanguard,
  Victory, TIAA-CREF, PIMCO, Allspring, Virtus, Schwab, Invesco, Transamerica,
  Calvert, DFA and American Funds holdings. **Third instance of a shape this
  file's own comments record twice** (`t` from T. Rowe Price; `bond fund`
  matching a filed `High Yield Bd Fund`) — *a phrase that describes what a fund
  holds names no house.*
  **16 rows FLIP to the house the filing's ISSUER cell names** (`Short Term
  Bond Fund` [iss Transamerica] → TASTX, [iss Nuveen] → TISIX; eight Vanguard
  short-term TREASURY rows off **PRTBX**, T. Rowe Price's short-term BOND fund,
  wrong twice over) — unreachable before, because the bogus direct hit returned
  first and the issuer path was never consulted. 2 rows GAIN one.
  **COST NAMED, 7 rows / 1,418 ppl, not zero:** the American Funds `Short-Term
  Bond Fund of America` family (RAMCX/RAMEX×3/RAMFX) and `Lord Abbett Short
  Term Duration Income Fund R6` → LDLVX lose a CORRECT answer, because those
  registrants name no house either. **QUEUED, not bundled:** the house-less
  registrant escape hatch should fire when the series key is not ALL-descriptive
  (`new world`, `american balanced` survive the same rule).
  **MEASURED THROUGH THE SHIPPED PATH AND THE FIRST NUMBER WAS A PROXY:** a diff
  of `resolve`'s raw answer said 232 rows; **merge stores a ticker only when the
  answer is NOT `comparable`**, and under that rule it is 187/16/2 — which the
  real merge then reproduced to the row (`sec tickers 338,445 → 338,260` across
  37,059 → 37,028 plans). **PRE-REGISTERED for #493:** that same line, coverage
  byte-identical (confident 60,103, HIGH 4), CONFIDENCE DIFF +0 / −0.
  **`--selftest` 55/55**, 7 new cases pinned on both sides; the pre-change file
  fails by name on exactly those 7 and holds the other 48, including the
  already-pinned `Vanguard Short Term Bond Index Fund` → VBISX*.
  **FOUND BY THE ROW THAT DID NOT FIT** — it came out of the override draw
  below, where 24 of 25 were the SEC reading a share class correctly and the
  25th was a different fund; chasing that one row found a defect unrelated to
  the override and larger than it. `docs/accuracy-log.md` 2026-09-28 (21:2xZ).
- **THE OVERRIDE QUESTION IS ANSWERED — NO, AND IT STAYS QUEUED, with three
  dead discriminators recorded so they are not retried.** May the SEC index
  replace a published `fund-er.js` ticker on the 744 names / 3,844 rows / 2,643
  plans / 5,962,185 ppl where both name a fund exactly and disagree? A random 25
  read one by one: **24 SEC-right** (share classes the pattern table ignores),
  **1 SEC-wrong** — `American Funds The Growth Fund of American R6` → RGWGX
  where the answer is RGAGX, because **the filing misspells "America"**, so the
  right series stops being a token-subset. `resolve`'s leftover ranking normally
  picks it and its comment names this exact pair, so the matcher is sound and
  the candidate set is the problem. **FAILED discriminators: (1) same-series vs
  different-series** (1,189 / 2,655 rows — useless, K6 funds are separate
  SERIES); **(2) series-key length** (the ≤2-token band is 435 rows and is
  dominated by CORRECT answers — `VWENX→VWELX`, `FCNTX→FCNKX`, `FBALX→FBAKX`,
  `VPMAX→VPMCX`); **(3) series key retains a non-asset non-house token** (kills
  `fidelity balanced` → FBAKX, correct). **The blocker is unchanged: 3,513 of
  the 3,844 rows also publish a NAME-based ER**, so correcting the ticker alone
  leaves a K6 row showing the retail fee beside the K6 symbol.
  **Sized in passing, live and unfixed:** the `of American` misspelling is **39
  distinct names / 47 rows / 46 plans / 75,937 ppl**; most resolve to nothing
  (safe) and **4 rows publish a wrong fund as fact** (RGWGX ×3, RGWEX ×1).
- **PREVIOUSLY IN FLIGHT: #492 (build-data) and `site-test` #102, both
  dispatched
  2026-09-28 20:2xZ on `bb8b291` and both observed `in_progress`. NO PARSER
  BUMP** — the work list is the 129 dead 403s, so #492 exists to let the MERGE
  write the new field. **PIECE (1) IS SHIPPED AND IT REACHES READERS: 147,835
  rows / 29,979 plans / 43,455,784 participants / $297,213,426,113 gain a fund
  ticker they did not have**, resolved EXACTLY from the SEC file. `merge-4i`
  resolves each row once and stores `stk`; `lookupTicker` reads it LAST, after
  every `fund-er.js` attempt, so it can only fill a blank. Shards 226 → 230 MB,
  **none of it at boot** (they are fetched per-plan already). **It cannot add a
  FEE** — `fundER` is called on the NAME and never on a ticker, checked before
  a line was written.
  **VERIFIED ON THE PAGE:** Paychex Retirement (**645,304 ppl**) gains six,
  `Vanguard Growth Index Fund Institutional Shares` → **VIGIX** rendering with
  no asterisk beside the 0.050% ER the name supplies; Source 4 Solutions
  (127,153) gains 28 of 50. Every gained row states a share class and gets that
  class.
  **AND THE CROSS-CHECK IS THE LARGER FINDING — two sources for one fact is the
  cheapest audit there is.** On **14,194 names both sources name a fund exactly;
  they agree on 13,450 and DISAGREE on 744 — 3,844 rows / 2,643 plans /
  5,962,185 ppl / $35.3B — and reading them the SEC is right every time.**
  `fund-er.js` ignores a share class the filing states: **K6 2,564 rows**
  (`Fidelity Total Bond K6` → FTBFX where the K6 fund is **FTKFX**),
  **Investor Shares 752** (`Vanguard 500 Index Fund Investor Shares` → VFIAX,
  the **ADMIRAL** class, so the fee shown is too LOW), **Class K 432**
  (`Fidelity Contrafund - Class K` → FCNTX, is **FCNKX**), other 96. **This is
  the FTBFX defect fixed once on 2026-09-15, in a class that fix did not
  reach.**
  **QUEUED, NOT OVERRIDDEN:** replacing a published ticker is a different claim
  from filling a blank, and **3,513 of the 3,844 also publish a NAME-based ER**,
  so correcting the ticker alone leaves a K6 row showing the retail fund's fee
  beside the K6 symbol. A half-corrected row is not obviously better than a
  wholly wrong one. `docs/accuracy-log.md` 2026-09-28 (20:4xZ).
- **MIRRORED 2026-09-28 16:3xZ, UNFORCED (`5e3941b → 32f4568 → c172a26`):
  `TYPE_SUFFIX` reaches three shapes it could not — 1,973 rows / 462 plans /
  2,996,261 ppl / $26,024,783,093, and +0 tickers gained, −0 lost, 0 flipped.**
  A pure honesty item for ~3.0M readers. `collective trust` allowed no trailing
  ` funds` (Waste Management's nine `PIMCO RealPath Blend 2030 Collective Trust
  Funds`), the bare `separate account` was absent, and **`common collective
  trust` WITH A SPACE was never matched whole** because the arm read
  `common\/?collective` — a slash and not a space — so only its tail could be
  cut. **`MASTER TRUST` STAYS OUT** and that is the load-bearing decision: it is
  a DESIGNATION, not a caption, so `Investment in BNSF 401(k) Plans Master
  Trust` ($3.52B) and `Korn Ferry Master Trust` are pinned controls.
  **FIVE OF THE SIX DAMAGES I PREDICTED LAST CYCLE WERE MY OWN HARNESS** — the
  shipped `keeps` screen already refused them, with a comment recording that its
  own first draft was caught the same way. Only `master trust` was real.
  **THREE THINGS THIS DRAFT GOT WRONG, each caught by a control:** a dangling
  connective the `keeps` screen cannot see (`Retirement 2055 Common and`);
  `DANGLING_TAIL` needing to be CASE-SENSITIVE, because an `/i` draft REFUSED
  real strips when a trailing share-class `A` read as an article — **the v188
  Affinity Plus decoy from the opposite side, where the cost is a refused repair
  rather than a damaged name**; and **the negative control FAILING TO FAIL**,
  green across all 37 filed-name cases because not one reached the new rule.
  Six cases pinned; the drift test now fails by name on 1 of 43.
  **Bonus: 30 rows where the new guard REFUSES a strip the old code made** —
  `Fidelity 500 Index Fund of mutual fund` had been rendering as `Fidelity 500
  Index Fund of`. Live, and nothing had counted them. 30 crawlable pages /
  671,309 ppl, every changed cell printed in full and read.
- **QUEUED from the 16:2xZ draw — the bare HOUSE name as a holding, re-derived
  at v189: 5,752 rows / 4,585 plans / 8,370,934 ppl / $26.9B across 409
  houses.** Intermountain Health (84,616 ppl) publishes `William Blair` at
  **$192,161,000 = 2.9%**. **The row count is not the harm** — most are a
  negligible sweep slice — so the split that matters is by menu share: **93 rows
  at ≥30%, 626 at ≥10%, 2,633 at ≥2% (4,337,212 ppl)**. Largest material slices:
  **Southwest Airlines `Dodge and Cox` 11.6% / $2,157,392,326** (85,764 ppl) and
  Universal Health Services `Fidelity` 9.8%. **NOT SHIPPED:** v167 closed this
  in the DESCRIPTION column and left the IDENTITY column alone by design, and
  `William Blair` is what that column says — replacing it is a claim, not a
  repair, so it is a parser-side contest change.
  **MY FIRST NUMBER WAS WRONG BY HALF (10,441 rows / 13,097,812 ppl)** because
  the house list was built by FREQUENCY alone, which swept in real PRODUCTS:
  `Vanguard Total Intl Stock Index Admiral` stands alone as an issuer on **936**
  rows, `Voya Fixed Account` on 1,023. The identity column legitimately carries
  fund names since v126, so frequency cannot tell a firm from a product.
  **Eleventh instance of a measurement reporting on the harness, and the second
  in two cycles where the tell was a list printed in order to READ.**
- **ANSWERED AND THE ANSWER IS NO: the 90% dominance floor must NOT come down.**
  #489's verdict pointed at the threshold (Tides Center 84.4%, Finch Paper
  88.2%). A threshold table said a 0.60 floor withdraws 105 plans / 373,062 ppl
  — **and acting on it would have destroyed a real menu for 67,246 people.**
  **General Motors** leads with `Common collective trusts` at **66.4%** and
  carries **`Conservative Income Fund` $2,781,021,000**, `Core Plus Bond Fund`
  $875,008,000 and two more real separate accounts behind it.
  **Morgan Stanley Domestic Holdings leads at 62.1% — SMALLER than GM — and
  every one of its ten rows is an asset class** (`Corporate equities`
  $6,134,568,486, `Government and agency securities`, `Repurchase agreements`,
  `Derivative instruments`, `Cash and cash equivalents`). **81,090 participants
  are shown a schedule of assets BY CATEGORY as their fund menu**, ratio 0.975,
  and no guard can see it: dominance asks about ONE ROW, and no setting of a
  one-row threshold separates these two plans.
  **THE VOCABULARY HOLE IS REAL AND WAS FILED IN THE WRONG POPULATION.** This
  file has said since 2026-09-11 that `isGenericTypeName` covers VEHICLES and
  not ASSET CLASSES, and called it *"too small to fix: 29 plans / 12,688
  participants"* — measured inside the `band-hi` GAP bucket. It is a
  **PUBLISHED-lineup** defect. Re-sized where it lives, with an anchored
  experimental arm controlled 13/13 both ways: **9 plans / 86,175 ppl** newly
  reach ≥80% of value naming no fund — **of which Morgan Stanley is 81,090, 94%
  of the class.** So it is one very large plan and a small tail, not a large
  class; the count was never the point.
  **OWNER DECISION, nothing shipped:** the implied change is not a vocabulary
  edit but a **whole-table test** (*what share of the menu's VALUE names no
  fund*) beside the existing one-row test — and widening the vocabulary moves
  `audit-generic-names`, at **212 against the 230 threshold** this record
  already leaves to the owner. **Method note worth more than the finding: the
  threshold table's decisive column was computed from `fundTickerInfo`, which
  cannot name a CIT or separate account BY DESIGN, so "no identifiable fund"
  read as "junk". Reading eight plans' rows is what stopped it.**
  `docs/accuracy-log.md` 2026-09-28 (15:2xZ).
- **ALSO FOUND, small and unfixed:** General Motors PN 002 publishes the
  AUDITOR'S OWN ADDRESS AND NAME as two holdings — `One Kennedy Square`
  $7,101,000 and `Ernst & Young LLP` $7,100,000.
- **MIRRORED 2026-09-28 15:0xZ (`fa71694 → 313efbd`), GIT CHECK UNFORCED**
  (main held nothing the branch lacked); **`--force-data` over ONE named loss,
  read first**: 11 Capital, Llc (251 ppl) published `MUTUALFUND ••` at **94.2%**
  of a four-row menu — the v105 shape v189 exists to catch.
- **#489 PASSED ALL FOUR PRE-REGISTERED TESTS — and the case it was WRITTEN FOR
  is still publishing the defect, which matters more than the pass.**
  `confident` **−1** against a ceiling of 8, the one loss inside the named set,
  `audit-dominant-row` **0**, `audit-generic-names` **212** against ~212
  predicted, `overshoot` held at **325**.
  **Seven of the eight were rescued by the prior-year fallback and FIVE are wins
  larger than the withdrawal would have been** — Smc Corporation Of America
  (2,137 ppl) publishes **46 MFS Lifetime rows**, Conga (1,228) **25 Vanguard
  Target Retirement rows**, Realty Center (504) 26, Ims Masonry (378) 36, Ron
  Bouchard's (194) 32, all real menus where a kerned asset-class statement
  stood. That is v188's rule repeating: **a guard that withdraws is sometimes a
  guard that PROMOTES**, and it is why the prediction was a CEILING plus a named
  set rather than a number.
  **BUT Tides Center (813 ppl) still leads with `Regi s tered i nves tment compa
  ni es` at 84.4%** of its 2023 fallback, where it led at 97.1% of its 2024
  filing, and **Finch Paper PN 2 (437) leads with `M utual Fund` at 88.2%**. The
  guard refused the 2024 region; the fallback served an earlier filing carrying
  the SAME SHAPE, now just under the 90% floor. **So the limit is the 90%
  THRESHOLD, not the vocabulary** — exactly what v188's residuals already said
  (Flashparking 82.2%, Fiber Instrument 89.4%) and I failed to carry into v189's
  prediction. Both join the owner-queued class of lineups leading with a bare
  asset-class label at ≥60%. **A version can pass every test it registered and
  leave its motivating case unfixed.**
- **MIRRORED 2026-09-28 15:0xZ: a wrapped loan description's continuation line
  is no longer published as a fund — 627 rows / 627 plans / 1,394,114 ppl /
  $1,131,565,111**, Nissan (22,188, `at rates of interest ranging from 4.25% to`
  at $63,385,312) and **Dollar General (225,308, `from 3.21% to`)**. **NOT what
  v181 fixed:** `LOAN_ROW` is anchored on the name BEGINNING with loan words —
  which is what keeps `Bank Loan Fund` safe — so a fragment that never says
  "loan" cannot be reached. Two conditions, neither a list of fund names: the
  rate must be quoted as a RANGE (a loan has a range, a GIC has one), and
  NOTHING may be left once the loan description is stripped (`General Account
  (interest at 3.05%)` is KEPT). **The name is replaced here and nowhere else in
  the loan family**, because these rows are an artefact of our parse rather than
  a filed name; value and percentage untouched.
  **The unreadable half was settled STRUCTURALLY:** 117 accepted names are bare
  rate fragments that name nothing either way, and **in 626 of 627 plans the
  accepted row is the menu's ONLY loan row**, with no plan holding more than
  one.
  **THREE THINGS IT GOT WRONG FIRST:** (1) my draft typed **two REAL holdings**
  as loans — Griswold's `Interest Rate of 0.15% to 0.62% … Principal` is a
  Principal GIC crediting rate, and the strip vocabulary listed `principal` for
  `principal residence` and so **deleted a house name**; caught by READING the
  accepted names, both now pinned; (2) **the sizing I read was not the rule I
  shipped** — a candidate pre-filter meant the predicate accepted **627 where I
  had read 372**, so all 117 extra names were read before shipping (and the
  wider net is what reaches Dollar General); (3) the two cells said the same
  thing, the redundancy the nameless-row change removed one cycle earlier.
  Tethered on 19 names, **9 of which must come back false**, negative-controlled.
  **8 crawlable pages / 275,703 ppl**, attributed cell by cell against the
  regenerated files, 0 unexplained.
- **RETIRED, and the number must not be carried forward: the foreign-schedule
  CANDIDATE set of 181 plans / 192,948 ppl is not that class.** Living Well
  publishing The Arc of Walker County's rows is real and stands at **N=1 known**;
  the same-value twin signature that sized it carries **no enrichment** — 0 of
  12 drawn from the candidate set, 0 of 30 drawn flat from all published
  lineups, under a discriminator that FIRES on the known positive.
  **Two harnesses produced a rate first and both measured something else:** 50%,
  driven by `012345678`/`123456789`, the blank Form 5500 instruction page's
  example EINs; then 25%, driven by AUDITORS and DFEs, which every filing names
  by design. **A discriminator not shown to fire on the one case you have READ
  is not a discriminator.** Ninth instance of a measurement reporting on the
  harness.
- **PREVIOUSLY IN FLIGHT: #489 (v189), dispatched 2026-09-28 13:4xZ, ran
  `success` 13:44–14:47Z.** A kerned asset-class label no longer defeats the
  dominance guard: Tides Center (813 ppl) publishes
  `Regi s tered i nves tment compa ni es` at **97.1%** of a four-row menu, the
  v105 shape, invisible because a broken font sprays spaces through the label.
  43 rows / 42 plans / **101,200 ppl** publish such a name; **8 plans / 5,942
  ppl** have one dominating at ≥90%. The comparison is v141/v142's own — strip
  the spaces from both sides — DERIVED from `GTA_SOURCE` with the same import
  assertion the v137 pluralisation and v187 append carry, and placed in
  `isGenericTypeName` so guard, both audits, `diff-lineups` and the browser twin
  ask ONE question.
  **PRE-REGISTERED as a CEILING plus a named set:** `confident` falls by AT MOST
  8 and every loss must sit inside {Smc Corporation Of America 2,137, Conga
  1,228, Tides Center 813, Realty Center 504, Finch Paper 437, Ims Masonry 378,
  11 Capital 251, Ron Bouchard's 194}; `audit-dominant-row` stays 0;
  `audit-generic-names` 182 → ~212 after the withdrawals.
  **THE MARGIN IS STATED, NOT TUNED:** on the v188 store the new predicate reads
  **220 against the 230 escalation threshold**. The count rises because the
  audit can now see rows it was blind to; the threshold was calibrated against
  the narrower predicate and **has NOT been raised**. A later run crossing 230
  is a real signal.
  **THREE THINGS IT GOT WRONG FIRST, each caught by a control:** (1) the
  established idiom gates a despaced test on `KERNED`, which fires on **none**
  of these ten shapes — gating would have made the change inert while every
  test passed; it is safe ungated because the vocabulary stays ANCHORED, and 22
  probes including the v188 pinned controls were run before a line shipped;
  (2) **the smoke tether did NOT fail** when the arm was added — not one of its
  23 cases reached the new rule, the decorative-guard failure one step later;
  six kerned cases are pinned and the control now fails by name on exactly six
  of 29; (3) **the generator that writes the browser twin lived in a session
  scratchpad and a container restart wiped it, the second time that directory
  has been cleared mid-session.** It is now `scripts/gen-generic-twin.mjs`, in
  the repo, probing every arm and refusing to write a truncated block.
- **MIRRORED 2026-09-28 13:5xZ, UNFORCED** (`7f3d66a → 242971d`, data gate
  +0 / −0). Carries **v189 CODE over the v188 STORE**, which is safe by
  `SCHEDULE_INCREMENTAL`, and gets the DISPLAY half to readers now: the 43
  kerned rows are typed *"Filing names no specific fund"* without waiting for
  the re-parse. The withdrawal of the 8 dominant lineups needs #489.
- **`PARSER_VERSION` in the tree is 189 and the store is at 188 until #489
  lands.** #481 (v187 + v188) ran `success` 20:59–21:54Z on `5dd4369d`, store
  commit `42739932`. #480 (v186) ran `success` 19:54–20:48Z, **+7 / −0**.
- **MIRRORED 2026-09-28 10:5xZ, UNFORCED ON BOTH CHECKS** (`40d2fa5 →
  7b73ea1`, fast-forward; data gate +0 / −0). Carries run **#485**, dispatched
  by `workflow_dispatch` after a `scripts/**` push produced no run — the
  documented intermittent trigger, handled by the documented remedy.
  **#485 PASSED ITS PRE-REGISTERED TEST: the accuracy trail gained EXACTLY ONE
  line**, HIGH **4 = the baseline**, WARN 608 (544 + the 64 ticker conflicts,
  expected), confident 60,104, pv 188 at 99.8%, dl 128, overshoot 325.
  **(1) `audit-data.mjs` no longer writes to the accuracy trail unless it is a
  pipeline run.** It reads as a REPORTING step and had a write side effect on
  `docs/coverage-history.jsonl`; five lines describing no pipeline run were left
  in the tree overnight, one reading `warn: 1970` from an inverted control.
  **The condition is "CI, unless told otherwise" and NOT a workflow flag on
  purpose:** a flag the workflow must pass fails SILENT and in the worse
  direction — forget to wire it and the trail stops, taking the REPARSE
  VERDICT's baseline with it. Controlled in all four directions with the file's
  own line count as the witness, then in production by #485.
  **(2) The 4i section caption in the ISSUER column — 789 rows / 238 plans /
  829,353 ppl, landing on the next merge.** The mechanism was already right and
  in the right place (merge-4i, gated on *does the remainder stand alone
  elsewhere?*); only its VOCABULARY was narrow. Dominant shape is a bare
  leading `Company`, 569 rows, the tail of a wrapped `… Trust Company`.
  **My first draft produced two dangling fragments that no count could see** —
  `Cash equivalents` → `equivalents`, `Company of America` → `of America` — and
  **both cleared the standalone gate, which is the structural finding: a floor
  of ONE lets a single damaged row LICENSE the same damage elsewhere, so the
  gate can be fed by its own mistakes.** Fixed by requiring the remainder to
  begin like a firm. **And the sizing before it was wrong by a factor of
  forty** (33,716 rows claimed; the predicate could not tell a caption from a
  surname) — which also means the cost published an hour earlier with the
  issuer restoration, 6 rows / 5 pages / 33,059 ppl, was **too low**.
- **MIRRORED 2026-09-28 09:3xZ, UNFORCED ON BOTH CHECKS** (`c0f3003c →
  613f15c5`, a plain fast-forward; data gate +0 / −0). `pages-build-deployment`
  #637 built it `success` at 09:34Z, and `site-test` #98's JOB reads
  `conclusion: success` with every step green — read, not assumed.
  **What reached readers, and the second half is much the larger:**
  (1) **caption class A — 524 rows / 446 plans / 1,335,275 participants** stop
  seeing the same word twice (`Mutual funds` in the name, `Mutual fund` in the
  type) and are told *"Filing names no specific fund"*, which is itself a filed
  fact; 112 of those rows are ≥50% of their plan's menu.
  (2) **THE CRAWLABLE PAGES HAD NEVER PRINTED THE ISSUER — 16,572 rows / 2,229
  pages / 27,249,112 participants.** `build-seo-pages.mjs` rendered the name
  alone, so the 4i identity column the report has shown since v126 was
  discarded on the surface search engines read. **Fourth instance of the
  two-display-paths divergence and by far the biggest.**
  **The two are ONE change because the issuer DECIDES the qualifier**: a row
  named `Mutual Fund Shares` whose issuer reads `Vanguard Target Retirement
  2030` is named in the report and was nameless on the page, so the report's
  issuer exclusion could not be copied across. 2,280 pages regenerated /
  28,255,631 ppl, 0 unexplained. **Two of my own drafts were wrong and each was
  caught by a control, not by reading:** a loan arm and a brokerage-by-name arm
  whose negative control FAILED TO FAIL (both structurally unreachable — a name
  must be a bare vehicle type before any exclusion is asked; measured across all
  912 generic-named rows: subtotal 2, stock 110, brokerage 0, loans 0), and a
  twin generator whose END MARKER was no longer the block's last line, leaving a
  STALE duplicate that won by hoisting order while the tether stayed green
  because the stale copy assigned the same window hook. **A generator that edits
  in place is only as honest as its end marker.**
- **MIRRORED 2026-09-28 09:5xZ: the `(continued)` caption stripped from the
  holding NAME — 96 rows / 80 plans / 461,671 ppl**, IBM (149,818),
  NY-Presbyterian (66,650), Northwell (61,177), UPenn (45,173). **Found by the
  09:0xZ participant-weighted draw** inside a published 31-row menu whose other
  29 rows are clean — no audit sees this shape. **v173 closed this class in the
  ISSUER column and it is closed THERE**; the same words in the NAME column were
  untouched, and the leading-parenthetical arm cannot reach them because it
  requires the string to OPEN with a vehicle type while these captions open with
  a firm, a heading or a model portfolio. **A fix for one COLUMN is not a fix
  for the class.** +1 ticker, 0 lost, DRIFT 0 over 1,720,349 rows, 2 crawlable
  pages. The relaxation that made it work is worth keeping: **`the` is furniture
  when a remainder must prove it is a name and is NOT when `(continued)` has
  already proved it** — the same token that damaged the comma family's first
  draft, now in the opposite direction.
- **LIVE ON MAIN: the v188 store — MIRRORED 2026-09-27 22:2xZ**
  (`5dd4369d → b351f295`). The GIT check passed UNFORCED (fast-forward, main
  held nothing the branch lacked); **`--force-data` covered the 16 withdrawals,
  every one inside the pre-registered named set of 29 and every one read before
  the run was dispatched.** pv 188 at 99.8%, fetch failures 128 (0.19%), reader
  failures 2.
- **#481 PASSED ALL FOUR PRE-REGISTERED TESTS, and the surprise is what the
  withdrawal UNBURIED.** confident **−16** against a ceiling of 29, **16 of 16
  losses inside the named set, 0 gained**; **`overshoot` held at 325** exactly as
  predicted; **`audit-dominant-row` 29 → 0**; `audit-generic-names` 182 against
  ~178 predicted. 17,922 participants stop being shown an asset-class statement
  as their fund menu.
  **13 of the 29 kept publishing: nine rescued by the prior-year fallback** (the
  mechanism the pre-registration named as unreproducible in-sandbox, which is
  exactly why the prediction was a CEILING plus a named set rather than a
  number), and **four with no fallback — of which two are WINS larger than the
  withdrawal would have been.** Management Sciences For Health (653 ppl) now
  publishes **32 real Vanguard Target Retirement funds** where `Mutual Fund
  Shares` held 93.6% / $95,537,700; Blue Cross and Blue Shield of Vermont (560)
  publishes its **28-row Empower schedule** where `Commingled funds` held 97.5%.
  **That is v136's rule working by itself — an unpublishable winner may not bury
  a publishable menu — so a guard that withdraws is sometimes a guard that
  PROMOTES.** Neither was predicted in either direction: a prediction of
  "withdrawn" is a prediction about one REGION, not about the filing.
  **Two residuals, both named, and they invert v188's own diagnosis.**
  Flashparking (671 ppl) still leads with `Mutual fund shares` at **82.2%**,
  because its OCR parse gained a `FLASHPARKING INC.` row of $1,867,889 — its own
  sponsor name — which diluted the statement under the guard's floor. Fiber
  Instrument Sales (493) leads with **`Shares in`** at 89.4%: the decoration
  survived and the thing it decorated did not, so the strip has nothing to remove
  and the remainder is not in the vocabulary. **So the limit on this fix is the
  90% THRESHOLD, not the vocabulary** — the opposite of the diagnosis that
  produced v188 — and both plans join the owner-queued class of 85 lineups
  leading with a bare asset-class label at ≥60%. Worth naming on its own:
  **a dominance guard can be defeated by adding junk.**
- **LIVE ON MAIN: the v186 store — MIRRORED 2026-09-27 20:5xZ, UNFORCED ON BOTH
  CHECKS** (`a6bf022e → 5dd4369d`, a plain fast-forward: main held nothing the
  branch lacked, so no `--force` was needed on the git check either). Data gate
  **+7 gained / −0 lost**; dominant pv 186 at 99.8%, fetch failures 128 (0.19%),
  reader failures 2. It carries v188 CODE over the v186 STORE, which is safe —
  see the bullet above.
  **What reached readers, and only one half of it was predicted.** Seven plans
  gain a published menu (Bekaert 1,698 ppl, Zeta Associates 689, California
  Online Public Schools 532, James R. Vannoy & Sons 439, La Tortilla Factory 412,
  Indoff 371, Champlin/Haupt 164 — 4,305 participants), and **five plans stop
  publishing holding values inflated a hundredfold**: `overshoot` 330 → 325,
  −26,503 participant-weight, led by **Swbg, Llc at 17,751 participants whose
  ratio went 1.395 → 0.910 while staying confident** (its rows are Empower legend
  codes, the OCR-damaged family). All five remain published with corrected
  numbers; **19,126 participants in total**. I had pre-registered ONE plan and
  "`overshoot` must not move", because I verified the fix on the single specimen
  that produced it and never sized the shape store-wide.
  **CODE AHEAD OF THE STORE IS SAFE TO MIRROR, and the line that used to sit
  here saying otherwise was wrong.** It read "THE MIRROR IS HELD ON PURPOSE …
  mirroring that makes main's own `:23` cron run a duplicate full re-parse ON
  MAIN", while the v172 entry forty lines below said the opposite.
  `fetch-4i.mjs:375` reads `SCHEDULE_INCREMENTAL`, set by the workflow for
  `schedule` events only, and under it **a parser-version gap is not work**: the
  cron ingests new filings and retries the cheap non-`no-section` errors and
  leaves the bump to the dispatch that carries the verdict. The only mirror
  hazard that is real is a run IN FLIGHT ON MAIN when the force push lands.
- **v188, GATED AND READY: the vocabulary was right and the DECORATION was the
  hole. 29 plans / 27,977 participants stop being shown an asset-class statement
  as their fund menu.** `GENERIC_TYPE_ANY` is anchored `^…$` on purpose — an
  unanchored copy deletes real funds (the v168 `appreciat` lesson) — and its
  source already carried `(?:total )?`, so exactly one decoration had been
  allowed for. A filer writing `Shares of Registered Investment Companies`,
  `Mutual fund shares`, `Sub-total: Registered Investment Companies` or
  `DESCRIPTION: POOLED SEPARATE ACCOUNT` has written the same label with a
  wrapper round it and escaped every guard. **So the fix is not a wider
  vocabulary but a wider set of things that may sit AROUND it**:
  `stripGenericDecoration` removes only material that cannot identify a fund and
  the SAME predicate is asked again, exported as `isGenericTypeName` and read by
  the guard, both audits and `diff-lineups` so the copies cannot drift.
  Measured whole-store, not sampled: **157 rows across 49 DISTINCT names become
  visible and all 49 were read — every one a decorated asset-class label, not one
  a fund.** Withdrawals are named ack by ack (Bhi Energy 5,868 ppl, Woodgrain
  5,758, Standard Retirement 2,311, Eclinicalworks 1,874, Springbrook 1,777 …),
  **0 of them sit in the overshoot set, so `overshoot` must NOT move (325)**, and
  confident falls by AT MOST 29 — less if a prior-year fallback rescues any,
  which cannot be reproduced in-sandbox because `fallbacks.json` is artifact-only.
  **`audit-generic-names` was under-reporting by 97 plans: 109 → 206 on the same
  store once it reads the same question, and ~178 after the withdrawal** —
  `audit-data.mjs:584` escalates above 230, so it stays dormant, and that margin
  is now thin enough to be the owner's call rather than mine.
  **What it deliberately leaves alone is the evidence it is safe:** Fathom's
  `Fidelity Government Money Market Fund` at 95.7%, Talgood's `Vanguard
  tax-Managed Balanced Fund Admiral Shares Registered Investment Company`, Local
  360's pinned `AMERICAN FUNDS BLANC MUTUAL FUND` control and `Mutual of America
  MUTUAL FUND` all survive — a strip that removes only non-identifying wrappers
  cannot reach a name that identifies something. Nine specimens pinned, three of
  them DECOYS, including the deliberate MISS (Affinity Plus `Separate Account A,
  at fair value`, where a capital `A` may be a real designation and case is the
  only signal). **An import assertion caught a silent narrowing while this was
  being written**: folding the arms into one alternation dropped `Not Required`,
  because the footnote arm must stay case-SENSITIVE while every other arm must
  not, and one regex cannot be both.
- **HELD ~5 MINUTES ON CI AND THEN MIRRORED IN THE SAME CYCLE — `site-test` #89
  on `a8269d2c` reads job `conclusion: success`, every step green including the
  new tether and the map test.** The RUN-level `status` still said `in_progress`
  when the job had finished, which is the #239 lesson in miniature: **only
  `conclusion` settles it, and the JOB carries it before the run does.** The hold
  was right — the local smoke test being green is not the same evidence, and this
  record carries the cost of confusing them (site-test red for ten consecutive
  runs while commit messages said "green" from a local run) — and it cost nothing,
  because nothing was queued behind it.
- **SHIPPED 2026-09-27 23:2xZ, and it is the largest reader-facing find of the
  day: THE CRAWLABLE PAGES HAD NEVER USED THE FILED-NAME CLEANER.**
  `build-seo-pages.mjs:185` rendered **`titleCase(f.name)` — the RAW stored
  name** — so not one arm of `app.js`'s `cleanFiledName` had ever reached a
  `p/*.html` page. Every display-time repair this project shipped was invisible
  on the crawlable surface: the leading CUSIP (`922908371 VANGUARD EXT MKT
  INDX-INST+`), the `(1)` footnote (recorded at 1.95M ppl), the OCR bar read as a
  share-class `I` (683k), the kerned de-spacer, the doubled house prefix (486k),
  `TYPE_PREFIX`, `TYPE_SUFFIX` — **and the UnitedHealth address strip shipped
  earlier the same day and recorded as reaching 274,906 participants, which
  reached the report only.**
  **MY FIRST NUMBER WAS WRONG AND THE CORRECTION IS THE METHOD.** A store-side
  proxy (`clean(name) !== name`) said 2,790 rows / 9,689,129 ppl. Regenerating the
  pages and diffing the FILES says **289 pages / 6,941,304 participants**, because
  `titleCase` already absorbed some differences. **The page is the artifact; the
  proxy is not.** Walmart PN003 **1,921,006**, Target 475,573, CVS 307,068,
  JPMorgan Chase 299,277, UnitedHealth 274,906, AT&T 203,226, Macy's 170,858.
  **SECOND TIME IN ONE DAY that two display paths diverged** — the
  false-precision defect was recorded as affecting the report and was only ever on
  these same static pages. The rule is earned twice: **there are TWO display paths
  and a claim about readers must name which.**
  Fixed on the `frozenClaimOk`/`coverageBand` pattern, because app.js is a plain
  browser script with no module system: canonical in `scripts/lib-disclose.mjs`,
  imported by `build-seo-pages.mjs`, twinned in app.js, and **TETHERED by
  `smoke-test.mjs`**, which runs the BROWSER copy against the module on fourteen
  real filed names and fails on drift. The module body was **extracted verbatim**
  from app.js rather than retyped. The 289 regenerated pages shipped in the same
  commit.
  **THE HONEST CAVEAT, because the headline overstates it:** Walmart PN003's page
  now renders `Fiera Asset Management Usa` where it rendered `Fiera Asset
  Management Usa Collective Trust` — that is the pre-existing `TYPE_SUFFIX` arm,
  and whether IT is right is a separate question this change does not settle.
  What shipped makes the two surfaces AGREE; it does not make every arm correct,
  and every arm now reaches twice as many readers, which raises the cost of any
  one of them being wrong. `docs/accuracy-log.md` 2026-09-27 (23:2xZ).
- **SHIPPED 2026-09-28 00:1xZ: caption class B's COMMA family — 1,097 rows / 98
  plans / 92,758 ppl, and 122 rows GAIN a ticker with 0 lost.** `Mutual Fund,
  Freedom Index 2030`, `Pooled Separate Account, TIAA Real Estate`. A comma after
  a COMPLETE vehicle type is a caption separator, and the arm strips only when the
  remainder has letters and is not a measurement basis, a bare class/series
  designation or a unit price — **120 rows correctly excluded.**
  **The screen's own first draft caused damage:** it included `the` and flagged
  three real funds (`Mutual Fund, The Growth Fund of America`, `The Investment
  Company of America`, `The Bond Fund of America`). Printing the suspects is what
  showed it; all three are pinned in the tether. **DRIFT 0** — the app.js and
  `lib-disclose` copies were compared over all 1,720,349 published rows.
- **SHIPPED 2026-09-28 01:2xZ — THE BARE-WHITESPACE FAMILY, and the discriminator
  is LENGTH, not a house list. 2,370 rows / 238 plans / 305,802 ppl, +10 tickers,
  0 lost.** It was refused twice and both refusals were right: a blanket strip
  turns `Stable Value Fund Fee Class R1` into `Fee Class R1`, and an outcome gate
  reached 19 rows because `fund-er.js` cannot name a Principal separate account
  or a CIT BY DESIGN. **The handoff proposed a HOUSE LIST and named its own
  weakness; it was not needed.** Printing every distinct remainder split the
  family at **four tokens** — below it `Shares`, `Fee Class R1`, `and`,
  `Omitted`, `at fair value`; at or above it `Fidelity Freedom Index 2030`,
  `PGIM Ttl Ret Bond R2 Fund`, `Am Fds EuroPacific Grth R6 Fd`, the last two
  exactly what the typed list missed. **The data chose the discriminator**, and
  an arm with no vocabulary has nothing to keep in sync. Length alone is not
  enough (`Class 25 - I` is four tokens of pure designation), so the remainder
  must also OPEN with a contentful token; GICs leave the vocabulary entirely
  because a GIC's filed name really is the type plus a contract NUMBER.
  **TWO PINNED CONTROLS FAILED MY OWN DRAFT, one from each of the last two
  cycles** — the v188 Affinity Plus decoy (`Separate Account A, at fair value`,
  cut to `A, at fair value` because the comma was not stripped before `A` was
  judged) and last cycle's `Index Fund invested in stocks included in the S&P
  500`. A control written one cycle earlier failed the next cycle's draft; that
  is the whole return on pinning them. **DRIFT 0** over 1,720,349 rows; surface
  named at **12 crawlable pages / 56,309 ppl**. Residue: ~45 leading
  parentheticals, ~20 em-dash/underscore connectives outside `[-–:]`.
  **AND A NUMBER I PUBLISHED TO MYSELF WAS WRONG:** the first page diff said 489
  pages / 12.6M ppl and I explained it as the cron's data commit — the snapshot
  directory was left over from the previous cycle. `git diff --stat p/` says 12.
  **An implausibly large number reports on the harness, not the data**, the
  fourth instance on this record.
- **AND THE ARM HAD A REGRESSION THAT ONLY A PAGE COULD SEE — CORRECTED 01:4xZ,
  final numbers 2,366 rows / 234 plans / 269,754 ppl / 11 crawlable pages /
  41,809 ppl.** BDO USA's regenerated page read `Funds (Continued) T. Rowe Price
  Retire 2030 Trust Fund` where it had read `Common/Collective Trust Funds
  (Continued) …`. **Regex BACKTRACKING**: the alternation's trailing
  `(?: funds?)?` matched ` Funds`, the `(?=[A-Za-z0-9])` lookahead failed on
  `(`, the engine gave the optional group back, and the anchor was satisfied one
  word early. 4 rows / 36,048 ppl, now 0 — `fund(s)`, `trust(s)`, `account(s)`,
  `compan(y|ies)`, `portfolio(s)` join the furniture. **The store-wide diff said
  0 tickers lost and DRIFT 0 over 1,720,349 rows and this row sat INSIDE the
  2,370 counted as an improvement. No count could see it; one regenerated page
  could** — the third time this week that *the page is the artifact* was the
  operative rule. **General form worth keeping: an optional group at the end of
  an anchored alternation is a silent SECOND anchor position.**
- **SHIPPED 2026-09-28 02:3xZ — PARTICIPANT LOANS ARE NOT A MENU CHOICE: 482
  rows / 482 plans / 1,369,274 ppl / $1,248,413,860**, exactly one row per plan.
  v181's treatment — **type the row, do not drop it**: the report reads
  *"Participant loans — not a menu choice"*, ticker and ER suppressed, value and
  denominator untouched so the money stays accounted for. **NOT what v131
  fixed** — that removed loan DESCRIPTION rows (7,052 → 9) and a row literally
  NAMED `Loan Fund` survived it: *a fix for one phrasing of a class is not a fix
  for the class.* **Measuring first NARROWED the defect and my own queue entry
  was wrong about half of it**: 0 of the 482 rendered a ticker and 0 an expense
  ratio, so there was no fabricated fee. **Both surfaces** — the crawlable pages
  have no type column, so there the qualifier goes in the NAME (17 pages /
  279,408 ppl). Side effect, additive by construction: `filedAvgER`'s coverage
  gate stops counting loans against fee coverage — **3 plans / 2,255 ppl newly
  publish an average-ER line, 0 lose one, 0 ER values change.**
  **MY FIRST SEO NUMBER WAS WRONG — a loose grep said 36 pages / 504,745 ppl**,
  counting a Schedule C SERVICE row and J&J's real `Loans Secured By
  Mtges-Resid.` mortgage holding. The shipped anchored predicate refuses both;
  the answer is 18. **Third time in one day that an implausible number reported
  on my harness, not the data.** Predicate canonical in `lib-disclose`, twinned
  in app.js, TETHERED on 18 names (8 of them real funds), and **both guards
  negative-controlled** — removing the typing fails the render assertion,
  a drifted twin fails the tether on 8 of 18.
- **AND THE ORPHANED-PAGE ITEM NOW HAS A LIVE INSTANCE, not just reasoning.**
  18 crawlable pages carry a loan row; **17 regenerated and `p/651156742-001.html`
  (2,673 ppl) did not**, because it sits outside `TOP_N = 5000`. A fix that
  shipped today demonstrably cannot reach it. Still the owner's call, because
  fixing it changes which URLs exist.
- **SHIPPED 2026-09-28 03:3xZ — THE AMERICAN FUNDS FEE TABLE WAS CALIBRATED FOR
  ONE SHARE CLASS AND PRICED ALL OF THEM: 10,387 fee cells removed / 2,227
  plans / 2,065,081 ppl / $9,258,280,862.** `fund-er.js` heads that block with
  its own comment — `--- American Funds (R6) ---` — and no pattern beneath it
  tests the class, so `American Funds Eupac R4`, `American Balanced Fund Class
  A` and `American Funds Trgt Date Ret 2040 R2` all published the R-6 number.
  **0 added, 0 values changed, 0 over-reach, 0 under-reach** — the guard only
  refuses. **NO REPLACEMENT NUMBER**: the per-class figures could not be
  SOURCED (capitalgroup.com and the Voya fact sheets are both egress-blocked)
  and a fee here is sourced, never derived, so the claim is WITHDRAWN rather
  than replaced. Confined to this house because the evidence is in-repo; `MFS
  Value Fund Cl A` is pinned as a control that must KEEP its number.
  **HOW THE CYCLE GOT THERE IS THE LESSON: the queue item was the missing
  TICKER, and measuring what those rows publish TODAY before adding anything
  showed 96.5% already carry an ER and every class carries the same one. A
  wrong number outranks an absent one**, so the target changed.
  **`fund-er-test.mjs` tested tickers only and had NEVER tested a fee** — now
  nine must-blank and nine must-keep fixtures, negative-controlled (disabling
  the guard fails all nine and prints the wrong fees). Surface: the crawlable
  pages render no per-fund ER, so this reaches the REPORT only.
  **And the harness was the bottleneck twice** — a 1.7M-row sweep still running
  after ten minutes, when the guard's first condition is `AF_HOUSE` and
  `fundER` is called nowhere else in the file. **A structural fact beats a
  sweep.**
- **STILL QUEUED, and unchanged by the above:
  THE AMERICAN FUNDS TARGET-DATE SERIES RESOLVES TO NO TICKER — 58,930 rows /
  5,903 plans / 4,410,671 ppl / $110,346,044,084, and 0 resolve**, while
  **56,870 (96.5%) already carry an estimated ER**. So `fund-er.js` prices the
  series by pattern and cannot NAME it; the same house's EuroPacific R6 resolves
  to RERGX on the same pages, which makes it one SERIES, not a matcher problem.
  **The share class splits it cleanly: 39,312 rows / 3,979 plans / 3,034,841 ppl
  / $77.8B STATE a class** (R6 33,674, R4 2,583, R3 1,875, R5 588, R2 522) and
  are assignable; **19,618 / 2,088 / 1,540,432 / $32.5B state none** and must
  stay blank — assigning R6 there recreates this record's own defect verbatim
  (4,321 rows publishing an R6 ticker for a name stating class A/C/R1–R5). At
  ≥25% of a menu the series covers **4,567 plans / 3,683,470 ppl** (WVU Health
  78.7%, Barnabas Health 78.0%, Brinker 48.0% of 52,713). Table work for
  `funds-and-tickers` or verified entries in the still-empty
  `data/fund-facts.json` — tickers must be sourced, never derived.
- **AND THE TWO SURFACES AGREE NOW AND STILL REACH DIFFERENT POPULATIONS.** The
  comma fix changes **4 crawlable pages / 8,166 ppl** against 98 plans / 92,758 in
  the report, because that family lives outside the generator's top 5,000 by
  assets. **Sharing the rule removed the divergence, not the difference in
  coverage — "what reached readers" still has to name the surface.**
  `docs/accuracy-log.md` 2026-09-28 (00:1xZ).
- **ALSO SHIPPED 23:2xZ, measured separately: `TYPE_PREFIX` widened — 169 rows /
  139 plans / 174,852 ppl, 0 tickers gained and 0 LOST.** The diagnosis is v188's
  one level up: the VOCABULARY was right and the **CONNECTIVE** was the hole. Only
  `- – :` were allowed, so every form the store uses escaped —
  `MUTUAL FUNDS SHARES / UNITS Fidelity 500 Index` (the column caption, no
  separator at all), `Mutual Funds, at Fair Value Schwab S&P 500 Index` (a
  measurement basis), `Money Market SHARES Fidelity Government Money Market Fund`.
  **The member read caught damage in my own draft:** `invested in` was an arm, it
  wins one row and **damages three** where the filed name really is `Index Fund
  invested in stocks included in the S&P 500`. The count (173 rows, 0 tickers
  lost) looked clean; printing every distinct before→after is what showed it.
  Dropped and pinned as a control. Residue named, not waved at: 1 doubled caption,
  5 leading accounting parentheticals, both strictly better than before.
  **This is a fraction of caption class B** (re-derived at v188: 4,680 rows / 701
  plans / 1,206,468 ppl), so B stays open and its remaining connectives are
  unmeasured.
- **FROM THE 22:2xZ DRAW, SIZED AND DELIBERATELY REFUSED: 495 rows / 158
  published plans / 170,917 participants / $827,869,631 publish an OCR'd Empower
  LEGEND CODE as the holding name** (`IFXAIX`, `1JLGMX`) — re-derived at v188 as
  its own shape rather than folded into v140's recorded "2,466 rows / 267 plans".
  The obvious display-side repair — strip the OCR'd leader, resolve the remainder
  as a ticker — **is refused on its own evidence**: only 67 of 495 remainders are
  tickers this project knows, and the other 428 print as
  `LIHKX`/`LINKX`/`LIPKX`/`LIRKX`/`LIJKX`, one family differing by a single middle
  letter, which is an Empower **internal vintage series** and not a ticker family.
  A five-character internal code colliding with a real ticker would publish a
  wrong fund and a wrong expense ratio, so the 67 hits are a fabrication risk, not
  a win. The correct route is v140's — the filing's own LEGEND — and for these 158
  plans it was not found, which makes this a parser item about LOCATING the legend.
  **The method note is the more useful half: the first outcome test returned 0 and
  the 0 was my harness.** `fund-er.js` matches fund NAMES and RETURNS a ticker; it
  does not take one (`fundTickerInfo("FXAIX")` is nothing,
  `fundTickerInfo("Fidelity 500 Index")` is `{tk:"FXAIX"}`). Reaching for the
  shipped predicate is not enough — **it has to be asked the question it
  answers.** `docs/accuracy-log.md` 2026-09-27 (22:3xZ).
- **OWNER-VISIBLE STATE FACT: `data/fund-facts.json` is EMPTY.** It holds
  `"funds": {}` and has since it was created 2026-09-17 — ten days, zero funds —
  while this file calls it "the ONLY place a fund's verified ticker + expense
  ratio + year-to-date RETURN may live" and it has its own agent, slash command,
  validator and workflow. Nothing is broken; it has never been populated. Recorded
  because a file described as the sole home of a fact type should not be
  discovered empty by a sizing script.
- **`audit-dominant-row` WAS 1 AND v185 RETURNS IT TO 0 — the cause was a guard
  computed on rows that no longer exist.** Cobre Valley (578 ppl) publishes
  `Registered investment companies` at **96.6%** of a 4-row menu whose other
  three rows are the auditor's OCR'd letterhead. It published that row TWICE at
  49.1% each until v184 collapsed the twin, and `aggOnly` needs a SINGLE row at
  ≥90%. **v184 put `collapseDoubleRender` in the `parse4i` WRAPPER — deliberately
  post-selection so no region could change places — while every arithmetic guard
  lives inside `parse4iPass`. Order is guard, then collapse.** The dedup moved in
  front of the AUDIT and the audit started working; it never moved in front of
  the GUARD. v185 lifts the v105/v110/v111 family to `dominanceIsAggregate` and
  asks it again after the collapse — one function, never a second copy, because
  the whole value of asking twice is that both asks are the same question.
  **Verified independently on the real 2023 filing with the real denominator:
  v184 `stmt=0`, v185 `stmt=1`, 4 rows @ 0.732, top row 96.6%.** Blast radius is
  1 plan / 578 ppl, the entire population.
- **SHIPPED 2026-09-27 18:2xZ, and MY OWN SCOPE CLAIM WAS WRONG — the precision
  defect was on the STATIC PAGES, never in the report.** I recorded it as "176
  plans / 5,641,116 participants publish dollar precision the filings never
  gave". The store population is exact, but **`app.js:1683` renders
  `money(f.value / 1e6)`**, so a report reader has always seen `$671.0M`. The
  zeros were printed only by the crawlable `p/*.html` pages — **160 pages /
  5,719,845 ppl**, now each carrying *"Values below are exact only to the nearest
  $1,000,000"* (PPG) or *$1,000* (Amazon), verified page by page. **I applied
  "measure through the display path" to the row NAME and not to the row VALUE in
  the same script; there are TWO display paths and a claim about readers must
  name which.**
  **The filing's unit was in the store the whole time and nothing read it:**
  `parse4i` writes `thousands` into every entry and it had **0 reads** anywhere —
  computed and discarded, the same shape as run #244's failure reason and the
  Schedule A carrier. So the note states a FILED FACT and needed no re-parse.
  **Also a documentation defect found here: the claim above that the list's
  display precision "replicat[es] `derive()`'s distrust rule" is wrong** —
  `derive()`'s rule is about filer-entered PARTICIPANT COUNTS, and neither it nor
  the $100k list packing touches lineup row values.
- **QUEUED, owner decision, and the largest thing found in this cycle: 62
  CRAWLABLE PAGES NO RUN CAN EVER REPAIR.** `p/` holds **5,062 committed HTML
  files against the generator's `TOP_N = 5000`**, so 62 pages / 169,447
  participants are served and outside every regeneration — SP Plus (15,333),
  Mavis Tire (13,035), Pep Boys (9,779), Confluent Health (8,280). Their plan
  years agree with the store, so staleness is not the risk; **the risk is that
  no parser fix reaches them** — v168's `appreciat` rows, v173's `(continued)`,
  v182's CVS GICs, v185's loan prose and the unit note are all invisible there
  and will stay so however many versions ship. A page that falls out of the top
  5,000 stops being maintained without stopping being published. Fixing it
  changes which URLs exist, so it is the owner's call.
- **QUEUED from the 18:0xZ draw, split because ONE count was four defects:** a
  vehicle type at the front of a fund name after `cleanFiledName` —
  **A** the bare type as the whole name 472 rows / 353 plans / 1,291,668 ppl;
  **B** a section heading welded onto a real fund name 4,692 / 712 / 1,218,124;
  **D** type plus a value (OCR) 202 / 25 / 88,324; **C** type plus a page
  reference 1 / 1 / 80,880. **B's outcome test: 846 rows already resolve to a
  fund, 144 would GAIN one if the caption were stripped, 0 would LOSE one** — so
  a strip is safe and B is an honesty defect for 1.22M readers, **not** a
  fee-coverage fix, whatever its row count suggests. **A raises a question about
  the machinery**: 353 plans publish a bare `Mutual Funds` while
  `audit-generic-names` reports 114. `docs/accuracy-log.md` 2026-09-27 (18:4xZ).
- **LIVE ON MAIN: the v184 store — MIRRORED 2026-09-27 14:1xZ**
  (`2bf641df → 13028d3c`), **data gate UNFORCED at +0 gained / −0 lost**;
  `--force` covered the GIT check alone over main's one cron commit (#474,
  whose coverage line was a byte-for-byte repeat of the pre-v184 numbers).
  `pages-build-deployment` #611 built it `success` at 14:14Z.
- **#473 PASSED EVERY PER-PLAN PREDICTION AND EVERY CONTROL.** The nine designed
  collapses landed on their predicted row counts and ratios (Printpack 3,422
  ppl 10 rows @ 0.520, Allete 2,230 ppl 35 @ 0.972, Smr Automotive 40 @ 0.966,
  Graham Group 52 @ 0.616, Huron 16 @ 0.972, Radiology Consultants 49 @ 0.978,
  Adams Fairacre 50, Resource Label 40, Cobre Valley 4), and all three controls
  held — Western Ecosystems 55 rows @ 1.106, Local 360 (the truncated-vintage
  REFUSAL) 39 @ 0.984, I. Rice 38 rows / **$13,947,979** to the dollar.
  **The one `FAIL` printed was my own selector, not the fix**: Alpha Source was
  addressed by the largest sponsor-name prefix match, which picks "Alpha Source
  Holdco" (437 ppl) over "Alpha Source Llc" (413 ppl); re-addressed by value the
  prediction was exact. Second time in two days that *address a plan by a
  property it has, not a convenient selector* had to be re-learned.
  **What reached readers: 15 plans / 15,083 participants / $55,349,733 of doubly
  counted money**, across three classes one stage fixed — legend twins
  (`1VBTLX` beside `IVBTLX`), Allete's whole schedule printed again in
  thousands, and a twin carrying its own value welded on.
- **ALSO LIVE, mirrored earlier the same day: v182 + v183 (`e29d21bc →
  f10c0af3`, data gate UNFORCED).** CVS Health's **307,068 participants** stop
  seeing ~98 synthetic-GIC securities (`ING GROEP NV`, `BANK OF MONTREAL`,
  `CITIGROUP INC`) listed as menu options beside the $2,690,925,949 subtotal
  that totals them; the sleeve now publishes as its own filed subtotal and the
  innards move to the securities tab. **v182's absorb arm first took a real
  38-row menu off I. Rice & Co.'s page and the mirror was HELD until v183
  restored it byte-identically** — the absorb now requires the subtotal LINE to
  be present on the page it stands for, not merely inferable. Blast radius of
  v183: exactly ONE lineup entry changed in 68,767 acks.
- **Previously: the v181 store — MIRRORED 2026-09-26 23:1xZ**
  (`f7b8a665 → 169458c8`), **data gate UNFORCED at +0 gained / −0 lost.**
  `--force` covered the GIT check alone over main's one cron commit, evidence
  produced first: **0 acks and 0 plans the branch lacked, plans array
  byte-identical, main higher on 0 acks, 0 confident on main the branch
  lacks** (the 68,637 pv differences are all the branch's v181 ahead of
  main's v180).
- **#465 PASSED EVERY PRE-REGISTERED TEST.** Cwpm 35 rows @ 0.969 and Douglas
  County 34 @ **1.000** are the two designed drops; CVS Health (307,068 ppl)
  is **120 rows @ ratio 0.801** with its `Stable Value Fund Subtotal` still
  carrying **$2,690,925,949** and now typed `Subtotal (not a holding)`;
  **8 subtotal-named rows store-wide and 0 still carry a fund vehicle type**;
  the coverage line is byte-identical (confident +0 / −0) because v181 retypes
  and drops rows INSIDE plans that were already confident.
- **BOTH ANOMALIES IN #465's LINE WERE RESOLVED, NEITHER WAVED THROUGH.**
  (1) `analyze` 0 → 2 is **not v181's doing**: both acks sit at **pv=180**, so
  the run never touched them — The Folsom Corporation (203 ppl) and the
  documented analyze-stuck master trust, both already on this record. One
  status read settled it.
  (2) `dl` 105 → **128** is the metric the verdict rules say must not jump.
  **All 23 new failures were HEAD-probed — the whole population, not a
  sample — and 23 of 23 answered 403.** The filings really are withdrawn from
  the EFAST2 bucket, so `e=download` stays an honest published claim and the
  rise is the bucket growing, not our code. Largest is Lakeland Regional
  (8,952 ppl); the rest are small plans. This is the #244/#246 discriminator
  run in the direction that EXONERATES the code, which is the point of
  running it.
- **ALSO LIVE, and the correction is the useful part: the filed misspelling of
  a fund HOUSE is repaired in the LOOKUP, never in the displayed name.**
  University of Maryland Medical System PN 005 (23,496 ppl) files `Vangaurd
  Target Retirement <year> Inv` on **twelve rows, $470,113,950 = 65.2% of its
  menu**; the filing's own text layer says `Vangaurd` 12 times and `Vanguard`
  zero times, so the typo is the auditor's and our parse is faithful. Won:
  **ticker 326 rows / 158 plans / 150,335 ppl**, **expense ratio 211 rows /
  81 plans / 85,306 ppl / $749,399,699**, 0 flipped and 0 lost.
  **The first version of this claimed "$975M of fee cells" and that was
  wrong** — the measurement asked only `fundTickerInfo`, so it proved the
  ticker resolves and said nothing about the fee beside it. **Rendering the
  real page is what caught it** (twelve tickers against twelve `—`), and a
  store-side test of the ticker lookup could not have. An outcome test covers
  only the outcome it measures, and this fix had two.
  Queued, not shipped: **158 rows publish a LESS specific ER than the repaired
  name resolves** (generic 0.1% where Vanguard Total Bond is 0.04%); the fix is
  strictly additive by design, so changing those rewrites 158 published numbers
  and needs each verified.
- **#427 PASSED ALL FOUR PRE-REGISTERED TESTS and the issuer strip is LIVE.**
  (1) Residue 361 → 248 = **113 rows stripped, the prediction to the row**;
  (2) CHS/Community Health (91,940 ppl) publishes `Principal Life Insurance
  Company` on 13 rows and KEEPS `Master Trust CHS/Community Health Systems,
  Inc.` on 2, because a sponsor name stands alone nowhere in the store;
  (3) all four negative controls untouched — USC `Real Estate Account (CREF)`
  (44,948 ppl), Sony `Corporate Stock - Common`, Textron, Vanderbilt;
  (4) **CONFIDENCE DIFF +0 / −0**, coverage line byte-identical, REPARSE
  VERDICT `confident +0, match +0, vesting +0, lineups +0`. **A control
  addressed by a REMEMBERED ack returned "no entry", which reads exactly like
  a control failing — re-addressed by VALUE it resolved instantly. Address a
  negative control by a property it has, not an identifier you recall.**
- **MIRRORED 2026-09-21 14:3xZ: `b6271274 → 8196414b`, and the DATA GATE
  PASSED UNFORCED at +0 / −0** (second consecutive unforced data gate).
  `--force` covered the GIT check alone over main's one cron commit, evidence
  first: **0 acks and 0 plans the branch lacked, plans array byte-identical,
  pv differing on 0 of 68,767, 0 confident on main the branch lacks** — only
  the `generated` timestamp differed. pv 180 at 99.8%, confident 60,115,
  HIGH 5 at the baseline, WARN 543, overshoot 332, aggRow 112, dl 105.
  **HELD ~10 minutes first and that was right:** #428 was in flight ON MAIN,
  and force-pushing the branch onto main while a run is about to commit there
  is the unsafe case. The hold cost nothing and the mirror happened in the
  same cycle.
- **MIRRORED 2026-09-21 15:4xZ: `bfc72e53 → 57b914fe`, UNFORCED.** Carries the
  `fundTable` fix: **UPS PN 004's 145,125 participants** stop being shown a
  22-fund SYNTHETIC `data.js` menu with estimated expense ratios and are told
  their filing reports investments **in aggregate**. Every honest explanation
  in `fundTable` had been nested inside `if (!plan.funds)`, so a curated entry
  suppressed all of them; only the FILED-FACT branches are promoted, the
  generic endings stay gated and are now explicitly guarded. Sized first:
  **2 plans / 145,246 ppl masked**, the other 21 curated entries return above.
  Controls both ways, **full smoke test GREEN across all six page shapes**, and
  **site-test #82 `completed success` in CI** — read, not assumed.
  **GUARD DIAGNOSIS CORRECTED:** site-test ALREADY has a push trigger including
  the data paths. It is suppressed by the pipeline pushing with `GITHUB_TOKEN`
  (GitHub's anti-recursion rule means those data paths have NEVER been able to
  fire, though the workflow comment calls them deliberate) and by `[skip ci]`
  on my own head commits. Confirmed live — the `app.js` push carried no
  `[skip ci]` and DID fire it. **Owner decision: whether that data-path intent
  is worth a deploy key or PAT.**
- **MIRRORED 2026-09-21 15:0xZ: `8196414b → fb4031a5`, UNFORCED ON BOTH
  CHECKS** (fast-forward; main had nothing the branch lacked; data gate
  +0 / −0 — the third consecutive unforced data gate). Carries the
  `fund-er.js` separate-account demotion to readers: **878 rows / 207 plans /
  311,893 participants** stop publishing a mutual-fund ticker as though the
  plan held it, where the filing's own type column says `Separate account`.
- **LIVE ON MAIN: the v180 store — MIRRORED 2026-09-21 13:2xZ**
  (`4035b383 → b4c9e6d8`), and the **DATA GATE PASSED UNFORCED at +1 gained /
  −0 lost** — the first unforced data gate in four mirrors. `--force` covered
  the GIT check alone over main's one cron commit, evidence first: 0 acks and
  0 plans the branch lacked, plans array byte-identical, **0 confident on main
  the branch lacks**, main newer on exactly two acks, both named and benign
  (The Folsom Corporation, 203 ppl, **not confident on either side**, where
  main's cron reached the cleaner `no-section` diagnosis the branch holds as
  `analyze`; and the documented analyze-stuck master trust, confident on both).
  pv 180 at 99.84%, confident 60,115, lineups 59,764, HIGH back to the
  baseline 5, WARN 543, overshoot 332, dl 105.
- **#425 PASSED AND ALL FOUR PRE-REGISTERED TESTS PASSED.** Dove Schools is
  back at `c:1` with **28 rows**, sum $5,582,857, every row keeping its own
  unit price; confident **+1**, the designed direction; True Organic holds at
  25 rows so the **$300,645 double-count did not return**; and the whole-store
  collision test returns **0** — Dove was the entire population and it is
  closed.
- **THE ARC ACROSS THREE VERSIONS IS ONE DEFECT AND ONE LESSON.** v179 put a
  correct strip in the wrong place (`cleanDesc`, which sees ONE STRING) and
  rebuilt the v100/Amgen shape; the triage caught it on a run whose coverage
  line I had predicted would be byte-identical; v180 moved the same strip to
  the dedup stage and reused **v174's own guard**, whose comment already
  stated the rule. **The fix never changed — only where it could see enough to
  be safe.**
- **SHIPPED 13:3xZ, IN merge-4i AND NOT A PARSER VERSION: the 4i section
  caption stripped from the ISSUER column.** CHS (91,940 ppl) stored
  `Master Trust Principal Life Insurance Company` where the identity column
  reads only the firm. **A blanket strip destroys real names** — USC (44,948)
  stores `Real Estate Account (CREF)`, TIAA's ACTUAL fund — so the test is
  empirical: *does the remainder appear as a COMPLETE issuer on other
  published rows?* CHS's `Principal Life Insurance Company` stands alone
  **16,457 times**; `Account (CREF)` never does. **That evidence is STORE-WIDE,
  so lib-4i cannot run it (one filing) and neither can the dedup stage (one
  row set) — the merge holds the whole store.** Third placement decision in
  this cycle-family settled by the same question: *where can the evidence be
  seen?* Verified on the real merge both ways — **113 rows / 42 plans**
  stripped, CHS's Principal rows fixed while its sponsor-name rows are KEPT,
  and four negative controls named in advance all untouched (USC, Sony's
  `Corporate Stock - Common`, Textron, Vanderbilt). CONFIDENCE DIFF +0 / −0.
  Needs no re-parse; **#427 exists to let a merge apply it.**
- **RE-DERIVED 2026-09-21 AND THE RECORDED NUMBER WAS WRONG — do not reuse
  "165 rows / 68 plans / 95,501 ppl, four shapes".** Against the v180 store:
  the `0`-in-word shape is **0 rows**; the `1`-in-word shape is **429 rows of
  EMPOWER LEGEND CODES** (`1PIO191`), a different and already-recorded class
  swept in by shape; the `5/8` shape is **2 rows** of unreadable mush. The
  survivor was **two defects sharing one regex**. What is real: **a trailing
  `|` in a share-class slot is the letter `I` — 298 rows / 181 plans /
  157,849 ppl**, confirmed by rasterising Cradlepoint's filing
  (`20241219154849NAL0007738912001`) at 240dpi and READING it: the page says
  `T.Rowe Price Retirement 2035 Class I`, nine rows, vehicle column
  `Common Collective Trust`. The `!`-for-`I` shape the item led with is
  **7 rows / 7 plans**, and a naive `!`→`I` rewrite is WRONG on 4 of them
  (`Metrop!tn`, `Smal!Cap` want lowercase `l`).
  **CORRECTED WITHIN THE SAME CYCLE — the `Class |` half ALREADY SHIPS AT
  DISPLAY and calling it "the shippable part" was wrong.** `app.js` has carried
  `s.replace(/\s+\|+\s*$/, " I")` since **2026-09-18** (sized there at 743
  plans / 683k ppl), so every reader already sees `Class I`; only the STORE
  still holds the pipe. What remains is narrower and real: `lookupTicker` tries
  the RAW filed name first, so `T Rowe Price Blue Chip Growth - Class |`
  matches the base fund and publishes **TRBCX, the investor class**, where the
  repaired name resolves to **TBCIX, the I class** — the displayed NAME says
  Class I while the fee cell is the more expensive share class. **7 rows**, all
  typed `Mutual fund`. Small, and the exact FTBFX shape this project has
  shipped a fix for once already.
  **AND THE TRAP UNDERNEATH IT, which cost more than the item is worth:** I
  then sized "a collective-trust row published with a mutual-fund ticker" at
  **28,339 rows / 14,018,680 ppl / $381.5B** and it is **an artifact of my own
  harness**. `fundTickerInfo(name, type)` takes a SECOND argument;
  `fund-er.js:1068` already demotes such a holding to a labelled comparable
  from the filing's own vehicle column, and `app.js:591-592` passes `f.type`
  on every call plus the issuer-prefixed and raw names first. Calling it with
  one argument measures the omission. **Transcribe `lookupTicker` from app.js
  for any measurement over `fund-er.js`** — reaching for the shipped predicate
  is not enough, it has to be called the way the site calls it.
- **TOOLING FACT: a newly pinned specimen is NOT compared until the NEXT run
  of `diff-lineups`.** It prints `(fetched 1 pinned defect specimen(s))` and
  still reports 0 for it. On the pinning run the TRACE is the positive control
  and the corpus diff is only the negative one.
- **Residuals RE-DERIVED AT v183 on 2026-09-27: 1,354 live plans / 1,277,064
  participants — FLAT against v176's 1,352 / 1,276,854.** Every bucket moved
  by ≤4 plans; the only real movement is the 403 residue 15 → 19. **That
  flatness is correct and it names a limit of the instrument:** v177–v183 all
  fixed ROWS INSIDE already-confident plans, which were never in a gap bucket,
  so the census cannot see that work by construction. Use the whole-store row
  diff and the pinned specimens for row-correctness work, not the census.
  **And the largest OURS-shaped bucket is not a lineup bucket at all: B1,
  features missing although the lineup parsed fine, 1,084 plans / 1,196,101
  participants / $47.3B.** Full table and the census's own B/C/F/Z sections:
  `docs/accuracy-log.md` 2026-09-27.

- **LIVE on main: the v168 store — MIRRORED 2026-09-19 23:3xZ** (`--force`
  over main's cron commit `8952b3bf` — 0 acks and 0 plans the branch lacked,
  plans array byte-identical, main newer on 2 acks the next run re-reads — and
  `--force-data` over the single loss, read by name). pv 168 at 99.85%,
  confident 60,119 (+5 / −1), HIGH 6, overshoot 334, lineups 59,768, dl 104.
  **What reached readers: 5,349 plans / 7,048,088 participants gain an
  "Appreciation" holding** that an unanchored skip arm had been deleting from
  every menu — Mayo Clinic (114,636), O'Reilly Automotive (91,899), Tesla
  (89,700), **Southwest Airlines (85,764) at 15% of its menu**, Universal
  Health Services, Vanderbilt, Duke, NY-Presbyterian. **BNSF Railway (33,118)
  publishes for the first time**, and Northeast Georgia's 14,038 stop seeing
  `T. Rowe Price` as a $479,484,734 holding.
  **Both pre-registered tests passed**: `appreciat` rows 55 → 5,766 across
  5,369 lineups, and the bare-house class lost its largest member (23 → 20
  plans, 28,113 → 12,762 ppl). The one loss is Shannon & Wilson's junk 5-row
  lineup (sponsor name, `Class B Common Stock`, a prose fragment) falling
  under the three-row floor.
  That follow-up is CLOSED: the other 22 arms of the same alternation match
  **0** published rows across 1,726,882, with one narrow exception
  (`receivable` at 9, all real asset-backed securities protected by v153's
  `securityRow` exemption). Recorded, not fixed.
  `docs/accuracy-log.md` 2026-09-19 (run #401 verdict).
- **LIVE on main: the v171 store — MIRRORED 2026-09-20 05:2xZ, UNFORCED**
  (fast-forward `988d2fd9 → 9acd1781`). pv 171 at 99.85%, confident **60,117
  (+0 / −0)**, HIGH 5, **overshoot 335 → 332**, lineups 59,766, dl 104.
  **The Form 5500 employer-ID class went 43 rows / 43 plans / 29,821 ppl → 1 /
  1 / 1,598**, and **the v169 regression is repaired**: Shared Support South
  (195 ppl) loses the $2,134,543 EIN row, ratio **1.43 → 1.009**. The one
  survivor is diagnosed and is a different shape — IBG Llc's line is a PAGE
  HEADER carrying the plan name and `Employer ID Number: 13-3832398`, with the
  EIN read as a dollar value, so it does not START with the employer-ID words
  and the anchored arm cannot reach it.
  `docs/accuracy-log.md` 2026-09-20 (run #406 verdict).
- **IN FLIGHT: #415 (v175), dispatched 2026-09-20 21:09Z by `workflow_dispatch`
  (observed in_progress; `.kick` was already at the content it needed so the
  push trigger had nothing to fire on).** v175 restores the brokerage row v172
  deleted from Apple's menu — see the CORRECTION below, which is the important
  part of this whole block. Pre-registered tests: the deleted-brokerage class
  goes **6 → 0**, Apple's ratio reads **~0.99 against 0.918 today**, and
  Trustmark publishes **three separate** Charles Schwab rows rather than one
  summed $13,916,207.
- **MIRRORED 2026-09-20 21:1xZ: the v174 store is LIVE on main**
  (`bc1b0384 → 75ed1fa3`). `--force` on the GIT check only over main's one
  cron commit — 0 acks / 0 plans the branch lacked, plans array byte-identical.
  Data gate unforced: **+0 / −0**, pv 174 at 99.8%, dl 104.
- **#413 PASSED (~100 min, `75ed1fa3`): pv 174 at 99.85%, confident 60,117
  (+0 / −0), HIGH 5, overshoot 332, aggRow 112, dl 104.** Coverage line
  byte-identical for the THIRD version running — v174 renames and folds rows
  INSIDE already-confident plans and the line counts PLANS. **All three
  pre-registered tests passed:** the footnote class 7,429 rows / 506 plans /
  1,172,804 ppl → **27 / 12 / 116,932**, and at ≥50% of a menu **270 plans →
  0**; the negative control holds on the live store (Western Ecosystems still
  publishes `Putnam Stable Value Fund` $14,679 AND `PUTNAM STABLE VALUE FUND
  (15)` $14,678 — no $29,357 phantom); Chubb is **45 rows** with `Managed
  account holdings (125 positions)` $469,921,014 = 10.0%. **The 27 survivors
  are the guard working**, every one a collision it correctly refused.
  **What reached readers:** FMR (90,445), Edustaff (41,089), Thermo Fisher
  (72,605) — 506 plans / 1.17M ppl — lose the bare `(1)` welded to their fund
  names; Chubb's 21,847 stop seeing 125 individual stocks listed as a fund
  menu, with $38,252,895 previously hidden behind the row cap now counted.
- **SHIPPED 2026-09-20 20:3xZ: `rows-dropped.txt`, the THIRD BLIND SPOT.**
  `losses-triage` sees lineups that vanish; `swaps-degraded` sees source
  changes; **neither sees a plan that stays confident, keeps its source and
  publishes fewer rows** — which is how v172 took $2.15B off Apple's page as a
  27 → 26 row move with every check passing. merge-4i now lists any such plan
  whose ratio drifts **>0.03** further from 1.0 (Apple's was 0.070); audit
  raises **WARN**, not HIGH, because removing a genuine fabrication also drops
  the ratio — it is a read-before-you-mirror list, not a verdict.
  **Controlled BOTH WAYS through the real merge on a crafted tree**: positive
  31 rows @ 0.990 → 30 @ 0.845 flagged, negative 16 @ 0.980 → 15 @ 0.978 not.
  A check that prints 0 on a quiet store has not been tested.
- **CORRECTION, 2026-09-20 19:5xZ — v172 IS A LIVE REGRESSION FOR 145,428
  APPLE PARTICIPANTS AND THIS FILE REPORTED IT AS A CLEAN WIN.** v172's prose
  rule deleted the WHOLE ROW where Apple files
  `BROKERGE ACCOUNT | Various Accounts | 2,153,504,672` — identity is the
  brokerage account (the filing's own typo), description is the prose, the
  description won the name, and **$2,153,504,672 = 7% of a $30.8B plan
  vanished from the published menu**, which fell from 98.7% of the plan to
  91.7% with nothing on the page saying so. **It is the SEMPRA case with the
  columns swapped** — the gate caught `Various | Self-Directed Brokerage Acct`
  while v172 was being written, and that save was read as general when it was
  particular. **A gate specimen proves the orientation it pins, not the axis
  it lies on.**
  **Found by sizing the SDBA fold, not by any audit.** Diffing the pre-v172
  store against the live one: **275 plans / 790,790 ppl lost a `Various…` row**,
  and the ratio moved AWAY from 1.0 on **168 plans / 593,171 ppl** (Apple
  0.987→0.917, Intuit 0.993→0.919, AMD 0.993→0.897). **A ratio moving away does
  not by itself prove the removal was wrong** — if the row is fake the gap is
  genuinely unaccounted — so the ratio chose what to OPEN and the FILING
  decided. Split, whole-store and unanimous: **6 rows / 6 plans / 160,758 ppl
  have a real name in the row's OTHER cell and were wrongly deleted** (Apple,
  Beall's, Wieden & Kennedy, Streamland, Snider Motors, Rousselot — every one a
  brokerage window); **280 rows / 269 plans / 630,032 ppl have no other cell**
  (Oracle, Intuit, Progressive) and are the SDBA-fold question, now sized.
  **v175 fixes the six and deliberately does not touch the 280.**
  **THE DURABLE LESSON IS NOT "ADD A SPECIMEN".** Two existing rules would each
  have caught it: (1) *measure the shipped change's LOSSES on the same store as
  its gains* — v172's verdict read three plans by ROW COUNT and Apple's 27 → 26
  is a one-row move indistinguishable from noise carrying $2.15B; (2) the ratio
  test the swap triage runs automatically is **never run on rows a version
  DELETES**. `losses-triage.txt` sees lineups that vanish, `swaps-degraded.txt`
  sees plans that change source, and **a version that deletes one row from a
  confident lineup is invisible to both** — the same blind spot v168's
  `appreciat` defect exploited. **TOP QUEUE ITEM, ahead of the SDBA fold: a
  merge-side check that reports ratio movement for plans whose row COUNT fell.**
- **MIRRORED 2026-09-20 18:1xZ: the v173 store is LIVE on main** (`285bf55e →
  23ea1499`). `--force` on the GIT check only over main's three incremental
  cron commits — **0 acks and 0 plans the branch lacked, plans array
  byte-identical**, main newer on 1 ack. DATA gate unforced: **+0 / −0**, pv
  173 at 99.8%, dl 104, reader failures 1. **What reached readers: 260 plans /
  429,252 participants stop seeing a page break's `(continued)` printed as the
  name of the firm behind their fund** — Td Bank on eleven of twenty-three
  rows, Fleetpride on twenty of sixty-three, Illinois Tech on thirteen of
  seventy-one, and New York-Presbyterian's Harbor Capital Appreciation Fund
  attributed to `Harbor Capital`.
- **#409 PASSED (07:23Z, 55 min, `23ea1499`): pv 173 at 99.85%, confident
  60,117 (+0 / −0), HIGH 5, overshoot 332, lineups 59,766, dl 104.** The
  coverage line is byte-identical for the SECOND version running and for the
  same reason — v173 renames a FIELD and the line counts PLANS.
  **The pre-registered test was the class and it passed decisively: 566 rows /
  260 plans / 429,252 ppl → 1 / 1 / 157.** The single survivor is DIAGNOSED and
  is not a miss: Onyx Creative's status is `pv 91, e=download` and its S3
  object HEAD-probes **403** — withdrawn from the EFAST2 bucket, so the v37
  protection keeps its v91 parse and no bump can reach it. **The class is
  closed for every filing that can still be read.** Pattern worth keeping: a
  survivor after a bump is either a missed rule or an ack never re-parsed, and
  the second is one status read away — here the failed trace download WAS the
  answer, not a tooling problem.
- **ELEVEN-HOUR LOOP GAP 2026-09-20 07:10Z–18:07Z.** The container restarted
  and the session did not resume; twelve hourly wakes queued and arrived
  together at 18:07Z. Nothing was lost — the pipeline is the durable layer and
  took three incremental cron commits on main without a session — but the
  verified v173 store sat unmirrored for eleven hours. Recorded because a gap
  that is not written down reads later as a quiet hour.
- **MIRRORED 2026-09-20 07:0xZ: the v172 store is LIVE on main** (`aa004a2e →
  1ed27db7`). `--force` on the GIT check only, over main's cron commit
  `aa004a2e`: **0 acks and 0 plans the branch lacked, plans array
  byte-identical**, main newer on 1 ack that the next run re-reads. The DATA
  gate passed unforced — **+0 gained / −0 lost**, dominant pv 172 at 99.8%,
  fetch failures 104, reader failures 2. **What reached readers: Oracle's
  101,985 participants stop seeing `Various investments, including registered
  market funds and c` at $3,405,120,000**; Capital One gains three rows and
  $1,140,343,117 of real funds; Progressive loses eight brokerage category
  summaries (the recorded cost). The mirror carries **v173 CODE over the v172
  STORE**, which is safe by `SCHEDULE_INCREMENTAL` — a scheduled run treats a
  parser-version gap as no work, so main's :23 cron cannot turn this into a
  duplicate full re-parse.
  **HELD for twenty minutes first and that was right:** at 06:4xZ #408, main's
  own hourly cron, was in flight ON MAIN, and force-pushing the branch onto
  main while a run is about to commit there is the unsafe case. Dispatching
  #409 on the DEV branch in the same moment was safe — concurrency is per-ref.
  The hold cost nothing and the mirror happened in the same cycle once #408
  landed.
- **#407 PASSED (06:17Z, 53 min, `1d7d321f`): pv 172 at 99.85%, confident
  60,117 (+0 / −0), HIGH 5, overshoot 332, lineups 59,766, dl 104.** Every
  metric in the coverage line is byte-identical to the previous run's except
  `tkSampled`, and **that is the right answer, not a stall** — v172 moves ROWS
  inside plans that were already confident, and the coverage line counts
  PLANS. The check that settles it is reading the named plans out of the
  store: Oracle **40 rows**, no `Various…` row, sum/assets **0.911** exactly as
  predicted (101,985 ppl stop seeing $3,405,120,000 as one holding); Capital
  One **31 rows** with $1,140,343,117 of real funds publishing; Progressive
  **25 rows**, the recorded cost. `aggRow` held at 112 consistently: Capital
  One's fold was 17.6% of its menu, under the audit's 30% threshold, so it was
  never counted. **Next queue item is v172's own cost — fold brokerage-window
  CATEGORY rows into the SDBA aggregate instead of deleting them** (Progressive's
  eight rows, ~$499M).
- **Previously: the v167 store — MIRRORED 2026-09-19 21:2xZ** (`--force` over
  main's cron commit `7d9f401c` — 0 acks and 0 plans the branch lacked, plans
  array byte-identical, main newer on 1 ack — and `--force-data` over the
  single loss, read by name). pv 167 at 99.85%, confident 60,115 (+9 / −1),
  HIGH 5 = 4 baseline + 1 self-clearing, overshoot 344, lineups 59,764, dl 104.
  **What reached readers:** Ford Gum & Machine (114 ppl) and ZF Chassis (362)
  have the 29-row menus v166 cost them; a description that is only a house
  name no longer beats a real fund name in the identity, so **Rcb Bank's 968
  see a real T. Rowe Price Retirement menu where a 68.4% `Blended investments`
  phantom stood**, and Illinois' eight TIAA and CREF holdings are separate
  again. Four all-generic junk menus returned with them — the status quo
  restored, not an improvement; removing those is owner question 5.
  **The one loss is the ratio guard working:** a trust's `NORTHERN TRUST` row
  at 30.4% became `Commingled Fund` at 61.6% once the house description was
  refused (ratio 1.086 → 1.965, out of band, withdrawn). **v167 does not make
  the identity good; it only stops a bare house being published as a holding.**
  **Class measured on the new store: bare-house-dominant lineups 28 → 23 plans
  / 28,113 ppl.** The 23 that remain hold the house in the IDENTITY column,
  which v167 deliberately does not touch.
  **NEXT PARSER ITEM, cause diagnosed and nothing built yet:** Northeast
  Georgia Health System (14,038 ppl) publishes `T. Rowe Price` at $479,484,734
  = 57%, and its filing is NOT thin — page 15 carries a clean 4i schedule
  reading `T. Rowe Price Capital Appreciation | Mutual Fund | 479,484,734`.
  A later render wins whose description sits on its own line ABOVE the value
  line while the value line's description cell holds only the cost `0`. The
  clean region scores 0.416, which is $832M minus that same $479M row — **one
  defect costs twice, and the second cost is what decides the contest.**
  `docs/accuracy-log.md` 2026-09-19 (run #399 verdict).
- **Previously: the v166 store — MIRRORED 2026-09-19 19:2xZ** (`--force-data`
  over sixteen losses each opened and named; the git check passed unforced,
  main had 0 acks and 0 plans the branch lacked). pv 166 at 99.85%, confident
  60,107 (+3 / −16), HIGH 18 = 4 baseline + 14 self-clearing `reparse-loss`,
  overshoot 347 → 342, dl 104. **What reached readers: Meta Platforms' 84,993
  participants stop seeing one "fund" of $18,809,051,400 at 82% of their plan
  and get the real 20-fund State Street and Vanguard menu**; 104 plans stop
  publishing the ASC 820 reconciliation line as a holding; 13 plans / 302,810
  ppl lose SEC Form 11-K cover-page rows, Publix (225,961) among them; v164's
  fragment identities read as firm-then-fund.
  **TWO REGRESSIONS ARE LIVE AND BOTH ARE v166's NAV ARM**: Ford Gum &
  Machine (114 ppl) and ZF Chassis Modules (362) lost real 29-row menus,
  because the same words are the note's SUBTOTAL in one document and a small
  ASC 820 FOOTNOTE beneath a real menu in another. **v166's own entry names
  that risk and does not guard against it — writing a risk down is not
  guarding against it.** Both are fixed by v167's materiality bar, in flight
  as **#399**. `docs/accuracy-log.md` 2026-09-19 (run #398 verdict).
- **Previously: the v163 store — MIRRORED 2026-09-19 18:2xZ** (`--force` on
  the GIT check only, over main's one incremental cron commit `10f169d1`: 0
  acks / 0 plans the branch lacked, plans array byte-identical, main newer on
  2 acks that #398 re-parses; the data gate passed unforced at +0 / −0). pv
  163 at 99.85%, confident 60,120, HIGH 4, overshoot 347, dl 104. What reached
  readers: a hyphenated product name stops collapsing to its house, so
  `TIAA-CREF High-Yield-Rtmt` and `Prudential High-Yield` read as firm-then-
  fund, and The Jones Company (246 ppl) loses a 74% `John Hancock` row.
  **ONE REGRESSION IS LIVE AND ON THE RECORD:** The Illinois Center For Autism
  (190 ppl) merged eight real TIAA and CREF holdings into one `TIAA-CREF` row
  at 58.3% — found by the whole-store row diff, invisible to every count.
  **The class it belongs to is the top queue item: 28 published lineups /
  29,656 ppl show a bare house as their largest row at 50–99%** (Northeast
  Georgia `T. Rowe Price` $479,484,734 at 57%, Calpine `Investments` 80%, Cape
  Cod Express `Great Gray Trust` 98%). A region-level fix was written and
  **reverted unshipped because it is inert** — the winning region IS
  `bestMenu`, so the merge happens inside the winner and the fix belongs in
  the dedup. **#398 (v164 + v165 + v166) in flight.**
  `docs/accuracy-log.md` 2026-09-19 (run #396 verdict).
- **Previously: the v162 store — MIRRORED 2026-09-19 17:2xZ, UNFORCED on
  both checks** (main had 0 acks and 0 plans the branch lacked). pv 162 at
  99.85%, confident 60,120 (+0 / −0), HIGH 4 at the baseline, overshoot
  347, dl 104. What reached readers: the `<category> <vehicle>` merge is
  gone from 186 lineups — **PennyMac publishes thirteen Fidelity Freedom
  vintages** where one $157,047,874 `Asset Allocation Mutual Fund` stood,
  and the class at ≥20% of a menu falls 117 → 11 lineups / 12,636 ppl.
  Whole-store multiset diff: 1,717 rows added across 170 plans / 166,144
  ppl, 531 removed. **Cost on the record, read one by one: 21 TO-SHORT
  rows / 16 plans / 14,820 ppl**, mixed — `Growth Fund Pooled Separate
  Accounts (1` → `EuroPacific` is better, `Large Cap Equity Collective
  Investment Trust` → `Trust` is worse. **That is the top queue item: a
  fragment identity should not win merely because the description was
  refused.** **#396 (v163) in flight.** `docs/accuracy-log.md` 2026-09-19
  (run #395 verdict).
- **Previously: the v161 store — MIRRORED 2026-09-19 16:3xZ
  (`--force-data` over two named junk losses; `--force` over main's one
  analyze-stuck trust ack).** pv 161 at 99.85%, confident 60,120, HIGH 4
  baseline + 3 self-clearing. What reached readers: Mass General Brigham
  (131,090 ppl) loses a $1,565,649k `TIAA-CREF Funds` holding that was
  three real rows summed and gains them back; Hozhoni keeps its 34-row
  menu; junk `through YYYY` rows and `# ` markers are gone. **Cost on the
  record: 2 rows collapse a house+product name to the bare house
  (`TIAA-CREF High-Yield-Rtmt` → `TIAA-CREF`), queued.** **#395 (v162) in
  flight.** `docs/accuracy-log.md` 2026-09-19 (run #394 verdict).
- **Previously: the v158 store — MIRRORED 2026-09-19 13:4xZ, UNFORCED
  (both checks; main had nothing the branch lacked).** pv 158 at 99.85%,
  confident **60,122 (+19 / −0)**, HIGH 4 = the baseline and nothing else,
  overshoot 347, dl 104. What reached readers: ATH Holding / Elevance
  (94,689 ppl) loses the merged $1,793,711,087 `The Vanguard Group`
  phantom and shows `Institutional 500 Index Trust` $1.57B; Frx and
  Central City Concern publish their real menus again; 17 small plans
  publish for the first time. **v159 ready, v160 held unread — see the
  STATUS block.** `docs/accuracy-log.md` 2026-09-19 (run #391 verdict).
- **Previously: the v157 store — MIRRORED 2026-09-19 12:4xZ
  (`--force-data` over five pointer lineups read by name; git check
  unforced).** pv 157 at 99.85%, confident 60,103, HIGH 4 + 5
  self-clearing, overshoot 346, dl 104. What reached readers: Caterpillar
  (59,937), Cleveland-Cliffs, Pantexas, IBEW 25 and one trust show the
  master-trust sentence instead of a "menu" that was one pointer row;
  `†` markers gone from half their rows. **v158 in flight.**
  `docs/accuracy-log.md` 2026-09-19 (run #390 verdict).
- **Previously: the v156 store — MIRRORED 2026-09-19 11:4xZ (`--force`
  over #389's one newer ack, an analyze-stuck trust the dispatch re-reads;
  `--force-data` over Frx, read).** pv 156 at 99.84%, confident 60,104,
  HIGH 4 + 1 self-clearing, overshoot 350, dl 104. What reached readers:
  432 lineups' names move toward the readable render (vowel-token share
  up on 298 / down on 9); Progressive's 33 rows lose their `of `; State
  Street's 21,533 see an SSGA menu instead of Form 5500 coordinates.
  **#390 (v157) in flight.** `docs/accuracy-log.md` 2026-09-19 (run #388
  verdict).
- **Previously: `8cd51309` — MIRRORED 2026-09-19 10:3xZ (`--force` over
  the git check with 0 acks / 0 plans lacked; `--force-data` over 35
  losses read by name).** The v155 store, mirrored over the PARTIAL store
  that cancelled cron #387's merge had left on main (pv154 40,636 / pv149
  28,026 for ~20 min). pv 155 at 99.85%, confident 60,102 (−35 / +9 vs
  v154: 33 junk lineups withdrawn — form-line junk such as State Street's
  and Deutsche Bank's `le 0 0 1f` rows, label-only statements such as
  Seattle University — and 2 over-reaches, Conditioned Air and Central
  City, fixed in v156), HIGH 4 + self-clearing, overshoot 353, dl 104.
  Pages #518 built it. **#388 (v156) in flight.** `docs/accuracy-log.md`
  2026-09-19 (run #386 verdict).
- **Previously: `6172a056` — MIRRORED 2026-09-19 07:1xZ (`--force` over
  the git check with 0 acks / 0 plans lacked; `--force-data` over two
  losses read by name).** The v149 store: pv 149 at 99.85%, confident
  60,122 (+2 / −2 vs v147: Goodwill Keystone honest, Barton & Gray a
  regression fixed in v153), HIGH 4 after the folded-aggregate re-base,
  overshoot 364, aggRow 109 / 1.16M ppl, dl 104. What reached readers:
  the doubled house prefix gone from 203 → 10 plans (987 rows / 309 plans
  / 674k ppl); Marriott's 152,118 see their real menu (49 rows, 21 trusts).
  Mirrored while main's cron #384 (20 OCR shards, ~3h) was mid-run —
  concurrency is per-ref and its merge rebases onto latest main; the
  reasoning is in `docs/accuracy-log.md` 2026-09-19 07:1xZ. **#385
  (v150–v154) in flight.**
- **Previously: `c07b9f47` — MIRRORED 2026-09-19 04:5xZ (`--force-data`
  over 8 reconciled losses; git check unforced).** The v147 store — v144
  through v147 together. pv 147 at 99.85%, confident 60,122 (**+23 / −8**
  vs the v143 store: the eight are Energy Transfer + Sunoco (designed
  trust pointers), three bond-sleeve plans folding to one row, Midland's
  junk names, an untraceable fallback, one double-counting trust; the 23
  are small Vanguard-ETF-template plans publishing for the first time),
  HIGH 4 + 1 self-clearing, overshoot 363, aggRow 110, dl 104. What
  reached readers: Boeing's 6,950 sleeve positions as one row (hidden-tail
  class 337 → 236 plans, $46.7B → $7.2B); duplicates 522 → 109 rows;
  Rush Copley's $109M fragment unfolded; Energy Transfer's page says
  "master trust" instead of a 78% holding named `Trust`; "Invesco Stable
  Value Fund" instead of `Invesco`; ETF menus (Ouraring 47 rows, ChowNow
  59). **#383 (v148 + v149) in flight.** `docs/accuracy-log.md` 2026-09-19
  (run #381 verdict; v147; run #382 verdict).
- **Previously: `7d2349b1` — MIRRORED 2026-09-19 02:3xZ, unforced
  (fast-forward).** The v143 store (legend-less coded rows named from
  the SEC class index; a readability term decides near-equal region
  contests). pv 143 at 99.85%, confident 60,107 (+0 / −0), HIGH 4,
  overshoot 354, aggRow 56, generic-names 128, dominant-row 0, dl 104.
  Whole-store: 2,224 rows / 271 plans / 286,418 ppl renamed code → fund;
  Lulus 19 code rows → 23 names, Fusion Medical kerned → clean. Coded
  residue 1,103 rows / 238 plans (930 non-ticker codes). **v144 + v145 +
  v146 in flight as #381.** `docs/accuracy-log.md` 2026-09-19 (run #380
  verdict).
- **Previously: `3dde8717` — MIRRORED 2026-09-19 01:4xZ.** The v142 store
  (a kerned 4i caption or cover-page caption is recognised with its
  spaces removed). pv 142 at 99.85%, confident 60,107 (+0 / −0), HIGH 4,
  overshoot 356, aggRow 56, generic-names 128, dominant-row 0, dl 104
  (the new one 403). Whole-store: 46 rows / 17 plans lose the kerned
  caption prefix, Hill Brothers 38 → 60 rows, 18 kerned EIN rows / 16
  plans removed. `--force` on the git check over main's no-op `32672eaf`
  (0 acks / 0 plans lacked); data gate unforced. **v143 in flight as
  #380; v144 committed `[skip ci]` behind it.** `docs/accuracy-log.md`
  2026-09-19 (run #378 verdict; v144).
- **Previously: `218641f0` — MIRRORED 2026-09-18 23:3xZ.** The v141 store
  (a kerned font's fragmented type label is compared with its spaces
  removed, so `Com m o n Co lle ctive Tru st` no longer wins the name and
  swallows a menu; `fbo <person>` rows fold into the brokerage aggregate).
  pv 141 at 99.85%, confident 60,107 (+1 / −0), HIGH 4, overshoot 360,
  aggRow 56, dominant-row 0, generic-names 128, dl 103. Whole-store: 795
  rows added / 146 removed across 32 plans (Nelnet 6 → 30, Hill Brothers'
  86% merged row → 37 real rows). **Two recorded costs:** a kerned CAPTION
  row now publishes at 17% of Hill Brothers (v142: despaced
  `HEADER_FRAG_LINE`), and Fusion Medical Staffing (4,182 ppl) swapped to
  its kerned region on score — queue (m), now 2 plans. `--force` on the
  git check over main's `b475cd56` (0 acks / 0 plans lacked); data gate
  unforced. The display de-spacer (`despaceKerned`) renders 336 kerned
  rows readably, +184 tickers / 0 lost. `docs/accuracy-log.md` 2026-09-18
  (run #374 verdict).
- **Previously: `118e7a24` — MIRRORED 2026-09-18 22:2xZ.** The v140 store
  (a coded 4i schedule takes its holding names from the filing's own
  LEGEND — Empower's template, `1VFIAX`). pv 140 at 99.85%, confident
  60,106 (+0 / −0), HIGH 4, overshoot 360, aggRow 56, dominant-row 0,
  generic-names 128, dl 103 (both new ones 403). **14,946 rows / 680
  plans / 603,114 ppl renamed code → fund name** (whole-store multiset
  diff); coded residue 2,466 rows / 267 plans (OCR "I" mismatches and
  226 Empower plans whose legend was not found — open). `tkShare` (hash
  sample) 24.03 → 24.29. Unforced both checks. `docs/accuracy-log.md`
  2026-09-18 (run #373 verdict).
- **Previously: `eb25b24f` — MIRRORED 2026-09-18 19:5xZ.** The v139 store
  (a valueless line made only of 4i column-caption words no longer glues
  onto a page's first holding; the v70 row strip names the four leaked
  shapes). pv 139 at 99.85%, confident 60,106 (+3 / −0), HIGH 4, overshoot
  360, aggRow 56, dominant-row 0, generic-names 128, dl 101 (both new
  ones re-probed 403). **Measured whole-store with a multiset row diff
  (`rename-ms.mjs`), not the corpus:** 820 rows / 756 plans / 1.13M ppl
  lose a caption prefix (the 480 predicted PLUS the Empower "ISSUER NO. OF
  SHARES COST ** VALUE" family the line-stage rule caught for free); 300
  junk/duplicate rows removed across 77 plans; 190 added across 57 (one
  small plan gained a whole menu; one $27,863 cover-page row is new junk).
  **One regression, 1 plan / 22 rows (Lulus Fashion Lounge, `20251010124253
  NAL0004611859001`): its full-name region and its 10-char-code region now
  score an exact tie at 0.1047 and the code region wins** — queue item (m).
  `tkShare` 23.21 → 22.77 is SAMPLING-PHASE NOISE, not a loss: the audit
  samples every 20th row by position, one removed row re-phases the whole
  sample, and the exact whole-store count is 456,060 → 456,065 rows with a
  ticker. `--force` on the git check over main's `82f3ec0f` (a v138 no-op
  cron commit: 0 acks / 0 plans the branch lacked, main newer on 0); data
  gate unforced. GitHub MCP was down for this verdict, so the Pages build
  of `eb25b24f` was NOT confirmed. `docs/accuracy-log.md` 2026-09-18 (run
  #369 verdict).
- **Previously: `05a9d93a` — MIRRORED 2026-09-18 12:2xZ.** The v138 store
  (the 80-row DISPLAY CAP: `parseRows` kept the largest 80 rows while
  `totalValue` counted every row, so confidence judged whole schedules and
  readers saw a prefix — 12 plans / 481,363 ppl / $27.6B hidden at ≥15%,
  Boeing 21% = $15.5B, Goldman 61% — and the page called the rest "not
  itemised"). `ROW_CAP` 120, `cut: {n, v}` recorded at every slice point,
  the page says "N smaller holdings are not shown … about P% of the plan".
  pv 138 at 99.85%, confident 60,103 (+0 / −0, as predicted), HIGH 4,
  overshoot 360, dominant-row 0, generic-names 128, aggRow 56 (six small
  plans crossed 30% because the fold now sees 120 rows — mechanism). 191
  lineups at the new cap, 414 entries carry `cut`. **Boeing's page
  positive control passed on a local render.** `--force` on the git check
  over main's byte-identical cron commit; data gate unforced. Queue (l):
  fold the per-security flood BEFORE the cap (Boeing's tail is 7,551
  securities the fold never saw). `docs/accuracy-log.md` 2026-09-18 (run
  #359 verdict).
- **Previously: `78ff7aad` — MIRRORED 2026-09-18 09:2xZ.** The v137 store
  (a PLURAL type label at ≥90% of a lineup is a statement: `GENERIC_TYPE_ANY`
  feeds the dominant-row guard and the audits only — widening the shared
  regex had made 3M's fair-value note publishable, caught by the corpus
  diff). pv 137 at 99.85%, confident 60,103 (+0 / −2, both master trusts
  with a 92–94% `COMMON/COLLECTIVE TRUSTS` row), **HIGH 4**, overshoot 361,
  generic-names 128 (24 plans newly visible to the audit), dominant-row 0,
  dl 99 (99/99 re-probed 403). **ATH Holding / Elevance (94,427 ppl) no
  longer shows a 6-row asset-class statement — the refused primary
  triggered the prior-year fallback and its 2023 filing's real 29-row menu
  is served, disclosed as 2023.** Docomo Pacific (476 ppl) got a
  broken-font-noise 2023 fallback instead — one plan, recorded.
  `--force-data` over the two trusts; git check unforced. `fc67076c`: the
  fallback disclosure names the true cause (text only, next bump). New
  queue item (k): leading share-class fragments as row names, 18 plans /
  29,785 ppl at ≥30% (Energy Transfer `Trust` 78%). `docs/accuracy-log.md`
  2026-09-18 (run #355 verdict).
- **Previously: `8bc58c1a` — MIRRORED 2026-09-18 06:0xZ.** The v136 store
  (an unpublishable winner may not bury a publishable menu; the trust-pointer
  bits reach the page; statement-of-changes lines are not holdings). pv 136
  at 99.85%, confident 60,105 (+3 / −1), **HIGH 5 = 4 + Citgo's designed
  loss**, overshoot 361, generic-names 108, dominant-row 0. **Dominion
  Energy (18,747 ppl) has its 16-row menu back; First American (17,155)
  carries bits 65536+131072 and its page names the master trust; 47 plans /
  340,403 ppl lose a statement line published as a holding ($2.12B of
  phantom value).** `--force-data` on the one loss (Citgo, 3 rows → 2, the
  rule working); git check unforced. **Third loop gap 03:2x–06:0xZ**
  (session limit). `docs/accuracy-log.md` 2026-09-18 (run #353 verdict).
- **Previously: `647a32a3` — MIRRORED 2026-09-18 02:2xZ.** The v135 store
  (parts 1-2: a one-row master-trust pointer is a reading, not a failure;
  prose is not a holding). pv 135 at 99.85%, confident 60,103 (+7 / −18),
  HIGH 21 = 4 + 17 self-clearing `reparse-loss`, overshoot 360,
  generic-names 109, dominant-row 0. **Prose-as-holding at ≥10% of the menu
  171 → 100 plans / 315,474 → 104,478 ppl; BJC Health System's all-junk
  lineup gone.** `--force` (main's two cron commits, 0 acks / 0 plans the
  branch lacked) and `--force-data` over 18 losses read by name: 16 junk,
  **2 real regressions — Dominion Energy (18,747 ppl, 16 real rows →
  `band-hi`) and Lehigh Valley Imaging (212) — TOP OF THE QUEUE**; First
  American is `tp=1` but still `dx=stmt` with no trust bits, so its page
  still cannot say "held in trust". **LOOP GAP 21:3x–01:0xZ** (weekly usage
  limit; a second wam agent killed mid-edit, edits reset). The mirror
  carried the `fund-facts` workflow to main; its first dispatch followed.
  `docs/accuracy-log.md` 2026-09-18 (run #352 verdict).
- **Previously: `789f589e` — MIRRORED 2026-09-17 20:0xZ.** The v134 store
  (pv 134 at 99.86%, confident 60,114 (+2 / −0), **HIGH 4 = the baseline**,
  **overshoot 390 → 364 / 497,920 ppl** — v133 part 5's fair-value category
  totals, exactly the predicted direction — generic-names 121 → 107,
  dominant-row 0, `overshootTrust` 9, `aggRow` 50, `tkShare` 23.35%).
  `--force` on the git check only: main's one cron commit (`2b90509e`, #349)
  measured at 0 plans / 0 acks the branch lacked, plans array byte-identical.
  Data gate unforced. **LOOP GAP 17:08–20:02Z** (session usage limit; three
  wakes and one check-in queued; a wam agent killed mid-edit, its
  uncommitted parser edits reset, not adopted). `docs/accuracy-log.md`
  2026-09-17 (run #348 verdict).
- **Previously: `38b5df36` — MIRRORED 2026-09-17 16:4xZ.** The v133 store
  (pv 133 at 99.87%, confident 60,112 (+14: 19 master trusts gained, 5
  lost), HIGH 9 = 4 + 5 self-clearing `reparse-loss`, overshoot 390
  unchanged (part 5 not in this store), **`overshootTrust` 13 → 9**,
  **`aggRow` 60 → 50 / 290,822 ppl**, managed-account fold ≥30% **56 → 48
  plans**, generic-names 121, dominant-row 0, `tkShare` 20.43 → 20.98).
  `--force-data` over five losses read by row name: four junk removals /
  the fix working (New York Life's `(in thousands)` row, TE Connectivity,
  Caterpillar PN 002, Solar Turbines' phone-number row) and **one real
  regression — First American Financial (17,155 ppl) lost its 29-row 2023
  fallback to a `band-lo` 2024 region; TOP OF THE QUEUE.** **What reached
  readers:** the CUSIP-as-value phantom gone from 34 trust lineups (HCA's
  $7.93B `CUSIP:` row, 2.1M ppl across the class); Duke Energy's 16 funds
  and H&R Block's 29 unfolded from a managed-account row; the eight degraded
  swaps (Saad 28 → 47 rows, Unex 7 → 32, Yale Club 7 → 31); **and the fund
  table: "Van" + 22 Vanguard rows, +43,962 rows / ~15,900 plans / 18.5M
  participants gain a ticker, 0 lost, 0 flipped** (owner-sent Ocala page).
  `pages-build-deployment` #466 built it. `docs/accuracy-log.md` 2026-09-17
  (run #347 verdict).
- **Previously: `b13e5640` — MIRRORED 2026-09-17 14:0xZ.** The v132 store
  (pv 132 at 99.87%, confident 60,098 (+108), HIGH 4 + 5 self-clearing
  `reparse-loss`, **overshoot 451 → 390** / 524,860 ppl, generic-names 121,
  dominant-row 0, house sizer ≥90% set **48 → 5 plans**). Gate +113 / −5;
  `--force` over main's three no-op hourly commits (0 acks / 0 plans the
  branch lacked, plans array byte-identical), `--force-data` over five losses
  each read by row name — two are DELTA itself (112,027 + 17,776 ppl, the
  ZIP+4 `782,514,321` fallback rows, now correctly `band-lo`/`band-hi`), three
  are junk (sponsor name as a holding, asset-class labels, OCR noise). **What
  reached readers:** Delta's phantom gone; Allina Health (37,565 ppl) shows its
  22 real funds; Duke Energy loses a $2.90B phantom; Bell Nursery 3 → 21 rows;
  the house-name merge across 133 plans; refined former names (2,617 plans).
  `pages-build-deployment` #463 built it. **Queued from the verdict:** 8
  degraded swaps (6,910 ppl, own 2024 filing now wins at 0.48–0.63 where a
  2023 fallback stood at 0.80–1.06 — mechanism untraced) and a NEW class:
  core menu funds folded into the parser-made `Managed account holdings (N
  positions)` row — Duke's 16 target-date/index funds as one $5.58B row at
  49.5%; **56 plans / 158,541 ppl at ≥30% of the menu** (H&R Block 97%).
  `docs/accuracy-log.md` 2026-09-17 (run #344 verdict).
- **Previously: `0ce549a0` — MIRRORED 2026-09-17 02:5xZ.** The v131 store
  (pv 131 at 99.87%, confident 59,990, HIGH 25 = 4 + self-clearing
  `reparse-loss` on 25 junk 3-row lineups, overshoot 451). **What reached
  readers:** v130 — wrapped continuation fragments attributed to the column
  they sit under (Walmart 1.97M: `Lendable Fund` gone, the $2.86B MSCI ACWI
  ex-U.S. fund and the whole LSV name published; Owens Corning, Intermountain,
  IBM; floor 37 plans / 4.9M ppl); v131 — loan-description rows removed
  (7,052 rows / 6,970 plans / 12.75M ppl → 9 rows). Both overrides used with
  the evidence on the record (`docs/accuracy-log.md` 2026-09-17 run #340
  verdict). Main has since taken no-op hourly commits. **On the branch, not
  yet live:** `8a0b9664` (#341: refined former names, 2,617 plans) and
  `e83fa790`/`a9c4aa1f` (**v132**: a 4i region now ends at another
  statutory schedule's caption — Delta was publishing Fidelity's ZIP+4 as a
  $782M holding; Allina Health's real 22-fund menu replaces a $1.35B
  phantom; and the bare house-name merge, 133 plans / 83,051 ppl, Bell
  Nursery 3 rows → 21). **v132 dispatched 12:5xZ**; its verdict must show
  overshoot FALLING (this version changes sums), dominant-row 0,
  generic-names < 230, the house sizer's ≥90% set near zero. Two #340
  regressions are queued (9 small overshoot entrants; First American's
  fallback regained through a different winning region) — see the queue.
  **LOOP GAP: no agent cycle 03:07Z–12:13Z**, recorded in the log.
- **Previously: `e9470dc8` — MIRRORED 2026-09-17 00:1xZ.** The v129
  store (pv 129 at 99.87%, HIGH at the baseline 4, confident 60,008) plus
  v128, v129 and the former-name aliases, all together. Gate **+1 gained /
  −82 lost**, both overrides used and both justified on the record: `--force`
  over main's two no-op hourly commits (0 acks / 0 plans the branch lacked,
  main newer on 0), `--force-data` over the 82 refused trust-plan fallbacks
  reconciled ack by ack in the #334 verdict. **What reached readers:** 87
  plans / 2.38M participants stop seeing a plan-level junk menu (67 of them
  now show their trust's real menu); TJX's 311,623 see the 2024 menu; 5,851
  plans are searchable by a former name and say "Previously filed as" on
  the report. `docs/accuracy-log.md` 2026-09-16 (run #334 verdict, run #335
  verdict). Check `pages-build-deployment` for the build of `e9470dc8`.
- **Previously: `39381d6e` — MIRRORED 2026-09-16 20:1xZ** (v127 store,
  gate +0/-0, HIGH at the baseline 4); main then took two hourly data
  commits (`b1438c14`, `f9e68e74` — measured: 0 acks / 0 plans the branch
  lacked, newer on 0 acks). **#334 PASSED
  (21:19Z, 54 min, `3f12be42`): pv 128 at 99.87%, confident −82 = exactly the
  82 refusals predicted, 0 gained, every loss reconciled to the refusal set,
  overshootPpl 1.16M → 0.58M, HIGH 25 = 4 baseline + `reparse-loss` on the
  refused set (self-clearing).** `docs/accuracy-log.md` 2026-09-16 (run #334
  verdict). **MIRROR HELD ON PURPOSE:** the branch head carries v129 code
  over the v128 store; mirroring that would make main's :23 cron run a
  duplicate full re-parse ON MAIN. **IN FLIGHT: the v129 + alias-prep run,
  dispatched 22:1xZ on `85ceb6ee`** — mirror when its store is complete
  (TJX confident with no `fb`; prep log `former names: N plans carry an
  alias`; HIGH back to 4). The previous run, #334 (id 35146450361), was the
  v128 full re-parse, dispatched 20:25Z on
  `63b3fd2f`. v128 is a fetch-4i guard, not a parser change: the prior-year
  fallback no longer publishes a plan-level lineup for a master-trust plan
  (87 plans / 2.38M participants were showing `le 0 0 1f`, `Collective funds`,
  `Trust`, an employer roster — Walgreen, Macy's, PepsiCo, Comcast, Northrop,
  Medtronic, UPMC). **Verdict test for #334: shard tallies must show
  `fb-skipped-trust-served` summing to ~82** (predicted from the whole class,
  every member traced) and the 67 trust-confident plans render the trust
  menu; Delta and Mars PN 003 keep junk fallbacks by design (other classes).
  `docs/accuracy-log.md` 2026-09-16 (v128). **Also pushed `[skip ci]` on
  `a1c588bf`: former-name aliases** (line 4 + older filings) — code only,
  the DATA arrives with the first prep run after #334, whose log must print
  `former names: N plans carry an alias`; NONE means the EFAST2 column names
  did not resolve. site-test #68 dispatched on it; read its conclusion.
  **And `[skip ci]` v129 (21:3xZ): a bare `IN THOUSANDS` line is now a units
  marker** — TJX (311,623 participants) moves off its 2023 fallback onto its
  2024 menu, 31 rows at 0.975; sized at 0/99 band-lo and 0/48 fallback-served,
  so it is a one-plan fix stated as one. Gate green, diff-lineups 0/0/0 over
  203 corpus filings. The run dispatched after #334 carries v128 + v129 + the
  alias prep together; its verdict must show TJX confident with no `fb`.
- **Previously: `8bae38c2` — MIRRORED 2026-09-16 18:3xZ.** Gate +0/-0
  unforced, **pv 126 at 99.9%**, HIGH at the baseline 4, `pages-build-deployment`
  #448 building it. **What reached readers today, in order of size:**
  (1) **the `app.js` issuer-prefix FALLBACK — +10,040 fee cells / 2,596 plans /
  3,180,229 participants, 0 lost**, measured with the exact shipped expression;
  the lookup had prepended the issuer since v67 and on those rows the prefix
  (usually a TRUSTEE, "Empower Trust Company, LLC") broke a match the bare name
  wins. Frontend only, no re-parse, site-test #67 green. (2) **v126** issuer
  headers promoted to `iss`: 7,366 rows / 615 plans / 2.05M participants now
  show the firm before the fund; 335 of those gained a ticker on their own.
  (3) **v125** units marker above the region head: **exactly one plan** (US
  Foods, off its 2023 fallback onto a correct 2024 menu) — measured, not a
  class. **v127 is in flight (#330)**: strips the party-in-interest `*` my v126
  header path leaked into 3,224 issuers (`Fidelity**`); the frontend already
  strips it for display and lookup, so v127 is hygiene for the store.
  **The verification pass that found (1) and the `*` defect measured the
  shipped change's LOSSES on the same store as its gains.** `docs/accuracy-log.md`
  2026-09-16, last four entries.
  Intermediate mirrors 12:3x-18:1xZ (`904fc7a8`, `6539ec89`, `622c3540`,
  `61ff7a4b`) were gate +0/-0 data-and-docs mirrors; run #326 (v125) FAILED on
  a killed shard, committed a 94.88% partial store, was caught by the
  automated `partial-store` HIGH and NOT mirrored; #328 (v126) re-read it whole.
- **Previously: `021bbbe1` — MIRRORED 2026-09-16 10:1xZ.** Gate +0/-0, pv 124
  at 99.9%, HIGH at the baseline of 4. Documentation only again — no code or
  data change reached readers in this or the previous mirror.
  **The overnight record, so a later session can weigh it:** five cycles of
  measurement produced four findings that are RECORDED AND UNFIXED (Macy's
  prose-as-holding, UnitedHealth metadata glue, value-in-name 217 rows, the
  fallback quality split), two questions CLOSED IN THE NEGATIVE (fallback
  disclosure is present; filed tickers size to 1,305 participants), and one
  re-derivation pass. **Nothing was shipped to readers overnight and that is
  the correct outcome** — every remaining queue item is either owner-gated or
  needs a `PARSER_VERSION` bump, and the alternative was starting one unasked.
- **Previously: `ab4058d8` — MIRRORED 2026-09-16 07:1xZ.** Gate +0/-0, pv 124
  at 99.9%, HIGH at the baseline of 4. Documentation only over the mirror below
  (the overnight findings); no code or data change reached readers.
  **HELD ONE HOUR AND THAT WAS CORRECT:** at 06:1xZ run #314 — the daily cron,
  firing late at 06:07 as this file predicts — was IN FLIGHT ON MAIN. Mirroring
  force-pushes the branch onto main while such a run is about to commit there,
  so the cycle dispatched nothing and mirrored nothing and said so. The two
  rules compose: "dispatch every hour" yields to "not while a run is in
  flight", and the in-flight run being on MAIN rather than the dev branch is
  the case that makes the mirror unsafe rather than merely the dispatch.
- **Previously: `b377afb6` — MIRRORED 2026-09-16 02:1xZ.** Gate +0/-0, pv 124
  at 99.9%, HIGH at the baseline of 4. Adds `tkShare` to the accuracy trail:
  **20.38% of published holding rows resolve to a fund**, so the other ~80%
  show a BLANK fee cell (`fund-er.js` is the only ER source). Sampled 1-in-20
  and DETERMINISTIC, not random — run-to-run comparison is the point, and a
  fresh random draw each run would add noise to the signal being watched;
  validated at 20.38% of 85,277 against 20.41% over all 1,705,524, and it adds
  ~3s to a 23s audit. `ticker-sweep.mjs` computes the exact figure.
  **MECHANISM WORTH KNOWING, learned here:** the change was pushed with
  `[skip ci]` DURING run #309 and that run's own merge job executed it anyway —
  because merge-4i checks out the LATEST branch state before running. So a
  `[skip ci]` commit made mid-run is not deferred to the next run; it takes
  effect in the current one's merge. Verified by reading run #309's own data
  commit, which carries `tkShare: 20.38, tkSampled: 85277`.
- **Previously: `8785bfed`, the COMPLETE v124 store plus the fund-name
  matching repair — MIRRORED 2026-09-15 23:1xZ.** Gate **+0 gained / -0 lost**,
  pv 124 at 99.9%, 78 fetch failures, reader failures 0. Carries wam's first
  item: identified holding rows 19.67% -> 20.41% (+12,716 rows, 7,103 plans /
  11.66M participants gain at least one), and **270 rows across 270 plans /
  201,088 participants STOP publishing FTBFX for Fidelity ADVISOR Total Bond**
  — a different and more expensive fund. All 13 changed assignments are
  OTCFX -> TRSSX and every filed name says `Instl`. Numbers re-measured
  independently before the mirror, not taken from the agent's report; the FTBFX
  count was UNDERSTATED by the agent (224 reported, 270 actual, 100.0% of the
  dropped names containing `Adv`). The git check was force-overridden on the
  same evidence as the two mirrors below: main's `47a7f437` had a
  byte-identical `plans` array, differing only in `generated`, with 0 acks and
  0 plans the branch lacked and pv differing on zero of 68,767.
  **STILL OPEN and larger than what was fixed:** ~80% of published rows carry
  no fund identity at all, and **4,321 rows / 14.45M participant-weighted
  publish an R6/institutional ticker for a name stating class A/C/R1-R5**
  (`MFS VALUE FUND CL A -> MEIKX`, on Pratt's page). Both need table work, not
  matcher work. `docs/accuracy-log.md` 2026-09-15.
- **Previously: `c3c873d9`, the COMPLETE v124 store — MIRRORED 2026-09-15
  19:1xZ.** 60,089 confident, lineups 59,755, match 43,027, vesting 52,825,
  Roth 37,742, HIGH at the baseline of 4, **pv 124 covers 99.9%**, 78 fetch
  failures (0.11%, the whole permanently-403 set), reader failures 0. Gate
  **+0 gained / −0 lost**, unforced. Carries v124's Roth qualifier fix, the
  short-form 401(m) card, and `audit-overshoot` — so main's own hourly runs now
  write `overshoot` / `overshootPpl` into `coverage-history.jsonl` and the
  471-plan number stays continuous instead of only existing on the dev branch.
  The git check was force-overridden, with the evidence produced FIRST and
  stronger than the v122 precedent below: main's one scheduled commit
  (`bbc716d4`) had a plans-all of identical byte length whose **`plans` array
  is byte-identical** — the sole difference is the `generated` timestamp — and
  `lineups-status` matched on all 68,767 acks with **pv differing on zero**.
  0 acks and 0 plans on main that the branch lacked. Only a timestamp and a
  duplicate coverage line were discarded. As always, `--force` covered the GIT
  check alone; the data gate passed on its own.
- **Previously: `9bb4ba05`, the COMPLETE v123 store — MIRRORED 2026-09-10
  23:1xZ.** Same numbers as the v122 mirror below (v123 changes only the
  `frozen` flag, which no coverage metric counts): 60,089 confident, HIGH 4,
  pv 123 covers 99.9%, gate **+0 gained / −0 lost**. One master trust
  (`20251203145826NAL0000493523001`) carries `e=analyze` at pv 122 — it is a
  TRUST, not a plan, nothing was lost by it, and being stale means the next
  incremental run retries it automatically.
- **Previously: `5b4aa3d0`, the COMPLETE v122 store — MIRRORED 2026-09-10
  20:4xZ after five days of held runs.** 60,089 confident (+195 over the v117
  store it replaced), lineups 59,755, match 43,027, vesting 52,825, **HIGH at
  the baseline of 4**, pv 122 covers 99.9%, 68 fetch failures (0.10%), reader
  failures 0. `mirror-gate.mjs` passed unforced: **+195 gained, −0 lost.**
  The 31 prior-year lineups are back, Lowe's among them.
  The git check was force-overridden and the justification is on the record:
  main's five scheduled commits appended **five byte-identical coverage lines**
  at confident 59,894 (no-op hourly runs), and the test `mirror.sh` itself
  names — compare plans-all acks — returned **0 acks and 0 plans on main that
  the branch lacked**. Only four duplicate "nothing changed" history lines were
  discarded. Do not read this as licence to skip the rebase: the evidence was
  produced first, and `--force` covers the GIT check only, never the data gate.
  History: v114+v115 (+123), v116 (+1), v117 (+160) all mirrored with zero
  losses.
- **SHIPPED AND LIVE: the `frozen` extractor (v123, run #259, mirrored
  2026-09-10 23:1xZ).** Flags went **1,378 → 1,318, exactly the 60 predicted**
  (482,259 participants no longer shown a false freeze warning), and the
  dropped set is precisely the specimens: Comcast, Honeywell, GE Healthcare,
  Johns Hopkins, MMS, Teledyne, Stantec, Paychex. The coverage line came back
  BYTE-IDENTICAL to #256's, which is the correct outcome — `frozen` appears
  nowhere in it, so lineups/match/vesting must not move. History and the
  reasoning that got here: `frozen` claims "the filing states contributions have been
  discontinued". **1,378 plans carry it; the demonstrable false positives are
  60 (482,259 participants), not 830.**
  **CORRECTED THE SAME EVENING — read `docs/accuracy-log.md` before reusing
  any number here.** The first version of this bullet said "830 (60%) reported
  employer contributions that same year" and treated that as proof the flag was
  false. **It is not.** A plan terminated in June contributes January to June
  and files a final-year return showing both; paying and terminating are the
  ordinary shape of a final-year filing. The display guard built on that
  inference hid 830 plans of which **750 were GENUINE terminations** (637,268
  participants) to catch 80 false ones, and has been replaced. Eight readings
  did not license a claim about 830 cases — **draw randomly to estimate a RATE,
  a rule already on the books for fix yields and not applied here to a defect
  rate.**
  The two false shapes are real and are readable from the TEXT: the specimens
  below all hold.
  **(a) a DIFFERENT NAMED PLAN** — Comcast quotes *"The Solar Energy World
  401k plan was frozen"*, Johns Hopkins *"The Bayview Plan was frozen in
  2002"*, GE Healthcare *"the GE Pension Plan was frozen"*, plus Stantec,
  WellSpan, LSC; **(b) a CONDITIONAL** — Honeywell's *"a participant will
  become 100 percent vested in the event the Company terminates or permanently
  discontinues contributions"* is the boilerplate ERISA vesting provision in
  nearly every plan document. The trigger regex at `lib-4i.mjs` ~3642 tests
  only that the words appear, never whose plan the sentence is about or
  whether it is hypothetical — the same defect family as the match-quote guard.
  **The display guard is SHIPPED and needs no re-parse** — `frozenClaimOk` in
  `lib-disclose.mjs`, and the extractor fix should reuse its predicate
  verbatim rather than inventing a second one. It judges **which plan is the
  SUBJECT of the freeze verb**, which is what tying the name to the verb rather
  than to the sentence buys: *"the Plan was frozen, and the Organization's
  employees became eligible to participate in the Cayuga Health 401(k)"* names
  another plan as the DESTINATION while this plan is what froze, and judging
  the sentence got **3 of 6 sampled wrong** there. Judging the subject got
  **22 of 22** right. Rejects 60, keeps 1,318. Eleven verbatim fixtures include
  the decisive pair: Hanes Companies' own filing is KEPT while Leggett &
  Platt's filing quoting *"the Hanes Retirement Plan was frozen"* is REJECTED.
  **THE PREDICATE NOW EXISTS THREE TIMES** — `lib-4i` (parser), `lib-disclose`
  (static pages), `app.js` (browser) — and every copy is tethered: the smoke
  test ties app.js to lib-disclose, and **`parser-gate.mjs` ties lib-4i to
  lib-disclose** on the same seven pinned filings and REFUSES TO PARSE THE
  UNIVERSE on drift (negative-controlled). Three untethered copies of one rule
  is how the match-quote guard published a false heading on 615 pages.
  `extractPlanFeatures(text, sponsorName)` — the sponsor name is what lets
  "the Hanes Retirement Plan" in Leggett & Platt's filing be told from "the
  Plan" in Hanes' own.
- **RESOLVED 2026-09-10, kept only as history — do not read the numbers below
  as current.** #244-#253 were the two null-deref runs (isConfident, then
  featFb/fbUsed). #254 was the first healthy re-parse but `mirror-gate.mjs`
  refused it over **31 prior-year lineups**, Lowe's (295,951 participants,
  $8.6B) among them. The obvious hypothesis — "v119 broke the fallback" — was
  FALSE and measurement said so: of main's 1,249 prior-year lineups 1,061 were
  still served from the prior year and 157 were UPGRADED, so only 31 lost
  anything. **The real cause was that prep offered exactly ONE prior filing**;
  when that one was unreadable the plan got nothing even though an older
  filing parsed. v122 made `fallbacks.json` carry up to three candidates,
  newest-first, and all 31 returned (#256, gate +195/−0).
  The lasting lesson is about the RECORD, not the rescue: a fallback never
  attempted and one that read but was unpublishable left an **identical**
  trace — no `fb`, a `dx` from the primary, no error code — so the cause could
  not be named from the store at all. Both now log (`fb-vanished`,
  `fb-rejected`). **An absent error code is a published claim too.**
  Note these entries were already deleted from the branch store by #244, so
  v120's "keep the stored lineup when the fallback cannot be read" guard had
  nothing left to protect — the guard is right and stays, but it cannot
  resurrect what an earlier run removed.
- Numbers move every run — `docs/coverage-history.jsonl` is the source of
  truth, and the merge job appends to it. Its lines now carry `dl` and
  `pvTopShare` so a partial store is distinguishable from a complete one.
- **Parser history lives in `docs/accuracy-log.md`, not here.** Every version
  is recorded there with what was wrong, the change, and the prevention. This
  section previously carried a wall of v34-v46 detail that read as current
  while production was sixty versions ahead; do not rebuild it. What belongs
  here is the state a new session needs before it acts.
- **The v100-v105 arc (2026-09-02/03), because it is one defect with five
  causes and the sixth will look like the others.** In each, several real
  holdings collapsed onto a SHARED NAME and were summed into a holding that
  does not exist, published as a confident lineup:
  v100 wrapped identity judged by its last line only ("Lending*" -> Amgen's
  $3.59B "Collective Trust Fund"); v101 the schedule's own unlabelled GRAND
  TOTAL parsed as a holding (Fremont 1.974x ratio; also cleared Emory's "See
  attachment" at 99.7% of $5.54B); v102 a category description outranking
  SHORT real fund names ("Explorer", "Wellington" -> SAP's $2.4B row);
  v103 a group header glued into names, plus the COST column's "Participant
  Directed" read as a description; v104 a vintage judged uninformative
  ("American Funds 2010 R6" minus the house leaves "2010 r6") -> W. L. Gore's
  $852M row; v105 a single NON-FUND row carrying >=90% of the sum (Comcast
  published "At fair value" at 91% of a $19.69B plan whose filing contains no
  4i table at all). Audits: `audit-generic-names.mjs` fell 63 plans/$19.0B ->
  45/$1.7B across v100-v102; `audit-dominant-row.mjs` holds the v105
  population. **Neither may grow.**
- **Diagnosing a defect is a fixed loop now, and the tools exist —
  do not rebuild them.** `gap-census.mjs` buckets the full-form universe by
  which field is missing; `size-class.mjs` buckets a set of acks by WHY the
  parse fails; `size-features.mjs` does the same for missing match/vesting;
  `trace-filing.mjs` runs the production parser over one filing and prints its
  working (`WAMPO_TRACE=rows|cands`, `WAMPO_TRACE_MATCH=<value|substring>`);
  `diff-lineups.mjs` diffs lineups against any git ref over the local corpus
  and exits non-zero if a change INTRODUCES a fabricated row.
- **RESIDUALS RE-DERIVED 2026-09-21 AGAINST THE LIVE v176 STORE. The table
  below this block was measured on v123 and is FIFTY VERSIONS STALE — read its
  prose for the hard-won causes, never its numbers.** Regenerate with
  `node scripts/gap-census.mjs`.

  | plans | participants | assets | bucket | vs v123 |
  |---|---|---|---|---|
  | 461 | 245,715 | $11.8B | `few` fewer than 3 rows | was 532 / 307,594 |
  | 351 | 149,448 | $4.8B | `nohead-noattach` NOT OURS: no audited attachment | (split) |
  | 227 | 321,676 | $34.7B | `stmt` statement/aggregate won | was 253 / **142,545** |
  | 88 | 99,688 | $9.8B | `band-hi` sums above plan assets | was 128 / 110,568 |
  | 48 | 88,322 | $17.0B | `trust` unlinked pointer | was 44 / 56,335 |
  | 47 | 145,872 | $3.5B | `nohead-notable` NOT OURS: attachment carries no schedule | (split) |
  | 35 | 8,148 | $7M | `tiny` under $1M of assets, no denominator | — |
  | 30 | 178,546 | $11.0B | `band-lo` far below | was 34 / 155,970 |
  | 28 | 9,762 | $44M | `consolid` NOT OURS | was 29 |
  | 15 | 11,823 | $278M | public copy withdrawn (403) | was 7 |
  | 9 | 3,653 | $84M | `nohead-absent` NOT OURS: pages not published | (split) |
  | 7 | 10,619 | $2.0B | `noregion` | was 6 |
  | 4 | 2,113 | $20M | **`nohead-unread` OURS** | was 4 |
  | 2 | 1,469 | $10M | `narrow` 3-4 rows | was 9 / 4,126 |

  **1,354 live plans, ~1.28M participants** — down 107 plans from the 1,461
  recorded at v123, and every bucket fell except three.

  **`stmt` is the one that looks like a regression and is the opposite.** Its
  PLAN count fell 253 → 227 while its PARTICIPANTS rose **142,545 → 321,676**,
  so large plans moved in. All four of the largest are diagnosed and every one
  is a CORRECT suppression:

  - **UPS, 134,811 ppl, $14.2B — v169's designed outcome, already on the
    record.** Once the $1,470,493,000 net-appreciation phantom was removed, the
    ten remaining rows are `Lifestyle funds`, `UPS stock fund`,
    `Fixed-income funds`, `Common stock` — an asset-class table, not a menu —
    and `isStatement` correctly flipped. Readers get the filed-in-aggregate
    sentence instead of a class table with a $1.47B fabrication in it.
  - **Endeavor Health, 33,523 ppl**: 5 rows led by `Collective trust fund -
    measured at NAV (a)` at 76.5%, and the stored sum is **$3,873,316 against
    $2,318,358,681 of assets** — the fair-value note's column, not the plan.
    (Its sister plan, Endeavor Health Clinical Operations, 20,113 ppl, IS
    confident with 34 real rows.)
  - **MetLife, 32,414 ppl** — already documented below: `Participant-directed
    investments` at 99.5%, the one aggregate line DOL permits.
  - **Pacific Maritime Association, 19,026 ppl, $3.44B**: `Commingled pooled
    funds` 67.9%, `Mutual funds` 25.9%, `Common stocks` 6.1%. An asset-class
    statement at ratio 0.90.

  **So the bucket growing by participants is the guards holding, not coverage
  lost** — and reading the raw bucket size as a regression would have been
  exactly wrong. `band-hi` 128 → 88 and `narrow` 9 → 2 are the plainest wins.
  The two rises that are NOT explained here are `trust` 44 → 48 and the 403
  residue 7 → 15; the second is the bucket genuinely growing as filings are
  withdrawn (re-probed three times on this record), the first is unexamined.

- **Known residuals, EXACT — corrected 2026-09-08 after the final-year split.**
  The earlier version of this table named `nohead` (5,966 plans) the priority.
  That was ghosts: **6,530 of the apparent gap plans filed Schedule H with $0
  year-end assets — final/transition-year filings of plans that terminated,
  merged, or transferred.** 99% of `noregion` and 91% of `nohead` were this.
  Mechanism, not coincidence: with assetsEOY=0 the ratio guard can never accept
  a region, and a wound-down plan usually files no schedule at all. Red Lobster
  is the type case — Sch H filed $0 EOY while its own attached audit itemizes
  $25.2M still in stable value and loans; the FILING is inconsistent, our
  ingest is faithful. **Do not "fix" the parser to accept self-totaled
  schedules for these** — a lineup for a plan nobody is in anymore is
  fabrication risk for zero user value; the right treatment is the census
  category (done) and a frontend wind-down explanation line (SHIPPED, a77a070d,
  app.js fundTable's first rung — it names the $0 year-end filing, the prior
  year's opening balance, and where a participant's money went).
  The LIVE-plan lineup gaps, whole-universe counts from dx. **RE-SIZED
  2026-09-11 against the live v123 store** — the leading numbers are current;
  the number in (was N) is the previous measurement, kept so the direction is
  readable. Every bucket fell except `trust`, which gained exactly one plan
  (see below). Regenerate with `node scripts/gap-census.mjs`.

  | plans | participants | assets | cause |
  |---|---|---|---|
  | 532 (was 615) | 307,594 | $21.3B | `few` fewer than 3 rows (v112: -52, mostly RECLASSIFIED to stmt — a truer cause, not a loss) |
  | 417 (was 527) | 303,175 | $8.5B | `nohead` no heading seeded a region. The census now splits it four ways: 357 no audited attachment in the public copy, 47 attachment present but carrying no schedule, 9 schedule referenced but pages not published, **4 OURS** (table-shaped pages under an unknown heading). SPLIT by `ds` (v113): 484 permanently unreachable, 43 ours. The `readfail` half of "ours" is CLOSED by v114 — the statutory column caption now seeds a region, and 28 of those 32 plans publish a real menu; the residue is 2 unlinked-trust pointers (Genentech $14.3B), 1 truncated attachment, 1 CONSOLIDATED filing. The 11 `nohead/unread` plans are **CLOSED by v121** — all ten non-trust members were run through the production parser (not sampled, not read by eye), and **5 now publish**: Commercial Vehicle Group 2,483p/$67.3M (29 rows, 0.987), Medical Device Components 373p/$24.9M (26, 0.980), MPB Hotel 477p/$10.8M (19, 0.969), Atrium 937p/$7.7M (16, 1.000), Innovative Cosmetic 166p/$4.8M (27, 0.975) = $115.5M, 4,436 participants. **The hand review that produced the previous version of this row was wrong in BOTH directions** and the parser corrected it: Commercial Vehicle Group was filed here as "a cash-flow statement, not ours" and is the largest recovery in the bucket; `Current Plan Assets` was filed as a recordkeeper title and is an ADVISER DECK whose two-column layout publishes "0.0 Median Market Cap" at 46% of the sum — dropped, and pinned as a control. The remaining 5 stay blank correctly (3 lead with `Statement of Net Assets AVAILABLE FOR BENEFITS`, the audited balance sheet — the `$` anchor on the template title is load-bearing; Austin 3(16) is a POOLED EMPLOYER roster with no candidate title at all) |
  | 253 (was 374) | 142,545 | $15.6B | `stmt` statement/aggregate won, not a menu (+57 from few/band-hi; these now render the filed-in-aggregate line, bit 4096). **Top of the bucket CHECKED 2026-09-11 and both are correctly suppressed** — MetLife (32,414p, $8.32B, 80 rows @ 1.00) wins on `Participant-directed investments` at **99.5% of the plan**, the single aggregate line DOL permits for participant-directed money, with the remaining 79 rows the itemized non-participant-directed bonds; Alight (11,234p, $2.61B, 21 rows @ 0.98) wins on a bare `CUSIP:` row at **92.6%** amid a brokerage flood. Publishing either would recreate the v105 dominant-row shape exactly. This was a RANKED look at the two largest. **THE BUCKET-WIDE MEASUREMENT THE PREVIOUS SENTENCE SAID WAS MISSING NOW EXISTS (2026-09-12), and it closes the bucket: reachable is under 10 plans / ~1,000 participants.** Classified whole-population from the store, no sampling and no downloads: **140 plans / 91,618 ppl have a single non-fund row at >=90% of the plan** — correctly suppressed, publishing any of them recreates the v105 shape; **44 / 16,627 store no rows at all** and cannot be diagnosed without the PDF; **69 / 34,300** are the only class where a menu could have lost, and reading ALL 69's rows (not a sample — the population is 69) finds 17 whose every row is a type label or a bare fund family, and a residue that is overwhelmingly MORE house names and fragments. Real fund names appear in about four: Natural Choice Foods (251p, `Vanguard Target Retirement Income Fund`), The Launchcode Foundation (144p, `Vanguard Total Stock Mkt Idx Adm`), Global Leadership Academy (365p), American Eagle Ready Mix (17p, `Common Collective Trusts TransAmerica LifeGoal 2030`). **My first pool for this was 327 plans / 1.38M participants and was WRONG** — it omitted the census's own master-trust exclusion and swept in Kroger (411,922), Disney and Caterpillar. Running `gap-census.mjs` reproduced 253 / 142,545 exactly and the hand-rolled pool did not; the implausible size was the tell, for the third time. **Reproduce the shipped count before classifying anything** |
  | 128 (was 212) | 110,568 | $7.2B | `band-hi` holdings sum ABOVE plan assets. **CLASSIFIED WHOLE-BUCKET 2026-09-11** (disjoint, shipped predicates first, no sampling): **generic/aggregate 62 plans / 80,158 ppl — 72% of the bucket's people**, a non-fund label winning the region; **still unexplained 31 / 18,929 — now DIAGNOSED 2026-09-11 and too small to fix.** Of the 29 with >=$1M of assets (12,688 participants; the rest overlap the ratio-meaningless class below), **18 are diagnosable from the store** and fall into named families: OCR noise (Zausner `"Mutual FUnnds ...c.c. ccc estes"`, Braceys `"Z 2Z2Z2ZZ22Z2Z2Z7ZAZZ2A222272"`, LIUNA `"COM M ON"`), **ASSET-CLASS labels** (Just Born x2: `"Balanced"`, `"Domestic equities"`, `"Money market"`, `"Fixed income"`), insurance contract-value columns (Univ. of Maryland Medical: `"Approximate Contract Value"`, `"Adjusted Contract Value"`, `"Net Value"`), provider house names beside real funds (Vermont Precision: `"Vanguard"`, `"T .Rowe Price"`), bare TICKERS (Vannoy: `ITLWIX`, `ITLQIX`, `ITLZIX`), and entity names (Cornerstones: `"CHURCH"`, `"John Hancock Life Insurance Company"`). **11 store no rows at all** and cannot be diagnosed without the PDF. **Worth recording rather than fixing: 12,688 participants across 29 plans.** One observation generalises though — **the shipped `GENERIC_TYPE_NAME` covers investment VEHICLES ("collective trust", "pooled separate account") and not ASSET CLASSES ("Balanced", "Domestic equities", "Fixed income")**, which is a concrete instance of the under-matching the method note describes; **ratio meaningless 28 / 6,884** — year-end assets under $1M, so `rt` divides by almost nothing (Insite Digestive rt=1,680,043,000; Morphe 206,013,531). That last one is a defect in the DIAGNOSIS, not the parse: `diagnose()` should not assign a ratio-based `dx` against a negligible denominator. **FIXED 2026-09-12** — below $1M of year-end assets the diagnosis is now `dx: "tiny"` and **no `rt` is recorded at all**, because a stored number that cannot be interpreted is worse than an absent one. `gap-census` names it in the same commit, so it cannot fall through to "UNDIAGNOSED (pre-v106 data)" — which would have been false twice over. Positive AND negative control through the real `PARSE_SHARD` path: 70 Linden Food ($916k) came back `dx=tiny rw=3` with no `rt`, AT&T ($43.1B) came back `dx=band-hi rw=23 rt=204` unchanged. **It is INERT until the next PARSER_VERSION bump** — without one the work list is only the 68 dead 403s, so the census still shows these 28 plans in `band-hi`. Do not read the unchanged census as the fix failing. Form 5500 page content as a holding 5 / 2,068; statement-of-changes 2 / 2,529. **4 of the 128 are UNLINKED MASTER-TRUST members** whose trust note parsed as a plan menu — Conagra (`Plan Interest in Master Trust at Fair Value` at 97% of plan), A.O. Smith (91%), Hallmark, American Bank & Trust — tiny by count but **39,223 participants, 35% of the bucket's people**. **THE DISCLOSURE HALF IS SHIPPED 2026-09-11** — bit 65536 (`trustHeldUnlinked` in merge-4i) suppresses the false document-shape sentence and app.js states the true cause. **52 plans** after two widenings the same day: the first gate was `!mtiaAck`, which is how the cases were FOUND, and it left 41 plans / 631,022 participants (Albertsons 236,172, Mars, Johnson Controls, Siemens, Schlumberger) linked to an OPAQUE trust still being told the filing was unreadable. Bit 131072 marks those, because they need a different true sentence — saying "we could not match this plan to that return" about Albertsons would replace one false claim with another. Verified each time by the pipeline's own merge reproducing the count and by the defect-finding script returning 0. **The trust NAME was never unshipped** — a previous version of this sentence said carrying it into plans-all remained to do, and it was already in plans-all, in the `data/plans` shards the browser fetches, and read into the plan object at app.js:580. What WAS wrong is that bit 65536's branch returned before the branch that prints it, so 8 plans (Genentech, Conagra, A.O. Smith, ~74,000 readers) were downgraded from naming the trust to "we could not match this plan to that return". Fixed 2026-09-12, `docs/accuracy-log.md`. The lineup itself stays unreachable either way. The bucket fell 212 → 128 across v115–v123 (−84 plans / −90,282 ppl / −$7.9B, at least the ~48 projected); **attribution is not clean and is not claimed** — eight versions shipped in between and the census records none of them. v115's mechanism, still the largest single shape: the FAIR VALUE HIERARCHY NOTE (Level 1/2/3 columns, two plan years, its own totals, ASC 820-10 text) read as the schedule, so its subtotals are summed beside the real menu (Vandalia's NAV row is $1.14B against $853M of plan assets, so it cannot be a subtotal of this plan); the fix seeds from the statutory header. NOT subtotal arithmetic, NOT vocabulary. **TWO METHOD LESSONS, both earned here and both costly:** (1) the master-trust shape looked DOMINANT in the six largest plans and is 4 of 128 — ranking picks what to open, never what a bucket contains; (2) a hand-written generic-name list that omitted `registered investment companies` (which is IN the shipped `GENERIC_TYPE_NAME`) produced a three-way split that dissolved on re-count — **the second time in two cycles a hand-rolled copy of a shipped predicate produced a wrong number. Reach for the shipped one.** |
  | 34 (was 52) | 155,970 | $6.5B | `band-lo` far below. OPENED WHOLE 2026-09-09 (53 live plans by the local count) — four causes, only one ours: Paychex's unscaled "(Dollars, Units, and Shares in Thousands)" schedule, fixed in v116; YMCA is the Fund's own asset-class statement (truer label `stmt`); Aramark seeds its region off a TABLE-OF-CONTENTS line onto the Form 5500 cover pages; Cisco parses as `noregion` under every version and its stored band-lo diagnosis comes from the PRIOR-YEAR FALLBACK ack. Extending v115's caption retry to band-lo was built, measured at 1 recovery of 52, and reverted unshipped |
  | 44 (was 43) | 56,335 | $14.8B | `trust` bare trust pointer, unlinked. **The $455M -> $14.8B jump is NOT degradation** — it is Genentech ($14.35B, 36,458 participants) arriving from `nohead`'s residue, which the nohead row above had already named as an unlinked-trust pointer. Verified by subtraction: without Genentech the bucket is 43 plans / $455M, matching the prior figure exactly. A reclassification to a truer cause reads as a regression in any dollar-ranked view; check before believing one |
  | 6 (was 8) | 10,033 | $2.0B | `noregion` heading fired, nothing scored |
  | 29 | 11,132 | $48M | `consolid` NOT OURS: the attachment is CONSOLIDATED, its declared total exceeds this plan's Sch H assets |
  | 9 | 4,126 | $74M | `narrow` 3-4 rows, plausible but too thin to trust |
  | 7 | 7,267 | $132M | public copy withdrawn from the bucket (403) |
  | 2 | 210 | $3M | pre-v106, cause not recorded |

  **1,461 live plans total, 1.11M participants, $76.2B — down from ~1,900.**
  The total falling is what distinguishes recovery from plans merely shuffling
  between buckets: reclassification moves a plan sideways and leaves the sum
  alone.

  **PRIORITIES, current — and read the `ours` column, not the size column.**
  By raw size: `few` 532 / 307,594 / $21.3B, `stmt` 253 / 142,545 / $15.6B,
  `band-hi` 128 / 110,568 / $7.2B. By what is actually OURS the order inverts,
  and that is the number that should drive work:

  | bucket | raw | reachable | basis |
  |---|---|---|---|
  | `few` | 532 | **~70 (13%, CI 4-31%)** | random 30 read by row name |
  | `nohead` | 417 | **4** | census `ds` split; 413 documented absences |
  | `stmt` | 253 | **<10 plans / ~1k ppl** | whole-bucket classification 2026-09-12 |
  | `band-hi` | 128 | **2 plans / 266 ppl** (was 17 — corrected same day) | outcome test, not the name count |

  **EVERY CELL IS NOW MEASURED (2026-09-12): the whole fund-menu option is
  about 86 plans.** `few` ~70 + `nohead` 4 + `stmt` <10 + `band-hi` 2 — against
  1,461 in the table. The rest is documented absence, correct suppression, or
  a filing too thin to publish from.

  **`band-hi`'s cell was published as 17 and CORRECTED TO 2 THE SAME DAY, and
  the correction is the fourth instance of one error.** The route there is
  worth keeping whole because each step looked like progress:

  1. A hand-rolled "is this a real fund name" test said **48 plans** — it was
     counting `"D. Total Income"`, `"Ending Balance"`, `"Thereafter"`,
     `"YEAR"` and `"z f <SSSS5S5SS55"` as funds.
  2. The SHIPPED predicate `fundTickerInfo` (in `fund-er.js`; attaches a ticker
     only when the filed name identifies a specific registered fund — load it
     the way `build-ticker-reference.mjs` does, from git HEAD through `vm`)
     said **17 plans / 6,476 participants** with three or more identifiable
     funds. Better, and published.
  3. **17 is a COUNT OF A CONDITION, not of an outcome.** Three identifiable
     names does not mean a publishable lineup: ask instead what those funds are
     WORTH against plan assets, and the bucket collapses. Of the 17, **7 clear
     the confidence floor on identifiable funds alone (1,979 ppl), and only 2 —
     The Butcher Block 117p at 1.24, Upe Resources 149p at 0.82 — would publish
     a menu covering most of the plan.** Five more clear the floor at 0.49-0.78,
     which publishes half a plan as if it were the menu: precisely the
     degraded-swap shape `swaps-degraded.txt` exists to flag. Two are broken
     outright (Jefferson Hospital and Compassionate Cancer both compute 15x).
     The remaining eight have identifiable funds as a small slice — SLM 0.38,
     Pennian Bank 0.03 — because the plan's money is in CITs, annuities and
     stable value that `fundTickerInfo` cannot name BY DESIGN.

  That last point is the stated under-match direction doing exactly what it was
  supposed to do, and it is why the miss side of that predicate must never be
  read as "nothing here" — but it also means the HIT side cannot be read as
  "something publishable here" either. **Both directions needed the money test,
  and only one of them got it before publishing.**

  **`few` is NOT the place to spend parser effort**, though it leads on every
  raw axis. Diagnosed from the store (`rw`/`rt`, no downloads): 60 plans got
  rw=0, 218 rw=1, 254 rw=2, and 328 of 532 sit at ratio 0.90-1.10 — which looks
  like correct parses of one-vehicle plans held back by the 3-row floor. **It
  is not.** Reading the stored row names on a RANDOM 30:

  | class | n of 30 | example |
  |---|---|---|
  | parse garbage / OCR / sponsor name as a holding | **13 (43%)** | `"@ Total non"`, `"e Py ge 6"`, `"DUNHAM'S ATHLEISURE CORPORATION"` |
  | the FILING reports only an asset-class total | 9 (30%) | `"403(b) annuity contracts and custodial accounts"` |
  | provider house name only, no fund | 4 (13%) | `"VOYA"`, `"T. Rowe Price"` beside a loan row |
  | plausibly publishable short menu | **4 (13%)** | `"TFLIC Fixed Fund"`, `"Govt Fixed Fund"` |

  So ~87% has nothing publishable and **the 3-row floor is doing real work** —
  that 43% garbage class is what would become fabricated rows if it were
  lowered, which is the v100-v105 family. **Do not lower `funds.length >= 3`.**
  Two small real defects fell out, recorded not fixed because the floor hides
  them anyway: a **loan interest-rate range parsed as a row NAME**
  (`"from 4.25% to 9.50%"`, 13 plans, all Massachusetts savings banks on one
  shared filing template), and the **sponsor's own name parsed as a holding**
  (Sanctuary For Families, Dunham's Athleisure, Reliabank Dakota).

  **A FILING SHAPE THAT SPANS THREE BUCKETS, named here because it keeps being
  rediscovered: THE PROVIDER HOUSE NAME AS THE WHOLE HOLDING ROW.** The
  schedule's description column carries only the fund FAMILY — `"Vanguard"`,
  `"Fidelity"`, `"American Funds"`, `"SPDR"`, `"iShares"`, `"Macquarie"`,
  `"Cohen & Steers"` — with no fund after it. It is 4 of 30 in the `few` random
  read, it is Vermont Precision in `band-hi`, and it is a large share of
  `stmt`'s class E. Nothing is publishable from it (`"Vanguard"` is not a fund)
  and nothing is wrong with our parse; the FILING is that thin. Worth one name
  rather than three separate discoveries.

  **BEFORE OPENING ANY BUCKET, CHECK THE EXAMPLE IS STILL IN IT.** This
  paragraph has now gone stale three times, and the third was inside the
  sentence that said so: it carried "`stmt` still includes State Farm
  20251010104106NAL0007965633001" forward without checking. **State Farm
  publishes** — c=1, no `dx`, 20 Vanguard rows, 101,896 participants, $19.0B —
  and zero State Farm plans remain in `stmt`. It survives in this document only
  as the cautionary tale in the operating protocol, where it is history and
  labelled as such. A fixed plan named in a LIVE gap table reads as an open
  defect and sent one cycle to trace a filing that has been correct for some
  time. **Copying a line forward is asserting it again.**

  **METHOD NOTE ON THE SHIPPED PREDICATES — read both halves or you will take
  the wrong lesson.** Two cycles produced results that sound opposite:

  - On `few`, the shipped `GENERIC_TYPE_NAME` / `NOT_FUND_SHAPED` returned
    **"99% have at least one real fund name"**, which is false. They are
    anchored exact matches built to audit PUBLISHED lineups, and that
    population is fragments, OCR noise and generic types carrying a modifier —
    `"Master Pooled Separate Account"` fails `/^pooled separate accounts?$/`.
    They matched **3 of 393**.
  - On `band-hi`, a hand-written list produced a three-way split that dissolved
    on re-count, because it omitted `registered investment companies` — which
    the shipped predicate has.

  **The reconciliation, which is the actual rule: the shipped predicate is
  strictly better than one written from memory, AND it under-matches on
  fragmentary populations.** So use it, and measure what it MISSES on the new
  population before trusting a count in either direction. Neither "the shipped
  one is authoritative" nor "it doesn't transfer" is safe alone. The
  nohead 50-sample measurement (56% no attachment / ~0 fixable) was taken on
  the PRE-split bucket dominated by final-year plans; the live remainder was
  then split exactly by `ds` and its `readfail` half closed in v114.
  UNLINKED TRUSTS are now a named target of their own: Genentech's Schedule D
  names ROCHE US DC PLANS MASTER TRUST at EIN 94-2347624 PN 002 and no MTIA
  filing under that EIN exists in the datasets, so $14.3B sits behind a
  pointer we cannot follow. **Genentech's PAGE no longer misdescribes this**
  (bit 65536, 2026-09-11) — it said "we could not read it, that's our gap"
  while the filing had parsed fine, which was false for 36,458 readers. Schedule D gives us the trust's NAME even when
  the link fails, and the page HAS said which trust holds the money since the
  Genentech work — all 8 unlinked plans carry an `mtiaName` and none of the 44
  linked-opaque ones do, so the named sentence covers exactly the population
  whose alternative wording is vaguest.
- **FIELD COVERAGE, MEASURED 2026-09-10 against the LIVE v117 store.** The
  residuals table above covers lineups only, which made lineups look like the
  project's gap. Measured across every field, they are not — and this is
  recorded as MEASUREMENT, not as a re-prioritisation; that call is the
  owner's and has not been made.

  The universe is two populations with different data availability:
  **68,259 full-form** (106.20M participants, audited attachment exists) and
  **43,523 short-form 5500-SF** (7.35M participants, **no attachment is ever
  filed, by law**). Everything below except the 8a form codes exists only for
  the full-form half.

  | field | covered (of 68,259 full-form) | real gap after removing wind-down ghosts |
  |---|---|---|
  | recordkeeper | 63,682 (93.3%) | **1,419 live / 564k ppl** blank (was 4,577), **CAUSE OPEN**; and separately **1,509 live plans / 1.48M ppl publish a WRONG NAME** — an auditor, lawyer, investment manager or advisor. Both falsified the "not ours" verdict 2026-09-14, see below |
  | investment options | 60,298 (88.3%) | **1,407 live plans / 2.32M ppl / $262B** |
  | any audit notes | 63,793 (93.5%) | **1,564 live / 1.43M ppl** (re-measured 2026-09-12) |
  | **match formula** | 42,338 (62.0%) + 5,308 quote-only | **8,672 live / 13.53M ppl** |
  | vesting | 52,825 (77.4%) + 4,834 quote-only | **11,838 live / 23.2M ppl** (was 5,648 — see below) |
  | Roth stated | 36,470 (53.4%) | mostly genuine silence, not absence |
  | after-tax stated | 4,119 (6.0%) | genuinely rare |

  **RECORDKEEPER — the 2026-09-12 verdict "it is not ours" was FALSIFIED
  2026-09-14 by a single filing the owner sent. Read the correction at the end
  of this block before reusing anything in it.** The population arithmetic
  below is still exact and still reproduces (1,419 / 563,716); what was wrong
  was the CONCLUSION drawn from it, and the sampling that produced it.
  The row carried 4,577 with no cause, in a column whose own
  header says ghosts are already removed — they were not. **3,158 (69%) are
  wind-down ghosts**, leaving **1,419 live plans / 563,716 participants /
  $20.0B**. Recordkeeper was believed to have exactly one source (build-data
  pass 3: Sch C Part I
  item 2, falling back to item 1) — **it does not; see the correction** — and
  the fee shards are built from the SAME
  rows in the same loop, which makes them a free discriminator: **0 plans of the
  1,419 have a Schedule C provider row and no recordkeeper.** The pass never
  drops a row it has; every gap is an absent row. Split by what Schedule H says
  the plan PAID — an independent witness, since Sch C reporting turns on a
  $5,000-per-provider threshold:

  | plans | ppl | |
  |---|---|---|
  | 303 | 216,918 | paid nothing from plan assets — the sponsor pays the fees |
  | 785 | 194,754 | paid under $5,000 total, below the reporting threshold |
  | 316 | 126,102 | $5k–$100k |
  | 15 | 25,942 | over $100k |

  Only the last two bands (331 plans / 152,044 ppl) could hide a defect, and the
  $5k–$100k band is weak evidence because the threshold is PER PROVIDER — $50k
  split across fifteen $3k providers is correctly silent. Eleven filings opened
  (8 drawn RANDOMLY from the 331, 3 ranked by spend): **0 name a provider we
  failed to ingest.** Icon Clinical Research is the type case — 16,374
  participants, $982,836 of plan-paid expense, Schedule C filed, line 1a
  answered Yes (the eligible-indirect-compensation exclusion, i.e. fees netted
  from fund expense ratios), and every name field a blank form placeholder.
  Lawful silence. **The page already says the true thing** — *"No recordkeeping
  provider identified in this filing's Schedule C"* — so nothing shipped.
  **The trap worth keeping: the composite public PDF is NOT a witness for
  whether Schedule C data exists.** A positive control with `recordkeeper =
  Fidelity` in our own store renders NO Schedule C pages at all, so "no pages"
  proves nothing in either direction and only the pages-present-but-blank
  readings carry information. The first classifier also called Icon NAMED off
  the `(b) (c) (d)` column-header row, after I had read it blank by eye — a
  measuring script is code and earns the same suspicion.

  **THE CORRECTION (2026-09-14), from ONE filing: David Nelson Construction Co.
  401(k) Profit Sharing Plan, EIN 59-1616643 PN 001, 180 participants.** It is
  IN the 1,419 (verified by reproducing the pool), it shows recordkeeper "—",
  and its filing names **Lincoln National Life Insurance Co. four times**:
  Schedule A carrier, Schedule D separate-account sponsor, Note C ("certified
  to … by Lincoln"), Note H ("Lincoln, the trustee of the Plan"). Three claims
  above are wrong:
  - **"exactly one source" is false.** `scripts/build-data.mjs:624` already
    resolves `INS_CARRIER_NAME` from the Schedule A extract — and **never reads
    it**. A value computed and discarded, the same shape as run #244's silent
    catches and the feature-fallback denominator. Worse, line ~638 is
    `if (!comm && !fees) continue;`, so a Schedule A with **0 commissions and 0
    fees** — this plan exactly — is dropped before the carrier could be used.
  - **"0 name a provider we failed to ingest" is false**, and the sampling is
    why. All 11 filings were drawn from the two HIGHEST Schedule-H spend bands
    (331 plans). An insurance-platform plan pays its cost INSIDE the product,
    reported on Schedule A and invisible in Schedule H, so it presents as a
    low-spend plan while having a perfectly identifiable provider. David Nelson
    is at $3,902 — the "under $5,000, below the reporting threshold" band, from
    which **zero** samples were drawn. **The stratification variable was
    correlated with the failure mode being looked for, so the frame excluded
    the shape by construction.** That is the lasting lesson here, above any
    number.
  - **"The page already says the true thing" is false for this plan.** It says
    *"No recordkeeping provider identified in this filing's Schedule C"* and
    **this filing attached no Schedule C at all** (Form 5500 line 10b(4)
    unchecked). The sentence names a schedule that does not exist.
  The PDF trap above was also OVER-APPLIED: a composite PDF is not a witness
  for whether Schedule C DATA exists, but it IS a witness for whether a
  Schedule C was ATTACHED (line 10b) and for whether a Schedule A names a
  carrier. The trap was used to dismiss evidence the PDF can actually give.
  **UNSIZED AND HONESTLY SO:** how many of the 1,419 have a Schedule A carrier
  cannot be measured in-sandbox — the EFAST2 extracts come from the DOL site,
  which is unreachable from here. It is one line in the next prep run. Also
  note the band split above does not reproduce from `adminExpenses` alone
  (that gives 109 / 844 / 446 / 20 against the same 1,419), so the spend
  variable behind those four numbers needs restating when this is picked up.
  **The row in the field-coverage table stays OPEN: cause unknown for an
  unknown share, NOT "not ours."**

  **SECOND MECHANISM, FOUND THE SAME DAY AND WORSE — WE PUBLISH A WRONG NAME,
  not a blank (Shoreline Carpet Supplies, EIN 65-0665155 PN 001).** Pass 3
  takes the TOP-FEE Schedule C item-2 row. When the platform received only
  *eligible indirect compensation* it is EXCLUDED from item 2 by the
  instructions and named on **line 1b** instead — so the top-fee row is
  whatever advisor or auditor the plan paid directly. Shoreline publishes
  "Advisory Services Network Llc" (sole service code **99 = other fees**) while
  Voya is named four times: Schedule A carrier, Schedule C line 1b, Schedule C
  item 3 as the source of BOTH providers' indirect comp, and the 4i
  certification footer as "the investment fiduciary".
  **SIZED FROM THE STORE** (fee shards carry the codes): **2,241 live plans /
  2,015,771 ppl** publish a top-fee row with **no recordkeeping code (15/64)**,
  of which **1,509 / 1,482,658 are coded as a DIFFERENT PROFESSION** — 912
  investment advisory (plan), 356 investment advisory (participants), 128
  investment management, **103 auditor/accountant**, 10 legal. Apple ->
  "Russell Investments Capital" (28), **AstraZeneca -> "Pricewaterhousecoopers
  Llp" (10)**, Nike -> "Blackrock Institutional Trust" (27), McDonald's ->
  "Advised Assets Group" (26), and **HP Inc. -> "Strategic Advisors"** — the
  exact name this file cites as SOLVED for Northrop Grumman, which means that
  fix was specimen-shaped, not general.
  **The discriminator is already in our data and unused:** codes 15
  ("Recordkeeping") and 64 ("Recordkeeping fees"). Kielty's RPG carries
  15/17/37/64 plus the relationship string "RECORDKEEPER" and is correct;
  Shoreline's rows carry only 99 and 49, so NOTHING in item 2 is a recordkeeper
  and the right answer is the platform on line 1b. Fix shape: prefer 15/64,
  then the line-1b platform or Schedule A carrier, then top-fee — and never
  publish a provider coded 10 or 29. Pipeline change, needs a prep run, moves
  up to 2,241 published names. **Queued for the owner, not shipped.**
  **A blank is honest; a name reads as knowledge.** This outranks the blank
  above.

  **AUDIT NOTES BUCKETED 2026-09-12** (predicate: full-form, `assetsEOY > 0`,
  `!st.f`). 4,466 full-form plans have no features; **2,902 are wind-down
  ghosts**, leaving 1,564 live / 1,434,030 ppl. Three causes, and one dominates:
  **1,030 plans / 1,195,391 ppl (83% of the people) parsed their schedule
  confidently and still yielded no features** — the "REOPENED" class below, and
  the only one that could be ours; **369 / 174,210** never got a readable
  filing at all (`e=no-section` 364, `e=download` 5); **165 / 64,429** failed
  on both lineup and notes, already carrying a `ds`/`dx` cause each. No new
  unknown here — the gap is the class the REOPENED bullet already tracks, and
  it is now sized against the same predicate as that bullet.

  **VESTING RE-SIZED 2026-09-12 AND IT IS THE LARGEST GAP IN THE TABLE.** The
  row said 5,648. Published vesting is **52,825**, which agrees exactly with the
  pipeline's own `vesting` coverage metric, so 68,259 − 52,825 = 15,434 missing,
  3,596 wind-down ghosts, **11,838 live plans / 23,213,865 participants** — more
  people than the match gap. Three disjoint causes:

  | plans | ppl | |
  |---|---|---|
  | 5,440 | 11,361,379 | **B** notes were read and never mention vesting (Microsoft, Boeing, IBM, Costco) |
  | 4,834 | 10,418,456 | **C** a vesting SENTENCE is stored and nothing is published |
  | 1,564 | 1,434,030 | **A** no features at all — already counted in the audit-notes row |

  **C got the same discriminating test that settled match**, each stored
  sentence fed to the production extractor alone: **1 path defect in a random
  120 (0.8%)**. So this is NEW COVERAGE, not a repair — the owner's call, and
  no session should start it unasked, exactly as with match. Shapes across the
  whole 4,834 (disjoint, first match wins): 833 name a percentage with no period
  (usually about DEFERRALS, which are 100% vested by law — the employer piece is
  elsewhere), 546 point at a table or the plan document, 220 cliff, 215 graded,
  42 immediate, **2** conditional plan-termination boilerplate, and 2,976 /
  6.36M match no shape.
  **A HYPOTHESIS WAS RAISED AND KILLED BY ITS CONTROL, which is the part worth
  keeping.** Five examples looked like truncation defects — Verizon's sentence
  begins mid-word (`"ant shall be fully vested"`), Eli Lilly's stops at
  `"after c"`, Goldman's has a section heading welded in — and truncation would
  make this OURS rather than new coverage, since the match-quote windowing fix
  is already on the books. Running the same tests over the sentences that DID
  parse says no: **starts-mid-word 3.2% in the gap vs 1.0% in the control, and
  ends-without-terminal-punctuation 8x MORE COMMON in the control (23.7%) than
  in the gap (7.2%)**. Truncation explains at most ~155 plans, not 2,976. The
  five examples were real and the generalisation from them was wrong — which is
  why the control is run before the write-up, not after.

  **The headline: match is ~6x the lineup gap by people affected, and it is
  OURS.** The 11.7% with no investment options is 7,961 plans — but **6,554 of
  those are wind-down ghosts** ($0 year-end assets, plan already terminated or
  merged), leaving only 1,407 live plans. Meanwhile 8,672 live plans covering
  13.53M people have employer money flowing and no formula shown.

  It is not a document gap. **6,123 of those 8,672 have >=5 other features
  extracted from the same notes** (vesting 86%, loans 67%, Roth 52%,
  eligibility 47%), median employer money **$2,626 per active participant**.
  The notes are readable; the match sentence is not being caught. Two
  hands-on confirmations, deliberately the two largest:
  - **Costco (279,798 participants)**: *"The Company matches the lesser of 50%
    of each employee's deferral contribution or $500 per year."* — a CAP form
    (`lesser of N% ... or $X`), not the "N% of the first M% of pay" shape the
    extractor is built around.
  - **Tyson (128,426)**: *"100% Sponsor matching contributions on participant
    deferrals up to 3% of compensation ... and 50% for participant deferrals
    in excess of 3% but not more than 5%"* — a standard two-tier, phrased with
    "on ... up to" rather than "of the first".

  **MEASURED AND PARTLY CORRECTED 2026-09-11.** Two claims in the paragraph
  above were wrong and the numbers now exist.

  *"The filings are already local, no downloads required"* — **only partly.**
  Of the 14,019 live plans with employer money and no parsed match, **5,201
  already carry a stored match SENTENCE** (the extractor found the language and
  failed on the number); the other ~8,800 store no match sentence at all and
  need the PDF. Split the 5,201 with `matchQuoteOk` — which decides whether a
  sentence states a RATE — and the workable half is exact:

  - **RATE PRESENT: 1,710 plans / 3,205,799 participants.** The sentence states
    a rate, we store it, we show it to readers as the filed quote, and we still
    publish no formula. A pure formula-parser gap with the evidence in hand.
  - no rate in the stored sentence: 3,491 plans / 8,441,677 participants — the
    formula is elsewhere in the filing if anywhere, and that needs the PDF.

  *"A long tail of phrasings"* — **not mainly.** Clustered by rate shape
  (disjoint, first match wins), **one family is 59% of the workable set**:

  | shape | plans | participants |
  |---|---|---|
  | plain `N% of` | **1,011** | 1,464,750 |
  | lesser-of / cap | 326 | 1,150,033 |
  | other | 182 | 326,780 |
  | tiered first/next | 29 | 75,492 |
  | per-dollar | 25 | 71,063 |
  | spelled-out % | 77 | 52,800 |
  | tiered on/up-to | 45 | 46,332 |

  And the largest family is not exotic — it is the canonical shape carrying an
  unusual QUALIFIER: a range (*"100% of the first 4-5% of base compensation"*,
  S.C. Johnson), an alternative list (*"5.5%, 7.5%, or 9.5% ... depending on"*,
  King School), a bare cap with no rate pair (*"up to 6% of a participant's
  compensation"*), or a doubled unit (*"25% percent of participant
  contributions, limited to 6 percent"*, Collins Engineers). The classic
  `first/next` tier is only 29 plans, because that shape already parses.

  **BUG OR UNIMPLEMENTED? Settled, and it decides who may start this.** Each
  stored sentence was fed to the PRODUCTION extractor on its own: if the
  sentence alone yields a formula, the pattern covers the phrasing and
  something in the surrounding filing stopped it — a path defect, fixable under
  the standing accuracy directive. Random sample of 120 from the pool:
  **0 path defects, 120 uncovered (100%).** This is NEW COVERAGE, not a bug,
  so it remains the owner's call and no session should start it unasked.

  **And the reachable figure is ~1,634, not 1,710.** 76 of the pool are not
  match language at all: **60 are NONELECTIVE contributions** stored as
  matchText (PepsiCo *"Company non-matching contributions"*, NYU *"nonelective
  employer contributions … at a rate of 5%"*), 6 describe the EMPLOYEE's own
  deferral (*"Participants may elect to contribute … up to 6%"*, Entergy), 1
  never says "match". A rate being present does not make a sentence a match —
  worth remembering before any of these counts is reused.
  (Two hits in the contamination screen were my own classifier's error, not the
  data: Apex Systems' *"Safe Harbor matching contributions equal to 100% of the
  participant's first 1%"* is a real formula. The screen over-counts slightly;
  the solid contamination is the ~67 NEC/deferral/no-match cases.)
  One specimen names a cause of its own: MMI Services stores
  *"TheCompany provides asafeharbormatching contribution equalto100%of…"* —
  **pdftotext emitted it with no word spacing**, so no pattern can match at any
  phrasing. A de-spacing repair would be a separate, general fix.

  **So the honest scoping is:** ~1,634 plans / ~2.9M participants are reachable
  with no downloads and look like a handful of qualifier families, not a tail;
  the remaining 8.4M participants need a pipeline pass that captures the
  match-bearing sentence even when no formula parses — the `dx` idea applied to
  features. **Still not a re-prioritisation: that call is the owner's, and the
  0/120 result above confirms it is new work rather than a repair.**

  **Short-form filers are the other structural gap: 7.35M people with
  essentially nothing.** But the 8a characteristic codes are on the FORM, so
  they exist for all 111,782 plans — **2K (401(m), match and/or after-tax) is
  present on 83.1% of SF filers**, 2S (auto-enrolment) 27.0%, 2R (brokerage
  window) 3.5%. An SF page could truthfully report those as filed facts
  without claiming a formula. Today it shows headline numbers and nothing else.

  Also unresolved and worth a decision: **Roth at 53.4% "stated" cannot be
  distinguished by a reader from "no Roth"**, and with 46.6% unstated that is a
  large honesty gap given how near-universal Roth now is.

- **THE FABRICATED-LINEUP CLASS IS NOT CLOSED — corrected 2026-09-15, and the
  previous text of this bullet claimed the opposite.** The two audits below are
  real and still hold on the shapes they cover, but a THIRD shape walks between
  them: a WRAPPED CONTINUATION FRAGMENT as the row name. Owens Corning PN 004
  publishes `Fund, Class S` at **$481,573,572 = 36.9%** of a $1.31B plan and
  PN 014 the same fragment at **$354,848,184 = 56.4%**; each is the exact sum of
  TWELVE real Fidelity Freedom Blend vintages, verified to the dollar. The
  filing wraps each name over two lines with the value on the second, so every
  vintage is named `Fund, Class S` and they merge — v100's Amgen case in a new
  vocabulary. **`audit-generic-names` misses it** because "Fund, Class S" is not
  in `GENERIC_TYPE_NAME` (a fragment is not a generic type); **`audit-dominant-row`
  misses it** because it needs >=90% and these are 36.9% / 56.4%.
  **FLOOR, because my own sizing predicate under-matched: 149 plans / 753,693
  participants / $21.89B.** Intermountain Health Care ($6.83B, 86,655p)
  publishes FOUR fragments — `Trust` $531.8M, `Class` $307.0M, `Trust Class D`
  $287.1M, `Institutional Class` $221.8M, **$1.35B of one plan** — and the
  anchored regex caught only the two beginning with a generic noun. Do not
  quote 149 or $21.89B as a total.
  **THE WALMART INSTANCE BELOW IS CLOSED — FIXED BY v130, VERIFIED ON THE
  LIVE STORE 2026-09-21, AND THIS BULLET WENT ON CALLING IT LIVE.** Drawn in
  the weighted review (seed 20260921142) and checked claim by claim:
  `Lendable Fund` **0 rows**, `US) Value Equity Fund` **0 rows**, and all
  three wrapped BlackRock names whole at **exactly** the dollar figures
  predicted below — $423,138,593 / $267,132,531 / **$2,856,964,964** — plus
  `The Collective LSV International (ACWI EX US) Value Equity`. 42 rows,
  ratio 0.95, **zero names ending mid-phrase**. The v131 mirror bullet already
  said v130 fixed it, so two parts of this file disagreed and the live-defect
  list was the stale one. **The class itself re-sizes to 97 rows / 97 plans /
  331,737 ppl / $2.63B** (bare class/vehicle fragment as a row name), of which
  only **14 rows / 13,936 ppl sit at ≥15% of a menu** — largest now Alliant
  Energy `shares` 20.0% / $279,927,053 and Tift Regional `shares` 20.8%. The
  rule this file already carries — *check the example is still in the bucket*
  — applies to DEFECT LISTS, not only gap tables. The text below is kept as
  the historical record of the defect, not as a description of the store.
  **HOW FAR BELOW, MEASURED 2026-09-16 (HISTORICAL): at least 1.97M
  participants in ONE PLAN — more than twice the whole recorded figure.**
  WALMART, the largest
  plan in the country (1,970,230 participants, $50.79B), published
  **`Lendable Fund` at $3,547,236,088**, which is the exact sum of three
  wrapped BlackRock names — `Intermediate Government Bond Index Non-` +
  `Long Term Government Bond Index Non-` + `MSCI ACWI ex-U.S. IMI Index Non-`
  ($423,138,593 / $267,132,531 / **$2,856,964,964**), verified to the dollar
  against the filing. A $2.86B international equity index fund is invisible to
  every Walmart participant looking for their international allocation. The
  same filing publishes `US) Value Equity Fund` at $1.83B — `The Collective
  LSV International (ACWI EX US) Value Equity Fund` truncated to its
  continuation line. Ratio 0.93, 39 rows, every guard silent. Neither is in
  the 149 because the predicate requires the name to BEGIN with a generic
  noun and these begin with "Lendable" and "US)". `docs/accuracy-log.md`
  2026-09-16 cycle 12:2xZ.
  **THIRD SHAPE, and it inverts what the ratio guard is for: THE FILING'S
  PARTICIPATING-EMPLOYER ROSTER AS THE MENU.** UPMC (112,002 participants,
  $4.90B) publishes `University of Pittsburgh Physicians` at 34.7% /
  $1,471,167,864 and 41 of 80 rows are UPMC subsidiaries — the table is
  headed `Multiple-Employer Plan Participating Employer Information` and its
  columns are NAME / REGISTRATION NUMBER / PERCENT / TOTAL BALANCE, so the
  "share count" is an EIN. **The cause is not a missing heading: the real 4i
  schedule sits in the same PDF under the statutory header and totals
  $54,532,701 — ratio 0.011 against plan assets, rejected — while the roster
  sums to 0.87 and was accepted.** Generalise it: **a ratio near 1.0 is
  evidence for a menu only among tables that are CANDIDATE menus.** Anything
  that apportions the plan — an employer roster, a fair-value hierarchy note,
  a statement of net assets — scores 1.0 by construction, which is why three
  of the five largest fabrication classes on record are apportionment tables.
  Class size is genuinely small (2 plans; the other 16 candidates were the
  description-column class), but 112,002 readers sit in one of them.
  **Second shape, also live: the participant-LOAN description column as a
  holding name** — `rates ranged from 3.25 percent to 8.50 percent during 2024`
  carrying the loans' value, **283 plans / 534,790 participants / $0.44B**. This
  file recorded that shape as "hidden by the 3-row floor"; it is hidden only
  where the plan has under three rows, and publishes in a 15-row lineup.
  Found because the owner sent a filing — no audit, no coverage metric, and the
  coverage line has been byte-identical throughout. **TOP OF THE QUEUE.**
  **GENERALIZED 2026-09-15, AND THE GENERAL FORM IS BIGGER THAN THE FRAGMENT
  COUNT.** A merge has an arithmetic consequence that owes nothing to
  vocabulary: the published menu stops adding up to the plan. Summing every
  published row against the plan's own `assetsEOY` — no downloads, no sampling,
  no regex — gives **471 live plans / 1,193,879 participants publishing a menu
  at >=1.15x the money the plan has** (183 plans / 472,585 ppl at 1.30-1.60x;
  288 / 721,294 at 1.15-1.30x; the 577 / 1.01M at 1.05-1.15x are NOT claimed —
  ordinary timing and loan treatment live there). They diagnose themselves by
  name: **PepsiCo 1.60x, `Trust` $13.34B = 50% of a nine-row menu that is
  actually a fair-value note** (161,067 participants); Charter `At fair value`
  48%; Cisco `Collective Trusts(1) at NAV` 78%; Medtronic `Various (includes`
  73%; **Kraft Heinz and Deutsche Bank both publish `le 0 0 1f`** — Form 5500
  checkbox coordinates — at 70%. Every existing guard passes them:
  `isConfident`'s band is `0.45 < ratio < 1.6` (PepsiCo sits at 1.595, and the
  tight 0.7-1.3 window applies only below five rows), and **`rt` is computed,
  stored, and never read again after the parse is accepted** — the same
  computed-and-discarded shape as run #244's failure reason and the Schedule A
  carrier. The fix belongs with this bullet's fix, in one version bump: an
  `audit-overshoot` keyed to ARITHMETIC rather than to a name list (a list has
  now been beaten by a fragment, by form junk and by a bare noun), a narrower
  `isConfident` upper bound, and verification against the subtotals the filing
  prints itself (Owens Corning declares $123,315,385 / $448,610,725 /
  $629,053,603 in the same table we read). `docs/accuracy-log.md` 2026-09-15.
  **And the method change that outlives this defect: every hands-on review this
  project runs draws from the WORST bucket. Four owner-sent filings in two days
  produced four defects, all in published, confident plans — the population no
  review samples. Draw randomly from PUBLISHED lineups in every parser cycle,
  alongside the worst-class draw.**
  The two guards that DO hold: `audit-dominant-row.mjs` 50 plans / $83.9B ->
  **0** at v105, all 319 honest single-holding plans preserved;
  `audit-generic-names.mjs` at 208 plans / $48.2B (baseline, threshold 230).
  Both run inside `audit-data.mjs` every merge.
- **REOPENED 2026-09-10 — the "NOT worth parser work" verdict on missing
  features answered the wrong question.** The 2026-09-03 measurement stands as
  far as it goes: of the plans whose lineup parses but whose features are
  missing (now 2,193 acks / 1,943 live plans / **1,876,769 participants** /
  $81.0B), ~67% have no attachment prose IN THE NEWEST PUBLIC COPY, 27% have
  notes that never discuss contributions, ~7% is a real parser gap. Dollar
  General (**225,308 participants** — the store's figure re-read 2026-09-27;
  this line carried 201,691 and a number in this file is asserted every time
  it is copied forward) is the type case. **But "does the newest copy
  have notes?" is not "does the PRIOR YEAR's copy have notes?"** — and the
  prior-year fallback was never asked, because it only ever fired when the
  newest filing yielded no confident LINEUP. Where that fallback PDF has
  actually been read and the newest filing had no features, the prior year
  supplied them **462 of 502 times (92%)**. That population is biased (those
  filings failed entirely), so 92% is an UPPER BOUND, not a forecast. v119
  widens the trigger; the run measures the real rate. Cost: up to ~2,193 extra
  PDF reads per run, ~3% more work.
  **RE-MEASURED 2026-09-12, and two things in the paragraph above need
  correcting.** *(a) The gap number does not reproduce.* Predicate stated so it
  can be re-run: full-form, `assetsEOY > 0`, `st.c && !st.f`. Against the live
  store that is **1,030 plans / 1,195,391 participants / $51.8B** — and against
  the pre-v122 store (`80ff5702`, the one "1,943 live plans / 1,876,769" names)
  the SAME predicate gives **1,091 / 1,232,594 / $53.6B**. So the 1,943 figure
  was never true of the store it cites; do not carry it forward, and prefer a
  stated predicate over a remembered total. *(b) "The run measures the real
  rate" — IT DID NOT, for three weeks.* `ffb` records every SUCCESS in the
  store and nothing anywhere recorded an ATTEMPT, so the rate had no
  denominator on any run ever made. The success side, read off the store:
  **1,467 live plans / 1,221,804 participants / $50.1B are served from a prior
  year's notes today** (1,398 at `80ff5702`), which is larger than the gap that
  remains. The denominator is now instrumented — `feat-fb-needed / -supplied /
  -silent / -none` in `fetch-4i.mjs`, disjoint, printed in the per-shard
  failure tally that production actually reaches. Positive-controlled end to
  end through the real `PARSE_SHARD` path on a crafted tree: needed=3,
  supplied=1, silent=1, none=1. **This is the same shape as the four silent
  catches that cost run #244 — a value computed and discarded — found this
  time before it cost anything, because the promise to measure was written
  down next to the code that did not.**
  **The first production run carrying them (#271) printed NONE of the four**,
  and that is correct rather than a failure: its whole work list was the 68
  permanently-403 acks, every one of which bails out before the fallback block
  is reached. So the counters are locally controlled and production-untested;
  the first run that will actually exercise them is the next full re-parse.
  Do not read their absence in an incremental run's tally as a defect.
  GitHub cron note: Monday 06:00 runs fire HOURS late (Jul 27 fired
  10:02) — don't diagnose a dropped schedule before ~noon UTC. Trust links
  898 (193 via EIN fallback); Elevance has NO MTIA filing in EFAST2 at all
  (checked 2023-25) — unlinkable, honest gap. Recordkeeper = platform-brand
  priority over top-fee line (NG shows Fidelity not Strategic Advisors,
  Kohler inherits Voya via trust); ITEM2's PROVIDER_OTHER_SRVC_CODES column
  exists in the header but is EMPTY in the Latest extracts (0/155k rows,
  found 2026-08-07) — filed codes live in F_SCH_C_PART1_ITEM2_CODES (one
  row per code, join on ACK_ID+ROW_ORDER), ingested since the codes fix. Filters
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
- **Owner to-dos: the custom domain. "Point GitHub Pages at `main`" IS ALREADY
  DONE and was stale — VERIFIED 2026-09-16.** The `pages-build-deployment`
  workflow (id 308294295, 439 runs) builds from `head_branch: main`, and its
  runs correspond exactly to this session's mirrors: #439 built `021bbbe1`
  (the 10:1xZ mirror) and concluded **success** at 10:11Z, #436 built
  `ab4058d8` (the 07:1xZ mirror). So every mirror has reached readers within
  ~2 minutes, including the fund-name matching repair.
  **Scope of the claim, stated because it is narrower than "the site works":**
  this proves Pages BUILDS AND DEPLOYS from main. It does not prove the page
  renders correctly for a visitor — `evwes.github.io` is **unreachable from the
  CCR sandbox** (the egress proxy returns `connect_rejected`), and that
  rejection is a sandbox fact, not evidence about the site. Do not read a
  failed curl from here as Pages being down; check the deployment workflow
  instead, which is reachable.
  **Also correct the LAUNCH WEEK block**, which still lists "GitHub Pages must
  serve main (Settings->Pages)" as an owner blocker for going live. It is not a
  blocker and has not been one.
- **LAUNCH WEEK (owner directive 2026-08-09: fully live by 2026-08-14)**:
  shipped so far — fee schedule w/ service codes, fee percentiles vs peers,
  About/methodology page, boot payload split (12→2.8 MB gz). Remaining, in
  order: static SEO pages (top ~5k plans by assets + sitemap + robots,
  generator in the merge job; real crawlable URLs are the growth engine),
  v36 dotted-leader lineup recovery (Costco/JPM class, biggest coverage
  win), OCR page-targeting for >40-page scanned attachments, glossary/
  accessibility pass. Owner blockers for "live": **NOT Pages — verified
  2026-09-16 that `pages-build-deployment` builds from main and succeeds on
  every mirror**; the remaining ones are custom domain DNS and approving the
  daily accuracy Routine. Daily cycle sessions pick up any of this that isn't done.
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
- **Run-duration candidate (recorded 2026-08-15)**: full re-parses run
  ~4.5h (vs ~1.5h pre-OCR-v3) because every scanned filing re-rasterizes —
  the OCR text cache only holds acks the last incremental run touched, and
  strip-scans on >40-bad filings add per-page pdftoppm cost. Fix candidates,
  in order: (1) cache the OCR text for EVERY filing processed (already
  written per-ack; the gap is cache retention across OCR_VERSION bumps for
  unchanged ≤40-bad filings — the v3-accept fallback in fetch-4i is the
  pattern to extend); (2) persist a per-ack "no readable attachment" marker
  so form-only PDFs skip download+scan entirely on re-parses; (3) sort
  OCR-heavy acks first in shard work lists so the matrix balances instead
  of one shard tail-dragging.

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
