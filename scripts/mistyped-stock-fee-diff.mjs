#!/usr/bin/env node
/* wampo — DID WITHDRAWING THE MISTYPED-STOCK FEE MOVE ONLY THE FEE?
 *
 * The ship adds one conjunct, `mistypedStock && !tk`, to app.js's `er` chain.
 * `mistypedStock` is true once the page knows the row is NOT the sponsor's own
 * stock, so `noPublicPrice` -- which reads the TYPE CELL -- cannot fire on it,
 * because the type cell is the thing that is wrong.
 *
 * `!tk` is the whole correctness: of the 83 priced rows the predicate reaches,
 * 50 resolve a ticker and are REGISTERED FUNDS the filer mistyped, whose fee is
 * right. So what must come back is:
 *
 *   fee LOST 33 · fee GAINED 0 · fee CHANGED 0
 *   ticker 0 · asterisk 0 · shownType 0 · row membership 0
 *
 * A DIFFERENTIAL through BOTH copies of `renderRow`, one renderer per app.js,
 * with the TABLE and fund-er.js held fixed so the chain is the only variable.
 *
 * NARROWED BY A PROPERTY OF THE PREDICATE, a SUPERSET BY CONSTRUCTION:
 * `isMistypedStockRow` returns false before looking at the name unless the TYPE
 * cell makes an employer-stock claim (lib-disclose:5062), so a row whose type
 * claims no stock cannot fire. The narrowing is DISCHARGED on a sample of the
 * complement rather than asserted -- and the whole-store render is what this
 * project records as never finishing, so the narrowing is not optional.
 *
 * Run: node scripts/mistyped-stock-fee-diff.mjs [baseRef]
 */
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { buildRenderer } from "./apppath.mjs";
import { loadPlans } from "./lib-schema.mjs";
import { servedLineup } from "./lib-ledger.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.argv[2] || "origin/main";

const tmp = mkdtempSync(path.join(os.tmpdir(), "msfee-"));
const basePath = path.join(tmp, "base-app.js");
const r = spawnSync("git", ["show", `${BASE}:app.js`], { maxBuffer: 1 << 30, encoding: "utf8" });
if (r.status !== 0) throw new Error(`git show ${BASE}:app.js failed`);
writeFileSync(basePath, r.stdout);

/* CONTROL: the two files must actually differ on the arm, or this harness is
 * reading one app.js twice -- the recorded "a before that is silently the after
 * reads as a clean no-difference" trap. */
/* ANCHORED ON THE DECLARATION, not on the identifier. My first version grepped
 * for `mistypedStockFee`, which is a PREFIX of the long-shipped
 * `mistypedStockFeeIsGuaranteeOnly`, so it matched origin/main and reported
 * that the base ref already carried the arm. A token keyed on a name matches
 * every name it is a prefix of; the flag is now `mistypedStockPatternFee` and
 * the control asks for the whole declaration. */
const ARM = "const mistypedStockPatternFee =";
const live = readFileSync(path.join(ROOT, "app.js"), "utf8");
if (!live.includes(ARM)) throw new Error("CONTROL FAILED: the working tree does not carry the arm");
if (r.stdout.includes(ARM)) throw new Error(`CONTROL FAILED: ${BASE} ALREADY carries the arm — there is nothing to measure`);
if (!/mistypedStockFeeIsGuaranteeOnly/.test(r.stdout)) throw new Error("CONTROL FAILED: the base ref lacks the pre-existing guarantee-only arm — this is not the app.js this harness was written against");

const rOld = buildRenderer({ appjs: basePath });
const rNew = buildRenderer({ appjs: path.join(ROOT, "app.js") });

const d = loadPlans();
const g = d.get;
const lidx = JSON.parse(readFileSync(path.join(ROOT, "lineups-index.json"), "utf8")).plans;
if (!lidx || !Object.keys(lidx).length) throw new Error("lineups-index .plans is empty");
const planRows = d.rows.map((x) => ({ sponsorName: g(x, "sponsorName"), ticker: g(x, "ticker") }));
rOld.setPlans(planRows); rNew.setPlans(planRows);

const served = new Map();
for (const row of d.rows) {
  const p = { ack: g(row, "ack"), mtiaAck: g(row, "mtiaAck"), ein: g(row, "ein"), pn: g(row, "pn"),
    participants: +g(row, "partEOY") || +g(row, "participants") || 0,
    sponsorName: String(g(row, "sponsorName") || "").trim(), ticker: g(row, "ticker") };
  const s = servedLineup(p, lidx);
  if (!s.ack) continue;
  if (!served.has(s.ack)) served.set(s.ack, []);
  served.get(s.ack).push(p);
}

/* the superset: the predicate cannot fire unless the TYPE cell claims stock */
const CLAIMS_STOCK = /stock|equity|employer\s+securit|\besop\b/i;

let cand = 0, ctrl = 0, ctrlDiff = 0;
let feeLost = 0, feeGained = 0, feeChanged = 0, tkMoved = 0, starMoved = 0, typeMoved = 0;
let rowsOld = 0, rowsNew = 0;
const lostPlans = new Map(); let lostDollars = 0;
const lost = [], other = [];

for (const file of readdirSync(path.join(ROOT, "data", "lineups")).filter((x) => x.endsWith(".json"))) {
  const shard = JSON.parse(readFileSync(path.join(ROOT, "data", "lineups", file), "utf8"));
  for (const [ack, e] of Object.entries(shard)) {
    if (!e || !e.confident || !Array.isArray(e.funds) || !e.funds.length) continue;
    const mem = served.get(ack); if (!mem) continue;
    const lead = mem[0];
    const total = e.funds.reduce((a, f) => a + (+f.value || 0), 0);
    for (const f of e.funds) {
      const isCand = CLAIMS_STOCK.test(String(f.type || ""));
      if (isCand) cand++; else { ctrl++; if (ctrl % 211 !== 0) continue; }
      const a = rOld.renderRow(lead, { ...f }, "menu", total);
      const b = rNew.renderRow(lead, { ...f }, "menu", total);
      if (a) rowsOld++; if (b) rowsNew++;
      const ea = a && a.er != null && a.er !== "" ? String(a.er) : null;
      const eb = b && b.er != null && b.er !== "" ? String(b.er) : null;
      const ta = a && a.tk ? String(a.tk) : null, tb = b && b.tk ? String(b.tk) : null;
      const differs = ea !== eb || ta !== tb || (!!(a && a.star) !== !!(b && b.star))
        || String(a && a.shownType) !== String(b && b.shownType) || (!a) !== (!b);
      if (!isCand) { if (differs) ctrlDiff++; continue; }
      if (ta !== tb) tkMoved++;
      if (!!(a && a.star) !== !!(b && b.star)) starMoved++;
      if (String(a && a.shownType) !== String(b && b.shownType)) typeMoved++;
      if (ea && !eb) {
        feeLost++; lostDollars += (+f.value || 0);
        for (const q of mem) lostPlans.set(`${q.ein}|${q.pn}`, q.participants);
        lost.push({ ppl: mem.reduce((s, q) => s + q.participants, 0), v: +f.value || 0, er: ea,
          pct: total ? (100 * (+f.value || 0) / total) : 0,
          sponsor: lead.sponsorName, name: String(f.nameRaw || f.name || ""), type: String(f.type || "") });
      } else if (!ea && eb) { feeGained++; other.push(`GAINED ${lead.sponsorName} "${String(f.nameRaw||f.name).slice(0,40)}" -> ${eb}`); }
      else if (ea && eb && ea !== eb) { feeChanged++; other.push(`CHANGED ${lead.sponsorName} "${String(f.nameRaw||f.name).slice(0,40)}" ${ea} -> ${eb}`); }
    }
  }
}

const n = (x) => Math.round(x).toLocaleString();
console.log(`base ${BASE}\ncandidate rows ${n(cand)}   non-candidates sampled ${n(Math.floor(ctrl / 211))}\n`);
console.log(`fee LOST       ${feeLost}  ${lostPlans.size} plans  ${n([...lostPlans.values()].reduce((a, b) => a + b, 0))} readers  $${n(lostDollars)}`);
console.log(`fee GAINED     ${feeGained}      (must be 0 — this change only removes)`);
console.log(`fee CHANGED    ${feeChanged}      (must be 0)`);
console.log(`ticker moved   ${tkMoved}      (must be 0 — FEE ONLY)`);
console.log(`asterisk moved ${starMoved}      (must be 0)`);
console.log(`shownType moved${typeMoved}      (must be 0)`);
console.log(`row membership ${rowsOld} -> ${rowsNew}  (must be equal)`);
console.log(`CONTROL non-candidate rows differing: ${ctrlDiff}  (must be 0 — discharges the narrowing)`);
if (!feeLost) throw new Error("CONTROL FAILED: the two renderers agree on every candidate row — the harness is probably reading one app.js twice");
console.log("\n--- every withdrawn row, largest first (read them all) ---");
for (const x of lost.sort((p, q) => q.v - p.v))
  console.log(`  ${String(x.ppl).padStart(7)}p  er=${String(x.er).padStart(5)}  $${String(n(x.v)).padStart(14)}  ${x.pct.toFixed(1)}%  ${x.sponsor.slice(0, 26).padEnd(26)} "${x.name.slice(0, 44)}" [${x.type}]`);
for (const x of other) console.log(`  !! ${x}`);
