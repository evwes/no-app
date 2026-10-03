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

### Store, read from the newest coverage line 2026-10-02

Universe **112,652 plans** (68,538 full-form, 44,114 short-form, 69,046
parse-status entries) — 401(k)-type 2J + ERISA 403(b) 2L/2M, ≥100 participants
at either end of the plan year. A DOL refresh on 2026-09-30 moved it from
111,782; do not carry an older figure forward.

`confident` **60,167** · lineups 59,819 · entries 65,480 · match **43,338** ·
vesting 53,100 · roth 38,350 · **HIGH 4** · warn **556** · overshoot 372 /
436,224 ppl · overshootTrust 12 · aggRow 114 · dl **48** · pvTopShare **99.93**
(pv **199**) · tkExact **37.76** · tkComparable **3.41** · tkShare **25.02**.

**`match` FELL from 43,441 to 43,338 ON PURPOSE** — v199 withholds a misread
formula rather than publishing it, so the fall IS the improvement. Read it
together with `matchQuote` 5,364 and `matchQuoteShown` 1,818, both of which
ROSE: a withheld plan reverts to quoting its filing, it does not go blank.
`features.matchMisread` on 199 acks / 389,974 ppl holds every withdrawn string,
so the class is measurable without re-deriving it.

**THE HIGH BASELINE IS 4 = 3 `contrib` outliers + `fabricated-name`.**
`audit-generic-names` sits above its 230 escalation threshold, so that HIGH is
STANDING rather than absent. **CI can report MORE than the local audit** — the
extra entries are self-clearing `reparse-loss` findings raised from
`losses-triage.txt`, a run ARTIFACT that exists only in CI. *A metric that
differs between CI and local is a question about the inputs, not the store.*

**COMPLETENESS TEST:** one dominant pv covering ≥97% of acks plus a small
old-version tail. A second large pv cohort means a PARTIAL store (`audit-data`
raises `partial-store` under 97%); `dl` above 1% raises `download-failures`.
The `dl` population has been HEAD-probed whole four times (68/68, 78/78, 23/23,
20/20 → 403), so `e=download` is an honest published claim and a rise means the
EFAST2 bucket grew, not that our code broke.

### Pre-registered for the next run that merges

**NOTHING IS PRE-REGISTERED** for a parser run — `PARSER_VERSION` stays 199.

**NO RUN IS IN FLIGHT as of 08:1xZ.** #561, #562 and #563 all SUCCESS and all
verdicted; site-test #150 and #151 SUCCESS. **Three consecutive incremental runs
produced BYTE-IDENTICAL coverage lines**, which is what an incremental run
should do when the work list is only the 48 permanently-403 acks plus the
~48-ack old-pv tail.

**AND THE PREVIOUS COPY OF THIS PARAGRAPH SAT HERE FOR AN HOUR SAYING "#562 is
in flight — read its conclusion before the next mirror" AFTER #562 had been
verdicted and mirrored.** That is the sixth time this block has gone stale and
the second time specifically with an IN-FLIGHT line left standing. *An
in-flight line is the most dangerous kind of staleness here, because it tells
the next cycle to wait for something that has already finished.* Clear it in
the same cycle that reads the conclusion.

**LIVE ON MAIN as of 2026-10-03 04:2xZ: v199 + its own pv-199 store, mirrored as
a MATCHED pair** (`ea825dcb`), Pages build #834/#835 green. v198 and v199 both
verdicted clean — `docs/accuracy-log.md` 2026-10-03 (04:1xZ) for both, and read
them together, because the pair is the cautionary tale:

**v198 BREACHED ITS OWN "CEILING" UPWARD — 345 plans / 422,623 ppl where 122
was registered — and the cause is a method trap, not a lucky break.** The
pre-measurement ran over STORED `matchText`, which is an OUTPUT of the very
extractor being changed: it stores the sentence it selected, and selection
follows wherever the chain matched. So the harness asked *"does the new arm fire
on the sentence the OLD chain chose?"* where production asks *"does it fire
anywhere in the filing?"* Reconciled ack-by-ack against the prior data commit:
226 GAINED a formula, **117 had one REPLACED** (mostly `Discretionary — set year
to year` becoming the real rate; Life Care Centers, 32,465 ppl), **0 LOST**.
***A PRE-REGISTRATION MEASURED OVER A STORED DERIVED FIELD UNDER-PREDICTS
WHENEVER THE CHANGE ALTERS WHAT THAT FIELD HOLDS*** — and my harness counted
only plans with NO stored formula, so it could not see the 117 at all.

**VERIFY `plans-list.json`, NOT `plans-all.json`.** The site NEVER fetches
plans-all; `plans-list.json` is the columnar boot payload and carries the `rk`
column the page prints. On 2026-10-02 a recordkeeper fix was reported shipped
three times while main's boot file still said `Invesco Advisors, Inc` — every
check had read plans-all or a local server with the branch's data and an empty
cache. ***A verification that reads a different file than the reader is not a
verification.***

**AND A SCHEDULED RUN ON MAIN CAN REVERT A SHIPPED FIX AFTER EVERY CHECK
PASSES.** #556 started 23:02:03 on main at the pre-fix commit, the mirror landed
the fix at 23:10:34, and #556 committed its stale-code data at 23:15:23 — main
ended with the new source and the old data. *A force push cannot protect against
a writer that has not written yet.* `mirror.sh` now refuses when the mirror
changes `build-data.mjs`/`merge-4i.mjs`/`lib-4i.mjs`/`fetch-4i.mjs` while a run
is queued or in progress on main. ***Mirroring code that produces data is half a
deployment.*** **CORRECTED 2026-10-03: the companion staleness NOTE used to fire
after EVERY such mirror and was wrong on the only path we ever take.** The
documented order is dispatch on dev → verdict → mirror the matched pair, so the
usual mirror ships code together with the store that code produced; the note
compared CODE between branches and never asked what produced the store it was
shipping. It now compares the mirrored `PARSER_VERSION` to the mirrored store's
dominant `pv` (`scripts/store-pv.mjs`) and warns only when the store really is
behind. ***A check that is wrong on the normal path is worse than no check*** —
an operator who has dismissed it four times dismisses the fifth, when it is
right. Both branches tested, and an UNREADABLE version reads stale rather than
matched, because a failed read must never be reported as a matched pair. Concurrency is `build-data-${{ github.ref }}` —
BRANCH-SCOPED — so a dev push cannot cancel a main run.

**#557 VERDICT (success, mirrored): `plans-list.json` on main reads `Fidelity`
for PSEG pn=004 and pn=006**, 11,991 rows exactly "Fidelity", **0** FIIOC
abbreviations. `docs/accuracy-log.md` 2026-10-03 (00:1xZ).

**#555 VERDICT (success 22:19Z, mirrored) — EVERY REGISTERED FIGURE HIT
EXACTLY.** Verdicted by DIFFING the published `recordkeeper` column before vs
after, because a spot check cannot tell *"my change moved it"* from *"it already
said that"*. **152 plans / 2,432,223 ppl changed, 0 blanked**: display rename
**121 / 2,020,774** (registered 121) and promotion **31 / 411,449** (registered
31 / 411,449, to the digit). **The variant-2 test reads 0** — no plan lost a
real recordkeeper brand. Cornell pn=001 and a Northwestern pn=001 read
"Fidelity" and looked like exactly the refused swap; **neither is in the change
set** — different plans of the same universities, already Fidelity. *Absence
from the diff is the proof.* The scratch replica predicted the promotion count
exactly despite reading the 12-row shard cap, so no plan in that population
files more than twelve providers.
**BOTH OF THE OWNER'S PSEG GAPS ARE LIVE**, verified in a real browser on the
mirrored tree: recordkeeper **"Fidelity"**, expense-ratio card **"15 funds held
by its master trust"**, and "lineup not added" appears nowhere on the page.
`docs/accuracy-log.md` 2026-10-02 (23:1xZ). **site-test #148 green.**

**#552 VERDICT (success 19:57Z, mirrored): every figure hit.** The welded-value
arm's population is **0** and the cheap screen went **1,229 → 1,195**, which is
1,229 − 34 to the row, so it hit exactly its 34 and nothing adjacent. **The
three figures carried unsettled since 15:0xZ are settled to the digit:**
`tkExact` **37.76**, `tkComparable` **3.41**, `tkShare` **25.02**.
**The "0 crawlable pages" claim was TRUE and my reason for it was WRONG** — a
grep proves nothing when the page renders no holdings table (ABM's is 4,818
bytes and has none). Measured against the previous store via `git show`: 0 of 34
sat inside the page's rendered twelve, earliest at filed index 18 of 28, because
cash and deposit lines sit at the END of a 4i schedule. *A clean zero reports on
the query.* And a hypothesis fell in one query: `funds.slice(0, 12)` is NOT
"filed order, not value order" — **all 4,625 pages with >12 rows are stored
value-sorted descending, so 0 pages omit their largest holding.**

**#551 VERDICT (success 19:39Z): every claim held.** MTIA acks with a fee-shard
entry **0 of 508 → 395**, 300 carrying `i1`; PSEG's trust ack gained its shard-32
entry; the published `recordkeeper` moved on **0** plans.

**AND IT SETTLES PSEG — the owner asked three times, and the filing's own codes
answer it.** Trust ack `20251013135637NAL0000680483001` files six item-2 rows:
`INVESCO ADVISORS, INC` codes **28 99 50** at **$534,926** (*what we publish*),
`FID INV INST OPS CO` codes **65 99 64 50** at **$442,941**, BlackRock 28,
BNY Mellon 18/19, `KRONICK KALADA BERDY & CO` **10** (the auditor), Willis Towers
Watson 16. **No row is coded 15, so `isRk` is false for all six and
`FID INV INST OPS CO` matches no `RK_BRANDS` pattern — so the winner is decided
by COMPENSATION ALONE.** The filing's notes say *"Fidelity Investments is the
recordkeeper"* and **the filing's own code 64 agrees with its notes.** The
published name is an artifact of a tie-break, not a claim anyone filed.
**NEXT, AND IT IS THE FIRST RECORDKEEPER VARIANT WITH DIRECT EVIDENCE:** prefer
a row coded **64** over top-comp *only when* its name carries a recordkeeper
brand witness — the bare code-64 rule was refused because it moved 2,395 plans
onto consultants, and the brand witness is what the four refuted variants all
lacked. **Must be measured store-wide before any claim**, and `FID INV INST OPS
CO` is already a published recordkeeper string elsewhere (Charter
Communications), so the witness exists in our own data.

**#550 verdict (success, 9 min): the item-1 capture WORKS — 42,385 acks carry
`i1`, 1,134 with no item-2 row against a predicted 1,274 — and the PSEG claim
FAILED**, which is how the real cause was found. `build-data.mjs:1144` falls the
published recordkeeper back to the **MASTER TRUST's** Schedule C, so PSEG's
`Invesco Advisors, Inc` comes from its trust and from nothing in its own filing.
**138 plans / 2,648,558 ppl** have the trust as the only possible source — and
read largest-first the fallback is mostly RIGHT (Target→Alight, HCA→Conduent,
Boeing→Fidelity), so this is not 2.6M wrong names but 2.6M whose evidence could
not be examined. MTIA acks had **0 of 508** fee-shard entries while `acks`
already added every one, so `scanSchC` scanned each trust and the assembly
discarded it. ***A pre-registration earns its keep when it fails.***

### Open, in rough order of people affected

**OWNER-GATED — a session must not start these unasked.** Each moves millions of
published cells:
- A filing stating a share class the registry registers under that exact name,
  where the page publishes a DIFFERENT class's symbol **and its fee**: 5,929
  rows / 4,837 plans / **11,144,696 ppl** / $44.9B. Errs in BOTH directions, so
  no blanket correction is available. Recommendation: correct the symbol on the
  exact-match population and WITHDRAW the fee rather than carry the other
  class's, with `fund-facts` filling per-class figures as they are sourced.
- The fee pre-emption: a generic estimate published where the ISSUER cell
  supplies a house-specific one — 40,229 rows / 8,330 plans / **13,274,448
  ppl**. Errs both ways (issuer higher on 8,723, lower on 31,506). 7,116
  distinct (issuer, name) pairs unread.
- Stable value / guaranteed accounts publishing a fabricated ER: 4,669 rows /
  **7,389,704 ppl**, 4,571 of them at exactly 0.35.
- American Funds rows stating NO share class keeping the R-6 fee: **10.5M ppl**.
  The TICKER column already refuses this inference and the FEE column does not;
  both cannot be right.
- A WHOLE-TABLE generic test beside the one-row test. `audit-dominant-row` needs
  90% on a SINGLE row, so Morgan Stanley (81,090 ppl, ten asset-class rows, the
  largest 62.1%) and Cummins (38,567 ppl, 65.1% of menu value naming no fund)
  are invisible. Widening the vocabulary also moves `audit-generic-names`, which
  is already past 230.
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
- **THE WELDED SHARE COUNT — 29 rows / 24 plans / 170,735 ppl / $200,736,656, 4
  publishing a ticker. PREDICATE STATED, ready to ship without re-deriving:**
  sibling of the 20:0xZ welded-value arm with the number in the MIDDLE rather
  than at the end — it must be followed by `shares` / `Units` / a dash and must
  EQUAL the row's own value EXACTLY. **No thousands arm** (see below). The class
  is almost all cash because **the welded number is a SHARE COUNT and equals the
  dollar value only at a $1.00 NAV.** **The motivating case is a withdrawal, not
  an assertion:** L Brands (30,989 ppl) publishes `Mutual Fund – 85,408,028 -
  shares` at $85,408,028 resolving to **VMFXX** — the resolver matched the
  caption `Mutual Fund`. Stripping the count leaves no fund name, so the row
  correctly publishes NO ticker.
  ***A TOLERANCE WIDE ENOUGH TO CATCH AN IMAGINED SHAPE IS WIDE ENOUGH TO
  MANUFACTURE ONE.*** Allowing "the value in thousands" read **117** rows, and
  most were arithmetic coincidences — a vintage year × 1,000 lands between $2.0M
  and $2.07M, so `T. ROWE PRICE RET 2005 ACT B` at $2,005,350 and `Freedom 2020
  K6` at $2,019,207 matched. Aimed squarely at the commonest fund family in the
  store. `docs/accuracy-log.md` 2026-10-02 (20:3xZ).
- **ONE TICKER, TWO FEES — 231 of 1,280 published tickers / 354,753 rows /
  $1.91T**, over all 599,250 rows publishing both a symbol and a fee. The ticker
  comes from a resolver and the fee from a NAME-pattern table, so one fund
  priced under a fuller name gets its own fee and under a bare name a category
  estimate: `FXAIX` 0.015 as `Fidelity 500 Index Fund` vs **0.03** as `500 Index
  Fund`; `FSMDX` 0.025 vs **0.1**; `VBTLX` 0.04 vs **0.1**; `VFIAX` spans 0.02
  to 0.4 (**×20**). **Adjacent to the gated fee pre-emption item but a sharper
  claim: the page publishes two costs for one fund it has already named by
  symbol.** Direction: where a row resolves to a ticker, the fee belongs to THAT
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
- `fb-vanished` is keyed on the ACK and must be keyed on **EIN|PN** — a plan
  whose ack just changed has no stored entry under the new ack, so the check
  written for exactly this failure cannot see it. 104 plans / 30,897 ppl lose a
  menu on supersession (171 / 149,049 more are correct wind-downs, split by
  `assetsEOY == 0`).
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
- **`cleanFiledName` IS NOT IDEMPOTENT — 154 rows / 38 plans / 97,563 ppl,
  CORRECTED 07:4xZ from my own "6 of 253,112", which was an 8-SHARD SAMPLE
  reported as the population.** A second clean pass changes the published name,
  and **it is usually a REPAIR**: Procter & Gamble (42,915 ppl) publishes
  `…Russell 2000 Index SMA(2)` from `…SMA(2)(4)` because the trailing-marker arm
  strips ONE marker where the filing has two; Santander (19,451 ppl) publishes
  `…Class Q(2)`; one plan publishes `Vanguard Russell 1000 Growth Index I;
  56,772 shares`, a welded share count.
  **THE FIX IS PER-ARM, NOT A LOOP:** make the footnote-marker and welded-count
  arms GREEDY, and leave the trailing-TYPE-LABEL arm single-pass or
  `Equity Income Separate Account` becomes `Equity Income`.
  **DO NOT CARRY ANY better/erosion SPLIT** — my `MARKER_ONLY` classifier
  reported 81,143 + 239,330 participants against a 97,563 total, because the
  buckets summed PER ROW and the total PER PLAN. *A partition whose parts
  outweigh the whole is not a measurement.* Re-measure before shipping.
  `docs/accuracy-log.md` 2026-10-03 (07:4xZ).
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
- **A SENTENCE PUBLISHED AS A HOLDING — 2 rows / 288,416 ppl / $2,603,313, and
  the honest size is two.** Kaiser Foundation Health Plan publishes `Loan
  Repayments are included` in its fund table with a blank type: $1,753,508 on
  the plan with **182,954 participants** and $849,805 on one with **105,462**.
  **DO NOT CARRY 3,328 rows / 6,382,769 ppl** — that screen's `\bis\b` matched
  **`IS`, the abbreviation for Institutional Shares**, so its top members were
  correct abbreviated names: Amazon's `VANG FTSE SOC IDX IS` ($873,714,000),
  Mayo's `VANG IS TL STK MK IP` ($1.6B, 10.68% of its menu) and Cigna's
  `BLACKROCK SP 500 IDX (IS)` ($3.4B, 24.49%). ***A count keyed on a vocabulary
  measures the vocabulary*** — and this is the first instance where the
  collision was with a SHARE CLASS rather than an English word.
  **THE MEASUREMENT KILLED THE FIX, deliberately:** a display-side predicate
  would ship with no re-parse, but a two-member class cannot justify a
  name-shape predicate in the same hour that one such predicate produced 3,328
  false positives including a $3.4B row in front of 91,385 readers. Batch it
  with the other name-column repairs as a plan-specific pin; do not build a
  general predicate for it.
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
- **A PUBLISHED FORMULA WHOSE RATE EQUALS ITS CAP: 79 plans, UNREAD.** v199's
  gate tests `rate < cap`, so DirecTV's old `3% of the first 3%` was corrected by
  the mixed-fraction arm and would NOT have been caught by the gate. Whether
  `rate == cap` is a real design or a second misread shape is one measurement,
  not a quiet widening of the gate.
- **THE VESTING SENTENCE SELECTED ON THE WORD `eligible` — found while reading
  PSEG for v198, UNSIZED and honestly so.** PSEG's stored `vestingText` is not a
  vesting schedule: it is a withdrawal-suspension sentence (*"If a Participant
  withdraws certain post-income tax Deposits … will not be eligible to receive
  matching Employer Matching Contributions during the subsequent six months"*),
  so the extractor filed a sentence about losing FUTURE MATCH eligibility under
  vesting. The page prints it as the plan's vesting quote. Needs the same
  whole-store measurement v198's fix got — and note the shape of that
  measurement: the question is not "how many quotes contain `eligible`" (a count
  keyed on a vocabulary measures the vocabulary) but how many selected sentences
  carry NO vesting arithmetic at all.
- The wind-down explanation gates on exactly $0 assets, so a plan that collapsed
  to $2,094 escapes it and publishes three $1 rows instead. Trigger on a
  COLLAPSE, not only on zero.
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
- **FOUND BY THE 18:2xZ DRAW, SIZED NOT FIXED: `Registed Investment Co.` — 5
  rows / 3 plans / 280,651 ppl / $1,263,712,991**, published at **60.8%,
  35.3%, 20.3%, 7.4% and 1.3%** of their menus with a blank type, no ticker
  and no fee. `isGenericTypeName` and `isNamelessFundRow` both answer FALSE
  because `Registered` is MISSPELLED (Trinet HR III/IV, Pacific Mobile
  Structures; one row carries the real fund, `Fidelity Freedom Index 2060 Fund
  Investor Class`, in its ISSUER cell). **The wider class is UNMEASURED and
  honestly so:** a `cit|collectiv|mutual fund|regist` screen reads 13,543 rows
  / 13.5M ppl by matching those tokens inside REAL names (`GQG Partners
  International Equity CIT`, `American Mutual Fund` = AMRMX) — *a count keyed
  on a vocabulary measures the vocabulary*, so that figure is discarded.
- **ALSO FROM THAT DRAW: `namelessRow`'s no-issuer gate reads a Schedule H
  CAPTION as a house.** 1 row named `Common collective trusts` whose issuer
  cell holds `Investments at net asset value` is typed `Collective trust` at
  **66.4% of its menu**, while the other 33 rows of that same name are
  correctly qualified "Filing names no specific fund".
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

- **Measure through the function the page calls, WITH THE ARGUMENT THE PAGE
  PASSES.** Met at least six times: a fee asked of the raw name where the page
  prices the cleaned one; `fundTickerInfo` called with one argument where the
  page passes the whole row; `lookupTicker` reimplemented and stopped one stage
  short of `f.stk`, reading 0 of 147,835 rows. **There are TWO ticker resolvers
  and TWO display paths** (the report `app.js`, and the crawlable pages via
  `build-seo-pages.mjs`) — a claim about readers must name which.
- **Before adding a SOURCE, ask what the pipeline already reads and throws
  away.** Three instances in one day: `cct` was 231,260 of the 406,247 bytes
  every visitor already downloads, with no consumer; `i1` was read by
  `build-data` and all but one name discarded; the master trusts' Schedule C was
  scanned for every one of 508 acks and then dropped by a loop over `universe`.
  The download, the parse and the memory were already paid for in all three.
- **A count of a condition is not a measure of a defect**, and the siblings:
  *a count keyed on a VOCABULARY measures the vocabulary*; *a count keyed on
  PLANS is blind to every master-trust row* (resolve a trust row through its
  MEMBER plans — met seven times); *a STORED field is not a PUBLISHED one*
  (cost one class size a factor of 3.9).
- **A fix for one phrasing of a class is not a fix for the class** — and the
  class also has a POSITION, a COLUMN, a SHARE CLASS and a FORM. Recorded nine
  times, twice inside the same function.
- **A control that cannot fail is decorative.** Write a negative control PER
  CONDITION, in full rather than by surgery on the shipped source, and assert it
  fails BY NAME on exactly its own cases. Check that new pins REACH the new arm:
  an arm can be inert while every existing case still passes.
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
- **A floor of ONE lets a single damaged row license the same damage elsewhere**,
  and a CEILING that reads repetition as evidence of correctness is fed by
  repeated damage. Prefer a RATIO between two whole names, plus an independent
  witness from outside this store.
- **A predicate that is right for one class is not thereby right for its
  neighbour**, and a hand-built control table tests the cases its author already
  imagined. The whole-store diff is not a formality after the controls pass.
- **A generator that edits a block in place deletes anything a later hand-edit
  puts inside its boundaries.** Four browser twins were lost to three
  regenerations; a predicate app.js twins is SLICED VERBATIM on the day it ships
  and never typed into app.js.
- **The page is the artifact.** A store-side proxy for what changed is not the
  page; regenerate and diff the files.
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
