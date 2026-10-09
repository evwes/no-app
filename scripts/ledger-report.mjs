#!/usr/bin/env node
/* wampo — read the field ledger and print what is knowable, known, and missing.
 *
 * This is the scorecard a cycle reads before choosing work and after shipping,
 * and the thing a swarm of field agents coordinates on. It prints:
 *
 *   1. the five exact plan-level fields, participant-weighted, with the
 *      IMPOSSIBLE share called out separately as a ceiling rather than a gap;
 *   2. one scalar, so a cycle can say whether it moved anything;
 *   3. the biggest ADDRESSABLE gaps by participants, which is where work goes;
 *   4. the largest individual plans with an addressable gap, which is what a
 *      hands-on review opens.
 *
 *   node scripts/ledger-report.mjs [--field <name>] [--rows 20] [--json]
 */
import { buildLedger, score, PLAN_LEVEL, ROW_LEVEL } from "./lib-ledger.mjs";

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const ROWS = Number(flag("--rows", 12));
const ONLY = flag("--field", null);
if (ONLY && !PLAN_LEVEL.includes(ONLY)) throw new Error(`--field must be one of ${PLAN_LEVEL.join(", ")}`);

const ledger = buildLedger();
const s = score(ledger);

if (argv.includes("--json")) {
  console.log(JSON.stringify({ score: s, generated: ledger.generated }, null, 1));
  process.exit(0);
}

const n = (x) => Math.round(x).toLocaleString();
const pc = (x) => (x === null ? "   —  " : (x * 100).toFixed(1).padStart(5) + "%");

console.log(`wampo FIELD LEDGER — ${ledger.plans.length.toLocaleString()} plans, `
  + `${n(s.universePpl)} participants\n`);

console.log("PLAN-LEVEL FIELDS, participant-weighted. `shown` is the share of the");
console.log("KNOWABLE cells a reader sees; `ceiling` is the share of the universe the");
console.log("source cannot answer at all, which is not a gap and not work.\n");
console.log("  field          shown    published      withheld       partial        absent    ceiling");
console.log("  " + "-".repeat(94));
for (const f of PLAN_LEVEL) {
  const b = s.fields[f];
  console.log(`  ${f.padEnd(13)} ${pc(b.publishedShareOfPossible)}  `
    + `${n(b.published).padStart(12)}  ${n(b.withheld).padStart(12)}  `
    + `${n(b.partial).padStart(12)}  ${n(b.absent).padStart(12)}  ${pc(b.impossibleShareOfUniverse)}`);
}
console.log("\n  ONE SCALAR — participant-weighted share of knowable plan-level cells shown:");
console.log(`    ${(s.overall * 100).toFixed(2)}%   (addressable cells: ${n(s.addressable)} participant-cells)`);

console.log(`\nROW-LEVEL FIELDS (${ROW_LEVEL.join(", ")}) are NOT in the scalar above.`);
console.log("  Their honest unit is a share of a plan's menu VALUE, not a per-plan");
console.log("  boolean, and measuring them needs the render path over ~1.6M rows.");
console.log("  Measured instead by the participant-weighted draw, 2026-10-06:");
console.log("    of a typical participant's own menu value, a symbol-keyed source");
console.log("    reaches 47.4% (30.1% asserted + 17.2% already-asterisked comparable);");
console.log("    52.6% carries no symbol, and 20.0% of THAT is unpriceable by nature");
console.log("    (managed-account aggregates, brokerage windows) where NA is correct.");
console.log("  See docs/performance-source.md. Re-measure, never carry forward.");

/* WHERE THE WORK IS. Grouped by the ledger's own `why`, because a reason is
 * what an agent can act on and a count is not. */
console.log(`\n${"=".repeat(96)}\nADDRESSABLE GAPS BY REASON, participant-weighted`);
for (const f of PLAN_LEVEL) {
  if (ONLY && f !== ONLY) continue;
  const by = new Map();
  for (const p of ledger.plans) {
    const c = p.cells[f];
    if (c.state !== "absent" && c.state !== "partial") continue;
    const k = `${c.state}: ${c.why}`;
    const o = by.get(k) || { ppl: 0, plans: 0 };
    o.ppl += p.ppl; o.plans++; by.set(k, o);
  }
  if (!by.size) { console.log(`\n  ${f}: nothing addressable`); continue; }
  console.log(`\n  ${f}`);
  [...by.entries()].sort((a, b) => b[1].ppl - a[1].ppl).forEach(([k, o]) =>
    console.log(`    ${n(o.ppl).padStart(12)} ppl  ${String(o.plans).padStart(7)} plans  ${k}`));
}

console.log(`\n${"=".repeat(96)}\nLARGEST PLANS WITH AN ADDRESSABLE GAP — what a hands-on review opens`);
const gaps = ledger.plans
  .map((p) => ({ p, miss: PLAN_LEVEL.filter((f) => p.cells[f].state === "absent" || p.cells[f].state === "partial") }))
  .filter((x) => x.miss.length)
  .sort((a, b) => b.p.ppl - a.p.ppl)
  .slice(0, ROWS);
for (const { p, miss } of gaps) {
  console.log(`  ${n(p.ppl).padStart(9)} ppl  ${p.sponsorName.slice(0, 34).padEnd(34)} `
    + `${p.sf ? "SF " : "FF "} ein=${p.ein} pn=${p.pn}`);
  for (const f of miss) console.log(`${" ".repeat(16)}${f.padEnd(14)} ${p.cells[f].state}: ${p.cells[f].why}`);
}
