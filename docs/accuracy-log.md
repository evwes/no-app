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
