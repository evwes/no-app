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

## 2026-07-27 — Simmons Foods match tier missed (owner-submitted filing)
- **Wrong:** "plus 50% of a participant's contributions up to the next 2%"
  wasn't captured — the tier pattern required "of the next" adjacency, so
  the site showed only "100% of the first 3%".
- **Change:** tiers accept words between the rate and "next" (percent signs
  excluded from the bridge — the naive widening corrupted Kohler's middle
  tier in testing and was caught by the core regression diff before ship).
  Also: era labels now carry the filing's own connector ("in effect
  through 2023" vs "before 2023"), and vesting sentences describing
  superseded schedules ("prior to January 1, 2021…") rank behind
  current ones.
- **Prevention:** Simmons Foods and Boardwalk 1000 join the regression set;
  the tier bridge is percent-blocked by construction.

## 2026-07-27 — Simmons Foods (owner review, round 2): vesting table and eligibility missed
- **Wrong:** the filed graded schedule ("Years of Service / Vesting
  Percentage — Less than 1: 0% … 5 or more: 100%") uses bare digit rows the
  table fallback couldn't read, and "completing six months of service"
  spelled the count out — both showed "not stated" despite being in the
  filing.
- **Change:** header-anchored bare-digit vesting tables parse; eligibility
  accepts spelled-out counts. Also from the same review cycle: past-tense
  "matched", "not in excess of" caps, verb-separated quote phrasings
  ("the Company made matching safe harbor 401(k) contributions"), and
  temporal markers AFTER the formula ("… until December 31, 2022" —
  Chantecaille now labels the era honestly).
- **Prevention:** Simmons joins the regression set with all three fields
  asserted; Chantecaille and Citizens Bank & Trust join for the temporal
  and phrasing classes.

## 2026-07-27 — 51% of after-tax flags were Roth described as "after-tax" (hourly review, batch 6)
- **Wrong:** 4,149 of 8,173 plans flagged "after-tax contributions: yes"
  from sentences like "participants may designate some of their
  contributions as after-tax contributions to a Roth 401(k) option" —
  that is Roth (which IS after-tax money), not a voluntary after-tax
  source, and it inflated the mega-backdoor chip. Found while
  due-diligencing Rental One in the hourly loop.
- **Change:** the after-tax matcher now also vetoes a Roth AFTER the
  phrase when no list separator intervenes ("after-tax contributions
  to/into a Roth …" = Roth; "Roth and after-tax contributions" still
  counts), scanning all occurrences so a genuine mention elsewhere in the
  filing still qualifies.
- **Prevention:** Rental One and two more Roth-phrased specimens join the
  regression corpus; the hourly DD checklist now reads the after-tax
  quote's own sentence, not just the flag.

## 2026-07-27 — 3,582 vesting quotes showed forfeiture accounting, not the schedule
- **Wrong:** "forfeited non-vested accounts totaling $1,128 … were used to
  reduce Company contributions" shipped as the vesting quote — it contains
  vesting words but says nothing about the schedule, while the filing's
  real schedule sentence sat unquoted.
- **Change:** forfeiture-accounting sentences rank last among vesting
  candidates and are barred from the quote-only fallback entirely.
- **Prevention:** covered by the same regression corpus diff; coverage
  drop from suppressed forfeiture-only quotes is honest and expected.

## 2026-07-27 — match template with no "match" word: "The Company contributed X% of the first Y% … that a participant contributed"
- **Wrong:** a common auditor template states the match without ever using
  the word "match" (Rabun Gap-Nacoochee School "100% of the first 5%",
  Rental One "25 percent of the first 3 percent", plus a third specimen at
  25%/6%) — all showed as unanswered despite an explicit formula.
- **Change:** new formula pattern anchored on the trailing
  "that a participant contributed" clause (which is what distinguishes a
  match from a nonelective contribution). Same cycle: "on a discretionary
  basis, contributes a matching amount" now reads as Discretionary
  (Sunstreet Mortgage), "shall/may make safe harbor matching
  contributions" joins the quote fallback (TST Insulation),
  "following vesting schedule: Years / Employer Contributions" tables
  parse (Sunstreet's 6-row graded schedule), and rate-after-tier prose
  ("the first 3% … are matched 100%, and … up to 5% … matched at a rate
  of 50%" — Berry Foundation) parses with both tiers.
- **Prevention:** all four filings join the regression corpus; the hourly
  loop's match-miss lane keeps sampling exactly this class (plans with
  employer money and audited notes but no extracted formula).

## 2026-07-27 — match cap misread as deferral tier (hourly review, batch 8)
- **Wrong:** "matching contributions are limited to 50% of employee
  contributions with a maximum of up to 2% of the participant's
  compensation" (Yesler) rendered as "50% of the first 2% of pay" — the 2%
  caps the MATCH, not the matched deferrals, so the display halved the
  real benefit. 12 live entries shared the phrasing.
- **Change:** cap-style phrasings render the way the filing states them:
  "50% of contributions, max match 2% of pay" — every number in the
  display remains a number in the quote.
- **Prevention:** Yesler joins the regression corpus; the audit's
  formula-vs-quote check inherently polices this format since the display
  no longer invents a derived tier.

## 2026-07-27 — stale formula presented as current: "for the year ended 2019 was…"
- **Wrong:** Freedom Boat Club's notes state the match "for the year ended
  December 31, 2019" inside a 2023 filing of a discretionary annual
  provision — we showed the 2019 formula with no caveat. The existing
  temporal guard only knew "prior to/before/until/through".
- **Change:** a lone "for the year ended <date>" at least 2 years behind
  the filing's newest year now gets the era label ("formula in effect for
  plan year 2019 per the filing"); two-year audit phrasing ("years ended
  2023 and 2022") stays unlabeled. Era labels also now append after ALL
  tiers, not mid-formula.
- **Prevention:** Freedom Boat joins the regression corpus; 2 live entries
  had the stale-year phrasing and re-parse under v23.

## 2026-07-27 — batch-8 phrasing pack: "vests 25% after each year", "contribute a discretionary match", safe-harbor-provision NEC
- **Wrong:** Blue Nile's graded schedule ("vests 25% after each year of
  service"), Toyo's "may contribute a discretionary match as determined
  each year", and Eiwa's "Company contributions under the safe harbor
  provision are equal to 3% of compensation" all showed "not stated".
- **Change:** each phrasing added to its extractor (graded, discretionary,
  nonelective).
- **Prevention:** all three join the regression corpus via the cached-PDF
  diff harness, which must show only intended changes per release.

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
