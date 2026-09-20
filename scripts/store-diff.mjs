/* wampo — diff the WHOLE lineup store against a git ref, and rank what moved
 * by the money and the people behind it.
 *
 * WHY THIS EXISTS, and it is the most expensive lesson of 2026-09-20.
 *
 * `diff-lineups.mjs` re-parses a ~1,000-filing corpus and reports what a code
 * change does to it. That corpus is sampled BY ASSETS, so it holds what is
 * common — and on one day it returned "0 gained, 0 lost, 0 fabricated" three
 * separate times over three real fabrications, because none of the plans
 * involved was in it:
 *
 *   - Apple Inc. (145,428 ppl): v172 deleted `BROKERGE ACCOUNT`,
 *     $2,153,504,672, 7% of a $30.8B plan. Row count moved 27 -> 26.
 *   - Trustmark (3,396 ppl): a draft of v175 would have merged three real
 *     Schwab rows into one $13,916,207 holding that does not exist.
 *   - Thrivent Financial for Lutherans (9,282 ppl): v175 published one row
 *     named `Thrivent` at $1,700,835,259 = 99.2% of the menu, turning a plan
 *     that correctly published NOTHING into a $1.7B phantom.
 *
 * All three were found by diffing the store that actually shipped against the
 * store before it and reading the movers by name. That is a different question
 * from the corpus diff's — not "what does this code do to these filings" but
 * "what changed for real readers" — and it is the one that catches a defect in
 * a plan nobody thought to sample.
 *
 * USE IT AFTER EVERY RUN, BEFORE MIRRORING:
 *
 *   node scripts/store-diff.mjs <ref>            # e.g. the previous data commit
 *   node scripts/store-diff.mjs <ref> --min 1e6  # only movers above $1M
 *
 * It reports, ranked by value: rows ADDED, rows REMOVED, plans that gained or
 * lost confidence, and -- the shape that hides best -- plans whose row count
 * barely moved while a large value did.
 */
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPlans, loadStatus } from "./lib-schema.mjs";

const ref = process.argv[2];
if (!ref) {
  console.error("usage: node scripts/store-diff.mjs <git-ref> [--min <dollars>] [--top <n>]");
  process.exit(2);
}
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : d;
};
const MIN = arg("--min", 0);
const TOP = arg("--top", 20);

const P = loadPlans();
const S = loadStatus();
const meta = new Map();
for (const r of P.rows) {
  const a = P.get(r, "ack");
  if (a) meta.set(a, { ppl: P.get(r, "participants") || 0, sp: P.get(r, "sponsorName"),
                       assets: P.get(r, "assetsEOY") || 0 });
}

/* pull the old shards out of git once, into a scratch dir */
const old = mkdtempSync(join(tmpdir(), "wampo-store-"));
let pulled = 0;
for (let i = 0; i < 64; i++) {
  const n = String(i).padStart(2, "0");
  try {
    writeFileSync(`${old}/${n}.json`,
      execFileSync("git", ["show", `${ref}:data/lineups/${n}.json`],
                   { encoding: "utf8", maxBuffer: 1 << 28 }));
    pulled++;
  } catch { /* shard absent at that ref */ }
}
if (!pulled) { console.error(`no lineup shards found at ${ref}`); process.exit(1); }

const added = [], removed = [], confGain = [], confLoss = [], quiet = [];
for (let i = 0; i < 64; i++) {
  const n = String(i).padStart(2, "0");
  let o, c;
  try { o = JSON.parse(readFileSync(`${old}/${n}.json`, "utf8")); } catch { continue; }
  try { c = JSON.parse(readFileSync(`data/lineups/${n}.json`, "utf8")); } catch { c = {}; }
  const acks = new Set([...Object.keys(o), ...Object.keys(c)]);
  for (const a of acks) {
    const oe = o[a], ce = c[a];
    const m = meta.get(a) || { ppl: 0, sp: "?", assets: 0 };
    const oc = !!(oe && oe.confident), cc = !!(ce && ce.confident);
    if (oc && !cc) confLoss.push({ a, ...m, n: oe.funds ? oe.funds.length : 0 });
    if (!oc && cc) confGain.push({ a, ...m, n: ce.funds ? ce.funds.length : 0 });
    const of_ = oe && Array.isArray(oe.funds) ? oe.funds : [];
    const cf = ce && Array.isArray(ce.funds) ? ce.funds : [];
    if (!of_.length && !cf.length) continue;
    const on = new Map(of_.map((x) => [String(x.name), x.value || 0]));
    const cn = new Map(cf.map((x) => [String(x.name), x.value || 0]));
    let gain = 0, loss = 0;
    for (const [k, v] of cn) if (!on.has(k)) { gain += v; if (v >= MIN) added.push({ a, ...m, name: k, v }); }
    for (const [k, v] of on) if (!cn.has(k)) { loss += v; if (v >= MIN) removed.push({ a, ...m, name: k, v }); }
    /* THE SHAPE THAT HIDES BEST: row count barely moves, a lot of money does.
     * Apple was 27 -> 26 carrying $2.15B; a row-count view calls that noise. */
    const dn = Math.abs(cf.length - of_.length);
    const moved = Math.max(gain, loss);
    if (oc && cc && dn <= 2 && moved >= Math.max(MIN, 1e6)) {
      const osum = of_.reduce((s, x) => s + (x.value || 0), 0);
      const csum = cf.reduce((s, x) => s + (x.value || 0), 0);
      quiet.push({ a, ...m, dn, moved, or: m.assets ? osum / m.assets : 0,
                   cr: m.assets ? csum / m.assets : 0,
                   rows: `${of_.length}->${cf.length}` });
    }
  }
}

const ppl = (x) => { const s = new Set(); let t = 0;
  for (const r of x) if (!s.has(r.a)) { s.add(r.a); t += r.ppl; } return t; };
const plans = (x) => new Set(x.map((r) => r.a)).size;
const money = (v) => "$" + Math.round(v).toLocaleString();

const show = (label, list, fmt) => {
  console.log(`\n=== ${label}: ${list.length} rows / ${plans(list)} plans / ${ppl(list).toLocaleString()} ppl ===`);
  for (const r of list.sort((a, b) => (b.v ?? b.moved) - (a.v ?? a.moved)).slice(0, TOP))
    console.log("   " + fmt(r));
};
console.log(`store diff: ${ref} -> working store   (min ${money(MIN)})`);
show("ROWS ADDED", added, (r) => `${String(r.ppl).padStart(7)}p ${money(r.v).padStart(16)}  ${String(r.sp).slice(0, 26).padEnd(26)} ${JSON.stringify(r.name.slice(0, 46))}`);
show("ROWS REMOVED", removed, (r) => `${String(r.ppl).padStart(7)}p ${money(r.v).padStart(16)}  ${String(r.sp).slice(0, 26).padEnd(26)} ${JSON.stringify(r.name.slice(0, 46))}`);
console.log(`\n=== CONFIDENCE GAINED: ${confGain.length} plans / ${ppl(confGain).toLocaleString()} ppl ===`);
for (const r of confGain.sort((a, b) => b.ppl - a.ppl).slice(0, TOP))
  console.log(`   ${String(r.ppl).padStart(7)}p  ${String(r.sp).slice(0, 34).padEnd(34)} ${r.n} rows  ${r.a}`);
console.log(`\n=== CONFIDENCE LOST: ${confLoss.length} plans / ${ppl(confLoss).toLocaleString()} ppl ===`);
for (const r of confLoss.sort((a, b) => b.ppl - a.ppl).slice(0, TOP))
  console.log(`   ${String(r.ppl).padStart(7)}p  ${String(r.sp).slice(0, 34).padEnd(34)} ${r.n} rows  ${r.a}`);
console.log(`\n=== QUIET MOVERS — row count ~unchanged, large value moved: ${quiet.length} plans / ${ppl(quiet).toLocaleString()} ppl ===`);
console.log(`    (this is the Apple shape: 27 -> 26 rows carrying $2,153,504,672)`);
for (const r of quiet.sort((a, b) => b.moved - a.moved).slice(0, TOP))
  console.log(`   ${String(r.ppl).padStart(7)}p ${money(r.moved).padStart(16)}  ratio ${r.or.toFixed(3)} -> ${r.cr.toFixed(3)}  ${r.rows.padEnd(9)} ${String(r.sp).slice(0, 26)}`);
