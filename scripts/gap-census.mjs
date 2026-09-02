#!/usr/bin/env node
/* wampo — the full-form gap census.
 *
 * Owner directive 2026-09-02: every full form gets listed and described, and
 * no item rests as "unknown". This is the top of that work — the whole
 * full-form universe bucketed by WHICH field is missing and WHY, so effort
 * goes where the most people are affected rather than where the last
 * interesting filing happened to be.
 *
 * Three deliberate choices:
 *
 *  - Full-form filers only. A 5500-SF filer files no audited attachment, so a
 *    missing lineup is the law, not a gap. Counting them would inflate every
 *    bucket with plans that can never be filled.
 *  - Master-trust-held plans are reported SEPARATELY and excluded from the
 *    actionable buckets. Their data lives in the trust's filing; nothing in
 *    the plan's own document can close the gap.
 *  - Sized in PARTICIPANTS as well as dollars. Dollars rank the sponsors;
 *    participants rank the people who open the page and find a blank. They
 *    give different orders, and the second is the one that matters.
 *
 * Usage: node scripts/gap-census.mjs [--top N]
 */
import { loadPlans, loadStatus } from "./lib-schema.mjs";

const TOP = (() => { const i = process.argv.indexOf("--top"); return i > 0 ? +process.argv[i + 1] : 12; })();

const P = loadPlans();
const S = loadStatus();

const B = (v) => (v >= 1e12 ? `$${(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`);
const N = (v) => v.toLocaleString();

const bucket = {};
const add = (key, r, assets, parts) => {
  const b = (bucket[key] = bucket[key] || { n: 0, assets: 0, parts: 0, ex: [] });
  b.n++; b.assets += assets; b.parts += parts;
  if (b.ex.length < 400) b.ex.push({ r, assets, parts });
};

let fullForm = 0, trustHeld = 0;
for (const r of P.rows) {
  if (P.get(r, "sf")) continue;                       // short-form: no attachment is filed, by law
  fullForm++;
  const assets = +P.get(r, "assetsEOY") || 0;
  const parts = +P.get(r, "partEOY") || +P.get(r, "participants") || 0;
  const ack = P.get(r, "ack");
  const s = S.at(ack);
  const mtia = P.get(r, "mtiaAck");

  if (mtia) { trustHeld++; add("Z. master-trust held (excluded — gap lives in the trust filing)", r, assets, parts); continue; }

  /* 1. the fund lineup, split by the CAUSE the pipeline recorded */
  if (!s) add("A1. lineup — no status entry at all (never attempted)", r, assets, parts);
  else if (!s.c) {
    const e = s.e || "";
    if (e === "no-section") add("A2. lineup — no readable 4i section in the public PDF", r, assets, parts);
    else if (e === "download") add("A3. lineup — public copy withdrawn from the bucket (403)", r, assets, parts);
    else if (s.tp) add("A4. lineup — schedule is a bare 'interest in master trust' line, no trust linked", r, assets, parts);
    else if (s.s) add("A5. lineup — schedule FOUND but holdings do not reconcile to plan assets", r, assets, parts);
    else add("A6. lineup — section not found, no cause recorded  <-- UNDIAGNOSED", r, assets, parts);
  }

  /* 2. plan features: match, vesting, Roth. Read from the audit NOTES, a
   *    different extraction path from the 4i schedule — a plan can have a
   *    perfect lineup and no features, which is exactly what 14 of the 30
   *    review-list filings turned out to be. */
  if (!s || !s.f) {
    if (s && s.c) add("B1. features — MISSING although the lineup parsed fine (notes are readable)", r, assets, parts);
    else add("B2. features — missing, and the lineup is missing too", r, assets, parts);
  }

  /* 3. recordkeeper comes from Schedule C, independent of both */
  if (!P.get(r, "recordkeeper")) add("C1. recordkeeper — no Schedule C row identifies one", r, assets, parts);
}

console.log(`\nFULL-FORM UNIVERSE: ${N(fullForm)} plans   (${N(trustHeld)} master-trust held, reported separately)\n`);
const keys = Object.keys(bucket).sort();
console.log("  plans      participants        assets   bucket");
for (const k of keys) {
  const b = bucket[k];
  console.log(`  ${String(N(b.n)).padStart(7)}  ${String(N(b.parts)).padStart(14)}  ${B(b.assets).padStart(10)}   ${k}`);
}

for (const k of keys) {
  if (k.startsWith("Z.")) continue;
  const b = bucket[k];
  if (!b.n) continue;
  console.log(`\n--- ${k} — largest by PARTICIPANTS ---`);
  b.ex.sort((x, y) => y.parts - x.parts);
  for (const x of b.ex.slice(0, TOP)) {
    console.log(`   ${String(N(x.parts)).padStart(9)} participants  ${B(x.assets).padStart(8)}  ${String(P.get(x.r, "sponsorName") || "").trim().slice(0, 46)}`);
  }
}
