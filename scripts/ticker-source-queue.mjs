#!/usr/bin/env node
/* wampo — WHICH TICKERS TO SOURCE NEXT, IN READER ORDER.
 *
 * `fund-worklist.mjs` ranks fund NAMES, and that over-counts the work badly:
 * "Fidelity 500 Index Fund" (11.9M readers), "Fidelity 500 Index" (6.9M) and
 * "500 Index Fund" (4.2M) are three spellings of FXAIX, which is ALREADY
 * sourced, and its top entry -- "Self-Directed Brokerage Account", 24.9M -- is
 * not a fund at all. So the name list cannot say how much sourcing is left.
 *
 * This ranks by TICKER, over the rows the page actually publishes, and counts
 * only ADDRESSABLE work: a row must resolve a ticker, must not be a comparable
 * (a starred row publishes no fee and no return by the owner's standing
 * decision, whatever we source), and its ticker must carry no sourced facts.
 *
 * It sources nothing. A ticker, a fee and a return are FACTS THAT MUST BE
 * SOURCED, and `data/fund-facts.json` -- written only by the fund-facts agent,
 * with a URL and an as-of date per figure -- is the only place they may live.
 *
 * Run: node scripts/ticker-source-queue.mjs [--top 40]
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRenderer } from "./apppath.mjs";
import { loadPlans } from "./lib-schema.mjs";
import { servedLineup } from "./lib-ledger.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const R = buildRenderer({ appjs: path.join(ROOT, "app.js") });
const lidx = JSON.parse(readFileSync(`${ROOT}/lineups-index.json`, "utf8")).plans;
const d = loadPlans();
R.setPlans(d.rows.map((r) => ({ sponsorName: d.get(r, "sponsorName"), ticker: d.get(r, "ticker") })));

/* FUND_FACTS exactly as the page parses it */
const ffSrc = readFileSync(`${ROOT}/fund-facts.js`, "utf8");
const FF = JSON.parse(ffSrc.slice(ffSrc.indexOf("{"), ffSrc.lastIndexOf("}") + 1));
const nYtd = Object.values(FF).filter((v) => v && v.ytd != null).length;
console.log(`fund-facts.js: ${Object.keys(FF).length} tickers, ${nYtd} carry a ytd`);
/* MUST-SEE: without this every figure below is a clean zero reporting on the
 * query rather than on the data. */
if (nYtd < 50) throw new Error(`CONTROL FAILED: only ${nYtd} tickers carry a ytd`);

const members = new Map();
for (const row of d.rows) {
  const p = { ack: d.get(row, "ack"), mtiaAck: d.get(row, "mtiaAck"),
    ein: d.get(row, "ein"), pn: d.get(row, "pn"),
    participants: +d.get(row, "partEOY") || +d.get(row, "participants") || 0,
    sponsorName: String(d.get(row, "sponsorName") || "").trim(), ticker: d.get(row, "ticker") };
  const s = servedLineup(p, lidx);
  if (!s.ack) continue;
  if (!members.has(s.ack)) members.set(s.ack, []);
  members.get(s.ack).push(p);
}

const VERDICT = new Map();
const QUEUE = new Map();
let rows = 0, priced = 0, tkRows = 0, ytdRows = 0, starBlocked = 0;
const menus = [];
for (const sh of readdirSync(`${ROOT}/data/lineups`).sort()) {
  if (!sh.endsWith(".json")) continue;
  const shard = JSON.parse(readFileSync(`${ROOT}/data/lineups/${sh}`, "utf8"));
  for (const [ack, e] of Object.entries(shard)) {
    const mem = members.get(ack);
    if (!mem || !e || !e.confident || !Array.isArray(e.funds) || !e.funds.length) continue;
    const lead = mem[0];
    const total = e.funds.reduce((a, f) => a + (+f.value || 0), 0);
    let n = 0, val = 0;
    for (const raw of e.funds) {
      rows++;
      const f = { ...raw, nameRaw: String(raw.name || ""), name: R.clean(String(raw.name || "")) };
      const key = `${String(f.iss || "").trim()}\u0000${f.nameRaw}\u0000${String(f.type || "")}`;
      let r = VERDICT.get(key);
      if (r === undefined) { r = R.renderRow(lead, f, "menu", total); VERDICT.set(key, r); }
      if (!r) continue;
      if (r.er != null && r.er !== "") priced++;
      if (!r.tk) continue;
      tkRows++;
      /* THE QUEUE: a row that RESOLVES a ticker, is not a comparable, and whose
       * ticker carries no sourced facts. Those three conditions are what stands
       * between a reader and a figure -- a starred row is refused by the owner's
       * standing decision whatever we source, so it is not addressable work. */
      if (r.star) { starBlocked++; continue; }
      const key2 = String(r.tk).toUpperCase();
      const sf = FF[key2];
      if (sf && sf.ytd != null) { ytdRows++; n++; val += +raw.value || 0; continue; }
      let q = QUEUE.get(key2);
      if (!q) QUEUE.set(key2, q = { rows: 0, plans: new Set(), ppl: 0, val: 0, names: new Map() });
      q.rows++; q.val += +raw.value || 0;
      if (!q.plans.has(ack)) { q.plans.add(ack); q.ppl += mem.reduce((a, m) => a + m.participants, 0); }
      q.names.set(f.nameRaw, (q.names.get(f.nameRaw) || 0) + 1);
    }
    if (n) menus.push({ name: mem[0].sponsorName, ppl: mem.reduce((a, m) => a + m.participants, 0),
      n, of: e.funds.length, share: total ? val / total : 0 });
  }
}

/* ---- the queue ---- */
const top = (() => { const i = process.argv.indexOf("--top"); return i > 0 ? +process.argv[i + 1] : 40; })();
const q = [...QUEUE.entries()].map(([tk, v]) => ({ tk, rows: v.rows, plans: v.plans.size, ppl: v.ppl, val: v.val,
  name: [...v.names].sort((a, b) => b[1] - a[1])[0][0] }))
  .sort((a, b) => b.ppl - a.ppl);

const sourcedRows = ytdRows;
const addressable = q.reduce((a, x) => a + x.rows, 0);
console.log(`\npublished+served rows ${rows.toLocaleString()}  (ticker resolved on ${tkRows.toLocaleString()})`);
console.log(`  ALREADY sourced:                  ${sourcedRows.toLocaleString()} rows`);
console.log(`  refused as a COMPARABLE (starred): ${starBlocked.toLocaleString()} rows — NOT addressable at any amount of sourcing`);
console.log(`  ADDRESSABLE by sourcing:          ${addressable.toLocaleString()} rows across ${q.length.toLocaleString()} distinct tickers`);

let cum = 0;
const marks = [10, 25, 50, 100, 200, 500, 1000];
console.log(`\nCUMULATIVE ROWS GAINED by sourcing the top N tickers:`);
const byRows = [...q].sort((a, b) => b.rows - a.rows);
let c2 = 0;
for (let i = 0; i < byRows.length; i++) {
  c2 += byRows[i].rows;
  if (marks.includes(i + 1)) console.log(`  top ${String(i + 1).padStart(4)} tickers -> ${String(c2.toLocaleString()).padStart(9)} rows  (${(100 * (sourcedRows + c2) / tkRows).toFixed(1)}% of all tickered rows sourced)`);
}

console.log(`\nTOP ${top} BY READERS — the work list for the fund-facts agent:`);
console.log(`  ${"ticker".padEnd(8)}${"readers".padStart(11)}${"plans".padStart(8)}${"rows".padStart(8)}   most common filed name`);
for (const x of q.slice(0, top)) {
  console.log(`  ${x.tk.padEnd(8)}${x.ppl.toLocaleString().padStart(11)}${x.plans.toLocaleString().padStart(8)}${x.rows.toLocaleString().padStart(8)}   ${x.name.slice(0, 44)}`);
}
console.log(`\n  (readers are PLAN-DEDUPLICATED per ticker but a reader holding two unsourced funds counts in both — these columns do not sum)`);
