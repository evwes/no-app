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
