# Fund test log — the 10-fund reports

A running memory bank for the ticker/comparable machine. Every cycle tests the
**next 10 highest-value unresolved filed names**, records what resolved and
what did not *and why*, and notes what was upgraded or found broken.

Rules this log runs by:
- The batch is chosen by **assets**, not by what is easy. The top of the
  unresolved list is the work list.
- "Not found" is a result, not a failure — but it must carry a reason, and the
  reason must be specific enough to act on.
- A finding that turns out to be a **parser** problem rather than a ticker
  problem gets recorded here and handed to the parser worklist. The two
  machines are separate and it matters which one is broken.
- Numbers are measured, never estimated. If a count came from a sample, it
  says so.


---

# MORNING SUMMARY — night of 2026-08-23/24

**298 filings tested** (178 issuer-targeted, 120 general). 39 commits, all pushed
to `claude/wampo-401k-live-nx1t4o`. Nothing mirrored to `main`; `lib-4i.mjs` and
`PARSER_VERSION` untouched, deliberately — a parser change mid-measurement
destroys the measurement, and the identity-column fix needs a decision that is
not mine to make.

| verdict | n |
|---|---:|
| NAMES_MATCH | 147 |
| ISSUER_DROPPED | 101 |
| WRONG_REGION | 42 |
| FETCH_FAIL / NO_TEXT | 4 |
| PRIOR_YEAR_SOURCE / OCR_SOURCE *(tester artefacts, now separated)* | 4 |

**1,209 individual holdings** had their manager recovered from the column the
parser discards — Vanguard 283, Fidelity 145 across four legal-entity spellings,
American Funds/Capital Group 87, State Street 52, JPMorgan 51, BlackRock 27.
Those are the largest and most identifiable houses in the universe, which is why
this defect and the ticker-coverage work are the same problem.

## Shipped — five display fixes, one family

Every one is the page asserting more than the filing supports. All display-only,
all smoke-tested.

1. **Employer Match card quoted paragraphs that are not the match.** 8,704
   lineups had a quote with no extracted formula; 4,350 of those quotes contain
   no digit at all, and a match formula cannot be stated without a number.
   12,772 suppressed, 39,742 kept.
2. **The holdings table never said what share of the plan it covered.** 8,026
   plans display <95% of Schedule H assets — **$152B in the plan and not on the
   page** — and 1,476 display *more* than the plan owns, $31B. `coverageRatio`
   was computed and stored all along, used only to compare pipeline runs.
3. **That comparison used a rounded total.** The boot payload ships assets in
   $100k units; on a small plan the rounding alone crosses a band. Now requires
   the exact filed figure or renders nothing.
4. **Fee card divided plan-level expense per participant.** Schedule H reports
   what left plan assets, not whose money it was. LNC's $182,511 was paid by
   forfeitures of exactly $182,511 — no participant balance was touched.
5. **Multiple-employer plans were shown one employer's terms as everyone's.**
   218 MEP/PEP plans, 108 carrying an asserted match, vesting or eligibility.

## The inventory gained a category

`docs/wampo-gap-inventory.md` began as omissions — filings carry it, wampo does
not show it. It now has three, in increasing severity:

- **omissions** — the filing carries it, wampo does not show it
- **fabrications** — wampo shows a value not in the filing: a **$105M holding
  that is the exact sum of four insurers' contracts** and reconciles to the
  lineup total; **ZIP codes as dollar values** ($4.70B of postcode in a $10.66B
  lineup); a derivative liability summed as an asset; prior-year columns
- **contradictions** — wampo asserting what the filing denies, on filings that
  parsed successfully. This is where all five fixes above came from, and it was
  not a category anyone was looking at 24 hours ago.

**`audit-data.mjs` passes every fabrication above**, because summing four real
contracts produces a real total and a ZIP-code row sits inside a plausible
lineup. The existing audit machinery is structurally blind to this class.

## Four corrections to my own work — read these first

The night's most useful output was catching my own instruments, not the parser.

1. **Sampling frame decided the answer.** An assets-ranked queue gave 46% where
   a random sample gave 85%, because large plans fail a different way. I nearly
   reported the first as the rate.
2. **`"institutional"` was in the manager vocabulary** (from a registrant named
   INSTITUTIONAL FIDUCIARY TRUST) and passed a check written to reject it —
   third instance of that shape after `"t"` and `"bond fund"`. It also inflated
   `mgrShare`, biasing the worklist *against* finding the defect it was built to
   find.
3. **Three tester artefacts inflated WRONG_REGION** — prior-year entries, OCR
   entries, and parser residue glued into stored names. Up to 9 of the 19
   WRONG_REGION verdicts reported early in the night were not defects.
4. **I had the column letter wrong all night.** It is **(b)**, not (a); (a) is
   the party-in-interest asterisk column. Verified by measuring header
   positions, not taken on report. Substance unchanged, but I was calling two
   different defects by the same name.

## Waiting on you

1. **Promote `filing-batch.mjs` into a pipeline check?** It asks the one
   question no pipeline stage asks — *does this stored value appear in the
   filing at all* — which is exactly the fabrication class the audit cannot see.
2. **Do the free ingest columns go first?** Sch H **4a** (delinquent participant
   contributions — the employer held deferrals past the deadline), **4d**
   (prohibited transactions), **4e** (fidelity bond), and Part III **3a–3c**
   (auditor name/EIN, opinion type, the §103(a)(3)(C) limited-scope election)
   are structured columns in files the pipeline **already downloads**.
   `build-data.mjs` reads only the money columns. No parsing, no
   PARSER_VERSION bump.
3. **The identity-column fix cannot be blind.** Sanofi's names are already
   complete because there the name is in (b) and (c) says only "Common Trust";
   Gen II Management has both patterns on adjacent lines of one table. The
   columns must be joined by judgement, not by rule.

## Operational notes

- The dedicated agent died twice on transient `529 Overloaded`. Its report
  numbering has a gap where that happened; the gap is the outage, not idle time.
- Trigger chains multiplied overnight — a one-shot `send_later` chain re-arms
  itself, so arming "just in case" permanently doubles it, and
  `list_triggers`/`update_trigger`/`delete_trigger` all need an approval nobody
  was awake to give. `docs/cadence-state.json` now gates arming.
- `sec-funds.json` is committed to the repo; it was on a `/tmp` path that would
  not have survived a container recycle, and the failure would have looked like
  "no results" rather than "broken".

---

## (10 fund report) #1 — ADDENDUM, after owner review

The owner corrected three of my classifications and asked for examples. Two of
the corrections were right and one of them found a defect far larger than
anything the ticker machine has fixed.

### THE BIG ONE — the parser is throwing away the "Identity of Issuer" column

I classified `500 Index Fund` (3,186 holdings, $19.7B) as "names no manager —
correctly refused". The owner pushed back: a 500 index fund belongs to some
institution. He was right, and the manager is **in the filing**.

The canonical Form 5500 Schedule H line 4i layout has the manager in column
**(a)** and the product in column **(b)**:

```
 (a) Identity of Issuer, Borrower,   (b) Description of Investment,
     Lessor, or Similar Party            Including Maturity Date, Rate...     Current Value
     Dodge & Cox                         Income Fund Class X                    73,185,362
 *   Fidelity                            Balanced Fund Class K                 406,583,845
 *   Fidelity                            500 Index Fund                        903,147,541
     Vanguard                            Target Retirement 2040 Fund Inst.     265,618,388
```

`scripts/lib-4i.mjs` reads column (b) and **discards column (a)**. What wampo
stored for that plan (ack `20250910130052NAL0013182099001`, 35 rows):

```
 $903M  500 Index Fund                              <- Fidelity, dropped
 $327M  Target Retirement 2050 Fund Institutional    <- Vanguard, dropped
 $407M  Balanced Fund Class K                        <- Fidelity, dropped
 $398M  Large Cap Growth Institutional               <- issuer dropped
```

Every row in that plan lost its manager, so every row is unidentifiable, so the
plan shows **no tickers at all** — while the filing names the manager on every
single line. The project memory says "description column usually holds the fund
name", and for many recordkeeper layouts that is true; for the **standard**
layout it is wrong, and the standard layout is common.

**Verified by hand, 3 filings of 3:**

| ack | issuers present in column (a), all discarded |
|---|---|
| `20250910130052NAL0013182099001` | Fidelity, Vanguard, Dodge & Cox |
| `20251015163940NAL0005444321001` | Fidelity, JP Morgan, Morgan Stanley, Neuberger Berman, TCW Group |
| `20251015155423NAL0002702403001` | Fidelity (whole menu) |

**Scale, measured across the universe.** Signature: a lineup with ≥8 fund rows
where ≤15% of rows name any manager — a genuinely terse filing has a few such
rows, a dropped column (a) loses the manager on every row at once.

```
lineups with >=8 fund rows:                     56,328   (1,539,198 rows)
  where <=15% of rows name a manager:            6,098   (10.8% of lineups)
  rows in them:                                154,917   (10.1% of all fund rows)
  assets in them:                             $1,019B
```

Three sampled at random from that set were all the same cause. I have not
verified all 6,098, so treat $1.02T as the size of the *candidate set*, not a
proven count — but the mechanism is confirmed and the sample is 3/3.

**Why this outranks everything else on the list:** it is the largest single
source of the 520,794 "names no manager" rows, and those rows are the reason
coverage on identifiable rows sits at 65.5% instead of higher. It also
retroactively explains why lineup-context inference looked attractive — the
context was not missing from the filing, it was missing from our parse.

**This also kills the inference idea for good.** There is no need to guess a
plan's manager from its other holdings when the filing states the issuer on
every row. Fix the parse, do not infer.

Next parser cycle: keep column (a), join it to column (b), and re-parse.
Requires a PARSER_VERSION bump. Gate the change on the 19 live specimens plus
these three.

### CUSIP — I was wrong to call this junk

I filed `CUSIP:` ($81.0B, 29 holdings) as "column header parsed as a holding".
The owner pointed out CUSIP is a real security identifier that can be looked up.
He is right about what it is; what the filing actually shows (ack
`20251013091841NAL0001583216001`, a Northern Trust trustee statement) is that
each security carries an identifier on a **continuation line**:

```
 CARVANA CO SR SECD NT 9% CASH INT 144A 14% 06-01-2031   149,108.000   253,840.06   178,774.89
 SEDOL: BMTYZ89
 DEFAULTED MAGNETATION LLC/FIXED 0% DUE 12-31-2040       374,000.000   410,326.87         3.74
 CUSIP: 559417AA8
```

So there are two separate facts, and I collapsed them into one wrong statement:

1. **A defect**: the parser emits the `CUSIP:`/`SEDOL:` continuation line as its
   own holding row and gives it a value. That part stands.
2. **An opportunity I missed**: filings *do* carry CUSIPs and SEDOLs, and a
   CUSIP identifies a fund far more reliably than a recordkeeper's spelling of
   its name. Recorded as a research item — the blocker is a CUSIP→ticker
   mapping source, which the SEC series/class file does not provide.

Note the context: these particular CUSIPs sit on individual securities inside a
trustee statement (Carvana bonds, Shopify), which is also the wrong region — the
same trustee-statement class as `CORPORATE STOCKS - COMMON`. Both come from
security-level detail pages being parsed as a fund menu.

### "VALUE OF INTEREST IN" — the example the owner asked for

ack `20251014143400NAL0006349954001`. The $21.1B row is a fragment of the
**Schedule D Part I** form label, not a holding. The page reads:

```
a Name of MTIA, CCT, PSA, or 103-12 IE:  JP MORGAN EQUITY FOCUSED COMMINGLED
b Name of sponsor of entity listed in (a): JPMORGAN CHASE BANK, N.A.
c EIN-PN 13-4179575-001   d Entity code 1C
e Dollar value of interest in MTIA, CCT, PSA, or 103-12 IE at end of year   27,922,302
```

The parser scored a **Schedule D** page as a 4i region and turned the printed
label "Dollar value of interest in..." into a fund name.

Worth noting for the owner's "collective trusts are private and hard to find"
point: this page is where the trust NAMES live — JP MORGAN EQUITY FOCUSED
COMMINGLED, ROBECO EMERGING MKT EQUITIES CIT, PRUDENTIAL EMERGING MKT BLEND
DEBT — each with a sponsor, an EIN and a dollar value. Schedule D Part I is
already used to link master trusts; it is not yet used as a **lineup source for
CIT-heavy plans**. That is a real answer to the CIT problem and it is filed
public data.

### "Various" — the example the owner asked for

ack `20251015171731NAL0002804531001`:

```
 (A) Identity of issue              (B) Description of investment        Current Value
 *   Participant Loans                  Participant Loans                  115,142,476
     TIAA CREF                          REGISTERED INVESTMENT COMPANY          771,915
     TIAA CREF                          General Insurance Contracts            252,223
     Interest Held in Master Trust      Various (includes Registered      9,659,350,978
                                          Investment Companies, Self
                                            Directed Brokerage, etc.)
     TOTAL                                                              9,775,517,592
```

"Various (includes Registered Investment Companies, Self Directed Brokerage,
etc.)" is the **description** for the row whose identity is *"Interest Held in
Master Trust"*. Same defect as above from the other direction: here the parser
took column (B) when the meaning is in column (A). The honest display for this
plan is "$9.66B held in a master trust", not a fund.

### Corrections accepted, no argument

- **Corporate stocks** are not 401(k) lineup investment choices — correct. They
  are trustee-statement innards. They should never appear as menu rows.
- **`At fair value`** is not a fund — confirmed by the Comcast specimen above.
- **`Common collective trusts` / `COMMON/COLLECTIVE TRUSTS` / `Collective
  Investment Fund` (#2, #3, #6, #10)** are one item, not four: unnamed
  collective-trust aggregates. Counted once from here on.
- **Collective trusts and CIFs are private and hard to identify** — agreed, and
  parked. The Schedule D finding above is the first real lead on it.

### Revised scoreboard for batch #1

Deduplicating the collective-trust rows into one item, the 10 names were really
**6 distinct problems**, and not one of them is a ticker-coverage problem:

| Problem | Rows | What it actually is |
|---|---:|---|
| issuer column discarded | ~154,917 candidate | **parser** — the big one |
| trustee-statement detail parsed as a menu | 36 | parser (CUSIP:, CORPORATE STOCKS) |
| Schedule D page parsed as 4i | 1 | parser |
| financial-statement line parsed as a holding | 6 | parser (Comcast, also wrong year column) |
| master-trust row read from the description column | 7 | parser |
| unnamed collective-trust aggregates | 72 | genuinely unidentifiable; Schedule D is the lead |


---

## Machine state (updated every cycle)

**Coverage, 2026-08-24:** 627,593 of 1,542,984 fund-like holdings resolve
(**40.7%**). A further ~92k rows are excluded because no ticker exists for them
(participant loans, employer stock, stable value/GIC, brokerage windows, cash,
managed-account aggregates). Measured on rows that **name a manager**, coverage
is **65.5%**.

**The three resolvers, in the order they run:**

| Component | What it does | State |
|---|---|---|
| `fund-er.js` `FUND_TICKER` | curated exact patterns for retail funds | working |
| `fund-er.js` `FUND_COMPARABLE` | curated comparables for collective trusts | working; wrapper-gated |
| `scripts/match-sec-tickers.mjs` | SEC series/class lookup, the general case | working; five gates |

**Standing checks before anything ships:**
1. `scripts/ticker-precision.mjs` — stratified sample by match reason. Found
   every precision defect so far. Nothing ships without it.
2. `scripts/ticker-sweep.mjs --comparable` — every comparable group read for a
   name from a different manager or strategy.
3. **Does the fund still exist?** Every proposed ticker checked against the SEC
   series/class snapshot. Local, primary-source, no network. This caught three
   dead tickers in one batch.
4. `scripts/smoke-test.mjs` — the site still renders honestly.

---

## (10 fund report) #1 — 2026-08-24

**Batch:** the 10 highest-value unresolved filed names in the universe.

**Headline: 0 of 10 are resolvable, and 7 of them are not funds at all.** The
top of the "unmatched funds" list is not a ticker-coverage problem. It is the
parser emitting 4i category headings, financial-statement lines and subtotals
as if they were holdings, with billions attached.

| # | Filed name | Holdings | Assets | Result | Why |
|---|---|---:|---:|---|---|
| 1 | `CUSIP:` | 29 | $81.0B | **not a fund** | column header parsed as a holding |
| 2 | `COMMON/COLLECTIVE TRUSTS` | 12 | $60.8B | **not a fund** | 4i asset-category heading |
| 3 | `Collective Investment Fund (1)` | 2 | $36.4B | not found | a real holding, but the filing never names the trust |
| 4 | `CORPORATE STOCKS - COMMON` | 7 | $29.2B | **not a fund** | 4i asset-category heading |
| 5 | `At fair value` | 6 | $24.1B | **not a fund** | financial-statement line (see specimen below) |
| 6 | `Common collective trusts` | 15 | $22.7B | **not a fund** | 4i asset-category heading |
| 7 | `------------------- VALUE OF INTEREST IN` | 1 | $21.1B | **not a fund** | dot-leader fragment |
| 8 | `500 Index Fund` | 3,186 | $19.7B | not found | a real fund row that names no manager — correctly refused |
| 9 | `Various (includes Registered` | 7 | $18.2B | **not a fund** | truncated table cell |
| 10 | `Collective Investment Fund` | 43 | $16.9B | not found | as #3 — unnamed trust |

### These rows are not a rounding error — on several plans they ARE the lineup

| Filed name | Largest single row | Share of that plan's whole displayed lineup |
|---|---:|---:|
| `CUSIP:` | $8.7B | **100%** of a 19-row lineup |
| `Various (includes Registered` | $9.7B | **100%** of a 9-row lineup |
| `At fair value` | $16.3B | **91%** of a 6-row lineup |
| `------------------- VALUE OF INTEREST IN` | $21.1B | 72% of an 80-row lineup |
| `Collective Investment Fund (1)` | $36.4B | 65% of an 80-row lineup |
| `COMMON/COLLECTIVE TRUSTS` + `CORPORATE STOCKS - COMMON` | $25.6B + $19.0B | **84%** of the *same* 12-row lineup |

Every percentage-of-plan figure shown on those plans' pages is computed against
a total that is mostly one junk row.

### Specimen, verified by hand against the filing

`At fair value`, $16.3B — ack `20251007174512NAL0008660608001`, **Comcast**.
Pulled the PDF and read it. The row comes from page text:

```
STATEMENTS OF NET ASSETS AVAILABLE FOR BENEFITS
(in thousands)
                                                          2024           2023
ASSETS:
  Plan interest in Comcast Corporation Employee Savings Plans Master Trust
    participant-directed investments:
      At fair value ...................................  $ 18,674,779 $ 16,286,872
      At contract value ...............................       599,302      679,362
          Total investments ...........................    19,274,081   16,966,234
```

Two separate defects in one row:

1. **Wrong region.** This is the Statement of Net Assets, not a Schedule H line
   4i schedule of assets. The plan's investments sit in a master trust, so it
   may have no 4i of its own — the honest output is "held in a master trust",
   not a six-row lineup.
2. **Wrong column.** $16,286,872k is the **2023** figure. The 2024 column says
   $18,674,779k. The thousands scaling was applied correctly; the column choice
   was not.

This is the statement-page class that v34/v35/v45 attacked. It is not fully
closed, and the residual is concentrated in the largest plans.

### What this changes about the plan

The ticker machine cannot fix any of #1–#2, #4–#7 or #9. They need
`scripts/lib-4i.mjs` work and a PARSER_VERSION bump. Recorded on the parser
worklist; **not** counted against ticker coverage from here on, because calling
them "unmatched funds" overstates the ticker gap and hides a parser bug.

### Also confirmed working this cycle

- `NT COLLECTIVE S&P500 INDEX FUND-DC-NON LENDING (TIER J)` ($48.4B, 4
  holdings) was #3 on the previous unresolved list and **now resolves** —
  the Northern Trust comparable pattern shipped this cycle reaches it.
- `Russell 1000 Index Non-Lendable Fund` (2 holdings, $15.5B) stays unresolved
  **by design**: it drops the "BlackRock" prefix, so it names no manager. Same
  rule that refuses `TARGET RETIREMENT 2030`.

### Upgrades shipped this cycle

- SEC matcher manager gate rebuilt (was a no-op for every T. Rowe Price
  holding: `"t"` was in the manager vocabulary and the filter compared
  substrings, not tokens).
- Candidates ranked by what they leave **unexplained**, which is what
  distinguishes `Growth Fund of America` from `Growth Portfolio`.
- Year-pinned pass for target-date funds filed shorter than their registered
  name; class markers stripped and reapplied, so R-6 resolves to the R-6
  ticker.
- Pooled comparables for BlackRock BTC, SSGA/State Street, Northern Trust,
  BlackRock Russell, T. Rowe Price Structured Research.

### Broken and fixed this cycle

| What was broken | How it showed | Fix |
|---|---|---|
| `"t"`, `"j"`, `"x"`, `"for"`, `"bond fund"` in the manager vocabulary | gate open for every TRP holding; `High Yield Bd Fund` got a ticker | manager phrases, description-only phrases rejected |
| bucket filter used substring, not token | `hay.includes("t")` is true of nearly every fund name | token-boundary match |
| superset dropped unchecked words | `PIMCO Commodity Real Return` → PRRIX (a TIPS fund) | `ASSET_WORDS` widened to asset class, sector, region |
| sub-adviser read as sponsor | `Dimensional 2015 Target Date` → a **Virtus** fund | manager keys = registrant + series **lead**, never mid-name |
| unexplained filed tokens ignored | `VANGUARD MIDCAP INDEX INSTL` → VINIX (an S&P 500 fund) | leftover tokens must be class markers or a named house |
| three comparables named **dead funds** | BSPIX, MAIIX, BRGNX absent from the SEC snapshot | replaced with WFSPX / EFA / IWB; ERs left null |
| trust abbreviated `"Tr"` not detected | `T. ROWE PRICE RETIREMENT 2050 TR-K` shown as the mutual fund, **no asterisk** | trailing-anchor pattern; 166 holdings corrected, 0 misfires |
| CIT-only pattern returned `comparable: false` | `BlackRock Equity Index F` → WFSPX with no asterisk | always-comparable flag |
| third-party wrappers took the sub-adviser's fund | `LVIP SSGA S&P 500` → SSGA's 0.02% ER on a Lincoln account | wrapper gate, on the **raw** name |
| wrapper gate silently did nothing (first attempt) | it lived in each pattern, but `expandFundName` rewrites `"MM"` | one up-front gate, raw name only |

---

## (10 fund report) #2 — 2026-08-24

**Running count of the column-(a) defect, hand-verified:**

| | filings |
|---|---:|
| **CONFIRMED** issuer column present in the 4i table and discarded | **1** |
| **DISPROVED** — filing read, no column (a) to drop | **6** |
| **PARTIAL** — some rows carry an issuer, most do not | **1** |
| hand-read this cycle | 8 |

The mechanical batch is `scripts/filing-batch.mjs`; verdicts land in
`docs/filing-tests.jsonl`. Every verdict below was re-checked against the
filing text before being believed. Two of them did not survive that check.

### Batch: 10 filings from the top of the all-signals worklist — 10/10 NAMES_MATCH

Acks `20251010143418…`, `20251015131942…`, `20251001104049…`,
`20241011170433…`, `20260714103132…`, `20251009140011…`, `20251009130556…`,
`20251013230937…`, `20260126143510…`, `20250714153130…` ($1.3B–$4.0B).
Zero ISSUER_DROPPED at the very top of the suspicion queue.

That result is not the reassurance it looks like, for a reason worth writing
down: **NAMES_MATCH only means the stored strings occur somewhere in the PDF.**
It does not mean they came from Schedule H line 4i. The next section is a
filing that scores NAMES_MATCH and whose entire lineup is fabricated from a
footnote table.

### NEW DEFECT CLASS — the fair-value hierarchy table parsed as a fund menu

`20251010150034NAL0004732579001` — **Morgan Stanley 401(k) Plan**, stored as a
confident 10-row, **$21.64B** lineup. Every row is a line of the Level 1/2/3
fair-value table in Note 4, not a holding:

```
                                    Level 1             Level 2            Level 3            Total
Investment Assets:
Registered Investment Companies      78,829,907                 -                -          78,829,907
Separately Managed Accounts
   Corporate equities             6,134,331,011                 -          237,475       6,134,568,486
   Cash and cash equivalents          3,329,031         4,294,246                -           7,623,277
   Government and agency securities
     U.S. Treasury and agency…     869,592,096       284,877,550                -       1,154,469,646
     Other sovereign government…      8,643,551         1,487,796                -          10,131,347
   Corporate debt instruments                -       171,927,434                -         171,927,434
   Derivative instruments           18,583,234         8,496,358                -          27,079,592
   Repurchase agreements                     -       570,000,000                -         570,000,000
Collective Trust Funds *                                                                13,434,874,093
Participant-directed investments                                                        21,589,503,782
Investment Liabilities:
   Derivative instruments           19,256,791         3,746,779                -          23,003,570
Participant-directed investments    19,256,791         3,746,779                -          23,003,570
```

Compare wampo's stored lineup, row for row: `Collective Trust Funds`
$13,434,874,093 · `Corporate equities` $6,134,568,486 · `Government and agency
securities` $1,154,469,646 · `Repurchase agreements` $570,000,000 ·
`Corporate debt instruments` $171,927,434 · `Registered Investment Companies`
$78,829,907 · `Derivative instruments` $50,083,162 · `Participant-directed
investments` $23,003,570 · `Other sovereign government obligations`
$10,131,347 · `Cash and cash equivalents` $7,623,277.

Three separate errors compound here:

1. **Not a menu.** These are asset classes. No participant can choose
   "Repurchase agreements". Not one row is identifiable as a fund.
2. **A liability counted as an asset.** Stored `Derivative instruments` is
   **$50,083,162** — which is asset derivatives $27,079,592 **plus liability
   derivatives $23,003,570**. The liability is then *also* stored a second time
   as `Participant-directed investments` $23,003,570.
3. **Stated total is wrong.** Stored rows sum to **$21,635,510,922**; the
   filing's participant-directed investments are **$21,589,503,782**. wampo
   overstates the plan by **$46,007,140**, exactly twice the liability line.

**Why the parser never saw the real schedule.** The filing *has* a 4i schedule
— the index says so, "Form 5500, Schedule H, Line 4i — Schedule of Assets
(Held at End of Year) at December 31, 2024 … 19–63". Forty-five pages of it.
Under `pdftotext -layout` those pages yield **only their page numbers**:

```
- 27 -
- 28 -
- 29 -
```

They are images inside an otherwise-textual PDF. Rasterising PDF page 55 at
200dpi and OCRing it returns the schedule immediately:

```
FORM 5500, SCHEDULE H, LINE 4i—
SCHEDULE OF ASSETS (HELD AT END OF YEAR)
      (a) Identity of Issuer     (b) Description of Investment    Cost**    Current Value
      Kenvue Inc Com             1,620,655 Shares of Common Stock          34,600,984
      Kimberly-Clark Corp Com      148,852 Shares of Common Stock          19,505,566
      Kinder Morgan Inc Del Com    145,300 Shares of Common Stock           3,981,220
```

The stored entry carries `ocr: 0`. **OCR never fired because a readable wrong
region satisfied the parser first.** That is the mechanism, and it is general:
OCR is gated on finding *no* section, so any filing that pairs an unreadable 4i
with a readable footnote table gets a confident fabricated lineup instead of an
honest gap. This class cannot be found by looking for low confidence — by
construction it is confident.

### Region audit of the rest of the batch-1 acks

Where do stored names actually live in the filing? (`4i` = inside a Schedule H
line 4i region, `STMT` = Statement of Net Assets, `?` = neither.)

| ack | rows | region of stored names |
|---|---:|---|
| `20251014161215NAL0003254097001` | 25 | 4i=16, notes=1 — genuine |
| `20251013172855NAL0000860659001` | 9 | **STMT=7, Sched D=1, Changes=1 — zero from 4i** |
| `20251013091841NAL0001583216001` | 19 | ?=15 (Northern Trust security detail, the CUSIP class from #1) |
| `20251014103917NAL0001230179001` | 9 | 4i=4, STMT=1, Changes=1 — mixed |
| `20251010144546NAL0018281538001` | 17 | ?=9 |

`20251013172855NAL0000860659001` ($12.21B, 9 rows) is a second confirmed
statement-page lineup: **nine of nine** stored names trace to the Statement of
Net Assets, Schedule D or the Statement of Changes. None to a 4i schedule.

---

## (10 fund report) #3 — 2026-08-24

**Batch:** 10 filings from `docs/filing-worklist-issuer.json`, built with
`--mode issuer`, which keeps *only* the low-manager-share signal and excludes
the dominance and furniture signals. 2,873 filings, $0.42T. This is the
population the $1.02T column-(a) candidate set is drawn from, with the
statement-page cases deliberately filtered out.

| verdict | n |
|---|---:|
| NAMES_MATCH | 3 |
| WRONG_REGION | 2 |
| ISSUER_DROPPED | 2 |
| FETCH_FAIL | 2 |
| NO_TEXT | 1 |

**After hand-checking every one of them, the true tally is different:**
1 confirmed column-(a) case (which the classifier called NAMES_MATCH), 0 of the
2 ISSUER_DROPPED verdicts survived, 1 of the 2 WRONG_REGION verdicts was wrong,
and the NO_TEXT was a download failure, not a filing property.

### CONFIRMED — the column-(a) defect, 29 rows of 29

`20260622163704NAL0006526769001` — **HP INC. 401(K) PLAN**, PN 004, plan year
2025, $10.77B stored. The classifier scored this **NAMES_MATCH**. It is the
cleanest confirmation of the defect found so far. The filing:

```
 * BlackRock                     Russell 1000 Index Fund F              2,308,933,976
   SEI Trust Company             US Large Cap Equity Fund               2,051,603,120
   SEI Trust Company             International Equity Fund                477,342,952
   SEI Trust Company             1965 Birth Date Fund                     464,342,949
 * BlackRock                     Russell 2500 Index Fund F                446,080,100
 * Vanguard                      Federal Money Market Fund          $     416,616,883
 * BlackRock                     MSCI ACWI EX-US Index Fund F             254,763,205
 * BlackRock                     US Debt Index Fund F               $     180,464,082
```

What wampo stored: `Russell 1000 Index Fund F`, `US Large Cap Equity Fund`,
`International Equity Fund`, `1965 Birth Date Fund`, `Russell 2500 Index Fund
F`, `Federal Money Market Fund`, `MSCI ACWI EX-US Index Fund F`, `US Debt Index
Fund F`. Every manager discarded.

Measured over the whole entry: **29 of 30 stored names appear on a line inside
the 4i region, and all 29 of those carry left-column text** —
`SEI Trust Company` ×22, `BlackRock` ×4, `Fidelity` ×1, `Vanguard` ×1,
`Dreyfus` ×1. There is no ambiguity and no alternative reading.

This retroactively corrects a line in project memory. `Russell 1000 Index
Non-Lendable Fund` was recorded as "stays unresolved **by design** — it drops
the BlackRock prefix, so it names no manager". The prefix is not dropped by the
filer. It is dropped by us.

Also in this entry, one junk row: `instructions) BUILDING #2, SUITE 100`,
$334,110 — a Schedule D form label glued to a street address.

### DISPROVED ×2 — a Schedule C fee page parsed as a 4i schedule, with ZIP CODES as dollar values

Both ISSUER_DROPPED verdicts named the same "issuer": `INSTITUTIONAL`. Neither
is a dropped issuer. Both are something worse.

`20251014143617NAL0003173265001` — **Delta 401(k) Retirement Plan for Pilots**,
stored confident, 31 rows, **$10.70B**. The stored rows read:

```
   3,061,946,038   INC.
   2,898,903,943   OPERATIONS COMPANY,
     782,514,321   PORTFOLIO US
     782,514,321   CLASS A US
     782,514,321   AMERICA US
          10,320   THERMOSTAT CL A
          10,022   ITIES C US
```

They come from the **Schedule C Supplemental Report, Part I Line 3 —
Information on Service Providers Receiving Indirect Fees**:

```
SERVICE                   SERVICE CODE    AMOUNT OF      NAME OF SOURCE       EIN/ADDRESS OF
PROVIDER NAME             Part I,Line 3(b) INDIRECT      OF INDIRECT          SOURCE OF INDIRECT
FIDELITY INVESTMENTS           60             $0         BLACKROCK            40 EAST 52ND ST
INSTITUTIONAL                                            TECHNOLOGYOPPORTUN   NEW YORK NY
OPERATIONS COMPANY,                                      ITIES C              US 10022
LLC.
```

- `INSTITUTIONAL` and `OPERATIONS COMPANY,` are **wrapped fragments of the
  service provider's name**, "FIDELITY INVESTMENTS INSTITUTIONAL OPERATIONS
  COMPANY, LLC." — column (a) of a fee table, not an issuer.
- `ITIES C US` is the tail of "BLACKROCK TECHNOLOGY OPPORTUNITIES C", broken
  mid-word by the column width.
- **`10,022` is BlackRock's ZIP code** (40 East 52nd St, New York NY 10022),
  stored as a dollar value.

The largest rows are the same error at scale:

```
FIDELITY INVESTMENTS           60             $0         AMERICAN INC FD OF   3500 WISEMAN BLVD    $18.00
INSTITUTIONAL                                            AMERICA CLA         SAN ANTONIO TX
OPERATIONS COMPANY,                                                          US 782514321
```

`782514321` is **ZIP+4 78251-4321**, American Funds' San Antonio service
address, printed without the hyphen. wampo stores it as **$782,514,321** —
six separate times, once per wrapped row, for **$4.70B of pure ZIP code**.

`20251014143425NAL0004243664001` — the sister Delta plan, 35 rows, **$9.72B** —
is the identical failure with the identical values (`782,514,321` ×4,
`10,320` ×22, `10,022` ×2).

Both entries' `source` field reads *"Schedule H line 4i attachment from the
plan's 2023 filing"*. The provenance we display is wrong as well as the data.

**This is a new defect class, not one of the four verdicts.** Call it
`SCHEDULE_C_FEE_PAGE`. It has a signature no existing check catches: many rows
sharing one identical value, and values in the 10,000–99,999 band that are
US ZIP codes. Two plans, $20.4B, found in a batch of ten.

### DISPROVED ×4 — real 4i regions with no column (a) to drop

Each read by hand; each has a specific reason.

**`20251002123423NAL0000783584001` — EXXONMOBIL SAVINGS PLAN, $23.45B.**
Header is the canonical one, but the layout is a bond schedule: column (a) *is*
the name we store and column (b) is coupon/maturity.

```
(a)                   (b)                                  (c)        (d)      (e)
              IDENTITY OF ISSUE            DESCRIPTION OF INVESTMENT   COST   CURRENT
                                          coupon     maturity  par/units       ($000's)
      FEDERAL FARM CREDIT                 5.000 %    01/08/27   12,826          12,827
      FANNIE MAE                          4.920 %    10/22/27   50,000          49,900
```

Thousands scaling is applied correctly ($23.45B stored against `TOTAL ASSETS
HELD 23,541,037` in $000s). **One junk row though**, and it is a clean new
specimen: stored `FOR THE YEAR ENDED`, value **$2,024,000**. Source:

```
                   STATEMENT OF CHANGES IN NET ASSETS AVAILABLE FOR BENEFITS
                                    FOR THE YEAR ENDED 2024
                                        (millions of dollars)
```

A date header became a holding and **the year 2024 became its value**, then got
thousands-scaled to $2,024,000.

**`20251008165336NAL0014306450001` — AT&T SAVINGS PLAN MASTER TRUST, $42.66B.**
Left column is a CUSIP, not an issuer:

```
                    Security ID     Security Description        Shares      Cost    Market Value   Unrealized Gain/Loss
TEAF20300002        996032397       LOANS TO PARTICIPANTS…  620,687,369.96  620,687,369.98  620,687,369.98   0.00
TEAF87000002        999D34418       SELF DIRECTED ACCOUNT VALUE  3,243,308,024.95  …
```

The classifier called this WRONG_REGION on "0/12 stored names appear in the
filing text". **That verdict is false**: 23 of 26 stored names are inside the
4i region. The classifier missed them because its "value to the right" test
requires the number to end the line, and this layout has three more columns
after it. WRONG_REGION over-fires on gain-last layouts.

**`20251013164803NAL0001619809001` — CHARTER COMMUNICATIONS, INC. DEFINED
CONTRIBUTION PLANS MASTER TRUST, $9.98B, 80 rows.** Shares-first layout, so the
text to the left of every name is a share count:

```
 Face Amount or
Number of Shares Security Description                            Current value**
       1,053,755 FID BANK TRST ST INV FUND                             1,060,733
         282,979 8X8 INC                                                 756,062
```

74 of 80 names have left-column text and it is numeric every time. No issuer
column exists. (Separately: this is another security-detail flood — `8X8 INC`,
`1 800 FLOWERS.COM INC CL A` are not menu options.)

**`20251010150034NAL0004732579001` — Morgan Stanley**, covered in report #2:
the 4i pages are images, so there is no column (a) in the text to drop.

### PARTIAL ×1

**`20251014151025NAL0001561267001` — THE CIGNA GROUP 401(K) PLAN, $13.35B, 80
rows.** 74 stored names sit in the 4i region; **6** carry an issuer:

```
*PRIAC   LARGE CAP BLEND FUND              Account            $   827,253
*PRIAC   ALL WORLD EX-US STOCK INDEX FUND  Separate Account   $ 1,888,244
```

`PRIAC` ×4 and `Cigna` ×1 are dropped; the other 68 rows genuinely name no
issuer. Also visible: `*PRIAC  FUND  Separate Account  $1,709,292` — the stored
name is the bare word `FUND`, the rest of it lost to a line wrap.

### The tester is not reliable on NO_TEXT or FETCH_FAIL

`20251013090403NAL0002149570001` was scored **NO_TEXT** (`chars < 4000`). Re-
fetched by hand it is a **496-page PDF yielding 2,254,466 characters** of
extractable text. The two FETCH_FAILs (`20250821152449NAL0004385233001`,
`20251010120735NAL0008123201001`) print `I/O Error: Couldn't open file` — the
`curl -sS --max-time 120` in the batch has no retry and large filings exceed it.
**3 of 10 verdicts in this batch were transport artefacts.** They should be
re-queued, not counted.

### What this batch changes

1. **The column-(a) defect is real and it is not what the suspicion score
   finds.** Confirmed 1 of 8 filings hand-read; the confirmed one was scored
   NAMES_MATCH, and *both* filings the classifier scored ISSUER_DROPPED were
   something else. Present classifier accuracy on this defect, measured on this
   batch: 0 of 2 positives correct, 1 false negative. The $1.02T candidate set
   is still a candidate set and this cycle did not narrow it — but it did show
   that the low-manager-share signature is reached by at least four distinct
   mechanisms (bond schedules, shares-first layouts, CUSIP-left trustee
   statements, image-only 4i pages), so a large part of that $1.02T is almost
   certainly not column-(a).
2. **A new defect class with a testable signature:** Schedule C fee pages
   parsed as 4i, ZIP codes as dollar values. $20.4B across two Delta plans in
   one batch of ten. Detection rule to propose: reject a lineup where ≥3 rows
   share one identical value, or where a value is a valid US ZIP or ZIP+4 and
   the row name is a fragment.
3. **OCR's gate is the wrong way round.** Morgan Stanley proves a readable
   wrong region suppresses OCR of an unreadable right one. The audit cannot see
   this because the result is confident.

---

## (10 fund report) #4 — 2026-08-24

**Running count of the column-(a) defect, hand-verified (cumulative):**

| | filings |
|---|---:|
| **CONFIRMED** issuer column present in the 4i table and discarded | **4** |
| **DISPROVED** — filing read, no column (a) to drop | **12** |
| **PARTIAL** — a minority of rows carry a discarded issuer | **2** |
| hand-read to date | 18 |

**Batch:** 10 filings from `docs/filing-worklist-issuer.json` ($3.8B–$8.0B).
Classifier said 8 NAMES_MATCH / 2 ISSUER_DROPPED. After reading all ten:
**3 confirmed** column-(a) cases, one of which the classifier scored
NAMES_MATCH; both its ISSUER_DROPPED verdicts were right this time.

### CONFIRMED ×3

**1. `20251008163343NAL0003432819001` — $5.97B, 27 rows. 23 of 25 rows lose an
issuer.**

```
      Identity of Issue, Borrower,               Rate of Interest, Collateral,        (d)      Current
(a)     Lessor or Similar Party                     Par or Maturity Value            Cost       Value
                                     Registered investment companies
 *   Fidelity Institutional Asset Management   FIAM Index TD 2040 R              **    528,327,474
 *   Fidelity Institutional Asset Management   FIAM Index TD 2035 R              **    457,748,889
     Columbia Contrarian                       Col Contr Large Cap Core          **    285,130,773
     Atlanta Capital                           AC High Qual Smid                 **    123,632,755
     Northern Trust                            NT S&P 500 Index                  **  1,307,164,572
```

Stored: `NT S&P 500 Index` $1,307,164,572 · `FIAM Index TD 2040 R` $528,327,474
· `Col Contr Large Cap Core` $285,130,773. Left column present on every row and
kept on none. Managers lost: Fidelity Institutional Asset Management ×13,
Northern Trust ×4, Columbia Contrarian, Invesco, Atlanta Capital, MFS
Investment, Prudential, Fidelity Management Trust Company.

**2. `20251015163209NAL0002755331001` — $4.55B, 38 rows. 37 of 38.** A Principal
recordkeeper schedule:

```
   *   Principal Life Insurance Company   Prin LargeCap Growth I SA-Z    $  0.00   $274,769,131.84
   *   Principal Life Insurance Company   Prin LgCp S&P 500 Idx SA-NE    $  0.00   $680,074,317.73
```

Stored: `Prin LgCp S&P 500 Idx SA-NE` $680,074,317, issuer gone. Managers lost:
Principal Life Insurance Company ×18, Principal Global Investors Trust Co ×15,
SEI Trust Company ×2, Schwab Funds ×1.

Worth noting this filing carries **two** 4i tables. The auditor's own version
prints the issuer in column (a) and a plain-English description in column (b) —
`Principal Life Insurance Company | Deposits in insurance company Large-Cap
Stock Index Separate Account | $680,074,318`. The parser used the other one.
Either way the issuer was available and discarded.

**3. `20260719202551NAL0010630832001` — $4.58B, 23 rows. 23 of 23.** OCR-derived
entry, values in thousands and scaled correctly:

```
    Identity of issuer, borrower, lessor or similar party    collateral, par or maturity value   Current Value ($)
   State Street Global Advisors Trust Company               U.S. Large Cap Equity Fund - P              902,574
   T. Rowe Price Associates, Inc.                          Large Cap Growth Trust Class D               381,967
   Prudential Trust Company                                     Core Plus Bond Fund                     278,383
   Aristotle Capital Management                              Value Equity Collective Trust              140,580
   MacKay Shields                                       High Yield Collective Investment Trust           35,285
```

Stored: `U.S. Large Cap Equity Fund - P` $902,574,000, `Core Plus Bond Fund`
$278,383,000, `Target Retirement Date 2045` $257,057,000 — a target-date series
with **no manager on any row**, when SSGA is printed beside every one of them.
Managers lost: State Street Global Advisors Trust Company ×13, plus T. Rowe
Price, Prudential Trust, Invesco, Aristotle, Artisan, BlackRock, MacKay
Shields, Earnest Partners.

The classifier scored this **NAMES_MATCH**. The reason is worth recording,
because it caps what the mechanical tester can measure: the tester requires the
left-hand token to be ≤5 words and ≤46 characters and to match the SEC manager
vocabulary. `State Street Global Advisors Trust Company` is six words, and
`Earnest Parners Multiple Investment Trust` is a typo in the filing. **The
ISSUER_DROPPED verdict is a lower bound and always will be.** Only hand-reading
settles a filing.

### DISPROVED ×6 — and one of them is a warning about the fix

**`20251001104613NAL0013099169001` — SANOFI U.S. plans, $8.46B.** 26 of 26
stored names sit in the 4i region and the parser took the **right** column:

```
(a)          (b) Identity of Issue, Borrower,       ( c) Description of        (d)     (e) Current
                 Lessor, or Similar Party                Investment           Cost      Market Value
      *   TROWE PRICE RET HYB 2035 TR T9              Common Trust             **       1,204,024,103
```

Here the fund name is in the **identity** column and the description column
says only `Common Trust`. Stored: `TROWEPRICE RET HYB 2035 TR`. Correct.

**This filing is the argument against a blind fix.** A rule of "join column (a)
to column (b)" would turn this menu into `TROWE PRICE RET HYB 2035 TR T9 Common
Trust`, and a rule of "prefer column (a)" would be right here and wrong on HP
Inc. The layouts are genuinely both ways round; whichever way lib-4i is
changed, this specimen and the HP Inc. specimen have to pass together.
(One junk row here: `Comingle trust` $1,463,803,357, a misspelled category
heading carrying the class subtotal.)

**`20251014085508NAL0005127714001` — $4.97B, 80 rows.** Trustee security detail
(`NVIDIA CORP`, `APPLE INC`, `MICROSOFT CORP`), and the names are truncated —
but **the filer truncates them, not us**, at a fixed 25-character column:

```
MITSUBISHI UFJ FINL SPON        1,013,500        11,878,220
SSGA S&P 500 FLAGSHIP SER       1,003,653     1,600,639,641
```

Stored `SSGA S&P 500 FLAGSHIP SER` is exactly what the filing says. Nothing is
recoverable here by parsing; recorded so nobody re-investigates it.

Also disproved, all with a readable 4i region and no issuer column:
`20251013120611NAL0002786642001` (79/80 in region, 0 with left text),
`20260708100014NAL0035008786001` (19/21, 0), `20251008150655NAL0005738545001`
(69/69, 1 — and that one is the word `Charles` from a wrapped "Charles Schwab").

### The sixth disproved filing is a four-defect specimen worth keeping

**`20251007125615NAL0004795969001` — FRESENIUS MEDICAL CARE NORTH AMERICA
401(k) SAVINGS PLAN, $4.42B, 26 rows.** Not one row comes from a 4i schedule:
14 trace to the Notes, 4 to the Statement of Changes, 2 to the fair-value
table, 1 to the Statement of Net Assets.

*Defect 1 — prose sentence tails as fund names.* Stored: `the S&P 500® Index by
investing in stocks that make up the index.` at **$755,422,355**. The filing:

```
BlackRock Large Cap Blend Index Fund Option - This option invests in the Equity Index Fund F, a collective
investment fund offered by BlackRock Institutional Trust Company N.A., that seeks to match the performance of
the S&P 500® Index by investing in stocks that make up the index.        $   891,265,424   $   755,422,355
```

The real name, `BlackRock Large Cap Blend Index Fund Option`, is two lines
above. We stored the third line of its sentence. Same for `market. The fixed
rate of return resets quarterly.` ($481,663,282), `index.` ($68,601,123),
`investments.` ($59,295,880), `interest.` ($14,348,777).

*Defect 2 — the prior-year column again.* The note's header is:

```
                                                                          2024              2023
```

Stored `Target Retirement 2035 Fund Option` = **$363,732,055**, which is the
**2023** figure; 2024 is $429,670,822. Every target-date row is a year stale.
This is the Comcast wrong-column defect from report #1, now confirmed on a
second, unrelated plan — so it is a class, not a one-off.

*Defect 3 — cash flows stored as investments.* From the Statement of Changes:

```
   Salary deferrals                         $    273,027,902
   Matching                                       80,711,968
   Dividend and interest income                   43,699,611
NET ADDITIONS                                    402,061,084
```

All four are stored as holdings. `NET ADDITIONS` $402,061,084 is a *net change
for the year* being displayed as a $402M fund.

*Defect 4 — form-label fragment.* `I.D. NO. - 04-` at $2,835,488.

### PARTIAL ×1

**`20251205083856NAL0003062993001` — Procter & Gamble Savings Plan, $5.23B, 80
rows.** 78 stored names are in the 4i region; **7** lose an issuer:

```
   Common Collective Trust Funds
         BlackRock(1)     US Debt Index Non-Lendable Fund(2)             361,180,310
         BlackRock(1)     Global Equity Index Fund(2)                    854,661,806
         BlackRock(1)     Blackrock Equity Non-Lending Class(2)        1,706,809,917
```

The remaining 71 rows are company stock and security detail that name no
issuer, so this plan is only fractionally affected.

### Cumulative reading of the evidence

Eighteen filings hand-read. The column-(a) defect is **confirmed on 4** and
when it hits it hits total — 23/25, 37/38, 29/30, 23/23 rows. It is **absent on
12**, for five distinct structural reasons: the name already occupies column
(a) (Sanofi, ExxonMobil), the left column is a share count (Charter), a
security ID (AT&T), or a filer-truncated security name (`20251014085508…`), or
the 4i is unreadable so there is no column at all (Morgan Stanley).

That 4-of-18 rate is on a queue deliberately enriched for the signature, so it
is **not** an estimate of the 6,098-lineup candidate set — but it is the first
measured evidence that the candidate set is a mixture, and the mixture includes
at least three defect classes that are *worse* than a dropped issuer, because
they put money against rows that are not investments at all.
---

## (10 fund report) #5 — 2026-08-24

**Running count of the column-(a) defect, hand-verified (cumulative):**

| | filings |
|---|---:|
| **CONFIRMED** issuer column present in the 4i table and discarded | **10** |
| **DISPROVED** — filing read, no column (a) to drop | **15** |
| **PARTIAL** — a minority of rows carry a discarded issuer | **2** |
| **UNVERIFIABLE** — source filing not in hand | **1** |
| hand-read to date | 28 |

**Batch:** 10 filings from `docs/filing-worklist-issuer.json` ($2.8B–$3.8B).
Classifier: 4 NAMES_MATCH / 3 ISSUER_DROPPED / 3 WRONG_REGION.
After reading all ten: **6 confirmed**. The classifier got 3 of those 6 wrong —
two as WRONG_REGION, one as NAMES_MATCH.

### CONFIRMED ×6

| ack | plan | rows losing an issuer | managers discarded |
|---|---|---:|---|
| `20251009075503NAL0003724867001` | IQVIA 401(K) PLAN | **28 / 28** | Vanguard ×14, Fidelity ×4, Spartan ×4, BNY Mellon, Western Asset, Wilmington Trust |
| `20250918132424NAL0001473457001` | IOWA HEALTH SYSTEM 401(K) | **26 / 28** | JPMorgan ×13, Fidelity ×4, Vanguard ×3, American Funds, Allspring, Meridian |
| `20251009112104NAL0011345952001` | LNC EMPLOYEES' 401(K) | **30 / 31** | State Street Global Advisors Ltd. ×15, Income America ×5, Macquarie ×3, J.P. Morgan, Acadian, MFS, AllianceBernstein, PIMCO |
| `20251009102138NAL0006818097001` | TYSON FOODS RETIREMENT SAVINGS | **22 / 22** | State Street ×15, Invesco ×2, Parnassus, Earnest Partners, GQG International, PIMCO, BlackRock |
| `20251014110009NAL0001255027008` | EVERSOURCE 401K PLAN | **18 / 24** | Fidelity ×14, Vanguard, IR+M |
| `20250926144818NAL0013938530001` | CHS/COMMUNITY HEALTH SYSTEMS | **15 / 15** | Principal Life Insurance Company ×13 |

Evidence, one quote each of the two clearest:

```
IQVIA        Identity of Issue,          Including Maturity Date,          (e)
             Borrower, Lessor or        Rate of Interest, Collateral,     Current
 (a)            Similar Party              Par or Maturity Value           Value
        Mutual Funds
  *      Fidelity        US Bond Index                                    89,137,043
         Vanguard        Equity Income Admiral                            71,945,696
  *      Fidelity        Diversified International Commingled Pool Class A 66,278,033
```
stored → `500 Index Pool` $431,925,864 · `Target Retirement 2035 Trust Plus`
$323,143,643 · `Contrafund Pool` $310,132,868.

```
TYSON                Identity of Issue                    Description     Cost    Current Value
      Collective Investment Trusts
             State Street                            SS TRGT RET 2035 IV    *          313,527 **
             State Street                            SS TRGT RET 2030 IV    *          309,715 **
```
stored → `SS TRGT RET 2035 IV` $313,527,000 (thousands scaled correctly), issuer
gone. Fifteen State Street rows, fifteen anonymous target-date funds.

### The most important finding of this batch: the parser is INCONSISTENT WITHIN ONE TABLE

Two of the six confirmed filings drop the issuer on most rows and drop the
**product** on one — from the very same table.

**Iowa Health System.** The filing:

```
       Identity of Issue,       Description of Investment
      Borrower, Lessor or     Including Maturity Date, Rate of        Current
         Similar Party         Collateral, Par, or Maturity Value      Value
                            Mutual Funds:
 *     Fidelity              500 Index                              298,606,477
       JPMorgan              Large Cap Growth Fund R6               133,073,492
```

Stored: `SmartRetirement 2035 Fund` (JPMorgan dropped) — **and** `Fidelity`
$298,606,477, where the product `500 Index` is what got dropped.

**Eversource.** Same pattern:

```
      (b) Identity of Issuer, Borrower,   (c) Description of Investment Including Maturity Date,   (e) Current
(a)        Lessor or Similar Party          Rate of Interest, Collateral, Par or Maturity Value       Value
      Prudential                          Investment Contract                                        465,481
*     Fidelity                            Growth Company Commingled Pool Class F                      641,630
```

Stored: `Growth Company Commingled Pool Class F` $641,630,000 (issuer dropped)
**and** `Prudential` $465,481,000 (product dropped). Also stored from this
table: `allocated Eversource Energy Common Shares), $5 par` $522,976,000 — the
tail of a wrapped description, complete with its closing parenthesis.

So this is not "lib-4i always reads column (b)". It picks a column per row, and
on short or generic products it picks the other one. Any fix has to be checked
against **both** failure directions, and against the Sanofi specimen from
report #4 where reading the identity column is correct.

### Why the classifier missed two of them

**`20250926144818NAL0013938530001` (CHS) scored WRONG_REGION, "0/12 stored
names appear in the filing text."** The names *are* in the filing. They do not
match because the parser glued the **cost column** onto the end of every name:

```
 *    CHS/Community Health Systems, Inc.   CHS Stable Value Fund Master Trust Inv estment Account   $0.00   $1,138,846,661.16
```

stored name: `"CHS Stable Value Fund Master Trust Inv estment Account $0.00"`.
All 16 rows carry a trailing `$0.00`: `"Ret Target 2035 Sept Acct $0.00"`
$531,249,038, `"Ret Target 2030 Sept Acct $0.00"` $523,449,940, and so on —
**$4.72B of lineup where every name ends in a dollar amount.** That is a
display defect visible to any user, independent of the issuer question. (The
`Inv estment` split is the filer's own; that part is not ours.)

**`20251009102138NAL0006818097001` (Tyson) scored WRONG_REGION for the same
class of reason** — its value column is followed by a `**` footnote marker, so
the tester's "value ends the line" test failed on every row.

WRONG_REGION over-fires whenever the stored name has trailing junk or the value
is not the last thing on the line. Combined with the ISSUER_DROPPED lower bound
noted in report #4, **the mechanical verdicts are a triage queue, not a
measurement.** Every number in these reports comes from reading the filing.

### DISPROVED ×3

- `20251013175103NAL0000880243001` — 21 of 22 names in the 4i region, only one
  with an issuer to its left. Names are already manager-prefixed
  (`NT S&P 500 IDX NL 4`, `NT R1000 GR IDX NL 4`). Not affected.
- `20250930180301NAL0013547008001` and `20250930154556NAL0013461200001` — 78 of
  79 names each inside the 4i region with **zero** left-column text. Single-
  column schedules.

### UNVERIFIABLE ×1 — recorded rather than guessed

`20250731064450NAL0002381251001` — **FIRSTENERGY CORP. SAVINGS PLAN**, 59 rows,
$3.43B. Its stored lineup is made of strategy descriptions, not fund names:

```
   872,225,750   Large cap stocks
   799,229,580   Blend of stocks, fixed income
   226,152,423   International stocks
   173,820,730   Equities, fixed income
   147,946,737   Balanced fund
   138,156,056   stocks
    63,499,878   Small cap value stocks
```

That is exactly what a discarded column (a) looks like when column (b) holds a
strategy phrase — but **I could not confirm it**, and the reason is specific:
the entry's source is `"Schedule H line 4i attachment from the plan's 2023
filing — the newest filing's public copy has no readable schedule"`, the 2024
filing I can fetch contains neither the string `large cap stocks` (0 hits in
664,763 characters) nor any `Identity of Issue` header, and the 2023 filing's
ack is not derivable from anything in the repo. Left as a hypothesis with a
named blocker: **needs the prior-year ack, which lives in the pipeline-only
`fallbacks.json` artifact.**

Separately and regardless of the issuer question, this plan's published lineup
includes `Cash Equivalent - 4.38%, 2024`, `Mortgage - 4.00%, 2052`,
`US 2YR NOTE (CBT) FUT MAR24` and `UMBS 30YR` — bond and futures detail from
inside a fund, shown to users as menu options.

### Where the measurement stands

Twenty-eight filings read by hand. Confirmed 10, disproved 15, partial 2,
unverifiable 1. On the ten confirmed, the defect is near-total within the
filing: 28/28, 26/28, 30/31, 22/22, 23/23, 23/25, 37/38, 29/30, 18/24, 15/15.

The honest statement of scale today: **the column-(a) defect is confirmed on 10
filings covering $52.6B in stored assets, all drawn from a 2,873-filing queue
built to select for its signature. It is not yet a measured share of the 6,098
candidate lineups**, and a third of the queue turns out to be other defects.
---

## (10 fund report) #6 — 2026-08-24

**Running count of the column-(a) defect, hand-verified (cumulative):**

| | filings |
|---|---:|
| **CONFIRMED** issuer column present in the 4i table and discarded | **15** |
| **DISPROVED** — filing read, no column (a) to drop | **20** |
| **PARTIAL** — a minority of rows carry a discarded issuer | **2** |
| **UNVERIFIABLE** — source filing not in hand | **1** |
| hand-read to date | 38 |

**Batch:** 10 filings from `docs/filing-worklist-issuer.json` ($1.8B–$2.5B).
Classifier: 9 NAMES_MATCH / 1 ISSUER_DROPPED. Hand-read result: **5 confirmed**,
so the classifier found 1 of the 5. Its false-negative rate in this batch is
80%, for the reasons given in reports #4 and #5.

### CONFIRMED ×5

| ack | plan | rows losing an issuer | managers discarded |
|---|---|---:|---|
| `20251008121939NAL0005829681001` | WOOD 401(K) PLAN | **25 / 25** | Vanguard ×14, Blackrock ×4, Wilmington Trust ×3, T Rowe, Putnam, William Blair, DFA |
| `20250902150819NAL0014415937001` | FOX SAVINGS PLAN | **75 / 78** | Vanguard ×12, Blackrock ×10, Fidelity ×6, T. Rowe Price, MFS, Wellington, Prudential |
| `20251015131746NAL0002351971001` | EASTMAN KODAK SAVINGS & INVESTMENT | **21 / 22** | T. Rowe Price ×13, BlackRock ×5, Vanguard ×2 |
| `20251001094755NAL0005855811001` | HYATT CORPORATION RETIREMENT SAVINGS | **25 / 26** | T. Rowe Price Trust Company ×16, Great Gray Trust ×2, JPMorgan, FullerThaler, Baron Capital, GQG Partners, Vanguard |
| `20250729083806NAL0006830290001` | STANLEY BLACK & DECKER RETIREMENT ACCOUNT | see below | Neuberger Berman, Pacific Life, RGA, Transamerica Premier Life, Voya |

Wood 401(k):

```
             Identity of Issue,        Description of Investment Including
             Borrower, Lessor           Maturity Date, Rate of Interest,               Current
              or Similar Party          Collateral, Par or Maturity Value     Cost      Value
      Registered investment companies (mutual funds):
        Vanguard                  International Growth ADM              **   $  38,152,677
        DFA                       US Targeted Value 1                   **      35,718,658
```
stored → `Equity Index Fund J` $254,297,420 · `Target Retire Trust Plus 2030`
$162,032,303. Fourteen Vanguard rows, none say Vanguard.

Eastman Kodak:

```
Identity of Issue                 Description of Investment            Current Value
Registered Investment Companies
  Vanguard                   Short-Term Bond Index Premium            $  323,346,766
  Vanguard                   Treasury Money Market Fund                  222,111,833
  BlackRock                  Liquidity Fed Fund                            1,767,988
```
stored → `Short-Term Bond Index Premium` $323,346,766, `Treasury Money Market
Fund` $222,111,833. A Vanguard Treasury Money Market Fund is identifiable; a
`Treasury Money Market Fund` is not.

Hyatt:

```
    *    T. Rowe Price Trust Company    Retirement 2025 Active Trust Fund    #   118,022,881
    *    T. Rowe Price Trust Company    Retirement 2020 Active Trust Fund    #    50,189,416
```
stored → `Retirement 2040 Active Trust Fund` $191,958,291, manager gone.

### THE FINDING THAT MATTERS MOST IN THIS BATCH — the discarded issuer also corrupts a VALUE

`20250729083806NAL0006830290001` — **Stanley Black & Decker Retirement Account
Plan**. Its 4i schedule is on scanned pages (PDF pages 38–54 yield 1 character
each under `pdftotext`; the stored entry is correctly marked `ocr: 1`).
Rasterising page 50 and OCRing it gives the schedule:

```
Schedule H, Line 4(i) - Schedule of Assets (Held At End of Year)
                                             Description of Investment, Including
                                             Maturity Date, Rate of Interest, Par or
Identity of Issue, Borrower, or Similar Party  Maturity Value          Cost      Current Value
Common Stock:
Stanley Black & Decker, Inc.*      1,255,469 shares of Common Stock; par value
                                   $2.50 per share                $ 45,954,998   $ 100,801,606
Short-Term Investments:
Principal/Wells Fargo*             Short-Term Investment Fund          7,492,033     7,492,033
Mutual Funds:
Neuberger Berman                   Genesis Fund                       81,921,601    83,708,394
Synthetic Investment Contracts:
Pacific Life                       Constant Duration                  27,062,239    27,062,239
RGA                                Constant Duration                  26,598,708    26,598,708
Transamerica Premier Life          Constant Duration                  26,518,314    26,518,314
Voya Retirement Insurance & Annuity Constant Duration                 24,883,597    24,883,597
American Life                      Fixed Maturity                      8,977,103     8,977,103
```

What wampo stored from it:

```
   105,062,858   Constant Duration          <- FOUR contracts, FOUR issuers, ONE row
   100,801,606   $2.50 per share            <- wrapped 2nd line of a description
    83,708,394   Genesis Fund               <- Neuberger Berman dropped
     8,977,103   American Life              <- here it kept (a) and dropped (b)
     7,492,033   Principal/Wells Fargo      <- ditto
```

**`Constant Duration` $105,062,858 is the sum of four separate insurance
contracts**: 27,062,239 + 26,598,708 + 26,518,314 + 24,883,597 = **105,062,858**,
matching the stored value exactly. Because the issuer was thrown away, four
rows became name-identical, and the dedup step then added them together.

This is the first hard evidence that the column-(a) defect is **not only a
naming problem**. It manufactures a $105M holding that does not exist, from
four that do — and it does so silently, because the total still reconciles.
Any audit check based on "lineup sum vs Schedule H assets" is blind to it.

The same filing again shows the per-row column flip-flop from report #5:
`Genesis Fund` keeps column (b), `American Life` and `Principal/Wells Fargo`
keep column (a), inside the same schedule.

### DISPROVED ×5

- `20251004163433NAL0001390915001` — 21/21 names in the 4i region, zero left-
  column text.
- `20251015095724NAL0002203219001` — 80/80 in region, one left token and it is
  the character `^`.
- `20260708140943NAL0020169617001` — AIR PRODUCTS & CHEMICALS RETIREMENT
  SAVINGS: 30/32 in region, one left token, itself a full fund name.
- `20251014120428NAL0005743890001` — VISTRA THRIFT PLAN: single-column
  schedule, `SP 500 Index PL CL E   1,475,016.774 Class E shares   406,765,376`.
  The apparent left-column hits are the schedule being rendered twice in the
  PDF (lines 5963 and 6123 are identical), the known repeated-page artefact.
- `20251008164728NAL0009795232001` — AT&T SAVINGS AND SECURITY PLAN: 42 of 78
  stored names are outside any 4i region — a separate wrong-region case, not an
  issuer case.

### Cumulative

Thirty-eight filings read. Confirmed 15, disproved 20, partial 2, unverifiable
1. Confirmed filings now cover **$71.4B** in stored assets and, on them, the
defect takes 25/25, 75/78, 21/22, 25/26, 28/28, 26/28, 30/31, 22/22, 23/23,
23/25, 37/38, 29/30, 18/24, 15/15 of the rows — it is essentially never
partial when it occurs.

Managers most often discarded, counted across the 15 confirmed filings:
Vanguard (~54 rows), Fidelity/FIAM (~42), BlackRock (~25), State Street/SSGA
(~43), T. Rowe Price (~30), Principal Life (~31), JPMorgan (~14), SEI Trust
Company (~24), Northern Trust (~6).
---

## (10 fund report) #7 — 2026-08-24

**Running count of the column-(a) defect, hand-verified (cumulative):**

| | filings |
|---|---:|
| **CONFIRMED** issuer column present in the 4i table and discarded | **22** |
| **DISPROVED** — filing read, no column (a) to drop | **22** |
| **PARTIAL** — a minority of rows carry a discarded issuer | **3** |
| **UNVERIFIABLE** — source filing not in hand | **1** |
| hand-read to date | 48 |

**Batch:** 10 filings ($1.4B–$2.3B). Classifier: 6 NAMES_MATCH / 4
ISSUER_DROPPED. Hand-read: **7 confirmed**, 1 partial, 2 disproved.

### CONFIRMED ×7

| ack | plan | rows losing an issuer | managers discarded |
|---|---|---:|---|
| `20250821093854NAL0002008867001` | TELEPHONE AND DATA SYSTEMS TAX-DEFERRED SAVINGS | **21 / 23** | Vanguard ×20, BlackRock |
| `20251009091303NAL0011132032001` | ASTELLAS US RETIREMENT AND SAVINGS | **24 / 25** | JPMorgan ×10, State Street Bank & Trust ×5, AON Trust ×5, Invesco, T. Rowe Price, Vanguard |
| `20250730150446NAL0002473811001` | NOVANT HEALTH SAVINGS AND SUPPLEMENTAL RETIREMENT | **23 / 23** | State Street Global Advisors ×15, DFA ×2, Ameriprise Trust, Vanguard, Fidelity, Prudential Trust, Baird, MFS Heritage Trust |
| `20250905113357NAL0028919216001` | ATRIUS 401K RETIREMENT SAVINGS | **39 / 43** | Vanguard ×15, Nuveen ×7, CREF ×6, Wellington ×2, State Street ×2, TIAA ×3, JPMorgan, Dodge & Cox, FIAM |
| `20260702105125NAL0012952931001` | DOMINION ENERGY 401(K) PLAN | **16 / 17** | The Vanguard Group, Inc. ×11, Capital Group, Charles Schwab, Fidelity Investments, BNY Mellon |
| `20250917123504NAL0000359441001` | DOVER CORPORATION RETIREMENT SAVINGS | **23 / 29 in region** | Vanguard ×16, T. Rowe, William Blair, GQG, Prudential, Aristotle, Principal Life |
| `20251008130018NAL0005876449001` | BROWN UNIVERSITY DC LEGACY RETIREMENT | **8 / 14** | see variant below |

Dominion Energy is the tidiest quote in the batch:

```
       Identity of Issuer, Borrower,     date, rate of interest, collateral, par, or       (d)      Current
         Lessor or Similar Party                      maturity value                     Cost***     Value
* Dominion Energy, Inc.           Dominion Energy Common Stock                                    $ 592,040,555
                                  Common/Collective Trust Funds:
* Bank of New York Mellon           BNY EB Temporary Investment Fund**                                  205,506
  Capital Group                     EuroPacific Growth Trust                                        135,460,877
  Fidelity Investments              FIAM Small Cap Core Commingled Pool                              12,111,765
  The Vanguard Group, Inc.          Target Retirement Income & Growth Trust Plus                     138,790,530
```
stored → `Target Retirement 2030 Trust Plus` $204,981,646, `Target Retirement
2035 Trust Plus` $203,391,328 — eleven Vanguard trusts with no Vanguard on them.

Novant Health:
```
                 Identity of Issuer,        Rate of Interest,                        (e)
                 Borrower, Lessor,          Collateral, Par or           (d)       Current
    (a)           or Similar Party            Maturity Value            Cost        Value
          Registered Investment Companies:
            DFA                            U.S. Small Cap I              #    $  18,771,662
            Vanguard                       VMMR-Fed Money Market         #       44,470,105
            Baird                          Short Term Bond Fund          #        8,673,777
```
stored → `Target Retirement 2035` $223,145,554 and 22 more, all anonymous.

### A VARIANT WORTH NAMING — both columns are names, and the discarded one is the specific one

`20251008130018NAL0005876449001` — **BROWN UNIVERSITY DC LEGACY RETIREMENT
PLAN**. The filing:

```
        CREF Stock Account - R3            CREF Stock Fund     275,772 shares    252,943,137
```

Column (a) is `CREF Stock Account - R3`; column (b) is `CREF Stock Fund`.
wampo stored `CREF Stock Fund`. Both are names — but **the discarded one
carries the share class**, and share class is what determines the expense
ratio. Eight of fourteen rows are like this: the left column holds
`Vanguard FTSE Social Index Fund;Admiral`, `Fidelity Freedom Index Income Fund,
Institutional Premium Class`, `JPMorgan Core Bond Fund Class R6`, and we keep
the shorter, class-less version.

So the defect is not only "manager lost". On this layout it is "share class
lost", which silently degrades every expense-ratio estimate on the plan.

### PARTIAL ×1 — and it shows the parser sometimes DOES join the columns

`20250825165917NAL0003981491001` — **ARCADIS U.S. RETIREMENT SAVINGS PLAN**,
33 rows. 14 of 33 lose an issuer. But look at the top stored row:

```
   361,148,173   Fidelity Management & Research Company Growth Company
```

That is column (a) **joined to** column (b). The same parser, on the same
schedule, joins on one row and drops on fourteen. Whatever the fix is, this
specimen proves the joining code path already exists and is firing
inconsistently — which is a better starting point than writing it from scratch.

### DISPROVED ×2, both with a specific reason

**`20251008164923NAL0003157075001` — BELLSOUTH SAVINGS AND SECURITY PLAN.**
14 of 15 names in the 4i region, 2 with left text, and those two left tokens are
themselves fund names (`BGI MSCI ACWI EX-US INDEX`, `LIFEPATH 2065 FUND`) —
a wrapped single-column schedule, not an issuer column.

**`20251014113306NAL0005639234001` — MARMON EMPLOYEES' RETIREMENT PLAN,
$1.63B.** There is no 4i region in the filing at all (0 header matches). The
lineup comes from a plain two-column plan summary:

```
Name                                           Dollar Amount
S&P 500 INDEX FUND                              438,389,487
TARGET RETIREMENT 2030 FUND                     195,872,844
US SMALL/MID CAP STOCK FUND                      48,967,280
FIDELITY MANAGED INCOME PORTFOLIO FUND                    0
STABLE VALUE FUND                               146,800,947
```

No issuer column exists, so nothing was dropped. **But a different defect is
here in plain sight**: wampo stores

```
   146,800,947   FIDELITY MANAGED INCOME PORTFOLIO FUND 0 STABLE VALUE FUND
```

The zero-valued row was glued to the following row's name and took its value.
A `0` in the value column makes the parser treat the line as a continuation.
Clean, reproducible specimen for that class.

### Cumulative

Forty-eight filings read by hand: **22 confirmed, 22 disproved, 3 partial, 1
unverifiable.** On the confirmed filings the defect is near-total — the
per-filing rates are 15/15, 16/17, 18/24, 21/22, 21/23, 22/22, 23/23, 23/23,
23/25, 24/25, 25/25, 25/26, 26/28, 28/28, 29/30, 30/31, 37/38, 39/43, 75/78,
8/14, 23/29, 25/25.

**What is now measured, and what still is not.** Measured: on a 2,873-filing
queue selected for the low-manager-share signature, 22 of 48 filings read
carry the defect and 22 do not. That is a property of *this queue*, not of the
6,098-lineup candidate set, and it must not be quoted as one. Not measured:
the share of all confident lineups affected — that needs a random sample of
the candidate set rather than an assets-ranked one, which is the next thing
this loop should do.
---

## (10 fund report) #8 — 2026-08-24 — THE MEASUREMENT

Two batches (20 filings), and for the first time drawn **at random from the
candidate set itself** rather than from an assets-ranked queue. This is the
report that turns the $1.02T candidate set into a measured one.

**Running count of the column-(a) defect, hand-verified (cumulative):**

| | filings |
|---|---:|
| **CONFIRMED** issuer column present in the 4i table and discarded | **40** |
| **DISPROVED** — filing read, no column (a) to drop | **23** |
| **PARTIAL** — a minority of rows carry a discarded issuer | **4** |
| **UNVERIFIABLE** — source filing not in hand | **1** |
| hand-read to date | 68 |

### Why a new sampling frame was needed

Reports #3–#7 read 48 filings off `filing-worklist-issuer.json`, which sorts by
**assets**. On that queue the defect confirmed on 22 of 48 — 46%. But the
largest plans are exactly the ones that file master trusts, separately managed
accounts and trustee security detail, so an assets-ranked rate measures the mix
of *big* plans, not the mix of the candidate set. It cannot be generalised.

`docs/filing-worklist-random.json` reproduces the report-#1 candidate-set
definition exactly and then shuffles it with a fixed seed (20260824):

```
lineups with >=8 fund rows:                     56,615   (1,603,462 rows)
  where <=15% of rows name a manager:            6,043
  rows in them:                                159,838
  assets in them:                             $1,125B
sampling frame (>=3 usable names for the tester): 5,314   (87.9% of the set)
```

(The original figures were 6,098 / 154,917 / $1,019B; the small drift is data
refreshed since, not a methodology change.)

### RESULT — 18 of 20 randomly drawn candidate filings carry the defect

| ack | plan | rows losing an issuer | verdict |
|---|---|---:|---|
| `20251014123610NAL0001351731001` | STRATEGIC RETIREMENT PROGRAM | 26 / 27 | confirmed |
| `20250715132238NAL0002140833001` | MIDWAY PRODUCTS GROUP 401(K) | 30 / 30 | confirmed |
| `20251014162705NAL0003282673001` | SUNLAND LOGISTICS SOLUTIONS 401(K) | 19 / 20 | confirmed |
| `20251008092229NAL0005331297001` | XCALIBER INTERNATIONAL RETIREMENT SAVINGS | 23 / 23 | confirmed |
| `20251013090219NAL0002237650001` | IDEATEK TELCOM 401(K) | 22 / 22 | confirmed |
| `20251010074646NAL0012098496001` | TRANSOURCE 401(K) INVESTMENT PLAN | 34 / 34 | confirmed |
| `20251007144656NAL0008138912001` | CHILD DEVELOPMENT RESOURCES BENEFIT PLAN | 35 / 36 | confirmed |
| `20251010161922NAL0008008865001` | ARDENT HEALTH SERVICES RETIREMENT SAVINGS | 28 / 30 | confirmed |
| `20251212151518NAL0009075808001` | TNEMEC COMPANY 401(K) SAVINGS | 26 / 27 | confirmed (OCR) |
| `20260701103150NAL0017364656001` | CROWE & DUNLEVY PROFIT SHARING AND THRIFT | 29 / 29 | confirmed |
| `20250930213058NAL0020038482001` | HONOLULU MUSEUM OF ART 401(K) | 23 / 23 | confirmed |
| `20251003155021NAL0001584481001` | ONESMILE 401(K) PLAN AND TRUST | 29 / 29 | confirmed |
| `20251015171748NAL0002694211001` | COMPASS KOONS GAS 401(K) | 16 / 18 | confirmed |
| `20250925103159NAL0003472355001` | EAGLEBANK 401(K) | 34 / 34 | confirmed |
| `20250926172147NAL0008780225001` | COBORN'S INC. PROFIT SHARING 401(K) | 23 / 25 | confirmed |
| `20251014114641NAL0003827760001` | TEMPUR SEALY 401(K) RETIREMENT | 22 / 22 | confirmed |
| `20250826052545NAL0004237027001` | T & R PROPERTIES PROFIT SHARING | 17 / 18 | confirmed |
| `20251006174221NAL0009977202001` | KEYSTONE PLANET FITNESS RETIREMENT | 27 / 27 | confirmed (OCR) |
| `20250829133523NAL0006149299001` | CARRINGTON 401(K) | 7 / 24 | **partial** |
| `20260717071717NAL0003792179003` | (not in plans-all) | 2 / 78 | **disproved** — CUSIP-first single column |

**18 confirmed / 20 read. Point estimate 90%; Wilson 95% interval
69.9%–97.2%.** Applied to the 5,314-lineup sampling frame that is
**3,714 – 5,166 lineups affected, point estimate 4,783.**

Stated precisely, and this is the sentence to quote: *of the 5,314 confident
lineups that carry the low-manager-share signature and have at least three
usable names, an estimated 70%–97% have a fund manager printed in the filing
that wampo discarded. The estimate comes from a random sample of 20, every
one read by hand against the filing.*

What the sample does **not** license: multiplying that share by $1,125B. The
sample is unweighted by plan size and, as reports #3–#7 showed, the largest
plans in the set fail for *different* reasons. Assets-weighted exposure needs a
size-stratified sample and has not been measured.

### Evidence

Honolulu Museum of Art — 23 of 23, one manager:
```
          (b) Identity of Issue,     (c) Description of Investment including
          Borrower, Lessor or      Maturity Date, Rate of Interest, Collateral, Par     (e) Current
   (a)        Similar Party                     or Maturity Value              (d) Cost    Value
         Mutual Funds:
   **    Vanguard                  Target Retirement 2040 Fund                    *    $  1,122,040
   **    Vanguard                  Target Retirement 2035 Fund                    *         977,546
```

EagleBank — 34 of 34:
```
      Identity of issue, borrower, lessor, or
                    similar party                    Description of investment        Cost    Current value
      Alliance Bernstein                   Large Cap Growth Fund III Fee Class I1     n/a   $  3,471,969
      American Century Investments         Small Cap Value Fund II Class I1           n/a        612,393
      Blackrock                            High Yield Bond Portfolio Class K          n/a        599,703
```

Transource — 34 of 34:
```
  Party-        Identity of Issuer,          Description of Investment, Including
   in-         Borrower, Lessor, or            Maturity Date, Rate of Interest,          Current
 Interest         Similar Party               Collateral, Par, or Maturity Value          Value
              Mutual funds/Money market:
    *        FIDELITY                      DIVERSIFIED INTERNATIONAL FUND          $        1,477
    *        FIDELITY                      CAPITAL & INCOME FUND - CLASS M                 27,517
```

Child Development Resources — 35 of 36, and the discarded name is the *only*
identifying text on the row:
```
 *    Mutual of America Life Insurance     Interest Accumulation Fund    $     1,531,836
 *    Mutual of America Life Insurance     2045 Retirement Fund                724,877
```
stored → `2045 Retirement Fund`. Twenty-two rows lose "Mutual of America".

### The two OCR confirmations — and a systematic tester failure they expose

Both OCR-derived entries were scored **WRONG_REGION, "0/12 stored names appear
in the filing text."** That verdict is structurally impossible to get right:
the parse came from pages `pdftotext` cannot read, so of course the names are
absent from the text layer. **Every OCR-derived entry will score WRONG_REGION
in this tester.** They have to be rasterised to be judged.

Rasterising them confirms both.

`20251212151518NAL0009075808001` — **TNEMEC COMPANY 401(K)**, PDF page 35:
```
Schedule H, Part IV, Line 4i—Schedule of Assets (Held at End of Year)
Identity of Issue, Borrower,   Including Maturity Date, Rate of Interest,   Current
Lessor, or Similar Party       Collateral, Par, Maturity Value              Value
Mutual funds:
Blackrock        Equity Dividend A                    $ 3,371,276
Columbia         Mid Cap Value A                        2,503,435
Eaton Vance      Atlanta SMID A                         3,008,082
Pioneer          Fundamental Growth CL A                3,671,588
iShares          S&P 500 Index K                        2,508,885
AMERICAN FUNDS   2030 TARGET RETIRE                     6,960,491
```
stored → `Equity Dividend A`, `Mid Cap Value A`, `Atlanta SMID A`,
`Fundamental Growth CL A`, `S&P 500 Index K`, `2030 TARGET RETIRE`.

`20251006174221NAL0009977202001` — **KEYSTONE PLANET FITNESS RETIREMENT**,
PDF page 47:
```
(a) Identity of Issue, Borrower,   (b) Description of Investment Including       (d)      (e)
    Lessor or Similar Party            Maturity Date, Rate of Interest...        Cost   Current Value
Fully Benefit-Responsive Investment Contract
* John Hancock          Stable Value Guaranteed Income Fund   N/R   $   212,667
Mutual Funds
American Century        Ultra R6                              N/R       464,574
American Funds          Target 2050 Fund R6                   N/R     1,914,710
BNY Mellon              Dynamic Value Y                       N/R       522,584
```
stored → `Ultra R6 N/R` $464,574, `Target 2050 Fund R6 N/R` $1,914,710,
`Dynamic Value Y N/R` $522,584. **Every issuer dropped and the cost column's
`N/R` glued onto every name** — the same cost-column glue seen on CHS in
report #5, here in its OCR form. `Ultra R6 N/R` is American Century Ultra; as
stored it identifies nothing.

### PARTIAL ×1

`20250829133523NAL0006149299001` — CARRINGTON 401(K). 24 of 25 names in the 4i
region, 7 with a discarded issuer (Northern Trust ×3, Reliance Trust, Great
Gray Trust, Allspring, Vanguard Investments). The rest already carry a manager.

### DISPROVED ×1

`20260717071717NAL0003792179003` — 78 of 80 names in the 4i region with only 2
left-column hits, and those are CUSIP-prefixed names
(`554517102 MACKAY SHIELDS COLLECTIVE INVT TR`). Single-column, security-ID-
first layout. Nothing dropped.

### Why the two queues disagree so sharply

46% on the assets-ranked queue, 90% on the random one, and the reason is
structural rather than statistical. Very large plans file master trusts,
separately managed accounts, trustee security detail and image-only schedules;
those produce the *other* defect classes catalogued in reports #2–#7 (fair-value
tables, Schedule C fee pages, statement lines, cash-flow rows). Ordinary plans
— the Honolulu Museum of Art, Coborn's, Tempur Sealy, a Planet Fitness
franchisee — file the plain two-column Form 5500 schedule the instructions
describe, and on that layout the defect is close to universal.

So the defect is **not concentrated in the biggest plans; it is concentrated in
the ordinary ones**, which is most of the site.
---

## (10 fund report) #9 — 2026-08-24 — the random sample doubled to 40

**Running count of the column-(a) defect, hand-verified (cumulative):**

| | filings |
|---|---:|
| **CONFIRMED** issuer column present in the 4i table and discarded | **56** |
| **DISPROVED** — filing read, no column (a) to drop | **25** |
| **PARTIAL** — a minority of rows carry a discarded issuer | **6** |
| **UNVERIFIABLE** — source filing not in hand | **1** |
| hand-read to date | 88 |

Two further batches from `docs/filing-worklist-random.json`. The random sample
is now **40 filings**, every one read against its filing.

### Random-sample result at n = 40

| | filings | share |
|---|---:|---:|
| fully affected (majority of rows lose an issuer) | **34** | 85.0% |
| partially affected (some rows lose an issuer) | **3** | 7.5% |
| not affected | **3** | 7.5% |

- Fully affected: **85.0%**, Wilson 95% interval **70.9% – 92.9%** →
  **3,769 – 4,939** of the 5,314-lineup frame, point estimate **4,517**.
- Affected at all (fully + partially): **92.5%**, interval **80.1% – 97.4%** →
  **4,258 – 5,177**, point estimate **4,915**.

The interval narrowed from 69.9–97.2 (n=20) to 70.9–92.9 (n=40) and the point
estimate moved from 90% to 85%. Both batches behaved like the first two; there
is no sign of the rate being an artefact of the first draw.

Still not measured, and still must not be inferred: the **assets-weighted**
share. The sample is unweighted by plan size, and reports #3–#7 showed the
largest plans fail differently. $1,125B remains the size of the candidate set,
not of the confirmed defect.

### Batch A — 8 confirmed, 2 partial

| ack | plan | rows losing an issuer |
|---|---|---:|
| `20250926111853NAL0010073920001` | PHYSICIANS & SURGEONS CLINIC OB/GYN PROFIT SHARING | 16 / 17 |
| `20251007115723NAL0008077152001` | STRIDES PHARMA 401(K) PROFIT SHARING | 26 / 26 |
| `20250709140247NAL0008199568001` | CORVESTA NEW COMPARABILITY CODA PROFIT SHARING | 15 / 15 |
| `20251015171707NAL0010807442001` | GEN II MANAGEMENT 401(K) | 41 / 41 |
| `20250919103554NAL0005243730001` | LOFFREDO GARDENS PROFIT SHARING | 34 / 35 |
| `20250923110933NAL0002519059001` | VSC FIRE & SECURITY 401(K) SAVINGS | 22 / 23 |
| `20251014123154NAL0002767617001` | HEADWATERS SALONS 401(K) | 21 / 21 |
| `20251015115055NAL0002356131001` | ABEL CONSTRUCTION 401K SAVINGS | 28 / 28 |
| `20251015155925NAL0002711283002` | AIR WISCONSIN FLIGHT ATTENDANTS RETIREMENT | 7 / 27 partial |
| `20250924124250NAL0010597714001` | SEAGRAVE FIRE APPARATUS UNION 401(K) | 5 / 24 partial |

Gen II Management, 41 of 41 rows:
```
             Identity of Issuer, Borrower,     Maturity Date, Rate of Interest, Collateral,       Current
                Lessor, or Similar Party                Par, or Maturity Value            Cost      Value
     Mutual Funds
      Aristotle                            STRATEGIC INCOME I                          **   $   284,735
      Blackrock                            CORE BOND K                                 **       407,992
      Cohen & Steers                       REALTY SHARES Z                             **       424,553
      DODGE & COX                          DODGE & COX INCOME- I                       **         1,119
```
Note the last row: when the filer repeats the manager inside column (b), the
name survives. `DODGE & COX INCOME- I` is stored intact while `CORE BOND K`
loses BlackRock — from adjacent lines of the same table. That is the clearest
possible demonstration that the information is present and the loss is ours.

Air Wisconsin is the partial case, and shows why partials happen:
```
Collective Investment Trust Funds
              Great Gray Trust Company    Flexpath Stable Value Fund     N/R    $   932,053
              Great Gray Trust Company    Large Cap Growth Fund          N/R         822,108
              Great Gray Trust Company    EuroPacific Growth Fund        N/R         490,659
Mutual Funds
```
The collective-trust block loses its issuer; the mutual-fund block below it
already carries manager-prefixed names, so only part of the menu is damaged.

### Batch B — 8 confirmed, 2 disproved

| ack | plan | rows losing an issuer |
|---|---|---:|
| `20251014080513NAL0001099699001` | GREATER NASHUA MENTAL HEALTH 403(B) | 24 / 25 |
| `20251001160350NAL0018037219001` | SAVINGS PLAN OF HARMONIC DRIVE LLC | 27 / 27 |
| `20260626073611NAL0016208178001` | KIEL CENTER 401(K) | 25 / 26 |
| `20250826093826NAL0016958418001` | MULTIVAC PROFIT SHARING 401(K) | 39 / 40 |
| `20251030085608NAL0004269682001` | S & S FIRESTONE 401(K) RETIREMENT | 24 / 26 |
| `20251009182853NAL0004164579001` | J. DAVID GLADSTONE INSTITUTES POSTDOC PROFIT SHARING | 21 / 21 |
| `20260722135759NAL0010182323001` | SPARROW & KENNEDY TRACTOR CO RETIREMENT | 30 / 31 |
| `20251013140824NAL0000691539001` | PDF INC. 401(K) PROFIT SHARING | 22 / 22 (OCR) |
| `20260707142910NAL0016333923001` | JOLLY ROOFING 401(K) | 0 / 11 — disproved |
| `20251009094141NAL0015702498001` | SPUNTECH 401(K) | 0 / 24 — disproved |

**Sparrow & Kennedy Tractor Co** is a single-issuer menu: 30 of 31 rows are
`SENTRY LIFE INSURANCE COMPANY`, and every stored name is a bare
`2045 TARGET RETIREMENT ACCOUNT III`, `GUARANTEED FUND`. A plan whose entire
lineup is one insurer's separate accounts shows on wampo as anonymous accounts.

**PDF Inc. 401(k)** — OCR-derived, scored WRONG_REGION as predicted in report
#8. Rasterised PDF page 29:
```
FORM 5500, SCHEDULE H 4i
SCHEDULE OF ASSETS HELD FOR INVESTMENT PURPOSES
     (b)                          (c)                                          (e)
     Identity of issue, borrower, Description of investment including...     Current
(a)  lessor, or similar party     rate of interest, collateral...             Value
Mutual Funds:
*  American Funds    The Growth Fund of America                       $   185,461
*  American Funds    Smallcap World Fund                                   69,404
*  American Funds    Growth Portfolio Fund                                241,952
*  American Funds    Washington Mutual Investors Fund                       2,844
*  American Funds    Investment Company of America Fund                    94,023
```
Twenty-two rows, one manager on every one, none of it stored. `Growth Portfolio
Fund` is unidentifiable; `American Funds Growth Portfolio Fund` is a specific
registered fund with a ticker.

The two disproved filings (Jolly Roofing, Spuntech) both have all their names
inside a genuine 4i region with **zero** left-column text — single-column
schedules where the filer put the whole name in one cell.

### What the loop has established, in one paragraph

The Form 5500 line 4i schedule normally prints the fund manager in column (a)
and the product in column (b). `scripts/lib-4i.mjs` keeps one column per row
and, on the standard layout, keeps the wrong one. On a random sample of 40
filings drawn from the 5,314-lineup candidate frame, **85% lose the manager on
most rows and 92.5% lose it on some** — an estimated 3,769–4,939 lineups fully
affected. The loss is not cosmetic: it makes rows unmatchable to a ticker
(`500 Index Fund`, `Growth Portfolio Fund`, `2045 Retirement Fund`), it
discards share class on layouts like Brown University's, and on Stanley Black &
Decker it silently merged four issuers' contracts into one fabricated $105M
holding. The fix is a parser change and a PARSER_VERSION bump; the specimens
that must all pass together are HP Inc. (join (a)+(b)), Sanofi (keep (a), (b)
is `Common Trust`), Eversource and Iowa Health (the parser already flips
per-row), and Arcadis (it already joins, sometimes).
---

## (10 fund report) #10 — 2026-08-24 — the large-plan stratum, and a first assets-weighted range

**Running count of the column-(a) defect, hand-verified (cumulative):**

| | filings |
|---|---:|
| **CONFIRMED** issuer column present in the 4i table and discarded | **60** |
| **DISPROVED** — filing read, no column (a) to drop | **29** |
| **PARTIAL** — a minority of rows carry a discarded issuer | **8** |
| **UNVERIFIABLE** — source filing not in hand | **1** |
| hand-read to date | 98 |

### Why this batch exists

Reports #8 and #9 measured the defect on a random sample of the candidate frame
and deliberately refused to convert it to dollars. The reason is in the frame's
own shape:

```
frame: 5,314 lineups, $1,091B
  >= $1B        129 lineups   $798B    73.1% of frame assets
  $100M - $1B   688 lineups   $191B    17.5%
  $10M - $100M  2,948 lineups  $95B     8.7%
  < $10M        1,549 lineups   $9B     0.8%
```

Three-quarters of the money sits in 129 lineups — and those are precisely the
plans where reports #3–#7 kept finding *other* defects. So the dollar question
is really a question about those 129. `docs/filing-worklist-big.json` is that
stratum, shuffled with its own seed (99991); this batch is the first 10 of it.

### Result in the ≥$1B stratum: 4 of 10, against 34 of 40 in the frame overall

| ack | plan assets | rows losing an issuer | verdict |
|---|---:|---:|---|
| `20251015122459NAL0009204242001` | $1.24B | 25 / 26 | confirmed |
| `20251003132311NAL0001451697001` | $1.24B | 32 / 33 | confirmed |
| `20251015144139NAL0002471715001` | $1.32B | 17 / 17 | confirmed |
| `20250910093647NAL0020983057001` | $1.18B | 45 / 46 | confirmed |
| `20251013180453NAL0001710769001` | $1.11B | 19 / 77 | partial |
| `20251014105114NAL0005497426001` | $1.02B | 10 / 26 | partial |
| `20251013085832NAL0000397331001` | $1.40B | 1 / 24 | disproved |
| `20251015155740NAL0002707907001` | $2.04B | 0 / 9 | **other defect** |
| `20260630102859NAL0010559635001` | $1.52B | 0 / 8 | **other defect** |
| `20250924074912NAL0007259441001` | $1.52B | 0 / 9 | **other defect** |

Confirmed rate **40%** (Wilson 95%: 17%–69%) against **85%** in the frame as a
whole. The large-plan stratum really is different, and the difference is not a
sampling accident: it reproduces the 46% seen across 48 assets-ranked filings in
reports #3–#7.

Evidence for one of the confirmed, `20251015144139NAL0002471715001` — 17 of 17
rows, thirteen of them State Street:
```
left column, discarded:  State Street Bank and Trust x13,
                         Fidelity Management Trust Company, PGIM Fixed Income,
                         Invesco, Fidelity Investments
```

### The three "other defect" filings are the statement-page class again

All three are 8–9 row lineups worth $1.5–2.0B whose rows are asset categories:

```
   924,000,000   Collective investment trusts
   215,000,000   Company common stock
   159,000,000   Synthetic GICs
   120,000,000   Self-Directed Brokerage Account
    88,000,000   Fully benefit-responsive investment contracts, at contract value
     6,000,000   Traditional GICs
     5,000,000   Money market funds
     1,000,000   Interest income
```

**And they are a year stale.** The filing (`20260630102859NAL0010559635001`,
plan year 2025) prints four columns — 2025 total, 2025 level, 2024 total, 2024
level:

```
Collective investment trusts        1,070.6      1,070.5      924.4      924.3
Company common stock              $   190.4    $   190.4    $ 215.6    $ 215.6
```

wampo stored **924.4** and **215.6** — the 2024 pair. That is the **third**
independent confirmation of the wrong-year-column class (Comcast in report #1,
Fresenius in report #4, this one). Three plans, three unrelated auditors, same
error: when a statement table has a prior-year column, the parser takes it.

`20250924074912NAL0007259441001` additionally stores a row called
`Independent Auditor's Report` worth **$1,000,000** — a page heading whose
adjacent `1` became a value in millions.

### First assets-weighted range — stated with its weaknesses

Post-stratifying the random work: 33 of 39 sub-$1B draws confirmed (84.6%,
CI 70.3–92.8), 4 of 10 ≥$1B draws confirmed (40%, CI 17–69).

| stratum | lineups | assets | confirmed rate | assets affected |
|---|---:|---:|---:|---:|
| ≥ $1B | 129 | $798B | 40% (17–69) | $319B (136–551) |
| < $1B | 5,185 | $294B | 84.6% (70.3–92.8) | $248B (206–273) |
| **total** | **5,314** | **$1,091B** | | **$567B (340–820)** |

**Two reasons to treat that as an upper-leaning figure, not a result:**

1. The ≥$1B draw skews small *within its own stratum*. Drawn median $1.32B;
   stratum median **$2.30B**; stratum maximum **$53.0B**. The giants — Morgan
   Stanley $21.6B, AT&T $42.7B, ExxonMobil $23.5B — were all read in reports
   #2–#5 and **none** of them was a column-(a) case. Weighting by dollars gives
   those plans most of the weight and the sample barely reaches them.
2. Ten draws is a 17–69 confidence interval. The dollar figure inherits that.

The defensible statement today is the lineup count, not the dollar count:
**an estimated 4,400–4,500 of the 5,314 candidate lineups are affected**
(point 4,439 from the stratified calculation, 4,517 from the unstratified one —
they agree). The dollar exposure is **somewhere in $340B–$820B and needs a
size-stratified sample of the top 129 to pin down.** That is the single
highest-value remaining measurement and it is 119 filings of work, not 5,000.

### Note on tester reliability, now quantifiable

Across the 60 confirmed filings, the mechanical classifier called
ISSUER_DROPPED on fewer than half. Its three systematic blind spots, all
evidenced in earlier reports: issuer strings over 5 words or 46 characters
(`State Street Global Advisors Trust Company`), values not ending the line
(`**` and `N/R` footnote markers), and OCR-derived entries whose source pages
`pdftotext` cannot see. It remains a good queue and a bad measurement.
---

## (10 fund report) #11 — 2026-08-24 — the ≥$1B stratum completed to n=20

**Running count of the column-(a) defect, hand-verified (cumulative):**

| | filings |
|---|---:|
| **CONFIRMED** issuer column present in the 4i table and discarded | **62** |
| **DISPROVED** — filing read, no column (a) to drop | **33** |
| **PARTIAL** — a minority of rows carry a discarded issuer | **8** |
| **UNVERIFIABLE** — source filing not in hand | **1** |
| hand-read to date | 104 |

### A bias I had to avoid

`scripts/filing-batch.mjs` skips acks already in `filing-tests.jsonl`. Running
it again on the ≥$1B stratum would therefore have skipped exactly the filings
reports #3–#7 already visited — and those were the *largest* in the stratum,
because that queue is assets-ranked. The remainder would have been
systematically smaller and the rate would have looked higher than it is.

So this batch walks positions **1–20 of the shuffled stratum in order**, reusing
my own hand verdicts for the ones already adjudicated and reading the six that
were not: `20250714153130…`, `20250821152449…`, `20260611104321…`,
`20251014161215…`, `20251013105633…`, `20260716150825…`.

### ≥$1B stratum, positions 1–20 of the shuffle

| # | plan | assets | verdict |
|---:|---|---:|---|
| 1 | (1/24 rows) | $1.40B | disproved |
| 2 | ADT SECURITY RETIREMENT SAVINGS & INVESTMENT | $1.24B | **confirmed** 25/26 |
| 3 | ADIENT US LLC SAVINGS AND INVESTMENT (401K) | $1.34B | disproved — 0/8 in a 4i region |
| 4 | (statement categories) | $2.04B | disproved — other defect |
| 5 | JPMORGAN CHASE 401(K) SAVINGS | $37.18B | disproved — names already carry the manager |
| 6 | EASTMAN KODAK SAVINGS & INVESTMENT | $2.15B | **confirmed** 21/22 |
| 7 | (19/77 rows) | $1.11B | partial |
| 8 | QORVO 401(K) | $1.24B | **confirmed** 32/33 |
| 9 | DEFERRED PROFIT-SHARING PLAN FOR SALARIED EMPLOYEES (Altria) | $4.08B | disproved — other defect, see below |
| 10 | DHL RETIREMENT SAVINGS | $1.32B | **confirmed** 17/17 |
| 11 | (10/26 rows) | $1.02B | partial |
| 12 | (statement categories) | $1.52B | disproved — other defect |
| 13 | 401(K) PENSION PLAN | $19.09B | disproved — 14/19 in region, no left column |
| 14 | (statement categories) | $1.52B | disproved — other defect |
| 15 | VILLANOVA UNIVERSITY RETIREMENT SAVINGS | $1.18B | **confirmed** 45/46 |
| 16 | BLUE 401(K) | $1.17B | **confirmed** 29/35 |
| 17 | (JP Morgan Schedule D page, report #1) | $29.20B | disproved — other defect |
| 18 | CHS/COMMUNITY HEALTH SYSTEMS | $4.72B | **confirmed** 15/15 |
| 19 | OSHKOSH CORPORATION TAX-DEFERRED INVESTMENT | $2.32B | **confirmed** 29/29 |
| 20 | (Northern Trust trustee statement, report #1) | $8.74B | disproved — other defect |

**8 confirmed of 20. Rate 40.0%, Wilson 95% interval 21.9% – 61.3%.** The first
ten gave 40% and the second ten gave 40%; the estimate is stable.

Oshkosh, 29 of 29 rows — Fidelity ×17, Vanguard ×3, T. Rowe Price ×2, Putnam,
American Funds, Hartford, Janus, JP Morgan, Columbia, ClearBridge — every one
discarded. Villanova, 45 of 46 — Vanguard ×36, CREF ×5, TIAA ×2.

`20250821152449NAL0004385233001` — **JPMORGAN CHASE 401(K) SAVINGS PLAN**,
$37.18B — is worth noting as a disproof: its stored names are
`BLCKRCK EQUITY INDEX`, `BLCKRCK RUSSELL GROWTH 1000`, `SSGA S&P MIDCAP INDEX`.
The manager is already inside the name, so nothing was dropped. This is what
the largest plans tend to look like, and it is why the stratum rate is low.

### Updated stratified estimate

| stratum | lineups | assets | confirmed rate (95% CI) | assets affected |
|---|---:|---:|---|---:|
| ≥ $1B | 129 | $798B | 40.0% (21.9 – 61.3) | $319B (175 – 489) |
| < $1B | 5,185 | $294B | 84.6% (70.3 – 92.8) | $248B (206 – 273) |
| **total** | **5,314** | **$1,091B** | | **$568B ($381 – $762B)** |

**Lineups affected: point 4,439, range 3,672 – 4,888.**

The dollar range has tightened from $340–820B to **$381–762B** and no longer
rests on ten draws. The remaining weakness is unchanged and worth restating:
the stratum spans $1.02B to $53.0B, and the sampled median ($1.4B) is below the
stratum median ($2.30B), so the very largest plans are still thinly covered.
Reading all 129 would remove the last of that uncertainty.

### A SECOND independent case of ZIP codes stored as dollar values

Position 9, `20260611104321NAL0017242610001` — **DEFERRED PROFIT-SHARING PLAN
FOR SALARIED EMPLOYEES** (Altria), $4.08B, confident, OCR-derived from a
prior-year fallback filing. Its stored lineup:

```
   4,059,105,847   Master Trust
       6,241,639   Collective investment funds
       2,929,146   y ALTRIA CLIENT SERVICES LLC
       2,486,785   Master Trust B Altria Stock
       2,388,990   Plan's interest in Master Trust A at fair value
         476,622   Registered investment companies
         419,815   Fully benefit-responsive investment contracts
          81,206   By employer
          56,881   By participants
          23,230   6601 West Broad Street Richmond, Virginia
          20,549   WASHINGTON, D.C.
```

The last two rows are self-evidencing: a holding named
`6601 West Broad Street Richmond, Virginia` worth **$23,230** — Richmond's ZIP
is 23230 — and a holding named `WASHINGTON, D.C.` worth **$20,549** — the
SEC's ZIP is 20549, the address printed on every 11-K cover page. **The name is
the address and the value is its ZIP code.** Together with the two Delta plans
in report #3 (BlackRock's 10022, American Funds' 78251-4321) that is three
plans in this loop where a postal code is displayed to users as a fund balance.

`By employer` $81,206 and `By participants` $56,881 are contribution lines,
the Fresenius class from report #4. `Master Trust` $4,059,105,847 is Form 5500
line 1c(11), *Value of interest in master trust investment accounts* — the
right number under a name that is not a fund.

I could not quote the source page: the entry comes from a prior-year filing
reached through the `fb` fallback, and that ack is only in the pipeline-only
`fallbacks.json` artifact. Same blocker as FirstEnergy in report #5. **Two
findings now blocked on the same missing thing — worth publishing the fallback
ack into `lineups-status.json` so a tester can reach the filing that was
actually parsed.**
---

## (10 fund report) #12 — 2026-08-24 — ≥$1B stratum to n=30, and the closing numbers

**Running count of the column-(a) defect, hand-verified (cumulative):**

| | filings |
|---|---:|
| **CONFIRMED** issuer column present in the 4i table and discarded | **67** |
| **DISPROVED** — filing read, no column (a) to drop | **34** |
| **PARTIAL** — a minority of rows carry a discarded issuer | **8** |
| **UNVERIFIABLE** — source filing not in hand | **1** |
| **hand-read to date** | **110** |

Positions 21–30 of the shuffled ≥$1B stratum, six of them newly adjudicated.

| # | plan | assets | verdict |
|---:|---|---:|---|
| 21 | THE CIGNA GROUP 401(K) | $13.35B | partial (6/74, report #3) |
| 22 | BOSTON UNIVERSITY RETIREMENT | $2.98B | **confirmed** 30/30 |
| 23 | (NT-prefixed names) | $4.08B | disproved (report #5) |
| 24 | ARKEMA INC. EMPLOYEES' RETIREMENT SAVINGS | $1.22B | **confirmed** 33/33 |
| 25 | NVIDIA CORPORATION 401(K) | $4.75B | **confirmed** 24/26 |
| 26 | (trustee statement) | $3.76B | disproved — the `CUSIP:` class |
| 27 | DOVER CORPORATION RETIREMENT SAVINGS | $1.81B | **confirmed** (report #7) |
| 28 | LVMH AFFILIATES' 401(K) | $1.13B | **confirmed** 25/27 |
| 29 | (single column) | $4.50B | disproved (report #6) |
| 30 | INTUIT INC. 401(K) | $3.68B | **confirmed** 20/20 |

Arkema, 33 of 33: `Fidelity Management Trust Company` ×26,
`Vanguard Fiduciary Trust Company` ×3, Parnassus, Janus Henderson, MFS, PIMCO.
NVIDIA, 24 of 26: T. Rowe Price ×13, Vanguard ×6. Intuit, 20 of 20:
Vanguard ×13, State Street ×5. Boston University, 30 of 30: Vanguard ×17,
CREF ×8, TIAA ×2.

Position 26 is a reminder that report #1's very first finding is still live:
its stored top holding is literally

```
   3,739,343,827   CUSIP:
      12,813,990   SEDOL:
         913,686   MURPHY USA INC COM
```

— a $3.74B "fund" named `CUSIP:` on a $3.76B plan, i.e. **99.4% of the
displayed lineup**, followed by individual common stocks.

### Final numbers from this loop

**≥$1B stratum, n = 30:** 14 confirmed, 3 partial, 13 disproved.
Rate **46.7%**, Wilson 95% **30.2% – 63.9%**.
**Sub-$1B, n = 39:** 33 confirmed. Rate **84.6%**, Wilson **70.3% – 92.8%**.

| stratum | lineups | assets | confirmed rate (95% CI) | assets affected |
|---|---:|---:|---|---:|
| ≥ $1B | 129 | $798B | 46.7% (30.2 – 63.9) | $373B (241 – 510) |
| < $1B | 5,185 | $294B | 84.6% (70.3 – 92.8) | $248B (207 – 273) |
| **total** | **5,314** | **$1,091B** | | **$621B ($448 – $782B)** |

**Lineups affected: 4,448 (range 3,683 – 4,892) of 5,314.**

Progression of the dollar range as the sample grew — it has been narrowing
from both ends and the point estimate has been stable:

| stage | ≥$1B n | range |
|---|---:|---|
| report #10 | 10 | $340B – $820B |
| report #11 | 20 | $381B – $762B |
| report #12 | 30 | **$448B – $782B** |

### What a future cycle should do next, in order

1. **Read the remaining 99 filings of the ≥$1B stratum.** It is the only
   remaining source of width in the dollar figure, and it is 99 filings, not
   5,000. Everything below $1B is already measured to ±11 points.
2. **Publish the `fb` fallback ack into `lineups-status.json`.** Two findings
   in this loop (FirstEnergy in #5, Altria in #11) could not be quoted against
   their source because the filing that was actually parsed is only named in
   the pipeline-only `fallbacks.json` artifact.
3. **Fix the classifier's three known blind spots** before trusting any future
   verdict count: issuer strings over 5 words / 46 characters, values not ending
   the line (`**`, `N/R` markers), and OCR-derived entries, which will always
   score WRONG_REGION because their source pages have no text layer.

### The defect classes this loop found that were NOT in the four verdicts

| class | first specimen | scale seen |
|---|---|---|
| fair-value hierarchy table parsed as a menu | Morgan Stanley `20251010150034…` | 6 filings, incl. a liability summed into an asset |
| Schedule C indirect-fee page parsed as 4i, **ZIP codes as dollar values** | Delta pilots `20251014143617…` | 3 plans (2 Delta, Altria), $24.5B |
| prior-year column read instead of current | Comcast `20251007174512…` | 3 plans, 3 auditors |
| Statement-of-Changes cash flows stored as holdings | Fresenius `20251007125615…` | 2 plans (`NET ADDITIONS` $402M) |
| cost column glued into the fund name | CHS `20250926144818…` | 2 plans (`… $0.00`, `… N/R`) |
| issuer discarded → identical names → **dedup sums them** | Stanley Black & Decker `20250729083806…` | 1 plan, a fabricated $105M holding |
| share class discarded (both columns are names) | Brown University `20251008130018…` | 1 plan |
| zero-valued row glued to the next row | Marmon `20251014113306…` | 1 plan |
| date/heading fragment as a holding | ExxonMobil `FOR THE YEAR ENDED` $2,024,000 | 3 plans |

---

## (10 fund report) #13 — 2026-08-24 — the goal changed: hunting information classes, not instances

Two batches (20 filings, positions 29–48 of the issuer worklist; running total
tested by the batch script: 48). Batch verdicts, for the record:

| batch | ISSUER_DROPPED | NAMES_MATCH | WRONG_REGION |
|---|---:|---:|---:|
| 13 | 4 | 3 | 3 |
| 14 | 4 | 6 | 0 |

Those verdicts are queue output, not measurement, and the column-(a) count is
no longer the objective. The batches exist to surface filings; the work of this
cycle was reading three of them line by line — every schedule title, note
heading and table column — and asking what the filing carries that a wampo
reader never sees, **or sees stated wrongly**.

The primary specimen is **LNC Employees' 401(k) Savings Plan**,
`20251009112104NAL0011345952001`, EIN 35-1140070 PN 009, $3.52B, 16,727
participants with balances. It is a clean, well-typeset filing: nothing here is
an OCR artefact or a layout trap. Everything below is what the pipeline does
with a filing it parses *successfully* — `confident: true`, ratio 0.83.

### 1. The Employer Match card can quote a paragraph that is not about the match

Stored for LNC:

```
matchText: "Vesting Participants' pre-tax contributions, Roth 401(k)
            contributions, Employer match contributions and earnings thereon
            are fully vested at all times."
match:     (absent)
nec:       (absent)
```

The filing states, in its own Contributions note:

> "The basic Employer match is $1.00 for each $1.00 that a participant
> contributes each pay period, up to 6% of eligible earnings. The Employer
> 'Core' contribution is 4% of eligible earnings and is contributed to each
> eligible employee regardless of whether the employee elects to defer."

So the plan has a dollar-for-dollar match to 6% **and** a 4% non-elective, and
wampo stores neither — while displaying, under the heading "Employer Match"
with a green `FORM 5500 AUDIT NOTES` badge, a sentence whose first word is
"Vesting". `app.js:662` renders `matchText` unconditionally; there is no gate
requiring that a formula was actually found.

**Measured across all 62,377 lineup entries that carry features:**

| | lineups |
|---|---:|
| carry a `matchText` quote | 52,514 |
| …of those, **no `match` formula was extracted** — quote shown alone | **8,704** |
| …of those, the quote **contains no digit at all** | **4,350** |
| `matchText` quotes whose first word is "Vesting" | **800** |

A match formula requires a number. A quote with no digit in it cannot be
stating one, so the 4,350 is a floor on quotes that cannot support the card
they appear in. Hand-read confirmations of that class:

- `20251230144924NAL0010542115001` — quote is a revenue-recognition sentence,
  "Participant contributions and any related Participating Employer matching
  contributions are recognized in the period in which the employer makes the
  respective payroll deductions". See §4 — this one is a pooled employer plan
  and has no single match to state.
- `20251007110955NAL0004482145001` — quote is the Participant Accounts
  paragraph, "Each participant's account is credited with the participant's
  contributions, and allocations of (a) Company matching contributions…".

### 2. One sentence is quoted as evidence for two different features

LNC again: `eligibility: "2 years of service"`, and its `eligibilityText` is
the identical vesting sentence used for `vestingText`. The filing's actual
eligibility rule is "covers substantially all employees … who meet the
conditions of eligibility to participate as defined by the Plan document" — no
service requirement is stated anywhere. wampo tells a reader they must work two
years before they can join a plan they can join on hire. The extractor matched
the word "eligible" inside a sentence about vesting of the Core contribution.

Measured over the same 62,377: **3,007 feature pairs share a verbatim quote.**
Largest pairs: `rothText=afterTaxText` 826, `matchText=vestingText` 669,
`matchText=eligibilityText` 419, `rothText=autoEnrollText` 193,
`eligibilityText=autoEnrollText` 173, `matchText=necText` 145.

Sharing a quote is not automatically an error — one sentence can genuinely
state two facts. It is a *detector*, and a cheap one: it is exactly the
signature of a regex that matched a keyword in a neighbouring topic.

### 3. `vesting: "2-year cliff"` is scope-wrong in the direction that penalises the plan

The same LNC sentence pair says match and deferrals are "fully vested at all
times" and only the Core contribution vests after two years. wampo prints one
flat "Employer-money vesting: 2-year cliff". Half the employer money in that
plan is immediately vested. Project memory claims the vesting extractor applies
"employer-scope rules"; on this filing it does not.

### 4. Pooled employer plans have no plan design to state, and wampo states one anyway

`20251230144924NAL0010542115001` is **SUCCESSWISE POOLED EMPLOYER PLAN**,
sponsor "Plan Professionals, LLC" — a pooled plan provider, not an employer.
From its notes:

> "Under the terms of the Participating Employer adoption agreements, the
> Participating Employers may elect to make matching contributions,
> profit-sharing contributions, safe harbor, prevailing wage and nonelective
> contributions to the PEP."
> "The Participating Employers in the PEP may elect automatic enrollment and
> escalation features."

Every design fact wampo shows for a plan — match, vesting, auto-enrol,
eligibility — is per-participating-employer here, and a single answer is not
merely unknown, it is **unknowable from this filing**. The same applies to the
sponsor name (nobody works at Plan Professionals LLC) and to average balance
across unrelated employers.

The plan-entity type is a Form 5500 Part I line A checkbox (single-employer /
multiple-employer / multiemployer / DFE). `scripts/build-data.mjs:151` reads
`TYPE_DFE_PLAN_ENTITY_CD` for exactly one purpose — spotting `M` for master
trusts — and the plan-entity column is never read at all. Counting by plan
**name** only (a floor, and it catches a false positive called "PEP PRINTING,
INC."): **195 plans name themselves a pooled employer plan and 200 more name
themselves multiple-employer, out of 110,555.**

### 5. Employer stock and the stable-value contract are missing from a "confident" lineup

The LNC 4i schedule, verbatim, after the collective-trust block:

```
*   LNC                Common stock                                    113,237,840
*   LNL                Investment contract - at contract value         414,453,295
*   Matrix Trust Co.   Cash and invested cash                            3,304,562
*   Charles Schwab     Brokerage account                               185,845,091
*   Participant loans  Maturing through December 2044, interest
                         rates ranging from 3.25% to 9.50%              39,300,797
```

Stored lineup: 31 funds summing to $2,902,001,352 against a 4i total of
$3,468,993,317. **LNC common stock and the $414M LNL contract are simply
absent** — $528M, 15% of the schedule, and precisely the two holdings a
participant most wants named: their own employer's stock and the stable-value
option. Schwab survives only because the parser took column (a) on that row;
"Cash and invested cash" survives as column (b) and is typed "Collective
trust".

The reason is the mechanism, not an accident: on exactly these rows column (b)
is a **category noun** — "Common stock", "Investment contract", "Brokerage
account" — and the identity lives only in column (a). The column the parser
discards is not redundant metadata for this class of row; it is the only name
there is. That reframes the column-(a) defect: it is also a *coverage* defect,
and it removes employer stock and GICs preferentially.

Two further things visible only in that block:
- every one of those rows carries the party-in-interest `*`, and the legend
  says so: "\* Represents a permitted party-in-interest". The LNL contract is a
  guaranteed contract issued by the sponsor's own life-insurance subsidiary —
  12% of plan assets in a product sold by the employer. wampo shows nothing.
- the cost column is empty by right, with the reason printed: "\*\* Cost
  information is not required for participant-directed investments."

### 6. Sch H per-participant expense is attributed to participants who did not pay it

LNC's Schedule H line 2i(12), total administrative expenses: **$182,511**.
LNC's forfeiture note:

> "During the year ended December 31, 2024, forfeitures of $303,047 were used
> to reduce Employer contributions, and forfeitures of $182,511 were used to
> pay administrative expenses of the Plan."

The two figures are the same number. Every dollar of this plan's reported
administrative expense was paid out of forfeited employer money; participants
bore none of it. `app.js:848` prints "Total administrative expenses ≈ $X per
participant" and `feePeerNote` then ranks that per-head figure against peers.
The $0 branch of that function is carefully hedged ("paid by the employer or
netted inside fund expense ratios"); the non-zero branch is not hedged at all,
and asserts a per-participant charge the filing contradicts.

### 7. Smaller classes noticed while reading

- **Auditor identity and opinion type are structured form fields, not prose.**
  Schedule H Part III line 3a is a four-way checkbox
  (unmodified/qualified/disclaimer/adverse), 3b is the ERISA §103(a)(3)(C)
  election, 3c is the accountant's name and EIN — LNC's page carries
  "ERNST & YOUNG … EIN 35-6565596". The gap inventory filed both of these under
  *extraction gaps, no extractor written*. That classification is wrong: they
  are Schedule H columns, in the same file the pipeline already downloads, and
  belong with the cheap dataset items. (Caveat, stated because it is not
  measured: `askebsa.dol.gov` is unreachable from the sandbox — 403 through the
  proxy — so I verified the *form structure* in the PDF, not the extract's
  column names. The check is one line in the prep log.)
- **Auditor changes are visible and unreported.** LNC's table of contents lists
  two audit reports: FY2024 "(PCAOB ID 42)" and FY2023 "(PCAOB ID 2468)" — a
  different firm signed the prior year. Schedule C Part III (Termination
  Information on Accountants) is blank template on this filing.
- **Fidelity bond amounts do print in the PDF** even though the checkboxes do
  not: LNC's line 4e carries "15000000" as a rendered value. The inventory's
  0/18 for bonds is a detector artefact of looking in the notes.

### What was disproved this cycle

- **"sdba: false will make wampo deny an obvious brokerage window."** LNC's
  stored lineup has `sdba: false` despite a $185.8M Schwab brokerage account in
  the 4i and an explicit note ("participants have the option of utilizing a
  self-directed brokerage account"). The display is nonetheless correct,
  because the plan carries characteristic code **2R** and the three-state rule
  reads the codes first. The exposure is real but conditional: an identical
  parse on a plan without 2R would print "✗ None indicated — no brokerage
  window in the schedule of assets or plan codes" over a filing that names one.
  Not counted as a defect; recorded as a dependency.
- **"Shared feature quotes are proof of a wrong field."** They are not, on their
  own — some sentences legitimately state two facts. Reported as a detector
  with a measured count, not as 3,007 errors.

### Where the loop goes next

1. Gate `matchText` on having found a formula, or label the quote as context.
   4,350 digit-free quotes is the floor and it is a one-condition change in
   `app.js`, not a parser cycle.
2. Ingest the plan-entity type and suppress single-plan design claims on
   MEPs/PEPs.
3. Read the next filings for the *value*-level twin of §5: how much employer
   stock and stable value is missing corpus-wide. It is measurable from stored
   ratios plus 4i totals and is likely the largest single missing-dollars class
   after the statement-page defects.

### Addendum, same day — batch 15, and one class measured down to size

Batch 15 (10 filings, $2.0B–$1.7B): 4 ISSUER_DROPPED, 5 NAMES_MATCH,
1 WRONG_REGION. Running total tested by the script: 58.

**A candidate class that the corpus refused to support.** FirstEnergy
`20250731064450NAL0002381251001` ($2.9B, `confident`, ratio 0.94) displays a
menu that contains no funds:

```
872,225,750  Large cap stocks
799,229,580  Blend of stocks, fixed income
384,839,458  FirstEnergy common stock
226,152,423  International stocks
173,820,730  Equities, fixed income
138,156,056  stocks
147,946,737  Balanced fund
```

Those strings are the *Description of Investment* column. The current filing's
text layer is the broken-font cipher class, and decoding enough of it shows the
same rows as identity `'&-*&'$! +/#$) 3!0)2` (BLACKROCK LIFEPATH INDEX FUND W,
eight vintages) against description `B;D:E<IJE9AI <?N;:?D9EC;` — "Blend of
stocks, fixed income". So the reader of a $2.9B plan is shown asset-class
phrases where the filing names BlackRock LifePath vintages.

It looked like a large class. It is not. Scanning all **1,636,130 stored fund
rows in 61,092 lineups** with a deliberately narrow whole-string
category-only vocabulary: **2,497 rows, in only 44 lineups with three or more
such names, holding $5.2B.** And most of those 44 are false positives —
"Domestic Equity", "Core Bond", "Stable Value" are the actual names of
white-label options in plenty of plans, indistinguishable from a description
column by string alone. Recorded as: real, specimen-backed, **small**, and not
separable from legitimate white-label menus without column (a).

Two tester notes from these three WRONG_REGION filings, both already-known
blind spots now with specimens: FirstEnergy scores WRONG_REGION because its
stored lineup came from the plan's **2023** filing (`source` says so, the ack
does not), and the 2024 PDF it was tested against is font-ciphered so no stored
name could ever match. `20250926144818NAL0013938530001` scores WRONG_REGION
because every stored name carries the glued cost suffix `$0.00` (CHS, the known
class). Neither is a region error.

## (10 fund report) #14 — 2026-08-24 — the sponsor's EIN is on the page as money

Batch 16 (10 filings, $0.6B–$0.5B): 5 NAMES_MATCH, 3 ISSUER_DROPPED,
1 WRONG_REGION, 1 PRIOR_YEAR_SOURCE. Running total tested by the script: 128.

Three filings read structurally — every schedule title, column header and note
heading — and all three carried something the previous thirteen reports had not
named. Two of the three findings are **fabrications**: dollar figures on the
page that are not money at all. All counts below are over the **whole stored
corpus** (1,627,519–1,636,130 fund rows in 64,606 lineups; 62,377 of those
lineups carry features), not a sample.

### 1. 1,921 holdings whose value is the plan sponsor's own EIN — $4.22B

Specimen, Mass General Brigham `20260702112746NAL0014451521001`. Its 4i
attachment ends with a cover sheet:

```
 Plan Name               The Consolidated 401(a) and 401(k) Program of Mass General Brigham
 Plan Sponsor EIN        04-3230035
 ERISA Plan #            500
 Plan Year Ending        September 30, 2025
```

The schedule is stated "($ in thousands)". wampo stores a holding named
**"ERISA Plan" worth $500,000** — the plan number, 500, scaled by a thousand.

That is one instance of a much larger exact class. The EIN itself lands in the
value column far more often, because the layout splits it: the label and the
two-digit prefix stay left, the seven digits after the hyphen sit where a value
belongs. Scanning **every stored fund row** for a value equal to that plan's own
sponsor EIN (last seven digits, or all nine):

| | |
|---|---:|
| holdings whose value **is** the sponsor's EIN | **1,921** |
| lineups affected | **1,802** |
| fabricated dollars | **$4,220,282,954** |
| …of which sit in `confident` lineups, i.e. shown as the plan's menu | **1,598 lineups, $2,989,639,761** |
| lineups where the fabricated row is the **largest holding on the page** | **392** |

Six confirmed by cross-checking the EIN in `plans-all.json`, all six exact:

```
EIN 23-7268394  ->  "Plan Sponsor EIN: 23-"     $7,268,394   ICMA-RC
EIN 84-0858329  ->  "Plan Sponsor EIN: 84-"       $858,329   IMI Americas
EIN 43-1383893  ->  "Plan Sponsor EIN: 43-"     $1,383,893   Esse Health
EIN 04-3599000  ->  "PLAN SPONSOR EIN - 04-"    $3,599,000   Quotient Sciences
EIN 81-1010753  ->  "Plan Sponsor ID # 81-"     $1,010,753   Bayberry Financial
EIN 42-0150820  ->  "Plan Sponsor EIN:"           $150,820   Pro Cooperative
```

This cannot be coincidence and the arithmetic says so: a specific seven-digit
number recurring by chance across 1.6M rows has an expectation near 0.2 rows,
against 1,921 observed. All 1,921 names were inspected against a fund
vocabulary; the 36 that matched are plan names and header fragments
("BERGER CHEVROLET, INC. 401(K) PLAN & TRUST 38-"), not funds. **There are no
true positives in the class.**

It is also the first fabrication with a *free, exact* detector: the pipeline
already knows the sponsor's EIN. Shipped this cycle as a display guard in
`app.js` (`dropFormNumberRows`) — no parser change, smoke test green.

The ZIP-code variant report #13 found twice by hand is now measured too:
**97 rows in 96 lineups, $5,252,738** — holdings named
`"Houston, Texas"` ($77,002), `"Bethesda, Maryland"` ($20,814),
`"H&R Block, Inc. One H&R Block Way Kansas City, Missouri"` ($64,105). Small
money, and deliberately **not** filtered: a five-digit ZIP collides with a
plausible small holding often enough that a display guard would start deleting
real rows. That one needs the parser.

### 2. 32,346 fund names carry the cost column's "N/R" — $150.7B of holdings

ACI Worldwide `20250923101453NAL0005573025001` files a textbook schedule:

```
 (a)         (b) Identity of Issue, Borrower,   (c) Description of Investment    (d)      (e)
             Lessor or Similar Party                                             Cost     Current Value
 *           Fidelity Investments               500 Index Fund                   N/R  $   96,773,304
             BlackRock                          LifePath Index 2035 Fund         N/R      33,121,021
...
N/R - cost omitted for participant directed investments
```

Every one of wampo's 27 stored holdings for this plan is named
`... N/R` — `"500 Index Fund N/R"`, `"LifePath Index 2035 Fund N/R"`. Corpus
count: **32,346 rows in 1,286 lineups, $150,733,000,000**, plus **949 rows in
35 lineups** ending in `$0.00` (the same defect where the auditor printed a zero
cost instead of a marker). Nothing in `app.js`, `lib-4i.mjs`, `fund-er.js` or
`match-sec-tickers.mjs` mentions `N/R`.

This is not only ugly. The fund name is the key for the ticker index and for the
expense-ratio pattern table, and neither can match a name with a cost marker
glued on, so the whole class silently loses its ticker and its ER estimate.
Stripped at display this cycle (`cleanCostMarkers`); "NR" without the slash is
left alone because it can be a share class.

**It also produced a false verdict in my own tester**: the batch scored ACI
`WRONG_REGION — 0/12 stored names appear in the filing text`. Every stored name
*is* in the filing; none matches with " N/R" appended. Add it to the blind-spot
list beside prior-year and OCR sources.

### 3. Column (a) is the party-in-interest marker. The issuer is column (b).

Both filings label their columns explicitly, and both agree with the Form 5500
instructions: **(a)** party-in-interest, **(b)** identity of issue, **(c)**
description of investment, **(d)** cost, **(e)** current value. The inventory
and every report since #8 call the dropped issuer column "column (a)". That
name is wrong, and it collides with a *different* inventory row — the
party-in-interest asterisk, which is the real column (a). Corrected in the
inventory; the defect is unchanged, its name was not.

### 4. Three contradictions computable from what wampo already stores

None of these needs a filing. They are labels that disagree with the evidence
printed underneath them, or with a second filed field.

**(a) Eligibility says immediate; its own quote states a waiting period —
991 lineups** (of 9,849 labelled immediate). Six Continents Hotels
`20251015085526NAL0002047779001` renders

> Eligibility ✓ **Upon hire / immediate**
> "Employees of the Company generally become eligible to join the Plan on the
> first day of the month following the completion of **6 months** of employment."

Others in the class quote three months, 90 days, 60 days, or an age-21
condition. **Fixed this cycle**: when the label asserts immediate entry and the
quote states a wait and never says otherwise, the label is withheld and the
filing's sentence stands alone.

**(b) The match is "Discretionary" on a plan whose own entry says safe
harbor — 946 lineups** (of 11,012 discretionary labels). Same filing. wampo
stores `match: "Discretionary — set year to year"` *and* `safeHarbor: "match"`
simultaneously, quoting an accounting-policy sentence — "The Company safe
harbor matching and discretionary matching contributions are considered payable
to the Plan when the related participant's contributions are payable" — which
states an accrual convention, not a formula. The filing's actual match:

> "the Company makes a **safe harbor matching contribution** to the Plan equal
> to **100% of a participant's contribution limited to 6%** of the
> participant's eligible compensation … For IHG eligible hotel employees …
> **limited to 4%** … Safe harbor matching contributions totaled **$18,993,509**
> for the year ended December 31, 2024."

A design-based safe harbor match is fixed in the plan document; "the employer
decides year to year" is the opposite claim. Not fixed — which of the two labels
to keep is a judgement I will not make unattended.

**(c) The match is "Discretionary" while Schedule R line 21b says design-based
safe harbor — 1,488 lineups** (7,667 more are `A`, ADP-tested, where
discretionary is consistent). This is the same contradiction reached from an
independent filed source rather than from wampo's own second field; the two
counts overlap by an amount I did not compute.

### 5. Non-holdings presented as holdings, beyond the EIN class

Same MGB schedule, its last row:

```
 *   Participant Loans
     Total participant loans   Participant Loans Interest From 3.25% To 8.50% With Maturity
                               Dates Ranging From October 2025 To November 2044      1,213
```

The description wraps, the value sits on the second line, so wampo stores a
holding named **"Dates Ranging From October 2025 To November 2044"** worth
$1,213,000. Corpus counts:

| pattern | rows | lineups | value |
|---|---:|---:|---:|
| loan-description continuations (`maturing through…`, `interest rates range from…`) | 2,871 | 2,856 | $5.62B |
| bare date fragments (`June 2031`, `November 2034, With Interest Rates Ranging From 4.25% to`) | 596 | 589 | $1.19B |
| schedule-header metadata (`Plan Sponsor EIN: 23-`, `ERISA Plan`) | 383 | 378 | $775M |

The first two carry a *correct* value — the loan balance — under a fabricated
name, so they are a naming defect, not invented money. The third is the EIN
class above, reached by name instead of by value.

### 6. Thousands-scaled schedules have a $100,000 floor

MGB's schedule lists **65 holding rows**; wampo stores **34**, and the missing
30 are almost all small: 28 of them are under $100 thousand. The reason is one
regex. `lib-4i.mjs:118` requires at least three characters in the value —
`/\$?\s*([0-9][0-9,]{2,})(?:\.\d{1,2})?\s*$/` — which in a "($ in thousands)"
schedule means **any holding below $100,000 is unmatched**. The arithmetic
closes exactly: filing total $645,069K, minus the 30 dropped rows ($953K), plus
the fabricated "ERISA Plan" row ($500K), equals the stored sum of $644,616K.

So the entry reconciles to **99.93%** of the plan and `coverageRatio` reports
`1`. Last night's coverage note would tell a reader this table is the whole
plan. In dollars it nearly is; in holdings it is 34 of 65. **Share of assets is
not share of holdings, and the new note only claims the first.**

Scope, stated because it bounds the finding: only **207 lineups (5,316 rows)**
are thousands-scaled at all. Real, exactly explained, and **small**.

### 7. Who the plan actually covers is never on the page

Two of three filings restrict coverage in their Description of Plan and wampo
shows nothing:

- MGB, a plan filed by a $20B health system, "cover[s] all eligible employees of
  Newton-Wellesley Hospital who are members of the **Massachusetts Nurses
  Association bargaining unit** and all eligible employees of Martha's Vineyard
  Hospital who are members of the **SEIU bargaining unit**", plus the frozen
  assets of eleven merged-in plans. Sponsor and plan name imply the whole
  system; the notes say two bargaining units.
- Allied Universal `20251002102450NAL0000272179001` (258,360 participants):
  "Employees who are union members covered under a collective bargaining
  agreement … non-resident aliens, or residents of Puerto Rico, are not eligible
  … Additionally, **the Plan prohibits highly compensated employees … from
  making elective contributions.**"

An HCE ban on deferrals is a first-order design fact and there is no field for
it anywhere in what wampo stores. Not measured corpus-wide — it lives in prose
the pipeline reads but does not keep, so measuring it means re-reading filings.

Allied Universal is also a fourth instance of the scoped-formula problem, from a
new direction: its real match is **"20 cents, 25 cents, and 50 cents for each
dollar … for participants with less than 10 years, greater than 10 but less than
19 years, and more than 19 years of service … For administrative personnel
only"**, and for everyone else "the Company offers a match if an employee meets
certain requirements, such as holding certain primary jobs". wampo shows
"Discretionary — set year to year" — quoting the one sentence about a
discretionary match that the filing then explicitly negates: "**There were no
discretionary matching contributions for the year ended December 31, 2024.**"

### 8. Reconciliation of financial statements to Form 5500

A note heading present in all three filings and absent from the inventory.
Allied Universal:

> Net assets available for benefits **per the financial statements** $689,106,319
> Less: Employer contribution receivable (5,560,357)
> Less: Participant contribution receivable (2,092,064)
> Net assets available for benefits **per Form 5500** $681,453,898

wampo shows the Form 5500 figure. That is the right choice, but the note is the
only place a reader can learn why the audited statements say a different number
— and on other filings the reconciling items are deemed distributions of
defaulted loans and benefits payable, which are facts in their own right.

### What was disproved this cycle

- **"Reconstructed vesting tables repeat a year, so the `<` is being dropped."**
  A first pass counted **4,762** tables with a duplicated year. Nearly all are
  the detector's fault: the extractor renders the bound as *"less than 1 yr:
  0%, 1 yr: 20%"* and my `(\d+) yr:` pattern matched inside "less than 1 yr".
  Requiring a *bare* repeated year leaves **138 of 11,801** — e.g.
  `"5 yr: 80%, 5 yr: 100%"`. Real, and two orders of magnitude smaller than the
  first number. Recorded because the first number is exactly the kind that gets
  quoted.
- **"WRONG_REGION on ACI Worldwide."** False. The stored names are the filing's
  names with the cost column's `N/R` appended; the region is correct. A tester
  artefact, now understood (§2).
- **The category-noun class from #13 is not what killed MGB's small rows.** It
  is a plain value-regex floor (§6), and it is confined to 207 lineups.

## (10 fund report) #15 — 2026-08-24 — a $8.7 billion fund called "CUSIP:"

Batch 17 (10 filings, all ≈$0.5B): 6 ISSUER_DROPPED, 2 NAMES_MATCH,
1 WRONG_REGION, 1 OCR_SOURCE. Running total tested by the script: 138.

The WRONG_REGION filing was not a plan at all — `20251013155830NAL0000793475001`
is **THE PITNEY BOWES RETIREMENT PLANS TRUST**, whose stored "menu" is eighty
individual Treasury issues, futures contracts and a securities-lending line.
Pulling that thread produced the largest fabrication yet measured.

### 1. Thirty plans, 1,356,613 participants, are shown a holding named "CUSIP:"

Custodian statements print each security over two lines:

```
 ABBOTT LAB COM                             67,149.000    6,612,183.33    7,595,223.39
 CUSIP: 002824100
 ACADIA HEALTHCARE CO INC COM               30,870.000    1,555,269.41    1,223,995.50
 CUSIP: 00404A109
```

Where the parser takes those identifier lines as rows, every one of them
reduces to the same residual name and dedup — the Stanley Black & Decker
mechanism from report #13 — sums them into a single holding. The Kroger Co.
Defined Contribution Plan Master Trust, whose 4i is a **206-page Northern Trust
security-detail statement containing 1,165 `CUSIP:` lines**, produces:

```
 8,696,053,053   | CUSIP:
    17,186,887   | VISA INC COM CL A STK
     6,156,875   | WALT DISNEY CO
     3,462,832   | WELLS FARGO & CO NEW COM STK
     2,575,356   | SEDOL: BPGMZQ5 VERIZON COMMUNICATIONS COM
```

`confident: true`, `coverageRatio: 0.87`. **The string 8,696,053,053 appears
nowhere in the filing** — checked across the full text extraction. It is not a
mislabelled real total; it is a sum of rows that were never holdings.

Measured by **what a reader actually sees** — for every plan, the lineup wampo
would display, own entry or master-trust fallback:

| | |
|---|---:|
| plans whose displayed table contains an identifier-label row | **30** |
| participants in those plans | **1,356,613** |
| plan assets | **$134.2B** |
| plans where such rows are **more than half** the table | **25** (902,054 participants) |
| distinct lineups affected | **19** |
| distinct dollars under an identifier label | **$59,223,106,612** |

(The per-plan sum is $116.6B, but sister plans share a trust; $59.2B is the
distinct figure and the one to quote.)

The largest, by participants:

```
  377,504  32%   HCA 401(K) PLAN                                    $9,544,212,396
  262,794 100%   THE KROGER CO. SAVINGS PLAN                        $8,699,166,102
  160,358 100%   THE KROGER CO. 401(K) RETIREMENT SAVINGS ACCOUNT   $8,699,166,102
  137,769  99%   MARRIOTT RETIREMENT SAVINGS PLAN                   $6,698,568,702
   68,903  54%   KOHL'S INC. SAVINGS PLAN                           $1,391,570,299
   60,484  61%   CATERPILLAR 401(K) SAVINGS PLAN                    $6,655,434,038
   39,176 100%   SCHLUMBERGER … SAVINGS AND RETIREMENT PLAN         $7,832,374,261
   26,098 100%   CORTEVA … RETIREMENT SAVINGS PLAN                  $6,437,069,362
   20,731 100%   THE COCA-COLA COMPANY 401K PLAN                    $3,753,005,426
```

A Kroger participant opening wampo today sees a fund menu with **one line in
it**, named `CUSIP:`, worth $8.7 billion.

**Fixed this cycle, display only, smoke green.** Rows whose name consists
entirely of identifier labels and codes are dropped (`ID_ONLY` in `app.js`).
They are not renameable — there is no name in them to recover — and what is left
is the statement's individual stock rows, which the coverage note added in #13
then correctly describes as a fraction of the plan. An honest thin table beats a
confident wrong one. A real security whose name merely contains a CUSIP keeps
its row; the pattern requires the *whole* name to be identifiers.

### 2. Futures contracts and securities-lending collateral as menu options

The same region class puts instruments in the table that no participant can
choose. The Timken Company Savings Plan for Certain Bargaining Associates (105
participants) displays a nine-row "menu" of which seven are Treasury futures:

```
 24,931,781  CUSIP: 999599GH0 FUT MAR 25 U.S. T-BONDS
 18,811,812  CUSIP: 999599GH0 FUT MAR 25 CBT ULT TNOTE
 17,835,937  CUSIP: 156ESCAN5 FUT MAR 25 CBT UL T-BONDS
 17,835,937  CUSIP: 999599GH0 FUT MAR 25 CBT UL T-BONDS   <- same position, twice
    622,977  CUSIP:
     85,114  Pending trade purchases: United States dollar
```

Two rows are the *same* futures position at the same value under two CUSIPs
(`999599GH0` is a placeholder identifier, not a security), so it is also double
counted. Pitney Bowes' trust adds `"FROM SECURITY LENDING - PARTY IN INTEREST"`
at $109,131,567 — lending collateral, which is not participant money at all.

Corpus counts: **202 rows in 91 lineups** name a futures contract
(`"Purchased Futures Contracts"` $1,087,807,083 is the largest); **30 rows in 28
lineups** are pending/unsettled trade lines (`"PENDING PURCHASES"` $6,136,324).

### 3. What was disproved

- **"Master-trust fallback routinely shows 401(k) participants a defined-benefit
  bond portfolio."** It does not. Of **369 plans** that display a master trust's
  holdings rather than their own, only **19** have any derivative or
  securities-lending row and exactly **one** — Timken above — is majority
  bonds/derivatives. Pitney Bowes, the filing that raised the question, is not
  affected: its 401(k) parses its own schedule confidently, so the DB trust is
  never displayed. The risk is real and conditional on the plan's own parse, not
  a live defect at scale. Recorded as a dependency, not a finding.
- **"The identifier rows are mislabelled subtotals."** For Kroger, no: the value
  is absent from the filing. The mechanism is dedup summation, which is why the
  class was invisible to every sum-based audit check — the sums are internally
  consistent by construction.

## (10 fund report) #16 — 2026-08-24 — the issuer column, 8 out of 10

First batch since the cadence chain lapsed at 05:52Z. Ten filings from the
issuer-targeted worklist (`docs/filing-worklist-issuer.json`, which is built to
enrich for low manager-share and so is NOT a random sample of the universe —
state the frame with the number).

    ISSUER_DROPPED   8
    NAMES_MATCH      2

**What was found.** The same defect, at scale, on large plans:

| filing | assets | issuers wampo discarded |
|---|---|---|
| 20251020143231NAL0000699057001 | $5.9B | Vanguard ×11 |
| 20250709085932NAL0003206963001 | $5.0B | Vanguard ×12 |
| 20251014135322NAL0004142848001 | $4.7B | Vanguard Fiduciary Trust ×8, Fidelity Management Trust ×1 |
| 20251001145816NAL0031932674001 | $3.7B | JP Morgan ×7, Vanguard ×3, Fidelity ×1 |
| 20251010150149NAL0008363457001 | $3.1B | Vanguard ×12 |
| 20251015122510NAL0002403219001 | $2.7B | Nuveen ×10 |
| 20251013103210NAL0000490947001 | $2.7B | Vanguard ×9, Loomis Sayles ×1, American Funds ×1 |
| 20250725145420NAL0003257235001 | $2.4B | Vanguard ×4, Northern Trust ×2, Prudential ×1, Fidelity ×1, Eaton Vance ×1, Dodge & Cox ×1, BlackRock ×1 |

**Why it is not reported.** Schedule H line 4i has column (b) "identity of
issue" and column (c) "description of investment". The parser reads (c) and
discards (b). On these filings the fund house is in (b) and only the product is
in (c), so a holding stored as "500 Index Fund" has lost the one word —
Vanguard — that makes it identifiable, and with it any chance of a ticker or an
expense ratio.

**Why a blind fix is still disproved.** Sanofi files the whole fund name in (b)
with only "Common Trust" in (c); Gen II has both patterns on adjacent lines.
Concatenating (b) and (c) universally would corrupt those. The fix has to
decide per-region which column carries the name, which is why this is still an
open parser change rather than a one-line patch.

**Machine state.** No parser change was made — a measurement was running (the
sponsor-ticker work) and the standing rule is not to move `lib-4i.mjs` or
`PARSER_VERSION` underneath one. 130 filings tested cumulatively.

## (10 fund report) #17 — 2026-08-24 21:08Z cycle — the junk that outranked a real menu

First firing of the re-armed chain. Ten filings from the GENERAL worklist
(`docs/filing-worklist.json` — assets-ranked, not a random frame), alternating
per the cycle brief.

    NAMES_MATCH      6
    WRONG_REGION     3
    ISSUER_DROPPED   1

**Confirmed by reading the filings — all three WRONG_REGION are real, and the
class is new.** The three are Harley-Davidson salaried (×2 filing years, $1.0B)
and Altria hourly ($0.9B). What wampo stored as their confident lineups:

    Harley: "Various (includes Registered"                    $951,781,293
            "Plan for Salaried Employees (Plan 4.25% to..."  $  3,918,793
            (+2 more loan rows wearing plan names)
    Altria: "Master Trust"                                    $911,730,261
            "ALTRIA CLIENT SERVICES LLC"                      $  2,929,146
            "(Full title of the plan) ALTRIA GROUP, INC..."   (11-K cover text)

**Why it was not reported correctly.** The filing puts "Interest Held in
Master Trust" in 4i column (b) and "Various (includes Registered Investment
Companies, Self Directed Brokerage, etc.)" in column (c) — primary source, line
1964 of the Harley attachment. The parser keeps (c), drops (b), so the words
"master trust" lived only in the discarded column and BOTH pointer guards
(parser trustPtr, frontend majority-name test) waved the junk through. Harley's
trust meanwhile parsed confidently with the real menu (Fidelity Contra pool,
BlackRock LifePath, SDBA) and never rendered. The column-(b) defect is not just
lost tickers — it deletes the identity the guards key on.

**Fix shipped this cycle** (frontend only; no parser change — standing rule):
the pointer test now runs whenever a trust is linked, and a name-blind shape
test (<=8 rows, one row >=60% of value) catches what the name test cannot see.
Measured before shipping: fires on 37 of 343 trust-linked plans with own
confident lineups; a sample of 10 held zero real menus (Comcast "At fair
value", Home Depot OCR cipher, United "Investments Held in the Trust").
Verified in-browser: Harley now shows the trust's 23 holdings; smoke test
green.

**Also this batch:** one more ISSUER_DROPPED at $1.1B (Vanguard ×8, Northern
Trust, Goldman) for the standing column-(b) tally. 140 filings tested
cumulatively.

## (10 fund report) #18 — 2026-08-24 21:24Z cycle — both WRONG_REGIONs were wrong about themselves

Issuer worklist batch: 4 NAMES_MATCH, 3 ISSUER_DROPPED ($2.2B Vanguard/JPM/
Empower, $2.1B Vanguard ×12, $1.6B Vanguard/Northern Trust/BlackRock), 1
OCR_SOURCE, 2 WRONG_REGION. Both WRONG_REGIONs read against the primary
source, and neither verdict survived:

**BWXT ($1.4B) — tester artefact, fourth residue pattern.** The filing:
`* Vanguard   Institutional 500 Index Trust D   —   228,484,736`. The parse
read the right region; the stored trailing " —" is the EMPTY COST COLUMN's em
dash glued onto every name, which makes the needle search fail. Fixed in
filing-batch.mjs (em/en dash added to RESIDUE). The real defect on this
filing is ISSUER_DROPPED — Vanguard is column (b), discarded. Also logged as
a v68 parser candidate: the site displays the dash ("Institutional 500 Index
Trust D —").

**Old Republic ($1.4B) — fabrication, second v67 specimen.** The filing:
`FIDELITY 500 INDEX   N/A   VARIABLE   N/A   1,056,601 sh   #   215,747,363`.
The parser stored "VARIABLE 1,056,601 sh" as all 28 names — the N/A-filler-
column layout from the SMART Local 265 candidate, now confirmed on a second,
larger plan. The real menu is readable in the first column. Values right,
names fabricated, confident, live.

150 filings tested cumulatively. The trap list already said it: before
believing a WRONG_REGION, strip the residue and read the filing — both of
tonight's would have gone into the inventory as "wrong region" and both are
something else entirely.

## (10 fund report) #19 — 2026-08-24 21:41Z cycle — "Investments at fair valuc"

General worklist batch: 7 NAMES_MATCH, 2 ISSUER_DROPPED ($0.4B Vanguard/JPM/
MassMutual/American Funds; $0.2B Fidelity ×5/DFA/Dodge & Cox), 1 WRONG_REGION.

**The WRONG_REGION (Buchanan Ingersoll & Rooney, $0.4B law-firm plan) is real
junk, and its mechanism is new.** The stored confident lineup is a
financial-statement ROLLFORWARD, not a menu: "Investments at fair valuc"
$412M (99.4% of plan), "Notes recervable from participants", "Balance
January |", "New forfeitures", "Life insurance premiums". Two lessons:

1. **An OCR typo defeats an exact-vocabulary guard.** The v44 junk sweep
   rejects "Investments at fair value" rows — spelled correctly. The OCR
   misreads ("valuc", "recervable") sailed past. v68 candidate: on ocr:1
   entries, apply the statement vocabulary with one-character tolerance.
2. **The tester's own bookkeeping hid the OCR provenance.** The entry is
   ocr:1 in the shard, but docs/filing-worklist.json predated the builder's
   fb/ocr carriage, so the batch ran a text search that could never succeed
   against a scanned filing. Regenerated the worklist with the current
   builder: 329 OCR / 191 prior-year entries now flagged of 4,000 — those
   will report as OCR_SOURCE / PRIOR_YEAR_SOURCE instead of polluting
   WRONG_REGION.

The plan has no linked trust, so the new pointer guard from report #17 does
not suppress this one — it renders today. 160 filings tested cumulatively.

## (10 fund report) #20 — 2026-08-24 21:57Z cycle — a clean batch, and "Core Bond IS"

Issuer worklist: 4 ISSUER_DROPPED, 4 NAMES_MATCH, 2 OCR_SOURCE. No
WRONG_REGION — and the two OCR filings now report themselves as OCR_SOURCE
instead of polluting the defect count, which is the #19 worklist fix working.

Spot-checked the least typical ISSUER_DROPPED (20251016012843NAL0002983475001,
$1.1B, six claimed issuers) against the filing. Lines 2080-2086:

    Tortoise         MLP & Pipeline IS        4,563,312
    Western Asset    Core Bond IS            59,808,337
    New York Life    NYL Guar Int Account    43,918,108

All real. This filing is the starkest column-(b) example yet: wampo's stored
fund names are "MLP & Pipeline IS" and "Core Bond IS" — a share class with no
manager attached identifies nothing at all. The four batches tonight put the
running issuer tally at: Fidelity x36, Vanguard x?+dozens more across 18
confirmed ISSUER_DROPPED filings since the cadence re-armed.

170 filings tested cumulatively. No new classes this cycle; no code changes.

## (10 fund report) #21 — 2026-08-24 22:14Z cycle — the #17 guard holds

General worklist: 4 NAMES_MATCH, 3 ISSUER_DROPPED, 2 WRONG_REGION, 1
OCR_SOURCE.

**Both WRONG_REGIONs are the Harley-Davidson Milwaukee & Tomahawk hourly plan**
(two filing years, same trust as report #17s salaried pair) — the identical
pointer-wreckage class. Verified the #17 frontend guard covers them: 4 rows,
top row 96.1% / 96.6% of value, trust linked and confident → shape test fires,
pages show the trusts real 23-fund menu. No new defect; the class is closed
frontend-side, and these two acks join the v68 re-parse list (the stored
entries themselves are still wreckage).

Three more ISSUER_DROPPED in the $0.2-0.3B range with unusually diverse
issuer columns — one filing drops NINE different managers (Vanguard, John
Hancock, Principal, BlackRock, Hartford, JPMorgan, New York Life...). The
column-(b) tally since re-arm: 21 confirmed filings.

180 filings tested cumulatively. No code changes.

## (10 fund report) #22 — 2026-08-24 22:31Z cycle — the fifth tester artefact: mid-name normalization

Issuer worklist: 4 ISSUER_DROPPED, 4 NAMES_MATCH, 1 WRONG_REGION, 1
PRIOR_YEAR_SOURCE (self-reported correctly).

**The WRONG_REGION (Whiting-Turner, $0.9B) was the tester's fault, and the
class is new.** The plan's 4i legitimately holds ~46 direct Treasury notes
("Government Bonds:" section, "U.S Treasury" in column (b)). The parser
stored "Treasury Notes rate 1.125% due, 02-29-2028" where the filing prints
"Treasury Notes, interest rate 1.125% due, 02-29-2028" — mid-name
normalization, so no contiguous substring can ever match, and 46
correctly-parsed rows scored WRONG_REGION 0/12. Unlike the four suffix-residue
classes, no suffix strip fixes this.

**Tester fix shipped:** a token-subsequence fallback — the stored name's
tokens must appear in order in a line carrying a value, so insertions and
punctuation stop mattering. Loose matches never feed issuer detection and are
tallied separately (`loose:` in the record). Re-test: 12/12 found,
NAMES_MATCH. The original WRONG_REGION row in filing-tests.jsonl stands as
history; this entry is the correction.

Also: another State Street Global Advisors x8 filing joins the column-(b)
tally (SSgA's own trusts, $1.0B), and two NAMES_MATCH filings still showed
dropped issuers — names match AND the issuer column exists, the mildest form
of the same defect. 190 filings tested cumulatively.

## (10 fund report) #23 — 2026-08-24 22:52Z cycle — the fourth Harley plan, and a withdrawn filing

General worklist: 4 NAMES_MATCH, 3 ISSUER_DROPPED, 1 WRONG_REGION, 1
PRIOR_YEAR_SOURCE (self-reported), 1 FETCH_FAIL.

**The WRONG_REGION is the fourth and final Harley-Davidson plan** (York
Hourly, newest filing) — same pointer-wreckage class as #17/#21. Guard check:
4 rows, top 92.8%, trust linked and confident → the shape test fires, page
shows the trust menu. The whole Harley family is now accounted for: four
plans, five filings, one defect class, display fixed, stored entries queued
for the v68 re-parse.

**The FETCH_FAIL is a withdrawn-from-bucket filing**, not a transient:
Ellenoff Grossman & Schole (law firm, $0.1B), S3 returns an AccessDenied XML
body, matching the documented "S3 403s are withdrawn filings, retried each
run via stale pv" behavior. Nothing to fix; the pipeline's own retry path
owns it.

Three more ISSUER_DROPPED filings — notable that the defect reaches down to
$0.1B plans with rich multi-manager menus (Fidelity/Vanguard/Federated
Hermes/Victory/Allspring/PIMCO on one; Invesco/Guggenheim/Franklin on
another). 200 filings tested cumulatively.

## (10 fund report) #24 — 2026-08-24 23:15Z cycle — the auditor's letterhead beat the real menu

General worklist (issuer queue retired this cycle — its question is answered
and v67 is the answer, in flight as run #156): 3 ISSUER_DROPPED (tally only
now), 2 PRIOR_YEAR_SOURCE, 2 OCR_SOURCE, 2 NAMES_MATCH, 1 WRONG_REGION.

**The WRONG_REGION (Global Tax Management, ~$40M) is a real parser miss with
a new mechanism.** The stored confident "lineup" is six rows including the
plan's AUDITOR'S LETTERHEAD as a holding — "Maillie LLP | maillie.com 500
North Lewis Road, Limerick PA" — plus bare type words ("Mutual funds",
"trust (a)"). The cause is visible in the filing: the page that carries the
"Schedule H, Line 4i" TITLE is the auditor's letterhead/report page (title
line 1380, letterhead 1381-1384), and that region outscored the REAL
schedule at the "- 14 -" page (line 2031+), which is clean and readable:
TRP Capital Appreciation $11.0M, Vanguard index funds, MetLife stable value
— names in column (b), types in (c). v68 candidate #3: auditor-letterhead
vocabulary as region poison ("LLP | domain", PO Box rows). Note the real
table is a TYPE-in-(c) layout, so once the right region wins, v67's issuer
handling already stores its names correctly.

No tester artefacts this cycle — the five fixed classes stayed fixed. 210
filings tested cumulatively. v67 re-parse in flight (run #156, queued
23:18Z); cycles hold all scripts/** pushes until it lands.

## (10 fund report) #25 — 2026-08-24 23:36Z cycle — quiet, and correctly quiet

General worklist: 4 PRIOR_YEAR_SOURCE, 3 OCR_SOURCE, 3 ISSUER_DROPPED.
No WRONG_REGION, no new classes, nothing requiring hand confirmation —
every verdict is a self-explaining known class, which is the tester
working as calibrated after five artefact fixes. The three issuer-dropped
filings (Vanguard/Nuveen/JPMorgan-heavy, all sub-$100M) go to the tally
only: v67 is re-parsing the universe right now and fixes the class.

220 filings tested cumulatively. v67 re-parse (run #156) in flight;
scripts/** frozen until it lands.

## (10 fund report) #26 — 2026-08-25 02:36Z cycle — the first cycle where the fix reports itself

First batch after v67 landed: 3 NAMES_MATCH, 5 ISSUER_KEPT, 1
PRIOR_YEAR_SOURCE, 1 OCR_SOURCE. Zero WRONG_REGION, zero ISSUER_DROPPED.

**ISSUER_KEPT is new this cycle, and it exists because the tester was
reporting a fixed defect.** The 02:20Z batch returned four ISSUER_DROPPED
verdicts; checking the stored entries showed all four now carry `iss` on
80%+ of rows (Vanguard | Total Stock Mkt Idx Adm, Comerica Bank & Trust |
Balanced Portfolio Class B...). The verdict was asking "does the filing
print an issuer?" when the question is "did we keep it?". The worklist
builder now carries `issShare` and the tester reports ISSUER_KEPT when the
stored entry already has it. Five filings in this batch — Fidelity x11 on
one, Vanguard x7 on another — are now confirmations that v67 works rather
than defect reports.

**A second, smaller self-correction in the same cycle:** ISSUER_KEPT rows
still printed "issuers dropped:" underneath, which is the same stale claim
one layer down. The label now follows the verdict and shows the stored
share.

230 filings tested cumulatively. v68 shipped (commit 64f86475) and
re-parsing as run #157; scripts/** frozen until it lands, docs commits
[skip ci] only.

## (10 fund report) #27 — 2026-08-25 02:53Z cycle — two billion-dollar plans showing junk, both fixed

General worklist, and the largest plans yet tested: 5 NAMES_MATCH (including
two $45.2B filings and a $19.8B, all clean), 2 PRIOR_YEAR_SOURCE, 1
OCR_SOURCE, 2 WRONG_REGION — both real, both fixed this cycle as v69.

**MetLife 401(k), $8.3B — 58 holdings wearing their maturity dates as
prefixes.** Stored: "01-29-2031 BRITISH COLUMBIA(PROVINCE OF)CANADA 1.3%
01-29-2031". The filing prints columns (b) and (c) as the SAME text, and the
security's own name carries a wide internal gap, so splitNameDesc cut
mid-name and the description's leading date fragment became the start of the
fund name. Fixed: a description that merely repeats the identity loses to it.

**Honeywell 401(k), $12.5B — the plan was showing the BLANK FORM.** Ten rows
of Form 5500 template placeholder: "Charlotte NC 28202ABCDE CITYEFGHI
ABCDEFGHI AB, ST" at $12,345,678,901, 99% of the table. The trap list already
says the form's QUESTION text is never evidence; this is its SAMPLE ANSWERS
parsing as data. Fixed by matching either half of the signature (alphabet run
in the text, or a literal 12345/123456789/1234567890 value). Worth noting the
v67 shape guard did NOT cover it — 10 rows exceeds its <=8 limit, which is
the honest limit of a shape rule.

**A self-correction the gate caught.** The first MetLife fix tested plain
containment — "does the description contain the identity?" — which is the
ordinary CORRECT layout ("American Funds | Growth Fund of America R6").
Plexsys collapsed 32 rows to 3 bare manager names and Power Design 27 to 15
(same sum: the signature of a dedup collapse, not a parse failure). The rule
is now narrow: remove the identity from the description, require fewer than
four LETTERS to remain. Dates and punctuation are not information.

Gate 20/20 green throughout. v69 is committed with [skip ci] and ships once
run #157 (v68) lands. 250 filings tested cumulatively.

## (10 fund report) #28 — 2026-08-25 03:11Z cycle — the defect the tester cannot see

General worklist, billion-dollar band: 7 NAMES_MATCH, 2 PRIOR_YEAR_SOURCE,
1 OCR_SOURCE. Zero WRONG_REGION, zero ISSUER_DROPPED — and that clean sheet
is what exposed the finding.

**Five of the ten are billion-dollar plans whose entire "menu" is four to
eight ASSET-CLASS labels**, and every one scored NAMES_MATCH:

    ratio 0.97, top 78%  "Common collective trust funds"
    ratio 1.04, top 97%  "Participant-Directed Investments - Interest in..."
    ratio 0.90, top 99%  "INVESTMENTS (at Fair Value)"
    ratio 0.97, top 87%  "CNA 401k PLAN"
    ratio 0.88, top 53%  "Registered investment companies, at fair value"

They pass every check the machine has. The label IS printed in the filing;
the class IS worth that much; coverage ratio is ~1.0. NAMES_MATCH asks "is
what we stored real?" and the answer is yes. It never asks "are these
FUNDS?" — so a whole class of misrepresentation has been invisible to the
instrument this whole time. Measured universe-wide: **380 plans** have class
rows worth ≥50% of their table.

**The fix is not in the parser, and the gate proved it.** I wrote a
parser-side guard to drop bare class rows; it failed three specimens —
Verizon trust 12→10 rows, Old Republic 30→11, carry-forward 7→6. Master
trusts legitimately FILE class-level detail, and deleting those rows discards
the only holdings information those filings give. Reverted.

**So the rows stay and the claim changes.** The page now says the filing
reports asset-class totals rather than individual funds, names the classes in
the reader's own words, and states that the fund lineup is not public in this
filing. An honest gap in the FILING, now labelled as one instead of dressed
as a menu. Verified rendering on the NYDCC annuity plan ($3.7B, 55%).

Two parser fixes also landed in v69 from this cycle: "INVESTMENTS (at Fair
Value)" (the parenthesised statement row) now matches the v44 guard.

260 filings tested cumulatively. Gate 20/20 green; smoke green.

## (10 fund report) #29 — 2026-08-25 03:27Z cycle — the quiet batch, checked properly

8 NAMES_MATCH, 2 OCR_SOURCE. Nothing flagged — so, per report #28, I checked
what the rows ARE rather than trusting the clean sheet:

    n= 9 class%= 1  "Investments in Master Trust"        (x3, trust pointers)
    n= 9 class%=68  "Mutual funds"                       <- class table
    n= 4 class%=47  "(a) Investments using NAV (CCT funds)"
    n=15 class%= 0  "Balance Forward from Page 12"       <- REAL DEFECT
    n=13 class%= 0  "Multi-strategy funds"

**"Balance Forward from Page 12" was a $0.5B plan's top holding.** The v44
carry-forward guard anchored at the end of the name, so the page reference
kept the row alive — and since the same-name dedup SUMS distinct values,
several per-page carry-forwards compound into one large fake fund. Fixed in
v69; "Forward Air Corporation Common Stock" verified still parsing. Gate
20/20.

The two class-label rows are the report #28 family: the frontend now labels
those tables as asset-class totals rather than a menu, and the gate refused a
parser-side deletion because master trusts legitimately file class detail.
The three "Investments in Master Trust" tables are trust pointers already
covered by the v67 shape guard.

270 filings tested cumulatively. This cycle is the argument for the #28
lesson: a batch with zero flagged verdicts still contained a defect that had
been sitting in the largest row of a half-billion-dollar plan.

## (10 fund report) #30 — 2026-08-25 04:00Z cycle — "of year", and v68's verdict read

5 NAMES_MATCH, 4 PRIOR_YEAR_SOURCE, 1 ISSUER_KEPT (Vanguard x5, PIMCO x2,
American Funds, DFA, Fidelity, BlackRock — stored on 75% of rows, v67
confirmed working again).

Ran the #28/#29 check on the quiet verdicts, and it paid again:

    n= 6 class%=29  "Collective Investment Trust Fund"
    n= 6 class%=83  "Mutual Funds"                      <- class table
    n= 6 class%= 0  "INVESTMENTS (at Fair Value)"       <- v69 fixes
    n= 4 class%= 0  "of year"                           <- NEW DEFECT
    n= 9 class%= 3  "Investments in Master Trust"       (trust pointer)
    n=21 class%= 0  "Vanguard"                          <- bare manager name

**"of year" was a $0.3B plan's top holding** — the tail of a wrapped "…at end
of year" heading, four characters past the minimum-length check and made of
nothing but function words. Fixed as v70: a name that is only prepositions
plus a generic time/scope noun names nothing. Verified that "Fund of Funds
Growth Portfolio" and "Bank of America…" still parse. Gate 20/20.

**Noted, not yet fixed:** a row whose NAME is a bare manager ("Vanguard") on
a 21-row entry. Since v67 stores the manager separately as `iss`, a name that
is only a manager is likely a header leak — but one instance is not a
measurement, and the last two attempts to generalise from one specimen were
both refused by the gate. Watching for a second.

**Also this cycle: v68's re-parse verdict was read and mirrored** (see the
accuracy log). +20 confident, and nine of ten losses were a v68 bug of mine,
not junk — the filler strip had eaten "Variable Annuity Contract". v69 ships
that repair and is re-parsing now as run #158.

280 filings tested cumulatively.

## (10 fund report) #31 — 2026-08-25 04:18Z cycle — measuring beat guessing

4 NAMES_MATCH, 2 OCR_SOURCE, 2 ISSUER_KEPT (82% and 75% of rows), 1
PRIOR_YEAR_SOURCE, 1 WRONG_REGION (Cravath — master-trust statement lines,
the known pointer class).

Row-quality check surfaced "Collectiv e Inv estment Trust" — spaced-letter
OCR damage, the long-noted SMART Local class. Instead of fixing from that one
specimen (the last two single-specimen generalisations were both refused by
the gate), I MEASURED the pattern across all 1,638,473 stored rows. It came
back 0.19% and mostly false positives — and the false positives were the
finding:

    459  4i COLUMN HEADER fragments stored as fund names
    758  participant-LOAN prose fragments

Both fixed as v70. The header rule STRIPS rather than drops, because one
instance reads "par, or maturity value Fidelity Government" — the header ran
into the next row's real name, so stripping recovers the fund.

Two of my own bugs caught by the gate on the way: unanchored strips turned
"Parnassus Core Equity Fund" into "nassus Core Equity Fund", and a truncated
header eroded to the bare word "maturity". Both fixed by requiring a real
header PHRASE before touching the name, and rejecting a remainder that is
itself header vocabulary.

The spaced-letter class remains UNFIXED and that is deliberate: the
measurement says it is rare, and merging letter fragments risks damaging real
names ("Class A", "Fund I", "TR B").

290 filings tested cumulatively. Gate 20/20.

## (10 fund report) #32 — 2026-08-25 04:35Z cycle — 12,850 holdings named after their manager

8 NAMES_MATCH, 1 OCR_SOURCE, 1 PRIOR_YEAR_SOURCE. No flagged verdicts — and
the row-quality check found the biggest naming defect since the identity
column itself.

"Great Gray" appeared as a 25-row entry's TOP holding: the second instance of
the bare-manager class first seen at 04:00Z. Per report #31, I measured
before fixing — and the first measurement was contaminated (it stripped
trailing "Fund", making real American Funds products look like manager
names). Re-measured exactly:

    12,850 rows / 1,638,473 named nothing but a manager
     5,392 entries affected (8.3% of all entries)
     Vanguard 1,928 · Fidelity 1,827 · American Funds 1,342 · BlackRock 492

Then read the filing: `Great Gray | Index 2040 R | ** | 12,945,215`. The
description column needed EIGHT letters to be preferred; "Index 2040 R" has
six. So it was rejected, the row fell back to the identity column, and every
target-date vintage in that plan became "Great Gray". The floor was
excluding exactly the names it should protect — a vintage is mostly digits.

Fixed as v70: when the identity column is ≤3 words (a house name), a
description with four-plus letters plus a digit or a second word is the
product. Verified: "Great Gray | Index 2040 R", "Blackrock | U.S. Debt Index
1", type-only descriptions still rejected. Gate 20/20.

300 filings tested cumulatively. Every check the system had was satisfied by
these rows — name printed, value right, ratio right, NAMES_MATCH. Only "is
this a FUND?" found it.

## (10 fund report) #33 — 2026-08-25 04:51Z cycle — a subtotal wearing OCR damage as a disguise

9 NAMES_MATCH, 1 PRIOR_YEAR_SOURCE. No flagged verdicts; the row-quality
check found two things.

**"Tota l mutua l funds" was a stored holding.** It is the schedule's SUBTOTAL
row, and the spaced-letter extraction damage carried it straight past every
`^total` guard. Measured universe-wide: 58 rows squash to a leading
"total"/"subtotal" once spaces are removed — "T otal assets", "Tot al cont r
i but i ons", "To tal In ve stm e n t A sse ts". A subtotal is worse than a
bad name: it DOUBLE-COUNTS the rows it summarises, inflating the table and
the coverage ratio that judges it.

Fixed as v70, firing only on the damage signature — squashed name starts with
"total" AND the raw name contains a single-letter word. A real fund
("To Talent Fund") squashes to "totalent" but has no lone letter, so it is
untouched. Verified both ways; gate 20/20.

This also settles the spaced-letter class left open in report #31. Merging
the fragments back into words is still unsafe ("Class A", "Fund I", "TR B"),
but the damage does not need repairing to be DETECTED — squashing is enough
to recognise a subtotal. Detect, don't repair.

**Second: the frontend class vocabulary had gaps** this batch exposed —
"Common Collective Trusts" (plural, no "funds"), "Collective Trust Funds",
"Shares of registered investment companies", "equity shares". Widened, and
verified it still excludes real funds: "Mutual of America" (an insurer),
"Great Gray Index 2040 R". Smoke green.

310 filings tested cumulatively.

## (10 fund report) #34 — 2026-08-25 05:28Z cycle — "Gra nd tota l", and v67 visibly working

7 NAMES_MATCH, 2 PRIOR_YEAR_SOURCE, 1 ISSUER_KEPT. The row-quality check
shows v67+v70's identity handling paying off across the batch:

    Matrix Trust Company | RetirementTrack Moderate 2055 Fund CI R2
    Vanguard             | Wellington Admiral
    Minnesota Life       | BlackRock LifePath Index 2050 Instl

Those are issuer + product, exactly the shape the pipeline was losing a day
ago.

**"Gra nd tota l" was a stored holding** — a grand-total row whose spaced
letters carried it past yesterday's own fix, because that guard squashed the
name and tested for a leading "total", and "grandtotal" starts with "grand".
Prefix set widened to grand/net/sub. Break case verified: "Grand Slam Growth
Fund Class A" and "Total Return Bond Fund Class I" both survive. Gate 20/20.

Also widened the frontend class vocabulary for "Mutual funds, at fair value"
— the anchored form missed the trailing qualifier. Smoke green.

**Worth naming:** this is the third consecutive fix where the defect was a
NARROWER VERSION OF ONE I HAD JUST SHIPPED — singular vs plural "total",
single-letter vs two-letter damage, "total" vs "grand total". A guard written
from one specimen matches that specimen's exact spelling. The habit that
catches it is the row-quality check on the next batch, not more thought at
write time.

320 filings tested cumulatively. v70 re-parsing as run #159.

## (10 fund report) #35 — 2026-08-25 05:45Z cycle — the footnote, and a contaminated measurement caught in time

9 NAMES_MATCH, 1 OCR_SOURCE. Row-quality check shows the identity work
holding up — "Vanguard | 500 Index Admiral", "Fidelity | 500 Index Fund",
"Vanguard institutional Target Retirement 2035" — and surfaced two things.

**"Indicates a party-in-interest." was a 21-row plan's TOP holding.** Every
4i schedule closes with "* Indicates a party-in-interest as defined by
ERISA", and the leading asterisk is stripped upstream as the
party-in-interest MARKER — which is exactly what lets the sentence through as
a name. Measured: 107 rows across the universe, in five spellings
("Represents…", "Denotes…", "Party-in-Interest"). Fixed in v71.

**"Great Gray Trust Company" was still a top row** — the bare-manager class
v70 addressed, but v70's rule required an identity column of ≤3 words and
this one is four. Widened to include institution-suffixed houses (Trust
Company, Bank, Advisors, Asset Management).

**And the measurement that would have caused real damage.** Counting
institution-suffixed names returned 3,034 rows — but the examples were
"Genuine Parts Company", "Hess Corporation", "DFA International Small
Company". Those are EMPLOYER STOCK and a real fund. Dropping that class would
have deleted a plan's own company stock from its holdings table. So nothing
is dropped: the rule only decides WHICH COLUMN WINS, and rows whose
description is type-only ("Common Stock") keep their own name. Verified
exactly that: Genuine Parts and Hess survive intact while Great Gray resolves
to "Index 2040 R".

That is the second time in three cycles that reading the measurement's
EXAMPLES — not just its count — stopped a bad fix. The count says how big;
only the examples say whether it is what you think.

330 filings tested cumulatively. Gate 20/20. v70 re-parsing as #159; v71
committed behind it.

## (10 fund report) #36 — 2026-08-25 06:06Z cycle — fixing the fix's shape, not another instance

5 NAMES_MATCH, 3 PRIOR_YEAR_SOURCE, 1 ISSUER_KEPT (78% of rows: DFA x3,
Vanguard x3, Hartford, Baird, BlackRock, JPMorgan), 1 OCR_SOURCE. The
identity work continues to read correctly — "CuraFin | Disciplined Risk
Balanced Fund", "Vanguard | Int-Term Bd Indx Adm".

**"Pooled separate accounts, at fair value" escaped the class check** — and
the trailing-qualifier tolerance for exactly that shape was added ONE CYCLE
EARLIER, for "Mutual funds, at fair value". I had appended it to a single
alternative instead of the whole set.

So this cycle's fix is structural rather than another instance: the class
vocabulary is now built as a list, with the ", at fair/contract value"
qualifier applied ONCE to the whole alternation. Any class label added later
inherits it. Verified both directions — every qualifier variant is caught,
while "Mutual of America" (an insurer), "Great Gray Index 2040 R" and "Common
Stock Fund" are correctly NOT class labels. Smoke green.

This is the fourth consecutive too-narrow fix, and the first one where the
answer was to change the SHAPE of the rule rather than add another spelling.
The standing lesson gains a corollary: when a guard has been widened twice,
stop widening and restructure it so widening is not needed a third time.

**Noted, not fixed:** "American Funds" is still the top row of a 23-row entry
whose other rows carry issuers correctly (78%). That looks like a section
HEADER rather than the manager-fallback class v70/v71 handle, and one
instance is not a measurement.

340 filings tested cumulatively. v70 re-parsing as #159; v71 behind it.

## (10 fund report) #37 — 2026-08-25 06:27Z cycle — the measurement that said "don't fix this"

6 NAMES_MATCH, 3 PRIOR_YEAR_SOURCE, 1 OCR_SOURCE. Nothing new in the batch
itself; the work was closing the open question from #36.

**"American Funds" as a top row: measured, diagnosed, and left alone.** The
hypothesis was a section HEADER leaking into the rows. Measured across the
universe: 7,305 valued rows sit inside two-column entries (>=50% of rows
resolve to issuer|product) yet carry no issuer and a name of two words or
fewer.

The hypothesis is WRONG, and the measurement is what showed it: every one of
those rows carries a VALUE, and a section header does not. They are rows
whose product name was lost — empty description cell, or a wrapped name.

And the class is heterogeneous, so nothing is dropped: "TRANSAMERICA",
"PACIFIC LIFE" and "RGA REINSURANCE" are plausibly the plan's real insurance
CONTRACT holdings; "Cavanal Hill" is a real fund family; "Adm Shr" is a
share-class fragment; only "Vanguard"/"Fidelity" are unmistakable
manager-fallbacks. Dropping the class would delete real money from real
tables — exactly the trap the 3,034 institution-suffixed rows set two cycles
ago, where the examples turned out to be employer stock.

Recorded in the gap inventory with its numbers so the next attempt starts
from evidence. A safe fix needs per-row proof that the product name exists
elsewhere in the filing, which the current parse does not carry.

**This is the first cycle whose output is a decision NOT to change code**, and
it belongs in the log as much as the fixes do. Three of the last four
measurements have contradicted the specimen that prompted them; a night of
only-fixes would have shipped at least two deletions of real holdings.

350 filings tested cumulatively. v70 re-parsing as #159 (~70 min in); v71
committed behind it.

## (10 fund report) #38 — 2026-08-25 07:00Z cycle — v70's verdict: the fix worked, and I am not mirroring it

Run #159 landed. confident 59,085 -> 59,093 (+8; 17 gained, 9 lost).

**Headline fix confirmed:** manager-named rows 12,850 -> 3,282, and the Great
Gray plan now reads "Great Gray | Index 2040 R" across 32 confident rows.

**Five of the nine losses are real menus** — Fidelity Contra Fund K (30 rows),
Schwab S&P 500 (27), Target Retirement 2045 (26), John Hancock Disciplined
Value R6 (11). Two flipped to regions led by a party-in-interest FOOTNOTE and
their ratios doubled to 1.99.

The mechanism is in CLAUDE.md already, from v46: **removing junk from a good
region lowers its score, and a junk region wins instead.** Correct row-by-row,
wrong region-by-region. That is now the thing to watch on every junk-removal
version — not how much junk left, but whether the right region still wins.

**v70 is NOT mirrored.** The live site keeps v69 until the verdict is clean.
v71 shipped instead (run #160): its footnote guard removes exactly the rows
leading two of those junk regions, which should collapse their scores. That
is a prediction — these four filings are OCR-sourced and cannot be reproduced
locally, so v71's verdict is the only available test.

Not reverted, because the name fix is large and real. The proper repair is at
region SCORING and needs a measurement, not a 07:00 guess.

360 filings tested cumulatively.
