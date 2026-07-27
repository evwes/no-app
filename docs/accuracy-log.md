# wampo accuracy log

Accuracy is the project's first principle. Every accuracy defect found gets a
permanent entry here: **what was wrong → the change that fixed it → what now
prevents it from recurring**. Entries are never deleted. The standing
prevention machinery is listed at the bottom.

---

## 2026-07-18 — Fabricated fund returns and expense ratios
- **Wrong:** the curated overlay displayed synthetic per-fund returns and
  expense ratios that had no source.
- **Change:** all synthetic numbers stripped; expense ratios come only from a
  labeled pattern-estimate table, always marked "est."
- **Prevention:** standing rule in project memory — no number appears on the
  site unless it traces to a filing or is labeled an estimate. Never
  reintroduce fabricated numbers.

## 2026-07-20 — Stale dataset years (Deere showed 2024 filings)
- **Wrong:** dataset years were hardcoded; new filing years silently ignored.
- **Change:** rolling year window (current year back 3) with per-year
  download tolerance and received-date tie-breaks.
- **Prevention:** weekly cron re-ingests; newest-filing-wins dedupe is
  exercised every run.

## 2026-07-21 — 403(b) plans mislabeled as ESOPs
- **Wrong:** characteristic code 2L rendered as "ESOP"; 2O/2P are the ESOP
  codes per the official instructions.
- **Change:** plan-type decoding rewritten against the Form 5500
  instructions (2J=401(k), 2L/2M=403(b), 2O/2P=ESOP).
- **Prevention:** the official instructions file in docs/ is the sole
  interpretation source for codes.

## 2026-07-21 — Northrop Grumman: eligibility false positive, match table unparsed
- **Wrong:** "5 years of service" shown as an eligibility rule — the number
  came from a match-table cohort qualifier; the real tiered match table
  wasn't extracted at all.
- **Change:** eligibility window excludes % signs and cohort qualifiers;
  column-table match formulas parse ("First 2% … 100 %").
- **Prevention:** NG is a permanent regression case; feature extraction is
  diffed against cached specimens before every parser release.

## 2026-07-21 — Verizon Master Savings Trust: gains shown as values, summary double-counted
- **Wrong:** every holding showed its UNREALIZED GAIN as its value (Amazon
  $53.2M shown vs $207.5M true), and the class-summary page was counted
  twice; an arbitrary slice of per-security detail displayed as the lineup.
- **Change:** gain-last column mode reads the market-value column;
  class-summary schedules are preferred over per-security floods.
- **Prevention:** audit cross-checks every confident lineup's sum against
  Schedule H and flags any top holding exceeding plan assets; Verizon trust
  is a regression case.

## 2026-07-21 — Average balance absurdities from filer-typo participant counts
- **Wrong:** Union Savings Bank filed 3 with-balance participants against
  500 total ($26M "average"); Verizon Management filed 12,068 against
  119,145 ($2.6M "average", their own 6f says 112,426).
- **Change:** the with-balances count is distrusted when under 5% of
  participants, or under half while implying a >$1M average; genuine $1M+
  plans (Cravath-class, counts agree) keep the filed figure.
- **Prevention:** audit flags avg balance >$5M as HIGH and count
  disagreements as WARN every run.

## 2026-07-24 — Junk lineups displayed as confident (Aramark's "holdings" were a phone number and a zip code)
- **Wrong:** filings with no real 4i attachment parsed form address pages as
  holdings; three others displayed fair-value-table fragments summing both
  comparative-year columns (ratio 1.5–1.6, exactly 3 rows).
- **Change:** form-page boilerplate rows skipped; parses under 5 rows
  require sum-to-Schedule-H ratio 0.7–1.3 for confidence.
- **Prevention:** audit "top holding exceeds plan assets" and "lineup sum vs
  Schedule H" checks — 4 HIGH findings at introduction, 0 after the fix.

## 2026-07-24 — Impossible average contributions displayed
- **Wrong:** plans whose filed contribution line includes merger transfers
  showed averages above the legal 415(c) ceiling (Napa: $178K/active).
- **Change:** averages above the statutory limit display as "—" (the true
  average is unknowable from the filing).
- **Prevention:** audit flags per-active deferrals above the legal limit as
  HIGH every run.

## 2026-07-24 — Stale curated data could override fresher filed data
- **Wrong:** hand-entered overlay values (predating the pipeline) took
  precedence over extracted filing data.
- **Change:** filed data wins everywhere both exist; curated only fills gaps.
- **Prevention:** precedence is structural in the merge code, noted in
  project memory.

## 2026-07-25 — Match "coverage" inflated by boilerplate mentions in $0 plans
- **Wrong:** broadened v18 patterns picked up match mentions in ~8,100 plans
  that paid $0 employer money — pages would have claimed a match where the
  truth is "none this year".
- **Change:** pages state "$0 — none filed this plan year" affirmatively
  (with "Discretionary — none made this plan year" where applicable); the
  coverage scorecard counts $0-payers as answered, not covered.
- **Prevention:** scorecard denominators separate $0-payers; audit prints
  the split every run.

## 2026-07-25 — Wrong QACA formulas from an article in the cap phrase
- **Wrong:** "up to **a** 1%" broke the cap pattern and the regex paired the
  wrong numbers — displayed "1% of the first 6%" where the filing says 100%
  of the first 1% plus 50% of the next 5%.
- **Change:** optional articles handled; two-part "exceeds X% up to Y%"
  safe-harbor tiers derived from cumulative caps.
- **Prevention:** the formula-vs-quote correctness check runs every merge —
  every number in a displayed formula must appear in its own quote (or its
  cumulative cap); mismatches print in the run log.

## 2026-07-25 — Quotes truncated before the numbers they support
- **Wrong:** 58 formulas cited quotes that cut off before the tier the
  formula stated (bullet-list "sentences" pushed the phrase past the cap).
- **Change:** excerpts window around the full matched span, through the last
  tier.
- **Prevention:** same correctness check — formula ⊆ quote is enforced,
  violations counted per run.

## 2026-07-25 — Vesting read from fallback schedules; legally impossible cliffs
- **Wrong:** top-heavy fallback and death/disability acceleration clauses
  were read as the plan's schedule; "5-year cliff" outputs violated the IRC
  §411(a)(2)(B) 3-year DC cliff limit (they're misparsed graded schedules).
- **Change:** conditional/alternative-schedule sentences excluded; cliff
  extraction capped at 3 years.
- **Prevention:** audit flags any cliff reading above 3 years as a misparse.

## 2026-07-26 — 6,132 orphaned entries from superseded filings polluted stores and metrics
- **Wrong:** when a newer filing replaced a plan's ack, the old parsed entry
  stayed in the shards/status forever — stale data parsed under years-old
  parser rules (including pre-fix wrong formulas and illegal cliff readings)
  inflated the correctness mismatch count (538 reported vs 26 real) and the
  shard payload. Never displayed, but stored and counted.
- **Change:** the merge step now purges any entry whose ack is no longer in
  the current plan universe or trust list.
- **Prevention:** the purge runs on every merge; audit metrics therefore
  only ever describe data the site can actually display.

## 2026-07-26 — v19 verification snapshot (for the record)
- Formula-vs-quote correctness after purge: **26 mismatches / 31,220
  checked (0.08%)**, from 0.58% at instrument introduction. The residual 26
  include a handful of suspicious duplicate-tier formulas — under
  individual investigation for the next parser cycle.
- Match backlog: 72 filings (from 10,087 at instrument introduction).
- Education-industry vesting stays ~49%: sampled filings confirm auditors
  in that sector rarely state schedules — an honest source gap, labeled as
  such on every affected page, not an extraction failure.

## 2026-07-27 — 30,795 match "quotes" were Form 5500 question text (hourly DD, batch 2)
- **Wrong:** the quote fallback matched "matching contributions" inside the
  form's own checkbox question (21b, "check all boxes that apply …
  permissive aggregation rules") — nearly half of all displayed match
  quotes were form boilerplate, not audit notes. This also silently
  inflated the v18 match-coverage jump.
- **Change:** the boilerplate veto now covers "check all boxes",
  "permissive aggregation", "design-based safe harbor", question numbers,
  and checkbox residue; all affected quotes vanish on the v20 re-parse.
- **Prevention:** the audit now scans every quote for form-question markers
  and reports the count each run (must be zero); the hourly due-diligence
  loop that found this keeps sampling quote-only extractions. NOTE: match
  coverage will drop sharply and honestly when v20 lands — those "answers"
  were never real.

## 2026-07-27 — Discontinued formulas presented as current (Cooper Tire)
- **Wrong:** "Prior to January 1, 2023, the Company made matching
  contributions equal to 100% … up to 6%" was displayed as the current
  formula.
- **Change:** formulas introduced by "prior to / before / until / through
  [date]" now prefer a later-stated current formula, and when none exists
  the formula is labeled "(formula in effect before YYYY per the filing)".
- **Prevention:** Cooper Tire joins the regression set; the temporal guard
  is exercised on every parse.

## 2026-07-27 — "100% ON the first 3%" phrasing missed (Pacific Drilling)
- **Wrong:** the formula pattern required "of the first"; filings phrased
  "on the first" showed only a quote, no structured formula.
- **Change:** the pattern accepts of/on.
- **Prevention:** Pacific Drilling joins the regression set.

## 2026-07-27 — New CBA pattern initially matched Schedule R form tables (caught pre-ship)
- **Wrong (never shipped):** the new "Set by collective bargaining
  agreement" extraction fired on Schedule R's multiemployer table headers
  ("Date collective bargaining agreement expires"), tagging non-union plans.
- **Change:** CBA extraction requires a prose sentence that passes the
  boilerplate veto and excludes the table's header phrases.
- **Prevention:** caught by the core regression diff before push — the
  same gate that must stay green on every parser release.

---

## Standing prevention machinery

1. **Post-merge audit** (`scripts/audit-data.mjs`, prints in every pipeline
   run's log): participant-count identities, 415(c)-bounded contribution
   averages, lineup sums vs Schedule H, top-holding vs plan assets, legal
   vesting bounds, formula-vs-quote correctness, per-field coverage
   scorecard with honest denominators. HIGH findings get investigated, and
   the investigation lands here.
2. **Regression specimens** — every confirmed defect's filing joins the
   permanent set (TK Elevator, Microsoft, Pfizer, Walmart, Black Hills,
   Kohler + trust, Coca-Cola trust, Siemens trust, Northrop Grumman,
   Verizon trust, Amazon, QACA, Rockefeller, IBEW Local 8, …); parser
   releases must leave lineups byte-identical and feature diffs
   explainable before shipping.
3. **CI smoke test** (`.github/workflows/site-test.yml`) — every frontend
   push boots the site and checks the three plan archetypes render honestly.
4. **Continuous filing review** — each parser cycle samples filings from
   the current worst coverage/correctness class, compares extraction
   against the filing text by hand, and feeds fixes back as patterns +
   regression cases + entries here. This loop does not stop.
5. **Display honesty rules** — three distinct states everywhere: as filed /
   affirmatively none / not stated (with the reason). Silence in a filing is
   never rendered as "no".
