#!/usr/bin/env node
/* wampo — A POOLED FUND OUR OWN CODE HAS IDENTIFIED, STILL PUBLISHING A MUTUAL
 * FUND'S PATTERN FEE.
 *
 * `isMistypedStockRow` exists because a plan files a POOLED FUND under the type
 * `Company stock` -- Duke Energy's sixteen, nine target-date vintages among
 * them, $5.58B and 50.1% of its published menu, each of which `stockRow` would
 * otherwise have labelled with `DUK`. So by the time that predicate returns
 * true, THE PAGE ALREADY KNOWS the row is a pooled vehicle and not the
 * sponsor's stock.
 *
 * And then it prices it from `fund-er.js`, a MUTUAL-FUND name-pattern table.
 * `noPublicPrice` is the guard that exists to stop exactly this, and it cannot
 * fire, because it reads the TYPE CELL and the type cell is the thing that is
 * wrong -- the recorded `gicRow` shape, where a mistyped or blank type defeats
 * a vehicle suppressor. `app.js:4526`'s er chain lists `stockRow`, `gicRow`,
 * `subtotalRow`, `loanRow`, `annuityRow`, `contractRow`, `namelessRow`,
 * `bankDepositFee` and `mistypedGuaranteeFee`. It does NOT list
 * `mistypedStock`, so only the sub-case whose fee happens to be guarantee-only
 * is covered.
 *
 * WHAT THIS MEASURES, through the REAL renderers so the figures are what a
 * reader sees: how many published+served rows carry `mistypedStock` AND a
 * published expense ratio, with readers deduplicated per plan, plus the
 * split by how the fee was priced and by what the filer typed.
 *
 * IT WRITES NOTHING.
 *
 * Run: node scripts/mistyped-stock-fee-size.mjs [--examples 20]
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPlans } from "./lib-schema.mjs";
import { servedLineup } from "./lib-ledger.mjs";
import { buildRenderer } from "./apppath.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const N_EX = +((argv[argv.indexOf("--examples") + 1]) || 20);

const d = loadPlans(path.join(ROOT, "plans-all.json"));
const idxRaw = JSON.parse(readFileSync(path.join(ROOT, "lineups-index.json"), "utf8"));
const idx = idxRaw.plans || idxRaw;
if (!Object.keys(idx).length) { console.error("lineups-index.json: empty ack map"); process.exit(1); }

const cAck = d.col("ack"), cMtia = d.col("mtiaAck"), cParts = d.col("participants"),
  cName = d.col("sponsorName"), cEin = d.col("ein"), cPn = d.col("pn");

/* served ack -> the plans it is served to, so readers are counted ONCE per
 * plan and a trust's menu is credited only to the plans actually served it */
const served = new Map();
for (const r of d.rows) {
  const s = servedLineup({ ack: r[cAck], mtiaAck: r[cMtia] }, idx);
  if (!s || !s.ack) continue;
  if (!served.has(s.ack)) served.set(s.ack, []);
  served.get(s.ack).push({ ppl: +r[cParts] || 0, name: r[cName], ein: r[cEin], pn: r[cPn] });
}

/* one pass to index the rows by plan key, so the shard walk below is a lookup
 * rather than a scan (see the note at its call site) */
const PLAN_BY_KEY = new Map();
for (const r of d.rows) PLAN_BY_KEY.set(`${r[cEin]}|${r[cPn]}`, d.wrap(r));

const R = buildRenderer({});
R.setPlans(d);

/* MUST-SEE PIN. Duke Energy is the case the predicate was written for, and a
 * measurement that cannot see its own motivating example has not been scoped --
 * so this THROWS rather than printing a tidy number. */
let sawPin = false;

const tally = { rows: 0, fired: 0, priced: 0, readers: 0, dollars: 0,
  plans: new Set(), byEr: new Map(), byType: new Map() };
const ex = [];
const dir = path.join(ROOT, "data", "lineups");

/* GROUPED, because rendering all ~1.7M published rows does not finish -- this
 * project records that, and two runs here confirmed it. `isMistypedStockRow`
 * and the fee both read the ROW (name, nameRaw, type) and not the plan, so one
 * render per distinct (issuer, name, type) triple answers for every row that
 * carries it; the weights are summed separately. Verified by the predicate's
 * own signature at app.js:4353, which is passed `f` and `f.name` alone. */
const groups = new Map();
for (const file of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
  const shard = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
  for (const [ack, entry] of Object.entries(shard)) {
    const members = served.get(ack);
    if (!members || !entry || !entry.confident || !Array.isArray(entry.funds)) continue;
    const total = entry.funds.reduce((a, x) => a + (+x.value || 0), 0);
    const ppl = members.reduce((a, m) => a + m.ppl, 0);
    const lead = members[0];
    for (const fund of entry.funds) {
      tally.rows++;
      const k = `${fund.iss || ""}\u0000${fund.nameRaw || fund.name || ""}\u0000${fund.type || ""}`;
      let g = groups.get(k);
      if (!g) { g = { fund, total, rows: 0, ppl: 0, dollars: 0, plans: new Set(), lead, pct: 0 }; groups.set(k, g); }
      g.rows++; g.ppl += ppl; g.dollars += +fund.value || 0;
      for (const m of members) g.plans.add(`${m.ein}|${m.pn}`);
      const pct = total > 0 ? (+fund.value || 0) / total * 100 : 0;
      if (pct > g.pct) { g.pct = pct; g.lead = lead; }
    }
  }
}
console.log(`distinct (issuer, name, type) groups: ${groups.size.toLocaleString()} over ${tally.rows.toLocaleString()} rows\n`);

const anyPlan = PLAN_BY_KEY.values().next().value;
for (const g of groups.values()) {
  const planObj = PLAN_BY_KEY.get(`${g.lead.ein}|${g.lead.pn}`) || anyPlan;
  let r;
  try { r = R.renderRow(planObj, g.fund, "menu", g.total); } catch { continue; }
  if (!r || !r.flags || !r.flags.mistypedStock) continue;
  tally.fired += g.rows;
  if (r.er == null || r.er === "" || r.er === "\u2014") continue;
  tally.priced += g.rows;
  tally.readers += g.ppl;
  tally.dollars += g.dollars;
  for (const p2 of g.plans) tally.plans.add(p2);
  tally.byEr.set(String(r.er), (tally.byEr.get(String(r.er)) || 0) + g.rows);
  const t = String(g.fund.type || "(blank)");
  tally.byType.set(t, (tally.byType.get(t) || 0) + g.rows);
  if (/duke/i.test(String(g.lead.name))) sawPin = true;
  ex.push({ ppl: g.ppl, er: r.er, tk: r.tk, star: r.star, v: g.dollars, pct: g.pct,
    type: t, sponsor: String(g.lead.name).slice(0, 26), name: String(g.fund.name || "").slice(0, 44) });
}

const fmt = (n) => Math.round(n).toLocaleString("en-US");
console.log(`rows rendered                        ${fmt(tally.rows)}`);
console.log(`mistypedStock fires on               ${fmt(tally.fired)}`);
console.log(`...of which PUBLISH an expense ratio ${fmt(tally.priced)}   <- the class`);
console.log(`plans                                ${fmt(tally.plans.size)}`);
console.log(`readers (deduplicated per plan)      ${fmt(tally.readers)}`);
console.log(`dollars on those rows                $${fmt(tally.dollars)}`);

console.log(`\nby the fee published (a pattern-table estimate on a POOLED vehicle):`);
for (const [k, v] of [...tally.byEr.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`   er ${k.padEnd(7)} ${String(v).padStart(6)} rows`);
console.log(`\nby what the FILER typed (this is the cell that defeats noPublicPrice):`);
for (const [k, v] of [...tally.byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`   ${k.padEnd(26)} ${String(v).padStart(6)} rows`);

ex.sort((a, b) => b.ppl - a.ppl);
console.log(`\nlargest by readers:`);
for (const e of ex.slice(0, N_EX)) {
  console.log(`  ${String(fmt(e.ppl)).padStart(9)} ppl  er ${String(e.er).padEnd(6)} ${e.star ? "*" : " "} tk=${(e.tk || "-").padEnd(6)} $${fmt(e.v).padStart(13)} ${e.pct.toFixed(1).padStart(5)}%  ${e.sponsor} · ${e.name}`);
}

if (!sawPin) {
  console.error(`\nPIN FAILED: no Duke Energy row reached this class. That plan is the case the`);
  console.error(`predicate was written for, so a run that cannot see it is measuring a`);
  console.error(`population an earlier gate already emptied — the figures above are void.`);
  process.exit(1);
}
console.log(`\npin ok: the Duke Energy family is in the class.`);
console.log(`A POOLED VEHICLE'S FEE IS NEGOTIATED BY THE PLAN AND NOT PUBLIC — which is what`);
console.log(`\`noPublicPrice\` already withholds wherever the TYPE cell admits the vehicle.`);
