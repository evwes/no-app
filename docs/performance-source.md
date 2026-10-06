# The performance source decision — YTD / 1YR / 5YR / 10YR

**Written 2026-10-06 during the owner pause, as preparation for the agentic
rebuild. Nothing here has shipped.** The question was "figure out the most
accurate source that is sustainable". This file is the answer, the measurement
it rests on, and the adapter shape that lets the answer be revisited without a
rewrite.

**The ruling, in one line: the primary source is the fund's own statutory
filing retrieved from SEC EDGAR, with the issuer's public fund page used only
for the one cell where filings lag (month-end YTD), Morningstar not used, and
collective trusts carrying a labelled comparable or `NA`.**

---

## 1. First, how much of this even matters — measured, not assumed

A returns column is only worth as much as the share of a reader's own money it
can speak to, and nobody had measured that. Measured 2026-10-06 over the
**60,163 PUBLISHED fund menus reaching 103,501,088 participants**, by a
participant-weighted random draw of 600 plan-menus rendered through the tracked
`scripts/apppath.mjs` harness (seed `wampo-perf-2026-10-06`), reading the
page's own `tk`, `star` and suppression flags rather than my own vocabulary:

| of a typical participant's own menu VALUE | share |
|---|---|
| symbol **ASSERTED** — the page says this IS the fund | **30.1%** |
| symbol **COMPARABLE** — already asterisked as an approximation | **17.2%** |
| **no symbol at all** | **52.6%** |
| → reachable by any symbol-keyed source | **47.4%** |

**So a symbol-keyed source can speak to under half of a typical menu, and only
30 points of it without an asterisk.** The distribution matters more than the
mean: **32.0% of participant-weighted draws have under 25% of their menu
reachable**, and Kroger (674,716 ppl), AT&T (192,505) and Morgan Stanley
(80,789) all draw at **0.0%**. A design that quietly assumes "most funds have
tickers" would publish a performance column that is blank or asterisked for a
third of the people who read it.

### The 52.6% is not one thing, and the split decides the remedy

Keyed on the page's own type cell and flags, over the same draw
(`$2,391,585,494,587` of no-symbol money):

| | share of the no-symbol money |
|---|---|
| **G.** named collective trust, **manager identified** | **42.7%** |
| **I.** residue | 21.0% |
| **H.** collective trust, manager NOT identified | 14.8% |
| **A.** managed-account aggregate (`Managed account holdings (3348 positions)`) | 11.1% |
| **D.** page already says it names no fund | 6.4% |
| **B.** brokerage window (`Participant brokerage holdings (1847 positions)`) | 2.5% |
| **F.** stable value / guaranteed | 0.8% |
| **E.** employer stock | 0.6% |
| **C.** participant loans | 0.0% |

**20.0% of it is unpriceable by nature and `NA` is the correct published answer,
not a gap.** RTX's `Managed account holdings (3348 positions)` is **60.8% of its
whole menu, $33.8B** — a per-participant portfolio with no NAV, no ticker and no
return, and the page already types it "Managed account". The same is true of
every brokerage window. *A column reading `NA` there is accurate; a number there
would be fabricated.*

### The one lever bigger than the source itself

**The identified-CIT money is concentrated in seven managers: BlackRock 53.8%,
Northern Trust 13.7%, Fidelity 8.1%, State Street 6.3%, Vanguard 5.5%, JPMorgan
4.8%, Prudential 3.8% — 96.0% between them.** And the rows are overwhelmingly
INDEX CITs whose index is named in the row: Walmart's `Russell 1000 Index
Non-Lendable Fund` ($15.8B, 28.1% of its menu), JPMorgan Chase's `BLCKRCK EQUITY
INDEX` ($13.1B), State Farm's `Vanguard Employee Benefit Index Fund` ($11.0B),
Google's `Institutional 500 Index Trust` ($10.9B), `NT S&P 500 INDEX -NL FD`,
`BlackRock LifePath Index 2050`.

**For an index CIT whose index is named, the comparable is unambiguous** — and
assigning comparables is `funds-and-tickers`' existing job on `fund-er.js`, not a
new data source. So the largest single gain in performance coverage is **not the
returns feed at all**; it is comparable coverage for seven managers' index CITs.
Size it with a participant-weighted random draw before building it: this record
has over-predicted two fix yields by 25x and 12x from top-N samples.

The 21.0% residue splits too: **37.3% of it names a house** and is a resolver
gap rather than a source gap (Lockheed's `BLACKROCK INSTL TR CO N A INVT` $4.3B
typed "Mutual fund", Accenture's `Vanguard Growth Index`, `TIAA-CREF Funds
STOCK`, `FID GROWTH & INC K`), and 62.7% names no house (employer stock the
flags missed — `BOEING CO COM USD5.00`, `CATERPILLAR INC COM` — captions, and
abbreviations like `US LG CAP STK IDX`). **AT&T's row carries a CUSIP**
(`TEAF10100002 00206R102 AT&T INC`), which is a second identifier worth noting
and not yet used anywhere.

---

## 2. Yahoo is not a close call, and the refutation is already in this repo

**`.github/workflows/fund-facts.yml` has had its schedule DISABLED since
2026-09-18 with the reason written in the file: runs #1 and #2 "both got HTTP
429 from Yahoo on every call (quoteSummary AND the crumb-free chart endpoint) —
Yahoo rate-limits GitHub's runner IP range outright."** That is a measured,
project-internal fact about the only environment that can fetch at all, and it
is why `data/fund-facts.json` holds **0 entries** today. The returns column has
never shipped because its only attempted source blocks us by IP range.

*Before adding a source, ask what the pipeline already tried and recorded.* This
decision was two files away from being made in August.

The external facts agree and are worth stating once so nobody re-opens it:
Yahoo shut its official finance API on 2017-05-15 and never replaced it, citing
Terms-of-Service violations, so the `query1`/`query2` endpoints everything uses
are **undocumented internals with no terms permitting redistribution** — and
wampo redistributes by definition. Google's finance API was retired in 2012 and
`GOOGLEFINANCE()` is a Sheets-only formula with no API behind it. **Neither
covers collective trusts at all**, so both would reach at most the 47.4% and
would be the least durable route to it.

---

## 3. Why EDGAR is the accurate answer AND the sustainable one

Normally those two pull apart. Here they do not, because for a registered fund
the standardized return is not a third party's computation of the fund — it is
**the fund's own figure, which the law requires it to file**.

Two filings carry it, both free, both public-domain US government works with no
redistribution question, both machine-readable, and both per **share class** —
which matters enormously here, because this project already carries a defect
class where the page publishes one share class's fee against another's name, and
returns differ between classes by exactly the fee difference.

**(a) 1YR / 5YR / 10YR — the Risk/Return Summary XBRL.** All Form N-1A filers are
required to tag Items 2–4 of the Risk/Return Summary in Inline XBRL, and Item
4(b)(2) is the *Average Annual Total Returns* table — 1, 5 and 10 calendar
years, per class, with the benchmark index beside it. Structured, mandated,
free. **Honest limitation: these are CALENDAR-YEAR-END figures refreshed once a
year in the annual prospectus amendment**, so they must be published as "as of
12/31/YYYY" and never as "as of today". That is a feature for comparability
across funds, and a labelling obligation.

**(b) YTD and monthly — Form N-PORT Item B.5(a)**, which requires "monthly total
returns for each of the preceding three months", computed per Item 26(b)(1) of
Form N-1A, and **reported for each class of a Multiple Class Fund**. Filed
quarterly in XML, so monthly coverage with no gaps. **Honest limitation: N-PORT
is filed within 60 days of quarter end, so a YTD compounded from it lags two to
five months**, and N-PORT history only begins ~2019, so a 10-year series cannot
be assembled from it — which is exactly why (a) carries 5YR and 10YR.

**(c) The issuer's own fund page, for month-end YTD only.** This is the single
cell where EDGAR's lag is unacceptable to a reader and where the issuer
publishes within days. It is used for nothing else, because an issuer page is
HTML that changes shape without notice while an XBRL taxonomy does not. Scope it
to the houses that matter and let it fail soft to the N-PORT figure.

**(d) Morningstar is not used.** It is the only aggregator covering CITs, and
that is genuinely valuable — but it requires a commercial contract whose
redistribution terms are the opposite of what a free public static site needs,
and its CIT figures are a third party's computation we could not adjudicate
against any document. Both halves conflict with this project's first principle.
If the owner later wants CIT returns badly enough to pay, this is the thing to
price; it should not be assumed away, only deferred.

### The infrastructure is largely built already

`scripts/fetch-sec-funds.mjs` + `.github/workflows/sec-funds.yml` are a working
SEC fetch environment, and they already carry the two things that cost runs to
learn: **the User-Agent must stay the plain `name email` form** (SEC/Akamai
rejects User-Agents containing parens or URLs, verified 2026-08-03), and results
come back through the **`sec-scratch` branch** because the Actions artifact blob
host is unreachable from this sandbox. `sec-funds.json` already holds **29,406
series/class rows with 29,168 distinct tickers**.

**And the key the whole EDGAR performance path needs is already parsed and
thrown away.** `fetch-sec-funds.mjs` reads `CIK Number`, `Series ID` and `Class
ID` from the SEC series/class file (lines 200–242) and line 250 pushes only
`[name, ticker, kind, className]`. N-PORT and the RR XBRL are addressed by CIK +
seriesId/classId. **Storing those three fields is a one-line change to a
`workflow_dispatch`-only script — no `PARSER_VERSION` bump, no re-parse, no
pipeline risk.** That is the fourth instance on this record of a source already
being read and discarded (`cct`, `i1`, the trusts' Schedule C).

---

## 4. The cadence the owner proposed is the industry's own convention

**Monthly, on the last open market day, is correct and is not a rate-limit
workaround.** Standardized returns are quoted to month-end and quarter-end by
convention, so a monthly snapshot is the natural grain rather than a degraded
one. It also makes the job trivially cheap: against the project's recorded
**~1,280 distinct published tickers**, one pass at a polite 1 request/second is
about twenty minutes, and SEC's documented ceiling is 10 requests/second with a
declared User-Agent — two orders of magnitude of headroom.

A monthly schedule needs the NYSE holiday calendar to find the last open day,
and it must be defined in Eastern time through `scripts/et-schedule.mjs` like
every other schedule here, or it is silently an hour wrong for four months of
the year.

---

## 5. What gets published, and the disclosure rule

The fee column already treats a comparable's expense ratio as a **ceiling** and
labels it with an asterisk. **Returns must be symmetric and labelled the same
way**, which means four distinct published states and no fifth:

1. **Asserted** — the row resolves to a class-correct symbol. Publish the
   fund's own filed standardized returns, each cell with its own as-of date.
2. **Comparable** — the row carries an asterisked approximation. Publish the
   comparable's returns behind the same asterisk and footnote the page already
   renders. A CIT's index comparable belongs here.
3. **`NA`** — the fund exists but has no history for that window. The owner's
   instruction was explicit that this is acceptable; it is also the only honest
   answer for a fund younger than ten years.
4. **Withheld with a reason** — a managed-account aggregate, a brokerage window,
   a Schedule H caption, participant loans. The page should say *why* there is
   no return, exactly as it says why there is no fee. **20.0% of the no-symbol
   money is this case, and it is accuracy rather than a gap.**

`data/fund-facts.json` is already the right home and already has the right
contract — one entry per ticker, every figure with its as-of date and source
URL, written only by the `fund-facts` agent, validated by
`scripts/fund-facts-check.mjs`, which refuses undated, unsourced, future-dated
and implausible figures. **It needs no redesign, only a source that answers.**
What it does need is a per-window as-of date rather than one per entry, because
1/5/10YR come from the annual prospectus and YTD from somewhere fresher, and a
single `asOf` would misdate three cells out of four.

---

## 6. The adapter shape, so this decision is config and not a rewrite

The source question will be re-opened — a licensed feed may be bought, an issuer
may publish an API, N-PORT will have ten years of history in 2029. So the
fetcher is written against one interface and each source is an adapter behind it:

```
async function quote({ ticker, cik, seriesId, classId, windows }) -> {
  ytd:  { value, asOf, source } | { na: reason },
  y1:   { value, asOf, source } | { na: reason },
  y5:   …, y10: …,
  standardized: true,     // computed per SEC Rule 482 / N-1A Item 26(b)(1)
  klass: "Institutional"  // the class the figure belongs to, asserted
}
```

Three rules the interface enforces rather than documents, each one a lesson this
project has already paid for:

- **No adapter may return a figure without an `asOf` and a `source`.** A fee and
  a ticker are sourced, never derived; a return is no different.
- **An adapter must be able to return `na` with a reason, and `na` must be
  distinguishable from a failed fetch.** One error code carrying two meanings is
  how `e:"download"` told readers a filing had been withdrawn when the fault was
  ours. A fetch failure keeps the previous figure; a genuine absence publishes
  `NA`.
- **An adapter must declare the share class its figure belongs to**, and a
  mismatch against the row's own class is a refusal, not a fallback. Falling
  back to a sibling class silently is the defect pattern already recorded at
  5,929 rows / 11,144,696 participants.

---

## 7. What to do first when the pause lifts, in order

1. **Store CIK + seriesId + classId** in `fetch-sec-funds.mjs` (one line) and
   re-run `sec-funds.yml`. Nothing else is addressable without them.
2. **Probe EDGAR for the two filing types** from Actions on a handful of known
   tickers (`VFIAX`, `FXAIX`, `RFKTX`), in a `MODE=probe` step that prints what
   it finds and exits 0 — the pattern `fetch-sec-funds.mjs` already uses, which
   turned nine invented URLs into one discovered one.
3. **Build the adapter and the ledger cell, write nothing to the page**, and
   check the figures against a dozen filings by hand before any render.
4. **Separately and probably first by value: size the seven-manager index-CIT
   comparable gap** with a participant-weighted draw. It is worth more published
   cells than the returns feed and needs no new source at all.

**Do not publish a single return until the fetched figure has been reconciled
against the filing by hand on a sample, and do not publish a 5YR or 10YR figure
without its calendar-year-end date beside it.**

---

### Provenance

Store measurements: participant-weighted draw of 600 published menus, seed
`wampo-perf-2026-10-06`, rendered through `scripts/apppath.mjs` (the tracked
harness — a figure measured through any `scratchpad/apppath.mjs` is worth
nothing). Re-measure rather than carry these forward: a DOL refresh moves the
universe, and *a re-size is a new measurement, not a delta against a remembered
one.*

External facts verified 2026-10-06:
[N-PORT Item B.5 monthly total returns, per class](https://www.faegredrinker.com/en/insights/publications/2018/11/sec-division-of-investment-management-provides) ·
[Risk/Return Summary Inline XBRL required for N-1A Items 2–4](https://xbrl.sec.gov/rr/2023/rr-preparers-guide-2022-11-04.pdf) ·
[SEC adopted the RR XBRL requirement](https://www.wilmerhale.com/en/insights/publications/sec-adopts-xbrl-requirements-for-fund-risk-return-summaries-february-25-2009) ·
[Yahoo's official API shut 2017-05-15 and was never replaced](https://marketplace.apilayer.com/blog/article/yahoo-finance-api-is-discontinued-here-is-your-top-10-yahoo-finance-api-alternatives)
