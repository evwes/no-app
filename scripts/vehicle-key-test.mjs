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
  /* ---- THE CLASSES SOURCED 2026-11-17 THAT NOTHING COULD REACH (2026-11-18)
   * `A`, `CT` and the abbreviated `Sel`. Measured over published+served rows
   * before the widening: Trust A 113 rows / 617,725 readers / $32.8B, Tr Sel
   * 54 rows / 189,879 readers / $11.1B, Trust CT 12 rows / 2,893 readers.
   * The `Tr A` and `Tr Sel` spellings are the live ones, not invented. */
  ["Vanguard Target Retirement 2040 Trust A", "", "vanguard::target-retirement-2040-trust-a"],
  ["VANGUARD TARGET RET 2035 TR A", "", "vanguard::target-retirement-2035-trust-a"],
  ["VANGUARD TARGET RET INC TR A", "", "vanguard::target-retirement-income-trust-a"],
  ["Target Retirement 2050 Trust A of interest", "Vanguard Fiduciary Trust Company", "vanguard::target-retirement-2050-trust-a"],
  ["Vanguard Target Retirement 2040 Trust CT", "", "vanguard::target-retirement-2040-trust-ct"],
  ["Vanguard Target Retirement Income Trust CT", "", "vanguard::target-retirement-income-trust-ct"],
  ["Vanguard Tgt Retire 2045 Tr Sel", "", "vanguard::target-retirement-2045-trust-select"],
  ["MFO VANGUARD TARGET RET 2030 TR SEL CUSIP : 92204E605", "", "vanguard::target-retirement-2030-trust-select"],
  /* ---- INCOME AND GROWTH IS ITS OWN FAMILY NOW, not a refusal (2026-11-18).
   * Six of its unit classes were sourced on 2026-11-17 — A, CT, I, II, Plus,
   * Select — so the resolver can name the product instead of refusing it. These
   * five abbreviations were MUST-NOT entries until today for the right reason
   * at the time (nothing was sourced, so the only available key was the plain
   * Income trust's, which is a different product). */
  ["Vanguard Target Retirement Income and Growth Trust I", "", "vanguard::target-retirement-income-and-growth-trust-i"],
  ["Vanguard Target Retirement Income & Growth Trust II", "", "vanguard::target-retirement-income-and-growth-trust-ii"],
  ["Target retirement income growth trust II", "Vanguard", "vanguard::target-retirement-income-and-growth-trust-ii"],
  ["Vanguard Tgt Ret Inc Gr Tr I", "", "vanguard::target-retirement-income-and-growth-trust-i"],
  ["Vanguard Tgt Retire Inc & Grow Tr I", "", "vanguard::target-retirement-income-and-growth-trust-i"],
  ["Vanguard TGT Ret Inc & Gr Trust I", "", "vanguard::target-retirement-income-and-growth-trust-i"],
  ["Vanguard Tgt Ret Inc Gr Tr II", "", "vanguard::target-retirement-income-and-growth-trust-ii"],
  ["Vanguard Tgt Ret Inc & Grow TrI", "", "vanguard::target-retirement-income-and-growth-trust-i"],
  ["Vanguard Target Retirement Income and Growth Trust A", "", "vanguard::target-retirement-income-and-growth-trust-a"],
  ["Vanguard Tgt Retire Income & Gr Tr Sel", "", "vanguard::target-retirement-income-and-growth-trust-select"],
  /* and the plain Income trust must still be the plain Income trust — the
   * product whose name is a proper PREFIX of the one above */
  ["Vanguard Tgt Retire Inc Tr II", "", "vanguard::target-retirement-income-trust-ii"],
  /* ---- VANGUARD'S INSTITUTIONAL INDEX TRUSTS, a second product line with no
   * vintage at all (2026-11-18). 22 unit classes sourced 2026-11-17, 0 rows
   * published. Every spelling below is live; `Unit Class C`, `UNIT B`,
   * `Unit D Fund` and the OCR-split `M arket` are each a filed shape. */
  ["Vanguard Institutional 500 Index Trust Unit D", "", "vanguard::institutional-500-index-trust-unit-d"],
  ["VANGUARD INST 500 IDX UNIT B", "", "vanguard::institutional-500-index-trust-unit-b"],
  ["Institutional 500 Index Trust Unit Class C", "Vanguard", "vanguard::institutional-500-index-trust-unit-c"],
  ["Vanguard Institutional 500 Index Unit D", "", "vanguard::institutional-500-index-trust-unit-d"],
  ["Vanguard Institutional TTL Stock Market Index Unit B", "", "vanguard::institutional-total-stock-market-index-trust-unit-b"],
  ["Institutional Total Stock Market Index Trust Unit C", "Vanguard", "vanguard::institutional-total-stock-market-index-trust-unit-c"],
  ["Vanguard Instl Extnd Mkt Idx Unit C", "", "vanguard::institutional-extended-market-index-trust-unit-c"],
  ["Vanguard Inst Extended M arket Index Unit D Fund", "", "vanguard::institutional-extended-market-index-trust-unit-d"],
  ["Vanguard Instl Ttl Bond Mkt Idx Unit C", "", "vanguard::institutional-total-bond-market-index-trust-unit-c"],
  ["Institutional Total International Stock Market Index Trust Unit Class C", "Vanguard", "vanguard::institutional-total-international-stock-market-index-trust-unit-c"],
  ["Vanguard Developed Markets Index Trust Fund Unit D", "", "vanguard::developed-markets-index-trust-unit-d"],
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
  /* THE INCOME-AND-GROWTH WELD, which is what is left of that refusal once the
   * product has its own sourced classes (2026-11-18). The loose growth token
   * still refuses; only ADJACENCY assigns. This name is two menu rows glued by
   * the parser, so its value belongs to one of two different products and
   * nothing says which — and the two products' fees are IDENTICAL class for
   * class, so only the return would have carried the error. */
  ["Vanguard Target Retirement Income Trust II and Growth Trust II", "", null],
  ["Target retirement income growth trust II", "", null],            // no Vanguard token anywhere
  /* A BARE TRAILING LETTER AFTER A VINTAGE IS A FOOTNOTE MARKER, NOT A CLASS,
   * and that is measured: 54 names / 71 rows / 23 plans / 128,761 readers carry
   * one, and the same menus repeat it on every vintage. The second case states
   * class PLUS and carries the marker too — the explicit class must win. */
  ["Vanguard Target Retirement 2040 a", "", null],
  ["VANGUARD TARGET RETIRE TRUST PLUS 2035 a", "VANGUARD FIDUCIARY TRUST COMPANY",
    "vanguard::target-retirement-2035-trust-plus"],
  /* AN INDEX TRUST WHOSE LINE IS NOT SOURCED, and whose line word is a bare
   * `Bond`: only the TOTAL bond trust is published, and Vanguard's
   * institutional bond CIT shelf is not one product. 3 rows / 24,127 readers /
   * $125.0M, refused by requiring the `total` token rather than by a list. */
  ["VANGUARD BOND INDEX UNIT D", "", null],
  ["Vanguard Russell 1000 Growth Index Trust Unit A", "", null],      // a line with no published fee
  ["Vanguard Institutional 500 IDX Trust FLX", "", null],             // FLX states no unit class
  ["Vanguard Institutional 500 Index Trust", "", null],               // states no class at all
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
  /* RE-ANCHORED 2026-11-18. This mutation used to delete
   * `if (vintage === "income" && VG_TRUST_GROWTH.test(n)) return null;`, and
   * that line no longer exists — the growth branch now ASSIGNS the Income and
   * Growth family instead of refusing. Neutering the branch's condition makes
   * every Income and Growth row resolve to the plain INCOME trust's key, which
   * is a different product with the same fees and a different return, so the
   * case is "the answer must not be the Income trust's key". */
  ["vanguard growth branch", (t) => t.replace(
    '  if (vintage === "income" && VG_TRUST_GROWTH.test(n)) {',
    "  if (false) {"),
    "Vanguard Target Retirement Income and Growth Trust I",
    "vanguard::target-retirement-income-and-growth-trust-i"],
  /* AND THE ADJACENCY REQUIREMENT, which is the only thing standing between the
   * weld and a published return belonging to one of two products. Without it
   * `... Income Trust II and Growth Trust II` resolves. */
  ["vanguard income-growth adjacency", (t) => t.replace(
    "    if (!VG_TRUST_INCOME_GROWTH.test(n)) return null;", "    // refusal removed"),
    "Vanguard Target Retirement Income Trust II and Growth Trust II", null],
  ["vanguard two-vintage refusal", (t) => t.replace("  if (yr && VG_TRUST_TWO_VINTAGE.test(n)) return null;", "  // refusal removed"),
    "Vanguard Target Retirement 2025 Income Trust II Fund", null],
  /* THE WIDENED GROWTH GUARD, mutated back to the spelled-out-only pattern it
   * had before 2026-11-17. The case is the ABBREVIATION, which is the only
   * thing this widening buys: the mutation above neuters the whole refusal and
   * so cannot tell the narrow pattern from the wide one. */
  ["vanguard growth ABBREVIATION", (t) => t.replace(
    "const VG_TRUST_GROWTH = /\\bgro?w?th\\b|\\bgrow?\\b|\\bgr\\b/i;",
    "const VG_TRUST_GROWTH = /\\bgro?w?th\\b/i;"),
    "Vanguard Tgt Ret Inc Gr Tr I", "vanguard::target-retirement-income-and-growth-trust-i"],
  /* ---- THE INDEX-TRUST ARM'S OWN CONDITIONS (2026-11-18), one case each where
   * the condition named is the ONLY protection. */
  ["index arm needs a stated UNIT class", (t) => t.replace(
    "  const cls = n.match(VG_IDX_UNIT_CLASS);\n  if (!cls) return null;                       /* only a STATED unit class */",
    '  const cls = n.match(VG_IDX_UNIT_CLASS) || ["", "a"];'),
    "Vanguard Institutional 500 Index Trust", null],
  /* the bond line's `total` conjunct, which is what refuses a bare Bond Index
   * — and it is the ONLY thing refusing it, since every other condition passes */
  ["index bond line needs TOTAL", (t) => t.replace(
    '["institutional-total-bond-market-index", /^(?=.*\\bbonds?\\b)(?=.*\\b(?:total|ttl|tot)\\b)/i]',
    '["institutional-total-bond-market-index", /\\bbonds?\\b/i]'),
    "VANGUARD BOND INDEX UNIT D", null],
  /* AND THE LINE ORDER, which is the whole defence against laundering one
   * index's price onto another: Total International Stock Market carries the
   * Total Stock Market line's tokens, so if the international line stops being
   * asked first this row takes the domestic trust's fee and return (YTD 8.02
   * against 9.56). */
  ["index line order: international before total-stock", (t) => t.replace(
    '  ["institutional-total-international-stock-market-index", /\\binternational\\b|\\bintl\\b|\\bint\'l\\b|\\bintrntl\\b/i],\n', ""),
    "Vanguard Institutional Total International Stock Market Index Unit D",
    "vanguard::institutional-total-international-stock-market-index-trust-unit-d"],
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
/* AND TWO MORE JOIN THEM 2026-11-18, both measured INERT on the live store
 * rather than assumed to be load-bearing:
 *
 *  - the index arm's `VG_IDX_INDEX_WORD` requirement refuses **0 of the live
 *    rows**: every Vanguard row carrying a unit class and one of the six line
 *    words also spells `Index` or `Idx`. Mutating it would print "protects
 *    nothing", which is true and useless. It stays because it is the only thing
 *    that keeps a NON-index Vanguard trust sold in unit classes from being
 *    priced off an index trust's sheet the day one is filed.
 *  - the index arm carries NO other-house refusal at all, and that is this
 *    measurement rather than an omission: of the live rows the arm can reach,
 *    **0** also name BlackRock, State Street, Northern Trust, Fidelity, T. Rowe,
 *    Schwab, PIMCO, Invesco, TIAA, JPMorgan or Dimensional, after the custodian
 *    phrase is stripped. Schwab's arm needs such a refusal because `Charles
 *    Schwab Trust Bank` is a RECORDKEEPER for every house's funds; Vanguard's
 *    issuer cells here name Vanguard entities. A guard with a measured blocking
 *    population of zero would also have cost the legitimate rows filed as
 *    `Fidelity Management Trust Company - Vanguard …`. */
for (const [label, n] of [["schwab other-house", "VGD TARGET RET INCOME GROWTH I"],
                          ["hybrid hold", "T. Rowe Price Retirement Hybrid 2030 Trust Class T5"],
                          ["select / great gray", "T. Rowe Price Retirement Blend Select Trust Cl 5"],
                          ["FLX", "Vanguard Target Retirement 2050 Trust Flex"],
                          ["index arm needs the word Index", "Vanguard Institutional 500 Unit D"],
                          ["index arm, Trust FLX", "Vanguard Extended Market Index Trust FLX"]]) {
  if (vk(n, "") !== null) fail(`${label}: ${JSON.stringify(n)} must resolve to nothing`);
}
/* THE PREMISE IS CHECKED BEFORE THE MUTATION, ADDED 2026-11-18, AND IT CAUGHT A
 * DECORATIVE CONTROL THE SAME MINUTE. The loop below only ever asserted that the
 * MUTANT stops answering `want`; it never asserted that the SHIPPED resolver
 * answers `want` in the first place. Two index-arm mutations written that
 * morning used an issuer-cell spelling, and this loop calls `vk(name, "")` with
 * no issuer — so the unmutated resolver already answered null, the mutant also
 * answered null, and the mutation "passed" while proving nothing. *A control
 * that cannot fail is decorative*, and a mutation whose case the shipped code
 * does not cover cannot fail. */
for (const [label, mutate, name, want] of MUTATIONS) {
  const base = vk(name, "");
  if (base !== want) {
    fail(`mutation "${label}" is VACUOUS: the shipped resolver answers ${base === null ? "no key" : base} for ${JSON.stringify(name)}, not the ${want === null ? "no key" : want} this case is written against`);
    continue;
  }
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
    /* INCOME AND GROWTH GAINS A BAND TOO (2026-11-18), because the resolver now
     * answers a FAMILY for it where it used to refuse the product outright. The
     * band is the sanctioned answer for a row that names the trust and not the
     * unit class — six classes are sourced, so the range is over named,
     * published figures. */
    ["Vanguard Target Retirement Income and Growth Trust", "", "vanguard::target-retirement-income-and-growth"],
    ["VANGUARD TARGET RETIREMENT INCOME AND GROWTH TRUST", "", "vanguard::target-retirement-income-and-growth"],
    /* and a stated class on the SAME product still beats the range */
    ["Vanguard Target Retirement Income and Growth Trust Select", "", null],
    /* AN INDEX TRUST NEVER BANDS. `vehicleFamilyOfKey` cannot parse a
     * `-trust-unit-x` key, so no band exists for those lines, and the arm
     * deliberately returns no family rather than asking the page for a range
     * that was never built. */
    ["Vanguard Institutional 500 Index Trust", "", null],
    ["Vanguard Institutional Extended Market Index Trust", "", null],
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

/* ---- PIMCO REALPATH BLEND: A TICKER ARM WHOSE SAFETY IS A VEHICLE CLAIM ----
 * These cases live in the VEHICLE test rather than in `fund-er-test.mjs`
 * because the thing that has to hold is not "does the symbol resolve" — it is
 * *which vehicle may be priced at all*. PIMCO publishes a dated fee and return
 * for the registered RealPath Blend mutual funds and **nothing per class for
 * the collective trust** (its 1,405-URL sitemap holds 20 RealPath URLs, all 20
 * `/investments/mutual-fund/`). So the arm must answer a registered row and
 * refuse a pooled one, and the refusal is structural: `fundTickerInfo` consults
 * `FUND_TICKER` only inside `if (!pooled)`.
 *
 * THE TYPE CELL IS PART OF THE ARGUMENT, so it is passed here — a test that
 * asked the name alone could not see the only guarantee that matters. */
{
  const ti = load(src, "fundTickerInfo");
  if (typeof ti !== "function") fail("fundTickerInfo is not defined in fund-er.js");
  else {
    const tk = (n, iss, type) => { const r = ti(`${iss} ${n}`.trim(), type || ""); return r ? r.tk + (r.comparable ? "*" : "") : null; };
    const RP_CASES = [
      /* MUST resolve — a registered class, stated, on a row the filer typed as
       * a mutual fund or left untyped. Every spelling is live. */
      ["PIMCO RealPath Blend 2040 Fund Institutional Class", "", "Mutual fund", "PVPNX"],
      ["PIMCO RealPath Blend 2070 Fund Institutional Class", "", "Mutual fund", "PAJDX"],
      ["PIMCO Realpath Blend 2070 Fund InstitutionalClass", "", "Mutual fund", "PAJDX"],
      ["Pimco Realpath Blend 2060 Fd Inst", "", "Mutual fund", "PRBMX"],
      ["Pimco Realpath Blend 2035 Instl", "", "Mutual fund", "PDGZX"],
      ["RealPath Blend Inc Inst", "", "Mutual fund", "PBRNX"],
      ["RealPath Blend 2065 Inst", "", "Mutual fund", "PBLIX"],
      ["PIMCO RealPath Blend 2040 Fund Class A", "", "Mutual fund", "PVPAX"],
      ["PIMCO RealPath Blend Income Fund Class A", "", "", "PBRAX"],
      /* MUST NOT — and each for its own reason, all six measured or read.
       * The TRUST rows are the whole point: PIMCO publishes no per-class CIT
       * fee, so the registered fund's price must not stand in for it. */
      ["PIMCO REALPATH BLEND 2045 TR", "", "Collective trust", null],
      ["PIMCO RealPath Blend 2050 Collective Trust - Class MM", "", "Collective trust", null],
      ["PIMCO REALPATH BLEND 2065 CTF IGPS", "", "Collective trust", null],
      ["PIMCO Realpath Blend 2040 CT CL MM", "", "Collective trust", null],
      ["REALPATH Blend 2040", "", "Collective trust", null],
      /* AND THE 20 THAT MATTER MOST: a POOLED row that DOES state the
       * registered Institutional class. 20 names / 20 rows / 3 plans / 2,288
       * readers / $18.0M, measured over published+served rows. Every other
       * refusal in this list is satisfied by these names — they carry a house,
       * a family, a vintage and a real class — so the vehicle is the only thing
       * standing between them and a mutual fund's price. A pooled separate
       * account that invests in PVPNX is not PVPNX, and it costs more. */
      ["PIMCO RealPath Blend 2060 Inst", "", "Pooled separate account", null],
      ["PIMCO RealPath Blend 2045 Institutional", "", "Pooled separate account", null],
      ["PIMCO RealPath Blend 2035 Fund Inst. Class", "", "Collective trust", null],
      ["PIMCO RealPath Blend Income Fund Inst. Class", "", "Collective trust", null],
      /* ...and the SAME NAME typed as a registered fund resolves, which is what
       * proves the type cell is doing the work rather than the name */
      ["PIMCO RealPath Blend 2060 Inst", "", "Mutual fund", "PRBMX"],
      /* ...and the registered rows that still may not be priced */
      ["PIMCO Realpath Blend 2040", "", "Mutual fund", null],          // states no class
      ["PIMCO RealPath Blend 2035", "", "Mutual fund", null],
      ["PIMCO RealPath Blend 2025 INST", "", "Mutual fund", null],     // a vintage nobody sourced
      ["PIMCO RealPath Bld 2025 Ins Fd", "", "Mutual fund", null],
      ["PIMCO REALPATH BLD 2065 INS FD", "", "Mutual fund", null],     // `Ins` is a guess, not `Inst`
      ["PIMCO REALPATH® Blend Completion Fund", "", "Collective trust", null],  // no vintage
      ["PIMCO RealPath Blend 2040 Institutional Class A", "", "Mutual fund", null], // two classes
      ["PIMCO RealPath Blend 2040 Income Institutional", "", "Mutual fund", null],  // two vintages
      /* the look-alike that must keep its own answer: a DIFFERENT PIMCO fund
       * whose name the arm must not reach, and which resolved before today */
      ["PIMCO Income Fund Institutional Class", "", "Mutual fund", "PIMIX"],
      ["PIMCO Total Return Fund Institutional Class", "", "Mutual fund", "PTTRX"],
    ];
    for (const [n, iss, type, want] of RP_CASES) {
      const got = tk(n, iss, type);
      if (got === want) continue;
      fail(`realpath: want ${want === null ? "no ticker" : want}\n        got  ${got === null ? "no ticker" : got}\n        for  ${JSON.stringify(n)} [type ${JSON.stringify(type)}]`);
    }
    if (!bad) ok(`${RP_CASES.length} RealPath cases: ${RP_CASES.filter((c) => c[3]).length} must-resolve, ${RP_CASES.filter((c) => !c[3]).length} must-not`);

    /* EVERY TICKER THE ARM CAN PRODUCE MUST BE SOURCED, or the symbol reaches a
     * reader with no fee and no return behind it — the same assertion the
     * vehicle keys get above, for the same reason. */
    const FUNDS = JSON.parse(readFileSync(path.join(ROOT, "data", "fund-facts.json"), "utf8")).funds || {};
    const absent = RP_CASES.filter(([, , , w]) => w).map(([, , , w]) => w).filter((t) => !FUNDS[t]);
    if (absent.length) fail(`${absent.length} RealPath ticker(s) are absent from data/fund-facts.json: ${absent.join(", ")}`);
    else ok("every RealPath ticker the arm answers is sourced");

    /* SINGLE-PROTECTION MUTATIONS, derived from the refusals above. */
    const RP_MUTATIONS = [
      /* THE PLACEMENT ITSELF. Moving the rows into the pooled branch's table is
       * the one change that would publish a mutual fund's fee on a collective
       * trust, and nothing else in the file stops it. */
      ["realpath rows reach a POOLED row", (t) => t.replace(
        "  for (const [re, pair] of FUND_COMPARABLE) if (hit(re)) return { tk: pair[0], comparable: true, er: pair[1] };\n  return null;\n}",
        "  for (const [re, pair] of FUND_COMPARABLE) if (hit(re)) return { tk: pair[0], comparable: true, er: pair[1] };\n  for (const [re, t2] of rpBlendRows()) if (hit(re)) return { tk: t2, comparable: true };\n  return null;\n}"),
        "PIMCO RealPath Blend 2060 Inst", "Pooled separate account", null],
      /* the class requirement: without it a classless name takes whichever
       * class the table lists first, a factor of 2.2 on the fee */
      ["realpath needs a stated class", (t) => t.replace(
        "const rpRe = (v, cls) => new RegExp(\n  `^${RP_HOUSE}(?=.*${rpVintageToken(v)}.*(?:${cls}))`, \"i\");",
        "const rpRe = (v) => new RegExp(`^${RP_HOUSE}(?=.*${rpVintageToken(v)})`, \"i\");"),
        "PIMCO Realpath Blend 2040", "Mutual fund", null],
      /* THE CLASS MUST FOLLOW THE VINTAGE, which is what refuses the three
       * filed WELDS whose class token belongs to a different fund. Mutating the
       * ordering back to two independent lookaheads must make the weld resolve. */
      ["realpath class must follow the vintage", (t) => t.replace(
        "`^${RP_HOUSE}(?=.*${rpVintageToken(v)}.*(?:${cls}))`",
        "`^${RP_HOUSE}(?=.*${rpVintageToken(v)})(?=.*(?:${cls}))`"),
        "Opportunities Fund Institutional Shares PIMCO RealPath Blend 2040 Fund", "Mutual fund", null],
      /* the two-claims veto, whose cases nothing else refuses */
      ["realpath two-claims veto", (t) => t.replace(
        "  if (hit(RP_FAMILY_RE) && [name, ...vs].some(rpTwoClaims)) return null;", "  // veto removed"),
        "PIMCO RealPath Blend 2040 Institutional Class A", "Mutual fund", null],
    ];
    for (const [label, mutate, n, type, want] of RP_MUTATIONS) {
      const base = tk(n, "", type);
      if (base !== want) { fail(`realpath mutation "${label}" is VACUOUS: the shipped resolver answers ${base} for ${JSON.stringify(n)}`); continue; }
      const m = mutate(src);
      if (m === src) { fail(`realpath mutation "${label}" did not change the source — it is malformed`); continue; }
      let mti;
      try { mti = load(m, "fundTickerInfo"); } catch (e) { fail(`realpath mutation "${label}" would not load: ${e.message}`); continue; }
      const r = mti(n, type);
      if ((r ? r.tk : null) === want) fail(`realpath mutation "${label}" still answers ${want} for ${JSON.stringify(n)} — the condition protects nothing`);
    }
    if (!bad) ok(`${RP_MUTATIONS.length} RealPath mutations, each with a case where it is the only protection`);
  }
}

console.log(bad ? `\nvehicle-key-test: ${bad} FAILURE(S)` : "\nvehicle-key-test: the resolver names the right vehicle, and refuses the look-alikes");
process.exit(bad ? 1 : 0);
