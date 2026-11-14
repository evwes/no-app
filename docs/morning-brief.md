# Morning brief — 2026-11-14

## What shipped, and what it changed in numbers

Four ships, all gated, and **all four are now LIVE** — mirrored `56c7f4a3 ->
db0c7cc2` at 03:4xZ with `scripts/mirror.sh`, gate clean (0 plans stop being
served), and `deploy-check` read Pages run **1265 on main's own HEAD** to
`success` in 1.7 min. Verified a second way through the mirrored tree: main's
`fund-facts.js` carries **501 vehicle entries — 440 `t-rowe-price` and 61
`vanguard`** — all with a fee, 308 with a dated return, beside its 503 ticker
entries as the positive control.

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

## What continues today

1. **DONE — mirrored and served.** Main had moved TWICE while the branch
   worked (`bb484683`, then `56c7f4a3` from run #843 at 03:32Z), so the rebase
   was done twice; the second time the trail showed 0 lines on main the branch
   lacked. That is the hourly-cadence hazard behaving exactly as recorded.
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
