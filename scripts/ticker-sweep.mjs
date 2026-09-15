#!/usr/bin/env node
/* wampo — ticker/ER coverage sweep. Runs fund-er.js against every confident
 * lineup in data/lineups and prints, for each ticker, the distinct filed names
 * that map to it. A pattern that over-matches shows up here as a group
 * containing a different manager or a different strategy — that is the review
 * this script exists to force, and it has caught two shipped-quality errors
 * ("Oakmark International Small Cap" claiming OAKIX; "Vanguard 500 Index
 * Fund-Admiral" reaching nothing).
 *
 * Names are printed in full: truncating them once made a correct mapping look
 * broken (a glued junk name read as a Dimensional fund mapped to DODGX).
 *
 * Usage: node scripts/ticker-sweep.mjs [--comparable] [--gaps]
 *   (no flag)      coverage totals + every ticker group
 *   --comparable   only the comparable (*) groups
 *   --gaps         unmatched holdings ranked by total dollars, by family
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "fund-er.js"), "utf8")
  + "\nglobalThis.__t = fundTickerInfo;", ctx);
const tk = ctx.__t;

const mode = process.argv.includes("--comparable") ? "comparable"
  : process.argv.includes("--gaps") ? "gaps" : "all";

const skip = (f) => /brokerage|self-directed|participant loan|company stock|employer (security|stock)/i
  .test((f.type || "") + " " + f.name);

/* PARTICIPANT WEIGHT. Rows are not the unit a reader experiences — a blank fee
 * cell in a 300,000-participant plan is not one blank. The identified-row share
 * had never been printed in either unit before 2026-09-15, which is how it sat
 * at 19% for the life of the project with no audit able to see it: an
 * unidentified row still renders and every arithmetic check passes.
 * ack -> participants of the plans that DISPLAY that lineup (own confident ack,
 * else the linked trust's), read through lib-schema so a wrong field name
 * throws instead of silently weighting everything zero. */
import { loadPlans } from "./lib-schema.mjs";
const ackPpl = new Map();
try {
  const P = loadPlans(path.join(root, "plans-all.json"));
  const st = JSON.parse(fs.readFileSync(path.join(root, "lineups-status.json"), "utf8")).plans;
  for (const r of P.rows) {
    const own = P.get(r, "ack"), mt = P.get(r, "mtiaAck");
    const a = own && st[own] && st[own].c ? own : (mt && st[mt] && st[mt].c ? mt : null);
    if (a) ackPpl.set(a, (ackPpl.get(a) || 0) + (P.get(r, "participants") || 0));
  }
} catch (e) { console.log("(participant weighting unavailable: " + e.message + ")"); }

// group an unmatched holding by manager + strategy, for the gap ranking
const family = (n) => String(n)
  .replace(/\b(class|cl|cls)\s*[a-z0-9]{1,3}\b/gi, "")
  .replace(/\b(fund|trust|pool|portfolio|port|index|idx|inst(itutional)?|adm(iral)?|unitized|collective|series|acct|account)\b/gi, " ")
  .replace(/\b(19|20)\d\d\b/g, "<year>")
  .replace(/[^A-Za-z<> ]/g, " ").replace(/\s+/g, " ").trim().toLowerCase()
  .split(" ").slice(0, 3).join(" ");

const counts = { exact: 0, comparable: 0, none: 0 };
const byTicker = {};
const gaps = {};
let rows = 0, pplRows = 0, pplHit = 0;

for (let i = 0; i < 64; i++) {
  const p = path.join(root, "data/lineups", String(i).padStart(2, "0") + ".json");
  if (!fs.existsSync(p)) continue;
  const shard = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const ack of Object.keys(shard)) {
    const e = shard[ack];
    if (!e.confident || !e.funds) continue;
    const ppl = ackPpl.get(ack) || 0;
    for (const f of e.funds) {
      rows++;
      pplRows += ppl;
      const r = tk(f.name, f.type);
      if (r) pplHit += ppl;
      if (!r) {
        counts.none++;
        if (skip(f)) continue;
        const key = family(f.name);
        if (!key || key.length < 4) continue;
        const g = (gaps[key] = gaps[key] || { n: 0, v: 0, ex: new Set() });
        g.n++; g.v += f.value || 0;
        if (g.ex.size < 3) g.ex.add(String(f.name));
        continue;
      }
      counts[r.comparable ? "comparable" : "exact"]++;
      const key = (r.comparable ? "*" : "") + r.tk;
      (byTicker[key] = byTicker[key] || new Set()).add(String(f.name));
    }
  }
}

const pc = (a, b) => b ? (100 * a / b).toFixed(2) + "%" : "n/a";
console.log(`holdings scanned: ${rows}`);
console.log(`  exact ticker: ${counts.exact}   comparable(*): ${counts.comparable}   none: ${counts.none}`);
console.log(`  IDENTIFIED-ROW SHARE: ${counts.exact + counts.comparable} of ${rows} = ${pc(counts.exact + counts.comparable, rows)}`);
console.log(`  weighted by participants: ${pc(pplHit, pplRows)} of ${pplRows} participant-rows\n`);

if (mode === "gaps") {
  console.log("Unmatched holdings, ranked by total dollars:\n");
  for (const [k, g] of Object.entries(gaps).sort((a, b) => b[1].v - a[1].v).slice(0, 40)) {
    console.log(`$${(g.v / 1e9).toFixed(1).padStart(7)}B  ${String(g.n).padStart(6)} rows  ${k}`);
    for (const ex of g.ex) console.log(`             e.g. ${ex}`);
  }
} else {
  const groups = Object.entries(byTicker)
    .filter(([t]) => mode !== "comparable" || t.startsWith("*"))
    .sort((a, b) => b[1].size - a[1].size);
  console.log("Each ticker and the distinct filed names mapping to it — read for\nany name from a different manager or strategy:\n");
  for (const [t, names] of groups) {
    console.log(`${t}  (${names.size} distinct)`);
    for (const n of [...names].slice(0, 6)) console.log(`    ${n}`);
    if (names.size > 6) console.log(`    … ${names.size - 6} more`);
  }
}
