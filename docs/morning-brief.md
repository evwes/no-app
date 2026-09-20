# Morning brief — 2026-09-20 (written 04:3xZ / 12:3x AM ET)

Live on main: **the v170 store**. Overnight, **v169, v170 and v171** — three
versions, each gated, corpus-diffed and verified against predictions written
before the run finished. Two of those predictions failed and are written up
below with their causes, because that is the more useful half of the record.

## What reached readers overnight, largest first

| version | what changed | size |
|---|---|---|
| v169 | **UPS stops showing $1,470,493,000 of net appreciation as a holding.** A statement caption wraps, its value lands on the next line, and the parser read the orphan as a fund — at the *prior year's* column | **145,125 participants**; the bare-`Investments` row falls 16 → 8 plans |
| v169 | holding names lose a stray trailing `+` or `~` that no filing legend explains | 1,280 rows across 268 plans |
| v170 | **Irisndt's 1,609 see forty-two holdings where one `JOHN HANCOCK` row of $21,512,753 stood at 53% of the plan** — eighteen filed holdings that had merged into one | six plans un-merge; the bare-firm class falls 20 → 14 |
| v170 | 659 more names lose the trailing marker (a second layout) | — |

Live store: confident **60,117**, lineups 59,766, findings at **5**, overshoot
335, download failures 104. Mirrored three times; the last one was a clean
fast-forward with no overrides.

## Running now

**v171 (#406): a line the parser has refused for years and still published.**
`SKIP_ROW` has an arm for the Form 5500 employer-ID line — and it requires a
`#`, while filings overwhelmingly write `EMPLOYER I.D. 94-` with none. So the
arm never fired. **43 rows / 43 plans / 29,821 participants** publish it.

The evidence it is not a holding is arithmetic rather than verbal: removing it
moves Easter Seals Southern California from ratio 1.033 to **exactly 1.000**.

## Found wrong, by us, in our own work

- **Two of v169's four pre-registered tests failed.** The marker class was
  predicted at ~0 and came in at 663 rows: the strip ran on the wrong part of
  the row, and *my first correction was also wrong* — the trace said so before
  it shipped. Fixed in v170. The lesson is the testing, not the regex: the fix
  was tested on the filing that motivated it, not on one of the shape it would
  miss.
- **A prediction whose premise my own corpus diff had already refuted.** I
  predicted `overshoot` could only fall; it rose by one. The diff had recorded
  a plan *swapping regions* an hour earlier — so the change alters which table
  wins, not only which rows survive. v170's predictions each had to name a
  measurement already in hand, and where either direction was possible, no
  direction was claimed. All four then passed.
- **A sizing predicate over-matched for the fifth time**, and the implausible
  leader was again the tell: a $3.39B row at 48% of a three-row menu is not an
  employer-ID line. Honest figure 43 plans, not 45.
- **One regression is live and small.** Shared Support South (195 ppl) shows an
  OCR'd Form 5500 EIN line at 49% of its menu. v171 removes exactly that row.

## Waiting on you, ranked by people affected

1. **Match and vesting extraction as new coverage** (~13.5M + ~10M ppl).
2. **fund-facts source** — fee and return cells stay empty until a retrieval
   route is approved: an API key as a repo secret, an allowlist for two fund
   company domains, or both.
3. **Recordkeeper source fix** — 2,241 plans / 2.0M ppl publish a wrong or
   missing provider name.
4. Whether to spawn the parser agent each cycle at the current usage tier.
5. Whether a class SUMMARY should ever publish as a lineup.

## Open and queued, with sizes

- **Truncated prose as a holding — ~18 rows that distort a page, ~108,000
  ppl.** Oracle publishes `Various investments, including registered market
  funds and c` at **$3,405,120,000** and is 94% of the people in the class.
  *(Corrected 05:2xZ: an earlier draft of this brief said "274 plans /
  790,790 ppl". That counted every plan containing any such row, most of them
  a ~1% loan-rate fragment — a count of a condition, not of an outcome.)*
- **A page-continuation marker in the issuer — 249 plans / 424,152 ppl.** Not
  shipped on purpose: 60–70 of those rows carry a *real* firm alongside the
  marker, so the obvious rule would delete good data.
- Marsh & McLennan (35,907 ppl): a $3.39B prose row at 48% of a 3-row menu.
- A third trailing-marker layout (952 ppl).

## What continues alone

Hourly: reconcile, verdict any finished run, mirror only on a clean verdict,
dispatch the next gated version, draw randomly from published lineups and read
the rows, record. Next: **#406's verdict**.
