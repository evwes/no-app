# wampo morning brief — 2026-10-04, 11:1xZ (7:1x AM ET)

Overnight and through the morning: **eleven ships and seven classes closed by
evidence**, and the closures are still the more useful half — six separate
repairs were measured, found net harmful or unfounded, and *not* shipped.
**`PARSER_VERSION` is 200**, main is at `50d42818`, Pages green on it, and a
scheduled pipeline run (#573) is in flight on main, so nothing mirrors until it
lands and the branch adopts its data commit.

**Two of this morning's three findings were defects in MY OWN measuring
instruments rather than in the product**, which is worth your attention because
it means some earlier figures were taken through a tool that was quietly wrong.
Both are fixed and the tool is now tracked and tested. Details below.

**The three biggest arrived after midnight, and together they stop $103 billion
of holdings from reading as named funds.** A parser change (v200) stopped
publishing a misread match formula for 34 plans; a one-token display change
stopped **$51.0B** reading as named when neither the name nor the issuer names
anything (**3M alone is $18.4B at 74.7% of its published menu**); and a third
stopped **$52.0B** across **1,082,596 participants** whose published "fund name"
was built entirely of type-label words — Providence Health's `Registered
investment company funds` at 48.0% of a menu, 3M's bare `companies` on 25 rows,
Action Safety Supply's entire menu reading `accounts`.

**READ EVERY PARTICIPANT FIGURE BELOW WITH A ~3% CAVEAT.** Found last evening and
not yet fixed: **28 plans claim 3,413,761 participants (2.94% of the weighted
universe of 116,001,210) against beginning-of-year assets under $10 a head** —
mostly short-form, EOY 0, a handful of balances. *The 49 plans / 3,469,170 this
brief carried an hour ago is superseded: the first screen gated on END-of-year
assets, which are $0 for a wind-down by definition, so it swept in real
terminated plans whose counts are correct.* Avalon Capital Management publishes **1,955,672**
participants (second-largest in the universe, above Amazon) against $6,087,098,
and its `assetsBOY` is **$1,955,672** — the same number, and checked against the
whole universe rather than asserted: **exactly 1 of 112,652** plans has its claim
equal a dollar figure on its own row. Most of the rest are staffing and PEO firms
where the figure is plausibly the *eligible* population as filed — **tested, and
on 20 of the 28 `activeParticipants` is at least half the claim**, so only ~8
have nothing supporting them, and those 8 carry 89% of the weight. Unusable as a
reader-facing number and harmful as a weight, but not wrong in form. **The fix is a disclosure, not a correction**, and it should be
settled before the queue's other sizes are trusted, because every one of them is
denominated in this field.

## Shipped and live on main

All display-side, all name-or-quote-only, each with the whole-store price taken
through the page's own renderer:

| | reader-facing | what stops being published |
|---|---|---|
| **"$0K" for a nonzero amount (10:4xZ)** | **16,497 holding rows / 8,103 plans / 8,069,421 ppl**, plus 1,810 average-balance cells and 185 plan-asset cells | `money()`'s floor printed **"$0K" for every amount under $500**. FedEx's `Cash Reserves Federal Money Market Fund Admiral` at **$34**, Fisher Sand & Gravel's three rows at **$2**, Tokai Carbon's **$1**. ***$0 is not a measurement; it is the formatter's floor*** |
| **a name built ENTIRELY of type-label words (06:0xZ)** | **147 rows / 126 plans / 1,082,596 ppl / $52,004,779,703** | Providence Health's `Registered investment company funds` at **48.0% of a menu, $12.47B**; Trinet HR III/IV's `Registed Investment Co.` to **280,299 readers**; 3M's bare `companies` on 25 rows, $14.37B; National Rural Electric's `Common Collective Trusts (Pages 165-166)`, **$9.28B and the largest row on its page** |
| **the issuer gate's untested premise (04:4xZ)** | **20 rows / 18 plans / 245,810 ppl / $51,048,548,123** | **3M's `Common/collective trusts` · `Investments measured at NAV` · `Collective trust` at 74.7% of its menu, $18.4B** — the same empty answer in three columns. GM $15.8B at 66.4%; Union Pacific $8.1B at 60.9% |
| **v200: a misread match formula (02:4xZ, parser)** | **34 plans / 55,182 ppl** | Teledyne's `50% of the first 4% of pay` where the filing says `50% of 8% … not to exceed 4%` — we were **understating the benefit by half** to 12,959 readers |
| trustee's corporate style (21:5xZ) | **2,795 rows / 430 plans / 1,406,886 ppl / $16.0B** | Target's `State Street Bank & Trust Company SSGA S+P 500 INDEX SER A …` at 21.1% of its menu. **359 tickers GAINED, 0 lost** |
| unit count inside a fund name (00:3xZ) | 310 rows / 28 plans / **491,936 ppl** / $11.7B | JPMorgan Chase's own plan: `… SEPARATE ACCT 2,271,585,254 UNITS` at 6.0% of its menu |
| a name containing itself twice (01:5xZ) | 224 rows / 129 plans / **232,595 ppl** / $5.0B | ADP's `Northern Trust S&P 500 Index Fund NORTHERN TRUST S&P 500 INDEX FUND`, $1.51B, 21.3% of its menu, plus six more rows on one page |
| 4i column rule as a share class (15:3xZ) | 126 rows / 74 plans / 47,269 ppl | a column bar published as a class designation |
| `quoteTrim` (16:2xZ) | 64 quotes / 64 plans / **129,653 ppl** | table debris leading a published match quote |
| welded share count, merge-side (#566) | 9 rows / 8 plans / 3,869 ppl | `Invesco Stable Value Trust, 91,398,409 shares` |

Every one moved ticker, fee and asterisk on **0** rows except the trustee ship,
which gained 359 symbols and lost none, and the self-repeat ship, which moved one
shown type — and that one is a **promotion**: SRG LLC's doubled
`Guaranteed Investment Contract` gains "Filing names no specific fund", because
the duplication had been *defeating* `isNamelessFundRow` and making a generic
non-name look specific.

**Mirrored:** `23b4fa32` → `cc2795a6` → `b7e3676c` → `330e38cd` → `7c5f3d41` →
`280359f3` → `f2f859f8` (v200 and its own store, a **matched pair**) →
`bf3d2132` → `cf1856be` → `25880065` → `aa1836d2`. site-test
#157/#159/#160/#161/#162 all green and **#163 running on the newest ship**;
**Pages #876 on main's HEAD is green** — read rather than assumed, since the
cycle before left it pending.

**v200's verdict corrected two of my own registrations, which is the more useful
half of it.** The gate's own field hit its registered **floor** exactly
(`matchMisread` 199 → 233, +34 against +33, the one extra arriving by the
full-text path the caveat named). But `match` fell 26 where I registered 33, and
my first explanation was **refuted by measurement**: ***a net delta on a shared
metric cannot verdict one arm of a full re-parse***, because a pv bump re-runs
every other arm too. Registering five fields as "unchanged" was wrong by
construction for the same reason — all 15 gains were read, 0 losses, and **Levi
Strauss (8,288 ppl) gained a 30-row menu** from its own 4i attachment.

**The newest ship is also the clearest case of the method paying for itself.**
The queue had sized that class at **88 rows** from a `/regist/` screen; the
general form of the discriminator reads **611**; what shipped is **147**,
because reading the 611 showed they were five different remedies wearing one
shape — a welded vintage (`Fund 2030` through `Fund 2065`, a whole ladder),
a real designation (`SEPARATE ACCOUNT II`), OCR debris, trailing joiners. *The
queue asked for a wider instrument and the data asked for a narrower one*, two
cycles running. And **seven of the rows it reaches are employer stock** —
Altria's bare `Shares` carries ticker MO on **$1,456,691,207** — so the
predicate is injected into `isNamelessFundRow` rather than added beside it, and
that function's employer-stock early return is the only thing standing between
those seven and a false qualification. *Where a predicate is composed decides
what protects it.*

## Found wrong and fixed the same night

**A ship published a wrong fund name past every gate, and only the page caught
it.** The 15:3xZ column-bar arm first accepted a doubled bar — which is the Roman
numeral **II**, not a column rule — so Lacroix's `… Vanguard Windsor || Fund`
published `Vanguard Windsor Fund` (VWNDX) where the filing says Windsor **II**
(VWNFX), *a different fund*. Eight pins passed, four negative controls were each
load-bearing, the whole-store diff read 0 tickers / 0 fees / 0 types, and
site-test was green. It surfaced only on regenerating the crawlable pages and
reading the one page that moved. Corrected within the hour; four doubled-bar rows
now ship exactly as filed, still showing a bar, because *a visible artifact warns
the reader where a wrong fund name reads as knowledge*.

The same shape nearly repeated on the trustee ship: every gate passed and one row
published `Vanguard Fiduciary` on $70,452,841. Caught by regenerating the pages,
fixed, and confirmed **by absence** — 19 changed pages became 18.

**And a third time, two hours ago, on the newest ship.** Its page-reference arm
first took a singular `(page 166)`, so the regenerated page qualified National
Rural Electric's `Registered Investment Companies (Page 166)` and left
`Common Collective Trusts (Pages 165-166)` — **$9,284,475,171, 48.6% of that
plan's menu and the largest row on the page** — reading as a named holding two
rows above its qualified sibling. Nothing in 1.7M rows of diff showed it; the
13-file page diff did. *One of two spellings of a caption family is worse than
neither*, and the argument for the fix was not symmetry but consistency with a
predicate already shipped: `isGenericTypeName("Common Collective Trusts")` was
already true, so only the page pointer defeated it. **Three times now the page
has caught what every count passed.**

## The measuring instruments, which is where two of three morning findings landed

**The hourly draw had been drawing from menus no reader sees — 9.1% of its own
participant weight (08:3xZ).** It read every stored lineup, but the site renders
one only when the entry is CONFIDENT, so **1,265 entries / 10,317,233
participants** were drawable and published to nobody. It drew one, and it looked
like the worst defect on the record: The Home Depot (**468,817 participants**,
**$15.7B** of plan assets) appearing to publish a four-row **$3,544,514** menu
of which three rows are Form 5500 **form artifacts** — the plan administrator's
name at 92%, a form-field fragment, a participant-count caption. **No reader
sees it.** The entry is `confident: false` and the page serves the master
trust's 33-fund **$14.0B** menu, which is correct and good.

*A stored field is not a published one* — a rule already on the record, earned
twice on product measurements, landing for the first time on the apparatus. It
had been true of every draw this session.

**Fixed by promoting the instrument rather than patching the scratch copy.**
`scripts/draw-published.mjs` is now tracked, gates on the published-lineup bit,
asserts that gate in **both** directions against Home Depot's two acks so
neither assertion can pass vacuously, and takes a `--seed` so a draw can be
re-read instead of re-rolled. The precedent was already paid for: a stale
scratchpad copy of the fee harness once shadowed the tracked one and 81
measurement scripts imported the wrong file.

**And on its second use it had a second defect, in the fix for the first.** It
reported Meijer at **ratio 3.345** — a menu of $2.21B against $660M of plan
assets, which reads as a textbook overshoot. It is not: the entry serves **two**
member plans and I divided a trust's menu by one of them. Summed over both, the
ratio is **0.967** and the plan is fine. ***This is the most repeated error on
this whole record — a count keyed on plans being blind to a trust, now the ninth
time — reappearing inside the fix for a different defect in the same file, one
hour after I wrote that very rule into the file's own header.*** Fixed, with a
control: a single-plan entry reads identically under both versions.

**The third finding is the one with real reach**, and it was found by working a
different queue item honestly: the `money()` floor above, 8 million readers.

## Closed by evidence, nothing shipped — the night's real output

- **The label-prefix strip (08:1xZ) — ~10x harmful.** Of 31,041 rows /
  29,191,199 ppl surviving both witnesses, stripping a type label off the front
  of a fund name **loses 6,809 tickers and 7,073 fees** against 686 and 567
  gained. `T.`, `Retirement` and `500` all count as "complete type labels" to a
  shipped predicate, so the split cut **`T. Rowe Price Small Cap Value Fund I`**
  for Paychex (661,036 ppl) and Costco (279,798, thirteen rows), and took
  Express Services' five target-date rows off their own tickers. Two controls
  fired in opposite directions: the motivating row was blocked while a real
  American Funds fund shipped as **`America`**. ***A predicate written to judge
  a whole string is not a predicate about its prefixes.***
- **Widening the wind-down sentence (09:2xZ).** The queue asked to trigger it on
  a *collapse* rather than only on $0. Measured: 44 plans publish a menu, and
  **42 of them have a menu consistent with their own tiny year-end assets** —
  Gerald Champion collapsed $57.3M → **$259,943** and its three rows sum to
  exactly that. The shipped sentence asserts "**$0** in year-end assets", so
  widening it would trade 42 accurate answers for a wrong number. And the
  missing-context half is already shipped: the page prints "Prior Year Assets"
  for every filed plan. *A guard and the claim it licenses are one change, not
  two.*
- **The mid-name-house class.** Two store-internal witnesses were built and both
  work as detectors. Both repairs are **net harmful**: stripping the lead loses
  73 fees / 125,307 ppl and 37 tickers; stripping the tail lost 23 fees and
  swapped 42. The condition holds **three** orientations and neither witness
  distinguishes them. *A witness that a row is damaged is not a witness to which
  side the damage is on.*
- **The same-menu orientation witness**, proposed as the cheap way round that.
  Sized: one direction reads 15 of 18, the other **0 of 18 with every failure
  inverted** — because where the stray text is an identity column it repeats
  down the menu, so the witness fires hardest exactly where it is most wrong.
- **The CVS two-fund class** (a row naming two complete funds with one's symbol
  asserted). Three screens, each refuted on its own output; the strongest
  available evidence **cannot see the motivating row at all**. Closed at two
  named instances and no number. Working it is what found the self-repeat ship.
- **Last night's draw finding dissolved**, and the cause was my own instrument:
  Amedisys's `Income Fund` → `=DODIX` looked like an identification made from a
  name that cannot support one, and **the filing names the house in the issuer
  column** (`Income Fund` / `Dodge & Cox`). The draw script printed the name and
  not the issuer. *An omitted answer field makes a hedged page look confident;
  an omitted input field makes a correct page look wrong.* A 45,976-row /
  40.4M-ppl screen was refused by its own positive fixture before its number was
  read.

## Held, and why

- **Nothing is held.** All eleven ships are live on main with their CI
  conclusions READ, not assumed: site-test #161/#162/#164 green, Pages green
  through #881 on main's current HEAD. *A red gate is worse than no gate*, and a
  local green is not a CI green — ten consecutive red site-test runs went
  unnoticed in September because commit messages said "green" and meant locally.
- **The only thing waiting is a pipeline run:** #573 is in flight on main. A
  scheduled run always leaves main a data commit the branch lacks, so the branch
  adopts it and the next cycle mirrors. Pushing to dev during a main run is
  safe; mirroring is not.
- **No dispatch this cycle, and that is correct:** every change is display-side,
  `PARSER_VERSION` stays 200, so an incremental work list would be the same 48
  permanently-withdrawn filings. v200 was dispatched, verdicted and mirrored as
  a matched pair, so the hold that ran for eleven consecutive identical coverage
  lines is over. Before it: those eleven lines were correct rather than a stall, since
  the work list was the 48 permanently-withdrawn filings.
  (I first wrote "eight" here and `CLAUDE.md` says "seventh". Both were
  unmeasured. A strict all-keys comparison answers **6**, because `pv` was added
  to the coverage line at #565 and every line before that differs from every
  line after it by one key whether or not a number moved — *so the field added
  to make this trail answerable truncates the naive comparison across its own
  introduction.* On the keys each pair shares the run is 11. Three answers to
  one question, which is the standing rule landing on our own record.)
- **Two floors on the self-repeat arm**, holding back 33 rows / ~50,000 ppl that
  would probably improve if collapsed. Lowering either is a measurement, not a
  free widening, and one member produced an output I could not read as clearly
  better.
- **The trustee arm's residue** — rows whose remainder leads with no house the
  shipped list knows (`Fidelity Management Trust Company Fimm Treasury Only
  Portfolio Cl I`). Coverage, not a false claim. Growing the list is additive but
  each addition must re-run the whole-store diff, and the remainder condition is
  the only thing standing between that arm and the 23 fees that reverted its
  predecessor.

## Waiting on you

Unchanged from yesterday, each moving millions of published cells:

1. **Our own store contradicts our own page — 5,692 rows / 3,860 plans /
   8,197,880 ppl / $50.7B, and 0 of 42 rows read favour the page.** The parser
   stores a share-class-correct symbol; the display chain prefers its own
   resolver. Bank of America's `WELLINGTON FUND INVESTOR SHARES` (246,394 ppl) is
   stored `VWELX` and published `VWENX`. **The blocker is the fee**, which is
   priced off the name and never off a symbol, so correcting the symbol alone
   leaves the two cells disagreeing.
2. A filing stating a share class the registry registers under that exact name
   where we publish a different class's symbol **and its fee** — 11,144,696 ppl.
   Errs both ways; recommendation is to correct the symbol and *withdraw* the fee.
3. The fee pre-emption (13,274,448 ppl), the stable-value fabricated ER
   (7,389,704), the American Funds no-class fee (10.5M), and one ticker carrying
   two different fees (354,753 rows / $1.91T).
4. The recordkeeper that is wrong rather than blank — ~2,200 published provider
   names, needs a prep run.

## Store, and what continues

Universe **112,652 plans** (68,538 full-form). `confident` **60,182** · entries
**65,495** · match **43,312** · vesting **53,115** · **HIGH 4** (the known
baseline: 3 `contrib` outliers plus `fabricated-name`) · warn **556** · `dl` 48 ·
**pv 200 at 99.9%**. #572's verdict moved exactly one field — `warn` 558 → 556,
the two transient warns from #571's fifteen new lineups clearing — and the run
of identical coverage lines is now **0**, re-derived rather than incremented, as
the standing rule demands. The `dl` population has been HEAD-probed whole four
times and answered 403 every time, so that code remains an honest published
claim.

Hourly cycles continue around the clock. The label-prefix strip that stood next
in this queue is now **closed** rather than next — see the closures above. What
remains, in order: **297 rows / 252,235 ppl** of the generic-name split that
start with no label (predates today, must be re-measured rather than read); the
parser-side vesting-sentence selection, which needs a `PARSER_VERSION` bump and
has a ready-made oracle in the shipped guard plus a named instance (Flex, 16,483
ppl, publishing as its whole vesting answer a rule for participants who left
before January 1, 2001); and the `fb-vanished` check, which is keyed on the ack
and must be keyed on the plan, so the check written for exactly that failure
cannot currently see its own 104 plans.

**One open judgment that is yours rather than mine**, surfaced by this morning's
work and deliberately not acted on: `derive()` distrusts the *balance* count and
never the *participant* count, so when both are filer-entered and absurd it
divides by the larger. Avalon Capital Management's average balance is
$6,087,098 ÷ **1,955,672 claimed participants** when **3 people** hold it. The
cell now reads "$3" instead of the old "$0K" — honest about the arithmetic — but
whether an average should be computed from a claim no other field supports is a
design call. The page does already print "Participants 1,955,672 / 3 active", so
the claim is labelled. The class is **28 plans / 2.94% of weighted universe**,
and 20 of the 28 have an `activeParticipants` figure that corroborates the
claim, so it is smaller and better supported than the first screen suggested.

**The draws read clean all morning.** State Farm — the plan this project's own
notes hold up as the cautionary tale of a filing once marked a gap while its
Vanguard menu sat on page 3 — now publishes 20 funds at **menu/assets 0.99**
with correct asterisked comparables. Meijer reads 0.967 once the denominator is
right, and Premier Healthcare 0.993. Earlier, two shipped designs were confirmed working
rather than merely unbroken: Roper Technologies (14,999 ppl, menu/assets 0.99)
correctly *asterisks* its Vanguard Target Retirement collective trusts as
comparables and withholds their fees, and EzCorp's Empower `Day One` pooled
separate accounts correctly publish no price. EzCorp's `Empower Guaranteed
Income Fund` does publish the fabricated **0.35** on $857,280 — but that is a
named live instance of the **owner-gated** stable-value item (4,669 rows /
7.39M ppl, 4,571 at exactly 0.35), not a new defect: the shipped gate requires
the filing's own word `contract`, and its own comment says so. Worth one note —
this row's type cell is **blank** where the previously-named instance was typed
`Mutual fund`, so `gicRow` escapes for a second reason as well as a first.
