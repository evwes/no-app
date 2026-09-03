#!/usr/bin/env node
/* wampo parser gate — REQUIRED green before any pipeline run parses the
 * universe. Ten live specimens cover the failure classes that produced
 * real regressions (see docs/accuracy-log.md 2026-08-04): a fund menu
 * with a wrapped subtotal, a form-only filing that must fall through to
 * OCR, a tiny class-aggregate statement, a trustee class summary, a
 * footnote-lettered schedule, and four byte-match lineups.
 *
 * When a parser change INTENTIONALLY moves a specimen, update its
 * expectation in the same commit — that is the review moment the gate
 * exists to force. Run locally: node scripts/parser-gate.mjs */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse4i, extractPlanFeatures } from "./lib-4i.mjs";

/* FEATURE specimens (added 2026-08-25). Until now the gate protected only
 * lineup parsing: a vesting or match regression could not be seen until the
 * audit ran at the END of a 75-minute re-parse. These seven filings were read
 * by hand against their notes while building v81's vesting work, and they
 * pin the two things that are easy to get backwards — the phrasings that DO
 * state a schedule, and the ones that must state NOTHING because the sentence
 * covers only part of the money.
 * `vesting: null` means "must not claim a schedule" and is as load-bearing as
 * any positive expectation: three of these filings say "immediately vested"
 * in a sentence that does not cover the employer money, and reading them as
 * Immediate tells the user the opposite of the truth. */
const FEATURE_SPECIMENS = [
  ["Novus (universal 'all contributions')", "20260722074735NAL0014440048001",
    { vesting: "Immediate" }],
  ["Safe-harbor possessive ('the Company's safe harbor contributions')",
    "20251015123436NAL0002414595001", { vesting: "Immediate" }],
  ["Bank of Utica (colon-introduced graded TABLE)", "20240826174823NAL0009941537001",
    { vesting: "Graded schedule" }],
  ["'increasing by 25% per additional year'", "20251103113117NAL0009671920001",
    { vesting: "Graded schedule" }],
  // the three that must stay silent
  ["Remainder graded ('vesting in the remainder … years of credited service')",
    "20251015102315NAL0005785280001", { vesting: null }],
  ["Union cohort vests over three years", "20251006094618NAL0008580162001",
    { vesting: null }],
  ["Carve-out ('except for … Company Non-Matching contributions')",
    "20260714155753NAL0002191952001", { vesting: null }],
  /* OPEN QUESTION, pinned so it cannot drift unnoticed. This filing states
   * TWO real schedules: "100% fully vested after five years of credited
   * service in the Company's discretionary nonelective and prior matching
   * contributions (20% per completed year)" AND "100% vested after 2 years
   * of credited service in safe harbor matching contributions". v80 read the
   * cliff; v81's "per completed year" fix makes the graded sentence match
   * first and it wins on document order. Both labels are true of different
   * money, and the verbatim quote ships with either, so no guard was added —
   * adding an untested one is the mistake this cycle already made once. If a
   * later change decides the ACTIVE match should win, this expectation moves
   * to "2-year cliff" and that is the review moment. */
  // v88 moved this from "Graded schedule" to "5-year graded schedule": the
  // filing states the horizon ("100% fully vested after five years") as well as
  // the shape ("20% per completed year"), and the label now carries both. Which
  // of the two schedules wins is still the open question above — unchanged.
  ["Two schedules, graded wins on document order", "20250716082243NAL0004508352001",
    { vesting: "5-year graded schedule" }],
  /* v82 quote hygiene: no schedule AND no quote. This filing's only sentence
   * mentioning employer money and "vested" is its loan note — "The Plan has a
   * loan feature under which active participants may borrow up to 50% of the
   * current value of…" — which shipped as the plan's vesting disclosure.
   * `quote: null` is what makes this specimen protective: a change that
   * restores the quote passes the vesting check and fails here. */
  ["Loan note shown as the vesting quote", "20251205083856NAL0003062993001",
    { vesting: null, quote: null }],
  /* v91 cross-cohort tier splice. The first filing states a non-union match
   * ("100% of the first 6% of compensation contributed to the Plan.") and then
   * a SEPARATE union formula ("Union employees are eligible for a match equal
   * to 100% of the first 3% …, plus 50% of the next 2% …, plus 20% of the next
   * 1%"). Chaining the union tiers onto the non-union head shipped a formula
   * no participant receives. The second filing is the shape that must keep
   * chaining — one formula, two sentences, same population ("The Company will
   * also contribute 50% of the next 2%"). Both directions are asserted because
   * a guard wide enough to fix the first will silently eat the second. */
  ["Union tiers must not chain onto the non-union head", "20251014104315NAL0001234147001",
    { match: "100% of the first 6% of pay" }],
  /* v95: four ways of stating a vesting period that the reader did not know,
   * every one of them found on a plan with tens of thousands of participants
   * showing no vesting answer at all. Each specimen pins one phrasing. */
  ["Ford: bare verb, hire-date anchor ('vest three years after the original date of hire')",
    "20251009165049NAL0016131874001", { vesting: "3-year cliff" }],
  ["American: 'employed for two years before becoming 100% vested'",
    "20251013090518NAL0001566176001", { vesting: "2-year cliff" }],
  ["J&J: hyphenated 'completed a three-year period of service'",
    "20251015120755NAL0006024272001", { vesting: "3-year cliff (varies by hire date per the filing)" }],
  ["Fidelity: filed table under a TWO-LINE column header",
    "20251010153157NAL0004375043001", { vesting: "Graded schedule" }],
  /* v96: a table the filing had already replaced. This plan shipped as
   * "Graded schedule" and vests IMMEDIATELY — its 20/40/60/80/100 table is
   * introduced as the schedule "through the year ended December 31, 2023",
   * and the note then states that "Effective January 1, 2024, matching
   * contributions and non-elective Employer contributions are 100 percent
   * vested at all times." Every table reader read the table; none read the
   * sentence retiring it. The five specimens below it are genuine graded
   * schedules that must NOT flip — one of them carries an unrelated
   * "Effective January 1, 2023" clause about catch-up contributions, which is
   * exactly the decoy a looser rule would trip on. */
  ["v96: schedule superseded by a dated full-vesting clause",
    "20251006163156NAL0004018177001", { vesting: "Immediate" }],
  ["v96 control: genuine 6-year graded with an immediate safe-harbor carve-out",
    "20251009074251NAL0006626929001", { vesting: "Graded schedule" }],
  ["v96 control: genuine graded, unrelated 'Effective January 1, 2023' catch-up clause",
    "20251003165214NAL0003875602001", { vesting: "Graded schedule" }],
  ["v96 control: XPO 'vest after two years of service'",
    "20251009141940NAL0015760994001", { vesting: "2-year cliff" }],
  /* v97: the replacement must cover the money that carries the schedule.
   * Caught by the label diff on run #188, BEFORE it was mirrored. This plan's
   * 2026 amendment freed only the NONELECTIVE discretionary money while the
   * discretionary MATCH kept its three-year cliff, and v96 called the whole
   * plan "Immediate" — telling a participant their match was theirs today
   * when it was not. It must stay a cliff. */
  ["v97: partial replacement — only one money type was freed",
    "20260707164235NAL0032859234001", { vesting: "3-year cliff" }],
  /* …and the genuine case v97 must NOT break: the three-year rule here is
   * confined to "plan years prior to January 1, 2010" while every ongoing
   * money type vests immediately, so Immediate is the plan's actual rule. */
  ["v97: schedule confined to a retired pre-2010 cohort",
    "20250923152523NAL0006535681001", { vesting: "Immediate" }],
  ["Same-population continuation still chains", "20251219112023NAL0003370419001",
    { match: "100% of the first 3% of pay + 50% of the next 2%" }],
  /* v83: three false-"Immediate" shapes the v81 widening let through, found
   * by self-checking all 3,907 new Immediate labels against their own quotes.
   * Each states a service condition in the SAME sentence as the immediate
   * claim, which is why the sentence-to-sentence guards could not see them. */
  /* "100" has three digits and could not match the [1-9]\d? in the guard that
   * was supposed to catch exactly this: "GEP participants become 100% vested
   * in all Company contributions after five years of credited service" read
   * as Immediate. Blocking it does not leave a blank — the horizon fallback
   * behind the immediate pass then reads the five years correctly. The gate
   * caught this: the expectation was written as null and the run said
   * otherwise, which is a better answer than the one assumed. */
  ["100-percent-after-N-years evades the two-digit guard", "20251014091821NAL0005204978001",
    { vesting: "5-year schedule (shape not stated)" }],
  // the condition OPENS the sentence instead of following the percentage
  /* v92 MOVED this expectation from null to "3-year cliff", deliberately.
   * It was pinned at null in v83 because the sentence was producing a false
   * "Immediate"; null was the correct answer available then — block the wrong
   * label, keep the quote. Reading the filing: "Participants are vested
   * immediately in their contributions … The portion attributable to the
   * Company's profit sharing and matching contributions is NOT VESTED UNTIL the
   * participant reaches three years of service. Upon three years of service,
   * the participant is 100% vested." That is a real 3-year cliff on employer
   * money, so the label is now better than the silence. The specimen keeps its
   * value: it still fails if the label ever returns to "Immediate". */
  ["'Upon three years of service, … 100% vested'", "20251013092109NAL0001025329001",
    { vesting: "3-year cliff" }],
  // a carve-out worded "but do not vest … until", not "except"
  ["'but do not vest in discretionary contributions until after three years'",
    "20260405212116NAL0005689857001", { vesting: null }],
  /* v86: the cliff window between "100% vested" and "after N years" widened
   * 80->130 chars, because the money-type list auditors write is long. These
   * three pin the widening and the two guards it needed. */
  ["Long money-type list bridged by the 130-char window",
    "20250721115147NAL0001839184001", { vesting: "3-year cliff (Company matching contributions)" }],
  // "ratably" means a share each year — calling it an N-year cliff says the
  // participant gets nothing until year N, the opposite of true
  ["'vest ratably … fully vested after three years' is graded, not a cliff",
    "20251009151421NAL0015898770001", { vesting: "Graded schedule" }],
  // a rule the filing has already replaced is not this plan's rule
  ["'Prior to July 1, 2019, participants were fully vested … after three years'",
    "20250522164643NAL0002778387001", { vesting: null }],
];

const SPECIMENS = [
  // [label, ack, assetsEOY, expect]
  ["GE Vernova (footnote letters)", "20251014171116NAL0004605680001", 8206402143,
    { found: true, n: 17, sum: 8083350345 }],
  /* v100: the WRAPPED-IDENTITY class, and the only specimen here that guards
   * against publishing a fund that does not exist. Amgen wraps its collective
   * trust names across two lines, leaving "Lending*" on the value line. The
   * product/house predicates read that fragment instead of the joined name,
   * judged it not-a-product, and let the generic description win — so six rows
   * were all named "Collective Trust Fund" and merged on that shared name into
   * a single $3,587,717,422 holding, 47% of the plan's shown assets. Sister
   * rows survived only because their fragment happened to contain "Fund" or
   * "Trust", which is how half the menu stayed correct and hid the rest.
   * Expectation is deliberately the row COUNT and SUM: if the merge returns,
   * n drops and the fake row reappears at the top of the lineup. */
  ["Amgen (wrapped identity, generic description)", "20251009163950NAL0007320609001", 7720000000,
    { found: true, n: 33, sum: 7685297822 }],
  /* v104: the TARGET-DATE VINTAGE class. "American Funds | American Funds 2010
   * R6" — house in the identity, real fund in the description. v69's
   * duplicate-identity guard removed the identity from the description and
   * asked whether letters survived; "2010 r6" has one, so the description was
   * blanked and all twelve vintages fell back to "American Funds" and merged
   * into a single holding worth 43% of the plan. A vintage year is
   * information. Measured: 272 published lineups carry a house-only row worth
   * ≥25% of the shown sum; this recovers about 29% of them, none made worse.
   * The decoy that must NOT move is the v69 case itself — a description that
   * only repeats the identity plus a maturity date still yields the identity. */
  ["W. L. Gore (house identity, vintage description)", "20250730154304NAL0002504883001", 2009619555,
    { found: true, n: 31, sum: 1988919337 }],
  /* v103: the GROUP-HEADER + COST-COLUMN class. "* Vanguard | Registered
   * Investment Company" is a valueless group header, not the first line of a
   * wrapped name, and "Participant Directed" is the Cost column's standing
   * answer, not a description. Together they renamed all fifteen of this
   * plan's funds and merged them into one $16.2M row, 75% of the plan. */
  ["Physician's Computer (group header + cost column)", "20251010104425NAL0012869808001", 21684776,
    { found: true, n: 32, sum: 21672058 }],
  /* v105: a NEGATIVE specimen — this parse must never be publishable. Comcast's
   * public filing contains no Schedule H 4i table at all; its money sits in a
   * master trust. We published a confident five-row lineup whose top row was
   * "At fair value" at 91% of the shown sum, a dot-leader line lifted off the
   * Statement of Net Assets, on a $19.69B plan. stmt:true is the assertion
   * that matters here — the row count is beside the point, because the whole
   * parse is the defect. */
  ["Comcast (no 4i table; statement line published as a lineup)", "20251007174512NAL0008660608001", 19692061354,
    { found: true, stmt: true }],
  /* v68: the filler-column class. Before the fix, all 28 of this plan's
   * holdings were stored as "VARIABLE 1,056,601 sh" — the (c) sub-columns
   * ("N/A  VARIABLE  N/A  ... sh  #") beat the real name in column (b).
   * After: FIDELITY 500 INDEX, PIMCO REALPATH BLEND vintages, VANGUARD
   * GROWTH INDEX INSTITUTIONAL. Guards the whole SMART Local 265 class. */
  // assets corrected 2026-08-25: the specimen had been running against a rounded
  // 1.4e9 while the filing reports 2,125,326,350, which made its stored sum look
  // like ratio 1.49 instead of 0.98 and drew a spurious prefix-split repair
  ["Old Republic (N/A filler columns)", "20250911133230NAL0000243699001", 2125326350,
    { found: true, n: 30, sum: 2079074463 }],
  // v59 +1: "CREF Money Market Account | Registered Investment Companies |
  // 1,193" is a filed holding the sub-$10k residue floor used to hide
  ["UPenn Health (wrapped subtotal)", "20251015190140NAL0007224432001", 1110204528,
    { found: true, n: 31, sum: 1108625287 }],
  ["Verizon trust (class summary)", "20250922070418NAL0002030595001", 41099764177,
    { found: true, n: 12, sum: 38926187308 }],
  // v51's cluster suffix candidates unlocked this filing's REAL 27-fund
  // menu (Contrafund, TRP target dates, ratio 0.995) — the 4-row class
  // aggregate this specimen originally locked in was second-best all along
  ["CCT (real menu via suffix candidates)", "20250912103135NAL0003410034001", 139583948,
    { found: true, n: 27, sum: 138922286 }],
  ["form-only (must leave OCR open)", "20251010094924NAL0012761840001", 74759678,
    { found: false }],
  ["Cochrane (OCR-sourced menu)", "20250924093907NAL0002944403001", 19416362,
    { found: false }],
  ["TK Elevator", "20251008093049NAL0005343377001", 667683248,
    { found: true, n: 34, sum: 658091857 }],
  // v42: spaced dot-leaders (". . . .") between issuer and description
  // columns — counted as "words", they tripped the prose filter and emptied
  // the whole menu (1 junk row from a $41.5B plan)
  ["Costco (spaced leaders)", "20260723165543NAL0014354289001", 41523678630,
    { found: true, n: 30, sum: 38997301000 }],
  // v56: the REAL "$ in thousands" schedule ($39.3B master-trust
  // participation + $4.6B BrokerageLink) replaced a fair-value-note
  // fragment — trust-pointer flagged, so it can never display as a lineup
  ["Northrop Grumman", "20260616115726NAL0000593907005", 44357243320,
    { found: true, n: 3, sum: 43943483000 }],
  ["Kohler (trust interest)", "20251014134011NAL0002916849001", 781346186,
    { found: true, n: 1, sum: 845895707 }],
  // v43: a trust-POINTER page ("Interest in Eaton Savings Trust Master
  // Trust" + stable value) hit 3 rows at ratio 0.99 — incl. a $44k "fund"
  // that was really the sponsor's zip code — and displayed as a confident
  // lineup while the trust's real menu failed on cents-formatted values
  ["Eaton plan (trust pointer)", "20251014081726NAL0003409184002", 8394581291,
    { found: true, n: 2, sum: 8313440378 }],
  ["Eaton trust (cents values)", "20251014082229NAL0001120627001", 8537015596,
    { found: true, n: 51, sum: 8530688968 }],
  // v44: double-rendered schedule whose second rendition glues a "0" cost
  // column onto names — same-name dedup missed it and the region summed
  // both copies (ratio 2.02, lost the lineup)
  ["Plexsys (glued-0 dedup)", "20260706150053NAL0023514192001", 36432027,
    { found: true, n: 32, sum: 37829365 }],
  // v44: page carry-forward subtotals ("Forward $21,786,094 ...") summed
  // across pages into a fake $197M top "fund" on a statement-page win.
  // v46: brokerage vocabulary demoted its statement region. v51's suffix
  // candidates reach the honest result: managed-account rollup (74
  // positions) + real rows (Vanguard 500, Pershing cash)
  ["Carry-forward subtotals", "20251008154534NAL0005779537001", 295570079,
    { found: true, n: 7, sum: 192739241 }],
  // v45: recordkeeper "SUMMARY OF NET TRUST ASSETS" page appended after
  // the real 4i table — same menu in ALL CAPS with cents; v43's cents fix
  // made it readable and the doubled region lost a real 29-fund menu
  ["Sierra Space (rk summary after 4i)", "20251015115746NAL0005999248001", 293042847,
    { found: true, n: 29, sum: 291893410 }],
  // v46: Galliano — raw text has no readable schedule (all-scanned); its
  // OCR'd statement page ("Mutual funds" $584M > plan assets) got
  // confident when v44 removed the OTHER junk rows. Text parse must stay
  // found=false; the OCR-path fix is the STMT_ROW brokerage vocabulary.
  ["Galliano (scanned, OCR statement)", "20251013201846NAL0000931539001", 380897686,
    { found: false }],
  // v52: Empower group-annuity CODE page ("1NTSPI4", "1GGCG50") files
  // under its own SCHEDULE OF ASSETS heading and tied the real schedule
  // at ratio ~0.97 once v43 made its cents columns readable — 28 fund
  // codes displayed as names (Power Design, owner report). The code-page
  // penalty must keep the NAMED rendition winning.
  // v73 +1 row: "Northern Trust Asset Management | NT ACWI ex US IMI Fd DC NL
  // Tier 4  1,985,195" is 15 words with no $, so the whole-line prose guard
  // was eating it. Verified in the filing at line 2155; ratio 0.93 -> 0.95.
  ["Power Design (Empower code page)", "20251015163402NAL0010660226001", 79416197,
    { found: true, n: 28, sum: 75516844 }],
  // v53: section subtotals spelled as class descriptions ("Interest in
  // common/collective trusts $4.47B", "Assets Held for Investment")
  // double-counted the whole schedule to ratio 3.0 — a clean $5.95B
  // trust menu lost (Sempra, owner report)
  ["Sempra trust (class-worded subtotals)", "20260710080100NAL0000893043001", 5960266194,
    { found: true, n: 31, sum: 5951844380 }],
  // v59 +1: "Schwab U.S. Treasury Money Fund 2,784" — the notes confirm the
  // holding ("the Plan held Schwab U.S. Treasury Money Fund of $2,784")
  ["Black Hills", "20260623190115NAL0012535394001", 933735584,
    { found: true, n: 22, sum: 911788553 }],
  /* v73 specimens — four filings whose real menus lost to a class-label or
   * house-total page. Each pins a different half of the fix; all four were
   * found by reading the v69->v71 confidence losses one by one. */
  // wide laid-out rows read as prose: twelve "GREAT GRAY CAP GROUP 20XX
  // TARGET DATE TR CL CT" rows are 16 words with no $ (Ramos Oil)
  ["Ramos Oil (wide rows read as prose)", "20260105123510NAL0007177842001", 17544597,
    { found: true, n: 27, sum: 17537726 }],
  // "Vanguard | Total Intl Bd Idx Admiral" died on the spaced-letter subtotal
  // guard's "Bd"; losing that $5,394 row broke arithmetic subtotal detection
  // downstream and doubled the region (Reliance One)
  ["Reliance One (Total-prefixed fund name)", "20250926115624NAL0003997507001", 4979584,
    { found: true, n: 26, sum: 4873717 }],
  // a recordkeeper page of bare house totals ("Fidelity $8,971,947") beat the
  // filed 21-fund schedule on closeness (Producers Rice Mill)
  ["Producers Rice (house-total page)", "20251009155148NAL0006843793001", 23935999,
    { found: true, n: 10, sum: 21945392 }],
  // broken font encoding injects spaces inside words, so a per-cell word cap
  // still ate seven holdings worth $18.4M (Ebara)
  ["Ebara (spaced-letter wide rows)", "20251010185246NAL0004866995001", 53096393,
    { found: true, n: 23, sum: 52038566 }],
  /* v74 specimens, both from one filing-test batch the tester scored clean —
   * its verdicts check that stored names appear in the filing, not that they
   * are funds. Row-quality review is what found these. */
  // displayed four "holdings": two class labels and two EXPENSE lines
  // ("Advisory fees", "Professional fees"). Also the suffix-subtotal case: a
  // cash section with no subtotal of its own broke the running group, so two
  // class subtotals survived and doubled the region to ratio 1.96.
  ["St. Louis Auto Dealers (expense rows + suffix subtotal)", "20251014103524NAL0001241955001", 11319490,
    { found: true, n: 20, sum: 11080906 }],
  // "Dividend and interest income" as a holding, and "PLAN ID #002; EIN:
  // 16-1187872" read as a $1,187,872 holding
  ["Hydro-Air (EIN digits as a value)", "20251008065619NAL0005202321001", 10456947,
    { found: true, n: 15, sum: 10448933 }],
  // v74: money-market units are $1.00, so the share count equals the value and
  // lands in front of the name ("12,553,193 Money Market Fund"). Stripping it
  // makes two DIFFERENT money funds collide, so this pins both: the names are
  // clean AND Vanguard Treasury / Janus Henderson stay separate rows.
  ["Janus (share count glued to the name)", "20250917145716NAL0000658547001", 544769954,
    { found: true, n: 57, sum: 541264001 }],
  // v74: the sponsor's address block wraps across form-page lines, so the
  // ABCDEFGHI placeholder and the value land on DIFFERENT lines and the
  // line-level guard never saw it. "3326ABCDEFGHI c/o 160th Avenue SE …" was
  // this plan's 5th largest holding at $623,000 — a NAICS business code.
  ["Regency Pacific (address block as a holding)", "20251014143740NAL0004250880001", 6877199,
    { found: true, n: 28, sum: 6786907 }],
  /* v77 — the PREFIX SPLIT. Both filings print the schedule twice with no 4i
   * heading between the copies, so no candidate region covers just one and
   * every candidate double-counted. The second copy re-states the first with
   * the plan's own name prefixed and values rounded to thousands, which is why
   * neither the name view nor the value-pair view could reach them. */
  // 18 real rows summing to $7,540,902 against $7.78M, then the same funds as
  // "4 Bears Casino & Lodge 401(k) Plan AVUVX Avantis…" at $753,000, $546,000
  ["4 Bears (second rendering, plan-name prefix)", "20251013153937NAL0003409698001", 7781659,
    { found: true, n: 17, sum: 7540902 }],
  // same shape; also the filing whose Schedule H line 2d text was its largest
  // "holding" until v75
  ["Westlie Motor (rounded second rendering)", "20250821150052NAL0002159299001", 11337379,
    { found: true, n: 18, sum: 11308642 }],
];

const work = mkdtempSync(path.join(tmpdir(), "gate-"));
let failed = 0;

for (const [label, ack, assets, expect] of SPECIMENS) {
  const url = `https://efast2-filings-public.s3.amazonaws.com/prd/${ack.slice(0, 4)}/${ack.slice(4, 6)}/${ack.slice(6, 8)}/${ack}.pdf`;
  const pdf = path.join(work, ack + ".pdf");
  let text = null;
  for (let attempt = 0; attempt < 3 && text === null; attempt++) {
    try {
      execFileSync("curl", ["-sf", "--retry", "2", "-o", pdf, url]);
      text = execFileSync("pdftotext", ["-layout", "-q", pdf, "-"],
        { encoding: "utf8", maxBuffer: 200 * 1024 * 1024 });
    } catch { await new Promise((r) => setTimeout(r, 3000 * (attempt + 1))); }
  }
  if (text === null) {
    // an unreachable specimen must not block the pipeline — S3 removals
    // happen (withdrawn filings); report loudly and move on
    console.log(`GATE SKIP  ${label}: specimen unreachable after retries`);
    continue;
  }
  const p = parse4i(text, assets, "", "");
  const n = (p.funds || []).length;
  const sum = (p.funds || []).reduce((s, f) => s + (f.value || 0), 0);
  /* `stmt` lets a specimen assert that a parse must NOT be publishable. Some
   * of the worst defects are not a wrong row count but a plausible-looking
   * lineup that should never have been shown at all — Comcast's filing has no
   * 4i table and we published five rows off its Statement of Net Assets. Row
   * count and sum cannot express that; the flag can. */
  const ok = p.found === expect.found &&
    (expect.n === undefined || n === expect.n) &&
    (expect.sum === undefined || sum === expect.sum) &&
    (expect.stmt === undefined || !!p.stmt === expect.stmt);
  console.log(`GATE ${ok ? "OK  " : "FAIL"} ${label}: found=${p.found} n=${n} sum=${sum}` +
    (expect.stmt === undefined ? "" : ` stmt=${!!p.stmt}`) +
    (ok ? "" : ` (expected found=${expect.found} n=${expect.n ?? "-"} sum=${expect.sum ?? "-"}${expect.stmt === undefined ? "" : ` stmt=${expect.stmt}`})`));
  if (!ok) failed++;
}

for (const [label, ack, expect] of FEATURE_SPECIMENS) {
  const url = `https://efast2-filings-public.s3.amazonaws.com/prd/${ack.slice(0, 4)}/${ack.slice(4, 6)}/${ack.slice(6, 8)}/${ack}.pdf`;
  const pdf = path.join(work, ack + ".pdf");
  let text = null;
  for (let attempt = 0; attempt < 3 && text === null; attempt++) {
    try {
      execFileSync("curl", ["-sf", "--retry", "2", "-o", pdf, url]);
      text = execFileSync("pdftotext", ["-layout", "-q", pdf, "-"],
        { encoding: "utf8", maxBuffer: 200 * 1024 * 1024 });
    } catch { await new Promise((r) => setTimeout(r, 3000 * (attempt + 1))); }
  }
  if (text === null) { console.log(`GATE SKIP  ${label}: specimen unreachable after retries`); continue; }
  const ff = extractPlanFeatures(text) || {};
  // a match specimen asserts the match label (and that its quote survives) —
  // the same loop, a different field
  if ("match" in expect) {
    const gotM = ff.match || null;
    const okM = gotM === expect.match && (expect.match === null || !!ff.matchText);
    console.log(`GATE ${okM ? "OK  " : "FAIL"} ${label}: match=${gotM === null ? "(none)" : gotM}` +
      (okM ? "" : ` (expected ${expect.match === null ? "(none)" : expect.match}${ff.matchText ? "" : ", quote missing"})`));
    if (!okM) failed++;
    continue;
  }
  const got = ff.vesting || null;
  const gotQuote = ff.vestingText || null;
  let ok = expect.vesting === null ? got === null : got === expect.vesting;
  // `quote: null` asserts NO quote either — a change that restores a
  // wrong-topic quote passes the vesting check and must still fail here
  if (ok && "quote" in expect) ok = expect.quote === null ? gotQuote === null : !!gotQuote;
  console.log(`GATE ${ok ? "OK  " : "FAIL"} ${label}: vesting=${got === null ? "(none)" : got}` +
    ("quote" in expect ? ` quote=${gotQuote === null ? "(none)" : "present"}` : "") +
    (ok ? "" : ` (expected ${expect.vesting === null ? "(none)" : expect.vesting}${"quote" in expect ? ` / quote ${expect.quote === null ? "(none)" : "present"}` : ""})`));
  if (!ok) failed++;
}

if (failed) {
  console.error(`\nparser gate: ${failed} specimen(s) regressed — refusing to parse the universe.`);
  console.error("If the change is intentional, update the expectation in scripts/parser-gate.mjs in the same commit.");
  process.exit(1);
}
console.log("\nparser gate: all specimens green");
