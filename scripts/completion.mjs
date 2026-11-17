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
 * `--append` writes ONE LINE to `docs/completion-history.jsonl`, so progress
 * toward the owner's target is DIFFABLE rather than a number re-quoted from
 * memory. This project's own record is explicit about why: a figure asserted
 * in prose goes stale exactly as fast as the one it replaced, and a loop that
 * cannot see itself is the thing it was built to prevent.
 *
 * Run: node scripts/completion.mjs [--json] [--append] [--top 25]
 */
import { readFileSync, readdirSync, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRenderer } from "./apppath.mjs";
import { loadPlans } from "./lib-schema.mjs";
import { servedLineup } from "./lib-ledger.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JSONOUT = process.argv.includes("--json");
const APPEND = process.argv.includes("--append");
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
/* A BAND IS AN ANSWER AND THIS METRIC COULD NOT SEE IT — found 2026-11-17, the
 * day after the band shipped, by a separate instrument reporting 32.83% where
 * this one reported 31.73%. `erShown` is null on a banded row, so every one of
 * the 3,503 rows the page now answers with a range counted as a GAP here, and
 * the headline under-stated the page by 1.10 points. Exactly the hazard this
 * project records against `tkExact`: a scoreboard that RE-DERIVES what the page
 * decides goes blind the moment the page gains an arm.
 *
 * COUNTED SEPARATELY, NOT FOLDED IN. A range is not a figure, so adding it to
 * `withBoth` would over-state in the other direction and hide which kind of
 * answer a reader gets. Two headlines are printed: exact figures, and exact
 * plus banded. */
const withBand = z();
/* AND A TRAILING CURVE IS AN ANSWER TOO — added 2026-11-17 WITH the render
 * rather than a day after it, because the band's lesson cost 1.10 points and
 * the shape here is identical: 1,544 ticker entries carry a 1Y/3Y/5Y/10Y curve
 * and NO YTD, so a row showing four figures would have counted as a gap in
 * `withReturn` and reached the work list as missing. *Nothing executes a
 * comment asserting equivalence* — a scoreboard that re-derives what the page
 * decides goes blind the moment the page gains an arm, so the arm and the
 * scoreboard ship together.
 *
 * `withReturn` KEEPS ITS OLD DEFINITION — YTD only — because
 * `docs/completion-history.jsonl` carries it on every line and silently
 * re-defining a trailed key makes the trend a comparison of two different
 * questions. `withAnyReturn` is the new one, and `pctAnswered` moves to it,
 * which is a real step up and is reported as such. */
const withTrailing = z(), withAnyReturn = z(), withAnswered = z();
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
      /* THE PAGE'S OWN PRECEDENCE, ASKED PER HORIZON: an exact figure off the
       * resolved entry, else the trust's published band. `retSourced` is the
       * field `renderRow` returns for exactly this, so this is a READ of the
       * page's verdict and not a second resolver. */
      const HOR = ["r1y", "r3y", "r5y", "r10y"];
      const trailing = HOR.some((h) =>
        (r.retSourced && r.retSourced[h] != null && (r.retSourced[h + "AsOf"] || r.retSourced.rAsOf))
        || (r.band && r.band[h + "Lo"] != null && r.band[h + "AsOf"]));
      if (fee) add(withFee, ppl, val);
      if (src) add(withSourcedFee, ppl, val);
      if (ret) add(withReturn, ppl, val);
      if (trailing) add(withTrailing, ppl, val);
      if (ret || trailing) add(withAnyReturn, ppl, val);
      if (fee && ret) add(withBoth, ppl, val);
      const banded = !!r.band;
      if (banded) add(withBand, ppl, val);
      const answered = (fee && (ret || trailing)) || banded;
      /* COUNTED, NOT RE-SUMMED. `pctAnswered` used to be
       * `withBoth + withBand`, which was exact while those two were disjoint
       * and became WRONG the moment a third way to answer a row existed: a row
       * with an estimated fee and a trailing curve but no YTD is answered and
       * sits in neither bucket. A derived headline that re-states a predicate
       * instead of counting it is the same defect as a scoreboard
       * re-implementing a resolver. */
      if (answered) add(withAnswered, ppl, val);
      const tkey = (raw.type && String(raw.type).trim()) || "(no type stated)";
      const tb = (m) => { let b = m.get(tkey); if (!b) m.set(tkey, b = z()); return b; };
      add(tb(answered ? haveType : gapType), ppl, val);
      if (!answered) {
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

const record = { at: new Date().toISOString(), menus,
  rows: all.rows, ppl: all.ppl, val: Math.round(all.val),
  priceableRows: priceable.rows, priceablePpl: priceable.ppl,
  feePpl: withFee.ppl, sourcedFeePpl: withSourcedFee.ppl, retPpl: withReturn.ppl, bothPpl: withBoth.ppl,
  pctFee: +pc(withFee.ppl, priceable.ppl), pctReturn: +pc(withReturn.ppl, priceable.ppl),
  pctBoth: +pc(withBoth.ppl, priceable.ppl),
  /* NEW KEYS, NOT REDEFINED ONES: `retPpl`/`pctReturn` stay YTD-only so the
   * trail's history remains one question. `trailPpl` is the curve and
   * `anyRetPpl` is either. */
  trailPpl: withTrailing.ppl, anyRetPpl: withAnyReturn.ppl,
  pctTrailing: +pc(withTrailing.ppl, priceable.ppl), pctAnyReturn: +pc(withAnyReturn.ppl, priceable.ppl),
  bandPpl: withBand.ppl, answeredPpl: withAnswered.ppl,
  pctAnswered: +pc(withAnswered.ppl, priceable.ppl),
  gapByType: Object.fromEntries([...gapType].map(([t, b]) => [t, b.ppl])) };
if (APPEND) {
  appendFileSync(path.join(ROOT, "docs", "completion-history.jsonl"), JSON.stringify(record) + "\n");
  console.log("appended to docs/completion-history.jsonl");
}
if (JSONOUT) {
  console.log(JSON.stringify(record));
} else {
  console.log(`\nWAMPO ROW COMPLETION — ${menus.toLocaleString()} published menus\n`);
  console.log(`  ${"".padEnd(30)}${"rows".padStart(11)}${"".padStart(8)}${"readers".padStart(15)}${"".padStart(9)}${"value".padStart(10)}`);
  console.log(line("every published row", all, all));
  console.log(line("  NOT priceable", notPriceable, all));
  console.log(line("  PRICEABLE (the denominator)", priceable, all));
  console.log("");
  console.log(line("of priceable: has a FEE", withFee, priceable));
  console.log(line("  of which SOURCED", withSourcedFee, priceable));
  console.log(line("of priceable: has a YTD RETURN", withReturn, priceable));
  console.log(line("of priceable: has a 1/3/5/10Y CURVE", withTrailing, priceable));
  console.log(line("of priceable: either kind of return", withAnyReturn, priceable));
  console.log(line("of priceable: has BOTH", withBoth, priceable));
  console.log(line("of priceable: a trust BAND (a range)", withBand, priceable));
  console.log(`\n  *** HEADLINE: ${pc(withBoth.ppl, priceable.ppl)}% of reader-weighted priceable rows carry BOTH a fee and a YTD return ***`);
  console.log(`      ANSWERED AT ALL (a fee plus EITHER kind of return, or a banded range): ${pc(withAnswered.ppl, priceable.ppl)}%`);
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
