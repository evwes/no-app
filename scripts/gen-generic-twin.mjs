/* Regenerate app.js's twin of `isGenericTypeName` FROM lib-4i, never by hand.
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
  mistypedStockFeeIsGuaranteeOnly, issuerPricedER } from "./lib-disclose.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const lib = readFileSync(ROOT + "scripts/lib-4i.mjs", "utf8");
const dis = readFileSync(ROOT + "scripts/lib-disclose.mjs", "utf8");

/* the decoration table, read as TEXT so its arms cannot be retyped */
const ds = lib.indexOf("const GENERIC_DECO = [");
const de = lib.indexOf("];", ds) + 2;
if (ds < 0 || de < 2) throw new Error("gen-generic-twin: GENERIC_DECO markers moved in lib-4i");
const deco = lib.slice(ds, de);

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
  function isGenericName(n) {
    const s = String(n || "").trim();
    if (!s) return false;
    return GENERIC_TYPE_ANY.test(s) || GENERIC_TYPE_ANY.test(stripGenericDecoration(s))
        || GENERIC_TYPE_DESPACED.test(s.toLowerCase().replace(/[^a-z]/g, ""));
  }
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
  "Preferred Securities"];
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
  "(Interest rates up to 5.56%; maturing 2024 - 2030) Morley Stable Value VI Fund"];
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
  /* must KEEP — a real fund held THROUGH the contract, priced by its own name */
  "Vanguard VIF Real Estate Index Portfolio GROUP ANNUITY CONTRACT",
  "Mutual of America Group Annuity Contract Equity Index Fund",
  "Neuberger Berman AMT Sustainable Equity Portfolio GROUP ANNUITY CONTRACT",
  "MoA US Government Money Market Fund GROUP ANNUITY CONTRACT",
  /* must KEEP — the name never says "annuity contract", so the gate is shut */
  "Guaranteed Income Fund", "Key Guaranteed Portfolio Fund",
  "Principal Stable Value Preferred Fund", "Fidelity 500 Index Fund",
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
for (const n of guarFeeNames.slice(0, 6)) if (!annuityFeeIsGuaranteeOnly(n, ctx.fundER)) {
  bad++; console.log(`  GUARANTEE-FEE rule no longer suppresses a fabricated annuity fee: ${JSON.stringify(n)}`);
}
for (const n of guarFeeNames.slice(6)) if (annuityFeeIsGuaranteeOnly(n, ctx.fundER)) {
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
if (bad) { console.error(`generated with ${bad} DRIFT — do not commit`); process.exit(1); }
console.log(`generated; twin agrees with lib-4i on ${names.length} names, with lib-disclose on ${rows.length} rows, ${loans.length} loan-description names, ${annuityRows.length} annuity-contract rows, ${guarFeeNames.length} guarantee-only fee names, ${investmentContractRows.length} investment-contract rows, ${mistypedStockRows.length} mistyped-employer-stock rows and ${mistypedStockFeeNames.length} mistyped-stock fee names and ${issuerFeeCases.length} issuer-priced fee cases`);
