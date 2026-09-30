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
const j = src.indexOf("  let weld = 0;", i);
if (i < 0 || j < 0) throw new Error("slice moved");
const body = src.slice(i, j);
if (!/weldRepair/.test(body)) throw new Error("slice missed weldRepair");

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
  const ctx = { buckets: [], SHARDS: 0, console };
  vm.createContext(ctx);
  let b = body;
  if (drop) b = b.replace("if ((whole.get(nk(rep)) || 0) >= 3) best = rep;", "best = rep;");
  vm.runInContext(b + "\n; this.__w = weldRepair; this.__whole = whole; this.__tok = tok;", ctx);
  for (const [k, v] of whole) ctx.__whole.set(k, v);
  for (const [k, v] of tok) ctx.__tok.set(k, v);
  return ctx.__w;
}
const shipped = make(false), drifted = make(true);

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
