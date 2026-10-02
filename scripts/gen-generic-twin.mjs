/* Regenerate app.js's twin of `isGenericTypeName` FROM lib-4i, never by hand.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE, now stated because four twins have
 * been lost to three regenerations: A PREDICATE app.js TWINS IS SLICED HERE ON
 * THE DAY IT SHIPS, AND NEVER TYPED INTO app.js. `isCollectiveTrustName` and
 * `isLoanAnswerRow` (2026-09-30), then `isLoanVocabularyRow` and
 * `isBankDepositRow` (2026-10-01), were each hand-written INTO the generated
 * block and each deleted by the next run of this generator — because a
 * generator that edits a block in place deletes anything a later hand-edit
 * puts inside its boundaries. The smoke tether caught all four on the very
 * next change, which is the argument for the tether and not an excuse for the
 * habit: between the edit and the catch, the published page lost a suppressor
 * with nothing saying so. Adding a slice costs five lines — the constant's
 * start marker, the function's end marker, the block line, the window hook in
 * MARK_ENDS, and a drift probe.
 *
 * WHY THIS LIVES IN THE REPO, which is the lesson that put it here: it lived
 * in a session scratchpad, a container restart wiped it, and the next change
 * to lib-4i's derivation arrived with no way to regenerate the copy that must
 * track it. A generator the published page depends on is not a scratch file.
 * Twice now that directory has been cleared mid-session.
 *
 * lib-4i builds GENERIC_TYPE_ANY and GENERIC_TYPE_DESPACED from
 * GENERIC_TYPE_NAME by asserted string replacements — they are DERIVED
 * patterns, and transcribing a derived pattern is the move this record says
 * produces wrong answers. So take the COMPILED sources at runtime and write
 * them into app.js as literals. `smoke-test.mjs` then ties the two together,
 * so a change to the derivation shows up as drift rather than as silence.
 *
 * Run it after ANY change to GENERIC_TYPE_NAME, GENERIC_DECO,
 * stripGenericDecoration or isGenericTypeName:
 *     node scripts/gen-generic-twin.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import { GENERIC_TYPE_ANY, GENERIC_TYPE_DESPACED, isGenericTypeName } from "./lib-4i.mjs";
import { isNamelessFundRow, isLoanDescriptionRow, isAnnuityContractRow,
  annuityFeeIsGuaranteeOnly, isInvestmentContractRow, isMistypedStockRow,
  mistypedStockFeeIsGuaranteeOnly, issuerPricedER, isCollectiveTrustName,
  isLoanAnswerRow, isLoanVocabularyRow, isBankDepositRow,
  employerStockSymbolOk, sponsorNameKey } from "./lib-disclose.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const lib = readFileSync(ROOT + "scripts/lib-4i.mjs", "utf8");
const dis = readFileSync(ROOT + "scripts/lib-disclose.mjs", "utf8");

/* the decoration table, read as TEXT so its arms cannot be retyped */
const ds = lib.indexOf("const GENERIC_DECO = [");
const de = lib.indexOf("];", ds) + 2;
if (ds < 0 || de < 2) throw new Error("gen-generic-twin: GENERIC_DECO markers moved in lib-4i");
const deco = lib.slice(ds, de);

/* v196: `isGenericTypeName`'s BODY, extracted VERBATIM rather than retyped.
 * It was retyped here — two `return` lines copied by hand — and that is the one
 * hand-maintained piece in a generator whose whole purpose is that nothing is
 * hand-maintained. Adding v196's empty-remainder arm to lib-4i would have left
 * the twin one arm short, and the drift check below only catches that if a probe
 * name happens to REACH the new arm, which is the failure v189 paid for. */
const gs = lib.indexOf("export function isGenericTypeName(");
if (gs < 0) throw new Error("gen-generic-twin: isGenericTypeName moved in lib-4i");
const ge = lib.indexOf("\n}\n", gs) + 3;
if (ge < 3) throw new Error("gen-generic-twin: isGenericTypeName's body has no closing brace in lib-4i");
const genericfn = lib.slice(gs, ge).replace(/^export /, "");

/* `isNamelessFundRow` extracted VERBATIM from lib-disclose, body and all */
const ns = dis.indexOf("export function isNamelessFundRow(");
if (ns < 0) throw new Error("gen-generic-twin: isNamelessFundRow moved in lib-disclose");
const nameless = dis.slice(ns, dis.indexOf("\n}\n", ns) + 3).replace(/^export /, "");

/* the loan-description rule, also VERBATIM: three constants and two functions.
 * It is a residue test, so the vocabulary regex is the rule — a retyped copy
 * of a 60-alternative alternation is a drift waiting to happen. */
const lds = dis.indexOf("const LOAN_DESC_RANGE = ");
if (lds < 0) throw new Error("gen-generic-twin: LOAN_DESC_RANGE moved in lib-disclose");
const lde = dis.indexOf("\n}\n", dis.indexOf("export function isLoanDescriptionRow(")) + 3;
if (lde < 3) throw new Error("gen-generic-twin: isLoanDescriptionRow moved in lib-disclose");
const loandesc = dis.slice(lds, lde).replace(/^export /gm, "");

/* the annuity-contract rule, VERBATIM: one constant and one function. It is a
 * two-cell test (the filed NAME against the stored TYPE), so both halves must
 * travel together — extracting only the regex is how a caller ends up
 * re-deciding the type half from memory. */
const acs = dis.indexOf("export const ANNUITY_CONTRACT_NAME = ");
if (acs < 0) throw new Error("gen-generic-twin: ANNUITY_CONTRACT_NAME moved in lib-disclose");
const ace = dis.indexOf("\n}\n", dis.indexOf("export function isAnnuityContractRow(")) + 3;
if (ace < 3) throw new Error("gen-generic-twin: isAnnuityContractRow moved in lib-disclose");
const annuity = dis.slice(acs, ace).replace(/^export /gm, "");

/* the guarantee-only FEE rule, VERBATIM: one constant and one function. The
 * constant IS the rule — a retyped alternation is a drift waiting to happen,
 * and this one is the minimal vocabulary measured against the store, so a
 * "harmless" extra arm typed into the copy would change which rows lose a fee
 * on the page and nowhere else. */
const gfs = dis.indexOf("export const GUARANTEE_PRICED_WORDS =");
if (gfs < 0) throw new Error("gen-generic-twin: GUARANTEE_PRICED_WORDS moved in lib-disclose");
const gfe = dis.indexOf("\n}\n", dis.indexOf("export function annuityFeeIsGuaranteeOnly(")) + 3;
if (gfe < 3) throw new Error("gen-generic-twin: annuityFeeIsGuaranteeOnly moved in lib-disclose");
const guarfee = dis.slice(gfs, gfe).replace(/^export /gm, "");

/* the investment-contract rule, VERBATIM: two constants and one function. Both
 * constants travel because the rule reads BOTH cells and then STRIPS — a copy
 * carrying the test regex and a retyped strip regex would flag the same rows
 * and keep different ones, which is drift no count could see. */
const ics = dis.indexOf("export const CONTRACT_DESIGNATION_NAME = ");
if (ics < 0) throw new Error("gen-generic-twin: CONTRACT_DESIGNATION_NAME moved in lib-disclose");
const ice = dis.indexOf("\n}\n", dis.indexOf("export function isInvestmentContractRow(")) + 3;
if (ice < 3) throw new Error("gen-generic-twin: isInvestmentContractRow moved in lib-disclose");
const invcontract = dis.slice(ics, ice).replace(/^export /gm, "");

/* the mistyped-employer-stock rule, VERBATIM: three constants and two
 * functions, all travelling together. `POOLED_CONSTRUCTION_NAME` is BUILT from
 * an array of arms, so it is a derived pattern and transcribing one is the move
 * this record says produces wrong answers; and the fee half is a second
 * function over the same rows, so extracting only the row test would leave the
 * browser re-deciding the fee from memory. */
const mss = dis.indexOf("export const EMPLOYER_STOCK_CLAIM = ");
if (mss < 0) throw new Error("gen-generic-twin: EMPLOYER_STOCK_CLAIM moved in lib-disclose");
const mse = dis.indexOf("\n}\n", dis.indexOf("export function mistypedStockFeeIsGuaranteeOnly(")) + 3;
if (mse < 3) throw new Error("gen-generic-twin: mistypedStockFeeIsGuaranteeOnly moved in lib-disclose");
const mistyped = dis.slice(mss, mse).replace(/^export /gm, "");

/* the issuer-priced FEE rule, VERBATIM: two constants and one function, and all
 * three must travel. `ISSUER_FORM_WORDS` decides what the identity cell is
 * allowed to contribute and `NAME_LEAD_NEVER_A_FIRM` decides when gate (2) is
 * asked at all — both were read off the store's own first tokens, so a retyped
 * copy would license a different population while every count stayed still. */
const ips = dis.indexOf("export const ISSUER_FORM_WORDS =");
if (ips < 0) throw new Error("gen-generic-twin: ISSUER_FORM_WORDS moved in lib-disclose");
const ipe = dis.indexOf("\n}\n", dis.indexOf("export function issuerPricedER(")) + 3;
if (ipe < 3) throw new Error("gen-generic-twin: issuerPricedER moved in lib-disclose");
const isspriced = dis.slice(ips, ipe).replace(/^export /gm, "");

/* v196 — THE TWO TWINS A REGENERATION DELETED, now sliced VERBATIM so they
 * cannot be lost again. `isCollectiveTrustName` (2026-09-30 00:5xZ) and
 * `isLoanAnswerRow` (01:2xZ) were hand-written INTO this generated block in
 * their own cycles; the next run of this generator replaced the whole block and
 * took them with it. The smoke tether is what caught it, on the very next
 * change — which is the argument for the tether, and the argument for never
 * hand-writing a twin inside a block a script owns. Sibling of the end-marker
 * failure recorded below: a generator that edits in place deletes anything a
 * later hand-edit puts inside its own boundaries. */
const cts = dis.indexOf("export const CIT_VEHICLE_NAME =");
if (cts < 0) throw new Error("gen-generic-twin: CIT_VEHICLE_NAME moved in lib-disclose");
const cte = dis.indexOf("\n}\n", dis.indexOf("export function isCollectiveTrustName(")) + 3;
if (cte < 3) throw new Error("gen-generic-twin: isCollectiveTrustName moved in lib-disclose");
const citname = dis.slice(cts, cte).replace(/^export /gm, "");

const las = dis.indexOf("export const LOAN_ANSWER_PHRASE = ");
if (las < 0) throw new Error("gen-generic-twin: LOAN_ANSWER_PHRASE moved in lib-disclose");
const lae = dis.indexOf("\n}\n", dis.indexOf("export function isLoanAnswerRow(")) + 3;
if (lae < 3) throw new Error("gen-generic-twin: isLoanAnswerRow moved in lib-disclose");
const loanans = dis.slice(las, lae).replace(/^export /gm, "");

/* A THIRD TWIN A REGENERATION DELETED — 2026-10-01 (14:2xZ). The loan
 * VOCABULARY arm shipped three hours earlier was hand-written into this block
 * and the next run of this generator took it with the rest. The smoke tether
 * caught it on the very next change, exactly as it caught the previous two, so
 * the lesson is not the tether but the habit it keeps having to rescue: a
 * generator that edits in place deletes anything a later hand-edit puts inside
 * its own boundaries, and the only durable answer is to slice the function
 * VERBATIM here on the same day it ships. */
const lvs = dis.indexOf("const LOAN_NOTE_MARKER = ");
if (lvs < 0) throw new Error("gen-generic-twin: LOAN_NOTE_MARKER moved in lib-disclose");
const lve = dis.indexOf("\n}\n", dis.indexOf("export function isLoanVocabularyRow(")) + 3;
if (lve < 3) throw new Error("gen-generic-twin: isLoanVocabularyRow moved in lib-disclose");
const loanvocab = dis.slice(lvs, lve).replace(/^export /gm, "");

/* AND A FOURTH, FOUND BY THE SAME TETHER IN THE SAME CYCLE: the bank-deposit
 * fee suppressor (2026-10-01 01:5xZ). Four hand-written twins deleted by three
 * regenerations is no longer a slip, it is the default outcome of hand-writing
 * one — so the rule is now explicit at the top of this file: a predicate app.js
 * twins is sliced HERE on the day it ships, never typed into app.js. */
const bds = dis.indexOf("export const BANK_DEPOSIT_NAME =");
if (bds < 0) throw new Error("gen-generic-twin: BANK_DEPOSIT_NAME moved in lib-disclose");
const bde = dis.indexOf("\n}\n", dis.indexOf("export function isBankDepositRow(")) + 3;
if (bde < 3) throw new Error("gen-generic-twin: isBankDepositRow moved in lib-disclose");
const bankdep = dis.slice(bds, bde).replace(/^export /gm, "");

/* AND A FIFTH, SLICED ON THE DAY IT SHIPS rather than typed into app.js —
 * 2026-10-01, the employer-stock PROVENANCE rule. It is the largest slice in
 * this file (two vocabularies, three helpers and two exported functions) and
 * every piece must travel: `ESP_CAPTION_WORD` decides when a SHORT token is the
 * whole identification, `espInitials` is a derived set, and `sponsorNameKey` is
 * what the browser's own index builder calls — a retyped key builder would
 * normalise differently from arm II and the contradiction arm would simply
 * never fire while every count stayed still. */
const ess = dis.indexOf("const ESP_FORM_WORD = new Set(");
if (ess < 0) throw new Error("gen-generic-twin: ESP_FORM_WORD moved in lib-disclose");
const ese = dis.indexOf("\n}\n", dis.indexOf("export function employerStockSymbolOk(")) + 3;
if (ese < 3) throw new Error("gen-generic-twin: employerStockSymbolOk moved in lib-disclose");
const empstock = dis.slice(ess, ese).replace(/^export /gm, "");

const block = `  /* GENERATED FROM scripts/lib-4i.mjs — DO NOT EDIT BY HAND.
   * lib-4i derives these patterns from GENERIC_TYPE_NAME by asserted
   * replacements, so they are DERIVED and transcribing one is the move this
   * record says produces wrong answers. The sources below are the COMPILED
   * regexes, written here by a script, and \`smoke-test.mjs\` compares this copy
   * against lib-4i's own export on every push — a change to the derivation
   * shows up as drift, not as silence.
   * Regenerate: node scripts/gen-generic-twin.mjs */
  const GENERIC_TYPE_ANY = new RegExp(${JSON.stringify(GENERIC_TYPE_ANY.source)}, "i");
  const GENERIC_TYPE_DESPACED = new RegExp(${JSON.stringify(GENERIC_TYPE_DESPACED.source)}, "i");
${deco.split("\n").map((l) => (l.trim() ? "  " + l : l)).join("\n")}
  function stripGenericDecoration(name) {
    let s = String(name || "").trim();
    for (let i = 0; i < 8; i++) {
      const before = s;
      for (const [re, to] of GENERIC_DECO) s = s.replace(re, to);
      s = s.trim();
      if (s === before) break;
    }
    return s;
  }
${genericfn.split("\n").map((l) => (l.trim() ? "  " + l : l)).join("\n")}
  const isGenericName = isGenericTypeName;
  window.__wampoGenericName = isGenericName;  // read by the smoke test only
${nameless.split("\n").map((l) => (l.trim() ? "  " + l : l)).join("\n")}
  window.__wampoNamelessRow = isNamelessFundRow;  // read by the smoke test only
${loandesc.split("\n").map((l) => (l.trim() ? "  " + l : l)).join("\n")}
  window.__wampoLoanDescRow = isLoanDescriptionRow;  // read by the smoke test only
${annuity.split("\n").map((l) => (l.trim() ? "  " + l : l)).join("\n")}
  window.__wampoAnnuityRow = isAnnuityContractRow;  // read by the smoke test only
${guarfee.split("\n").map((l) => (l.trim() ? "  " + l : l)).join("\n")}
  window.__wampoGuaranteeOnlyFee = (n) => annuityFeeIsGuaranteeOnly(n, fundER);  // read by the smoke test only
${invcontract.split("\n").map((l) => (l.trim() ? "  " + l : l)).join("\n")}
  window.__wampoInvestmentContractRow = (f) => isInvestmentContractRow(f, (f && f.name) || "", namesAFund);  // read by the smoke test only
${mistyped.split("\n").map((l) => (l.trim() ? "  " + l : l)).join("\n")}
  window.__wampoMistypedStockRow = (f) => isMistypedStockRow(f, (f && f.name) || "");  // read by the smoke test only
  window.__wampoMistypedStockGuaranteeFee = (n) => mistypedStockFeeIsGuaranteeOnly(n, fundER);  // read by the smoke test only
${isspriced.split("\n").map((l) => (l.trim() ? "  " + l : l)).join("\n")}
  window.__wampoIssuerPricedER = (n, iss) => issuerPricedER(fundER, n, iss);  // read by the smoke test only
${citname.split("\n").map((l) => (l.trim() ? "  " + l : l)).join("\n")}
  window.__wampoCitName = isCollectiveTrustName;  // read by the smoke test only
${loanans.split("\n").map((l) => (l.trim() ? "  " + l : l)).join("\n")}
  window.__wampoLoanAnswerRow = isLoanAnswerRow;  // read by the smoke test only
${loanvocab.split("\n").map((l) => (l.trim() ? "  " + l : l)).join("\n")}
  window.__wampoLoanVocabRow = isLoanVocabularyRow;  // read by the smoke test only
${bankdep.split("\n").map((l) => (l.trim() ? "  " + l : l)).join("\n")}
  window.__wampoBankDepositRow = (n) => isBankDepositRow(n);  // read by the smoke test only
${empstock.split("\n").map((l) => (l.trim() ? "  " + l : l)).join("\n")}
  window.__wampoEmployerStockSymbolOk = employerStockSymbolOk;  // read by the smoke test only
  window.__wampoSponsorNameKey = sponsorNameKey;  // read by the smoke test only
`;

/* THE END MARKER MUST BE THE BLOCK'S LAST LINE. It was `__wampoGenericName`
 * while the block still ended there; when `isNamelessFundRow` was appended the
 * in-place replace cut at the old marker and left the previous tail in the
 * file, so two declarations of one function coexisted and the STALE one won by
 * hoisting order — invisible to the tether, because the stale copy assigned
 * the same window hook. A generator that edits in place is only as honest as
 * its end marker. */
const MARK_S = "  /* GENERATED FROM scripts/lib-4i.mjs — DO NOT EDIT BY HAND.";
/* EVERY end marker this block has ever ended with, NEWEST FIRST. The current
 * one is index 0; the rest are kept so a block written before a later rule was
 * appended is still found WHOLE and replaced rather than left behind. The
 * stale-duplicate failure this file records happened exactly because the marker
 * moved and the old tail stayed — so the list only ever grows, and the cut must
 * be made at the LAST marker present, not the first one found. */
const MARK_ENDS = [
  "  window.__wampoSponsorNameKey = sponsorNameKey;  // read by the smoke test only\n",
  "  window.__wampoBankDepositRow = (n) => isBankDepositRow(n);  // read by the smoke test only\n",
  "  window.__wampoLoanVocabRow = isLoanVocabularyRow;  // read by the smoke test only\n",
  "  window.__wampoLoanAnswerRow = isLoanAnswerRow;  // read by the smoke test only\n",
  "  window.__wampoIssuerPricedER = (n, iss) => issuerPricedER(fundER, n, iss);  // read by the smoke test only\n",
  "  window.__wampoMistypedStockGuaranteeFee = (n) => mistypedStockFeeIsGuaranteeOnly(n, fundER);  // read by the smoke test only\n",
  "  window.__wampoInvestmentContractRow = (f) => isInvestmentContractRow(f, (f && f.name) || \"\", namesAFund);  // read by the smoke test only\n",
  "  window.__wampoGuaranteeOnlyFee = (n) => annuityFeeIsGuaranteeOnly(n, fundER);  // read by the smoke test only\n",
  "  window.__wampoAnnuityRow = isAnnuityContractRow;  // read by the smoke test only\n",
  "  window.__wampoLoanDescRow = isLoanDescriptionRow;  // read by the smoke test only\n",
  "  window.__wampoNamelessRow = isNamelessFundRow;  // read by the smoke test only\n",
];
const app = readFileSync(ROOT + "app.js", "utf8");
let out;
if (app.includes(MARK_S)) {
  const a = app.indexOf(MARK_S);
  let b = -1;
  for (const m of MARK_ENDS) {
    const i = app.indexOf(m, a);
    if (i >= 0) b = Math.max(b, i + m.length);
  }
  if (b < 0) throw new Error("gen-generic-twin: start marker found but no end marker (current or any previous) — refusing to write a truncated block");
  out = app.slice(0, a) + block + app.slice(b);
} else {
  const anchor = "  window.__wampoCleanFiledName = cleanFiledName;";
  if (!app.includes(anchor)) throw new Error("gen-generic-twin: anchor for the twin not found in app.js");
  out = app.replace(anchor, block + anchor);
}
writeFileSync(ROOT + "app.js", out);

/* Prove the generated copy agrees with its sources before claiming success.
 * The row cases exercise every exclusion; the name cases exercise every arm,
 * INCLUDING the v189 despaced one — a probe set that cannot reach an arm is
 * how a guard passes while doing nothing. */
const ctx = { console }; vm.createContext(ctx);
/* fund-er.js goes into the same context FIRST: the guarantee-only fee rule
 * takes the fee table as an argument, so a context without it can hold the
 * generated function and never be able to call it — a self-check that cannot
 * reach an arm, which is the failure this file already records at v189. */
vm.runInContext(readFileSync(ROOT + "fund-er.js", "utf8"), ctx);
/* the identity probe the investment-contract rule takes, defined ONCE here and
 * mirrored by app.js's own `namesAFund`. It needs BOTH halves and that is
 * measured: `American Funds The Bond Fund of America` resolves to no ticker and
 * IS priced by name, so a ticker-only probe would delete a real fund's fee. */
vm.runInContext("globalThis.__namesAFund = (n) => fundER(n) != null || !!fundTickerInfo(n);", ctx);
vm.runInContext(block
  .replace("window.__wampoGenericName = isGenericName;  // read by the smoke test only", "globalThis.__g = isGenericName;")
  .replace("window.__wampoNamelessRow = isNamelessFundRow;  // read by the smoke test only", "globalThis.__n = isNamelessFundRow;")
  .replace("window.__wampoLoanDescRow = isLoanDescriptionRow;  // read by the smoke test only", "globalThis.__l = isLoanDescriptionRow;")
  .replace("window.__wampoAnnuityRow = isAnnuityContractRow;  // read by the smoke test only", "globalThis.__a = isAnnuityContractRow;")
  .replace("window.__wampoGuaranteeOnlyFee = (n) => annuityFeeIsGuaranteeOnly(n, fundER);  // read by the smoke test only",
    "globalThis.__q = (n) => annuityFeeIsGuaranteeOnly(n, fundER);")
  .replace("window.__wampoInvestmentContractRow = (f) => isInvestmentContractRow(f, (f && f.name) || \"\", namesAFund);  // read by the smoke test only",
    "globalThis.__i = (f) => isInvestmentContractRow(f, (f && f.name) || \"\", __namesAFund);")
  .replace("window.__wampoMistypedStockRow = (f) => isMistypedStockRow(f, (f && f.name) || \"\");  // read by the smoke test only",
    "globalThis.__m = (f) => isMistypedStockRow(f, (f && f.name) || \"\");")
  .replace("window.__wampoMistypedStockGuaranteeFee = (n) => mistypedStockFeeIsGuaranteeOnly(n, fundER);  // read by the smoke test only",
    "globalThis.__mq = (n) => mistypedStockFeeIsGuaranteeOnly(n, fundER);")
  .replace("window.__wampoIssuerPricedER = (n, iss) => issuerPricedER(fundER, n, iss);  // read by the smoke test only",
    "globalThis.__ip = (n, iss) => issuerPricedER(fundER, n, iss);")
  .replace("window.__wampoCitName = isCollectiveTrustName;  // read by the smoke test only",
    "globalThis.__ct = isCollectiveTrustName;")
  .replace("window.__wampoLoanAnswerRow = isLoanAnswerRow;  // read by the smoke test only",
    "globalThis.__la = isLoanAnswerRow;")
  .replace("window.__wampoLoanVocabRow = isLoanVocabularyRow;  // read by the smoke test only",
    "globalThis.__lv = isLoanVocabularyRow;")
  .replace("window.__wampoBankDepositRow = (n) => isBankDepositRow(n);  // read by the smoke test only",
    "globalThis.__bd = (n) => isBankDepositRow(n);")
  .replace("window.__wampoEmployerStockSymbolOk = employerStockSymbolOk;  // read by the smoke test only",
    "globalThis.__es = employerStockSymbolOk;")
  .replace("window.__wampoSponsorNameKey = sponsorNameKey;  // read by the smoke test only",
    "globalThis.__sk = sponsorNameKey;")
  .replace(/^\s{2}/gm, ""), ctx);
const names = ["Mutual funds", "Mutual Fund Shares", "Sub-total: Registered Investment Companies",
  "Commingled funds", "Pooled separate account funds", "Collective trust funds",
  /* v189 kerned arm */ "M utual Fund", "Regi s tered i nves tment compa ni es",
  "Colle ctive Trust", "Registered Investm ent Com pany", "Group Annuity C ontrac t",
  /* v190 bare trust designation. ADDED BECAUSE NOT ONE OF THE NAMES ABOVE
   * REACHES THAT ARM — the twin would have agreed here whether or not it
   * carried v190, which is v189's failure repeating one version later. The
   * must-KEEP half below is where the cost of this rule being wrong lives:
   * a designation at the END of a longer name is a real fund's name. */
  "Master Trust", "Trust", "Interest in Master Trust",
  "Plan interest in master trust", "Master Trust Fund",
  /* must stay real */ "Fidelity 500 Index Fund", "AMERICAN FUNDS BLANC MUTUAL FUND",
  "Mutual of America MUTUAL FUND", "Separate Account A, at fair value", "Not Required",
  "Korn Ferry Master Trust", "Investment in BNSF 401(k) Plans Master Trust",
  "Vanguard Retirement Savings Trust II", "Great Gray Trust",
  "T. Rowe Price Retirement 2035 Trust", "Fidelity Freedom Index 2030 Trust",
  /* v191 the wrapped sentence's tail. ADDED FOR THE SAME REASON THE v190
   * probes were: none of the names above reaches this arm, so the twin would
   * agree whether or not it carried v191. The must-KEEP half is where the
   * cost of an unanchored draft would land — three of these are real
   * published names that merely CONTAIN the word. */
  "statements", "Statements", "statement",
  /* must stay real */ "(See Attached Statement)", "Misstatements net of tax impact",
  "Real Estatement Index Fund - Admiral",
  "Statement of Net Assets Available for Benefits",
  /* v192 the bare preferred-stock designation, added for the third cycle
   * running for the same reason: not one probe above reaches this arm. The
   * must-KEEP half is the whole safety argument — 200 of the 205 distinct
   * published names containing `preferred` are real funds, and these five
   * stand for them. */
  "Preferred stock", "PREFERRED STOCK", "Preferred Stocks", "PREFERRED STOCK 795",
  /* must stay real */ "Cohen & Steers Preferred Securities and Income Fund",
  "Nuveen Preferred Securities & Income I", "iShares Preferred & Income Securities ETF",
  "Principal Stable Value Preferred Fund", "Invesco Variable Rate Preferred ETF",
  "Preferred Securities",
  /* v196 the measurement basis, added for the fifth cycle running for the same
   * reason: not one probe above reaches these arms. Two of these reach the
   * EMPTY-REMAINDER arm specifically, which is the one the vocabulary cannot
   * express — the name is nothing but decoration, so there is no word to add. */
  "At fair value", "at Fair Value", "At contract value", "Contract Value",
  "Investments", "Investments measured at NAV", "Collective Trusts(1) at NAV",
  "Investment measured at NAV(A)", "measured at NAV 1", "dividends/interest reinvested",
  "Investments Mutual funds, at fair value", "Assets Investments", "Total assets at fair value",
  /* must stay real */ "Managed Income Portfolio, at fair value",
  "Voya Fixed Account, at contract value", "TIAA Traditional (contract value)",
  "PIMCO Short-Term Floating NAV Portfolio II", "Acuity DC Trust at fair value",
  "Investment Company Of America", "Fidelity MIP CL 1 (Fair Value)"];
const rows = [
  { name: "Mutual funds", type: "Mutual fund" }, { name: "M utual Fund", type: "" },
  { name: "COMMON STOCK", type: "Employer security" },
  { name: "Mutual funds", type: "Subtotal (not a holding)" },
  { name: "Mutual funds", type: "Brokerage window" },
  { name: "Fidelity 500 Index Fund", type: "Mutual fund" }];
/* the loan-description arm, both directions — a probe set that cannot reach an
 * arm is how a guard passes while doing nothing, and the must-KEEP half is
 * where the cost of this rule being wrong lives */
const loans = [
  "at rates of interest ranging from 4.25% to", "from 3.21% to", "Rates from 4.25% to",
  "INTEREST RATES BETWEEN 4.25% AND 9.50% ANNUALLY", "4.25% to 9.50% (cost $0)",
  "Promissory notes* Varying maturity dates with interest rates ranging from 4.25% to",
  "General Account (interest at 3.05%)", "Short term investment fund (interest rate 4.4393%)",
  "Interest Rate of 0.15% to 0.62% (Maturing in 2023) Principal", "Interest rate 1.75%",
  "Fixed annuity at 1.41% interest rate -0", "Bank Loan Fund", "Fidelity 500 Index Fund",
  "(Interest rates up to 5.56%; maturing 2024 - 2030) Morley Stable Value VI Fund",
  /* the 2026-09-30 truncation arm: not one probe above reaches it, so without
   * these the twin would agree whether or not it carried the rule. */
  "Plan participants Notes with interest rates ranging from 3.25% to 10.50%, with various mat",
  "Inte re st from 4.25% to", "Bear interest at 5.0\u20149.50% at varying maturity dates",
  "Bear Stearns High Yield 4.25% to 9.50%",
  "Columbia Short Term Bond rates ranging from 4.25% to 9.50%"];
/* the annuity-contract arm, BOTH CELLS and both directions. Not one probe above
 * reaches it — every one of them passes a bare name — so without these the twin
 * would agree whether or not it carried the rule, which is the decorative-guard
 * failure this record has now caught at v189, v190, v191 and v192. The must-KEEP
 * half is where the cost lives: a row that says "annuity contract" and is typed
 * something MORE specific must not be re-typed, and a real registered fund must
 * never be reached at all. */
const annuityRows = [
  /* must FLAG */
  { name: "Traditional Fixed Annuity Contracts - Non-Fully Benefit Responsive", type: "Mutual fund" },
  { name: "TIAA Traditional Annuity Contract - Nonbenefit-Responsive", type: "Mutual fund" },
  { name: "Group annuity contract - TIAA Traditional Annuity", type: "Mutual fund" },
  { name: "Group Annuity Contract PRIAC Guaranteed Income Fund", type: "Mutual fund" },
  { name: "Variable Annuity Contracts CREF", type: "Mutual fund" },
  { name: "Lincoln Financial Multi-Fund Group Variable Annuity Contract American Funds Global Growth", type: "Mutual fund" },
  /* must KEEP — the type is already honest or more specific */
  { name: "TIAA Traditional Annuity Contract - Fully Benefit-Responsive", type: "Stable value / GIC" },
  { name: "MetLife Group Annuity Contract", type: "Collective trust" },
  { name: ". GROUP ANNUITY CONTRACT Mutual of America", type: "Cash / short-term" },
  { name: "Fidelity VIP Contrafund Portfolio GROUP ANNUITY CONTRACT", type: "" },
  /* must KEEP — typed `Mutual fund` and the name does NOT say annuity contract */
  { name: "Fidelity 500 Index Fund", type: "Mutual fund" },
  { name: "Schwab Government Money Market Portfolio", type: "Mutual fund" },
  { name: "TIAA Traditional Annuity", type: "Mutual fund" },
  { name: "Vanguard Variable Annuity Balanced Portfolio", type: "Mutual fund" },
];
/* the guarantee-only FEE arm, both directions, and it needed its own probes for
 * the fifth cycle running: NOT ONE row above reaches it, because that rule reads
 * the TYPE cell first and this one never reads a type at all. The must-KEEP half
 * is the entire safety argument — every one of those four is a real registered
 * fund held through a group annuity contract, whose published fee comes from the
 * fund's own name and must survive. */
const guarFeeNames = [
  /* must SUPPRESS — the guarantee is the only thing that priced the row */
  "Guaranteed Annuity Contract", "Guaranteed annuity contract - contract value",
  "Group Annuity Contract Lincoln Stable Value Account",
  "Group fixed annuity contracts Empower Select Guaranteed Fund",
  "SAGIC Group Annuity Contract 21016", "Annuity Contracts TIAA Stable Value",
  /* must SUPPRESS — 2026-10-01, the gate now reads all three contract
   * wordings, and not one probe above says `investment` or `insurance`
   * contract, so the twin would have agreed either way */
  "Unallocated investment contract - Guaranteed Income Fund",
  "Fully benefit-responsive investment contract Principal Fixed Income Guaranteed Option",
  "Guaranteed insurance contract",
  "Investment Contract With Insurance Company Lincoln Financial Group Stable Value Account",
  "Fully benefit-responsive investment contract Key Guaranteed Portfolio Fund",
  /* must SUPPRESS — 2026-10-02, the gate now reads the filing's own WORD, and
   * NOT ONE of the 21 probes above reaches that arm: every one of them says
   * `annuity`, `investment` or `insurance` contract, so the twin would have
   * agreed whether or not the vocabulary was replaced. Measured, not assumed.
   * The first is the drawn row (Walsh University, 690 ppl); the fourth is the
   * sharpest boundary on the list, because `Key Guaranteed Portfolio Fund`
   * sits below as a must-KEEP and the filing's own word is the whole
   * difference; the fifth and sixth are two of the SEVEN misspellings of
   * `investment` this population carries, which is why a vocabulary was the
   * wrong shape. The last is the one real fund in the whole widened
   * population: the PREDICATE flags it and app.js's call site KEEPS it via
   * `!tk`, as it already does for `isBankDepositRow` — so a `SUPPRESS` here is
   * the predicate's answer and not what the page does. */
  "TIAA Stable Value Contract - Fully Benefit-Responsive",
  "Guaranteed Income Contract", "Guaranteed Interest Balance Contract",
  "Key Guaranteed Portfolio Fund, at contract value",
  "Guaranteed Investement Contract", "GUARANTEED INVESTMNT CONTRACT",
  "Stable value contract", "Lincoln Stable Value (at contract value)",
  "Change in contract value versus fair value in Morley Stable Value Fund",
  "Contract BlackRock Russell 1000 Growth CIT",
  /* must KEEP — the contract words are there and the remainder still names a
   * fund, so the strip leaves something that prices */
  "Fully benefit responsive investment contract Dodge & Cox Income Fund",
  "Investment contract Fidelity 500 Index Fund",
  /* must KEEP — a real fund held THROUGH the contract, priced by its own name */
  "Vanguard VIF Real Estate Index Portfolio GROUP ANNUITY CONTRACT",
  "Mutual of America Group Annuity Contract Equity Index Fund",
  "Neuberger Berman AMT Sustainable Equity Portfolio GROUP ANNUITY CONTRACT",
  "MoA US Government Money Market Fund GROUP ANNUITY CONTRACT",
  /* must KEEP — the name never says "annuity contract", so the gate is shut */
  "Guaranteed Income Fund", "Key Guaranteed Portfolio Fund",
  "Principal Stable Value Preferred Fund", "Fidelity 500 Index Fund",
  /* must KEEP — 2026-10-02: the 2026-09-29 population the TYPE rule refused
   * the bare word FOR, which is exactly what the residue test absorbs. Each is
   * a real fund wearing a `contract` caption our parse welded on, and each
   * still prices once the guarantee words come out. These are the reason the
   * second condition, not the first, is this gate's safety. */
  "at contract value Fidelity 500 Index", "Contract Fidelity International Index",
  "Contract Vanguard Value Index Fund Adm", "Contract T. Rowe Price Retirement 2045 Fund",
  "at contract value JPMorgan Large Cap Growth Fund",
  /* must KEEP — and this one marks the line that must NOT be crossed. Its RAW
   * filed name says `contract`; the unclosed-parenthetical strip took the word
   * off the end, so the CLEANED name the gate reads does not. A row whose name
   * says only `guaranteed` is the owner-gated stable-value item, and widening
   * a NAME condition must never reach it. */
  "Guaranteed Income Fund - Empower Annuity Insurance Company",
];
/* the investment-contract arm, BOTH CELLS and both directions, and it needed
 * its OWN probes for the sixth cycle running: not one row above reaches it,
 * because every annuity probe's name says `annuity contract` and none says
 * `investment contract` or `insurance contract`. A probe set that cannot reach
 * an arm is how a guard passes while doing nothing — caught at v189, v190,
 * v191, v192 and again here. The must-KEEP half is the whole safety argument:
 * five published rows say `investment contract` and ALSO name a registered
 * fund, and typing those would destroy a correct answer AND a correct fee. */
const investmentContractRows = [
  /* must FLAG — the type asserts `Mutual fund` and the name says a contract */
  { name: "Fully benefit responsive investment contracts American General Life Insurance", type: "Mutual fund" },
  { name: "Unallocated Insurance Contracts", type: "Mutual fund" },
  { name: "Investment contract - Empower Guaranteed Income Fund", type: "Mutual fund" },
  { name: "Investment Contracts with Insurance Companies", type: "Mutual fund" },
  { name: "Unallocated investment contract - Key Guaranteed Portfolio Fund", type: "Mutual fund" },
  { name: "Investment Contract with Insurance Company Great-West Funds", type: "Mutual fund" },
  { name: "Insurance contracts", type: "Mutual fund" },
  /* must KEEP — the contract words are a caption and the row names a real fund */
  { name: "investment contract Dodge & Cox Income Fund Class X", type: "Mutual fund" },
  { name: "Investment Contract American Funds Europacific GR R6", type: "Mutual fund" },
  { name: "Responsive Investment Contract American Funds The Bond Fund of America", type: "Mutual fund" },
  /* must KEEP — the type is already honest or more specific than this one */
  { name: "Unallocated Insurance Contracts", type: "Stable value / GIC" },
  { name: "Investment contract - Lincoln Stable Value Account", type: "Collective trust" },
  { name: "Fully Benefit-Responsive Investment Contract VALIC", type: "" },
  /* must KEEP — typed `Mutual fund`, and the name says no contract at all.
   * `contract value` is a MEASUREMENT BASIS and must never reach this arm. */
  { name: "Fidelity 500 Index Fund", type: "Mutual fund" },
  { name: "at contract value Fidelity 500 Index", type: "Mutual fund" },
  { name: "Contract Vanguard Value Index Fund Adm", type: "Mutual fund" },
  { name: "Lincoln Stable Value (at contract value)", type: "Mutual fund" },
  { name: "Group Annuity Contract PRIAC Guaranteed Income Fund", type: "Mutual fund" },
];
/* the mistyped-employer-stock arm, BOTH CELLS and both directions, and it
 * needed its OWN probes for the seventh cycle running: not one row above
 * reaches it, because every one of them is typed `Mutual fund` and this arm
 * gates on `Company stock`. A probe set that cannot reach an arm is how a
 * guard passes while doing nothing.
 * The must-KEEP half is the entire safety argument and has three parts: a
 * genuine employer security whose name states a portfolio word (`JOHNSON
 * CONTROLS INTERNATIONAL`, `Freedom Bank Unitized Stock`, `Schwab 401(k)
 * Equity Unit Fund`); a row whose own NAME says company/employer stock, which
 * the shipped name arm must go on deciding; and any row not typed employer
 * stock at all. */
const mistypedStockRows = [
  /* must FLAG — a maturity vintage, a tracked index or an asset class */
  { name: "Target Retirement Date Fund 2045", type: "Company stock" },
  { name: "Non-US Equity Index Fund", type: "Company stock" },
  { name: "Non-US Equity Blend Fund", type: "Company stock" },
  { name: "US Equity Small/Midcap Index Fund", type: "Company stock" },
  { name: "Fidelity Freedom 2040 Fund Class K", type: "Company stock" },
  { name: "American Funds 2050 Target", type: "Company stock" },
  { name: "Vanguard Total Bond Market Index Fund", type: "Company stock" },
  { name: "NOV Stable Value Fund", type: "Company stock" },
  { name: "EQ/Common Stock Index", type: "Employer security" },
  /* must KEEP — real employer stock carrying a word that can also be a firm's */
  { name: "JOHNSON CONTROLS INTERNATIONAL", type: "Company stock" },
  { name: "Freedom Bank Unitized Stock", type: "Company stock" },
  { name: "Schwab 401(k) Equity Unit Fund", type: "Company stock" },
  { name: "S&P GLOBAL INC", type: "Company stock" },
  { name: "Real Estate Investment Trust", type: "Company stock" },
  { name: "Oceaneering International, Inc.", type: "Company stock" },
  { name: "Titan International, Inc.", type: "Company stock" },
  /* must KEEP — the NAME arm of `stockRow` decides these, not this rule */
  { name: "Fidelity Leveraged Company Stock Fund", type: "Company stock" },
  { name: "Marriott International, Inc. Common Stock Fund", type: "Company stock" },
  { name: "Employer Security Knight Stock", type: "Company stock" },
  /* must KEEP — not typed employer stock at all, so the gate is shut */
  { name: "Vanguard Target Retirement 2045 Fund", type: "Mutual fund" },
  { name: "Fidelity 500 Index Fund", type: "" },
  { name: "US Equity S&P 500 Index Fund", type: "Collective trust" },
];
/* the FEE half, both directions. The must-SUPPRESS names are the rows that
 * would newly publish fund-er.js's generic guarantee fallback once the
 * employer-stock claim is withdrawn; the must-KEEP names are real funds whose
 * published fee comes from their own name and must survive, INCLUDING two that
 * carry no guarantee word at all, where the rule must be inert rather than
 * accidentally true. */
const mistypedStockFeeNames = [
  /* must SUPPRESS — the guarantee is the only thing that priced the row */
  "NOV Stable Value Fund", "Lincoln Stable Value Fund",
  "Principal Fixed Income Guaranteed Option", "Fixed Income Guarantee Option",
  "Managed Income Portfolio",
  /* AND THE PIN THAT CAUGHT MY OWN DRAFT, moved here WITH ITS EVIDENCE rather
   * than deleted: `Principal Stable Value Preferred Fund` was written as a
   * must-KEEP, copied from the annuity rule's list where it is kept for a
   * different reason (that gate needs the words `annuity contract`, which this
   * name does not carry). The control failed, and it was the control that was
   * wrong: `fundER` prices this name at exactly 0.35 — the generic
   * /stable value|managed income|guaranteed|gic/ fallback — and the remainder
   * `Principal Preferred Fund` prices at null. The guarantee IS the only thing
   * priced, so suppression is correct. */
  "Principal Stable Value Preferred Fund",
  /* must KEEP — a guarantee word is PRESENT and the remainder still names a
   * fund, which is the whole cost of this rule being wrong. All three are real
   * published names, found by asking the store for them rather than invented. */
  "TRP BLUE CHIP GR T2 Stable value",
  "Vanguard Total Bond Market Index Admiral 1TRSV-A T. Rowe Price Stable Value Common Trst A",
  "PIMCO INCOME INSTL $35.42 GUARANTEED INCOME FUND",
  /* must KEEP — no guarantee word at all, so the rule must be INERT here
   * rather than accidentally true; `Target Retirement Date Fund 2045` prices
   * at null and must still come back false. */
  "Vanguard 500 Index Admiral", "Fidelity 500 Index Fund",
  "Vanguard Total Bond Market Index Fund", "Target Retirement Date Fund 2045",
];
/* the issuer-priced FEE arm, both directions, and it needed its OWN probes for
 * the eighth cycle running: NOT ONE case above takes an issuer at all, so
 * without these the twin would agree whether or not it carried the rule — the
 * decorative-guard failure caught at v189, v190, v191, v192 and twice since.
 *
 * The must-REFUSE half is the entire safety argument and every row in it was
 * READ out of the store, not invented: three are the recorded false positives
 * where the issuer's own house arm answers by itself, six are a SECOND HOUSE
 * leading the filed name while a house-anchored arm ignores it, one is the
 * trustee's corporate form satisfying a pattern's VEHICLE condition, and three
 * are the generic guarantee fallback firing on a caption in the identity cell —
 * the exact 0.35% this record withdrew from 89 rows and from 34 before that. */
const issuerFeeCases = [
  /* must PRICE — the identity column supplies the house and nothing else */
  ["Retirement 2030 Active Fund", "T. Rowe Price", 0.55],
  ["Explorer Value Fund Investor Shares", "Vanguard", 0.3],
  ["Europac Growth R6", "American Funds", 0.46],
  ["2040 Target Date Retirement Fund", "American Funds", 0.32],
  ["The Growth Fund of America", "American Funds", 0.3],
  ["Advisor Total Bond Z", "Fidelity", 0.45],
  ["Blue Chip Growth K6", "Fidelity", 0.55],
  ["International Stock Fund", "Dodge & Cox", 0.62],
  ["Large Cap Growth Fund", "JPMorgan", 0.44],
  /* must PRICE — a REAL fund whose own name carries its SUB-ADVISER. 274 of the
   * 282 rows a house vocabulary would flag are this shape, which is why no
   * house vocabulary ships here. */
  ["Wellington Fund", "Vanguard", 0.17],
  ["Wellington Admiral Fund", "Vanguard", 0.17],
  /* must REFUSE — gate (1), the issuer's house arm answers by itself */
  ["American Century Small Cap Growth R6", "American Funds", null],
  ["DODGE & COX GLOBAL BOND - I", "American Funds Plans", null],
  ["Schwab Fundamental International", "Dimensional Fund Advisors", null],
  ["Columbia Select Large Cap Value ol", "— The American Funds Group", null],
  /* must REFUSE — gate (2), a second house leads the filed name */
  ["MFS Mid Cap Value R6", "T. Rowe Price", null],
  ["MFS Mid Cap Value", "T. Rowe Price Trust Company", null],
  ["AB Large Cap Growth I", "JP Morgan", null],
  ["American Century Equity Income", "JPMorgan", null],
  ["Parnassus Equity Income Inst", "T. Rowe Price", null],
  ["Putnam Large Cap Growth R6", "T. Rowe Price", null],
  ["Western Asset Core Plus Bond Fund", "JP Morgan", null],
  /* must REFUSE — gate (2) past a leading share-class designation */
  ["Class R6 PGIM New World Fund Class R6", "American Funds", null],
  /* must REFUSE — gate (0), the trustee's corporate form supplied `trust` and
   * published the COLLECTIVE TRUST price for a registered fund */
  ["Vanguard Retirement Target 2045", "Fidelity Management Trust Company", null],
  /* must REFUSE — the generic guarantee fallback, fired by the identity cell */
  ["UNALLOCATED INSURANCE CONTRACTS", "GUARANTEED INTEREST OPTION", null],
  ["Traditional", "Guaranteed Annuity Contracts TIAA", null],
  ["Fully-benefit responsive investment contract", "Principal Fixed Income Guaranteed Option", null],
  /* must REFUSE — no issuer to add, so there is nothing to ask */
  ["Fidelity 500 Index Fund", "", null],
  ["", "Vanguard", null],
];
let bad = 0;
for (const [n, iss, want] of issuerFeeCases) {
  const twin = ctx.__ip(n, iss), lib = issuerPricedER(ctx.fundER, n, iss);
  if (twin !== lib) { bad++; console.log(`  ISSUER-FEE DRIFT {${iss}} ${JSON.stringify(n)} twin=${twin} lib=${lib}`); }
  if (lib !== want) { bad++; console.log(`  ISSUER-FEE rule moved: {${iss}} ${JSON.stringify(n)} want=${want} got=${lib}`); }
}
for (const r of mistypedStockRows) {
  const twin = ctx.__m(r), lib = isMistypedStockRow(r, r.name);
  if (twin !== lib) { bad++; console.log(`  MISTYPED-STOCK DRIFT ${JSON.stringify(r)} twin=${twin} lib=${lib}`); }
}
for (const r of mistypedStockRows.slice(0, 9)) if (!isMistypedStockRow(r, r.name)) {
  bad++; console.log(`  MISTYPED-STOCK rule no longer withdraws an employer-stock claim from a pooled fund: ${JSON.stringify(r)}`);
}
for (const r of mistypedStockRows.slice(9)) if (isMistypedStockRow(r, r.name)) {
  bad++; console.log(`  MISTYPED-STOCK rule would withdraw a claim it must leave alone: ${JSON.stringify(r)}`);
}
for (const n of mistypedStockFeeNames) if (ctx.__mq(n) !== mistypedStockFeeIsGuaranteeOnly(n, ctx.fundER)) {
  bad++; console.log(`  MISTYPED-STOCK FEE DRIFT ${JSON.stringify(n)} twin=${ctx.__mq(n)} lib=${mistypedStockFeeIsGuaranteeOnly(n, ctx.fundER)}`);
}
for (const n of mistypedStockFeeNames.slice(0, 6)) if (!mistypedStockFeeIsGuaranteeOnly(n, ctx.fundER)) {
  bad++; console.log(`  MISTYPED-STOCK FEE rule would publish a fabricated guarantee fee: ${JSON.stringify(n)}`);
}
for (const n of mistypedStockFeeNames.slice(6)) if (mistypedStockFeeIsGuaranteeOnly(n, ctx.fundER)) {
  bad++; console.log(`  MISTYPED-STOCK FEE rule would withdraw a fee a fund's own name supports: ${JSON.stringify(n)}`);
}
for (const r of investmentContractRows) {
  const twin = ctx.__i(r), lib = isInvestmentContractRow(r, r.name, ctx.__namesAFund);
  if (twin !== lib) { bad++; console.log(`  INVESTMENT-CONTRACT DRIFT ${JSON.stringify(r)} twin=${twin} lib=${lib}`); }
}
for (const r of investmentContractRows.slice(0, 7)) if (!isInvestmentContractRow(r, r.name, ctx.__namesAFund)) {
  bad++; console.log(`  INVESTMENT-CONTRACT rule no longer types a contract the filing names: ${JSON.stringify(r)}`);
}
for (const r of investmentContractRows.slice(7)) if (isInvestmentContractRow(r, r.name, ctx.__namesAFund)) {
  bad++; console.log(`  INVESTMENT-CONTRACT rule would retype a row it must leave alone: ${JSON.stringify(r)}`);
}
for (const r of annuityRows) if (ctx.__a(r, r.name) !== isAnnuityContractRow(r, r.name)) {
  bad++; console.log(`  ANNUITY DRIFT ${JSON.stringify(r)} twin=${ctx.__a(r, r.name)} lib=${isAnnuityContractRow(r, r.name)}`);
}
for (const n of guarFeeNames) if (ctx.__q(n) !== annuityFeeIsGuaranteeOnly(n, ctx.fundER)) {
  bad++; console.log(`  GUARANTEE-FEE DRIFT ${JSON.stringify(n)} twin=${ctx.__q(n)} lib=${annuityFeeIsGuaranteeOnly(n, ctx.fundER)}`);
}
for (const n of guarFeeNames.slice(0, 21)) if (!annuityFeeIsGuaranteeOnly(n, ctx.fundER)) {
  bad++; console.log(`  GUARANTEE-FEE rule no longer suppresses a fabricated annuity fee: ${JSON.stringify(n)}`);
}
for (const n of guarFeeNames.slice(21)) if (annuityFeeIsGuaranteeOnly(n, ctx.fundER)) {
  bad++; console.log(`  GUARANTEE-FEE rule would withdraw a fee a fund's own name supports: ${JSON.stringify(n)}`);
}
for (const n of loans) if (ctx.__l(n) !== isLoanDescriptionRow(n)) {
  bad++; console.log(`  LOAN DRIFT ${JSON.stringify(n)} twin=${ctx.__l(n)} lib=${isLoanDescriptionRow(n)}`);
}
for (const n of names) if (ctx.__g(n) !== isGenericTypeName(n)) {
  bad++; console.log(`  NAME DRIFT ${JSON.stringify(n)} twin=${ctx.__g(n)} lib4i=${isGenericTypeName(n)}`);
}
for (const r of rows) if (ctx.__n(r, r.name, ctx.__g) !== isNamelessFundRow(r, r.name, isGenericTypeName)) {
  bad++; console.log(`  ROW DRIFT ${JSON.stringify(r)}`);
}
/* v196: the two twins a regeneration had deleted now carry drift checks of
 * their own, with cases that REACH both arms of each rule. Without these the
 * slices above would be silent the next time either rule changed — and a twin
 * with no drift check is the decorative guard this file already records. */
const citNames = ["Vanguard Target Retirement 2040 Trust II", "Voya Stable Value Fund 20 CIT",
  "Great Grey Trust - T. Rowe Price Stable Value CIT", "Invesco Stable Value Trust III",
  /* must stay FALSE */ "MFS Series Trust II - MFS Growth Fund", "JPMorgan Trust II - Core Bond",
  "American Funds American High-Income Trust", "Neuberger Berman Genesis Fund Trust Class",
  "Fidelity 500 Index Fund", "CIT Group Inc"];
for (const n of citNames) if (ctx.__ct(n) !== isCollectiveTrustName(n)) {
  bad++; console.log(`  CIT-NAME DRIFT ${JSON.stringify(n)} twin=${ctx.__ct(n)} lib=${isCollectiveTrustName(n)}`);
}
const loanAnsNames = ["Loan Repayments are included:", "loan repayments: 240,932",
  "included", "Included", "Yes", "no",
  /* the 02:5xZ widening: the leading `Loan` lands on the row ABOVE when the
   * layout gives each fragment its own value */
  "Repayments are Included", "Repayments are", "repayments are included: X",
  "Repayments are Included Yes",
  /* must stay FALSE */ "Included Value Fund", "Yes Bank Ltd", "Bank Loan Fund",
  "Loan Repayment (Interest)", "Participant loans", "Loan Fund",
  "repayment schedules through August 2029 with interest rates ranging from 2.88% to",
  "Repayment Holdings Ltd"];
for (const n of loanAnsNames) if (ctx.__la(n) !== isLoanAnswerRow(n)) {
  bad++; console.log(`  LOAN-ANSWER DRIFT ${JSON.stringify(n)} twin=${ctx.__la(n)} lib=${isLoanAnswerRow(n)}`);
}
/* the loan VOCABULARY arm, 2026-10-01, and it needed its own probes for the
 * same reason every block above did: not one loan-ANSWER name reaches it. The
 * must-KEEP half is where this rule's cost lives — a NOTE is a security before
 * it is a loan, and a fund whose own name carries the word is not a loan line. */
const loanVocabNames = ["Outstanding Loan Balance", "Outstanding Plan Loans",
  "Loans to Plan Participants", "Participant's Loan Account",
  "Notes receivable from participants", "Promissory notes - participants",
  /* must stay FALSE */ "Bank Loan Fund", "Senior Loan Portfolio",
  "Invesco Senior Loan ETF", "Note @ 1.500% Maturing 2/15/2030",
  "Note 3.150% due 03/15/2027", "FEDERAL HOME LOAN BANK OF BOSTON",
  "Interest rate 1.75%"];
for (const n of loanVocabNames) if (ctx.__lv(n) !== isLoanVocabularyRow(n)) {
  bad++; console.log(`  LOAN-VOCAB DRIFT ${JSON.stringify(n)} twin=${ctx.__lv(n)} lib=${isLoanVocabularyRow(n)}`);
}
const bankDepNames = ["Schwab Bank Savings", "Charles Schwab Trust Bank",
  "TD Bank USA N.A.", "Merrill Lynch Bank Deposit Program",
  "Wells Fargo Bank, N.A.-Bank Deposit Sweep",
  /* must stay FALSE */ "Gabelli U.S. Treasury Money Market Fund Class AAA",
  "Vanguard Federal Money Market Fund", "Fidelity 500 Index Fund"];
for (const n of bankDepNames) if (ctx.__bd(n) !== isBankDepositRow(n)) {
  bad++; console.log(`  BANK-DEPOSIT DRIFT ${JSON.stringify(n)} twin=${ctx.__bd(n)} lib=${isBankDepositRow(n)}`);
}
/* THE EMPLOYER-STOCK PROVENANCE ARM, 2026-10-01: all six arguments and both
 * directions, and it needed its own probes for the ninth cycle running —
 * NOT ONE case above passes a sponsor name or a ticker, so without these the
 * twin would agree whether or not it carried the rule. Every name is READ out
 * of the live store, and the must-KEEP half is the whole safety argument: it
 * holds the two short forms, the OCR'd caption, the descriptive prose an
 * employer-stock row legitimately carries, and both sides of the GE spin-off,
 * which is the one pair no single arm separates. */
const espIdx = new Map([
  ["uber technologies", new Set(["UBER"])],
  ["murphy oil", new Set(["MUR"])],
  ["murphy usa", new Set(["MUSA"])],
  ["coca cola", new Set(["KO"])],
  ["keysight technologies", new Set(["KEYS"])],
  ["agilent technologies", new Set(["A"])],
]);
const espCases = [
  /* [name, issuer, sponsor, ticker, curated public name, may publish, why] */
  /* must WITHDRAW — arm I, the row names another company outright */
  ["INTERNATIONAL BUSINESS MACHS", "", "Bank Of America Corporation", "BAC", "Bank of America", false,
    "IBM in BofA's brokerage window, printed as BAC for 250,040 readers"],
  ["EXXON MOBIL CORP", "", "Bank Of America Corporation", "BAC", "Bank of America", false, "same row set"],
  ["The J.M. Smucker Company", "", "The Procter & Gamble Company", "PG", "Procter & Gamble", false, "SJM at P&G"],
  ["LXP INDUSTRIAL TRUST", "", "American Express Company And Its Participating Subsidiaries", "AXP", "American Express", false,
    "a REIT at Amex — `trust` is not caption vocabulary here"],
  ["ONEOK, Inc.", "", "One Gas, Inc.", "OGS", "", false, "the former parent at the spun-off company"],
  ["Albemarle Corporation", "", "Newmarket Corporation", "NEU", "", false, "ALB at NewMarket"],
  ["FORD MOTOR COMPANY", "", "Cleveland-Cliffs Inc.", "CLF", "", false, "F at Cleveland-Cliffs"],
  ["ESAB Corporation", "", "Enovis Corporation", "ENOV", "", false, "the spin-off at its former parent"],
  ["Emerson Stock Fund", "", "Esco Technologies Inc.", "ESE", "", false, "EMR at ESCO"],
  ["Vitesse", "", "Jefferies Financial Group, Inc.", "JEF", "", false, "a one-word spin-off"],
  /* must WITHDRAW — arm I, the row names no company at all */
  ["Master Trust", "", "Fedex Corporation", "FDX", "FedEx", false,
    "a master-trust interest printed as FDX for 310,374 readers across two plans"],
  ["MFS International Equity Fund Class 3A", "", "H&R Block Management, Llc", "HRB", "", false, "a mutual fund"],
  ["Fidelity Cash Reserves", "Fidelity Investments", "Powell Industries, Inc.", "POWL", "", false, "a money-market fund"],
  ["Cash on hand", "", "Arrow Financial Corporation", "AROW", "", false, "cash is not a share"],
  ["Participant directed brokerage accounts", "", "Entegris, Inc.", "ENTG", "", false, "a brokerage aggregate"],
  ["Corporate Stocks (other than Employer Securities)", "", "Crane Nxt, Co.", "CXT", "", false,
    "the caption says in words that it is NOT employer securities"],
  /* must WITHDRAW — the GE spin-off, BOTH directions, which is the pair the
   * rest-is-caption condition on the short-form arm exists for */
  ["GE Vernova Common Stock", "GE Vernova Inc.", "General Electric Company", "GE", "GE Aerospace", false,
    "GE Vernova is GEV; `GE` is both GE's symbol and a prefix of `General`"],
  ["GE Common Stock", "", "Ropcor, Inc.", "GEV", "GE Vernova", false,
    "General Electric at GE Vernova's own filer — the same defect reversed"],
  /* must WITHDRAW — arm II, the row names another plan's SPONSOR even though
   * arm I is satisfied by a shared industry or family word */
  ["Uber Technologies Inc", "", "Agilent Technologies, Inc.", "A", "", false,
    "arm I is satisfied by `technologies`; the row names Uber"],
  ["Keysight Technologies Inc", "", "Agilent Technologies, Inc.", "A", "", false, "the spin-off at its former parent"],
  ["Murphy USA Stock Fund 1", "", "Murphy Oil Corporation", "MUR", "", false, "arm I satisfied by `murphy`"],
  ["Murphy Oil Corporation", "", "Murphy Usa Inc.", "MUSA", "", false, "the same pair reversed"],
  ["The Coca Cola Company", "", "Coca-Cola Consolidated, Inc.", "COKE", "", false,
    "the bottler is not The Coca-Cola Company"],
  /* must PUBLISH — the row names the sponsor by a content token */
  ["Walmart Inc. Equity Securities", "", "Walmart Inc.", "WMT", "Walmart", true, "the plain shape"],
  ["Common and preferred stocks BANK OF AMERICA CORPORATION", "", "Bank Of America Corporation", "BAC", "Bank of America", true,
    "a caption prefix before the sponsor's own name"],
  ["International Business Machines Corporation - Managed by Independent Fiduciary - State Str", "", "International Business Machines Corporation", "IBM", "IBM", true,
    "149,818 readers — an employer-stock row carries arbitrary prose about the FUND, which is why a residue test is not available as evidence"],
  ["Investment in PPG Industries, Inc.", "", "Ppg Industries, Inc.", "PPG", "", true, "a leading `Investment in`"],
  ["Interest-bearing cash within the Cintas Corporation", "", "Cintas Corporation", "CTAS", "", true, "the stock fund's cash sleeve"],
  ["Schwab Ameritrade Converted Equity Unit Fund", "", "The Charles Schwab Corporation", "SCHW", "Charles Schwab", true,
    "`schwab` is the sponsor's SECOND token, so a leading-token rule would destroy this"],
  ["MCDONALD'S CORPORATION", "", "Mcdonalds Corporation And Subsidiaries", "MCD", "McDonald's", true,
    "the apostrophe must be DELETED and not spaced — the third time punctuation in a sponsor name cost this record a match"],
  ["GE Vernova", "", "Ropcor, Inc.", "GEV", "GE Vernova", true,
    "the CURATED public name behind the ticker is what corroborates a filer whose own name shares nothing with it"],
  /* must PUBLISH — a SHORT FORM that is the whole identification */
  ["IFF Common Stock", "", "International Flavors & Fragrances Inc.", "IFF", "", true, "the plan's own symbol"],
  ["FBIN STOCK", "", "Fortune Brands Innovations, Inc.", "FBIN", "", true, "the plan's own symbol"],
  ["UPC Common Stock", "", "Union Pacific Railroad Company", "UNP", "Union Pacific", true,
    "an acronym skipping an interior word: Union Pacific [Railroad] Company"],
  ["CFSI ESOP", "", "Community Financial System, Inc", "CBU", "", true, "an acronym including the corporate form's initial"],
  ["EZ Corp", "", "Ezcorp, Inc.", "EZPW", "", true, "a two-character prefix of the sponsor's own word"],
  /* must PUBLISH — a bare employer-stock caption identifies nothing and so
   * claims nothing beyond what the TYPE cell already says */
  ["COMMON STOCK", "", "Pepsico, Inc.", "PEP", "PepsiCo", true, "167,015 readers"],
  ["EMPLOYER RELATED SECURITIES", "", "Verizon Communications Inc.", "VZ", "Verizon", true, "119,145 readers"],
  ["Common Stock, $.01 par value per share", "", "Sei Investments Company", "SEIC", "", true, "a caption with a par value in it"],
  ["INC. COMMON STOCK FUND", "", "Hawaiian Electric Industries, Inc.", "HE", "", true, "a truncated caption"],
  ["COMPANY STOCK PENDING FUND", "", "Educational Development Corp.", "EDUC", "", true, "a caption with a status word"],
  ["C OM PA N Y ST OC K TOYOTA ADR FUND", "", "Toyota Motor North America, Inc", "TM", "Toyota", true,
    "52,368 readers — an OCR'd caption whose only content token is the sponsor's"],
];
for (const [n, iss, sp, tk, pub, want, why] of espCases) {
  const twin = ctx.__es(n, iss, sp, tk, pub, espIdx);
  const lib = employerStockSymbolOk(n, iss, sp, tk, pub, espIdx);
  if (twin !== lib) { bad++; console.log(`  EMPLOYER-STOCK DRIFT ${JSON.stringify(n)} twin=${twin} lib=${lib}`); }
  if (lib !== want) { bad++; console.log(`  EMPLOYER-STOCK rule moved: ${JSON.stringify(n)} {${sp}/${tk}} want=${want} got=${lib} — ${why}`); }
}
/* the key builder must agree too: the browser's index is built with it and arm
 * II looks the name up in that index, so a drifted key makes the arm inert */
for (const sp of ["Uber Technologies Inc", "Murphy Usa Inc.", "Coca-Cola Consolidated, Inc.",
  "Mcdonalds Corporation And Subsidiaries", "The Charles Schwab Corporation", "Ropcor, Inc."]) {
  if (ctx.__sk(sp) !== sponsorNameKey(sp)) {
    bad++; console.log(`  SPONSOR-KEY DRIFT ${JSON.stringify(sp)} twin=${ctx.__sk(sp)} lib=${sponsorNameKey(sp)}`);
  }
}
if (bad) { console.error(`generated with ${bad} DRIFT — do not commit`); process.exit(1); }
console.log(`generated; twin agrees with lib-4i on ${names.length} names, with lib-disclose on ${rows.length} rows, ${loans.length} loan-description names, ${annuityRows.length} annuity-contract rows, ${guarFeeNames.length} guarantee-only fee names, ${investmentContractRows.length} investment-contract rows, ${mistypedStockRows.length} mistyped-employer-stock rows and ${mistypedStockFeeNames.length} mistyped-stock fee names and ${issuerFeeCases.length} issuer-priced fee cases, ${citNames.length} collective-trust names and ${loanAnsNames.length} loan-answer names and ${loanVocabNames.length} loan-vocabulary names and ${bankDepNames.length} bank-deposit names and ${espCases.length} employer-stock provenance cases`);
