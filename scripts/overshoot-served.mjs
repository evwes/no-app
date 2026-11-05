#!/usr/bin/env node
/* wampo — HOW MANY OF THE 764 OVERSHOOT MENUS DOES A READER ACTUALLY SEE?
 *
 * The attribution of `overshoot` 366 -> 764 is correct about the AUDIT METRIC,
 * which is ack-keyed over confident entries with a plan row. It is NOT a count
 * of what the page publishes, and the Comcast probe is why that matters:
 *
 *   `app.js:3428`  if (mti / tot > 0.5 || (lu.funds.length <= 8 && top / tot >= 0.6))
 *                    { ownUsable = false; trustPointer = true; }
 *
 * A plan's own lineup of <=8 rows with one row carrying >=60% of the value is
 * the parser's own TRUST-POINTER shape, and app.js demotes it in favour of the
 * master trust's real holdings. That guard's own comment NAMES COMCAST as one
 * of the ten it was measured on. So Comcast's 4-row "At fair value" menu is in
 * the overshoot population and reaches no reader at all.
 *
 * ***AND `lib-ledger`'s `servedLineup` DOES NOT APPLY THAT TEST*** — it asks
 * only `confident(idx, plan.ack)` — so every instrument built on it, including
 * this cycle's own attribution scripts, inherits the blindness. That is the
 * recorded rule twice over: a measurement of what a page PUBLISHES must apply
 * every condition the page applies, and the two surfaces disagree about when a
 * trust menu is served.
 *
 * So this splits the 764 by whether app.js's shape test demotes them, and
 * prices the fb enrichment inside each half. If the fb-heavy tiny menus are
 * exactly the ones the guard already demotes, the reader-facing half of the
 * rise is much smaller than the metric's and the fallback's worst output is
 * already being caught.
 *
 * The test is TRANSCRIBED from app.js rather than retyped from memory, and a
 * control asserts it reproduces the guard's own named verdict on Comcast.
 *
 * Run: node scripts/overshoot-served.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPlans } from "./lib-schema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* app.js's own expression, sliced so it cannot drift away from the page */
const APP = readFileSync(path.join(ROOT, "app.js"), "utf8");
const mm = APP.match(/if \(mti \/ tot > 0\.5 \|\| \(lu\.funds\.length <= (\d+) && top \/ tot >= (0\.\d+)\)\)/);
if (!mm) throw new Error("app.js's trust-pointer shape test has moved — re-slice it before reading anything below");
const ROW_CAP = +mm[1], TOP_SHARE = +mm[2];
console.log(`sliced from app.js: rows <= ${ROW_CAP} && top/tot >= ${TOP_SHARE}  (or master-trust rows > 50%)\n`);

const d = loadPlans();
const g = d.get;
const byAck = new Map();
for (const r of d.rows) { const a = g(r, "ack"); if (a) byAck.set(a, r); }

/* the demotion, as app.js computes it: it requires a LINKED trust (mtiaAck),
 * not a parsed one */
function demoted(e, row) {
  if (!g(row, "mtiaAck")) return false;
  const tot = e.funds.reduce((a, f) => a + (+f.value || 0), 0) || 1;
  const mti = e.funds.filter((f) => f.type === "Master trust interest" ||
    /master trust/i.test((f.iss || "") + " " + (f.name || ""))).reduce((a, f) => a + (+f.value || 0), 0);
  const top = Math.max(...e.funds.map((f) => +f.value || 0));
  return (mti / tot > 0.5) || (e.funds.length <= ROW_CAP && top / tot >= TOP_SHARE);
}

const COMCAST = "20261006114519NAL0027710032001";
let pinSeen = false;
const over = [];
for (let s = 0; s < 64; s++) {
  const nn = String(s).padStart(2, "0");
  let obj;
  try { obj = JSON.parse(readFileSync(path.join(ROOT, "data", "lineups", `${nn}.json`), "utf8")); } catch { continue; }
  for (const [ack, e] of Object.entries(obj)) {
    if (!e || !e.confident || !Array.isArray(e.funds) || !e.funds.length) continue;
    const row = byAck.get(ack);
    if (!row) continue;
    if (ack === COMCAST) {
      pinSeen = true;
      if (!demoted(e, row)) throw new Error("CONTROL FAILED: the sliced test does NOT demote Comcast, which app.js's own comment names as one of the ten it was measured on — the transcription is wrong");
    }
    const schH = g(row, "assetsEOY") || 0;
    if (schH < 1e6) continue;
    const sum = e.funds.reduce((a, f) => a + (+f.value || 0), 0);
    if (sum < schH * 1.15) continue;
    over.push({
      ack, rows: e.funds.length, fb: e.fb || (e.meta && e.meta.fb) || null,
      ratio: sum / schH, ppl: g(row, "partEOY") || g(row, "participants") || 0,
      name: g(row, "sponsorName") || "", dem: demoted(e, row),
      trust: !!g(row, "mtiaAck"),
    });
  }
}
if (!pinSeen) throw new Error("CONTROL FAILED: Comcast's ack is not a confident entry with a plan row — the pin is void and nothing below can be read");
console.log(`CONTROL  the sliced test demotes Comcast, as app.js's comment says it must\n`);

const dem = over.filter((x) => x.dem), served = over.filter((x) => !x.dem);
const sum = (a, k) => a.reduce((s, x) => s + x[k], 0);
console.log(`overshoot >=1.15x, ack-keyed (the audit metric)   ${over.length} menus / ${sum(over, "ppl").toLocaleString()} ppl`);
console.log(`  DEMOTED by app.js's trust-pointer shape test    ${dem.length} menus / ${sum(dem, "ppl").toLocaleString()} ppl   <- reaches NO reader on the report`);
console.log(`  own lineup still served                         ${served.length} menus / ${sum(served, "ppl").toLocaleString()} ppl`);
const pct = (a) => a.length ? (100 * a.filter((x) => x.fb).length / a.length).toFixed(1) : "-";
const tiny = (a) => a.length ? (100 * a.filter((x) => x.rows < 10).length / a.length).toFixed(1) : "-";
console.log(`\n  fb share:   demoted ${pct(dem)}%   served ${pct(served)}%`);
console.log(`  under 10 rows: demoted ${tiny(dem)}%   served ${tiny(served)}%`);
console.log(`  (of the whole population, ${over.filter((x) => x.trust).length} have a LINKED trust and so can be demoted at all)`);

for (const [label, a] of [["DEMOTED — in the metric, invisible to readers", dem], ["SERVED — a reader sees this inflated total", served]]) {
  console.log(`\n--- ${label}, largest by readers ---`);
  for (const x of a.slice().sort((p, q) => q.ppl - p.ppl).slice(0, 8))
    console.log(`  ${String(x.ppl).padStart(7)}p  ${x.ratio.toFixed(2)}x  ${x.rows} rows  fb=${x.fb || "-"}  ${x.name.slice(0, 40)}`);
}
