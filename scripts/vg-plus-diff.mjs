#!/usr/bin/env node
/* wampo — THE DIFFERENTIAL for the Institutional Plus split-marker arm.
 *
 * Two renderers from ONE committed baseline, varying ONE file: HEAD's
 * fund-er.js against the working tree's. Whatever the harness does oddly
 * cancels. Both sides compose the SOURCED override the same way, because
 * renderRow returns the PRE-override estimate and the cell a reader sees is
 * the sourced figure where one exists — which is the whole point here: both
 * VINIX and VIIIX are sourced, so the wrong class does not merely mislabel the
 * symbol, it prints a wrong fee under a VERIFIED TICK.
 *
 * Prints every field the page acts on (tk, star, er, ytd, shownType) and
 * counts row MEMBERSHIP on both sides, because a name change can change which
 * rows survive cleanCostMarkers' ID_ONLY drop. This change touches no name, so
 * membership must be identical and that is asserted rather than assumed.
 *
 * ONE SURFACE: scripts/build-seo-pages.mjs imports no fund-er and its table is
 * `<th>Fund</th><th>Value</th>` — no ticker column and no fee column — so the
 * crawlable pages cannot show this. Checked, not assumed.
 */
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRenderer } from "./apppath.mjs";
import { loadPlans } from "./lib-schema.mjs";
import { servedLineup } from "./lib-ledger.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = mkdtempSync(path.join(os.tmpdir(), "vgplus-"));
const headFunder = path.join(tmp, "fund-er.js");
writeFileSync(headFunder, execFileSync("git", ["show", "HEAD:fund-er.js"], { cwd: ROOT, encoding: "utf8" }));

/* THE PIN THAT MAKES A SILENT NO-DIFFERENCE IMPOSSIBLE: a "before" that is
 * secretly the "after" reads as a clean zero. Point it at a missing path and
 * require a THROW. */
let threw = false;
try { buildRenderer({ appjs: path.join(ROOT, "app.js"), funder: path.join(tmp, "no-such-file.js") }); }
catch { threw = true; }
if (!threw) throw new Error("control FAILED: buildRenderer accepted a missing funder path, so the BEFORE side cannot be trusted");

const BEFORE = buildRenderer({ appjs: path.join(ROOT, "app.js"), funder: headFunder });
const AFTER = buildRenderer({ appjs: path.join(ROOT, "app.js"), funder: path.join(ROOT, "fund-er.js") });

const FACTS = JSON.parse(readFileSync(`${ROOT}/data/fund-facts.json`, "utf8"));
const byTicker = new Map(Object.entries(FACTS.funds).map(([tk, e]) => [tk.toUpperCase(), e]));
if (!byTicker.has("VINIX") || !byTicker.has("VIIIX"))
  throw new Error("control FAILED: VINIX/VIIIX are not both sourced, so the fee half of this differential cannot be measured");

const lidx = JSON.parse(readFileSync(`${ROOT}/lineups-index.json`, "utf8")).plans;
const d = loadPlans();
for (const R of [BEFORE, AFTER]) R.setPlans(d.rows.map((r) => ({ sponsorName: d.get(r, "sponsorName"), ticker: d.get(r, "ticker") })));

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

/* the cell a reader sees, with the sourced override applied as app.js applies
 * it: a comparable publishes neither figure, and a sourced figure outranks the
 * pattern estimate. */
const shown = (r) => {
  if (!r) return { tk: "(no row)", er: null, ytd: null, star: false };
  const bare = r.tk ? String(r.tk).replace(/\*$/, "").toUpperCase() : null;
  const sf = (!r.star && bare) ? byTicker.get(bare) : null;
  return {
    tk: (r.tk || "") + (r.star ? "*" : ""),
    er: r.star ? null : (sf && sf.er != null ? sf.er : r.er),
    erSourced: !!(sf && sf.er != null),
    ytd: (sf && sf.ytd != null) ? sf.ytd : null,
    star: !!r.star, type: r.shownType || "",
  };
};

/* NARROWED BY A PROPERTY OF THE CHANGE, AND THE NARROWING IS DISCHARGED BELOW.
 * The arm can only fire on a string containing "institutional" and "index" and
 * "plus" (case-insensitively, as whole-ish words), so no other row can move.
 * This supersets what the change can touch BY CONSTRUCTION: it is the
 * conjunction of three literal substrings every branch of the pattern
 * requires, not a sample. The narrowing gates the RENDER, not the comparison. */
const CAN_MOVE = (s) => /institutional/i.test(s) && /index/i.test(s) && /plus|\+/i.test(s);

let rows = 0, considered = 0, membershipB = 0, membershipA = 0;
const moved = new Map();     // key -> { before, after, rows, value, plans:Set }
let movedOutsideClass = 0;

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
      const nameRaw = String(raw.name || "");
      const iss = String(raw.iss || "").trim();
      if (!CAN_MOVE(`${iss} ${nameRaw}`)) continue;
      considered++;
      const fB = { ...raw, nameRaw, name: BEFORE.clean(nameRaw) };
      const fA = { ...raw, nameRaw, name: AFTER.clean(nameRaw) };
      const rB = BEFORE.renderRow(lead, fB, "menu", total);
      const rA = AFTER.renderRow(lead, fA, "menu", total);
      if (rB) membershipB++;
      if (rA) membershipA++;
      const b = shown(rB), a = shown(rA);
      if (b.tk === a.tk && b.er === a.er && b.ytd === a.ytd && b.star === a.star && b.type === a.type) continue;
      if (!(b.tk === "VINIX" && a.tk === "VIIIX")) movedOutsideClass++;
      const key = `${iss}\u0000${nameRaw}\u0000${b.tk}->${a.tk}|${b.er}->${a.er}|${b.ytd}->${a.ytd}`;
      if (!moved.has(key)) moved.set(key, { iss, nameRaw, b, a, rows: 0, value: 0, plans: new Set() });
      const M = moved.get(key);
      M.rows++; M.value += +raw.value || 0;
      for (const q of mem) M.plans.add(`${q.ein}|${q.pn}`);
    }
  }
}

/* DISCHARGE THE NARROWING: every group the reading list found must be inside
 * CAN_MOVE, or the superset claim is false. */
const PINS = ["Vanguard Institutional Index Plus Fund", "Vanguard Institutional Index Fund Plus Shares",
  "Vanguard Institutional Index Plus", "Vanguard Institutional Index Fund, Plus",
  "Vanguard Institutional Index Fund — Plus Shares", "Vanguard Institutional Index (Plus)"];
for (const p of PINS) if (!CAN_MOVE(p)) throw new Error(`narrowing is NOT a superset: it excludes ${JSON.stringify(p)}`);

const allPlans = new Set();
let movedRows = 0, movedValue = 0;
for (const M of moved.values()) { movedRows += M.rows; movedValue += M.value; for (const k of M.plans) allPlans.add(k); }
const readers = [...allPlans].reduce((a, k) => a + (ppl.get(k) || 0), 0);

console.log(`rendered ${rows.toLocaleString()} served rows; ${considered.toLocaleString()} could move by construction`);
console.log(`row membership: before ${membershipB.toLocaleString()}, after ${membershipA.toLocaleString()}` +
  (membershipB === membershipA ? "  (identical, as a change touching no name must be)" : "  *** MEMBERSHIP MOVED ***"));
console.log(`\n${moved.size} distinct (issuer, filed name, change) group(s) move:\n`);
for (const M of [...moved.values()].sort((a, b) => b.rows - a.rows)) {
  console.log(`  ${String(M.rows).padStart(4)} rows  ${String(M.plans.size).padStart(4)} plans  $${Math.round(M.value).toLocaleString().padStart(15)}  ` +
    `tk ${M.b.tk || "—"}->${M.a.tk || "—"}  er ${M.b.er ?? "—"}${M.b.erSourced ? "✓" : ""}->${M.a.er ?? "—"}${M.a.erSourced ? "✓" : ""}  ` +
    `ytd ${M.b.ytd ?? "—"}->${M.a.ytd ?? "—"}  ${JSON.stringify(M.nameRaw)}${M.iss ? ` [${M.iss}]` : ""}`);
}
console.log(`\nTOTAL: ${movedRows} rows / ${allPlans.size} plans / ${readers.toLocaleString()} readers / $${Math.round(movedValue).toLocaleString()}`);
console.log(`rows moving to anything other than VINIX->VIIIX: ${movedOutsideClass}` +
  (movedOutsideClass ? "   *** READ THESE ***" : "   (none — the change is exactly its class)"));
