#!/usr/bin/env node
/* wampo — WHY DID `overshoot` GO 366 -> 764 WITH `PARSER_VERSION` UNMOVED?
 *
 * The coverage trail answers half of it on its own: the same run that doubled
 * the count moved `plans` 112,652 -> 115,641 and `fullForm` 68,538 -> 71,484,
 * so a DOL REFRESH landed. But +2,946 full-form plans is 4.3% more plans
 * against 109% more overshoot menus, which is a 25x rate — so "the universe
 * grew" cannot be the whole answer and must not be accepted as one.
 *
 * SO THIS IS A DIFFERENTIAL, not a screen: the overshoot population is
 * reproduced on BOTH stores from each ref's OWN data, with the audit's exact
 * conditions, and every member of the new set is attributed to one of
 *
 *   SAME          already overshooting before the refresh
 *   NEW_PLAN      the plan is not in the old universe at all
 *   NEW_ACK       the plan existed; its newest filing changed
 *   DENOM_MOVED   same ack, the plan's own assetsEOY changed under it
 *   NEW_LINEUP    same ack, same assets, the lineup became confident
 *
 * The buckets are mutually exclusive and are checked to sum to the total, so a
 * member that fits none is a refutation rather than a rounding error.
 *
 * `fb` is printed per bucket because it is the recorded mechanism most likely
 * to produce this shape: a PRIOR-YEAR schedule supplying the lineup while the
 * ratio is judged against CURRENT-year assets. If the refresh made many plans
 * fall back a year, a menu that was honest against last year's assets
 * overshoots this year's — and that is OUR label, not the filing's.
 *
 * Run: node scripts/overshoot-diff.mjs [oldRef] [newRef]
 */
import { execFileSync, spawnSync } from "node:child_process";

const OLD = process.argv[2] || "0d88ee37";
const NEW = process.argv[3] || "HEAD";
const SHARDS = 64;

const show = (ref, path) => {
  const r = spawnSync("git", ["show", `${ref}:${path}`], { maxBuffer: 1 << 30, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git show ${ref}:${path} failed: ${String(r.stderr).slice(0, 200)}`);
  return r.stdout;
};

/* plans-all is a compact array-of-arrays with a `fields` header — the same
 * shape lib-schema wraps. Read it through the header rather than by position,
 * because a guessed index returns a plausible number where a guessed NAME
 * throws. */
function loadPlans(ref) {
  const d = JSON.parse(show(ref, "plans-all.json"));
  const f = d.fields;
  const idx = {};
  for (const k of ["ack", "ein", "pn", "assetsEOY", "partEOY", "participants", "sponsorName", "mtiaAck"]) {
    const i = f.indexOf(k);
    if (i < 0) throw new Error(`plans-all at ${ref} has no field ${k} — fields are ${f.join(",")}`);
    idx[k] = i;
  }
  const byAck = new Map();
  const byPlan = new Map();
  for (const r of d.plans) {
    const ack = r[idx.ack];
    const rec = {
      ack,
      plan: `${r[idx.ein]}|${r[idx.pn]}`,
      eoy: +r[idx.assetsEOY] || 0,
      ppl: +r[idx.partEOY] || +r[idx.participants] || 0,
      name: r[idx.sponsorName] || "",
    };
    if (ack) byAck.set(ack, rec);
    byPlan.set(rec.plan, rec);
  }
  return { byAck, byPlan, n: d.plans.length };
}

/* the audit's own conditions, transcribed: confident, a funds array, an ack
 * that is a PLAN row, assets >= $1M, sum >= 1.15x. Nothing added. */
function overshootSet(ref, byAck) {
  const out = new Map();
  let confidentWithRow = 0;
  for (let s = 0; s < SHARDS; s++) {
    const nn = String(s).padStart(2, "0");
    let txt;
    try { txt = show(ref, `data/lineups/${nn}.json`); } catch { continue; }
    const obj = JSON.parse(txt);
    for (const [ack, e] of Object.entries(obj)) {
      if (!e || !e.confident || !Array.isArray(e.funds) || !e.funds.length) continue;
      const row = byAck.get(ack);
      if (!row) continue;
      confidentWithRow++;
      if (row.eoy < 1e6) continue;
      const sum = e.funds.reduce((a, x) => a + (+x.value || 0), 0);
      if (sum < row.eoy * 1.15) continue;
      out.set(ack, { ack, plan: row.plan, ppl: row.ppl, name: row.name, eoy: row.eoy, sum, ratio: sum / row.eoy, rows: e.funds.length, fb: e.fb || (e.meta && e.meta.fb) || null });
    }
  }
  return { out, confidentWithRow };
}

console.log(`OLD ${OLD}   NEW ${NEW}\n`);
const po = loadPlans(OLD), pn = loadPlans(NEW);
console.log(`plans: ${po.n} -> ${pn.n}   (+${pn.n - po.n})`);

const o = overshootSet(OLD, po.byAck);
const n = overshootSet(NEW, pn.byAck);
console.log(`confident entries with a plan row: ${o.confidentWithRow} -> ${n.confidentWithRow}`);
console.log(`overshoot >=1.15x: ${o.out.size} -> ${n.out.size}\n`);

/* the trail's own figures are the control that this transcription IS the audit's
 * computation: if these two numbers are not 366 and 764 the attribution below
 * is about a different population and must not be read. */
const trail = JSON.parse(show(NEW, "docs/coverage-history.jsonl").trim().split("\n").pop());
const trailOld = JSON.parse(show(OLD, "docs/coverage-history.jsonl").trim().split("\n").pop());
const ctl = (o.out.size === trailOld.overshoot) && (n.out.size === trail.overshoot);
console.log(`CONTROL  the trail says ${trailOld.overshoot} -> ${trail.overshoot}; this script says ${o.out.size} -> ${n.out.size}  ${ctl ? "MATCH" : "*** MISMATCH — the attribution below is about a different population ***"}\n`);

const oldPlansOver = new Set([...o.out.values()].map((x) => x.plan));
const B = {};
const push = (k, m) => { (B[k] = B[k] || []).push(m); };
for (const m of n.out.values()) {
  if (oldPlansOver.has(m.plan)) { push("SAME", m); continue; }
  const oldPlan = po.byPlan.get(m.plan);
  if (!oldPlan) { push("NEW_PLAN", m); continue; }
  if (oldPlan.ack !== m.ack) { push("NEW_ACK", m); continue; }
  const oldRow = po.byAck.get(m.ack);
  if (oldRow && Math.abs(oldRow.eoy - m.eoy) > 1) { push("DENOM_MOVED", m); continue; }
  push("NEW_LINEUP", m);
}

const order = ["SAME", "NEW_PLAN", "NEW_ACK", "DENOM_MOVED", "NEW_LINEUP"];
let tot = 0;
for (const k of order) {
  const a = B[k] || [];
  tot += a.length;
  const ppl = a.reduce((s, x) => s + x.ppl, 0);
  const fb = a.filter((x) => x.fb).length;
  console.log(`${k.padEnd(12)} ${String(a.length).padStart(4)} menus  ${ppl.toLocaleString().padStart(11)} ppl   fb ${String(fb).padStart(4)}  median ratio ${a.length ? median(a.map((x) => x.ratio)).toFixed(2) : "-"}`);
}
if (tot !== n.out.size) throw new Error(`buckets sum to ${tot}, population is ${n.out.size} — a member fits no bucket`);
console.log(`\nsum ${tot} === population ${n.out.size}  OK`);

/* and the plans that STOPPED overshooting, so the net is not read as the gross */
const newPlansOver = new Set([...n.out.values()].map((x) => x.plan));
const gone = [...o.out.values()].filter((x) => !newPlansOver.has(x.plan));
console.log(`\nleft the set: ${gone.length} menus / ${gone.reduce((s, x) => s + x.ppl, 0).toLocaleString()} ppl`);

for (const k of order) {
  const a = (B[k] || []).slice().sort((x, y) => y.ppl - x.ppl).slice(0, 6);
  if (!a.length) continue;
  console.log(`\n--- ${k}, largest by readers ---`);
  for (const m of a) console.log(`  ${String(m.ppl).padStart(7)}p  ${m.ratio.toFixed(2)}x  ${m.rows} rows  fb=${m.fb || "-"}  ${m.name.slice(0, 40)}  ${m.ack}`);
}

function median(xs) { const a = xs.slice().sort((p, q) => p - q); return a[Math.floor(a.length / 2)]; }
