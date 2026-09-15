# Morning brief — 2026-09-15

## Added midday — the Owens Corning filing generalized, and it is the largest thing in the queue

Asking the Owens Corning shape of the whole store rather than re-reading the
one filing: **471 live plans / 1,193,879 participants publish a fund menu that
sums to 1.15x or more of the money the plan itself reports.** The money is not
there, so those rows contain a total, a merge, a second year, or a page that is
not the schedule. **PepsiCo** (161,067 participants) publishes nine rows summing
to 1.60x, led by one named `Trust` at **$13.34B — half the menu**; the whole
thing is a fair-value hierarchy note. **Kraft Heinz and Deutsche Bank both
publish `le 0 0 1f`** — Form 5500 checkbox coordinates — at 70% of their menus.

Every guard passed them, and the number that proves it was already in our store:
`isConfident` accepts anything under 1.6x, records the ratio, and **nothing ever
reads it again.** This merges into queue item #1 — one version bump fixes the
fragments, the loan rows and this.

**Shipped and mirrored since:** `audit-overshoot` — an audit keyed to the
arithmetic rather than to a list of bad names, so this class can't be outrun by
a new vocabulary the way it has been three times. Building it found a second
defect: **the audit's existing overshoot check had never been able to fire**,
because its bound (1.6x) was copied from the parser guard that admits entries
in the first place. A check that can only agree with the rule it checks.
Live on main as `c3c873d9`, gate +0/−0, and the 471 now lands in
`coverage-history.jsonl` every run so it is diffable rather than remembered.

## The headline

**You sent three filings yesterday and they broke open the biggest accuracy
defect this project has found.** Two fixes shipped and are live; the third
finding is too large to ship off a filing review and is waiting on you.

**On 1,509 live plans covering 1,482,658 participants, the name we publish as
"RECORDKEEPER" is an auditor, a lawyer, an investment manager or an advisor.**
AstraZeneca's page names **PricewaterhouseCoopers** — service code 10,
accounting/audit. Apple names Russell Investments (investment management). Nike
names BlackRock. HP names "Strategic Advisors", the exact name our own project
memory cites as *already solved*.

This outranks everything else in the queue, and the reason is worth one line:
**a blank is honest, a name reads as knowledge.** Telling 27,192 AstraZeneca
participants that PwC keeps their records is worse than telling them we
don't know.

## Shipped and live overnight

- **v124 — a false "not stated" removed.** R.J. Kielty's notes say
  *"on a pre-tax or after-tax Roth basis"* and the page told its participants
  *"Roth — Not stated in the audited notes."* That is not a gap but a false
  claim about the document. Re-parse landed clean: **Roth 37,068 → 37,742,
  +674 plans / 651,733 participants, 0 lost**, and **100% of all 37,742 carry
  a filed quote**. Tesla (95,640 people) is the largest gainer. Store complete
  at 99.89%, HIGH at the baseline of 4, gate +0/−0.
- **Short-form pages now report their own 401(m) code** — 34,601 live plans,
  **5,543,636 participants** who previously saw only a list of things the DOL
  doesn't collect, while the fact it *did* collect sat unused in the payload.

## Waiting on you — now five, ranked

| # | item | reach | cost |
|---|---|---|---|
| 1 | **Recordkeeper wrong name** | **1,509 plans / 1.48M ppl** | pipeline + one prep run |
| 2 | Discretionary match shown as a standing "Formula" | ~4,469 pages | **display only, no re-parse** |
| 3 | Schedule A carrier as a recordkeeper source | unsized | pipeline + prep run |
| 4 | Row loss after region selection | small — see below | parser, mechanism unknown |
| 5 | NEC + eligibility extraction | new coverage | parser |

Plus the two unchanged settings: **GitHub Pages must serve `main`**, and the
**custom domain DNS**.

**My recommendation: 1, then 2.** The fix for #1 is already clear — the
discriminator sits unused in our own data (Schedule C service codes 15 and 64,
"Recordkeeping" and "Recordkeeping fees"). Prefer a provider carrying those;
failing that the platform named on Schedule C line 1b or the Schedule A
carrier; only then the top-fee row — and never publish a provider coded as an
auditor or a lawyer. #2 needs no re-parse at all.

## What I got wrong yesterday, and corrected

- **A whole-population verdict of "not ours" on the recordkeeper gap was
  falsified by one filing.** I had stratified by Schedule H spend and drawn
  every sample from the two highest bands — but an insurance-platform plan pays
  its cost *inside the product*, so it looks low-spend while having a perfectly
  identifiable provider. **My sampling frame excluded the shape by
  construction.** Reversed in project memory, kept rather than deleted so the
  reasoning that failed stays readable.
- **I nearly published "72% of lineups lose rows."** Naming the rows killed it
  in one script — they are `Beginning balance`, `Net income per Schedule H`,
  phone numbers and Schedule C form text, all correctly dropped. The real
  figure by outcome is **2 of 25**, and item #4 is small.

## What continues without you

The hourly pipeline, the audit, and the findings issue. One thing I flagged and
closed: fetch failures rose 68 → 78 and repeated, which is the signature that
means *code*, not weather — so I HEAD-probed all 78 and **every one is a
genuinely withdrawn filing**. The code was exonerated rather than convicted,
which is the right outcome of running the test either way.
