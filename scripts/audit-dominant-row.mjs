import { readFileSync, readdirSync } from "node:fs";
import { loadPlans, loadStatus } from "/home/user/no-app/scripts/lib-schema.mjs";
const P = loadPlans("/home/user/no-app/plans-all.json");
const S = loadStatus("/home/user/no-app/lineups-status.json");
const byAck = P.byAck();
/* Not fund-shaped: statement line items, aggregates, and parse shrapnel. A
 * real fund name carries a product word or a manager plus something more. */
const NOT_FUND = /^(?:at (?:fair|contract) value|investments?(?:,? at .*)?|total .*|various\b.*|master trust.*|investments? held in the trust.*|participant[- ]directed.*|cusip:?.*|net assets.*|assets\b.*|cash( and cash equivalents)?|other\b.*|[a-z]\s+total\b.*|b\s+total.*|see (?:note|attach).*|interest[- ]bearing cash|value of interest in .*)$/i;
let junk = 0, junkD = 0, fundish = 0, fundishD = 0;
const list = [];
for (const f of readdirSync("/home/user/no-app/data/lineups")) {
  if (!f.endsWith(".json")) continue;
  const sh = JSON.parse(readFileSync(`/home/user/no-app/data/lineups/${f}`, "utf8"));
  for (const [ack, e] of Object.entries(sh)) {
    if (!e || !Array.isArray(e.funds) || e.funds.length < 2) continue;
    const st = S.at(ack); if (!st || !st.c) continue;
    const sum = e.funds.reduce((s, x) => s + (+x.value || 0), 0) || 1;
    const sorted = [...e.funds].sort((a, b) => b.value - a.value);
    const share = (+sorted[0].value || 0) / sum;
    if (share < 0.90) continue;
    const r = byAck.get(ack); const assets = r ? +P.get(r, "assetsEOY") || 0 : 0;
    const nm = String(sorted[0].name || "").trim();
    if (NOT_FUND.test(nm)) { junk++; junkD += assets; list.push({ assets, nm, share, n: e.funds.length, sp: r?String(P.get(r,"sponsorName")).trim().slice(0,32):"?" }); }
    else { fundish++; fundishD += assets; }
  }
}
console.log("CONFIDENT lineups whose top row is >=90% of the shown sum:\n");
console.log(`  dominant row is NOT fund-shaped : ${junk} plans   $${(junkD/1e9).toFixed(1)}B   <-- fabricated lineups`);
console.log(`  dominant row IS a plausible fund: ${fundish} plans   $${(fundishD/1e9).toFixed(1)}B   <-- likely honest single-holding plans`);
list.sort((a,b)=>b.assets-a.assets);
console.log("\n  assets  rows share  sponsor | dominant row");
for (const w of list.slice(0,14)) console.log(`  $${(w.assets/1e9).toFixed(2).padStart(6)}B ${String(w.n).padStart(4)} ${(w.share*100).toFixed(0)}%  ${w.sp} | ${w.nm.slice(0,42)}`);
