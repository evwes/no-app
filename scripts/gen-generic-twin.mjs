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
import { isNamelessFundRow, isLoanDescriptionRow } from "./lib-disclose.mjs";

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
`;

/* THE END MARKER MUST BE THE BLOCK'S LAST LINE. It was `__wampoGenericName`
 * while the block still ended there; when `isNamelessFundRow` was appended the
 * in-place replace cut at the old marker and left the previous tail in the
 * file, so two declarations of one function coexisted and the STALE one won by
 * hoisting order — invisible to the tether, because the stale copy assigned
 * the same window hook. A generator that edits in place is only as honest as
 * its end marker. */
const MARK_S = "  /* GENERATED FROM scripts/lib-4i.mjs — DO NOT EDIT BY HAND.";
const MARK_E = "  window.__wampoLoanDescRow = isLoanDescriptionRow;  // read by the smoke test only\n";
/* the PREVIOUS end marker, so a block written before the loan rule was
 * appended is still found whole and replaced rather than left behind. The
 * stale-duplicate failure this file records happened exactly because the
 * marker moved and the old tail stayed. */
const MARK_E_PREV = "  window.__wampoNamelessRow = isNamelessFundRow;  // read by the smoke test only\n";
const app = readFileSync(ROOT + "app.js", "utf8");
let out;
if (app.includes(MARK_S)) {
  const a = app.indexOf(MARK_S);
  let b = app.indexOf(MARK_E, a);
  b = b < 0 ? app.indexOf(MARK_E_PREV, a) + MARK_E_PREV.length : b + MARK_E.length;
  if (b < Math.min(MARK_E.length, MARK_E_PREV.length)) throw new Error("gen-generic-twin: start marker found but no end marker (current or previous) — refusing to write a truncated block");
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
const ctx = {}; vm.createContext(ctx);
vm.runInContext(block
  .replace("window.__wampoGenericName = isGenericName;  // read by the smoke test only", "globalThis.__g = isGenericName;")
  .replace("window.__wampoNamelessRow = isNamelessFundRow;  // read by the smoke test only", "globalThis.__n = isNamelessFundRow;")
  .replace("window.__wampoLoanDescRow = isLoanDescriptionRow;  // read by the smoke test only", "globalThis.__l = isLoanDescriptionRow;")
  .replace(/^\s{2}/gm, ""), ctx);
const names = ["Mutual funds", "Mutual Fund Shares", "Sub-total: Registered Investment Companies",
  "Commingled funds", "Pooled separate account funds", "Collective trust funds",
  /* v189 kerned arm */ "M utual Fund", "Regi s tered i nves tment compa ni es",
  "Colle ctive Trust", "Registered Investm ent Com pany", "Group Annuity C ontrac t",
  /* must stay real */ "Fidelity 500 Index Fund", "AMERICAN FUNDS BLANC MUTUAL FUND",
  "Mutual of America MUTUAL FUND", "Separate Account A, at fair value", "Not Required"];
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
let bad = 0;
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
console.log(`generated; twin agrees with lib-4i on ${names.length} names, with lib-disclose on ${rows.length} rows and ${loans.length} loan-description names`);
