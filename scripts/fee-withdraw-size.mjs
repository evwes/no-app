#!/usr/bin/env node
/* wampo — SIZE THE UNSOURCEABLE FEE, before withdrawing anything.
 *
 * The owner approved withdrawing a fee that cannot be sourced (2026-11-04).
 * "Unsourceable" covers two very different populations and blanking both would
 * empty about half the fee column, so this measures them apart FIRST:
 *
 *   FABRICATED  the row has no public expense ratio BY NATURE -- a stable
 *               value or guaranteed account, a bank deposit, the employer's
 *               own stock, a Treasury or a mortgage pass-through, or a row
 *               whose fund we cannot even name. A number here is invented.
 *   ESTIMATE    a pattern-table guess on a REAL, identifiable fund. The page
 *               already labels it "est." and it is usually about right.
 *   COMPARABLE  an asterisked row: the fee belongs to a registered equivalent
 *               and app.js already prints a paragraph calling it a ceiling.
 *
 * Measured through the REAL renderRow with the serving condition and the
 * publish gate applied, and participants PLAN-DEDUPLICATED.
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

/* a DEBT INSTRUMENT: a coupon and a maturity. No investment option has those. */
const DEBT = /^(corporate|mortgage|cash equivalent|municipal|asset backed|government)\s*[-–]\s*\d+(\.\d+)?%/i;
const VERDICT = new Map();   // (iss, nameRaw, type) -> rendered row
const B = { fabricated: [], estimate: [], comparable: [] };
const add = (b, row) => B[b].push(row);
let rows = 0, priced = 0;

for (const sh of readdirSync(`${ROOT}/data/lineups`).sort()) {
  if (!sh.endsWith(".json")) continue;
  const shard = JSON.parse(readFileSync(`${ROOT}/data/lineups/${sh}`, "utf8"));
  for (const [ack, e] of Object.entries(shard)) {
    const mem = members.get(ack);
    if (!mem || !e || !e.confident || !Array.isArray(e.funds) || !e.funds.length) continue;
    const lead = mem[0];
    const total = e.funds.reduce((a, f) => a + (+f.value || 0), 0);
    for (const raw of e.funds) {
      rows++;
      const f = { ...raw, nameRaw: String(raw.name || ""), name: R.clean(String(raw.name || "")) };
      /* GROUPED. Rendering all 1.7M rows does not finish -- measured twice.
       * The fee verdict is a pure function of the triple the resolvers key on,
       * (issuer cell, RAW name, filed type), so one real row per group is
       * rendered and its verdict applied to the group's members.
       * THE ONE PLAN-DEPENDENT FLAG IS `stockRow`, which reads the SPONSOR's
       * own ticker, so a group spanning plans could in principle differ; that
       * population is ~51 rows store-wide on this record and is reported
       * separately rather than silently folded in. */
      const key = `${String(f.iss || "").trim()}\u0000${f.nameRaw}\u0000${String(f.type || "")}`;
      let r = VERDICT.get(key);
      if (r === undefined) { r = R.renderRow(lead, f, "menu", total); VERDICT.set(key, r); }
      if (!r || r.er == null || r.er === "") continue;     // the page prints no fee
      priced++;
      const fl = r.flags || {};
      const nm = String(r.name || f.name || "");
      const rec = { ack, ein: lead.ein, pn: lead.pn, sponsor: lead.sponsorName,
        ppl: mem.reduce((a, q) => a + (q.participants || 0), 0),
        plans: mem.map((q) => `${q.ein}|${q.pn}`), v: +f.value || 0, er: r.er, nm, tk: r.tk || "" };
      /* a vehicle with no public price by nature, or a row we cannot name */
      const noPrice = fl.gicRow || fl.bankDepositFee || fl.guaranteeOnlyFee ||
        fl.mistypedGuaranteeFee || fl.annuityRow || fl.contractRow || fl.stockRow ||
        fl.namelessRow || fl.loanRow || fl.subtotalRow || DEBT.test(nm);
      /* WHY it is unpriceable matters more than THAT it is: "a vehicle with no
       * public price" and "a row we cannot name" are different claims, and the
       * second is far the larger. Tally the cause so the split can be judged. */
      let cause = null;
      if (fl.gicRow || fl.guaranteeOnlyFee || fl.mistypedGuaranteeFee) cause = "stable-value / guaranteed";
      else if (fl.bankDepositFee) cause = "bank deposit";
      else if (fl.stockRow || fl.mistypedStock) cause = "employer stock";
      else if (fl.annuityRow || fl.contractRow) cause = "annuity / contract";
      else if (fl.loanRow) cause = "participant loan";
      else if (fl.subtotalRow) cause = "subtotal, not a holding";
      else if (fl.namelessRow) cause = "filing names no fund";
      else if (DEBT.test(nm)) cause = "debt instrument (coupon+maturity)";
      else if (!r.tk) cause = "no ticker resolved (mostly collective trusts)";
      if (cause) { rec.cause = cause; add("fabricated", rec); }
      else if (r.star) add("comparable", rec);
      else add("estimate", rec);
    }
  }
}
const uniq = (arr) => { const m = new Map(); for (const x of arr) for (const k of x.plans) m.set(k, 0); return m.size; };
const ppl = (arr) => { const m = new Map(); for (const x of arr) for (const k of x.plans) m.set(k, x.ppl / x.plans.length); return Math.round([...m.values()].reduce((a, b) => a + b, 0)); };
const dol = (arr) => arr.reduce((a, x) => a + x.v, 0);
const n = (x) => Math.round(x).toLocaleString();
console.log(`rows walked ${n(rows)} · rows the page PRICES ${n(priced)}\n`);
for (const k of ["fabricated", "estimate", "comparable"]) {
  const a = B[k];
  console.log(`${k.toUpperCase().padEnd(11)} ${n(a.length).padStart(9)} rows · ${n(uniq(a)).padStart(7)} plans · ${n(ppl(a)).padStart(11)} readers · $${n(dol(a))}`);
}
console.log("\n--- the FABRICATED half, BY CAUSE ---");
{ const c=new Map();
  for (const x of B.fabricated) { const k=x.cause; const g=c.get(k)||{r:0,p:new Map(),$:0}; g.r++; g.$+=x.v; for(const k2 of x.plans) g.p.set(k2, x.ppl/x.plans.length); c.set(k,g); }
  for (const [k,g] of [...c].sort((a,b)=>b[1].r-a[1].r))
    console.log(`   ${k.padEnd(42)} ${n(g.r).padStart(9)} rows · ${n(g.p.size).padStart(6)} plans · ${n([...g.p.values()].reduce((a,b)=>a+b,0)).padStart(11)} readers · $${n(g.$)}`); }
console.log("\n--- the FABRICATED half, by how it was priced ---");
const why = new Map();
for (const x of B.fabricated) { const k = x.er; why.set(k, (why.get(k) || 0) + 1); }
for (const [er, c] of [...why].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`   er ${String(er).padEnd(7)} ${n(c).padStart(8)} rows`);
console.log("\n--- 12 largest fabricated rows by readers ---");
for (const x of [...B.fabricated].sort((a, b) => b.ppl - a.ppl).slice(0, 12))
  console.log(`   ${n(x.ppl).padStart(9)} ppl  er ${String(x.er).padEnd(6)} $${n(x.v).padStart(14)}  ${x.sponsor.slice(0, 26).padEnd(28)} ${x.nm.slice(0, 44)}`);
