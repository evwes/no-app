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
  /* THE FOUR CASES ABOVE SPELL THE ALLOCATION OUT, so not one of them reached
   * the vowel-dropped spellings the recordkeepers actually file — the whole
   * class below published VASGX, the 80/20 Growth fund, for a Conservative
   * Growth (40/60) holding. Every spelling here is taken from the store, and
   * the rule is an ORDERED SUBSEQUENCE of the registered word rather than a
   * list of contractions (see the note above FUND_ER). */
  ["Vanguard LifeStrategy Consv Growth Inv", "VSCGX"],
  ["Vanguard LifeStrategy Cnsrv Gr Inv", "VSCGX"],
  ["VANGUARD LIFESTRAT CSRV GR INV", "VSCGX"],
  ["Vanguard LifeStrat Cns Gr Fd Inv", "VSCGX"],
  ["Vanguard LifeStrategy Con Grth", "VSCGX"],
  ["Vanguard LifeStrat Cnsv Gr Inv", "VSCGX"],
  /* THE HOUSE WORD IS REQUIRED and four pins written from the store's own
   * strings failed on it: hundreds of these rows are filed as a bare
   * `LifeStrategy …` with `Vanguard` in the ISSUER cell, and app.js's
   * lookupTicker PREPENDS the issuer before asking. So the store name is not
   * the string the resolver sees, and a fixture must use the one it does. */
  ["Vanguard Lifestrategy Cnserv Gr", "VSCGX"],
  ["Vanguard Lifestrategy Conserative Growth", "VSCGX"],   // filer typo, still in order
  ["Vanguard Life Strategy Conserve Growth Fund", "VSCGX"],  // gained: `conserve` ends in e
  ["Vanguard LifeStrat Md Grw Fd Inv", "VSMGX"],
  ["Vanguard Life Strat Mod Growth Fund I", "VSMGX"],
  /* the filing adjudicates it: these print the symbol we were contradicting */
  ["Vanguard LifeStrat Cnsrv Gr Inv (VSCGX)", "VSCGX"],
  ["Vanguard LifeStrategy 40/60 Cons Gro", "VSCGX"],
  /* ...and the Growth and Income arms must be untouched by the widening */
  ["Vanguard LifeStrategy Growth Fund Investor Shares", "VASGX"],
  ["Vanguard Lifestrategy Growth Investor Class", "VASGX"],  // `Class` is not conservative
  ["VANGUARD LIFESTRATEGY GROWTH", "VASGX"],
  ["Corebridge Vanguard Lifestrategy Growth", "VASGX"],      // a platform, not an allocation
  ["Vanguard LifeStrategy Growth Fd", "VASGX"],
  /* NAMED RESIDUE, pinned so a later widening cannot change it in silence:
   * there is no registered LifeStrategy Mid or Modified fund, so these are a
   * filer error rather than a contraction and VSMGX is not asserted for them */
  ["Vanguard LifeStrat Mid Growth Fund", "VASGX"],
  ["Vanguard LifeStrategy Modified Growth", "VASGX"],
  ["Vanguard LifeStrat Constant Growth", "VASGX"],  // `Constant` is an ordinary word
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
  /* A FILING STATING INSTITUTIONAL PLUS GETS THE INSTITUTIONAL PLUS CLASS.
   * Added because NOT ONE of the cases above reaches the new arm — every
   * existing Vanguard index fixture states Admiral, Investor or no class at
   * all, so the table could not have seen this. Each wanted symbol is the one
   * sec-funds.json registers as that series' "Institutional Plus Shares".
   * The seven series, one case each, then the spellings that exercise a
   * condition rather than repeat one. */
  ["Vanguard Institutional Index Fund Institutional Plus Shares", "VIIIX"],
  ["Vanguard Total Stock Market Index Fund Institutional Plus Shares", "VSMPX"],
  ["Vanguard Total International Stock Index Fund Institutional Plus Shares", "VTPSX"],
  ["Vanguard Total Bond Market Index Fund Institutional Plus Shares", "VBMPX"],
  ["Vanguard Extended Market Index Fund Institutional Plus Shares", "VEMPX"],
  ["Vanguard Small-Cap Index Fund Institutional Plus Shares", "VSCPX"],
  ["Vanguard Mid-Cap Index Fund Institutional Plus Shares", "VMCPX"],
  ["Vanguard Inst Idx Inst Plus", "VIIIX"],          // ABBREV expands both INSTs
  ["VANGUARD INSTL IDX INSTL PLUS", "VIIIX"],
  ["Vanguard Total Bond Market Index Fund: Inst'l Plus Shr", "VBMPX"],  // apostrophe
  ["Vanguard Extended Market Index InstlPlus", "VEMPX"],   // glued, ABBREV cannot fire
  ["VANGUARD MID CAP INDEX-INST+", "VMCPX"],        // "+" is the Plus class
  ["Institutional Plus Shares Vanguard Mid Cap Index", "VMCPX"],  // marker LEADS
  ["Vanguard Mid-Cap Ind Inst Plus", "VMCPX"],       // IND -> Index
  /* MUST NOT BE REPAIRED, and each of these can actually fail rather than being
   * refused by an earlier condition — the point of pinning them.
   * (1) two different classes stated: the contradicting-class lookahead is the
   *     ONLY thing refusing, so without it this resolves VSCPX; with it the
   *     bare arm answers as it did before the change. Pinned at the OLD answer
   *     deliberately: declining to choose between two stated classes is not the
   *     same as asserting the Admiral one is right, and whether the bare arm
   *     should answer at all is a separate, larger question.
   * (2) a series that registers NO Institutional Plus class — PRIMECAP has only
   *     Investor and Admiral — so a leading marker there is a weld and the
   *     registry refuses it with no vocabulary of weld shapes. */
  ["Vanguard Small-Cap Index Fund Admiral Shares Institutional Plus", "VSMAX"],
  ["Instl Plus Shares Vanguard PRIMECAP Fund", "VPMAX"],
  /* ---- Vanguard target-date: LOOKAHEADS, not an ordered sequence ------------
   * ADDED BECAUSE NOT ONE of the 83 must-resolve and 26 must-not cases above
   * reaches the new arm — measured, not assumed: the whole arm could have been
   * inert and this table would still have read 83/26/19/18/28. Every expected
   * value below was probed against the SHIPPED predicate before being written
   * down, because this record has already paid for pins written from memory.
   *
   * One case per surface the ordered sequence could not reach: the HOUSE spelled
   * a way it cannot match, a CLASS DESIGNATION infixed between the family and
   * the vintage, `retirement` MISSPELLED, a TRUSTEE between the house and the
   * family, the VINTAGE BEFORE the family, `Date` for `Retirement`, `TR` for the
   * family, and an apostrophe inside `Inst'l`. */
  ["Vangrd Trgt Retire 2055 Fd", "VFFVX"],          // VANGRD: the one house contraction ABBREV lacks
  ["Vangrd Trgt Retire Inc Fd", "VTINX"],
  ["Vanguard Institutional TR 2060", "VTTSX"],      // the 08:2xZ draw's own row
  ["Vanguard Target Retirement Trust Plus 2040", "VFORX*"],   // class infixed
  ["Vanguard Target Retire Trust 2040", "VFORX*"],
  ["Vanguard Fiduciary Trust Company Target Retirement 2035 Trust II", "VTTHX*"], // trustee first
  ["The Vanguard Group Target Retirement 2030 Trust II", "VTHRX*"],
  ["VANGUARD TARGET RETIREMNT 2030", "VTHRX"],      // `retirement` misspelled
  ["VANGUARD TGT RETIREM'T INCOME", "VTINX"],
  ["VANGUARD 2045 TARGET RETIREMNT", "VTIVX"],      // vintage BEFORE the family
  ["Vanguard Target Date 2060", "VTTSX"],           // `Date` for `Retirement`
  ["Vanguard Tar Ret 2070 Tr I", "VSVNX*"],
  ["Vanguard TR 2045 Trust II", "VTIVX*"],          // `TR` is the family AND `Trust` is spelled out
  ["VANG INSTL TR 2035 I", "VTTHX"],
  ["Vanguard Inst’l Target Retirement 2050", "VFIFX"],   // curly apostrophe
  ["Vangaurd Target Retirement 2035 Fund", "VTTHX"],          // filer misspelling of the house
  /* `blend` is NOT a product word here and this pin is what locks that in: see
   * fund-er.js's VGTD_OTHER_PRODUCT note. The plan filing this row holds nine
   * Vanguard rows and zero T. Rowe rows, and T. Rowe's own Blend fund resolves
   * correctly on the line below, refused by the HOUSE lookahead rather than by
   * a word list. */
  ["Vanguard Target Retirement Blend 2045 Inv", "VTIVX"],
  ["T. Rowe Price Target Retirement Blend 2035", "TBLYX"],
  /* `Intl`/`Industrials` are load-bearing Vanguard words and the arm must not
   * swallow them: International Growth still resolves to its own fund. */
  ["Vanguard Intl Growth Adm", "VWILX"],
  /* THE DOWNGRADE, pinned as a TICKER rather than as a blank (2026-10-09).
   * The TIAA Access veto is one-directional but it is not uniform: a name the
   * comparable table carries keeps its symbol WITH the asterisk, which is the
   * honest cell for a wrapper ("this is what the holding tracks"). The two
   * expectations below are the same product under two filers' spellings, and
   * the `*` is the whole assertion — without it this pin would pass against a
   * version that asserted the fund itself. 6 rows / 7,358 readers. */
  ["TIAA Access TRP Inst Large Cap Growth T4", "TRLGX*"],
  ["TIAA ACCESS TRP LARGE CAP GROWTH I T3", "TRLGX*"],
];

/* MUST NOT RESOLVE. A blank is the honest answer for all of these. */
const MUST_NOT = [
  "VanEck CM Commodity Index I",                   // "Van" -> Vanguard must not reach a Vanguard fund
  "Van Eck International Investors Gold",
  "PUTNAM STABLE VALUE FUND 25",
  "LOAN FUND",
  "PENDING SETTLEMENT FUND",
  "TIAA REAL ESTATE",
  /* THE TIAA ACCESS VARIABLE-ANNUITY SUB-ACCOUNTS, 2026-10-09. A sub-account
   * of TIAA's variable annuity is not the registered fund it invests in, and
   * the SEC registers 0 of 29,406 series matching both `tiaa` and `access`.
   * Each of these three published an ASSERTED symbol before the `pooled` veto
   * learned the phrase — VWENX for 1,675 + 741 + 478 + 403 + 366 readers and
   * DODFX for 381 — and each is the ONLY protection for its own spelling:
   * `Vang`, the spelled-out house, the hyphen-joined form. */
  "TIAA Access Vang Wellington T4",
  "TIAA Access Vanguard Wellington T4",
  "TIAA Access-Dodge & Cox International Stock T4",
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
  /* CORRECTED 2026-10-01: the numeric form IS filed — 114 published rows name a
   * LifeStrategy fund by its allocation — and 108 of them DO publish a symbol,
   * through the stored SEC `stk` rather than through this file. The pin is
   * still right about fund-er.js and its comment was wrong about the universe.
   * That resolver contradicts itself there (60/40 -> VSMGX on 14 rows and
   * VSCGX on 12; 20/80 -> VASIX on 8 and VASGX on 7), which is a separate,
   * merge-side item. */
  "Vanguard LifeStrategy 60/40",                   // no numeric arm in THIS file
  /* ---- Vanguard target-date: what the arm must REFUSE ----------------------
   * (a) `Tr` abbreviates TRUST before it abbreviates Target Retirement — this
   *     record measured 1,191 published `Tr`+vintage rows resolving at 0%
   *     because they are other houses' collective trusts with no registered
   *     symbol BY DESIGN. The House-lookahead control fails by name on TWO of
   *     these three, which is what makes `tr` safe inside the family list; the
   *     Voya row is refused by `WRAPPER` instead and is pinned as a cost-free
   *     passenger rather than as evidence about this arm.
   * (b) TWO VINTAGES in one name name no single fund, and the first two of
   *     these publish VTINX today — the withdrawal this change makes.
   * (c) `Income and Growth` is a DISTINCT Vanguard product: 112 published
   *     lineups hold one of these rows AND a plain Income row at a different
   *     value. It resolves to VTINX today.
   * (d) a SECOND HOUSE named in the same string.
   * (e) the digit fence: `20505` is not the 2050 fund.
   * (f) a vintage Vanguard merged away has no arm, so it stays blank rather
   *     than quoting a dead ticker. */
  "T Rowe Price Ret Blend Slct Tr 2030 Cl 5",
  "Voya Trgt Solution Tr: 2030 8",
  "STATE ST TR 2050 K",
  "Vanguard Target Retirement Income 2040 Fund",
  "Vanguard Target Retirement 2035 Income Trust II",
  "Vanguard Target Retirement Income and Growth Trust II",
  "Vanguard Tgt Ret Inc & Gr Tr II",
  "Vanguard American Funds 2040 Trgt Date Retire R6",
  "Vanguard Target Retirement 20505",
  "VANGUARD TARGET RETIREMENT 2015",
  "Vanguard Industrials Index Admiral",            // a real Vanguard fund the table does not carry
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

/* ---- fees pinned to an exact VALUE ------------------------------------------
 * The two tables above test only whether a fee is PRESENT, which cannot see a
 * defect that publishes the WRONG number — and the 2026-10-01 `nt ` defect was
 * exactly that: a short alternative with no LEADING word boundary matched the
 * last two letters of "ManagemeNT ", "InvestmeNT ", "GovernmeNT " and the
 * abbreviation "INT " for International, so 970 rows / 506 plans / 1,291,747
 * participants carried Northern Trust's 0.05 collective-index estimate on a fund
 * of another house. Sibling of the 2026-09-29 `gic` fix, whose boundary was on
 * the end and missing at the start.
 *
 * These pin the number on both sides of that boundary: the ordinary words that
 * must NOT reach the Northern Trust arm, and the genuine NT names that must. */
const ER_MUST_EQUAL = [
  /* a word merely ENDING in -nt may not be read as Northern Trust */
  ["Management 500 Index Fund", 0.03],
  ["Fidelity Management Trust Company 500 Index Fund", 0.03],
  ["John Hancock Asset Management 500 Index Fund", 0.03],
  ["VANGUARD TOTAL INT STOCK INDEX", 0.06],
  ["NUVEEN INT EQ INDEX R6", 0.06],
  ["Intermediate Government Bond Index Fund", 0.06],
  ["SCHWAB FUNDMTL INT SMMID INDEX", 0.04],
  ["MyWayRetirement Index 2060 R", 0.1],
  ["PGIM Quant Solutions Large-Cap Index Z", 0.1],
  ["Shelton Capital Management Nasdaq-100 Index Fund", 0.1],
  ["{Dimensional} DFA US Large Company Installment Index Fund", 0.3],
  /* ...and Northern Trust itself must keep its estimate, including the forms
   * that do NOT say "collective" — requiring that word was measured at a cost of
   * 52 rows / 37,289 participants of genuine attribution and rejected */
  ["Northern Trust Collective Aggregate Bond Index Fund", 0.05],
  ["NT Collective S&P 500 Index Fund", 0.05],
  ["NT Agg Bond Index Fund NL T4", 0.05],
  ["NTGI Collective Russell 1000 Index", 0.05],
  /* the audit found five further short tokens reachable from inside a word. Of
   * their twelve live occurrences, SEVEN actually resolve through the token and
   * every one is an OCR weld of the house's OWN name, so bounding those would
   * withdraw a CORRECT fee — they are pinned here to keep it. (The other five
   * never reach the pattern at all; occurrence is not resolution.) */
  ["IDFA Real Estate Securities Portfolio Institutional", 0.3],
  ["Empower Annuity Insurance CompaDFA Emerging Markets Core Equity I", 0.3],
  ["Lincoln National Life Insurance Co. SALASSgA S&P MidCp Idx Non-Ln", 0.05],
  /* THE SAME REACH FAILURE SITS IN BOTH TABLES, so the fee needs its own pins:
   * FUND_ER carries 0.12 for LifeStrategy Conservative Growth and 0.10 for the
   * other three, and the abbreviated spellings reached only the 0.10. Shipping
   * the symbol without the fee would have left a CORRECT symbol beside another
   * fund's number. All 395 measured moves are 0.1 -> 0.12, i.e. UPWARD. */
  ["Vanguard LifeStrategy Conservative Growth Fund", 0.12],
  ["Vanguard LifeStrategy Consv Growth Inv", 0.12],
  ["Vanguard LifeStrategy Cnsrv Gr Inv", 0.12],
  ["VANGUARD LIFESTRAT CSRV GR INV", 0.12],
  ["Vanguard LifeStrategy Con Grth", 0.12],
  ["Vanguard LifeStrategy Growth Inv", 0.1],
  ["Vanguard LifeStrategy Moderate Growth Fund", 0.1],
  ["Vanguard LifeStrat Md Grw Fd Inv", 0.1],
  ["Vanguard LifeStrategy Income Fund", 0.1],
  ["Vanguard LifeStrat Mid Growth Fund", 0.1],            // residue: not asserted as moderate
];
for (const [n, want] of ER_MUST_EQUAL) {
  const got = ctx.__e(n);
  if (got !== want) { console.log(`FAIL er want ${want}% got ${got}% ${JSON.stringify(n)}`); fail++; }
}
console.log(`fund-er fixtures: ${MUST.length} must-resolve, ${MUST_NOT.length} must-not-resolve, ${ER_MUST_BLANK.length} must-blank-fee, ${ER_MUST_KEEP.length} must-keep-fee, ${ER_MUST_EQUAL.length} must-equal-fee, ${fail} failures`);
process.exit(fail ? 1 : 0);
