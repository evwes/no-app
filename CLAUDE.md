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
- **`sec-tickers.yml`** — dispatch-only workflow that regenerates
  `sec-tickers.js` on a runner (30 min of CPU), diffs the key map, re-stamps and
  commits only if a key moved. Dispatch it when `sec-tickers-stamp-test` goes
  red; never run the generator in-session.
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
  **RE-DERIVED 2026-10-12 OVER AN INDEPENDENT 230-HOUR WINDOW, AND THE MEAN
  REPRODUCES TO WITHIN 0.05h: 53 scheduled runs, median **4.36h**, mean
  **4.42h** against the recorded 4.37h, 35 distinct firing minutes.** Two things
  the first measurement did not say, both sharper than it: **the MINIMUM
  interval in 230 hours is 1.49h and NOT ONE interval is under an hour**, so the
  cron does not merely average out to 4 hours — it never once delivers the
  hourly cadence it is configured for; and the distribution is 19% under 3h,
  77% under 6h. The worst gap here is 7.4h, which does NOT refute the recorded
  44.2h — a shorter window is less likely to sample an outlier, so that figure
  stands unchallenged rather than improved. *A mean that reproduces across two
  disjoint windows is the part to trust; a median that moved 3.60 -> 4.36 and a
  worst case that did not recur are both window effects until measured again.*
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
- **THE LOOP ROSTER, AND THE LESSON THAT THE LOOP WAS OFF FOR SEVENTEEN DAYS
  AND NOTHING SAID SO (audited 2026-11-05).** `list_triggers` found
  `wampo daily cycle (self-bind)` at **`enabled: false`**, last fired
  **2026-10-19** — while the session-start banner was still printing it as the
  DURABLE SCHEDULER, because that banner is hardcoded and warns about itself.
  ***The field ledger is what proved the cost rather than the trigger list: the
  one participant-weighted scalar read 79.82% on 2026-10-21 and 79.82% on
  2026-11-05.*** Fifteen days, net zero, while the universe GREW 3.9M people —
  so every improvement in that window came from the owner prompting
  interactively. **A disabled loop is invisible from inside the work it was
  meant to do; only a scoreboard with two points can see it.** Re-enabled with
  a refreshed prompt (the stale "v204 MUST NOT BE MIRRORED" amendment was still
  in it, spent since the 2026-11-05 mirror), and a second Routine created:

  | Routine | cron (ET) | what it is for |
  |---|---|---|
  | `wampo daily cycle (self-bind)` | 07:59 daily | ledger-driven coverage: pick the field with the most ADDRESSABLE readers, dispatch its owner agent, verify the number moved, mirror |
  | `wampo weekly integrity (self-bind)` | Sat 07:39 | *is what we publish TRUE* — participant-weighted draw read against the filings, error codes re-probed, gates checked for FIRING rather than existing |
  | `Wampo unresolved funds (Sunday)` | Sun 07:44 | the unresolved-fund report and CSV, the input to fee/ticker sourcing |

  **The two loops are separate ON PURPOSE and must not be merged: the daily one
  is driven top-down by readers affected, so "is it complete" will always crowd
  out "is it true".** All three SELF-BIND to the session that owns the repo —
  fresh-session Routines get no repo source and no push credential, which is why
  ~40 firings landed nothing.
  **STILL ENABLED AND STILL NO-OPS, and worse than absent because the trigger
  list looks healthy:** `Wampo daily sweep` and `Wampo weekly status` both
  target `/Users/ea/Documents/Claude/Projects/wampo` — an OLDER Node/Express
  build of the project on the owner's Mac, unreachable from any cloud session —
  and both report **SUCCESS** after 8 and 4 seconds. Deleting them is the
  owner's call since they may still serve the Mac copy.
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
and that is verified, not assumed.** The full universe re-parse — 15 jobs, 5h11m
wall, ~55 runner-hours — reports `billable.UBUNTU.total_ms = 0`, because the
repo is public and GitHub bills nothing for standard hosted runners on public
repositories. Check it with `actions_get` / `get_workflow_run_usage` on any run.

**So the repo staying PUBLIC is the entire basis of the free tier.** Private
would put ~55 runner-hours per re-parse against a 2,000 minute/month allowance —
one re-parse would exhaust ~27 months of quota. Changing visibility also
unpublishes GitHub Pages.

**What IS scarce, in order:** (1) **wall-clock time** — a full re-parse costs
4.5 hours of calendar time whether or not it costs money, and cancelling one by
pushing to `scripts/**` mid-run destroys those hours; (2) **assistant session
usage** — the only limit actually hit, burned by polling loops, re-reading large
tool output, and re-deriving facts already written down; (3) **concurrency**, 20
jobs on the free tier against a 13-shard matrix plus prep and merge; (4) the
**API rate limit**, reached only by polling.

**The rules that follow:**

- **Never push `build-data.mjs`, `fetch-4i.mjs`, `lib-4i.mjs`, `merge-4i.mjs`,
  `scripts/.kick` or the workflow file while a run is in flight ON THE SAME
  REF** — concurrency is `group: build-data-${{ github.ref }}`, so a dev push
  cannot cancel a run on `main`, and the push trigger's path filter is exactly
  those six files. `audit-data.mjs`, the tests and `lib-disclose.mjs` create no
  run at all. *A rule stated more broadly than its mechanism costs real hours,
  and the cost is invisible because nothing fails.*
- **WHAT DOES NOT RELAX: a run in flight on main is a reason not to MIRROR.**
  `mirror.sh` refuses on exactly that.
- **Cancelling a run does NOT stop it committing.** The merge job runs under
  `if: always()`, so a cancelled run can commit a PARTIAL store and the branch
  can carry mixed-version data at any moment after a cancel. Check the `pv`
  distribution before mirroring; `audit-data` now enforces it at 97%.
- **A run can FINISH and still not have READ the universe**, which is a separate
  failure from a partial store: failed downloads correctly keep the stored entry
  and an old `pv`, so nothing is lost and nothing is refreshed, while the
  coverage line rises. `audit-data` raises `download-failures` above 1%.
- **`[skip ci]` on every commit touching one of those six files while a run is
  in flight on the same ref**, and on parser commits made outside the 1–7 AM
  window so work batches into one re-parse.
- **One re-parse in flight at a time**, and only a `PARSER_VERSION` /
  `OCR_VERSION` bump justifies a full one — without a bump the work list is just
  the stale acks (7 minutes once). **Do not bump a version to "refresh" data.**
- **Do not poll a running job.** Dispatch, verify it started, let a later cycle
  take the verdict.
- **The merge job FAST-FORWARDS the dev branch** when it is a strict ancestor of
  main (`build-data.yml:305`), so the adoption chore usually does not exist and
  the only local action is `git merge --ff-only`. The hazard survives only on
  REAL divergence, where the step says so and hands it to `mirror.sh`. *A
  procedure note can be made false by a shipped automation, and nothing fails to
  tell you.*
- The largest real inefficiency is measured, not hypothetical: **3,700 filings
  (5.4% of the universe) are downloaded, rasterised and OCR'd on every full
  re-parse and produce nothing readable.** That is what to fix if a re-parse
  needs to be cheaper — not the runner count.

## Work cadence (owner directive 2026-09-01)

**Work, report, continue. NEVER delay finished work for a clock.**

*(TWO deliberate exceptions on this record, and BOTH ended at their own
written expiry rather than by being noticed: 2026-10-05 → 2026-10-08 7:00 PM ET,
and 2026-10-12 → 2026-10-15 7:00 PM ET. Each pause carried its expiry in a state
key AND in a one-shot Routine that fired at it — which is the whole point of
writing an expiry down rather than remembering one. The Actions pipeline ran
throughout both, as it should; the first left 10 data commits on main and the
second 21, and in both cases the merge job's fast-forward step had already
converged the dev branch, so there was no adoption chore and no structural diff
to run. **What the second pause measured, which the first did not: 24
consecutive scheduled merges appended a BYTE-IDENTICAL coverage line.** Three
days of the durable layer moved not one coverage key, which is the honest
shape of a quiet ingest window and the reason the agent layer is where the
improvement comes from.)*

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

*The method rules below carry the general lessons; this section is the owner's
directives, the standing machinery, and the procedures with a specific shape.*

- **EVERY FULL FORM GETS LISTED AND DESCRIBED, AND EVERY UNKNOWN GETS A
  DIAGNOSED CAUSE (owner directive, 2026-09-02).** The work does not stop at "no
  schedule found" — that label describes US, not the filing, and shipping it as
  though it described the filing is how State Farm sat for weeks marked as a gap
  while its 55-fund Vanguard menu sat on page 3 under a textbook heading. Open
  the filing, find out why, record the cause: parser defect, absent from the
  public copy, scanned, master-trust-held, or genuinely not filed.
  `scripts/size-class.mjs` buckets a whole set by cause in one pass;
  `scripts/gap-verify.mjs` distinguishes "we cannot read it" from "it is not
  there". **A cause that is merely plausible is not a cause — instrument before
  believing one.**
- **ACCURACY IS THE FIRST PRINCIPLE (owner directive, 2026-07-25).** Every
  accuracy defect gets a permanent entry in `docs/accuracy-log.md`: what was
  wrong → the change → the prevention. **Never delete entries.** Every parser
  cycle includes hands-on filing review — sample the worst coverage class,
  compare extraction to the filing text, feed fixes back as patterns +
  regression specimens + log entries. **Cap a new entry at ~25 lines**: the log
  is 62,000 lines and an entry nobody re-reads is a cost, not a record.

### Always-on accuracy machinery

1. **Every merge appends a line to `docs/coverage-history.jsonl`** (universe,
   confident lineups, match/vesting/rk coverage, fee-codes %, HIGH/WARN, and
   `pv`) and a line to `docs/ledger-history.jsonl` (the participant-weighted
   scalar). Trends are diffable; dips are regressions.
   **BUT `tkExact`/`tkComparable` are a RE-IMPLEMENTATION of `lookupTicker`,
   not a call to it**, so they go blind whenever an arm is added to the page and
   not to `audit-data` — which happened twice, costing 1.11 points. *Nothing
   executes a comment asserting equivalence*, and that comment had claimed the
   call for weeks: check the arm list against app.js's whenever either moves.
2. **The merge job maintains the auto-managed issue "Data audit: HIGH findings
   (auto)"** from `audit-high.txt`, self-closing when clear.
3. **Merge auto-triages confidence LOSSES** — any lost lineup whose old parse
   was real-menu-shaped (n≥7, or n≥5 at ratio 0.7–1.3) becomes a `reparse-loss`
   HIGH; junk-cleanup losses pass silently, broken real menus cannot.
4. **The audit prints a REPARSE VERDICT** against the previous coverage line and
   flags `reparse-regression` beyond tolerance (confident −200, match/vesting
   −150). A regression must be justified with sampled losses or rolled back
   BEFORE mirroring. *Mirroring after diff review is what kept the v49 over-cut
   (−1,590) off the live site.*
5. **`swaps-degraded.txt` catches what the loss triage cannot see.** Moving a
   plan off a prior-year lineup onto its own newest filing keeps `confident` at
   1 and moves no total, so a SWAP that halves a menu's coverage is invisible to
   every count. The warning sign is the coverage ratio moving AWAY from 1.0, not
   a lower row count — a ratio moving TOWARD 1.0 with fewer rows is the prior
   year having carried extra rows. Raised as WARN, because 2 of 157 must not
   drown the four baseline HIGHs. **A check that prints 0 on a quiet store has
   not been tested** — this one was verified with a crafted delta through the
   real merge, in both directions.

### Procedures

- **Mirror ONLY with `bash scripts/mirror.sh`.** It refuses when main carries a
  commit the branch lacks, when local disagrees with origin, and when a
  data-producing run is in flight on main; it prints what a force push would
  destroy; both refusals have negative-control tests. **The data gate is
  PLAN-KEYED** — the ack-keyed version reported 7,830 lost lineups where 22
  plans actually stopped being served (7,585 were the same plan under a newer
  ack, 171 wind-downs, 82 moved to the short form), and *a gate that can only be
  satisfied by overriding it is not protecting anything*. **An ack owned by no
  plan is resolved through its MEMBER PLANS**, without which the gate silently
  drops plans served only by their trust. `MIRROR_GATE_MAIN_REF` +
  `MIRROR_GATE_BRANCH_REF` replay any pair on demand (a replay exits **2**,
  never 0). The hand-rolled `git push --force-with-lease` is retired: running
  the check by eye failed once, when an unconditional "(nothing above…)" echo
  overrode the reading of the offending commit it had just printed.
- **A frontend change must re-derive the cache-buster:
  `node scripts/stamp-assets.mjs`, then commit `index.html`.** The stamps are
  sha256 content hashes of `app.js`, `styles.css`, `data.js`, `fund-er.js` and
  `sec-tickers.js` (derived from `index.html`, so the list is general even where
  a comment names four), and **without a restamp a returning browser keeps the
  cached copy — the change ships and no reader sees it**, which is what the
  owner reported as "nothing is updated in wampo" after four stamps went
  seventeen days stale. `site-test` enforces it with `--check`.
- **Curated overlay never beats filed data** (flipped 2026-07-24):
  provider/match/vesting/tax flags prefer extraction; `data.js` only fills gaps
  and predates the pipeline.
- **Smoke test** (`site-test.yml` → `scripts/smoke-test.mjs`) runs on every
  frontend push: boots the site, opens full-form / master-trust / short-form
  specimens picked from live data, fails on undefined/NaN leaks or missing
  explanation rows. Run it locally before pushing frontend changes.
- **Correctness check** in `audit-data.mjs`: every displayed formula's numbers
  must appear in its own quote.
- **Runner OOM (Jul 24):** parse jobs need `NODE_OPTIONS=--max-old-space-size`,
  results flush every 250 filings, artifacts upload `if: always()` so crashed
  shards hand progress to the merge.
- **Full process review with evidence: `docs/process-review.md`.**

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

**AND IT MUST STAY SHORT — THIS HAS NOW BEEN CUT TWICE AND BOTH TIMES FOR THE
SAME REASON.** The whole file is re-injected verbatim at the START OF EVERY
TURN, including the turn after a compaction, so its length is a tax on every
cycle and compaction cannot help. On 2026-10-02 this block alone had grown to
9,284 of the file's 10,001 lines (~201,000 tokens). **On 2026-11-05 the file was
567,340 bytes / ~150,000 tokens per turn again, and 98 `SHIPPED` markers sat
inside the section headed "Open"** — so a session paid ~150k tokens to re-read a
history of closed work before reading one line of conversation. It was cut to
~84,000 bytes / ~22,000 tokens, with everything removed moved VERBATIM to
`docs/closed-classes.md`.

**So the rule, which the second cut earns the right to state plainly:** per-class
and per-version history goes in `docs/accuracy-log.md` and
`docs/closed-classes.md`. What belongs HERE is the state a new session needs
before it acts, the standing decisions, the live queue, and rules that outlive
the version that earned them. ***A shipped entry is not queue state — the moment
a class closes, move it.*** The tell that this has drifted again is a `grep -c
SHIPPED CLAUDE.md` above single digits.

### Store — DERIVE IT, and the commands are here instead of the numbers

**This block held 114 lines of figures dated 2026-10-04 while the store said
something else** (112,652 plans against the ledger's 115,641), under a heading
reading "NEVER COPY IT FORWARD". *A contradicted number in this file is asserted
again every time it is read, and the reader cannot tell which copy is live.* So
the numbers are gone and the derivations are here:

| what | how |
|---|---|
| the reader-facing scoreboard | `node scripts/ledger-report.mjs` |
| coverage keys, trend, `pv` | last line of `docs/coverage-history.jsonl` |
| parser version | `PARSER_VERSION` in `scripts/lib-4i.mjs` |
| coverage residuals by cause | `node scripts/gap-census.mjs` |
| per-ack parse status | `loadStatus()` from `scripts/lib-schema.mjs` |

Universe: every 401(k)-type (2J) AND ERISA 403(b) (2L/2M) plan with ≥100
participants at EITHER end of the plan year, full-form and short-form, newest
filing per `EIN|PN` across [2025, 2024, 2023]. A DOL refresh moves it — one on
2026-11-02 moved `plans` 112,652 → 115,641 — so **every figure derived from the
universe is stale after the next refresh.**

**COMPLETENESS TEST:** one dominant `pv` covering ≥97% of acks plus a small
old-version tail. A second large `pv` cohort means a PARTIAL store
(`audit-data` raises `partial-store` under 97%); `dl` above 1% raises
`download-failures`; `ex` above 0.1% raises `extraction-failures`, which is the
harsher threshold because a 403 PRESERVES the stored entry and an extraction
failure DESTROYS it.

**THE HIGH BASELINE IS 4** = 3 `contrib` outliers + `fabricated-name`
(`audit-generic-names` sits above its 230 escalation threshold, so that HIGH is
STANDING rather than absent). **CI can report MORE than the local audit** — the
extra entries are self-clearing `reparse-loss` findings raised from
`losses-triage.txt`, a run ARTIFACT that exists only in CI. *A metric that
differs between CI and local is a question about the inputs, not the store.*

**READ EVERY PARTICIPANT-WEIGHTED FIGURE WITH A ~3% CAVEAT.** 28 plans claiming
2.94% of the weighted universe have a participant count no other field supports
at beginning-of-year assets under $10 a head; `activeParticipants` corroborates
20 of them, and the ~8 that nothing supports carry 89% of that weight. The
witness must be **BOY** assets — an EOY screen sweeps in real wind-downs with
correct counts, which is how one screen reached 504 plans / 5.2M.

**THE IDENTICAL-LINE RUN IS EXPECTED, NOT A STALL.** Over 470 trail lines,
pairs are identical 58% of the time and the longest identical streak is 35, so
three identical runs is evidence of nothing. **Compare under BOTH key sets and
say whether the DATE field is in them** — `d` is on every line and the trail
spans 56 distinct dates, so including it forces a difference at every midnight
and moves the longest streak by 2.5x. *A key set is NOT fully named by "all" or
"shared".* And **a count carried forward by increment is not a measurement** —
re-derive it, never bump it.

### Pre-registered for the next run that merges

**NOTHING.** Every registration through 2026-11-05 was delivered and verified;
the record of each is in `docs/closed-classes.md` and `docs/accuracy-log.md`.
**The habit stays:** before dispatching a run, write down the coverage keys that
must move, the band, and — explicitly — *nothing else moves*, derived by running
`audit-data.mjs` over the committed store with the new asset and diffing its
computed line KEY BY KEY against the line attributed by the COMMIT that
introduced it (`git log -- docs/coverage-history.jsonl`, never by position in
the file). A registration derived from the IMPORT GRAPH is stronger than a point
estimate: it refutes itself the moment a new import appears.

### Open, in rough order of READERS affected

**THE LEDGER IS THE QUEUE.** `node scripts/ledger-report.mjs` prints the one
participant-weighted scalar and the addressable gap per field; it is DERIVED and
must never be copied forward. Re-derived 2026-11-05: **115,641 plans /
119,907,098 participants / overall 79.82%**, with addressable gaps

| field | readers with no answer | owner agent |
|---|---|---|
| contributions (pre-tax / Roth / after-tax / brokerage) | **33.7M** | `tier-a-contributions` |
| match | **22.3M** | `tier-a-plan-terms` |
| vesting | **14.9M** | `tier-a-plan-terms` |
| custodian / recordkeeper | **11.7M** | `tier-a-custodian` |
| fund menu | **1.2M** | `tier-a-lineup` |

Row-level fields (per-fund ticker, fee, return) are deliberately NOT in that
scalar — they are rows, not plans — and are `tier-a-fees`'s.

**A READER FLOOR OF 500,000 APPLIES TO NEW WORK.** The record holds dozens of
shipped classes under 100,000 readers, each costing a full cycle; a class below
the floor is noted and left for a batch. The two exceptions are a WRONG published
claim (which outranks a missing one at any size) and a one-line change.

**STANDING OWNER DECISION, 2026-11-05 — A FEE MAY BE WITHDRAWN WHERE IT CANNOT
BE SOURCED.** Asked directly and answered YES: where we have evidence a
published expense ratio is wrong and no replacement figure can be sourced, the
cell is **blanked**, not kept. *A blank is honest; a wrong number reads as
knowledge.* **So every fee family below is unblocked ON THAT QUESTION** — the
fabricated stable-value 0.35, the generic estimate pre-empting an issuer figure,
the American Funds R-6 inference, the one-ticker-two-fees class, the share-class
fee families — and a session no longer needs to ask before withdrawing one.
**What has NOT changed, and still gates each ship:** the differential through
BOTH copies of `renderRow` with row membership and `star` priced; a seeded
uniform draw read by hand with each row's filed TYPE printed; the serving
condition and the publish gate applied before any reader figure; and an
accuracy-log entry. ***And withdrawal is not re-pricing: a fee is SOURCED, never
derived.*** A replacement goes through `data/fund-facts.json` via the
`fund-facts` agent with a source URL and an as-of date, never from a pattern,
never from memory. Where a figure IS sourced it outranks the estimate — that
shipped 2026-11-05 and 92 funds are live.
**The direction is one-way: this licenses REMOVING a claim, never adding one.**
A ship that would newly PUBLISH a fee where the page shows none is a different
decision and is still the owner's.

**FOUR STANDING OWNER DECISIONS, 2026-11-05 — asked directly, all four answered,
and together they unblock 96.5M readers.** Each was gated for months on a
judgment only the owner could make; none needs asking again. **What has NOT
changed is the evidence each ship still owes** — the differential through BOTH
copies of `renderRow` with row membership and `star` priced, a seeded uniform
draw read by hand with each row's filed TYPE printed, the serving condition and
the publish gate applied before any reader figure, and an accuracy-log entry.

| decision | answer | scope |
|---|---|---|
| **2K / after-tax** | publish the code's LITERAL meaning | 55,408 plans / **25.0M** |
| **comparable ticker** | symbol only, **NO fee** | 35,353 plans / **49.1M** |
| **wrong share class** | correct the symbol, WITHDRAW the fee | 1,865 plans / **9.1M** |
| **fee pre-emption** | prefer the ISSUER-specific figure | 8,330 plans / **13.3M** |

1. **2K IS PUBLISHED AS WHAT IT LITERALLY MEANS, NOT AS AN INFERENCE.** Code 2K
   is 401(m) and covers an employer match, after-tax employee contributions, or
   both, so it cannot settle after-tax on its own — and because we would not
   infer, 25.0M readers saw a blank. A 2K plan now reads that it offers *a
   match, after-tax contributions, or both*. **That is a true statement about
   the filing and NOT a yes/no**, which is the whole point: it tells the reader
   something checkable where the blank told them nothing. ***It must never be
   rendered as "after-tax: yes"*** — the disjunction is the claim. Reading the
   audited notes to resolve it to a real yes/no stays separate, parser-side, and
   needs its own sizing.
2. **A COMPARABLE TICKER SHIPS WITHOUT A FEE.** The 188,846 rows where the
   registry finds an equivalent but the filing states no share class now publish
   the asterisked SYMBOL and **no expense ratio at all**. An advisor gets the
   identification and can price it themselves; we do not put a number on a
   vehicle whose price we do not know. **This is a NARROWING of the shipped
   comparable design**, where `app.js:4073`'s `star ? info.er : …` takes
   `info.er` unconditionally — so the ship must also withdraw the fee from
   comparables that already carry one, and that is a WITHDRAWAL on existing
   rows, priced separately from the gain.
3. **A WRONG SHARE CLASS IS CORRECTED AND ITS FEE WITHDRAWN**, on the
   one-directional slice only (filing states plain Institutional, page publishes
   a retail class; inverse direction measured 0 of 3,169). The symbol becomes the
   one the stated class maps to; the expense ratio is **blanked**, not carried
   over, because the right class's fee is not sourced. The both-directions
   remainder of that family stays gated.
4. **THE ISSUER-SPECIFIC FEE OUTRANKS THE NAME-PATTERN GUESS.** Where the filing
   names the issuer and a fee composed from issuer + name differs from the one
   guessed off the name alone, the composed figure wins — more specific evidence
   beats less specific. ***It is still an ESTIMATE and still labelled "est."***:
   this decision chooses between two guesses and creates no sourced figure, so
   it does not touch the standing rule that *a fee is SOURCED, never derived*.
   `issuerPricedER` already refuses to let the issuer answer alone, and that
   guard stays.

#### Paid for and not yet rendered — do these first

- **The TRAILING returns (1Y / 5Y / 10Y) are the owner's next emphasis and the
  schema is now open for them.** `fund-facts-check.mjs` accepts
  `r1y/r3y/r5y/r10y` with per-horizon plausibility bands, a required
  `returnBasis: "annualised"` and an optional `inception` that refuses a 10-year
  figure on a younger fund — the paste that would otherwise publish a
  *cumulative* 10-year return (+159%) in an annualised field (+10%). **0 funds
  carry one yet**: sourcing them is the `fund-facts` agent's work, and the
  render is then the same shape as YTD. The YTD column SHIPPED 2026-11-06 —
  `docs/accuracy-log.md` — and the lesson it carries forward is that *the
  largest plans hold collective trusts, so the lever is more sourced TICKERS,
  not more sourced returns*: Walmart fills 1 of 42 rows at 0.0% of value.
- **CLOSED, BY MEASURING IT: the Schedule A CARRIER is worth 194,379 readers,
  not 9.45M.** This entry read "9.45M readers / 44,149 plans have no custodian
  answer where this names one" and ranked second among the paid-for items.
  Measured 2026-11-06 over all three dataset years against the committed store:
  **647 plans / 194,379 participants**, 49x smaller and below the reader floor,
  because **30,238 of the 30,885 carrier-naming plans already publish a
  recordkeeper**. The 9.45M was plans with no custodian answer *at all*, never
  intersected with "Schedule A names one". The correction route is small too:
  25 plans / 18,180 readers publish an ACCOUNTANT as recordkeeper (11 with an
  identifiable carrier), and the 1,046 consultant/advisor plans are **not
  established as wrong** — a TPA can be the recordkeeper while an insurer is
  the annuity carrier, so the two fields differing witnesses nothing. *Do not
  reopen this without a new measurement.* `docs/accuracy-log.md` 2026-11-06.

- **`askebsa.dol.gov` IS REACHABLE FROM THIS SANDBOX (measured 2026-11-06), so
  a prep-stage question can be sized BEFORE a run.** The gotchas section says
  the DOL website is not reachable; that is about a different host. A HEAD on
  the FOIA dataset path returns 301 and a followed GET returns 200 with real
  bytes — all three `F_SCH_A` years downloaded in about a second each, 14 MB
  zipped / 118 MB of CSV. The Schedule A close above was derived this way with
  no pipeline run at all. *Probe the host before assuming a measurement needs a
  run.*

**THE DEPLOYMENT IS THE ONE LAYER WITH NO WATCHER — found 2026-11-06.** Every
gate here watches the DATA (`audit-data`, loss and swap triage, `mirror-gate`)
or the PAGE CODE (`site-test`); none watches whether what was mirrored reached
readers. `pages build and deployment` #1214 concluded **`failure`** at 13:02Z on
2026-11-06 — Pages' own `syncing_files` step timed out after twelve minutes, not
our code — and the next success was 17:42Z, so the live site served a ~4.5-hour
stale store and nothing surfaced it. **CORRECTED THE SAME HOUR, BY THE NEXT
DEPLOYMENT — IT IS 2 IN 300 (0.67%), BOTH ON 2026-11-06, WITH DIFFERENT
CAUSES.** #1216, carrying the 2K ship itself, sat in `deployment_queued` for 90
seconds and returned `Deployment failed, try again later.` — a transient
server-side rejection, not #1214's twelve-minute `syncing_files` timeout.
Cleared by `rerun_failed_jobs`, success on attempt 2. A conclusion-only read
still over-states (8 of the 10 non-successes are `cancelled` at 1.1–1.3 minutes,
a superseded deployment), so *read duration beside conclusion or a failure rate
measures cancellations* — but **two failures in one day with two causes is a
CLUSTER, which a 30-day rate is the wrong shape to describe**, and the rate I
committed was stale within the hour. **The cost was real: for twenty minutes the
ship was mirrored, verified on the tree, and SERVED TO NOBODY.** *A verified
mirror is not a served page.* Remedy, cheap and unbuilt: after a mirror, read
`conclusion` on the run whose `head_sha` IS main's HEAD — already one of the two
recorded ways to verify a deployment, and no scheduled job does it. It is also a
SCALING signal: 5,287 crawlable pages plus a 12.17 MB `plans-list.json` grow
every refresh. `docs/accuracy-log.md` 2026-11-06 (18:2xZ).

**THE REGEN LEAVES THE TIP UNVERIFIED — found 2026-11-06, unbuilt.** A ship that
moves app.js's fingerprinted slice reddens `sec-tickers-stamp-test`, the remedy
is to dispatch `sec-tickers.yml`, and **that workflow commits with `[skip ci]`,
so the commit that FIXES the gate creates no run to prove it.** The tip ends with
no CI verdict immediately after the step taken to make it green, with every gate
passing LOCALLY — the state this record names as having hidden ten consecutive
red runs. `[skip ci]` must stay (without it the regen races the session's pushes
over one branch), so the closure is for `sec-tickers.yml` to dispatch
`site-test` on its own head after pushing. Until then: **after any regen,
dispatch `site-test` by hand and read its `conclusion` before mirroring.**
*A manual step in a verification path is the step that gets skipped.*
`docs/accuracy-log.md` 2026-11-06 (22:0xZ).

#### Owner-gated — a session must not start these unasked

Each moves millions of published cells. Sizes are as last measured; **re-derive
before acting**, and read the full entry in `docs/closed-classes.md` first,
because most carry a refuted route that must not be rebuilt.

- **The COMPARABLE half of the SEC matcher** — 188,846 rows / 35,353 plans /
  **49.1M readers** would gain an asterisked comparable where the page shows
  nothing today. The asserted half shipped. A comparable is still a published
  claim, which is why the volume makes it a decision and not a cleanup.
- **A filing stating a share class where the page publishes a DIFFERENT class's
  symbol AND ITS FEE** — 5,929 rows / 4,837 plans / **11.1M readers** / $44.9B.
  Errs in BOTH directions, so no blanket correction. Its largest sub-class is
  one-directional BY MEASUREMENT (3,169 rows / 1,865 plans / **9.1M readers**,
  inverse direction 0 of 3,169): filing states plain Institutional, page
  publishes a retail class. Recommendation on that slice: correct the symbol,
  WITHDRAW the fee.
- **The fee PRE-EMPTION** — a generic estimate published where the issuer cell
  supplies a house-specific one: 40,229 rows / 8,330 plans / **13.3M readers**.
  Errs both ways. A sharper sub-case needs no house judgment: one fund name cut
  mid-word across the two columns, priced off the fragment.
- **OUR OWN STORE CONTRADICTS OUR OWN PAGE** — the parser stores a
  share-class-correct `stk`/`ftk` and the display prefers its own resolver:
  5,692 rows / 3,860 plans / **8.2M readers** / $50.7B, and 0 of 42 rows read
  favour the page. One-directional on every row read. Blocker is the FEE, which
  is priced on the NAME.
- **Stable value / guaranteed accounts publishing a fabricated ER** — 4,669
  rows / **7.4M readers**, 4,571 at exactly 0.35. Unblocked on the withdrawal
  question by the standing decision above; still needs the differential and the
  draw.
- **American Funds rows stating NO share class keeping the R-6 fee** —
  **10.5M readers**. The ticker column already refuses this inference and the
  fee column does not; both cannot be right.
- **The CREF variable-annuity accounts** — 15,028 rows / **4.5M readers** /
  $81.8B, of which 4,672 publish a false `Mutual fund` type and 3,559 a
  pattern-table fee. Two halves, two decisions.
- **The 2K AMBIGUITY** — code 2K is 401(m), meaning match AND/OR after-tax, so
  it cannot settle whether a plan offers after-tax contributions: **55,408
  plans / 25.0M readers** turn on how it is read. The largest single
  cross-cutting question on the record and the reason `contributions` is the
  biggest ledger gap.
- **The RECORDKEEPER is wrong, not blank** — ~2,200 plans publish an auditor,
  consultant, advisor or broker as the recordkeeper, of which ~36 are
  unarguable (an accountant is never a recordkeeper). The fix needs no new
  source and moves up to ~2,200 published names.
- **`overshoot` 366 -> 764 is a DOL refresh, not a regression** (attributed
  2026-11-05, `PARSER_VERSION` unmoved at 204). 513 plans / 789,209 readers
  newly publish a wrong menu total, 99.2% reader-facing. Remedy — judge a
  prior-year fallback against the FALLBACK YEAR's assets — is in `fetch-4i`, so
  it needs a bump and a full re-parse.
- **Crawlable pages no run can repair** — `p/` holds 5,118 files against
  `TOP_N = 5000` and the generator does not sort, so a page for a plan that
  drops out stays committed, frozen: 118 pages / 324,028 readers at last
  measure, **and any number written here is stale by the next refresh.**
  Raising `TOP_N` regenerates them and creates more; deleting them removes live
  URLs.
- **The HELD fee ship, 2026-11-05** — 33 rows where a mistyped employer-stock
  type cell lets a pattern fee through: 9 rows / 71,457 readers / $3.21B have
  the evidence the standing decision requires and 24 do not. Both candidate
  witnesses were REFUTED (one as circular by construction). It needs the four
  Bristol-Myers / Duke filings READ and an enumerated, filing-verified set —
  not a predicate.

#### Closed, shipped and refuted — `docs/closed-classes.md`

**Everything that shipped, every delivered registration and every REFUTED route
moved there on 2026-11-05, verbatim and in full** (5,603 lines, 92 `SHIPPED`
and 76 `REFUTED`/`CLOSED` markers). It had grown inside this section until 98
closed entries sat under a heading called "Open", and every cycle paid to
re-read them. ***Before sizing any class, `grep docs/closed-classes.md` for its
motivating string*** — this project's own rule, and the file exists to make it
cheap. Per-defect history is in `docs/accuracy-log.md`.

### Method rules, each earned and each already paid for once

These outlived the versions that produced them. **Each line is the RULE; the
case that earned it is in `docs/accuracy-log.md` and `docs/closed-classes.md`**,
and this section was condensed from 1,122 lines on 2026-11-05 for the same
reason the queue was — it is re-read at the start of every turn.

#### Sizing a class

- **A count of a condition is not a measure of a defect.** The siblings, each
  paid for: *a count keyed on a VOCABULARY measures the vocabulary*; *a count
  keyed on a CHARACTER measures the character*; *a count keyed on a FIELD
  measures the field*; *a count keyed on a character SHAPE measures the shape*;
  *a count keyed on PLANS is blind to every master-trust row* — resolve a trust
  row through its MEMBER plans, met **nine** times; *a STORED field is not a
  PUBLISHED one*; and *a FRAGMENT OF A LONGER WORD IS NOT THEREBY A FRAGMENT*
  (`Trust`, `Inst`, `Advisor`, `Service`, `Retirement` are each a complete
  terminal token in a fund name AND a proper prefix of an entity word — a
  prefix test read 32.5M readers for a class of about one, with all five pinned
  controls passing).
- **A clean zero, a round number, or an implausibly large one reports on the
  QUERY.** So does a both-sided zero across a whole population.
- **A measurement of what a page PUBLISHES must apply every condition the page
  applies, in order** — the publish gate, the SERVING condition (a trust's menu
  is served only where the plan's own lineup is unusable), the suppressor chain,
  and **the ROW LIMIT** (`build-seo-pages` prints `slice(0, 12)`). Missed four
  times; it cost a headline figure 2.7x once.
- **And the inverse: a prediction of what a METRIC will report must apply
  exactly the conditions the METRIC applies, no more.** `tkExact` samples
  `ackHash(ack) % 20` over confident entries and applies NEITHER gate, so a
  registration built from published+served rows under-predicts it. The
  denominator is printed on the trail as `tkSampled`.
- **Size the class before reading the filing.** The script is usually ten lines
  and either justifies the deep dive or cancels it. Put an EXACT pre-filter
  INSIDE the condition list, between a cheap condition and an expensive one.
- **RANK to pick what to READ; draw RANDOMLY to estimate a RATE.** Top-N samples
  over-predicted two fix yields by 25x and 12x. Large plans file long
  attachments and are systematically different from a bucket's bulk.
- **A re-size is a NEW MEASUREMENT, not a delta against a remembered one**, and
  a queued class records what was true when it was written. **Five queue entries
  were found already closed by re-reading them rather than working them.** So
  before building an instrument, grep the TRACKED tree for one — a duplicate
  under the same basename in a gitignored directory outranks the canonical file
  in every relative import.
- **A reader floor of 500,000 applies to new work.** Exceptions: a WRONG
  published claim at any size, and a one-line change.

#### Instruments and harnesses

- **Measure through the function the page calls, WITH THE ARGUMENT THE PAGE
  PASSES.** Met at least six times. Two specific values: `renderRow`'s `tab`
  must be **`"menu"`** (`app.js` gates the whole ticker/fee resolver on it, and
  `"all"` makes every row read `—`), and **the page cleans UPSTREAM of the
  slice** — `cleanCostMarkers` sets `f.name = cleanFiledName(f.nameRaw)` and
  then DROPS any row matching `ID_ONLY`, so a name change can change ROW
  MEMBERSHIP. `lookupTicker` is asked `fundTickerInfo(iss + name, type)` FIRST:
  the issuer is part of the argument, and omitting it under-counted a class by
  110 rows **in the direction that makes a change look safer**.
- **There are TWO resolvers and TWO display paths** (`app.js`; the crawlable
  pages via `build-seo-pages.mjs`). A hypothesis refuted through one is UNTESTED
  through the other, a fixture is only as good as the one its harness asks, and
  a claim about readers must name which surface.
- **PRINT EVERY FIELD OF THE ANSWER THE PAGE ACTS ON, and every field of the
  ARGUMENT THE RESOLVER READS.** `star` (the comparable asterisk) is a whole
  category of claim — dropping it nearly published "wrong symbol on $940M"
  about a row the page hedges. Dropping the ISSUER column made a correct page
  look wrong. *An omitted ANSWER field makes a hedged page look confident; an
  omitted INPUT field makes a correct page look wrong.*
- **HOLD FIXED EVERY INPUT THE CHANGE DOES NOT MOVE.** A `cleanFiledName` change
  moves `f.name` and never `f.nameRaw`, and `sec-tickers.js` is keyed on
  `nameRaw`; varying both invented 3 ticker losses that cannot happen.
- **Ask whether the harness can OBSERVE the change at all, before running it.**
  `renderRow` is the instrument for the cells it RETURNS and for nothing the
  template does with them. *A no-difference is a finding only once the
  instrument has been shown able to see the difference* — one comparison harness
  printed no features at all, so a feature-only version read as "nothing
  changed".
- **A before/after harness that cannot express a LOSS has not measured one**, and
  a harness is only as honest as its "before": pin every input it reads and test
  the pin by pointing it at a missing path and requiring a THROW. A `{app:}` for
  `{appjs:}` typo made both renderers read the working tree and print a perfect
  zero — *a before that is silently the after reads as a clean no-difference* —
  and the control must ask the RENDERERS, not compare the two files.
- **A standalone merge is NOT its own baseline — use a DIFFERENTIAL RUN.** Merge
  twice from one committed baseline, varying ONE line, so whatever the harness
  does differently cancels. It also supplies the disjointness control for free.
- **NARROW a measurement by a property of the change, and DISCHARGE the
  narrowing.** The narrowing must gate the RENDER, not only the comparison (my
  first version did ~50x the necessary work). **A narrowing must superset what
  the change can touch BY CONSTRUCTION — sampling cannot establish a superset**
  (one discharge test FAILED on one run and PASSED on the next, because the
  reservoir is random).
- **SLICE a shipped predicate or construction; never reproduce it from memory.**
  A hand-rebuilt candidate loop gave the OPPOSITE attribution. Slice a predicate
  WHOLE when it closes over its file's constants, and **put its own controls
  ABOVE the loop that uses it** — that is what made a broken slice cost one
  minute rather than twenty-five.
- **A synthetic row under-states any arm keyed on the row's own fields.** Carry
  the row out of the store; when a probe and a draw disagree, the draw is the
  measurement.
- **The draw must draw from PUBLISHED menus** — `confident` AND served — and its
  ratio denominator must be the SUM over member plans, not the lead plan's
  assets. Both defects lived in the draw script itself.
- **Do not re-derive a verdict you have already measured properly**, and do not
  reimplement a shipped lookup to check it: one re-implementation published 65%
  false findings into a watched metric.

#### Guards, fixtures and conditions

- **A control that cannot fail is decorative.** Write a negative control PER
  CONDITION, in full rather than by surgery on the shipped source, and assert it
  fails BY NAME on exactly its own cases. **A case protected by TWO conditions
  cannot fail for either, so it proves neither** — give every condition a case
  where it is the ONLY protection, and find it by measuring each condition's
  population separately.
- **Check that each ARM reaches the DATA, not only that each pin reaches an arm.**
  *An arm real in principle and inert on the data is untested machinery.* **But
  a BROKEN arm and an INERT arm read the same zero** — pin a positive fixture
  FROM THE DATA before believing any zero, so an empty result is a failing test
  rather than a finding.
- **SUFFICIENCY IS NOT NECESSITY.** Run both: alone (is it inert?) and
  leave-one-out (is it load-bearing?). A token sufficient for 0 rows was
  necessary for 3. **And a conjunction's conditions cannot be priced one at a
  time when two of them block the same population** — two mutually redundant
  guards each read "necessary for 0", and deleting both cost 6 correct rows.
- **A condition UNREACHABLE BY CONSTRUCTION is worse than an inert one: it reads
  as a guard and is dead code.** Met four times. Assert the unreachability over
  the population instead.
- **In a loop of arms, necessity is a question about the OUTPUT STRING, not about
  whether the function fired** — an arm "necessary for 0" was load-bearing for
  2,009,873 readers, and two arms read 0 alone because they can only fire after
  another arm has run.
- **DERIVE A MUTATION SET FROM THE REFUSALS, NOT FROM IMAGINATION, and anchor
  each mutation on the line it is meant to mutate.** `String.replace` takes the
  FIRST occurrence, so a mutation whose token also appears in a trigger mangles
  the trigger and reads as "not load-bearing".
- **Pick a negative control that is INDEPENDENTLY known correct, never one the
  test already spares**, and require it to hold on EVERY copy of its name.
- **PIN THE MOTIVATING CASE AS A FIXTURE BEFORE MEASURING THE CLASS, by ACK, and
  make it THROW on a miss.** A pin keyed on a shared STRING does not identify a
  ROW. A guessed SHAPE fails as a clean zero where a guessed field NAME throws,
  and *a count that omits its own motivating case looks exactly like a count that
  includes it.* **Pin the expected COUNT, not merely presence.**
- **A SCREEN KEYED ON THE PAGE'S OWN VERDICT CANNOT SEE A DEFECT THAT CONSISTS
  OF THAT VERDICT BEING WRONG** — re-keying one structurally made a class 85x
  larger.
- **When a class is a semantic judgment, do not screen for the ABSENCE of the
  good case; require the PRESENCE of the bad one.** Five screens for "this
  sentence is not about vesting" were each refuted by reading their own members
  (3.9M → 2). Every syntactic proxy for an absence leaks.
- **Measure a guard's blocking population over the LIVE DATA, not over the
  examples that come to mind.** A hand-built control table tests the cases its
  author already imagined.
- **A guard that does not fire is a PREMISE to check, not a failure to report** —
  read the guard's condition, not the rule's summary of it, and the check is a
  diff rather than a reading of the comment.
- **GREP THE FIXTURES FOR THE MOTIVATING STRING before acting on a queued
  prescription.** *A pin is newer evidence than the entry that contradicts it* —
  somebody already considered that exact string and decided against it. For a
  predicate, grep its must-NOT-fire list before proposing any widening.
- **A guard's claim must be keyed on a witness that can see the class of change
  it describes.** A staleness note comparing `PARSER_VERSION` to the store's
  dominant `pv` is blind to merge-side code, where the equality holds by
  construction. *And a check wrong on the normal path is worse than no check.*
- **A red gate early in a job is not one failure, it is a job that stopped** —
  every later step is unverified rather than passing. **And a gate the file it
  guards cannot trigger is indistinguishable from no gate: the workflow's
  `paths` filter is a second place that can make one.**

#### Repairs, names and claims

- **A fix for one phrasing of a class is not a fix for the class** — and the
  class also has a POSITION, a COLUMN, a SHARE CLASS, a FORM, a DECIMAL POINT, a
  HYPHEN, a SPACE and an INTERVENING WORD. Recorded **eleven** times, twice
  inside the same function.
- **One of two spellings of a caption family is worse than neither.**
- **A row that names NOTHING and a row whose name we CUT IN HALF are two
  classes, and one label cannot serve both.** *"The filing names no specific
  fund"* is a FALSE claim about the second; the recorded position for a
  truncation is RECONSTRUCTION, never suppression. A third class joins them: a
  row that names the WRONG fund.
- **A witness that a row is DAMAGED is not a witness to WHICH SIDE the damage is
  on.** Two independent detectors each shipped net-harmful arms because each was
  right for one orientation of a population holding three. **And a witness drawn
  from the SAME damaged region is not independent of the damage** — in a shifted
  menu the tail appears bare elsewhere BECAUSE the shift left it bare.
- **A resolver answer is not evidence the string is a NAME, and a resolver GAIN
  is evidence the string reaches a fund, not evidence it reaches THIS fund.** A
  token-set matcher is ORDER-BLIND, so `X mid X` strips to the same multiset
  either way; and a stripped SHARE-CLASS token resolves to a cheaper sibling
  fund, laundering a wrong-class error as a coverage gain.
- **A floor of ONE lets a single damaged row license the same damage elsewhere**,
  a floor of THREE lets five damaged rows do it, and **a MAJORITY of same-menu
  siblings can be the damaged spelling.** Prefer a RATIO between two whole names
  plus a witness from OUTSIDE this store.
- **AN ATTESTED LONGER STRING IS NOT THEREBY A FULLER NAME** — a column whose
  damage mode is WELDING cannot witness its own completions.
- **A TOKEN ADDED TO A CLOSED WHOLE-STRING VOCABULARY MULTIPLIES WITH EVERY
  TOKEN ALREADY IN IT.** Five candidate tokens each measured necessary and one
  composed with a long-present token into an insurance HOUSE's name. Prefer a
  DEDICATED DISJUNCT whose blast radius is the phrase — **and the escape clause
  is part of the rule: a widening is licensed when every newly reached name has
  been READ.** Quoting the headline to justify refusing skips the test.
- **A WORD CAN BE A SHARE CLASS, NOT JUST AN ABBREVIATION.** `A`, `IN`, `AS`,
  `IS`, `IP` — and `fee`, `administrative`. Print the top distinct names BY ROW
  COUNT; `Fee Class R1` ×105 announces itself in one line.
- **A character class written for a concept picks up everything that shares its
  shape.** `[^\sA-Za-z0-9]` for "debris" includes every accented letter;
  `[a-z]\.\s+[A-Z]` for a sentence boundary matches `Inc. Fed`. Both reached one
  row, so no count would have flagged either.
- **A STATED CLASS WORD IS NOT EVIDENCE OF A REGISTERED SHARE CLASS UNTIL THE
  VEHICLE IS SETTLED** — a collective trust names its UNIT classes the way a
  fund names share classes. **And a symbol can be right for the FUND and wrong
  for the VEHICLE, where no count can see the difference**: only a seeded draw
  printing each row's filed TYPE finds it.
- **A REGISTRY COLUMN IS NOT UNIFORM — assert what is in it, not what it is
  called.** `sec-funds.json`'s class field holds the SERIES name for several
  registrants. **And a screen that finds its own conclusion in every member it
  reads has not been shown the members that would refute it.**
- **A rename, a ticker, a fee and a return are FACTS that must be SOURCED, never
  inferred** — `data/fund-facts.json` via the `fund-facts` agent, with a source
  URL and an as-of date.
- **A legibility fix must be priced against the guards that READ names**, and
  **a name strip must be priced through the TYPE and FEE columns**: a caption
  that looks like furniture can be the page's only witness for a claim the page
  makes about the row (one strip newly published a fabricated 0.35 on 55 rows
  and a false `Mutual fund` on 25, with ticker, asterisk and row membership all
  reading 0).
- **A GUARD THAT BLOCKS A WRONG ANSWER MUST NOT DISCARD THE HONEST EVIDENCE** —
  six instances, one by DISPLACEMENT rather than omission. When adding a guard
  to a loop with a quote fallback, ask what the SIBLING guards do with the
  quote.
- **A guard that withdraws a TRUE answer because it is INCOMPLETE makes the page
  less honest, not more.** And *a guard and the claim it licenses are one
  change*: widening a trigger without rewriting the sentence publishes a false
  claim on every newly reached plan.
- **A guard that withdraws an assertion can also PROMOTE one**, and a guard
  whose job is to withhold a false assertion can cost a TRUE one. Read GAINS as
  carefully as losses.
- **A FLAG THAT ENCODES TWO CLAIMS CANNOT BE CORRECTED FOR ONE OF THEM** —
  `star` answered both "is this an approximation" and "where does the fee come
  from". When splitting one, APPEND the new clause rather than substituting: *a
  simplification that merges two branches inherits the union of their
  populations.*
- **A FLAG THAT FLIPS IS NOT A CELL THAT CHANGES.** Read the chain ABOVE your
  arm — whatever already wins there is a population your change cannot claim
  (3.1x once). **And ask whether the page ever calls the function on that row at
  all**: `renderRow` gates `lookupTicker` on five row predicates.
- **A formatter's FLOOR is a published claim** — `money()` printed every amount
  under $500 as "$0K" on 16,497 holding rows / 8.1M readers.
- **An ERROR CODE is a published claim. So is a check.** One code carried two
  meanings and told readers a filing had been withdrawn when the failure was
  ours. **Re-probe rather than inherit a label: a claim that was false once is
  not thereby false forever** (four whole-population HEAD probes, 68/68, 78/78,
  23/23, 20/20 → 403).
- **A predicate written to judge a WHOLE STRING is not a predicate about its
  PREFIXES**, and a predicate right for one class is not right for its
  neighbour. Read its own fixtures before reusing it on a substring.
- **A generator gated on "the page has nothing" cannot CORRECT the page.**
  Additive-by-construction is a safety claim and a blindness claim at once.
- **A composed gate's arms are not all in the file you are editing — and one of
  them is the PARSER's** (`isGenericTypeName` lives in `lib-4i.mjs` and is
  reached through the call site's composed callback). Reach for the differential
  BEFORE the predicate screen. **And ask whether your arm is the REASON, not
  whether it fires**: key the screen on `mine(x) && !everythingBefore(x)`.
- **WHERE a predicate is composed decides what protects it** — injected into
  `isNamelessFundRow`, seven employer-stock rows are spared by its early
  returns; as a parallel disjunct they are not.

#### Shipping, verifying and reading the page

- **THE PAGE IS THE ARTIFACT.** A store-side proxy for what changed is not the
  page; regenerate and diff the files. **A DIFF CANNOT TELL A WANTED CHANGE FROM
  AN UNWANTED ONE — only reading the output can** (eight pins, four
  load-bearing controls, a clean whole-store diff and a green CI all passed a
  wrong fund name). *And the row that did NOT change is evidence about the rows
  that did.*
- **After any store-side count of published rows, pick one plan from it that has
  a crawlable page and GREP the regenerated page for the string.** A hit
  confirms the count's premise; a miss means a condition is missing. Re-reading
  the rule did not catch it; the grep did.
- **A LINE-ORIENTED DIFF CANNOT COUNT ROWS IN A ONE-LINE TABLE.** A page's whole
  fund table is one line, so grepping the `+` side counts every label already
  there. Use a per-page SET DIFFERENCE — and note the artifact runs in the
  direction of OVER-claiming.
- **VERIFY A HEADLINE DOLLAR FIGURE AGAINST THE FILING, not only against the
  page.** *A measurement can be right about the PAGE and wrong about the
  FILING*: a correctly-measured $961,793,000 was our own parser's, the filing
  reading `$ 4` in a schedule marked `($ In Thousands)`.
- **AND A CHECK BUILT ON A SUM CANNOT SEE A MIS-PAIRING** — every dollar is
  present, only the pairing moved, so the ratio reads 1.03 and no coverage key
  can move. The witness is ABSENCE, not arithmetic.
- **A ratio is only as meaningful as its denominator**, and the denominator may
  answer a different question than the reader's: a trust's menu judged against
  the TRUST passes every gate while covering 1.4% of a plan.
- **PRE-REGISTER a run's figures before dispatch** — a ceiling plus a NAMED SET
  — and derive them by running the metric itself. A row delta is additive; a
  PLAN count SATURATES. **A pre-registration measured over a STORED DERIVED FIELD
  under-predicts whenever the change alters what that field holds** (345
  delivered against 122 registered as a ceiling), and **a projection measured
  with a MORE GENEROUS instrument than production OVER-states** (3.6x). Ask
  which fields the harness reads are inputs and which the change rewrites.
- **A SAFETY ARGUMENT BELONGS TO A MECHANISM, NOT TO A FILE.** Reusing one
  verbatim on a change in the same function mispredicted by 15x, because the new
  arm fired on a different disjunct. Name the disjunct. **And adding a WRITER to
  a first-wins chain RE-ORDERS it** — a diff counting only "was empty, now set"
  is blind to the changed-quote population.
- **A queued prescription names a STAGE as well as a fix, and the stage can be
  wrong where the symptom is right** (four instances; one prescription was
  impossible, one aimed at a stage the candidates never reach, one net harmful).
  *The witness names the data it needs and the data says which stage can ask* —
  a browser holds one plan's shard, so an attestation map belongs at merge.
- **A one-column claim is a MEASUREMENT, not a property of the file edited.**
- **Verify STARTS, not just finishes** — after any push meant to trigger a run,
  confirm within a minute that the run exists. **Then wait ≥2 minutes and
  re-read: if a `push` run has appeared, do NOT dispatch**, because a
  `workflow_dispatch` on the same SHA is a second run that concurrency resolves
  by killing the first, and *cancelling the duplicate does not revive the
  original*. **And VERIFY THE CONCLUSION, not just that a run exists** —
  site-test was RED for ten consecutive runs while commit messages said "tests
  green" (true locally).
- **ATTRIBUTE a moved coverage figure by the PRODUCING RUN's `head_sha`**, and
  attribute a trail line by the COMMIT that introduced it
  (`git log -- docs/coverage-history.jsonl`), never by its position in the file.
  *A diff of the wrong two lines reads exactly like a diff of the right two.*
- **"MAIN IS AHEAD" IS A QUESTION ABOUT THE DATA, NOT ABOUT THE TIMING.** Run
  the structural diff — the trail's unique-line count is the ten-second version.
  *Timing is not evidence in either direction.* Two cases: the stores are the
  SAME DATA TWICE (adopt one side and converge — `git reset --hard origin/main`
  plus force-with-lease on the DEV branch, lossless and spending no force-push
  on main), or main holds FRESH FILINGS (rebase them in, or the mirror discards
  them). A textual diff cannot tell them apart because every store is one line,
  and `mirror-gate`'s +0/−0 is lineup-keyed and blind to the other seven files.
- **While an agent holds the working tree, read through `git show <ref>:` and
  never the path**, and after a fetch read `origin/<branch>`, not the local ref.
- **A version label on a derived summary is not the version in the data** — read
  the per-ack `pv`, and when a summary and a store disagree, the store is the
  artifact.
- **Re-derive the cache-buster AFTER the `sec-tickers.js` regen, never before**
  — the regen rewrites a stamped line, so the order for a ship that moves the
  fingerprinted slice is: edit, regenerate the twin, regen the table, stamp,
  re-run the smoke test.
- **The `sec-tickers.js` regeneration is a WORKFLOW DISPATCH, not a foreground
  thirty minutes.** Dispatch `sec-tickers.yml` the moment
  `sec-tickers-stamp-test` goes red and carry on; running it in-session cost 15+
  polling turns of the one genuinely scarce resource.

#### Code, tooling and the container

- **`node --check` CANNOT SEE A MODULE/SCRIPT MISMATCH, and app.js is a classic
  script.** An `export` left inside its IIFE parses as a module and loads NO
  app.js in any browser — the whole site, not one feature. *A named rewrite is a
  rewrite for the exports you remembered.* Only `smoke-test` catches it.
- **A regex assembled from string fragments has no syntax check until it runs**,
  and **a quantifier that is merely WRONG has no check at all** (`SEP + "?"`
  makes the class's own `+` lazy and REQUIRES a separator). **A short
  alternation branch costs a repair** — alternation is FIRST-match, not
  longest-match. **And a greedy quantifier is how a repair licenses a wrong
  claim**: prefer the narrowest run the mechanism allows.
- **Write scripts to a FILE, never inline in `node -e` or a heredoc** — backticks
  and parens trigger shell command substitution. **A Python heredoc needs a RAW
  string**, or every `\b` becomes a backspace and the arm silently matches
  nothing. **`String.replace` with a string replacement treats `` $` `` as
  "text before the match"** — pass a replacer FUNCTION.
- **Read the data stores through `scripts/lib-schema.mjs`** — a guessed field
  name throws and names the real fields. **But it validates FIELDS, not the
  SHAPE of its own return**: `Object.values(loadStatus())` reported "3 status
  entries, 100% at pv 0" with a confident wrong verdict attached.
- **A generator that edits a block in place DELETES anything a later hand-edit
  puts inside its boundaries** (four browser twins lost to three regenerations;
  once it silently un-published 2.5M readers' worth of suppression). A twin is
  SLICED VERBATIM, never typed. **And a tether per predicate is not a tether on
  the EXPRESSION they are composed into** — `smoke-test` cross-checks the
  composed gate. **A slicer that can only INSERT forces the hand-edit it exists
  to prevent**: replace in place, stay TRACKED, carry a `--check`.
- **A fixture loop belongs BELOW the function it tests when that function is
  sliced into app.js** — above the slice boundary it ships to the browser, where
  a throw stops the page loading.
- **A BUDGET ENFORCED AT THE TOP OF A LOOP IS NOT A BOUND ON THE BODY.** Ten
  binary-spawn sites with no `timeout` let one shard run 3h14m. **And a
  CANCELLED step reaches no branch gated on exit status** — use a `trap`, so the
  log tail lands on success, failure, timeout and cancellation alike.
- **A SUPPRESSED COMMAND IS AN UNINSTRUMENTED COMMAND.** `|| true` with both
  streams discarded on an `apt-get install` let `pdftotext` be absent on twenty
  shards: 68,865 filings read as nothing at a reported 99.7% coverage. **When
  adding an error branch to a loop that reports a tally, ask what the SIBLING
  branches do with the tally**, and derive the failure-shape list from the `e`
  codes present in the store rather than from memory.
- **A process-name wait predicate must EXCLUDE THE WAITER** (`[g]en-…`), and
  **liveness is not PROGRESS** — `pgrep -f` also matches the Bash tool's wrapper
  shell, which read 0 CPU seconds on a healthy 15-minute job. Get the real
  child's PID.
- **This container gives a background process CPU only while a turn is active**,
  and **Node stdout to a file is fully buffered**, so a long measurement that
  prints nothing may be working. Never `sleep`-poll a running Actions job.
- **A JOB LOG IS READABLE — through `mcp__github__get_job_logs` with
  `return_content: true`, not through `gh api`**, which refuses the blob
  redirect. *When one client cannot fetch something, ask whether another client
  in the same session can before recording the environment as unable.*
- **Never hardcode the sandbox path in anything CI runs** — it reports as
  `spawn python3 ENOENT`, indistinguishable from a missing binary. When a spawn
  reports ENOENT, suspect the cwd before the binary.
- **A token keyed on a NAME matches every name it is a prefix of** — a control
  reported "the base ref already carries the arm" because the new flag's name
  was a prefix of a long-shipped one.
- **DIAGNOSE a refusal before reporting it:** call the most harmless tool on the
  same server. *A blocked tool is not a blocked goal* — enumerate the other
  mechanisms that reach the same outcome before reporting it impossible.
- **A DIAGNOSIS THAT CANNOT BE REPRODUCED IS NOT A DIAGNOSIS.** What solved the
  hardest bug on this record was not a better theory but making the program SAY
  what happened — the answer came in the first eight lines of the next run,
  naming the function and the line. *Testing the parts is not testing the path.*
- **Before adding a SOURCE, ask what the pipeline already reads and throws
  away.** Four instances; in each the download, the parse and the memory were
  already paid for.
- **The form's own printed questions are in the filing text** — a composite
  EFAST2 PDF carries the blank Form 5500 pages, and line 6g(2) contains a vest
  word and a percentage, so a text-level screen must exclude the form before
  counting. *A clean 100% reports on the query.*
- **A truncated print can turn a complete answer into a defect** — print the
  full text of any member whose truncation hints at the condition being
  screened, and make a truncating helper append an explicit `…+N`.
- **A service test keyed on a correctly spelled unit is defeated by the filings'
  own typos** (`six (6) yeas`) — a general hazard for every word-anchored screen
  over this corpus.

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
