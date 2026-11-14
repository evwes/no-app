# Morning brief — 2026-11-14

## What shipped, and what it changed in numbers

Four ships, all gated, **none mirrored yet** (see HELD below).

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

1. **Mirror.** Main holds one pipeline data commit (`bb484683`) and all six
   stores differ from the branch, so it carries fresh filings and must be
   rebased in first — a mirror without it would discard them. Then the regen's
   `site-test` verdict, then `scripts/mirror.sh`.
2. **BlackRock LifePath** (5,052 rows / 4.16M readers) — sourcing in flight.
   Then Fidelity Freedom (2.84M) and Principal LifeTime (2.13M).
3. **The daily YTD refresh now exists** — `fund-facts.yml` at `0 8 * * *`
   (03:00 ET under EST, re-check at the 2026-03-08 transition). Tickers through
   schwab.wallst.com, CITs through each vehicle's own recorded issuer URL. It
   refreshes and never discovers; it exits 1 when it reached nothing, because a
   silent no-op reads exactly like "nothing needed refreshing".
