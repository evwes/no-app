#!/usr/bin/env node
/* wampo — THE DIFFERENTIAL for publishing a collective trust's own figures.
 *
 * Two renderers from one committed baseline, varying ONE file: HEAD's app.js
 * against the working tree's. Both load the SAME fund-facts.js, so the only
 * thing that differs is the render. That is new as of today: until this
 * morning the harness did not load the sourced tables at all, which meant it
 * could not observe a sourced cell and a caller had to re-compose the lookup
 * by hand — a re-implementation of a shipped expression, and the vehicle path
 * cannot be composed from outside the row block in any case.
 *
 * Reports every field the page acts on: the shown fee, the shown return, the
 * ticker, the asterisk, the type, and ROW MEMBERSHIP on both sides.
 *
 * ONE SURFACE: build-seo-pages.mjs imports no fund-er and no fund-facts, and
 * its table is <th>Fund</th><th>Value</th> — no ticker, fee or return column.
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
const tmp = mkdtempSync(path.join(os.tmpdir(), "vehdiff-"));
const headApp = path.join(tmp, "app.js");
writeFileSync(headApp, execFileSync("git", ["show", "HEAD:app.js"], { cwd: ROOT, encoding: "utf8" }));

/* A BEFORE THAT IS SILENTLY THE AFTER READS AS A CLEAN NO-DIFFERENCE. Pin it
 * by pointing the loader at a missing path and requiring a THROW. */
let threw = false;
try { buildRenderer({ appjs: path.join(tmp, "nope.js") }); } catch { threw = true; }
if (!threw) throw new Error("control FAILED: buildRenderer accepted a missing app path");

const BEFORE = buildRenderer({ appjs: headApp });
const AFTER = buildRenderer({ appjs: path.join(ROOT, "app.js") });

/* AND THE HARNESS MUST BE ABLE TO SEE THE CHANGE AT ALL — assert it on a row
 * carried out of the real data shape, before counting anything. A no-difference
 * is a finding only once the instrument has been shown able to see one. */
{
  const probe = { name: "Vanguard Target Retirement 2040 Trust Plus", iss: "", type: "Collective trust", value: 1e6 };
  const mk = (R) => { const f = { ...probe, nameRaw: probe.name, name: R.clean(probe.name) };
    return R.renderRow({ sponsorName: "x", ticker: "" }, f, "menu", 1e6); };
  const b = mk(BEFORE), a = mk(AFTER);
  if (b.erShown != null) throw new Error(`control FAILED: the BEFORE side already prices this row (${b.erShown})`);
  if (a.erShown == null) throw new Error("control FAILED: the AFTER side prices nothing — the harness cannot see the change");
  console.log(`instrument OK: probe row moves erShown ${b.erShown} -> ${a.erShown}, ytd ${b.ytdSourced ? b.ytdSourced.ytd : null} -> ${a.ytdSourced ? a.ytdSourced.ytd : null}\n`);
}

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

/* NARROWED BY A PROPERTY OF THE CHANGE, DISCHARGED BELOW. vehicleKeyFor
 * requires `vanguard` somewhere and `target` in the NAME, so no row without
 * both can move. This supersets what the change can touch BY CONSTRUCTION. */
const CAN_MOVE = (iss, n) => /vanguard/i.test(`${iss} ${n}`) && /target/i.test(n);

const VB = new Map(), VA = new Map();
let rows = 0, considered = 0, memB = 0, memA = 0;
const moved = new Map();
let feeGain = 0, feeChanged = 0, ytdGain = 0, tickerMoved = 0, starMoved = 0, typeMoved = 0;
const plans = new Set();
let movedRows = 0, movedValue = 0;
const byCls = new Map();

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
      const nameRaw = String(raw.name || ""), iss = String(raw.iss || "").trim();
      if (!CAN_MOVE(iss, nameRaw)) continue;
      considered++;
      const key = `${iss}\u0000${nameRaw}\u0000${String(raw.type || "")}`;
      let rB = VB.get(key), rA = VA.get(key);
      if (rB === undefined) {
        rB = BEFORE.renderRow(lead, { ...raw, nameRaw, name: BEFORE.clean(nameRaw) }, "menu", total);
        rA = AFTER.renderRow(lead, { ...raw, nameRaw, name: AFTER.clean(nameRaw) }, "menu", total);
        VB.set(key, rB); VA.set(key, rA);
      }
      if (rB) memB++;
      if (rA) memA++;
      if (!rB || !rA) continue;
      const bE = rB.erShown, aE = rA.erShown;
      const bY = rB.ytdSourced ? rB.ytdSourced.ytd : null, aY = rA.ytdSourced ? rA.ytdSourced.ytd : null;
      if (bE === aE && bY === aY && rB.tk === rA.tk && rB.star === rA.star && rB.shownType === rA.shownType) continue;
      movedRows++; movedValue += +raw.value || 0;
      for (const q of mem) plans.add(`${q.ein}|${q.pn}`);
      if (bE == null && aE != null) feeGain++;
      else if (bE != null && aE != null && bE !== aE) feeChanged++;
      if (bY == null && aY != null) ytdGain++;
      if (rB.tk !== rA.tk) tickerMoved++;
      if (rB.star !== rA.star) starMoved++;
      if (rB.shownType !== rA.shownType) typeMoved++;
      const cls = rA.vehicleCls || "(none)";
      if (!byCls.has(cls)) byCls.set(cls, { rows: 0, value: 0, fees: new Set() });
      const C = byCls.get(cls); C.rows++; C.value += +raw.value || 0; C.fees.add(aE);
      const mk = `${nameRaw}\u0000${bE}->${aE}|${bY}->${aY}`;
      if (!moved.has(mk)) moved.set(mk, { nameRaw, bE, aE, bY, aY, cls, rows: 0, value: 0 });
      const M = moved.get(mk); M.rows++; M.value += +raw.value || 0;
    }
  }
}

/* DISCHARGE: every shipped vehicle key's own shape must be inside CAN_MOVE. */
for (const n of ["Vanguard Target Retirement 2040 Trust Plus", "Target Retirement Income Trust I"])
  if (!CAN_MOVE("Vanguard", n)) throw new Error(`narrowing is not a superset: ${n}`);

const readers = [...plans].reduce((a, k) => a + (ppl.get(k) || 0), 0);
console.log(`rendered ${rows.toLocaleString()} served rows; ${considered.toLocaleString()} could move by construction`);
console.log(`row membership: before ${memB.toLocaleString()}, after ${memA.toLocaleString()}` +
  (memB === memA ? "  (identical)" : "  *** MEMBERSHIP MOVED ***"));
console.log(`\nTOTAL MOVED: ${movedRows.toLocaleString()} rows / ${plans.size.toLocaleString()} plans / ${readers.toLocaleString()} readers / $${Math.round(movedValue).toLocaleString()}`);
console.log(`  fee newly published : ${feeGain.toLocaleString()}`);
console.log(`  fee CHANGED value   : ${feeChanged.toLocaleString()}${feeChanged ? "   *** READ THESE — the vehicle path should only fill an EMPTY cell ***" : "   (none, as the guard requires)"}`);
console.log(`  return newly published: ${ytdGain.toLocaleString()}`);
console.log(`  ticker cells moved  : ${tickerMoved}${tickerMoved ? "  *** unexpected ***" : ""}`);
console.log(`  asterisks moved     : ${starMoved}${starMoved ? "  *** unexpected ***" : ""}`);
console.log(`  type cells moved    : ${typeMoved}${typeMoved ? "  *** unexpected ***" : ""}`);

console.log(`\nby unit class:`);
for (const [cls, C] of [...byCls.entries()].sort((a, b) => b[1].rows - a[1].rows))
  console.log(`  ${cls.padEnd(14)} ${String(C.rows).padStart(6)} rows  $${Math.round(C.value).toLocaleString().padStart(15)}  fees: ${[...C.fees].join(", ")}`);

console.log(`\nlargest moves, by value:`);
for (const M of [...moved.values()].sort((a, b) => b.value - a.value).slice(0, 12))
  console.log(`  ${String(M.rows).padStart(4)} rows  $${Math.round(M.value).toLocaleString().padStart(14)}  fee ${M.bE ?? "—"}->${M.aE ?? "—"}  ytd ${M.bY ?? "—"}->${M.aY ?? "—"}  [${M.cls}]  ${JSON.stringify(M.nameRaw)}`);
