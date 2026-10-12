# wampo brief — 2026-10-12, 14:0xZ

Overwritten nightly. Decision-shaped: what shipped and what it changed in
numbers, what was found wrong, what is held, what is waiting on the owner.

## Shipped today: three caption classes stopped being published as funds

Schedule H has a vocabulary of its own — asset-class captions, accounting
bases, measurement notes — and a filer who puts one of those in the column
where a fund name belongs leaves a row that reads, on our page, as an
investment option a participant could have chosen. Three of those classes
closed today, each one `shown type` only: no name, ticker, fee or asterisk
moved on any of them, and no row appeared or disappeared.

| | rows | participants |
|---|---|---|
| the withdrawal-terms split (`Non Benefit-Responsive Investment Contracts`) | 171 | **480,837** |
| Schedule H line 1a's own `Cash, non-interest bearing` | 22 | 15,855 |
| a contract's accounting basis (`At contract value`, bare `contracts`) | 15 | 155,492 |

Northeastern University had been publishing an accounting category at **11.70%
of its menu / $355,740,693**; Keltec publishes one at **30.60%** of its whole
menu. None published a ticker or a fee, so in every case the harm was the claim
alone — and 33 of the 208 rows are at 10% or more of their own plan's menu.

## What was found wrong in my own work, and it is the same mistake twice

**The third ship was sized at 2.6x what it delivered, and the reason is worth
the owner's attention because it is about how this project measures.** I asked
every display predicate in the file I was editing whether it already covered
the class, got "no" from all of them, and concluded 39 rows were unqualified.
Rendered through the actual page code, the number is 15. The four names that
account for the whole gap are the four *largest* by dollars — including the one
I had written down as the motivating example, 24 rows and $167,946,996, and a
single $486,386,519 row — and they were already labelled correctly, by a
vocabulary that lives in the **parser**, reached through a callback composed at
the display's call sites. *The arm that beat mine was never in the file I was
reading.* An hour later my own page-measurement script made the same error in
miniature.

Both are now written down as rules: the cheap instrument is to render the row
through both versions of the page, and to do it *before* the predicate screen
rather than after it.

**And the obvious version of the third fix was built, measured, and refused by
reading its own output.** Adding the word `contract` to the existing caption
vocabulary survives every count — and two of the fifteen names it newly touches
are names *we* truncated, not names that say nothing: King Ranch's row is the
second half of `New York Life Insurance Company Investment - contract value`,
proved by the row next to it carrying the first half at the identical dollar
figure, and Brown University's `Contract — shares` lost its product name to a
column artifact. Those two carry 48% of the money in the class. That vocabulary
matches whole strings, so each word added multiplies with every word already
there — this is the third time that has produced a false positive and the first
time it produced a name we had cut rather than a real firm's name. The shipped
rule is a separate test that cannot combine with it.

## Verified: two registrations, both held exactly

- **#647** delivered the withdrawal-terms ship with the coverage line
  **byte-identical on all 35 keys**, date included.
- **#648** did the same for the cash caption. That registration is the one
  worth noting: it was derived **by construction rather than by measurement** —
  the file the change lives in has exactly two consumers in the pipeline, each
  importing one function, and neither function can see the vocabulary that
  changed. Two greps, and a prediction that refutes itself the moment someone
  adds an import.

## The pipeline, and a divergence that was proved harmless

A scheduled run on main and a dispatched run on the dev branch finished five
minutes apart, leaving each branch with a data commit the other lacked. Per the
project's own rule that timing is never the evidence here, the stores were
diffed structurally: **every file identical once the generation timestamp is
stripped, 112,652 plan rows with none unique to either side, 69,046 parse
records with no differences, and both runs appended the identical line to the
coverage trail.** The same data twice, so the branches were converged without
losing anything.

## Waiting on the owner

Unchanged, and all of them large:

- The **Hartford summary-table mis-pairing** — a parser defect putting $5.34B
  on the wrong names while every check reads clean, because a mis-pairing
  conserves the sum. Needs a parser bump and a full re-parse.
- Wrong-share-class symbol-and-fee (11.1M readers, with a one-directional 9.1M
  slice), our own store contradicting our own page (8.2M), the fee pre-emption
  (13.3M), fabricated stable-value expense ratios (7.4M), and the SEC
  comparable half (49.1M).

## What was held, and why

- **~$4.4B of the contract residue**: `Guaranteed Investment Contracts`,
  `Annuity Contracts`, `Insurance Contract` and four smaller families. Each is
  one word away from today's rule and each is a *real product class* rather
  than an accounting basis — a plan genuinely holds a guaranteed investment
  contract — so suppressing them is a different question, and every one is now
  measured rather than guessed at.
- The 186 caption rows whose issuer cell names something real. They want the
  filed asset type, not a "names no specific fund" label.

## The 12:07 draw: AT&T's own page

The random draw landed on At&T Inc. — 192,505 participants, $42.7 billion —
and found two things on the committed page, which needs no interpretation from
me:

```
Teaf50020002 · Bgi Equity Index Fund F        $8,803,529,822
Teaf10100002 · 00206r102 At&T Inc             $3,859,276,939
```

**Eleven of the twelve rows the page shows lead with AT&T's own internal fund
code**, because that code sits in the cell we print as the provider. And the
plan's own employer stock — 9% of the menu — is published with its CUSIP in
front of the company name and **no ticker**, although our own plan record holds
the symbol. Sized at 166 rows / 597,335 participants for the first shape and
264 rows / 515,346 for the second.

Two honest qualifications, both recorded: stripping the CUSIP is measured at
**zero** yield in every priced column, so that one is legibility rather than
identification; and the missing ticker is **not** caused by either shape — I
varied each independently on the real plan record and all four readings came
back the same — so the cause is still unknown and is written down as a question
rather than an answer.

The second drawn plan, Vesuvius USA, is the machinery working: nearly every row
resolves, four category rows are correctly labelled as naming no fund, and its
three gaps are each a class already queued.

## What continues

- The hourly cycle is healthy; the self-bound Routine fired on schedule.
- The audit issue sits at its baseline 4 HIGHs.
- Main and the dev branch are converged.
