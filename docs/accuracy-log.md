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

## 2026-07-27 — one employer group's formula shown as the whole plan's (hourly review, batch 9)
- **Wrong:** Continental Tire The Americas' plan pays Hoosier Racing Tire
  employees 100% of the first 5% and O'Sullivan Films employees 100% of
  the first 6% — we displayed "100% of the first 5% of pay" as the plan
  match with no qualifier. 22 live entries carry a formula whose sentence
  is scoped "For participants of <entity>".
- **Change:** a formula whose sentence begins with a population qualifier
  renders as "Varies by employer group" with the group formulas quoted
  (same-sentence detection tolerates abbreviation periods — "Corp., the").
- **Prevention:** Continental joins the regression corpus; the audit's
  formula-vs-quote check skips digit-free labels, so no false positives.

## 2026-07-27 — batch-9 pack: past-tense NEC, tier formula without participant anchor, frozen plans
- **Wrong:** Cazenovia College's "The College contributed 3% of eligible
  wages" (past tense) and Daycon's "the Company contributed 50% of the
  first 6% of base compensation" (no "that a participant contributed"
  anchor) showed as unanswered; Bay Photo's plan has been FROZEN since
  2021 — no flag existed for that state, so its quote-only match text
  implied an active match.
- **Change:** NEC accepts "contributed"; the sponsor-contributed match
  template accepts a compensation-anchored tier ("of the first N% of …
  compensation"); new `frozen`/`frozenText` feature flags plans whose
  contributions are permanently discontinued (display wiring to follow in
  the next frontend pass).
- **Prevention:** all three join the regression corpus.

## 2026-07-28 — decimal tiers silently truncated: "up to 1.5%" displayed as "1%" (hourly review, batch 10)
- **Wrong:** every formula pattern captured `(\d{1,2})(?:\.\d+)?` — the
  decimal sat OUTSIDE the capture group, so Bureau Veritas' "100% of
  deferrals up to 1.5% of eligible compensation" displayed as "100% of the
  first 1% of pay". 327 live formulas had a truncated decimal ("200% of
  the first 2%" that is really 2.5%, etc.).
- **Change:** decimals moved inside every numeric capture group in the
  match/tier/NEC patterns (group counts unchanged); tier arithmetic
  already handles floats.
- **Prevention:** Bureau Veritas joins the regression corpus; the audit's
  formula-vs-quote number check now naturally flags any future truncation
  (the quote's "1.5" no longer matches a displayed "1").

## 2026-07-28 — quote cleaner ate real dates: "During the year ended , the Company…"
- **Wrong:** the quote cleaner blanket-removed "December 31, 20XX" to kill
  page-heading glue, which also deleted legitimate in-sentence dates —
  5,010 live quotes read like "During the year ended , the Company made…",
  garbling the site's own evidence and hiding era information.
- **Change:** the date is stripped only as part of the
  "Notes to Financial Statements <date>" heading block.
- **Prevention:** same specimen; the hourly DD checklist now reads quotes
  for grammatical holes, not just numbers.

## 2026-07-28 — old formula shown for a plan that made NO match this year (hourly review, batch 11)
- **Wrong:** American Physician Partners' filing says "There were no
  discretionary Plan Sponsor matching contributions for the 2023 plan
  year" and then describes 2022's 100%-of-3% — we displayed the 2022
  formula as if current. Its 3-year cliff ("0% vested until three years of
  service") was also missed for word order.
- **Change:** an explicit no-match-this-year sentence plus a "During
  <older year>" formula quote appends "(none made for plan year YYYY per
  the filing)"; cliff accepts the "0% vested until N years" order; the
  audit strips both label forms before number checks.
- **Prevention:** APP joins the regression corpus with all three fields
  asserted.

## 2026-07-28 — rate-only match with no cap: "contributed 10% of the employee qualified contributions"
- **Wrong:** Exeter Government Services states a match rate with no tier
  cap — no pattern fit, so match showed "not stated" despite an explicit
  rate.
- **Change:** rate-only sponsor-contributed phrasing renders
  "10% of contributions".
- **Prevention:** Exeter joins the regression corpus.

## 2026-07-28 — after-tax Roth veto missed the basis branch (residue sweep, batch 12)
- **Wrong:** after v22 cut the Roth-phrased after-tax flags from 8,173 to
  4,218, a 136-entry residue remained: "contribute on an after-tax basis
  as a Roth contribution" enters through the BASIS-enumeration branch,
  which only vetoed a Roth BEFORE the phrase.
- **Change:** the basis branch gets the same post-window veto (Roth after
  the phrase with no list separator = Roth); Northrop Grumman's genuine
  "after-tax basis or to a Roth 401(k)" enumeration keeps its flag via the
  separator rule — verified against the corpus (zero changes).
- **Prevention:** residue scans after every fix class — the follow-up
  count is part of the fix, not optional. Also verified the 338
  "forfeiture" vesting-quote residue is benign: those are legitimate
  "nonforfeitable interest" sentences and "Vesting and Forfeitures"
  headings, not the accounting sentences v22 barred.

## 2026-07-28 — era guard swapped a real formula for a discretionary maximum (hourly review, batch 13)
- **Wrong:** H Enterprises' filing states a 50%-of-first-6% match, then a
  separate discretionary component "up to 80% of the first 6%". The era
  guard misread the audit-period phrase "from January 1, 2023 through
  March 17, 2023 and for the year ended December 31, 2022" as a formula
  expiry, retried, and replaced the real 50% with the discretionary 80%.
  Compounding it, the staleness year-scan counted loan-maturity ranges
  ("2023-2027") as filing dates.
- **Change:** "from <date> through <date>" ranges and "…and for the year
  ended" period enumerations no longer count as expiries; the staleness
  scan only reads dated tokens (month-name dates, mm/dd/yyyy, "plan year
  YYYY"). Freedom Boat's genuine 2019 label and APP's none-made label
  survive; H Enterprises shows the real 50%.
- **Prevention:** H Enterprises joins the regression corpus alongside the
  era set (Freedom Boat, APP, Blue Nile) — all four asserted together.

## 2026-07-28 — vesting/match split by hire date shown as one cohort's schedule
- **Wrong:** United Farmers Cooperative vests pre-Sep-2016 hires
  immediately and later hires on a 3-year cliff — we showed "3-year cliff"
  alone. The same check revealed Northrop Grumman's match table is scoped
  "For employees hired before April 1, 2016" — also shown unqualified.
- **Change:** a vesting or match whose quote contains a hire-date
  qualifier appends "(varies by hire date per the filing)".
- **Prevention:** UFC joins the corpus; NG's assertion updated to include
  the label. Also from batch 13: "at its discretion, may contribute a
  matching contribution" (R.T. Patterson) and "matching and profit sharing
  contributions equal to a discretionary percentage … determined by the
  Firm" (Connell Foley) now read as Discretionary.

## 2026-07-28 — terminated plans presented like active ones (hourly review, batch 14)
- **Wrong:** early-ack filings are dominated by FINAL returns of
  terminating plans (PGDX, Annadel, Yesler, APP, R&D — all confirmed
  termination sentences), and nothing on the plan record said so; a
  reader could take a dissolved plan's formula as a live benefit.
- **Change:** the frozen flag also detects termination resolutions
  ("Board adopted a resolution … to terminate the Plan", "Plan was
  terminated effective …") — 15 of 133 corpus filings carry it, each
  verified against its sentence. Display wiring is the next frontend
  pass.
- **Prevention:** PGDX joins the corpus; the sentence-context check
  (merger-source terminations must not flag the host plan) is part of the
  DD checklist.

## 2026-07-28 — v23 era labels misfired on 2,286 CURRENT formulas (hourly review, batch 15 — VMware)
- **Wrong:** v23's staleness scan read BARE years, so target-date fund
  names ("Retirement 2045") inflated the "newest year in the filing"
  estimate and current formulas got era labels: 2,114 live entries say
  "formula in effect for plan year 2024", 172 say 2025 — VMware's active
  100%-of-6% among them. Only ~9 pre-2021 labels were genuine.
- **Change:** already fixed in v24 (dated-token scan), which was in flight
  when the DD caught this; verified VMware extracts clean under v24 code.
  Verify the label histogram after the v24 data lands: 2024/2025 counts
  must go to ~zero.
- **Prevention:** the label-year histogram joins the audit as a standing
  check — any label year ≥ the current filing season is a red flag.

## 2026-07-28 — batch-15 pack: "all of their Plan accounts" vesting, cumulative match tables, OCR-sourced DD limits
- **Wrong:** EP Energy's "always 100% vested in all of their Plan
  accounts" wasn't accepted as employer-money vesting evidence (the gate
  wanted an explicit employer word); Northcentral University's cumulative
  match TABLE ("When an Employee Contributes | … | Cumulative Company
  Match … 3.00%") had no pattern; and Mid-States/Amsted proved
  unverifiable locally — their attachments are scanned, production's
  features came from the OCR path, and a truncated download (102KB of
  2.26MB, silent curl failure) initially masqueraded as "form-only".
- **Change:** vesting gate accepts all-accounts phrasing; cumulative
  tables render "Tiered schedule — up to N% of pay total match" with the
  table quoted; "Prior to the Plan's termination" (curly apostrophe
  included) joins the frozen detection.
- **Prevention:** DD downloads must be size-checked against S3
  Content-Length before declaring a filing form-only; OCR-sourced entries
  are sampled on runner-parity tooling, not the sandbox (local tesseract
  is ~50x slower than production).

## 2026-07-28 — dollar caps omitted from match formulas (hourly review, batch 16)
- **Wrong:** Digirad's match is "25% of deferrals up to 6% … not to
  exceed $2,500 on an annual basis" and VMware's is capped at "$2,250 per
  quarter for a total of $9,000 per year" — we displayed the percentage
  formula with no cap, materially overstating the benefit for higher
  earners. First fix attempt labeled VMware "$2,250/yr" (the quarterly
  figure) — caught in the same session by re-reading the sentence.
- **Change:** an annual dollar cap appends "(max $N/yr per the filing)",
  preferring the stated annual total and refusing shorter-period figures;
  the audit strips all "per the filing" annotations before number checks.
- **Prevention:** Digirad and VMware join the corpus with cap assertions.

## 2026-07-28 — "Company contributions are discretionary." missed for plainness (hourly review, batch 17)
- **Wrong:** Stamps.com's notes state the employer arrangement in four
  words — "Company contributions are discretionary." — and every
  discretionary pattern demanded fancier phrasing, so a plan with $4.5M
  of employer money showed match "not stated".
- **Change:** the plain form joins the discretionary alternation (a
  second corpus filing was caught by the same addition).
- **Prevention:** Stamps.com joins the corpus. Veritas (discretionary +
  2-year cliff), Channel Partners, and Seven Z verified exact this batch.

## 2026-07-28 — "Discretionary" shown where the filing states a full formula (hourly review, batch 18)
- **Wrong:** Grandsouth Bank's notes state "matches 100% of the
  employee's contributions that do not exceed 3% … plus 50% … between 3%
  and 5%" — but "do not exceed" wasn't a recognized cap connector, the
  formula patterns missed, and a discretionary sentence elsewhere won:
  the site showed "Discretionary — set year to year" over an explicit
  two-tier formula. Center Line's second tier ("plus an additional 50% of
  contributions exceeding 3%, but not more than 5%") was also dropped.
- **Change:** "do(es) not exceed" joins the cap connectors; the
  exceeds-tier pattern accepts "exceeding", "but not more than", and the
  "an additional" filler. Bonus: Annapolis Pediatrics' QACA formula
  (batch-16 "no formula stated") now extracts via the same connector.
- **Prevention:** Grandsouth, Center Line, and Annapolis join the corpus.
  Life Storage (33%/5%) and Ideal Credit Union verified exact this batch.

## 2026-07-28 — spelled fractions and "N% match of" tier phrasing (hourly review, batch 19)
- **Wrong:** Opus Inspection's "discretionary matching contribution equal
  to one-half of the first 8% of base compensation" showed only
  "Discretionary" (the spelled fraction beat the digit patterns), and
  TCGplayer's second tier ("and 50% match of the participant's
  contributions between 3% and 5%") was dropped because "match" sat
  between the rate and "of".
- **Change:** one-half/one-third/one-quarter/two-thirds map to
  percentages (the audit accepts the word form in quotes); the
  exceeds-tier pattern tolerates "match" after the rate.
- **Prevention:** Opus and TCGplayer join the corpus. FDIC-as-receiver
  for Signature Bank and Inland Bancorp verified exact this batch; Banc
  of California and Tredence are scanned attachments (OCR path,
  runner-parity sampling queue).

## 2026-07-28 — affirmative "no employer contributions" statements captured (hourly review, batch 22)
- **Wrong:** Amphenol's filing states "The Plan does not provide for
  employer contributions." — a by-design answer we reduced to the weaker
  "$0 this year" inference from Schedule H.
- **Change:** new `noEmployer`/`noEmployerText` feature captures the
  affirmative statement (display wiring in the next frontend pass, with
  the frozen banner precedent).
- **Prevention:** Amphenol joins the corpus. Also verified this batch:
  Medical Management International's "for plan year 2022" era label is
  GENUINE (2022 formula in a 2023 filing) — the v24 heuristics survive
  adversarial sampling; Registered Agents' safe-harbor formula recovers
  via v26's "that do not exceed" connector; New London Hospital and
  Kinsley vesting absences honest.

## 2026-07-28 — tenure-graded nonelective tables (hourly review, batch 24)
- **Wrong:** Colorado Academy contributes 6%–10% of pay rising with years
  of service, stated as a schedule table — no pattern fit, so a plan whose
  employer contributes for everyone showed "not stated".
- **Change:** "contributes a percentage of compensation based on the
  following schedule" tables render the range ("6%–10% of pay, rising
  with years of service") with the table quoted.
- **Prevention:** Colorado Academy joins the corpus. Clutter, Graham
  Engineering, and Crucible verified exact this batch (3/3); Metairie
  Bank is a scanned attachment (OCR queue).

## 2026-07-28 — "up to the first N%" connector variant (hourly review, batch 25)
- **Wrong:** P2ES Holdings' required match ("50 percent of elective
  deferrals up to the first 8 percent of eligible compensation") missed —
  the cap connector expected an article ("up to a"), not "the first".
- **Change:** "the first" joins the connector's article set (main pattern
  and the era-retry copy).
- **Prevention:** P2ES joins the corpus. Nebraska Methodist verified
  correct (discretionary + 3-year cliff; its quote is the vesting
  sentence — cosmetic); Maple Knoll and Omnion are form-only.

---

## 2026-07-31 — cross-sentence match fusion, three variants (v28 audit mismatch review)

The 31 persistent formula-vs-quote mismatches in the v27/v28 audits turned
out to be at least three distinct real-defect classes, all sampled by hand
against their filings:

- **Wrong (fused discretionary + safe harbor):** "The Company may
  contribute a discretionary match of 6 percent of the first 4 percent…
  The Company makes a safe harbor matching contribution equal to 100
  percent … 3 percent, plus 50 percent … between 3 percent and 5 percent"
  extracted as "6% of the first 4% + 50% of the next 1%" — the head came
  from the hedged discretionary sentence and the tier fallback's 400-char
  window chained the NEXT sentence's safe-harbor clause onto it,
  fabricating next = 5%−4% = 1%.
- **Wrong (superseded head):** "The Company contributes 100 percent of the
  first 5 percent… Effective January 1, 2022, the Plan changed the safe
  harbor contribution formula to contribute 200 percent of the first 2
  percent … and 100 percent of the next 3 percent" extracted as "100% of
  the first 5% + 100% of the next 3%" — old head, new tier.
- **Wrong (enumerated clauses):** "a) a matching contribution of 100% of
  participant contributions for the first 1% … and b) … 50% … up to the
  next 5%, up to a maximum of 6%" (Rotary) extracted as "50% of the first
  6% + 50% of the next 5%" — "for the first" phrasing wasn't a bindable
  head, so the maximum-of shape grabbed clause b)'s rate with the 6%
  TOTAL cap, then re-counted clause b) as a tier.
- **Change:** (1) a hedged "may … discretionary" head yields to a definite
  formula within 600 chars; (2) tier continuation stops at a sentence
  boundary when the next sentence carries its own match head; (3)
  "effective …, changed the … formula to contribute X% of the first Y%"
  re-anchors the head (mirror of the "prior to" era rule); (4) "for the
  first N%" joins the head alternations ahead of the maximum-of shape.
- **Prevention:** all three filings join the corpus; 250-filing old-vs-new
  diff ran clean (zero unintended changes). Remaining mismatch class
  (quote windowed past the leading rate, formula itself correct) is
  cosmetic — next review cycle.

## 2026-07-31 — Kast Construction (owner-submitted): Roth-last phrasing, "vested immediately" order, PS schedule displacing the match's (v30)

- **Wrong:** Kast (EIN 980456507) showed no Roth and no vesting despite the
  filing stating both. Three gaps: (1) "designate … deferral contributions
  as after-tax contributions into a Roth account" puts Roth LAST — both
  Roth patterns required Roth before the contribution words (the after-tax
  veto correctly suppressed the after-tax flag; the Roth flag just never
  set). A common auditor template — 5 more filings in the 250-specimen
  corpus gained Roth from this fix alone. (2) "are vested immediately" word
  order wasn't in the immediate-vesting regex (only "immediately vested").
  (3) Plans whose safe-harbor match vests immediately but whose
  discretionary profit sharing is graded/cliff showed the PS schedule as
  THE vesting — the match is the plan's active employer money and its
  schedule should lead, with the quote disclosing scope.
- **Change:** contribution-words-then-"into/to/as a Roth" joins the Roth
  patterns; "vested immediately" joins the immediate regex; a graded/cliff
  sentence scoped only to non-elective/profit-sharing money no longer
  displaces a stated immediate match schedule.
- **Prevention:** Kast joins the corpus. 250-filing diff: 18 diffs, all
  intended classes (5 Roth gains, 7 vesting fills, 3 PS-displacement
  corrections verified by hand against their quotes). Also filled 7 fund
  expense-ratio patterns Kast's lineup exposed (Lord Abbett Growth Leaders,
  T. Rowe Mid-Cap Value & Spectrum Conservative, Diamond Hill Large Cap,
  BlackRock High Yield, Columbia Emerging Markets, American Balanced — the
  last also catching the "America Funds" filing typo); all values remain
  estimates labeled "est." per the standing rule.

## 2026-07-31 — O'Neal Steel (owner-submitted): spelled-out numbers; tier regex crossed the word "percent" (v31)

- **Wrong:** O'Neal Steel (EIN 630196990) showed NO match and vesting
  "Immediate" although the filing states "a safe-harbor match of one
  hundred percent of the first one percent and fifty percent of the next
  five percent" and "become one hundred percent vested in the Sponsor
  safe-harbor matching contributions after one year of service" — every
  number spelled out in words, which no head/tier/cliff/immediate pattern
  accepted. Owner's 2026 benefits book independently confirms both (100%
  of first 1% + 50% of next 5%; 1-year vesting on employer money).
- **Also wrong (silent digit-era bug found by the fix):** the tier regex's
  gap guard excluded only the '%' CHARACTER, so filings phrased with the
  word "percent" let the gap cross another rate — "matches 100 percent of
  the first 3 percent … and 50 percent of the next 2 percent" shipped as
  "+ 3% of the next 2%" (rate bound to the head's cap). The quote
  contained the numbers, so the formula-vs-quote audit could not see it.
- **Change:** match head/tier patterns and the cliff/immediate vesting
  patterns accept spelled numbers (rendered as digits via W(); quotes stay
  verbatim); the tier gap now refuses to cross the WORD "percent" via
  lookahead; the audit's number check recognizes spelled forms in quotes.
- **Prevention:** O'Neal joins the corpus (also exercises the v30
  match-priority rule: its mixed sentence "immediately vested in
  non-elective … matching after one year" now correctly yields 1-year
  cliff, the match's schedule). 250-filing diff: only the intended
  changes, including one bonus tier correction verified against its
  filing text. Brokerage-window note: O'Neal's SDBA was already extracted,
  indexed, and displayed — the "missing brokerage" report traced to the
  live site serving a main branch 7 commits stale; mirrored. The filing
  never names the BrokerageLink brand, so the site's generic
  "Self-directed brokerage" label is the honest filed answer.

## 2026-07-31 — Verizon Master Savings Trust: letter-poor name residue dropped the $2.77B government-securities row (v32)

- **Wrong:** the trust's class-level 4i summary (the honest lineup for all
  four Verizon plans, $41.1B combined) displayed 11 of its 12 rows —
  "U. S. GOVERNMENT SECURITIES" ($2,765,872,513) was silently missing, so
  the shown holdings summed to $36.16B against the filing's stated
  $38.93B total.
- **Why:** the type-phrase name stripper matched /government securit/ at
  index 6 and cut the name to "U. S." — two "words", so it passed the
  ≥2-word guard — and the downstream non-name residue filter (letters < 3)
  then discarded the whole row instead of falling back to the full name.
- **Change (v32):** a cut name must also keep ≥3 letters; otherwise the
  full name is retained. The row now survives as "U. S. GOVERNMENT
  SECURITIES" with the Government-securities type from classify().
- **Prevention:** Verizon trust summary joins the regression checks with
  its exact 12-row sum (38,926,187,308); 20-specimen before/after diff
  showed only the intended change. The audit's lineup-sum check couldn't
  see this because MTIA lineups aren't cross-checked against trust
  assets — plan-level Sch H is. Related honest gaps recorded while
  investigating: the Verizon Management plan's own 2025 filing
  (ack 20260622130903…) returns 403 from the EFAST2 S3 bucket (not yet
  public; siblings from the same day serve fine) — it will retry on
  future version bumps; and the trust's per-security detail pages carry
  ~26 NAMED funds (CCT/PSA/RIC subtotal-adjacent rows: Fidelity Magellan
  Commingled Pool, EB Daily Liquidity Stock Index at $11.0B, Arrowstreet
  Global Equity, Verizon PRISA Fund, DFA Micro Cap, …) that the
  summary-wins rule intentionally passes over — a future enhancement
  could surface named pooled-vehicle rows without re-admitting the
  per-security flood.

## 2026-08-01 — v32 side effect: kept column-glue rows let statement pages outscore real 4i tables (v33)

- **Wrong (introduced by v32, caught in the same night's verification diff
  before mirroring to main):** keeping rows whose letter-poor cut was
  COLUMN GLUE — statement values swept into the name cell like
  "6,793,341 $ 6,793,341 $ - $ - Common Collective Trusts" — added rows to
  financial-statement regions, and in region scoring a statement page then
  beat the real 4i table. Worst case ack 20251014135916…957697: a real
  25-fund State Street lineup was replaced by 3 statement fragments WHILE
  STILL MARKED CONFIDENT. Also demoted one confident lineup to
  non-confident and appended junk rows to two others.
- **Change (v33):** a letter-poor cut containing glue markers ($, |, or a
  thousands-grouped number) surfaces the cut so the residue filter drops
  the row exactly as it did before v32; letter-poor cuts that are clean
  punctuation prefixes ("U. S.", "EQ /", "20 Pl") still keep the full
  name. Verified across all 33 entries v32 changed plus the 20-specimen
  regression set: the State Street lineup returns, every intended v32
  recovery (Verizon govt row, ~10 "EQ / Money Market" rows, "20 Plus
  Treasury Bond Fund F") survives, and no entry ends worse than its v31
  state.
- **Known remaining defects (pre-existing, v32 had accidentally fixed
  them via the same unsafe mechanism):** acks 20251008082518…266417,
  20260130102131…208033, and 20251014104258…251491 (a $2.26B plan whose
  28-fund BlackRock LifePath menu briefly surfaced under v32) show
  confident lineups of 3-4 generic statement rows instead of their real
  menus — proper fix is scoring statement
  regions down (or excluding glue-kept rows from scores), not keeping
  glue rows. Queued with the other v33+ candidates: temporal formula
  ranking (ack 20250903063307 shows the pre-April-2023 formula) and OCR
  "SO percent"→"50 percent" normalization (ack 20251014120944 lost its
  second tier).
- **Prevention:** verification diffs after a parser release now
  explicitly include the FULL universe-wide lineup diff of the data
  commit, not just the targeted specimens — this regression was invisible
  in the 20-specimen set and the audit (the junk lineup still summed
  plausibly) and only surfaced in the v31→v32 whole-data diff.

## 2026-08-02 — statement pages beat real fund tables because filings render the schedule TWICE (v34)

- **Wrong:** three confident lineups (acks 20251008082518…266417,
  20260130102131…208033, 20251014104258…251491 — the $2.26B Avangrid
  plan) showed 3-4 Statement-of-Net-Assets rows ("Investments, at fair
  value", "Mutual funds", "Cash") instead of their real 26/47/28-fund
  menus. Root cause found by instrumenting region scores: NOT the
  statement page scoring high — the REAL table scoring low, because
  (a) filings usually render the schedule twice (auditor statements +
  form-page attachment copy) and cluster-merged regions summed both
  copies (ratio 2.7/2.0 instead of ~1.0), and (b) EIN-heading lines
  glued to column values ("SPONSOR EIN: 23-" = $1.6M fake holding)
  inflated single-copy sums. The by-construction-perfect statement page
  (sum ≈ plan assets) then won on closeness.
- **Change (v34):** identical (name, value) pairs within a region count
  once (repeated-page dedup; differing values still sum for share
  classes); EIN/plan-number heading rows are dropped as junk; and a
  belt-and-braces statement-vocabulary penalty (-0.35 for ≤8-row regions
  that are ≥50% statement line items — trustee CLASS summaries like
  Verizon's are ≥10 rows and unaffected); bare "Brokerage Account" rows
  now classify as the brokerage window.
- **Prevention:** the three filings join the regression corpus with
  their expected menus and ratios (0.998 / 0.987 / 0.803 — the third via
  the production OCR recipe reproduced locally); 52-specimen sweep shows
  only intended changes (two more lineups shed EIN junk rows); the
  mandatory full-universe diff at the post-run check-in verifies the
  fleet-wide effect before mirroring.

## 2026-08-03 — v34 verification: dedup also fixed STATEMENT pages' ratios; 22 tiny fragments displaced real menus (v35)

- **Wrong (v34 side effect, caught in the mandatory universe diff before
  mirroring):** the repeated-page dedup repaired double-rendered ratios
  for statement fragments too — 22 plans' confident 15-35 row menus were
  displaced by 2-3 row class-aggregate fragments ("Registered investment
  companies", "Pooled separate accounts, at fair value") whose deduped
  sums now matched plan assets (Shintech: 20 Vanguard funds → 2 rows).
  Also: two OCR-garbled filings still showed confident "lineups" of
  dotted-leader form text, and "E.I.N.:"/"Plan #001 EIN #82-" variants
  slipped the EIN junk filter (one $5.2M fake holding in a confident
  lineup).
- **Change (v35):** the statement penalty also covers ≤3-row regions of
  class/statement aggregates (classy counts toward the threshold);
  statement vocabulary gains suffix/variant forms (pooled separate
  accounts + suffix, guaranteed investment/interest accounts, space-form
  common collective trust); rows with 6+ dot leaders are dropped as
  form/TOC lines; the EIN filter catches E.I.N. and trailing EIN#NN-
  forms.
- **Verified:** Shintech back to its 20-fund menu (0.712), Scantibodies
  33 rows (real JP Morgan/Schwab menu, EIN rows gone), Cotton Holdings
  21 rows (Principal Lifetime menu); all v34 targets intact (JF Martin
  26 / Atlanta IEC 47 / Avangrid 28 via OCR repro / Verizon 12-row sum
  exact); 52-specimen sweep shows only junk-row removals; the two
  form-garbage filings now honestly find no section (production re-OCRs
  them). v34's overall universe effect (kept): +549 confident lineups,
  5,898 entries touched, 91 tiny junk regions honestly demoted.

## 2026-08-03 — AVI-SPL (owner-submitted): four defects in one filing (v36)

- **Wrong (all four verified against the owner's uploaded 2023+2024
  filings):** (1) a confident 5-row "lineup" of OCR'd statement fragments
  — worse, valued from the PRIOR-year comparative column ("Registered
  investment companies … $205.8M" is the Dec-31-2023 figure in a
  plan-year-2024 filing); (2) match shown as a standing formula
  ("22.5% of the first 6% of pay") when the filing says the match is
  DISCRETIONARY with a per-period declared rate; (3) the clean 6-year
  graded vesting table (0/20/40/60/80/100%) extracted nothing — its
  header variant puts "Vested" above "Years of Service / Percentage";
  (4) afterTax:true from a sentence that says the plan was AMENDED TO
  REMOVE after-tax contributions — a false positive feeding the
  mega-backdoor chip.
- **Root context:** the 2024 filing's public copy (EFAST2 and the owner's
  own copy are byte-identical, 34 pages) genuinely OMITS the schedule of
  assets page — the filer attached an incomplete statement set. The 2023
  filing carries a perfect 41-fund text schedule. No parse of the 2024
  copy can produce a lineup; the honest state is the gap message.
- **Change (v36):** statement/note junk rows ("Net income per Form
  5500", "Interest and dividend income", "Contributions receivable",
  "Participants may borrow", "Notes receivable") drop in parseRows; the
  winning candidate's statement flag now rides through parse4i and
  fetch-4i marks such fragments NEVER confident (previously a
  statement-only filing's fragment could pass the ratio band); vesting
  table headers accept the "Vested / Years of Service / Percentage"
  order; declared-rate discretionary matches render as "Discretionary —
  YYYY declared: …"; an amendment removing after-tax sets the field
  affirmatively false with the removal quote.
- **Prevention:** AVI-SPL joins the corpus (both years); 52-specimen
  sweep clean (one bonus junk-row removal); Avangrid OCR menu and all
  v34/v35 targets intact. Open idea from this case: fall back to the
  PRIOR year's filing for the lineup when the newest filing's attachment
  omits/scans the schedule, labeled with its plan year — would recover
  AVI-SPL's 41-fund menu and likely part of the ~7k no-section class.

## 2026-08-03 — Avista (owner-submitted): cipher schedule pages evade OCR detection; hire-date cohort mislabeled as stale formula (v37)

- **Context:** the owner's upload was Avista's PENSION plan (PN 001) —
  out of scope by design (DB plan). The review moved to the 401(k)/ESOP
  (PN 003, $843M) wampo displays, whose entry was non-confident junk.
- **Wrong:** (1) the filing's schedule-of-assets pages carry subset-font
  CIPHER text at 63% letter ratio — above the 50% bad-page threshold —
  so they were never OCR'd, and the whole 32-fund menu (ratio 0.990,
  incl. company stock and the SDBA fund) was lost while OCR'd statement
  pages produced junk; (2) match shown as "75% of the first 6% (formula
  in effect prior to 2006)" — but "prior to January 1, 2006" modifies
  EMPLOYEES HIRED (a cohort), not the formula: current hires get 100% of
  the first 6%; (3) vesting missed because the notes phrase it "vest
  100% … after one year" (verb before the percent), an order the cliff
  pattern lacked.
- **Change (v37):** findBadPages flags pages containing >15 control
  characters (honest pdftotext output never has them) regardless of
  letter ratio; the era guard skips "hired prior to …" cohort phrases;
  when the first-found formula is the legacy cohort's, the current-hire
  cohort's formula is preferred (hire-split label still marks the
  variation); cliff vesting accepts "vests 100% … after N years" order.
  Verified: Avista → 32-fund confident menu, match "100% of the first 6%
  of pay (varies by hire date)", 1-year cliff (match schedule), NEC 5%,
  Roth, 3% auto-enroll. 56-specimen feature sweep sane (one "400% of the
  first 1%" verified verbatim in its filing); AVI-SPL v36 results intact.

## 2026-08-03 — GE Vernova (owner-submitted): first-year plans invisible — universe filter reads only the BEGINNING-of-year count

- **Context:** the owner asked why the GE Vernova Retirement Savings Plan
  (ROPCOR, INC., EIN 61-1399608, PN 004 — the April 2024 GE spinoff)
  doesn't show up. It filed a 2024 first return/report with a SHORT plan
  year (Apr 2–Dec 31, 2024): $8.1B in assets, 32,995 participants at
  year end — and 0 at the beginning, because the plan didn't exist yet.
- **Wrong:** build-data filtered on line 5 (TOT_PARTCP_BOY_CNT) ≥ 100
  only, so EVERY new large plan — spinoffs, new MEPs — was silently
  excluded for its entire first filing year. The SF path had the same
  gap. Once visible, the short year would also have been mislabeled
  "Plan Year Apr 2024–Mar 2025 (fiscal)" by the pyb-only frontend rule.
- **Change:** filter keeps a plan when max(BOY, line-6d EOY subtotal)
  ≥ 100; displayed participants stay BOY when BOY ≥ 100 (existing rows
  byte-identical), else the EOY count. New `pye` field in plans-all,
  stored ONLY when the year end is off the natural 12-month boundary;
  frontend renders "Plan Year Apr 2024–Dec 2024 (short year)" and the
  contributions header "Apr–Dec 2024" when present. GE Vernova's
  composite PDF carries a real Schedule of Assets (SSGA menu, total
  $8,145,458,662 ≈ Sch H), so the parser gets a real lineup once the
  prep run lands.
- **Prevention:** the rescue rule is symmetric (any sub-100 BOY with
  ≥100 EOY enters), so plans that cross the threshold by growth arrive
  a year earlier too; audit-data's balances-vs-total identity now
  compares EOY against EOY for these rows, which is the consistent pair.

## 2026-08-04 — v37 verification: download failures clobbered good entries; range-mode pdftoppm silently truncated OCR page sets (v38)

- **Context:** v37 post-run diff: +50 confident (cipher-page class incl.
  Avista, verified), −7. Two of the 7 losses were honest (junk lineups
  demoted); five were NEW defects found by sampling the losses.
- **Wrong (1):** a failed PDF download re-recorded the ack as
  `{pv:current, e:download, funds:[]}` — clobbering the previous good
  parse AND advancing pv so it wasn't even retried until the next
  version bump. Three confident menus died this way in one night
  (S3 403s: filings withdrawn from the public bucket; plus transients).
- **Wrong (2):** ocrPages merged bad pages into contiguous pdftoppm
  ranges; ONE damaged page (broken Type 3 glyphs) crashed the whole
  range invocation and silently dropped every later page. Cochrane
  (20250924093907...): v37's correct cipher-page detection joined pages
  18-34 into one range, pdftoppm died at 29, pages 29-34 — the fund
  schedule — never rendered, and a 21-fund ratio-1.000 menu became
  "no-section". The bug predates v37 (v36's range [21-31] also died at
  31) — every OCR'd filing with a damaged page may have lost tail pages.
- **Change (v38):** download failures now preserve the previous entry
  and status verbatim (old pv keeps the ack on the retry list; merge
  treats an ack absent from delta.entries as "leave stored entry
  alone", null as explicit removal); never-parsed acks record pv:0 so
  they retry too. ocrPages renders ONE page per pdftoppm call — a
  damaged page costs only itself (verified: all 20 Cochrane pages
  render individually; parse recovers 21 funds at 1.000 WITH cipher
  pages included). The two 403-clobbered confident menus (25 and 27
  funds) restored from v36 data with e:download status. PARSER_VERSION
  38 re-parses the universe with honest page rendering.
- **Prevention:** the verification loop itself caught both — sampling
  the LOSS side of the diff is mandatory, not optional; losses that
  correlate with e:download or with damaged-page warnings are pipeline
  defects, not parser regressions, and the fix belongs in the pipeline.

## 2026-08-04 — GE Vernova: trailing footnote letters hid every value; two section headers missing from type vocabulary (v39)

- **Context:** v38 verification. GE Vernova entered the universe as
  designed (33,134 participants, $8.2B, short-year fields correct) but
  its lineup parsed non-confident: the fair-value NOTE region (in
  thousands) won because the REAL 4i schedule parsed 0 rows.
- **Wrong:** the schedule's every value line ends in footnote-letter
  runs — "442,273,650 (a), (b), (c)" — so the line-terminal value regex
  never matched and the honest region self-eliminated. Separately,
  "Corporate Stocks - Common" and "Collective Funds" aren't in
  TYPE_PATTERNS, so the section-header guard let them glue onto fund
  names.
- **Change (v39):** parseRows strips trailing footnote-letter runs
  (≤4 of "(a)"-style markers) exactly like the OCR "**" fix; TYPE
  vocabulary gains corporate-stocks and collective-funds stems.
  Verified: GE Vernova → 17 funds, ratio 0.985, correct types (GE
  Vernova + GE stock, BlackRock CCTs, SSGA funds). Regression: TK
  Elevator, Northrop Grumman, Kohler, Black Hills all byte-match their
  stored v38 parses.
- **Prevention:** this is the third "value hidden by trailing markers"
  variant (**, OCR **, footnote letters) — parseRows now normalizes all
  three before value matching, and any future "region parses 0 rows
  despite a 4i heading" finding should check the raw line tails first.

## 2026-08-04 — v39 verification: unconditional footnote strip minted fake values from "401(a)"; class stems in TYPE_PATTERNS re-typed trustee summaries (v40)

- **Context:** v39 landed GE Vernova (17 funds, 0.99 confident) but the
  diff read +13/−38 and Verizon's trust summary shrank 12→10 rows —
  both new defects introduced BY v39's two fixes.
- **Wrong (1):** the trailing-footnote strip ran unconditionally, so
  "Total Fidelity Retirement Contribution and 401(a)" became "…401",
  whose bare digits matched the value regex: the wrapped-subtotal
  defense broke (UPenn Health System's $1.1B "Matching Program" total
  parsed as a holding, ratio 2.0, menu demoted) and form-page "401(k)"
  lines faked ≥2-row parses whose found:true SUPPRESSED the OCR
  fallback (a 25-fund OCR menu vanished with no error).
- **Wrong (2):** adding corporate-stocks/collective-funds to
  TYPE_PATTERNS re-typed Verizon's trustee CLASS-summary rows
  ("CORPORATE STOCK - COMMON" $9.7B) into the managed-account bucket —
  class detail lost, mislabeled.
- **Change (v40):** the strip now fires only after a COMMA-GROUPED
  number ("442,273,650 (a), (b), (c)" still cleans; "401(a)"/"401(k)"
  untouched); the class-header vocabulary moved OUT of TYPE_PATTERNS
  into the valueless-line header guard where it can't touch valued
  rows. Verified on all six live specimens (UPenn 30@0.999 restored,
  form-only found:false → OCR re-enabled, CCT 4@0.94, GEV 17@0.985,
  Verizon 12 rows exact, Cochrane) + four standing specimens
  byte-match.
- **Prevention:** BOTH v39 defects were introduced by fixes verified
  only on the filing being fixed plus byte-match specimens — neither
  specimen set exercised wrapped subtotals, form-only filings, or
  trustee summaries. The six-specimen live set above (menu + subtotal
  wrap + form-only + tiny-CCT + trust summary + OCR base) is the new
  minimum pre-push gate for ANY parseRows/TYPE_PATTERNS change; run it
  before bumping PARSER_VERSION.

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
