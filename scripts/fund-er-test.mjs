#!/usr/bin/env node
/* wampo — fixtures for fund-er.js name matching, BOTH directions.
 *
 * WHY THIS EXISTS. fund-er.js is the only expense-ratio source on the site, so
 * a filed name that fails to match is a blank fee cell — and a filed name that
 * matches the WRONG fund is a fabricated number on a live page. Those two
 * failures pull in opposite directions: every loosening that fills a blank can
 * also attach a wrong ticker. So every widening of the matcher is pinned here
 * by a pair — a name that must now resolve, and a name that must still not.
 *
 * The decoys are not hypothetical. Each one was produced by a rewrite rule
 * under test and rejected:
 *   "OAKMARK INTL SM CAP INST"  a half-expanded name satisfied
 *                               /oakmark international(?!\s+small)/ and claimed
 *                               OAKIX, which is a different fund
 *   "Fid Adv Ttl Bd Inst"       reached /fidelity.*total bond/ past a guard
 *                               written against the spelled-out word "advisor"
 *   "PUTNAM STABLE VALUE FUND 25"  the documented by-design miss, kept as the
 *                               control that by-design misses stay missing
 *
 * Usage: node scripts/fund-er-test.mjs [--src <git-ref>]
 * Exit 1 on any failure. Run by site-test.yml on every frontend push.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SRC = arg("--src", "");
// --file exists so a deliberately BROKEN copy can be run through these
// fixtures: a check that has only ever been seen passing has not been tested.
const FILE = arg("--file", "");
const src = SRC
  ? execFileSync("git", ["show", SRC + ":fund-er.js"], { cwd: root, encoding: "utf8" })
  : fs.readFileSync(FILE || path.join(root, "fund-er.js"), "utf8");
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(src + "\nglobalThis.__t = fundTickerInfo;"
  + "\nglobalThis.__v = typeof expandFundVariants === 'function' ? expandFundVariants : null;"
  + "\nglobalThis.__e = fundER;", ctx);
const tk = (n, type) => { const r = ctx.__t(n, type || ""); return r ? r.tk + (r.comparable ? "*" : "") : ""; };

/* MUST RESOLVE, and to exactly this ticker. A wrong ticker here is worse than
 * a blank, so the expectation is the symbol, never "something". */
const MUST = [
  ["MFS VALUE R6", "MEIKX"],                       // bare share class, no noun
  ["MFS Val R6", "MEIKX"],
  ["FIDELITY MID CP INDEX FUND", "FSMDX"],         // CP -> Cap
  ["T ROWE PRICE BLUE CP GR INV GM", "TRBCX"],     // CP -> Chip, trailing marker
  ["T ROWE PRICE BLUE CHP GRTH INV", "TRBCX"],
  ["PIMCO Income Fund Institutional Class", "PIMIX"],  // filler noun mid-name
  ["Vanguard Tgt Rmt Inc Inv Fund", "VTINX"],      // Retirement Inc -> Income
  ["Vanguard Ttl Bd Mkt Idx Adm", "VBTLX"],
  ["Vanguard Ttl Intl Stk Idx Adm", "VTIAX"],
  ["Fid 500 Indx", "FXAIX"],
  ["Fid US Bd Indx", "FXNAX"],
  ["Baird Aggr Bond Inst", "BAGIX"],
  ["Metropolitan West Ttl Rtn Bd I", "MWTIX"],
  ["Vanguard Target Retirement Fund 2045", "VTIVX"],
  // cross-family control: a Vanguard name must reach the VANGUARD fund
  ["Vanguard Mid Cp Idx Instl Fund", "VIMAX"],
  ["Fidelity Sm Cp Index Fund", "FSSNX"],
  // the institutional TRP small-cap fund is TRSSX, not the retail OTCFX
  ["T. Rowe Price Instl Small Cap Stock", "TRSSX"],
  // 2026-09-17, owner-sent Ocala Breeders page: plain "Van" was never expanded
  ["Van Target Retire 2030", "VTHRX"],
  ["Van Targ Retire 2040", "VFORX"],
  ["Van Target Retire Inc", "VTINX"],
  // 2026-09-17, second pass over the same page: funds the table never
  // carried at all. "Vanguard Value Index Adm" moves here from MUST_NOT
  // below — it was a documented gap, now a verified fund.
  ["Vang Equity Inc Adm", "VEIRX"],
  ["Vanguard Equity Income Fund Admiral Shares", "VEIRX"],
  ["Vang Tot Bd Mkt Adm", "VBTLX"],                // no "Index" in the filed name
  ["Vang Hi Yld Corp Adm", "VWEAX"],
  ["Van Infl Protected Sec - Admr", "VAIPX"],      // "Admr" tail, not "Adm"
  ["Vang Infl Prot Adm", "VAIPX"],                 // no "Securities" at all
  ["Vang Tot Intl Stk Ad", "VTIAX"],               // bare "Ad" tail, no Index
  ["Van Real Est Idx Adm", "VGSLX"],
  ["Vanguard Value Index Adm", "VVIAX"],
  ["Vang Growth Idx Adm", "VIGAX"],
  ["Vang Em Stk Idx Adm", "VEMAX"],
  ["Van LifeStrat Conserv Gr - Inv", "VSCGX"],
  ["Vang LifeStrategy Income Inv", "VASIX"],
  ["Van LifeStrat Mod Growth - Inv", "VSMGX"],
  ["Vang LifeStrategy Growth Inv", "VASGX"],
  ["Vang Smcpvl Idx Adm", "VSIAX"],                 // glued token, no word boundary
  ["Vang Mdcpval Idx Adm", "VMVAX"],
  ["Vang Mdcpgr Idx Adm", "VMGMX"],
  ["Vang Smcp Gr Idx Adm", "VSGAX"],
  ["Vang Dev Mkt Idx Adm", "VTMGX"],
  ["Vang Intm Bd Idx Adm", "VBILX"],
  ["Van Ftse Soc Idx Adm", "VFTAX"],
  ["Van Total Wld Stock Idx- Admir", "VTWAX"],      // "Admir" tail, not "Adm"
  ["Vang Intl Growth Adm", "VWILX"],
  ["Vang Treasury Mm", "VUSXX"],
  ["Vang Vmmr-Fed Mmkt", "VMFXX"],                  // recordkeeper-feed prefix stripped
];

/* MUST NOT RESOLVE. A blank is the honest answer for all of these. */
const MUST_NOT = [
  "VanEck CM Commodity Index I",                   // "Van" -> Vanguard must not reach a Vanguard fund
  "Van Eck International Investors Gold",
  "PUTNAM STABLE VALUE FUND 25",
  "LOAN FUND",
  "PENDING SETTLEMENT FUND",
  "TIAA REAL ESTATE",
  "VOYA FIXED ACCOUNT",
  "BLF FEDFUND",
  "OAKMARK INTL SM CAP INST",        // Oakmark International SMALL CAP != OAKIX
  "Oakmark International Small Cap Institutional",
  "Fid Adv Ttl Bd Inst",             // Fidelity ADVISOR Total Bond != FTBFX
  "Fidelity Advisor Total Bond Z",
  "LVIP SSGA S&P 500 Index",         // wrapper: the fee is the wrapper's
  "MM S&P 500 Index Fd(Northern Trust)",
  // funds the table does not carry: a blank says "not yet verified", and a
  // guess here would be an invented ticker
  "AMERICAN FUNDS NEW WORLD R6",
  "Vanguard Growth Index Fund",             // no class stated: never invent one
  "Interest Bearing Cash",
  // 2026-09-17 second pass: class-explicit guards on the new rows above
  "Vanguard Equity Income Fund Investor Shares",   // Investor, not Admiral: VEIPX, unverified here
  "Vanguard Value Index Fund",                     // no class stated
  "Vanguard Inflation-Protected Securities Fund Investor Shares", // Investor: VIPSX, unverified
  "Vanguard Total Bond Market II Index Fund",      // a DIFFERENT fund, guarded by the "ii" lookahead
  "Vanguard Mid-Cap Growth Fund",                  // ACTIVE fund (VMGRX), not the Index one
  "Vanguard High-Yield Tax-Exempt Fund Admiral Shares", // different bond fund, no "corp"
  "Vanguard Emerging Markets Bond Fund Admiral Shares", // different fund, no "stock index"
  "Vanguard Real Estate Index Institutional",      // Institutional class not verified here
  "Vanguard LifeStrategy 60/40",                   // numeric form, not filed in this population
];

/* Variant generation must stay a RESPELLING: bounded, and never dropping the
 * manager. A rule that rewrites a house name would show up here first. */
const VARIANT_BOUND = 8;

let fail = 0;
for (const [name, want] of MUST) {
  const got = tk(name);
  if (got !== want) { console.log(`FAIL want ${want.padEnd(7)} got ${(got || "(none)").padEnd(7)} ${JSON.stringify(name)}`); fail++; }
}
for (const name of MUST_NOT) {
  const got = tk(name);
  if (got) { console.log(`FAIL want (none)  got ${got.padEnd(7)} ${JSON.stringify(name)}`); fail++; }
}
if (ctx.__v) {
  for (const [name] of MUST) {
    const vs = ctx.__v(name);
    if (vs.length > VARIANT_BOUND) { console.log(`FAIL ${vs.length} variants (>${VARIANT_BOUND}) for ${JSON.stringify(name)}`); fail++; }
    const house = (name.match(/^[A-Za-z.&]+/) || [""])[0].slice(0, 3).toLowerCase();
    if (house && !vs.every((v) => v.toLowerCase().includes(house))) {
      console.log(`FAIL a variant dropped the manager for ${JSON.stringify(name)}: ${JSON.stringify(vs)}`); fail++;
    }
  }
}
/* THE EXPENSE RATIO IS A SEPARATE CLAIM FROM THE TICKER, and until 2026-09-28
 * nothing here tested it. fund-er.js's own section header reads
 * `--- American Funds (R6) ---` and not one pattern beneath it tested the
 * share class, so 10,387 rows / 2,227 plans / 2,065,081 participants /
 * $9,258,280,862 published the R6 fee for a holding the filing names R-1
 * through R-4, Class A, Class C or F-1 — classes that pay a 12b-1 fee R-5,
 * R-6 and F-2 do not.
 *
 * The guard REFUSES rather than re-prices, because the real per-class figures
 * could not be sourced (capitalgroup.com and the Voya fact sheets are both
 * blocked by the egress proxy) and a fee on this site is sourced, never
 * derived. These fixtures pin both directions: the classes that must now come
 * back blank, and the ones that must keep their number. */
const ER_MUST_BLANK = [
  /* `gic\b` matched the tail of "strateGIC", pricing real funds as guaranteed
   * investment contracts. 5,604 rows / 7,324,367 participants; all 1,904
   * distinct names read and every one a real registered fund. 2026-09-29. */
  "Vanguard Strategic Equity Fund", "Fidelity Strategic Income Fund",
  "BlackRock Strategic Global Bond K", "Pioneer Strategic Income R6",
  "Thornburg Strategic Income Fund", "MID CAP STRATEGIC GWTH",
  "Vanguard Strategic Small-Cap Equity Inv",
  "American Funds Eupac R4", "American Balanced Fund Class A",
  "American Funds Trgt Date Ret 2040 R2", "AMERFDS AMERICAN BALANCED R4",
  "American Funds 2035 Target Date Fund R3", "AMERICAN FUNDS 2060 TARGET DATE FUND R1",
  "American Funds Capital World Bond R3", "AMERICAN FUNDS 2040 TRGT DATE RET F1",
  "American Funds Washington Mutual Cl C",
  /* the REVERSED designation, added 2026-09-29: this arm read `class a` and not
   * `A-CLASS`, so one filer's four rows kept the R-6 number for Class A
   * holdings. Found by reading the rows the issuer-priced fee arm would add. */
  "AMERICAN FUNDS EUROPACIFIC GROWTH FUND A-CLASS",
  "AMERICAN FUNDS THE GROWTH FUND OF AMERICA A-CLASS",
  "American Funds Washington Mutual Investors Fund C-Class",
];
const ER_MUST_KEEP = [
  /* ...and a SAGIC is a Separate Account GIC, which really IS a guarantee
   * product and really does end in `gic`. A naive `\bgic\b` drops these: 114
   * distinct names / 292 rows depend on the `(?:sa)?`. */
  "SAGIC Diversified Bond II", "MassMutual SAGIC Core Bond I",
  "Sagic Diversified Bond I", "Diversified SAGIC II",
  "GIC Account", "TIAA Stable Value", "Key Guaranteed Portfolio Fund",
  "American Funds 2030 Target Date Retirement Fund R6",
  "American Funds 2030 Target Date Retirement Fund",
  "American Funds Washington Mutual R5",
  "American Funds 2045 Target Date F2",
  "American Funds EuroPacific Growth R6",
  "American Funds New World R6",
  /* the widened arm must not reach a name that merely ENDS in `America` before
   * the word Class — there is no word boundary inside `AMERICA-CLASS`, and the
   * R-6 forms below are the ones that must keep their number */
  "AMERICAN FUNDS GROWTH FUND OF AMERICA CLASS R-6",
  "American Funds EuroPacific Growth Fund R6 Class",
  /* other houses are deliberately untouched: nothing in the table states which
   * share class THEIR numbers are, so refusing them would be a guess */
  "MFS Value Fund Cl A", "Vanguard Target Retirement 2040", "Fidelity 500 Index",
];
for (const n of ER_MUST_BLANK) {
  const got = ctx.__e(n);
  if (got != null) { console.log(`FAIL er want (blank) got ${got}% ${JSON.stringify(n)}`); fail++; }
}
for (const n of ER_MUST_KEEP) {
  const got = ctx.__e(n);
  if (got == null) { console.log(`FAIL er want a number, got (blank) ${JSON.stringify(n)}`); fail++; }
}
console.log(`fund-er fixtures: ${MUST.length} must-resolve, ${MUST_NOT.length} must-not-resolve, ${ER_MUST_BLANK.length} must-blank-fee, ${ER_MUST_KEEP.length} must-keep-fee, ${fail} failures`);
process.exit(fail ? 1 : 0);
