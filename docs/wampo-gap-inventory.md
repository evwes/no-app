# What wampo does not report, or reports wrongly — and why

A standing inventory in two halves: information Form 5500 filings **carry** that
wampo **does not surface**, and values wampo **does** surface that are **not in
the filing at all**. Each with the reason. Regenerate the presence
rates with `node scripts/gap-inventory.mjs --n 18`.

This exists because counting confirmed instances of a defect we already
understand measures nothing new. The useful question is which classes of filed
information never reach a reader, and what would have to change for each. A gap
with a reason is a roadmap; a gap without one is an absence nobody noticed.

**Presence rates below are from 18 filings sampled across the queue.** That is a
small sample and some detectors are deliberately loose (noted per row). Treat
the rates as "common / occasional / rare", not as precise frequencies. The
*reasons* are not sampled — they come from reading what the pipeline stores.

## What wampo stores today

```
lineup entry  ack confident coverageRatio fb features funds ocr planYear
              sdba sma smaKind source thousands ticker trustPtr
funds[]       name type value cit ownType            <- no issuer, cost, or units
features      match vesting eligibility roth afterTax inPlanRoth nec autoEnroll
              autoEscalate loans trueUp safeHarbor sdbaBrand frozen noEmployer
              nonPartDirected menu
plan detail   ack codes planYear pyb pye filedDate city zip planName
              activeParticipants partBalances assetsBOY assetsEOY
              contribEmployer contribParticipant rollovers benefitsPaid
              adminExpenses feeAdmin feeInvMgmt feeOther feeSal mtiaAck
fees          Sch C provider rows (name, codes, direct/indirect comp)
              Sch A insurance commissions
```

## The inventory

| Present in | wampo | Information class |
|---|---|---|
| 18/18 | partial | Schedule D Part I — collective trust names, sponsors, EINs |
| 18/18 | partial | Party-in-interest holdings (the leading `*`) |
| 18/18 | no | Corrective distributions / ADP-ACP refunds *(loose detector)* |
| 16/18 | no | Forfeiture balance and how forfeitures are used *(loose detector)* |
| 16/18 | no | Fair value hierarchy (Level 1/2/3) |
| 14/18 | **dataset** | ERISA 103(a)(3)(C) limited-scope audit election (Sch H Part III 3b) |
| 14/18 | partial | Plan termination, partial termination, or freeze |
| 9/18 | **dataset** | Auditor name, EIN and opinion type (Sch H Part III 3a/3c) |
| 8/18 | partial | Shares / units held per holding (4i column c) |
| 6/18 | partial | Cost column (4i column d) |
| 4/18 | **dataset** | Delinquent participant contributions (Sch H 4a) |
| 4/18 | partial | Participant loan interest-rate range and count |
| 2/18 | no | Revenue sharing / ERISA budget account |
| 1/18 | no | Blackout period / recordkeeper conversion |
| 1/18 | no | Named investment manager / 3(38) fiduciary |
| 0/18 | **dataset** | Nonexempt prohibited transactions (Sch H 4d) |
| 0/18 | **dataset** | Fidelity bond coverage |
| 0/18 | no | Plan's percentage interest in a master trust |
| n/a | **dataset** | Plan entity type — single-employer / multiple-employer / multiemployer / PEP (added #13) |
| n/a | no | Who *funded* an expense the plan reports (forfeitures, employer, revenue sharing) (added #13) |
| n/a | no | Auditor **change** between years (two audit reports, different PCAOB IDs) (added #13) |
| n/a | no | Who the plan actually **covers**, and who is excluded — bargaining unit, non-resident aliens, Puerto Rico, and HCEs barred from deferring (added #14) |
| n/a | no | Reconciliation of the audited financial statements to the Form 5500 total (added #14) |

`dataset` = the answer is a structured column in the EFAST2 files the pipeline
**already downloads**. `build-data.mjs` reads only the money columns from
Schedule H — verified by inspection. Those are ingest gaps, not parsing
problems, and they are the cheapest items on this list.

## A methodological trap this inventory hit, and what it means for the rates

Every filing embeds the blank Form 5500 pages, so the *question* "were there any
nonexempt prohibited transactions?" appears in **100%** of filings whether or not
the answer is yes. The first run of this script matched those question strings
and reported prohibited transactions, fidelity bonds and blackouts in 100% of
filings — a meaningless result that looked like a dramatic finding.

Detectors now require an **affirmative disclosure** in the audited notes, which
moved those three to 0/18, 0/18 and 1/18. The lesson generalises: presence of
the form's question is not presence of the fact, and for the yes/no compliance
answers the PDF is the wrong source entirely.

Two rows are still knowingly loose and their rates are overstated:
`/forfeit/i` matches the boilerplate definition of forfeitures as well as a
disclosed balance, and the corrective-distributions pattern matches the plan
document language as well as an actual refund.

## Why each gap exists

### Ingest gaps — a column already downloaded, never read

**Delinquent participant contributions (Sch H 4a).** A yes/no plus amount in the
dataset. It means the employer held participants' own deferrals past the
deposit deadline — one of the clearest fiduciary red flags on the form.
`build-data.mjs` reads only the money columns from that file.

**Nonexempt prohibited transactions (Sch H 4d / Schedule G Part III).** Rare, but
material whenever present. Same ingest gap.

**Fidelity bond coverage (Form 5500 line 4e).** A plan bonded below the statutory
10% minimum is a compliance issue. Same ingest gap. (The bond *amount* does
render in the PDF even though the checkboxes do not — LNC's line 4e prints
`15000000`. The 0/18 above is a detector artefact of looking in the notes.)

**Auditor name/EIN, opinion type, and the §103(a)(3)(C) election
(Sch H Part III 3a–3c).** Moved here from "extraction gaps" in report #13.
These are not prose in the notes: 3a is a four-way checkbox
(unmodified / qualified / disclaimer / adverse), 3b is the limited-scope
election, 3c is the firm's name and EIN — printed on the form page of
`20251009112104NAL0011345952001` as `ERNST & YOUNG … EIN 35-6565596`. Structured
Schedule H fields, in a file already downloaded. Not verified against the
extract header, because `askebsa.dol.gov` is unreachable from the sandbox; the
check is one line in the prep job's `columns:` log.

**Plan entity type (Form 5500 Part I line A).** Single-employer /
multiple-employer / multiemployer / DFE. `build-data.mjs:151` reads
`TYPE_DFE_PLAN_ENTITY_CD` solely to spot `M` for master trusts; the plan-entity
column is never read. This is not cosmetic — see "A pooled employer plan has no
plan design" below.

### Parsing gaps — the information is in the PDF and the parser drops it

**The 4i "Identity of Issue" column — (b) on the form, not (a).** The largest
one. Reports #8–#13 and every earlier version of this file called it "column
(a)"; that is wrong, and it collided with the party-in-interest row below, which
is the *real* column (a). Filings label their own columns and agree with the
instructions: **(a)** party-in-interest marker, **(b)** identity of issue,
borrower, lessor or similar party, **(c)** description of investment, **(d)**
cost, **(e)** current value. The standard layout puts the manager in **(b)** and
the product in **(c)**; `lib-4i.mjs` reads (c) and discards (b), so
`Fidelity Investments | 500 Index Fund` is stored as
`500 Index Fund` and becomes unidentifiable. Verified in filings; the reason is
that the parser was built around recordkeeper layouts where the description
column does hold the whole name, and that assumption is recorded in project
memory as if it were general. (Specimen with the header printed in full: ACI
Worldwide `20250923101453NAL0005573025001`.)

**Party-in-interest (`*`).** The parser strips the leading asterisk so it does not
corrupt fund names, and then discards it. That flag marks holdings in the
recordkeeper's own funds — the classic conflict-of-interest signal, and one of
the few things on a 4i that a participant could act on.

**Shares / units and cost (columns (c) and (d)).** The parser reads the
description/units column to decide which money column is the value, then keeps
only `value`. Units would let
a reader reconcile a row to a published NAV, which is also the cheapest possible
check on a mis-scaled row.

**Schedule D Part I.** Used today only to link master trusts. The same page names
every collective trust the plan holds, with sponsor and EIN. Since collective
trusts have no public ticker and no published fee, this is the one public source
that identifies them by name — the standing answer to "CITs are private and hard
to find" has been sitting in a schedule the pipeline already fetches.

**Category-noun rows — employer stock, GICs, brokerage, cash, loans (added #13).**
A sub-case of the column-(a) gap with its own consequence, so it is listed
separately. On these rows the description column (c) is a *category*, not a
name — "Common stock", "Investment contract - at contract value", "Brokerage
account" — and the identity is only in the issuer column (b). Dropping (b)
therefore does not degrade
these rows, it deletes them: LNC's stored lineup omits $113,237,840 of the
sponsor's own common stock and a $414,453,295 stable-value contract, 15% of a
schedule the pipeline nonetheless marks `confident`. The gap is
size-correlated with exactly the two holdings a participant most wants named.
Fixing (a) fixes this; nothing else will.

**The same drop also defeats the master-trust guards (report #17, cycle of
2026-08-24 21:08Z).** Harley-Davidson's 4i files "Interest Held in Master
Trust" in column (b) and "Various (includes Registered Investment Companies,
Self Directed Brokerage, etc.)" in column (c). With (b) discarded, the
$951.8M master-trust interest became a confident "fund" named "Various
(includes Registered", and every trust-pointer test — all keyed on the words
"master trust" — passed it. The site rendered four junk rows while the
trust's real 23-fund menu sat parsed and confident one link away. Measured:
37 of 343 trust-linked plans with own confident lineups had this shape
(Home Depot's top "fund" was OCR cipher; Comcast's was "At fair value").
A frontend shape rule now suppresses the class, but the *information* fix —
these rows should say what the filing says, "Interest Held in Master Trust"
— is the column-(b) ingest. This upgrades the (b) fix from "adds tickers"
to "restores the identity the guards depend on."

### Extraction gaps — in the audited notes, no extractor written

*(The §103(a)(3)(C) election moved to the dataset section in #13 — it is a
Schedule H checkbox, not prose. Its consequence is unchanged and worth keeping
here: when elected, the auditor does not audit the investment information, the
custodian certifies it, and the opinion is scoped out. wampo presents every
audited figure identically, so a reader cannot tell which numbers an auditor
actually stood behind.)*

**Forfeiture balance and use.** Notes routinely state the unused balance and
whether forfeitures reduce employer contributions or pay plan expenses. Real
money, and currently a live litigation topic.

**Revenue sharing / ERISA budget account.** wampo shows Schedule C provider fees
but not the revenue-sharing offsets against them, so the net cost picture — who
actually bears recordkeeping cost — is incomplete in exactly the direction that
flatters the plan.

**Corrective distributions / ADP-ACP refunds.** The plan failed nondiscrimination
testing and refunded money to highly-compensated participants.

**Auditor name and opinion type.** A going-concern or modified opinion is a
signal; wampo shows none.

**Fair value hierarchy.** Level 3 holdings are illiquid and hard to value.

**Master-trust percentage interest.** A plan holding 3% of a master trust is
shown the trust's entire lineup with no indication of its share. Detected in
0/18 here, but that is a detector limitation as much as a rarity — the phrasing
varies widely.

**Blackout / recordkeeper conversion.** Explains discontinuities between years.
Without it a reader sees an unexplained jump and cannot tell why.

**Named investment manager / 3(38).** Who chooses the menu, as distinct from the
recordkeeper, which wampo does show.

## The category this inventory was missing: information wampo reports that is WRONG

Everything above is an **omission** — filings carry it, wampo does not show it.
Filing tests through 2026-08-24 found a second and worse category: values wampo
**does** show that are not in the filing at all. An omission leaves a reader
uninformed. A fabrication leaves them confidently misinformed, and it is
invisible to a reader who has no reason to doubt the page.

These are recorded here rather than only in the per-cycle reports because they
change what this document is for. "What does wampo not report" is only half the
question; the other half is "what does wampo report that is not true".

**A fabricated holding that reconciles.** Stanley Black & Decker,
`20250729083806NAL0006830290001`. Four insurance contracts — Pacific Life, RGA,
Transamerica, Voya — are each described "Constant Duration". Discard the issuer
column and all four become the same name, so dedup summed them:

```
27,062,239 + 26,598,708 + 26,518,314 + 24,883,597 = 105,062,858
stored value                                      = 105,062,858
```

A $105M holding that does not exist, at a name no issuer filed. **It reconciles
to the lineup total**, so no sum-based audit check can detect it — the class of
error our existing checks are structurally blind to.

**ZIP codes as dollar values.** Delta pilots, `20251014143617NAL0003173265001`.
A Schedule C service-provider page parsed as a 4i schedule: six rows valued at
exactly **$782,514,321**, which is American Funds' ZIP+4 **78251-4321**, under
names cut from address lines (`PORTFOLIO US`, `CLASS A US`, `AMERICA US`).
**$4.70B of postcode inside a $10.66B displayed lineup.** Found twice — Altria
stores a holding named `WASHINGTON, D.C.` worth $20,549.

**A liability presented as an asset.** Morgan Stanley,
`20251010150034NAL0004732579001`, $21.64B. A fair-value hierarchy table parsed
as a menu, with a derivative *liability* summed in as an asset, overstating the
plan by $46,007,140. Its real 45-page 4i is image-only; OCR never fired because
a readable **wrong** region satisfied the parser first — the failure is not that
the right pages were unreadable, but that the wrong ones were readable.

**The sponsor's own EIN, printed as a holding (added #14, exact, largest
fabrication class measured).** A 4i attachment's header carries the plan
sponsor's EIN, and the layout splits it: the label and the two-digit prefix stay
left, the seven digits after the hyphen land where a value column belongs.
Scanning **every one of 1,627,519 stored fund rows** for a value equal to that
plan's own sponsor EIN (last seven digits or all nine):

| | |
|---|---:|
| holdings whose value **is** the sponsor's EIN | **1,921** |
| lineups affected | **1,802** |
| fabricated dollars | **$4,220,282,954** |
| …inside `confident` lineups, shown to readers as the plan's menu | **1,598 lineups, $2,989,639,761** |
| lineups where it is the **largest holding on the page** | **392** |

```
EIN 23-7268394  ->  "Plan Sponsor EIN: 23-"     $7,268,394   ICMA-RC
EIN 84-0858329  ->  "Plan Sponsor EIN: 84-"       $858,329   IMI Americas
EIN 04-3599000  ->  "PLAN SPONSOR EIN - 04-"    $3,599,000   Quotient Sciences
```

Expectation from chance is ~0.2 rows; 1,921 observed. All 1,921 names were
tested against a fund vocabulary and the 36 that matched are plan names, not
funds — **the class has no true positives**. The plan number does the same thing
where the schedule is thousands-scaled: Mass General Brigham
`20260702112746NAL0014451521001` stores a holding named **"ERISA Plan" worth
$500,000** from the cover sheet's `ERISA Plan #  500`. Unlike every other
fabrication here this one has a *free exact detector* — the pipeline already
knows the sponsor's EIN — and it is filtered at display as of #14
(`dropFormNumberRows` in `app.js`), pending a parser fix.

**A securities identifier summed into a multi-billion-dollar holding
(added #15, largest by dollars).** Custodian statements print each holding over
two lines, the second being `CUSIP: 00724F101`. Where the parser reads those
identifier lines as rows they all reduce to the same residual name and dedup
sums them. **58 rows in 31 lineups, $85,445,244,635**; by displayed exposure,
**30 plans covering 1,356,613 participants and $134.2B of plan assets** show a
table containing one, in **25 of them it is more than half the table**, and the
distinct dollars under an identifier label are **$59,223,106,612**. The Kroger
Co. 401(k) Retirement Savings Account Plan (160,358 participants) displays a
menu of exactly one holding, named **"CUSIP:"**, worth **$8,696,053,053** —
a figure that appears nowhere in the trust's filing, whose 4i is a 206-page
Northern Trust security-detail statement with 1,165 `CUSIP:` lines. Marriott
99%, Caterpillar 61%, Kohl's 54%, HCA 32%. Dropped at display in #15
(`ID_ONLY`); the parser still produces them.

**Futures contracts and lending collateral as menu options (added #15).** The
same statement-detail regions put instruments in the table that no participant
can choose: **202 rows in 91 lineups** name a futures contract
(`"Purchased Futures Contracts"` $1,087,807,083), **30 rows in 28 lineups** are
pending-trade lines. Timken's bargaining-unit savings plan shows seven Treasury
futures as its menu, one position counted twice under two CUSIPs.

**ZIP codes as dollar values, now measured.** Found twice by hand in #13;
across the corpus it is **97 rows in 96 lineups, $5,252,738** — `"Houston,
Texas"` $77,002, `"Bethesda, Maryland"` $20,814, `"H&R Block, Inc. One H&R
Block Way Kansas City, Missouri"` $64,105. Deliberately **not** display-filtered:
a five-digit ZIP collides with a plausible small holding, so a guard would start
deleting real rows. Parser work.

**Loan descriptions as fund names (added #14).** The participant-loan row's
description wraps, the value lands on its continuation line, and the
continuation becomes the name: MGB shows a holding called **"Dates Ranging From
October 2025 To November 2044"** worth $1,213,000. Corpus: **2,871 rows /
2,856 lineups / $5.62B** matching loan-description continuations, plus **596
rows / 589 lineups / $1.19B** that are bare date fragments. The *value* is real
(it is the loan balance); only the name is invented.

**Prior-year figures shown as current.** Confirmed in three plans across three
auditors (Comcast among them): the parser takes the comparative column. Comcast
shows $16.3B when the current year reads $18.67B.

**Old Republic International, $1.4B — 28 fund names fabricated from filler
columns (report #18, 2026-08-24).** The filing's schedule reads
`FIDELITY 500 INDEX   N/A   VARIABLE   N/A   1,056,601 sh   #   215,747,363` —
name first, then rate/maturity filler. The parser stored "VARIABLE 1,056,601
sh" as the fund name for every row, confident, while PIMCO RealPath, Fidelity
500 and Vanguard Growth Index sit unread in the first column. Same class as
the SMART Local 265 v67 candidate (N/A filler columns); Old Republic is the
second specimen and the larger plan. The values are the filing's values — the
names are not the filing's names, which puts this in the fabrication
category: a user sees "VARIABLE 8,330,607 sh" listed as a holding.

**Buchanan Ingersoll & Rooney, $0.4B — an OCR typo defeats the junk
vocabulary (report #19, 2026-08-24).** The stored confident "lineup" is six
rows of a financial-statement rollforward: "Investments at fair valuc"
($412M, 99.4% of the plan), "Notes recervable from participants", "Balance
January |", "New forfeitures", "Life insurance premiums". The v44 junk sweep
rejects exactly these rows — by exact vocabulary — and OCR misreads ("valuc",
"recervable") slip past it. The guard class is right and its matching is too
literal for OCR text: on `ocr:1` entries the statement-row vocabulary needs
one-character tolerance (v68 candidate, with the BWXT trailing-dash strip).
No master trust is linked, so the new frontend pointer guard does not catch
it either; the junk renders today.

**380 plans whose "holdings table" is a list of asset CLASSES, not funds
(report #28, 2026-08-25).** Five of ten filings in one cycle were this shape —
billion-dollar plans whose entire table is four to eight rows reading "Common
collective trust funds" (78% of one table), "Registered investment companies,
at fair value" (53%), "Participant-Directed Investments — Interest in..."
(97%), "INVESTMENTS (at Fair Value)" (99%). They pass every correctness check
we have, because the label really is printed in the filing and the class
really is worth that much; the tester scores them NAMES_MATCH. The defect is
the CLAIM: rendering them under a HOLDINGS heading tells a reader those are
the choices available to a participant.

Measured universe-wide: **380 plans** have class rows worth ≥50% of their
table. A parser-side fix was written and REFUSED BY THE GATE — Verizon's and
Sempra's master trusts legitimately file class-level detail, and deleting
those rows would discard the only holdings information those filings give.
So the rows stay and the claim changes: the page now says the filing reports
asset-class totals rather than individual funds, names the classes, and says
the fund lineup is not public in this filing. This is an honest gap in the
FILING, not in the parse, and it is now labelled as one.

**7,305 valued rows inside two-column entries carry no identity and a
two-word name — measured, and deliberately NOT fixed (report #37,
2026-08-25).** In entries where most rows resolve correctly to
`issuer | product`, some rows still read "Vanguard", "Fidelity Investments",
"TRANSAMERICA", "PACIFIC LIFE", "Cavanal Hill", "Adm Shr", "Various".

They are NOT section headers, which was the initial hypothesis: every one
carries a VALUE, and a header does not. So they are rows whose product name
was lost — the description cell was empty on that line, or the name wrapped.

The class is heterogeneous, and that is why nothing is dropped:
"TRANSAMERICA" and "PACIFIC LIFE" are plausibly the plan's real insurance
CONTRACT holdings, "Cavanal Hill" is a real fund family, "Adm Shr" is a
share-class fragment, and only "Vanguard"/"Fidelity" are unambiguous
manager-fallbacks. Dropping the class would delete real money from real
tables — the same trap that 3,034 "institution-suffixed" rows set two cycles
earlier, when the examples turned out to include employer stock.

Recorded here with its measurement so the next attempt starts from evidence
rather than the hunch. A safe fix would need per-row proof that the product
name exists elsewhere in the filing, which the current parse does not carry.

### A second kind of wrong: the numbers are right and the *statement* is not (added #13)

The four cases above are wrong **values**. Report #13 found wrong **claims** —
fields where the number or the quote is genuine but the label attached to it
asserts something the filing does not say. Counts are measured over all
**62,377 lineup entries carrying features**, not sampled.

**An unrelated paragraph presented as the plan's match disclosure.**
`app.js:662` renders `matchText` inside the "Employer Match" card,
badged `FORM 5500 AUDIT NOTES`, with no requirement that a formula was found.
52,514 lineups carry a `matchText`; **8,704 have no `match` formula at all**, and
**4,350 of those quotes contain no digit** — they cannot be stating a match.
**800 begin with the word "Vesting."** LNC `20251009112104NAL0011345952001`
shows a vesting sentence under Employer Match while the filing's own words,
never stored, are "$1.00 for each $1.00 that a participant contributes each pay
period, up to 6% of eligible earnings" plus a 4% Core non-elective.
*The fix is a display condition, not a parser cycle.*

**One sentence quoted as evidence for two different features.** 3,007 feature
pairs share a verbatim quote — `rothText=afterTaxText` 826,
`matchText=vestingText` 669, `matchText=eligibilityText` 419. Sharing is not
proof of error (a sentence can state two facts) but it is the exact signature of
a regex matching a keyword in a neighbouring topic, and it is free to compute.
Confirmed instance: LNC is shown `Eligibility ✓ 2 years of service`, quoting a
sentence about *vesting* of the Core contribution, for a plan whose notes state
it "covers substantially all employees" with no service requirement anywhere.

**Vesting stated without its scope.** Same filing: match and deferrals are
"fully vested at all times", only the Core contribution has a two-year cliff.
wampo prints one flat "Employer-money vesting: 2-year cliff" — wrong in the
direction that penalises the plan.

**A pooled employer plan has no plan design, and wampo states one.**
`20251230144924NAL0010542115001`, SUCCESSWISE POOLED EMPLOYER PLAN: "the
Participating Employers may elect to make matching contributions,
profit-sharing contributions, safe harbor, prevailing wage and nonelective
contributions". Match, vesting, auto-enrol and eligibility are per-employer and
unknowable from the filing; the "sponsor" is a pooled plan provider nobody works
for; an average balance spans unrelated employers. **195 plans name themselves
pooled-employer and 200 more multiple-employer** (name matching only, a floor,
and it catches a false positive called "PEP PRINTING, INC.") out of 110,555.
Suppressing design claims here requires the entity-type column above.

**Eligibility labelled immediate over a quote that states a waiting period
(added #14).** Measured over all 62,377 feature-carrying lineups: 9,849 are
labelled `Upon hire / immediate`, and **991 of them print a quote that states a
wait and never says entry is immediate**. Six Continents Hotels
`20251015085526NAL0002047779001` renders "Eligibility ✓ Upon hire / immediate"
directly above its own filing's words, "eligible to join the Plan on the first
day of the month following the completion of **6 months** of employment". Others
quote three months, 90 days, 60 days, or an age-21 condition. **Fixed at display
in #14**: when the label and its quote disagree, the quote stands alone.

**"Discretionary" asserted on a plan that filed a safe-harbor formula
(added #14).** Two independent counts of the same contradiction:

- **946 lineups** carry `match: "Discretionary — set year to year"` *and*
  `safeHarbor: "match"` on the same entry (of 11,012 discretionary labels).
- **1,488 lineups** carry a discretionary match label while **Schedule R line
  21b** — a separate filed field wampo already ingests as `shr` — reports the
  plan as design-based safe harbor `D`. (7,667 more are `A`, ADP-tested, where
  discretionary is consistent.) The two counts overlap by an uncomputed amount.

Same specimen: the quote behind the discretionary label is an accounting-policy
sentence ("…are considered payable to the Plan when the related participant's
contributions are payable"), while the filing states "a **safe harbor matching
contribution** … equal to **100% of a participant's contribution limited to
6%**", 4% for hotel employees, **$18,993,509** paid in 2024. A design-based safe
harbor match is fixed in the plan document; "the employer decides year to year"
is the opposite claim. **Not fixed** — choosing which of the two labels survives
is a judgement, not a display condition.

Allied Universal `20251002102450NAL0000272179001` (258,360 participants) is the
sharpest form of it: wampo shows "Discretionary — set year to year", quoting the
one sentence about a discretionary match that the filing then negates —
"**There were no discretionary matching contributions for the year ended
December 31, 2024**" — while its real match, never stored, is "20 cents, 25
cents, and 50 cents for each dollar … for participants with less than 10 years,
greater than 10 but less than 19 years, and more than 19 years of service …
**For administrative personnel only**".

**Reconstructed vesting tables that repeat a year (added #14, small).**
`"5 yr: 80%, 5 yr: 100%"` — the `<` bound dropped. **138 of 11,801** tables.
Recorded with its own disproof: a first pass that matched `(\d+) yr:` counted
**4,762**, because the extractor usually *does* render the bound as "less than
1 yr: 0%, 1 yr: 20%" and the pattern matched inside it.

**Cost-column markers glued to fund names (added #14).** Column (d) is Cost, not
required for participant-directed money, so auditors print `N/R` there — and
where it sits between the name and the value the parser keeps it. **32,346 rows
in 1,286 lineups end in "N/R", $150.7B of holdings**; another **949 rows in 35
lineups** end in `$0.00`. Specimen: every one of ACI Worldwide's 27 holdings.
The name is also the ticker-index and expense-ratio key, so the whole class
silently loses both. **Stripped at display in #14** (`cleanCostMarkers`); "NR"
without the slash is left alone because it can be a share class.

**A cost attributed to participants who did not pay it.** `app.js:848` prints
"Total administrative expenses ≈ $X per participant" and `feePeerNote` ranks
that per-head figure against peers. LNC's Schedule H 2i(12) is $182,511; its
forfeiture note reads "forfeitures of $182,511 were used to pay administrative
expenses of the Plan" — the identical figure. Participants bore none of it. The
`$0` branch of `feePeerNote` is carefully hedged; the non-zero branch asserts a
per-participant charge with no hedge at all. Schedule H reports what the plan
spent; only the notes say who funded it.

### Why this category exists at all

Each of these follows from the same root as the omissions — a region or a column
chosen wrongly — but the consequence inverts. When the parser drops information
the page is merely thin. When it *keeps* the wrong information, the page is
authoritative and wrong, and every downstream check that reconciles totals
agrees with it.

The practical consequence for the audit machinery: `scripts/audit-data.mjs`
cross-checks identities (lineup sums vs Schedule H, top holding vs plan assets).
Every fabrication above **passes** those checks, because summing four real
contracts produces a real total and a ZIP-code row sits inside a plausible
lineup. Detecting this class needs a different kind of check — one that asks
whether a stored value appears in the filing at all, which is exactly what
`scripts/filing-batch.mjs` does and no pipeline stage does.

## Priority

0. **The fabrications.** An omission is a gap; a wrong number is a defect, and
   two of the four classes above put invented values on the page. They share a
   root cause with item 2, so fixing the issuer column removes the Stanley Black &
   Decker class outright — but the wrong-region cases (ZIP codes, fair-value
   tables, prior-year columns) are separate and need region scoring, not column
   handling.
0a. **The EIN rows (#14).** $4.22B of holdings whose value is the sponsor's own
   EIN, $2.99B of it inside lineups readers see, and in 392 plans it is the
   largest holding on the page. It is the only fabrication with an exact,
   already-available detector, so it is also the cheapest thing on this list.
   Display-guarded as of #14; the parser should stop producing them.
0b. **The false statements (#13, #14).** Cheaper than everything below it and
   nothing else on this list is a *claim the filing contradicts*. Gating
   `matchText` on a formula having been found is one condition in `app.js` and
   removes 4,350 digit-free quotes from a card headed "Employer Match";
   hedging the non-zero branch of `feePeerNote` is one sentence. Neither needs
   a re-parse.
1. **The dataset columns.** Already downloaded, no parsing, no
   PARSER_VERSION bump: late deposits, prohibited transactions, fidelity bond,
   plus (added #13) the Schedule H Part III auditor/opinion/§103(a)(3)(C)
   fields and the plan-entity type. Late deposits alone is a genuine red flag no
   competitor surfaces; entity type is what stops wampo asserting a plan design
   for ~390 pooled and multiple-employer plans that do not have one.
2. **The issuer column (b).** Largest correctness gain; needs a parser cycle.
3. **Schedule D Part I as a lineup source.** The only public route to naming
   collective trusts.
4. **Party-in-interest flag.** One line of parser change for a real signal.
5. **The value-regex floor on thousands-scaled schedules.** `lib-4i.mjs:118`
   requires three characters in a value, so in a "($ in thousands)" schedule
   every holding under $100,000 is invisible. MGB stores 34 of the filing's 65
   rows and still reconciles to 99.93% of plan assets, because the 30 dropped
   rows are small — which means the coverage note added in #13 says the table
   is the whole plan while the menu is half of it. **Share of assets is not
   share of holdings.** Bounded: only 207 lineups (5,316 rows) are
   thousands-scaled at all.
6. Everything else, in the order the audited-notes extractor can absorb them.

## Comparative-statement class labels double-counted (measured 2026-08-25, NOT fixed)

**Shape.** A filing's region spans the statement of net assets, the fair-value
hierarchy table AND the real 4i schedule. Class labels ("Common Collective
Trusts", "Pooled Separate Accounts", "Mutual Funds") appear in all three, with
the CURRENT-year value in one place and the PRIOR-year value in another. The
same-name dedup treats different values as different lots and sums them.

**Worked example.** Materials Testing Consultants
(20260114130255NAL0015309297001, assets $8,941,364): "Common Collective Trusts"
is filed at $5,502,063 (2024) and $4,918,268 (2023); stored as $10,420,331 —
exactly the sum. Same for Pooled Separate Accounts ($2,635,532 + $3,254,879 =
$5,890,411). Region ratio 2.98, so the plan shows NOTHING despite 34 correctly
parsed Principal holdings sitting in the same region.

**Why it is not fixed.** The obvious rule — drop pure class-label rows in
tables of >=10 rows — measures 3,378 entries and 3,091 confident, and the
matches are mostly REAL holdings: STMT_ROW's alternatives end in `\b.*`, so
"Money market fund, Fidelity Govt Money Market Fund" and "Common Stock, Class B"
match too. Shipping it would delete thousands of genuine rows.

**Where a real fix would go.** Either (a) the dedup, which currently sums
same-name/different-value rows on the theory that they are share classes — a
prior-year column is the counter-example; or (b) region selection, so a
candidate spanning both a detail table and its own aggregates is recognised as
double-counting. (b) is the more principled and the harder.

## Double-rendered regions still unrepaired (measured 2026-08-25, 10 plans)

v74 recovers 12 of the 24 v73 doubling casualties. The remaining ten sit at
ratio ~1.9 and show no lineup: CMD Corporation, Mitek, Westlie Motor, 4 Bears
Casino & Lodge, New Challenges, Catalyst Medical Group, Coldwater Veneer, MB
Precision, VP Holdings, Hertzberg-New Method.

They are the same "two copies inside one region" family, but neither
reconstruction reaches them: the copies share neither normalised names (so the
name view does nothing) nor enough exact value pairs to clear the 0.6 gate (so
the value view does not fire). Likely causes to check next: copies whose values
differ by rounding or by year column, and copies where one is partially eaten so
the pairing is incomplete.

The principled fix is at REGION SELECTION — recognising that a candidate spans
two renderings of the same schedule and splitting it — rather than repairing the
row set afterwards. The reconstructions in v74 are a measured stopgap, penalised
0.05 and gated to regions already at 1.5x assets so they cannot touch a correct
parse.

## Rounded second renderings with a plan-name prefix (measured 2026-08-25)

Westlie Motor Company (20250821150052NAL0002159299001) files its schedule twice:
once with exact values ("Vanguard Growth Index Admiral Shares $1,904,199") and
once ROUNDED TO THOUSANDS with the plan name glued to the front of every row
("Westlie Motor Company 401(k) Profit Sharing Plan FIMKX Fidelity Advisor
Focused Emerging M $949,000").

Neither v74 reconstruction reaches it: the names differ (plan-name prefix) and
the values do not pair exactly (rounding). After v75 removes the form-boilerplate
rows the region sits at ratio 1.85 rather than 2.20, so the remaining excess is
this rounded copy.

Two candidate fixes, unbuilt: (a) strip a leading sponsor/plan-name prefix from
row names — parse4i already receives sponsorName, parseRows does not; (b) pair
rows whose values agree to within rounding (round both to 3 significant figures
before pairing) rather than exactly. (b) is the more general and the riskier —
exactness is what made the v74 value-pair view safe.

## The NAICS business code as a value — the fix that would subsume three guards

Form 5500 box 2d carries a 6-digit NAICS business code. When a candidate region
sweeps a form page, the sponsor's wrapped address becomes a row name and that
code becomes its dollar value. Three guards now catch three surface forms of it:
EFAST2 placeholder letters (v74, 411 rows / 390 confident), "(see instructions)"
text (v75, 72 rows / 36 confident), and "c/o" notation (v75, 19 rows / 18
confident).

The identifying signal is the VALUE, not the name: a 6-digit number drawn from a
closed published list, recurring across unrelated plans (522130, 624100, 623000,
611000, 541700, 541512, 447100, 236200, 483000, 524150, 561790, 339900, 315990,
621420, 522120, 333310, 111210 all seen). A row whose value is a NAICS code AND
whose name is address-shaped is this defect regardless of how the address reads.

Not yet built. It needs the NAICS list (or at least the ~1,000 codes valid for
box 2d) and a name-shape test, and it should be measured against real holdings
that happen to be worth exactly $522,130 before shipping.

## Issuer column wrapping around the fund name (seen 2026-08-25, not measured)

20251014152028NAL0006620962001 stores rows like "Great Gray Trust Retirement
Plan Moderate 2045 Fund R1, Company" — the issuer "Great Gray Trust Company"
wraps across two lines in column (b), and the fund name from the middle line is
assembled between its halves. The filing-batch tester scores this WRONG_REGION
(0/6 stored names appear in the filing) because the stored string is not
contiguous anywhere in the text.

The funds are identifiable and the values are right, so this is a naming defect
rather than a coverage one. Not yet measured universe-wide; the query to run is
stored names where a known house name appears SPLIT around other words
(house-first-word … house-last-word).
