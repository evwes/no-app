#!/usr/bin/env node
/* wampo — SIZE THE 2K AFTER-TAX ROW, applying the page's whole resolution
 * chain in order. Supersedes an earlier version of this script that read only
 * the two BOOT fields and over-counted by ~4.3M readers.
 *
 * The owner decided (2026-11-05) to publish code 2K as what it LITERALLY
 * means. Reading the shipped surface first: app.js ALREADY does that, in both
 * branches of `unknownContributionCard` (app.js:3819 short form, :3829 full
 * form). So the decision was half-shipped, and what was missing was the
 * FEATURES PANEL on the same screen, where `taxRow("Voluntary After-Tax",
 * plan.afterTax, ...)` rendered the generic `whyUnknown` text whenever
 * plan.afterTax was null.
 *
 * THE CHAIN, transcribed from app.js rather than guessed, because each step
 * removes plans from the population and skipping one over-counts:
 *   529   afterTax = curated.afterTax ?? null      <- data.js, keyed by TICKER
 *   645   if (afterTax == null && (bits & 32)) true <- boot index
 *   3456  if (ff.afterTax) true                     <- lineup shard, on expand
 *   3891  on == null -> "— <why>";  on === false -> "✗ Not offered"
 *
 * Only the `null` branch is touched, so a curated or filed FALSE keeps its
 * "✗ Not offered" — 2K does not contradict it. READING THE PAGE is what caught
 * that: Walmart renders "✗ Not offered" from a curated false, and an earlier
 * version of this measurement had it in the improved population as the single
 * largest member at 1,996,659 readers.
 *
 * And the population SPLITS, because only one half was a contradiction: the
 * 401(m) sentence renders only in `unknownContributionCard`, which app.js:5134
 * picks only when no match formula was filed.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPlans } from "./lib-schema.mjs";
import { servedLineup } from "./lib-ledger.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lidx = JSON.parse(readFileSync(path.join(ROOT, "lineups-index.json"), "utf8")).plans;
const bits = JSON.parse(readFileSync(path.join(ROOT, "plans-index.json"), "utf8")).bits;
const d = loadPlans();

/* the curated overlay, keyed by ticker exactly as mergePlan keys it */
const dj = readFileSync(path.join(ROOT, "data.js"), "utf8");
const curated = new Map();
for (const m of dj.matchAll(/ticker:\s*"([A-Z.]+)"[\s\S]{0,2000}?afterTax:\s*(true|false|null)/g))
  curated.set(m[1], m[2] === "true" ? true : m[2] === "false" ? false : null);
if (curated.size < 5) throw new Error(`CONTROL FAILED: parsed only ${curated.size} curated entries`);
console.log(`curated overlay: ${curated.size} tickers carry an afterTax verdict ` +
  `(${[...curated.values()].filter((v) => v === false).length} false, ${[...curated.values()].filter((v) => v === true).length} true)`);

const feats = new Map();
for (const sh of readdirSync(path.join(ROOT, "data/lineups"))) {
  if (!sh.endsWith(".json")) continue;
  for (const [ack, e] of Object.entries(JSON.parse(readFileSync(path.join(ROOT, "data/lineups", sh), "utf8"))))
    if (e && e.features) feats.set(ack, e.features);
}
if (!feats.size) throw new Error("CONTROL FAILED: no features loaded — the measurement is void");

const B = { contra: [], under: [], curatedFalse: [], established: [] };
let no2k = 0, i = -1;
for (const row of d.rows) {
  i++;
  const codes = String(d.get(row, "codes") || "");
  if (!/2K/.test(codes)) { no2k++; continue; }
  const ppl = +d.get(row, "partEOY") || +d.get(row, "participants") || 0;
  const rec = { name: String(d.get(row, "sponsorName") || "").trim(), ppl };

  /* step 1 — the curated overlay wins, in BOTH directions */
  const tk = d.get(row, "ticker");
  if (tk && curated.has(tk) && curated.get(tk) != null) {
    B[curated.get(tk) ? "established" : "curatedFalse"].push(rec);
    continue;
  }
  /* steps 2 and 3 — the boot bit, then the served lineup's features */
  const plan = { ack: d.get(row, "ack"), mtiaAck: d.get(row, "mtiaAck"), ein: d.get(row, "ein"), pn: d.get(row, "pn") };
  const s = servedLineup(plan, lidx);
  const ff = s.ack ? feats.get(s.ack) : null;
  if (((+bits[i] || 0) & 32) || (ff && ff.afterTax)) { B.established.push(rec); continue; }

  /* the row said "— <why>". Which card was beside it? */
  const employerM = +d.get(row, "contribEmployer") || 0;
  const filedCard = !!(ff && (ff.match || ((ff.matchText || ff.vesting || ff.nec) && employerM !== 0)));
  B[filedCard ? "under" : "contra"].push(rec);
}
const sum = (a) => a.reduce((t, x) => t + x.ppl, 0);
const f = (x) => x.toLocaleString();
const line = (l, a) => console.log(`  ${l.padEnd(46)} ${f(a.length).padStart(7)} plans  ${f(sum(a)).padStart(12)} readers`);
console.log(`\nplans WITHOUT code 2K (untouched): ${f(no2k)}`);
console.log(`plans WITH code 2K:`);
line("CONTRADICTION — 401(m) card + \"not stated\"", B.contra);
line("UNDER-REPORT — match filed, panel silent", B.under);
line("after-tax already Available (untouched)", B.established);
line("curated \"✗ Not offered\" (untouched)", B.curatedFalse);
console.log(`  ${"-".repeat(46)} ${"-".repeat(7)}        ${"-".repeat(12)}`);
line("TOTAL IMPROVED", [...B.contra, ...B.under]);
for (const [k, l] of [["contra", "CONTRADICTION"], ["under", "UNDER-REPORT"], ["curatedFalse", "CURATED FALSE (untouched)"]]) {
  B[k].sort((a, b) => b.ppl - a.ppl);
  console.log(`\nlargest ${l}:`);
  for (const x of B[k].slice(0, 6)) console.log(`  ${String(x.ppl).padStart(9)}  ${x.name.slice(0, 46)}`);
}
