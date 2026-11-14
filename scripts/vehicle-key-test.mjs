#!/usr/bin/env node
/* wampo — does `vehicleKeyFor` name the right vehicle?
 *
 * It decides which collective trust a filed holding IS, and the page then
 * prints that vehicle's own expense ratio and return. So a wrong answer here
 * is not a missing cell, it is a published fee belonging to a different
 * product — the error this project spends most of its effort refusing.
 *
 * Until now its pins lived inside a measurement script that CI never ran. A
 * gate that is not run is indistinguishable from no gate, so this is the gate.
 *
 * THE MUST-NOT LIST IS THE INTERESTING HALF, and every entry is a REAL filed
 * name that was reached, or nearly reached, by a version of the resolver:
 *
 *   - "T. Rowe Price Retirement 2040 Fund Class I" is the registered MUTUAL
 *     FUND, sold beside the Retirement 2040 Trust. An early version mapped it
 *     onto the trust's key; it published nothing only because that class was
 *     unsourced, which is luck rather than design. One word separates the two
 *     vehicles and the filer writes it.
 *   - "Target Retirement Income and Growth Trust" is a different product whose
 *     name CONTAINS the Income trust's. 17 rows resolved to the wrong key.
 *   - "Vanguard Target Retirement 2050 Trust FLX" is a real class Vanguard
 *     publishes no fee for, so a key would point at nothing.
 *   - "Retirement Blend Select Trust ... Cl 5" is absent from T. Rowe's
 *     brochure; "GGT TRP RETIRE DATE ..." is Great Gray's vehicle, not T.
 *     Rowe's; "TRP RETIREMENT HYB ... TR-114" states a marker the issuer does
 *     not use.
 *   - "Vanguard Institutional TR 2060" ends in a VINTAGE, not a class: the
 *     trailing word boundary is what stops its `2` being read as Trust II.
 *
 * Usage: node scripts/vehicle-key-test.mjs      (exit 1 on any failure)
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : ""; };
const SRC_FILE = arg("--file") || path.join(ROOT, "fund-er.js");
const src = readFileSync(SRC_FILE, "utf8");

const load = (text) => {
  const c = { console: { log() {}, warn() {}, error() {} } };
  vm.createContext(c);
  vm.runInContext(text + "\nglobalThis.__vk = typeof vehicleKeyFor === 'function' ? vehicleKeyFor : null;", c);
  return c.__vk;
};
const vk = load(src);
if (typeof vk !== "function") { console.log("FAIL vehicleKeyFor is not defined in fund-er.js"); process.exit(1); }

let bad = 0;
const fail = (m) => { bad++; console.log(`  FAIL  ${m}`); };
const ok = (m) => console.log(`  ok    ${m}`);

/* [filed name, issuer cell, expected key or null] */
const CASES = [
  /* ---- Vanguard: the class marker in each of its filed shapes ---- */
  ["Vanguard Target Retirement 2020 Fund TR I", "", "vanguard::target-retirement-2020-trust-i"],
  ["Vanguard Target Retirement 2040 Trust Plus", "", "vanguard::target-retirement-2040-trust-plus"],
  ["Vanguard Target Retirement 2035 Trust II", "", "vanguard::target-retirement-2035-trust-ii"],
  ["Vanguard Target Retirement 2030 Trust III", "", "vanguard::target-retirement-2030-trust-iii"],
  ["Vanguard Target Retirement 2065 Trust Select", "", "vanguard::target-retirement-2065-trust-select"],
  ["Target Retirement Income Trust Plus", "Vanguard", "vanguard::target-retirement-income-trust-plus"],
  ["Vanguard Target Retirement Inc Trust Plus", "", "vanguard::target-retirement-income-trust-plus"],
  ["VANGUARD TARGET RET 2070 TR I", "", "vanguard::target-retirement-2070-trust-i"],
  ["Target Retirement 2045 Trust 1", "Vanguard", "vanguard::target-retirement-2045-trust-i"],
  /* ---- T. Rowe Price ---- */
  ["T. Rowe Price Retirement 2030 Trust Class A", "", "t-rowe-price::retirement-2030-trust-class-a"],
  ["Retirement 2035 Trust Class A", "T. Rowe Price", "t-rowe-price::retirement-2035-trust-class-a"],
  ["T Rowe Price Retirement Blend 2035 Trust Class A", "", "t-rowe-price::retirement-blend-2035-trust-class-a"],
  ["TRP Retirement 2040 Trust Cl F", "", "t-rowe-price::retirement-2040-trust-class-f"],
  ["T. Rowe Price Retirement Balanced Trust Class A", "", "t-rowe-price::retirement-balanced-trust-class-a"],

  /* ---- MUST NOT RESOLVE, each for its own reason ---- */
  ["T. Rowe Price Retirement 2040 Fund Class I", "", null],          // the MUTUAL FUND
  /* carried out of the live store by the guard measurement: the filer printed
   * the mutual fund's own TICKER in the name, and without the trust
   * requirement this resolves to the TRUST's key. 567 filed names / 874 rows
   * are in this shape. */
  ["TRVQX - T. Rowe Price 2070 Retirement Class I", "", null],
  ["T. Rowe Price Retirement 2040 Fund", "", null],
  ["T. Rowe Price Retirement Blend Select Trust Cl 5", "", null],    // a different trust
  ["GGT TRP RETIRE DATE 2030 TR R1", "", null],                      // a different TRUSTEE
  ["TRP RETIREMENT HYB 2025 TR-114", "", null],                      // a marker the issuer does not use
  ["T. Rowe Price Retirement Hybrid 2030 Trust Class T5", "", null], // HELD: fee equivalence not stated for Hybrid
  ["T. Rowe Price Target 2030 Trust Class A", "", null],             // the Target line, not Retirement
  ["Vanguard Target Retirement Income and Growth Trust I", "", null],// a DIFFERENT product
  ["Target retirement income growth trust II", "", null],            // ... with no connector
  ["Vanguard Target Retirement Income Trust II and Growth Trust II", "", null],
  ["Vanguard Target Retirement 2050 Trust Flex", "", null],          // real class, no published fee
  /* A NAME STATING TWO VINTAGES NAMES NEITHER — found by a seeded draw, then
   * read as a class: these are two adjacent menu rows WELDED by the parser, so
   * the row's value belongs to one of them and nothing says which. 35 rows. */
  ["Vanguard Target Retirement 2025 Income Trust II Fund", "", null],
  ["Income Trust Plus Vanguard Target Retirement 2020", "", null],
  ["Target Retirement 2035 Income Trust II", "", null],
  /* and the honest Income trust, which must survive that guard */
  ["Vanguard Target Retirement Income Trust II", "", "vanguard::target-retirement-income-trust-ii"],
  ["VANGUARD TARGET RET INC TR I", "", "vanguard::target-retirement-income-trust-i"],
  ["Vanguard Target Retirement 2050 Fund", "", null],                // states no class
  ["Vanguard Target Retirement Trust Plus", "The Vanguard Group, Inc.", null], // no vintage; `Inc.` must not supply one
  ["Vanguard Institutional TR 2060", "", null],                      // `TR 2060` is a vintage, not a class
  ["Fidelity Freedom 2030 Trust Class K", "", null],                 // a house with no adapter
];

for (const [n, iss, want] of CASES) {
  const got = vk(n, iss);
  if (got === want) continue;
  fail(`want ${want === null ? "no key" : want}\n        got  ${got === null ? "no key" : got}\n        for  ${JSON.stringify(n)}${iss ? ` [iss ${JSON.stringify(iss)}]` : ""}`);
}
if (!bad) ok(`${CASES.length} cases: ${CASES.filter((c) => c[2]).length} must-resolve, ${CASES.filter((c) => !c[2]).length} must-not`);

/* EVERY KEY THE RESOLVER CAN PRODUCE MUST EXIST IN THE SOURCED FILE, or the
 * resolver is naming a vehicle nobody priced. This is not a style point: the
 * T. Rowe arm shipped with 185 filed names resolving to keys that did not
 * exist, every one of them a mutual fund wearing a trust's key. */
const VEH = JSON.parse(readFileSync(path.join(ROOT, "data", "fund-facts.json"), "utf8")).vehicles || {};
const missing = CASES.filter(([, , w]) => w).map(([, , w]) => w).filter((k) => !VEH[k]);
if (missing.length) fail(`${missing.length} expected key(s) are absent from data/fund-facts.json: ${missing.slice(0, 4).join(", ")}`);
else ok(`every must-resolve key exists in the sourced file (${Object.keys(VEH).length} vehicles)`);

/* SINGLE-PROTECTION MUTATIONS: each neuters ONE condition and names a case
 * that must change verdict. A mutation that changes nothing is a condition
 * that protects nothing. */
/* ONLY THE TWO GUARDS THAT ARE LOAD-BEARING ON LIVE DATA ARE MUTATED HERE,
 * and that is a measurement rather than a judgement. Each refusal in
 * `vehicleKeyFor` was neutered in turn against all 98,439 distinct (name,
 * issuer) pairs of the two houses, counting the names it and ONLY it refuses:
 *
 *   trp "must say Trust"      567 names /  874 rows   <- mutated below
 *   vanguard growth refusal    44 names /  119 rows   <- mutated below
 *   trp hybrid hold                 0 names
 *   trp select / great-gray         0 names
 *   vanguard FLX refusal            0 names
 *
 * THE THREE ZEROS ARE NOT DEAD CODE AND ARE NOT PRETENDED TO BE LOAD-BEARING.
 * Each is redundant TODAY with the class matcher, which already refuses their
 * cases for a different reason: "Class T5" and "Cl 5" are outside the a-k
 * class range, and "Trust Flex" names no class the matcher knows. Mutating
 * them would print "protects nothing", which is true and useless — *a case
 * protected by two conditions cannot fail for either, so it proves neither*.
 * They stay because the redundancy is the class matcher's and not theirs: the
 * day someone widens that range to cover T-classes, the hybrid hold becomes
 * the only thing standing between a Hybrid row and a fee whose equivalence to
 * an expense ratio nobody has read. The assertion below is the honest one —
 * the refusal holds — and the count above is re-measurable with the same
 * neutering if anyone doubts it. */
const MUTATIONS = [
  ["trp trust requirement", (t) => t.replace('  if (!/\\btrusts?\\b/i.test(n)) return null;\n', ""),
    "T. Rowe Price Retirement 2040 Fund Class I", null],
  ["vanguard growth refusal", (t) => t.replace('  if (vintage === "income" && VG_TRUST_GROWTH.test(n)) return null;', "  // refusal removed"),
    "Vanguard Target Retirement Income and Growth Trust I", null],
  ["vanguard two-vintage refusal", (t) => t.replace("  if (yr && VG_TRUST_TWO_VINTAGE.test(n)) return null;", "  // refusal removed"),
    "Vanguard Target Retirement 2025 Income Trust II Fund", null],
];
/* the redundant three, asserted as REFUSALS rather than as mutations */
for (const [label, n] of [["hybrid hold", "T. Rowe Price Retirement Hybrid 2030 Trust Class T5"],
                          ["select / great gray", "T. Rowe Price Retirement Blend Select Trust Cl 5"],
                          ["FLX", "Vanguard Target Retirement 2050 Trust Flex"]]) {
  if (vk(n, "") !== null) fail(`${label}: ${JSON.stringify(n)} must resolve to nothing`);
}
for (const [label, mutate, name, want] of MUTATIONS) {
  const m = mutate(src);
  if (m === src) { fail(`mutation "${label}" did not change the source — it is malformed`); continue; }
  let mvk;
  try { mvk = load(m); } catch (e) { fail(`mutation "${label}" would not load: ${e.message}`); continue; }
  if (mvk(name, "") === want) fail(`mutation "${label}" still answers ${want} for ${JSON.stringify(name)} — the condition protects nothing`);
}
if (!bad) ok(`${MUTATIONS.length} single-protection mutations, each with a case where it is the only protection`);

console.log(bad ? `\nvehicle-key-test: ${bad} FAILURE(S)` : "\nvehicle-key-test: the resolver names the right vehicle, and refuses the look-alikes");
process.exit(bad ? 1 : 0);
