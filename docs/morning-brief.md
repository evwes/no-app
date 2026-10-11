# wampo brief — 2026-10-11, 05:1xZ

Overwritten nightly. Decision-shaped: what shipped and what it changed in
numbers, what was found wrong, what is held, what is waiting on the owner.

## Four things shipped overnight, all live on main

**A hyphenated share class stopped blocking the symbol — the night's largest,
1.88 million readers.** `AMERICAN FUNDS EUROPACIFIC GROWTH FUND CLASS R-6`
published a 0.46 fee and no ticker; **636 rows / 628 filings / 636 plans /
1,878,821 participants / $3,664,621,842 now publish RERGX or RWMGX.** Prohealth
Physicians' row alone is $689,915,011 across 92,924 people; Publix 225,961.
Ticker lost 0, swapped 0, asterisked 0; fee, name and shown type all unmoved.

**`AMF`, a recordkeeper's abbreviation of American Funds.** `AMF GROWTH FUND OF
AMERICA R6` — 256 rows, the family's largest spelling — published no ticker
*and* no fee while stating its share class outright. **325 rows / 325 plans /
156,373 participants / $191,329,641 gain RGAGX.**

**A leading unit noun in front of the fund name** (`shares Fidelity Blue Chip
Growth`): 274 rows / 67 filings / 78,586 participants / $2,483,915,336, with 11
tickers gained and 19 rows gaining an honest "names no specific fund" where a
false vehicle type had stood.

**A fractional unit count published inside a fund name.** Vistra Operations
stopped publishing `1,475,016.774 Class E shares` at 17.52% of its whole menu;
999 rows / 92 plans / 74,127 participants, 16 tickers gained.

Each was measured as a differential — two renderers or two merges from one
baseline with a single line varying — over all 1,721,920 published-and-served
rows, and every distinct changed spelling was read. `PARSER_VERSION` stays 203
throughout, so none of this needed a re-parse.

## What was found wrong and is NOT fixed

**A target-date ladder's renamed vintage: 1,076 rows / 1,962,602 participants
publish no ticker, and 1,034 publish a fee anyway.** Alimed files thirteen
`Fidelity Freedom Index <vintage>` rows; twelve resolve and the `Income` one
does not. The cause needed no external source to diagnose — our registry holds
exactly 14 Freedom Index series and none is `Income`; the fourteenth is
`Freedom Index **Retirement** Fund` with the identical four-class structure. So
the filing names the product under its former name.

**It did not ship because the rename could not be SOURCED from this sandbox.** A
search returns an SEC supplement stating it effective 2025-09-09 and the egress
proxy refuses sec.gov outright (`http=000 bytes=0`). A rename is a fact that
must be sourced, so the next step is `data/fund-facts.json` via the `fund-facts`
agent — not a resolver entry written from a search summary. **Worth an owner
decision: whether to accept a well-attested secondary source for a rename, or
wait for the primary document.**

**The same search puts a second number in doubt:** we publish 0.12 on 1,034 of
those rows where that fund's real expense ratio is reported as 0.08. Unverified
for the same reason, and it joins the owner-gated fee families.

**A double render where neither copy is qualified: 5,754 pairs / 3,694,834
participants / $19.18B duplicated**, of which a 572-pair core is convictable by
the plan's own Schedule H total. 567 of those are invisible to every shipped
check, because the overshoot alarm only fires above 1.15 and these sit just
over 1.0 — so the harm is an inflated menu total the page already prints.
Blocked on an unsolved question (removing a row lowers its region's score;
typing it leaves the dollars double-counted).

## Corrected my own record

Six labels in the permanent log were **future-dated** — a ship filed at 04:1xZ
was committed at 03:37Z, and a draw entry was headed "the 04:08 draw" when it
was the 03:08 cycle's. The 05:08 wake is what exposed it: the clock read
earlier than entries already written down. Corrected in place, and the fix was
the instructive part — those time strings appear 16 times in the log and all but
two belong to other days, so a blind replace would have silently re-dated four
unrelated entries while the count looked like a thorough job.

## What was HELD and why

**An Admiral share class with no house named anywhere.** Boston Scientific files
fourteen `<product> Adm` rows with an empty issuer cell, publishing a fee and no
ticker — `Growth Index Adm` at 0.1 where that fund costs about 0.05. Held
because my first screen was contaminated: its largest members carry the house
*contracted* (`Vangrd`, `VGD`, and the filer typos `Vanard`, `VANDGUARD`), which
my hand-written house list did not contain. **A decoy sits in the member list —
`MM S&P 500 Index Adm`, plausibly MassMutual — so the `Adm` token licenses a
share class, not a house.**

The structural replacement was built and then **refuted by its own first probe**:
prefixing every registry manager and requiring a unique answer fails, because
the matcher excuses a class marker for any house (`Fidelity 500 Index Admiral`
answers). Adding one condition — the resolved ticker's own *registered* class
must state Admiral — restores uniqueness on every probe and correctly abstains
on the MassMutual row. That instrument is validated and the class is being
sized with it now; nothing ships on a half-measured class.

## Waiting on the owner

Unchanged and all large: the wrong-share-class symbol-and-fee family (11.1M
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
one queue item, one participant-weighted random draw read by hand. The pipeline
itself is independent of any session and committed its last data three hours
ago, within its measured ~3.6-hour cadence.
