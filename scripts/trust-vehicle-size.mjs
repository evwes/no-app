#!/usr/bin/env node
/* wampo — SIZE THE COLLECTIVE TRUSTS WHOSE ISSUER PUBLISHES THEM.
 *
 * The standing premise, written into app.js's comparable note, is that a
 * collective trust "has no public ticker, expense ratio or return of its own,
 * because its class is negotiated by the plan." For a negotiated separate
 * account that is true. For Vanguard's Target Retirement Trusts it is FALSE,
 * and the owner supplied the refutation: investor.vanguard.com publishes a
 * profile per TRUST (fund id 1464 = "Target Retirement 2020 Trust I", CUSIP
 * 92202V591) carrying expenseRatio 0.0650 as of 2026-03-31 and a dated YTD.
 * The unit class is NAMED IN THE FILING ("... Fund TR I"), so the published
 * class fee is the price that plan actually pays -- which is the condition
 * `_schema` sets for ever printing a vehicle fee as a plan's.
 *
 * This counts, through the REAL renderRow with the serving condition applied,
 * how many published rows are in that shape, so the work is sized before any
 * of it is done. It asserts nothing about what SHOULD be published.
 *
 * Participants are PLAN-DEDUPLICATED per family: a plan holding twelve
 * target-date trusts counts once.
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

/* THE FAMILIES. Each is a filed-name shape whose ISSUER publishes a per-class
 * figure, keyed on what the filing itself states. Deliberately narrow: a
 * family is listed only once a profile for that exact vehicle has been READ.
 * `vanguard-target-trust` is the one the owner's link establishes; the others
 * are counted as CANDIDATES so the scale of the rest is visible, not as a
 * claim that their issuers publish anything. */
const FAMILY = [
  /* THE OWNER'S TOP-TEN TARGET-DATE LIST (2026-11-14), which is the work queue
   * for this mechanism: every one of these should carry a ticker, an expense
   * ratio and a YTD return on every filing that holds it. Vanguard SHIPPED
   * today; the rest are sized here so the order of work is readers, not
   * market-share press figures. A family is a filed-name shape, NOT a claim
   * that the issuer publishes anything — that has to be probed per issuer. */
  ["vanguard-target", /vanguard.*target\s*(date|retirement|retire)|target\s*retirement.*trust/i],
  ["fidelity-freedom", /fidelity.*(freedom|target)|freedom\s*(index|blend)?\s*\d{4}/i],
  ["blackrock-lifepath", /blackrock.*lifepath|\blifepath\b/i],
  ["trowe-retirement", /\b(t\.?\s*rowe|trp)\b.*(retirement|retire|target)/i],
  ["americanfunds-targetdate", /(american funds|capital group).*(target|retirement)|\bAFTD\b/i],
  ["statestreet-target", /(state\s*st|ssga|ssg a)\w*.*(target|retirement)/i],
  ["jpmorgan-smartretirement", /j\.?p\.?\s*morgan.*smart\s*retire|smartretirement|smart retirement/i],
  ["principal-lifetime", /principal.*life\s*time|principal.*lifetime/i],
  ["nuveen-tiaa-lifecycle", /(nuveen|tiaa).*lifecycle|lifecycle\s*(index\s*)?\d{4}/i],
  ["schwab-target", /schwab.*target/i],
  ["amcentury-onechoice", /american century.*one\s*choice|one\s*choice.*\d{4}/i],
];

const VERDICT = new Map();
const fam = new Map();          // family -> { rows, value, plans:Set, names:Map }
const other = { rows: 0, value: 0, plans: new Set() };
let rows = 0, trustish = 0;

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
      const key = `${String(f.iss || "").trim()}\u0000${f.nameRaw}\u0000${String(f.type || "")}`;
      let r = VERDICT.get(key);
      if (r === undefined) { r = R.renderRow(lead, f, "menu", total); VERDICT.set(key, r); }
      if (!r) continue;
      /* THE PUBLISHED SHAPE THIS IS ABOUT: the page prints NO fee and NO
       * return for the row today -- either because it is an asterisked
       * comparable (fee withdrawn 2026-11-13) or because nothing resolved. */
      const printsFee = r.er != null && r.er !== "";
      if (printsFee && !r.star) continue;
      const shown = String(r.shownType || "");
      if (!/collective trust|separate account|pooled/i.test(shown)) continue;
      trustish++;
      const hay = `${f.iss || ""} ${f.nameRaw}`;
      const hit = FAMILY.find(([, re]) => re.test(hay));
      if (!hit) { other.rows++; other.value += +f.value || 0; for (const q of mem) other.plans.add(`${q.ein}|${q.pn}`); continue; }
      const name = hit[0];
      if (!fam.has(name)) fam.set(name, { rows: 0, value: 0, plans: new Set(), names: new Map() });
      const F = fam.get(name);
      F.rows++; F.value += +f.value || 0;
      for (const q of mem) F.plans.add(`${q.ein}|${q.pn}`);
      F.names.set(f.nameRaw, (F.names.get(f.nameRaw) || 0) + 1);
    }
  }
}

const ppl = new Map();
for (const row of d.rows) ppl.set(`${d.get(row, "ein")}|${d.get(row, "pn")}`, +d.get(row, "partEOY") || +d.get(row, "participants") || 0);
const readers = (set) => [...set].reduce((a, k) => a + (ppl.get(k) || 0), 0);

console.log(`rendered ${rows.toLocaleString()} served rows; ${trustish.toLocaleString()} print neither fee nor return and are pooled-vehicle-typed\n`);
const out = [...fam.entries()].map(([k, F]) => ({ k, rows: F.rows, plans: F.plans.size, readers: readers(F.plans), value: F.value, names: F.names }));
out.sort((a, b) => b.readers - a.readers);
for (const o of out) {
  console.log(`${o.k.padEnd(26)} ${String(o.rows).padStart(7)} rows  ${String(o.plans).padStart(6)} plans  ${o.readers.toLocaleString().padStart(12)} readers  $${Math.round(o.value).toLocaleString()}`);
}
console.log(`${"(no family matched)".padEnd(26)} ${String(other.rows).padStart(7)} rows  ${String(other.plans.size).padStart(6)} plans  ${readers(other.plans).toLocaleString().padStart(12)} readers  $${Math.round(other.value).toLocaleString()}`);

const top = out[0];
if (top) {
  console.log(`\ntop family ${top.k} — most common filed spellings:`);
  for (const [n, c] of [...top.names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${String(c).padStart(5)}  ${JSON.stringify(n)}`);
  console.log(`  (${top.names.size} distinct filed spellings)`);
}
