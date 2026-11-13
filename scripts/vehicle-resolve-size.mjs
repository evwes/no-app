#!/usr/bin/env node
/* wampo — WHAT WOULD A SOURCED-VEHICLE RENDER REACH, and would it be right?
 *
 * `vehicleKeyFor` resolves a filed name to an identity in fund-facts.json's
 * `vehicles`. It publishes nothing by itself. This measures, over every served
 * and published row:
 *
 *   - how many rows resolve to a key, and how many readers they carry
 *   - whether that key EXISTS in the sourced file (a key pointing at nothing
 *     is a resolver bug, not a sourcing gap, and the two must not be confused)
 *   - whether the key's figures are PUBLISHABLE: erBasis "class-published"
 *     and an erAsOf inside the freshness window. Vanguard serves dormant
 *     classes with a twelve-year-old fee and no current return.
 *   - what it LEAVES BEHIND: Vanguard target-date trust rows that state no
 *     class, which must stay blank.
 *
 * And it prints every distinct filed spelling with the key it resolved, so the
 * mapping can be READ rather than trusted. A class is one character apart from
 * its neighbour here — Trust I, II and III differ by a letter and by 0.01% —
 * so a count of resolutions is no evidence any of them is correct.
 */
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRenderer } from "./apppath.mjs";
import { loadPlans } from "./lib-schema.mjs";
import { servedLineup } from "./lib-ledger.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STALE_YEARS = 2;   // same window the checker warns at
const today = new Date().toISOString().slice(0, 10);

/* SLICED, not reproduced: the resolver is loaded out of the shipped file. */
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(readFileSync(path.join(ROOT, "fund-er.js"), "utf8")
  + "\nglobalThis.__vk = vehicleKeyFor;", ctx);
const vehicleKeyFor = ctx.__vk;
if (typeof vehicleKeyFor !== "function") throw new Error("vehicleKeyFor not found in fund-er.js");

/* POSITIVE CONTROL BEFORE ANY COUNT: a harness that silently reaches no arm
 * reports 0 and looks like good news. */
const PINS = [
  ["Vanguard Target Retirement 2020 Fund TR I", "", "vanguard::target-retirement-2020-trust-i"],
  ["Vanguard Target Retirement 2040 Trust Plus", "", "vanguard::target-retirement-2040-trust-plus"],
  ["Vanguard Target Retirement 2035 Trust II", "", "vanguard::target-retirement-2035-trust-ii"],
  ["Vanguard Target Retirement 2030 Trust III", "", "vanguard::target-retirement-2030-trust-iii"],
  ["Target Retirement Income Trust Plus", "Vanguard", "vanguard::target-retirement-income-trust-plus"],
  ["Vanguard Target Retirement Inc Trust Plus", "", "vanguard::target-retirement-income-trust-plus"],
  /* MUST NOT RESOLVE, each for its own reason */
  ["Vanguard Target Retirement 2050 Fund", "", null],                     // no class stated
  ["Vanguard Target Retirement Trust Plus", "The Vanguard Group, Inc.", null], // no vintage; `Inc.` must not supply one
  ["Vanguard Target Retirement 2050 Trust Flex", "", null],               // real class, no published fee
  ["Vanguard Institutional TR 2060", "", null],                           // `TR 2060` is a vintage, not a class
  ["T. Rowe Price Retirement 2030 Trust Class A", "", null],              // another house entirely
  ["TRP RETIREMENT HYB 2005 TR-9", "T. Rowe Price", null],
];
let pinFail = 0;
for (const [n, iss, want] of PINS) {
  const got = vehicleKeyFor(n, iss);
  if (got !== want) { pinFail++; console.log(`  PIN FAIL  ${JSON.stringify(n)} iss=${JSON.stringify(iss)}\n            want ${want} got ${got}`); }
}
if (pinFail) throw new Error(`${pinFail} control(s) failed — the measurement below would be meaningless`);
console.log(`controls OK: ${PINS.length} pins, ${PINS.filter((p) => p[2]).length} must-resolve and ${PINS.filter((p) => !p[2]).length} must-not\n`);

const VEH = JSON.parse(readFileSync(path.join(ROOT, "data", "fund-facts.json"), "utf8")).vehicles || {};
const publishable = (k) => {
  const e = VEH[k];
  if (!e || e.er == null || e.erBasis !== "class-published") return false;
  return (Date.parse(today) - Date.parse(e.erAsOf)) / 31557600000 <= STALE_YEARS;
};

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
const ppl = new Map();
for (const row of d.rows) ppl.set(`${d.get(row, "ein")}|${d.get(row, "pn")}`, +d.get(row, "partEOY") || +d.get(row, "participants") || 0);
const readers = (set) => [...set].reduce((a, k) => a + (ppl.get(k) || 0), 0);

const VERDICT = new Map();
const B = {
  publish: { rows: 0, value: 0, plans: new Set(), names: new Map() },
  dormant: { rows: 0, value: 0, plans: new Set(), names: new Map() },
  missing: { rows: 0, value: 0, plans: new Set(), names: new Map() },
  noclass: { rows: 0, value: 0, plans: new Set(), names: new Map() },
};
const add = (b, f, mem, key) => {
  const G = B[b];
  G.rows++; G.value += +f.value || 0;
  for (const q of mem) G.plans.add(`${q.ein}|${q.pn}`);
  const nk = `${f.nameRaw}  ->  ${key || "(none)"}`;
  G.names.set(nk, (G.names.get(nk) || 0) + 1);
};

for (const sh of readdirSync(`${ROOT}/data/lineups`).sort()) {
  if (!sh.endsWith(".json")) continue;
  const shard = JSON.parse(readFileSync(`${ROOT}/data/lineups/${sh}`, "utf8"));
  for (const [ack, e] of Object.entries(shard)) {
    const mem = members.get(ack);
    if (!mem || !e || !e.confident || !Array.isArray(e.funds) || !e.funds.length) continue;
    const lead = mem[0];
    const total = e.funds.reduce((a, f) => a + (+f.value || 0), 0);
    for (const raw of e.funds) {
      const nameRaw = String(raw.name || "");
      const iss = String(raw.iss || "").trim();
      /* only rows that could possibly be in this family, so the loop is cheap */
      if (!/vanguard/i.test(`${iss} ${nameRaw}`) || !/target/i.test(nameRaw)) continue;
      const key = `${iss}\u0000${nameRaw}\u0000${String(raw.type || "")}`;
      let r = VERDICT.get(key);
      if (r === undefined) {
        const f = { ...raw, nameRaw, name: R.clean(nameRaw) };
        r = R.renderRow(lead, f, "menu", total);
        VERDICT.set(key, r);
      }
      if (!r) continue;
      /* THE POPULATION THIS IS ABOUT: rows the page prints no fee for today. */
      if (r.er != null && r.er !== "" && !r.star) continue;
      const f = { ...raw, nameRaw, value: raw.value };
      const vk = vehicleKeyFor(nameRaw, iss);
      if (!vk) add("noclass", f, mem, null);
      else if (!VEH[vk]) add("missing", f, mem, vk);
      else if (!publishable(vk)) add("dormant", f, mem, vk);
      else add("publish", f, mem, vk);
    }
  }
}

const LABEL = {
  publish: "WOULD PUBLISH   key sourced, class-published, fee fresh",
  dormant: "held: DORMANT   key sourced but the fee is stale / not class-published",
  missing: "held: NO ENTRY  resolver produced a key nothing is sourced for",
  noclass: "left blank      filing states no unit class (or an unpriced one)",
};
for (const b of ["publish", "dormant", "missing", "noclass"]) {
  const G = B[b];
  console.log(`${LABEL[b]}\n   ${G.rows.toLocaleString()} rows  ${G.plans.size.toLocaleString()} plans  ${readers(G.plans).toLocaleString()} readers  $${Math.round(G.value).toLocaleString()}`);
}

for (const b of ["missing", "publish", "noclass"]) {
  const top = [...B[b].names.entries()].sort((a, c) => c[1] - a[1]).slice(0, b === "publish" ? 14 : 10);
  if (!top.length) continue;
  console.log(`\n--- ${b}: filed spelling -> resolved key (top ${top.length} of ${B[b].names.size}) ---`);
  for (const [n, c] of top) console.log(`  ${String(c).padStart(5)}  ${n}`);
}
