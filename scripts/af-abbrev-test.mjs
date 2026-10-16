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
    from: "      if (!abbreviates(head, s.toks, 3, fam.skip)\n        && !abbreviatesVintageLifted(head, s.toks, fam.skip)) continue;",
    to: "      if (!abbreviates(head, s.toks, 3, fam.skip)) continue;",
    expect: [["American Funds Trgt Date Ret 2055 R6", null]] },
  { name: "the registry-derived family restriction",
    from: "    if (!family.has(reg)) continue;",
    to: "    if (false) continue;",
    expect: [["American Funds MFS Value R6", "MEIKX"]] },
  { name: "the stated class must be one the series registers",
    from: "      if (s.classes.has(ck)) { hits.push({ ticker: s.classes.get(ck), series: s.name, reg: s.reg, ck, how: \"equal\" }); continue; }",
    to: "      { hits.push({ ticker: s.classes.get(ck) || [...s.classes.values()][0], series: s.name, reg: s.reg, ck, how: \"equal\" }); continue; }",
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
  /* (7) the contractions stay DISTINCT — the conflation hazard, asserted rather
   *     than argued, in both directions. */
  if (ask(M, FIDX, "FID FDM IDX 2050 IPR") === ask(M, FIDX, "FID FDM IDX 2050 PRM"))
    bad("INVARIANT (7): Institutional Premium and Premier resolve to the SAME ticker");
}

if (fails) { console.error(`\naf-abbrev-test: ${fails} FAILURE(S)`); process.exit(1); }
console.error(`af-abbrev-test OK  (${MUST_FIRE.length + FID_MUST_FIRE.length} must-fire, ${MUST_NOT.length + FID_MUST_NOT.length} must-not-fire, ${MUTATIONS.length + FID_MUTATIONS.length} mutations, 7 invariants)`);
