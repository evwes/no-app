# wampo morning brief — 2026-10-04, 04:5xZ (12:5x AM ET)

Overnight was **eight ships and five classes closed by evidence**, and the
closures are the more useful half: four separate repairs were measured, found net
harmful or unfounded, and *not* shipped. Nothing is in flight, nothing is
pre-registered, **`PARSER_VERSION` is now 200**, and main is at `cf1856be`.

**The two biggest arrived after midnight.** A parser change (v200) stopped
publishing a misread match formula for 33 plans, and a one-token display change
stopped **$51.0 billion** of holdings from reading as named funds when neither
the name nor the issuer names anything — **3M alone is $18.4B at 74.7% of its
published menu.**

**READ EVERY PARTICIPANT FIGURE BELOW WITH A ~3% CAVEAT.** Found last evening and
not yet fixed: **49 plans claim 3,469,170 participants (2.99% of the weighted
universe of 116,001,210) with no other field supporting the count** — 40 of them
short-form, EOY 0, ≤10 balances. Avalon Capital Management publishes **1,955,672**
participants (second-largest in the universe, above Amazon) against $6,087,098,
and its `assetsBOY` is **$1,955,672** — the same number, the only plan of 112,652
whose count equals a dollar figure on its own row. The other 48 are mostly
staffing and PEO firms where the figure is plausibly the *eligible* population as
filed, so it is unusable as a reader-facing number and harmful as a weight, but
not wrong in form. **The fix is a disclosure, not a correction**, and it should be
settled before the queue's other sizes are trusted, because every one of them is
denominated in this field.

## Shipped and live on main

All display-side, all name-or-quote-only, each with the whole-store price taken
through the page's own renderer:

| | reader-facing | what stops being published |
|---|---|---|
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
`bf3d2132` → `cf1856be`. site-test #157/#159/#160/#161/#162 all green; Pages
green through #869 and building since.

**v200's verdict corrected two of my own registrations, which is the more useful
half of it.** The gate's own field hit its registered **floor** exactly
(`matchMisread` 199 → 233, +34 against +33, the one extra arriving by the
full-text path the caveat named). But `match` fell 26 where I registered 33, and
my first explanation was **refuted by measurement**: ***a net delta on a shared
metric cannot verdict one arm of a full re-parse***, because a pv bump re-runs
every other arm too. Registering five fields as "unchanged" was wrong by
construction for the same reason — all 15 gains were read, 0 losses, and **Levi
Strauss (8,288 ppl) gained a 30-row menu** from its own 4i attachment.

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

## Closed by evidence, nothing shipped — the night's real output

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

- **Nothing now.** v200 was dispatched, verdicted and mirrored as a matched
  pair, so the hold that ran for eleven consecutive identical coverage lines is
  over. Before it: those eleven lines were correct rather than a stall, since
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
baseline: 3 `contrib` outliers plus `fabricated-name`) · warn 558 · `dl` 48 ·
**pv 200 at 99.9%**. The `dl` population has now been HEAD-probed whole four
times and answered 403 every time, so that code remains an honest published
claim.

Hourly cycles continue around the clock. Next in the queue, now that the
`rate == cap` question is answered and shipped: the three remedies the
generic-name re-measurement separated — **88 rows / 707,208 ppl whose whole name
is a type designation** (Providence Health publishes `Registered investment
company funds` at **48.0% of its menu, $12.5B**) to qualify, **235 rows /
390,978 ppl where a label PREFIXES a real fund** to strip (which would *gain* a
name), and 297 rows that start with no label; then the parser-side
vesting-sentence selection, which needs a `PARSER_VERSION` bump and has a
ready-made oracle in the shipped guard plus a named instance (Flex, 16,483 ppl,
publishing as its whole vesting answer a rule for participants who left before
January 1, 2001).
