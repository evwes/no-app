#!/usr/bin/env node
/* wampo — THE ROW-LEVEL SCOREBOARD: does every published fund row carry a
 * NAME, an EXPENSE RATIO and a YEAR-TO-DATE RETURN?
 *
 * WHY THIS EXISTS. `ledger-report.mjs` is PLAN-level and deliberately excludes
 * row fields — "they are rows, not plans" — so the project has had no single
 * number for the thing the owner actually asks about: every fund, its fee, its
 * return. A goal with no instrument is a wish, and "80% complete" cannot be
 * reported, argued with, or driven without one.
 *
 * THE DENOMINATOR IS THE HONEST PART. Not every published row CAN carry a fee:
 * a brokerage window is not a fund, employer stock has no expense ratio, and a
 * loan fund, a cash line or a subtotal is not a vehicle anyone prices. Those
 * are counted and reported SEPARATELY rather than quietly inflating or
 * deflating the score — a denominator chosen to flatter is the oldest way to
 * make a number meaningless. `priceable` is the denominator that matters.
 *
 * MEASURED THROUGH PRODUCTION'S OWN renderRow with tab "menu" and the argument
 * the page passes, so the score is what a READER SEES, not what a store holds.
 *
 * Weights: ROWS, READERS (the plan's participants, counted per row because a
 * reader sees every row of their own menu), and VALUE.
 *
 * Run: node scripts/completion.mjs [--json] [--top 25]
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRenderer } from "./apppath.mjs";
import { loadPlans } from "./lib-schema.mjs";
import { servedLineup } from "./lib-ledger.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JSONOUT = process.argv.includes("--json");
const TOP = (() => { const i = process.argv.indexOf("--top"); return i > 0 ? +process.argv[i + 1] : 25; })();

const R = buildRenderer({ appjs: path.join(ROOT, "app.js") });
const lidx = JSON.parse(readFileSync(`${ROOT}/lineups-index.json`, "utf8")).plans;
const d = loadPlans();
R.setPlans(d.rows.map((r) => ({ sponsorName: d.get(r, "sponsorName"), ticker: d.get(r, "ticker") })));

const members = new Map();
for (const row of d.rows) {
  const p = { ack: d.get(row, "ack"), mtiaAck: d.get(row, "mtiaAck"), ein: d.get(row, "ein"), pn: d.get(row, "pn"),
    participants: +d.get(row, "partEOY") || +d.get(row, "participants") || 0,
    sponsorName: String(d.get(row, "sponsorName") || "").trim(), ticker: d.get(row, "ticker") };
  const s = servedLineup(p, lidx);
  if (!s.ack) continue;
  if (!members.has(s.ack)) members.set(s.ack, []);
  members.get(s.ack).push(p);
}

const z = () => ({ rows: 0, ppl: 0, val: 0 });
const add = (b, ppl, val) => { b.rows++; b.ppl += ppl; b.val += val; };
const all = z(), notPriceable = z(), priceable = z();
const withFee = z(), withSourcedFee = z(), withReturn = z(), withBoth = z();
const gapNames = new Map();      // what is MISSING, by readers — the work list
/* AND THE GAP BY FILED TYPE, which is the number that decides what work can
 * close it. A ticker is a mutual-fund lever; a collective trust has no ticker
 * and no public price unless its ISSUER publishes per unit class. Reporting
 * the gap as one total hides which of those two it is. */
const gapType = new Map();
const haveType = new Map();
let menus = 0;

for (const sh of readdirSync(`${ROOT}/data/lineups`).sort()) {
  if (!sh.endsWith(".json")) continue;
  const shard = JSON.parse(readFileSync(`${ROOT}/data/lineups/${sh}`, "utf8"));
  for (const [ack, e] of Object.entries(shard)) {
    const mem = members.get(ack);
    if (!mem || !e || !e.confident || !Array.isArray(e.funds) || !e.funds.length) continue;
    menus++;
    const lead = mem[0];
    const ppl = mem.reduce((a, m) => a + m.participants, 0);
    const total = e.funds.reduce((a, f) => a + (+f.value || 0), 0);
    for (const raw of e.funds) {
      const f = { ...raw, nameRaw: String(raw.name || ""), name: R.clean(String(raw.name || "")) };
      let r;
      try { r = R.renderRow(lead, f, "menu", total); } catch { continue; }
      if (!r) continue;                       // suppressed: the page prints no row at all
      const val = +raw.value || 0;
      add(all, ppl, val);
      /* NOT PRICEABLE — read off the page's OWN verdicts, never a name rule.
       * A brokerage window, employer stock, a loan line and a cash sweep are
       * not funds anyone publishes an expense ratio for. */
      const type = String(raw.type || "").toLowerCase();
      const stock = !!(r.flags && r.flags.stockRow);
      const window = /brokerage/.test(type) || /self-directed brokerage/i.test(f.nameRaw);
      const loanCash = /loan|cash|deposit/.test(type);
      if (stock || window || loanCash) { add(notPriceable, ppl, val); continue; }
      add(priceable, ppl, val);
      const fee = r.erShown != null && r.erShown !== "";
      const src = !!r.erSourced;
      const ret = !!(r.ytdSourced || (r.vehicleAny && r.vehicleYtd != null));
      if (fee) add(withFee, ppl, val);
      if (src) add(withSourcedFee, ppl, val);
      if (ret) add(withReturn, ppl, val);
      if (fee && ret) add(withBoth, ppl, val);
      const tkey = (raw.type && String(raw.type).trim()) || "(no type stated)";
      const tb = (m) => { let b = m.get(tkey); if (!b) m.set(tkey, b = z()); return b; };
      add(tb(fee && ret ? haveType : gapType), ppl, val);
      if (!fee || !ret) {
        const k = f.nameRaw.slice(0, 64);
        const g = gapNames.get(k) || { rows: 0, ppl: 0, val: 0, fee, ret, tk: r.tk || null, type: raw.type || "" };
        g.rows++; g.ppl += ppl; g.val += val;
        gapNames.set(k, g);
      }
    }
  }
}

const pc = (a, b) => (b ? (100 * a / b).toFixed(2) : "0.00");
const line = (label, b, base) =>
  `  ${label.padEnd(30)}${b.rows.toLocaleString().padStart(11)}  ${pc(b.rows, base.rows).padStart(6)}%` +
  `${b.ppl.toLocaleString().padStart(15)}  ${pc(b.ppl, base.ppl).padStart(6)}%` +
  `  $${(b.val / 1e9).toFixed(1).padStart(8)}B  ${pc(b.val, base.val).padStart(6)}%`;

if (JSONOUT) {
  console.log(JSON.stringify({ at: new Date().toISOString(), menus, all, notPriceable, priceable,
    withFee, withSourcedFee, withReturn, withBoth,
    pctFee: +pc(withFee.ppl, priceable.ppl), pctReturn: +pc(withReturn.ppl, priceable.ppl),
    pctBoth: +pc(withBoth.ppl, priceable.ppl) }));
} else {
  console.log(`\nWAMPO ROW COMPLETION — ${menus.toLocaleString()} published menus\n`);
  console.log(`  ${"".padEnd(30)}${"rows".padStart(11)}${"".padStart(8)}${"readers".padStart(15)}${"".padStart(9)}${"value".padStart(10)}`);
  console.log(line("every published row", all, all));
  console.log(line("  NOT priceable", notPriceable, all));
  console.log(line("  PRICEABLE (the denominator)", priceable, all));
  console.log("");
  console.log(line("of priceable: has a FEE", withFee, priceable));
  console.log(line("  of which SOURCED", withSourcedFee, priceable));
  console.log(line("of priceable: has a RETURN", withReturn, priceable));
  console.log(line("of priceable: has BOTH", withBoth, priceable));
  console.log(`\n  *** HEADLINE: ${pc(withBoth.ppl, priceable.ppl)}% of reader-weighted priceable rows carry BOTH a fee and a return ***`);
  console.log(`      fee only: ${pc(withFee.ppl, priceable.ppl)}%   return only: ${pc(withReturn.ppl, priceable.ppl)}%`);
  console.log(`\nTHE GAP BY FILED TYPE — what KIND of work can close it:`);
  const types = [...new Set([...gapType.keys(), ...haveType.keys()])]
    .map((t) => ({ t, g: gapType.get(t) || z(), h: haveType.get(t) || z() }))
    .sort((a, b) => b.g.ppl - a.g.ppl);
  console.log(`  ${"filed type".padEnd(24)}${"MISSING readers".padStart(17)}${"share of gap".padStart(14)}${"already complete".padStart(18)}`);
  const gapTotal = types.reduce((a, x) => a + x.g.ppl, 0);
  for (const x of types.slice(0, 12)) {
    const done = x.h.ppl + x.g.ppl ? (100 * x.h.ppl / (x.h.ppl + x.g.ppl)).toFixed(1) : "0.0";
    console.log(`  ${x.t.slice(0, 22).padEnd(24)}${x.g.ppl.toLocaleString().padStart(17)}${(100 * x.g.ppl / gapTotal).toFixed(1).padStart(13)}%${(done + "%").padStart(18)}`);
  }
  console.log(`\nTHE GAP, by readers — the work list (top ${TOP}):`);
  const g = [...gapNames].sort((a, b) => b[1].ppl - a[1].ppl).slice(0, TOP);
  for (const [n, v] of g) {
    console.log(`  ${v.ppl.toLocaleString().padStart(12)}  ${String(v.rows).padStart(5)} rows  ${(v.tk || "-").padEnd(7)}` +
      `${v.fee ? "fee" : "no-fee"}/${v.ret ? "ret" : "no-ret"}  ${String(v.type || "-").slice(0, 16).padEnd(17)}${n}`);
  }
}
