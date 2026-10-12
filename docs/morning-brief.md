# wampo brief — 2026-10-12, 10:0xZ

Overwritten nightly. Decision-shaped: what shipped and what it changed in
numbers, what was found wrong, what is held, what is waiting on the owner.

## Shipped: an accounting category stopped being published as an investment option

**Schedule H splits a stable-value holding by whether participant-initiated
withdrawals happen at contract value — "fully benefit-responsive" versus not —
and filers who put that split in the description column leave a row whose whole
published name is the accounting category. 171 rows / 168 plans / 480,837
participants / $1.55B stop reading as a fund a participant could choose, and
the shown type is the only cell that moves**: name, ticker, fee, asterisk and
row membership are all zero, measured as a differential through both copies of
the page's own row renderer over all 1,721,920 published rows, with a
21,441-row non-candidate control differing on nothing.

Northeastern University (14,949 ppl) was publishing `Non Benefit-Responsive
Investment Contracts` at **11.70% of its menu / $355,740,693**. Twenty-seven of
the rows are at 10% or more of their own menu. None published a ticker or a
fee, so the harm was the claim alone.

**The obvious version of this fix was built, measured, and refused by reading
its own output** — which is the part worth the owner's attention. Adding five
words to the existing caption vocabulary survives every count: all five measure
*necessary*, and the widening reaches 416 rows / 844,976 participants. Reading
all 99 names it newly touched found one it must not: **`Security Benefit` is an
insurance company**, picked up because `security` was already in that
vocabulary as a Schedule H caption word. That vocabulary matches whole strings,
so every word added to it multiplies with every word already there, and no
per-word measurement can see a composition. The shipped arm is a separate rule
that cannot compose with it at all.

**The row that started this does not move, and that is correct.** Yale files
two of these rows; the one whose issuer cell reads `TIAA Traditional Annuity
Contract` tells its reader exactly what the holding is, so "names no specific
fund" would be false of it — the shipped issuer gate holds it with no new code,
and across the whole class 186 such rows are correctly untouched. Its sibling,
which names nothing in either column, is what changed.

Twenty crawlable pages changed: 19 rows gained the label and one gained
`— asset type as filed: Collective trust`, because the same rule reaches a
second call site whose wording is a sentence where the report has a column.
Zero rows lost a label.

## What was found wrong in my own work

**My first page measurement over-claimed, and the error ran the direction that
does not announce itself.** A crawlable page's whole fund table is a single
line, so grepping the added side of a diff for the label counted every label
that was already there — it reported a 20-page change as having touched seven
unrelated caption families. Re-measured as a per-page set difference: 19
gained, 0 lost, every one a benefit-responsive caption. The same comparison
found the typed row that no label count could see.

**And CI caught something every local test passed.** The ship went red on the
`sec-tickers` staleness gate — correctly. The new rule lives in
`lib-disclose.mjs`, whose twin `app.js` carries *inside* the fingerprinted
resolver slice the generated ticker table is stamped against, so the stamp no
longer matched the committed code. The gate's own invariant already records why
that file is not hashed directly: it reaches the table only through that twin.
Paid: **21m8s of regeneration, after which exactly one line of the 12,445-line
asset differs — the stamp.** The key map is byte-identical, so no published
cell moved. That is the documented price of a gate that is exact about code
rather than guessing about keys, and `site-test #215` is green on the fix with
`pages build and deployment #1027` confirming it live on main's HEAD.

## Verified: the registration held exactly, for the third run running

**#646 delivered both predicted figures on the nose** — `tkExact` 40.20 →
40.23 and `tkComparable` 3.41 → 3.38 — with exactly 2 of the coverage line's 35
keys moving. **The claim worth keeping is the third one: their sum was
predicted unchanged and came back 43.61 → 43.61 to the digit.** Yesterday's
Class K promotion relabels a row from "comparable" to "exact" and resolves no
new row, so the sum is a conservation law the change cannot violate without
being wrong about its own mechanism. Predicting two keys moving equally and
oppositely is a sharper test than predicting one.

## Waiting on the owner

Unchanged from yesterday, and all of them large:

- The **Hartford summary-table mis-pairing** — a parser defect that puts
  $5.34B on the wrong names while the coverage ratio reads 1.03, because a
  mis-pairing conserves the sum and nothing looks for a named section going
  missing. Needs a parser bump and a full re-parse; should be sized by *shape*
  first.
- The wrong-share-class symbol-and-fee item (11.1M readers, with a
  one-directional 9.1M slice), our own store contradicting our own page (8.2M),
  the fee pre-emption (13.3M), fabricated stable-value expense ratios (7.4M),
  and the SEC comparable half (49.1M).

## What was held, and why

- **The 194-row fee half of yesterday's Class K ship.** Promoting those rows
  would *add* a pattern-table fee estimate rather than move one, which belongs
  with the fee families above: a fee is sourced, never derived.
- **The residue of today's ship**: `At contract value` (24 rows / $168M), bare
  `contract`, `Investment Contract`, and the genuine `Cash, non-interest
  bearing` Schedule H caption (14 rows). Each is reachable only by relaxing the
  one condition that refuses the insurance house, so each is a separate
  measurement rather than a free widening.

## The 09:07 draw

Two menus, 79,668 participants between them, **and no new class** — which is
worth saying because an absence is a result. Freedom Care Llc (59,785 ppl)
reads at ratio 1.000 and Sandia (19,883) at 0.991; Sandia is collective trusts
end to end and is the machinery working, every Vanguard vintage asterisked at
0.08 with no fee claimed, the stable-value row correctly unpriced, the managed
account labelled as such. The four gaps on Freedom Care are each an item
already sized and queued, and the one worth naming is a live reader-facing
instance of the bare-brand fee family: `Janus Henderson Balanced N Fund`
publishing **0.7** with no ticker. That is the benign half of it — a real Janus
fund, so the figure is plausible-but-unsourced rather than fabricated — so it
adds a named instance and changes nothing about the decision.

Sandia also confirms, on a second plan at $1.0B, that the comparable branch
reaching past the no-public-price gate is a design and not a defect: the report
footnote names it as a ceiling, and `fund-note-test` is what keeps that
paragraph from being reworded away.

## Shipped since: one token, and a rule used the way it was meant

**Schedule H line 1a's own caption — `Cash, non-interest bearing` — stopped
being published as a fund: 22 rows / 22 plans / 15,855 participants, plus three
crawlable pages each gaining `asset type as filed: Cash / short-term`.** The
shown type is the only cell that moves. Small, and it closes the cash half of a
residue this morning's larger caption ship named.

**The interesting part is the method, because this change is exactly the shape
the morning's own hard-won rule warns against** — adding a word to a closed
vocabulary that matches whole strings, where the danger is that the new word
*combines* with one already there. That is how `benefit` combined with
`security` into `Security Benefit`, a real insurance company, six hours ago.
But that rule has a condition attached: read every name the new word newly
reaches. Doing so took one measurement — **all 49 were enumerated and read, 48
of them spellings of the one cash caption, and not a single real fund among
them.** So the rule did not forbid the change; it priced it. *A rule written as
a refusal is really a rule about evidence, and quoting the headline to justify
refusing skips the test it exists to demand.*

## Verified: the morning's caption ship moved nothing it should not

**#647's coverage line is byte-identical to its predecessor on all 35 keys.**
That is the whole safety claim for a display-side change that writes no store,
and it is the strongest form the check can take. The run before it, #646, had
delivered both predicted figures exactly, with their sum — a conservation law
the change could not violate — holding to the digit.

**And the random draw found that ship working on a plan nobody named.** Trinity
Preparatory School of Florida publishes two rows, 19.3% of its whole menu,
reading `Non-Benefit Responsive Contract` and `Benefit Responsive Contract` —
both now labelled as naming no specific fund. The ship was measured on one
population and is confirmed on another, which is a kind of evidence no count
provides.

## What continues today

- The hourly cycle is healthy; the self-bound Routine fired on schedule again.
- The audit issue sits at its baseline 4 HIGHs: three contribution outliers and
  the standing `fabricated-name` finding.
- Main and the dev branch are converged, with #646's data commit adopted by the
  workflow's own fast-forward step rather than by hand.
