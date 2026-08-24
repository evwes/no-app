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
