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
- `data/lineups/NN.json` (64 shards, hash = sum(c*31) % 64) — full entries
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
  This section and the Architecture block both used to name only the daily and
  weekly crons, so "check `git log origin/main --not origin/<dev branch>`
  before every force-mirror" read as a once-a-day chore. Observed this morning:
  runs #250 and #251 fired twelve minutes apart and each committed to main, and
  three data commits accumulated there while one dev-branch run was in flight.
  A long dev run will ALWAYS come back to a main that has moved. That is no
  longer something to remember — `scripts/mirror-gate.mjs` compares the two
  stores and refuses automatically — but the hourly cadence is why the branch
  can never assume main is where it left it.
- **FRAGILE — the hourly agent cycle.** Runs as a `CronCreate` job, which is
  session-scoped: held in memory, never written to disk, and **killed by any
  container restart.** One was created at 06:30 ET on 2026-09-01 and was gone
  by 08:40 the same morning.
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
  destroy. Both refusals have negative-control tests. The hand-rolled
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

## Current state (2026-09-11)

- **Universe 111,782 plans** (401(k)-type 2J + ERISA 403(b) 2L/2M, >=100
  participants at either end of the plan year), of which **68,259 are
  full-form** filers; 68,767 parse-status entries. **Parser v123, OCR v8.**
- **LIVE on main: `9bb4ba05`, the COMPLETE v123 store — MIRRORED 2026-09-10
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
  | 253 (was 374) | 142,545 | $15.6B | `stmt` statement/aggregate won, not a menu (+57 from few/band-hi; these now render the filed-in-aggregate line, bit 4096). **Top of the bucket CHECKED 2026-09-11 and both are correctly suppressed** — MetLife (32,414p, $8.32B, 80 rows @ 1.00) wins on `Participant-directed investments` at **99.5% of the plan**, the single aggregate line DOL permits for participant-directed money, with the remaining 79 rows the itemized non-participant-directed bonds; Alight (11,234p, $2.61B, 21 rows @ 0.98) wins on a bare `CUSIP:` row at **92.6%** amid a brokerage flood. Publishing either would recreate the v105 dominant-row shape exactly. This is a RANKED look at the two largest, so it justifies not opening the bucket next — it is NOT a bucket-wide rate, and no random draw has been taken |
  | 128 (was 212) | 110,568 | $7.2B | `band-hi` holdings sum ABOVE plan assets. **CLASSIFIED WHOLE-BUCKET 2026-09-11** (disjoint, shipped predicates first, no sampling): **generic/aggregate 62 plans / 80,158 ppl — 72% of the bucket's people**, a non-fund label winning the region; **still unexplained 31 / 18,929**, of which 11 store no rows at all; **ratio meaningless 28 / 6,884** — year-end assets under $1M, so `rt` divides by almost nothing (Insite Digestive rt=1,680,043,000; Morphe 206,013,531). That last one is a defect in the DIAGNOSIS, not the parse: `diagnose()` should not assign a ratio-based `dx` against a negligible denominator. Recorded not fixed — it needs a re-parse and moves the census rather than the site, so it rides along with the next version bump. Form 5500 page content as a holding 5 / 2,068; statement-of-changes 2 / 2,529. **4 of the 128 are UNLINKED MASTER-TRUST members** whose trust note parsed as a plan menu — Conagra (`Plan Interest in Master Trust at Fair Value` at 97% of plan), A.O. Smith (91%), Hallmark, American Bank & Trust — tiny by count but **39,223 participants, 35% of the bucket's people**. **THE DISCLOSURE HALF IS SHIPPED 2026-09-11** — bit 65536 (`trustHeldUnlinked` in merge-4i) suppresses the false document-shape sentence and app.js states the true cause. **52 plans** after two widenings the same day: the first gate was `!mtiaAck`, which is how the cases were FOUND, and it left 41 plans / 631,022 participants (Albertsons 236,172, Mars, Johnson Controls, Siemens, Schlumberger) linked to an OPAQUE trust still being told the filing was unreadable. Bit 131072 marks those, because they need a different true sentence — saying "we could not match this plan to that return" about Albertsons would replace one false claim with another. Verified each time by the pipeline's own merge reproducing the count and by the defect-finding script returning 0. What remains unshipped is carrying the Schedule D trust NAME into plans-all so the page can say WHICH trust; the lineup itself stays unreachable either way. The bucket fell 212 → 128 across v115–v123 (−84 plans / −90,282 ppl / −$7.9B, at least the ~48 projected); **attribution is not clean and is not claimed** — eight versions shipped in between and the census records none of them. v115's mechanism, still the largest single shape: the FAIR VALUE HIERARCHY NOTE (Level 1/2/3 columns, two plan years, its own totals, ASC 820-10 text) read as the schedule, so its subtotals are summed beside the real menu (Vandalia's NAV row is $1.14B against $853M of plan assets, so it cannot be a subtotal of this plan); the fix seeds from the statutory header. NOT subtotal arithmetic, NOT vocabulary. **TWO METHOD LESSONS, both earned here and both costly:** (1) the master-trust shape looked DOMINANT in the six largest plans and is 4 of 128 — ranking picks what to open, never what a bucket contains; (2) a hand-written generic-name list that omitted `registered investment companies` (which is IN the shipped `GENERIC_TYPE_NAME`) produced a three-way split that dissolved on re-count — **the second time in two cycles a hand-rolled copy of a shipped predicate produced a wrong number. Reach for the shipped one.** |
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
  | `stmt` | 253 | unmeasured | the two largest are correctly suppressed |
  | `band-hi` | 128 | unmeasured | 62 are a non-fund label winning the region |

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
  the link fails — carrying it into plans-all would let the page say which
  trust holds the money instead of "we could not read it".
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
  | recordkeeper | 63,682 (93.3%) | 4,577 |
  | investment options | 60,298 (88.3%) | **1,407 live plans / 2.32M ppl / $262B** |
  | any audit notes | 62,555 (91.6%) | 2,548 live / 2.19M ppl |
  | **match formula** | 42,338 (62.0%) + 5,308 quote-only | **8,672 live / 13.53M ppl** |
  | vesting | 51,826 (75.9%) + 5,081 quote-only | 5,648 |
  | Roth stated | 36,470 (53.4%) | mostly genuine silence, not absence |
  | after-tax stated | 4,119 (6.0%) | genuinely rare |

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

- **The fabricated-lineup class is CLOSED and must stay closed.**
  `audit-dominant-row.mjs`: 50 plans / $83.9B -> **0** at v105, while all 319
  honest single-holding plans were preserved. `audit-generic-names.mjs` sits at
  208 plans / $48.2B on the shared definition (baseline, threshold 230).
  Both run inside `audit-data.mjs` every merge.
- **REOPENED 2026-09-10 — the "NOT worth parser work" verdict on missing
  features answered the wrong question.** The 2026-09-03 measurement stands as
  far as it goes: of the plans whose lineup parses but whose features are
  missing (now 2,193 acks / 1,943 live plans / **1,876,769 participants** /
  $81.0B), ~67% have no attachment prose IN THE NEWEST PUBLIC COPY, 27% have
  notes that never discuss contributions, ~7% is a real parser gap. Dollar
  General (201,691 participants) is the type case. **But "does the newest copy
  have notes?" is not "does the PRIOR YEAR's copy have notes?"** — and the
  prior-year fallback was never asked, because it only ever fired when the
  newest filing yielded no confident LINEUP. Where that fallback PDF has
  actually been read and the newest filing had no features, the prior year
  supplied them **462 of 502 times (92%)**. That population is biased (those
  filings failed entirely), so 92% is an UPPER BOUND, not a forecast. v119
  widens the trigger; the run measures the real rate. Cost: up to ~2,193 extra
  PDF reads per run, ~3% more work.
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
- Owner to-dos: point GitHub Pages at `main`; custom domain.
- **LAUNCH WEEK (owner directive 2026-08-09: fully live by 2026-08-14)**:
  shipped so far — fee schedule w/ service codes, fee percentiles vs peers,
  About/methodology page, boot payload split (12→2.8 MB gz). Remaining, in
  order: static SEO pages (top ~5k plans by assets + sitemap + robots,
  generator in the merge job; real crawlable URLs are the growth engine),
  v36 dotted-leader lineup recovery (Costco/JPM class, biggest coverage
  win), OCR page-targeting for >40-page scanned attachments, glossary/
  accessibility pass. Owner blockers for "live": GitHub Pages must serve
  main (Settings→Pages), custom domain DNS, approve the daily accuracy
  Routine. Daily cycle sessions pick up any of this that isn't done.
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
