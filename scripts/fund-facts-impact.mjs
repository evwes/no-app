#!/usr/bin/env node
/* wampo — WHAT WOULD THE 92 SOURCED FEES ACTUALLY CHANGE ON THE PAGE?
 *
 * `data/fund-facts.json` holds 92 funds with an expense ratio and a YTD return,
 * each carrying its as-of date and its source URL, and NOTHING READS IT. The
 * only mention of the file anywhere in `app.js`, `index.html`, `fund-er.js` or
 * `build-seo-pages.mjs` is a comment, so those 92 verified figures reach zero
 * readers.
 *
 * Before wiring it in -- which means a NEW ASSET every visitor downloads, and a
 * change to published fee cells -- this measures the three things that decide
 * whether it is worth it, through the REAL renderer so the figures are what a
 * reader sees:
 *
 *   GAINS    a row that publishes NO fee today and would get a sourced one
 *   AGREES   a row whose pattern estimate already matches the sourced figure
 *   MOVES    a row whose published fee would CHANGE, and by how much
 *
 * The third is the one that needs reading rather than counting: a move is a
 * published number changing under a reader, so the direction and the size
 * matter, not the count. A sourced figure outranks a pattern guess by this
 * project's first principle -- a fee is SOURCED, never derived -- but "outranks"
 * is a reason to prefer it, not a reason to skip measuring what it displaces.
 *
 * NARROWED BY A PROPERTY OF THE CHANGE: only a row whose resolved ticker is one
 * of the 92 can move, so the walk renders a row and then checks the ticker --
 * a superset by construction, since the wiring would key on exactly that.
 *
 * IT WRITES NOTHING.
 *
 * Run: node scripts/fund-facts-impact.mjs [--examples 25]
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPlans } from "./lib-schema.mjs";
import { servedLineup } from "./lib-ledger.mjs";
import { buildRenderer } from "./apppath.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const N_EX = +((argv[argv.indexOf("--examples") + 1]) || 25);

const FACTS = JSON.parse(readFileSync(path.join(ROOT, "data", "fund-facts.json"), "utf8")).funds || {};
const nFacts = Object.keys(FACTS).length;
if (!nFacts) { console.error("fund-facts.json carries no funds — nothing to measure"); process.exit(1); }
const withEr = Object.values(FACTS).filter((f) => f.er != null).length;
console.log(`fund-facts: ${nFacts} funds, ${withEr} with an expense ratio\n`);

const d = loadPlans(path.join(ROOT, "plans-all.json"));
const idxRaw = JSON.parse(readFileSync(path.join(ROOT, "lineups-index.json"), "utf8"));
const idx = idxRaw.plans || idxRaw;
if (!Object.keys(idx).length) { console.error("lineups-index.json: empty ack map"); process.exit(1); }

const cAck = d.col("ack"), cMtia = d.col("mtiaAck"), cParts = d.col("participants"),
  cName = d.col("sponsorName"), cEin = d.col("ein"), cPn = d.col("pn");

const served = new Map();
for (const r of d.rows) {
  const s = servedLineup({ ack: r[cAck], mtiaAck: r[cMtia] }, idx);
  if (!s || !s.ack) continue;
  if (!served.has(s.ack)) served.set(s.ack, []);
  served.get(s.ack).push({ ppl: +r[cParts] || 0, name: r[cName], ein: r[cEin], pn: r[cPn] });
}
const PLAN_BY_KEY = new Map();
for (const r of d.rows) PLAN_BY_KEY.set(`${r[cEin]}|${r[cPn]}`, d.wrap(r));

const R = buildRenderer({});
R.setPlans(d);

/* grouped, because rendering all ~1.7M rows does not finish; the ticker and the
 * fee both read the ROW, so one render per distinct (issuer, name, type) triple
 * answers for every row carrying it */
const groups = new Map();
let rows = 0;
const dir = path.join(ROOT, "data", "lineups");
for (const file of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
  const shard = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
  for (const [ack, entry] of Object.entries(shard)) {
    const members = served.get(ack);
    if (!members || !entry || !entry.confident || !Array.isArray(entry.funds)) continue;
    const total = entry.funds.reduce((a, x) => a + (+x.value || 0), 0);
    const ppl = members.reduce((a, m) => a + m.ppl, 0);
    const lead = members[0];
    for (const fund of entry.funds) {
      rows++;
      const k = `${fund.iss || ""}\u0000${fund.nameRaw || fund.name || ""}\u0000${fund.type || ""}`;
      let g = groups.get(k);
      if (!g) { g = { fund, total, rows: 0, ppl: 0, plans: new Set(), lead }; groups.set(k, g); }
      g.rows++; g.ppl += ppl;
      for (const m of members) g.plans.add(`${m.ein}|${m.pn}`);
    }
  }
}
console.log(`${rows.toLocaleString()} published+served rows over ${groups.size.toLocaleString()} distinct groups\n`);

const B = { gain: [], agree: [], move: [] };
const anyPlan = PLAN_BY_KEY.values().next().value;
let reached = 0;
for (const g of groups.values()) {
  const planObj = PLAN_BY_KEY.get(`${g.lead.ein}|${g.lead.pn}`) || anyPlan;
  let r;
  try { r = R.renderRow(planObj, g.fund, "menu", g.total); } catch { continue; }
  if (!r || !r.tk) continue;
  const fact = FACTS[String(r.tk).toUpperCase()];
  if (!fact || fact.er == null) continue;
  reached += g.rows;
  const cur = r.er == null || r.er === "" || r.er === "—" ? null : Number(r.er);
  const rec = { rows: g.rows, ppl: g.ppl, planKeys: g.plans, plans: g.plans.size, tk: r.tk, star: r.star,
    cur, src: fact.er, asOf: fact.erAsOf,
    sponsor: String(g.lead.name).slice(0, 24), name: String(g.fund.name || "").slice(0, 40) };
  if (cur == null) B.gain.push(rec);
  else if (Math.abs(cur - fact.er) < 1e-9) B.agree.push(rec);
  else B.move.push(rec);
}

const fmt = (n) => Math.round(n).toLocaleString("en-US");
const sum = (a, k) => a.reduce((s, x) => s + x[k], 0);
/* READERS DEDUPLICATED PER PLAN. Summing `ppl` per GROUP counts a plan once for
 * every row of its menu that lands in the bucket, and this project records that
 * exact error inflating a published figure by about 8x. The tell was in the
 * first run's own output: the AGREE bucket read 505,707,884 readers against a
 * universe of roughly 120 million participants. */
const PPL_BY_PLAN = new Map();
for (const r of d.rows) PPL_BY_PLAN.set(`${r[cEin]}|${r[cPn]}`, +r[cParts] || 0);
const uniq = (a) => {
  const seen = new Set();
  for (const x of a) for (const k of x.planKeys) seen.add(k);
  let t = 0;
  for (const k of seen) t += PPL_BY_PLAN.get(k) || 0;
  return { plans: seen.size, ppl: t };
};
console.log(`rows whose resolved ticker is one of the ${nFacts}: ${fmt(reached)}\n`);
for (const [k, label] of [["gain", "GAIN a fee where the page shows none"],
  ["agree", "AGREE — the estimate already matches the sourced figure"],
  ["move", "MOVE — a published fee would CHANGE"]]) {
  const a = B[k];
  const u = uniq(a);
  console.log(`${label.padEnd(50)} ${String(fmt(sum(a, "rows"))).padStart(8)} rows · ${String(fmt(u.plans)).padStart(7)} plans · ${String(fmt(u.ppl)).padStart(11)} readers`);
}

B.move.sort((a, b) => b.ppl - a.ppl);
console.log(`\nthe MOVES, largest by readers — a published number changing under a reader:`);
for (const m of B.move.slice(0, N_EX)) {
  const dir = m.src > m.cur ? "up  " : "down";
  console.log(`  ${String(fmt(m.ppl)).padStart(10)} ppl  ${m.tk.padEnd(6)} ${String(m.cur).padStart(6)} -> ${String(m.src).padEnd(6)} ${dir} @${m.asOf}  ${m.sponsor} · ${m.name}`);
}
if (B.move.length > N_EX) console.log(`  ... and ${B.move.length - N_EX} more move groups`);

/* DIRECTION, because "a sourced figure outranks a guess" is a reason to prefer
 * it and not a reason to look away from what it displaces. A pattern table that
 * is systematically HIGH has been over-stating costs to every reader. */
const up = B.move.filter((m) => m.src > m.cur), down = B.move.filter((m) => m.src < m.cur);
console.log(`\ndirection: ${fmt(sum(up, "rows"))} rows revise UP, ${fmt(sum(down, "rows"))} revise DOWN`);
const worst = B.move.slice().sort((a, b) => Math.abs(b.src - b.cur) - Math.abs(a.src - a.cur))[0];
if (worst) console.log(`largest single revision: ${worst.tk} ${worst.cur} -> ${worst.src} (${worst.sponsor})`);
console.log(`\nA SOURCED FIGURE CARRIES A DATE AND A URL; A PATTERN ESTIMATE CARRIES NEITHER.`);
console.log(`That is the whole case for preferring it — and the moves above are what it costs.`);
