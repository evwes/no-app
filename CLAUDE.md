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
- **WHAT THIS SANDBOX CAN REACH IS A MEASUREMENT, AND THE ALLOWLIST IS
  EDITABLE (2026-11-12).** The egress proxy enforces the environment's host
  allowlist, and the two failure shapes are DIFFERENT and must not be
  conflated: `CONNECT tunnel failed, response 403` is **the proxy refusing**
  (the host is not allowed), while an HTTP status with real bytes means the
  tunnel worked and the answer came from the SITE. `getaddrinfo ENOTFOUND` is
  a third thing — a client resolving DNS outside the proxy — and reads like a
  dead host when the host is fine. **A FOURTH SHAPE, measured 2026-11-14:
  `CONNECT tunnel established, response 200` then `Recv failure: Connection
  reset by peer` is THE SITE REJECTING THIS CLIENT**, after the proxy allowed
  it — `prd-ams.ssga.com` does exactly this, so adding it to the allowlist
  changed the shape and not the outcome. *Allowing a host proves the proxy will
  carry you, never that the host will answer.* Probe with
  `curl -sS -o /dev/null -L -w "http=%{http_code} bytes=%{size_download}"`,
  never a bare grep: *a clean zero reports on the query.*
  Measured today: `*.gov` is allowed by wildcard (so `askebsa.dol.gov` 200 and
  `www.sec.gov` tunnels), `efast2-filings-public.s3.amazonaws.com` is allowed,
  and `api.github.com` answers without being on the list. **`www.sec.gov`
  tunnels but returns `Request Rate Threshold Exceeded` from a SHARED egress
  IP** — a rate limit no User-Agent fixes, so SEC is not a dependable source
  here. Seven fund-issuer hosts were ADDED to the Default environment this day
  (Vanguard, Capital Group, PIMCO, Lord Abbett, Baird, Nuveen, Franklin
  Templeton) and all verified 200, which is what unblocked fund-facts
  sourcing. **`update_environment` is additive and needs the owner's approval;
  prefer it to `create_environment` here, because a new environment cannot
  carry a WILDCARD — `*.gov` and the S3 bucket would be silently dropped and
  the parser's own PDF source with them.** *A blocked host is not a blocked
  goal, but neither is it a fact about the site: diagnose which of the three
  shapes you have before reporting any of them.*
- **SOURCING A FUND FACT: THE ROUTE, AND WHAT IT IS NOT (2026-11-13).** The
  issuer's own site is preferred and is the ONLY place a real PROSPECTUS date
  for an expense ratio comes from — `investor.vanguard.com/vmf/api/<T>/profile`
  returns `expenseRatio` with its own `expenseRatioAsOfDate`, and
  `/vmf/api/<T>/performance` carries a dedicated **`/YTD` block** whose
  `regular` is the DAILY figure. ***Do not take `calendarYTDPct`***: it is the
  month-end series under a different field name, and a screen keyed on it
  reports a correct figure MISSING (it nearly had me call a right answer
  wrong). **Fidelity cannot be read at all** — its fund pages are JS-only
  shells with no data endpoint, and headless Chromium gets
  `net::ERR_EMPTY_RESPONSE` on that host while curl gets 200; passing the proxy
  to Chromium explicitly makes it WORSE, breaking hosts that work, so Chromium
  already routes fine. **`www.schwab.wallst.com/schwab/Prospect/research/
  mutualfunds/summary.asp?symbol=<T>` serves ANY mutual-fund ticker as static
  HTML** and was already the cited source for the FXAIX entry. Its page carries
  **TWO YTD figures** — the header one is an older month-end number, the DETAIL
  block states its own date beside the value. Use the NET expense ratio.
  *Treating this as Fidelity-only is what kept 4,754 tickers / 304M
  reader-slots looking unreachable for half a day.*
  **AND THE SENTENCE THAT USED TO END THIS ENTRY WAS FALSE, which is worse than
  absent because it was quoted into an agent's brief and obeyed.** It read: "it
  does **not** date its expense ratio at all, so an `erAsOf` taken from it is
  the QUOTE date." The page DOES date it. The header strip reads
  `$41.78 -0.74 (-1.74%) 0.91% 17.91% Quote data as of close 11/13/2026
  As of 10/31/2026 Prospectus` — "Quote data as of close" dates the PRICE and
  the CHANGE, and a SEPARATE **"As of … Prospectus"** dates the expense ratio
  *and the header YTD*, both month-end. So the correct `erAsOf` is the
  prospectus date, and the header YTD must never be published: it is a
  month-end figure, and dating it with the quote date is how the first
  unattended refresh wrote **91 month-end returns wearing same-day receipts**
  (VCSTX stored at 17.91% "as of 2026-11-13" where the page says 12.09% for
  that very date). Measured across six saved pages, the two YTDs differ on ALL
  SIX and in BOTH directions, so no plausibility bound could catch it.
  `data/fixtures/schwab-pages.json` pins four of those pages verbatim and
  `fund-facts-extract-test` fails by name against the old extractor.
- **A COLLECTIVE TRUST'S OWN PRICE IS PUBLISHED BY SOME ISSUERS AND NOT OTHERS,
  AND THAT IS A MEASUREMENT PER ISSUER (2026-11-14).** The `vehicles` mechanism
  shipped this day: `vehicleKeyFor` in `fund-er.js` maps a filed name to a
  `provider::fund` key, `gen-fund-facts-asset.mjs` emits only entries whose
  `erBasis` is **`class-published`** with a fee inside two years, and `app.js`
  prints that figure with a tooltip naming the unit class while the ticker keeps
  its comparable asterisk.
  **AND A BAND WHERE THE FILING NAMES THE TRUST AND NOT THE CLASS (2026-11-17),
  which is a different mechanism and must not be confused with the above.**
  `vehicleFamilyKeyFor` answers a FAMILY, `gen-fund-facts-asset.mjs` emits
  `FUND_VEHICLE_BANDS` (41 families) from the already-published class entries,
  and the cell prints a RANGE whose tooltip NAMES the classes it covers —
  because a range over the sourced classes does not bound the family. 3,503
  rows / 3.63M readers. Its three refusals are each a measured population: the
  trust word belonging to the CUSTODIAN (`Empower Trust Company, LLC …`, 156
  rows — the phrase is stripped before the question is asked, not refused,
  since a row may name trustee AND vehicle); a stated class, because an exact
  figure outranks a range; and a name whose vehicle word is **Fund** or absent
  (20,718 rows / **9.08M readers**, STILL BLANK and the largest open vehicle
  question — `…2050 Fund` is VFIFX's exact registered name on a row typed
  collective trust, and nothing says which cell is wrong). The HELD Hybrid line
  is refused in the GENERATOR as well as the resolver, and `vehicle-key-test`
  asserts no Hybrid band exists.
  Extending it to a family is TWO jobs — source the
  per-class figures, then add the family to the resolver — and **the first can
  fail honestly.** Measured: **Vanguard publishes per class and shipped**
  (7,527 rows / 7.54M readers); **State Street does NOT** — ssga.com carries its
  registered mutual funds (SSDEX) but no readable page for the Non-Lending
  Series trusts, whose per-class sheets sit on Lincoln and Voya, and its own
  document host resets the connection. *Putting the registered fund's fee on the
  trust rows would launder one vehicle's price onto another*, so those 3.0M
  readers stay blank. **Do not reopen State Street without a new source.**
  **T. ROWE PRICE PUBLISHES and shipped** (440 vehicles, 1,258 rows / 578K
  readers): its quarterly fact sheets state a Trustee Fee per named class,
  footnoted *on the sheet itself* as "equivalent to the annual operating
  expense ratio", and its CIT brochure agrees on all 247 fact-sheet classes
  with 0 mismatches. **BLACKROCK DOES NOT** — blackrock.com carries only the
  LifePath MUTUAL funds (LIKKX, LIKIX, LIKAX, LIKPX, LIRKX, none yet sourced),
  and the per-class trust sheets sit on opers.org and ecap.voya.com, both
  proxy-refused.
  **SO ACROSS FOUR FAMILIES IT IS 2 AND 2, AND THE TWO FAILURES FAIL THE SAME
  WAY:** the index-CIT houses do not publish per-class fees on their own sites;
  those sheets circulate through RECORDKEEPERS. That is ONE owner question, not
  one per family — *is a plan-provider-hosted copy of the issuer's sheet an
  acceptable source, and is one plan's stated figure the price a different plan
  pays?* Until it is answered, **never put a LifePath or SSGA MUTUAL FUND's fee
  on a trust row**: that is the laundering both runs correctly refused.
  **THE OWNER ANSWERED YES AND THE ROUTE IS CLOSED ANYWAY, BY THE SITES — 
  measured 2026-11-17, do not reopen it without a new host.** Asked whether to
  use recordkeeper-hosted sheets, the answer was yes, and `my.voya.com`,
  `voyaretirementplans.com` and `lincolnfinancial.com` were added to the Default
  environment's allowlist with the owner's approval. All three then refused:
  `my.voya.com` gives `CONNECT tunnel established, response 200` and then an
  HTTP **403 with a real 5,306-byte body** — the SITE rejecting this client, the
  fourth failure shape this file already records — while the other two never
  complete the CONNECT at all. `ssga.com` itself answers 200 and its DC page
  names no non-lending or collective-trust document, only ETF factsheets.
  *Allowing a host proves the proxy will carry you, never that the host will
  answer*, and an approved question is not an unblocked one. So SSGA's and
  BlackRock's per-class CIT fees have no reachable source from this sandbox and
  those rows stay blank; the only remaining route is the owner supplying a sheet
  directly, the way `docs/form5500-instructions-2025.txt` arrived.
  `scripts/trust-vehicle-size.mjs` ranks the ten families the owner named; it
  keys on `erShown`, never `er`, because the estimate column once made it count
  rows that already publish.
- **SOURCING IS NO LONGER THE BINDING CONSTRAINT — THE RESOLVER IS (measured
  2026-11-17, three passes in one afternoon).** 78 entries were sourced, dated,
  checker-validated and committed into the browser asset — 66 Vanguard trust
  unit classes and 12 PIMCO RealPath tickers — and they reach **0 PUBLISHED
  ROWS**, because `vehicleKeyFor` builds Vanguard keys only for year-vintage and
  Income Target Retirement classes (null for **Unit A-D, FLX, CT, Income and
  Growth**) and `fundTickerInfo` has **no PIMCO or RealPath arm at all**. So
  *extending a family is TWO jobs and the second is usually the one that moves
  readers*: ask what arm would have to exist BEFORE spending a pass on sourcing.
  Reachable once the Vanguard arm exists: 141 rows / 106 plans / 1.50M readers.
- **THREE MORE SOURCES MEASURED THIS DAY, and two are refusals to keep.**
  **PIMCO publishes NO per-class RealPath COLLECTIVE TRUST fee** — its
  1,405-URL sitemap holds 20 RealPath URLs and all 20 are `/investments/
  mutual-fund/` pages, and the DC / Retirement / Target Date pages contain zero
  occurrences of "collective". That is the State Street result again, so Steel
  Dynamics' nine RealPath CIT rows stay blank and the registered fund's fee must
  NOT stand in for them. **SEI is an ACCESS GATE, not a network failure**:
  `seic.com` answers 200 and lists ~150 trust names with zero percentage
  figures; the fact sheets sit behind a `seitrustcompany.com` login, and no
  form was filled in. **Invesco's page is a shell** fed by `dng-api.invesco.com`
  (proxy-refused at the time, host NOW ALLOWLISTED and still unread); its
  fallback page's five featured classes carry the footnote "shown with standard
  management fee; share class is gross of fees and may vary by client", which is
  not a price a plan pays. **NORTHERN TRUST PUBLISHES, AND THAT IS NOW MEASURED
  RATHER THAN HOPED (2026-11-18) — it is the THIRD publishing family against two
  refusals.** 2,686 rows / 802 plans / **7.54M readers** / $137.8B, filed as
  `NT Col S&P 500 Idx Fd DC NL 4` and similar.
  `ntam.northerntrust.com` answers 200, and its
  `/united-states/institutional/solutions/retirement/core-index-dc-funds` page
  links **44 per-class fact sheets** under `/content/dam/ntam/us/en/documents/
  funds/common-collective-funds/fact-sheet/`, named `nt-coll-<fund>-<l|nl>-tier-
  <N>.pdf` — the TIER in the filename is the unit class our filed names carry.
  Each sheet states a **`Total Fees and Expenses`** line (R1000 Value DC NL
  Tier 2: admin cap 0.0100 + management 0.0400 = **0.0500%**), which is the
  expense-ratio equivalent, exactly as T. Rowe's footnoted Trustee Fee is.
  **THREE EXTRACTION HAZARDS, EACH MEASURED ON TWO SHEETS — do not start the
  sourcing pass without them.** (1) *One of two spellings of a caption family is
  worse than neither*: the R1000 sheet says `Administrative Fee Cap (%)` and the
  bond sheet says `Operating Expense Cap %`, so a grep for the first reads **0**
  on the second and looks exactly like "this sheet publishes no fee". Key on
  `Total Fees and Expenses`, the one caption both carry, and note `(%)` vs `%`.
  (2) **The as-of date is PER SHEET and the FORMAT varies** — `AS OF 1Q25`
  against `AS OF 3Q2026`. Some linked sheets are ~20 months stale and sit right
  at the edge of the two-year publish gate, so read each sheet's own date and
  never assume the page's links are current. (3) The equity sheet's values carry
  a trailing second column (`0.0100 0`); do not glue it into `0.01000`.
  Hosts allowlisted 2026-11-17; `www.northerntrust.com` itself is a FOURTH shape
  — HTTP/2 `INTERNAL_ERROR`, then a timeout on HTTP/1.1 — but it is not needed,
  since `ntam.` serves the sheets.
  **SHIPPED 2026-11-20 — all 44 sheets sourced AND the resolver arm built, which
  is the two jobs this entry warned were two.** Measured on what the ER cell
  DISPLAYS, through both renderers over one store: **1,100 rows / 439 plans /
  2,376,913 distinct readers gain a cell** (978 a RANGE, 122 an EXACT class
  figure), 3 fees move estimate -> sourced, **0 lost and 0 symbols changed**.
  40 rows / 764,227 readers compute a band that an existing estimate PRE-EMPTS,
  because `app.js` prints a range only where the cell would otherwise be a dash;
  whether a sourced range should outrank a fabricated point estimate is the
  fee-pre-emption question and stays OWNER-GATED. The key shape is
  `northern-trust::<fund>-trust-class-<nl|l><tier>`, because
  `vehicleFamilyOfKey` parses a family only out of `-trust-class-<x>` and the
  shape first briefed would have shipped exact figures with NO BAND AT ALL.
  **AND THE 7.54M READER FIGURE ABOVE UNIONS THREE BANDS THAT NEED UNRELATED
  MACHINERY** — re-derived: exact 174,071, band 2,640,580, tier-CT-and-kin
  withheld 586,573, and 6.19M on rows naming NO fund, which is a RECONSTRUCTION
  question and not a fee one. *Do not quote one number for a family whose rows
  need three mechanisms.* Still open and measured: the tier spellings `T4`,
  `NLT4`, `CL 3` and `NL II` are not read as tiers, so those rows take the band
  instead of an exact figure.
  The estimate note that used to end this entry is **refuted as stated**:
  `fund-er.js:372` prices these at a flat 0.05 and the sourced figures run
  **0.008% to 0.19%**, disagreeing on 41 of 44 classes. A disagreement is a
  ticker question for a share class of ONE fund; it is not for a family whose
  price varies by unit class, where a flat guess simply cannot track the tier.
- **THE YTD IS REFRESHED DAILY AT 3 AM EASTERN (owner directive 2026-11-14),
  AND CITs AND TICKERS ARE TWO DIFFERENT STEPS.** `fund-facts.yml` runs
  `0 8 * * *` (03:00 ET under EST — **re-check at the 2026-03-08 transition**
  with `scripts/et-schedule.mjs --check 8 0 3 0`). The ticker path walks the
  worklist through schwab.wallst.com; `scripts/fund-vehicles-refresh.mjs` is the
  other half, because a trust has no ticker and can never be in that worklist.
  **It refreshes and never discovers** — it cannot add an entry, change a key or
  invent a source, so a cron job never decides what a fund is. It keeps what it
  has on failure and **exits 1 when it reached nothing**, because a silent no-op
  reads exactly like "nothing needed refreshing". The job regenerates
  `fund-facts.js` and re-stamps in the same run: *without that a refreshed
  figure lands in git and no reader sees it.*
- **AN EMPLOYER-STOCK TICKER IS NOT A FUND, AND A WORK LIST BUILT FROM FILED
  NAMES WILL CONTAIN THEM.** `IBM`, `WMT` and `CVS` all reached a sourcing work
  list on 2026-11-13, every one because the HOLDING's name carries a
  custodian's name — `International Business Machines Corporation - Managed by
  Independent Fiduciary - State Str`. A stock has no expense ratio and no fund
  YTD, so sourcing one publishes a category error. Exclude by hand and say so.
  *A classifier keyed on a name inside a name measures the name, not the
  vehicle.*
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
- **A FULL RE-PARSE RE-ROLLS THE OCR POPULATION, AND THE STORE KEEPS WHICHEVER
  ROLL CAME LAST (measured 2026-11-17, v206).** The rasteriser drops pages run
  to run — `Too few characters. Skipping this page`, `Error during processing.`
  — so Msk Group parsed to **32 rows at v205 and 3 rows now, on identical code
  and an identical filing.** v206 withdrew 9 plans' menus that way; `mirror-gate`
  refused on exactly those 9 while the audit's count-based tolerance called
  `confident -7` noise. *It IS noise in aggregate and it is nine named plans
  underneath.* **AND THE TRAP THAT MAKES IT PERMANENT: a filing whose DOWNLOAD
  fails keeps its stored entry and a stale `pv`, so every later run retries it;
  a filing that is fetched and parses BADLY is stamped at the CURRENT `pv` and
  is thereafter invisible to the work list.** `ONLY_ACKS_4I` is the escape
  hatch and it used to FILTER the already-pv-narrowed list rather than force
  one, so naming ten such acks printed `restricted to 0 of 10`, wrote a delta of
  0 entries and **exited 0** — a clean zero reporting on the query. It now
  selects from the unfiltered `buildWorkList()` and **exits 1 on an empty forced
  run**; it is opt-in and never set by the workflow. **A local forced re-parse
  CANNOT reproduce a FALLBACK-served plan** — `fallbacks.json` is a prep-stage
  artifact, so the log says `prior-year fallback disabled this run` and the
  parse can only reach the newest filing's summary page. Repairing a
  fallback-served ack needs a workflow dispatch, not a session. The real cure —
  an OCR parse strictly WORSE than the stored one must not overwrite it — is
  unbuilt and needs a `PARSER_VERSION` bump. `docs/accuracy-log.md` 2026-11-17.
  **AND THE NAME OF THIS ENTRY IS WRONG: IT IS NOT AN OCR PHENOMENON. MEASURED
  2026-11-21 ON v207's RUN #875.** Six acks degraded, costing 7 plans / 6,145
  readers a published menu (Hexcel 3,981, WD Management 826, St. Vincent De Paul
  566, Impact Wellness 350, Belay 271, Sorinex 151). **Two were OCR. FOUR WERE
  `ocr=0`** — plain text parses that fell 23->6, 35->2, 25->3 and 30->2 rows —
  and `trace-filing.mjs` at that same HEAD parses Belay's filing to its full
  **35 rows, ratio 0.990, CONFIDENT**. The ship cannot be the cause BY
  CONSTRUCTION: its one pipeline file deletes only the `PARSER_VERSION` line and
  its 203 added lines assign only `out.afterTax` and `out.roth`. So the re-roll
  is in **what the run READS**, it reaches the TEXT path as well as the raster
  path, and the cure must be keyed on that rather than on OCR. `dl` rose
  163 -> 214 the same run, which is the nearest available witness and not proof.
  **THE REPAIR IS A FORCED RE-PARSE AND IT WORKS IN-SESSION**: `ONLY_ACKS_4I`
  over the six restored all six to their exact prior counts (30, 35, 23, 25, 3,
  9, every one `ok=true`) and the audit's verdict inverted to `confident +6,
  vesting +1, lineups +5`, HIGH 12 -> 6. *So the loss is recoverable the moment
  it is NOTICED* — and `confident -6` sits far inside the -200 tolerance, so
  nothing but the merge's own `reparse-loss` triage would ever name it.
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

- **Never push `build-data.mjs`, `fetch-4i.mjs`, `lib-4i.mjs`,
  `lib-effective-date.mjs`, `merge-4i.mjs`, `scripts/.kick` or the workflow file
  while a run is in flight ON THE SAME
  REF** — concurrency is `group: build-data-${{ github.ref }}`, so a dev push
  cannot cancel a run on `main`, and the push trigger's path filter is exactly
  those **SEVEN** files. **This rule said SIX in three places until 2026-11-23
  and the filter has carried `scripts/lib-effective-date.mjs` since v208** — so
  a rule that ENUMERATES is wrong the moment the list it mirrors grows, and it
  fails in the dangerous direction: a push believed safe cancels a run.
  *Re-read the `paths:` block rather than this sentence.*
  `audit-data.mjs`, the tests and `lib-disclose.mjs` create no
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
- **The CI-skip directive on every commit touching one of those SEVEN files
  while a run is in flight on the same ref**, and on parser commits made
  outside the 1–7 AM window so work batches into one re-parse. *Spelled in prose
  as `skip-ci` on purpose — see the token rule below, which this very line used
  to violate by carrying the bracketed form in a file that is quoted into commit
  messages.*
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
  `scripts/build-data.mjs`, `fetch-4i.mjs`, `lib-4i.mjs`,
  `lib-effective-date.mjs`, `merge-4i.mjs`,
  `scripts/.kick` or the workflow file while a run is going **cancels it** and
  destroys hours of wall clock (SEVEN files — read the `paths:` block, not this
  list). That is the only thing worth serialising on.
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
  **`--force` BUYS TWO OVERRIDES FOR THE PRICE OF ONE, measured 2026-11-22.**
  It is documented for the git-ahead refusal ("only after confirming those
  commits carry nothing the branch lacks"), and `mirror.sh:152` also forwards it
  to `sitetest-gate.mjs` — so a session clearing a same-data-twice cron commit
  silently disables the gate that proves CI is green on the mirrored SHA. The
  working habit until the flags are split: get site-test GREEN on the exact
  head first, then pass `--force`, then **read the output for
  `sitetest-gate: ok — site-test run #N on this exact commit concluded
  success`**, which is a genuine pass; an override prints no such line. *A flag
  named for one refusal can be wired to two, and the second one is the
  verification.*
  **AND THE GATE DEMANDS A RUN ON THE *EXACT* HEAD, WHICH A COMMIT OUTSIDE
  `site-test.yml`'s `paths` FILTER CANNOT PRODUCE (measured 2026-11-22).** The
  filter rightly lists `CLAUDE.md`, the trail and the ledger — what
  `record-check` reads — and rightly omits `docs/accuracy-log.md`. So a head
  commit touching only the log creates **no run at all**, the gate finds none,
  and the only offered way past it is `--force`, which disables the very check
  the operator is trying to satisfy. *A gate that can only be satisfied by
  overriding it is not protecting anything*, met again from the other side.
  The working remedy, used today: `site-test.yml` carries `workflow_dispatch`,
  so dispatch it on the ref and read the `conclusion`. The real fix is for
  `sitetest-gate` to accept a green run on an ANCESTOR when the diff from that
  commit to the head touches nothing its tests read — unbuilt, and it is gate
  logic rather than a filter widening, because the log genuinely needs no test.
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

**THE HIGH BASELINE IS 6 — SO DERIVE IT FROM THE TRAIL'S `high` KEY AND NEVER
FROM THIS SENTENCE.** It has read 4, 7, 6, 13 and 12 inside a fortnight, and
**the 13 and the 12 each appear on EXACTLY ONE LINE** — v206's and v207's CI
merges, where `reparse-loss` findings are raised from a run artifact that exists
only in CI — each cleared by the very next scheduled run. Measured over the 25
lines before 2026-11-21: **6 on 23 of them.** So `record-check` derives this
claim from the **MODE of recent lines, not the newest one**, which it had been
doing until 2026-11-21 and which made the check a TREADMILL — two edits to this
file per re-parse, each stale within hours, and site-test red on the dev branch
every time it rebased onto a main whose data had moved. *A habitually red gate
teaches its reader to ignore it*, which is the thing this check exists to
prevent. The mode still FOLLOWS a real change, since the cron delivers every
~4.4h. The 6 standing findings are **4 `contrib` + `lineup-overshoot` + `fair-value-note`**
plus `fabricated-name`, with `audit-generic-names` sitting above its 230
escalation threshold so that HIGH is STANDING rather than absent.
***A hand-corrected number goes stale exactly as fast as the one it replaced***,
which is why `scripts/record-check.mjs` derives this one and three others from
the store on every frontend push — and why this paragraph was cut from 25 lines
to 12 after accruing four generations of corrections, each of which was itself
re-asserted on every turn until the next one.
**CI CAN REPORT MORE THAN THE LOCAL AUDIT, AND THE EXTRA ENTRIES SELF-CLEAR.**
v206 appended `high: 13` — the 6 standing plus 7 `reparse-loss` findings raised
from `losses-triage.txt`, a run artifact that exists only in CI. The very next
scheduled run took it back to 6, exactly as predicted here, which is the one
thing about this number that has proven stable. *A metric that differs between
CI and local is a question about the inputs, not the store.*

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

**v213 DELIVERED by run #897 (04:01Z–05:18Z on `724b941`, all 22 jobs SUCCESS,
`pv` 213 at 99.7% — NOT partial, so no completion run) and MIRRORED as
`b393496` — LIVE.** Every gate reported its genuine form with **no override of
any kind**: `mirror-gate: ok` (0 plans / 0 participants stop being served),
**`sitetest-gate: ok — site-test run #393 on this exact commit concluded
success`**, and `deploy-check: DEPLOYED — pages run 1329 on b3934960 concluded
success in 1.9 min`. The log-only commit at the head would have created no
site-test run (that filter deliberately omits `docs/accuracy-log.md`), so the run
was DISPATCHED on the ref rather than reaching for `--force`, which would have
disabled the very gate being satisfied. `mirror.sh` also confirmed main holds a
MATCHED pair — `PARSER_VERSION` 213 against a dominant store `pv` 213 — so no run
on main is needed. Settled against the registration:

| key | registered | DELIVERED |
|---|---|---|
| `matchQuote` (trail) | 5,645 (+689) | **5,757 (+801)** — 112 plans beyond |
| `matchQuoteShown` | 2,724 (+689) | **2,837 (+802)** |
| `match` withheld (ledger) | 13,425,274 (+1,139,384) | **13,625,520 (+1,339,630)** |
| `match` absent (**gap**) | 18,717,622 (−1,139,384) | **18,523,061 (−1,333,945)** |
| `match` published | UNCHANGED | **78,304,870 (−5,685)** — moved |
| `match_shown` | 70.90% FLAT | **70.89%** |
| ONE SCALAR | 79.95% FLAT | **79.95% — EXACT** |
| ledger `addressable` | 82,277,861 | **82,087,713** |
| `aftertax` | UNCHANGED | **4,203 — byte-identical** |
| `match` / `matchAny` / `vesting` / `roth` (trail) | UNCHANGED | **−6 / −6 / −7 / −2** |

***THE BAND WAS BLOWN BY 11x ON ITS OWN STATED MECHANISM, AND THE CAUSE IS
EXACT.*** The arm moved **1,333,945** readers absent -> withheld against a
registered 1,139,384 and a band top of ~1,157,000. The decomposition closes to
the reader: withheld rose 1,339,630 = 1,333,945 (absent -> withheld, the ARM)
+ 5,685 (published -> withheld, the RE-ROLL taking match LABELS off ~6 plans).
The 194,561-reader excess is **the UNJUDGED remainder firing**: 187 plans /
297,659 readers had no cached text, and 112 of those plans (59.9%) and ~65% of
their readers fired, at 1,737 readers per plan against the judged population's
1,653 — within 5%, so they are the same kind of plan, not a few giants.
**The band's top end was built by applying the JUDGED fire rate to the unjudged
set (~+17,000), when the right ceiling was the unjudged set's WHOLE size**
(1,139,384 + 297,659 = 1,437,043, which delivery sits inside). *A band's top end
is the whole unjudged population whenever the unjudged set is systematically
different from the judged one* — and here it was: uncached correlates with "not
in the census corpus", not with "unreachable". The tight top end was justified
in writing as "all 403/withdrawn, which production cannot download either", and
**that premise is refuted in this same wake by the Corning probe below.**

**Jitter arrived as registered in shape** — `confident` −7, `lineups` −6,
`entries` −1, `dl` +9, with `overshoot` (683) and `vestQuote` (6,230) FLAT, and
`high` 6 -> 13 (the 6 standing plus 7 CI-only `reparse-loss` findings, which the
next scheduled run clears). "Nothing else moves" failed small for the fourth
consecutive run on a write set provably limited to `out.matchText`.

**AND THE DEGRADED-ACK SET GREW FOR THE FIRST TIME — IT IS NOT A FIXED SIX.**
Run #897's `READ BEFORE MIRRORING` list named **7** acks: the recorded six plus
**Corning Incorporated**. All seven are `ocr: 0`; five carry `ds: "readfail"` and
two were REMOVED outright. *Nine consecutive re-parses have been described as
hitting "the six named acks"; the set is not closed.*
***BUT THE READER COST DID NOT GROW, AND MY FIRST SCREEN SAID IT TRIPLED.***
Measured under the SERVING condition: **7 plans / 6,280 readers lost service**,
against the recorded 6,145 — universe drift, not escalation — and **Corning lost
NOTHING**, because `servedLineup` falls back to the LINKED TRUST and its master
trust's menu is confident, so its `lineup` cell still reads *published — "the
plan's own menu is unusable; its master trust's menu is served"*. My screen
counted owner-plus-member plans and never asked the second question, reporting
16,330 readers lost and a 2.7x escalation. *A measurement of what a page
PUBLISHES must apply every condition the page applies, in order* — the rule was
quoted in that screen's own header comment and then not applied.
**`mirror-gate` GOT THIS RIGHT WHERE THE HAND SCREEN DID NOT**, printing `-1 by
ACK` and `0 plan(s) / 0 participants actually stop being served`. This record
already retired the hand-rolled force-push because reading the git check by eye
failed once; the LOSS check now has the same history, and the gate is the
instrument.
Six were repaired by `ONLY_ACKS_4I` to their exact prior counts (3, 23, 35, 9,
25, 30, every one `ok=true`), `confident` 62,210 -> 62,216, **`pv` held at 213
on all six** and **0 collateral acks moved**.

**CORNING DID NOT REPAIR, AND IT IS A DIFFERENT DEFECT — queued, with the fix
named.** It re-parses deterministically to 5 rows at 0% coverage (`dx: "stmt"`),
because its stored entry was **prior-year FALLBACK-served** (`fb: 2024`,
`fbAck` 20250711111703…) and `fallbacks.json` is a prep-stage artifact, exactly
as this record warns. But the interesting half is WHY the run lost it: **the
newest filing's public copy was withdrawn when the fallback was chosen and is
BACK in the bucket now** — probed this wake at `http=200 bytes=1175500`, with
the 2024 copy also live at `bytes=2623375`. Its own 4i is a trustee-statement
that parses to 5 junk rows, and the fallback is tried only when the newest
filing has **no readable schedule**, so ***a WORSE readable parse of a newer
filing pre-empts a BETTER parse of an older one.*** A re-dispatch would
reproduce the loss rather than fix it; the remedy is to prefer a prior-year
CONFIDENT parse over a newest-filing NON-confident one, which lives in
`fetch-4i` and so needs a `PARSER_VERSION` bump. **THE LARGER CLASS THIS SUGGESTED IS
CLOSED BY MEASUREMENT — do not reopen it without a new one.** All 1,974 fallback
lineups are PUBLISHED and carry one of eight provenance sentences; only **225 /
286,665 readers** make the refutable WITHDRAWAL claim (the other 1,749 claim
unreadability or a failed reconciliation, which a successful download does not
refute). All **225 probed: 0 reachable, 225 still 403** — so the claim is TRUE
everywhere it is published, with both controls holding (Corning's live copy 200 /
1,175,500 bytes, a bogus ack 403 / 263 bytes). *A withdrawal label is not durable
in principle and is durable in fact at 1 observed reversal in 226* — which also
re-prices Corning's remedy at **ZERO published readers**, not 16,330: its plan
keeps a published menu throughout, so this is a STORE-QUALITY question (the
plan's own 17-row menu replaced by its trust's) and not a reader-facing loss.
Worth one caveat and no more: a trust's menu can cover a small fraction of a
member plan, so the answer may be less representative without being absent. The
general size cannot be measured in-session because `fallbacks.json` is a
prep-stage artifact.

**`merge-4i`'s stale-delta guard is STILL unexercised:** the repair's local merge
ran with no `results-*.json` present (checked before running, after the
2026-11-23 near-miss), so the guard printed nothing. That is the correct
behaviour and not a test of it.

**v212 DELIVERED, SETTLED over two runs, and MIRRORED as `fb1cd6e` — LIVE.**
`mirror-gate` **0 plans / 0 participants losing service** (confident +1 / −0 by
ack), **`sitetest-gate` a GENUINE pass on run #385** (the `ok` line printed with
the run number — `--force` was given for the git-ahead refusal only, and it
downgrades a REFUSAL, so a green verdict still prints), `deploy-check` pages run
1327 success in 1.4 min. Main's two cron commits were cleared on MEASUREMENT, not
timing: 0 plan keys either way and **0 plans whose ACK differs** in either
direction, so not one newer filing — *and a plan-KEY comparison cannot answer
that, because a DOL refresh replaces a plan's ack without adding a key.*
**`merge-4i.mjs`'s stale-delta guard is live in code but UNEXERCISED IN CI**:
`mirror.sh` rightly notes merge-side code moves no version, so the next merge is
its first real run. `pvTopShare` 99.7%, `high` back to the standing 6. #892 concluded **failure** and left the store PARTIAL at 89.74%:
`parse (19)` was KILLED at 82 minutes (every other shard finished in 32–49) with
its step still `in_progress` and `upload-artifact` **`pending`**, so that shard's
delta was never uploaded — **the `if: always()` artifact upload this file credits
with handing a crashed shard's progress to the merge DID NOT RUN**, because the
step never got a turn, which is a different failure from the step failing. #894's
completion run read the 7,388 remaining acks and cleared the gate.

| key | registered | SETTLED (99.7%) |
|---|---|---|
| `vesting` (trail) | 55,980 UNCHANGED | **55,996 (+16)** |
| `vestQuote` | 6,095 (+609), band to 6,104 | **6,230 (+744)** — past the band |
| `vesting_gap` | 10,481,113 (−1,667,448), band to −1,689,796 | **10,230,167 (−1,918,394)** |
| `vesting_withheld` | 12,400,753 | **12,547,960 (+1,814,655)** |
| `vesting_shown` | 79.28% UNCHANGED | **79.4%** — MOVED |
| ONE SCALAR | 79.94% UNCHANGED | **79.95%** |
| ledger `addressable` | 83,667,881 | **83,417,245** |

**THE OVER-DELIVERY IS NOT v212's, AND THE ARITHMETIC PROVES IT EXACTLY.** The
gap fell 1,918,394; `withheld` rose **1,814,655** and `published` rose
**103,739**, and those two sum to 1,918,394 to the reader. v212's write set is
`out.vestingText`, which can only move absent -> withheld — so the `published`
rise is **v211's whole-account LABEL arm landing LATE**, on the 1,792 acks that
sat at `pv` 210 and had therefore never been read at v211 at all. The trail
agrees: `vesting` +16 plans, registered UNCHANGED, on a change that cannot label.

***SO A REGISTRATION SETTLED ON A 97% STORE IS SETTLED FOR 97% OF THE UNIVERSE,
AND THE REMAINING 3% ARRIVES ATTRIBUTED TO THE NEXT VERSION.*** v211 was declared
settled at `pvTopShare` 97.2 with 1,792 acks still at pv 210; its arm reached them
only when v212's completion run did, and the delta then reads as v212's. This is
the sibling of *a key that cannot see an intervening change cannot warn*: here the
RUN cannot see which version's arm it is delivering. The honest form is to name
the unread tail as part of the settlement, not to call 97% finished — and
`vesting_shown` and the ONE SCALAR moving at all, both registered UNCHANGED, is
the visible signature of exactly that.

**AND THE WRITE-SET GREP IS NOT SUFFICIENT FOR A FIELD WITH POST-PASSES.** The
ship's comment argued "writes `out.vestingText` and nothing else, so no plan can
change a LABEL". Premise true, inference invalid: v88's graded-horizon post-pass
READS `vestingText` and writes `out.vesting`. ***A write-set argument is sound
only for a field nothing downstream reads; otherwise the write set must be closed
under what READS it*** — and `git diff | grep -o 'out\.[A-Za-z]*'`, the first
check reached for here, cannot see it. The conclusion holds on two checked parts
(`vestingQuoteUpgrade` begins `!out.vesting`; all nine `"Graded schedule"` sites
set `vestingText` in the same statement), and the comment now states those.

**THE ONE SCALAR STILL CANNOT SEE THE SHIP ITSELF, AND THE LEDGER IS THE QUEUE.**
v212's own move is absent -> withheld, and `shown`'s denominator is their sum, so
it is flat by construction while 1.81M readers go from a blank cell to the
filing's own words; only `addressable` moves. *A ledger keyed on LABEL coverage
is blind to QUOTE coverage, so a scalar-driven queue will never select this work.*

**v211 DELIVERED, SETTLED over two runs, and MIRRORED as `944b38e` — LIVE.**
`mirror-gate` 0 plans losing service, **`sitetest-gate` a GENUINE pass on run
#379** (the `ok` line printed on the exact head, not an override — the commit
carried `CLAUDE.md` on purpose so the push would create a run that gate can
find), `deploy-check` pages run 1323 success in 1.5 min. #889 left the store
PARTIAL (`pvTopShare` 94.7) and #890's completion run took it to 97.2, which
CLEARED the gate: `partial-store` left the HIGH list.
#889's 20 parse shards all concluded SUCCESS and stopped inside a 32-48 minute
band: a per-shard TIME BUDGET, not a failure, leaving **3,578 acks never read**
(3,167 with no error code, `dl` FLAT at 214, 3,239 still confident on their
pv-210 entries so nothing was lost). *This file's own "a run can FINISH and
still not have READ the universe", seen for the first time from the budget side
rather than the download side.* **AND ONE COMPLETION RUN IS NOT ENOUGH:** #890
ran two hours, read ~1,785 of the 3,578, and **1,793 acks (2.49%) are STILL at
pv 210**. 97% is reachable in two passes; 100% is not obviously reachable at
all, so *the gate's threshold is the achievable target and not a rounding of
"finished"*.

| key | registered | #889 (94.7%) | SETTLED #890 (97.2%) |
|---|---|---|---|
| `vesting` (trail, PLAN count) | 55,905 (+541) | 55,963 | **55,979 (+615)** — 74 plans beyond |
| `vestQuote` | 5,502 (−24) | 5,486 | **5,486 (−40)** |
| `vesting_shown` | 79.29% | 79.25% | **79.3%** |
| `vesting_gap` | 12,132,987 (−1,902,317) | 12,182,541 | **12,148,561 (−1,886,743)** — 15,574 SHORT |
| `vesting_withheld` | 10,742,196 (−8,560) | 10,733,305 | **10,733,305 (−17,451)** |
| ONE SCALAR | 79.94% | 79.93% | **79.94%** — EXACT |

**THE FINDING SURVIVED THE COMPLETION RUN, WHICH IS WHAT MAKES IT REAL: A
REGISTRATION CAN OVER-DELIVER IN PLANS AND UNDER-DELIVER IN READERS AT ONCE.**
On the partial store I flagged the 49,554-reader shortfall as possibly an
artifact of the 94.7% read. It is not: at 97.2% the PLAN count has over-delivered
FURTHER (+74 against +541 registered) while the reader gap is **still 15,574
short of its point**. Both keys were registered off the same instrument over the
same population, so neither is an instrument error — the extra plans are simply
SMALLER than the registered population's average. ***Register both and read them
separately; "over-delivered" is not a property of a run, it is a property of a
KEY.*** Four prior runs had made over-delivery look like a property of runs
because their two keys happened to agree.

**AND THE TRAIL REPORTED `confident +1` ON A RUN THAT LOST 5 — a new instance of
*a key that cannot see an intervening change cannot warn*.** #889's line read
`confident` 62,210; my in-session repair took the store to 62,216 and committed
data **with no trail line** (a local merge appends none); #890 then degraded 5
and appended 62,211. So the audit's reparse verdict diffed its own output
against a line **two commits stale** and printed a GAIN where the run's real
effect was −5. *A repair that moves the store without moving the trail
mis-attributes the next run's delta* — and the only honest reading is the
store, not the trail.

**Jitter arrived as registered** — `confident` −6, `lineups` −5, with `entries`,
`dl` and `overshoot` all FLAT — and "nothing else moves" failed small in v210's
NEW shape for the second run running: `match` −1, `matchAny` −1 and `roth` −1 on
a write set provably limited to `out.vesting` + `out.vestingText`.
**The named acks degraded on BOTH runs — the SIXTH and SEVENTH consecutive
re-parses.** #889 took all six (repaired, 62,210 -> 62,216); #890 took **five of
the six** (WD Management survived) and **two of those five were REMOVED
OUTRIGHT rather than downgraded** — Sorinex and the Hexcel MTIA had no entry at
all, a third variant beside "fewer rows" and `ds: "readfail"`. Repaired again:
all six back to 30/35/23/25/3/9, every one `ok=true`, `confident` 62,216,
**0 collateral acks touched** (against 14 rows last time, because no
`sec-tickers.js` regen intervened).

**THE ARM OWNS ITS POPULATION RATHER THAN BORROWING IT, and that was checked two
ways because the ship's own comment got the mechanism wrong.** Under the sliced
pre-v211 gate all eight pinned fixtures read `passes=false` with `employerMoney`,
`universal` and `strictGate` all 0 (control: the new arm inert on pass 0), and
in the committed store all eight plans publish **nothing at all, not even a
quote**. The comment claimed *"all five fail `IMMED`"*; four of the eight
actually MATCH `IMMED` and are dropped at the gate before it is tested, so the
real ground is the stronger one. `docs/accuracy-log.md` 2026-11-23 (03:5xZ).

**v209 DELIVERED by run #884, and the BAND held where the POINT did not — the
third registration in a row whose point estimate was a floor.**

| key | registered | delivered |
|---|---|---|
| `vesting` (trail, PLAN count) | 55,346 (+258) | **55,366 (+278)** — 20 plans beyond |
| `vesting_shown` | 77.55% | **77.56%** |
| `vesting_gap` | 14,043,903 (−540,317) | **14,034,505 (−549,715)** — inside the registered band |
| `vesting_withheld` | 10,749,991 (−612) | **10,750,756 (+153)** — moved the OTHER WAY |
| ONE SCALAR | 79.15% | **79.15%** — exact |
| `match`, `matchQuote`, `matchAny`, `roth`, `aftertax` | UNCHANGED | **all five byte-identical** |

**THE BAND IS WHAT EARNED ITS KEEP.** The registration carried +540,929 as a
FLOOR with a band to ~600,000, because the instrument could judge only 56,056
filings; delivery landed at **+549,715**, inside the band and past the point.
*A registration is only as exact as the population its instrument could judge*
— stated as a band for the first time on v209, and the first time the band was
the correct shape rather than the humble one.

**ONE KEY MOVED THE WRONG WAY AND IS NOT EXPLAINED BY THE WRITE SET.**
`vesting_withheld` was registered to FALL by 612 (3 plans moving withheld ->
published) and ROSE by 153. The write set is `out.vesting` + `out.vestingText`,
so a withheld rise is the re-roll's doing, not the arm's — `lineup_withheld`
rose 5,994 on the same line and the six degraded acks are its visible half.
Recorded rather than rounded off: a key registered in one direction that moves
in the other is a finding even when its magnitude is small.

**THE JITTER REGISTERED SEPARATELY ARRIVED AS PREDICTED:** `confident` −6,
`lineups` −5, `entries` −2, `vestQuote` −3, with `dl` and `overshoot` FLAT and
`high` 6 -> 12 (CI's `reparse-loss` findings, which the next scheduled run
clears). **And the six named acks degraded for the FOURTH consecutive
re-parse** — the identical set and the identical 6,145 readers as v207, v208 and
#875, five of the six again landing on `ds: "readfail"`, zero gained.
`mirror-gate` refuses on exactly them, which is still the only watcher that
sees it. The repair is deliberately DEFERRED to after v210's merge: a full
re-parse undoes it, so repairing before a dispatch is paying twice.

**v210 DELIVERED by run #886 (17:34Z–18:29Z, on `325afdc8`) and MIRRORED as
`3e6026a2`** — `mirror-gate` 0 plans losing service, `sitetest-gate` a GENUINE
pass on run #373 (the `ok` line printed, not an override), `deploy-check` pages
run 1320 success. v209, v210 and the six-ack repair are all live. **It
over-delivered — the FOURTH registration running whose point was a floor.**

| key | registered | delivered |
|---|---|---|
| `match` (trail, PLAN count) | 46,213 (+943) | **46,619 (+1,349)** |
| `matchAny` | 49,778 (+1,305) | **50,315 (+1,842)** |
| `matchQuote` | 5,277 (−488) | **4,957 (−808)** |
| `matchQuoteShown` | 2,109 (−133) | **2,035 (−207)** |
| `match_shown` | 70.50% | **70.90%** |
| `match_gap` | −871,315 | **−1,007,457** |
| `match_withheld` | −1,255,157 | **−1,556,583** |
| ONE SCALAR | 79.52% | **79.60%** |

**READERS MOVED TO AN ANSWER: 2,564,040** (gap −1,007,457 plus withheld
−1,556,583), against a point estimate of 2,126,472 and a registered band of
**+2.13M to ~+2.6M** — near the band's top edge, past the point. Four runs in a
row now: *the point is what the instrument could judge and the band is what the
run does.* The band has been the right shape every time it was stated.

**AND "NOTHING ELSE MOVES" FAILED AGAIN, SMALLLY AND IN A NEW SHAPE.** `vesting`
55,366 -> **55,363** (−3) and `roth` 43,595 -> **43,593** (−2) were registered
UNCHANGED, and the write set is provably `out.match` + `out.matchText`, so five
plans' non-match flags moved on a change that cannot write them. What is NEW is
the rest: `confident`, `lineups`, `entries`, `dl` and `overshoot` were all
**FLAT**, where every prior re-parse jittered them. So this re-roll reached the
FEATURE extraction and not the menu — the same text path the 2026-11-21 finding
named, seen from the other side. *Register the change's keys, then say
separately what a full re-parse jitters; and when the jitter changes shape,
that is evidence about the cause, not noise to absorb.*

**THE SIX ACKS DEGRADED FOR THE FIFTH CONSECUTIVE RE-PARSE and `confident` could
not say so.** The trail read 62,210 BEFORE and AFTER, because v209's run had
already taken those six off and v210's took them off a baseline that already
lacked them — *a key that cannot move cannot warn*, and only `mirror-gate`'s
plan-keyed refusal named them. Repaired in `fc24b29f`: all six back to `c=1` at
`pv` 210, merge `+6 / -0`, `confident` 62,216. That commit also had to READ 31
rows in 25 OTHER acks that the local merge moved, because `sec-tickers.js` was
regenerated at 19:57Z AFTER #886's merge and the name repairs decline any row
the table is keyed on — all 31 read, all 31 correct, 0 row-count moves.

The match is
DISCRETIONARY in three spellings the shipped `disc` trigger's six do not read
(`discMatchWidened`, `lib-4i.mjs`). Derived from a committed-base-vs-working-tree
differential against `006ef459` over all 56,056 cached filings, narrowed by the
arm itself (superset by construction) and DISCHARGED over 6,000 excluded filings
at 0 differences; `parser-gate` green at **104** specimens; `parse-replay --vs
006ef459` over all 1,305 affected acks — **0 menus lost, 6 must-keep pins held,
its own confidence control 1,289/1,289**.

| key | registered |
|---|---|
| `match` (trail, PLAN count) | 45,270 -> **46,213** (+943) |
| `matchAny` | 48,473 -> **49,778** (+1,305; the split is `match` +943 and `matchInZeroEmp` +362, because the trail gates `match` on reported employer money and the ledger does not) |
| `matchQuote` | 5,765 -> **5,277** (−488) and `matchQuoteShown` 2,242 -> **2,109** (−133) — those plans now publish a LABEL, so this fall is the gain |
| `match_shown` | 68.58% -> **70.50%** |
| `match_gap` (absent) | 20,864,008 -> **19,992,693** (−871,315) |
| `match_withheld` | 13,842,783 -> **12,587,626** (−1,255,157 moving withheld -> published, i.e. a quote-only cell becoming an answer) |
| ONE SCALAR | 79.15% -> **79.52%** |
| `vesting`, `roth`, `aftertax`, `contributions`, `custodian`, `lineup` | **UNCHANGED** — the write set is `out.match` + `out.matchText`, asserted at **0 non-match field moves** over the whole 12,964-plan narrowed population and 0 differences over the 6,000-filing discharge |

**RE-SEATED ON THE POST-#884 STORE, AND THE RE-SEATING IS ITSELF A CHECK.** The
differential was measured against a store at `pv` 208; run #884 landed `pv` 209
on this branch mid-pass. Re-derived against the new store, **every `match` key
is byte-identical** — `match` 45,270, `matchQuote` 5,765, `matchQuoteShown`
2,242, `matchAny` 48,473, published 75,746,660 / withheld 13,842,783 / absent
20,864,008 — because v209's write set is `out.vesting` + `out.vestingText`, which
is what its own registration claimed. Only the ONE SCALAR baseline moved
(79.06% -> 79.15%), so that row carries the new one. *A delta measured on one
store and a baseline read from another is the diff-of-the-wrong-two-lines
defect; re-deriving both from the same store is the cheap way out.*

**EXACT over the 56,056 filings the instrument could judge (82.1% of full-form
readers) and a FLOOR over the run.** The UNJUDGED remainder is **15,428 plans /
19,732,984 readers with no cached filing text**, and the band's upper end is
loose in a way worth stating: the cache was built from the GAP-census
populations, so an unjudged plan is predominantly one that already carries a
parsed answer and that this arm cannot reach. Judged move rate 2.33% of plans
would put the band at **+2.13M to ~+2.6M readers published**; the absent /
withheld split of any remainder is not estimated.

**AND NO PUBLISHED QUOTE CHANGES, which is structural rather than sampled.** The
label is written AFTER the two quote fallback loops and replaces their sentence
only where `matchQuoteOk` REFUSES it. 90 stored quotes still change and **0 of
them were published before** — verified through the guard both renderers call.

**SEPARATELY, and not claimed:** a `PARSER_VERSION` bump re-parses the universe,
so `confident` / `lineups` / `entries` / `dl` / `overshoot` jitter by whatever
the re-roll moves, and the six named acks (7 plans / 6,145 readers) have
degraded on every re-parse since v207.

**AND ONE PRE-EXISTING RED GATE, NOT MINE:** `scripts/effective-date-test.mjs`
fails with *"member national-electrical / ultra-clean / american-eagle /
mavis-tire is not in the published-yes population — the store changed under this
test"*, and it fails IDENTICALLY at `006ef459` in a clean worktree over the same
store. It is v208's withdrawals having emptied those fixture members out of the
roth/after-tax published population; the fix is that test's fixture list, not a
parser change.

**v208 was dispatched as run #881 and DELIVERED**; that registration is settled
below and must not be re-dispatched. `docs/accuracy-log.md` 2026-11-22.

**v208 DELIVERED — registered against delivered, and one key over-delivered.**

| key | registered | delivered |
|---|---|---|
| `aftertax` | 4,203 | **4,203** — exact |
| `roth` | 43,668 (−883) | **43,595 (−956)** — 73 FURTHER withdrawals |
| `contributions_shown` | 66.13% | **66.05%** |
| ONE SCALAR | 79.07% | **79.06%** |

**THE OVER-DELIVERY IS THE ONE THING TO CARRY FORWARD.** The registration was
derived as "exact over the gate's JUDGED population", and the gate's own output
said **5,793 plans / 7,180,042 readers UNTESTED** (no cached filing text), so
the figure was exact over a subset and silently a FLOOR over the run. 73 plans
is 8% beyond it. *A registration is only as exact as the population its
instrument could judge, and the honest form names the untested remainder as a
band rather than carrying the judged number as the whole.*

**THE JITTER REGISTERED SEPARATELY AND ARRIVED AS PREDICTED:** `confident −6`,
`lineups −5`, `vesting −1`, `entries −2`, with `dl` and `overshoot` FLAT. The
six degraded acks were **the identical set and reader count as v207's**, so that
is no longer a jitter prediction but a standing defect — repaired in `8a31a74f`,
cause still open, see the accuracy log for 2026-11-22 (09:xxZ).

**Every registration through 2026-11-05 was delivered and verified;**
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
must never be copied forward. Re-derived 2026-11-24 from the store run #897
left on this branch plus the six-ack repair — **SETTLED, `pv` 213 at 99.7% of
acks**, which clears the partial-store gate:
**115,641 plans / 119,907,098 participants / overall 79.95%**, 82,087,713
participant-cells addressable, with addressable gaps below. (The 79.93-vs-79.94
gap this block named four hours ago is **closed**, exactly as predicted and by
the predicted event — #894's merge appended a ledger line reading 79.95 against
a live store of 79.95. *The sentence describing it is deleted rather than
updated, which is the whole point of naming a closing event.*) (v208 withdrew a future-effective or catch-up-mandate
Roth/after-tax yes from 865 plans, so `contributions` fell 66.96% -> 66.05% and
the scalar 79.25 -> 79.06 ON PURPOSE — the fifth time it has gone DOWN for
accuracy; v209 then took it 79.06 -> 79.15 on the vesting scope gate, v210
79.15 -> 79.60 on the discretionary-match spellings, and v211 79.60 -> 79.94 on
the whole-account vesting claim. v212 and v213 moved it NOT AT ALL by
construction — both move absent -> withheld, and `shown`'s denominator is their
sum, so between them 2.95M readers went from a blank cell to the filing's own
words with the scalar flat at 79.95%. *The queue's own metric cannot see two
consecutive ships.*)

| field | shown | readers with no answer | owner agent |
|---|---|---|---|
| contributions (pre-tax / Roth / after-tax / brokerage) | 66.05% | **40.70M** | `tier-a-contributions` |
| match | 70.89% | **18.52M** (13.63M withheld on purpose) | `tier-a-plan-terms` |
| vesting | 79.37% | **10.24M** (12.55M withheld on purpose) | `tier-a-plan-terms` |
| custodian / recordkeeper | 90.22% | **11.72M** | `tier-a-custodian` |
| fund menu | 93.52% | **0.90M** (6.26M withheld on purpose) | `tier-a-lineup` |

**RANKED BY ADDRESSABLE — RE-MEASURED 2026-11-24 WITH `--download`, AND BUCKET
`C` IS NOT THE RIGHT UNIT.** Re-derive with `node scripts/notes-gap-census.mjs
match|vesting|nofeatures`; never read these.

| | plans | readers | share of bucket judged |
|---|---|---|---|
| **match** C — notes carry the vocabulary | 3,783 | **6.37M** | 98.5% |
| — of which a sentence the page's GUARD would publish | 731 | **1.35M** | |
| — **REMAINING after v213 took 1,333,945 of it** | — | **~15K** | |
| **vesting** C — notes carry the vocabulary | 3,436 | **6.87M** | 97.1% |
| — its guard ceiling, MEASURED 2026-11-24 | **3,456** | **6.98M** | 97.0% |
| — of which the SCOPE GATE refuses first | **2,868** | **5.39M** | |
| — gate passes, a later ARM refused it | 588 | **1.60M** | |
| — no publishable candidate at all (true ceiling) | 792 | 0.97M | |

**`matchQuoteOk(s, false)` IS THE REAL CEILING AND IT IS 4.7x BELOW BUCKET C.**
The guard both renderers call requires a rate in match position when no formula
is parsed, so a filing whose match sentences state no rate can never yield a
quote however wide the selector gets: 3,052 plans / **5.03M readers of bucket C
are a ceiling, not a backlog**. *A count of a condition is not a measure of a
defect* — and C is exactly such a count.

**THE VESTING HALF IS NOW MEASURED, AND THE MATCH FINDING DID NOT TRANSFER —
`scripts/vesting-quote-ceiling.mjs`, 2026-11-24.** Match's ceiling sits 4.7x
below its vocabulary bucket; **vesting's is essentially the whole of it** (6.98M
over a 4,308-plan / 8.20M absent bucket, 97.0% judged), because the two guards
have DIFFERENT SHAPES: `matchQuoteOk` demands a rate in match position, while
`vestingQuoteOk` has no numeric requirement at all — it vetoes the blank form's
printed question, accepts anything reading as a vesting rule, and otherwise
accepts unless the sentence states a different rule. ***A ceiling is a property
of the guard, not of the field, so it must be measured once per guard and never
carried across.*** (The two denominators differ — the notes census excludes A0 /
A1 / D0 and this pass excludes only `no features` and the unjudged — so the
figures are adjacent partitions, not a bucket exceeded.)

**AND THE SPLIT NAMES THE REPAIR: 5.39M READERS / 2,868 PLANS SIT BEHIND ONE
GATE.** `lib-vestslice`'s own slice records that a false `scopeGate` verdict
`continue`s BEFORE every quote fallback, so the filing stores **nothing at all** —
which is exactly this bucket. v212's quote-keep arm holds a quote where the
guard refuses the LABEL and therefore could never reach these, because the
`continue` happens first. 1.60M / 588 plans clear the gate and were refused by a
later ARM; 0.97M / 792 have no publishable candidate and are the true ceiling.
**The gate exists for a reason** — it refuses sentences that do not name employer
money — so "the gate refuses it" is a POPULATION, not a defect, and *when a class
is a semantic judgment, require the PRESENCE of the bad case rather than the
absence of the good one.*
Both controls are in the instrument's own output: plans whose store already
publishes a vesting quote read at the ceiling on **92.7%** of 398 judged (a low
figure there would mean the pipeline is broken rather than the data empty), and
the oracle must REFUSE the blank form's 6g question or the script throws.

***AND THIS BLOCK'S OWN RANKING FLIPPED TWICE IN ONE DAY, which is the part to
carry forward.*** It read vesting-leads, then match-leads-by-359K this morning,
and on C it is now **vesting ahead by ~496,000** — because match's 7.23M was
re-derived to 6.37M the moment the corpus was completed. Two arithmetic faults
produced the middle reading, both self-flattering: the vesting figure was reached
by SUBTRACTING v212's 1.72M from a pre-v211 census (*a re-size is a NEW
MEASUREMENT, never a delta against a remembered one*), and the comparability
check that was supposed to catch it **compared today's bucket against today's
bucket** — the "10,700 plans / 17,799,471 at census time" figure came from a
re-run made that same morning, not from the 2026-11-22 census, so 8 plans apart
proved nothing about then. ***The signal was sitting in plain sight and was
explained away:*** the 2026-11-22 census's own buckets sum to **18.73M against a
17.80M bucket**, a 930K residual I attributed to rounding. It was v210's match
delivery, which landed BETWEEN the census and the comparison. *An unexplained
residual reports on the query exactly as a clean zero does.*
***AND THE RANKING IS NOW SETTLED ON THE RIGHT UNIT, directly above:*** on the
guard CEILING it is vesting **6.98M** against match's **~15K remaining**, so the
`C` figures are superseded as a ranking input and must not be quoted as a size.
The three flips were all on a unit that could not answer the question.

**A CENSUS RE-RUN WITHOUT `--download` IS NOT A MEASUREMENT OF ITS FIELD.** The
match re-run judged **42.2%** of readers and put 10,284,985 / 7,662 plans in
`D0`, whose label reads "no public copy reachable (403 / withdrawn)" — but
UNCACHED filings land there too. Its `C` of 2,326,353 is a floor over a biased
subset. *The script says a census under 70% is a floor; the bucket NAME says 403,
and those are two different claims.*

**THE CORPUS SURVIVES A CONTAINER RESTART and is now 24,266 filings** (grown from
16,691 by the match pass; 7,191 fetched, 87 unreachable). An agent brief
asserting `/tmp/wampo-corpus` was wiped cost a rebuild once; check `cachedAcks()`
before assuming.

**THE SCALAR WENT DOWN AND THAT WAS ACCURACY, TWICE.** 79.82% -> 78.33% when
`lib-ledger` stopped reading code **2R** as designated Roth (2R is the
brokerage window; **no 8a code names Roth or after-tax at all**), which
withdrew a false `roth: true` from 2,344 plans / 8,549,974 readers. Then
78.33% -> 78.87% when v205 shipped, and **78.87% -> 79.28% when v206 shipped**
(the Roth-beside-a-tax-word arm: `roth` 42,689 -> 44,624 plans, against a
pre-registered centre of 44,627). *A number that only ever rises is not
measuring anything.*

**AND THE `match` / `vesting` ROWS OF THAT TABLE RANK THE WORK BACKWARDS — measured
2026-11-22 by downloading every filing in both buckets (99.6% and 99.5% of their
readers) and asking `lib-plannote.mjs` whether the public copy carries the
audited notes at ALL before asking what they say.** Re-derive with
`node scripts/notes-gap-census.mjs match|vesting|nofeatures`; never read these.

| | match | vesting |
|---|---|---|
| parser-addressable (note present, vocabulary present) | 7.23M / 4,448 plans | **10.90M / 4,787** |
| CEILING — note present and SILENT on the field | **9.41M / 5,049** | 17K / 15 |
| SOURCE gap — no plan-description note in the public copy | 1.93M / 1,851 | 1.38M / 979 |
| unreachable or OCR-only | 158K / 129 | 141K / 90 |

**So `match` is HALF A CEILING and `vesting` is 88% a parser question, over
populations drawn from the same filings.** An auditor describing a plan almost
always states its vesting rule and very often never mentions a match, because a
plan with no match has nothing to say. `match` tops the ledger by 6.3M readers
and `vesting` is the larger ADDRESSABLE class by 3.7M. The same census closes
the shared `no features extracted` bucket: **87.8% of its 2.14M readers are a
source gap, a ceiling or unreachable, and its parser-addressable remainder is
256,305 readers / 145 plans — below the floor.** `docs/accuracy-log.md`
2026-11-22.

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

- **SHIPPED 2026-11-24, DISPLAY-ONLY — §411(d)(3) boilerplate published as a
  plan's vesting schedule.** 15 plans / 9,186 readers read, as the whole answer
  to "how does employer money vest", a sentence saying only what happens **if
  the plan terminates** — universally true, so it says nothing about that plan,
  and with no label above it the quote IS the answer. `terminationOnlyVesting`
  in `lib-quote.mjs` qualifies it on BOTH surfaces. **A `terminat` arm in
  `AV_TRIGGER` is the obvious route and is WRONG: that constant is exported and
  `lib-4i` imports it for v211's scope gate**, so it would move parser LABELS —
  a bump and a 1.5h re-parse for a display defect. The new predicate's
  consumers are the two renderers, `slice-vq` and the gate, so **0 labels move
  and no re-parse is owed**; `parser-gate` green at 104 confirms it. Gated by
  `vesting-quote-test.mjs` section 4c (15 fixtures, a ceiling AND a floor, the
  accel/termination precedence both ways, the composed gate asserted in BOTH
  renderers, a mutation per condition load-bearing by name). Verified on the
  ARTIFACT: regenerating 5,000 crawlable pages changed **exactly one file**.
  **PENDING: `sec-tickers-stamp-test` is RED on `apppath-slice`** (the vq twin
  is inside app.js's fingerprinted prologue, 12->3293). No table key can move —
  neither generator reads this predicate — so dispatch `sec-tickers.yml` and
  read `sec-key-loss.mjs`'s reader price; never regenerate in-session.
  `docs/accuracy-log.md` 2026-11-24 (12:xxZ).
- **SHIPPED as v207, 2026-11-21 — "✓ Available" published on filings that say
  "not permitted".** 76 plans / 175,656 published readers; the store held the
  refutation ONE KEY AWAY (`afterTax: true` beside `afterTaxText: "After-tax
  contributions are not permitted by the Plan."`), so the screen is store-side
  and exact: `scripts/tax-flag-contradiction.mjs`, targets enumerated in
  `data/fixtures/{aftertax,roth}-negation-targets.json`. **Eleven refusals, all
  eighty-one candidates READ** — the first screen's largest member was a false
  positive at 64,943 readers (*"does not accept a ROLLOVER of after-tax"*), and
  *co-occurrence of a tax word and a negation is not governance*. Two refusals
  point the other way (a loan FROM after-tax money presupposes it), one is
  directional (a clause that affirms then carves out is ambiguous, and
  *ambiguity must not withdraw*). Also `Roth` inside `Non-Roth` is not Roth —
  BMO, 29,119 readers, UNSUPPORTED rather than contradicted. Gated by
  `scripts/tax-flag-gate.mjs`, whose `--selftest` proves the pin three ways and
  then shows an over-wide mutant losing 370 of 1,027 flags / 9,235,260 readers.
  Pre-registered `aftertax` 4,349 -> 4,306 (-43), `roth` 44,624 -> 44,551 (-73),
  nothing else moving, scalar DOWN. **The gate REFUSED the ship once**, naming 41
  withdrawals to read; five were wrong and all five sat on SUPERSEDED or UNSERVED
  entries, so no enumeration of what readers see could have found them — *a
  predicate is judged over the whole population it runs on.* The sharpest of the
  four refusals it earned: *"Except for Roth contributions, the Plan does not
  allow for after-tax contributions"* must withdraw after-tax and KEEP Roth, so
  one sentence is right for one arm and wrong for the other.
  **DELIVERED AND MIRRORED:** run #875 landed the registration EXACTLY
  (`aftertax` 4,349 -> 4,306, `roth` 44,624 -> 44,551, `pv` 207, scalar
  79.29 -> 79.25, `contributions_shown` 67.14 -> 66.96); mirrored `13a445fb` as
  a fast-forward, pages run 1309 success. **The run ALSO degraded six unrelated
  acks** (7 plans / 6,145 readers), repaired in `1fd0e2c1` — see the re-roll
  entry in the gotchas, whose OCR framing that finding refutes.
  `docs/accuracy-log.md` 2026-11-21.
- **SHIPPED as v208 and DELIVERED by run #881, 2026-11-22 — the
  future-effective amendment AND the catch-up mandate, which are ONE repair: a
  first-match arm with no date test.** 865 plans / **1,004,136 readers** lose a
  "✓ Available" they should never have had. The roth arm became a skipping
  candidate loop, the after-tax arms (already loops) gained the question, and
  `scripts/lib-effective-date.mjs` holds the predicates the sizer's `--selftest`
  gates. Delivered figures are in the block above; evidence, the four
  reading-found refusals and the measured `requir\w+` REFUSAL are in
  `docs/accuracy-log.md` 2026-11-22. The sizing below is kept because it is the record of what was
  measured BEFORE the repair, and one of its numbers is now known to have been
  optimistic — the 554-plan `latent` recovery is really **299 quote moves**,
  since the refusal applies to EVERY candidate and a latent second cause is
  usually the same provision repeated. *A `latent` verdict never meant the yes
  was correct, which that entry said in words and not in its number.*
- **REFUTED 2026-11-22, AND RECORDED SO IT IS NOT "FIXED" LATER: the v206 arm's
  `ROLL_IN` / `NOT_IN` / Roth-IRA vetoes must NOT be ported to the primary roth
  arm.** 4,895 plans / **7,696,157 readers** publish a roth quote that trips one
  of them, which reads like a fourth instance of *a guard in one arm is not a
  guard on the class* — and the top fifteen were READ and refute it: Starbucks
  (314,112) *"credited with their contributions (pre-tax, Roth, and/or
  rollover)"*, Ulta (79,798), Abbott, LabCorp, Cox, Novant all STATE Roth
  contributions and merely name a rollover beside them. The vetoes belong to the
  v206 arm's weaker standard, which infers from mere ADJACENCY; the primary arm
  already requires a contribution word near "roth". *A guard right for one arm
  is not right for its neighbour.* Residue worth a number: 321 plans / 829,642
  readers whose quote carries NO money-going-IN word at all (Delta, State Farm,
  GM — withdrawal and vesting sentences that PRESUPPOSE Roth), which is a
  quote-QUALITY question and not a flag defect.
- **A FUTURE-EFFECTIVE AMENDMENT READ AS A CURRENT FEATURE — SIZED 2026-11-20 at
  ~780-1,260 plans / ~1.5-1.6M readers, NINE TIMES the negation class. REPAIRED
  AS v208 (see directly above); this entry is now the PRE-repair measurement.**
  After-tax is
  exact over all 4,349: **114 plans / 213,306 readers** where a subsequent-events
  or plan-amendment section is the SOLE cause and its effective date falls after
  the plan-year end; roth is sampled at 668-1,147 plans / ~1.36M.
  **RE-DERIVED 2026-11-21 OVER THE POST-v207 STORE (4,306 after-tax yeses /
  19.50M readers) AND THE AFTER-TAX FIGURE REPRODUCES EXACTLY: 114 / 213,306**,
  as the measured 0 overlap with the negation class predicted. 78 of the 114 are
  dated from the quote's OWN sentence and 36 from a NEIGHBOUR in the section;
  39 plans / 81,018 readers are in-year and must NOT be withdrawn.
  **AND 114 IS A FLOOR, NOT A CEILING.** The `CAUSAL + only the evaluation date`
  bucket (9 plans / 10,402 readers, held OUT of the headline) contains **three
  real defects the date extractor cannot see**: Simpson Manufacturing (3,516),
  Ultra Clean (2,666) and Arcturus (226) each file *"On January 1, 2026, the
  Company amended the Plan to allow after-tax…"* — the amendment date carried by
  **"On ⟨date⟩, the Plan was amended"** rather than "effective ⟨date⟩", so `eff`
  parses empty and the bucket's own name is wrong for them. *A fix for one
  phrasing of a class is not a fix for the class*, met again, and here it costs
  the SIZING rather than the repair.
  **A WARNING ABOUT READING THIS SIZER'S OUTPUT, paid for the same night:** I
  read nine members, found six that must not be withdrawn, and reported the
  headline as a contaminated upper bound. All nine were from the QUARANTINE
  buckets the script already excludes — evaluation-date-only and in-year — so
  the contamination claim was about the bins, not the count. ***Check which
  bucket a member came from before pricing it against the headline.***
  `scripts/subsequent-events-size.mjs` separates cause from coincidence by
  blanking the section length-preservingly and re-asking, so CAUSAL and LATENT
  are distinguished rather than assumed. **Two things the fix must not do, both
  measured:** it must be DATE-driven, not section-driven — a blanket
  "ignore subsequent-events" veto destroys **39 plans / 81,018 readers** whose
  amendment was effective INSIDE the reported year; and it must not withdraw the
  LATENT population (~90 plans / 634K readers) whose yes stands on other
  evidence. **Headings are enumerated over 1,137 filings, not guessed**, and the
  trap is that Schedule R's printed `Part III   Amendments` appears in ALL 1,137,
  so keying on `amend` sections the blank form; likewise the evaluation date
  every such note carries is always after year end, so "a future date in the
  section" fires almost everywhere — a clean, meaningless rate.
  **AND ONE CLAIM HERE WAS REFUTED BY MEASUREMENT 2026-11-21:** this entry said
  Cortech's roth flag is doubly caused, so a negation veto alone would leave the
  headline case wrong. Its stored `rothText` IS the denial sentence, so v207's
  veto fixes it. The double causation is real as an isolated experiment and
  irrelevant to the shipped parser, because the arm that won kept the denial and
  the subsequent-events sentence never became the quote. *An experiment on a
  fragment is not an experiment on the path.* Overlap with the negation class is
  2 roth plans / 20,993 readers and 0 after-tax.

- **SHIPPED 2026-11-17 — the TRAILING return curve (1Y / 3Y / 5Y / 10Y) now
  renders**, 490,980 rows / 742M reader-slots gaining a cell, 0 lost, 0 moved,
  mirrored in `4ee89a12`. *This entry read "the RENDER does not exist" for a
  day after it existed* — the third time a sentence in this block outlived its
  truth, so derive the counts with `node -e` over `data/fund-facts.json` and the
  render's state from `app.js`, never from here.
  **THE DEFECT IT FOUND IS THE ONE WORTH KEEPING**: `gen-fund-facts-asset.mjs`
  copied `er` and `ytd` into the asset and DROPPED the curve, so thousands of
  sourced, dated, checker-validated figures never reached the file every visitor
  downloads. That is one layer EARLIER than the YTD defect of 2026-11-06 (which
  was `app.js` ignoring `sf.ytd`) and invisible to the same inspection. ***A
  stored field is not a published one, and neither is a CHECKED one.***
  The basis is the claim and is stated four times (header title, per-figure
  tooltip, note under the table, and a visible sub-line) because ten years at
  10%/yr is +159% cumulative against +10.00% annualised — a "10Y" column read as
  cumulative is wrong by 2.6x. `scripts/trailing-render-test.mjs` gates it; four
  mutations fail by name. **NOT on the crawlable `p/` pages** — their table is
  Fund | Value with no resolver, so this is interactive-surface-only; porting it
  is 3,637 of 5,000 pages / 36.0M readers and an OWNER decision.
  The lesson that still stands: *the largest plans hold collective trusts, so
  the lever is more sourced TICKERS, not more sourced returns* — Walmart fills
  1 of 42 rows at 0.0% of value.
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
mirror is not a served page.* It is also a SCALING signal: 5,287 crawlable pages
plus a 12.17 MB `plans-list.json` grow every refresh.
`docs/accuracy-log.md` 2026-11-06 (18:2xZ).
**THE REMEDY IS BUILT AND THIS ENTRY CALLED IT "cheap and unbuilt" FOR A
FORTNIGHT.** `mirror.sh:253` runs `scripts/deploy-check.mjs --wait` after the
push and prints the verdict — the v207 mirror ended `deploy-check: DEPLOYED —
pages run 1309 on 13a445fb concluded success in 1.8 min (attempt 1)`, which is
exactly the prescribed check (read `conclusion` on the run whose `head_sha` IS
main's HEAD) done automatically. So **a mirror through `mirror.sh` needs no
hand deployment check**; only a push that bypasses it does. *A procedure note
can be made false by a shipped automation, and nothing fails to tell you* —
this file already records that lesson about the merge job's fast-forward step,
one section away, and the same sentence shape outlived its truth here.

**THE TICKER TABLE DRIFTS WITH THE STORE AND NO GATE SEES IT — found
2026-11-12 by getting the opposite wrong first.** `sec-tickers.js` is keyed on
`issuer\u0000name` pairs drawn from LIVE fund names, and
`sec-tickers-stamp-test` asserts as an invariant that perturbing
`plans-all.json` or a lineup shard leaves the fingerprint alone — deliberately,
so a DOL refresh cannot redden it. **So the fingerprint is code-only by design
and nothing watches the table against the data.** Regen #12 moved **459 keys
added, 434 removed** (18,093 -> 18,118; coverage 68,405 -> 68,987 published rows
/ 21.54M -> 21.65M readers) because v205 changed fund names — and it only ran
because an unrelated comment in `lib-ledger` reddened a CODE fingerprint three
days later. ***The regens I had written up as wasteful were the only thing
keeping the table fresh, and the narrowing I proposed would have suppressed
this one.*** **CLOSED THE SAME DAY, AND NOT BY A GATE.** The first remedy
written here was "after any `PARSER_VERSION` bump, dispatch `sec-tickers.yml`" —
a manual step in a verification path, which this record's own rule says is the
step that gets skipped. So `sec-tickers.yml` now carries a **weekly schedule**
(Sun 07:11 ET) and **dispatches `site-test` on the ref it just pushed**, which
also retires the other hand-dispatch this file used to prescribe after every
regen. A data-keyed FINGERPRINT stays refused, on `lib-sec-fingerprint.mjs`'s own
measurement: it would redden on every hourly data commit with nothing wrong.
*The watcher a gate cannot be is a schedule.* `docs/accuracy-log.md` 2026-11-12.
**AND A REGEN IS NOW PRICED IN READERS, NOT KEYS — `scripts/sec-key-loss.mjs
<before-ref> <after-ref>`.** Regen #27 removed **744 keys and added 8**, which
reads like a large withdrawal and cost **0 rows / 0 readers**: `sec-tickers` is
the LAST-RESORT arm, and 4,243 of the 4,251 narrowed rows take their ticker
from an earlier arm in the chain, so the key was dead. Net **+8 rows / 8,344
reader-slots, 0 symbols switched**. *A key count is not a coverage measure in
either direction.* The narrowing is by construction (app.js builds the key as
`(f.iss) NUL (f.nameRaw || f.name)`, asserted by `sec-tickers-test`, and the
table is consulted by exact key), and the tool carries the control that makes
its zero mean something: a synthetic row on a REMOVED key must move
`RFVTX -> (nothing)`, because a broken arm and an inert arm read the same zero.
**AND THEN IT BECAME DATA-KEYED BY ACCIDENT, THREE DAYS LATER, THROUGH A FILE
THIS REFUSAL DOES NOT NAME.** `apppath.mjs` gained `fund-facts.js` loading on
2026-11-14 so the vehicles differential could observe sourced cells;
`codeFingerprint` forwards only `secTickers: false`, so the sourced-figure asset
entered the slice and the CODE fingerprint became a function of DATA the daily
refresh rewrites every morning. `sec-tickers-stamp-test` went red on four
consecutive runs with nothing whatsoever wrong in the code. The fix is
`fundfacts: false` beside `secTickers: false`, and it is correct rather than
convenient: `gen-sec-tickers.mjs` and `match-sec-tickers.mjs` never read that
asset, so it cannot change one key of the table the value describes. ***A safety
argument belongs to a MECHANISM, not to the files it happened to name*** — the
refusal and its reasoning were both already written, about the plan store, and
neither reached the new input. The drift control that now asserts it had to be
written TWICE: the first version perturbed a scratch-tree copy, which
`composeSource` never reads because it resolves this asset from the real repo
root whatever root the caller passes, so it passed decoratively until its own
negative control said so. The lever that works is `FUND_FACTS_PATH`.
`docs/accuracy-log.md` 2026-11-15.

**THE REGEN SPENDS 13 OF ITS 30 MINUTES CLONING HISTORY IT NEVER READS —
measured 2026-11-06 on run #10, unbuilt.** `actions/checkout@v4` ran 12m53s of
the job, 43% of it, because `sec-tickers.yml` asks for **`fetch-depth: 0`** on a
repo holding 302 MB in `data/`, 42 MB in `p/` and 49 MB of top-level JSON, with
a data commit every ~3.6 hours. **The repo proves the job needs none of it:**
`sec-tickers-stamp-test` asserts as invariants that perturbing `plans-all.json`
or a lineup shard leaves the fingerprint alone. Remedy is `fetch-depth: 1` — the
push loop already fetches and rebases, which deepens as needed. Sparse-checkout
is the bigger win and the riskier one, since `sec-tickers-test` and
`stamp-assets` read other tracked files. *A repository that serves its data as
static files pays for that data in every unrelated job* — third scaling symptom
in one day, after two Pages failures. `docs/accuracy-log.md` 2026-11-06.

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
- **The 2K AMBIGUITY — the COVERAGE half is CLOSED BY MEASUREMENT, 2026-11-20.
  Do not reopen it without a new source.** Code 2K is 401(m), meaning match
  AND/OR after-tax, so it cannot settle after-tax; the literal-disjunction ship
  landed 2026-11-05. The remaining question was whether the AUDITED NOTES can
  resolve it to a real yes/no, and the answer is **no**: of the 2K-partial bucket
  (57,167 plans / 29,792,622 readers) only 16,315 plans / 22,194,785 readers have
  readable notes at all — 36,745 plans / 5,955,434 readers are SHORT FORM with no
  attachment **by law** — and **85-87% of the cohort says nothing about after-tax,
  by both plans and readers**. Resolvable to a YES: **~340,000 readers** (band
  230K-900K), below the floor on three narrow arms. To a defensible NO: no
  population at scale. ***33.3M readers keep the disjunction.***
  **What the sizing found instead is in the queue above and outranks it.**
  One owner question survives: the BASIS arm accepts *"on a pre-tax or after-tax
  basis"* as a yes (907 plans / 1,951,891 readers of published yeses are that
  shape) while rejecting *"pre-tax or post-tax compensation"* — a SPELLING, not a
  semantic distinction, over ~2M published readers. `docs/accuracy-log.md`
  2026-11-20.
- **The RECORDKEEPER is wrong, not blank** — ~2,200 plans publish an auditor,
  consultant, advisor or broker as the recordkeeper, of which ~36 are
  unarguable (an accountant is never a recordkeeper). The fix needs no new
  source and moves up to ~2,200 published names.
- **`overshoot` 366 -> 764 -> 679 -> 683 is a DOL refresh, not a regression**
  (764 attributed 2026-11-05 at `PARSER_VERSION` 204; v205's re-parse took it to
  679 / 762,169 readers, withdrawing junk rather than fixing the cause; **v206
  took it to 683 / 762,739 readers**, a +4 the v206 arm cannot have caused since
  it writes only `out.roth` — it is the OCR re-roll of `docs/accuracy-log.md`
  2026-11-17).
  Remedy — judge a prior-year fallback against the FALLBACK YEAR's assets — is
  in `fetch-4i`, so it needs a bump and a full re-parse. **It now has a second
  motivating case, read against the filing:** Albertsons (239,818 readers)
  published ten rows from its **2023** filing via that fallback, three of them
  OCR debris — `le 0 0 1f` at $7,433,253,025, `1g 0) 0 th 0 0 1i 0 0 qj`, and
  `ALBERTSONS COMPANIES, INC.` at $5,579,477 against EIN 475579477 — while its
  2025 filing's 4i is a trust pointer. `docs/accuracy-log.md` 2026-11-10.
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
- **A MUTATION MUST MATCH THE *KIND* OF CONDITION IT MUTATES.** Neutering a
  REQUIRED condition (`if (!X) return false`) to a never-matching regex makes
  the predicate always false, so every case "flips" and nothing is proved —
  two of five conditions read as "not load-bearing" that way on 2026-11-24.
  Widen a requirement to always-match; neuter a refusal. And give every
  mutation a control that some OTHER case still answers correctly, or a mutant
  that simply broke the predicate reads as a successful flip.
- **A QUALIFIER THAT NAMES A CAUSE IS A STRONGER CLAIM THAN ONE THAT ONLY
  DENIES A SCHEDULE.** "This is not how vesting is earned" can be TRUE of a row
  while "this says what happens if the plan ends" is FALSE of it — T & T
  Electrical's "a terminating MEMBER of the Plan" is a leaver's distribution
  rule. So a hedge naming a mechanism must have its members READ, not counted,
  and two qualifiers that can both fire need an asserted PRECEDENCE.
- **`vestingQuoteOk` ACCEPTS BY DEFAULT and guarantees no vesting word.** It
  vetoes the blank form's printed question and sentences stating a different
  rule, and otherwise publishes. A caller's condition that looks redundant
  against it usually is not: on 2026-11-24 a control written to DOCUMENT that
  redundancy failed and refuted it. *A 0 in leave-one-out can be a property of
  today's data rather than of the construction.*
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
  **AND A WRAPPER-KEY COUNT READS AS A DATA COUNT.** `Object.keys(mtias.json)`
  is `{generated, count, trusts}`, so a trust comparison reported "main 3,
  branch 3, 0 differences" where the real figure is **511** — `j.rows` on
  `plans-all.json` threw in seconds and named the real key, while `3` survived
  as a plausible census of master trusts and nearly licensed a mirror.
- **A BEFORE/AFTER SCREEN MUST ASK THE *BEFORE* SIDE'S INDEX.** v207's six
  losses read `served: 0` on all six — no reader affected — because
  `servedLineup` was handed the POST-run `lineups-index.json`, and the loss IS
  that index changing. Against the before-index it is 7 plans / 6,145 readers.
  Same shape as the rule below, and *the repaired figure is the PAIR of runs*
  (index disagreement 7 -> 0): one run printing 0 cannot tell "repaired" from
  "never measured", so the control belongs in the script's own output.
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
- **A gate that fails for a reason that is NOT A LOSS teaches its reader to pass
  it flags.** v207's roth arm refused on a fixture correctly absent from the arm
  it declares, with 0 losses behind it: scope a pin by the arm it is a pin FOR,
  and REPORT an out-of-scope pin rather than skipping it silently.
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
- **SOURCING A FIGURE MAKES A MIS-RESOLVED IDENTITY WORSE, AND NO SOURCING CHECK
  CAN SEE IT.** Black Hills' $143.5M top holding is filed as `Vanguard
  Institutional Index **Plus** Fund`; the page asserted VINIX (the
  Institutional class) while the pattern FEE arm read the name as Plus and
  returned Plus's 0.020% — our two tables contradicting each other on one row,
  with the displayed number RIGHT. Sourcing VINIX made the sourced figure
  outrank the estimate and the cell became **0.035% under a ✓** on a fund that
  charges 0.020%. Every receipt was valid: the fee is correct *for the symbol
  it was asked about*. *A ship that makes every cell more trustworthy makes a
  mis-resolved row more wrong, and the defect is upstream of everything the
  sourcing gates inspect.* So before sourcing a family, diff the pattern
  estimate against the sourced figure: **a disagreement is a ticker question,
  not a fee question.**
- **AN ISSUER MAY PUBLISH A COLLECTIVE TRUST'S OWN PRICE, AND ASSUMING
  OTHERWISE COST 10.7M READERS A BLANK CELL.** `app.js`'s comparable note
  states a trust "has no public ticker, expense ratio or return of its own,
  because its class is negotiated by the plan". True of a negotiated separate
  account; FALSE of Vanguard's Target Retirement Trusts, which
  `investor.vanguard.com/vmf/api/<fundId>/{profile,performance}` serves PER UNIT
  CLASS with a CUSIP, a dated fee and dated returns (1464 = 2020 Trust I,
  92202V591, 0.065%). The filings name the class, so that figure is the plan's
  real price. **But the same API serves DORMANT classes**: every Trust III
  vintage reads `0.4000` as of **2014-03-31** — a round number 6x the live band,
  identical across twelve vintages — with a YTD block containing no value. The
  two witnesses partition the set EXACTLY (44/44 fresh-with-YTD, 23/23
  stale-without), so freshness is the publish gate and it belongs in
  `gen-fund-facts-asset.mjs`, which already re-applies the checker's refusals
  rather than trusting its input.
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
  **AND "NOTHING ELSE MOVES" IS A CLAIM ABOUT THE CHANGE THAT CANNOT BE MADE
  ABOUT THE RUN.** v207's write set is provably `out.afterTax` and `out.roth`
  and nothing else — and its run moved `confident -6`, `lineups -5`,
  `vesting -1`, `dl +51`, because a `PARSER_VERSION` bump re-parses the UNIVERSE
  and the re-roll moves what it moves. v206 did the same and this file predicted
  it; v207 registered it wrongly anyway. Register the change's keys, then say
  separately what a full re-parse is expected to jitter.
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
- **A TOKEN QUOTED AS AN EXAMPLE IS INDISTINGUISHABLE FROM ONE MEANT AS AN
  INSTRUCTION, wherever something downstream reads for it.** Spell the CI-skip
  token `skip-ci` in prose and reserve the bracketed form for a real directive:
  GitHub scans the WHOLE commit message, so a commit EXPLAINING the mechanism
  suppresses its own run — and it fails silently in the direction that looks
  like success (no run, no red, nothing to notice). This project writes long
  commit messages about CI mechanics constantly, so the trap is live on every
  one. Same shape as a character class written for a concept, and as the form's
  own printed questions defeating a text-level screen.
  **AND IT BIT AGAIN ON 2026-11-21 WITH THIS RULE ON SCREEN, in the worst
  place: the commit that FIXED a red gate.** `29220c17` allowlisted the
  `tax-flag-gate.mjs` orphan and its message said *"created under ⟦the
  bracketed token⟧ (92e5ddba)"* in prose, so GitHub suppressed the very run
  that would have proved `gate-coverage` green — the same shape as the regen
  entry's "the commit that FIXES the gate creates no run to prove it", reached
  by a different route. *Reading the rule is not obeying it; the check is a
  `grep -n skip` of the message before `git commit`.*
  **THE REMEDY, once tripped:** do NOT amend and force-push over a verification
  gap — `site-test.yml` carries `workflow_dispatch`, so dispatch it on the ref
  and read the `conclusion`. That leaves the suppressed commit honest in history
  and still gets the verdict.
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
