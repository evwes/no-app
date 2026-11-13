# wampo morning brief — 2026-11-13

Overwritten each cycle. Decision-shaped: what shipped and what it moved, what
was found wrong, what reached readers, what is waiting on the owner.

## Found wrong, and fixed — the owner's question was the find

**A comparable row refused the fund's RETURN and published the fund's FEE.**
Asked why a row showing a ticker and an expense ratio had no YTD, the answer
was that `!star` correctly refuses a return on a comparable — a collective
trust or separate account standing behind a registered equivalent's symbol —
while the same row took that equivalent's expense ratio as fact. The note
beneath the table made it worse, telling the reader the holding *"has no
ticker and no published expense ratio"* **while the page published one**, then
calling that figure "a ceiling".

The owner's standing decision of 2026-11-05 was already *symbol only, NO fee*.
The asterisked-symbol half had shipped; this was the other half.

**Measured by differential through `renderRow`**, one line sliced from the
shipped file and asserted unique, over all 1,790,374 published+served rows:

| | |
|---|---|
| fee cells withdrawn | **56,100** |
| plans / readers | **9,412 / 39,749,121** |
| non-starred rows moved | **0** — narrowing discharged |
| ticker / type cells moved | **0 / 0** |

By filed TYPE: 35,959 `Collective trust`, 12,503 `Pooled separate account`,
4,168 `Mutual fund`, 2,793 none stated, 528 `Separate account`, 120 ETF.
A seeded uniform draw across 108 plans read `T Rowe Price Rtm 2045 Tr Cl A` —
a trust, Class A — publishing TRRKX's 0.6%.

**What it costs, stated because it is not free:** the 4,168 `Mutual fund` rows
and 120 ETF rows lose a fee that may have been RIGHT. The page cannot separate
them, because a comparable exists precisely where the filing stated no class.

## Shipped

**503 sourced funds, up from 92.** Nine agent batches across Vanguard, Fidelity,
State Street, BlackRock/iShares — about 93% of those houses' unsourced
reader-slots — then Dodge & Cox, JPMorgan, American Funds, T. Rowe Price, MFS,
DFA, Nuveen and PIMCO once the route generalised.

**The route was the unlock and it was mis-scoped at first.** Fidelity's pages
are JS-only shells unreachable by headless Chromium; the Schwab research page
serves ANY mutual-fund ticker as static HTML and was already the cited source
for the FXAIX entry. Treating it as Fidelity-only kept 4,754 tickers / 304M
reader-slots looking unreachable for half a day.

**Fourteen figures hand-verified at source**, outliers chosen deliberately:
VENAX 44.75% is Vanguard Energy in an energy year, FLCOX 26.86% and FIMVX
24.29% are value funds in a value year, FDRXX 2.85% is a total return with the
7-day yield absent. All exact including dates.

## Reaching readers

Mirrored and deployed: the withdrawal and 454 funds. **The final 49 are on
main at `3dcd4e8c` and NOT deployed** — Pages created no build for that SHA.
Being re-triggered by this commit.

## Found and recorded, not patched

- **`erAsOf` holds two meanings** — a prospectus date on Vanguard entries, the
  day we read the page on every Schwab-sourced one — and it IS published, as
  the tooltip on the sourced-fee tick. 129+ entries. Remedy (`erBasis`) has a
  schema precedent; not fixed by inventing dates the source does not give.
- **Three employer stocks** (`IBM`, `WMT`, `CVS`) reached sourcing work lists,
  each because the holding's name carries a custodian's name.
- **Three returns stale for display** (BCOIX, FMGGX, PIMIX); checker warns.
- **Nuveen class labels unverified** in storage — reaches no reader, because
  `name` is never shipped to the browser.

## Waiting on the owner

Unchanged: the comparable-ticker GAIN half (49.1M), the wrong-share-class fee
families, the CREF accounts, the frozen crawlable pages, the held 33-row fee
ship. The remaining 5,352 unsourced tickers have a median reach of ~3,000
readers, far below the 500,000 floor, so sourcing stopped at 503 by design.
