/* Size the State Farm defect from data we already have.
 * Signature: the parser took the DESCRIPTION column as the fund name. When
 * that column is generic ("Common Collective Trust Portfolio") every row in
 * the menu carries the same name, and the name-keyed dedup then SUMS them
 * into one giant fake fund. State Farm: 55 Vanguard CITs -> one $18.0B row.
 * Any lineup we already publish containing such a name is showing wrong data. */
import { readFileSync, readdirSync } from "node:fs";
import { loadPlans, loadStatus } from "./lib-schema.mjs";
import { GENERIC_TYPE_NAME } from "./lib-4i.mjs";


const P = loadPlans();
const S = loadStatus();
const byAckPlan = new Map();
for (const r of P.rows) byAckPlan.set(P.get(r, "ack"), r);

let scanned = 0, hitPlans = 0, hitDollars = 0, hitRows = 0;
const worst = [];
const dir = "data/lineups";
for (const f of readdirSync(dir)) {
  if (!f.endsWith(".json")) continue;
  const shard = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
  for (const [ack, entry] of Object.entries(shard)) {
    const funds = entry && entry.funds;
    if (!Array.isArray(funds) || !funds.length) continue;
    scanned++;
    const st = S.at(ack);
    if (!st || !st.c) continue;               // only lineups we actually PUBLISH
    const bad = funds.filter((x) => GENERIC_TYPE_NAME.test(String(x.name || "").trim()));
    if (!bad.length) continue;
    const sum = funds.reduce((s, x) => s + (+x.value || 0), 0);
    const badSum = bad.reduce((s, x) => s + (+x.value || 0), 0);
    if (badSum / Math.max(sum, 1) < 0.25) continue;   // a stray loans row is fine
    const row = byAckPlan.get(ack);
    const assets = row ? +P.get(row, "assetsEOY") || 0 : 0;
    hitPlans++; hitDollars += assets; hitRows += bad.length;
    worst.push({ ack, assets, n: funds.length, badN: bad.length,
      share: badSum / Math.max(sum, 1),
      name: row ? String(P.get(row, "sponsorName") || "").trim().slice(0, 38) : "?",
      top: bad.sort((a, b) => b.value - a.value)[0].name.slice(0, 46) });
  }
}
worst.sort((a, b) => b.assets - a.assets);
console.log(`lineup entries scanned: ${scanned}`);
console.log(`PUBLISHED lineups where generic description-column names carry >=25% of the shown sum:`);
console.log(`  ${hitPlans} plans   $${(hitDollars / 1e9).toFixed(1)}B in plan assets   ${hitRows} such rows\n`);
console.log("  assets   rows  bad  share  sponsor / worst generic name");
for (const w of worst.slice(0, 25)) {
  console.log(`  $${(w.assets / 1e9).toFixed(2).padStart(6)}B ${String(w.n).padStart(5)} ${String(w.badN).padStart(4)} ${(w.share * 100).toFixed(0).padStart(5)}%  ${w.name} | ${w.top}`);
}
