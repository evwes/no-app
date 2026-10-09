# wampo as an agent swarm — how the seven fields get filled

**Written 2026-10-09, the first session after the owner pause lifted.** The
owner's brief: a reader types a company, a plan name or an identifier, and gets
seven things — custodian, company match, vesting schedule, contribution
capabilities (including **after-tax**), investment options, fund fees or
comparables for collective trusts, and YTD / 1YR / 5YR / 10YR performance. The
foundation stays; it becomes an agentic system where a swarm coordinates on one
optimisable loop.

This file is how. It is not a plan to rewrite the pipeline — the pipeline is the
durable layer and works. It is a plan to give the agents **a shared substrate, a
single objective, and an adversary.**

---

## 1. The substrate: the field ledger (BUILT, `scripts/lib-ledger.mjs`)

Before this, accuracy was measured as **items**: confident lineups, match
coverage, vesting coverage, fee-code percentage — each on its own axis, in its
own units, in `docs/coverage-history.jsonl`. That is enough to catch a
regression and cannot answer the question a reader actually arrives with: *for
this plan, which of the seven things do we know?* **Seven unrelated counters are
not something a swarm can coordinate on.**

The ledger emits one cell per plan per field, in one of five states:

| state | meaning | counts as |
|---|---|---|
| `published` | a reader sees a value today | the win |
| `withheld` | we hold something and deliberately do not publish it, because a guard judged it wrong | **neither** |
| `partial` | part of the field is settled and part is unknowable from what we have | work |
| `absent` | the filing could carry it; we did not get it | **the work** |
| `impossible` | the source cannot carry it, permanently | the ceiling |

**First reading, participant-weighted over 116,001,210 people:**

| field | shown | ceiling |
|---|---|---|
| custodian | 89.9% | 0.0% |
| match | 68.3% | 8.1% |
| vesting | 77.4% | 8.1% |
| contributions | 69.6% | 0.0% |
| lineup | 94.0% | 8.1% |
| **one scalar** | **79.83%** | |

### Why the denominator is the whole design

44,114 of 112,652 plans are **short-form filers and attach no audited financial
statements by law**. Their match, vesting and fund menu are not missing — they
are unobtainable from this source, for every one of them, forever. If
`impossible` counted against the score, then the loop would optimise a number it
cannot win, a genuine improvement would shrink to noise against a DOL refresh,
and — worst — an agent hunting the largest gap would be sent straight at the
44,114 plans where there is nothing to find. So **`score()` divides by the
possible cells only.**

A detail that matters for agent design: the ceiling is **8.1% of participants**,
not the 39% the plan count suggests, because short-form filers are
overwhelmingly small. And it is not uniform — **code 2R survives the ceiling**,
because the Form 5500's characteristic codes are on the short form too, so Roth
availability is knowable for 1,530 short-form plans whose attachment-dependent
fields are correctly impossible. *Writing off a plan because its attachment is
missing discards a field the form itself answers.*

### Why `withheld` is a separate state and not a gap

v199/v200 **withdraw** a misread match formula rather than publish it, so the
fall in match coverage *is* the improvement. **29,015,408 participant-cells are
in that state.** A flat "coverage" metric would have been quietly demanding we
fill them, and an agent rewarded on coverage would put the wrong formula back.
**This is the single most important thing the ledger protects**, and it is why
the objective is not "coverage".

---

## 2. The roster: one agent per field, plus three that are not fields

Each field agent owns exactly one cell type. It claims work from the ledger
ranked by **participants affected**, and it reports in **ledger deltas** — never
in prose, never in "improved coverage".

| agent | owns | its instrument |
|---|---|---|
| `field-custodian` | custodian | Schedule C item 1/2 codes, Schedule A carrier, line 1b platform |
| `field-match` | match | `lib-4i` formula arms + `matchQuoteOk` |
| `field-vesting` | vesting | `lib-4i` vesting arms + `vestingQuoteOk` |
| `field-contributions` | contributions | codes 2R/2K + the notes; **after-tax is the hard one** |
| `field-lineup` | lineup | `parse4i`, the confidence floor, the trust link |
| `field-fees` | fees | `fund-er.js` patterns, issuer-priced ER, the suppressors |
| `field-performance` | performance | EDGAR N-PORT + RR XBRL (see `docs/performance-source.md`) |

And three agents that are not fields, which is where the design earns its keep:

- **`wampo-orchestrate`** — reads the ledger, ranks addressable gaps by people,
  assigns at most one field agent per cycle, and refuses to assign two agents to
  the same shipped expression. It owns the one thing a swarm cannot be trusted
  with: **serialisation on the pipeline.** One re-parse in flight at a time, and
  `[skip ci]` on any commit touching the six cancellation-relevant files while a
  run is live on the same ref.
- **`wampo-verify`** — the adversary. See §4.
- **`wampo-contract`** — owns the published-claim rules every agent must satisfy
  before a cell may move to `published`. See §3.

Existing agents keep their jobs and are now addressable by field:
`filing-forensics` (diagnose a bucket), `funds-and-tickers` (extend `fund-er.js`),
`fund-facts` (the only writer of verified ticker/ER/return), `wam` (work an item
end to end).

---

## 3. The contract: what a cell must satisfy to be published

These are not new rules. They are this project's hard-won invariants restated as
preconditions an agent can be held to, because **a swarm multiplies whatever
discipline it starts with.**

1. **A ticker, a fee and a return are SOURCED, never derived.** Every published
   figure carries an as-of date and a source URL. `data/fund-facts.json` already
   enforces this and `scripts/fund-facts-check.mjs` refuses undated, unsourced,
   future-dated and implausible figures.
2. **Four published states for a value and no fifth** — asserted, comparable
   (behind the existing asterisk), `NA`, or withheld **with a reason**. The page
   must say *why* there is no value, exactly as it says why there is no fee.
3. **Blocking a wrong answer must never suppress the honest evidence.** Recorded
   five times (v82, v83, v84, v86/87, v202). A guard that rejects a label keeps
   the sentence.
4. **A guard and the claim it licenses are one change.** A trigger must not be
   widened without rewriting the sentence it publishes.
5. **An error code is a published claim.** One code carrying two meanings told
   readers a filing had been withdrawn when the fault was ours.
6. **Never publish a figure measured through a different question than the page
   asks.** Measure through the function the page calls, with the argument the
   page passes, and apply every condition the page applies — including the
   trust-serving condition, which three published figures were wrong for want of.

---

## 4. The adversary, which is the part that makes a swarm safe

**Every field agent is rewarded for moving cells to `published`. That is a
machine for manufacturing confident wrong answers,** and this project's record
is a catalogue of exactly that failure: 80% of one run's "gains" were menus that
were not menus; a legibility fix handed five whole menus to a junk demotion; a
repair shipped `Vanguard Windsor Fund` where the filing said Windsor **II**,
past eight pins, four load-bearing controls, a clean whole-store diff and a green
smoke test.

So `wampo-verify` exists, and its design is deliberately asymmetric:

- **It samples `published` cells, never `absent` ones.** The optimising agents
  already have every incentive to look at what is missing; nobody is paid to look
  at what is already claimed.
- **It can only ever LOWER the score.** It has no path to publishing anything.
- **It draws participant-weighted and at random**, because ranking picks what to
  read and only a random draw estimates a rate — two fix yields on this record
  were over-predicted by 25x and 12x from top-N samples.
- **It reads the filing**, not the store. A store-side proxy cannot see text the
  extractor never stored, and that is precisely where wrong answers hide.
- **A confirmed wrong cell is a permanent `docs/accuracy-log.md` entry** — what
  was wrong, the change, the prevention — plus a regression specimen in
  `docs/defect-specimens.json`. Entries are never deleted.

The loop's health is therefore **two** numbers, not one: the scalar going up, and
the verifier's confirmed-wrong rate not going up with it. **A rising scalar with
a rising wrong rate is the failure mode, and it is invisible to a single
metric.**

---

## 5. The loop

```
  orchestrate:  read ledger  →  rank addressable gaps by PEOPLE
                              →  assign ONE field agent
  field agent:  size the class (random draw, not top-N)
                              →  read real filings
                              →  build the guard WITH its single-protection cases
                              →  pre-register the figures BEFORE dispatch
                              →  ship  →  measure the delta in LEDGER CELLS
  verify:       draw published cells at random, participant-weighted
                              →  read the filings  →  confirm or refute
                              →  log + specimen every confirmed defect
  orchestrate:  re-read ledger  →  record both numbers  →  next
```

**Pre-registration is what makes a delta a prediction rather than a story.** An
agent states, before dispatch, the figures the run must produce and a named set
of plans; a run that moves anything else is the thing to investigate. v201
predicted 5 plans and delivered 7 (production's OCR path read text a local cache
did not contain); v202 predicted 2 and delivered 103, because its safety
argument was borrowed from a mechanism it did not describe. **Both were caught by
the registration, which is the point** — a wrong prediction that is written down
is a finding.

---

## 6. State of the build

**Done:**
- `scripts/lib-ledger.mjs` + `ledger-report.mjs` + `ledger-test.mjs` — the
  substrate, the scorecard and 34 controls, every state asserted reached on real
  data and the short-form and trust-serving conditions pinned in both directions.
- `docs/performance-source.md` — the performance source decided (EDGAR), with
  the coverage measured and the adapter interface specified.

**Next, in the order the ledger itself ranks them:**

1. **`field-contributions`, 26,352,603 participants / 56,027 plans.** The single
   largest addressable gap, and it is the field the owner capitalised. Every one
   of those plans sits at `partial` for one reason: **characteristic code 2K is
   401(m), covering a match AND/OR after-tax contributions, and cannot tell them
   apart.** Pretax is definitional and Roth has code 2R, so after-tax is the one
   of the three only the audited notes settle. Parser work, well-defined, and
   nothing has been aimed at it.
2. **`field-custodian`, 9,424,816 participants / 44,107 short-form plans** whose
   Schedule A carrier `build-data` already resolves and never reads, plus
   2,237,745 / 4,622 full-form plans with no provider resolved. One prep-run
   change; no parser bump.
3. **`field-fees` / `field-performance` groundwork: the seven-manager index-CIT
   comparable gap.** 42.7% of the no-symbol money is named collective trusts and
   **seven managers are 96% of it**, mostly index CITs whose index is named in
   the row. Worth more published cells than the returns feed itself and needs no
   new source. Size it with a participant-weighted draw first.
4. **`field-performance` step one:** store CIK + seriesId + classId in
   `fetch-sec-funds.mjs` — three fields it already parses and discards on line
   250 — and re-run `sec-funds.yml`. Nothing in EDGAR is addressable without
   them.

**Owner-gated and not to be started unasked:** everything in `CLAUDE.md`'s
owner-gated list, and the one money question in `docs/performance-source.md` —
whether collective-trust returns are worth a Morningstar licence, since no free
source publishes them.

---

## 7. Two things the ledger changed about the plan on sight

Worth recording, because both were different before it ran.

**The ceiling is 8.1%, not 61%.** `lib-ledger.mjs`'s own header first said "the
ceiling is ~61%" — which is 68,538/112,652, a **plan-count** figure applied to a
**participant-weighted** score. The denominator argument was unchanged and the
number illustrating it was wrong by ~5x: this record's most repeated error, *a
count keyed on plans mistaken for a count of people*, met in the header of the
file written to prevent it. An agent reading the wrong figure would have
concluded the loop had 39% of its people permanently out of reach.

**The largest gap was not where anyone was looking.** Nothing in the queue was
aimed at contributions. The ledger put it first at 26.4M participants — and it is
exactly the field the owner wrote in capital letters.
