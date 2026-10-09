#!/usr/bin/env node
/* CONTROL for merge-4i's LOST-SPACE REPAIR — in the repo, because the last
 * generator that lived in a session scratchpad was wiped by a container
 * restart. Run: node scripts/merge-name-test.mjs
 *
 * It slices the SHIPPED weldRepair out of merge-4i rather than restating it,
 * builds the attestation maps from the live store the way the block does, and
 * asserts 20 pinned cases. Then it removes ONE condition — the repaired WHOLE
 * NAME must stand alone elsewhere — and shows that the predicate immediately
 * convicts exactly the family that condition exists to protect: real firm
 * names that are merely rare (FirstEnergy, ExxonMobil, BancPlus, HomeTrust,
 * LifePoint, SoundShore) and a double render welded at the seam. A control
 * that cannot fail is decorative; this one names its own casualties.
 */
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isGenericTypeName } from "./lib-4i.mjs";
import { hasNoFundIdentity } from "./lib-disclose.mjs";
/* NEVER a hardcoded sandbox path: `cwd: "/home/user/no-app"` in map-test.mjs
 * made Node report `spawn python3 ENOENT` on the runner and sent the first
 * reading of that failure at the runner image. */
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(`${R}/scripts/merge-4i.mjs`, "utf8");
const { JUNK_NAME_RE } = await import(`${R}/scripts/lib-4i.mjs`);
const i = src.indexOf("  const SEAM = /\\b[A-Za-z]{3,}");
const j = src.indexOf("  let weld = 0, caps", i);
if (i < 0 || j < 0) throw new Error("slice moved");
const body = src.slice(i, j);
if (!/weldRepair/.test(body)) throw new Error("slice missed weldRepair");
if (!/capsRepair/.test(body)) throw new Error("slice missed capsRepair");

// the real store's attestation maps, built the way the block builds them
const whole = new Map(), tok = new Map(), caseOf = new Map();
/* AND THE SAME MAPS OVER THE ISSUER COLUMN — 2026-10-02 (12:3xZ). `weldRepair`
 * takes its evidence as a parameter so one predicate serves both columns; the
 * test therefore has to build both, because feeding the issuer arm the NAME
 * column's evidence is precisely the defect the issuer control exists to catch. */
const issWhole = new Map(), issTok = new Map();
/* THE DISTINCT RAW ISSUER VALUES — the population production asks the issuer
 * arm about, and the only honest domain for the subsumption check below.
 * RAW and not `issWhole`'s keys: those are lowercased, and SEAM needs
 * [a-z][A-Z], so a lowercased domain answers 0 for every string BY
 * CONSTRUCTION — recorded at line 421 as a clean zero that was the tell. */
const issRaw = new Set();
for (let s = 0; s < 64; s++) {
  const E = JSON.parse(fs.readFileSync(`${R}/data/lineups/${String(s).padStart(2,"0")}.json`, "utf8"));
  for (const [, e] of Object.entries(E)) {
    if (!e || !e.confident || !Array.isArray(e.funds)) continue;
    for (const f of e.funds) {
      const v = String(f.iss || "").trim();
      if (v) {
        issRaw.add(v);
        issWhole.set(v.toLowerCase(), (issWhole.get(v.toLowerCase()) || 0) + 1);
        for (const t of v.split(/[^A-Za-z]+/))
          if (t.length > 1) issTok.set(t.toLowerCase(), (issTok.get(t.toLowerCase()) || 0) + 1);
      }
      const n = String(f.name || "").trim(); if (!n) continue;
      const k = n.toLowerCase();
      whole.set(k, (whole.get(k) || 0) + 1);
      for (const t of n.split(/[^A-Za-z]+/)) {
        if (t.length < 2) continue;
        tok.set(t.toLowerCase(), (tok.get(t.toLowerCase()) || 0) + 1);
        const c = t.toLowerCase();
        if (!caseOf.has(c)) caseOf.set(c, new Map());
        const cm = caseOf.get(c); cm.set(t, (cm.get(t) || 0) + 1);
      }
    }
  }
}
function make(drop) {
  /* the caps arm loads its registry witness with readFileSync, so the vm
   * context needs it and the path must resolve from the repo root rather than
   * from wherever this test was invoked — never a hardcoded sandbox path */
  /* JUNK_NAME_RE is a module import at merge-4i's top, so the sliced body needs
   * it in the context — the `!` arm reuses #536's guard and would throw without
   * it, which is how this control found it rather than by reading. */
  const ctx = { buckets: [], SHARDS: 0, console, JUNK_NAME_RE,
    readFileSync: (f, enc) => fs.readFileSync(path.isAbsolute(f) ? f : `${R}/${f}`, enc) };
  vm.createContext(ctx);
  let b = body;
  /* THE DRIFT CONTROL WENT DECORATIVE THE MOMENT weldRepair GREW A DISJUNCTION
   * — 2026-10-02 (11:4xZ). Its target string moved, `String.replace` silently
   * did nothing, and the harness printed "disagrees on 0 of 20" as though that
   * were a result. Asserted now, like every `cut()` below. */
  if (drop === true) {
    /* `cnt` became `CNT` when `weldRepair` took its evidence as a parameter —
     * and THIS ASSERTION is what caught that edit, by name, on the first run.
     * The complement of #545's lesson: the control went decorative when the
     * function grew a disjunction and printed 0 as a result; asserted, it now
     * refuses to run instead. */
    const from = "const shipped = CNT(t) <= 2 && w >= 3;";
    if (!b.includes(from)) throw new Error(`control "drift": target moved: ${from}`);
    b = b.replace(from, "const shipped = true;");
  }
  /* the caps arm's ONE guard, replaced by the bare floor it looks like it could
   * be — this is the variant that convicts 333 real fund names */
  if (drop === "caps-noratio") b = b.replace("if (w <= joined * 3) continue;", "if (w < 3) continue;");
  /* the WITNESS, which only the whole-store ticker diff could show was needed:
   * without it `SMALLCAP WORLD R6 FUND` is split and LOSES RLLGX, because
   * American Funds' own registered spelling of that series is the joined one */
  if (drop === "caps-nowitness") b = b.replace("if (secWords.has(t.toLowerCase())) continue;", "");
  /* THE `!` ARM'S CONDITIONS, one variant each. Surgery on the shipped source,
   * but every replacement is ASSERTED to have happened — a control whose
   * target string has moved would otherwise pass as the shipped predicate and
   * report 0, which is the decorative-control failure this record has paid for
   * three times. */
  const cut = (what, from, to) => {
    if (drop !== what) return;
    if (!b.includes(from)) throw new Error(`control "${what}": target moved: ${from}`);
    b = b.replace(from, to);
  };
  cut("bang-floor", ".filter((x) => x.n >= BANG_FLOOR)", ".filter((x) => x.n >= 1)");
  cut("bang-ratio", "if (scored.length > 1 && scored[0].n < BANG_RATIO * scored[1].n) return null;  // (2)", "// (2) dropped");
  cut("bang-marker", "if (bare.length > 1 && cnt(bare) >= BANG_MARKER * scored[0].n) return null;    // (3)", "// (3) dropped");
  cut("bang-letter", 'if (!/[A-Za-z]/.test(t)) return null;            // (4) a lone glyph', "// (4a) dropped");
  cut("bang-minlen", "if (t.length < BANG_MINLEN) return null;         // (4) see `O!` above", "// (4b) dropped");
  cut("bang-case", "rep += allCaps ? scored[0].c[k].toUpperCase() : (sp[k] || scored[0].c[k]);", "rep += scored[0].c[k];");
  cut("bang-junk", "if (JUNK_NAME_RE.test(a) && !JUNK_NAME_RE.test(b)) return null;   // #536", "// #536 dropped");
  /* v529's GUARD PORTED BACK — one control per condition of the widened
   * disjunct, each built by surgery on the shipped source and each ASSERTED to
   * have landed. */
  cut("weld-noshipped", "const shipped = CNT(t) <= 2 && w >= 3;", "const shipped = false;");
  cut("weld-nowidened", "const widened = !!secWords && w > joined * 3 && !regSpellsJoined(t);", "const widened = false;");
  cut("weld-noratio", "const widened = !!secWords && w > joined * 3 && !regSpellsJoined(t);",
                      "const widened = !!secWords && w >= 3 && !regSpellsJoined(t);");
  cut("weld-nowitness", "const widened = !!secWords && w > joined * 3 && !regSpellsJoined(t);",
                        "const widened = !!secWords && w > joined * 3;");
  cut("weld-nocontain", "    for (const w of secWords) if (w.length > k.length && w.includes(k)) return true;\n", "");
  /* THE ISSUER ARM'S OWN CONTROLS — 2026-10-02 (12:3xZ). The conditions are the
   * same lines (one predicate, two populations), so the surgery is the same and
   * is asserted the same way; what differs is the EVIDENCE, and `iss-namemaps`
   * is handled at the return rather than by surgery. */
  cut("iss-noratio", "const widened = !!secWords && w > joined * 3 && !regSpellsJoined(t);",
                     "const widened = !!secWords && w >= 3 && !regSpellsJoined(t);");
  cut("iss-noshipped", "const shipped = CNT(t) <= 2 && w >= 3;", "const shipped = false;");
  cut("iss-nohalves", "if (CNT(L) < 3 || CNT(Rt) < 3) continue;        // both halves ordinary published words", "");
  vm.runInContext(b + "\n; this.__w = weldRepair; this.__c = capsRepair; this.__b = bangRepair; this.__whole = whole; this.__tok = tok; this.__caseOf = caseOf; this.__issWhole = issWhole; this.__issTok = issTok; this.__issEv = ISS_EV; this.__nameEv = { whole, cnt };",
    ctx);
  for (const [k, v] of whole) ctx.__whole.set(k, v);
  for (const [k, v] of tok) ctx.__tok.set(k, v);
  for (const [k, v] of issWhole) ctx.__issWhole.set(k, v);
  for (const [k, v] of issTok) ctx.__issTok.set(k, v);
  /* `caseOf` is built from `buckets`, which this context stubs empty, so it is
   * filled here the way `whole`/`tok` are — otherwise the `!` arm would have no
   * case witness and every control would read the same. */
  for (const [k, v] of caseOf) ctx.__caseOf.set(k, v);
  /* THE ISSUER ARM, which is the SAME function under the SAME variant with the
   * column's own evidence. `iss-namemaps` hands it the NAME maps instead —
   * constraint 1's control, and the one that matters most here. */
  if (String(drop || "").startsWith("iss")) {
    const ev = drop === "iss-namemaps" ? ctx.__nameEv : ctx.__issEv;
    const f = ctx.__w;
    return (s) => f(s, ev);
  }
  if (String(drop || "").startsWith("bang")) return ctx.__b;
  if (String(drop || "").startsWith("weld")) return ctx.__w;
  return String(drop || "").startsWith("caps") ? ctx.__c : ctx.__w;
}
const shipped = make(false), drifted = make(true);
const caps = make("caps"), capsNoRatio = make("caps-noratio"), capsNoWitness = make("caps-nowitness");

const CASES = [
  /* A PIN WAS ADDED HERE 2026-10-02 (20:0xZ) AND REMOVED THE SAME HOUR, which
   * is worth a comment because the removal is the finding. The subsumed-
   * condition check below asserts disjunct (1) contributes nothing on the NAME
   * column ("whole-store 0 of 415,221 distinct names"), and a script of mine
   * reported 3 counter-examples — `Fidelity Advisor Small CapFund Class I`,
   * `LVIP TRowePrice 2060 FundSAP3`, `Fidadv Eq GrInst` — each missing
   * disjunct (2)'s ratio by exactly one (`w`=3, `joined`=1).
   *
   * ASKED OF THE SHIPPED PREDICATE, ALL THREE RETURN NULL. The script had
   * REIMPLEMENTED `weldRepair` rather than calling it, and the reimplementation
   * omitted `secWords` and `regSpellsJoined` entirely. So the counter-examples
   * were properties of my copy, the check's claim stands, and the pin was
   * asserting a repair that does not happen.
   *
   * *Measure through the function the page calls* — recorded at least seven
   * times before this one, and the discriminating test was three lines: hand
   * the name to `make(false)`, `make("weld-noshipped")` and
   * `make("weld-nowidened")` and read the three answers. All null. */
  // must REPAIR — the lost space
  ["Vanguard Total BondMarket Index Adm", "Vanguard Total Bond Market Index Adm"],
  ["JPMorganMid Cap Growth Fund R6", "JPMorgan Mid Cap Growth Fund R6"],
  ["FidelityTotal Bond K6 Fund", "Fidelity Total Bond K6 Fund"],
  ["EmpowerGuaranteed Interest Fund", "Empower Guaranteed Interest Fund"],
  ["HoodRiver Small Cap Growth", "Hood River Small Cap Growth"],
  ["BlackrockTotal Return Fund", "Blackrock Total Return Fund"],
  // must KEEP (A): a REAL firm name that is merely rare
  ["FirstEnergy common stock", null],
  ["ExxonMobil Stock Fund", null],
  ["BancPlus Corporation", null],
  ["HomeTrust Bancshares, Inc.", null],
  ["LifePoint Health Stable Value Fund", null],
  ["SoundShore Institutional Large Cap Value", null],
  // must KEEP (C): a DOUBLE RENDER welded at the seam
  ["Dodge & Cox IncomeDodge & Cox Income", null],
  // must KEEP: CamelCase is how these funds are NAMED
  ["BlackRock Equity Index F", null],
  ["LifePath Index 2030", null],
  ["American Funds EuroPacific Growth R6", null],
  ["JPMorgan SmartRetirement Blend 2030 R6", null],
  ["MassMutual Stable Value Diversified", null],
  ["PIMCO RealPath Blend 2030", null],
  ["ClearBridge Select IS", null],
  /* v529's GUARD PORTED BACK — 2026-10-02 (11:4xZ). Added because NOT ONE of
   * the 20 cases above reaches the widened disjunct: every must-REPAIR there is
   * accepted by the shipped rule and every must-KEEP is refused by the halves
   * floor or by a seam the ratio also refuses, so the whole arm could have been
   * inert and this table would still have read 20/20. Each pin was run through
   * the SHIPPED predicate before it was written down. */
  // must REPAIR — the ceiling refused these because the DAMAGE is attested
  ["EquityIncome Adm", "Equity Income Adm"],
  ["Fidelity VIP EquityIncome Fund", "Fidelity VIP Equity Income Fund"],
  ["JanusHenderson Triton N", "Janus Henderson Triton N"],
  ["PrinLifeTime Hybrid 2035 CIT", "Prin LifeTime Hybrid 2035 CIT"],
  ["GoldmanSachs Mid Cap Value", "Goldman Sachs Mid Cap Value"],
  ["LoomisSayles Growth Portfolio", "Loomis Sayles Growth Portfolio"],
  /* must KEEP — the registry spells the token joined INSIDE a longer registered
   * word (`CommodityRealReturn`), so an EQUALITY witness misses it. Pinned
   * because the naive substitution split it and lost PCRIX on 3 rows, which the
   * outcome test found and reading 270 transformations did not. */
  ["PIMCO Commodity RealReturn Strategy Fund Institutional Class", null],
];
let bad = 0;
for (const [inp, want] of CASES) {
  const got = shipped(inp);
  if ((got || null) !== want) { bad++; console.log(`  FAIL  ${JSON.stringify(inp)}\n        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`); }
}
console.log(`shipped predicate: ${CASES.length - bad}/${CASES.length} pinned cases`);

console.log(`\nNEGATIVE CONTROL — drop the repaired-whole-name attestation:`);
const broke = [];
for (const [inp, want] of CASES) {
  const got = drifted(inp) || null;
  if ((got || null) !== want) broke.push(`${JSON.stringify(inp)} -> ${JSON.stringify(got)}`);
}
console.log(`  it now disagrees on ${broke.length} of ${CASES.length}:`);
for (const b of broke) console.log(`    ${b}`);
if (bad) process.exitCode = 1;

/* ONE CONTROL PER CONDITION of the widened disjunct — 2026-10-02 (11:4xZ).
 * Each must fail BY NAME on exactly its own cases. `weld-nocontain` is the one
 * the outcome test bought: without containment the witness misses `RealReturn`
 * inside the registry's `CommodityRealReturn` and PCRIX is lost on 3 rows. */
/* DISJUNCT (1) IS SUBSUMED ON THIS STORE AND IS LABELLED SO RATHER THAN
 * CARRIED AS REASSURANCE — v529's own treatment of its two subsumed
 * conditions. Measured over all 415,221 distinct published names: dropping the
 * shipped rule loses 0 repairs and changes 0. It is NOT subsumed structurally —
 * a repaired name attested exactly 3 beside a damaged one attested 1 satisfies
 * the old rule (`w >= 3`) and fails the ratio (`w > joined * 3`) — so it stays
 * as the guarantee that the widening can only ADD, on this store and any
 * later one. Asserted at 0 so a future store that makes it load-bearing shows
 * up here as a surprise rather than passing quietly. */
{
  const f = make("weld-noshipped"), brk = [];
  for (const [inp, want] of CASES) if ((f(inp) || null) !== want) brk.push(JSON.stringify(inp));
  console.log(`\nSUBSUMED-CONDITION CHECK — drop disjunct (1), the shipped rule: disagrees on ${brk.length} of ${CASES.length} (expected 0; whole-store 0 of 415,221 distinct names)`);
  if (brk.length) { console.log(`  it has become load-bearing: ${brk.join(", ")}`); process.exitCode = 1; }
}
for (const [name, label] of [
  ["weld-nowidened", "drop disjunct (2), the widening — must fail on exactly the new pins"],
  ["weld-noratio", "replace the ratio with a bare attestation floor"],
  ["weld-nowitness", "drop the registry witness entirely"],
  ["weld-nocontain", "witness by EQUALITY only, no containment"],
]) {
  const f = make(name), brk = [];
  for (const [inp, want] of CASES) {
    const got = f(inp) || null;
    if (got !== want) brk.push(`${JSON.stringify(inp)} -> ${JSON.stringify(got)}`);
  }
  console.log(`\nNEGATIVE CONTROL — ${label}:\n  disagrees on ${brk.length} of ${CASES.length}:`);
  for (const x of brk) console.log(`    ${x}`);
  if (!brk.length) { console.log(`  DECORATIVE: this control cannot fail — it is not testing anything`); process.exitCode = 1; }
}

/* ---------------------------------------------------------------------- *
 * CONTROL for merge-4i's ALL-CAPS LOST-SPACE REPAIR — 2026-10-01 (04:1xZ).
 *
 * `weldRepair` cannot see this family BY CONSTRUCTION: its seam needs a
 * lowercase letter followed by an uppercase one inside a word, and an all-caps
 * filed name never has one. Texas Children's (21,233 ppl) published
 * `VANGUARDTARGET RETIREMENT INCOME`.
 *
 * THE ARM HAS EXACTLY ONE GUARD and the control is built to prove that, not to
 * decorate it: the repaired WHOLE NAME must be attested more than three times
 * the damaged one. Replace it with the bare floor it resembles and it convicts
 * the real fund names whose joined spelling is their actual spelling —
 * EUROPACIFIC, CONTRAFUND, JPMORGAN, BLACKROCK, LIFESTRATEGY, SMALLCAP,
 * MASSMUTUAL, ALLSPRING (333 transformations whole-store).
 *
 * The two conditions that look like guards cannot fire and are documented as
 * such at the call site rather than tested here, because a test that cannot
 * fail is decoration: a floor of 3 is implied by the ratio (the row's own name
 * is attested at least once), and both-halves-attested follows from the
 * repaired name being published at all.
 */
const CAPS_CASES = [
  // must REPAIR — read in the store, all 62 distinct transformations reviewed
  ["VANGUARDTARGET RETIREMENT INCOME", "VANGUARD TARGET RETIREMENT INCOME"],
  ["AMERICAN FUNDS NEWWORLD R6", "AMERICAN FUNDS NEW WORLD R6"],
  ["DODGE & COX STOCKFUND X", "DODGE & COX STOCK FUND X"],
  ["JANUSHENDERSON TRITON N", "JANUS HENDERSON TRITON N"],
  ["GOLDMANSACHS US MORTGAGES R6", "GOLDMAN SACHS US MORTGAGES R6"],
  ["FIDELITY BLUECHIP GROWTH", "FIDELITY BLUE CHIP GROWTH"],
  // must KEEP — the joined spelling IS the fund's name, and each of these is
  // what the single guard exists to refuse
  ["EUROPACIFIC GROWTH R6", null],
  ["FIDELITY CONTRAFUND", null],
  ["JPMORGAN LARGE CAP GROWTH R6", null],
  ["BLACKROCK HIGH YIELD BOND INSTL", null],
  ["VANGUARD LIFESTRATEGY GROWTH", null],
  ["MASSMUTUAL SELECT MID CAP GROWTH R5", null],
  ["ALLSPRING SPECIAL SMALL CAP VALUE R6", null],
  ["PRINCIPAL SMALLCAP GROWTH R6", null],
  /* THE CASE THE OUTCOME TEST FOUND AND READING COULD NOT: splitting this row
   * loses RLLGX, because the SEC registers the series as `SMALLCAP WORLD FUND
   * INC` and the joined spelling is American Funds' own */
  ["SMALLCAP WORLD R6 FUND", null],
  ["SMALLCAP World Fund Class R6", null],
  // must KEEP — a real word and a real firm, which is what the whole-name
  // evidence refuses without any vocabulary of words or places
  ["VARIATION MARGIN ON OPEN CONTRACTS TO DATE - GAIN(LOSS)", null],
  ["AUTONATION, INC", null],
  ["THE INTERPUBLIC GROUP OF COMPANIES, INC", null],
  ["NEWTOWER TRUST COMPANY MULTI-EMPLOYER PROPERTY TRUST", null],
  // must KEEP — fewer than eight capitals in the token, so never a candidate
  ["VANGUARD TARGET RETIREMENT 2040", null],
  ["FIDELITY CONTRA FUND", null],
];
let capsBad = 0;
for (const [inp, want] of CAPS_CASES) {
  const got = caps(inp) || null;
  if (got !== want) { capsBad++; console.log(`  FAIL  ${JSON.stringify(inp)}\n        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`); }
}
console.log(`\nall-caps repair: ${CAPS_CASES.length - capsBad}/${CAPS_CASES.length} pinned cases`);

console.log(`NEGATIVE CONTROL — replace the ratio with a bare attestation floor:`);
const capsBroke = [];
for (const [inp, want] of CAPS_CASES) {
  const got = capsNoRatio(inp) || null;
  if (got !== want) capsBroke.push(`${JSON.stringify(inp)} -> ${JSON.stringify(got)}`);
}
console.log(`  it now disagrees on ${capsBroke.length} of ${CAPS_CASES.length}:`);
for (const b of capsBroke) console.log(`    ${b}`);
console.log(`NEGATIVE CONTROL — drop the registry witness:`);
const capsBrokeW = [];
for (const [inp, want] of CAPS_CASES) {
  const got = capsNoWitness(inp) || null;
  if (got !== want) capsBrokeW.push(`${JSON.stringify(inp)} -> ${JSON.stringify(got)}`);
}
console.log(`  it now disagrees on ${capsBrokeW.length} of ${CAPS_CASES.length}:`);
for (const b of capsBrokeW) console.log(`    ${b}`);
if (capsBad) process.exitCode = 1;

/* ---------------------------------------------------------------------- *
 * CONTROL for merge-4i's ISSUER LOST-SPACE REPAIR — 2026-10-02 (12:3xZ).
 *
 * The SAME `weldRepair`, asked with the ISSUER column's own attestation
 * evidence. It is one predicate and two populations, so the conditions are
 * already controlled by the `weld-*` controls above; what is NEW and needs its
 * own control is the EVIDENCE COLUMN.
 *
 * NEW PINS, and the reach measurement that justifies them: of the 27 existing
 * weld cases, 10 answer DIFFERENTLY under the issuer maps and all 10 go from a
 * repair to NULL — they are fund names, and the issuer column attests nothing
 * for them. So not one existing case is a must-REPAIR here and the table could
 * not have verified any issuer repair. (That unanimity is also evidence the arm
 * is not a blanket widening: hand it the wrong column's string and it refuses.)
 *
 * EVERY PIN IS IN-POPULATION, asserted below, and that assertion is load-
 * bearing rather than tidiness. `w > joined * 3` degenerates to `w > 0` when
 * `joined` is 0, so ONE attestation would license a repair — and the caps arm's
 * claim that the ratio "already forces w >= 4" holds only because the arm is
 * asked about strings drawn from the very column its maps are built from, which
 * makes `joined >= 1` true by construction. `ExxonMobil` is the case that shows
 * it: as an ISSUER it is attested 0 times, `Exxon Mobil` once, and the
 * predicate SPLITS it — a branch production can never reach, so pinning it
 * would pin behaviour that does not exist and invite a floor that changes
 * nothing. It is deliberately not a pin. */
const iss = make("iss");
const issNameMaps = make("iss-namemaps"), issNoRatio = make("iss-noratio");
const issNoShipped = make("iss-noshipped"), issNoHalves = make("iss-nohalves");
const ISS_CASES = [
  /* must REPAIR — read in the store, ALL 30 distinct transformations reviewed.
   * The counts in the comments are (joined -> repaired) standalone issuer
   * attestations, read off the store rather than remembered. */
  ["John HancockLife Insurance Company", "John Hancock Life Insurance Company"],   // 36 -> 5140
  ["T. RowePrice", "T. Rowe Price"],                                               // 19 -> 14619
  ["StateStreet Global Advisors", "State Street Global Advisors"],                  // 15 -> 1384
  ["AmericanFunds", "American Funds"],                                             // 10 -> 33626
  ["JanusHenderson", "Janus Henderson"],                                           //  7 -> 1735
  ["GoldmanSachs", "Goldman Sachs"],                                               //  5 -> 1287
  ["GreatGray Trust Company", "Great Gray Trust Company"],                         //  4 -> 5118
  ["WilmingtonTrust", "Wilmington Trust"],                                         //  3 -> 1431
  ["MatrixTrust Company", "Matrix Trust Company"],                                 //  1 -> 866
  ["Principal Global investorsTrust Co.", "Principal Global investors Trust Co."],  //  1 -> 947
  ["ValueLine", "Value Line"],                                                     //  1 -> 14
  /* A HALF REPAIR, PINNED AS ONE. The remaining seam is `T|R` — uppercase then
   * uppercase — and SEAM requires `[a-z][A-Z]`, so it is outside this arm BY
   * CONSTRUCTION and not for want of a second pass: a fixpoint loop repairs the
   * same 188 rows and changes 0 answers, measured. It is pinned because it is
   * not worthless — it is what buys Cantex's two fees (null -> 0.49). */
  ["TRowePrice", "TRowe Price"],                                                   // 12 -> 60
  ["T.RowePrice", "T.Rowe Price"],                                                 //  2 -> 808
  /* TWO NAMED COSTS, pinned on the side they land rather than wished away.
   * `OppenheimerFunds, Inc.` was the firm's OFFICIAL one-word styling, so this
   * is a wrong repair on 17 rows; it moves 0 tickers, 0 fees and 0 asterisks,
   * and the store's own issuer column writes the spaced form 60 times against
   * the joined 17, so the row lands on the majority filed spelling. Protecting
   * it needs a vocabulary of one-word firm brands — the registry has no
   * `oppenheimerfunds`, and a house list is wrong in the unsafe direction. */
  ["OppenheimerFunds", "Oppenheimer Funds"],                                       // 17 -> 60
  /* THE SAME FIRM WITH ITS CORPORATE SUFFIX IS A DIFFERENT STORE VALUE, and it
   * is the ONLY one disjunct (1) contributes to this column — CORRECTED
   * 2026-10-02 (15:2xZ), because the attribution shipped with #547 named the
   * wrong string. Whole-store over all 15,544 distinct RAW issuer values,
   * `shipped` repairs and `no-disjunct-(1)` refuses exactly ONE: this. The bare
   * `OppenheimerFunds` above and `AllianceBernstien` below are both accepted by
   * disjunct (2) on their own, so dropping (1) leaves them untouched — which is
   * why the `iss-noshipped` control read 0 of 31 and declared itself DECORATIVE,
   * exiting 1. The count the commit registered (exactly 1) was right; the string
   * it named was not, and the pin list held only the suffix-less form, so the
   * control could not see the one case that exists. Pinning it here makes the
   * control discriminate instead of being relabelled away.
   *
   * Measured the raw values, NOT `issWhole`'s keys: those are lowercased, and
   * SEAM needs [a-z][A-Z], so the first pass answered 0 for all 14,500 by
   * construction and the clean zero was the tell. */
  ["OppenheimerFunds, Inc.", "Oppenheimer Funds, Inc."],                           //   2 rows, only-(1)
  /* ...and the filer's MISSPELLING of the same one-word brand (ei -> ie); both
   * forms are wrong and the repair moves from one to another that 5 rows use.
   * It is accepted by disjunct (2), not (1) — probed directly, `no-disjunct-(1)`
   * still returns "Alliance Bernstien". */
  ["AllianceBernstien", "Alliance Bernstien"],                                     //  2 -> 5
  /* must KEEP — THE JOINED SPELLING IS THE FIRM'S NAME, and the ratio reads it
   * off the store with no vocabulary. `AllianceBernstein` is the pin that
   * proves constraint 1: under the issuer column's evidence it is attested 682
   * times joined against 1138 spaced and is REFUSED (1138 > 2046 is false),
   * where the NAME column's evidence SPLITS IT 668 TIMES. */
  ["AllianceBernstein", null],                                                     // 682 vs 1138
  ["AllianceBerstein", null],                                                      //  27 vs 24
  ["MainStay", null],                                                              //  95 vs 3
  ["AssetMark", null],                                                             //  26 vs 6
  ["IndexSelect", null],                                                           //  55 vs 49
  ["MetroWest", null],                                                             //   3 vs 4
  ["EuroPacific", null],                                                           //  19 vs 5
  /* must KEEP — the registry ALSO spells these joined inside a fund's own
   * registered name, so two independent conditions refuse each. They are the
   * same strings the `weld-nowitness` control above already exercises on the
   * name side; here the ratio alone is decisive (measured: dropping the witness
   * changes 0 of the 188 issuer rows, so for THIS column the witness is
   * DECORATIVE and is labelled so rather than claimed). */
  ["BlackRock", null],                                                             // 8984 vs 0
  ["MassMutual", null],                                                            //  971 vs 0
  ["TransAmerica", null],                                                          // 2771 vs 0
  ["ClearBridge", null],                                                           //  440 vs 0
  ["FullerThaler", null],                                                          //   25 vs 0
  /* must KEEP — A CORRECT REPAIR THE RATIO REFUSES, named as the ratio's own
   * cost rather than hidden: `John Hancock Insurance Company` is attested 72
   * times against the joined 33, and 72 > 99 is false, so it is refused by one
   * factor. 33 rows. Refusing a repair is the safe direction. */
  ["JohnHancock Insurance Company", null],                                         //  33 vs 72
  /* must KEEP — ALREADY REPAIRED, so the arm has to be a FIXPOINT. It runs on
   * every merge over a store it has already edited, and the store carries 60
   * `TRowe Price` and 808 `T.Rowe Price` rows that must not drift further. */
  ["TRowe Price", null],
  ["T.Rowe Price", null],
  ["Alliance Bernstien", null],
];
let issBad = 0;
for (const [inp, want] of ISS_CASES) {
  const got = iss(inp) || null;
  if (got !== want) { issBad++; console.log(`  FAIL  ${JSON.stringify(inp)}\n        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`); }
}
console.log(`\nissuer lost-space repair: ${ISS_CASES.length - issBad}/${ISS_CASES.length} pinned cases`);
/* EVERY PIN IN-POPULATION — an out-of-population pin tests the `joined === 0`
 * branch, which production cannot reach.
 *
 * THE FIRST VERSION OF THIS CHECK WAS SELF-CONSUMING, AND THAT IS THE FINDING —
 * CORRECTED 2026-10-02 (15:2xZ). It asked only whether the DAMAGED form is
 * attested in the store, and the whole purpose of the arm it guards is to
 * ELIMINATE the damaged forms. So it read 31/31 while the store was still
 * damaged, passed its own pre-push run, and then went to 17/31 the instant
 * #547's merge actually repaired the column — failing the gate for having
 * SUCCEEDED. A gate that cannot survive its own success is worse than no gate:
 * the record already carries ten consecutive red `site-test` runs, and a
 * habitually red gate makes a real failure invisible.
 *
 * The question it means to ask is "could production ever see this string?", and
 * after the repair that is no longer answerable from the damaged side alone: a
 * NEW filing can carry the damage even though the stored column is clean. So a
 * pin is in-population when the store attests EITHER side — the damaged form at
 * all (pre-repair, or a fresh filing), or the REPAIRED form at the arm's own
 * floor of 4, which is the threshold the predicate itself uses.
 *
 * That floor is what keeps the check honest rather than merely green: it still
 * refuses `ExxonMobil`, whose repaired `Exxon Mobil` is attested ONCE as an
 * issuer, so the branch really is unreachable and pinning it would pin
 * behaviour that does not exist. `Oppenheimer Funds` is attested 77 and passes. */
{
  const att = (s) => issWhole.get(String(s).trim().toLowerCase()) || 0;
  const out = ISS_CASES.filter(([s, want]) => !att(s) && !(want && att(want) >= 4));
  console.log(`  pins drawn from the issuer column itself: ${ISS_CASES.length - out.length}/${ISS_CASES.length} (damaged form attested, or the repaired form at the arm's floor of 4)`);
  if (out.length) { console.log(`  OUT OF POPULATION (neither side attested — a branch production cannot reach): ${out.map(([s]) => JSON.stringify(s)).join(", ")}`); issBad++; }
}
/* REACH: how many of the NAME table's cases could have caught an issuer change */
{
  const reach = CASES.filter(([inp]) => (shipped(inp) || null) !== (iss(inp) || null));
  console.log(`  of the ${CASES.length} existing weld cases, ${reach.length} answer differently under the issuer maps — and ${reach.filter(([inp]) => iss(inp) == null).length} of those go to NULL, so none is a must-REPAIR here`);
}
for (const [f, label] of [
  [issNameMaps, "CONSTRAINT 1 — feed it the NAME column's evidence (the recorded 827-row / 697,199-ppl mistake)"],
  [issNoRatio, "replace the ratio with a bare attestation floor"],
  [issNoShipped, "drop disjunct (1), the shipped rule — this documents a COST, not a protection"],
  [issNoHalves, "drop the both-halves-attested PRE-FILTER"],
]) {
  const brk = [];
  for (const [inp, want] of ISS_CASES) {
    const got = f(inp) || null;
    if (got !== want) brk.push(`${JSON.stringify(inp)} -> ${JSON.stringify(got)}`);
  }
  console.log(`\nNEGATIVE CONTROL — ${label}:\n  disagrees on ${brk.length} of ${ISS_CASES.length}:`);
  for (const x of brk) console.log(`    ${x}`);
  if (!brk.length) {
    /* THE HALVES PRE-FILTER IS SUBSUMED, AND AS OF 2026-10-09 THAT IS ASSERTED
     * OVER THE WHOLE POPULATION RATHER THAN LABELLED AWAY.
     *
     * It read "DECORATIVE on this store (0 of 188 rows)" and exempted itself
     * from the exit-1 every other control here is held to — which is the one
     * shape this record calls worse than no gate, because a reader cannot tell
     * an exemption from a pass. But a frozen fixture CANNOT fix it: merge-4i's
     * own comment makes the stronger claim that the condition is unreachable BY
     * CONSTRUCTION, so a case where dropping it changes an answer would have to
     * be a case production can never ask, and pinning one would pin behaviour
     * that does not exist — the `ExxonMobil` trap, 230 lines above, in reverse.
     *
     * So the control becomes an assertion of the UNREACHABILITY instead, over
     * the domain production actually asks about: every distinct RAW issuer
     * value in the store. The arithmetic the claim rests on is that both
     * disjuncts force `w >= 3` whenever `joined >= 1`, and `joined >= 1` holds
     * for any string drawn from the column the maps are built from; a whole
     * string attested 3+ times contributes each of its halves as a token 3+
     * times, so the pre-filter can never be the condition that refuses.
     *
     * This CAN fail, which the label could not: a later widening that makes
     * `joined === 0` reachable, or a change to how the halves are cut, turns
     * the pre-filter back into a live guard and this prints the strings where
     * it is load-bearing. It is a PERFORMANCE claim being checked, not a
     * safety one — two map lookups instead of building a candidate string at
     * every split point — and that is what the message says. */
    if (f === issNoHalves) {
      const live = [];
      for (const v of issRaw) {
        const a = iss(v) || null, b = f(v) || null;
        if (a !== b) live.push(`${JSON.stringify(v)}: shipped ${JSON.stringify(a)} vs no-prefilter ${JSON.stringify(b)}`);
      }
      /* POSITIVE CONTROL FOR THE ASSERTION ITSELF — a zero is only a finding
       * once the comparison has been shown able to see a difference, because a
       * broken comparison and a subsumed condition read the same 0.
       *
       * THE PROBE IS DERIVED FROM THE STORE, NOT HARDCODED, and that is the
       * whole design. My first version pinned `ExxonMobil`, which this file
       * documents 240 lines above as out of the issuer population — and the
       * control FAILED, correctly: its halves are attested 5 and 5, so the
       * pre-filter is not what refuses it and the predicate splits it under
       * both variants. The file's own note is right that `ExxonMobil` is
       * unreachable; it is unreachable for a different reason than this
       * condition. *A probe chosen because it is out-of-population is not
       * thereby a probe the condition under test refuses.*
       *
       * So the probe is CONSTRUCTED to be one the pre-filter is the sole
       * refuser of: weld a real spaced issuer value at a seam one of whose
       * halves is attested fewer than 3 times, and require the welded form to
       * be absent from the column (`joined === 0`, which makes `w > joined*3`
       * degenerate to `w > 0` — the very branch the ExxonMobil note says
       * production cannot reach). A hardcoded probe would also ROT: these
       * attestations move on every DOL refresh, and a probe that quietly became
       * inert would turn this control back into decoration. */
      {
        let probe = null;
        for (const v of issRaw) {
          const parts = v.split(" ");
          for (let k = 1; k < parts.length && !probe; k++) {
            const L = parts[k - 1], Rt = parts[k];
            if (!/^[A-Za-z]{4,}$/.test(L) || !/^[A-Z][a-z]{2,}$/.test(Rt)) continue;
            if (issTok.get(L.toLowerCase()) >= 3 && issTok.get(Rt.toLowerCase()) >= 3) continue;
            const welded = parts.slice(0, k - 1).concat(L + Rt, parts.slice(k + 1)).join(" ");
            if (issWhole.has(welded.toLowerCase())) continue;
            if ((iss(welded) || null) !== (f(welded) || null)) probe = { welded, v };
          }
          if (probe) break;
        }
        if (!probe) { console.log(`  NO PROBE EXISTS where the pre-filter is the sole refuser — the comparison cannot be shown able to see a difference, so this assertion is decoration`); process.exitCode = 1; }
        else console.log(`  comparison verified on a constructed out-of-column probe: ${JSON.stringify(probe.welded)} -> shipped ${JSON.stringify(iss(probe.welded) || null)} vs no-prefilter ${JSON.stringify(f(probe.welded) || null)}`);
      }
      console.log(`  SUBSUMED, asserted over all ${issRaw.size.toLocaleString()} distinct raw issuer values — the population production asks:`);
      console.log(`    the pre-filter changes the answer on ${live.length} of them (a PRE-FILTER, so 0 is the claim)`);
      for (const x of live.slice(0, 8)) console.log(`      ${x}`);
      if (live.length) {
        console.log(`  the both-halves test is NO LONGER a pre-filter — it is now load-bearing on the strings above,`);
        console.log(`  so it needs pinned cases and merge-4i's "SUBSUMED" comment is stale`);
        process.exitCode = 1;
      }
    } else { console.log(`  DECORATIVE: this control cannot fail — it is not testing anything`); process.exitCode = 1; }
  }
}
if (issBad) process.exitCode = 1;

/* THE CALL SITE'S ORDER, controlled on a CRAFTED case because it is DECORATIVE
 * on this store — measured, 0 of 1,730,676 published rows have BOTH columns
 * damaged (188 issuer-only, 1 name-only). A condition that cannot fire on the
 * live store is controlled on a crafted one rather than claimed.
 *
 * The NAME arms are five rules joined by `continue`; the issuer is a DIFFERENT
 * COLUMN and is asked first, so a row whose name repair fires still gets its
 * issuer repaired. Move the call after the chain and the crafted row loses it. */
{
  const mkLoop = (after) => {
    const i2 = src.indexOf("  let weld = 0, caps");
    const j2 = src.indexOf("\n}", i2);
    if (i2 < 0 || j2 < 0) throw new Error("loop slice moved");
    let L = src.slice(i2, j2);
    if (!/weldRepair\(f\.iss, ISS_EV\)/.test(L)) throw new Error("loop slice missed the issuer call");
    if (after) {
      const from = "        const irep = weldRepair(f.iss, ISS_EV);\n        if (irep) { f.iss = irep; iweld++; iweldAcks.add(ack); }\n";
      if (!L.includes(from)) throw new Error(`control "order": target moved: ${from}`);
      L = L.replace(from, "") .replace("        const brep = bangRepair(f.name);",
        from + "        const brep = bangRepair(f.name);");
    }
    /* A crafted store: one row damaged in BOTH columns, plus just enough
     * attestation for both repairs to clear the ratio (joined 1, repaired 5,
     * and 5 > 3). The tokens are ≥7 characters with four before the seam,
     * because SEAM is `[A-Za-z]{3,}[a-z][A-Z][a-z]{2,}` and a six-letter
     * `FooBar` cannot match it — caught by this control failing, not by
     * reading. */
    const fill = (n, v) => Array.from({ length: n }, () => ({ name: v.name, iss: v.iss, value: 1 }));
    const funds = [{ name: "FoodBar Growth Fund", iss: "BazzQux Trust Company", value: 1 },
      ...fill(5, { name: "Food Bar Growth Fund", iss: "Bazz Qux Trust Company" })];
    const bucket = { ACK1: { confident: true, funds } };
    const ctx = { buckets: [bucket], SHARDS: 1, console: { log() {} }, JUNK_NAME_RE,
      readFileSync: (f, enc) => fs.readFileSync(path.isAbsolute(f) ? f : `${R}/${f}`, enc) };
    vm.createContext(ctx);
    /* no braces: `body` and `L` are the block's two halves and the block's own
     * `{ }` are outside both, exactly as `make()` runs `body` on its own */
    vm.runInContext(body + L, ctx);
    return funds[0];
  };
  const ok = mkLoop(false), bad = mkLoop(true);
  console.log(`\nCALL-SITE ORDER (crafted — decorative on the live store, 0 rows have both columns damaged):`);
  console.log(`  shipped order: name ${JSON.stringify(ok.name)}  iss ${JSON.stringify(ok.iss)}`);
  console.log(`  issuer asked AFTER the chain: name ${JSON.stringify(bad.name)}  iss ${JSON.stringify(bad.iss)}`);
  if (ok.name !== "Food Bar Growth Fund" || ok.iss !== "Bazz Qux Trust Company") {
    console.log(`  FAIL: the shipped order must repair BOTH columns`); process.exitCode = 1;
  }
  if (bad.iss !== "BazzQux Trust Company" || bad.name !== "Food Bar Growth Fund") {
    console.log(`  DECORATIVE: moving the call changed nothing — the control is not testing the order`);
    process.exitCode = 1;
  }
}

/* ---------------------------------------------------------------------- *
 * CONTROL for merge-4i's ISSUER LEADING-JUNK STRIP — 2026-09-30 (14:4xZ).
 *
 * Sliced by name out of merge-4i, never restated. Two negative controls,
 * because the arm has exactly two conditions beyond the strip itself and each
 * protects a different family:
 *   (1) the run must END in punctuation or space — without it a digit-leading
 *       FIRM is truncated (`3M Company` -> `M Company`);
 *   (2) the remainder must begin with a CAPITAL — without it OCR wreckage is
 *       half-repaired instead of left alone (`/anguard Group`, where a V was
 *       read as a slash).
 * A control that cannot fail is decorative, so each is asserted to disagree
 * BY NAME on exactly the cases it exists for.
 * ---------------------------------------------------------------------- */
{
  const s2 = fs.readFileSync(`${R}/scripts/merge-4i.mjs`, "utf8");
  const a = s2.indexOf("function stripIssuerLead(");
  if (a < 0) throw new Error("stripIssuerLead slice moved");
  let d = 0, b = s2.indexOf("{", a);
  for (let k = b; k < s2.length; k++) {
    if (s2[k] === "{") d++;
    else if (s2[k] === "}") { d--; if (!d) { b = k + 1; break; } }
  }
  const body = s2.slice(a, b);
  const mk = (drop) => {
    let t = body;
    if (drop === "fence") t = t.replace(/if \(\/\[A-Za-z0-9\]\$\/\.test\(run\)\) return null;/, "");
    if (drop === "capital") t = t.replace(/if \(!\/\^\[A-Z\]\/\.test\(rest\)\) return null;/, "");
    if (t === body) throw new Error("negative control '" + drop + "' changed nothing");
    return new Function(t + "; return stripIssuerLead;")();
  };
  const shippedIss = new Function(body + "; return stripIssuerLead;")();

  const ISS = [
    // must STRIP — a statement bullet, an OCR leader, a legend mark
    ["— Fidelity Investments", "Fidelity Investments"],
    ["— Fidelity Management Trust Company", "Fidelity Management Trust Company"],
    [". GROUP ANNUITY CONTRACT Mutual of America", "GROUP ANNUITY CONTRACT Mutual of America"],
    [". Mutual of America", "Mutual of America"],
    ["‘Vanguard", "Vanguard"],
    ["| Principal Life Insurance Company", "Principal Life Insurance Company"],
    ["++ Empower Trust Company LLC", "Empower Trust Company LLC"],
    ["• Principal Global Investors Trust Co", "Principal Global Investors Trust Co"],
    // must STRIP — a PAGE NUMBER, which the letters-and-digits run cannot reach
    ["-0- VOYA FINANCIAL", "VOYA FINANCIAL"],
    ["-0- J.H. MFS", "J.H. MFS"],
    ["-18- Sponsor: Houston Distributing Company inc.", "Sponsor: Houston Distributing Company inc."],
    ["-14- American Funds", "American Funds"],
    ["%4 John Hancock", "John Hancock"],
    ["- 13 - Empower Trust Company, LLC", "Empower Trust Company, LLC"],
    // must KEEP — already clean
    ["Fidelity Investments", null],
    ["The Vanguard Group, Inc.", null],
    ["T. Rowe Price", null],
    ["Empower Trust Company, LLC", null],
    // must KEEP — a digit-leading FIRM (the fence)
    ["3M Company", null],
    ["1st Global Advisors", null],
    ["21st Century Fund", null],
    ["401(k) Plan", null],
    // must KEEP — OCR wreckage, left exactly as filed (the capital gate)
    ["/anguard Group", null],
    [".lohn Ilancock USA", null],
    ["‘hence nest tiem pe miei American Funds", null],
  ];
  let ibad = 0;
  for (const [inp, want] of ISS) {
    const got = shippedIss(inp);
    if ((got || null) !== want) { ibad++; console.log(`  FAIL  ${JSON.stringify(inp)}\n        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`); }
  }
  console.log(`\nshipped stripIssuerLead: ${ISS.length - ibad}/${ISS.length} pinned cases`);

  for (const drop of ["fence", "capital"]) {
    const f = mk(drop);
    const broke = [];
    for (const [inp, want] of ISS) {
      const got = f(inp) || null;
      if (got !== want) broke.push(`${JSON.stringify(inp)} -> ${JSON.stringify(got)}`);
    }
    console.log(`NEGATIVE CONTROL — drop the ${drop} condition: disagrees on ${broke.length} of ${ISS.length}`);
    for (const b of broke) console.log(`    ${b}`);
    if (!broke.length) { console.log("  !! a control that cannot fail is decorative"); ibad++; }
  }
  if (ibad) process.exitCode = 1;
}

/* ------------------------------------------------------------------------
 * CONTROL for merge-4i's SEC-TICKER TYPE GATE — 2026-09-30 (22:4xZ).
 *
 * Sliced by name out of merge-4i, never restated. The gate decides which rows
 * may carry an SEC-resolved ticker: the filing's TYPE cell must say mutual
 * fund or say nothing. A blank cell states nothing, and `fund-er.js` has
 * always asserted from the name alone where it is blank; a cell naming a
 * different vehicle contradicts, and that refusal is the whole guard.
 *
 * Two negative controls, one per arm, because each protects a different side:
 *   (1) drop the blank arm and the widening is inert — the 45,894 rows this
 *       change exists for stop being admitted;
 *   (2) drop the mutual-fund arm and the 147,835 rows already shipping are
 *       withdrawn.
 * A control that cannot fail is decorative, so each must disagree BY NAME.
 * ---------------------------------------------------------------------- */
{
  const s3 = fs.readFileSync(`${R}/scripts/merge-4i.mjs`, "utf8");
  const a = s3.indexOf("const secTypeAdmits = (type) => {");
  if (a < 0) throw new Error("secTypeAdmits slice moved");
  let d = 0, b = s3.indexOf("{", s3.indexOf("=>", a));
  for (let k = b; k < s3.length; k++) {
    if (s3[k] === "{") d++;
    else if (s3[k] === "}") { d--; if (!d) { b = k + 1; break; } }
  }
  const body = s3.slice(a, b) + ";";
  const shipped = new Function(body + " return secTypeAdmits;")();

  const mk = (drop) => {
    let t = body;
    if (drop === "blank") t = t.replace('t === "" || ', "");
    if (drop === "mutualfund") t = t.replace(' || /^mutual fund/i.test(t)', "");
    if (t === body) throw new Error("negative control '" + drop + "' changed nothing");
    return new Function(t + " return secTypeAdmits;")();
  };

  const TY = [
    // must ADMIT — the filing says nothing (Innoviva files 28 of 30 this way)
    ["", true], [null, true], [undefined, true], ["   ", true],
    // must ADMIT — the filing's own word
    ["Mutual fund", true], ["mutual fund", true], ["Mutual funds", true],
    // must REFUSE — the filing names a DIFFERENT vehicle
    ["Pooled separate account", false],
    ["Separate account", false],
    ["Collective trust", false],
    ["Stable value / GIC", false],
    ["Company stock", false],
    ["Exchange-traded fund", false],
    ["Cash / short-term", false],
    ["Government securities", false],
    ["Corporate debt", false],
    ["Master trust interest", false],
    ["Subtotal (not a holding)", false],
    ["Participant loans — not a menu choice", false],
    ["Brokerage window", false],
  ];
  let tbad = 0;
  for (const [inp, want] of TY) {
    const got = !!shipped(inp);
    if (got !== want) { tbad++; console.log(`  FAIL  type ${JSON.stringify(inp)}  want ${want} got ${got}`); }
  }
  console.log(`\nshipped secTypeAdmits: ${TY.length - tbad}/${TY.length} pinned cases`);

  for (const drop of ["blank", "mutualfund"]) {
    const f = mk(drop);
    const broke = [];
    for (const [inp, want] of TY) if (!!f(inp) !== want) broke.push(JSON.stringify(inp));
    console.log(`NEGATIVE CONTROL — drop the ${drop} arm: disagrees on ${broke.length} of ${TY.length}`);
    for (const x of broke) console.log(`    ${x}`);
    if (!broke.length) { console.log("  !! a control that cannot fail is decorative"); tbad++; }
  }
  if (tbad) process.exitCode = 1;
}

/* ---------------------------------------------------------------------- *
 * CONTROL for merge-4i's CLASS-ROTATION REPAIR — 2026-10-01 (08:1xZ).
 *
 * Neither arm above can see this family. `weldRepair` needs a case transition
 * INSIDE a word and `capsRepair` an all-caps token; here nothing is misspelt
 * at all — the filer's wrapped halves are re-joined in the wrong ORDER, so the
 * designation leads and the fund follows (`Fund I Class T. Rowe Price
 * Retirement 2045`). The repair is the rotation, never a strip: dropping the
 * lead would destroy the share class and withdraw VBTLX from `Admiral Fund
 * Vanguard Total Bond Market Index`.
 *
 * TWO CONDITIONS ARE LOAD-BEARING AND ONE IS NOT, and the controls say which.
 * The WITNESS — a lead the SEC registers as a class name — is priced at 835
 * further rows whole-store, overwhelmingly CORRECT names the ratio alone would
 * have destroyed. The RATIO is priced at 11. The PUNCTUATION check changes 0
 * rows on this store and is labelled decorative at the call site; it is tested
 * here against a CRAFTED attestation map, where it does fire, so the condition
 * is pinned by intent even though the live store cannot exercise it.
 */
{
  const si = src.indexOf("  let secClasses = null;");
  const sj = src.indexOf("  /* A BROKEN FONT SHIFTED A RUN", si);
  if (si < 0 || sj < 0) throw new Error("rotation slice moved");
  const rbody = src.slice(si, sj);
  if (!/rotRepair/.test(rbody)) throw new Error("slice missed rotRepair");
  if (!/secClasses/.test(rbody)) throw new Error("slice missed the witness");

  const mkRot = (drop, wholeMap) => {
    let b = rbody;
    if (drop === "witness") b = b.replace(
      "if (!secClasses.has(ln) && !secClasses.has(ln.replace(/^fund\\s+/, \"\"))) continue;", "");
    if (drop === "ratio") b = b.replace("if (n < filed * 3) continue;", "");
    if (drop === "punct") b = b
      .replace("if (!/^[A-Za-z0-9]/.test(lead)) break;", "")
      .replace("if (!/^[A-Za-z0-9]/.test(rest)) continue;", "");
    const ctx = { console: { log() {} }, whole: wholeMap,
      nk: (s) => String(s).trim().toLowerCase(),
      ck: (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
      readFileSync: (f, enc) => fs.readFileSync(path.isAbsolute(f) ? f : `${R}/${f}`, enc) };
    vm.createContext(ctx);
    vm.runInContext(b + "\n; this.__r = rotRepair;", ctx);
    return ctx.__r;
  };

  const rot = mkRot(false, whole);
  const ROT = [
    // must ROTATE — the designation leads and the fund follows
    ["Fund I Class T. Rowe Price Retirement 2045", "T. Rowe Price Retirement 2045 Fund I Class"],
    ["Institutional Premium Class Fidelity Freedom Index 2055 Fund", "Fidelity Freedom Index 2055 Fund Institutional Premium Class"],
    ["Admiral Shares Vanguard Total International Stock Index", "Vanguard Total International Stock Index Admiral Shares"],
    ["Fund Admiral Shares Vanguard Small-Cap Value Index", "Vanguard Small-Cap Value Index Fund Admiral Shares"],
    ["Class K6 Fidelity Freedom 2050 Fund", "Fidelity Freedom 2050 Fund Class K6"],
    ["Class R-6 2035 Target Date Retirement Fund", "2035 Target Date Retirement Fund Class R-6"],
    ["Investor Class Fidelity Freedom Index 2030 Fund", "Fidelity Freedom Index 2030 Fund Investor Class"],
    ["Institutional Class DFA U.S. Small Cap Portfolio", "DFA U.S. Small Cap Portfolio Institutional Class"],
    ["Growth Fund American Funds EuroPacific", "American Funds EuroPacific Growth Fund"],
    // must KEEP — the WITNESS: a lead that is no class at all
    ["Cash, non-interest bearing", null],
    ["Robeco Boston Partners Mid Cap Value", null],
    ["SACG Vanguard 500 Index", null],
    ["GM Fidelity 500 Index Fund", null],
    ["Large Cap Growth / JPMorgan", null],
    /* must KEEP — the RATIO, and every one of these was taken FROM THE STORE by
     * the whole-store control, because the two I first wrote here by hand
     * (`Vanguard Institutional Index Fund`, `Fidelity Contrafund`) are refused
     * by a neighbouring condition and made the ratio control decorative. A pin
     * set tests the cases its author already imagined; the store says which
     * cases exist. */
    ["Retirement Money Market Fund", null],
    /* AND THE CONTROLS CORRECTED MY OWN COMMENT HERE. I wrote that neither
     * spelling of this one is right; dropping the WITNESS shows the shipped
     * search can reach `Vanguard Target Retirement Income Fund`, which IS the
     * fund's name, at k=3 — the witness refuses it only because `Retirement
     * Income Fund` is not a registered class name. So it is pinned must-KEEP
     * for a different and stricter reason: with the ratio dropped the search
     * picks k=1 instead and produces `Income Fund Vanguard Target Retirement`,
     * which is wrong. Both conditions must hold for this row to stay still. */
    ["Retirement Income Fund Vanguard Target", null],
    /* AND THIS ONE IS A NAMED COST, not a save: the rotation really is correct
     * and the ratio refuses it, because nothing separates it from the two
     * above. Refusing a repair is the safe direction. */
    ["Class K BlackRock LifePath Index Retirement", null],
    // must KEEP — the registry's class column holds whole FUND names for some
    // registrants, so the witness alone admits these; nk's strictness and the
    // punctuation check both refuse them
    ["Core Bond Fund - VALIC", null],
    ["Inflation Protected Fund - VALIC", null],
    ["Bond Index Fund (Fidelity US)", null],
    ["(a) 500 Index Fund", null],
    ["(y) Putnam Large Cap Value Fund", null],
  ];
  let rbad = 0;
  for (const [inp, want] of ROT) {
    const got = rot(inp) || null;
    if (got !== want) { rbad++; console.log(`  FAIL  rot ${JSON.stringify(inp)}\n        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`); }
  }
  console.log(`\nshipped rotRepair: ${ROT.length - rbad}/${ROT.length} pinned cases`);

  for (const drop of ["witness", "ratio"]) {
    const f = mkRot(drop, whole);
    const broke = [];
    for (const [inp, want] of ROT) if ((f(inp) || null) !== want) broke.push(`${JSON.stringify(inp)} -> ${JSON.stringify(f(inp))}`);
    console.log(`NEGATIVE CONTROL — drop the ${drop}: disagrees on ${broke.length} of ${ROT.length}`);
    for (const x of broke) console.log(`    ${x}`);
    if (!broke.length) { console.log("  !! a control that cannot fail is decorative"); rbad++; }
  }

  /* THE PUNCTUATION CONTROL NEEDS A CRAFTED MAP, and saying so is the point:
   * on the live store it changes 0 rows, because `nk` keeps the punctuation in
   * the key so `- VALIC Core Bond Fund` is attested nowhere. Attest it, and the
   * witness admits the rotation — which is exactly the shape the check exists
   * to refuse should `nk` ever be loosened. */
  const crafted = new Map(whole);
  crafted.set("- valic core bond fund", 9);
  crafted.set("500 index fund (a)", 9);
  const pOn = mkRot(false, crafted), pOff = mkRot("punct", crafted);
  const PUNCT = ["Core Bond Fund - VALIC", "(a) 500 Index Fund"];
  const pBroke = [];
  for (const inp of PUNCT) {
    const on = pOn(inp) || null, off = pOff(inp) || null;
    if (on !== null) { console.log(`  FAIL  punct-on should refuse ${JSON.stringify(inp)}, got ${JSON.stringify(on)}`); rbad++; }
    if (off !== null) pBroke.push(`${JSON.stringify(inp)} -> ${JSON.stringify(off)}`);
  }
  console.log(`NEGATIVE CONTROL — drop the punctuation check (crafted map): disagrees on ${pBroke.length} of ${PUNCT.length}`);
  for (const x of pBroke) console.log(`    ${x}`);
  if (!pBroke.length) { console.log("  !! a control that cannot fail is decorative"); rbad++; }
  if (rbad) process.exitCode = 1;
}

/* THE CIPHER-RUN ARM — a broken font shifted a run of the name by +29.
 *
 * Pinned HERE rather than in the smoke test because the repair must happen to
 * the STORED name: `cleanFiledName` replaces every control character with a
 * space, so the ciphered digits (0x13-0x1c) are gone before any display arm
 * could decode them, and `&ODVV<03>5<19>` could never come out `Class R6`.
 *
 * A NEGATIVE CONTROL PER CONDITION, each built by dropping exactly that
 * condition from the SHIPPED slice. The seed is the only thing protecting a
 * real ALL-CAPS word from being read as cipher, and the fence is the only
 * thing protecting a sponsor's own name that sits beside a ciphered run.
 */
{
  const xi = src.indexOf("  const CIPH_CH = /");
  const xj = src.indexOf("  let weld = 0, caps", xi);
  if (xi < 0 || xj < 0) throw new Error("cipher slice moved");
  const xbody = src.slice(xi, xj);
  if (!/cipherRepair/.test(xbody)) throw new Error("slice missed cipherRepair");
  if (!/0x20/.test(src.slice(src.indexOf("A BROKEN FONT"), xi)))
    throw new Error("slice missed the plain-space fence note");

  const mkCiph = (drop) => {
    let b = xbody;
    if (drop === "fence") b = b.replace(
      "const CIPH_CH = /[\\x03-\\x1f\\x21-\\x3d\\x44-\\x5d]/;",
      "const CIPH_CH = /[\\x03-\\x5d]/;");
    if (drop === "trim") b = b.replace(
      "if (k < s.length && /[A-Za-z0-9]/.test(s[k]))      // cut MID-WORD, see above\n        while (k > i && CIPH_AMBIG.test(s[k - 1])) k--;", "");
    if (drop === "seed") b = b.replace("cnt(d) >= 3", "true");
    if (drop === "ctrl") b = b.replace(
      "if (/[\\u0000-\\u001f\\u007f]/.test(run)) {", "if (true) {");
    if (drop === "junk") b = b.replace(
      "if (JUNK_NAME_RE.test(a) && !JUNK_NAME_RE.test(b)) return null;", "");
    const ctx = { console: { log() {} }, cnt: (w) => tok.get(String(w).toLowerCase()) || 0,
      JUNK_NAME_RE };
    vm.createContext(ctx);
    vm.runInContext(b + "\n; this.__x = cipherRepair;", ctx);
    return ctx.__x;
  };
  const ciph = mkCiph(false);
  const C = String.fromCharCode(3);          // the ciphered space
  const CIPH = [
    /* must REPAIR — read out of the live store, every one checked against the
     * filing's own wording */
    [`1XYHHQ${C}6PDOO${C}&DS${C}%OHQG${C},QGH[${C})XQG${C}&ODVV${C}5`,
      "Nuveen Small Cap Blend Index Fund Class R"],
    /* the half-decode the queue predicted, solved by decoding the separator:
     * 0x19 is the ciphered `6` */
    [`1XYHHQ${C}/DUJH${C}&DS${C}5HVSRQVLEOH${C}(TXLW\\${C})XQG${C}&ODVV${C}5${String.fromCharCode(0x19)}`,
      "Nuveen Large Cap Responsible Equity Fund Class R6"],
    [`3XWQDP${C}/DUJH${C}&DS${C}9DOXH${C})XQG`, "Putnam Large Cap Value Fund"],
    /* a PLAIN prefix beside a ciphered run — the fence at work, and `,,` is II */
    [`Vanguard Windsor${C},,${C}$GPLUDO${C})XQG`, "Vanguard Windsor II Admiral Fund"],
    /* THREE PINS FLIPPED TO null AND THE JUSTIFICATION IS #536'S VERDICT, not a
     * convenience: each one decodes to Form 5500 cover-page vocabulary that
     * `JUNK_NAME_RE`'s ENTRY-level demotion then reads, and #536 withdrew five
     * real menus reaching 61,261 participants that way. Updating a control is
     * how a regression gets normalised, so the DECODE claim these three were
     * written to assert is pinned on its own in CIPH_DECODE below — the span
     * mechanism still reads every one of them correctly, and what changed is
     * only whether the repair is WRITTEN. */
    [`3ODQ${C}1DPH${C}`, null],
    [`Ź ANTONINI FREIGHT EXPRESS, INC. 401(K) & PROFIT SHARING PLAN (PSOR\\HU${C},GHQWLILFDWLRQ${C}1XPE`, null],
    [`7RWDO${String.fromCharCode(0x11)}${C}${C}$GG${C}OLQHV${C}6d${C}DQG${C}6e`, null],

    // must KEEP — not one of these is ciphered
    [`AEGON${C}US${C}High${C}Yi eld${C}Ret${C}Opt`, null],
    [`JH Mid Cap Growth Fund${C}`, null],
    [`DFA US Targeted Value Fund${C}`, null],
    [`Vanguard Tot Wld Stk Index ETF${C}`, null],
    [`See independent auditor's report.${C} John Hancock Value IT Fund`, null],
    ["Vanguard Windsor II Admiral Fund", null],      // no control character at all
    ["DODGE & COX STOCK FUND CLASS X", null],        // all-caps and real
    /* THE COST, pinned so it cannot be paid silently: Absolute Dental Group's
     * and American Financial Resources' form caption really IS ciphered and
     * really does decode to `instructions`, and the ciphered-space requirement
     * refuses it, because the run is ONE token bounded by a plain space and a
     * single coincidental token is where the evidence is thinnest. Refusing a
     * repair is the safe direction, and the row names no fund either way. */
    [`LQVWUXFWLRQV ${C}`, null],
  ];
  let xbad = 0;
  for (const [inp, want] of CIPH) {
    const got = ciph(inp) || null;
    if (got !== want) {
      console.log(`  FAIL  ${JSON.stringify(inp)}\n        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`);
      xbad++;
    }
  }
  console.log(`\nshipped cipherRepair: ${CIPH.length - xbad}/${CIPH.length} pinned cases`);

  /* THE DECODE CLAIM, kept from the three pins that flipped: the span mechanism
   * reads these correctly and the gate declines to WRITE them. Asserted against
   * the junk-gate-dropped variant, which is the decoder with nothing else
   * changed — so the sponsor name still survives the fence, the Form 5500 line
   * references are still left unshifted, and `Plan Name` still decodes. */
  {
    const dec = mkCiph("junk");
    const CIPH_DECODE = [
      [`3ODQ${C}1DPH${C}`, "Plan Name"],
      [`Ź ANTONINI FREIGHT EXPRESS, INC. 401(K) & PROFIT SHARING PLAN (PSOR\\HU${C},GHQWLILFDWLRQ${C}1XPE`,
        "Ź ANTONINI FREIGHT EXPRESS, INC. 401(K) & PROFIT SHARING PLAN Employer Identification Numb"],
      [`7RWDO${String.fromCharCode(0x11)}${C}${C}$GG${C}OLQHV${C}6d${C}DQG${C}6e`,
        "Total. Add lines 6d and 6e"],
    ];
    let dbad = 0;
    for (const [inp, want] of CIPH_DECODE) {
      const got = dec(inp) || null;
      if (got !== want) { console.log(`  FAIL  decode ${JSON.stringify(inp)}\n        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`); dbad++; }
    }
    console.log(`cipher DECODE claim (gate dropped): ${CIPH_DECODE.length - dbad}/${CIPH_DECODE.length}`);
    if (dbad) xbad++;
  }

  for (const [label, drop, expect] of [
    ["the plain-space FENCE", "fence", [5]],
    ["the mid-word TRIM", "trim", [6]],
    ["the decode-attested SEED", "seed", [7, 8, 9, 10]],
    ["the ciphered-space requirement", "ctrl", [14]],
    ["the JUNK-NAME gate", "junk", [4, 5, 6]],
  ]) {
    const v = mkCiph(drop);
    const broke = [];
    for (let n = 0; n < CIPH.length; n++) {
      const got = v(CIPH[n][0]) || null;
      if (got !== CIPH[n][1]) broke.push(`#${n} ${JSON.stringify(String(CIPH[n][0]).slice(0, 44))} -> ${JSON.stringify(String(got).slice(0, 56))}`);
    }
    console.log(`NEGATIVE CONTROL — drop ${label}: disagrees on ${broke.length} of ${CIPH.length}`);
    for (const x of broke) console.log(`    ${x}`);
    if (!broke.length) { console.log("  !! a control that cannot fail is decorative"); xbad++; }
  }
  if (xbad) process.exitCode = 1;
}

/* ---------------------------------------------------------------------- *
 * CONTROL for merge-4i's OCR `!` REPAIR — 2026-10-02.
 *
 * A scanned filing's lowercase `l` is a bare vertical stroke and OCR reads it
 * as `!`. The glyph stands for a DIFFERENT letter in different rows — measured
 * across the 393 rows the arm repairs, `l` on 345, `I` on 28, `t` on 11, `i`
 * on 9 and `T`/`X`/`L` once each — so the letter is chosen by a WITNESS (the
 * store's own published tokens) and never by a substitution rule. This record
 * already measured a naive `!`->`I` rewrite wrong on 4 of 7 rows.
 *
 * PINS ADDED BECAUSE NOT ONE EXISTING CASE REACHES THE ARM, measured: of the
 * 20 weld cases and 22 caps cases in this file, 0 contain a `!` and 0 change
 * verdict under any variant below. A pin set that cannot reach the new arm
 * leaves it untested while every gate stays green — the v189 failure.
 *
 * SEVEN NEGATIVE CONTROLS, one per condition, each failing BY NAME on exactly
 * its own cases. Three of them are DECORATIVE ON THIS STORE and say so: the
 * lone-glyph test, the length floor and the junk guard each change 0 of the
 * 393 rows. They are pinned anyway on CRAFTED witnesses, because each refuses
 * a shape the witness alone would admit and the cost of being wrong is a
 * fabricated fund name or, for the junk guard, a whole plan's menu (#536
 * withdrew five real menus reaching 61,261 participants that way).
 */
/* `make("bang")` and NOT `make(false)`: the selector is a string prefix, so
 * `make(false)` hands back `weldRepair`, which returns null for every name
 * carrying a `!` (it needs a camel seam). That read as 11 of 24 passing — all
 * of them the must-KEEPs — while the seven controls, whose keys DO start with
 * `bang`, ran the real predicate. *A baseline and its controls must be the same
 * function, and the disagreement between them is what caught this.* */
const bang = make("bang");
const BANG_CASES = [
  // must REPAIR — the glyph is a letter. All 59 token edits were read.
  ["Fidelity Freedom Index 2040 Inst! Prem", "Fidelity Freedom Index 2040 Instl Prem"],
  ["Vngrd Tt! Intl Bd Idx Adml", "Vngrd Ttl Intl Bd Idx Adml"],
  ["Mutua! Fund NIA", "Mutual Fund NIA"],
  ["Pooled separate accoun! ——_", "Pooled separate account ——_"],
  ["BlackRock High Yield Bond Ins!", "BlackRock High Yield Bond Inst"],
  ["Metrop!tn West Total Return", "Metropltn West Total Return"],
  ["Quant Solutions Internationa! Equity R6", "Quant Solutions International Equity R6"],
  /* ONLY THE GLYPH MOVES, so the filer's own lowercase survives: the store's
   * most published spelling is `Investment` 11,360 against `investment` 1,379,
   * and the arm still writes `investment` because it takes one CHARACTER from
   * that spelling and not the whole token. Pinned in the lowercase form after
   * the control caught me writing it from an earlier prototype. */
  ["Registered investmen! company", "Registered investment company"],
  /* the ALL-CAPS case arm, and it is the row the 2026-10-02 03:1xZ draw
   * flagged: Aya Healthcare Services (63,406 ppl) publishes this at 13.2% of
   * its menu / $76,586,960 while six sibling vintages read `INDEX` */
  ["NUVEEN LIFECYCLE !NDEX 2060 INST", "NUVEEN LIFECYCLE INDEX 2060 INST"],
  ["FID MID CAP !DX", "FID MID CAP IDX"],
  ["3rincipal LifeTime Hybrid 2035 C!T", "3rincipal LifeTime Hybrid 2035 CIT"],
  // the CASE arm where the token is MIXED: the store's spelling supplies the
  // character, so `!ndex` is `Index` and `!shares` is `ishares`
  ["Fidelity Freedom !ndex 2055 Fund", "Fidelity Freedom Index 2055 Fund"],
  ["!shares S&P 500 Index K", "ishares S&P 500 Index K"],
  // must KEEP — (3) the marker refusal: the glyph follows a COMPLETE word and
  // appending a letter would FABRICATE one
  ["T. Rowe Price Retirement 2015 Fund!", null],
  ["JPMorgan Large Cap Growth!", null],
  ["Vanguard Institutional Index Fund Plus!", null],
  ["Mid Cap Index eo!", null],
  /* must KEEP, and this one is a NAMED COST rather than a win: `SML` is very
   * likely the right reading of PIMCO RAE US Small, and the marker refusal
   * takes it because the bare `SM` is published 13,069 times against `SML`'s
   * 954. Refusing a repair is the safe direction, so the cost is pinned rather
   * than engineered around. Sibling cost, same cause: `Eaton Vance-At! Cp
   * SMIDCp F R6` keeps its glyph. */
  ["PIM RAE US SM!", null],
  // must KEEP — (2) no letter dominates, so nothing is known
  ["Blackrock Gib! Allocation Inst", null],
  ["CRLN E MID CAP GR!", null],
  // must KEEP — (4) CRAFTED, and the only thing refusing it is the length
  // floor: the English word `of` is published often enough to clear any ratio
  ["Vanguard O! America Fund", null],
  // must KEEP — (4a) a lone glyph is not a damaged letter
  ["Vanguard 500 Index Fund !", null],
  /* must KEEP, CRAFTED, and this is what makes (4a) non-decorative: a run of
   * glyphs with no letter in it would otherwise become the fabricated holding
   * `III`, because `t.replace(/!/g, L)` turns `!!!` into a published token. */
  ["Vanguard Index !!! Fund", null],
  /* must KEEP, CRAFTED, and the ONLY thing refusing it is #536's junk guard:
   * `plan` is published often enough to win, and the repaired name is a Form
   * 5500 cover-page line, which `JUNK_NAME_RE`'s ENTRY-level demotion would
   * read as grounds to withdraw the WHOLE lineup. That is how #536 cost five
   * real menus 61,261 participants. */
  ["P!an Name", null],
  /* must REPAIR, and it pins the junk guard's DIRECTION rather than its force:
   * this name ALREADY matches `JUNK_NAME_RE`, so making it legible creates no
   * new conviction and the guard correctly stands aside. A guard that refused
   * here would be refusing to read what the filing says. */
  ["Emp!oyer Identification Number", "Employer Identification Number"],
  // must KEEP — no `!` at all: the arm must be the identity
  ["Vanguard 500 Index Fund Admiral Shares", null],
  ["Fidelity Contrafund K6", null],
];
let bbad = 0;
for (const [inp, want] of BANG_CASES) {
  const got = bang(inp) || null;
  if (got !== want) { bbad++; console.log(`  FAIL  ${JSON.stringify(inp)}\n        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`); }
}
console.log(`\nshipped `+"`!`"+` repair: ${BANG_CASES.length - bbad}/${BANG_CASES.length} pinned cases`);
if (bbad) process.exitCode = 1;

/* not one existing case reaches the new arm — measured, not assumed */
const reachOld = [...CASES, ...CAPS_CASES].filter(([n]) => String(n).includes("!")).length;
console.log(`  existing cases reaching the `+"`!`"+` arm: ${reachOld} of ${CASES.length + CAPS_CASES.length}`);

const BANG_CONTROLS = [
  ["bang-floor",  "(1) the attestation floor of 3"],
  ["bang-ratio",  "(2) the tenfold letter ratio"],
  ["bang-marker", "(3) the fivefold marker refusal"],
  ["bang-letter", "(4a) the token must hold a letter"],
  ["bang-minlen", "(4b) the three-character floor"],
  ["bang-case",   "the case witness"],
  ["bang-junk",   "the #536 junk guard"],
];
console.log(`\nNEGATIVE CONTROL, one per condition:`);
for (const [key, label] of BANG_CONTROLS) {
  const v = make(key);
  const broke = [];
  for (const [inp, want] of BANG_CASES) {
    const got = v(inp) || null;
    if (got !== want) broke.push(`${JSON.stringify(inp)} -> ${JSON.stringify(got)}`);
  }
  console.log(`  drop ${label}: disagrees on ${broke.length} of ${BANG_CASES.length}`);
  for (const b of broke) console.log(`      ${b}`);
}

/* ==== THE WELDED-VALUE REPAIR ============================================
 * A holding name carrying its own value, negated: `MONEY MARKET -415,027` on a
 * row whose value IS 415,027. Its evidence is the ROW, not an attestation map,
 * so the predicate takes the whole row and the cases carry a value.
 *
 * The predicate is SLICED from merge-4i rather than retyped, and the slice's
 * landing is asserted — the drift control in this very file went decorative
 * once before when the function it targeted was renamed. */
{
  const MSRC = src;   // merge-4i.mjs, already read at the top of this file
  const H = "  const valueRepair = (f) => {";
  const T = "\n  };";
  const h = MSRC.indexOf(H);
  if (h < 0) throw new Error("merge-name-test: valueRepair moved in merge-4i.mjs");
  const t = MSRC.indexOf(T, h);
  const vsrc = MSRC.slice(h, t + T.length).replace(/^\s*const valueRepair =/, "valueRepair =");
  const mk = (drop) => {
    let s = vsrc;
    if (drop === "v-equality") {
      s = s.replace("if (!(num > 0 && Math.abs(num - v) <= 1)) return null;", "if (!(num > 0)) return null;");
      if (s === vsrc) throw new Error("control v-equality did not land");
    } else if (drop === "v-head") {
      s = s.replace("if (!/[A-Za-z]{3}/.test(head)) return null;", "");
      if (s === vsrc) throw new Error("control v-head did not land");
    } else if (drop === "v-anchor") {
      /* two ASCII-only targets: the source carries a literal U+2212, so a
       * search string spelling it `−` cannot match -- which this control
       * reported by refusing to land rather than by passing quietly */
      s = s.replace("(.*[A-Za-z)])", "(.*)").replace("{3,}", "{2,}");
      if (s === vsrc) throw new Error("control v-anchor did not land");
    }
    // eslint-disable-next-line no-new-func
    return new Function(`let valueRepair; ${s}; return valueRepair;`)();
  };

  /* Every MUST-REPAIR case is a real store row; every MUST-REFUSE case is a
   * real name the cheap screen reads and the equality test throws out. */
  const V_CASES = [
    // [name, value, expected]
    ["MONEY MARKET -415,027", 415027, "MONEY MARKET"],                   // ABM, 88,660 ppl
    ["MONEY MARKET -4,536,115", 4536115, "MONEY MARKET"],                // Stantec
    ["CERT OF DEPOSIT / BANK DEPOSIT -306,404", 306404, "CERT OF DEPOSIT / BANK DEPOSIT"],
    ["CERT OF DEPOSIT / BANK DEPOSIT -21,388", 21388, "CERT OF DEPOSIT / BANK DEPOSIT"],
    ["MONEY MARKET -114,080", 114080, "MONEY MARKET"],                   // the smallest live case
    /* the number is a CONTRACT number, not the value -- refused */
    ["Citibank N.A. Contract #TR24-100", 102363000, null],
    /* a maturity DATE inside a security's own name -- refused */
    ["PVTPL CMO BX TRUST SR 25-GW CL B FLTG RT07-15-2042", 1002480, null],
    /* a real fund whose name ENDS in a vintage, with no minus at all */
    ["Nuveen Lifecycle Index 2030 R6", 2030, null],
    /* the equality is what decides it: same shape, wrong number */
    ["MONEY MARKET -415,027", 999999, null],
    /* off by one is accepted (filers round), off by two is not */
    ["MONEY MARKET -415,027", 415028, "MONEY MARKET"],
    ["MONEY MARKET -415,027", 415029, null],
    /* a head with no readable word must not be stripped to nothing. The FIRST
     * of these is refused by the ANCHOR (it ends in a digit, not a letter), so
     * it does NOT reach the three-letter floor -- the harness said so by name,
     * reporting that control as changing 0 of 14. The second ends in a letter
     * and so is the only case that reaches the floor; no live store row has
     * that shape, so the floor is DEFENSIVE and labelled as such rather than
     * claimed to be load-bearing. *An arm can be inert while every existing
     * case still passes.* */
    ["42 -415,027", 415027, null],
    ["A B -415,027", 415027, null],
    /* a negative value on the row: the name carries the ABSOLUTE figure */
    ["MONEY MARKET -415,027", -415027, "MONEY MARKET"],
    /* fewer than three digits is below the screen, so a real hyphenated
     * class designation cannot be eaten */
    ["Templeton Global Bond -50", 50, null],
  ];
  const vr = mk(null);
  let vFails = 0;
  for (const [name, value, want] of V_CASES) {
    const got = vr({ name, value }) || null;
    if (got !== want) { vFails++; console.error(`FAIL valueRepair(${JSON.stringify(name)}, ${value}) -> ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
  }
  console.log(`\nwelded-value repair: ${V_CASES.length - vFails}/${V_CASES.length} passed`);
  if (vFails) process.exitCode = 1;

  /* NEGATIVE CONTROL, one per condition, each asserted to have LANDED and
   * required to disagree on at least one case. A control that cannot fail is
   * decorative. */
  const V_CONTROLS = [
    ["v-equality", "the equality with the row's own value"],
    ["v-head",     "the three-letter floor on the remaining head"],
    ["v-anchor",   "the letter/paren anchor and the three-digit screen"],
  ];
  console.log(`NEGATIVE CONTROL, one per condition:`);
  for (const [key, label] of V_CONTROLS) {
    const v = mk(key);
    const broke = [];
    for (const [name, value, want] of V_CASES) {
      const got = v({ name, value }) || null;
      if (got !== want) broke.push(`${JSON.stringify(name)} @${value} -> ${JSON.stringify(got)}`);
    }
    console.log(`  drop ${label}: disagrees on ${broke.length} of ${V_CASES.length}`);
    for (const b of broke.slice(0, 4)) console.log(`      ${b}`);
    if (!broke.length) { console.error(`FAIL the control for ${label} changed NOTHING -- it is decorative`); process.exitCode = 1; }
  }
}

/* ---- THE WELDED SHARE COUNT, sibling of the arm above ------------------
 * Same self-evidence with the number in the MIDDLE: the count must be followed
 * by `shares`/`units` and must EQUAL the row's own value. 18 rows / 16 plans /
 * 11,668 participants / $110,295,497, verified end-to-end through a real merge
 * (18 name changes, nothing else moved).
 *
 * SLICED from the shipped source, not restated, and the slice's landing is
 * asserted -- but this arm calls TWO MODULE IMPORTS (`isGenericTypeName`,
 * `hasNoFundIdentity`), so the wrapper injects them, exactly as the JUNK_NAME_RE
 * note above does for weldRepair. Injecting the REAL ones matters: the identity
 * guard is the condition that stops this arm damaging three rows, so a stub
 * would make the control for it meaningless. */
{
  const MSRC = src;   // merge-4i.mjs, already read at the top of this file
  const H = "  const shareRepair = (f) => {";
  const T = "\n  };";
  const h = MSRC.indexOf(H);
  if (h < 0) throw new Error("merge-name-test: shareRepair moved in merge-4i.mjs");
  const t = MSRC.indexOf(T, h);
  const ssrc = MSRC.slice(h, t + T.length).replace(/^\s*const shareRepair =/, "shareRepair =");
  if (!/shares\?\|units\?/.test(ssrc)) throw new Error("slice missed the unit anchor");
  if (!/isGenericTypeName/.test(ssrc)) throw new Error("slice missed the identity guard");

  const smk = (drop) => {
    let z = ssrc;
    if (drop === "s-equality") {
      z = z.replace("if (!(num > 0 && Math.abs(num - v) <= 1)) return null;", "if (!(num > 0)) return null;");
      if (z === ssrc) throw new Error("control s-equality did not land");
    } else if (drop === "s-identity") {
      z = z.replace("if (isGenericTypeName(head) || hasNoFundIdentity(head)) return null;", "");
      if (z === ssrc) throw new Error("control s-identity did not land");
    } else if (drop === "s-head") {
      z = z.replace("if (!/[A-Za-z]{3}/.test(head)) return null;", "");
      if (z === ssrc) throw new Error("control s-head did not land");
    } else if (drop === "s-unit") {
      /* ASCII-only target: drop the requirement that a unit word follow */
      z = z.replace("(?:shares?|units?)\\b", "(?:shares?|units?)?");
      if (z === ssrc) throw new Error("control s-unit did not land");
    }
    // eslint-disable-next-line no-new-func
    return new Function("isGenericTypeName", "hasNoFundIdentity",
      `let shareRepair; ${z}; return shareRepair;`)(isGenericTypeName, hasNoFundIdentity);
  };

  /* Every MUST-REPAIR case is a real store row. */
  const S_CASES = [
    ["Invesco Stable Value Trust, 91,398,409 shares", 91398409, "Invesco Stable Value Trust"],   // W.R. Grace
    ["Putnam Stable Value 384,141 Units", 384141, "Putnam Stable Value"],
    ["Vanguard Retirement Savings Trust 891,385 shares", 891385, "Vanguard Retirement Savings Trust"],
    ["Fidelity Cash Reserves 23,148 shares", 23148, "Fidelity Cash Reserves"],
    ["Invesco Stable Value III 1,465,244 units", 1465244, "Invesco Stable Value III"],
    ["Synthetic Cash Account – 534 Shares", 534, "Synthetic Cash Account"],                 // en dash
    /* the count carries DECIMALS and the value is the rounded dollar */
    ["Federated Government Obligations Tax- Managed Fund Institutional Shares, 281,253.886 share", 281254,
      "Federated Government Obligations Tax- Managed Fund Institutional Shares"],
    /* a trailing `of` -- the filed name was already truncated; the head is
     * still the best available and is not made worse */
    ["American Funds US Government Money 117,943 shares of", 117943, "American Funds US Government Money"],

    /* ---- THE IDENTITY GUARD, which is why this arm is safe ----
     * L Brands (30,989 ppl, $85,408,028). TODAY the page shows
     * `85,408,028 - shares` and hasNoFundIdentity QUALIFIES it. Stripping the
     * count would publish `Mutual Fund` unqualified, so the arm must REFUSE.
     * A REPAIR THAT LEAVES A NAME WITH NO FUND IN IT IS NOT A REPAIR. */
    ["Mutual Fund – 85,408,028 - shares", 85408028, null],
    ["Mutual Fund – 1,401,913 - shares", 1401913, null],
    ["Mutual fund, 102,311 shares", 102311, null],

    /* ---- the equality is what decides it ---- */
    ["Putnam Stable Value 384,141 Units", 999999, null],        // right shape, wrong number
    ["Putnam Stable Value 384,141 Units", 384142, "Putnam Stable Value"],   // off by one, accepted
    ["Putnam Stable Value 384,141 Units", 384143, null],        // off by two, refused

    /* ---- a SHARE COUNT that is not the value: the commonest real shape, and
     * the whole reason the equality test exists. A $12.34 NAV fund holds
     * 81,000 shares worth $1,000,000 and must never be touched here. */
    ["Vanguard Russell 1000 Growth Index I; 56,772 shares", 1000000, null],

    /* ---- the unit word is the anchor: a bare trailing number belongs to
     * valueRepair, and a contract or maturity figure to neither ---- */
    ["Citibank N.A. Contract #TR24-100", 102363000, null],
    ["MONEY MARKET -415,027", 415027, null],                   // valueRepair's own case
    /* fewer than three digits is below the screen */
    ["Some Fund 50 shares", 50, null],
    /* ---- nothing readable left behind. The FIRST of these is refused by the
     * ANCHOR (the head must end in a letter or paren, and "42 " does not), so
     * it never REACHES the floor -- my first pin was exactly that shape and the
     * harness reported the floor's control as changing 0 of 19. *An arm can be
     * inert while every existing case still passes.* The second reaches it:
     * `AB CD` has no three consecutive letters, and the identity guard does NOT
     * refuse it (two-letter tokens are not in its filler list), so the floor is
     * LOAD-BEARING and not subsumed -- measured, after assuming the opposite.
     * No live store row has that shape, so it is DEFENSIVE. */
    ["42 1,000 shares", 1000, null],
    ["AB CD 1,000 shares", 1000, null],
  ];
  const sr = smk(null);
  let sFails = 0;
  for (const [name, value, want] of S_CASES) {
    const got = sr({ name, value }) || null;
    if (got !== want) { sFails++; console.error(`FAIL shareRepair(${JSON.stringify(name)}, ${value}) -> ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
  }
  console.log(`\nwelded-share-count repair: ${S_CASES.length - sFails}/${S_CASES.length} passed`);
  if (sFails) process.exitCode = 1;

  const S_CONTROLS = [
    ["s-equality", "the equality with the row's own value"],
    ["s-identity", "the identity guard that refuses a head naming no fund"],
    ["s-unit",     "the unit-word anchor"],
    ["s-head",     "the three-letter floor on the remaining head"],
  ];
  console.log(`NEGATIVE CONTROL, one per condition:`);
  for (const [key, label] of S_CONTROLS) {
    const v = smk(key);
    const broke = [];
    for (const [name, value, want] of S_CASES) {
      let got;
      try { got = v({ name, value }) || null; } catch (e) { got = `THREW ${e.message}`; }
      if (got !== want) broke.push(`${JSON.stringify(name)} @${value} -> ${JSON.stringify(got)}`);
    }
    console.log(`  drop ${label}: disagrees on ${broke.length} of ${S_CASES.length}`);
    for (const b of broke.slice(0, 3)) console.log(`      ${b}`);
    if (!broke.length) { console.error(`FAIL the control for ${label} changed NOTHING -- it is decorative`); process.exitCode = 1; }
  }
}
