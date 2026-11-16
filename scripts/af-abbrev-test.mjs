#!/usr/bin/env node
/* wampo — TETHER FOR THE CAPITAL GROUP ABBREVIATION ARM (`lib-af-abbrev.mjs`).
 * 2026-10-11. Wired into `site-test`.
 *
 * CI-SAFE BY CONSTRUCTION, and that is the whole reason this file holds a
 * registry of its own. The arm reads `sec-funds.json`, which is refreshed from
 * the SEC, so a test that pinned verdicts against the LIVE file would redden
 * on a refresh with nothing wrong — the shape that kept `merge-name-test` out
 * of CI and the shape that left `site-test` habitually red for ten runs. So
 * every verdict below is asserted against a FROZEN fixture registry, and the
 * live file is touched only by `assertAfFamily` inside the generator.
 *
 * WHAT IS CHECKED, and each part fails for its own reason:
 *   - MUST FIRE: one case per shape the arm exists for, including both damaged
 *     tokens at once, the series that carries no house of its own, and the R-4
 *     class (a different class and a different ticker from R-6);
 *   - MUST NOT FIRE: the MyCompass wrapper lead in both orderings, another
 *     house whose own name opens with `American`, a foreign house welded in, a
 *     product too generic to pin, a stated class the series does not register,
 *     and a vintage the registry carries only under a renamed series;
 *   - SINGLE-PROTECTION MUTATIONS: five conditions, each neutered in turn, each
 *     with a case drawn FROM the store where that condition is the ONLY thing
 *     deciding the verdict, and the suite EXITS 1 IF A MUTATION STILL PASSES —
 *     a control that cannot fail is decorative;
 *   - INVARIANTS that stand in for conditions deliberately NOT written: that no
 *     letter floor on the house run is needed (a one-letter token cannot
 *     satisfy the relation, so any such floor is unreachable by construction),
 *     and that the arm never answers on a name that states no house.
 */
import { readFileSync } from "node:fs";

const SRC_PATH = new URL("./lib-af-abbrev.mjs", import.meta.url).pathname;
const SRC = readFileSync(SRC_PATH, "utf8");
const load = async (src) => import("data:text/javascript," + encodeURIComponent(src));

/* ---------- THE FROZEN FIXTURE REGISTRY ----------
 * Rows are `[registrant :: series, ticker, "class", className]`, the shape of
 * `sec-funds.json`'s `funds`. Family membership is derived from `Class R-2E`,
 * so every Capital Group trust below carries one — that is not decoration, it
 * is the witness the arm uses. The two FOREIGN registrants exist so the family
 * restriction has something to refuse. */
const R = (reg, series, rows) => rows.map(([tk, cn]) => [`${reg} :: ${series}`, tk, "class", cn]);
const FIXTURE = [
  ...R("American Funds Target Date Retirement Series", "American Funds 2055 Target Date Retirement Fund",
    [["RFKTX", "Class R-6"], ["RDJTX", "Class R-4"], ["RBEMX", "Class R-2E"], ["AAMTX", "Class A"]]),
  ...R("American Funds Target Date Retirement Series", "American Funds 2035 Target Date Retirement Fund",
    [["RFFTX", "Class R-6"], ["RDFTX", "Class R-4"], ["RBEFX", "Class R-2E"]]),
  /* the 2025 vintage is registered ONLY as `… Retirement INCOME Fund` */
  ...R("American Funds Target Date Retirement Series", "American Funds 2025 Target Date Retirement Income Fund",
    [["RFDTX", "Class R-6"], ["RBEDX", "Class R-2E"]]),
  ...R("AMERICAN BALANCED FUND", "AMERICAN BALANCED FUND",
    [["RLBGX", "Class R-6"], ["RAMHX", "Class R-2E"], ["ABALX", "Class A"]]),
  ...R("AMERICAN FUNDS GLOBAL BALANCED FUND", "AMERICAN FUNDS GLOBAL BALANCED FUND",
    [["RGBGX", "Class R-6"], ["RGBHX", "Class R-2E"]]),
  ...R("NEW PERSPECTIVE FUND", "NEW PERSPECTIVE FUND",
    [["RNPGX", "Class R-6"], ["RNPHX", "Class R-2E"], ["ANWPX", "Class A"]]),
  ...R("NEW WORLD FUND INC", "NEW WORLD FUND INC",
    [["RNWGX", "Class R-6"], ["RNEBX", "Class R-2E"]]),
  ...R("BOND FUND OF AMERICA", "BOND FUND OF AMERICA",
    [["RBFGX", "Class R-6"], ["RBFHX", "Class R-2E"]]),
  ...R("AMERICAN FUNDS CORPORATE BOND FUND", "AMERICAN FUNDS CORPORATE BOND FUND",
    [["RCBFX", "Class R-6"], ["RCBHX", "Class R-2E"]]),
  ...R("American Funds Core Plus Bond Fund", "American Funds Core Plus Bond Fund",
    [["CPBFX", "Class R-6"], ["CPBHX", "Class R-2E"]]),
  ...R("AMCAP FUND", "AMCAP FUND", [["RAFGX", "Class R-6"], ["RAFHX", "Class R-2E"]]),
  /* FOREIGN: no Capital Group class ladder, so not in the family */
  ...R("VANGUARD INDEX FUNDS", "Vanguard 500 Index Fund", [["VFIAX", "Admiral Shares"]]),
  ...R("MFS SERIES TRUST I", "MFS Value Fund", [["MEIKX", "Class R6"], ["MEIAX", "Class A"]]),
];

let fails = 0;
const bad = (m) => { console.error(`  FAIL  ${m}`); fails++; };

/* ---------- the arm, as shipped, over the fixture ---------- */
const M = await load(SRC);
const IDX = M.buildAfIndex(FIXTURE);
{
  const fam = [...IDX.family].sort();
  const wantFam = ["AMCAP FUND", "AMERICAN BALANCED FUND", "AMERICAN FUNDS CORPORATE BOND FUND",
    "AMERICAN FUNDS GLOBAL BALANCED FUND", "American Funds Core Plus Bond Fund",
    "American Funds Target Date Retirement Series", "BOND FUND OF AMERICA",
    "NEW PERSPECTIVE FUND", "NEW WORLD FUND INC"];
  if (JSON.stringify(fam) !== JSON.stringify(wantFam))
    bad(`the class-ladder family derivation changed: ${JSON.stringify(fam)}`);
  if (IDX.family.has("VANGUARD INDEX FUNDS") || IDX.family.has("MFS SERIES TRUST I"))
    bad("a foreign registrant is in the derived family");
}

const ask = (mod, idx, n) => { const r = mod.afAbbrevAsk(idx, n); return r ? r.ticker : null; };

/* ---------- MUST FIRE ---------- */
const MUST_FIRE = [
  ["AMERFUNDS 2055 TARG DATERET R6", "RFKTX", "the house AND the product contracted"],
  ["AMERICAN FUNDS 2055 TARG DATERET R6", "RFKTX", "the product only"],
  ["AMER FUNDS NEW PERSP R6", "RNPGX", "a series carrying no house of its own"],
  ["AMERFUNDS AMER BALANCED - R6", "RLBGX", "NOT Global Balanced — the first-letter rule"],
  ["AMERFDS 2035 TARG DATE RET-R4", "RDFTX", "R-4 is a different class and a different ticker"],
  ["American Funds NewPrsp R6 Fnd", "RNPGX", "a vehicle word BEHIND the class"],
  ["AF BOND FD AMER R6", "RBFGX", "a two-letter house run, read and verified in the store"],
  ["AMF 2025 TD RET INC R6", "RFDTX", "the renamed vintage, where the filing DOES say Income"],
  ["American Funds Amcap R6 Fund", "RAFGX", "a vehicle word in front of and behind nothing"],
  ["American Funds Trgt Date Ret 2055 R6", "RFKTX", "the VINTAGE lifted: the filer puts the year where the registry does not"],
  ["American Fund Trgt Date Ret 2055 R6", "RFKTX", "the same with the SINGULAR house, which blocks nothing"],
];
for (const [n, want, why] of MUST_FIRE) {
  const got = ask(M, IDX, n);
  if (got !== want) bad(`MUST FIRE (${why}): ${JSON.stringify(n)} should answer ${want}, got ${got || "nothing"}`);
}

/* ---------- MUST NOT FIRE ---------- */
const MUST_NOT = [
  ["MyCompass Amer Fds 2035 Fd R", "a WRAPPER lead, correct as filed — a platform's product, not the fund"],
  ["MyCompass Amer Fds 2055 Fd R6", "the same wrapper with a class stated"],
  ["Amer Fds MyCompass 2055 R6", "the wrapper in the product position"],
  ["American Century Growth R6", "another house whose own name opens with `American`"],
  ["American Beacon Balanced R6", "likewise, and its product word collides with a family series"],
  ["American Funds Vanguard 500 Index R6", "a foreign house welded in behind a stated house"],
  ["American Funds MFS Value R6", "a foreign house whose series DOES register Class R6"],
  ["AMERFUNDS GROWTH R6", "a product too generic to pin to one series"],
  ["AMERFUNDS 2055 TARG DATERET Z9", "a class the series does not register"],
  ["AMERFUNDS 2025 TARG DATERET R6", "a vintage the registry carries only under a RENAMED series"],
  ["American Funds Trgt Date Ret 2025 R6", "the same rename, reached through the vintage lift: `income` is still unconsumed"],
  ["American Funds Trgt Date Ret 2055 2035 R6", "TWO vintages: the lift takes exactly one or none"],
  ["American Funds Trgt Date Ret R6", "no vintage at all, so the lift cannot apply and the ordered match fails"],
  ["American Funds Trgt Date Ret 2099 R6", "a vintage the registry does not carry"],
  ["American Funds MFS Value 2055 R6", "a foreign house with a year welded on"],
  ["American Funds Corp Bond R6 Fund", "`Corp` abbreviates Corporate AND Core Plus — ambiguous"],
  ["American Funds AMCAP Fund", "no share class stated: the honest answer is a comparable"],
  ["American Funds New Class R6 Fund", "a three-letter product run"],
  ["CG LONG DUR CREDIT TRST (US) CL DB", "not a Capital Group mutual fund"],
  ["Bank of America Corp", "no house run at all"],
];
for (const [n, why] of MUST_NOT) {
  const got = ask(M, IDX, n);
  if (got) bad(`MUST NOT FIRE (${why}): ${JSON.stringify(n)} answered ${got}`);
}

/* ---------- SINGLE-PROTECTION MUTATIONS ----------
 * Each entry neuters ONE condition and names the case where that condition is
 * the only thing deciding the verdict. A mutation that leaves every verdict
 * intact is a condition that proves nothing, so a PASS here is a FAILURE. */
const MUTATIONS = [
  { name: "houseRun may SKIP series words (both house words required)",
    from: "if (abbreviates(head, ph, 2, NO_SKIP)) return n;",
    to: "if (abbreviates(head, ph, 2, SKIP)) return n;",
    /* measured: 1,202 store rows answer only when this is neutered */
    expect: [["American New Perspective R6", "RNPGX"]] },
  { name: "the first-letter obligation in `absorbs`",
    from: "  for (const w of words) { mandatory.add(off); off += w.length; }",
    to: "  for (const w of words) { off += w.length; }",
    /* two directions at once: without it one correct answer goes AMBIGUOUS and
     * one refusal becomes a WRONG assertion across a rename */
    expect: [["AMERFUNDS AMER BALANCED - R6", null], ["AMERFUNDS 2025 TARG DATERET R6", "RFDTX"]] },
  { name: "uniqueness within the family",
    from: "    if (hits.length !== 1) continue;",
    to: "    if (hits.length < 1) continue;",
    expect: [["American Funds Corp Bond R6 Fund", "RCBFX"]] },
  { name: "the product letter floor",
    from: "    if (head.join(\"\").length < 4) continue;",
    to: "    if (head.join(\"\").length < 1) continue;",
    expect: [["American Funds New Class R6 Fund", "RNWGX"]] },
  { name: "the VINTAGE LIFT requires the SAME year on both sides",
    from: "  if (!a || !b || a.v !== b.v) return false;",
    to: "  if (!a || !b) return false;",
    /* without the equality the lift matches any vintage of the ladder, so one
     * filed year reaches thirteen series and the arm goes AMBIGUOUS rather than
     * wrong — which is why the mutant answers nothing where the shipped arm
     * answers RFKTX, and is exactly as load-bearing either way */
    expect: [["American Funds Trgt Date Ret 2055 R6", null]] },
  { name: "the vintage lift runs only AFTER the ordered match fails",
    /* RE-DERIVED 2026-11-13: the series match now loops over the registered
     * name plus any sourced former name, so the anchor is the loop body and no
     * longer a two-line `if`. Dropping the lifted call is still the mutation. */
    from: "        if (abbreviates(head, S, 3, fam.skip) || abbreviatesVintageLifted(head, S, fam.skip)) {",
    to: "        if (abbreviates(head, S, 3, fam.skip)) {",
    expect: [["American Funds Trgt Date Ret 2055 R6", null]] },
  { name: "the registry-derived family restriction",
    from: "    if (!family.has(reg)) continue;",
    to: "    if (false) continue;",
    expect: [["American Funds MFS Value R6", "MEIKX"]] },
  { name: "the stated class must be one the series registers",
    /* RE-DERIVED 2026-11-13: the pushed answer now carries the `+former` route
     * tag, so the anchor gained ` + via`. */
    from: "      if (s.classes.has(ck)) { hits.push({ ticker: s.classes.get(ck), series: s.name, reg: s.reg, ck, how: \"equal\" + via }); continue; }",
    to: "      { hits.push({ ticker: s.classes.get(ck) || [...s.classes.values()][0], series: s.name, reg: s.reg, ck, how: \"equal\" + via }); continue; }",
    expect: [["AMERFUNDS 2055 TARG DATERET Z9", "RFKTX"]] },
];
for (const mut of MUTATIONS) {
  if (!SRC.includes(mut.from)) { bad(`MUTATION "${mut.name}": its anchor is no longer in the source — re-derive it`); continue; }
  const src = SRC.split(mut.from).join(mut.to);
  let mod;
  /* the data: URL is the whole module, so an error message carrying it is
   * 50 KB of noise that buries every other finding — report the NAME */
  try { mod = await load(src); } catch (e) { bad(`MUTATION "${mut.name}": the mutated module does not load (${String(e && e.name)})`); continue; }
  const idx = mod.buildAfIndex(FIXTURE);
  let ok = true;
  for (const [n, wantMutated] of mut.expect) {
    /* `wantMutated` is the verdict the NEUTERED arm gives. Two things must
     * hold, and asserting only one of them is how a control goes decorative:
     * the shipped arm must NOT give it, and the mutant must. */
    let base = null, got = null;
    try { base = ask(M, IDX, n); } catch { base = "(threw)"; }
    try { got = ask(mod, idx, n); } catch { got = "(threw)"; }
    if (base === wantMutated) {
      ok = false;
      bad(`MUTATION "${mut.name}": the SHIPPED arm already answers ${JSON.stringify(base)} on ${JSON.stringify(n)} — this case cannot test that condition`);
    } else if (got !== wantMutated) {
      ok = false;
      bad(`MUTATION "${mut.name}" did NOT change the verdict on ${JSON.stringify(n)} (shipped ${base || "nothing"}, mutant ${got || "nothing"}, expected mutant ${wantMutated || "nothing"}) — that condition is DECORATIVE here, or the case is protected twice`);
    }
  }
  if (ok) console.error(`  mutation ok  ${mut.name}`);
}

/* ---------- INVARIANTS, standing in for conditions NOT written ---------- */
{
  /* (1) no letter floor on the house run is needed: a one-letter leading token
   *     cannot satisfy the relation at all, so any floor at or below 2 is
   *     unreachable by construction and a floor of 4 was measured to cost 684
   *     genuine rows. */
  for (const n of ["A BOND FD AMER R6", "C 2055 TARG DATERET R6", "F AMCAP R6"])
    if (ask(M, IDX, n)) bad(`INVARIANT (1): a single-letter house token answered on ${JSON.stringify(n)}`);
  /* (2) the arm never answers where the name states no house, whatever the
   *     product says — the leading anchor is the decoy guard. */
  for (const n of ["2055 TARG DATERET R6", "AMER BALANCED R6", "NEW PERSP R6", "AMCAP R6",
    "Reliance Trust AMERFUNDS AMER BALANCED R6"])
    if (ask(M, IDX, n)) bad(`INVARIANT (2): a name stating no leading house answered on ${JSON.stringify(n)}`);
  /* (3) a foreign-house REFUSAL is deliberately absent, and it is absent
   *     because it would be unreachable: a foreign token must itself be
   *     absorbed by a family series for the arm to fire, so there is no
   *     single-protection case. Asserted rather than commented. */
  for (const n of ["American Funds Vanguard Balanced R6", "AMERFUNDS FIDELITY BALANCED R6",
    "American Funds BlackRock New Perspective R6"])
    if (ask(M, IDX, n)) bad(`INVARIANT (3): a foreign house token reached an answer on ${JSON.stringify(n)}`);
  /* (4) idempotence of the family derivation over row order */
  const shuffled = FIXTURE.slice().reverse();
  const i2 = M.buildAfIndex(shuffled);
  if (i2.family.size !== IDX.family.size || i2.series.size !== IDX.series.size)
    bad("INVARIANT (4): the index depends on registry row order");
  for (const [n] of MUST_FIRE) if (ask(M, i2, n) !== ask(M, IDX, n))
    bad(`INVARIANT (4): ${JSON.stringify(n)} answers differently under a reordered registry`);
}

/* ==========================================================================
 * THE FIDELITY FAMILY OF THE SAME ARM, 2026-10-16.
 *
 * Its own frozen registry, for the same CI-safety reason, and its own fixtures
 * because the thing that differs is the CLASS: Capital Group's designations are
 * codes the equality test reaches, Fidelity's are words filers contract, so this
 * family opts into matching the class by the relation. What is checked here and
 * nowhere else:
 *   - the four observed contractions resolving and STAYING DISTINCT (`IPR` and
 *     `INSTP` to Institutional Premium, `PRM` and `PREMIE` to Premier), which is
 *     the conflation that would otherwise publish the wrong class on ~6,000 rows;
 *   - a bare `K` ABSTAINING in the Advisor series, which registers `Class K6` and
 *     no `Class K` — the relation alone would read it as K6;
 *   - that `fidelity` is skippable on the SERIES side, without which the whole
 *     family answers nothing;
 *   - that the per-series class uniqueness condition has a case at all. Over the
 *     whole LIVE family that condition is INERT — 0 tails derived from class
 *     words match two classes of one series — so the fixture carries a
 *     CONSTRUCTED series (`Premier Class` beside `Premium Class`, both matched by
 *     `prm`) and is labelled as the nearest reachable shape rather than claiming
 *     to be a real one. The condition is kept because the registry refreshes and
 *     the inertness is a property of that file, not of this code.
 * ========================================================================== */
const FID_FIXTURE = [
  ...R("FIDELITY ABERDEEN STREET TRUST", "Fidelity Freedom 2050 Fund",
    [["FFFHX", "Fidelity Freedom 2050 Fund"], ["FNSBX", "Class K"], ["FZTKX", "Class K6"],
      ["FFPFX", "Premier Class"]]),
  ...R("FIDELITY ABERDEEN STREET TRUST", "Fidelity Freedom Index 2050 Fund",
    [["FIPFX", "Investor Class"], ["FFOPX", "Institutional Premium Class"],
      ["FRLPX", "Premier Class"], ["FAVQX", "Premier II Class"]]),
  /* the Advisor ladder: `Class K6` and NO `Class K` — the `stated` case */
  ...R("FIDELITY ABERDEEN STREET TRUST", "Fidelity Advisor Freedom 2050 Fund",
    [["FFFLX", "Class A"], ["FFFPX", "Class I"], ["FVGLX", "Class K6"], ["FIJRX", "Class Z"]]),
  /* the Blend ladder is a REGISTERED mutual fund as well as a collective trust;
   * the per-row pooled gate is what keeps a trust-typed row blank, so this is
   * here to be measured rather than to be refused */
  ...R("FIDELITY ABERDEEN STREET TRUST", "Fidelity Freedom Blend 2050 Fund",
    [["FHWDX", "Class K"], ["FHEDX", "Class K6"], ["FFBWX", "Premier Class"]]),
  /* the INDEX ladder's income-stage fund, whose REGISTERED name is
   * `… Index Retirement Fund` and whose FORMER name — sourced from the issuer's
   * own 497, effective 2025-09-09 — is `… Index Income Fund`. The alias exists
   * for filings written before the rename. */
  ...R("FIDELITY ABERDEEN STREET TRUST", "Fidelity Freedom Index Retirement Fund",
    [["FIKFX", "Investor Class"], ["FFGZX", "Institutional Premium Class"],
      ["FAPIX", "Premier Class"], ["FATQX", "Premier II Class"]]),
  /* A SERIES A GENERIC `Retirement -> Income` REWRITE WOULD REACH AND THE
   * SOURCED MAP DOES NOT. Live: 13 series of this family carry `Retirement`
   * and five have a sourced former name, so this is the shape that prices the
   * difference rather than a constructed one. */
  ...R("FIDELITY ABERDEEN STREET TRUST", "Fidelity Managed Retirement 2015 Fund",
    [["FIRKX", "Class K"], ["FMRTX", "Class K6"]]),
  /* THE OTHER FOUR LADDERS RENAMED ON THE SAME DATE, so the fixture carries
   * every series the live former-name map names and `assertFamily`'s liveness
   * check can be asserted against it rather than skipped. Each is sourced in
   * `lib-af-abbrev.mjs` beside its entry. */
  ...R("FIDELITY ABERDEEN STREET TRUST", "Fidelity Freedom Retirement Fund",
    [["FFFAX", "Fidelity Freedom Retirement Fund"], ["FNSHX", "Class K"], ["FYTKX", "Class K6"]]),
  ...R("FIDELITY ABERDEEN STREET TRUST", "Fidelity Advisor Freedom Retirement Fund",
    [["FIAFX", "Class I"], ["FEGLX", "Class K6"]]),
  ...R("FIDELITY ABERDEEN STREET TRUST", "Fidelity Freedom Blend Retirement Fund",
    [["FHHEX", "Class K"], ["FHRDX", "Class K6"]]),
  ...R("FIDELITY ABERDEEN STREET TRUST", "Fidelity Flex Freedom Blend Retirement Fund",
    [["FTLSX", "Fidelity Flex Freedom Blend Retirement Fund"], ["FTLKX", "Class K6"]]),
  ...R("FIDELITY SALEM STREET TRUST", "Fidelity Strategic Real Return Fund",
    [["FSRKX", "Class K6"], ["FSRRX", "Fidelity Strategic Real Return Fund"]]),
  ...R("FIDELITY SALEM STREET TRUST", "Fidelity 500 Index Fund", [["FXAIX", "Fidelity 500 Index Fund"]]),
  /* CONSTRUCTED, and labelled: no live series puts two classes one tail can
   * match side by side, so the uniqueness condition would otherwise have no
   * single-protection case at all */
  ...R("FIDELITY ABERDEEN STREET TRUST", "Fidelity Freedom Index 2099 Fund",
    [["XXPRA", "Premier Class"], ["XXPRB", "Premium Class"], ["XXK6A", "Class K6"]]),
  /* CONSTRUCTED for the same reason: the `stated` refusal needs a designation of
   * at least two characters, or the class-run FLOOR protects the case as well
   * and neither condition is tested. Fidelity registers no two-character class
   * today, so `Class PRE` is put in the family to make `pre` a stated key while
   * `Premier Class` sits in another series for the relation to reach. */
  ...R("FIDELITY ABERDEEN STREET TRUST", "Fidelity Freedom Index 2098 Fund",
    [["XXPRE", "Class PRE"], ["XXK6B", "Class K6"]]),
  /* FOREIGN, with no family marker, so it must stay out of the derived family */
  ...R("VANGUARD INDEX FUNDS", "Vanguard 500 Index Fund", [["VFIAX", "Admiral Shares"]]),
];
const FIDX = M.buildFidIndex(FID_FIXTURE);
{
  const fam = [...FIDX.family].sort();
  if (JSON.stringify(fam) !== JSON.stringify(["FIDELITY ABERDEEN STREET TRUST", "FIDELITY SALEM STREET TRUST"]))
    bad(`the Fidelity class-ladder family derivation changed: ${JSON.stringify(fam)}`);
  /* the NAME TEST is the extra guard this family carries, because its marker
   * derives four registrants rather than thirty-nine and one foreign house
   * would be a quarter of it. Asserted by making it throw. */
  const poisoned = FID_FIXTURE.concat(R("FRANKLIN TEMPLETON TRUST", "Franklin Growth Fund", [["FKGRX", "Class K6"]]));
  let threw = false;
  try { M.assertFamily(M.buildFidIndex(poisoned)); } catch { threw = true; }
  if (!threw) bad("assertFamily did NOT throw on a foreign registrant carrying the family marker — the safety claim is unguarded");
  if (M.assertFamily(FIDX) !== 2) bad("assertFamily does not accept the two-registrant fixture family");
}

const FID_MUST_FIRE = [
  ["FID FDM IDX 2050 IPR", "FFOPX", "the class by the RELATION: Institutional Premium"],
  ["FID FDM IDX 2050 INSTP", "FFOPX", "a second contraction of the same class"],
  ["FID FDM IDX 2050 PRM", "FRLPX", "Premier — and NOT Institutional Premium"],
  ["FID FDM IDX 2050 INV", "FIPFX", "Investor, which no other class of that series can absorb"],
  ["Fidelity Freedom Index 2050 Premier", "FRLPX", "spelled out: the undamaged control, by EQUALITY"],
  ["Fidelity Freedom 2050 K", "FNSBX", "the class by EQUALITY, in a series that registers it"],
  ["FID FREEDOM 2050 K6", "FZTKX", "a code class, unchanged by any of this"],
  ["FID FRDM IDX 2050 Instl Premium", "FFOPX", "the class spelled out in two tokens"],
  /* the SOURCED FORMER NAME (2026-11-13): a filing written before the rename
   * states a name the registry no longer carries */
  ["Fidelity Freedom Index Income Fund Institutional Premium Class", "FFGZX",
    "the pre-2025-09-09 name of the Index Retirement fund, sourced from the issuer's 497"],
  ["Fidelity Freedom Index Inc Instl Prem", "FFGZX", "the same, contracted on BOTH sides"],
  ["Fidelity Freedom Index Income Premier", "FAPIX", "the former name with a different class"],
  ["Fidelity Freedom Index Retirement Fund Institutional Premium Class", "FFGZX",
    "the REGISTERED name still answers — the alias is additive, never a substitution"],
  ["Fidelity Advisor Freedom Income Fund Class I", "FIAFX",
    "`I` is a designation the Advisor ladder REGISTERS, so equality answers it — the double-product refusal must not reach the equality branch"],
];
for (const [n, want, why] of FID_MUST_FIRE) {
  const got = ask(M, FIDX, n);
  if (got !== want) bad(`FID MUST FIRE (${why}): ${JSON.stringify(n)} should answer ${want}, got ${got || "nothing"}`);
}

const FID_MUST_NOT = [
  ["FID ADV FDM 2050 K", "the Advisor series registers Class K6 and no Class K — a stated designation must ABSTAIN, never be offered the nearest class (protected twice: the class-run floor also refuses it)"],
  ["Fidelity Advisor Freedom 2050 K", "the same, spelled out"],
  ["FID FDM IDX 2050 IPR PRM", "two class claims at once"],
  ["FID FDM IDX 2050 P", "a one-character class run: the floor"],
  ["Fidelity Freedom 2050 P", "the same in a series where the prefix rule would allow it — the floor is the only protection"],
  ["FID FDM IDX 2050 PREMIE", "six characters and still ambiguous: a prefix of `Premier II Class` as well as of `Premier Class`"],
  ["FIDELITY FREEDOM INDEX 2050 IN", "a TRUNCATION, indistinguishable from Investor and from Institutional Premium"],
  ["Fidelity Freedom 2050 PRE", "the constructed designation: `pre` is a class key elsewhere in the family"],
  ["Fidelity Freedom 2050", "no class stated: the honest answer is a comparable, and comparables are the owner's"],
  ["FT BEHAV SM-CPEQ R6", "another house behind a short leading run — `FT` is Franklin Templeton's own"],
  ["FIT Balanced Portfolio Class C", "likewise, and the product pins no family series"],
  ["Fidelity 500 Index Fund K6", "a family series that does not register the stated class"],
  ["Fidelity Vanguard Freedom Index 2050 Premier", "a foreign house welded in behind a stated house"],
  ["Freedom Index 2050 Premier", "no leading house at all"],
  ["FID FDM IDX 2099 PRM", "the constructed series: `prm` matches Premier AND Premium, so the arm abstains"],
  ["Fidelity Managed Income 2015 Fund Class K",
    "a name NO filing has ever stated: the former-name map is ENUMERATED and sourced per fund, so a generic `Retirement -> Income` rewrite is not available to it"],
  ["FIDELITY FREEDOM 2050 INSTL",
    "`INSTL` is not a registered Fidelity designation and no ACTIVE Freedom series registers an institutional class, so the SERIES is unsettled — read against the filings, MasTec's statements say `Index` and Aristocrat's say only `Institutional`, and one key serves both"],
  ["FIDELITY FREEDOM INCOME INSTL", "the same spelling at the income stage"],
  ["Fidelity Freedom Index Income Inc",
    "the filer wrote the PRODUCT twice: `Inc` abbreviates `investor` under the relation and equally abbreviates `income`, so no class is stated — the position this project already took on `Fidelity Freedom Index Retirement Inc`"],
];
for (const [n, why] of FID_MUST_NOT) {
  const got = ask(M, FIDX, n);
  if (got) bad(`FID MUST NOT FIRE (${why}): ${JSON.stringify(n)} answered ${got}`);
}

const FID_MUTATIONS = [
  { name: "a STATED designation refuses the class relation",
    from: "      if (!fam.classRelation || stated || ck.length < 2) continue;",
    to: "      if (!fam.classRelation || ck.length < 2) continue;",
    /* `FID ADV FDM 2050 K` is the LIVE case and is protected TWICE — a bare `K`
     * also falls under the class-run floor — so it proves neither condition and
     * is asserted as a must-not-fire instead. This is the constructed
     * three-character designation, aimed at the series that registers `Premier
     * Class` and NO `Premier II`, so the prefix rule allows it and `stated` is
     * the only thing refusing it. */
    expect: [["Fidelity Freedom 2050 PRE", "FFPFX"]] },
  { name: "the class run letter floor",
    from: "      if (!fam.classRelation || stated || ck.length < 2) continue;",
    to: "      if (!fam.classRelation || stated) continue;",
    /* measured LIVE: with the floor removed, 34 single-character runs reach an
     * answer across the real family, `P` -> Premier in the 28 Freedom series
     * carrying no Premier II among them */
    expect: [["Fidelity Freedom 2050 P", "FFPFX"]] },
  { name: "a run that is also a PREFIX of a sibling class (a truncation, not an abbreviation)",
    from: "      if (s.classList.some((c) => c.ck !== cm[0].ck && c.ck.startsWith(ck))) continue;",
    to: "      if (false) continue;",
    /* both LIVE shapes: `PREMIE` is six characters and still ambiguous between
     * Premier and Premier II, and `IN` between Investor and Institutional
     * Premium — the floor cannot see either */
    expect: [["FID FDM IDX 2050 PREMIE", "FRLPX"], ["FIDELITY FREEDOM INDEX 2050 IN", "FIPFX"]] },
  { name: "class uniqueness WITHIN the series",
    from: "      if (cm.length !== 1) continue;             // ambiguous within the series: abstain",
    to: "      if (cm.length < 1) continue;",
    expect: [["FID FDM IDX 2099 PRM", "XXPRA"]] },
  { name: "the family's own skip set (the house word on the SERIES side)",
    from: "  skip: new Set([...BASE_SKIP, \"fidelity\"]), classRelation: true,",
    to: "  skip: new Set([...BASE_SKIP]), classRelation: true,",
    expect: [["FID FDM IDX 2050 IPR", null], ["Fidelity Freedom 2050 K", null]] },
  { name: "the SOURCED former-name ENTRY for the Index Retirement fund",
    from: '  "Fidelity Freedom Index Retirement Fund": "Fidelity Freedom Index Income Fund",',
    to: "",
    /* the DATA half: with the entry gone the readers of the pre-rename spelling
     * are back to a blank, which is what the entry buys */
    expect: [["Fidelity Freedom Index Income Fund Institutional Premium Class", null],
      ["Fidelity Freedom Index Inc Instl Prem", null]] },
  { name: "the alias token sets are TRIED at the series match",
    from: "      for (const S of [s.toks, ...(s.altToks || [])]) {",
    to: "      for (const S of [s.toks]) {",
    /* the CODE half: the map can be right and the loop still not read it */
    expect: [["Fidelity Freedom Index Income Fund Institutional Premium Class", null]] },
  { name: "a class run that could be the FORMER NAME's own word (the product typed twice)",
    from: "      if (s.formerOnly && s.formerOnly.length && absorbs(ck, s.formerOnly)) continue;",
    to: "      if (false) continue;",
    /* the LIVE case, and the only one over the whole family: `Inc` reaching
     * FIKFX's Investor Class on a name that already says `Income` */
    expect: [["Fidelity Freedom Index Income Inc", "FIKFX"]] },
  { name: "the former-name map is ENUMERATED, not a generic Retirement->Income rule",
    from: "      const former = fam.formerNames && fam.formerNames[name];",
    to: "      const former = fam.formerNames && (fam.formerNames[name] || (/\\bRetirement\\b/.test(name) ? name.replace(/\\bRetirement\\b/, \"Income\") : null));",
    /* THE ENUMERATION IS THE PROTECTION: the generic rule invents
     * `Fidelity Managed Income 2015 Fund`, a name no filing has ever stated,
     * and publishes a symbol on it as fact. */
    expect: [["Fidelity Managed Income 2015 Fund Class K", "FIRKX"]] },
  { name: "the class relation is OPT-IN per family (Capital Group must not take it)",
    from: "  markers: FAMILY_CLASSES, house: HOUSE_PHRASES, skip: SKIP, classRelation: false,",
    to: "  markers: FAMILY_CLASSES, house: HOUSE_PHRASES, skip: SKIP, classRelation: true,",
    /* `R2E` would EQUAL the class key and so answers under the shipped arm too;
     * `R2` abbreviates `Class R-2E` without equalling its key, so it answers
     * only if Capital Group takes the relation. */
    expect: [["AMERFUNDS 2055 TARG DATERET R2", "RBEMX"]], af: true },
];
for (const mut of FID_MUTATIONS) {
  if (!SRC.includes(mut.from)) { bad(`FID MUTATION "${mut.name}": its anchor is no longer in the source — re-derive it`); continue; }
  const src = SRC.split(mut.from).join(mut.to);
  let mod;
  try { mod = await load(src); } catch (e) { bad(`FID MUTATION "${mut.name}": the mutated module does not load (${String(e && e.name)})`); continue; }
  const base = mut.af ? IDX : FIDX;
  const idx2 = mut.af ? mod.buildAfIndex(FIXTURE) : mod.buildFidIndex(FID_FIXTURE);
  let ok = true;
  for (const [n, wantMutated] of mut.expect) {
    let b = null, got = null;
    try { b = ask(M, base, n); } catch { b = "(threw)"; }
    try { got = ask(mod, idx2, n); } catch { got = "(threw)"; }
    if (b === wantMutated) {
      ok = false;
      bad(`FID MUTATION "${mut.name}": the SHIPPED arm already answers ${JSON.stringify(b)} on ${JSON.stringify(n)} — this case cannot test that condition`);
    } else if (got !== wantMutated) {
      ok = false;
      bad(`FID MUTATION "${mut.name}" did NOT change the verdict on ${JSON.stringify(n)} (shipped ${b || "nothing"}, mutant ${got || "nothing"}, expected mutant ${wantMutated || "nothing"}) — DECORATIVE here, or the case is protected twice`);
    }
  }
  if (ok) console.error(`  mutation ok  ${mut.name}`);
}

/* ---------- INVARIANTS the Fidelity family adds ---------- */
{
  /* (5) the two families are DISJOINT: neither house phrase opens the other's
   *     names, so the order of the two arms at the call site cannot matter. */
  for (const n of FID_MUST_FIRE.map((x) => x[0])) if (ask(M, IDX, n))
    bad(`INVARIANT (5): the Capital Group family answered a Fidelity name: ${JSON.stringify(n)}`);
  for (const n of MUST_FIRE.map((x) => x[0])) if (ask(M, FIDX, n))
    bad(`INVARIANT (5): the Fidelity family answered a Capital Group name: ${JSON.stringify(n)}`);
  /* (6) `buildAfIndex` is a WRAPPER, not a second copy: it must agree with the
   *     generalised builder asked for the same family. */
  const viaCfg = M.buildFamilyIndex(FIXTURE, M.AF_FAMILY);
  if (viaCfg.family.size !== IDX.family.size || viaCfg.series.size !== IDX.series.size)
    bad("INVARIANT (6): buildAfIndex and buildFamilyIndex(.., AF_FAMILY) disagree");
  for (const [n] of MUST_FIRE) if (ask(M, viaCfg, n) !== ask(M, IDX, n))
    bad(`INVARIANT (6): the wrapper and the generalised builder disagree on ${JSON.stringify(n)}`);
  /* (7a) A SOURCED FORMER NAME THAT NAMES NO LIVE SERIES MUST THROW, not go
   *      quietly inert. The registry refreshes from the SEC; an alias whose key
   *      has been renamed again reaches no series and reads exactly like an
   *      alias that was never needed. */
  {
    const deadKey = { ...M.FID_FAMILY,
      formerNames: { "Fidelity Freedom Index Nonexistent Fund": "Fidelity Freedom Index Income Fund" } };
    let threw = false;
    try { M.assertFamily(M.buildFamilyIndex(FID_FIXTURE, deadKey)); } catch { threw = true; }
    if (!threw) bad("INVARIANT (7a): assertFamily did NOT throw on a former-name entry naming a series the registry does not carry — the alias can go inert unreported");
    /* and the SHIPPED map must pass it: the fixture carries all five renamed
     * series, so every entry is required to reach one */
    M.assertFamily(FIDX);
    if (Object.keys(M.FID_SERIES_FORMER_NAMES).length !== 5)
      bad(`INVARIANT (7a): the former-name map holds ${Object.keys(M.FID_SERIES_FORMER_NAMES).length} entries, not the 5 sourced renames the fixture pins`);
  }
  /* (7) the contractions stay DISTINCT — the conflation hazard, asserted rather
   *     than argued, in both directions. */
  if (ask(M, FIDX, "FID FDM IDX 2050 IPR") === ask(M, FIDX, "FID FDM IDX 2050 PRM"))
    bad("INVARIANT (7): Institutional Premium and Premier resolve to the SAME ticker");
}

/* ==========================================================================
 * THE VANGUARD FAMILY OF THE SAME ARM, 2026-11-16.
 *
 * Its own frozen registry, for the same CI-safety reason as the other two, and
 * every row below is COPIED FROM `sec-funds.json` rather than invented — the
 * share classes and symbols are the registry's, because a fixture that gets a
 * class wrong tests the fixture.
 *
 * WHAT IS CHECKED HERE AND NOWHERE ELSE:
 *   - the MARKER derives the family and the two registrants it must LEAVE OUT
 *     are in the fixture to be left out: `VANGUARD INSTITUTIONAL INDEX FUNDS`
 *     (VINIX / VIIIX — Vanguard's own, and no class called Admiral) and
 *     `FORUM FUNDS` (a FOREIGN house that registers `Institutional Plus
 *     Shares`, which is why that obvious widening of the marker is refused);
 *   - `INST` ABSTAINING, in two different shapes. It is a legitimate
 *     truncation of `Institutional Shares` AND of `Institutional Plus Shares`,
 *     and separately it is a SUBSEQUENCE of `Investor` — so a series carrying
 *     both institutional classes abstains on ambiguity and a series carrying
 *     only Investor abstains on the dedicated truncation rule. Two conditions,
 *     two cases, and the second is this family's own;
 *   - every COLLECTIVE-TRUST spelling abstaining. The registry holds the mutual
 *     fund, whose only class is `Investor Shares`; the trust's unit
 *     designations are not abbreviations of it. `VANGUARD TARGET RET 2040 II`
 *     matters most: `fund-er.js` resolves that exact spelling to a SOURCED
 *     trust unit-class price, so an asserted mutual-fund symbol there would be
 *     two vehicles on one row.
 * ========================================================================== */
const VG_FIXTURE = [
  ...R("VANGUARD TAX-MANAGED FUNDS", "Vanguard Developed Markets Index Fund",
    [["VTMGX", "Admiral Shares"], ["VTMNX", "Institutional Shares"], ["VEA", "ETF Shares"],
      ["VDIPX", "Institutional Plus Shares"], ["VDVIX", "Investor Shares"]]),
  ...R("VANGUARD INDEX FUNDS", "Vanguard 500 Index Fund",
    [["VFINX", "Investor Shares"], ["VFIAX", "Admiral Shares"], ["VOO", "ETF Shares"],
      ["VFFSX", "Institutional Select Shares"]]),
  ...R("VANGUARD INDEX FUNDS", "Vanguard Total Stock Market Index Fund",
    [["VTSMX", "Investor Shares"], ["VTSAX", "Admiral Shares"], ["VITSX", "Institutional Shares"],
      ["VTI", "ETF Shares"], ["VSMPX", "Institutional Plus Shares"], ["VSTSX", "Institutional Select Shares"]]),
  ...R("VANGUARD INDEX FUNDS", "Vanguard Mid-Cap Index Fund",
    [["VIMSX", "Investor Shares"], ["VIMAX", "Admiral Shares"], ["VMCIX", "Institutional Shares"],
      ["VO", "ETF Shares"], ["VMCPX", "Institutional Plus Shares"]]),
  ...R("VANGUARD INDEX FUNDS", "Vanguard Growth Index Fund",
    [["VIGRX", "Investor Shares"], ["VIGAX", "Admiral Shares"], ["VIGIX", "Institutional Shares"],
      ["VUG", "ETF Shares"]]),
  /* Windsor and Windsor II are DIFFERENT FUNDS at different fees, and the
   * ordered match is the only thing keeping them apart under `WNDSR` */
  ...R("VANGUARD WINDSOR FUNDS", "Vanguard Windsor Fund",
    [["VWNDX", "Investor Shares"], ["VWNEX", "Admiral Shares"]]),
  ...R("VANGUARD WINDSOR FUNDS", "Vanguard Windsor II Fund",
    [["VWNFX", "Investor Shares"], ["VWNAX", "Admiral Shares"]]),
  ...R("VANGUARD WORLD FUND", "Vanguard International Growth Fund",
    [["VWIGX", "Investor Shares"], ["VWILX", "Admiral Shares"]]),
  ...R("VANGUARD BOND INDEX FUNDS", "Vanguard Total Bond Market Index Fund",
    [["VBMFX", "Investor Shares"], ["VBTLX", "Admiral Shares"], ["VBTIX", "Institutional Shares"],
      ["BND", "ETF Shares"], ["VBMPX", "Institutional Plus Shares"], ["VTBSX", "Institutional Select Shares"]]),
  /* THE TARGET-DATE LADDER REGISTERS EXACTLY ONE CLASS, and that single fact is
   * what makes `Inst` dangerous here and `Trust II` harmless. Its registrant is
   * derived through a SIBLING series — PRIMECAP is the only Chester series with
   * an Admiral class — which is itself worth pinning: the marker reaches a
   * SERIES through its REGISTRANT, so a ladder registering one class only is in
   * the family or out of it on another fund's account. */
  ...R("VANGUARD CHESTER FUNDS", "Vanguard Target Retirement 2040 Fund", [["VFORX", "Investor Shares"]]),
  ...R("VANGUARD CHESTER FUNDS", "Vanguard PRIMECAP Fund",
    [["VPMCX", "Investor Shares"], ["VPMAX", "Admiral Shares"]]),
  /* OUT OF THE FAMILY, AND VANGUARD'S OWN: it registers no class called
   * Admiral, so the marker does not derive it. The gap is named in
   * `lib-af-abbrev.mjs` rather than papered over. */
  ...R("VANGUARD INSTITUTIONAL INDEX FUNDS", "Vanguard Institutional Index Fund",
    [["VINIX", "Institutional Shares"], ["VIIIX", "Institutional Plus Shares"]]),
  /* FOREIGN, and the reason `Institutional Plus Shares` cannot be a marker */
  ...R("FORUM FUNDS", "DF Dent Midcap Growth Fund",
    [["DFDMX", "Investor Shares"], ["DFMGX", "Institutional Shares"], ["DFMLX", "Institutional Plus Shares"]]),
  /* FOREIGN, no marker at all */
  ...R("FIDELITY SALEM STREET TRUST", "Fidelity 500 Index Fund", [["FXAIX", "Fidelity 500 Index Fund"]]),
];
const VGX = M.buildVgIndex(VG_FIXTURE);
{
  const fam = [...VGX.family].sort();
  const wantFam = ["VANGUARD BOND INDEX FUNDS", "VANGUARD CHESTER FUNDS", "VANGUARD INDEX FUNDS",
    "VANGUARD TAX-MANAGED FUNDS", "VANGUARD WINDSOR FUNDS", "VANGUARD WORLD FUND"];
  if (JSON.stringify(fam) !== JSON.stringify(wantFam))
    bad(`the Vanguard marker derivation changed: ${JSON.stringify(fam)}`);
  for (const out of ["VANGUARD INSTITUTIONAL INDEX FUNDS", "FORUM FUNDS", "FIDELITY SALEM STREET TRUST"])
    if (VGX.family.has(out)) bad(`${out} must NOT be in the Vanguard family`);
  /* THE SHIPPED BAND IS A LIVE-REGISTRY NUMBER (28 registrants) AND A FIXTURE
   * CANNOT CARRY IT WITHOUT BEING A COPY OF THE REGISTRY — so the band is
   * asserted by making it REFUSE this six-registrant family, which is the only
   * way to show it is wired at all, and the rest of the config is then exercised
   * through a band-widened clone. */
  let bandThrew = false;
  try { M.assertFamily(VGX); } catch (e) { bandThrew = /outside 22-36/.test(String(e.message)); }
  if (!bandThrew) bad("the Vanguard band is not wired: assertFamily accepted a 6-registrant family, or threw for another reason");
  const WIDE = { ...M.VG_FAMILY, band: [1, 99] };
  if (M.assertFamily(M.buildFamilyIndex(VG_FIXTURE, WIDE)) !== 6)
    bad("assertFamily does not accept the band-widened Vanguard fixture family");
  /* the NAME TEST, asserted by poisoning: this family's marker is one class
   * name, so a foreign registrant adopting it would void the safety claim */
  {
    const poisoned = VG_FIXTURE.concat(R("FRANKLIN TEMPLETON TRUST", "Franklin Growth Fund", [["FKGRX", "Admiral Shares"]]));
    let threw = false;
    try { M.assertFamily(M.buildFamilyIndex(poisoned, WIDE)); } catch { threw = true; }
    if (!threw) bad("assertFamily did NOT throw on a foreign registrant carrying `Admiral Shares` — the Vanguard safety claim is unguarded");
  }
  /* and `must` must be LIVE: drop one of the named registrants and the gate has
   * to fail rather than go silently inert on a registry refresh */
  {
    const dropped = VG_FIXTURE.filter((r) => !String(r[0]).startsWith("VANGUARD WINDSOR FUNDS"));
    let threw = false;
    try { M.assertFamily(M.buildFamilyIndex(dropped, WIDE)); } catch { threw = true; }
    if (!threw) bad("assertFamily did NOT throw when a `must` registrant left the Vanguard family");
  }
  if (!M.VG_FAMILY.must.includes("VANGUARD WINDSOR FUNDS"))
    bad("the Vanguard `must` list no longer names the registrant the liveness control drops");
}

const VG_MUST_FIRE = [
  ["VGD DEVELOPED MARKETS INDEX FUND INSTITUTIONAL", "VTMNX", "the motivating spelling: house contracted, class spelled out"],
  ["VGD DEVELOPED MKTS INDX ADM", "VTMGX", "both sides contracted, class by the RELATION"],
  ["VANGUARD DEVELOPED MARKETS INDEX FUND ADMIRAL SHARES", "VTMGX", "the undamaged control, by EQUALITY"],
  ["VGD TOTAL STOCK MKT INDX ADM", "VTSAX", "three contracted product tokens"],
  ["VGD MCP INDEX ADM", "VIMAX", "`mcp` is ONE filed token consuming TWO series words"],
  ["VGD INTL GROWTH ADM", "VWILX", "`intl` -> international"],
  ["VGD WNDSR ADM", "VWNEX", "Windsor — and NOT Windsor II, which the ordered match refuses"],
  ["VGD WNDSR II ADM", "VWNAX", "Windsor II: a different fund and a different fee"],
  ["Vanguard Total Bond Market Index Fund Instl Plus", "VBMPX", "a two-token class run"],
  ["VANG MD CP IDX IS PL", "VMCPX", "... and the same class in four characters"],
  ["VGD TARGET RETIRE 2040 INV", "VFORX", "the MUTUAL fund, Investor class stated"],
  ["Vanguard 500 Index Fund ETF Shares", "VOO", "the ETF class is a registered class and the filing states it"],
  ["Vanguard Growth Index Fund Institutional", "VIGIX", "institutional where the series registers it"],
];
for (const [n, want, why] of VG_MUST_FIRE) {
  const got = ask(M, VGX, n);
  if (got !== want) bad(`VG MUST FIRE (${why}): ${JSON.stringify(n)} should answer ${want}, got ${got || "nothing"}`);
}

const VG_MUST_NOT = [
  ["VGD DEVELOPED MKTS INDX INST", "`INST` truncates Institutional AND Institutional Plus, two classes of this very series at two different fees"],
  ["Vanguard Developed Markets Index Fund Inst", "the same, spelled out"],
  ["Vanguard Target Retirement 2040 Inst", "`inst` is a SUBSEQUENCE of `investor` and this series registers nothing else — the dedicated truncation rule is the only protection"],
  ["Vanguard Windsor Fund Inst", "the same shape in a series registering Investor and Admiral"],
  ["Vanguard 500 Index Fund", "no class stated: the honest answer is a comparable, and comparables are the owner's"],
  ["Vanguard Growth Index Fund E", "a one-character class run"],
  ["VGD INDEX ADM", "a product too generic to pin one series"],
  ["500 Index Fund Admiral Shares", "no leading house: that row is `admAsk`'s, not this arm's"],
  ["Fidelity Vanguard 500 Index Fund Admiral", "a foreign house in the LEAD"],
  ["Vanguard Fidelity 500 Index Admiral", "a foreign house welded in behind a stated house"],
  ["Vanguard Institutional Index Fund Institutional Plus", "VINIX's registrant is OUTSIDE the derived family — it registers no class called Admiral"],
  ["Vanguard DF Dent Midcap Growth Institutional Plus", "a FOREIGN registrant that does register Institutional Plus Shares"],
  /* EVERY COLLECTIVE-TRUST SPELLING. The registry holds the mutual fund and its
   * one Investor class; the trust's unit designations are not abbreviations of
   * it, and a filed `Trust` token has no series word left to consume. */
  ["Vanguard Target Retirement 2040 Trust", "a collective trust, not the fund"],
  ["Vanguard Target Retirement 2040 Trust I", "its unit class I"],
  ["Vanguard Target Retirement 2040 Trust II", "... II"],
  ["Vanguard Target Retirement 2040 Trust Plus", "... Plus"],
  ["Vanguard Target Retirement 2040 Trust Select", "... Select"],
  ["VANGUARD TARGET RET 2040 II", "the spelling with NO `Trust` word, which fund-er.js resolves to a SOURCED trust unit price — two vehicles on one row if this answered"],
  ["VGD TGT RETIRE 2040 TR II", "the same, contracted"],
];
for (const [n, why] of VG_MUST_NOT) {
  const got = ask(M, VGX, n);
  if (got) bad(`VG MUST NOT FIRE (${why}): ${JSON.stringify(n)} answered ${got}`);
}

/* ==========================================================================
 * THE JOHN HANCOCK FAMILY, 2026-11-16, and the LEADING-TOKEN DIGIT REPAIR.
 *
 * The fixture carries three kinds of registrant on purpose: the three that
 * register `Class NAV` (the family), a John Hancock trust that does NOT
 * (`JOHN HANCOCK BOND TRUST`, so the marker is shown to be a marker and not a
 * name test), and `JOHN HANCOCK VARIABLE INSURANCE TRUST`, whose `NAV`, `NAV
 * Class` and `Series I` designations are a VARIABLE-ANNUITY ladder — excluded
 * by requiring the exact string `class nav`, which is a property worth pinning
 * because a plan does not buy those.
 * ========================================================================== */
const JH_FIXTURE = [
  ...R("John Hancock Funds III", "John Hancock Disciplined Value Mid Cap Fund",
    [["JVMAX", "Class A"], ["JVMIX", "Class I"], ["JVMCX", "Class C"], ["JVMRX", "Class R6"],
      ["JVMSX", "Class R2"], ["JVMTX", "Class R4"]]),
  ...R("John Hancock Funds III", "John Hancock Disciplined Value Fund",
    [["JVLAX", "Class A"], ["JVLCX", "Class C"], ["JVLIX", "Class I"], ["JDVFX", "Class R4"],
      ["JDVVX", "CLASS R5"], ["JDVNX", "Class NAV"], ["JDVWX", "Class R6"], ["JDVPX", "Class R2"]]),
  /* the two 2040 ladders, which are what `portfolio`-in-skip buys and what the
   * within-family uniqueness test has to separate */
  ...R("John Hancock Funds II", "Multimanager 2040 Lifetime Portfolio",
    [["JLIAX", "Class A"], ["JLIGX", "Class R4"], ["JLIHX", "CLASS R5"], ["JLIOX", "Class 1"],
      ["JLIIX", "Class R6"], ["JLIEX", "Class R2"], ["JHRDX", "Class I"]]),
  ...R("John Hancock Funds II", "2040 Lifetime Blend Portfolio",
    [["JRTTX", "Class 1"], ["JRTVX", "Class R4"], ["JRTWX", "Class R6"], ["JHBAX", "Class A"]]),
  ...R("JOHN HANCOCK INVESTMENT TRUST", "BALANCED FUND",
    [["SVBAX", "Class A"], ["SVBCX", "Class C"], ["SVBIX", "Class I"], ["JBAFX", "Class R4"],
      ["JBAVX", "CLASS R5"], ["JBAWX", "Class R6"], ["JBATX", "Class R2"]]),
  /* THE MARKER REACHES A SERIES THROUGH ITS REGISTRANT, so each of the three
   * needs a series that actually carries `Class NAV` — none of the funds above
   * does, and the first draft of this fixture derived ONE registrant and said
   * so. These two are what put Funds II and the Investment Trust in the family. */
  ...R("JOHN HANCOCK INVESTMENT TRUST", "Fundamental Large Cap Core Fund",
    [["TAGRX", "Class A"], ["JLVIX", "Class I"], ["JLCWX", "Class R6"], ["JLCNX", "Class NAV"]]),
  ...R("John Hancock Funds II", "Core Bond Fund",
    [["JHCDX", "Class NAV"], ["JICDX", "Class 1"]]),
  /* John Hancock's own, and OUT: it registers no Class NAV */
  ...R("JOHN HANCOCK BOND TRUST", "John Hancock Investment Grade Bond Fund",
    [["TAUSX", "Class A"], ["TIUSX", "Class I"], ["JIGEX", "Class R6"]]),
  /* John Hancock's own VARIABLE-ANNUITY ladder, and OUT: `NAV` is not `Class NAV` */
  ...R("JOHN HANCOCK VARIABLE INSURANCE TRUST", "500 Index Trust",
    [["JAGMX", "NAV"], ["JFIVX", "Series I"], ["JAGKX", "Series II"]]),
  /* FOREIGN, registering Class R6 — the marker's single-protection case */
  ...R("MFS SERIES TRUST I", "MFS Value Fund", [["MEIKX", "Class R6"], ["MEIAX", "Class A"]]),
];
const JHX = M.buildJhIndex(JH_FIXTURE);
{
  const fam = [...JHX.family].sort();
  const wantFam = ["JOHN HANCOCK INVESTMENT TRUST", "John Hancock Funds II", "John Hancock Funds III"];
  if (JSON.stringify(fam) !== JSON.stringify(wantFam))
    bad(`the John Hancock marker derivation changed: ${JSON.stringify(fam)}`);
  for (const out of ["JOHN HANCOCK BOND TRUST", "JOHN HANCOCK VARIABLE INSURANCE TRUST", "MFS SERIES TRUST I"])
    if (JHX.family.has(out)) bad(`${out} must NOT be in the John Hancock family`);
  if (M.assertFamily(JHX) !== 3) bad("assertFamily does not accept the three-registrant John Hancock fixture family");
  {
    const poisoned = JH_FIXTURE.concat(R("FRANKLIN TEMPLETON TRUST", "Franklin Growth Fund", [["FKGRX", "Class NAV"]]));
    let threw = false;
    try { M.assertFamily(M.buildJhIndex(poisoned)); } catch { threw = true; }
    if (!threw) bad("assertFamily did NOT throw on a foreign registrant carrying `Class NAV`");
  }
  {
    const dropped = JH_FIXTURE.filter((r) => !String(r[0]).startsWith("JOHN HANCOCK INVESTMENT TRUST"));
    let threw = false;
    try { M.assertFamily(M.buildJhIndex(dropped)); } catch { threw = true; }
    if (!threw) bad("assertFamily did NOT throw when a `must` registrant left the John Hancock family");
  }
}

const JH_MUST_FIRE = [
  ["JHCOCK3 DISCIPLINED VAL MCP R6", "JVMRX", "THE MOTIVATING ROW: the trailing `3` on the house token"],
  ["JHancock3 Disciplined Val Md cp R6", "JVMRX", "the same defect in the spelling the store actually carries"],
  ["JHCOCK DISCIPLINED VAL MCP R6", "JVMRX", "... and without the digits"],
  ["JOHN HANCOCK DISCIPLINED VALUE MID CAP R6", "JVMRX", "the undamaged control"],
  ["John Hancock Disciplined Value Mid Cap Fund Class R6", "JVMRX", "spelled out with the designation word"],
  ["JH DSCPL VAL MDCP R6", "JVMRX", "a two-letter house run, read in the store"],
  ["J H BALANCED I", "SVBIX", "the house as two single letters, and Class I"],
  ["JOHN HANCOCK DISCIPLINED VALUE R6", "JDVWX", "a DIFFERENT fund: Mid Cap is refused by the ordered match"],
  ["JOHN HANCOCK BALANCED R6", "JBAWX", "a series carrying no house of its own"],
  ["JOHN HANCOCK MULTIMANAGER 2040 LIFETIME R6", "JLIIX", "`Portfolio` left out: the family's own skip word"],
  ["JOHN HANCOCK 2040 LIFETIME BLEND R6", "JRTWX", "the other 2040 ladder, which must not be confused with it"],
  ["JHancock Disciplined Value Mid Cap R2", "JVMSX", "R-2 is a different class and a different ticker"],
];
for (const [n, want, why] of JH_MUST_FIRE) {
  const got = ask(M, JHX, n);
  if (got !== want) bad(`JH MUST FIRE (${why}): ${JSON.stringify(n)} should answer ${want}, got ${got || "nothing"}`);
}

const JH_MUST_NOT = [
  ["John Hancock Disciplined Value Mid Cap NAV", "that series registers A, C, I, R2, R4 and R6 and NO Class NAV — a stated designation must abstain, never be offered the nearest class"],
  ["John Hancock Disciplined Value Mid Cap 1", "... nor a Class 1, which the Lifetime ladders do register"],
  ["John Hancock Investment Grade Bond R6", "a John Hancock fund OUTSIDE the derived family: its registrant carries no Class NAV"],
  ["John Hancock 500 Index Trust NAV", "the VARIABLE-ANNUITY ladder, excluded by requiring the exact string `class nav`"],
  ["JOHN HANCOCK 2040 LIFETIME R6", "Blend or Multimanager: two series, so the arm abstains"],
  ["JHCOCK2 BOND R6", "`bond` pins no unique series"],
  ["Disciplined Value Mid Cap R6", "no leading house at all"],
  ["2040 LIFETIME BLEND R6", "likewise, and a leading VINTAGE strips to nothing"],
  ["JOHN HANCOCK VANGUARD DISCIPLINED VALUE R6", "a foreign house welded in behind a stated house"],
  ["JOHN HANCOCK MFS VALUE R6", "a foreign registrant whose series DOES register Class R6"],
  ["John Hancock Disciplined Value Mid Cap Fund", "no class stated"],
  ["John Hancock Disciplined Value Mid Cap R", "a one-character class run"],
];
for (const [n, why] of JH_MUST_NOT) {
  const got = ask(M, JHX, n);
  if (got) bad(`JH MUST NOT FIRE (${why}): ${JSON.stringify(n)} answered ${got}`);
}

/* ---------- the LEADING-TOKEN DIGIT REPAIR, asked of the OLDEST family ------
 * A VINTAGE IS NEVER THE LEADING HOUSE TOKEN, and the Capital Group family is
 * where that is load-bearing rather than decorative: the year IS the product
 * there. So the narrowing is proved on the ladder it would destroy. */
const DIGIT_CASES = [
  ["AMERFUNDS 2035 TARG DATERET R6", "RFFTX", "the vintage sits in position 2 and the strip cannot reach it"],
  ["AMERFUNDS2 2035 TARG DATERET R6", "RFFTX", "a digit run on the HOUSE, with the vintage intact"],
  ["AMERFUNDS2035 TARG DATERET R6", null, "the vintage WELDED onto the house is lost with it, and the arm ABSTAINS rather than picking a year"],
  ["AMERFUNDS3 AMER BALANCED - R6", "RLBGX", "a digit run on the house of a product with no vintage at all"],
];
for (const [n, want, why] of DIGIT_CASES) {
  const got = ask(M, IDX, n);
  if (got !== want) bad(`DIGIT CASE (${why}): ${JSON.stringify(n)} should answer ${want || "nothing"}, got ${got || "nothing"}`);
}

const VGJH_MUTATIONS = [
  { name: "the Vanguard family is derived from a MARKER, not named",
    from: '  markers: new Set(["admiral shares"]), house: [["vanguard"]],',
    to: '  markers: new Set(["admiral shares", "institutional plus shares"]), house: [["vanguard"]],',
    /* the obvious widening, and the case is Vanguard's own registrant: with
     * `Institutional Plus Shares` as a marker VINIX's trust joins the family —
     * and so does FORUM FUNDS, which is why the widening is refused rather
     * than taken. The `assertFamily` half of that is asserted above. */
    expect: [["Vanguard Institutional Index Fund Institutional Plus", "VIIIX"],
      ["Vanguard DF Dent Midcap Growth Institutional Plus", "DFMLX"]], vg: true },
  { name: "the Vanguard family's own skip set (the house word on the SERIES side)",
    from: '  skip: new Set([...BASE_SKIP, "vanguard"]), classRelation: true,\n  band: [22, 36], nameTest: /vanguard/i,',
    to: '  skip: new Set([...BASE_SKIP]), classRelation: true,\n  band: [22, 36], nameTest: /vanguard/i,',
    expect: [["VGD DEVELOPED MKTS INDX ADM", null], ["VGD WNDSR ADM", null]], vg: true },
  { name: "the class RELATION is opt-in and Vanguard must take it",
    from: '  skip: new Set([...BASE_SKIP, "vanguard"]), classRelation: true,\n  band: [22, 36], nameTest: /vanguard/i,',
    to: '  skip: new Set([...BASE_SKIP, "vanguard"]), classRelation: false,\n  band: [22, 36], nameTest: /vanguard/i,',
    /* `ADMIRAL` equals the class key and answers either way; `ADM` does not,
     * so it answers only if this family matches the class by the relation */
    expect: [["VGD DEVELOPED MKTS INDX ADM", null], ["VGD MCP INDEX ADM", null]], vg: true },
  { name: "a run that TRUNCATES a designation the series does not register",
    from: "      if (!cm[0].ck.startsWith(ck) && idx.famClassKeys\n        && [...idx.famClassKeys].some((fk) => fk !== cm[0].ck && fk.startsWith(ck))) continue;",
    to: "      if (false) continue;",
    /* `inst` is a SUBSEQUENCE of `investor`, and the Target Retirement ladder
     * registers Investor Shares and nothing else — so the uniqueness test sees
     * one match, the sibling-prefix test sees no sibling, and without this
     * condition the arm publishes the Investor class on a filing that says
     * INSTITUTIONAL. Two live shapes, one per series kind. */
    expect: [["Vanguard Target Retirement 2040 Inst", "VFORX"],
      ["Vanguard Windsor Fund Inst", "VWNDX"]], vg: true },
  { name: "the truncation rule spares a run that truncates the class it MATCHED",
    from: "      if (!cm[0].ck.startsWith(ck) && idx.famClassKeys",
    to: "      if (idx.famClassKeys",
    /* WITHOUT that clause the new condition swallows three shipped ones: `PRE`
     * (`stated`'s own case), `P` (the floor's) and `PREMIE` (the sibling-prefix
     * rule's) are each refused a second time and none of them decides anything
     * any more — and `stated` becomes unreachable by construction, since a key
     * always starts with itself.
     *
     * THE CASE IS A FIELD-WIDTH TRUNCATION, which is the shape that makes the
     * clause necessary rather than tidy. `Instituti` truncates `Institutional`
     * — the class the run MATCHED — and it equally truncates
     * `Institutional Plus`, a designation the family registers elsewhere. The
     * Growth Index series registers Institutional and NO Plus, so inside its own
     * series the run is settled and the shipped arm answers; the series-level
     * prefix rule above cannot be what spares it, because there is no sibling to
     * be confused with. On a series that DOES register both, that rule refuses
     * the same run — which is why this case had to be drawn from a series that
     * does not, or it would be protected twice and prove nothing. */
    expect: [["Vanguard Growth Index Fund Instituti", null]], vg: true },
  { name: "the John Hancock family is derived from `Class NAV`",
    from: '  markers: new Set(["class nav"]), house: [["john", "hancock"]],',
    to: '  markers: new Set(["class r6"]), house: [["john", "hancock"]],',
    expect: [["JOHN HANCOCK MFS VALUE R6", "MEIKX"]], jh: true },
  { name: "`portfolio` in the John Hancock skip set",
    from: '  skip: new Set([...BASE_SKIP, "john", "hancock", "portfolio"]), classRelation: false,',
    to: '  skip: new Set([...BASE_SKIP, "john", "hancock"]), classRelation: false,',
    /* 62 of the 87 live series are `… Portfolio`: without this the whole
     * target-date and lifestyle half of the family abstains */
    expect: [["JOHN HANCOCK MULTIMANAGER 2040 LIFETIME R6", null],
      ["JOHN HANCOCK 2040 LIFETIME BLEND R6", null]], jh: true },
  { name: "the LEADING-TOKEN digit repair exists at all",
    from: "  if (!T.length || !LEAD_DIGITS.test(T[0])) return 0;\n  return houseRunAsFiled([T[0].replace(LEAD_DIGITS, \"\"), ...T.slice(1)], phrases);",
    to: "  return 0;",
    expect: [["JHCOCK3 DISCIPLINED VAL MCP R6", null], ["JHancock3 Disciplined Val Md cp R6", null]], jh: true },
  { name: "the digit repair is the LEADING token's and NOT every token's",
    from: "  if (!T.length || !LEAD_DIGITS.test(T[0])) return 0;\n  return houseRunAsFiled([T[0].replace(LEAD_DIGITS, \"\"), ...T.slice(1)], phrases);",
    to: "  if (!T.length) return 0;\n  return houseRunAsFiled(T.map((t) => t.replace(LEAD_DIGITS, \"\")), phrases);",
    /* THE DIRECTION HERE IS THE MUTANT ANSWERING, NOT LOSING, and the first
     * version of this control had it backwards. The narrowing does NOT protect
     * the VINTAGE: `houseRun` returns a token COUNT and `afAbbrevAsk` slices
     * `rest` out of the ORIGINAL tokens, so nothing can rewrite a year in
     * position 2 — `AMERFUNDS2 2035 TARG DATERET R6` answers RFFTX under BOTH
     * versions, which is exactly how the false claim was caught.
     *
     * What the narrowing really decides is whether a digit welded onto the
     * SECOND house token is forgiven, and it is only reachable at all for the
     * TWO-WORD phrases whose first token cannot satisfy them alone: `AMERICAN`
     * does not cover the mandatory `f` of `american funds`, so the as-filed
     * pass reads 0 and the leading-token strip has nothing to fix — while
     * `JOHN` DOES cover the `h` of `john hancock` (j-o-h-n spread over
     * `johnhancock` at 0,1,4,6), so every `JOHN HANCOCK3 …` already gets a
     * house run of 1 and this condition never sees it. */
    expect: [["AMERICAN FUNDS2 2035 TARG DATERET R6", "RFFTX"]], af: true },
];
for (const mut of VGJH_MUTATIONS) {
  if (!SRC.includes(mut.from)) { bad(`VG/JH MUTATION "${mut.name}": its anchor is no longer in the source — re-derive it`); continue; }
  const src = SRC.split(mut.from).join(mut.to);
  let mod;
  try { mod = await load(src); } catch (e) { bad(`VG/JH MUTATION "${mut.name}": the mutated module does not load (${String(e && e.name)})`); continue; }
  const base = mut.af ? IDX : mut.jh ? JHX : VGX;
  const fix = mut.af ? FIXTURE : mut.jh ? JH_FIXTURE : VG_FIXTURE;
  const idx2 = mut.af ? mod.buildAfIndex(fix) : mut.jh ? mod.buildJhIndex(fix) : mod.buildVgIndex(fix);
  let ok = true;
  for (const [n, wantMutated] of mut.expect) {
    let b = null, got = null;
    try { b = ask(M, base, n); } catch { b = "(threw)"; }
    try { got = ask(mod, idx2, n); } catch { got = "(threw)"; }
    if (b === wantMutated) {
      ok = false;
      bad(`VG/JH MUTATION "${mut.name}": the SHIPPED arm already answers ${JSON.stringify(b)} on ${JSON.stringify(n)} — this case cannot test that condition`);
    } else if (got !== wantMutated) {
      ok = false;
      bad(`VG/JH MUTATION "${mut.name}" did NOT change the verdict on ${JSON.stringify(n)} (shipped ${b || "nothing"}, mutant ${got || "nothing"}, expected mutant ${wantMutated || "nothing"}) — DECORATIVE here, or the case is protected twice`);
    }
  }
  if (ok) console.error(`  mutation ok  ${mut.name}`);
}

/* ---------- INVARIANTS the two new families add ---------- */
{
  const FAMS = [["Capital Group", IDX, MUST_FIRE], ["Fidelity", FIDX, FID_MUST_FIRE],
    ["Vanguard", VGX, VG_MUST_FIRE], ["John Hancock", JHX, JH_MUST_FIRE]];
  /* (8) ALL FOUR families are pairwise DISJOINT, so the ORDER of the four
   *     `!out` blocks at the call site cannot change an answer. Each phrase's
   *     first letter is mandatory under the relation and the four differ, but
   *     that is an argument; this is the assertion, over all twelve ordered
   *     pairs rather than the two the Fidelity ship checked. */
  for (const [an, ai] of FAMS) for (const [bn, , bFire] of FAMS) {
    if (an === bn) continue;
    for (const [n] of bFire) if (ask(M, ai, n))
      bad(`INVARIANT (8): the ${an} family answered a ${bn} name: ${JSON.stringify(n)}`);
  }
  /* (9) `buildVgIndex` and `buildJhIndex` are WRAPPERS, not second copies */
  for (const [label, wrap, cfg, fix, fire] of [
    ["Vanguard", VGX, M.VG_FAMILY, VG_FIXTURE, VG_MUST_FIRE],
    ["John Hancock", JHX, M.JH_FAMILY, JH_FIXTURE, JH_MUST_FIRE]]) {
    const viaCfg = M.buildFamilyIndex(fix, cfg);
    if (viaCfg.family.size !== wrap.family.size || viaCfg.series.size !== wrap.series.size)
      bad(`INVARIANT (9): the ${label} wrapper and buildFamilyIndex disagree`);
    for (const [n] of fire) if (ask(M, viaCfg, n) !== ask(M, wrap, n))
      bad(`INVARIANT (9): the ${label} wrapper and the generalised builder disagree on ${JSON.stringify(n)}`);
  }
  /* (10) THE ORDERING INSIDE `houseRun` IS A SCOPE LIMIT, NOT A GUARD, and this
   *      is the assertion that stands in for the condition deliberately NOT
   *      written. A filed token carrying a digit can never satisfy the as-filed
   *      relation, because every head token must consume at least one phrase
   *      word and a digit has nothing to match — so a DIGITS-ONLY leading token
   *      strips to the empty string and is refused by the relation itself. */
  const PH = [["american", "funds"], ["capital", "group"], ["fidelity"], ["vanguard"], ["john", "hancock"]];
  for (const [t, want] of [["amerfunds2", 1], ["jhcock3", 1], ["vgd1", 1], ["fid3", 1],
    ["2040", 0], ["", 0], ["x9", 0], ["2040amerfunds", 0]])
    if (M.houseRun([t, "x", "y"], PH) !== want)
      bad(`INVARIANT (10): houseRun on a leading ${JSON.stringify(t)} is ${M.houseRun([t, "x", "y"], PH)}, not ${want}`);
  /* (11) and the class relation is a STRICTNESS CHOICE for John Hancock rather
   *      than a live difference, which is worth asserting because the family
   *      header claims it: its designations are CODES, so the relation can only
   *      ever reach what equality already reaches. Asserted over the fixture's
   *      whole must-fire and must-not-fire set rather than argued. */
  {
    const relOn = M.buildFamilyIndex(JH_FIXTURE, { ...M.JH_FAMILY, classRelation: true });
    for (const [n] of [...JH_MUST_FIRE, ...JH_MUST_NOT.map((x) => [x[0]])])
      if (ask(M, relOn, n) !== ask(M, JHX, n))
        bad(`INVARIANT (11): John Hancock's classRelation:false is NOT merely stricter — ${JSON.stringify(n)} answers ${ask(M, relOn, n)} with the relation on and ${ask(M, JHX, n)} with it off; price it before leaving it off`);
  }
}

if (fails) { console.error(`\naf-abbrev-test: ${fails} FAILURE(S)`); process.exit(1); }
console.error(`af-abbrev-test OK  (${MUST_FIRE.length + FID_MUST_FIRE.length + VG_MUST_FIRE.length + JH_MUST_FIRE.length + DIGIT_CASES.length} must-fire, ${MUST_NOT.length + FID_MUST_NOT.length + VG_MUST_NOT.length + JH_MUST_NOT.length} must-not-fire, ${MUTATIONS.length + FID_MUTATIONS.length + VGJH_MUTATIONS.length} mutations, 11 invariants)`);
