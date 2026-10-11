# wampo brief — 2026-10-11, 10:0xZ

Overwritten nightly. Decision-shaped: what shipped and what it changed in
numbers, what was found wrong, what is held, what is waiting on the owner.

## Six things shipped overnight, all live on main

**A pooled vehicle stopped publishing the registered fund's symbol — 1.02
million readers, and the largest dollar figure of the night.** `1,748 rows / 307
keys / 839 plans / 1,017,749 participants / $16,456,667,177` stop asserting a
ticker they were never entitled to. Navy Federal Credit Union's `Fidelity
Freedom Blend 2050`, typed **Collective trust**, was publishing FHAPX — the
registered *mutual* fund — on $417,764,837, a tenth of its whole menu. The plan
holds the collective trust: a different vehicle at a different cost.

The cause is worth a sentence because it is structural. The build step applies
the vehicle rule **per row** and refuses 51,491 of them, then writes a lookup
table keyed on issuer and name — and the vehicle rule reads a **third** cell the
key cannot carry. So one plan filing `VALIC Government Securities Fund` typed
`Government securities` (a security category, not a vehicle) wrote the key, and
eight plans filing those same two cells typed `Pooled separate account` read the
symbol out of it. **Deleting the contested keys was measured at 14x harmful** —
it also withdraws correct symbols from 24,094 rows / 13.9M participants — so the
question is now asked per row, where the cell is in hand.

**A hyphenated share class stopped blocking the symbol: 636 rows / 628 filings /
1,878,821 participants / $3,664,621,842 gain RERGX or RWMGX.** `AMERICAN FUNDS
EUROPACIFIC GROWTH FUND CLASS R-6` published a fee and no ticker; the blocker was
the hyphen, not the parentheses the queue had blamed.

**`AMF`, a recordkeeper's abbreviation of American Funds:** 325 rows / 156,373
participants gain RGAGX, on rows that published neither ticker nor fee while
stating their share class outright.

**A leading unit noun in front of the fund name** (`shares Fidelity Blue Chip
Growth`): 274 rows / 78,586 participants, 11 tickers gained, and 19 rows gaining
an honest "names no specific fund" where a false vehicle type had stood.

**A fractional unit count published inside a fund name.** Vistra Operations
stopped publishing `1,475,016.774 Class E shares` at 17.52% of its whole menu;
999 rows / 74,127 participants, 16 tickers gained.

**And the coverage line's own ticker metric was blind to the whole SEC path.**
`tkExact` is written on every run and its own comment claimed it ran *through*
the page's resolver; it re-implements it, and two arms were never added to the
copy — the symbol the merge stores (read **first** on the page) and the entire
generated table of 7,350 keys reaching 19,413 published rows (read **last**). So
the always-on machinery could not see the largest ticker change of three days,
**nor the vehicle gate shipped ninety minutes earlier.** Corrected; the metric
reads 38.99% where it read 37.88%.

## How that last one was found, because the method is the point

The hourly verdict noticed `tkExact` had **risen** in the same hour as a ship
that can only ever *withdraw* symbols. The rise is honest — two other ships that
morning moved the arm it can see. The contradiction was in what it could not.

## A seventh thing shipped after this brief was first written

**A filer typo with a registry-attested correction: `MEFS` for `MFS`.** 54 rows
/ 50 filings / 34,059 participants / $63,973,731 gain a symbol, with 0 lost, 0
swapped, 0 fees moved and no approximations shipped. Zero of 29,406 registry
rows spell `MEFS`; 695 spell `MFS`, four of our own cells carry both spellings
at once, and all 303 distinct stored spellings were read with no decoys. A
seeded draw of 24 gains read 24 of 24 correct, and none is a pooled vehicle —
the build step applies the vehicle rule per row and refuses this class's 92
pooled rows by construction.

**Two things about it matter more than the 54 rows.**

*The attestation guard refuses four fifths of the class, and it is right to.*
Before writing a symbol the build step requires the registrant's own
distinctive vocabulary to appear in the filed name or its issuer cell — the
check that stops `Vanguard Asset Allocation Fund` publishing a VALIC fund's
symbol as fact. It is asked of the name **as filed**, i.e. the misspelled one.
So the repair lands where the product name says something distinctive of its
own (`MEFS International Diversification R6`) and is refused wherever the house
word is the only evidence (`MEFS Value Fund R6`): 71 keys / 106 rows / 65,542
participants, **more readers than the ship delivers**, and the row the class
was found on is in the refused half. Correcting that means attesting against
the repaired spelling, which changes every arm's input and needs its own
measurement.

*And the regenerated table absorbed 66 further gain rows that had nothing to do
with this repair* — 9,224 participants, $71,696,270 — purely because the table
was last generated before the day's five name and resolver ships. **A lookup
table with no staleness gate does not merely risk being wrong; it silently
withholds the gains of every change that moved a fund name**, and nothing
reports it: the coverage metric rises, which reads as that hour's work
delivering. The manual discipline recorded for this asset was keyed on its
generator; it now has to cover the name cleaner and the resolver too, which is
an argument for the periodic regeneration job over the per-push one.

## What was found wrong and is NOT fixed

**An Admiral share class with no house named anywhere.** Sized at 5,222 rows /
2,790,684 participants gross — and **1,811 of them are pooled vehicles my own
instrument could not see**, because it printed the type cell and did not apply
it. The largest is `Vanguard Windsor II Fund – Admiral Shares`, typed Collective
trust, resolving to the retail fund on $450,834,815. Held until the clean half is
re-measured through the real build step.

**A target-date ladder's renamed vintage: 1,076 rows / 1,962,602 participants**
publish no ticker and 1,034 publish a fee anyway. Diagnosable entirely in-repo —
our registry holds fourteen Freedom Index series and none is `Income` — but the
rename itself cannot be **sourced** from this sandbox (sec.gov is refused by the
egress proxy), and a rename is a fact that must be sourced. Worth an owner
decision: accept a well-attested secondary source, or wait for the primary.

**A double render where neither copy is qualified: 5,754 pairs / 3,694,834
participants / $19.18B duplicated**, of which a 572-pair core is convictable by
the plan's own Schedule H total and 567 of those are invisible to every shipped
check. Blocked on an unsolved question about which copy survives.

## Waiting on the owner — and one of these just got sharper

**The wrong-share-class family's biggest slice turns out to be one-directional,
which is the exact blocker it was gated on.** That item waits because a blanket
correction errs both ways. Keyed on filings that state the plain **Institutional**
share class, it does not: **3,169 rows / 1,865 plans / 9,106,424 participants /
$50.4 billion publish a retail class instead, and the opposite case is empty —
0 of 3,169, measured over the whole population rather than sampled.**

The draw found it as one menu, not one row: CohnReznick states Institutional
three different ways (`Index I`, `Index Instl`, `Index Inst`) and gets the
dearer **Admiral** symbol on all three, 11.4% of its menu, while
`Vanguard Institutional Index Fund` two rows away is correct. Store-wide the
biggest are Accenture (112,414 readers, $1.18B), Disney's Twdc Enterprises
(193,570), Mount Sinai on two rows, and Justworks (163,323) publishing a
generic 0.1 estimate on a row that states its class outright.

So the decision is narrower than the register has been describing it: on this
slice the recommendation already on file — correct the symbol, **withdraw** the
fee rather than carry the other class's — has no counterexample to weigh
against. 3,036 of the rows publish a fee today, and nothing was re-priced,
because a fee is sourced and we hold no per-class Vanguard figures.

*My first measurement of this said $58.8B and claimed two directions. Both were
my own screen: it refused the spelling `Plus` and not `Pls`, `Select` or
`Inst+`, so filings stating a **different** institutional tier were admitted
with the wrong target named — $8.4 billion and 328,374 people of contaminant,
and a second direction that does not exist. A screen for a stated share class
has to refuse every other tier of the same class.*

The rest, unchanged and all large: the wrong-share-class family overall (11.1M
readers), our own store contradicting our own page (8.2M), the fee pre-emption
(13.3M), fabricated stable-value expense ratios (7.4M), American Funds rows
stating no share class (10.5M), the CREF and TIAA Access fee and vehicle-type
halves, one ticker carrying two different fees, and the SEC matcher's
*comparable* half (188,846 rows / 49.1M readers — the asserted half is shipped).

Two parser items also need a decision, because each needs a version bump and a
full re-parse: 123 plans publishing `Employer-money vesting: Immediate` over a
clause that only states when vesting accelerates, and IBM's wrapped description
cell where the real fund name was cut and only the continuation kept.

## What continues today

The hourly cycle runs around the clock: reconcile, verdict or dispatch, mirror,
one queue item, one participant-weighted draw read by hand.

**Run #634 has landed and the corrected metric's registration held exactly:**
`tkExact` 37.88 → **38.99**, and `tkComparable`, the sample size, `tkShare`,
confident, match, vesting, entries, HIGH and WARN are all unchanged — which is
the whole safety claim for a change that only alters what gets counted.

The MEFS ship's own effect on that line is pre-registered at or below the
printed precision — 120 asserted rows out of 1,721,920 is 0.007%, so `tkExact`
should read 38.99 or 39.00 and nothing else should move. Anything larger means
the regeneration moved more than the row-level diff measured.
