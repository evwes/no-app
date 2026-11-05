#!/usr/bin/env node
/* wampo — DID THE REGEN'S 3,117 REMOVED KEYS COST ANY READER A SYMBOL?
 *
 * Run #8 regenerated `sec-tickers.js` at ADDED 4,246 / REMOVED 3,117 /
 * CHANGED 0. Every prior regeneration on this record read REMOVED 0, so this
 * is the largest removal the table has ever taken and the recorded rule is
 * explicit: ***a removed key is a loss only if a reader stands behind it.***
 *
 * The removals all LOOK benign — `(Continued) Nuveen International Equity Index
 * R6`, `1,242 Fidelity Mid-Cap Stock`, `+ FID FREEDOM 2065 K` — i.e. keys
 * written against spellings the leading-count and leading-punctuation strips now
 * remove, so the page no longer ASKS those keys. But "looks benign" is not a
 * measurement, and the table is keyed on `(issuer, nameRaw)` where those strips
 * move `name`, so the reasoning has to be checked rather than asserted.
 *
 * So this is a DIFFERENTIAL through BOTH copies of `renderRow`, one renderer
 * per table version, over every published+served row whose key is in the
 * removed OR the added set — a SUPERSET by construction, since CHANGED is 0 and
 * a key outside both sets is byte-identical in the two tables. A sampled
 * non-candidate control discharges the narrowing.
 *
 * What must come back: ticker LOST 0. A gain is welcome; a swap would be the
 * serious finding (a reader's symbol replaced rather than added).
 *
 * Run: node scripts/sec-regen-diff.mjs [oldRef] [newRef]
 */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { loadPlans } from "./lib-schema.mjs";
import { buildRenderer } from "./apppath.mjs";
import { servedLineup } from "./lib-ledger.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OLD = process.argv[2] || "3dd3ee70~1";
const NEW = process.argv[3] || "3dd3ee70";

const show = (ref, p) => {
  const r = spawnSync("git", ["show", `${ref}:${p}`], { maxBuffer: 1 << 30, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git show ${ref}:${p} failed`);
  return r.stdout;
};
const tmp = mkdtempSync(path.join(os.tmpdir(), "secdiff-"));
const oldPath = path.join(tmp, "old-sec-tickers.js");
const newPath = path.join(tmp, "new-sec-tickers.js");
const oldTxt = show(OLD, "sec-tickers.js"), newTxt = show(NEW, "sec-tickers.js");
writeFileSync(oldPath, oldTxt);
writeFileSync(newPath, newTxt);

const keysOf = (txt) => {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(txt + "\n;globalThis.__T = SEC_TICKERS;", ctx);
  return ctx.__T;
};
const A = keysOf(oldTxt), B = keysOf(newTxt);
const ka = new Set(Object.keys(A)), kb = new Set(Object.keys(B));
const moved = new Set();
for (const k of ka) if (!kb.has(k) || JSON.stringify(A[k]) !== JSON.stringify(B[k])) moved.add(k);
for (const k of kb) if (!ka.has(k)) moved.add(k);
console.log(`keys ${ka.size} -> ${kb.size}; moved-key set ${moved.size}\n`);

/* one renderer per table, app.js held FIXED so the table is the only variable */
const rOld = buildRenderer({ appjs: path.join(ROOT, "app.js"), secTickers: oldPath });
const rNew = buildRenderer({ appjs: path.join(ROOT, "app.js"), secTickers: newPath });

/* CONTROL: the two renderers must disagree somewhere, or the harness is reading
 * one table twice — the recorded "a before that is silently the after reads as
 * a clean no-difference" trap. Asserted after the walk. */

const d = loadPlans();
const g = d.get;
const idx = JSON.parse(readFileSync(path.join(ROOT, "lineups-index.json"), "utf8")).plans || {};
if (!Object.keys(idx).length) throw new Error("lineups-index .plans is empty — the publish gate would pass everything");

const H = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 64; };
const shardCache = new Map();
const entryOf = (ack) => {
  const sh = String(H(ack)).padStart(2, "0");
  if (!shardCache.has(sh)) {
    try { shardCache.set(sh, JSON.parse(readFileSync(path.join(ROOT, "data", "lineups", `${sh}.json`), "utf8"))); }
    catch { shardCache.set(sh, {}); }
  }
  return shardCache.get(sh)[ack] || null;
};

let cand = 0, ctrl = 0, lost = 0, gained = 0, swapped = 0, starMoved = 0, feeMoved = 0, ctrlDiff = 0;
/* the gain priced in READERS as well as rows, plan-deduplicated — the recorded
 * 8x error is summing a plan's participants once per ROW */
const gainPlans = new Map(); let gainDollars = 0;
const losses = [], swaps = [], gains = [];
let plansSeen = 0;
for (const row of d.rows) {
  const plan = d.wrap ? d.wrap(row) : null;
  const p = plan || { ack: g(row, "ack"), mtiaAck: g(row, "mtiaAck") };
  const sv = servedLineup(p, idx);
  if (!sv.ack) continue;
  const e = entryOf(sv.ack);
  if (!e || !e.confident || !Array.isArray(e.funds)) continue;
  plansSeen++;
  const total = e.funds.reduce((a, f) => a + (+f.value || 0), 0);
  for (const f of e.funds) {
    const key = "\u0000" + (f.iss || "") + "\u0000" + (f.nameRaw || f.name || "");
    const k2 = (f.iss || "") + "\u0000" + (f.nameRaw || f.name || "");
    const isCand = moved.has(key) || moved.has(k2) || moved.has("\u0000" + (f.nameRaw || f.name || ""));
    /* THE NARROWING MUST GATE THE RENDER, NOT ONLY THE COMPARISON. My first
     * version rendered BOTH copies on every one of ~1.7M rows and only then
     * asked whether the row was a candidate, which is ~50x the necessary work
     * and printed nothing for over a minute of CPU. The recorded rule is to
     * narrow a measurement by a property of the change; narrowing what you
     * COUNT while still computing everything is not narrowing it. */
    if (isCand) cand++; else { ctrl++; if (ctrl % 97 !== 0) continue; }
    const a = rOld.renderRow(p, { ...f }, "menu", total);
    const b = rNew.renderRow(p, { ...f }, "menu", total);
    const ta = a && a.tk ? String(a.tk) : null, tb = b && b.tk ? String(b.tk) : null;
    const differs = ta !== tb || (a && b && (!!a.star !== !!b.star || String(a.er) !== String(b.er)));
    if (!isCand) { if (differs) { ctrlDiff++; } continue; }
    if (ta && !tb) { lost++; if (losses.length < 10) losses.push(`${g(row, "sponsorName")} "${String(f.nameRaw || f.name).slice(0, 44)}" ${ta} -> none`); }
    else if (!ta && tb) {
      gained++; gainDollars += (+f.value || 0);
      gainPlans.set(`${g(row, "ein")}|${g(row, "pn")}`, g(row, "partEOY") || g(row, "participants") || 0);
      if (gains.length < 6) gains.push(`${g(row, "sponsorName")} "${String(f.nameRaw || f.name).slice(0, 44)}" none -> ${tb}`);
    }
    else if (ta && tb && ta !== tb) { swapped++; if (swaps.length < 10) swaps.push(`${g(row, "sponsorName")} "${String(f.nameRaw || f.name).slice(0, 44)}" ${ta} -> ${tb}`); }
    if (a && b && !!a.star !== !!b.star) starMoved++;
    if (a && b && String(a.er) !== String(b.er)) feeMoved++;
  }
}
console.log(`plans walked ${plansSeen}; candidate rows ${cand}; non-candidates sampled ${Math.floor(ctrl / 97)}\n`);
console.log(`ticker LOST    ${lost}`);
console.log(`ticker GAINED  ${gained} rows / ${gainPlans.size} plans / ${[...gainPlans.values()].reduce((a, b) => a + b, 0).toLocaleString()} ppl / $${Math.round(gainDollars).toLocaleString()}`);
console.log(`ticker SWAPPED ${swapped}`);
console.log(`asterisk moved ${starMoved}`);
console.log(`fee moved      ${feeMoved}`);
console.log(`CONTROL non-candidate rows differing: ${ctrlDiff}  (must be 0)`);
if (!(lost + gained + swapped)) throw new Error("CONTROL FAILED: the two renderers agree on every candidate row — the harness is probably reading one table twice");
for (const x of losses) console.log(`  LOST  ${x}`);
for (const x of swaps) console.log(`  SWAP  ${x}`);
for (const x of gains) console.log(`  GAIN  ${x}`);
