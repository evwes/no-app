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
const { JUNK_NAME_RE } = await import(`${R}/scripts/lib-4i.mjs`);
const i = src.indexOf("  const SEAM = /\\b[A-Za-z]{3,}");
const j = src.indexOf("  let weld = 0, caps", i);
if (i < 0 || j < 0) throw new Error("slice moved");
const body = src.slice(i, j);
if (!/weldRepair/.test(body)) throw new Error("slice missed weldRepair");
if (!/capsRepair/.test(body)) throw new Error("slice missed capsRepair");

// the real store's attestation maps, built the way the block builds them
const whole = new Map(), tok = new Map(), caseOf = new Map();
for (let s = 0; s < 64; s++) {
  const E = JSON.parse(fs.readFileSync(`${R}/data/lineups/${String(s).padStart(2,"0")}.json`, "utf8"));
  for (const [, e] of Object.entries(E)) {
    if (!e || !e.confident || !Array.isArray(e.funds)) continue;
    for (const f of e.funds) {
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
  if (drop === true) b = b.replace("if ((whole.get(nk(rep)) || 0) >= 3) best = rep;", "best = rep;");
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
  vm.runInContext(b + "\n; this.__w = weldRepair; this.__c = capsRepair; this.__b = bangRepair; this.__whole = whole; this.__tok = tok; this.__caseOf = caseOf;", ctx);
  for (const [k, v] of whole) ctx.__whole.set(k, v);
  for (const [k, v] of tok) ctx.__tok.set(k, v);
  /* `caseOf` is built from `buckets`, which this context stubs empty, so it is
   * filled here the way `whole`/`tok` are — otherwise the `!` arm would have no
   * case witness and every control would read the same. */
  for (const [k, v] of caseOf) ctx.__caseOf.set(k, v);
  if (String(drop || "").startsWith("bang")) return ctx.__b;
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
