#!/usr/bin/env node
/* wampo — what did a sec-tickers.js regeneration COST READERS?
 *
 * Regen #27 (commit 4ee89a12, mirrored 2026-11-17) removed 744 keys and added
 * 8, with 0 changing value. The key diff is cheap and I had it in a minute; the
 * number that actually matters is how many PUBLISHED, SERVED rows stopped
 * printing a ticker, and that is not derivable from a key count. A key reaches
 * a reader only if a live row carries it AND the page's own chain did not
 * already answer that row — `sec-tickers` is the LAST-RESORT arm.
 *
 * So this is a differential: one store, one app.js, two tables.
 *
 * THE NARROWING IS BY CONSTRUCTION, not by sampling. app.js builds the key as
 * `(f.iss) NUL (f.nameRaw || f.name)` — asserted by sec-tickers-test, which
 * prints "app.js builds the key as (f.iss) NUL (f.nameRaw || f.name)". The
 * table is consulted by exact key. Therefore removing key K can change the
 * rendered row only where that row's key IS K. Rows outside the changed-key set
 * cannot move, so restricting the render to them is a superset of what the
 * change can touch — the standard this record demands, since sampling cannot
 * establish a superset.
 *
 * The narrowing is DISCHARGED anyway, on a random sample of rows outside it,
 * because a construction argument about a file I did not write is a premise.
 *
 *   node scripts/sec-key-loss.mjs <before-ref> <after-ref>
 */
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { buildRenderer } from "./apppath.mjs";
import { loadPlans } from "./lib-schema.mjs";
import { servedLineup } from "./lib-ledger.mjs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const BEFORE = process.argv[2] || "9596dfae";
const AFTER = process.argv[3] || "4ee89a12";

const tmp = mkdtempSync(path.join(os.tmpdir(), "seckey-"));
const materialise = (ref, name) => {
  const src = execFileSync("git", ["show", `${ref}:sec-tickers.js`],
    { cwd: ROOT, maxBuffer: 1 << 30, encoding: "utf8" });
  const p = path.join(tmp, name);
  writeFileSync(p, src);
  return { p, src };
};
const b4 = materialise(BEFORE, "before.js");
const af = materialise(AFTER, "after.js");

const tableOf = (src) => new Function(src + "\n;return SEC_TICKERS;")();
const TB = tableOf(b4.src), TA = tableOf(af.src);
const kb = new Set(Object.keys(TB)), ka = new Set(Object.keys(TA));
const removed = new Set([...kb].filter((k) => !ka.has(k)));
const added = new Set([...ka].filter((k) => !kb.has(k)));
const changedKeys = new Set([...removed, ...added]);
for (const k of ka) if (kb.has(k) && TB[k] !== TA[k]) changedKeys.add(k);

console.log(`tables: ${BEFORE} ${kb.size} keys -> ${AFTER} ${ka.size} keys`);
console.log(`        removed ${removed.size}, added ${added.size}, changed-value ${changedKeys.size - removed.size - added.size}`);
if (!changedKeys.size) throw new Error("CONTROL FAILED: the two tables are identical — nothing to measure");

/* Two renderers over ONE app.js and ONE store, varying only the table. */
const A = buildRenderer({ secTickers: b4.p });   // before
const B = buildRenderer({ secTickers: af.p });   // after

const d = loadPlans();
const plansForCtx = d.rows.map((r) => ({ sponsorName: d.get(r, "sponsorName"), ticker: d.get(r, "ticker") }));
A.setPlans(plansForCtx); B.setPlans(plansForCtx);

const INDEX = JSON.parse(readFileSync(`${ROOT}/lineups-index.json`, "utf8")).plans;

const members = new Map();
for (const r of d.rows) {
  const o = { sponsorName: d.get(r, "sponsorName"), ein: d.get(r, "ein"), pn: d.get(r, "pn"),
    ticker: d.get(r, "ticker"), ppl: d.get(r, "partEOY") || d.get(r, "participants") || 0,
    assetsEOY: d.get(r, "assetsEOY") || 0, planYear: d.get(r, "planYear"),
    ack: d.get(r, "ack"), mtiaAck: d.get(r, "mtiaAck") };
  for (const a of [d.get(r, "ack"), d.get(r, "mtiaAck")]) {
    if (!a) continue;
    if (!members.has(a)) members.set(a, []);
    members.get(a).push(o);
  }
}
const servedBy = (m) => servedLineup(m, INDEX).ack;

let scanned = 0, narrowed = 0, lost = 0, gained = 0, switched = 0;
const lostRows = [], lostPlans = new Set(), gainedPlans = new Set();
let lostSlots = 0, gainedSlots = 0;
const outsideSample = [];

for (let s = 0; s < 64; s++) {
  const f = `${ROOT}/data/lineups/${String(s).padStart(2, "0")}.json`;
  if (!existsSync(f)) continue;
  for (const [ack, e] of Object.entries(JSON.parse(readFileSync(f, "utf8")))) {
    const all = members.get(ack);
    if (!all || !e.funds || !e.funds.length) continue;
    // publish gate FIRST against full member weight, then the serving filter —
    // the order draw-published.mjs records, because servedBy only ever returns a
    // confident ack and filtering first makes the excluded counter read 0.
    const pplAll = all.reduce((a, m) => a + m.ppl, 0);
    if (pplAll <= 0) continue;
    if (((INDEX[ack] || 0) & 1) !== 1) continue;
    const mem = all.filter((m) => servedBy(m) === ack);
    const ppl = mem.reduce((a, m) => a + m.ppl, 0);
    if (!mem.length || ppl <= 0) continue;

    const lead = mem[0];
    const total = mem.reduce((a, m) => a + (m.assetsEOY || 0), 0);
    for (const fd of e.funds) {
      scanned++;
      const nameRaw = fd.nameRaw || fd.name || "";
      const key = `${fd.iss || ""}\u0000${nameRaw}`;
      if (!changedKeys.has(key)) {
        // reservoir for the narrowing discharge
        if (outsideSample.length < 400 && Math.random() < 0.002)
          outsideSample.push({ lead, fd, nameRaw, total });
        continue;
      }
      narrowed++;
      let ra, rb;
      try { ra = A.renderRow(lead, { ...fd, nameRaw, name: A.clean(nameRaw) }, "menu", total); } catch { }
      try { rb = B.renderRow(lead, { ...fd, nameRaw, name: B.clean(nameRaw) }, "menu", total); } catch { }
      const ta = ra && ra.tk ? String(ra.tk) : "";
      const tb = rb && rb.tk ? String(rb.tk) : "";
      if (ta === tb) continue;
      const pk = `${lead.ein}|${lead.pn}`;
      if (ta && !tb) {
        lost++; lostSlots += ppl; lostPlans.add(pk);
        if (lostRows.length < 25) lostRows.push({ pk, sponsor: lead.sponsorName, nameRaw, iss: fd.iss || "", was: ta, ppl, star: ra.star });
      } else if (!ta && tb) { gained++; gainedSlots += ppl; gainedPlans.add(pk); }
      else switched++;
    }
  }
}

console.log(`\nscanned ${scanned.toLocaleString()} published+served rows`);
console.log(`narrowed to ${narrowed.toLocaleString()} rows whose key is in the changed set`);
console.log(`\n  LOST a ticker:    ${lost.toLocaleString()} rows / ${lostPlans.size.toLocaleString()} plans / ${lostSlots.toLocaleString()} reader-slots`);
console.log(`  GAINED a ticker:  ${gained.toLocaleString()} rows / ${gainedPlans.size.toLocaleString()} plans / ${gainedSlots.toLocaleString()} reader-slots`);
console.log(`  SWITCHED symbol:  ${switched.toLocaleString()} rows   <- any non-zero here is a reader seeing a DIFFERENT symbol`);

// CONTROL 1 — the harness must be able to SEE the change. A broken arm and an
// inert arm read the same zero, so a flat 0/0/0 is only believable once a
// synthetic row built from a removed key is shown to move.
const probeKey = [...removed][0];
if (probeKey) {
  const [piss, pname] = probeKey.split("\u0000");
  const pf = { nameRaw: pname, iss: piss, type: "" };
  const pa = A.renderRow({ ein: "1", pn: "001", assetsEOY: 1e9 }, { ...pf, name: A.clean(pname) }, "menu", 1e9);
  const pb = B.renderRow({ ein: "1", pn: "001", assetsEOY: 1e9 }, { ...pf, name: B.clean(pname) }, "menu", 1e9);
  const ok = (pa && pa.tk ? pa.tk : "") !== (pb && pb.tk ? pb.tk : "");
  console.log(`\ncontrol: a synthetic row on a REMOVED key moves: ${ok ? "YES" : "NO"}  (${(pa && pa.tk) || "—"} -> ${(pb && pb.tk) || "—"})  "${pname.slice(0, 50)}"`);
  if (!ok) throw new Error("CONTROL FAILED: the harness cannot observe a removed key — every zero above is meaningless");
}

// CONTROL 2 — discharge the narrowing on rows OUTSIDE it.
let outsideMoved = 0;
for (const o of outsideSample) {
  const ra = A.renderRow(o.lead, { ...o.fd, nameRaw: o.nameRaw, name: A.clean(o.nameRaw) }, "menu", o.total);
  const rb = B.renderRow(o.lead, { ...o.fd, nameRaw: o.nameRaw, name: B.clean(o.nameRaw) }, "menu", o.total);
  if (((ra && ra.tk) || "") !== ((rb && rb.tk) || "")) outsideMoved++;
}
console.log(`control: ${outsideSample.length} rows OUTSIDE the narrowing re-rendered, ${outsideMoved} moved (expected 0)`);
if (outsideMoved) throw new Error("CONTROL FAILED: a row outside the narrowing moved — the narrowing is not a superset");

if (lostRows.length) {
  console.log(`\n--- rows that stopped printing a ticker (first ${lostRows.length}) ---`);
  for (const r of lostRows)
    console.log(`  ${String(r.ppl).padStart(7)}p  ${r.was}${r.star ? "*" : " "}  ${r.pk}  ${r.sponsor}`.padEnd(78) + `  "${r.iss ? r.iss + " | " : ""}${r.nameRaw.slice(0, 48)}"`);
}
