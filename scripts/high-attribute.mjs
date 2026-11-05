#!/usr/bin/env node
/* wampo — DID ALL THREE HIGH FINDINGS CROSS BECAUSE OF THE SAME REFRESH?
 *
 * The coverage trail says they crossed in ONE STEP, on 2026-11-02, the same
 * line that moved `plans` 112,652 -> 115,641: `overshoot` 366 -> 764, `fvNote`
 * 54 -> 70, HIGH 4 -> 7. `aggRow` moved the OTHER way, 113 -> 102, which is
 * why "the refresh made everything worse" is not a safe reading and the
 * populations have to be attributed one at a time.
 *
 * `overshoot` is already attributed (513 of 764 are plans whose NEWEST FILING
 * CHANGED; 0 moved denominators). This does the same for the other two in ONE
 * two-store walk rather than three, because the walk is the expensive part:
 *
 *   fvNote      a fair-value NOTE label published as a holding
 *   genericName a bare investment-type name holding >=25% of the shown sum
 *   dominant    one non-fund row carrying >=90% of the sum
 *
 * Each predicate is IMPORTED or SLICED from the shipped source, never retyped,
 * and each population's size is printed on both refs so the trail's own figures
 * are the control: if `fvNote` does not read 54 -> 70 the attribution below is
 * about a different population.
 *
 * NOTE ON `genericName`: the audit computes it over `entriesByAckCov` WITHOUT
 * requiring a plan row, so it counts trust acks too. That is transcribed as-is
 * rather than "improved", because a figure measured under different conditions
 * than the check is a different fact.
 *
 * Run: node scripts/high-attribute.mjs [oldRef] [newRef]
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isGenericTypeName, NOT_FUND_SHAPED } from "./lib-4i.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OLD = process.argv[2] || "0d88ee37";
const NEW = process.argv[3] || "HEAD";

const show = (ref, p) => {
  const r = spawnSync("git", ["show", `${ref}:${p}`], { maxBuffer: 1 << 30, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git show ${ref}:${p} failed`);
  return r.stdout;
};

/* the audit's note vocabulary, sliced so it cannot drift from the check */
const AUD = readFileSync(path.join(ROOT, "scripts", "audit-data.mjs"), "utf8");
const mm = AUD.match(/const FV_NOTE = (\/.*\/i);/);
if (!mm) throw new Error("FV_NOTE has moved in audit-data.mjs");
// eslint-disable-next-line no-eval
const FV_NOTE = eval(mm[1]);
if (!FV_NOTE.test("value hierarchy Investments measur")) throw new Error("the sliced FV_NOTE is not the shipped one");

function plansOf(ref) {
  const d = JSON.parse(show(ref, "plans-all.json"));
  const f = d.fields;
  const need = ["ack", "ein", "pn", "partEOY", "participants", "sponsorName"];
  for (const k of need) if (f.indexOf(k) < 0) throw new Error(`${ref} plans-all has no ${k}`);
  const ix = Object.fromEntries(need.map((k) => [k, f.indexOf(k)]));
  const byAck = new Map(), byPlan = new Map();
  for (const r of d.plans) {
    const rec = { ack: r[ix.ack], plan: `${r[ix.ein]}|${r[ix.pn]}`, ppl: +r[ix.partEOY] || +r[ix.participants] || 0, name: r[ix.sponsorName] || "" };
    if (rec.ack) byAck.set(rec.ack, rec);
    byPlan.set(rec.plan, rec);
  }
  return { byAck, byPlan };
}

function populations(ref, P) {
  const fv = new Map(), gen = new Map(), dom = new Map();
  for (let s = 0; s < 64; s++) {
    const nn = String(s).padStart(2, "0");
    let obj;
    try { obj = JSON.parse(show(ref, `data/lineups/${nn}.json`)); } catch { continue; }
    for (const [ack, e] of Object.entries(obj)) {
      if (!e || !e.confident || !Array.isArray(e.funds) || !e.funds.length) continue;
      const sum = e.funds.reduce((a, x) => a + (+x.value || 0), 0) || 1;
      const top = e.funds.reduce((a, x) => ((+x.value || 0) > (a ? +a.value : -1) ? x : a), null);
      const row = P.byAck.get(ack);
      const rec = { ack, plan: row ? row.plan : null, ppl: row ? row.ppl : 0, name: row ? row.name : "(trust)", rows: e.funds.length, fb: e.fb || (e.meta && e.meta.fb) || null, top: String(top && top.name || "") };

      /* fvNote: the audit requires a plan row before counting */
      if (row && e.funds.some((x) => FV_NOTE.test(String(x.name || "")))) fv.set(ack, rec);

      /* genericName: the audit does NOT require a plan row */
      const gShare = e.funds.filter((x) => isGenericTypeName(String(x.name).trim())).reduce((a, x) => a + (+x.value || 0), 0) / sum;
      if (gShare >= 0.25) gen.set(ack, rec);

      const tn = String(top && top.name || "").trim();
      if (top && (+top.value || 0) / sum >= 0.9 && (NOT_FUND_SHAPED.test(tn) || isGenericTypeName(tn))) dom.set(ack, rec);
    }
  }
  return { fv, gen, dom };
}

const po = plansOf(OLD), pn = plansOf(NEW);
const o = populations(OLD, po), n = populations(NEW, pn);
const trailNew = JSON.parse(show(NEW, "docs/coverage-history.jsonl").trim().split("\n").pop());
const trailOld = JSON.parse(show(OLD, "docs/coverage-history.jsonl").trim().split("\n").pop());

console.log(`OLD ${OLD}  NEW ${NEW}\n`);
console.log(`CONTROL  fvNote: trail ${trailOld.fvNote} -> ${trailNew.fvNote}; here ${o.fv.size} -> ${n.fv.size}  ${o.fv.size === trailOld.fvNote && n.fv.size === trailNew.fvNote ? "MATCH" : "*** MISMATCH — read nothing below ***"}`);
console.log(`         (genericName and dominant are not on the trail; their thresholds are 230 and 60)\n`);

for (const [label, oldSet, newSet] of [["fvNote", o.fv, n.fv], ["genericName", o.gen, n.gen], ["dominant", o.dom, n.dom]]) {
  const oldPlans = new Set([...oldSet.values()].map((x) => x.plan).filter(Boolean));
  const B = {};
  for (const m of newSet.values()) {
    let k;
    if (!m.plan) k = "TRUST_ACK";
    else if (oldPlans.has(m.plan)) k = "SAME";
    else if (!po.byPlan.get(m.plan)) k = "NEW_PLAN";
    else if (po.byPlan.get(m.plan).ack !== m.ack) k = "NEW_ACK";
    else k = "NEW_LINEUP";
    (B[k] = B[k] || []).push(m);
  }
  const parts = Object.entries(B).sort((a, b) => b[1].length - a[1].length)
    .map(([k, a]) => `${k} ${a.length} (${a.reduce((s, x) => s + x.ppl, 0).toLocaleString()}p)`);
  const tot = Object.values(B).reduce((s, a) => s + a.length, 0);
  if (tot !== newSet.size) throw new Error(`${label}: buckets ${tot} != ${newSet.size}`);
  const gone = [...oldSet.values()].filter((x) => x.plan && !new Set([...newSet.values()].map((y) => y.plan)).has(x.plan)).length;
  console.log(`${label.padEnd(12)} ${oldSet.size} -> ${newSet.size}   ${parts.join("  ")}   [left: ${gone}]`);
  const na = (B.NEW_ACK || []).concat(B.NEW_PLAN || []).sort((a, b) => b.ppl - a.ppl).slice(0, 5);
  for (const m of na) console.log(`    ${String(m.ppl).padStart(7)}p  ${m.rows} rows  fb=${m.fb || "-"}  ${m.name.slice(0, 28)}  "${m.top.slice(0, 38)}"`);
}
