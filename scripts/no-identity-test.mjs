/* `hasNoFundIdentity` — the display-only predicate that qualifies a row whose
 * name carries no fund identity at all.
 *
 * WHY IT EXISTS. `isGenericTypeName` is a closed vocabulary of Schedule H TYPE
 * LABELS, so it reaches `Collective investment trusts` and is blind to
 * `shares`, `Fund`, `UNIT`, `Institutional Class`, `E.I.N. 23-`. Widening that
 * constant is refused — the parser's region selection reads it, and widening it
 * once made 3M's fair-value note confident and moved Lam Research by $453M.
 *
 * WHAT THIS FILE GUARDS, in order of what would hurt most if it broke:
 *   1. a REAL fund name must never be qualified (the whole risk of the change)
 *   2. the two surfaces must agree — app.js passes f.name RAW, the generator
 *      passes the CLEANED name, and the predicate tests both forms for exactly
 *      that reason
 *   3. cleanFiledName must be idempotent, or testing both forms is incoherent
 *   4. a negative control per condition
 */
import { readFileSync } from "node:fs";
import { hasNoFundIdentity, cleanFiledName, isLabelOnlyName, isSentenceRow, isNonIssuerCell, isNamelessFundRow } from "./lib-disclose.mjs";
import { isGenericTypeName } from "./lib-4i.mjs";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

/* ---- 1. MUST NOT FIRE. Every one is a real name from the live store, and
 * the first four are the largest holdings of large plans. ---------------- */
const KEEP = [
  "Fidelity 500 Index Fund",
  "Vanguard Institutional Target Retirement 2050 Trust",
  "VANG FTSE SOC IDX IS",                       // Amazon, 1,343,800 ppl
  "BLACKROCK SP 500 IDX (IS)",                  // Cigna, $3.4B, 24.5% of its menu
  "VANG IS TL STK MK IP",                       // Mayo Clinic, $1.6B
  "Parker Stock Match Fund",
  "PIMCO International Bond Fund (U.S. Dollar-Hedged) Ins",
  "The Collective LSV International (ACWI EX US) Value Eq",
  "Class I Vanguard Target Retirement Income Trust Select",  // a class PREFIX is not a missing head
  "Galliard Stable Return Fund Class E",
  "Dodge & Cox Income Fund Class X",
  "American Funds 2040 Target Date Retirement Fund R6",
  "Common Stock Fund",                          // "stock" identifies a vehicle, not filler
  "Self-Directed Brokerage Account",
];
for (const n of KEEP) ok(hasNoFundIdentity(n) === false, `MUST NOT qualify a real name: ${JSON.stringify(n)}`);

/* ---- 2. MUST FIRE. Each is a live published row; the share of its own menu
 * is what makes it matter, so it is named here. ------------------------- */
const QUALIFY = [
  ["Portfolio", "Behavioral Connections — 96.0% of its menu"],
  ["Fund", "Hui Manufacturing — 80.8%, $11,041,885"],
  ["shares", "Avi Systems — 69.4% of a $303,975,100 menu, 2,048 ppl"],
  ["units", "Flint Equipment — 61.8%"],
  ["UNIT", "Emory Healthcare — 49,944 ppl"],
  ["CLASS D", "Capital One — 91,543 ppl"],
  ["Institutional Class", "CBRE Services — 55,809 ppl"],
  ["Fund R1", "Competitive Socialising — 84.7%"],
  ["Fund R6", "Legacy Equipment — 62.2%"],
  ["Class A Common Collective Trust Fund", "CVS Health — 385,927 ppl"],
  ["E.I.N. 20-", "Eldercare of Minnesota — 87.6%, an employer-ID number as a holding"],
  ["E.LN. 81-", "Bblbc — 56.5%, the same with an OCR'd I/L"],
  ["Retirement", "a bare vintage word"],
  ["Inst'l Shares", "a share class alone"],
];
for (const [n, who] of QUALIFY) ok(hasNoFundIdentity(n) === true, `MUST qualify ${JSON.stringify(n)} (${who})`);

/* ---- 3. THE TWO SURFACES MUST AGREE. app.js passes the RAW name, the
 * generator the CLEANED one; the predicate tests both so the verdict matches.
 * These 16 rows are the whole population where raw and cleaned differ. ---- */
const BOTH_FORMS = [
  "Mutual fund, 102,311.9 shares",
  "Mutual fund, 49,914.635 shares",
  "Institutional Fund Registered Investment Company",
];
for (const raw of BOTH_FORMS) {
  const cl = cleanFiledName(raw);
  ok(hasNoFundIdentity(raw) === hasNoFundIdentity(cl),
    `the two surfaces disagree on ${JSON.stringify(raw)}: raw=${hasNoFundIdentity(raw)} cleaned=${hasNoFundIdentity(cl)} (${JSON.stringify(cl)})`);
  ok(hasNoFundIdentity(raw) === true, `MUST qualify ${JSON.stringify(raw)} — it names no fund in either form`);
}

/* ---- 4. cleanFiledName MUST BE IDEMPOTENT, or testing both forms is
 * incoherent: the generator's input is already cleaned, so a second pass must
 * be a no-op. Asserted over the real store, not over invented strings. ---- */
const shardOf = (s) => { let x = 0; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) >>> 0; return x % 64; };
let checked = 0, notIdempotent = 0, notIdempotentVerdict = 0;
const idEx = [];
for (let n = 0; n < 8; n++) {          /* eight shards is ~200k names, enough */
  let shard = {};
  try { shard = JSON.parse(readFileSync(new URL(`../data/lineups/${String(n).padStart(2, "0")}.json`, import.meta.url), "utf8")); }
  catch { continue; }
  for (const e of Object.values(shard)) {
    if (!e || !Array.isArray(e.funds)) continue;
    for (const f of e.funds) {
      const one = cleanFiledName(String(f.name || ""));
      const two = cleanFiledName(one);
      checked++;
      if (one !== two) { notIdempotent++;
        if (hasNoFundIdentity(one) !== hasNoFundIdentity(two)) notIdempotentVerdict++; if (idEx.length < 4) idEx.push(`${JSON.stringify(String(f.name).slice(0,40))} -> ${JSON.stringify(one.slice(0,40))} -> ${JSON.stringify(two.slice(0,40))}`); }
    }
  }
}
console.log(`cleanFiledName idempotence over ${checked.toLocaleString()} real names: ${notIdempotent} differ`);
for (const x of idEx) console.log("    " + x);
ok(checked > 10000, `the idempotence check read only ${checked} names — it is not testing the store`);
/* IT IS NOT FULLY IDEMPOTENT, AND THE FIRST VERSION OF THIS TEST DEMANDED THAT
 * IT WAS. Six of 253,112 names strip further on a second pass — `Equity Income
 * Separate Account Pooled se` -> `Equity Income Separate Account` -> `Equity
 * Income`, because one arm removes a trailing type label and the next then sees
 * a new trailing type label. That is a real property of the shipped function
 * and it is QUEUED, but it is not what this predicate depends on: the cleaned
 * form is used for a BOOLEAN and never for display, so it cannot erode any
 * published name. So assert what is actually relied on — that a second pass
 * never changes the VERDICT — rather than a stronger property the code does not
 * need. An assertion wider than its dependency fails on things that do not
 * matter and teaches the operator to loosen it. */
ok(notIdempotentVerdict === 0,
  `cleanFiledName's non-idempotence CHANGES hasNoFundIdentity's verdict on ${notIdempotentVerdict} names, which is what would break the two surfaces`);
console.log(`  of those, changing the predicate's verdict: ${notIdempotentVerdict} (this is the one that must be 0)`);

/* ---- 5. NEGATIVE CONTROLS, one per condition, each required to flip ---- */
const SRC = readFileSync(new URL("./lib-disclose.mjs", import.meta.url), "utf8");
const CONTROLS = [
  ["the cleaned-form arm", 'return stripsToNothing(s) || stripsToNothing(cleanFiledName(s));',
   "return stripsToNothing(s);",
   (f) => f("Mutual fund, 102,311.9 shares") === false],
  ["the empty-name guard", 'if (!s) return false;              /* an empty name is a different case */',
   "",
   (f) => f("") === true],
];
console.log("\nNEGATIVE CONTROL, one per condition:");
for (const [label, find, repl, probe] of CONTROLS) {
  if (!SRC.includes(find)) { fails.push(`the control for ${label} could not find its target`); continue; }
  const mutated = SRC.replace(find, repl);
  if (mutated === SRC) { fails.push(`the control for ${label} did not land`); continue; }
  const tmp = new URL("./zz-noid-control-tmp.mjs", import.meta.url);
  const { writeFileSync, unlinkSync } = await import("node:fs");
  writeFileSync(tmp, mutated);
  let flipped = false;
  try {
    const mod = await import(`${tmp.href}?v=${Date.now()}`);
    flipped = probe(mod.hasNoFundIdentity);
  } finally { try { unlinkSync(tmp); } catch {} }
  console.log(`  drop ${label}: ${flipped ? "a verdict FLIPS (control fires)" : "NOTHING changes"}`);
  if (!flipped) fails.push(`the control for ${label} changed NOTHING — it is decorative`);
}

/* ---- 6. the composition must not WEAKEN the existing guard: every name
 * isGenericTypeName already qualifies must still qualify. ---------------- */
const STILL = ["Collective investment trusts", "Mutual funds", "Registered investment company",
  "Pooled separate accounts", "Common/collective trust funds", "Group annuity contracts"];
for (const n of STILL) {
  ok(isGenericTypeName(n) === true, `baseline moved: isGenericTypeName no longer qualifies ${JSON.stringify(n)}`);
  ok((isGenericTypeName(n) || hasNoFundIdentity(n)) === true, `the composition drops ${JSON.stringify(n)}`);
}

/* ---- 7. `isLabelOnlyName` — the THIRD display-only predicate, 2026-10-04.
 *
 * It is kept out of both `hasNoFundIdentity` and `isGenericTypeName` for a
 * measured reason: `merge-4i.mjs:1394` guards its share-count repair with
 * `isGenericTypeName(head) || hasNoFundIdentity(head)`, so widening either
 * would silently refuse more NAME REPAIRS. Guarded here because it ships
 * alongside them and breaks the same way.
 *
 * Each MUST-KEEP below is a case where the NAMED condition is the ONLY
 * protection — a case protected twice cannot fail for either and proves
 * neither. Found by measuring each condition's blocking population separately
 * over all 1,730,670 published rows. ------------------------------------- */
const LBL_QUALIFY = [
  ["Registered investment company funds", "Providence Health — 48.0% of its menu, $12,474,349,571"],
  ["Registed Investment Co.", "Trinet HR III/IV — 280,299 readers, $1,239,771,549"],
  ["Registered investment companies (page 166)", "National Rural Electric — $225,158,578, 80,475 ppl"],
  ["Common Collective Trusts (Pages 165-166)", "the SAME page's LARGEST row — $9,284,475,171 at 48.6% of its menu. Found by reading the regenerated page, not by a count: the first spelling took singular `(page N)` only and left this one reading as a named holding two rows above its qualified sibling"],
  ["companies", "3M — 25 rows / $14,372,175,818; also Blue Cross Blue Shield at 59.9%"],
  ["accounts", "Providence — 26 rows; Action Safety Supply at 100.0% of its menu"],
  ["Separate Account", "Ford Motor"],
  ["shares of", "American Financial Group — 23 rows"],
  ["Pooled Sep Acct", "Kenect — 98.8% of its menu"],
  ["Trust Company", "Nacco Natural Resources 42.5%, Hyster-Yale 29.8%"],
  ["REGISTER INVESTMENT COMPANY", "Systems Automotive — 76.0%"],
  ["Mutual shares", "SETI Institute — 47.3%"],
];
const LBL_KEEP = [
  ["Separate Account A", "the v188 pin, respected BY CONSTRUCTION: a single capital may be a real designation, and Four Seasons publishes it at 91.5% of its menu. The capital is the ONLY protection"],
  ["The Investment Company of America", "a real American Funds fund — the PLACE NAME is the only protection"],
  ["New York registry shares", "Pfizer — `registry` is not `registered`, and `New`/`York` are the only protection"],
  ["Fund 2030", "a welded VINTAGE is identifying information — Capital Manor files a whole 2020-2065 ladder. The DIGITS are the only protection"],
  ["Investments VG 2030", "the same shape with a house abbreviation"],
  ["SEPARATE ACCOUNT II", "a real designation"],
  ["Separate Account - Z", "and another"],
  ["Pooled Separate Acct ia", "OCR debris — the welded-count class's remedy, not this one"],
  ["Investment in", "a trailing joiner — the truncated-name class"],
  ["Mutual funds - U.S", "a region is identifying"],
  ["Corporate Stocks (Pages 56-155)", "the same page and the same pointer — `Stocks` identifies a vehicle, so the LABEL condition is the only protection"],
  ["U.S. Government Securities (Pages 23-27)", "and `Securities` likewise"],
  ["Managed Account Holdings (985 Positions)", "a POSITION count must not read as a page pointer"],
  ["Vanguard Total Stock Market Index Fund", "a real fund"],
  ["Costco Wholesale Corporation", "employer stock"],
  ["Common Stock Fund", "`stock` identifies a vehicle"],
];
for (const [n, who] of LBL_QUALIFY) ok(isLabelOnlyName(n) === true, `isLabelOnlyName MUST qualify ${JSON.stringify(n)} (${who}) — the arm is inert`);
for (const [n, why] of LBL_KEEP) ok(isLabelOnlyName(n) === false, `isLabelOnlyName would qualify ${JSON.stringify(n)} — ${why}`);

/* THE COMPOSITION IS WHAT PROTECTS EMPLOYER STOCK, and that is the reason the
 * predicate is INJECTED into isNamelessFundRow rather than added beside it.
 * Seven live rows are label-only AND typed `Company stock`; a parallel
 * disjunct would have told their readers the filing names no specific fund,
 * Altria's on $1,456,691,207 with a correct ticker. Asserted both ways so the
 * protection cannot quietly move. */
const STOCK_ROWS = [
  [{ name: "Shares", type: "Company stock" }, "Altria Client Services — $1,456,691,207, 26.6%, ticker MO"],
  [{ name: "Shares of", type: "Company stock" }, "Sealed Air — $136,743,941, 9.0%"],
  [{ name: "Separate Account", type: "Company stock" }, "Ford Motor, two plans"],
  [{ name: "REGISTERED COMPANIES", type: "Company stock" }, "Gardiner Service Co — 3.9%"],
];
const lblGeneric = (n) => isGenericTypeName(n) || hasNoFundIdentity(n) || isLabelOnlyName(n);
for (const [r, who] of STOCK_ROWS) {
  ok(isLabelOnlyName(r.name) === true, `the employer-stock control is decorative: isLabelOnlyName does not even reach ${JSON.stringify(r.name)} (${who})`);
  ok(isNamelessFundRow(r, r.name, lblGeneric) === false, `EMPLOYER STOCK would be qualified "names no specific fund": ${who}`);
}

/* ===== 8. A SENTENCE IS NOT A NAME =====================================
 *
 * 53 published rows / 484,457 participants / $9,498,704,315 publish a sentence
 * ABOUT the holding, or a caption listing an account's contents, as the
 * holding's NAME. American Airlines' is $9,448,603,045 at 38.2% of its menu in
 * front of 132,820 readers.
 *
 * THE MUST-KEEP CASES ARE THE WHOLE POINT, because the register's earlier
 * screen for this class keyed on a VOCABULARY and matched `IS`, the
 * Institutional Shares abbreviation, on 3,328 rows. Three of those rows are
 * pinned below BY VALUE, and in each the FOLLOWING FUNCTION WORD is the only
 * protection. */
const SENT_QUALIFY = [
  ["Separately managed account which includes: Corporate Common Stocks, Registered Investment",
    "American Airlines — $9,448,603,045, 38.2% of its menu, 132,820 readers"],
  ["Loan Repayments are included", "Kaiser Foundation Health Plan x2, 288,416 ppl between them"],
  ["Repayments are Included Yes", "a checkbox answer, 8 plans"],
  ["repayments are included : X", "Access Clinical Partners"],
  ["Loan Repayments are included: @", "Step Forward — and an OCR'd checkbox"],
  ["Repyaments are Included: o $17,160", "Desotec US — the filer's own typo must not matter"],
  ["The accompanying notes are an integral part of this schedule. LERNER CORPORATION",
    "Lerner Corporation — the attachment's own FOOTER, 2.1% of its menu"],
  ["Consists of short term investments", "W.R. Berkley"],
  ["consisting of Cash, Money Market and", "Indeed, Inc. — the one member publishing a fabricated 0.2 fee"],
  ["are Included", "Imagine Schools — $2,644,172 at 2.4%"],
  ["N/A. Participant-directed investment Empower fixed account includes the forfeiture account",
    "Three Way Logistics"],
];
const SENT_KEEP = [
  ["BLACKROCK SP 500 IDX (IS)", "Cigna, $3.4B / 91,385 readers — `IS` is Institutional Shares and the FOLLOWING FUNCTION WORD is the only protection"],
  ["VANG FTSE SOC IDX IS", "Amazon, $873,714,000 — the same abbreviation, trailing"],
  ["VANG IS TL STK MK IP", "Mayo, $1.6B at 10.68% of its menu — the abbreviation MID-NAME"],
  ["American Funds The Income Fund of America R6", "`of` follows a NOUN — the finite-VERB condition is the only protection"],
  ["Holdings in Transition", "`in` follows a noun"],
  ["Hold Co A Stock Fund", "`Hold` is not a finite verb here and `Co` is not a function word"],
  ["Income Fund", "a bare product name — no verb at all"],
  ["Vanguard Institutional Index Fund", "a real fund"],
  ["T. Rowe Price Retirement Balanced Fund", "a real fund"],
  ["Separately Managed Account", "the bare vehicle name with NO contents listed — a different class and a different remedy"],
  ["Contains Fund", "a verb with no function word after it"],
];
for (const [n, who] of SENT_QUALIFY) ok(isSentenceRow(n) === true, `isSentenceRow MUST reach ${JSON.stringify(n)} (${who}) — the arm is inert`);
for (const [n, why] of SENT_KEEP) ok(isSentenceRow(n) === false, `isSentenceRow would qualify ${JSON.stringify(n)} — ${why}`);

/* A CONTROL THAT CANNOT FAIL IS DECORATIVE, and a case protected by TWO
 * conditions proves NEITHER. isSentenceRow has exactly two conditions, so each
 * is neutered in full here and must break a case where it is the ONLY
 * protection — found by asking which cases the OTHER condition misses, not by
 * assuming.
 *
 * `Consists of short term investments` is deliberately NOT used: both
 * conditions reach it (`consists of` is in each vocabulary), so it could not
 * fail for either. The single-protection cases are:
 *   finite predicate  `Loan Repayments are included`  — `are included` is in no
 *                     contents-caption spelling
 *   contents caption  `Separately managed account which includes: Corporate` —
 *                     `includes` is followed by a COLON, not a function word,
 *                     so the predicate arm cannot see it */
{
  const PRED = /\b(?:are|were|was|includes?|represents?|consists?|contains?|holds?|comprises?)\s+(?:included|a|an|the|of|in|by)\b/i;
  const CAPT = /\b(?:which\s+includes?|consist(?:s|ing)\s+of|compris(?:ed|ing)\s+of|made\s+up\s+of|invested\s+in\s+the\s+following)\b/i;
  const predOnly = "Loan Repayments are included";
  const captOnly = "Separately managed account which includes: Corporate Common Stocks";
  /* the shipped predicate must agree with this transcription on both, or the
   * control is testing a copy that has drifted from the source */
  ok(isSentenceRow(predOnly) === true && isSentenceRow(captOnly) === true,
    "the control's transcription has drifted from the shipped isSentenceRow");
  const withoutPred = (n) => CAPT.test(n);
  const withoutCapt = (n) => PRED.test(n);
  ok(withoutPred(predOnly) === false,
    `CONTROL IS DECORATIVE: dropping the finite-predicate arm still reaches ${JSON.stringify(predOnly)} — it is protected twice, pick another case`);
  ok(withoutCapt(captOnly) === false,
    `CONTROL IS DECORATIVE: dropping the contents-caption arm still reaches ${JSON.stringify(captOnly)} — it is protected twice, pick another case`);
  console.log("\nNEGATIVE CONTROL, one per isSentenceRow condition:");
  console.log("  drop the finite-predicate arm: Kaiser's loan caption stops being reached (control fires)");
  console.log("  drop the contents-caption arm: American Airlines' $9.4B row stops being reached (control fires)");
}

/* and the SAME composition guard: none of the 53 is employer stock today, and
 * the injection into isNamelessFundRow is what keeps that true of the 54th. */
const sentGeneric = (n) => isGenericTypeName(n) || hasNoFundIdentity(n) || isLabelOnlyName(n) || isSentenceRow(n);
const SENT_STOCK = [
  [{ name: "Loan Repayments are included", type: "Company stock" }, "a hypothetical stock row carrying the caption"],
  [{ name: "consisting of Cash, Money Market and", type: "Company stock" }, "and another"],
];
for (const [r, who] of SENT_STOCK) {
  ok(isSentenceRow(r.name) === true, `the employer-stock control is decorative: isSentenceRow does not reach ${JSON.stringify(r.name)} (${who})`);
  ok(isNamelessFundRow(r, r.name, sentGeneric) === false, `EMPLOYER STOCK would be qualified "names no specific fund": ${who}`);
}

/* ===== 9. A DANGLING PREPOSITION IS NOT AN ISSUER ======================
 *
 * The page composes `issuer - name`, so 422 published rows / 167,240
 * participants attribute a holding to a fragment: Ashland publishes
 * `Shares of - VANG WINDSOR II ADM` on $98,806,045 while the row's own VWNAX
 * and fee are correct. 259 of the 422 publish a ticker, which is the proof
 * that only the attribution is noise.
 *
 * THE MUST-KEEP LIST IS WEIGHTED TOWARD THE `N.A.` FAMILY ON PURPOSE. Those
 * 264 strings are the live population this must never reach, and three of
 * them were false positives of my own first screen, which used `/i` on a
 * trailing-joiner test and so read a trailing capital `A` as the article:
 * a SHARE CLASS, a SERIES letter and a separate-account DESIGNATION. The
 * anchoring at both ends is what protects them now. */
const ISS_SUPPRESS = [
  ["Shares of", "366 rows - the largest member"],
  ["SHARES OF", "26 rows - an all-caps filing, where case carries NO signal, which is why this predicate is not case-sensitive"],
  ["Investments in shares of", "26 rows - a THREE-word furniture run, so the repetition group is load-bearing"],
  ["Shares in", "12 rows"],
  ["Investments in", "9 rows"],
  ["Investment in", "8 rows - also the named residue of the label-only ship"],
  ["Interests in", "8 rows"],
  ["Units of", "the form generalises past the live strings"],
  ["Holdings in", "likewise"],
];
const ISS_KEEP = [
  ["Alerus Financial, N.A.", "274 rows - the largest kept string in the store; the END ANCHOR is the only protection"],
  ["Wilmington Trust, N.A.", "224 rows"],
  ["John Hancock U.S.A.", "210 rows"],
  ["JPMorgan Chase Bank, N.A.", "49 rows"],
  ["BlackRock Institutional Trust Company, N.A.", "77 rows"],
  ["Voya Retirement Insurance and", "59 rows - TRUNCATED, so suppressing it would LOSE an identifiable insurer"],
  ["Capital Bank and", "50 rows - likewise truncated"],
  ["Empower Trust Company, LLC and", "32 rows"],
  ["The Vanguard Group of", "truncated; that row publishes =VIIIX on $232,941,827"],
  ["Leidos Stable Value, A", "$650,763,893 - a trailing capital is a SHARE CLASS"],
  ["SSGA S+P 500 INDEX SER A", "=SSSYX on $606,941,903 - a SERIES letter"],
  ["Corebridge Separate Account A", "41 rows - a separate-account designation"],
  ["Shares of registered investment companies", "a TYPE LABEL - a different class with a different remedy"],
  ["Investments measured at NAV", "the NAV-caption family, handled by the issuer GATE and not by suppression"],
  ["Shares", "a bare furniture word with NO preposition is not this class"],
  ["Investments", "likewise - the trailing preposition is the only protection here"],
  ["Dodge & Cox", "a real house"],
  ["Vanguard Fiduciary Trust Company", "a real trustee"],
];
for (const [n, who] of ISS_SUPPRESS) ok(isNonIssuerCell(n) === true, `isNonIssuerCell MUST reach ${JSON.stringify(n)} (${who}) - the arm is inert`);
for (const [n, why] of ISS_KEEP) ok(isNonIssuerCell(n) === false, `isNonIssuerCell would suppress ${JSON.stringify(n)} - ${why}`);

/* NEGATIVE CONTROL, one per condition, each against a case where it is the
 * ONLY protection - found by asking which case the other conditions miss.
 *   the END anchor        `Alerus Financial, N.A.` ends on a furniture-free
 *                         token; without the anchor the trailing `N.A.` alone
 *                         could satisfy a floating match
 *   the trailing PREP     `Shares` is pure furniture and must be KEPT
 *   the repetition group  `Investments in shares of` needs the inner run */
{
  const FURN = "(?:shares?|units?|interests?|holdings?|investments?|amounts?|balances?|participations?|value)";
  const anchored = new RegExp("^" + FURN + "(?:\\s+(?:of|in)\\s+" + FURN + ")*\\s+(?:of|in)[\\s.,;:]*$", "i");
  const noAnchor = new RegExp(FURN + "(?:\\s+(?:of|in)\\s+" + FURN + ")*\\s+(?:of|in)[\\s.,;:]*$", "i");
  const noPrep = new RegExp("^" + FURN + "(?:\\s+(?:of|in)\\s+" + FURN + ")*[\\s.,;:]*$", "i");
  const noRepeat = new RegExp("^" + FURN + "\\s+(?:of|in)[\\s.,;:]*$", "i");
  ok(anchored.test("Shares of") && !anchored.test("Alerus Financial, N.A."),
    "the control's transcription has drifted from the shipped isNonIssuerCell");
  ok(noAnchor.test("Investments in shares of") === true, "control setup wrong");
  ok(noPrep.test("Shares") === true,
    "CONTROL IS DECORATIVE: dropping the trailing-preposition requirement does not even reach `Shares`");
  ok(noRepeat.test("Investments in shares of") === false,
    "CONTROL IS DECORATIVE: dropping the repetition group still reaches the three-word run - it is protected twice");
  console.log("\nNEGATIVE CONTROL, one per isNonIssuerCell condition:");
  console.log("  drop the trailing preposition: the bare furniture word `Shares` would be suppressed (control fires)");
  console.log("  drop the repetition group: `Investments in shares of` stops being reached (control fires)");
  /* THE START ANCHOR'S CASES HAD TO BE MEASURED, NOT IMAGINED. My first
   * version of this control listed six strings I expected it to protect
   * (`Alerus Financial, N.A.`, `Voya Retirement Insurance and`, ...) and it
   * reported 0 of 6 and FAILED, because none of those ENDS in furniture plus a
   * preposition, so the end structure alone already excludes them. Measured
   * over all 15,683 distinct issuer strings in the store, the anchor blocks
   * exactly THREE, and each names a real trustee whose attribution would be
   * lost. *A hand-built control table tests the cases its author already
   * imagined* - the live population is where a guard's value is. */
  const ANCHOR_CASES = [
    "Fidelity Management Trust Company Interest in",
    "The Vanguard Group, Inc. 68,551,673 units of",
    "Vanguard Fiduciary Trust Units of",
  ];
  for (const c of ANCHOR_CASES) ok(anchored.test(c) === false, `the START anchor no longer keeps ${JSON.stringify(c)}`);
  let wouldBreak = 0;
  for (const c of ANCHOR_CASES) if (noAnchor.test(c)) wouldBreak++;
  ok(wouldBreak === ANCHOR_CASES.length,
    `CONTROL IS DECORATIVE: dropping the START anchor breaks only ${wouldBreak} of ${ANCHOR_CASES.length} measured cases`);
  console.log(`  drop the START anchor: all ${wouldBreak} measured trustee strings would lose their attribution (control fires)`);
}

if (fails.length) { for (const f of fails) console.error("FAIL " + f); process.exit(1); }
console.log(`\nno-identity: ${KEEP.length} real names kept, ${QUALIFY.length} qualified, `
  + `${BOTH_FORMS.length * 2} surface-agreement, idempotence over ${checked.toLocaleString()} names, `
  + `${STILL.length * 2} baseline, both controls fire, `
  + `label-only ${LBL_QUALIFY.length} qualified / ${LBL_KEEP.length} kept / ${STOCK_ROWS.length * 2} employer-stock, `
  + `sentence ${SENT_QUALIFY.length} qualified / ${SENT_KEEP.length} kept / ${SENT_STOCK.length * 2} employer-stock, `
  + `non-issuer ${ISS_SUPPRESS.length} suppressed / ${ISS_KEEP.length} kept, 3 controls fire — 0 failures`);
