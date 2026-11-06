#!/usr/bin/env node
/* wampo — SIZE THE SOURCED YTD RETURN before rendering it.
 *
 * `fund-facts.js` carries {er, erAsOf, ytd, ytdAsOf} for 92 tickers and every
 * visitor already downloads it; app.js:4592 reads `sf.er` and ignores
 * `sf.ytd`, and `build-seo-pages.mjs` has 0 references. So the returns are
 * sourced, paid for and rendered by nothing.
 *
 * THE QUESTION THIS ANSWERS IS A DESIGN ONE, not a yield one: a COLUMN that is
 * 99% empty is worse than no column. So this measures, within the plans that
 * would carry any return at all, what share of the MENU and of its VALUE is
 * covered -- a column earns its width if a reader sees several filled cells,
 * and does not if they see one.
 *
 * Condition is EXACTLY the one the sourced fee already uses -- `!star && tk`
 * and the table knows the symbol -- because a starred row is a COMPARABLE and
 * attaching a real fund's RETURN to a collective trust the plan actually holds
 * is the same error the fee ship recorded and fixed by opening one page.
 *
 * Measured through the real `renderRow` with the serving condition and the
 * publish gate applied, grouped on the (issuer, RAW name, type) triple the
 * resolvers key on, participants PLAN-DEDUPLICATED.
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
      const sf = FF[String(r.tk).toUpperCase()];
      if (!sf || sf.ytd == null) continue;
      if (r.star) { starBlocked++; continue; }   // a comparable's return is not this plan's
      ytdRows++; n++; val += +raw.value || 0;
    }
    if (n) menus.push({ name: mem[0].sponsorName, ppl: mem.reduce((a, m) => a + m.participants, 0),
      n, of: e.funds.length, share: total ? val / total : 0 });
  }
}
const ppl = menus.reduce((a, m) => a + m.ppl, 0);
console.log(`\npublished+served rows ${rows.toLocaleString()}  (fee printed on ${priced.toLocaleString()}, ticker on ${tkRows.toLocaleString()})`);
console.log(`rows that would carry a SOURCED RETURN: ${ytdRows.toLocaleString()}  (${(ytdRows / rows * 100).toFixed(2)}% of rows)`);
console.log(`  refused as a COMPARABLE (starred): ${starBlocked.toLocaleString()}`);
console.log(`plans with at least one: ${menus.length.toLocaleString()} / readers ${ppl.toLocaleString()}`);

const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
const byVal = menus.map((m) => m.share).sort((a, b) => a - b);
const byRow = menus.map((m) => m.n / m.of).sort((a, b) => a - b);
const byN = menus.map((m) => m.n).sort((a, b) => a - b);
console.log(`\nWITHIN those plans — is a column worth its width?`);
console.log(`  filled CELLS per menu:     p10 ${pct(byN,.1)}  median ${pct(byN,.5)}  p90 ${pct(byN,.9)}  max ${byN[byN.length-1]}`);
console.log(`  share of ROWS covered:     p10 ${(pct(byRow,.1)*100).toFixed(0)}%  median ${(pct(byRow,.5)*100).toFixed(0)}%  p90 ${(pct(byRow,.9)*100).toFixed(0)}%`);
console.log(`  share of MENU VALUE:       p10 ${(pct(byVal,.1)*100).toFixed(0)}%  median ${(pct(byVal,.5)*100).toFixed(0)}%  p90 ${(pct(byVal,.9)*100).toFixed(0)}%`);
const one = menus.filter((m) => m.n === 1).length;
console.log(`  menus with exactly ONE filled cell: ${one.toLocaleString()} (${(one / menus.length * 100).toFixed(0)}%)`);

menus.sort((a, b) => b.ppl - a.ppl);
console.log(`\nlargest by readers:`);
for (const m of menus.slice(0, 10))
  console.log(`  ${String(m.ppl).padStart(9)}  ${String(m.n).padStart(3)}/${String(m.of).padEnd(3)} rows  ${(m.share * 100).toFixed(1).padStart(5)}% of value  ${m.name.slice(0, 42)}`);
