# Morning brief — 2026-11-14

## What shipped, and what it changed in numbers

Six ships, all gated, and **all six are now LIVE**, across TWO mirrors:
`56c7f4a3 -> db0c7cc2` (the vehicles mechanism) and `e92c8e23 -> 96578333` (the
sourced ladder figures). Each gate clean, 0 plans stopping being served, and
`deploy-check` read Pages runs **1265 and 1268 on main's own HEAD** to `success`
in 1.7 and 1.2 min. The second mirror is the first to pass `sitetest-gate` as
well, which is the gate the first one needed and did not have.

Verified a second way, through the mirrored tree rather than the live site,
which this sandbox cannot reach: main's `fund-facts.js` now carries **550 ticker
entries and 501 vehicle entries — 440 `t-rowe-price` and 61 `vanguard`** — all
501 with a fee and 308 with a dated return, with FXAIX, VINIX (0.035%) and
VIIIX (0.02%) still present as the positive control, so nothing was displaced.
***Read through the loader, not a grep: a grep for `^ "trowe` on this same file
reported 0 T. Rowe vehicles, because the key prefix is `t-rowe-price`. A clean
zero reports on the query, and it would have read as the ship losing a house.***

| ship | rows | plans | readers | value |
|---|---|---|---|---|
| Vanguard trusts publish their own fee + return | 7,527 | 689 | **7,544,702** | $361.4B |
| T. Rowe Price trusts, same mechanism | 1,258 | 110 | **578,208** | $33.7B |
| Wrong share class corrected (VINIX → VIIIX) | 61 | 61 | **581,379** | $10.0B |
| Fidelity rename resolved (+1,104 ticker keys, 0 removed) | — | — | — | — |

**The mechanism is new and is the day's real output.** `data/fund-facts.json`'s
`vehicles` section had existed, validated and EMPTY, for its whole life, and
could not carry a `ytd` at all — the return rules lived inside the `funds` loop
and the closed whitelist rejected the field. It now holds **524 vehicles**, and
a collective trust whose filing names its unit class publishes that class's own
fee and dated return, with a tooltip naming the class. The ticker keeps its
comparable asterisk: that claim has not changed, only the fee and return now
describe the vehicle the plan actually owns.

## What was found wrong

- **Sourcing a figure makes a mis-resolved identity WORSE, and no sourcing
  check can see it.** Black Hills' $143.5M top holding is filed as *Vanguard
  Institutional Index **Plus** Fund*; the page asserted VINIX (the Institutional
  class) while the pattern fee arm read the name as Plus and returned Plus's
  0.020% — two of our tables contradicting each other with the displayed number
  RIGHT. Sourcing VINIX made the sourced figure outrank the estimate and the
  cell became **0.035% under a ✓** on a fund that charges 0.020%. Fixed, 61 rows.
- **The T. Rowe arm nearly priced their mutual funds as trusts.** T. Rowe sells
  a registered *Retirement 2040 Fund* beside the *Retirement 2040 Trust*. Found
  by reading the names the arm reaches; measured after the fix, the one word
  "Trust" refuses **567 filed names / 874 rows**, one carrying the mutual fund's
  own ticker `TRVQX`.
- **35 welded rows published a coin flip.** *"Vanguard Target Retirement 2025
  Income Trust II Fund"* states two vintages; these are two adjacent menu rows
  glued together by the parser, so the row's value belongs to one of them and
  nothing says which. Refused. **My first guard for it was inert and read as
  protection** — it reused the marker that ASSIGNS the income vintage, which
  requires "Retirement" immediately before "Income"; in these welds the
  preceding word is the year.
- **Two of my own instruments were wrong in the same way.** The differential's
  narrowing and the draw's filter both read `/vanguard/ && /target/`. Against a
  T. Rowe batch the differential reported **0 rows moved** — a clean-looking
  zero — and the draw would have sampled nothing. Both now narrow on the
  resolvers themselves, as a union of before and after so a LOSS stays
  expressible.
- **A counter bug in a gate's own summary**: "503 ticker entries … 546 with a
  YTD return". More YTDs than entries, caused by my own refactor sharing a
  counter. A number in a gate's summary that cannot be true is a defect even
  though no reader sees it.

## What was HELD, and why

- **Retirement Hybrid, 150 entries.** Its fee is in T. Rowe's brochure but no
  Hybrid fact sheet is reachable, so the "trustee fee = expense ratio"
  equivalence is carried from a *sibling* product rather than stated for it. The
  keys exist, carry a note saying so, and the resolver refuses them.
- **23 dormant Vanguard records.** Every Target Retirement Trust III vintage
  reads `0.4000` as of **2014-03-31** with no current return. Withheld at
  `gen-fund-facts-asset.mjs`, where no later call site can bypass it.
- **54 self-contradicting rows** whose name states a trust class while the filed
  TYPE says "Mutual fund" — a real Target Retirement 2050 *Fund* (0.08%) sits
  beside the 2050 Trust I (0.065%). They keep their blank: 21,141 readers
  deliberately without a figure.

## Waiting on the owner

- **State Street core index CITs — 3,774 rows / 1,964 plans / 9.59M readers /
  $173B.** The owner supplied State Street's own collective-trust product
  listing, which prices each fund per share class. **I had reported this family
  as impossible an hour earlier and was wrong**: what I had established was that
  I could not find the data, not that it does not exist. The open question is
  their own footnote — *"Pricing assumes $10M aggregate mapping minimum"* —
  which makes it a rate card rather than necessarily the price a given plan
  pays. **Their TARGET RETIREMENT trusts remain unsourceable**: ssga.com
  publishes only the registered mutual funds, and their own document host
  resets the connection.
- **Vanguard's classless rows — 521 rows / 2.75M readers.** Their sibling rows
  in the same menu state exactly one class. Plans rarely hold two unit classes
  of one ladder, but that is an inference from neighbours, not a filing.

## Second ship of the day — SOURCED FIGURES, live on `96578333`

**47 ladder funds sourced, and 3,222 ALREADY-PUBLISHED FEES WERE WRONG.** First
ticker-path batch against the owner's ten target-date families, in reader order.

| | |
|---|---|
| fee newly published | 5,438 |
| **fee CHANGED value** | **3,222** |
| return newly published | 9,129 |
| ticker / star / type / name moved | 0 / 0 / 0 / 0 |
| plans / readers | 2,244 / **2,361,459** |

The pattern table priced every JPMorgan SmartRetirement row at a flat 0.29% and
distinguished neither Blend from non-Blend nor R6 from R5; sourced, those are
0.17%, 0.34–0.39% and 0.45%. TRJWX published the **investor** class's 0.49% on
319 rows / 319,723 readers whose filings state class I — now 0.34%. The estimate
was wrong in **both directions**, and `FHLDX`/`FHNDX` by about double.

## What was found wrong, the second half of the day

- **I MIRRORED A COMMIT WHOSE SITE-TEST WAS RED.** `db0c7cc2`, verified two ways
  and reported live. Run #291 on that SHA concluded `failure`, and #290 before
  it. `mirror.sh` checked the DATA and the DEPLOYMENT and **nothing read the
  verdict of the suite that tests the page code** — three layers, two watched.
  Cause was benign (one step of 37, the `sec-tickers` CODE fingerprint, reddened
  by an edit to a hashed input) but that was established AFTERWARDS by reading
  the log, and the same red covers the smoke test, the YTD render and the map.
  Closed by `scripts/sitetest-gate.mjs`, now a step in `mirror.sh`; it **fired
  in production on this mirror** and its nine cases run in CI.
- **The vehicles ship had broken the queue that prices the next ship.** Two
  tracked instruments read `fund-facts.js` by slicing between its outermost
  braces, which spanned both objects once `FUND_VEHICLES` existed. Every gate
  on that ship was green and stayed green: nothing runs a measurement script.
- **My own `--families` label was wrong by 6x**, and three classifier false
  positives followed it, each hiding behind the last — the ladder test reading
  the issuer cell (so T. Rowe's pattern matched the *recordkeeper*), the printer
  showing a ticker's most common name rather than the name that matched, and a
  warning that fired on 34 of 50 rows. Each found by READING the names.

## What continues

0. **A GAP IN THE NEW GATE, found by holding the mirror and not yet fixed.** No
   site-test run is created for a head commit carrying `[skip ci]` — the regen's
   commits do — so the gate falls through to its INHERITED branch. That is
   unsound across a DATA change, because site-test's `record-check` and
   `ledger-test` read the store. Worked around by dispatching a real verdict
   (#295 on the exact head). The fix is to refuse an inherited verdict when the
   stores differ between the tested SHA and the head, and to say whether that
   SHA is even an ancestor. Held only because the weekly integrity agent is
   testing that file right now.
1. **DONE — mirrored and served twice.** Main moved FOUR times across the day
   (`bb484683`, `56c7f4a3`, `b71a195f`, `e92c8e23`), so the rebase was done
   three times; each time the trail ended at 0 lines on main the branch lacked.
   That is the hourly-cadence hazard behaving exactly as recorded.
2. **Ticker sourcing is now SIZED rather than guessed at**, because the queue
   that sizes it was broken by the vehicles ship and is fixed. 81.3% of
   tickered rows already carry a sourced figure; **92,282 rows across 5,337
   tickers** remain, and the tail is flat — a thousand lookups move coverage
   81.8% -> 90.6%. 53,411 of those rows (57.9%) are in the ten houses the
   owner named; **18,311 (19.8%) are in their target-date ladders.** The
   readers are in the house lineups, not the ladders.
   **Two exclusions before any batch:** 411 rows / 362 tickers are EMPLOYER
   STOCK by the page's own flag (WMT at 2.0M readers and CVS at 0.4M head the
   queue as a category error), and Vanguard's ladder reads 1 row because plans
   hold it as TRUSTS, served by the vehicles path instead.
3. **BlackRock LifePath trusts came back EMPTY, like State Street** — their
   site carries only the LifePath mutual funds. The LifePath MUTUAL funds
   (LIKKX, LIKIX, LIKAX, LIKPX, LIRKX) are unsourced and reachable; that is
   ticker-path work. Then Fidelity Freedom (4,147 addressable ladder rows) and
   J.P. Morgan SmartRetirement (3,878).
3. **The daily YTD refresh now exists** — `fund-facts.yml` at `0 8 * * *`
   (03:00 ET under EST, re-check at the 2026-03-08 transition). Tickers through
   schwab.wallst.com, CITs through each vehicle's own recorded issuer URL. It
   refreshes and never discovers; it exits 1 when it reached nothing, because a
   silent no-op reads exactly like "nothing needed refreshing".
