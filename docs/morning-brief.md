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

## Evening: the day's largest ticker gain — 6.3 million readers

**An abbreviated Capital Group holding now resolves against the registry:
18,802 rows / 7,715 plans / 6,300,982 participants / $25.8 billion gain a
symbol they are entitled to**, with nothing lost — ticker lost, swapped and
approximated all zero, no fee moved, no name or type changed, no row entered or
left a menu, and a control of 1,702,234 untouched rows differing on none of it.
The lookup table goes 7,762 → 12,337 keys, every added key attributable to this
one arm with no drift. A seeded draw of 26 gains read 26 of 26 correct.

**The sizing that queued it was wrong by 2.4x on rows and 3.6x on people, and
one probe found out why.** The screen was keyed on the *house* being
contracted — `AMERFUNDS` for American Funds. But `AMERICAN FUNDS 2055 TARG
DATERET R6`, with the house spelled out in full, resolves to **nothing**, while
the same row with the product spelled out resolves correctly. Two tokens were
damaged, not one, and a screen keyed on one of them measures one of them.

**What makes it safe is that it knows no abbreviations.** There is no list of
contractions anywhere in it. Each token in the filed name has to consume
consecutive words of a registered fund's actual name, letter by letter,
including each word's first letter — so `TARG DATERET` matching *Target Date
Retirement* is derived from the registry rather than guessed, and the same
relation handles the house, letting five spellings qualify without being
listed. The fund family itself is read out of the registry (39 registrants, 66
series, every one Capital Group) and the build fails if that ever stops being
true. A platform's own wrapper product, which our notes record as correct as
filed, is refused structurally rather than by a blocklist.

**Three defects in its own work were caught and fixed before it shipped**,
each a mistake this project has written down before: a leaked exclusion let the
bare word `American` pass as the house and accept a competitor's fund; a
character floor added on reasoning rather than measurement cost 684 genuine
rows and protected nothing; and a hand-written noise list omitted one spelling
and cost 276 more. Its own verification nearly went wrong too — the control
group was built from a keyword that 1,839 genuine gains do not contain, so the
check reported a failure that was its own construction.

**Still the owner's call:** 10,996 of the newly-identified rows publish a
generic expense estimate beside their new symbol, because the fee comes from a
name table and not from the symbol. That belongs with the fee families already
waiting for a decision — a fee is sourced, never derived.

## Afternoon: two screens of mine refuted, and a band missed on purpose

**A registration missed its band by one hundredth, and that is the cycle
working.** The Admiral ship was pre-registered at `tkExact` 39.00 → 39.02 with
the clause *"anything above 39.03 means the table moved more than the row-level
diff measured"*. Run #638 delivered **39.04**, with every other key on the
35-key line byte-identical. Attributed in half an hour: 38 sampled rows carry a
key the ship added, one is refused by the vehicle gate, **37 newly resolve =
0.042 points**, which is the observed move entire — and all 37 were read, every
one a genuine Admiral row (`Wellesley Income Fund Admiral` → VWIAX on
$559,674,579). **Nothing is wrong with the ship.**

The cause is one of this project's own rules running backwards. The coverage
metric samples confident filings and applies **neither** the serving condition
**nor** the publish gate, while the registered figure was reader-facing — so
the arm lands on 38 sampled rows where the reader-facing arithmetic predicts 21.
We have recorded five times that a measurement of what a page *publishes* must
apply every condition the page applies; the inverse was never written down:
**a prediction of what a metric will report must apply exactly the conditions
the metric applies, no more.** Keeping the band tight enough to be wrong is
what forced the attribution instead of a shrug.

**A screen of mine was refuted three times by its own output, each time on an
abbreviation.** Chasing a plan that publishes `Rates of` as a holding, a
trailing-function-word screen read 33,927 rows / 17.2M participants — and
**32,164 of them, 94.8%, were the trailing `a`**, which is a **share class**
(`… Series Fund - Class A`), with 6,765 publishing a ticker. Our own notes
record that exact trap and I wrote the vocabulary anyway. With the article
removed, the next two arms are the same error: `IN` is Institutional and `AS`
is Asset, and **355 of that arm's 538 rows publish a ticker**. A
trailing-token vocabulary over this corpus measures abbreviations, not grammar
— and those 355 tickers were invisible in a count and unmissable in a list.

What survived is real and is **queued, not shipped**: the participant-loan
note's own sentence published as a fund name, **245 rows / 330,915
participants / $295M**, with the guards already catching 425 of the 670 the
shape reaches. Adt Llc publishes `with loan maturity dates that range from
2025 through 2050` at $35.9M. Reading all 231 distinct names split it three
ways, and **two of the three must be spared**: rows that name a real stable-value
vehicle with its rate appended (nine publishing the fabricated 0.35, so the
remedy there is a trim), and ten real corporate bonds — **all in one plan at
56,540 readers** — correctly named by issuer.

**And its obvious remedy is refuted by a pin already in our own code.**
Widening the sentence predicate's function-word list reaches 67 rows, and the
verb `is` carries all 67. `IS` is Institutional Shares: it would publish *"the
filing names no specific fund"* over a real fund held by **86,817 readers at
$41.3M**, over ~30 real brokerage equities whose names end in the custodian's
own *"NFS LLC is a market maker"* disclosure, and over one row that publishes a
correct ticker. The file already pins that case must-not-fire, saying *"the
function word is the only protection"*. So grepping the fixtures for a queued
prescription's motivating **string** is not enough — grep them for the
**condition** the change touches.

## What the draw found

**A new class worth 1.76 million readers, handed to the agent this hour.** A
448-participant plan publishes eight `AMERFUNDS 20XX TARG DATERET R6` rows
with no ticker and no fee — **65.6% of its whole menu** — while one row away
`AMERICAN FUNDS 2055 TARGET R6` resolves correctly. Store-wide: **7,747 rows /
1,931 filings / 1,763,677 participants / $8.7 billion** publish no symbol,
against a control where the house spelled in full resolves 42.5% of 153,551
rows and the contracted spellings resolve **1.3%**. One decoy is already named
by reading — a wrapper platform's own product, which our notes pin as correct
as filed.

**And the largest single instance yet of the fabricated stable-value fee**,
which is the owner's call: Caesars Entertainment (45,125 participants)
publishes `Guaranteed Long-Term` at **0.35 on $277,699,196, 14.7% of its
menu**. The control is the other 24 rows of the same menu — every one typed a
collective trust or separate account, every one correctly unpriced. The only
thing that differs is that the largest row's type cell is blank.

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
