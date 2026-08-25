# What "90% coverage" can actually mean, per field

Measured 2026-08-25 against 110,555 plans. **42,389 are short-form (SF) filers
who file no audited attachment by law** — they can never carry notes-derived
data, so every figure below uses the **68,166 full-form** denominator.

## The hard ceiling for anything read from the audit notes

| | plans | share of full-form |
|---|---|---|
| full-form filings | 68,166 | 100% |
| …with a stored parse entry | 64,310 | 94.3% |
| …with ANY extracted features | **62,349** | **91.5%** |
| no usable notes text at all | 5,817 | 8.5% |

**91.5% is the ceiling for match, vesting, Roth and after-tax.** The 5,817 are
scanned-only, form-only, or otherwise unreadable filings. OCR already runs on
them; what remains is the residue.

## Where each field stands, and what is reachable

| field | source | now | reachable | why |
|---|---|---|---|---|
| **Provider** | Sch C Part I item 2 | **93.3%** | ✅ at target | filed on a schedule, not prose |
| **Investment options** | Sch H 4i + Sch D | **86.5%** | ~94% | limited by the same unreadable-attachment residue |
| **Match formula** | audit notes + Sch R 21b + code 2K | **64.3%** | **~68–70%** | see below |
| **Vesting** | audit notes | **68.2%** | ~72% | quote-only pool is only 2.4% extractable |
| **Roth / after-tax** | audit notes + codes 2K/2S | 35,081 / 4,110 | unknown | **no denominator yet** — we do not know how many plans SHOULD have after-tax |

## Why match cannot reach 90% by extraction

The 8,711 quote-only rows are plans where we located the sentence and got no
value. Reading them:

- **~1,175 (13%) contain an extractable formula.** v79 has now taken 440 of
  these (the safe-harbor "up to N%" phrasing and decimal-dollar ratios).
- **~2,242 (26%) are the wrong topic entirely** — an eligibility or vesting
  sentence displayed as the match. A correctness defect, not coverage.
- **The rest genuinely state no formula**: "discretionary", "as determined by
  each respective Adopting Employer", "the CBA determines the rate".

The 7,512-plan backlog (employer money, readable notes, no match sentence at
all) was sampled at 8 filings: **1 had a findable match formula**, 2 had
non-elective formulas (a different field), 5 stated nothing. ~12% ≈ 900 plans.

    64.3% + 440 (v79) + ~735 (remaining shapes) + ~900 (backlog) ≈ 67.5%

Pushing past that means stating formulas the filings do not contain.

## The one honest way to add real coverage: Schedule R line 21b

**4,902 plans file Sch R 21b = D (design-based safe harbor) and have no
extracted formula.** That is filed data. A design-based safe harbor must meet a
statutory minimum — either a match of at least 100% of the first 3% plus 50% of
the next 2%, or a 3% non-elective contribution.

- **3,276** of them also have employer money AND 8a code 2K (§401(m), i.e.
  match and/or after-tax) — three independent filed sources agreeing the plan
  runs a safe-harbor **match**.
- 1,009 have employer money but no 2K — more likely the 3% non-elective route.
- 110 have no employer money at all.

**Proposal:** display this as its own state — "Design-based safe harbor
(Schedule R line 21b); the filing does not state the tiers" — and report it as
a SEPARATE coverage line, not folded into "match formula". Folding it in would
move the headline number 7.2pp by redefining what it counts, which is the kind
of thing this project exists not to do.

## Recommended next work, in order

1. **Wrong-topic quotes** (2,242 match + 363 vesting): a sentence about
   eligibility shown as the match is worse than a blank.
2. **The vesting "nothing" bucket** (12,069): not yet investigated the way the
   match backlog was. Same question — sentence absent, or present and unfound?
3. **An after-tax denominator**: 4,110 stored with no idea what the true
   population is.
4. **Schedule R safe-harbor display**, if the owner wants it as a separate line.
