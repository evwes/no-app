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

## 2026-08-07 — Fee schedule launch review: service codes empty in every provider row (+ a testing-environment trap documented)

**What was wrong (caught in pre-mirror verification, never shipped to
users).** All 155,023 Schedule C provider rows across the new data/fees
shards carried an empty `c` (service codes) field, so the provider
table's "Services" column rendered "—" for every provider. The ITEM2
extract's PROVIDER_OTHER_SRVC_CODES column exists in the header —
project memory even asserted it was populated ("no separate codes table
needed") — but it ships blank in the Latest files; the filed codes (TK
Elevator: Fidelity "37 60 64 65 71", Plante & Moran "10", verified
against the filing PDF) live in the F_SCH_C_PART1_ITEM2_CODES child
table, one row per code, keyed by ACK_ID+ROW_ORDER.

**The change.** build-data ingests the ITEM2_CODES child table (header
logged, defensive column resolution, falls back to the inline column if
a year ever populates it).

**The prevention.** audit-data now enforces an aggregate floor — HIGH
finding if <50% of provider rows carry service codes (a present-but-empty
column passes every row-level check; only aggregate coverage sees it).
Memory rule reinforced: a column existing in a dataset header is NOT
evidence it is populated — check value coverage before building on it.

**Also found, NOT an accuracy defect: sandbox renderer freeze.** During
verification, deep-linked pages appeared stuck at "Loading the provider
fee table…" locally. Root cause after extensive tracing: the CCR
sandbox's headless Chromium freezes the renderer ~1s after load absent
user activation — timers stop and already-received response bodies are
never delivered to page JS (network reports finished; `json()` never
resolves; evaluate still works, which makes it look exactly like an app
async bug). A single synthetic click unfreezes everything and the page
renders correctly; the shipped code needed no change (an initially
committed "re-arm" patch built on the wrong theory was reverted). The
smoke test now clicks after load — imitating a real visitor — and then
asserts the fee section resolved, which keeps the check honest in both
frozen and normal environments.

## 2026-08-09 — v42: spaced dot-leaders read as "words" — the prose filter silently emptied whole real menus (Costco class)

**What was wrong.** Filings that typeset spaced dot-leaders between the
issuer and description columns ("PIMCO . . . . . . Income Institutional
. . . ** $610,665" — Costco, and the wider class the F500 audit flagged
as no-lineup with section-found status) lost nearly every holding: the
prose-sentence guard counts whitespace-separated tokens, each ". " leader
dot counted as a word, and any leadered row without a literal "$" looked
like >14-word prose. Costco's $41.5B plan parsed to a single junk row
("PIMCO . . . . ." with leaders intact — the v41 leader recovery only
matched CONSECUTIVE dots, not spaced ones). Found via the Fortune 500
coverage audit's no-lineup diagnostics, confirmed against the filing PDF.

**The change (v42).** (1) The prose filter excludes bare dot tokens from
its word count; (2) the leader-strip recovery also fires on spaced runs
(`(?:\.\s){4,}`) and strips them (`(?: ?\. ){3,}`) — initials like
"U.S." carry only two dots and never match. Costco now parses 30 funds,
ratio 0.97, confident: the full T. Rowe Price target-date family,
$18.3B company stock, and the managed-account bucket classified.

**The prevention.** Costco joins the parser gate as a permanent live
specimen (n=30, sum $39.0B); the gate runs before every universe parse.
Lesson recorded: token-count heuristics must normalize typography
(leaders, column glue) BEFORE counting — a filter that never sees clean
text can't judge it.

**Re-parse verification (run 31326177741).** Full-universe diff: +2 / −1.
Gains: Costco ($41.5B, 30 funds) and Panera Bread (30,381 participants,
26-fund Vanguard menu, previously nothing) — the spaced-leader class is
real but SMALL universe-wide; the other F500 no-lineup flagships fail
for different reasons (State Farm's stmt-flagged umbrella row, JPM's
scan). The one loss, Plexsys ($36M), was investigated per protocol:
v41 and v42 parse its current filing IDENTICALLY (61 rows, ratio 2.02 —
the filing renders its schedule twice, and the second rendition glues a
"0" cost column into names, defeating the same-name dedup). The old
entry was a prior-year fb:2023 fallback that no longer engages; net
effect is an honest gap replacing a stale-year lineup — accepted.
**v43 candidate:** normalize names (strip trailing " 0" column glue)
before the dedup merge — both renditions would collapse, ratio → ~1.0,
recovering the double-render class properly. Plexsys
20260706150053NAL0023514192001 is the specimen.

## 2026-08-10 — Eaton (owner-submitted): trust-pointer page displayed as a confident "lineup" (incl. a zip code as a $44k fund); the trust's real menu lost to cents-formatted values; substring search outranked the named company (v43)

**What was wrong.** The owner searched "Eaton corp" and got two defects at
once. (1) Eaton Savings Plan ($8.4B, EIN 34-0196300/055) displayed "FUND
HOLDINGS — 3 FILED": "Master Trust N/A" $8.0B, "Interest in Eaton Stable
Value Fund - See" $292.4M, and "CLEVELAND" $44,122 — that last "fund" is
the sponsor's ZIP code (44122) read off the form's address block, because
the 4i region runs to the signature page and the address-line guard in
SKIP_ROW only matched the comma form ("Cleveland, OH 44122") while
`-layout` renders it columnized ("CLEVELAND   OH   44122"). The page is a
trust POINTER — its 3 rows at ratio 0.99 sailed through the confidence
rule (≥3 funds, ratio 0.7–1.3), and the junk displaced the honest gap.
(2) The real menu exists in the Eaton Savings Trust's own filing (EIN
47-5346861, linked via Schedule D since the first parse) but every value
there carries CENTS ("$175,869,410.45") and valueRe demanded a
line-terminal comma-grouped INTEGER — zero rows parsed, c:0, so the
frontend's trust-preference logic had nothing to fall back to and showed
the pointer rows as a last resort. (3) Search ranked substring matches
(Wheaton College, Neaton Auto) level with the company actually named.

**Why it survived this long.** No specimen in the regression set files
cents-formatted values — the class was invisible to the gate. The
trust-pointer hole was HALF-known: Kohler's 1-row variant is a specimen,
but 1 row fails the ≥3-funds rule on its own, so no confidence guard for
the 3-row variant (pointer + stable value + a junk row) ever existed.
The zip guard was written against the comma rendering seen in Aramark and
never re-tested against columnized addresses. Search ranking was a known
cosmetic issue that never got prioritized — wrongly, since search is the
front door.

**The change (v43).** (1) valueRe tolerates cents (`(?:\.\d{1,2})?`);
rates like "10.50" still fail the 3-digit minimum. Three new row guards
keep cents layouts clean: "$0.00" holdings drop instead of gluing into
the next row's name, line-terminal parenthesized negatives (accrued
fees/liabilities on trust fund-accounting pages) drop, and columnized
`CITY  ST  12345` lines drop. (2) parse4i flags parses where
trust-interest rows dominate (≤8 rows, ≥60% of the sum) as `trustPtr`;
isConfident rejects them, and the TYPE_PATTERN now matches named-trust
phrasing ("Interest in Eaton Savings Trust Master Trust"). (3) app.js
never displays a majority-trust-pointer lineup as a last resort — the
honest gap wins until the trust parses. (4) visiblePlans applies
relevance tiers under every column sort: exact/word-boundary sponsor
or ticker matches first, mid-word prefixes next, substrings last.
Result: the plan page now shows the trust's real 51-fund menu (ratio
0.999 — full LifePath family, Vanguard 500 $772.3M, Eaton shares $2.1B),
and "eaton" ranks both Eaton Corporation plans first.

**The prevention.** Both Eaton filings join the parser gate as permanent
live specimens: the plan (n=2, sum $8.31B, trust-pointer) and the trust
(n=51, sum $8.53B, cents). Gate is 13 specimens, all green. `tp:1` in
lineups-status marks every trust-pointer parse so the class is countable.
Lesson recorded: a confidence rule keyed to count+ratio treats a POINTER
at the right total as a lineup — provenance-shaped rows (interest-in-X)
need their own class, not just better thresholds.

## 2026-08-10 — v44: proactive universe sweep for Eaton-class junk in CONFIDENT lineups (owner directive: apply the learnings everywhere)

**What was wrong.** After the Eaton fixes, a scan of all 55,961 confident
stored lineups for junk signatures found five more classes being displayed
as "FUND HOLDINGS" (each verified by hand against the actual filing before
a pattern was written):

1. **Statement rows in 631 lineups** — "Investments, at fair value" was
   only skipped in its comma-less spelling; the comma/dash variants leaked,
   and in the worst filings the row is 80–97% of the shown sum (one $259M
   "lineup" was just a Statement of Net Assets). Verified: comma variant
   confirmed in 20250930101132NAL0005432355001 (via its fb:2023 entry) and
   others.
2. **Administrative-expense notes in ~25 filings** — two-column expense
   schedules ("Payroll taxes 79,790 74,287") parse the PRIOR-year column
   as a value; "Occupancy", "Office", "Printing and postage" displayed as
   funds. Verified in NYC Carpenters 20260325100850NAL0004138785001.
3. **EIN headings in 293 filings** — "PLAN'S EMPLOYER IDENTIFICATION
   NUMBER: 34-" glued to the EIN's own digits and displayed as a $4.4M
   fund; the existing guard missed the possessive "PLAN'S" form. Verified
   in 20251014145624NAL0001541123001.
4. **Page carry-forward subtotals** — "Forward $21,786,094 $23,237,830" at
   the top of every continuation page; the same-name dedup SUMS the
   distinct per-page values into a fake nine-figure holding ($197.5M in
   20251008154534NAL0005779537001). With Forward dropped, that filing's
   statement parse honestly fails the ratio band — a junk-confident entry
   becomes a truthful gap.
5. **"N/A" cost-column glue in 1,262 filings (20,494 rows)** — "500 Index
   Fund N/A"; plus "(see Note 5)" cross-refs, trailing "#" footnote
   markers, and "- See" truncations in fund names. Cosmetic, but at scale
   it reads as sloppiness and erodes trust in the numbers next to it.

Also shipped: the v43-recorded Plexsys candidate — double-rendered
schedules whose second rendition glues a "0" cost column onto names,
defeating dedup (ratio 2.02). Stripping the lone trailing "0" collapses
both renditions; Plexsys recovers a confident 32-fund Vanguard menu at
ratio 1.04.

**Why they survived.** Same root cause as Eaton: every guard was written
against the specific rendering that produced a known defect, and no sweep
ever hunted the PATTERN CLASS across stored output. The audit checks
identities (sums, counts) — junk rows that are small, or statement rows
that make the sum look RIGHT, pass identity checks by construction.

**The change (v44).** SKIP_ROW: comma/dash-tolerant
"investments,? at (fair|contract) value". Name filters: bare accounting
nouns (payroll/occupancy/office/printing…), signature/"amounts per Form
5500" boilerplate, possessive EIN headings, carry-forward subtotals.
Name cleanup: strip "N/A" tokens, "(see Note X)" refs, trailing "#",
trailing "- See", and the lone trailing "0" (dedup fix). PARSER_VERSION
44 re-parses the universe.

**The prevention.** Plexsys and the carry-forward filing join the gate
(15 specimens, all green; Eaton pair unchanged byte-for-byte). The
junk-signature scan itself (scratchpad junk-hunt) becomes part of the
daily accuracy cycle: after each re-parse, re-scan confident lineups for
the signature classes and for NEW suspicious shapes (bare single-word
names with tiny values, digit-heavy names). Known residual, recorded
honestly: NYC Carpenters-class filings where a Statement of Net Assets
outscores the real per-class 4i pages — needs region-scoring work, not
row patterns; their display is class-aggregate (defensible) with junk
rows now removed.

## 2026-08-10 — v43 re-parse verification + v45: the cents fix made appended recordkeeper statements readable, doubling regions that used to parse clean

**v43 diff (run 31411969272): +654 / −181, confident 55,961 → 56,434.**
Both Eaton plans now tp:1 with the trust confident at 51 funds — the
owner-reported page is fixed end-to-end. Losses sampled per protocol
(pull the filing, compare v42 output vs current):

- The trust-pointer cohort (Eaton ×2, a $4.96B and $3.36B and $3.25B
  "Master Trust" lineup, Dairy Farmers, …) — intended: junk pointers
  became honest gaps that fall through to trust lineups where linked.
- 20251008145355 (22-fund CIT menu) — transient: v43's parse shifted its
  dedup, v44's name normalization restores it confident (verified
  locally, ratio 0.64). Self-heals in the v44 re-parse.
- 20251015115746 (Sierra Space, real 29-fund menu, was ratio 1.0) — REAL
  REGRESSION, root-caused: the filing appends a recordkeeper "SUMMARY OF
  NET TRUST ASSETS" page after the 4i table — the same menu in ALL CAPS
  with cents values. Pre-v43 the cents were unreadable so the summary
  contributed nothing; the cents fix made it parse and the region summed
  BOTH copies (ratio 1.89 → rejected). **v45**: the summary heading joins
  stopRe (region ends there, like Portfolio Statement); Sierra Space
  recovers n=29 sum=$291,893,410 exactly, and joins the gate (16
  specimens, green). Lesson: widening what the parser can READ widens
  what junk it can read too — every reader fix needs a matching look at
  what NEW text it now ingests.
- 20251014104258 (LifePath Paycheck menu, OCR-sourced, was ratio 0.8) —
  under investigation for the daily cycle: OCR-cached text at v43 no
  longer yields a confident parse; needs the production OCR text to
  reproduce. Recorded honestly as a coverage loss, not junk on display.

**Second v43 regression, found via the coverage-history line (match
47,922 → 47,191): 902 plans silently lost their features.** All stayed
c:1; only f: disappeared. Root cause verified on
20251015151039NAL0010300146001 (23 of 54 pages scanned): the OCR
fallback is gated on `!parsed.found`. Pre-v43 these filings' 4i didn't
parse from text, OCR ran, and BOTH the lineup and the match/vesting
features came from the combined text. The cents fix made the text parse
succeed → OCR stopped running → features (which live in the scanned
notes) vanished. v42's extractor returns null on the same pdftotext
text, proving the features were always OCR-sourced. **v45 fix**: the OCR
gate becomes `!parsed.found || !features` (still requires ≥3 unreadable
pages, so fully-readable filings never OCR), and a successful text parse
is never replaced by the combined-text parse — OCR fills features, and
the lineup only when text found nothing (else the OCR'd pages could
re-add junk to a clean region). The OCR cache makes the 902-ack retry
cheap. Lesson doubled from the Sierra Space entry: every fix that makes
MORE text readable must be checked against every path gated on
readability FAILING.

Correctness mismatches 25/37,570 (0.07%); HIGHs = the 4 known baseline
contrib outliers; auto-issue #1 updated. Coverage-history is doing its
job — the match/vesting dip was invisible in the confidence diff and
only the trend line exposed it.

## 2026-08-10 — v46: removing junk rows PROMOTED a junky region into confidence (Galliano, caught by the audit the same run v44 shipped)

**What was wrong.** The v44 run's audit flagged a new HIGH: Galliano
Marine Service showed a top holding of $584M against $381M plan assets.
The filing is all-scanned; its OCR text contains a brokerage-style
statement page ("Mutual funds $583.8M / Common stocks / Exchange traded
funds / Money market funds / Other revenue"). Pre-v44 that region parsed
with extra junk rows and failed the ratio band; v44's junk guards removed
those rows and the remainder slipped INTO the band (ratio ~1.59 < 1.6,
6 rows). The isStatement gate missed it because its vocabulary knew
"mutual funds" but not the other brokerage class nouns — 1 of 6 rows
counted as statement vocabulary, under the 50% threshold.

**The change (v46).** STMT_ROW gains (common|preferred) stocks, exchange
traded funds, money market funds, other revenue/income. The Galliano
region now counts 5/6 statement rows → flagged stmt → never confident.
The raw-text parse joins the gate as found=false (all-scanned filing).
The gate flagged one intentional move: the carry-forward specimen's
statement region is now penalized too, so a per-security region wins at
ratio 2.5 — still non-confident, expectation updated after review.

**The prevention + lesson.** Every junk-row removal changes region
RATIOS, and a ratio-gated confidence rule can flip regions INTO
confidence when junk shrinks a sum — the audit's top-holding-vs-assets
identity caught it within one run, which is the machinery working. Row
guards and region-class vocabulary must move together.

## 2026-08-11 — v47: OCR'd form-page text as fund names (Galliano round 2) + the lineup-junk tripwire that found 500 more

**What was wrong.** v46 correctly demoted Galliano's OCR'd brokerage
statement — and the next-best region was WORSE: Schedule H form
instructions as fund names ("K Net income (loss). Subtract lime 2j from
lime 2C...sscesss" $55M, "companies (e.g., Mutual FUNGS)" $41M), ratio
0.53, confident. No identity check can catch it — the sum is plausible;
only the NAMES give it away. Reproduced locally by OCR'ing the scanned
pages (20 of 23) and parsing the combined text with production code.

**The change (v47).** Row guards for form-instruction vocabulary
("subtract line" incl. the "lime" misread, "(add lines 7b…)",
"(e.g.,…)", "(specify)", "type of contract", "disbursed from", "total
additions/deductions") and OCR-garbled dot-leader runs (`[sce]{8,}` —
"seecseecsess…"; real words peak at 7 in "assesses"). With the junk
dropped, Galliano's region becomes the plan's REAL menu (Nuveen
Lifecycle/PIMCO/Schwab, ratio 0.44 on 20/23 pages locally — production's
fuller OCR should clear the 0.45 floor; either way honest).

**The tripwire, and what it immediately caught.** audit-data now flags
`lineup-junk` HIGH: any confident lineup containing form/statement
vocabulary in a fund name. First local run: **~540 confident lineups**
— dominated by a "Name of Plan Sponsor: X Employee Identification
Number" heading class (with "EMPLOYEER" OCR misreads) that the anchored
EIN guard missed. v47 adds the unanchored guard; the tripwire also
caught its own false positive in review ("TCW Trans**form 500** ETF"
matching `form 500` — fixed with a word boundary). audit-high.txt caps
at 150 lines so a mass finding can't break the auto-issue step.

**The prevention.** The tripwire runs in every merge — this class can
never ship silently again; the HIGH count after the v47 re-parse is the
measure (expect ~4 baseline + residue = new classes to hunt). Gate: 17
specimens green (Galliano's raw-text expectation locked at found=false).

## 2026-08-11 — v47 verified + v48 residue sweep: the tripwire is converging

**v47 (run 31447742753).** Galliano resolved BETTER than predicted: with
the form-text junk unable to win, its prior-year (fb:2023) filing
supplied a confident REAL 80-fund menu (JPMorgan LCG, AUL Stable Value,
Fidelity 500, Nuveen Lifecycle…), ratio 0.81. Coverage rose again
(match 48,720 / vesting 49,695); confident 56,478 (−33 net, the
EIN-heading junk class turning honest). lineup-junk HIGHs: ~540 → 169.

**v48.** The 165 residual findings classify into ~30 small shapes, all
form/reconciliation vocabulary: "Federal/Pension Identification Number"
spellings, "Net gain per the Form 5500"-style reconciliation-note rows,
OCR'd Paperwork Reduction Act notices ("lnstructlons", l-for-i), and
truncated sponsor headings ("e of plan sponsor: Ameren…"). One guard
sweep covers them: any name containing form-5500/Schedule-H references,
any EIN-heading spelling, paperwork-notice vocabulary. Gate 17 green.
Expected post-v48 HIGH count: the 4 contrib baseline + single digits —
whatever remains is by definition a class we haven't named yet, and the
tripwire will keep printing it every run until we do.

## 2026-08-11 — v48 verified: the tripwire converged (544 → 169 → 12)

**Run 31455613248.** HIGH count 12 = the 4 contrib baseline + 8
lineup-junk. Coverage at new highs: match 48,721 / vesting 49,696 /
confident 56,493. The 8 residuals classified per protocol:

- **4 stale entries** (pv 37–43, e:download) — S3 fetch failures whose
  old parses are preserved by design; they clear when a download
  succeeds. Not guard gaps.
- **1 label ambiguity that sent the investigation to the wrong plan**:
  the audit labeled findings with the 14-char ack timestamp, which THREE
  different filings can share ("The Ross School 20251015141408" pointed
  at a clean 19-fund menu; the junk was in a sibling ack). Audit labels
  now carry the full ack.
- **2 real guard gaps, 3 junk rows universe-wide**: "Employer's
  Identification Number: #75-" (possessive) and "Identification Number
  (EIN): 92-". Guards extended (blanket "identification number" — never
  a fund name); they take effect at the next PARSER_VERSION bump (the
  OCR page-targeting cycle) rather than burning a full re-parse on
  3 rows. The tripwire keeps them visible until then.

Day's arc closed: v43 (Eaton, cents, trust-pointers) → v44 (junk sweep)
→ v45 (Sierra Space region + OCR-features gate) → v46 (statement
vocabulary) → v47 (form-text guards + tripwire) → v48 (residue sweep).
Confident 55,961 → 56,493; match/vesting above every prior baseline;
62 master trusts recovered; 17 gate specimens; the lineup-junk counter
is the standing convergence metric.

## 2026-08-11 — v49: owner-directed accuracy review of the three displayed claim types (match, vesting, lineups)

**Scope.** Every displayed claim audited against its own evidence: all 22
formula-vs-quote mismatches classified with filing pulls, both vesting
mismatches root-caused, and confident lineups sampled at the confidence
band's risk edges (682 at ratio ≤0.55, 308 at ≥1.45, 1,269 with ≤4 rows).

**Match formulas — 22 mismatches → 3 classes.**
(1) *Checker gap* (1): "sixty percent" spelled out — RATE_WORDS extended
30–90. (2) *Quote truncation* (~12): sentence() trimmed long windows from
the FRONT to keep the last tier, cutting the leading "100% of" — a dozen
quotes started mid-word after the number they existed to prove. The
window now never starts past the match head; the cap stretches instead.
(3) *Formula fusion* (~9, the real defects): filings with multiple
formulas (eras, union/non-union groups, service-year alternatives) fused
into one formula nobody gets. Fixes: the tier-chain now breaks on
re-statement verbs ("provided a match", "receive a match", "the Employer
matches"), on era openers ("Prior to January 1, 2024"), and lettered
alternatives ("(a) 30% … or (b) 50%") render as "a further tier that
varies by participant group" instead of chaining. All six pulled filings
now display correctly (e.g. the era-fusion case picks the CURRENT
amended formula with its quote); Kohler/TK/Northrop/Black Hills
regression formulas byte-identical.

**Vesting — both mismatches were one bug.** A multi-step percent-at-year
list ("20% after one year, 20% after two, 100% after three") matched the
CLIFF pattern via its final step and shipped a graded schedule as
"3-year cliff" with the wrong cohort's quote. Multi-step lists (≥2
steps) now classify as graded before the cliff test; Northrop's genuine
3-year cliff unaffected.

**Lineup edges — 4 junk-confident classes from the tiny-lineup sample:**
loan-rate fragments ("ranging from 4.25% to" = a $13M "fund"),
"Benefit payments to participants" (SKIP_ROW knew "benefits paid" only),
truncated class stems ("Common /"), bare PROVIDER-TOTAL rows ("Vanguard"
$19M — assets-at-custodian aggregates, never menu options), and the
"Plan Name X" heading. All guarded; "Plan Name"/rate-range join the
lineup-junk tripwire. Trust-pointer name test now tolerates the
"Plan's interest in…" possessive prefix (Black & Veatch).

**Prevention.** Gate 17 green (unchanged specimens prove no regression);
the tripwire vocabulary grows with every class; the audit mismatch count
after the v49 re-parse is the metric — expect low single digits, each
individually explained.

## 2026-08-11 — v49 verified + v50: the row-level provider guard over-cut; parse-level flag restores ~1,300 real menus

**v49 (run 31524736924) — the review's fixes verified.**
Formula-vs-quote mismatches 22 → 3 (all remaining are vesting-cliff
quotes queued for the next cycle); vesting coverage rose to 50,037 (the
graded-list fix found ~340 more); match held at 48,719.

**But the diff was +246 / −1,590, and loss-sampling caught an over-cut
before it ever reached users.** The v49 row-level guard dropped bare
provider names ("Vanguard") EVERYWHERE — including from real menus that
legitimately carry one assets-at-custodian aggregate row among their
funds. Removing the row shifted sums and region scores, and ~1,300
genuine lineups (one sampled: a 24-fund Fidelity menu at ratio 0.98)
lost confidence. Because the mirror to main is gated on diff review,
the site never served the regression — main stayed on the prior data.

**The change (v50).** The row guard is gone; provider-total pages are
judged at the PARSE level like trust pointers: ≤8 rows, ≥2 bare-provider
rows, ≥50% of the sum → statement flag, never confident. Verified on
the sampled losses: the 24-fund menu is confident again with its
aggregate row kept (honest), and the provider-total pages
("T. Rowe Price $479M / Vanguard $271M / Ariel $12M"; MN Life $1.08B)
are flagged. Gate 17 green.

**Lesson (permanent).** Row-level deletion is the WRONG tool for rows
that are junk only in aggregate — it changes every parse the row
appears in. Classes that are "junk when dominant" get parse-level flags
(trustPtr, provAgg); row guards are only for text that is junk in ANY
context (form vocabulary, addresses, garble). And the mirror-after-
review discipline is what kept 1,300 broken pages off the live site.

## 2026-08-11/12 — v50 verified, v51: the heading-glue class was 754 REAL menus, and pulling its thread fixed region selection itself

**v50 (run 31538231084)** restored the provider-guard over-cut (+245,
sampled classes all correct) — but the v48→v50 net was still −1,106, so
the loss classification continued. Result: 220 provider-total pages and
~150 tiny statement fragments were honest removals, but **754 lineups
with 7–12 REAL funds** (AmerFunds/TRP/Vanguard small-plan menus) were
collateral: their recordkeeper attachment repeats a "Plan Name X …
EIN:" heading on every page, the valueless heading GLUED onto each
page's first fund via nameBuf, and v49's name-level junk guard then
dropped that fund WITH its value — ratios fell out of the band.

**v51, fix 1 — kill the glue at the line level.** "Plan Name" /
"Plan Sponsor's Name" heading LINES join SKIP_ROW, so every page's
first fund keeps its own clean name and value. Row-name guards remain
as backstops.

**v51, fix 2 — found while verifying fix 1.** ClinicalMind's real
29-fund menu STILL couldn't win: the pre-printed form watermark digits
("123456789012" under the EIN boxes) parse as a $123B "value", and one
such row poisoned every candidate region containing it — the merged
cluster summed to $1.6 QUADRILLION (score −18) while single pages sat
at ratio 0.15–0.34, so a statement fragment won by default. Values
≥ $100B are now dropped at parse (the largest real master-trust
interests are ~$50B).

**v51, fix 3 — the structural one.** Clusters chain the TOC and
statement pages onto the real attachment (headings all <400 lines
apart), and the polluted whole can never outscore fragments. Every
cluster SUFFIX now competes as its own candidate, so the
attachment-only span exists. ClinicalMind: 27 funds, ratio 1.00,
confident, clean names. The gate then reported two specimen movements —
both IMPROVEMENTS on review: the "CCT 4-row aggregate" specimen's real
27-fund menu (Contrafund, TRP suite, ratio 0.995) was reachable for the
first time, and the carry-forward filing landed on an honest
managed-account rollup. Expectations updated with relabeled comments.
Eaton pair, Costco, Verizon, Sierra Space, Galliano: byte-stable.

**Lesson (permanent).** A "junk row" investigation must end at the LINE
that produced it, not the name that displayed it — three different
layers (heading glue, watermark values, cluster pollution) each looked
like "bad names" from the outside. And impossible-value bounds belong
at parse time: closeness scoring is defenseless against a quadrillion-
dollar row.

## 2026-08-12 — re-parse improvement contract (owner directive: every re-parse must use everything learned and produce a better version)

The v49→v51 sequence proved the review DISCIPLINE works but showed its
two slowest steps were manual: classifying losses and comparing runs.
Both are now machinery:

1. **Loss triage in merge** — every confidence loss whose old parse was
   real-menu-shaped (n≥7, or n≥5 at ratio 0.7–1.3) is written to
   losses-triage.txt and surfaced by the audit as a `reparse-loss` HIGH
   ("pull the filing before accepting"). Junk-cleanup losses stay quiet;
   a broken real menu can no longer hide inside a big diff. Had this
   existed at v49, the 754-menu over-cut would have been a wall of HIGHs
   in the same run that caused it.
2. **Reparse verdict in audit** — each run's confident/match/vesting/
   lineups are compared to the previous coverage-history line and
   printed as "== REPARSE VERDICT … improved or held / ⚠ REGRESSED";
   regressions beyond tolerance (confident −200, match/vesting −150)
   flag `reparse-regression` HIGH. The contract: regressions are
   justified with sampled losses or rolled back before main is mirrored.

Both verified locally (no-op merge → verdict "+0 … improved or held",
zero triage). They run in every pipeline run from the next push on.

## 2026-08-12 — v51 verified: +2,576 / −91, the review ends net-positive; the new machinery immediately caught two more defects

**Run 31549449210.** Confident 57,872 (**+1,379 above the pre-review
peak**), lineup coverage 84.5% (from 82.4%). Restorations spot-verified
with clean names (ClinicalMind 27 funds topped by "AMERFUNDS 2050", UJET
25 TRP funds). Losses sampled: contribution-schedule junk, class-
aggregate edge parses, statement fragments — honest removals — plus ONE
real-shaped case (20251015134924, a 14-fund Fidelity menu at ratio 0.61
edged out by its own flagged statement region at ~0.87; the display is
an honest gap, not junk). Recorded as the v52 scoring candidate: a
stmt-flagged region should not be able to outscore an unflagged real
menu on closeness alone.

**The tripwire caught a regression IN the regression-catcher**: Werner's
"EMPLOYEE IDENTIFICATION NO." row survived because the v49 possessive
edit accidentally made the "r" in employe{1,2}r? required — "employer"
matched, "EMPLOYEE" didn't. One-character fix, guarded by the audit
either way. And all 3 residual vesting-cliff mismatches were one class:
long amendment sentences bury the cliff phrase past the 300-char quote
cap — the vesting quote now windows around the cliff match, same fix as
the match quotes. 8 of 9 remaining lineup-junk HIGHs are stale
download-failure retentions (pv 36–43) that clear if S3 ever serves
those files.

Review arc closed: v49 (fix wrong displays) → v50 (reverse the fix's
over-cut) → v51 (root-cause the losses; region selection structurally
improved). Net: more accurate on all three claim types AND +1,379
confident lineups. The improvement contract (loss triage + reparse
verdict) is live in CI as of the next run.

## 2026-08-12 — Power Design (owner-submitted): 28 recordkeeper fund CODES displayed as fund names (v52)

**What was wrong.** Power Design, Inc. Retirement Plan (EIN 65-0147539,
$79.4M) showed "FUND HOLDINGS — 28 FILED" whose names were Empower fund
codes — "1NTSPI4" ($9.6M), "1GGCG50" ($8.7M), "1TRGSTE" — every row
mistyped "Stable value / GIC". The VALUES were real (1NTSPI4 = NT Col
S&P 500 Idx Fd DC NL 4, $9,599,124); the names were useless.

**Why.** The filing contains the schedule TWICE: the auditor's clean
named table, and the recordkeeper's group-annuity rendition listing the
same funds by CODE with cents-formatted cost/value columns — filed
under its own "SCHEDULE OF ASSETS (HELD AT END OF YEAR)" heading, so it
competes as a first-class candidate region. Before v43 its cents values
were unreadable and it summed to nothing; the cents fix made it a
ratio-0.97 twin of the real schedule, and the tie broke wrong. Same
lesson as Sierra Space, third instance: every fix that makes MORE text
readable must be re-checked against every page it newly ingests.

**The change (v52).** Code-page penalty in region scoring: when ≥60% of
a region's names are space-less digit-bearing tokens ("1GGCG50",
"1TRSV-A"), it takes the statement-grade −0.35 penalty. Real names have
spaces; pure ticker menus (VFIAX) have no digits — both unpenalized.
Power Design now renders its named schedule: 27 funds, correct
Collective-trust types, ratio 0.93. Joins the gate (18 specimens,
green). v52 also carries the Werner employe{1,2}r? one-char fix and the
vesting quote window. Future idea recorded: these filings include a
code→name LEGEND page; mapping it would let the code rendition enrich
rather than compete.

## 2026-08-12 — Sempra (owner-submitted): subtotals spelled as class descriptions double-counted a clean $5.95B trust menu (v53)

**What was wrong.** Sempra Savings Plan showed "no readable fund
schedule" although the linked SEMPRA SAVINGS MASTER TRUST ($5.96B, PN
006) files a perfectly clean, textual 4i: the full T. Rowe Price
target-date suite, VFTC 500 Index $1.125B, Sempra Common Stock $1.03B.
The link and trust registry were correct; the trust's own parse was
non-confident.

**Why.** This filing's section subtotals aren't spelled "Total …" —
they're spelled as CLASS DESCRIPTIONS: "Interest in common/collective
trusts $4,474,697,107", "Interest in registered investment companies",
"Employer-related investments: Employer securities", "Assets Held for
Investment $5,951,844,380". None matched the subtotal filters, every
one parsed as a holding, the type-cut even fused two of them into a
summed "Interest in" $4.9B row — and the schedule double-counted to
ratio 2.996, outside the band. Honest gap displayed; real menu lost.

**The change (v53).** Class-worded subtotal names are dropped like
"Total" rows ("assets held for investment", "employer-related
investments", "interest in <class-plural>", and the bare "Interest in"
cut residue). Kohler-style "interest in master trust" HOLDINGS are a
different stem and untouched (gate-verified, n=1 unchanged). Sempra's
trust now parses 31 funds at the exact filed total ($5,951,844,380,
ratio 0.999, SDBA detected) and joins the gate (19 specimens, green).
Every Sempra plan linked to the trust inherits the menu on the next
re-parse.

## 2026-08-13 — v54: the Sempra takeaway, generalized to all filers — a subtotal is ARITHMETIC, not spelling

**Owner directive** (standing): every case's takeaways apply to all
full-form filers. Sempra's lesson wasn't "add these four phrases" — it
was that subtotal VOCABULARY is a losing game: auditors spell totals
however they like, in class descriptions, footnote fragments, page
carries, or OCR-garble no wordlist will ever cover.

**The change (v54).** parseRows now removes subtotals by arithmetic:
walking rows in file order, any row whose value equals the sum of the
preceding rows — since the last boundary (section subtotal) or overall
(grand total / carry-forward) — is a subtotal regardless of its name.
Tolerance scales with group size (cents truncate per-row). Single-row
sections stay vocabulary-guarded so a coincidental equal-value pair
can never merge.

**What it caught immediately.** A scan of stored confident lineups
found 10 displaying an arithmetic grand-total as a fund inside the
band — names like "Page subtotal", "Investments", "Common Stock
Subtotal", and "Indicates party-in-interest." (a footnote line that
swallowed the total's value). Two pulled and verified fixed; the
page-subtotal case also exposed the one arithmetic blind spot —
subtotals covering rows the parser deliberately skips (loans) — which
stays vocabulary-guarded ("Page subtotal" added). One specimen's menu
IMPROVED from 18 junk-tainted rows to a full 34-row menu at ratio
0.956. Sempra byte-stable; gate 19 green.

## 2026-08-14 — OCR v3: page targeting — big scans OCR the RIGHT pages instead of the first 40 (launch item)

**What was wrong.** Two silent gaps in the OCR lane: filings with 41–120
scanned pages OCR'd the FIRST 40 bad pages — but schedules live at the
END of filings, so the budget went to financial statements and the menu
was never seen; filings beyond 120 scanned pages were skipped outright
(the large-plan class).

**The change (OCR v3).** A strip-scan pre-pass renders only the top 3
inches of each bad page at 100dpi (~1-2s/page vs ~30s full-page) and
OCRs the strips with garble-tolerant heading vocabulary ("schedu1e h",
"1ine 4(i)"…). Full OCR then targets heading hits + 2 continuation
pages each; if no heading is found, the LAST 40 pages (not the first).
The skip ceiling rises 120 → 250 pages. Verified on a real scanned
filing: the strip pass found the exact schedule start (page 40 of 56)
plus the form's Schedule H page, in seconds.

**Rollout.** OCR_VERSION 2 → 3 re-queues every no-section filing
(~7,000) for a targeted attempt; the per-run time budget spreads the
backlog over the nightly/weekly runs and the work list converges as
each ack records ov:3. Recoveries and any junk the new text introduces
land in the normal diff/triage/verdict review — the Sierra Space lesson
(new readability = new junk surface) applies and the machinery watches
for it.

## 2026-08-14 — Sempra round 2 (owner-submitted): termination boilerplate shipped as "Immediate" vesting; the rate-ramp match tier had no pattern (v55)

**What was wrong (verified against the owner's uploaded filing).**
(1) Vesting showed "Immediate" — sourced from "Employer matching
contributions … become fully vested upon the TERMINATION OR
DISCONTINUATION OF THE PLAN", the IRC-required acceleration clause
every plan carries. The real schedule ("occurs upon the earliest of …
credited with one year of vesting service") sits in an earliest-of
alternatives list no cliff pattern knew. First scan: **43 stored plans**
display "Immediate" quoting termination text. (2) The match head
("50% of the first 6%") extracted and is live, but the incremental
tier — "an additional 0.2% for each 1% incremental increase over 6%,
up to 11%" — had no pattern; the displayed formula was incomplete.

**The change (v55).** IMMED's bare "fully vested upon" now requires an
enrollment-type event (hire/enrollment/eligibility/entry); termination/
discontinuation sentences are excluded from vesting ranking entirely;
"credited with N years of vesting service" joins the cliff shapes; and
rate-RAMP tiers render as "+ 0.2% per 1% contributed above 6%, up to
11%". Sempra now extracts both exactly. Regression set (Northrop cliff,
TK/Kohler/Black Hills/WI-Cheese graded) byte-identical. Audit gains a
correctness tripwire: "Immediate" quoting termination text counts as a
formula-vs-quote mismatch every run.

## 2026-08-14 — 500-filing hands-on review (owner directive after Sempra): two more variants fixed, table-header class recovered, worklist recorded

**Method.** The v55 extractor ran against the actual filing text of 500
full-form filers (top 250 by assets + 250 stratified) checking:
termination-boilerplate-as-Immediate, mis-sourced Immediate quotes,
schedule vocabulary with nothing extracted, ramp phrasing missing from
formulas, match vocabulary with nothing extracted, and every
v55-vs-stored difference. (The review harness itself needed one fix:
its "vested in accordance" probe substring-matched "inVESTED IN
ACCORDANCE" and falsely implicated Ford/UnitedHealth-class filings.)

**Found and fixed in the same pass:**
- Two acceleration variants the Sempra fix missed: "Upon such
  termination of the Plan, participants become 100% vested" (reversed
  order — P1 Technologies) and "100% vested in all accounts … upon
  death, total disability…" (Community Wholesale Tire). Both excluded;
  re-run over the 500: **0 acceleration-as-Immediate**.
- The floating-label vesting TABLE class (Abbott, AbbVie): headers
  linearize as "Vesting [Years of Credited] Service Percentage", and a
  two-row 0%→100% table is a CLIFF stated tabularly ("Less than two
  years 0% / Two years or more 100%" → 2-year cliff). Also: the table
  window now stops at resumed prose — AbbVie's back-to-back tables
  (match cliff + ASP+ graded) interleaved into one non-monotonic list
  that failed both shapes. Abbott and AbbVie now extract correctly.

**Residual worklist (daily cycle):** 21 filings with schedule vocabulary
but no extraction and 8 with match vocabulary but no formula — acks in
scratchpad rev500/report.json; each is a distinct long-tail phrasing to
be reviewed by hand. Regression set (Northrop/TK/Kohler/Black Hills/
WI-Cheese/Sempra) byte-identical; gate 19 green.

## 2026-08-14/15 — OCR v4: the rotated trustee-table class, root-caused three layers deep; recovery is real but partial (honest)

**Layer 1 (v3's miss, caught by its own +0/−0 diff):** a heading hit on
the form's own Schedule H page starved the real schedule — "strip-scan
76 pages → targeting 3". Fixed: targeting tops up the full budget from
the document's tail.

**Layer 2 (found investigating layer 1):** the PSEG-class pages aren't
scans — they're LANDSCAPE trustee tables (BNY "Schedule of Investments")
that fixed-orientation OCR reads as vertical garble. OSD confirms 270°;
psm 1 reads them cleanly. v4 probes orientation once per filing and
auto-orients.

**Layer 3 (found verifying layer 2):** these reports carry NO 4i heading
at all — their title is stopRe vocabulary. A trustee-title fallback now
seeds regions ONLY in documents with zero 4i headings (nothing
legitimate can be displaced; gate 19 unchanged).

**Honest outcome:** PSEG end-to-end now reads and parses (80 rows) but
the 40-page budget landed on one fund's bond-detail section — ratio
0.093, correctly non-confident. The class moves from "unreadable" to
"readable, honestly incomplete". Full recovery needs EDGE-strip
targeting inside rotated reports (per-fund section headers run along
the physical page edge) — recorded as the next OCR iteration for the
daily cycle. The confidence band and triage machinery guarantee the
partial text can't ship junk meanwhile.

## 2026-08-15 — Publish gate caught its first real regression: v3 OCR targeting dropped OCR-sourced features (match −179), fixed with a notes-head reserve

**What was wrong.** The v55 full re-parse failed the new publish gate:
REPARSE VERDICT match −179 vs the previous run — data was correctly NOT
committed (the gate doing exactly what the owner demanded after the 99%
incident). Root cause was not the v55 feature regexes: OCR v3's page
targeting spends the whole 40-page OCR budget on schedule-of-assets
pages (strip-vocabulary hits + tail). OCR v2 had OCR'd the FIRST 40 bad
pages — which included the auditor's notes where match/vesting prose
lives. On every >40-bad-page scanned filing, the full re-parse therefore
re-extracted features from text that no longer contained the notes, and
OCR-sourced match/vesting silently vanished. The v3 run itself hid this
because it only re-ran the OCR worklist, not the whole universe.
Reproduced deterministically on a 111-bad-page specimen
(20250821152449…): first-40 OCR extracts "100% of the first 5% of pay",
targeted/last-40 extracts nothing.

**Diagnosis trap worth remembering.** A local re-scan of the 500-filing
review cache first suggested 26 lost matches + 23 lost vestings — 46 of
49 were artifacts of the harness itself (cached pdftotext-only text
lacks the OCR pages that produced the stored quotes; ocr=1 on nearly
all). The 3 "real" ones were the intended v55 acceleration-boilerplate
cleanup. Never diagnose OCR-filing feature changes from pdftotext-only
text.

**The change (OCR v4, same commit as the rotated-class work).**
`targetPages` now reserves OCR_HEAD_PAGES=12 of the 40-page budget for
the first bad pages (the notes head) after schedule hits, before the
tail top-up; the rotated branch takes head-12 + tail-28 instead of
tail-40. Verified: head12+tail28 on the 111-bad specimen recovers the
match. Parser gate 19/19 green.

**Prevention.** (1) The publish gate itself — this entry exists because
the gate blocked the bad data before the site saw it. (2) OCR targeting
changes must be tested for FEATURE retention, not just lineup reach:
the schedule and the notes are different pages, and the budget must
cover both. (3) Run-level verdicts are the only trustworthy regression
signal for OCR filings; local caches without OCR text cannot adjudicate
them.

## 2026-08-15 — S&P 500 full base review (owner directive): all 458 matched plans tested end-to-end, 356 pass, defect classes harvested

**What was done.** Every S&P 500 constituent was matched to its largest
full-form plan (458 matched; 47 name variants unmatched — subsidiary
names/SF filers, listed for manual mapping). Each filing was downloaded,
text-extracted with production-equivalent OCR (v4 page selection), parsed
with live lib-4i v55, and judged against the shipped data: lineup shown
(own or master-trust), ratio, junk names, match/vesting extraction vs
vocabulary present, and the false-Immediate tripwire. Result: 356 pass,
48 fix-queued defects, 17 honest gaps, 37 drift checks. Owner-facing
audit page + CSV produced (sp500-audit) as the shared baseline for the
owner's manual pass.

**Defect classes found (v56+ worklist, in impact order):**
1. Stated-unit scaling: schedules filed "($ in millions)" or thousands
   the parser doesn't scale (PPG, Regions, Dow, Molson Coors, Norfolk
   Southern, PNC, Meta, Moody's ...) — sums come out microscopic, real
   menus lost. Big plans round to millions; this class concentrates in
   exactly the S&P base.
2. Region selection on clean tables: Mastercard's readable 23-fund
   "$ in thousands" CIT table parses to a 3-row fragment; JPMorgan's
   80-fund menu extracts locally at ratio 0.70 while production stores
   nothing (OCR page-pick divergence — investigate against the v4
   targeting). Both gate-specimen candidates.
3. Match phrasing long tail: dollar-capped matches ("50% ... not to
   exceed $1,000" Palo Alto; F5 $4,400; Expeditors $3,000; MarketAxess
   $17,500; Gartner lesser-of-4%-or-$7,200), "up to a maximum of X%"
   (Eversource, Synchrony), "not exceeding/not over X%" (Accenture,
   Kenvue), cents-per-dollar tiers (Kraft Heinz), "on up to X%"
   (Campbell's), "attributable to the first X%" (Nordson), "amounts on
   the first X% and Y% on the next Z%" (Ulta).
4. Vesting table long tail: reversed/floating headers (Weyerhaeuser
   "Percent / Years of vesting service / vested"; Rollins), "Percent
   Vested" label variants (Micron, Generac, UnitedHealth, Transdigm),
   bare-number percent columns (Simon Property "Less than 2 –% / 2 20
   / 3 40"), months-based cliff (FedEx "fewer than 12 months – 0%"),
   semicolon graded prose (J.B. Hunt), graded-prose spans (Omnicom,
   AvalonBay), "vest over a two-year period" (ADM), "vest immediately"
   verb form (Arista).
5. Honest gaps confirmed working: Verizon plan PDF withdrawn from the
   public bucket (holdings via master trust), Colgate/Northrop/Deere
   trust-form-only, PSEG rotated-scan trust, Marathon Oil no 4i
   attachment.

**Harness lessons (recorded so the next reviewer doesn't repeat them):**
status lookups must use lineups-status.json `.plans`; vocabulary probes
must not substring-match ("inVESTED in accordance"); never judge OCR
filings from pdftotext-only text; typed acks must be copied, not
reconstructed from truncated prefixes.

**Prevention.** The S&P-458 text cache and per-company report persist in
the session scratchpad for regression re-runs; the defect classes above
become v56/v57 patterns each with a gate or regression specimen; the
audit page is the owner-visible ledger of exactly what is claimed
accurate as of parser v55.

## 2026-08-15 — v56: the S&P-review fix wave — stated-unit scaling, notes-vocabulary long tail, and a $39B row the parser had never read

**Changes, each anchored to an S&P audit specimen and verified against the
cached filing text before shipping:**

1. **Stated-unit scaling.** The thousands marker now covers "($ in
   thousands)" (Mastercard), "(Dollar amounts in thousands)"
   (Weyerhaeuser), "(amounts in 000's)" (Molson Coors), and OCR-garbled
   "(3 in thousands)" (Norfolk Southern); a millions marker joins it
   (PPG, Regions — "($ in millions)"). Millions tables print 1-2 digit
   values, so a small-value row parse runs as an ADDITIONAL candidate
   scored only at 1e6 — never replacing the normal parse (a first draft
   that switched modes in place regressed Ecolab/Baxter/GM/Comcast and
   was caught by the pre-ship sweep). Both scales are offered when both
   markers appear and closeness picks (Exxon files "(millions of
   dollars)" statements around a "($000's)" schedule). A physical guard
   rejects any scale where a single holding would exceed 105% of plan
   assets (Northrop's $150M note fragment otherwise "rescaled" to $150B).
   Recovered confident menus include Mastercard 23@0.99, PPG 80@1.05,
   Regions 29@1.00, Dow 40@0.90, Molson 34@0.98, Moody's 29@0.99,
   PNC 26@0.99, Comerica 33@0.99, Weyerhaeuser 30@0.99, Hartford, Monster,
   Vulcan, Mass General Brigham.

2. **The Northrop $39.3B row.** SKIP_ROW's unanchored statement
   vocabulary ("contributions?") swallowed any holding whose NAME
   contains the word — "Defined Contribution Plans Master Trust
   $39,301,997" (89% of the plan) had never parsed. A master-trust
   holding bypass admits participation/interest rows (excluding
   gain/loss/income/transfer statement lines — Kohler's "NET INVESTMENT
   GAIN FROM MASTER TRUST" tested the first draft). Northrop's true
   $44.28B schedule now parses at ratio 0.991, correctly trust-pointer
   flagged; the gate expectation moved in the same commit.

3. **Match phrasing long tail** (13 S&P companies): "up to a maximum of
   X%" (Eversource, Synchrony), "not exceeding / not over X%" (Accenture,
   Kenvue), "on up to X%" (Campbell's), "attributable to the first X%"
   (Nordson), "(Company Match) of" parentheticals, "lesser of X% or $Y"
   with the dollar cap appended (Gartner), dollar-capped matches with no
   percent cap ("50% … not to exceed $1,000" Palo Alto; F5, Expeditors,
   MarketAxess), "$1.00/one dollar for every dollar" heads with
   cents-per-dollar second tiers (Kraft Heinz "100% of first 2% + 50% of
   next 4%"), bullet-style "calculated as 100% Company match on the first
   3%" with "match on the next" tier connector (Capital One — the old
   parse "3% of the first 1.5%" was wrong twice over). Tier connector
   recovery also completed Dow's "+ 50% of the next 2%".

4. **Vesting long tail** (~15 companies): header variants ("Completed
   Years of Service Percent Vested" Micron/Generac, "Years of Service
   Vesting" UnitedHealth, "Vested %" Transdigm/Builders, reversed
   "Percent Years of vesting service vested" Weyerhaeuser, "Vested
   Percentage Years of service" Rollins), em-dash zero cells ("—%"),
   "N years of service and greater" pairs (AvalonBay), months-stated
   cliffs ("fewer than 12 months – 0%" FedEx = 1-year cliff) and
   months-graded tables (Textron), prose pair runs ("2 years – 20%; …"
   J.B. Hunt), rate-first spans ("70% for 4 years … 100% for 5 or more"
   Omnicom), OCR-garbled terminal rows (≥4 monotonic pairs from ≤25
   accepted without the garbled 100% row — Builders), "vest(s)
   immediately" verb form with plan-sponsor scope (Arista).

**Pre-ship verification (the provably-better rule):** 444 cached filings
whose production entries are OCR-free were re-extracted and diffed
against live data: lineups +4/−1 (the −1 is United Airlines' 3-row
trust-pointer page correctly losing its pseudo-lineup display), match
+8/−0 real (2 reported "losses" proved to be harness text divergence —
production had OCR'd notes the local cache lacks; v55 on identical text
also extracts nothing), vesting +24/−0. Every changed value was
adjudicated against its verbatim quote (Intel/S&P Global
Immediate→Graded follow the established employer-money-first precedence;
W.K.S. Graded→Immediate matches its safe-harbor quote; Dow/Capital
One/Paramount/Philips quotes confirm the new formulas). Parser gate
19/19 with the Northrop move documented above.

**Harness lessons appended to the S&P-review entry's list:** verification
sweeps must compare same-text-to-same-text (rev500 pdftotext cache beats
OCR-appended local caches for non-OCR entries), and a "regression" is
only attributable to a code change after re-running the OLD code on the
IDENTICAL text.

## 2026-08-15 — v57 + OCR v5 (queued behind the v56 run): JPM's repeated-header OCR class, the #136 junk classes, and another dozen phrasings

**OCR v5 — the JPM class.** JPMorgan's 155-page scanned filing repeats
its schedule header on 90 of 111 bad pages; v4's hits-first allocation
spent the whole 40-page budget on the document's MIDDLE (per-security
detail), the notes-head reserve never executed, and the tail summary
that actually parses (80 funds at ratio 0.70) was never OCR'd —
production stored nothing while a local head+tail pick recovered the
menu. v5 allocates head-first, then consumes heading hits from the END
of the hit list (schedules conclude with summaries/totals), then tail
top-up; simulated picks for JPM now equal the recovering set. Cache
fallback accepts v4/v3 text for ≤40-bad filings so the bump doesn't
re-rasterize ~7k done filings.

**Junk-row guards from run #136's HIGH findings:** "Plan Name …" rows
survived because the existing guard tested the un-trimmed name; OCR'd
Schedule H form lines now dropped ("add/subtract li(n|m)e N" — tesseract
misreads "line" as "lime", "Total of balance and additions", "Type of
contract:", and "(13) …ans) interest in" form-item rows — the
Paychex/Meta garble class).

**False-Immediate residuals:** "in the event OF PLAN termination" joined
the acceleration exclusions (three tripwire specimens shared it); the
audit tripwire itself narrowed to acceleration phrasings so a terminated
plan truthfully describing immediate vesting no longer counts as a
mismatch; and the death-acceleration exclusion learned not to fire when
the same sentence states a real service schedule ("100% vested after the
completion of three years of service or upon death" is a 3-year cliff,
not boilerplate — a v55-era exclusion had eaten it).

**Another dozen phrasings from the rev500 re-scan under v56:** "with a
matching limit of N%" cap-style, "up to the first N%" connector, QACA
"equal to 100% up to 3% and 50% up to an additional 2%", conditional
flat matches ("contribute at least 5% … matching contribution of 5%" =
100% of the first 5%), service-tiered flat rates ("5%, 6%, or 8%
depending on years of service" — stated as varying, never averaged);
vesting: "% Vested" and interleaved "Years Percentage of Service Vested"
headers, bare-number table rows accepted only with structural guards
(≥4 rows, ascending years, monotonic to 100 — Simon Property), "="
connectors ("1 year of service = 0% vested"), and bare "subject to a
five-year vesting schedule" rendered honestly as "5-year schedule
(shape not stated)".

**Verification:** 444-filing sweep — lineups +4/−1 (the −1 is United
Airlines' trust-pointer page, a correct demotion), match +15/−0 real,
vesting +27/−0, every change quote-adjudicated; gate 19/19. Queued to
push immediately after the v56 run's merge commits (pushing scripts
mid-run cancels the run).

## 2026-08-18 — Gate save #2: OCR v5's page allocation cost 2,538 OCR-sourced vestings; v6 funds the notes window explicitly

**What the gate caught.** Run #139 (v57 + OCR v5): REPARSE VERDICT
vesting −2,538 — data NOT committed, the site kept serving v56. The
lineup side of v5 worked (JPM's 80-fund menu and Iberia's restored
confidence both appear in the run's gained list; zero real-menu-shaped
losses), and match moved +13. Vesting alone collapsed.

**Root cause (measured, not guessed).** 3,652 stored vesting values come
from OCR text, and the loss concentrates in >40-bad-page scans. v4's
allocation OCR'd strip-vocabulary hits from the FRONT of the document —
financial-statement headings ("Statement of Net Assets") hit there, and
their +2-page continuations happened to cover auditor-notes pages
~13-30, where vesting prose lives. v5 consumed hits from the END to fix
JPM, silently dropping those middle notes pages. Match survived because
match prose sits early in Note 1, inside the 12-page head reserve;
vesting sits deeper. A code-level diff could never show this — v56 and
v57 extract identically on identical text (verified: −2/+9 over 958
cached filings); the change was in WHICH pages became text.

**The fix (OCR v6).** The v5 allocation is kept exactly (bad-list
head-12, hits consumed from the end, tail top-up, 40-page budget) and a
supplemental NOTES WINDOW is added: bad pages at absolute positions ≤30
beyond the head, up to 18, with the budget growing by exactly the pages
added. Filings whose early pages are readable add zero notes pages and
keep v5's proven picks byte-for-byte (verified against JPM's gained
parse); fully-scanned filings now OCR pages 1-30 plus the schedule
tail. Two intermediate designs failed verification before this one:
head-24-of-bad-list re-broke JPM (its 24th bad page is page 68), and a
flat 52-page budget flooded JPM's region scoring with detail pages
(ratio 2.4).

**Prevention.** OCR allocation changes are text-supply changes: they
must be judged by FEATURE retention counts on the affected class, not by
code diffs or same-text sweeps — recorded as a standing rule alongside
the v4 lesson ("schedule and notes are different pages"). The publish
gate has now blocked two real regressions before the site saw either.

## 2026-08-18 — The −2,529 "vesting regression" was 3,322 misleading boilerplate quotes; the coverage metric couldn't tell values from quotes

**What was wrong (two defects, one discovery).** (1) SITE-VISIBLE: 3,322
plans displayed, as their vesting evidence, the quote "In the event of
Plan termination, participants would become 100% vested in their
employer contributions" (or close variants) — IRC-mandated termination
boilerplate that says nothing about the plan's actual ongoing vesting
schedule. These were quote-only entries (`vestingText` with no `vesting`
value): stored data held 12,465 quote-only vestings, of which 3,322 were
this termination class. A reader would take "would become 100% vested"
as the plan's schedule. (2) METRIC: the audit's vesting coverage counter
counted `f.vesting || f.vestingText` — extracted values and bare quotes
as one number. So when v57's termination-phrase exclusions correctly
removed ~2,500 of the boilerplate quotes, the counter read −2,529 and
the publish gate blocked runs #139 AND #140 as regressions.

**How it was found.** Elimination, after the OCR-allocation theory (gate
save #2, above) was falsified by #140 regressing identically under OCR
v6: a 40-ack stored-OCR-vesting sample showed 0 losses under
production-exact semantics; #138→#139 "entries with features" moved only
−36 while vesting moved −2,538 — entries kept features but lost the
vesting FIELD, impossible for a text-supply problem; a 958-filing
quote-inclusive A/B (v56 vs v57 on identical text) showed the net change
was −8 and every sampled lost quote was the same termination sentence.
The "regression" was v57 doing exactly what the Sempra round-2 entry
(2026-08-14) shipped it to do.

**The fix.** `audit-data.mjs` now counts match/vesting coverage as
extracted VALUES only; quote-only entries are tracked and printed
separately (matchQuote 8,785 / vestQuote 12,465 on v56 data) and carried
in coverage-history.jsonl as their own fields. A synthetic rebase line
(same v56 data, new definition: match 43,599 / vesting 38,975) was
appended so the next run's verdict compares like-to-like instead of
re-flagging the definition change as a −7,841 collapse.

**Prevention.** A coverage counter must count ONE claim type; mixing
"we extracted the value" with "we found a sentence" hides both real
regressions (value losses masked by quote gains) and real improvements
(this incident). When the gate blocks a run, the first check is now:
did the METRIC's population change, or the data? — diff "entries with
features" alongside the headline number. The boilerplate class itself
stays excluded (v57); residual quote-only vestings remain honest
descriptive sentences and are now visible as their own trend line.

**Correction (same day — the rebase itself repeated the mistake).** The
first synthetic baseline was computed over RAW SHARD ENTRIES (match
43,599), but the audit's match counter runs over full-form,
plan-linked rows and sits behind an else-chain that excludes
zero-employer plans — its population. Run #141 landed match 40,966 and
the gate read a phantom −2,633 against the inflated baseline; the true
comparison (baseline recomputed with the audit's exact loop: match
40,881 / vesting 38,975) shows v57 IMPROVED everything: match +85,
vesting +852, vestQuote −3,381, matchQuote −70. Rule extended: a
rebased baseline must be produced by the SAME code path (same
population, same conditionals) as the counter it feeds — recompute
with the audit's loop, never with an ad-hoc query over the stores.

## 2026-08-18 — v58: "Participation in net income of Master Trust" as a $1.45B "fund"; partial features suppressed OCR of the scanned notes

**What was wrong.** (1) Trust-member filings list "Participation in net
income of Master Trust" in their statements; the row escaped SKIP_ROW
(vocabulary had "net (increase|decrease|change)" and "investment
income", not "net income of/from"), and the v56 master-trust row BYPASS
didn't rescue it either — its income exclusion correctly refused the
bypass, but nothing then junked the row, so it parsed as a holding
(Avery Dennison class: $1.45B; a second filing showed $181.5 in a
millions-labeled statement, which v56 unit scaling would inflate).
(2) fetch-4i's OCR gate fired on `!parsed.found || !features` — a
filing whose readable pages yielded ANY feature (a lone Roth mention)
never OCR'd its scanned plan-description note, and the old merge
`if (f2 && !features)` threw OCR features away wholesale whenever base
features existed. 3,269 stored entries have features but neither a
match nor a vesting group.

**The fix (v58).** SKIP_ROW gains `(participation|interest) in (the )?
net (income|loss)`, `net income \(?loss\)?`, `net income (of|from)`.
Verified: 822-filing cached-text sweep — 3 filings changed, every
removal is exactly the junk row, 0 confidence flips; 19-specimen gate
green. fetch-4i: the gate now fires when no match AND no vesting group
exists (`notesMissing`), and OCR features merge field-GROUP-wise —
base-text groups always win whole, so a value and its quote stay from
one source (the audit's formula-in-quote invariant cannot be broken by
mixing an OCR value with a base-text quote); OCR fills only absent
groups. Merge semantics unit-tested (base quote-only match group blocks
the OCR match; identity when nothing to add).

**Prevention.** Statement-line vocabulary reviews must cover the
CHANGES-in-net-assets statement, not just the assets statement — "net
income of the Master Trust" is that statement's signature row. Feature
merges must operate on value+quote GROUPS, never individual keys.

## 2026-08-18 — v58 landed; the gate was silently bypassed by a missing brace; 8 unfetchable junk lineups demoted for good

**The run.** v58 (run #142) published: match 41,019 (+138 vs the
corrected v56 baseline), vesting 39,887 (+912), boilerplate vesting
quotes down 3,368, confident 58,033 (−4). Confidence diff +4/−8; the
one real-menu-shaped loss was sampled: Plumbers Local 68 DC plan
(scanned multiemployer filing) — its old "confident lineup" was 59
OCR'd individual securities (Treasury notes, FNMA pools, single
stocks), a trustee-directed holdings flood, not a fund menu; OCR v6
reads more of the same flood (n=80) and lands non-confident, the
honest state. Accepted.

**Defect 1 (process): the gate didn't actually run.** The hand-written
baseline-rebase line in coverage-history.jsonl was missing its closing
`}`. The verdict block parsed the whole history inside one try/catch,
so one corrupt line skipped the verdict entirely — run #142 published
UNGATED (verified within tolerance by hand afterward, so no harm, but
only by luck). Fix: per-line parsing — a corrupt line is now a HIGH
finding and the verdict still runs against the last parseable line.
Rule: hand-edited JSONL must be machine-validated before commit, and
a gate must fail LOUD, never skip, when its reference data is broken.

**Defect 2 (data): junk lineups that can never be re-parsed.** The 8
lineup-junk HIGHs ("Plan Name SILA SERVICES…", "Net income (loss).
Subtract lime 2j…" as fund names) persisted across every run because
all 8 filings are S3-withdrawn (e:'download', pv 36-43) — download
failures preserve the stored parse, so parser-side guards can never
reach them. Fix: the merge now demotes stored confident entries whose
fund names match the shared JUNK_NAME_RE (exported from lib-4i, same
regex the audit flags on): exactly the 8 demoted, idempotent, excluded
from loss-triage (the demotion IS the triage verdict), and a future
successful re-parse is judged on its own merits. Audit HIGHs 12 → 4
(the known contrib-outlier baseline).

## 2026-08-19 — R.H. White (owner-submitted, annotated): eight defects in one plan, including a match formula the filing states outright (v59)

The owner sent the filing with the Contributions note and the whole
schedule of assets highlighted. Every finding below was reproduced
against the live PDF (ack 20251008132857NAL0003040291001) before it was
fixed.

**1. The match formula was missing entirely.** The notes say "The
Company contribute 50 percent of the first 6 percent of base
compensation that a participant contributes to the Plan." The
no-"match"-word template (2026-07-27) covers `contributes|contributed`
but not the filer's bare `contribute`, so a plain 50%-of-6% match was
hidden behind subject-verb disagreement. The card showed no formula at
all — just an employer total. Verb alternation widened; the
participant-deferral anchor still proves it is a match, not an NEC.

**2. Eligibility was the wrong rule.** The site showed "Upon hire /
immediate", quoting "For purposes of prevailing wage contributions,
employees are eligible upon hire." The plan's actual rule sits one
sentence earlier — "who have completed one month of service" — and
BEHIND the word "eligible", where a forward-only scan could never see
it. Two fixes: a scope veto (a sentence scoped to one money source
never states the plan-wide rule), and a "who have completed N <unit> of
service" template that reads the idiom directly, since the sponsor list
between "The Plan covers" and the rule is full of "Inc." periods that
no sentence-bounded window can cross.

**3. Vesting hid that most employer money vests immediately.** The
filing vests prevailing-wage QNECs immediately — $2,087,932 of the
plan's $3,164,887 in employer contributions — while the match vests
20%/year. The site showed a flat "Graded schedule" over all employer
money. Vesting now carries the source split when the filing names it.

**4. The stable-value fund was missing from the lineup.** "Investment,
at contract value: Key Guaranteed Portfolio Fund … 2,322,156" was eaten
by the v44 statement-row guard, which exists for bare subtotals
("Investments, at fair value  66,846,124"). The colon plus a name tells
a labelled holding from a subtotal; the label is stripped and the
holding kept. The plan's only capital-preservation option had been
invisible.

**5. A $81 holding was dropped, so 28 options showed where 29 were
filed.** The sub-$10k residue floor and the 3-digit value floor both
exist to stop stray digits faking rows. Both now yield to a row that
proved itself by carrying its own investment-type column. Two gate
specimens moved with it, both verified real: UPenn's "CREF Money Market
Account | Registered Investment Companies | 1,193" and Black Hills'
"Schwab U.S. Treasury Money Fund 2,784" (the notes state that exact
amount).

**6. Form column-header text was displayed as a fund name.** The 4i
heading wraps over four lines; only its first was known vocabulary, so
"including maturity date, rate of" glued onto the first holding and the
site showed "including maturity date, rate of American Funds Europacific
GR R6".

**7. Collective trusts were typed and priced as mutual funds.** The 13
"T. Rowe Price Retirement 20XX Adv" rows are Great Gray COLLECTIVE
INVESTMENT TRUSTS: Schedule D lists them with values summing exactly to
$49,004,522 = Schedule H line 1c(9) = the notes' NAV-measured
"Common collective trust". The filer's own description column calls them
"Mutual Fund", so the site inherited that and attached a 0.49% estimate
from the T. Rowe Price Retirement **Advisor mutual fund** share class —
to 70% of plan assets, and through it to the headline average expense
ratio. Schedule D entity-code-C rows and their dollar values are now
ingested; merge retypes exact-value matches as "Collective trust" and
marks them `cit`, and the frontend never prices a `cit` holding off a
mutual-fund table. Where CITs dominate, the plan-level average ER now
declines to show rather than quote a number built on the wrong vehicle.

**8. The participant headline mixed year ends.** "693 participants, 520
active" paired line 5 (BEGINNING of year) with line 6a(2) (end of year),
alongside end-of-year assets; 733 were in the plan at year end. The
end-of-year total (line 6d) is now carried and used for the headline and
for average balance. The audit's participant identity was comparing
end-of-year balance counts against a beginning-of-year total, which is
what most of its 1,760 `[counts]` warnings were.

**9. Employer money was labelled as match money.** The card headed
"Employer Match" showed "2024 total: $3.2M", which is Schedule H
2a(1)(A) — ALL employer contributions. Here that is $2.09M of
prevailing-wage QNECs plus ~$1.08M of match. The label now says
"employer contributions".

**Follow-up the same day (caught by the 822-filing sweep, before the
data shipped).** The new eligibility template repeated the very defect
it was written to fix: it read "…who have completed one year of service
… are eligible for Employer nonelective contributions", "…eligible to
receive allocations of employer matching contributions" and "The Company
will provide a matching contribution for participants who have completed
one year of service" as plan-entry rules — and in one plan it DISPLACED
a correct "eligible to participate in the Plan immediately upon the
start of employment". Eligibility to RECEIVE a contribution is not
eligibility to JOIN, and the money-type phrase can lead or trail the
service clause, so both directions are vetoed now; workforce-slice
carve-outs ("temporary employees who completed 500 hours") are declined
for the same reason a part-time rule is not the plan's rule. Net over
822 filings: 34 eligibility changes → 29, every remaining one a general
coverage clause. The first sweep also caught the relaxed value floor
admitting an OCR'd form subtotal ("@ Total noninterest-bearing CASH …
8181") and stable-value plumbing ("Contract Wrapper - No. GA-63066");
sub-$10k rows now additionally exclude subtotal, wrapper and
manager-name vocabulary.

**Collective-trust typing, verified (2026-08-19 evening).** The first
v59 run resolved the Schedule D value column to -1 and DISABLED CIT
typing rather than guessing — the safe-degradation branch worked as
designed, and the run printed the true header: the column is
`DFE_P1_PLAN_INT_EOY_AMT`, not any of the DOLLAR_VALUE names guessed
from other schedules. With it wired in: 28,365 plans carry Schedule D
collective-trust values and **116,407 holdings across 23,064 plans**
are now typed "Collective trust" instead of inheriting the filer's
description column. R.H. White's 13 Great Gray trusts flipped, and
nothing else in that plan did — the 16 mutual funds and the GIC kept
their types, which is the precision an exact-dollar join buys. Lesson
recorded: dataset column names are not guessable across schedules, and
a resolver that cannot find its column must disable the feature and
print the header rather than fall back to a regex that might match the
wrong field.

**Prevention.** Three of these (2, 3, 9) are the same failure: a number
or rule that is TRUE OF ONE MONEY SOURCE presented as true of the plan.
Prevailing-wage, QNEC, safe-harbor and profit-sharing money each carry
their own eligibility, vesting and totals, and a filing that names the
scope must have that scope carried through to the display. Added as a
standing review question alongside the hire-date-cohort rule.

## 2026-08-19 — Eaton (owner-submitted): 6,424 plans' audited-notes features were fetched but never shown; and a vesting refinement REFUSED after five rounds (v60)

**The defect that mattered was in the FRONTEND, not the parser.** Eaton
Savings Plan's page showed "The exact formula lives in the plan document
/ SPD" and three rows reading "Not stated — filing attachment absent or
unreadable", while its stored entry held the match (50% of the first 6%
of pay), a 3-year cliff, the 4% Eaton Retirement Contribution, loans,
Roth and 6% auto-enroll — every one quoted from its audited notes.

`ensureLineup` fetched a plan's own shard entry only when the boot
bitmask said the plan had a CONFIDENT LINEUP (bit 1). Eaton invests
through the Eaton Savings Trust, so its own Schedule H 4i is a trust
pointer, the lineup bit is off, the fetch never happened — and the
audited-notes features died with it. `featKey` (bit 4, "this entry has
features") was computed at boot and never read by anything. **6,424
plans** have features but no confident own lineup; every one of them was
falling back to characteristic-code text while the filing's own words
sat in the shard. Fixed by fetching on `lineupKey || featKey`; the
lineup itself still requires confidence, so a trust pointer is still
never shown as a menu. Verified in a browser against Eaton, smoke test
green, no re-parse required.

**Voluntary after-tax missed on list enumerations.** "Employees may make
a combination of before-tax, after-tax, and Roth contributions" — the
patterns required "contributions" to follow "after-tax" directly, so a
list sharing one noun never matched. 12 filings in the 822-filing set
gained the flag; all 12 read by hand and all genuine (Goldman Sachs, one
that spells out "other voluntary after-tax contributions", one "at all
times fully 100% vested in their pretax, Roth, after tax…"). This
matters beyond a checkbox: after-tax plus in-plan conversion drives the
mega-backdoor flag.

**REFUSED: vesting-by-source from "100% / fully vested in X".** Eaton
vests matching contributions immediately while its 3-year cliff covers
only retirement and transitional-pay money — the same money-source split
R.H. White surfaced hours earlier, which v59 already reads from the
unambiguous "vested immediately in X" wording. Extending it to the
looser "100% / fully vested in X" phrasing failed five successive
rounds of hardening, each sweep surfacing a new shape that means the
OPPOSITE:
1. the schedule TRAILS the source ("100% vested in the Company's
   matching contributions after completion of one or more years");
2. IRC plan-termination boilerplate;
3. a clause bridged by a period pdftotext dropped ("fully vested in
   their own contributions and earnings thereon  Vesting in employer
   matching contributions is based on…");
4. NEGATED forfeiture ("if a participant is NOT fully vested in matching
   and non-elective contributions upon severance");
5. employee-GROUP splits (one population vested at all times, another at
   20 percent per year) and join-date eras;
6. event ACCELERATION ("immediately fully vested … upon reaching age 65,
   becoming disabled … or death");
7. explicit EXCLUSION — "fully vested in his or her account balance at
   all times, WITH THE EXCEPTION OF the employer-matching contribution
   subaccount", the exact opposite claim.
After all seven guards, hand-review of the 49 surviving changes still
found ~15% wrong, and the guard strict enough to suppress them (an
explicit immediacy adverb) also suppressed Eaton's own honest wording.
The branch was deleted, with the reasoning left in the code so it is not
re-attempted blind. Eaton keeps "3-year cliff" — true of the retirement
money, incomplete about the match. An incomplete-but-true label beats a
specific claim about someone's vested money that is wrong one time in
seven.

**Review discipline note.** During that review I wrongly flagged a QNEC
case as a false positive: the sweep's evidence line printed a different
sentence (age-65 acceleration) than the extractor had actually matched
("Participants are vested immediately in their contributions and the
Company's qualified nonelective contributions"), which was correct. A
sweep that prints evidence must print the SAME match the extractor used,
or the review judges the wrong text — and the fix was then measured
against the SHIPPED version rather than an older snapshot, so the delta
reflects what users would actually see change.

## 2026-08-20 — Swinerton (owner-submitted): the site showed the WRONG match — the paragraph saying no match was made (v62)

**The worst display defect an owner report has surfaced.** Swinerton's
notes carry two employer-matching paragraphs back to back. The first —
*discretionary matching* — says "The Company may elect to make
discretionary matching contributions… For the years ended December 31,
2024 and 2023, **the Company did not make any matching contributions**."
The second — *safe harbor matching* — states the formula actually in
force: "Contributions are equal to 100% of the participant's elective
deferrals, up to 3% plus 50% of the next 3%," worth $13,105,446 in 2024.

The page showed **"Discretionary — set year to year"** and quoted the
first paragraph. Someone comparing employers would conclude the match is
discretionary and unpredictable, when it is a formula, guaranteed by
safe-harbor rules, and immediately vested. Cause: the safe-harbor tier
phrasing had no pattern, so extraction fell through to the discretionary
branch sitting directly above it. Fixed by reading the "equal to X% …
up to Y% plus Z% of the next W%" form; a stated formula already outranks
the discretionary label once it parses.

**Eligibility read a broken number from a replaced rule.** The page said
"✓ **000** hours of service" — "1,000" with its comma-grouped digits lost
to a bare `\d{1,4}` — quoting "If this requirement was not met, the
employee would have become eligible after completing 12 months and 1,000
hours." That sentence describes the rule **the filing had already
replaced**: "Prior to January 1, 2024…" opens the paragraph, and the rule
in force is "Effective January 1, 2024… three consecutive calendar months
of service." Three fixes: comma-grouped numbers parse, adjectives may sit
between the number and its unit ("three consecutive calendar months"),
and superseded rules are vetoed. 23 plans in the 822-filing corpus were
showing "000 hours of service".

**Vesting was dropped for being legally impossible.** "A participant is
100% vested after five years of credited service" exceeds the IRC
§411(a)(2)(B) 3-year cliff limit, so the legal-bounds guard rejected it
and showed nothing. A 4-6 year reading now reports the horizon without
asserting the shape — the wording the bare-schedule fallback already
used. 29 plans gain a vesting figure they previously lacked.

**The sweep corrected that fix TWICE, the same way both times.** First it
broke the sentence loop, preempting better answers on 20 plans. Made
last-resort, it still sat 20 lines before the immediate-vesting reader
and overwrote "Immediate" on 11 plans whose notes vest deferrals
immediately and employer money over years. Reporting that as a flat
6-year schedule tells a participant their own money is locked when it is
not. The reader now runs LAST, after every other vesting path. Rule
recorded: a fallback is defined by its POSITION as much as its condition
— "only if nothing better was found" means after everything that could
find something better.

**Expense ratios followed a coincidence instead of the vehicle.** v59
suppressed mutual-fund ER estimates for collective trusts, but keyed it
on whether Schedule D carried a matching dollar value. Schedule D matched
9 of Swinerton's flexPath vintages and missed the rest, so one table
priced some at 0.10% and left their siblings blank. The estimate now
follows what the filing says the vehicle IS: no mutual-fund price for a
collective trust or an insurance pooled separate account, matched or not.
Universe-wide that removes a wrong-vehicle price from 8,831
collective-trust rows and 52,703 pooled separate accounts — neither has
public pricing.

**Verified against the ORIGINAL filing, not the annotated copy.** The
owner's highlighted PDF OCRs badly — the ink degrades the glyphs, and the
vesting paragraph came back as "vested after —————". Re-pulled from S3 to
work against the text production actually reads. Recorded as method: an
annotated copy is for finding WHAT is wrong, never for reproducing it.

**Not fixed, measured and deferred:** several plans quote a money-scoped
rule ("eligible for these discretionary contributions after at least
1,000 hours") as plan entry — the same class as R.H. White's
prevailing-wage sentence. The veto exists but is not applied on the
`eligRe` path. Pre-existing, not a regression, and kept out of a release
already corrected twice.

## 2026-08-20 — Swinerton, second pass: half the "fund lineup" is money no participant chose (v63)

**The holdings table presented employer-directed stock as an investment
option.** Swinerton's 29-row FUND HOLDINGS table totals $824,138,844.
Company stock is **$410,158,397 of it — 49.8%** — rendered like any other
row, with a "% of holdings" share, a type, and a place in the menu. The
filing itself draws the line the site erased: Note 3 states *"Investments
in Company stock are nonparticipant directed and held in both the
profit-sharing and ESOP portions of the Plan,"* and the statements
separate $413,980,459 of participant-directed assets (pooled separate
accounts, registered investment companies, common collective trusts) from
$410,158,398 that are not. A reader comparing menus would have counted
the employer's ESOP contribution as a fund choice and read every other
holding's share as half what it is of the money participants actually
direct.

Neither `app.js` nor `scripts/lib-4i.mjs` contained the string
"nonparticipant" before this change — the distinction had never been
represented at all.

**Fixed by quoting the filing, not by inferring rows.** A new
`nonPartDirected` feature captures the filing's own sentence and the
holdings section prints it above the table. Row-level re-labelling was
considered and rejected: 34 of the 911 corpus filings use the phrase, and
most of those uses are **not** about employer-directed holdings —
forfeiture suspense accounts, money markets that exist to pay plan
expenses, wrap-contract "non-participant directed withdrawal" clauses,
`** Historical cost is disclosed only for nonparticipant-directed
investments` footnotes, a section heading glued to unrelated QDIA text
(GSK), and flat negations ("There are no non-participant directed
investments"). Inferring which *row* each of those refers to is guesswork;
quoting the sentence is not. So the sentence must tie the phrase to
employer stock or an ESOP, and 4i/statement table rows are excluded.

**The table guard has to run on the raw text, not the quote.** The first
version tested the extracted quote for dollar columns. `sentence()` caps
at ~300 characters, so a table row's dollar columns fell off the end of
the string and Vertex's statement line and Lennar's 4i row both passed as
prose. Judging a ±(250,150) raw window instead rejects both while keeping
an intro sentence that merely *precedes* a table (Vertex's real Note
sentence, which names the fund, is picked up two occurrences later).
Recorded as a rule: **a guard against tabular text must see the text the
table is in, never a truncated excerpt of it.**

**A lock without its escape overstates the lock.** Some plans direct the
employer contribution into stock *and* let participants move it out —
Skyworks says both in one sentence, NextEra and Regeneron in the sentence
after. Quoting only the first would misrepresent a plan that is not
locked. A second quote is captured when the filing makes the
counter-statement, and printed with the first.

7 of 911 corpus filings flag (Swinerton, NextEra, Skyworks, Vertex,
Regeneron, Occidental, and Swinerton's second copy); every accepted quote
was read against its filing. The 822-filing delta versus shipped v62 is
**0 changes to match, vesting, eligibility, and every other field** —
purely additive. Known residual, conservative by design: 3M's
"non-participant-directed 3M-provided Company Contribution Account" says
so without the word "stock" and is not flagged.

## 2026-08-21 — v63 shipped 133 employer-directed quotes; 19 of them were table wreckage (v64)

**Reviewing my own release found the defect.** v63's `nonPartDirected`
reader landed on 133 plans. Reading all 133 quotes: 19 were not sentences.
Eleven were financial-statement page headings whose column labels stack
("EMPLOYEE STOCK OWNERSHIP AND 401(K) … STATEMENT OF NET ASSETS AVAILABLE
FOR BENEFITS DECEMBER 31, 2024 Participant Nonparticipant Directed
Directed Allocated Unallocated"), and eight opened mid-word with the "…"
truncation marker, dragging in fund rows and share counts (*"…Ap Index
Fund Admiral Mutual Fund 398,133 Vanguard ShtTrm Invstmnt Grade
Admiral…"*). The v63 raw-window guard catches dollar columns; it does not
catch a header, because a header has no dollars in it.

ESOP filings are the concentration: they present a two-column statement
splitting participant-directed from nonparticipant-directed money, so the
phrase appears in the column header of nearly every such filing.

**The first version of the guard was worse than the bug.** Matching
`Participant|Nonparticipant|Directed` followed by any of the same words
rejected **65 of 133** — because "non-participant directed", the exact
phrase this reader exists to find, *is* two of those words adjacent. It
threw out Skyworks' correct quote. The signature of a stacked header is a
REPEATED label — `Directed Directed`, `Participant Nonparticipant`,
`Allocated Unallocated` — not the phrase itself. Recorded as a rule:
**a junk-shape guard written from the junk's vocabulary will match the
signal, because the junk is made of the signal's own words. Anchor on
what is repeated or misordered, never on the words themselves.**

**Order mattered again.** Judging shape before trimming threw away two
correct lead sentences whose only fault was the column header glued to
their tail (*"The Plan's investments in the Company's common stock, which
are non-participant directed investments, … are presented in the
following table:"*). Trimming first and judging the remainder keeps them.
This is the second release running where a fix was correct but placed
wrong — see the v62 vesting-horizon entry.

Net: 133 → 114 quotes, the 19 unreadable ones dropped; a filing whose
first hit is a header now falls through to its next occurrence, which is
usually the real Note. All 7 corpus specimens keep byte-identical quotes,
822-filing delta on every other field is 0, parser gate green.

## 2026-08-21 — Meta's $22.4B plan showed nothing: cipher that maps onto LETTERS (v65 + OCR v7)

**Found by sweeping the "nothing extracted" class at the owner's request.**
3,883 full-form filers have no lineup and no features. Sorted by assets,
the top entry is **Meta Platforms, 401(k), $22.4B, 93,515 participants** —
blank on every field.

The attachment is complete (pp. 200–215 of a 215-page filing). Its text
layer is a substitution cipher: p210 extracts as `:3A 9 A4 : 7 1 ( O 9 A3
A 47 17 9`. Rasterized and OCR'd, the same page reads perfectly. So the
data was always reachable; the pipeline never tried. Our OCR trigger flags
a page that is near-empty, under 50% letters, or full of control
characters. **This cipher maps glyphs onto letters**, so the pages score
0.73–0.93 letters and pass all three tests — 5 of 214 pages were flagged,
none of them the notes.

**The first discriminator I built was wrong, and the corpus said so.**
Scoring pages by how many tokens are ordinary English/filing words
separated cipher (0.019–0.042) from Meta's readable pages (0.449–0.525)
— but it also condemned **legitimate securities schedules**: Goldman's and
MetLife's 4i pages and a global equity listing score 0.013–0.096, because
"AFFLE (INDIA) LTD INR2", "HENRY HB LD1 FUT (IFE) EXP APR 30" are proper
nouns and abbreviations, not vocabulary. Across the corpus it would have
added 175 OCR pages, most of them readable tables — the same budget flood
that cost the JPM class its real schedule.

What cipher cannot fake is **case shape**. Substituted glyphs mix upper
and lower inside a token (`cNYbR`, `aUNa`, `dVaU`); real text, including
ALL-CAPS security names, is all-lower, ALL-UPPER, or Capitalized. Measured
over 822 filings: cipher pages 0.62–0.82, every readable page 0.000–0.007
— and the rule adds **8 pages across 2 filings**. Threshold 0.25 sits in
a gap two orders of magnitude wide.

**Reading the recovered text found two more defects before they shipped.**
Running the extractor on Meta's OCR'd notes produced:

- **`match: "100% of the first 50% of pay"`** from *"a dollar-for-dollar
  match, up to 50% of the IRS employee deferral limit."* The percentage
  caps the **402(g) dollar limit**, not pay. Published, it would have told
  93,515 people their employer matches half their salary. Now the cap's
  own object is checked, and the formula reads *"100% of deferrals, capped
  at 50% of the IRS deferral limit"* — a stated formula, which must
  outrank the discretionary sentence beside it exactly as Swinerton's
  safe-harbor tier does.
- **`eligibility: "500 hours of service"`**, quoting the SECURE
  long-term-part-time rule from inside a list of **ten excluded classes**
  ("interns or co-op employees, unless…"). Meta's actual rule is entry on
  employment. The fallback eligibility path applied only two of the four
  vetoes the primary path uses.

**Importing the other vetoes wholesale cost 87 correct values.** SUBGROUP
reads *"Full-time and **part-time** employees … are eligible to participate
upon hire"* as a carve-out when it is the plan-wide rule; an EXCLUDED
lookback window catches any filing that lists exclusions anywhere nearby;
NOT_ENTRY over a 250-char window cost 19. Scoping both surviving vetoes to
the matched **sentence** — and dropping SUBGROUP and FOR_MONEY entirely —
leaves 22 changes: 13 gap-fills, 6 corrections ("1,000 hours" → "Upon
hire" where the filing says *"eligible to participate in the Plan upon
employment"*), 3 losses of which 2 are right. Recorded as a rule: **a veto
tuned for one match shape is not evidence about another; re-measure it on
the shape you are adding it to.**

Residual, accepted: one filing states immediate entry and its exclusion in
a single sentence ("…except that employees scheduled fewer than 20 hours
per week are not eligible to participate until…"), and the sentence-scoped
EXCLUDED veto drops it. One loss against thirteen gains.

Meta now extracts: match *100% of deferrals, capped at 50% of the IRS
deferral limit*; vesting *Immediate*; eligibility *Upon hire*; Roth;
auto-enrollment 10%; Fidelity BrokerageLink. OCR_VERSION 7 is required —
the OCR text cache is keyed by ack + OCR version, so without the bump the
cached v6 text (which never saw these pages) would hide the fix.

## 2026-08-21 — the v65 Meta fix shipped, re-parsed, and changed nothing: the OCR cache was keyed by page COUNT (v66 + OCR v8)

**Verifying the fix is what caught this.** Run #152 re-parsed Meta at
`pv 65, ov 7` — the new detector ran — and the plan came back with no
entry and no features, exactly as before. The verdict line moved by
`entries +1, match +1`, nowhere near what recovering a cipher class
should look like.

Cause: the OCR text cache. Cache files are named `{ack}.v{OCR_VERSION}.txt`,
and a deliberate fallback accepts an **older version's file** for any
filing with ≤40 bad pages, on the reasoning that "small scans produce
identical text across targeting versions — targeting only changes
>40-page filings." That reasoning held for v3→v5, which changed only
*which* of many bad pages to spend the budget on. **v7 changed detection
itself**: Meta's bad-page set went from 5 pages to 12, the 7 new ones
being the cipher notes. With 12 ≤ 40, the fallback happily returned the
v5 text — OCR'd from the five pages that were never the notes — and the
combined re-parse saw the same garbage as before.

The v65 log entry even says "OCR_VERSION 7 is required: the OCR cache is
keyed by ack + OCR version, so cached v6 text would hide the fix." That
was right about the mechanism and wrong about the remedy: bumping the
version does not help when the code reads older versions anyway.

**Fixed by keying the cache on the thing that actually determines the
text.** Every cache file now opens with `#bad:<page,list>`, and a file is
reused only when that list still matches what detection produces now. A
pre-header file is never trusted, so the first run after this pays a
one-time re-rasterize for the OCR set and every later version bump is
both cheap and correct. Recorded as a rule: **a cache key must name every
input that changes the cached value. "Same version" and "same size" are
proxies; the page list is the input.**

Not yet fixed, measured: SMART Local 265 (`36-3911499|002`, $378M, 2,490
participants) files a complete audit whose 4i schedule has `N/A N/A N/A`
filler columns between the description and the numbers. Four of its seven
holdings are dropped, leaving ratio 0.441 — below the display bar — where
ignoring the filler columns yields all seven at ratio 0.988 against plan
assets. A second, cosmetic defect in the same filing splits capital
letters ("M utual funds", "M ainStay M K", "M SCI"); one row currently
parses with the name "M utual fund". Held for its own release so the
lineup delta can be attributed.

## 2026-08-21 — Meta recovered, but run #153 traded 20 real menus for statement rows; NOT mirrored

**The fix worked.** Meta Platforms (`20-1665019|001`, $22.4B, 93,515
participants) came back at `pv 66, ov 8, ocr 1` carrying match *"100% of
deferrals, capped at 50% of the IRS deferral limit"*, vesting *Immediate*,
eligibility *Upon hire*, Roth, 10% auto-enrollment and Fidelity
BrokerageLink. The cache diagnosis was right.

**And the same run broke 20 other plans.** Audit HIGH went 4 → 24, all
new ones `reparse-loss`. Sampling seven against the previous data commit:
every one was an OCR-sourced confident menu of 25–33 real funds
(Fidelity/Vanguard/Schwab names) now reduced to 1–6 asset-class summary
rows — *"Mutual funds"*, *"Common collective fund"*, *"Pooled separate
accounts"*, *"Beginning of the year"*. Net `confident` stayed flat only
because roughly as many filings gained. **Main was not mirrored**; it
still serves the v65 data.

**Proven, by reconstructing one filing end to end**
(`20241010154722NAL0011685891001`): OCR'ing all 26 of its bad pages
reproduces the correct 28-fund, $501.5M menu — at psm 6 *and* at psm 1.
OCR'ing only the **head** pages produces exactly the junk that shipped:
3 rows, *"End of the year / Beginning of the year / Participant
rollovers"*. So production OCR'd the head only, which happens solely when
`bad.length > 40` sends the filing through `targetPages`. Locally that
filing has 26 bad pages under both the old and the new detector.

**Two hypotheses tested and disproven before that** — recorded because
being wrong twice is the point of writing it down. (1) *The v7 mixed-case
detector pushed filings over the 40-page targeting threshold*: it adds
**zero** pages to this filing. (2) *The cache had been skipping
`detectRotation`, which now false-positives and forces psm 1*: OSD does
report `Rotate: 180` at confidence 5.45 on a page psm 6 reads perfectly,
so the probe **is** unreliable — but psm 1 parses this filing to 29 funds
and $514.7M, so it is not what broke these plans. A guard was written for
it and **reverted unshipped**, because a change defended by a disproven
hypothesis has no business in the parser.

Left open deliberately rather than guessed at a third time: why the
runner's bad-page list exceeds 40 when the sandbox's is 26. The parse-job
log holds the answer (`ocr N pages`, `strip-scan N bad pages →
targeting N`) and the Actions blob host is unreachable from this sandbox
via curl, so it needs `get_job_logs`.

The durable fix this argues for, independent of that answer: **a stored
confident, real-menu-shaped lineup should never be replaced by a smaller,
lower-ratio parse of the same filing.** The merge already keeps stored
entries when a download fails; it should also keep them when a re-parse
comes back materially worse, and flag rather than overwrite.

## 2026-08-23 — the SEC ticker matcher's manager gate was a no-op for every T. Rowe Price holding

**What was wrong.** `scripts/match-sec-tickers.mjs` refuses to hand a filed
holding a ticker unless the filed name names the same fund manager as the
series it matched. That gate had three independent holes, and together they
made it decorative:

1. **The manager vocabulary admitted single letters.** It was built by taking
   each SEC registrant's leading token. "T. Rowe Price Growth Stock Fund,
   Inc." contributed **`"t"`**; "J.P. Morgan Exchange-Traded Fund Trust"
   contributed `"j"`; "X-Square Balanced Fund, LLC" contributed `"x"`; "M
   Fund Inc" contributed `"m"`. "TRUST FOR PROFESSIONAL MANAGERS"
   contributed the English word **`"for"`**. `"t"` is a token of every
   normalized T. Rowe Price name, so every TRP holding in the universe
   presented a satisfied manager gate.
2. **The bucket filter compared substrings, not tokens** —
   `hay.includes(m)` with `m = "t"` is true of essentially every fund name in
   the SEC file. Even a correct short manager phrase could not constrain
   anything.
3. **Registrants named after their own product leaked descriptive phrases.**
   "BOND FUND OF AMERICA" yielded the manager `"bond fund"`, which matched
   the filed `"High Yield Bd Fund"` — a string that names no manager at all —
   and handed it a ticker.

**Also found in the same review**, and separately wrong: the superset pass
checked only `DISCRIMINATORS` for words it was dropping, and neither
"commodity" nor "strategy" was on that list. **"PIMCO Commodity Real Return
Strategy Fund" resolved to PRRIX — the PIMCO Real Return fund.** A TIPS fund
was standing in for a commodities fund, at a different fee, under a ticker
asserted as fact.

**Blast radius.** None live. The matcher is committed but was never wired
into the pipeline or the site, and its output has never been published. The
44.0% coverage figure reported to the owner on 2026-08-23 was measured
behind the broken gate and is withdrawn.

**The change.**
- `managerPhrase()` builds a manager as a PHRASE, extending while the phrase
  so far is generic or ≤4 characters, so "t" becomes "t rowe" and "j p"
  becomes "j p morgan". It is built from the entity name WITHOUT the NOISE
  list applied, because "funds" is noise inside a series name but is half the
  house name in "American Funds" — stripping it produced "american target
  date", which no filed name contains, and failed that whole 20k-row family.
- A phrase built entirely from description or structure words is rejected, so
  "bond fund", "income fund", "growth fund", "total fund", "target portfolio"
  and "international growth" leave the vocabulary while "first trust",
  "first eagle", "value line", "global x" and "american funds" stay.
- The bucket filter matches on token boundaries.
- The superset pass now checks `ASSET_WORDS` — asset class, sector and region
  — instead of the narrower `DISCRIMINATORS`. "PIMCO Commodity Real Return
  Strategy Fund" now resolves to nothing rather than to the wrong fund.

**The prevention.** `scripts/ticker-precision.mjs` samples matched holdings
**stratified by match reason** (`exact`, `superset`, `year-pinned`, `+class`,
`+ambiguous`), one row per distinct filed string, and prints filed name
against SEC series for hand review. An unstratified sample hides exactly the
paths that fail: the common reasons are overwhelmingly right, and drown the
rare ones. Every one of the four defects above was found by reading that
output. Nothing from the matcher ships without a pass through it.

## 2026-08-23 — rejected: inferring a fund's manager from the rest of the plan's lineup

**The idea, and why it was tempting.** 478,611 filed holdings name no manager
at all ("TARGET RETIREMENT 2030", "500 Index Fund", "Large Cap Growth R6") —
30% of every row, and the single largest bucket. Recordkeepers abbreviate
consistently within one filing, so a lineup that spells "Vanguard 500 Index
Fund" elsewhere should identify its terse rows. Measured: **68.9% of those
rows sit in a plan with a single dominant manager**, and prefixing that
manager resolved 52,201 of them.

**Why it was rejected.** The sample was full of cross-manager contamination,
because the rows that name no manager *we recognise* are frequently rows that
name a manager perfectly well in words the vocabulary missed:

```
fidelity   + AMERICAN EUROPACIFIC GROWTH R6   -> FDGRX   (American Funds' fund, Fidelity's ticker)
vanguard   + Great Gray Mid Cap Growth Fund   -> VMGRX   (Great Gray is the TRUSTEE)
blackrock  + TRP Inst Lg Cp Core Grwth        -> WLCGX   (T. Rowe Price's fund)
t          + JPM Large Cap Growth Fund        -> DTLGX   (JPMorgan's fund)
t          + Frontegra Small Cap Core Fund    -> JAHBX
```

A plan's dominant manager is evidence about a name that says nothing; it is
not evidence about a name that says something we failed to read. Separating
those two cases reliably is the same problem as reading the name, so the
technique buys nothing it does not also cost. Recorded here so it is not
re-proposed: the yield is real, the precision is not.

## 2026-08-24 — pooled-vehicle comparables: three dead tickers, a missing asterisk, and 356 wrapper rows

The funds-and-tickers agent added comparable registered funds for the large
collective-trust families (BlackRock BTC index trusts, SSGA/State Street,
Northern Trust, BlackRock Russell, T. Rowe Price Structured Research). Its own
work found and fixed a real shipped defect; reviewing it before it landed found
three more.

**What the agent got right, and it was already live-wrong.** The `pooled` test
in `fund-er.js` recognised "trust" spelled out but not the recordkeeper
abbreviation "Tr". So `T. ROWE PRICE RETIREMENT 2050 TR-K` and
`T. Rowe Price Structured Research Tr-C` were being shown with the mutual
fund's ticker and **no asterisk** — a claim that the plan holds the registered
fund when it holds the collective trust, at a different fee. Fixed with a
trailing-anchor pattern (`/\btr[\s-][a-z0-9]\s*$/i`) narrow enough not to
collide with "TRP", the T. Rowe Price manager abbreviation. Measured across the
universe: **166 holdings** flip from exact to asterisked-comparable, every one
of them a genuine trust, **zero** flipped without a trust marker. (The agent
reported ~1,600 distinct filed names matching the pattern; the number that were
actually getting a wrong exact ticker is 166. The measured figure is the one
that counts.)

**Defect 1 — three of the twelve proposed tickers name funds that no longer
exist.** BSPIX and MAIIX (iShares S&P 500 / MSCI EAFE International index
mutual funds) and BRGNX (iShares Russell 1000 Large-Cap Index Fund) are all
absent from the current SEC series/class snapshot; BlackRock has consolidated
or wound them up. The `iShares S&P 500 Index Fund` survives in the snapshot
only as WFSPX (Class K). This is notable because the agent applied exactly this
test elsewhere and correctly refused BlackRock LifePath Index on the strength
of it — the registered LifePath Index mutual funds are being liquidated on or
about 2026-10-16 and are already gone from the snapshot — but did not apply it
to its own additions. Replaced with the same manager's surviving vehicle for
the same index, each verified present: **WFSPX**, **EFA**, **IWB**. Their
expense ratios are left `null`: the fund is identified, the fee is not
verified, and the table renders "—" rather than a number nobody checked.

**Defect 2 — a comparable was being asserted as the fund itself.** The
non-pooled branch of `fundTickerInfo` returns `comparable: false` for a
FUND_COMPARABLE hit, which is right for a retail mutual fund
("Vanguard Target Retirement 2040 Fund") and wrong for a pattern that can only
ever describe a collective trust. `BlackRock Equity Index F` and
`SSGA S&P 500 Index NL Series N` name no trust anywhere, so the pooled test
missed them and they returned WFSPX / SSSYX with **no asterisk** — the same
false claim the "Tr" fix had just removed, reintroduced through a different
door. Entries whose pattern is CIT-only now carry a third element marking them
always-comparable.

**Defect 3 — 356 holdings were third-party wrappers.** `LVIP SSGA S&P 500
Index` is a Lincoln separate account, `Principal/BlackRock S&P 500 Index` is
Principal's, `MM S&P 500 Index Fd(Northern Trust)` is MassMutual's. Each tracks
the same index through the same sub-adviser, so naming the sub-adviser's fund
looks harmless — but the wrapper's fee is materially higher, and understating a
fee is the one error this site cannot afford. Measured: LVIP 225, Principal
~116, MassMutual 9, Transamerica 5. They now resolve to nothing.

A first attempt at that guard was embedded in each individual pattern and
**silently did not work**: `fundTickerInfo` tests both the raw name and the
abbreviation-expanded one, and `expandFundName` rewrites "MM", so
`MM S&P 500 Index Fd(Northern Trust)` still resolved. The guard is now a single
up-front gate tested against the RAW name only. A bare trustee name is
deliberately not treated as a wrapper — "Great Gray Trust Co. BlackRock EAFE
Eq. Index" is BlackRock's strategy in a collective trust with no registered
product of its own to name.

**The prevention.** A comparable must name a fund that still EXISTS: every
proposed ticker is now checked against the current SEC series/class snapshot
before it ships, which is a local, primary-source check requiring no network.
Absence from the snapshot is what caught all three, and it is the same test
that correctly killed LifePath.

## 2026-08-24 — sponsor-to-ticker matching: four rounds of refusals before anything shipped

**What was wrong.** Only 160 of 110,555 plans carried a ticker, because
`scripts/companies.json` is a hand-built list of ~110 large employers. Searching
"GEV" found GE Vernova only because someone had written Ropcor into that list by
hand; searching almost any other listed company's ticker found nothing. The fix
is a second pass that matches sponsor names against the SEC's full registrant
list (10,403 tickers, `sec-companies.json`).

Coverage is trivial to get here and precision is the entire product, so this
entry records the four rules that had to be added, each of them measured against
filings and sponsor names read by hand rather than assumed.

1. **A bare prefix match is not identification.** "General Electric Credit
   Union", "McGraw-Hill Education Holdings", "Target Foundation" all begin with
   a listed company's name and are none of them. The guard is a vocabulary of
   words naming a DIFFERENT KIND OF INSTITUTION, not a count of extra words —
   most extra words are innocent ("Union Pacific Railroad Company").

2. **A one-token company name is unsafe as a prefix.** Split by token count over
   625 attributions on sponsors with >=5,000 participants — 479 exact, 42
   multi-token prefix, 104 single-token prefix — every error found by hand
   review was in the last group: Compass Group USA -> COMP (a brokerage),
   Banner Health -> BANR (a bank), Citizens Financial Group -> CIA (a Texas
   insurer), Latham & Watkins -> SWIM (a pool company). Twelve sampled
   multi-token prefix matches were all correct, so the boundary is token count,
   not a hand-listed vocabulary of "common" words — that list would have been a
   guess and would never have caught Banner or Citizens.

3. **Suffix stripping manufactures false exactness.** The rule above said a
   single-token name may still match EXACTLY. Sampling the sub-5,000-participant
   tail — a different population, per the standing "sampling frame decides the
   answer" trap — showed exactness there is worthless: "Superior Holding, Inc."
   and "SUPERIOR GROUP OF COMPANIES, INC." both reduce to the token "superior"
   and scored [exact]. So did "Parsons Group, Llc" against PARSONS CORP. Also
   fixed here: a possessive "s" was counting as a token, which is how a Maine
   car dealership ("Charlie's Motor Mall") and a Toledo one both drew CHUC, a
   vape company.

4. **A two-token ordinary-English name plus extra words is not identification
   either.** "National Bank Of Middlebury" -> NBHC (National Bank Holdings);
   "James River Home Health Care, Llc" -> JRVR (an insurer). Neither is caught
   by the institution vocabulary and neither can be — "of middlebury" names
   nothing at all. Prefix matches now require a company name of three or more
   tokens.

**The self-correction.** Rule 3 as first written refused EVERY single-token
company name, which also lost Kroger, Insperity, DaVita, Cintas, Albertsons and
AutoZone — brands that are not ambiguous at all. The difference between those
and "Superior" is whether the word is coined or ordinary, and that turned out to
be measurable in data already in the repo: how many distinct sponsors in the
110k-plan universe lead with the word, and how many SEC registrants use it.

    kroger    1 sponsor /  1 registrant      superior  105 /  4
    cintas    1 /  1                         national  397 / 71
    davita    1 /  1                         premier   155 /  5

Scored over 22 known-good and 15 known-bad single tokens, "<=2 sponsors lead AND
<=3 registrants" admits 16 of the good and NONE of the bad, including the three
errors that motivated the rule (parsons 4 sponsors, charlie 4, latham 3). The
safe list is GENERATED from those counts and committed
(`scripts/sponsor-single-tokens.json`, `node scripts/match-sponsors.mjs
--tokens`), not hand-written.

An earlier attempt scored distinctiveness by how many sponsors share a matched
key — it separated National Bank (5) and James River (8) from Best Buy (3) and
Colliers (4), but on four data points that is a fitted threshold, not a
measurement, and it was not used.

**What shipped.** 1,825 plans across 1,672 tickers, up from 160. The entire
prefix-match class (23 attributions) was read in full rather than sampled: all
23 are wholly-owned subsidiaries of the named parent. A 40-row spread sample of
the exact-match class in the sub-5,000-participant tail read clean.

**What did not ship.** 3,365 plans across 3,236 sponsors are REFUSED and written
to `docs/sponsor-review-queue.json`. Roughly half of that queue's largest
entries are traps the guards caught: Target Corporation -> CBDY (a Canadian
cannabis shell, not TGT), CHS/Community Health Systems -> CHS INC (an
agricultural co-op), The Prudential Insurance Company of America -> PUK (UK
Prudential), The Crawford Group -> CRD-A (Crawford & Co; the filer is Enterprise
Rent-A-Car's private parent), Unifi Aviation -> UFI (a textile maker). Nineteen
of the correct ones were hand-confirmed into `companies.json` — FedEx, American
Airlines, Best Buy, Aramark, Quest Diagnostics, Allstate, CBRE, Dillard's,
Maximus, Travelers, Cummins, Gap, Concentrix, Amentum, Ensign, WPP, Toyota,
Takeda, UBS. PEO and multiple-employer filers (Paychex Retirement, TriNet HR
III/IV) were deliberately left refused: the plan is not that company's employees'
plan, so its ticker would misattribute 900k participants.

**The prevention.** A refused match is a blank field; a wrong match is a wrong
company on a live page. Every rule above exists to refuse, the review queue is
the only path from refusal to the site, and it requires a human. The curated
list still wins over the SEC match everywhere, and it now lives in one module
(`scripts/match-curated.mjs`) imported by both the pipeline and the applier, so
the two cannot drift into showing different companies.

## 2026-08-24 — the dropped issuer column defeats the master-trust guard: Harley-Davidson showed 4 junk rows over a real 23-fund menu

**What was wrong.** Harley-Davidson's salaried plan ($967M, 4,000 participants)
displayed a confident "lineup" of four rows: a $951.8M fund named "Various
(includes Registered" and three "funds" that are actually participant-loan
rows with the plan's own name glued on. Its master trust had parsed
confidently with the real menu — Fidelity Contra pool, BlackRock LifePath,
an SDBA — and never rendered. The Milwaukee/Tomahawk and York hourly plans
had the same wreckage; Altria's hourly plan rendered a $911.7M "Master Trust"
top fund plus "ALTRIA CLIENT SERVICES LLC" ($2.9M) as holdings.

**Why.** Compounding of the known column-(b) defect with the trust-pointer
guards. The filing (ack 20251209140245NAL0003813122001, line ~1964) puts
"Interest Held in Master Trust" in column (b) and "Various (includes
Registered Investment Companies, Self Directed Brokerage, etc.)" in column
(c). The parser keeps (c) and discards (b) — so the words "master trust"
lived only in the discarded column. Every guard keyed on those words: the
parser's trustPtr shape rule (requires trust-interest-looking rows), and the
frontend's majority-master-trust test. Both passed the junk. The frontend
test additionally only ran when the linked trust had a CONFIDENT lineup, so
Altria — whose trust is honestly unparsed — skipped the test entirely and
adopted its own pointer rows as a menu.

**The change** (frontend, `app.js`; no parser change — a measurement was
running). The pointer test now runs whenever a trust is LINKED (`mtiaAck`),
not only when it parsed confidently, and gains a name-blind shape test:
own lineup of <=8 rows with one row >=60% of value on a trust-linked plan is
a pointer, never a menu. Measured over all 343 trust-linked plans with own
confident lineups before shipping: the shape test fires on 37, and a sample
of 10 contained zero real menus — "At fair value" (Comcast), OCR cipher
"CITYEFGHI ABCDEFGHI" (Home Depot), "Investments Held in the Trust" (United
Airlines), "Trust" (Koch). Trust-confident plans flip to the real trust
menu; the rest to the honest gap. Verified in-browser on Harley (junk gone,
Contra/LifePath menu shown); smoke test green.

**The prevention.** The shape thresholds are the parser's own trustPtr
numbers applied where the trust link is extra evidence, not new constants.
The permanent fix is still the column-(b) ingest — when identity text is
kept, the name tests see "Interest Held in Master Trust" and the shape rule
becomes a backstop instead of the only defense. That parser change remains
the open owner decision.

## 2026-08-24 — v67: the identity column is kept (owner approved the re-parse)

**What was wrong.** The largest defect in the inventory: `parseRows` split
every 4i row into the identity column (b) and description column (c), and
when (c) named the fund, (b) was discarded at the `name = dClean` branch.
28 billion-dollar filings confirmed by hand across the day's test cycles:
"Vanguard | Institutional 500 Index Trust D" stored without Vanguard,
"Western Asset | Core Bond IS" stored as a share class naming nothing, and —
the compounding case — Harley-Davidson's "Interest Held in Master Trust"
discarded so that every master-trust guard keyed on those words passed the
wreckage in (c).

**The change.** Additive by design: the issuer is stored as its own field
(`iss`, ≤60 chars) on the fund row, never merged into the name — names stay
byte-identical to v66, so dedup keys, region scores, confidence and the
parser gate are untouched. `iss` is kept only when name-shaped: not a type
phrase (TYPE-first layouts like "Registered Investment Company | Fidelity
500 Index" store nothing), not numeric or footnote residue, not a duplicate
or substring of the fund name, not "See attached"/"Various". Layouts where
(b) holds the whole name and (c) only a type (Sanofi class) already used (b)
and are unchanged. One name change rides along: the empty cost column's
en/em dash is stripped from row tails, so the BWXT class loses its trailing
" —" (that dash also broke the tester's needle search, report #18).

**Verification before shipping.** v66 and v67 run side by side on six
specimens: identical fund counts everywhere, identical names everywhere
except the intended BWXT dash strip (diff printed name by name — only
dashes). Issuer capture spot-read: BWXT 24/27 rows Vanguard, Whiting-Turner
29/48 rows T. Rowe Price on its Retirement Hybrid trusts, Tortoise-plan
rows gain Fidelity/Western Asset/New York Life. The full 19-specimen parser
gate passes with ZERO expectation changes — the additive claim, proven.

**Frontend, shipped with it.** The issuer renders as a muted prefix in the
holdings table; ticker matching sees issuer + name together (this is what
makes "Core Bond IS" identifiable); the master-trust pointer test includes
`iss`, so the Harley class is now caught by NAME as well as by shape.
Entries parsed before v67 lack the field and render exactly as before.

**The prevention.** The bar for the re-parse verdict is the standing one:
merge's CONFIDENCE DIFF and the REPARSE VERDICT must come back flat on
confident/match/vesting/lineups (names did not change; any movement beyond
the BWXT dash class is a regression to investigate before mirroring), plus
`iss` coverage becomes a new counted column to trend.

## 2026-08-25 — v67 re-parse verdict: one lost lineup, and it was junk

Run #156 (commit d13052f) completed 00:48Z. Verdict, measured against the
previous run's `lineups-status.json` rather than the coverage line (the two
count slightly different populations — the status file is the like-for-like
comparison, and the discrepancy is worth remembering before reading a future
delta as a regression):

    confident acks   58,122 -> 58,121   (-1)
    gained                          0
    match / vesting              flat
    acks re-parsed to v67      68,482

**The single loss was a defect being removed, not a menu.** PetSmart's
$667M plan (ack 20250730114353NAL0002310499001) had a v66 CONFIDENT lineup
of six fair-value-hierarchy statement rows — "Mutual Funds $158,695,971 $",
"hierarchy 158,695,971", "statements", "Certain Plan investments are or were
shares of mutual funds" — at ratio 1.03, which is why it passed. v67 demotes
it, so the page shows the honest gap instead of six fabricated funds. Read
the filing to confirm before mirroring; both v66 and v67 produce junk from
that region, and v67 simply stops believing it.

**The payoff, measured:** 525,645 of 1,635,672 stored holdings (32.1%) now
carry the 4i identity column, across 33,838 of 64,604 entries (52.4%). Those
are the manager names that were being discarded — the field that makes
"Core Bond IS" mean Western Asset's Core Bond fund and lets a ticker match
be attempted at all.

Mirrored to main as b1a59bf after the diff review above.

## 2026-08-25 — v68: filler columns, OCR-tolerant guards, and the auditor's letterhead

Shipped under the owner's 2026-08-25 directive ("every problem at every point
should be fixed by yourself at all times"). Four defects, each found by a
filing-test cycle, each with a specimen read against the primary source.

**1. Filler columns fabricated 28 fund names.** Old Republic ($1.4B) files
`FIDELITY 500 INDEX   N/A   VARIABLE   N/A   1,056,601 sh   #   215,747,363`.
The (c) column's rate/collateral cells hold literal "N/A" and "VARIABLE",
which `cleanDesc` left word-shaped and letter-rich enough to be preferred
over the real name in column (b) — so every holding stored as
"VARIABLE 1,056,601 sh". `cleanDesc` now strips the filler vocabulary
(N/A, not applicable, variable, none, fixed, bare "#"), which empties the
description and lets the name column win. Verified row by row: 28 of 30 rows
changed, 0 "VARIABLE" names remain, and the plan now reads FIDELITY 500
INDEX / PIMCO REALPATH BLEND vintages / VANGUARD GROWTH INDEX INSTITUTIONAL.
This is the SMART Local 265 class; the specimen is now in the parser gate.

**2. An OCR typo defeated an exact-spelling guard — twice.** Buchanan
Ingersoll's scanned schedule stored "Investments at fair valuc" as a $412M
fund (99.4% of the plan) because the v44 rule spells "value"; the same
filing's "Notes recervable from participants" passed the loan filter for the
same reason. Both guards now match the stem and tolerate the middle
(`valu\w{0,2}`, `rec\w{0,3}vable`). The general lesson, recorded because it
will recur: **a vocabulary guard must be as tolerant as the text it reads.**
Exact spelling is correct for `pdftotext` output and wrong for OCR.

**3. The auditor's letterhead was a plan's largest holding.** Global Tax
Management stored "Maillie LLP | maillie.com 500 North Lewis Road, Limerick
PA" — the page carrying the "Schedule H, Line 4i" TITLE is the audit firm's
report page, so its region won scoring while the real menu (TRP Capital
Appreciation $11.0M, Vanguard index funds) sat unread 650 lines later. Web
domains, "Firm LLP |" mastheads and PO Box lines are now dropped, which also
lowers the letterhead region's score so the real schedule can win.

**4. Spelled-out street addresses.** The existing address guard required ≤5
words, so "500 North Lewis Road, Limerick PA 19468" survived with its street
number reading as data. A street suffix followed by a state and ZIP is now
dropped at any length.

**Verification.** All four guards tested against the exact filing shapes: five
junk rows dropped, both real rows (Vanguard, T. Rowe Price) kept WITH their
v67 issuers. Parser gate 20/20 green — the 19 existing specimens unchanged,
zero expectation edits, plus Old Republic added so the filler class cannot
regress.

## 2026-08-25 — v69: MetLife's $8.3B plan wore its maturity dates as prefixes

**What was wrong.** Every one of the 58 holdings in the MetLife 401(k) plan
was stored with its maturity date glued to the FRONT of the name:
"01-29-2031 BRITISH COLUMBIA(PROVINCE OF)CANADA 1.3% 01-29-2031". Found by
the 02:53Z filing-test cycle as a WRONG_REGION (0/12 names findable — the
names cannot be found in the filing because the filing never prints them
that way).

**Why.** Trustee-generated schedules often print columns (b) and (c) as the
SAME text, and this security's own name contains a wide internal gap:

    BRITISH COLUMBIA(PROVINCE OF)CANADA 1.3%    01-29-2031    <same again>    ****    165

`splitNameDesc` splits on 3+ spaces, so it cut mid-name: nameCol =
"...CANADA 1.3%", descCol = "01-29-2031 ...CANADA 1.3% 01-29-2031". The
description was letter-rich enough to be preferred, and its leading date
fragment became the start of the fund's name.

**The change.** When the description merely REPEATS the identity, it carries
nothing the identity lacks, so the identity wins. Plus a backstop that strips
a leading bare date from any assembled name.

**The self-correction, and why the gate exists.** The first version tested
plain containment — "does the description contain the identity?" — which is
the ordinary and CORRECT layout ("American Funds | Growth Fund of America
R6"), where the description is the informative half. The parser gate caught
it immediately: Plexsys collapsed 32 rows to 3 bare manager names, and Power
Design 27 to 15 (same sum, which is the signature of a dedup collapse rather
than a parse failure). The rule is now narrow: remove the identity from the
description and require that fewer than four LETTERS remain — dates and
punctuation do not count as information. Verified both layouts in one pass:
the MetLife row loses its date prefix, the American Funds row keeps its full
fund name.

Gate 20/20 green with zero expectation changes.

**Second v69 fix, found in the same cycle — Honeywell's $12.5B plan showed
the BLANK FORM.** Its stored confident lineup was ten rows of Form 5500
template placeholder text: "Charlotte NC 28202ABCDE CITYEFGHI ABCDEFGHI AB,
ST" at $12,345,678,901 (99% of the table), "S. Mint ABCDEFGHI 123456789
ABCDEFGHI ABCDEFGHI", "BENEFIT PLAN REPORTING". Every filing embeds the empty
form pages, which are pre-printed with sample text and ascending digit runs
in the value boxes — the standing trap list has warned that the form's
QUESTION text is never evidence, and this is the same trap one level deeper:
the form's SAMPLE ANSWERS parse as data. The existing `value >= 1e11` cap was
built for exactly this class but sits above the placeholders that matter
(1.2e10). Rows are now dropped on either half of the signature — an alphabet
run in the text, or a value that is literally 12345 / 123456789 /
1234567890(1)(2) — which also collapses the region's score so a real schedule
can win. Note the v67 trust-pointer shape guard did NOT cover this one: it
requires <=8 rows and Honeywell has 10, which is the limit of a shape rule
and the reason the vocabulary fix is the right layer.

## 2026-08-25 — v69 (3/3): "Balance Forward from Page 12" was a $0.5B plan's largest holding

Found by the 03:27Z cycle applying report #28's lesson — that a quiet
NAMES_MATCH batch still deserves a look at WHAT the rows are. The v44
carry-forward guard was anchored at the end of the name
(`^(balance |carried |brought )?forwards?$`), so the page reference kept the
row alive. It matters more than one bad label: the same-name dedup SUMS
distinct values, so several per-page carry-forwards compound into a single
large fake fund. The guard now allows a trailing "from/to ..." reference.

Verified that "Forward Air Corporation Common Stock" — a real company whose
name begins with the guard word — still parses. Gate 20/20 green.

Two more shapes were seen in the same batch and are NOT yet fixed, recorded
so they are not lost: "(a) Investments using NAV (CCT funds)" (a form-label
prefix on a note row) and "Multi-strategy funds" (an asset-class label
outside the current class vocabulary). Both are the class-label family from
report #28, which the frontend now labels rather than the parser deleting —
the gate refused a parser-side fix for that family, and these two do not
change that answer.

## 2026-08-25 — v68's verdict: +20 confident, and the loss review caught my own overreach

Run #157 landed. Like-for-like against `lineups-status.json`:

    confident acks   58,121 -> 58,141   (+20; 30 gained, 10 lost)
    match / vesting                flat
    acks at v68                  68,482

**Wins verified by name.** Old Republic: 30 rows, ZERO "VARIABLE" names —
the filler-column class is fixed. Buchanan: the fabricated $412M
"Investments at fair valuc" row is gone. Global Tax Management: the Maillie
letterhead is gone.

**Nine of the ten losses were MY BUG, not junk.** Every lost entry was a
3-row "Variable Annuity Contract" table — small plans whose entire balance
sits in a group annuity. v68's filler strip removed the word "variable"
everywhere, because it is filler in the `N/A  VARIABLE  N/A` rate cell of the
Old Republic layout. It is not filler in "Variable Annuity Contract", which
is the product itself, and stripping it took those plans' only holding row
with it. The strip now skips the word when it names a product (annuity, life,
income, universal, account, fund, contract), and the same care is applied to
"fixed" (Fixed Income Account, Fixed Annuity). Verified in one pass: the Old
Republic row still resolves to FIDELITY 500 INDEX, and Variable Annuity /
Fixed Income rows survive. Gate 20/20.

The tenth loss was genuine junk: a row named "Denotes party-in-interest as
defined by ERISA." — a footnote.

**Why this entry matters more than the numbers.** The re-parse verdict rule
says sample every lost lineup and confirm it was junk. Nine of ten were not,
and the only way to know was reading them. A +20 headline would have looked
like unambiguous success and shipped a regression to nine plans underneath
it. The rule earned its keep tonight; do not skip it because the delta is
positive.

## 2026-08-25 — v70: the 4i column HEADER was stored as a fund name 459 times

Found by measuring rather than by a single specimen. A cycle turned up
"Collectiv e Inv estment Trust" (spaced-letter OCR damage), and rather than
generalise from one row — the last two attempts to do that were both refused
by the gate — I counted the pattern universe-wide. The count came back mostly
FALSE POSITIVES, and the false positives were the real finding:

    459  column-header fragments stored as fund names
    758  participant-loan prose fragments
         of 1,638,473 rows

**The header.** Filings print "(b) identity of issue, borrower, lessor or
similar party | (c) description of investment including maturity date, rate
of interest, collateral, par, or maturity value". SKIP_ROW catches that when
it begins a line, but a WRAPPED continuation begins mid-phrase — "party
date,rate of interest, collateral, par, or maturity" — and parses as a
holding. One instance reads "par, or maturity value Fidelity Government":
the header ran into the next row's real name. So the rule STRIPS rather than
drops, and recovers the fund.

**The loan prose.** 758 rows are a loan row's runaway continuation lines
("Interest rates ranging from 4.25% to 9.50%", "maturing at various dates
through October 2034"). The loan row itself is excluded by type; these name
nothing.

**Two self-corrections, both caught by the gate.** The first version stripped
each header word independently with no word boundary: "Parnassus Core Equity
Fund" became "nassus Core Equity Fund", and a full header line eroded to the
bare word "maturity". Fixed by (a) requiring an unmistakable header PHRASE
before touching the name at all — a fund merely starting with "Par" is not a
header — and (b) rejecting a remainder that is itself header vocabulary.
Verified in one pass: "par, or maturity value Fidelity Government" → "Fidelity
Government", the pure-header row drops, and Parnassus and Partners Group both
survive intact. Gate 20/20.

**The lesson worth keeping:** the measurement was more valuable than the
specimen that prompted it. Counting a suspected pattern across 1.6M rows
found two defect classes that no single filing would have revealed, and
disproved the one I set out to fix.

## 2026-08-25 — v70: an 8-letter floor renamed 12,850 holdings after their manager

The largest single naming defect found since the identity column itself, and
found by following report #31's rule: a second bare-manager row appeared
("Great Gray" as a 25-row entry's top holding), so I measured the pattern
before touching it.

    EXACT bare-manager names   12,850 rows / 1,638,473  (0.78%)
    entries affected            5,392 / 64,605          (8.3%)
    Vanguard 1,928 · Fidelity 1,827 · American Funds 1,342 · BlackRock 492 ·
    PIMCO 476 · JP Morgan 436 · Invesco 420 · John Hancock 385

**A first measurement was contaminated and had to be thrown away.** It
normalized names by stripping trailing "Fund"/"Trust" before comparing, which
made real American Funds products — "American Balanced Fund" (646), "New
World Fund" (553), "New Perspective Fund" (479) — look like bare manager
names. Re-measured with exact comparison; those disappeared, which is how I
know the remaining 12,850 are real.

**Then I read the filing rather than inferring.** Great Gray files a textbook
two-column schedule:

    Great Gray   |   Index 2040 R   |   **   |   12,945,215
    Great Gray   |   Index 2035 R   |   **   |    6,829,742

"Index 2040 R" carries six letters. The description column was required to
have EIGHT before it could be preferred, so it was rejected and the row fell
back to the identity column — the fund became "Great Gray", and so did every
vintage beside it. The floor was excluding precisely the names it should have
protected: a target-date vintage is mostly digits by nature.

**The change.** When the identity column is SHORT (≤3 words — a house name,
not a fund name), a description of four-plus letters carrying a digit or a
second word is the product, and the house goes to `iss` where v67 puts it.
The 8-letter rule still governs everything else. Verified in one pass:
"Great Gray | Index 2040 R", "Blackrock | U.S. Debt Index 1", while a
type-only description ("Common Collective Trust") is still correctly
rejected. Gate 20/20.

**Why this sat undetected.** Every check the system has was satisfied: the
name is really printed in the filing, the value is right, the coverage ratio
is right, and the tester scores NAMES_MATCH because "Great Gray" does appear
on that line. Only asking "is this row a FUND?" surfaces it — the question
report #28 added, now paying for itself twice.

## 2026-08-25 — v69's verdict: +944 confident, and the "losses" were mostly wins

Run #158 landed. Like-for-like:

    confident acks   58,141 -> 59,085   (+944; 983 gained, 39 lost)
    acks at v69                        68,482

The largest single-version gain recorded. But the loss review is where the
work was, and it inverted the reading twice.

**Most of the 39 losses are junk correctly removed:** fourteen
"INVESTMENTS (at Fair Value)" statement rows, three blank-form placeholder
tables ("CITYEFGHI ABCDEFGHI AB, ST", "Charlotte NC 28202ABCDE...",
"123456789 ABCDEFGHI..."), plus bare "Vanguard", "Mutual funds",
"Investments". Those are the v69 fixes doing exactly their job.

**But sixteen looked like REAL MENUS** — "AF AMCAP" (32 rows, ratio 0.98),
"MassMutual Select TRP Retirement 2050" (30 rows), "JH Multimanager Growth
LS" (33 rows). A headline of +944 would have shipped those quietly.

**Reading one inverted the story.** For ack 20251015195704NAL0002948995001,
v68 stored FOUR junk rows ("INVESTMENTS (at Fair Value)", "Employee
Deferrals", "Employee Rollover") and called them confident. v69 finds the
plan's REAL 25-row menu — Retirement 2030/2035/2040/2045/2050/2055 Fund I,
CMFG Life Insurance Company. It is non-confident only because its coverage
ratio came out 1.94, and the ratio is inflated by ONE row: **"Investment
Totals"**. The trailing-total guard was SINGULAR (`\btotal\s*$`), so the
plural survived, and a subtotal repeats the value of everything above it.
One plural word disqualified a whole recovered menu.

**Fixed (v70): the guard is now `\btotals?\s*$`.** An anchored `^totals?`
was tried at the same time and immediately dropped "Total Return Bond Fund
Class I" — PIMCO, Met West and Baird all run funds by that name — so only the
trailing form ships. (SKIP_ROW's line-level `^total` carries the same hazard
and predates this; it needs its own measurement before anyone touches it.)

**A second self-correction in the same pass.** The spaced-letter subtotal
guard added an hour earlier fired on ANY single-letter word in the name,
which dropped "Vanguard | Total Return Bond Fund Class I" on the "I" — the
precise hazard ("Class A", "Fund I", "TR B") named when that class was first
left alone, walked into one rule later. The damage signature is now scoped to
the first THREE tokens, where damage to the word "total" would land, and
matches fragments of one OR two characters ("Tot al cont r i but i ons").
Verified both directions in one pass: four damaged subtotals drop; "Total
Return Bond Fund Class I", "AB Total Return Portfolio", "US Total Market
Index Fund" and "Contrafund Commingled Pool Class 3" all survive.

**The lesson.** The rule "sample every loss even when the delta is positive"
has now paid twice in one night, and differently each time: on v68 it caught
a regression hiding under a gain; on v69 it caught a GAIN hiding under an
apparent loss, and turned it into another fix.

## 2026-08-25 — v70: the headline fix worked, and it cost five real menus. NOT MIRRORED.

Run #159. Like-for-like: confident 59,085 -> 59,093 (+8; 17 gained, 9 lost).

**The headline fix is confirmed at scale.** Rows named after their manager
fell from **12,850 to 3,282**, and the plan that motivated it now reads what
its filing says:

    Great Gray | Index 2040 R      (32 rows, confident)
    Great Gray | Index 2050 R
    Great Gray | Index 2045 R

The residual 3,282 is the heterogeneous class measured in report #37 and
deliberately left alone.

**But the loss review does not clear the mirror bar, so v70 was NOT
mirrored.** Of nine losses, about five are real menus:

    "Fidelity Contra Fund K"            30 rows r=1.00 -> "Party in interest" r=1.99
    "Schwab S&P 500 Index Fund"         27 rows r=1.00 -> "Indicates party-in-interest" r=1.99
    "Target Retirement 2045 Inv"        26 rows      -> "Mutual funds", 4 rows
    "John Hancock Disciplined Value R6" 11 rows      -> "Fidelity", 8 rows

**The mechanism is one this project already learned once.** Removing junk
rows from a GOOD region lowers that region's score, and a junk region wins
the comparison instead. CLAUDE.md records the identical failure at v46:
"junk-row removal promoted an OCR statement region into the confidence band".
A cleanup that is correct row-by-row can still be wrong region-by-region.
Every junk-removal version from here on has to be read with that in mind —
the metric to watch is not how much junk left, but whether the RIGHT REGION
still wins.

**Why v71 was shipped anyway.** Two of the four flipped to a region led by a
party-in-interest FOOTNOTE, and v71's new footnote guard removes exactly
those rows, which should collapse those regions' scores and hand the menus
back. That is a prediction, not a result: these four filings are OCR-sourced
and cannot be reproduced locally (pdftotext returns nothing usable), so the
only available check is v71's own verdict.

**What was NOT done, deliberately.** v70 was not reverted — the name fix is
large, real, and verified. The proper repair is at region SCORING, so that
cleaning a region does not cost it the comparison, and that needs a
measurement rather than a 07:00 guess. Holding the mirror is the honest
middle: the improvement stays in the branch, the live site keeps v69, and
nobody sees a page lose its menu while this is worked out.

## 2026-08-25 — v72: 2,174 rows named after the TYPE while the fund sat in the issuer field

The reverse of the v70 defect, and found the same way — a row-quality check on
a batch whose verdicts were all clean. Three rows in one batch read:

    AS SMALL CO VALUE R6           ||  Registered invesment company
    Vanguard Target Retirement Incm Inv ||  Target Date Retirement Funds
    American Funds 2015            ||  Target Date Retirement

The product is in the identity column, the TYPE is the displayed name.
Measured universe-wide: **2,174 rows** where `iss` carries a share class,
vintage or "Fund" and the name is a bare type. Unlike the last two
measurements, the examples are HOMOGENEOUS — every one points the same way —
which is what justified fixing rather than recording and stopping:

    BlackRock Lifepath Index 2035 Fd  ||  Mutual funds 291,224 (1)
    MFS Value Fund                    ||  Mutual funds 57,018 (1)
    Empower Select Guaranteed Fund    ||  Guaranteed Interest Contract
    Large Cap Growth II               ||  Common/collective trust 208,324

**Two causes, both confirmed by reproducing the shapes locally.** First, a
trailing VALUE or footnote defeats the type test: `typeOnly` sees "Mutual
funds 291,224 (1)", strips its type words, and the digits keep the residue
long enough to read as a real name. Second, several genuine type phrases were
missing from the vocabulary — "Guaranteed Interest Contract" is a GIC, not a
fund. Note the first example also contains an OCR typo ("invesment"), which
this fix does NOT address; the trailing-debris strip is what recovers it.

**CORRECTION, same cycle (07:36Z).** The paragraph above originally claimed
"the three reversed rows now name their fund". That was WRONG, and wrong in a
specific way worth recording: I verified against SYNTHETIC rows built from the
measurement's examples, not against the three rows the batch actually found.
Re-testing the real shapes showed v72's first version fixed exactly ONE of
four — the trailing-debris case ("Mutual funds 291,224 (1)"). These three were
untouched:

    AS SMALL CO VALUE R6                ||  Registered invesment company
    American Funds 2015                 ||  Target Date Retirement
    Vanguard Target Retirement Incm Inv ||  Target Date Retirement Funds

Word-stripping cannot reach them: "Target Date Retirement" leaves
"Retirement", and adding THAT word to the strip list makes "Retirement 2040
Fund I" — a real Great Gray vintage — read as type-only and hands the row
back to the issuer column, undoing v70. So the fix is an anchored
CATEGORY_PHRASE list instead, which cannot misfire on a name carrying
anything more, plus `inves\w{0,2}ment` to absorb the OCR spelling
"invesment". Re-verified on the REAL rows this time: all four now name their
fund, and "Great Gray | Index 2040 R", "T. Rowe Price | Retirement 2040 Fund
I" and "Vanguard | Target Date 2040 Fund" are all untouched. Gate 20/20.

The lesson: **verifying a fix against the examples that inspired it is not
verifying it against the cases that found it.** Synthetic shapes drift toward
what the fix already handles.

**The break test decided the vocabulary.** "retirement", "value" and "income"
were deliberately NOT added: each is load-bearing in a real name, and
stripping them makes "Retirement 2040 Fund I" and "MFS Value Fund" read as
type-only, which would hand those rows straight back to the issuer column and
undo v70's headline fix. Verified in one pass — the three reversed rows now
name their fund, while "Great Gray | Index 2040 R" and "Fidelity | Contrafund
Commingled Pool K6" are untouched. Gate 20/20.

## 2026-08-25 — v72 completed: Morningstar categories, and a regression I shipped and caught

**A confirmed win first.** The CMFG plan (20251015195704NAL0002948995001) —
the one whose recovered 25-fund menu v69 found and one plural subtotal
blocked — is now CONFIDENT at 24 rows, ratio 0.95, reading
"T Rowe Price | Retirement 2045 Fund I" across its vintages. v70's
plural-total fix delivered exactly what it was written for.

**The new class.** A filing put Morningstar CATEGORY labels in the
description column and the fund in the identity column:

    BLACKROCK LIFEPATH INDEX 2030 K  ||  Target-date retirement
    FIDELITY 500 INDEX               ||  Large blend
    AMERICAN FUNDS BOND FUND OF AMER R6  ||  Intermediate core bond

Measured: **1,642 rows** carry a category-shaped name. But the examples split
in TWO, and that changed the fix:

    BLACKROCK LIFEPATH INDEX 2030 K  ||  Target-date retirement   <- fund in identity
    VANGUARD                         ||  MID CAP GROWTH           <- only the HOUSE

**The regression I shipped and then caught.** v72's first version made every
category phrase type-only, which for the second sub-class collapses the row
to "Vanguard" — a bare manager, the exact defect v70 spent the night fixing.
I verified this by testing the shape rather than assuming, and it reproduced
immediately.

The rule now discards a category description ONLY when the identity actually
names a product (carries a digit, three or more words, or a share-class
marker). Where the filing gives just a house and a category, "Vanguard · Mid
Cap Growth" is the most it says, and the existing rendering already says
exactly that. Verified across seven shapes in one pass: the fund wins where
there is one, the house-plus-category rows are untouched, and "Great Gray |
Index 2040 R" and "T. Rowe Price | Retirement 2040 Fund I" still hold. Gate
20/20.

**Two lessons compounding.** #35 said read the examples, not the count — that
is what revealed the two sub-classes. #40 said verify against real rows, not
synthetic ones — and here the synthetic test is what CAUGHT the regression,
because I wrote it to include the sub-class I had just learned about. The
habits work together: measurement finds the split, and a test built from the
split finds the misfire.

## 2026-08-25 — v71's verdict: +72 confident, and six of the twelve losses were real menus

**What was wrong.** Reading the v69→v71 net losses one by one — twelve acks —
six were junk shedding confidence correctly and six were plans that had been
showing their filed menu and stopped. In every one of the six a class-label or
house-total page beat the real Schedule H 4i table on coverage ratio:

| plan | v69 showed | v71 showed |
|---|---|---|
| Ramos Oil | 18 rows incl. 13 Great Gray target-date trusts | "Registered investment companies", "Investments measured at NAV practical expedient", 2 more |
| Reliance One | 26 rows of Vanguard Target Retirement | "Mutual funds", "Common/collective trust funds", 2 more |
| Bridgestone Americas (2 plans) | 17 rows from the 2023 filing | "Investments measured at NAV", "fair value hierarchy", "companies", "accounts" |
| Producers Rice Mill | 11 funds incl. John Hancock Disciplined Value R6 | "Fidelity $8,971,947", "John Hancock", "BlackRock", 5 more house names |
| Ebara Technologies | 14 rows (font-damaged but real) | "Participant-directed investments" |

**Why.** Four independent defects, all of which made the real region's sum too
small — and the winner is chosen by whichever candidate region sums closest to
Schedule H assets, so an undersummed real table loses to a note table that
sums to plan assets by construction.

1. **The prose guard counted words across the whole line.** A 4i row is wide:
   `* | GREAT GRAY CAP GROUP 2015 TARGET DATE TR CL CT | Common Collective
   Trust | ** | 151,024` is sixteen words and carries no `$`, so it was
   discarded as a sentence that happened to end in a number. Twelve of Ramos
   Oil's thirteen target-date trusts went that way; what remained summed to
   31% of plan assets.
2. **The v70 spaced-letter subtotal guard ate real fund names.** It fired on a
   leading "total" plus any ≤2-letter word in the first three tokens — the
   damage signature of "To tal In ve stm e n t". "Vanguard | Total Intl Bd Idx
   Admiral" matched on "Bd". Losing that one $5,394 row then broke the
   arithmetic subtotal detector downstream: "Mutual funds, at fair value
   $4,484,527" no longer equalled the rows above it, so it survived as a
   holding, the region doubled to ratio 1.95, and Reliance One's whole menu
   lost to a four-row class-label table. One dropped row, thirty lost.
3. **The provider-total test ran only on the winning region.** All it could do
   there was withhold confidence after the wrong region had already won.
4. **A per-cell word cap** (my own first attempt at fix 1) still ate rows in
   filings with broken font encodings, where spaces are injected inside words:
   "Ameri ca n Funds EuroPa ci fi c Growth Fund Cl a s s R-6" counts sixteen.
   Seven of Ebara's holdings, worth $18.4M of a $53M plan.

**The changes (v73).**

1. Prose has no COLUMNS. A line with three or more cells separated by 3+
   spaces is a laid-out row and is exempt from the word-count test entirely.
   The columns are a better sentence-detector than any word cap — which is
   also why the per-cell cap had to go rather than be raised.
2. The spaced-letter guard now consumes only the leading tokens that spell the
   matched word and looks for damage THERE. An undamaged "Total …" spells it
   in one token and can never match; "To tal", "Tota l", "T otal", "Gra nd
   tota l" all still do.
3. `isProviderAgg` moved to module scope and now applies a −0.35 penalty
   inside the region-scoring loop as well as setting the confidence flag.
   Measured across the 61,133 stored lineups first: **283 entries are a page
   of bare fund-house names, and 226 of them were CONFIDENT** — 226 plans
   showing "Vanguard / Fidelity / Schwab" as their investment menu. It stays
   region-level and never row-level; a row-level version cost ~1,300 real
   menus at v49.
4. "Total number of participants at the beginning of the plan year" — a Form
   5500 line item that leads with its line number, so SKIP_ROW's anchored
   `^total` never saw it. The old spaced-letter rule was swallowing it by
   accident, on the "of"; narrowing that rule meant naming this class
   properly. Howmet's stored lineup carries one today.

**Verified.** Across 78 cached filings, confident 19 → 28 with **zero losses
and zero row losses**; every gain replaces class labels or house names with a
real menu at ratio ≈ 1.00. All six regressed plans recovered, and three of
them now beat their v69 state: Bridgestone's two plans moved off the 2023
prior-year fallback onto the current-year filing at 29 rows each, and Orange
County Bancorp went from 5 rows to 29. Gate 24/24 with four new specimens
(Ramos Oil, Reliance One, Producers Rice, Ebara) and one intentional
expectation move (Power Design 27 → 28: "Northern Trust Asset Management | NT
ACWI ex US IMI Fd DC NL Tier 4 1,985,195", verified in the filing at line
2155, fifteen words with no `$`).

**Decision: v71 was NOT mirrored.** The brief said mirroring v71 would clear
v70 and v71 together, and it would have — but that was written before the
losses were read. Six known real-menu regressions is not a thing to put live
for a day to tidy up a version number. Main stays on v69 until v73's re-parse
returns a verdict.

**The prevention.** Three of these four defects are the same shape: a guard
built for one damage signature, matching on a proxy for that signature rather
than the signature itself. "First three tokens" was a proxy for "inside the
word total". "Fourteen words on the line" was a proxy for "this is a
sentence". "Every cell under fourteen words" was the same proxy one level
down. Each proxy was right for the filings in front of me and wrong for the
next ones. When a guard fires on a signature, encode the signature.

**The compounding lesson.** #35: read the examples, not the count. #40: verify
against real rows. This entry adds: **read every loss, and read it against the
filing.** The verdict was +72 confident, comfortably inside tolerance, and
nothing in the aggregate would have flagged six plans losing their menus. The
only thing that found them was opening twelve filings and looking.

## 2026-08-25 — v74: an EIN is not a dollar amount (773 fabricated holdings)

**How they were found.** A ten-filing test batch scored clean — five
NAMES_MATCH, two ISSUER_KEPT, two OCR_SOURCE, one PRIOR_YEAR_SOURCE, no
WRONG_REGION and no ISSUER_DROPPED. The tester checks that stored names appear
in the filing, not that they are *funds*. Four of the entries had only 4-5
rows, and reading those rows found four defects.

**1. EIN digits parsed as dollars — 773 rows, 679 confident lineups.** An
employer identification number is written NN-NNNNNNN, so a page heading like
`PLAN ID #002; EIN: 16-1187872` hands the row parser a name ending in "EIN:"
and a seven-digit value of **$1,187,872**. Measured universe-wide before
fixing: 728 entries carry one, the fabricated amounts run to $14,400,225, and
all 25 sampled were the same heading. No fund name ends in "EIN". Hydro-Air
Components' schedule went to ratio **exactly 1.00** once its fake row left.

The removal lowers those regions' sums (report #38): the fake row is a median
4.8% of its entry, but in 99 entries it is over a quarter. Those are the ones
to read in the verdict — though a confidence band propped up by an invented
seven-figure holding was never real.

**2. Expense-note rows displayed as holdings.** "Advisory fees $69,206" and
"Professional fees $20,964" were two of the four "holdings" St. Louis Auto
Dealers showed. Harvested rather than appended (#42): every stored holding
name of ≤4 words ending in fee/expense/revenue/compensation/charge vocabulary
is 75 distinct names over 139 rows, and reading all 75, they are accounting
lines without exception. The break case is the share class, where trailing-word
rules have gone wrong before — "Great Gray Retirement Date 2045 Trust Fee Class
R1" ends in "R1", "AST Wilmington … Fee Class" ends in "Class" — so only a name
ENDING in the accounting noun matches.

**3. Income rows — and the measurement that said DON'T.** "Dividend and
interest income" was a Hydro-Air holding, but the harvest over 6,890
income-shaped stored rows is overwhelmingly REAL fund vocabulary: "Vanguard
Target Retirement Income" 1,223, "Dodge & Cox Income" 341, "PIMCO Income" 170.
A general income rule would rename thousands of genuine holdings. Only three
unambiguous phrases were added. The same test on names ending in a preposition
looked promising until the list came back led by "pimco income **a**",
"invesco comstock **a**" — a share class, not an article. No code changed there
(#37).

**4. Section subtotals the arithmetic detector missed.** St. Louis opens with a
Cash Equivalents section that has no subtotal of its own, so by the time
"Mutual Funds $852,305" arrives the running group carries an extra $9,534 and
the equality test misses by exactly that. Two class subtotals survived, the
region doubled to ratio 1.96, and a two-row class-label fragment won. The fix
adds a SUFFIX test: a row equal to the sum of the last j rows for some j ≥ 2.

**The gate caught my first version of that fix.** Written with the same j+2
cents tolerance as the existing test, it dropped Reliance One's "Mid-Cap Growth
Index Admiral" ($34,875 — five dollars from the sum of the three rows above
it), and removing that row then broke the arithmetic for the REAL subtotal
below, which survived, doubled the region, and took the filing from 26 rows to
4. A loose tolerance is safe against ONE candidate group; it is not safe
against every suffix at once, and a false positive here does not stay local —
it corrupts every later test in the same table. The suffix test now demands
exact equality, which costs nothing: real subtotals matched to the dollar in
every case examined.

**Verified.** 84 cached filings, confident 22 → 32, **zero losses**. Gate 26/26
with two new specimens.

**The lesson this adds.** A clean tester verdict is not a clean lineup. The
batch scored 5/10 NAMES_MATCH with no defect verdicts at all, and four of those
ten filings were displaying expense lines, class labels or invented dollar
amounts as investment menus. The tester answers "is this name in the filing?";
nobody had been asking "is this name a fund?". Row-quality review of every
batch is now the part that finds things.

## 2026-08-25 — v74 (2/2): the share count in front of the name, and two measurements that said stop

**The fix.** Money-market and stable-value funds hold units at $1.00, so a
holding's share count and its dollar value are the same number — and in 80
rows across 57 entries (56 confident) that count is glued to the front of the
name: "12,553,193 Money Market Fund", "8,669,840 FIDELITY BANK TRUST SHORT TERM
INVESTMENT FUND", "299,638.1700 Par Value Money Market Fund". Reading them, the
HOLDINGS ARE REAL. So this is a naming fix, not a drop: the leading number goes
(plus any unit word it strands), the row and its value stay, and region sums are
untouched by construction. A leading number equal to the row's own value is
never part of a fund name.

**The collision it created, and the gate catching my fix for that.** Stripping
made Janus's two money funds collide — "12,553,193 Money Market Fund" and
"2,665,839 Money Market Fund" both became "Money Market Fund" and merged into
one $15.2M row, even though column (b) named Vanguard Treasury on one and Janus
Henderson Government on the other. So different issuers under one product name
became separate rows. Unscoped, the gate caught that immediately: a brokerage
listing carries "Preferred stock" dozens of times under different issuers, and
collapsing those is DELIBERATE — the carry-forward specimen's honest result is a
managed-account rollup, and splitting them moved $19.4M out of the displayed
list. The split is now scoped to rows the strip actually renamed. A fix for a
collision I introduced must not change rows I never touched.

**Two measurements said don't (#37).**

1. *Class-label rows as subtotals.* Materials Testing Consultants carries 34
   real Principal rows plus "Common Collective Trusts $10,420,331", "Pooled
   Separate Accounts $5,890,411" and "Mutual Funds $1,415,043" — ratio 2.98, and
   the plan shows nothing. The mechanism is now understood: those labels appear
   on BOTH the current- and prior-year columns of a comparative statement and in
   the fair-value hierarchy, and the same-name dedup SUMS the year columns
   ($5,502,063 + $4,918,268 = $10,420,331, exactly). But the obvious rule —
   drop pure class-label rows in tables of ≥10 rows — measured 3,378 entries,
   3,091 confident, and reading them the matches are overwhelmingly REAL
   holdings whose names merely START with class vocabulary: "MUTUAL FUNDS SHARES
   / UNITS Vanguard Target Retirement 2030 Inv", "Money market fund, Fidelity
   Govt Money Market Fund", "Common Stock, Class B", "Guaranteed Interest
   Contract $10,249,450". STMT_ROW's alternatives end in `\b.*`, so it matches
   any prefix. Shipping that would have deleted thousands of real holdings.
   Recorded in the gap inventory instead, with the mechanism written down.
2. *Delinquent-contribution rows.* Claim Assist Solutions displays seven rows
   like "43,206 13 days delinquent $43,206" — Schedule H line 4a late
   contributions. Measured universe-wide: ONE entry, seven rows. Too small for
   a rule of its own. But generalising the SHAPE — a name beginning with its own
   value — found the 80-row money-market class above, which is the fix that
   shipped. The narrow case was not worth a rule; the shape behind it was.

**Verified.** 93 cached filings, confident 25 → 35, no confident losses (one
non-confident junk entry drops a row). Gate 27/27 with the Janus specimen,
which pins both halves: names clean AND the two money funds separate.

## 2026-08-25 — v74 (3/3): 390 confident plans held a NAICS business code as a holding

**What was wrong.** EFAST2 renders Form 5500 pages with "ABCDEFGHI" placeholder
text in the empty boxes. A guard for that has existed since Honeywell's $12.5B
plan stored ten of them, and it tests the line carrying the VALUE. But the
sponsor's address block WRAPS, so the placeholder text and the number are on
different lines:

    738 ABCDEFGHI
    c/o NE Davis St
    Portland      OR  97232        624100

The first two lines buffer as a wrapped name; "624100" becomes its value. That
number is the **NAICS business code from box 2d** — 624100 is Individual and
Family Services — not a dollar amount. The value-bearing line contains no
placeholder text at all, so the guard never fired.

**Measured: 411 rows across 410 entries, 390 of them CONFIDENT.** Every sample
is a sponsor address block: "3326ABCDEFGHI c/o 160th Avenue SE Suite 120 …
Bellevue $623,000" was Regency Pacific's FIFTH LARGEST holding; "1105ABCDEFGHI
c/o N. Hollywood Way Burbank $515,100"; "c/o PRINCESSABCDEFGHI GRANGER
$444,190". The business codes give them away — 623000, 623110, 541330, 624100
recur across unrelated plans.

**The fix.** Apply the same placeholder test to the ASSEMBLED name (and the
issuer), not only to the value line. Nothing legitimate contains a run of the
alphabet, so the name alone is enough to condemn the row.

**Verified.** 102 cached filings, confident 28 → 38. Six rows removed across
six filings and NOT ONE confidence loss — every removal moves its region's
ratio toward 1.00: Regency Pacific 1.08 → 0.99, BMC Aggregates 1.02 → 1.00,
another 1.04 → 0.99. Gate 28/28 with the Regency specimen.

**The lesson.** This is the third guard this session that was testing a proxy
for its own signal — the line, rather than the row the line becomes. A wrapped
name is assembled from several lines, and a guard that runs before assembly can
only ever see one of them. Where a rule condemns a ROW, test the row.

## 2026-08-25 — v73's verdict: +143 confident, and 24 plans lost their menus to DOUBLING

**The verdict read well.** Run #161: confident +71, match +13, vesting +14,
lineups +67 vs the previous run; net against live main (v69) **+143 confident,
150 lost, 293 gained**. "Improved or held" on every metric.

**Triaging all 150 losses:** 126 were the bare-fund-house pages v73 deliberately
demoted ("Vanguard / Fidelity / JP Morgan / Schwab") — correct, and exactly the
226 confident house-total plans measured before that fix. The other **24 were
real menus**, and nearly every one had landed at ratio **1.86–2.20**. They had
not lost their rows; most had MORE rows than before. They had lost the
confidence band to double-counting, because v73's prose fix let a SECOND
rendering of the schedule parse where half of it used to be eaten.

Four distinct mechanisms, found by reading the added rows one filing at a time:

1. **"TOTAL b b" $18,971,978.** v73 narrowed the spaced-letter total guard to
   damage inside the word "total" — right for "Total Intl Bd Idx Admiral", wrong
   here, where the old first-three-tokens test had been catching the stray "b"
   of an empty column. Historic Tours of America gained exactly one row, its own
   grand total, and lost its menu. Fixed by requiring a token of three or more
   letters AFTER the word: a fund has real words there, a damaged total has only
   column debris.
2. **Punctuation.** Blain Supply files "T Rowe Price Retirement 2030 Fund I" in
   one copy and "T. Rowe Price Retirement 2030 Fund I" in the other. Same fund,
   same value, two rows. Fixed by normalising the dedup key.
3. **"Represent parties-in-interest."** v71's footnote guard matched only
   "party". The row carries the schedule's grand total, so a missed one doubles
   the region outright — Current Lighting's 30-fund menu sat at 1.96 because of
   one plural. Four of the twenty-four.
4. **Copies that share values but not names.** Brakebush Brothers files "2030
   Target Date Fund N/R" and "American Funds 2030 Trgt Date Retire R6" — nothing
   in the text says they are the same holding, but $15,530,426 appears twice and
   25 of 29 distinct values are exact pairs covering 99% of the sum. No 4i
   heading separates the copies, so no candidate region covers just one, and
   every candidate double-counted.

**The fix for (4) is structural.** parseRows now also returns two reconstructed
views of each region — one keeping the first row per normalised NAME, one
collapsing exact VALUE pairs — and parse4i offers them as ordinary candidates so
scoring picks. They cost no extra parsing (same pass) and cannot fire on a
single-render table, where they are identical to the normal view.

**The gate caught this being too free, twice.** First on Black Hills, a
correctly parsed 22-row schedule at ratio 0.98: the repaired view of a
*different* region scored higher purely by carrying one more row, and swapped
which rendering of two funds was displayed. Gating the repairs to regions
already at 1.5x assets was not enough — a millions-scaled sibling of the same
region vouched for it — so the gate is per-variant, and a repair now also pays
0.05. A reconstruction is a repair, not a reading of the filing; it must win
clearly rather than by 0.003.

**Result: 12 of the 24 recovered**, all landing at ratio 0.95–1.23. Ten remain
doubled and are recorded in the gap inventory. 127 cached filings: confident
40 → 51, gate 28/28.

**The lesson.** v73's own accuracy log entry ends "read every loss, and read it
against the filing" — and the +143 verdict would have passed any aggregate
check. What made these findable was that the losses were *sorted*: 126 fell into
a class I had deliberately created, and the 24 that did not fit that story were
the ones worth opening. A loss you can explain is not the same as a loss you
predicted.

## 2026-08-25 — v75: contribution sources and Form 5500 instruction text as holdings

Two classes from one filing-test batch, both measured universe-wide first.

**1. Contribution-source rows — 183 rows, 137 entries, 83 confident.** "Employer
match", "Participant rollovers", "Employee deferrals" name where money came
from, not what it is invested in: a contributions-by-source table swept in when
a candidate region reaches it. The v44 rule for this was anchored to BARE nouns
("Employer", "Rollover"), so every two-word form walked past it. All 45 distinct
names are sources without exception. The second word carries the rule, which is
what keeps "Employer Stock Fund" and "Company Stock" — real holdings — intact.

**2. Form 5500 instruction text — 72 rows, 49 entries, 36 confident.** "d Total
income. Add all income amounts in column (b) and enter total" was Westlie Motor
Company's LARGEST holding at $2,497,256 — the Schedule H line 2d figure. v73's
laid-out-row exemption is what admitted these: form lines are dot-leadered and
columnar, which is exactly the evidence that rule takes for a table row. Another
variant, "2d Business code (see instructions) 75 CHESTNUT RIDGE ROAD", is the
same NAICS-code-as-dollars mechanism the ABCDEFGHI guard catches, in filings
whose address block is real text so that guard never fires.

The test runs against the RAW assembled cell as well as the cut name, because a
type cut strips the instruction text and leaves the street address behind —
"CHESTNUT RIDGE ROAD" is no more a holding than the whole line was. That is the
same lesson as the ABCDEFGHI fix one cycle earlier: a guard placed after the
name has been rewritten is judging something the filing never said.

**A note on what v73 cost.** Both of these classes exist BECAUSE of v73's prose
fix, which was itself correct and recovered six plans plus thousands of rows.
Relaxing a guard admits everything the guard was incidentally catching, and the
only way to find out what that was is to read the rows afterwards. Westlie
Motor's region went 2.20 → 1.85 with the form lines gone; the rest of its
doubling is a rounded second rendering with the plan name glued to each row,
recorded in the gap inventory.

131 cached filings: confident 40 → 51, gate 28/28.

## 2026-08-25 — v75 (2/2): "c/o" is an address, and the business code is still not money

**The third variant of one defect.** The ABCDEFGHI guard (v74) catches the
sponsor's address block when EFAST2 left its placeholder text in the empty
boxes. The instruction-text guard (v75) catches it when the line carries "(see
instructions)". Neither fires when the filer's address is entirely real text —
and the wrapped address still becomes a name, and the box-2d NAICS code still
becomes its value.

Measured on rows the placeholder guard does NOT already catch: **19 rows, 19
entries, 18 CONFIDENT — and every single value is a business code.** "c/o Katy
Freeway Houston $522,130". "c/o WINOOSKI PARK COLCHESTER $611,000". "2 Nazareth
c/o Lane St. Louis $623,000". "c/o Bubb Road Cupertino $541,700". Care-of is
postal notation; no fund is named with it.

**And statement carry-forwards.** "Balance (Previous) $6,819,178" was 99% of one
plan's displayed lineup — 14 rows, 8 confident, across "Beginning balance",
"Balance Forward (", "Beginning Balance 1/1/22". With it gone that plan reads 16
American Funds target-date funds at ratio 0.99 instead of four rows dominated by
a carry-forward.

**What this family has taught.** Four guards now exist for what is one defect —
a Form 5500 page swept into a candidate region, its address block wrapping into
a name and its business code landing in the value column. Each was written
against the evidence the last filing happened to show: placeholder letters, then
instruction text, then care-of notation. The signal none of them uses is the one
that actually identifies it — **the value IS a NAICS business code**, a 6-digit
number from a closed list, appearing as a "holding" worth exactly $522,130 or
$624,100 across unrelated plans. That is the fix worth building next, and it
would subsume all three.

135 cached filings: confident 40 → 51, gate 28/28.

## 2026-08-25 — v74's verdict: +224 confident, every loss explained, MAIN MIRRORED

Run #162: confident +81, lineups +80, HIGH 25 → 21 vs the previous run. Against
live main (v69): **59,085 → 59,309 confident, +224 net — 177 lost, 401 gained.**

**All 177 losses triaged by class**, the way v73's were:

| class | lost | intended? |
|---|---|---|
| bare fund-house pages | 115 | yes — the v73 provider-page fix |
| address blocks (ABCDEFGHI / c/o) | 17 | yes — v74 |
| EIN digits as dollars | 5 | yes — v74 |
| fee / expense note rows | 4 | yes — v74 |
| contribution-source rows | 3 | yes — v75 (already in these acks' data) |
| other junk (<5 fund-shaped rows) | 18 | yes |
| **did not fit any story** | **15** | **opened individually** |

Of the 15: **six are the known v73 doubling casualties** already recorded in the
gap inventory (CMD, Mitek, 4 Bears, New Challenges, Catalyst Medical,
Hertzberg-New Method). The other **nine were correct demotions**, confirmed by
reading the rows on both sides:

- Cleveland-Cliffs ×4 — dropping one junk row took them from 9 rows to 8, which
  is where the trust-pointer rule starts applying. "Investments in Master
  Trust", "Net Master Trust assets" — these plans DO point at a master trust and
  the real menu lives in the trust's own filing. Right answer, reached
  incidentally.
- National Pool Partners — same rows, same ratio, but "Mutual fund - balanced",
  "Collective funds" now register as statement vocabulary. Class labels, not a
  menu.
- Select Sires — five rows reading "DESCRIPTION: MUTUAL FUND", "DESCRIPTION:
  MUTUAL FUND +", "DESCRIPTION: MUTUAL FUND ”". The punctuation-normalised dedup
  key merged them, correctly: it was one garbage string rendered four ways.
- Aero Gear — OCR gibberish on both sides ("; . 63,916 Units ee aneuard I
  Wangued LifeStrateey Income Fund"). Sixteen junk rows became two.
- Variety Child Learning Center — nine rows of the plan's own title block.
- Cleveland-Cliffs Steel (another) — statement rows ("NET (DECREASE) INCREASE",
  "in value of investments") replaced by two honest class aggregates, below the
  three-row floor.

**Mirrored to main** (deb7bd1d), clearing v70, v71, v73 and v74 together. Main
had been on v69 since the v70 hold. As of this mirror the live site no longer
shows 390 plans a NAICS business code as a holding, 728 an EIN's digits as
dollars, or 226 a bare list of fund houses.

**What the triage-by-class method bought.** v73's verdict hid 24 broken menus
behind +143. This time the same +224-shaped number came with 162 losses that
fell into classes I had deliberately created and 15 that did not — and the 15
were the entire reading list. Sorting losses by expected cause turns "read every
loss" from an unbounded chore into a short list, and the short list is where the
findings are.

## 2026-08-25 — v76: FEIN. A guard is only as wide as the spellings it was shown

**The defect.** "OCEAN'S ELEVEN CASINO 401(k) PLAN PLAN FEIN#: 33- $733,380"
walked straight past the EIN guard shipped in v74 the SAME DAY. That rule
anchors on `\bein\b`, and in "FEIN" there is no word boundary before the "ein".

Measured on rows the v74 rule does NOT already catch: **255 rows across 252
entries, 236 of them CONFIDENT**, with fabricated values to $4.7M. Filers write
it every way there is — "FEIN 36-", "FEIN: 94-", "FEIN #75-", "PLAN FEIN 98-",
"EIN; 54-", "Plan No./EIN: 003/38-".

**The fix** widens both halves: an optional F, and a permissive separator run
after the word rather than a fixed punctuation class. Verified against surnames
that end in the same letters — Bernstein, Klein, AllianceBernstein all survive,
because the word boundary is what excludes them and that part was never wrong.

**Why this one is worth an entry despite being three characters of regex.** The
original v74 measurement found 773 rows and I treated the class as closed. It
was not closed; it was as closed as the sample I had looked at. The same shape
has now happened four times in one day — placeholder letters, then instruction
text, then care-of notation, then FEIN — each a different spelling of the same
underlying defect, each found only when a filing happened to show it.

The standing rule this adds: **after fixing a class, search for the variants
you did not sample.** A one-line query for near-misses ("rows matching the
concept but NOT matching my new rule") would have found all 255 of these
immediately after v74 shipped, and would have found the c/o rows immediately
after the ABCDEFGHI fix. That query is cheap and it is now part of the loop.

**The sweep, run immediately.** Applying the new rule to the address family:
rows whose value is NAICS-shaped (six digits, valid box-2d sector prefix) and
whose name is address-shaped, minus everything the four existing guards already
catch. **The answer was three** — "250 MUNOZ RIVERA AVENUE $524,150" (insurance
agencies), "8280 WILLOW OAKS CORPORATE DRIVE SUITE 450 $541,330" (engineering
services), and one more. Added, chiefly to close the family.

The sweep's first version returned **2,094 rows** and every one was a real fund:
"State Street Target Retirement 2020", "Dodge & Cox International St", "State St
Russ Sm Cp Val Idx Rt Acct" — matched on the word "St". The query was wrong,
not the data (#35 again, this time about my own diagnostic). Requiring a house
NUMBER before the street suffix and no fund vocabulary anywhere in the name took
it from 2,094 to 3.

That is the useful result: after v74's placeholder guard, v75's instruction-text
and care-of guards, and this, **the address family is closed** — not "no more
found", but measured at three residual rows out of 1.68M.

140 cached filings: confident 41 → 52, gate 28/28, no new losses.

## 2026-08-25 — v75's verdict: confidence flat, HIGH findings 21 → 5, mirrored

Run #163. Against live main (v74): **59,309 → 59,308 confident, −1 net (12 lost,
11 gained)** — and **audit HIGH findings 21 → 5**.

A flat headline with a collapsing HIGH count is what a junk-removal release
should look like. v75 took rows OUT of entries that mostly stayed confident:
183 contribution-source rows, 72 Form 5500 instruction lines, 19 c/o addresses,
14 carry-forwards. Coverage does not move; correctness does.

**All 12 losses read, and all 12 are the same intended story** — a
contribution-source row removed, leaving the entry below the three-row floor or
outside the ratio band. What they were before is the point:

- Rite Aid ×2 — "Participant-Directed Investments − Interest in Rite Aid Master
  Trust" plus "Employee 401(k) Deferral" and "Company Match". A master-trust
  POINTER with the contributions table appended; never a menu.
- Volvo Construction Equipment — "Plan's Interest in Master Trust" + deferrals.
  Same shape.
- Tower Semiconductor, Northwood Investors, Diehl Management, Gwa, Gleneagles,
  Baker Places — "statements", "at Fair Value", "Recurring Fair Value",
  "hierarchy 67,047,169 67,047,169 - - Private investme…", class labels. Junk
  lineups propped to three rows by contribution lines.
- North Mill Equipment — the St. Louis Auto Dealers shape exactly: "Pooled
  separate accounts" plus THREE contribution-source rows.

Two of the twelve (Clampco, Avalon Apparel) flipped to a different region that
is itself doubled at ratio 1.99–2.77 — the known double-render family, already
recorded. Neither was confident before or after.

**Mirrored to main** (a9abf489). Second mirror of the day; main is current
again within the hour.

**What "improved" means here.** Judged on the confident count alone this release
did nothing. Judged on what the confident lineups CONTAIN, it removed 288 rows
that were never holdings from plans that keep their lineups, and took the audit's
HIGH findings down by three quarters. The coverage number is not the accuracy
number, and a release that only moves the second one is still worth shipping.

## 2026-08-25 — v77: the prefix split, and the last of v73's doubled menus

**The class.** Ten plans had sat at ratio ~1.9 since v73, showing no lineup at
all, and neither v74 reconstruction could reach them: the two copies of the
schedule share neither names (the second prefixes the plan's own name) nor exact
values (the second rounds to thousands). 4 Bears Casino & Lodge is the clearest:

```
  0    245250  cum=    245250  Fidelity Brokerage Services, LLC Avantis U.S Sma…
  …
 17    233344  cum=   7543234  Victory Sycamore Established Value      <- assets $7.78M
 18    753000  cum=   8296234  4 Bears Casino & Lodge 401(k) Plan AVUVX Avantis…
 19    546000  cum=   8842234  4 Bears Casino & Lodge 401(k) Plan BSIIX BlackRo…
```

Read in FILED ORDER the boundary needs no interpretation: the running total
passes the plan's assets and keeps going. So parseRows now returns the rows in
filed order and parse4i offers the prefix landing closest to ratio 1.0 as its
own candidate — the fix at REGION SELECTION the gap inventory had been asking
for, rather than more repair of the row set.

**The gate stopped it twice, and both stops were right.**

1. *The rounded-assets specimen.* Old Republic's expectation had been running
   against `1400000000` while the filing reports **2,125,326,350** — so its
   stored sum looked like ratio 1.49 instead of 0.98, and the split obligingly
   trimmed a correct 30-row schedule to 27. The specimen was wrong, not the
   parser; assets corrected in the same commit. A gate is only as good as its
   inputs, and this one had been quietly mis-stating a plan's size.
2. *Trim-until-the-arithmetic-works.* On Power Design the split lopped the tail
   off an Empower CODE page and scored the remainder — four "1GGCG25" fund codes
   included — past the honest 27-row schedule, because four codes in
   thirty-three rows falls under the code-page share and the v52 penalty
   stopped applying. Two fixes, both general: a repair is now classified by its
   PARENT region (a view cannot dilute the signal its parent was penalised
   for), and a cut only counts as a rendering boundary when what FOLLOWS it
   re-states what precedes it — ≥40% of the suffix rows sharing two substantial
   words with some prefix row. 4 Bears' second copy shares "avantis", "small",
   "value"; a code page shares nothing.

**Result: 22 of v73's 24 doubled menus are back**, all at ratio 0.95–1.07.
Of the two that remain, Joy Holdings is a fund-house page correctly demoted, and
Hertzberg-New Method has no readable region at all. 140 cached filings:
confident 41 → 65. Gate 28/28 with 4 Bears and Westlie Motor added.

**What the whole double-render episode taught.** v73 opened it by relaxing a
guard, and closing it took four attempts: hard-dedup by name (v74), value-pair
collapse (v74), and finally the ordered prefix (v77) — because each attempt only
saw the copies that differed the way that attempt could detect. The thing that
finally worked ignored the text entirely and used arithmetic the filing cannot
fake: a schedule sums to the plan's assets exactly once.

### Run #165 (v76+v77) loss triage — and a source of loss that is not the parser

The verdict was confident 59,308 → 59,487 (+179), lineups +174, match +11,
vesting +8, against 10 confidence losses. Every one was opened. **None was a
parser regression**, but two of the three causes were new to this log:

**Cause 1 — the prior-year fallback silently not applied (3 plans).** Foot And
Ankle Specialists, Step Up On Second Street, and one other lost their `fb` year
and their lineup together. The mechanism looked alarming: a 30-fund menu
replaced by a 2-row class summary. It was not. Step Up's newest filing parses to
the *same* 2 rows under `origin/main`'s parser and under v77 — byte-identical —
so its old 32-row entry had always come from the 2021 fallback filing, and this
run simply did not use the fallback. `fetch-4i` swallows a failed fallback
download in a bare `catch`, so an S3 hiccup is indistinguishable from "the
fallback parsed badly". Population check: 1,586 acks used a fallback before,
1,472 after — but **175 of the 178 that stopped using one are upgrades**, plans
whose newest filing now parses confidently on its own. Only 3 lost coverage.
Self-healing (the next run retries the download), so no fix shipped; the lesson
is that `fb`-carrying acks must be triaged against the *primary* parse, never
against the stored entry, because the stored entry is a different filing.

**Cause 2 — OCR text is not reproducible run to run (1 plan).** Respitech
Medical lost 29 rows → 2. Locally, OCR'd from the same PDF with the same
bad-page list, **both parser versions return the identical 16-row Vanguard menu
at ratio 0.932**. The parse is a pure function of its input; the input changed.
OCR-sourced lineups can therefore flip confidence with no code change at all,
which means an OCR-sourced ack in a loss list is evidence of nothing until the
same text is run through both versions. Recorded, not fixed — making OCR
deterministic is a much larger piece of work than this run's budget.

**Cause 3 — junk shrinking to junk (5 plans) and one honest scoring loss.**
Five losses were class-label or FEIN/address rows going from 3–5 junk rows to
2 junk rows, exactly what v75/v76's guards were built to do. The sixth, Unity
Bank, is a real change of winner: the Statement of Net Assets region ("Mutual
funds / Pooled separate accounts / Common collective trusts", ratio 1.02) now
beats a 17-row region whose fund names are raw ticker codes ("1FSPSX",
"1ASTLV1") at ratio 0.56. This is the known NYC-Carpenters residual. Scoped
before deciding: across all 59,487 confident lineups, entries that are **only**
class labels number **4, up from 1**. Three plans universe-wide is not a class,
and the region it displaced was ticker-garbage. Left alone.

**The rule this produces.** A loss list is not a list of regressions. Before
reading any loss as one, establish which filing produced the old entry (`fb`),
whether OCR produced either side (`ocr`), and — for anything that survives both
— whether the shape it lost to occurs at population scale. Three of this run's
ten losses were not even the same *document* as the entry they replaced.

### v81 — the vesting backlog was one gate clause, and widening it needed three guards

**The defect.** 10,189 plans had readable auditor notes — loan, match and Roth
quotes all extracted from them — and no vesting at all. 5,622 of those had an
extracted employer match, so employer money exists and a schedule for it is
almost certainly written down. 39 were sampled from that class and downloaded.
**Every one of the 39 discusses vesting**, 24 to 333 times.

The cause was a single clause. "Immediate" only counts when the sentence covers
employer money, and the test for that demanded the employer noun *adjacent* to
"contributions":

```
(matching|employer|company|non.?elective|profit.?sharing|plan sponsor) (?:contributions?|accounts?)
```

Three phrasings auditors actually write never satisfy it:

| phrasing | why it failed |
|---|---|
| "immediately vested in **all contributions** plus actual earnings thereon" | universal claim, no employer noun at all |
| "…their contributions, **the Company's safe harbor** contributions" | possessive plus an intervening qualifier |
| "…as well as **the Bank's safe harbor** contributions" | "bank" was not in the vocabulary |

22 of the 39 carried a real immediate-vesting sentence. The gate rejected all 22.

**Why widening it alone would have been worse than the defect.** Of the first
five gains the widened gate produced, **two were false**. A false "Immediate"
is not a smaller error than a blank — it tells a participant their employer
money is theirs today when it is not:

- *Bank of Utica* — "immediately vested in their elective deferral … as well as
  the Bank's safe harbor contributions", followed by "Vesting in the Bank's
  discretionary profit sharing contributions … is based on years of continuous
  service **as follows:**" and a 0/20/40/60/80/100% table.
- *a 403(b) filer* — "All participants are immediately vested in their
  contributions… Participants **covered by a collective bargaining agreement**
  are vested in the Employer's non-safe-harbor contribution … after the
  completion of three years of service."

So the widening ships with three guards, and each was written only after a
filing proved it necessary — a guard for the remainder shape alone would have
passed the cohort filing, and vice versa:

1. **remainder / cohort** — any *other* vesting sentence that puts employer
   money (or "the remainder", which names no employer at all) behind a service
   condition means the plan is not uniformly immediate.
2. **colon-table fallback** — the sentence scanner requires a terminating
   period, so a schedule introduced by "…as follows:" and rendered as a table
   is invisible to guard 1. Bank of Utica's *only* readable vesting sentence is
   the immediate one. That shape falls back to the raw notes text.
3. **carve-out** — "…immediately vested in their own contributions, Company
   matching contributions … **except** for the portion attributable to Company
   Non-Matching contributions".

**Two schedules the widening then let through.** With the guards in place, two
more readers were extended to answer the filings the guards correctly silenced:

- `"increasing by 25% **per additional year**"` — the graded pattern demanded
  "per year" and an adjective between the two words killed the whole match.
  Three sampled filings state their entire schedule that way.
- table header `"Vested / Completed Years of Service / Percent"` — a floating
  "Vested" label above the column pair, a variant the header list did not carry.

**Result on the sampled class: 0 of 39 → 17 of 39**, every one read against its
filing text by hand. 13 Immediate, 4 graded. The eight filings whose immediate
sentence covers only the participant's own money still return nothing, which is
the correct answer until their schedule can be read.

**The guards were themselves too broad, and only a population measurement
showed it.** The first version applied all three guards to *every* sentence
reaching the immediate pass. On the 39-filing sample that looked perfect. On
955 cached filings it was **35 correct "Immediate" readings lost against 27
gains — a net regression**, and the lost ones were unambiguous:

> "Participants' contributions and the Company's matching contributions to the
> Plan vest immediately."

Those sentences satisfy the *original* strict gate. What killed them was the
colon-table fallback searching the whole document: a plan that vests the match
immediately and profit-sharing over years has graded language somewhere in its
notes, and the pre-existing non-elective scoping already handled that case
correctly. The fix is a scoping rule that should be the default for any gate
widening:

> **A sentence that satisfied the old gate keeps its old answer. New guards
> police only the sentences the widening newly admits.**

That makes the change strictly additive by construction — the old behaviour is
preserved by the code path, not by hoping the new tests happen to agree with it.

**Measured result of the scoped version, on the same 955 filings: 27 gained,
0 lost, 1 relabelled.** The relabelled one states two real schedules (5-year
graded on discretionary non-elective, 2-year cliff on the safe-harbor match)
and is pinned as a gate specimen with the question written down rather than
patched over.

**New standing machinery: the gate now has a features arm.** Until this change
the parser gate protected lineup parsing only — a vesting or match regression
could not be seen until the audit ran at the *end* of a 75-minute re-parse.
Seven of these filings are now gate specimens, and three of them assert
`vesting: null`. Those three do not discriminate v80 from v81 (both are silent
on them); they exist to fail the *next* person who widens this gate without
writing the guards, which is exactly the mistake the measurement caught here.

### v82 — 93 plans showed their loan note under "Vesting"

The same wrong-topic defect v80 fixed for the match quote, measured separately
because the two fields fail differently. A sentence can name employer money and
the word "vested" while describing something else entirely:

> "Notes Receivable from Participants — The Plan has a loan feature under which
> active participants may borrow up to 50% of the current value of…"

That shipped as a plan's vesting disclosure. 93 stored rows carry one — loan
provisions, in-service withdrawals, hardship distributions, "reference should be
made to the summary plan description".

**The escape hatch is the whole fix, and only measuring found it.** The topic
pattern matches 108 sentences, but **38 of them also carry the plan's real
schedule** — some an entire Years/Percent table — because the sentence window
spans the schedule and the "Notes Receivable from Participants" heading that
follows it. Dropping on the topic marker alone would have deleted real
schedules to remove misleading ones. The rule is therefore *off-topic AND no
schedule content*, which drops 93 and keeps all 38.

Measured on the 955 cached filings: labels unchanged (27 gained, 0 lost, 1
relabelled — identical to v81), 4 quotes dropped, every one loan or hardship
text. The gate's feature arm gained a `quote: null` specimen, which is what
makes it protective: a change that restores a wrong-topic quote still passes
the vesting check and fails on the quote.

### v83 — self-checking 3,907 new labels against their own quotes

v81's widening produced 3,907 new "Immediate" vesting labels in run #167. Rather
than trust the pre-ship measurement, every one was re-read against its own
stored quote by machine: does the sentence that produced the label actually
support it? **4 did not — 0.10%.** For scale, the false-Immediate rate across
the whole stock *improved* (0.130% → 0.122%) even as the Immediate population
grew from 10,776 to 14,712, so the data did not get less trustworthy. But wrong
is worse than blank here: it tells a participant their employer money is theirs
today when it vests over years. The four gaps:

1. **`100` has three digits.** The guard meant to catch exactly this shape was
   `[1-9]\d?` — two digits max — so "immediately vested at 100 percent AFTER
   three years of service" sailed through. The commonest way to write a cliff
   while using the word "immediately".
2. **The condition can open the sentence**: "Upon three years of service, the
   participant is 100% vested in all contributions."
3. **The carve-out is not always "except"**: "…immediately 100% vested in the
   Organization's safe harbor contributions, BUT DO NOT VEST in discretionary
   contributions UNTIL after three years."
4. **A loan sentence produced a label out of nothing.** v82 kept loan text out
   of the *quote*; the *label* path had no such test.

All three sentence-to-sentence guards were blind to 1–3 for the same reason:
the condition sits in the **same sentence** as the immediate claim.

**Replaying the fixed guards against all 14,712 stored Immediate labels removes
13 — and 9 of them pre-dated v81.** The widening did not create this class; it
made it visible by growing the population until a systematic self-check was
worth writing.

**Two corrections the replay forced, both from reading the full quotes:**

- *Safe harbor is active employer money.* "Immediately vested in the safe
  harbor contributions and 100% vested after five years … in the discretionary
  non-elective contributions" is the same match-wins split the graded loop
  already settles — written without the word "match". The exemption now covers
  it, but must NOT cover an either/or across participant *groups*
  ("contributions vest under EITHER 'safe harbor' provisions … WHEREBY such
  contributions are immediately vested OR under a vesting schedule…"), which is
  two populations where "Immediate" is wrong for one.
- *Order-independence.* The loan test first required the immediate words to
  follow "vest", which dropped a correct Immediate whose window happened to
  reach a loan note — "immediately vested" puts them before.

**And the gate corrected the fix's own author.** The specimen for shape 1 was
written expecting `null`; the run returned `5-year schedule (shape not stated)`.
Blocking the false Immediate does not leave a blank — the horizon fallback
behind the immediate pass then reads the five years correctly. The specimen now
pins the better answer. This is the second time this cycle that writing the
expectation down before running it surfaced something the measurement had
missed.

### v84 — the fix suppressed the evidence, and four bugs found by reading

Run #168 landed v83 cleanly on labels (vesting −4 net: 13 false Immediates
removed, ~9 replaced by a correct horizon-fallback schedule). But `vestQuote`
fell 191, which was **not** predicted, and reading the dropped quotes showed
**188 of 195 carried real schedule content**:

> "Plan Sponsor contributions are vested 100% after three years of service."

v83's guards were written as bare `continue`s, which skipped the quote fallback
at the bottom of the loop as well as the label. That is a worse regression than
the 4 false labels v83 fixed — the sentence is the most informative thing the
filing offers about vesting, and it is *exactly* the sentence those guards
recognise. **Blocking a wrong answer must never suppress the honest evidence.**

The fix is not "keep every blocked quote" either: three guards fire on genuine
vesting sentences (keep the quote), the loan guard fires on text that is not
about vesting at all (drop it). The gate caught the first attempt reintroducing
v82's loan quote — the `quote: null` specimen paid for itself within an hour of
being written.

**Then those 188 quotes revealed why they were never labelled**, and chasing it
produced four distinct bugs, each found only by reading the result:

1. **Reversed word order.** Every cliff arm required "100% vested … after N
   years"; auditors write "are vested 100% after three years", "vesting of 100
   percent after 3 years", "100% vesting occurring after two (2) years". Five
   arms added, sized at 71 rows against the stored quotes.
2. **The new arms' capture groups are 7-11**, and the extractor read only 1-6 —
   it would have matched the sentence and then produced `NaN`.
3. **`vest\w*` matches inside "in*vest*ment".** One arm was matching
   "…in**vestment** gains and losses after completing one year" and calling it a
   1-year cliff. A `\b` fixes it — and a "gain" I had already verified as
   correct turned out to have been produced by that substring, correct by
   accident.
4. **A ladder is not a cliff.** "become 50% vested … after completing one year
   … and 100% vested after completing two years" read as a 1-year cliff, worse
   than the 2-year cliff it replaced. The step detector missed it because its
   window could not span the clause between the percentage and "after". A
   ladder — two *distinct* percentages, at least one under 100 — now labels as
   Graded. The test is on distinct values, not step count, because two 100%
   steps are two cliffs for two money types, not a ladder.

And the loosest arm needed a fifth pass: it required no full-vesting language
at all, so "Participants vest **40%** … after completing two years" became a
2-year cliff. It now requires "fully" or "100%". That costs one row I had
verified as a gain — a sentence that never claims full vesting — which is the
right trade.

**Measured, 955 filings: 0 lost, 2 gained, 4 changed, every one read against
its filing.** Two changes fix a wrong horizon and a false Immediate; one
converts a ladder to Graded; one converts a real cliff away from Graded.

**Deliberately NOT bundled.** A sharpened ladder rule would relabel 237 more
rows that currently read as "N-year schedule (shape not stated)" or a cliff.
Most are genuine improvements, but "Graded schedule" *drops the horizon* a
participant cares about, and "6-year graded" needs the frontend considered.
Recorded as a v85 candidate rather than smuggled into a regression fix.

### v85 — the same escape hatch, on the path that did not have it

Run #169 (v84) was measured against the LIVE baseline (v82), not against the
held v83 data: vesting 50,600 → 50,721 (+121), vestQuote 5,970 → 5,847, and
everything else — confident, lineups, match, matchQuote — flat. The 4 label
losses were exactly the false Immediates v83 targeted. Mirrored.

But the quote check — the one that caught v83 and that the coverage line cannot
show — found **26 dropped quotes, and all 26 carried the plan's real schedule**:

> "Employer contributions are subject to the following vesting schedule: Notes
> receivable from participants — Participants may borrow from their fund
> accounts a minimum of $1,000…"

One sentence window spanning the schedule AND the loan heading after it. v82 had
already solved this exact problem on the quote fallback with an escape hatch
(off-topic **and** no schedule content). v84 added a loan guard on the *label*
path and did not carry the hatch across. The label must still be blocked — that
text is not a vesting claim — but the schedule has to survive.

**This is the third time in one day that this shape appeared**, which is what
makes it worth a permanent note rather than a fix:

| version | guard | what it suppressed |
|---|---|---|
| v82 | quote fallback | 38 schedules, caught before shipping |
| v83 | four label guards | 188 schedules, caught after shipping |
| v84 | loan label guard | 26 schedules, caught after shipping |

Every time, the guard was right about the *label* and wrong about the *quote*.
**A new suppression rule is not finished until it has been asked, separately,
what it does to the evidence.** The corpus diff will not answer that question —
v85 moves 0 labels across 955 filings — so the check has to be run against the
stored quotes at population scale, looking specifically for schedule content in
whatever the rule removes.

### v86 — a wider window, and two defect classes it exposed

The largest item on the sized worklist: the cliff reader's window between
"100% vested" and "after N years" was 80 characters, and the money-type list
auditors actually write is longer than that —

> "100% vested in the Company's discretionary employer match and discretionary
> non-elective profit-sharing contributions, if any, **after 5 years**"

is 130 characters wide. Widening it matches **163 stored quotes** that state a
plain cliff and carried no label — none of them ladders, none with an unusable
year. But the extra width can bridge two separate vesting claims, and then the
years belong only to the later one:

> "100% vested in the Company match … **and are vested in** the Company
> RETIREMENT CONTRIBUTION upon completion of 2 years"

**The guard is scoped to spans that needed the extra width**, per the rule
earned on v81. Measured, a global version would have removed 13 existing cliff
labels — and reading them they are almost all *correct*, because the commonest
two-claim sentence is "employee money immediate AND employer money after N
years", where the cliff describes the employer money. Two rows are excluded, 161
kept.

**Two pre-existing defect classes surfaced while sizing this**, neither of them
caused by the widening:

**"Ratably" is not a cliff — 17 stored labels.** "A participant is 100% vested
RATABLY after three years of credited service"; "Vesting is on a ratable,
three-year GRADUATED basis"; "fully vested on a PRO-RATA basis after three
years". All were stored as N-year cliffs. That is not a smaller error than a
blank: a cliff tells the participant they get **nothing** until year N, and
ratable vesting gives them a share every year. Fixed — and deliberately scoped
to the 1-3 cliff range, because a 4-6 year reading is already stored as
"N-year schedule (shape not stated)" and converting that to a bare "Graded
schedule" would DROP the horizon. That is the same trade held back as the v85
label-format candidate, and it is not going to be smuggled in through a
different door.

**Superseded rules — 99 stored labels open with a date clause.** "PRIOR TO
JULY 1, 2019, participants were fully vested … after three years" is the rule
the plan *replaced*. But that population is contaminated and must not be swept:
"Participants **HIRED BEFORE** July 1, 2009 are 100% vested after three years"
is a cohort, not a superseded rule, and `hireSplitLabel` already labels it
correctly. Only the newly-admitted spans are guarded here; untangling the
existing 99 needs its own pass with the cohort distinction measured first.

**Final: 0 lost, 0 changed, 4 gained on 955 filings** — strictly additive, each
gain read against its filing. Three new gate specimens pin the widening and both
guards.

### v87 — five wrong labels out of 289, and the third miss of the same kind

Run #171 (v86) moved **289 vesting labels: 197 gained, 92 changed, 3 lost** —
all three losses being the superseded guard working. Vesting 50,721 → 50,915.
The suppression check returned **0 quotes dropped**, so the streak stayed closed.

Reading the changes rather than the totals found **5 wrong, 1.7%**, and each one
names a gap:

1. **A percentage TABLE is graded evidence the ladder test could not see** (3
   rows). The test requires "% … after N years"; a rendered table never says
   that. "…ntage Less than 1 0% 1 33% 2 67% 3 100% Participants become fully
   vested in the Company's discretionary non-elective contribution portion…"
   shipped as a 3-year **cliff** — telling the participant they get nothing for
   three years while they are earning a third a year.
2. **"vest 20% a year"** (1 row) — the graded pattern accepted "per year" and
   "each year" but not "a year".
3. **A superseded sentence reached the IMMEDIATE pass** (1 row). "PRIOR TO
   MARCH 31, 2024, participants were immediately vested…" v86 put that guard on
   the cliff path and did not carry it to the immediate path.

**Number 3 is the third time this exact miss has happened**: v84 added the loan
guard to the label path and left the quote path without its escape hatch; v85
fixed it; v86 added the superseded guard to the cliff path and left the
immediate path without it. The pattern is always "a rule was added to one of
several paths that read the same sentences". Worth stating as a rule of its own:
**when a new guard describes a property of the SENTENCE rather than of one
reader, it belongs to every reader of that sentence — enumerate them.**

v87 measured 0 lost, 0 gained, 6 changed on 955 filings, all six read: three
fix a flatly wrong "Immediate" on plans that vest 40%→100% over five years.

**And the deferred label-format question now has an answer.** Two of the six go
from "5-year schedule (shape not stated)" to a bare "Graded schedule", losing
the horizon — the trade held back three times. Checking the frontend to see
whether the format was actually constrained: `vestingBar` is fed from the
CURATED overlay, not the extractor, and the extracted label is printed as a
free-form string (`app.js` even enriches "Graded schedule" into "Graded —
N%/year" already). **The format was never blocked.** A combined "5-year graded
schedule" is a drop-in — it needs the enrichment check at app.js:587 updated and
the smoke test run, so it is its own change, not an addendum to this one.

### v88 — a guard that ate the evidence for the fourth time, and a format unblocked

Run #172 (v87) was **held, not mirrored.** Its 302 changes were a strong win —
141 cliffs corrected to Graded off real percentage tables, 34 flatly-wrong
"Immediate" labels fixed — but reading the losses found two defects I had just
introduced:

**The cohort exemption was too narrow (5 correct labels dropped).** v86's
superseded guard skips a sentence opening "Prior to \<date\>". But:

> "**Anyone who entered** the Plan prior to January 1, 2008, **is** always 100%
> vested in the matching contribution account."
> "Participants **in the Plan before** November 21, 2019 **are** immediately
> vested…"
> "participants **enrolled on or before** December 31, 2021 **are** immediately
> vested…"

Those describe WHO, in the present tense. They are live cohort rules, not rules
the plan replaced. The exemption only knew about "hired".

**And the guard suppressed the quote — the FOURTH occurrence** (v82: 38 rows,
v83: 188, v84: 26, now 13). A superseded sentence is still the only thing the
filing says about vesting; it is verbatim and it dates itself, so a reader can
see exactly what it is. The label must go, the evidence must stay.

The galling part: **rule (f) — "a guard belongs to every reader of the sentence"
— was written in the same commit that broke rule (c) on a new path.** Writing a
rule down is not the same as applying it. The check that caught it is the same
population suppression scan that has now earned its place four times over, and
the coverage line showed nothing all four times.

**The label-format question, deferred three times, turned out to be a false
constraint.** 104 rows in #172 moved from "N-year schedule (shape not stated)"
to a bare "Graded schedule" — more accurate about shape, but dropping the fact a
participant most wants: *when is it all mine?* Both are in the filing:

> "A participant is vested 20% a year beginning in year two and **100% vested
> after six years** of credited service."

I had held this back believing the frontend needed considering. Reading `app.js`
settled it: `vestingBar()` is fed from the CURATED `data.js` overlay, not the
extractor, and the extracted label prints as a free-form string. The only real
coupling was an exact-match test enriching "Graded schedule" into "Graded —
N%/year", which would have **silently stopped firing** on every row that gained
a horizon — updated in the same commit, and the smoke test run because this
touches the frontend.

**One bug found only by reading the 72 changed rows.** The first version took
the first "after N years" in the sentence. A ladder names several:

> "20 percent after two years, 40 percent after three years, 60 percent after
> **four** years, 80 percent after five years, and 100 percent after **six**
> years"

That labelled a 6-year schedule **4-year**. The horizon is now taken from the
100% step by pairing each percentage with its year — robust for ladders and
tables alike. Final: **0 lost, 0 gained, 72 enriched**, spread 2y(3) 3y(12)
4y(12) 5y(29) 6y(16), which is the shape real DC schedules have.

### v89 — the ladder the step detector could not see, unblocked by v88

The multi-step detector requires the percentage ADJACENT to "after N years",
and auditors put the money type in between:

> "Participants become 50% vested in the Employer's matching contributions
> **and earnings thereon** after two years of service and 100% vested after
> three years"

counted ONE step, so the sentence fell through and its final step matched the
cliff reader — shipping a two-step ladder as a **3-year cliff**. Re-measured on
the v88 data: **174 rows**, 75 stored as a cliff and 100 as "N-year schedule
(shape not stated)". (The original sizing said 237; v86 and v87 had since
absorbed part of it, which is why the rule is to re-measure rather than reuse a
number.)

**This was held back three cycles for a good reason and released for a good
one.** Relabelling to a bare "Graded schedule" would have dropped the horizon —
"6-year schedule" tells a participant when everything is theirs, "Graded
schedule" does not. v88's horizon post-pass removed that objection: the 100
schedule rows now become "6-year graded schedule" and gain the shape *without*
losing the year.

Additive by construction — only sentences the narrow detector could not see
reach the new test — and the rule is two DISTINCT percentages with at least one
under 100, because two 100% steps are two cliffs for two money types.

**A verification note worth keeping.** The corpus diff saw **2** of the 174
changes. Verification had to run against the stored quotes at population scale,
where a first pass flagged 21 as lacking a clear sub-100 → 100 progression.
Reading them, all were genuine ladders that write full vesting as "until the
participant becomes **fully vested**" rather than a literal paired "100" — the
CHECK was too strict, not the data. That is the second time this cycle a
population sweep produced false positives from an over-strict predicate (the
first cost 2,094 phantom hits on "State Street"). **When a sweep flags a
surprising number, suspect the predicate before the data.**

### v90 — what the date modifies, not what tense it is

The superseded-rule backlog was recorded as "99 cliff labels opening with a date
clause" and flagged as contaminated. Re-measured on v89 data it is **465
labelled rows** whose quote carries a "prior to \<date\>", and the split is not
the one the earlier note assumed. **Tense is a trap in both directions**:

- the past-tense bucket held **live** rules — "Non-elective contributions that
  **were made** prior to July 1, 2002 **are** subject to a vesting schedule" is
  the plan's current treatment of legacy money;
- the present-tense bucket held **replaced** ones — "Prior to September 11,
  2023, a participant **is** 100% vested after three years" is an auditor
  writing loosely, not a rule in force.

What actually decides it is **what the date modifies**:

| the date modifies | example | verdict | rows |
|---|---|---|---|
| the MONEY or SERVICE | "contributions **made** prior to July 1, 2002 **are** subject to…" | live legacy rule — KEEP | 36 |
| the PARTICIPANT | "participants **enrolled** in the Plan prior to July 29, 2015 **are** immediately vested" | cohort in force — KEEP | 132 |
| the RULE, sentence-initial | "**Prior to January 1, 2020,** participants were fully vested … after two years" | REPLACED | 98 |

v86 had scoped this guard to spans the old gate had not already answered,
because a crude version removed correct labels. With the money/participant split
measured, the guard runs unscoped and takes the 98 — each of a 14-row sample
verified as a replaced rule. **The label goes; the quote stays**, because the
sentence is still the only thing the filing says about vesting and it dates
itself so a reader can see what it is.

**The corpus diff shows 0 changes** — 98 rows in 68,475 is 0.14%, so a
955-filing sample contains none of them. This change is sized and verified
entirely against the stored quotes, which is now the third time in two days that
the corpus could not see a change it had no business judging (v88: 72 of 6,978;
v89: 2 of 174).

**Two self-inflicted regex-escaping failures on the way in**, both worth naming
because they cost a restore: building a pattern with `new RegExp` from a Python
heredoc double-escaped `\\b` into a literal backslash, and the second attempt
double-escaped `\\d` inside a regex *literal* and produced an unterminated
group that broke module load. The fix both times was to stop generating regex
source through two layers of string escaping — write the pattern into a patch
FILE, not through nested shell/Python quoting.

## 2026-08-26 — 200 withdrawn filings never tried the prior-year fallback ($39.8B blank)

**What was wrong.** The owner asked why the Verizon plan shows no 401(k) match.
Three of Verizon's four plans do carry the match sentence, and it states a cap
with no rate — *"employer-matching contributions equal to a percentage of the
initial 6% of eligible compensation"* — so showing the quote and no formula is
correct. The fourth plan, **VERIZON SAVINGS PLAN FOR MANAGEMENT EMPLOYEES**
(EIN 232259884|102, 119,145 participants, **$31.32B**, $450.1M/yr employer
contributions), had **nothing at all**: no lineup, no match, no vesting, no
Roth. Its status row read `{"pv":37,"ov":2,"c":0,"s":0,"e":"download"}` — the
PDF fetch had failed and stayed failed since **parser v37, 53 versions ago**.

Widening the search: **200 acks sit at `e:"download"`, 196 of them on parser
versions below 85, covering 198 plans and $39.8B in assets.** This is the
~195-row tail that every completeness check this month waved through as benign
residue.

**What it actually is, measured.** 40 of 40 sampled download failures answer
**HTTP 403 permanently** — filings withdrawn from the EFAST2 public bucket, not
transient S3 errors. So the retry-forever design (keep the old `pv` so the ack
stays on every work list) buys nothing for this class: the object is gone and
will not come back.

**The defect.** `fetch-4i.mjs` already has a prior-year fallback for exactly
this situation — "the newest filing's public copy has no readable schedule, so
read the same plan's next-newest full-form filing." But the download-failure
`catch` block recorded `e:"download"` and `continue`d **before** reaching it, at
line ~515, while the fallback lives at ~550. A filing whose public copy was
missing entirely — the strongest possible case for the fallback — was the one
case that never tried it.

**The change.** On download failure, try `FALLBACKS[ack]` first; only if that
also yields nothing does the old preserve-and-retry behaviour run unchanged. A
rescued entry carries `fb` (the year read) plus `fbNoCopy`, and its source line
says *"from the plan's 2024 filing — the newest filing's public copy has been
withdrawn from the EFAST2 public bucket."*

**Disclosure, because a match formula can change between plan years.** `fbNoCopy`
is the only state where the audit-note features are certainly from the older
filing (an ordinary `fb` entry usually still has the newest filing's notes), so
it is the only state that re-labels them: the report footer and the EMPLOYER
CONTRIBUTIONS source line name the year, and the static plan page prints a note
saying the schedule and notes are from the prior filing while participants,
assets and fees are from the current one. Each parse job now logs how many
withdrawn filings it rescued.

**Verified end-to-end before shipping** on the real withdrawn Verizon ack in a
scratch copy of the pipeline (never the repo — `audit-data.mjs` appends to
`coverage-history.jsonl`, and a local run corrupts the regression trend): the
primary threw, the fallback downloaded and parsed 28 rows, the entry stored
`fb`/`fbNoCopy` with the disclosure string, and the features came through
(Roth, match quote). No `PARSER_VERSION` bump is needed — the 200 acks are on
every work list already because their `pv` is stale, so the next ordinary run
picks them up.

**The prevention.** A *permanent* tail in a status file is a class, not noise.
It had a name (`e:"download"`), a stable size (~195-200), and a queryable value
($39.8B) the whole time, and I read it as residue in every completeness check
because it never changed. Count a tail and price it before calling it benign —
and when an alarm turns out to be half right, record which half: 200 plans
genuinely had no data (real), and the pipeline was not failing to retry them
(my initial reading, wrong).

## 2026-08-26 (2/2) — the rescue itself replaced 73 stored menus; gap-fill only

**What was wrong, in my own change from an hour earlier.** Run #177 shipped the
prior-year rescue and reported a clean verdict: confident +43, match +42,
vesting +73, HIGH back to the baseline 4, CONFIDENCE DIFF +44/−1. The single
LOST ack was auto-triaged as real-menu-shaped, so I read it: **Patient First
Corporation** (5,113 participants, $286M) had a **confident 29-fund 2024 menu**
— Vanguard Institutional Index, the full T. Rowe Price Retirement series,
Galliard Stable Return — parsed by OCR back when its PDF was still in the
bucket. The rescue replaced it with a 2023 parse that wasn't confident, and the
entry was dropped entirely.

**Then the number that the verdict could not show.** Of the 200 acks in the
run, **103 already had a stored entry**, and the rescue overwrote them:

| | acks |
|---|---|
| stored menu **replaced** by a prior-year read | **73** |
| …of those, now labelled an **older plan year** | **45** |
| lineups genuinely gained (nothing was stored) | 44 |
| feature sets genuinely gained | 73 |
| lineup lost outright | 1 (Patient First) |
| feature set lost outright | 1 |

The confidence diff saw one loss out of seventy-four substitutions, because
**both parses were confident** — a swap from a good 2024 menu to a good 2023
menu is invisible to a counter that only asks "confident before, confident
after". Every guard in this pipeline counts state changes; none of them counts
a *replacement of the same state with worse-sourced content*.

**The rule I broke.** The comment I edited around said it outright: *"a failed
download must never clobber a previous parse of the same ack — v37 dropped 6
good lineups this way."* I preserved the letter (I kept the retry semantics)
and broke the spirit (I let the fallback write over the preserved entry).

**The change.** The rescue is now **gap-fill only**: a stored entry was parsed
from this plan's OWN newest filing while its public copy still existed, so a
prior-year read may only fill what is empty.

- stored confident menu + non-confident prior year → the stored menu stands
- stored menu, no stored notes → the menu stands and the prior-year notes are
  attached, tagged `featFb` with their year
- stored notes, no stored menu → the notes stand (they are the newer ones) and
  the prior-year menu is added with its own fallback source line
- nothing stored → the rescue writes both, as before

The disclosure split follows: `fb` marks the year the **schedule** came from,
`featFb` marks the year the **notes** came from, and they can differ. The
frontend and the static plan pages key the "read from the plan's N filing"
label on `featFb` alone, so a merged entry never mislabels a schedule that came
from the newest filing.

**Data restored, not left standing.** `lineups-status.json` and the 64 lineup
shards were reverted to the pre-run commit, which puts all 200 acks back on the
work list and restores Patient First's 29 funds. Run #177's data was never
mirrored to main, so the live site never carried the substitution.

**The prevention.** When a change makes the pipeline read a *different source
document* for an existing record, the question is not "did the counters go up"
— it is **"how many records changed source, and was each one an upgrade?"**
Count replacements, not just gains and losses. Two runs in a row now (v87's
suppressed quotes, this) the headline verdict was green while a same-state
substitution went unmeasured underneath it.

## 2026-08-26 (3/3) — v91: a match formula spliced from two different cohorts

**Found by reading the plan the owner asked about.** The rescue recovered
Verizon's management plan and it came back with a match — so I read the quote
before reporting it, and the quote does not say what the label says:

> "…Matching contributions are equivalent in value to **100% of the first 6%**
> of eligible compensation that the participant contributes to the Plan. **For
> all other union represented employees** eligible to participate in the Plan,
> the employer-matching contributions are equivalent to **100% of the first 4%
> and 50% of the next 2%** of eligible compensation."

The label read **"100% of the first 6% of pay + 50% of the next 2%"** — the
first tier of one population's formula welded to the second tier of another's.
No participant in that plan receives it. The audit's formula-vs-quote check
passes it, because 100, 6, 50 and 2 all appear in the quote.

**The class, measured.** Of 6,853 two-tier labels in the store, **14** have a
sentence boundary between their two tiers; reading all 14, **7 are cross-cohort
or cross-period splices** (union vs non-union, hire-date classes, "certain
other locations", two subsidiaries, a prior plan year) and **7 are genuine
one-formula-two-sentences continuations** ("The Company will also contribute
50% of the next 2%").

**Why the existing guard missed them.** There *is* a break for a new match head
in the following sentence, and it is a **verb-and-spelling list**:
`makes|may make|will make|provide[ds]|receives|offers`, plus "match(ing)
contributions was/were equal to". Verizon says "the employer-matching
contributions **are equivalent to**" — missed by one word. Thetford says "The
Company **contributes**". Ferroglobe says "The discretionary match … **is equal
to**" without the word "contributions". This is the same failure shape as v76's
FEIN guard: *a guard is only as wide as the spellings it was shown.*

**The change (v91), vocabulary-free.** If the continuation sentence states its
**own complete head** — "N% of the first M%" — whose rate or bound **differs**
from ours, it is a different formula and its tiers do not chain. A restatement
of the *same* head keeps chaining, which is what protects the legitimate cases
("…to become a tiered match paying 100% of the first 3%, plus 50% of the next
2%" restates our own head, so its tier is ours).

**Verified both directions.** Across the 14: the 7 splices lose the fabricated
tier and keep a true single-tier label; the 7 continuations are byte-identical.
Across **1,265 locally cached filings**: exactly **2 field diffs**, both on the
one splice filing in that set — the label loses the fabricated tier and the
quote ends at the sentence that supports it. No quote was suppressed (the
population check that has caught four regressions this month).

Two gate specimens pin both directions, and the gate grew a **match arm** so a
match label can be asserted at all: "Union tiers must not chain onto the
non-union head" (must be single-tier) and "Same-population continuation still
chains" (must keep both tiers). A guard wide enough to fix the first will
silently eat the second, so neither ships alone.

**Sequencing.** Run #178's rescue data is correct and unmirrored; it is held
until the v91 re-parse lands so that main takes one mirror that is better on
both axes — the 198 recovered plans AND the corrected formulas — rather than
publishing a known-wrong formula for a 119,145-participant plan in between.

## 2026-08-26 (4/4) — the rescue froze, then the unfreezing overwrote newer notes

Two more defects in the same rescue, both found by checking the *plan*, not the
counters. Run #179's verdict was clean on every axis — 0 quotes suppressed, 0
menus replaced, 13 match labels changed and all 13 improvements — and Verizon's
match was **still the splice v91 was written to fix**.

**(a) A rescued entry froze at the version that wrote it.** Run #178's rescue had
filled the gap, so run #179's gap-fill rule saw nothing missing and preserved the
v90 entry untouched; v91 never re-read the plan. Because a withdrawn filing can
never be downloaded again, that entry would have stayed at v90 **forever**.

The rule was keying on *presence* when it should key on *provenance*: what
deserves protection is content from the plan's OWN newest filing. Content the
rescue itself wrote is the same prior-year document and a newer parser may
re-read it — so the protection now tests `fb` (schedule) and `featFb` (notes),
not mere existence. Entries also record **`fbAck`**, the exact filing a
prior-year read came from, because this investigation needed that document and
had no way to name it.

**(b) Unfreezing then overwrote notes that were newer.** With the schedule
refreshable and the notes protected, run #180 still let the fallback's notes win
whenever the fallback *had* notes — the guard only fired when it found none.
**26 plans** had their newest-filing notes replaced by prior-year notes. Most
produced an identical label (formulas rarely move year to year), but one
displayed a **superseded formula**: its own newest filing says *"Effective
January 1, 2024, the Company makes safe harbor matching contributions of 200% on
the first 2% and 25% of the next 4%"*, and the 2023 notes we swapped in state the
old 100%/3% + 50%/2% schedule. Fixed: protected notes always win, whether or not
the fallback has its own.

**Verified against the real document this time.** With `fbAck` in hand, the 2024
Verizon filing was downloaded and read: the filing states 100% of the first 6%
for management and Wireless-union employees, and 100% of the first 4% + 50% of
the next 2% for all other union employees, in two separate sentences. The
extractor run on that full text now returns **"100% of the first 6% of pay"**
with the management-population sentence as its quote. **The stored-quote test
that passed while production failed is the lesson**: a 300-character normalized
quote is not the document, and a guard verified only against quotes has been
verified against the extractor's own output, not against the filing.

Run #179's lineup data was restored before re-running, so the 26 downgraded
notes were never published.

## 2026-08-27 — v92: the cliff reader was a spelling list too

**Found by following a loose thread.** Verizon's 2024 filing says participants
"shall be fully vested … **upon completing** three years of vesting service" and
we showed the quote with no label — while a gate specimen proves "upon
**completion of** three years" extracts fine. One word apart.

**Sized before writing code.** Of 5,718 vesting quote-only rows, 2,159 make a
vesting claim about employer money AND name a service duration. Classified:
**408 cliff-shaped, 123 graded-shaped, 1,628 unclassified** — and the
unclassified are the known floor, "Vesting in the Company's matching
contributions is based on years of continuous service", full stop, no number.

**Then read 12 real filings, not the stored quotes** (the discipline this week
paid for). 12 of 12 located the right sentence and produced nothing:

> "vest fully when such participant **attains** two years of credited service" ·
> "fully vested … **following completion of** three years" · "are **not vested
> until** completion of 2 years … at which time they become 100% vested" ·
> "**After** 4 years of service, Company contributions … become fully vested" ·
> "fully vested … after **attaining** six years"

The cliff alternation is a 1,400-character regex of verb spellings, and every
one of these needs another arm. That is the failure shape of v76's FEIN guard
and v91's match splice, twice over.

**The change: match on SHAPE, not vocabulary.** A full-vesting claim and a
service duration, in one sentence, within 200 characters, with no sentence
boundary between them. Every existing guard still runs, because the pass only
supplies the match the alternation missed — ladders still become "Graded
schedule", 4–6 years still become "N-year schedule (shape not stated)" under the
§411(a)(2)(B) three-year cliff cap, superseded rules are still dropped.

**Three guards, each earned by a filing that would otherwise be wrong:**

1. **A partial percentage means graded, not cliff.** "Company contributions vest
   **25% for each** of the first two calendar years … and become fully vested
   after … three years" has only two distinct percentages, so the count-based
   ladder test misses it — and "3-year cliff" tells that participant they get
   nothing for three years when they earn a quarter of it a year. 0 and 100 stay
   allowed; they are the cliff's own vocabulary ("0% vested … until two years,
   after which … 100%").
2. **A carve-out describes two money types at once.** "All … contributions are
   fully vested at all times, **except** the employer's non-elective
   contributions, which require three years": naming either half misdescribes
   the other.
3. **A collectively bargained cohort is not the plan.** The gate caught this
   one. Its filing reads: participants **not covered** by a CBA are immediately
   vested in employer safe-harbor money; participants **covered** by one vest in
   non-safe-harbor money after three years. Most of the plan gets employer money
   immediately, so "3-year cliff" would be wrong for them. Hire-date cohorts are
   different — those already ship a "(varies by hire date per the filing)"
   label — but bargaining units have no such disclosure, so the sentence keeps
   its quote and no label.

**One gate expectation moved, deliberately, in this commit.** "Upon three years
of service, … 100% vested" was pinned at `null` in v83 because the sentence was
producing a false "Immediate"; null was the best answer available then. Its
filing reads: "The portion … attributable to the Company's profit sharing and
matching contributions is **not vested until** the participant reaches three
years of service." That is a real 3-year cliff, so the expectation is now
"3-year cliff". The specimen keeps its protective value — it still fails if the
label ever returns to "Immediate".

**Measured on 1,268 cached filings: 16 labels gained, 8 corrected, 0 lost, 0
quotes suppressed.** Seven of the eight corrections are **Immediate → N-year
cliff**, the direction that matters most: each was a plan telling participants
their employer money was already theirs when the filing says it vests over
years. All eight were read against their filings by hand before shipping.

**Post-run check owed** (the v83 precedent): every Immediate → cliff flip in the
universe must be re-read against its own stored quote by machine before this
mirrors. The corpus rate projects roughly 350 flips, too many to eyeball.

## 2026-08-28 — run #182's verdict: v92 was right about the gap and wrong about precedence

Run #182 landed **vesting 50,987 → 51,748 (+761)**, quote-only pool −608, 0
quotes suppressed, HIGH at the baseline 4. The gate was green, the verdict was
green, and the data was **not fit to mirror.** Two classes, both found by
diffing labels rather than counting them.

**(a) 48 plans lost a filed TABLE to a single sentence.** The table readers run
*after* the sentence loop, gated on `!out.vesting` — so v92's shape-based cliff,
which breaks the loop on first match, preempted them:

| was | now | the filing actually says |
|---|---|---|
| Graded schedule (0/20/40/60/80/100 over 6 yr) | 1-year cliff (Company matching) | both — the table is the plan, the cliff is one money type |
| 3-year graded (25/50/100) | 3-year cliff | "100% vested **over a period of** three years" — graded |
| 5-year graded (varies by hire date) | 1-year cliff | "The Employer base contribution, which is **made** after one year of service, is vested **based on** continuous years of service" — no cliff at all |

**(b) 157 Immediate → cliff flips, mostly right, not separable.** A machine
re-read of all 157 against their own quotes (v83 precedent) passed 88 strictly;
reading the remainder by hand, most of the rest are also correct — the checker
was stricter than the extractor, rejecting "Matching contributions are vested
after one year of service" for lacking the word "fully", and rejecting "after
their **third** year" for naming an ordinal rather than "three". But the class
contains real counterexamples in both directions: United's filing states a
plan-wide "100% vested after their third year of service" **and** a bullet
"Pre-merger Continental and CMI Flight Attendants — Participants are always 100%
vested in their Employer Matching Contributions", so the cliff is the rule and
the immediate claim is one cohort; elsewhere a plan vests matching immediately
and non-matching over three years, where no single label is complete.

**v93 ships the part that is provably better and defers the rest.**

1. The shape-cliff becomes a **held candidate**, applied only where nothing else
   was found — filed tables, graded readings and immediate readings all get
   first refusal. This is the same last-resort discipline the 4–6 year horizon
   fallback has carried since v77, and for the same reason.
2. **Graded wording can never read as a cliff**: "over a period of",
   "proportionally over", "over N years", "based on years of service",
   "ratably", "in increments", "each year thereafter".
3. **The Immediate arbitration is deliberately not attempted.** Deciding it
   needs a money-type pass, sized and evidenced on its own; adding a third
   heuristic on top of two at the end of a long session is how the last two
   regressions got written. The 157 flips and both counterexamples are recorded
   above so that work starts with evidence rather than from scratch.

**Net effect measured against the live parser: 28 labels gained, 0 lost, 0
changed, 0 quotes suppressed** across 1,271 cached filings. Nothing that already
had an answer is touched.

**The method note worth keeping.** Run #182's verdict line was green on every
metric the pipeline prints. What surfaced both defects was diffing the *labels
themselves* against the previous run and reading the changes by class —
`Graded schedule -> 2-year cliff` is invisible to a coverage count, because the
count is identical either way. **A label that changes shape is a change even
when the totals do not move**, which is the same lesson as the replacement rule
two days ago, one level up.

**And a predicate error, the fourth this week**: the first self-check reported
0 of 157 flips passing, because `new RegExp("\\\\b…")` inside a `node -e` string
became a literal backslash. The log already says to write patterns into a FILE.
Re-run from a file, it was 88 of 157.

## 2026-08-28 (2/2) — run #183: the deferral was right, the precedence was not

v93's run was clean where v92's was not: against the **live** data, **700 vesting
labels gained, 0 lost, 0 quotes suppressed, and zero graded-or-table → cliff
moves** — the class that held v92 was gone. But 19 plans changed from
`N-year schedule (shape not stated)` to a specific cliff, and reading five of
them, three were worse:

- "A participant is 100% vested after **six** years of credited service" lost to
  "Participants are vested in **their contributions** plus actual earnings at two
  years of service" — that sentence is about participant money, not employer.
- "Discretionary profit-sharing contributions vest in increments of 20% … 100%
  vested after six years" lost to an **unscoped** "2-year cliff" that described
  only the safe-harbor match.
- "…20%, increasing by 20% annually, until becoming fully vested after six
  years" lost to "become vested … **on a schedule beginning after** two years of
  service" — a schedule's starting point read as the year the money is earned.

**v94 fixes the order and the wording.** A 4–6 year full-vesting horizon is the
plan's own statement of when the money is entirely earned; a 1–3 year cliff
found in another sentence is usually one money type inside it. So the horizon
now outranks the held cliff, reversing what v93 shipped. And two more phrasings
join the graded list: "on a schedule", "beginning at/after", "graduated basis".

**The shape of the lesson.** v92 preempted the table readers, v93 preempted the
horizon fallback. Both times the new reader was correct about the *sentence* and
wrong about its *rank* among readers that already existed. A new extraction pass
should enter at the BOTTOM of the precedence order and be promoted only with
evidence, never inserted in the middle because that is where the code happened
to be edited.

Measured against the live parser: 28 gained, 0 lost, **0 changed**, 0 quotes
suppressed across 1,272 cached filings.

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

## 2026-08-31 — v95: four ways to say "how long", found by not re-reading the same companies

The owner's instruction — do not repeat companies when reviewing filings — paid
for itself on its first application. `scripts/sample-filings.mjs` now excludes
every company in `docs/reviewed-filings.jsonl` (seeded with 592 filings across
520 companies), takes one plan per company, and samples largest-first. Six
companies came back, none previously read, and **five of the six were showing no
vesting answer while their filings state one plainly**:

| plan | participants | the filing says | why it was missed |
|---|---|---|---|
| Ford salaried | 52,244 | "Company matching contributions and FRP Contributions **vest three years after the original date of hire**" | bare verb, and the period is anchored to a hire date, not "years of service" |
| American Airlines | 114,844 | "requires participants to be **employed for two years** before becoming 100% vested" | "employed for N years" |
| Johnson & Johnson | 72,991 | "become vested after the participant has completed a **three-year period of service**" | hyphenated adjective form |
| Fidelity (FMR) | 90,445 | a filed table: <2 yr 0%, 2 yr 20%, 3 yr 40%, 4 yr 60%, 5 yr 100% | the column header is split across **two lines** |
| Bank of America | 254,477 | "fully vested after completion of **36 months** of vesting service" | duration stated in MONTHS |

v95 reads all five shapes. Months convert only in whole years (12/24/36/48/60/
72) — a filing that says 18 months means something a year label cannot express,
and the quote states it exactly.

**Bank of America is fixed as a reader and still unlabelled, on purpose.** Its
paragraph says company **matching** is vested immediately and only the *annual
company contribution* carries the 36-month cliff. That is the money-type
arbitration deferred on 2026-08-28, and this is one more piece of evidence for
it rather than a reason to guess now. Its displayed quote is also a match
*eligibility* sentence — the wrong-topic class, still open.

**A predicate error worth recording, the fifth this month.** The first sizing
pass reported only 13 candidate rows because the gate I wrote required
"vested"/"fully"/"100%" — which excludes Ford's "contributions **vest** three
years after…", the very filing that started this. Fixed, it was 24. And 24 is
still only a lower bound: **stored quotes are capped near 300 characters, so any
phrasing past the cap cannot be counted from stored data at all.** Sizing a
class from stored quotes measures the quotes, not the class.

Measured on a 199-filing corpus: **9 vesting labels gained, 0 changed, 0 lost,
0 quotes suppressed.** Four new gate specimens pin the four shapes.

**Tooling that came out of this**, both because a container recycle destroyed
the previous corpus and the ad-hoc scripts that built it:
`scripts/build-review-corpus.mjs` rebuilds a class-spread corpus on demand, and
`scripts/diff-parser.mjs` diffs the working parser against any committed ref and
prints every label change — not just the totals.

## 2026-08-31 — map view, and two things it surfaced

Added a Map view: every full-form filer placed at its filing ZIP, clustered,
with the existing filters applied unchanged. Two design rules worth recording.

**It reuses `passesFilters()` rather than reimplementing it.** The map draws
from the same filtered set as the table, so the two views cannot disagree about
what a filter means. `map-points.json` is row-aligned to the boot payload, and
the plan's boot row index is carried through `mergePlan` for the lookup —
dropping it there is what made the first draw produce 51 state outlines and
zero dots.

**Nothing was added to the boot payload.** `us-states.json` (16 KB gz) and
`map-points.json` (231 KB gz) are fetched the first time a reader opens the Map
view. Given the site is already under scrutiny for a loading problem, a feature
that made the first paint heavier would have been the wrong trade.

**What the dots mean, stated on the page:** a Form 5500 carries the SPONSOR'S
address — a headquarters or benefits office — not where participants live. A
250,000-participant plan filed from one Manhattan ZIP is one dot in Manhattan,
not 250,000 people there. 508 of 68,166 full-form filers (0.75%) have a ZIP with
no published centroid and are counted as unplaced on the page rather than
dropped silently.

**Two defects the map surfaced, both caught by testing rather than by reading:**

1. **A total that rendered as `$0`.** The cluster summed `plan.assetsEOY`, which
   exists only on the pre-merge boot record — after `mergePlan` the field is
   `assetsB`, in billions. NaN checks do not catch this: `$0` is a perfectly
   well-formed number. The map test now fails on an implausible zero total, not
   just on NaN. Corrected, the map's $8.7T ties to the $8.78T in plans-all, the
   difference being the unplaced 508.

2. **The site's participant count is EOY; plans-all's is BOY.** The boot column
   is `partEOY || participants`, while `plans-all.participants` is
   `partBOY >= 100 ? partBOY : partEOY`. Summed over full-form filers that is
   **105.0M vs 102.8M** — a real 2.2M gap between two honest measurements taken
   at different points in the plan year. Neither is wrong and the map is
   consistent with the rest of the site, but **nothing on the site says which
   point in the year the headline count refers to.** Labeling it is open work,
   not a silent choice to leave standing.

A `scripts/map-test.mjs` boots the site, opens the map, and asserts: state
outlines drawn, clusters drawn, a filter reduces the count, all four totals
non-zero and non-NaN, and both caveats present in the note.

---

## 2026-08-31 — A collective trust wearing a mutual fund's ticker

**What was wrong.** 308 filed holdings, carrying **$13.1B**, displayed an exact
mutual-fund ticker for a vehicle the plan does not hold. `MFO VANGUARD TARGET
RET 2035 TR SEL` is Vanguard's Target Retirement 2035 **Trust Select** — a
collective trust, with its own fee and no ticker at all. The site showed it as
**VTTHX**, with no asterisk, which is the site's notation for "this is exactly
the fund named". That is a false claim about what the plan holds, and it is
precisely the claim the guard in `fundTickerInfo` was written to prevent.

A further 1,800 rows / **$44.8B** of trusts were priced at the mutual fund's
expense ratio rather than the trust's.

**Why the guard missed them.** It anchored on `\btr[\s-][a-z0-9]\s*$` — the
letters "Tr" followed by exactly **one** character at the end of the name. That
catches `Tr I` and `Tr P`. It does not catch `Tr II`, `TR SEL`, `Tr Select` or
`Tr Plus`. The guard was built from the examples in front of it at the time,
and the class marker is simply wider than one character.

**The change.** A named `TRUST_CLASS` fragment now carries the trust-class
vocabulary — Roman numerals, `Sel`/`Select`, `Plus`, and a bare single
character — and both the ticker guard and the Vanguard fee rows read from it.
The list is **closed on purpose**: a pattern like `Tr \w+$` would convert every
name whose last word trails a stray "Tr" into a trust. `TRP` cannot match it;
`\btr\b` requires the word boundary, which is the same reason the original
guard was written that way.

**Two fee gaps closed alongside it, both found by ranking the gap by dollars
rather than by row count:**

- **`Vanguard Target 2045`** — 8,201 rows spell the series with no
  "Retirement". The ticker table already resolved those to VTIVX while the fee
  table demanded the word, so a fund identified well enough to earn a ticker
  was denied its fee. The two tables disagreed about the same name.
- **`Vanguard Institutional Target Retirement 2040 Fund`** — 4,894 rows,
  **$43.9B**, matched nothing at all. This one is a merger, not a spelling:
  Vanguard reorganised the Institutional Target Retirement Funds into the
  Target Retirement Funds on **2022-02-11**, which is why the survivor costs
  0.08%. Every plan year in this universe (2023–2025) post-dates that merger,
  so a filing still headed "Institutional" is an auditor using the old name for
  the fund the plan now holds. Quoting the dead institutional ticker would name
  a fund that no longer exists — the dead-ticker rule already recorded for
  BSPIX/MAIIX/BRGNX — so the successor's ticker is the honest answer.

**One defect I introduced and caught in my own diff.** The first trust rule was
an ORDERED pattern — Vanguard, then target, then the trust word. It missed 26
names / $0.90B where the filing names the **trustee first**: "Vanguard
Fiduciary Trust Vanguard Target 2050 **N/R**", "Fidelity Management Trust
Company - Vanguard Target 2030". Those are collective trusts — `N/R` is the
filer saying *not registered* — and the ordered pattern priced every one of
them as the mutual fund. Rewritten as order-independent lookaheads. The rule:
**a vehicle test must not depend on where in the name the vehicle is named.**

**Final measured effect** (1.70M holdings, $10.80T filed):

| | before | after |
|---|---|---|
| expense ratio | 899,948 rows / $4,582.8B | 906,176 rows / $4,740.7B |
| ticker | 306,644 rows / $1,524.6B | 310,503 rows / $1,549.5B |

Gained 6,228 ER rows / $158.7B and 4,178 ticker rows / $38.0B. **Zero expense
ratios lost. Zero tickers swapped. Zero tickers removed from a non-trust.**
1,025 rows / $33.2B were re-priced from the fund's fee to the trust's, and 319
rows / $13.2B correctly stopped claiming a ticker. Every single change was
classified by machine and every one falls in an intended class, with one
exception worth naming: a single row ($0.4M) whose filed name is two holdings
glued together by the parser — `Index Fund - Admiral(TM) Shares Account
Nationwide Trust Company, FSB Vanguard Target Reti`. Its fee moved 0.10 to
0.045. That is a row-merge artifact in the parser, not a fee-table question.

**The prevention.** Rank the gap by **filed dollars, not by row count.** The
false tickers sat in names appearing once or twice; by row count they are
invisible, and by dollars they were on the first screen. Every fee and ticker
added here was verified twice against published sources, following the
Google-Finance share-class error of 2026-08-30.

**Measured and deliberately NOT fixed:** roughly **$19B** of T. Rowe Price
collective trusts still carry the mutual fund's expense ratio — `T Rowe Price
Equity Income TR F` reads 0.68%, which is the fee for the fund, not the trust.
The ticker is correctly suppressed, so no false claim is displayed; only the
fee is overstated. TRP's trust fees vary by trust class and are not published
in the filing, so the fix is a research task, not a pattern — and inventing a
number would be worse than the overstatement. Named here so it is a known
open item rather than an undiscovered one.

---

## 2026-09-01 — A vesting table the filing had already replaced

**What is wrong, and it is live.** Plan `20251006163156NAL0004018177001` shows
**"Graded schedule"**. It vests **immediately**. Its filing prints a 6-year
20/40/60/80/100 table, introduced as the schedule *"through the year ended
December 31, 2023"*, and then says:

> Effective January 1, 2024, matching contributions and non-elective Employer
> contributions are 100 percent vested at all times.

The table reader read the table and never read the sentence that retired it.
The previous label, `Immediate`, was correct.

**How it got here.** v95 added a two-line table-header variant (`Years of /
Percent / Vesting Service / Vested`) so more filed tables became readable. That
is a good change — it moved 20 labels, and 19 of them are improvements,
including plans whose old `Immediate` came from reading an elective-deferral or
safe-harbor carve-out sentence instead of the employer schedule. But a table
reader that outranks the other passes inherits responsibility for asking
whether the table is still in force, and this one does not ask.

**Why the existing guard did not catch it.** v86/v87 added a superseded-schedule
guard for `Prior to <date>` phrasing, and the rule recorded then was *classify
by what the date modifies, never by tense*. This filing uses neither shape. It
scopes the table with **"through the year ended December 31, 2023"** and states
the replacement as **"Effective January 1, 2024 … 100 percent vested at all
times"**. Both sentences sit outside the table the reader captured.

**Not rolled back.** The same run delivered 112 vesting gains with **zero
losses and zero quotes suppressed**, plus an entire new filing season. Reverting
to remove one wrong label would discard all of that. It is fixed forward
instead, and named here so it is not silently carried.

**v96 candidate, specified:** when a vesting table is captured, scan the
enclosing note for a scope marker (`through the (year|plan year) ended <date>`,
`for plan years prior to <date>`) and for a replacement clause (`effective
<date>` within the same note asserting full or immediate vesting). When both are
present and the replacement date is at or before the plan year being reported,
the table is history — the replacement is the answer. Size the class across
stored entries before writing the pattern: the table-derived quote is
synthesized (`Vesting schedule as filed — …`) and therefore contains none of
this language, so sizing needs the document text, not the stored quote.

**The process failure worth recording separately.** This run was mirrored before
the label-level diff was run. Completeness, loss classification and the
universe-superset check all passed and all three were done — the label read was
not, and it is the only check that could have found this. **Mirror after the
label diff, not after the counts.** The counts said +157 vesting and zero
losses, which is exactly what a run containing this defect looks like.

---

## 2026-09-01 — The map drew 23% of its dots on the wrong plan

**What was wrong, on the live site.** `map-points.json` is **positional**: entry
*i* is the coordinate for plan *i* of the boot payload. It was generated against
a 110,555-plan universe. Run #186 grew the universe to 111,782. Every row after
the first inserted plan then named a different plan, and **15,774 of 67,658
placed plans — 23% — were drawn in the wrong location.**

Nothing looked broken. The right number of dots appeared, the totals were
plausible, the filters worked, and the map test passed. A stale positional file
does not fail; it lies.

**How it happened.** The map shipped with `scripts/build-map-points.mjs` run by
hand and deliberately left out of the pipeline: wiring it in meant editing the
workflow file, and a workflow edit cancels an in-flight run. That was the right
call for the run and the wrong call to leave standing. The deferral was never
closed, and the next pipeline run invalidated the file.

**Four fixes, because one would not have been enough:**

1. **The generator now runs in the merge job**, in the same step that rewrites
   `plans-all`, with **no `|| true`** — a map built against the wrong universe
   is a wrong answer, so a failure should fail the run.
2. **The file states what it is aligned to.** `map-points.json` now carries
   `universe`, and the frontend refuses to draw when it disagrees with the boot
   payload, showing "the map is being rebuilt … every plan is still in the
   table". **Drawing nothing is the honest failure; drawing the wrong thing is
   not.**
3. **The map test asserts alignment before it waits for dots.** Checked
   afterwards, a stale file surfaced only as "timed out waiting for map
   clusters", which would send the next person hunting a rendering bug. It now
   fails with `STALE map-points.json: aligned to 110555 plans, site boots
   111782. Regenerate with: node scripts/build-map-points.mjs`. Verified by
   negative control against the exact stale value that shipped.
4. **The smoke test now runs on DATA changes, not only frontend changes.** It
   was gated on `app.js`/`index.html`/`styles.css`/`data.js`/`fund-er.js`, so
   the pipeline could rewrite every data file and nothing checked that the site
   still booted against it. `map-test.mjs` was never in CI at all — it had only
   ever run locally.

**The general rule, and it is not about maps:** *a row-aligned sidecar file must
carry a fingerprint of the thing it is aligned to, and must be regenerated by
the same job that changes that thing.* Any file keyed by position rather than by
identity has this failure mode, and its failure is silent by construction.

**The process rule:** a deferral made for a good reason ("editing the workflow
would cancel the running job") is still an open defect until it is closed. It
needs to be written down where the next cycle will act on it, not carried in
someone's head.

**v96 shipped 2026-09-01.** The guard requires three things together, because
each alone is common and harmless: the schedule is confined to a past period;
a DATED replacement asserts full vesting; and that replacement covers EMPLOYER
money ("effective January 1 2024 participants are 100% vested in their elective
deferrals" is always true and supersedes nothing). Plus the replacement must
already be in force for the year the document reports, so a subsequent-event
note in an earlier filing cannot rewrite that year's actual schedule.

Applied ONCE, after every vesting reader has run, because this is a property of
the NOTE rather than of any single reader — the rule earned in v84 and v86,
where a guard added to one reader's path left the others exposed. Five separate
table readers would otherwise each need it.

Measured before shipping: 11,654 stored labels are table-derived schedules; a
40-filing sample spread evenly across the sorted ack space flipped **0**. The
class is rare by construction, which is the intended shape — this corrects a
known-wrong label without disturbing the population. Gate green at 53
specimens, including three deliberate decoy controls: a genuine 6-year graded
schedule with an immediate safe-harbor carve-out, a genuine graded schedule
carrying an unrelated "Effective January 1, 2023" clause about catch-up
contributions, and XPO's real 2-year cliff.

---

## 2026-09-01 — The audit cried wolf 4,737 times

**What was wrong.** Run #186 raised **4,741 HIGH findings**. Four were real —
the known contribution-limit outliers. The other **4,737 were false**, and they
buried the real ones at the bottom of an auto-managed issue nobody could read.

An accuracy instrument that fires 4,737 false alarms is worse than no
instrument: it trains everyone to skim past exactly the output it exists to
surface.

**Why.** That run ingested a new filing season, so thousands of plans moved to
a newer ack. The loss triage compared **ack to ack** and never asked whether the
**plan** had moved. Every superseded filing therefore looked like a lineup that
had "lost confidence".

Triaged by hand: **4,505** were replaced by a newer filing that is itself
confident, **250** by a newer filing not yet confident, **12** were master-trust
acks that live in `mtias.json` rather than `plans-all`, and **zero** were the
only shape that is actually a regression — the same ack still current with its
lineup gone.

**The fix.** An ack that is no longer any plan's current filing **is never
displayed again**, so its lineup cannot have regressed for a reader. The triage
now skips those, using the same `plans-all` + `mtias.json` ack set the orphan
purge already builds — hoisted out of that block rather than rebuilt. When
`plans-all` is unavailable the set is null and the filter is **skipped with a
warning** rather than silently passing everything.

**Verified both directions, because a filter is only trustworthy if it does
both:**
- Replayed against run #186's real data: all **4,767** losses suppressed,
  **0** left to triage — matching the hand triage exactly. `reparse-loss` HIGHs
  go 4,737 → 0, and the four genuine findings stop being buried.
- Negative control: a currently-confident ack that **is** still its plan's
  current filing survives the filter, so a real regression is still caught.

**The general rule:** *an alarm that cannot distinguish "the input changed"
from "the code broke" is not an alarm.* Before adding any auto-triage, ask what
routine, expected event will trip it, and encode that difference — otherwise
the instrument's own noise destroys the signal it was built for.

---

## 2026-09-01 — The same trust, two different fees, from one table

**What was wrong.** These two rows sat side by side in the shipped data:

| filed name | fee shown |
|---|---|
| `T. Rowe Price Retirement 2040 Trust` | **0.37** — the trust's fee |
| `TRP Retirement 2040 TR-E` | **0.59** — the MUTUAL FUND's fee |

Same manager, same strategy, same vintage, **same vehicle** — two different
answers from the same table, because one filing spelled the word "trust" and
the other wrote the trust's *class* (`TR-E`, `TR-B`, `Trust E`, `CIT`). An
internal inconsistency like this is the clearest possible evidence of a bug:
the table already knew the right answer and simply failed to recognise the
name.

**Scale: 794 names / 1,431 rows / $15.84B** were priced at a mutual fund's
expense ratio while being collective trusts.

**Nothing was invented to fix it.** The marker-spelled names are routed to the
**trust estimate this table already carries** (0.37), rather than being given
the fee of a different vehicle. This is the sibling of the Vanguard `Tr II` /
`TR SEL` defect logged earlier today, in the family that entry explicitly
deferred — and it is the same root cause: **a vehicle test that depends on the
vehicle being spelled out.**

**Verified as a safety property, not just a diff.** Every single name whose fee
changed is trust-shaped, and **zero tickers moved** — the change touches fees
only, and no actual mutual fund was pulled to the trust price. The Retirement
series consolidated from $63.8B to $79.7B at 0.37.

**What is deliberately NOT fixed, and why.** Roughly **$15B** of *other* T.
Rowe Price collective trusts still carry their mutual fund's expense ratio —
Blue Chip Growth Trust (0.70, $6.6B), Large Cap Growth Trust Class D (0.55,
$4.3B), Equity Income TR F (0.68, $2.0B), Growth Stock Trust E (0.66, $1.6B),
New Horizons Trust Z (0.64). Unlike the Retirement series, **this table holds
no trust-specific estimate for those strategies**, and TRP's CIT fees vary by
trust class and are not disclosed in the filing. Routing them to a number I do
not have would be inventing one, which is worse than an overstated fee that is
labelled "est." The ticker is correctly suppressed on all of them, so no false
claim about *what* the plan holds is displayed — only the fee is high. This is
a research task, and it stays named here until someone does the research.
