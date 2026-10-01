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
/* NEVER a hardcoded sandbox path: `cwd: "/home/user/no-app"` in map-test.mjs
 * made Node report `spawn python3 ENOENT` on the runner and sent the first
 * reading of that failure at the runner image. */
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(`${R}/scripts/merge-4i.mjs`, "utf8");
const i = src.indexOf("  const SEAM = /\\b[A-Za-z]{3,}");
const j = src.indexOf("  let weld = 0, caps", i);
if (i < 0 || j < 0) throw new Error("slice moved");
const body = src.slice(i, j);
if (!/weldRepair/.test(body)) throw new Error("slice missed weldRepair");
if (!/capsRepair/.test(body)) throw new Error("slice missed capsRepair");

// the real store's attestation maps, built the way the block builds them
const whole = new Map(), tok = new Map();
for (let s = 0; s < 64; s++) {
  const E = JSON.parse(fs.readFileSync(`${R}/data/lineups/${String(s).padStart(2,"0")}.json`, "utf8"));
  for (const [, e] of Object.entries(E)) {
    if (!e || !e.confident || !Array.isArray(e.funds)) continue;
    for (const f of e.funds) {
      const n = String(f.name || "").trim(); if (!n) continue;
      const k = n.toLowerCase();
      whole.set(k, (whole.get(k) || 0) + 1);
      for (const t of n.split(/[^A-Za-z]+/)) if (t.length > 1) tok.set(t.toLowerCase(), (tok.get(t.toLowerCase()) || 0) + 1);
    }
  }
}
function make(drop) {
  /* the caps arm loads its registry witness with readFileSync, so the vm
   * context needs it and the path must resolve from the repo root rather than
   * from wherever this test was invoked — never a hardcoded sandbox path */
  const ctx = { buckets: [], SHARDS: 0, console,
    readFileSync: (f, enc) => fs.readFileSync(path.isAbsolute(f) ? f : `${R}/${f}`, enc) };
  vm.createContext(ctx);
  let b = body;
  if (drop === true) b = b.replace("if ((whole.get(nk(rep)) || 0) >= 3) best = rep;", "best = rep;");
  /* the caps arm's ONE guard, replaced by the bare floor it looks like it could
   * be — this is the variant that convicts 333 real fund names */
  if (drop === "caps-noratio") b = b.replace("if (w <= joined * 3) continue;", "if (w < 3) continue;");
  /* the WITNESS, which only the whole-store ticker diff could show was needed:
   * without it `SMALLCAP WORLD R6 FUND` is split and LOSES RLLGX, because
   * American Funds' own registered spelling of that series is the joined one */
  if (drop === "caps-nowitness") b = b.replace("if (secWords.has(t.toLowerCase())) continue;", "");
  vm.runInContext(b + "\n; this.__w = weldRepair; this.__c = capsRepair; this.__whole = whole; this.__tok = tok;", ctx);
  for (const [k, v] of whole) ctx.__whole.set(k, v);
  for (const [k, v] of tok) ctx.__tok.set(k, v);
  return String(drop || "").startsWith("caps") ? ctx.__c : ctx.__w;
}
const shipped = make(false), drifted = make(true);
const caps = make("caps"), capsNoRatio = make("caps-noratio"), capsNoWitness = make("caps-nowitness");

const CASES = [
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
  const sj = src.indexOf("  let weld = 0, caps = 0, rot = 0;", si);
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
