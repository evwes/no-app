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
