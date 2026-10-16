# wampo brief — 2026-10-16, 03:0xZ

Overwritten nightly. Decision-shaped: what shipped and what it changed in
numbers, what was found wrong, what is held, what is waiting on the owner.

## The pause ended at its own written expiry, and nothing had to notice

You paused the project on 2026-10-12 until the Thursday restart. The expiry was
written into three places — the project memory, the state file, and a one-shot
job that fired **at** 23:00Z carrying the resume checklist — so the restart did
not depend on anyone remembering. Both markers are now deleted rather than
obeyed past their date, and the three Routines are live again (hourly cycle,
daily sweep, weekly Monday), each with its next fire confirmed.

**Reconcile was clean: 21 scheduled data commits landed on main across the three
days and the two branches had already converged**, because the pipeline's merge
job fast-forwards the dev branch when it is a strict ancestor. No adoption chore,
no structural diff owed.

## And the three quiet days are themselves a finding

Re-deriving the state block from the store — a step the checklist treats as a
chore — turned up the more interesting number: **of the 26 coverage lines dated
2026-10-12 or later, exactly one pair moved, and that one predates the pause.
Twenty-four consecutive scheduled merges appended a byte-identical line.**

So three days of the durable layer moved **not one** coverage key. That is the
honest shape of a quiet ingest window, and it is also the argument for where the
improvement comes from: the pipeline kept the data alive and improved nothing,
because improvement is judgement work.

## Your own question, answered as one number instead of a column to add up

You asked what the work had accomplished. Every ship reports its own
rows/plans/participants and **those must not be summed** — a plan reached by
several ships would be counted several times. So the question was answered by
re-rendering the whole store through both versions of the page: the page as it
stood on 2026-10-02 against the page today, same data, each plan counted once.

**1,721,920 rows rendered through both. 47,129 changed their published answer.**

| deduplicated reach (these overlap — don't sum them) | plans | people |
|---|---|---|
| any change at all | **16,934** | **27,709,189** |
| a ticker or fee claim | 15,032 | 17,396,116 |
| a qualification label | 1,594 | 8,928,699 |

**The shape says more than the headline.** 39,191 rows gained a fund symbol and
**not one lost or swapped one** — the work was additive identification, which is
what the safety argument behind each ship predicted and is now measured across
the whole store rather than ship by ship. The fee column barely moves (517 cells
in 1.7M rows) and moves in the honest direction: **408 fabricated estimates
withdrawn against 58 gained.** And 1,895 rows gained a "names no specific fund"
label with **none lost**.

Two limits I'd rather state than leave implied: this run does not split the
39,191 symbol gains into *asserted* and *approximate* — that distinction is a
whole category of claim and the per-ship records carry it; and the three reach
figures overlap, so the smaller two are not slices of the larger.

## What it cost to get that number, and what I fixed so it never costs it again

The walk is ~33 minutes of CPU. This container gives a background process CPU
only while a turn is active, and **three consecutive attempts were killed by a
container restart at 12, 22 and ~20 minutes in, each losing everything.** Rather
than retry a fourth time, I made the instrument bank its progress after every
shard, so a restart now costs one shard instead of the run.

The resume is deliberately **refused** when the store has moved under it — the
pipeline commits data hourly, and continuing across that would silently mix two
populations, which is the most-repeated error in this project's record. I
controlled the refusal before trusting it, and confirmed the store's own
timestamp read identically before and after the successful 33-minute walk.

## Waiting on you

Unchanged, and all large. The biggest are the wrong-share-class symbol and fee
(11.1M readers, with a one-directional 9.1M slice measured at zero
counterexamples), our own store contradicting our own page (8.2M), the fee
pre-emption (13.3M), fabricated stable-value expense ratios (7.4M), and the
Hartford parser mis-pairing that puts $5.34B on the wrong names while every
check reads clean.

## What continues

- The hourly cycle is live again and will take the next queue item.
- Main and the dev branch are converged; the audit issue sits at its baseline 4.
- Nothing is pre-registered and pending.
