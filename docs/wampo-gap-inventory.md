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
| 14/18 | no | ERISA 103(a)(3)(C) limited-scope audit election |
| 14/18 | partial | Plan termination, partial termination, or freeze |
| 9/18 | no | Auditor name and opinion type |
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
10% minimum is a compliance issue. Same ingest gap.

### Parsing gaps — the information is in the PDF and the parser drops it

**The 4i "Identity of Issuer" column (a).** The largest one. The standard layout
puts the manager in column (a) and the product in column (b); `lib-4i.mjs` reads
(b) and discards (a), so `Fidelity | 500 Index Fund` is stored as
`500 Index Fund` and becomes unidentifiable. Verified in filings; the reason is
that the parser was built around recordkeeper layouts where the description
column does hold the whole name, and that assumption is recorded in project
memory as if it were general.

**Party-in-interest (`*`).** The parser strips the leading asterisk so it does not
corrupt fund names, and then discards it. That flag marks holdings in the
recordkeeper's own funds — the classic conflict-of-interest signal, and one of
the few things on a 4i that a participant could act on.

**Shares / units (column c) and cost (column d).** The parser reads column (c) to
decide which money column is the value, then keeps only `value`. Units would let
a reader reconcile a row to a published NAV, which is also the cheapest possible
check on a mis-scaled row.

**Schedule D Part I.** Used today only to link master trusts. The same page names
every collective trust the plan holds, with sponsor and EIN. Since collective
trusts have no public ticker and no published fee, this is the one public source
that identifies them by name — the standing answer to "CITs are private and hard
to find" has been sitting in a schedule the pipeline already fetches.

### Extraction gaps — in the audited notes, no extractor written

**ERISA 103(a)(3)(C) limited-scope election.** When elected, the auditor does not
audit the investment information; the custodian certifies it and the opinion is
scoped out. wampo presents every audited figure identically, so a reader cannot
tell which numbers an auditor actually stood behind.

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
Transamerica, Voya — are each described "Constant Duration". Discard column (a)
and all four become the same name, so dedup summed them:

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

**Prior-year figures shown as current.** Confirmed in three plans across three
auditors (Comcast among them): the parser takes the comparative column. Comcast
shows $16.3B when the current year reads $18.67B.

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
   root cause with item 2, so fixing column (a) removes the Stanley Black &
   Decker class outright — but the wrong-region cases (ZIP codes, fair-value
   tables, prior-year columns) are separate and need region scoring, not column
   handling.
1. **The three dataset columns.** Already downloaded, no parsing, no
   PARSER_VERSION bump. Late deposits alone is a genuine red flag no
   competitor surfaces.
2. **Column (a) issuer.** Largest correctness gain; needs a parser cycle.
3. **Schedule D Part I as a lineup source.** The only public route to naming
   collective trusts.
4. **Party-in-interest flag.** One line of parser change for a real signal.
5. Everything else, in the order the audited-notes extractor can absorb them.
