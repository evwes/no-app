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
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : ""; };
const SRC_FILE = arg("--file") || path.join(ROOT, "fund-er.js");
const src = readFileSync(SRC_FILE, "utf8");

/* `which` defaults to vehicleKeyFor so every call written before the band
 * existed keeps its meaning; the band block asks for vehicleFamilyKeyFor. A
 * name the file does not define comes back null, and calling null throws
 * loudly here rather than reading as a clean "no band". */
const load = (text, which) => {
  const fn = which || "vehicleKeyFor";
  const c = { console: { log() {}, warn() {}, error() {} }, window: {} };
  vm.createContext(c);
  vm.runInContext(text + `\nglobalThis.__fn = typeof ${fn} === 'function' ? ${fn} : null;`, c);
  return c.__fn;
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
  /* ---- the family word ABBREVIATED, MISSPELLED or ABSENT (2026-11-17) ----
   * 509 rows / 91 menus / 722,574 readers / $15.4B resolved nothing because
   * the family gate demanded `target` spelled in full and adjacent to the
   * retirement word. All 121 newly reached spellings were read; these are the
   * distinct shapes among them. */
  ["Vanguard Tgt Retire 2055 Tr I", "", "vanguard::target-retirement-2055-trust-i"],
  ["Vanguard Tgt Retire Inc Tr II", "", "vanguard::target-retirement-income-trust-ii"],
  ["VANGUARD RET INCOME TRUST II", "", "vanguard::target-retirement-income-trust-ii"],
  ["Retirement 2040 Trust II", "Vanguard", "vanguard::target-retirement-2040-trust-ii"],
  ["Vanguard Tar Ret 2070 Tr Plus", "", "vanguard::target-retirement-2070-trust-plus"],
  ["Vanguard Targel Retirement 2030 II", "", "vanguard::target-retirement-2030-trust-ii"],
  ["Vanguard Tat Retire 2060 Tr II", "", "vanguard::target-retirement-2060-trust-ii"],
  ["Target 2045 Retirement Trust I", "Vanguard", "vanguard::target-retirement-2045-trust-i"],
  ["VANGUARD FIDUCIARY TR CO RETIREMENT 2055 TR I", "", "vanguard::target-retirement-2055-trust-i"],
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
  /* ... AND ABBREVIATED, which the spelled-out guard could not see. These
   * five were reached by relaxing the family gate and every one would have
   * published the plain INCOME trust's fee and return on an Income AND GROWTH
   * holding: `\bgro?w?th\b` requires the letters `th`, so `Gr` and `Grow`
   * walked past it. The guard was written for one phrasing of the word. */
  ["Vanguard Tgt Ret Inc Gr Tr I", "", null],
  ["Vanguard Tgt Retire Inc & Grow Tr I", "", null],
  ["Vanguard TGT Ret Inc & Gr Trust I", "", null],
  ["Vanguard Tgt Ret Inc Gr Tr II", "", null],
  ["Vanguard Tgt Ret Inc & Grow TrI", "", null],
  /* A DIFFERENT VANGUARD PRODUCT WELDED IN FRONT OF A REAL ONE. Vanguard
   * Retirement SAVINGS Trust is a stable-value fund; the parser glued it to a
   * target-date row and the class token `Trust III` is the savings trust's.
   * It published nothing only because Trust III vintages are dormant. */
  ["Savings Trust III Vanguard Tgt Retire 2020", "", null],
  ["VANGUARD RETIREMENT SAVINGS TRUST III", "", null],               // no vintage either
  /* ---- T. ROWE'S INCOME SERIES IS A DIFFERENT PRODUCT FROM THE DATED ONE,
   * and the resolver published the dated one's fee and return on its rows
   * until 2026-11-17. Found by a seeded draw over the band population, then
   * CONFIRMED by reading whole menus: every affected menu carries BOTH rows,
   * as separate line items with different values —
   *
   *   Costco   TRP Ret 2020 Active Trust K        $392,108,000
   *            TRP Ret 2020 Active Trust-Income K   $9,809,000
   *   AARP     Retire 2020 Fund TR B               $45,269,058
   *            Retire 2020 Fund TR Income B           $429,476
   *
   * so they are not one product read two ways. Nothing in the sourced set is
   * a dated T. Rowe income family (only retirement-balanced), so there is no
   * figure to give these rows and the dated series' figure is another
   * product's. 7 rows / 5 menus / 289,425 readers / $14.3M were showing one.
   * The guard refuses a name stating a year AND an income/balanced word,
   * which is the refusal the Vanguard arm has carried since its weld census. */
  ["T. Rowe Price TRP Ret 2020 Active Trust-Income K", "", null],
  ["T. Rowe Price Retire 2025 Fund TR Income B", "", null],
  ["Retirement 2020 Trust Income F", "", null],
  ["TRP RET 2025 TR-INCOME F", "", null],
  ["Balanced Trust Class A T. Rowe Price Retirement 2010", "", null], // two products welded
  /* and the siblings that must SURVIVE it — the plain vintage, and Balanced,
   * whose income-ish word is its ONLY vintage and so states no second one */
  ["T. Rowe Price TRP Ret 2020 Active Trust K", "", "t-rowe-price::retirement-2020-trust-class-k"],
  ["T. Rowe Price Retirement Balanced Trust K", "", "t-rowe-price::retirement-balanced-trust-class-k"],

  /* ---- SCHWAB (2026-11-17) -------------------------------------------------
   * Schwab's own month-end workbook states a fee and a full trailing curve per
   * named unit class; `docs/sources/` carries the owner-supplied copy, and
   * `docs/sources/README.md` says why it is not fetched live. Only SIRT and
   * SMRT are resolved — ITF's one filed appearance states `CL I`, which is not
   * one of its three published class names (Retirement / Institutional /
   * Select), and mapping it would be a guess.
   *
   * The must-resolve spellings are the live ones: `Schwab Idx Ret Trust 2030 I`
   * carries 122,833 readers per vintage across twelve vintages. */
  ["Schwab Idx Ret Trust 2030 I", "", "schwab::sirt-2030-trust-class-i"],
  ["Schwab Idx Ret Trust 2065 I", "", "schwab::sirt-2065-trust-class-i"],
  ["Collective Investment Funds Schwab Idx Ret Trust 2010 I", "", "schwab::sirt-2010-trust-class-i"],
  ["Schwab Managed Retirement Trust 2040 Class IV", "", "schwab::smrt-2040-trust-class-iv"],
  /* MUST NOT — the same house's REGISTERED products, at different prices. Both
   * are in the store and both would be priced from a trust's workbook. They are
   * refused by construction: the family word (Idx / Indexed / SIRT / Managed /
   * SMRT) is absent from each, so no deny-list is doing the work. */
  ["SCHWAB TARGET 2045", "", null],
  ["SCHWAB CAPITAL TRUST TARGET 2045", "", null],
  ["SCHWAB INST LCP VAL TRUST CL I", "", null],         // a class ITF does not have
  ["Schwab Bank Savings", "Charles Schwab Trust Bank", null],        // a bank deposit
  ["Personal Choice Brokerage Account", "Charles Schwab Trust Bank", null],
  ["SCHWAB TRUST BANK", "", null],                      // the trustee, not a fund
  /* THE LIVE SPELLINGS THE SIZING REGEX MISSED, each carrying real readers:
   * `SCHWAB INDEX RET 2030 IV` (98,459 per vintage) and `Schwab Index Ret Tr Fd
   * 2045 CL IV`, plus the `Mng`/`Mngd` contraction of Managed (12,931). */
  ["SCHWAB INDEX RET 2030 IV", "", "schwab::sirt-2030-trust-class-iv", "Collective trust"],
  ["Schwab Index Ret Tr Fd 2045 CL IV", "Charles Schwab Trust Bank", "schwab::sirt-2045-trust-class-iv", "Collective trust"],
  /* ... and the SAME NAME with NO type cell resolves NOTHING: `Tr Fd` is not
   * the word "Trust", so nothing licenses the trailing class. 5,246 readers
   * sit in that shape; a named gap rather than a silent one. */
  ["Schwab Index Ret Tr Fd 2045 CL IV", "Charles Schwab Trust Bank", null],
  ["Schwab Mngd Ret Trust Income Cl IV", "", "schwab::smrt-income-trust-class-iv"],
  /* SCHWAB IN THE ISSUER CELL IS THE CUSTODIAN. This is a VANGUARD fund held at
   * Schwab Trust Bank, and neutering the line word over all 6,672 live Schwab
   * triples resolved it to `schwab::sirt-income-trust-class-i` — another
   * house's fund wearing Schwab's key. `SCHWAB_NOT_OURS` refuses it on the
   * NAME, so the protection no longer depends on the line word. */
  ["VGD TARGET RET INCOME GROWTH I", "Charles Schwab Trust Bank", null],
  ["Schwab Managed Retirement Trust 2040 Class IV", "", "schwab::smrt-2040-trust-class-iv"],
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

/* A FOURTH ELEMENT CARRIES THE TYPE CELL, because it is part of what the
 * resolver reads and this loop could not express it. `SCHWAB INDEX RET 2030 IV`
 * carries no trust WORD, so the filer's own type cell is the only thing that
 * licenses reading its trailing `IV` as a unit class — exactly as for the T.
 * Rowe arm. Omitting it means "no type stated", which is itself a real case. */
for (const [n, iss, want, type] of CASES) {
  const got = vk(n, iss, type);
  if (got === want) continue;
  fail(`want ${want === null ? "no key" : want}\n        got  ${got === null ? "no key" : got}\n        for  ${JSON.stringify(n)}${iss ? ` [iss ${JSON.stringify(iss)}]` : ""}${type ? ` [type ${JSON.stringify(type)}]` : ""}`);
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
  /* ANCHORED ON THE LINE AS IT NOW STANDS. This mutation was written against
   * `if (!/\btrusts?\b/i.test(n)) return null;` and that line was rewritten
   * when the filer's TYPE cell was threaded in, so the replace stopped
   * matching and the test began reporting "malformed" — a RED gate, which is a
   * gate that stopped rather than a gate that passed. The lesson is the one
   * already on the record: anchor a mutation on the line it is meant to
   * mutate, and a mutation that silently stops applying is indistinguishable
   * from a condition that protects nothing. The test's own
   * "did not change the source" branch is what caught it. */
  ["trp trust requirement", (t) => t.replace(
    '  if (!TRP_TRUST_WORD.test(n) && !VEHICLE_TYPE_IS_TRUST.test(String(type || ""))) return null;',
    "  // refusal removed"),
    "T. Rowe Price Retirement 2040 Fund Class I", null],
  ["vanguard growth refusal", (t) => t.replace('  if (vintage === "income" && VG_TRUST_GROWTH.test(n)) return null;', "  // refusal removed"),
    "Vanguard Target Retirement Income and Growth Trust I", null],
  ["vanguard two-vintage refusal", (t) => t.replace("  if (yr && VG_TRUST_TWO_VINTAGE.test(n)) return null;", "  // refusal removed"),
    "Vanguard Target Retirement 2025 Income Trust II Fund", null],
  /* THE WIDENED GROWTH GUARD, mutated back to the spelled-out-only pattern it
   * had before 2026-11-17. The case is the ABBREVIATION, which is the only
   * thing this widening buys: the mutation above neuters the whole refusal and
   * so cannot tell the narrow pattern from the wide one. */
  ["vanguard growth ABBREVIATION", (t) => t.replace(
    "const VG_TRUST_GROWTH = /\\bgro?w?th\\b|\\bgrow?\\b|\\bgr\\b/i;",
    "const VG_TRUST_GROWTH = /\\bgro?w?th\\b/i;"),
    "Vanguard Tgt Ret Inc Gr Tr I", null],
  /* and the other-product refusal, whose case the class matcher does NOT also
   * refuse — `Trust III` is a class the matcher knows, so without this line
   * the weld resolves to a real 2020 key. */
  ["vanguard other-product refusal", (t) => t.replace("  if (VG_TRUST_OTHER_PRODUCT.test(n)) return null;", "  // refusal removed"),
    "Savings Trust III Vanguard Tgt Retire 2020", null],
  /* T. Rowe's own two-vintage refusal, whose case the Vanguard one cannot
   * cover: they are separate lines in separate arms. */
    ["trp two-vintage refusal", (t) => t.replace(
    '  if (yr && /\\bincome\\b|\\bbalanced\\b/i.test(n)) return null;', "  // refusal removed"),
    "T. Rowe Price TRP Ret 2020 Active Trust-Income K", null],
];
/* the redundant three, asserted as REFUSALS rather than as mutations */
/* SCHWAB'S OTHER-HOUSE REFUSAL IS REDUNDANT TODAY AND SAYS SO. Its motivating
 * row is `VGD TARGET RET INCOME GROWTH I` — a VANGUARD fund held at Charles
 * Schwab Trust Bank, which reaches the Schwab arm at all because the house test
 * reads the ISSUER CELL and that cell names the CUSTODIAN. Neutering the LINE
 * WORD over all 6,672 live Schwab triples resolved it to
 * `schwab::sirt-income-trust-class-i` — another house's fund on Schwab's key.
 *
 * With both conditions present the line word already blocks it, so mutating
 * `SCHWAB_NOT_OURS` alone changes nothing and prints "protects nothing". That
 * is true, and the reason it is asserted here rather than mutated. It stays
 * because the redundancy belongs to the LINE WORD, not to it: the line word was
 * widened to accept `Mng`/`Mngd` in this same commit, and every such widening
 * is a fresh chance for another house's name to carry a token this arm reads. */
for (const [label, n] of [["schwab other-house", "VGD TARGET RET INCOME GROWTH I"],
                          ["hybrid hold", "T. Rowe Price Retirement Hybrid 2030 Trust Class T5"],
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

/* ---- THE FEE/RETURN BAND ------------------------------------------------
 * `vehicleFamilyKeyFor` answers a FAMILY for a row that names the trust and
 * not the unit class, and the page prints a RANGE across that family's
 * published classes. It is a published claim, so it gets the same treatment
 * as the class keys above.
 *
 * THE MUST-NOT LIST IS AGAIN THE INTERESTING HALF, and all three refusals
 * were measured over live rows rather than imagined:
 *   - the trust word belongs to the CUSTODIAN ("Vanguard Fiduciary Trust
 *     Company ... 2045 Fund"), which says nothing about the vehicle: 156 rows.
 *   - the name states a CLASS, so an exact figure outranks any range.
 *   - the name's vehicle word is "Fund", which is the registered mutual
 *     fund's own name on a row whose type cell says trust. Nothing says which
 *     cell is wrong, so neither figure may be published.
 */
{
  const famKey = load(src, "vehicleFamilyKeyFor");
  const BANDS = (() => {
    const f = path.join(ROOT, "fund-facts.js");
    if (!existsSync(f)) return null;
    const c = vm.createContext({ window: {} });
    vm.runInContext(readFileSync(f, "utf8") + ";globalThis.__b=typeof FUND_VEHICLE_BANDS===\"object\"?FUND_VEHICLE_BANDS:null;", c);
    return c.__b;
  })();
  const BAND_CASES = [
    ["T. Rowe Price Retirement 2050 Trust", "", "t-rowe-price::retirement-2050"],
    ["Vanguard Target Retirement Income Trust", "", "vanguard::target-retirement-income"],
    ["Retirement 2040 Active Trust", "T. Rowe Price Trust Company", "t-rowe-price::retirement-2040"],
    ["T Rowe Price Retirement Blend 2035 Trust", "", "t-rowe-price::retirement-blend-2035"],
    /* MUST NOT BAND */
    ["Vanguard Fiduciary Trust Company Vanguard Target Retirement 2045 Fund", "", null],
    ["Fidelity Management Trust Company Vanguard Target Retirement 2030 Fund", "", null],
    ["Empower Trust Company, LLC - Vanguard Target Retirement 2040", "", null],
    ["Vanguard Target Retirement 2050 Fund", "", null],
    ["Vanguard Target Retirement 2040 Trust II", "", null],   // states a class: exact wins
    ["T. Rowe Price Retirement 2040 Trust Class A", "", null],// ditto
    ["T. Rowe Price Retirement Hybrid 2030 Trust", "", null], // the held line
    ["Schwab Indexed Retirement Trust Fund 2030", "", "schwab::sirt-2030"],
    ["Collective Trust - Schwab Managed Retirement Trust 2040", "", "schwab::smrt-2040"],
    ["SCHWAB TARGET 2045", "", null],                        // the registered fund
    ["VGD TARGET RET INCOME GROWTH I", "Charles Schwab Trust Bank", null],
    ["T. Rowe Price Retire 2025 Trust Income Fund", "", null],// two vintages
    ["Fidelity Freedom 2030 Trust", "", null],                // a house with no adapter
  ];
  for (const [n, iss, want] of BAND_CASES) {
    const got = famKey(n, iss, "Collective trust");
    if (got === want) continue;
    fail(`band: want ${want === null ? "no band" : want}\n        got  ${got === null ? "no band" : got}\n        for  ${JSON.stringify(n)}${iss ? ` [iss ${JSON.stringify(iss)}]` : ""}`);
  }
  if (!bad) ok(`${BAND_CASES.length} band cases: ${BAND_CASES.filter((c) => c[2]).length} must-band, ${BAND_CASES.filter((c) => !c[2]).length} must-not`);

  /* EVERY FAMILY THE RESOLVER CAN ANSWER MUST HAVE A BAND, or the page asks
   * for a range nobody published and silently shows nothing. */
  if (BANDS) {
    const missing = BAND_CASES.filter(([, , w]) => w).map(([, , w]) => w).filter((k) => !BANDS[k]);
    if (missing.length) fail(`${missing.length} expected band(s) absent from fund-facts.js: ${missing.join(", ")}`);
    else ok(`every must-band family has a published band (${Object.keys(BANDS).length} families)`);
    /* and NO band may exist for the held Hybrid line, by any route */
    const hyb = Object.keys(BANDS).filter((k) => /hybrid/.test(k));
    if (hyb.length) fail(`${hyb.length} Hybrid band(s) published though the line is held: ${hyb.slice(0, 3).join(", ")}`);
    else ok("no Hybrid band is published, so the held line cannot be reached through a range");
  }

  /* SINGLE-PROTECTION MUTATIONS for the band's own conditions. */
  const BAND_MUTATIONS = [
    ["custodian strip", (t) => t.replace("n.replace(VEHICLE_CUSTODIAN_PHRASE, \" \")", "n"),
      "Vanguard Fiduciary Trust Company Vanguard Target Retirement 2045 Fund"],
    ["name must say trust", (t) => t.replace(
      "  if (!VEHICLE_NAME_SAYS_TRUST.test(n.replace(VEHICLE_CUSTODIAN_PHRASE, \" \"))) return null;", "  // refusal removed"),
      "Vanguard Target Retirement 2050 Fund"],
    ["a stated class beats a band", (t) => t.replace("if (!p || p.classStated || p.key) return null;", "if (!p) return null;"),
      "Vanguard Target Retirement 2040 Trust II"],
  ];
  for (const [label, mutate, name] of BAND_MUTATIONS) {
    const m = mutate(src);
    if (m === src) { fail(`band mutation "${label}" did not change the source — it is malformed`); continue; }
    let mf;
    try { mf = load(m, "vehicleFamilyKeyFor"); } catch (e) { fail(`band mutation "${label}" would not load: ${e.message}`); continue; }
    if (mf(name, "", "Collective trust") === null) fail(`band mutation "${label}" still refuses ${JSON.stringify(name)} — the condition protects nothing`);
  }
  if (!bad) ok(`${BAND_MUTATIONS.length} band mutations, each with a case where it is the only protection`);
}

console.log(bad ? `\nvehicle-key-test: ${bad} FAILURE(S)` : "\nvehicle-key-test: the resolver names the right vehicle, and refuses the look-alikes");
process.exit(bad ? 1 : 0);
