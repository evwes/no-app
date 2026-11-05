#!/usr/bin/env node
/* wampo — IS THE OVERSHOOT ONE SPURIOUS ROW PER MENU, AND WHAT IS IT NAMED?
 *
 * The differential established WHICH menus joined the set (513 of 764 are plans
 * whose newest filing changed in the 2026-11-02 refresh). It says nothing about
 * WHY each one sums to more than the plan.
 *
 * THE WITNESS IS INTERNAL AND NEEDS NO REGISTRY: the plan's own Schedule H
 * total. Drop the single largest row and ask whether the ratio moves TOWARD
 * 1.0 and lands near it. That is the recorded direction test from the
 * double-render work, and it is kept rather than a BAND test, because a band
 * test admits a menu already inside the band that the drop moves AWAY from 1.0
 * -- "a band test is not a direction test".
 *
 * AND THE NAME IS THE OTHER HALF. The audit's `FV_NOTE` matches the spelled-out
 * fair-value phrasings and NONE of `At fair value`, `at NAV`, `measured at
 * NAV`, which are what the three largest new members are named -- so the
 * classes are counted here with the shipped predicates asked ALONGSIDE a
 * widened note vocabulary, to see whether the overshoot rise is the recorded
 * note class arriving in an abbreviated spelling rather than a new defect.
 *
 * Every predicate is SLICED from the shipped source rather than retyped: a
 * harness that reproduces a shipped construction from memory measures the
 * memory.
 *
 * Run: node scripts/overshoot-attribute.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPlans } from "./lib-schema.mjs";
import { isGenericTypeName } from "./lib-4i.mjs";
import { hasNoFundIdentity, isNamelessFundRow, isScheduleHCaption, cleanFiledName } from "./lib-disclose.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* the audit's own note vocabulary, READ from the source so this cannot drift
 * away from the check it is being compared against */
const AUD = readFileSync(path.join(ROOT, "scripts", "audit-data.mjs"), "utf8");
const m = AUD.match(/const FV_NOTE = (\/.*\/i);/);
if (!m) throw new Error("could not slice FV_NOTE out of audit-data.mjs — it has moved");
// eslint-disable-next-line no-eval
const FV_NOTE = eval(m[1]);
/* CONTROL: the slice must be the shipped regex, asserted on a string the check's
 * own finding names, not on one I invented */
if (!FV_NOTE.test("value hierarchy Investments measur")) throw new Error("the sliced FV_NOTE does not match the audit's own reported example — the slice is wrong");
if (FV_NOTE.test("At fair value")) throw new Error("the sliced FV_NOTE DOES match 'At fair value' — then the premise of this script is wrong and the widening is already shipped");

/* the WIDENED vocabulary: the abbreviations the shipped one cannot reach. NAV is
 * required as a whole token so `navellier` and the like cannot match. */
const FV_WIDE = /\bat fair value\b|\bfair value\b|\bnav\b|\bnet asset value\b|\bhierarchy\b|\blevel [123]\b|\bunfunded commitments?\b/i;

const d = loadPlans();
const g = d.get;
const byAck = new Map();
for (const r of d.rows) { const a = g(r, "ack"); if (a) byAck.set(a, r); }

const members = [];
for (let s = 0; s < 64; s++) {
  const nn = String(s).padStart(2, "0");
  let obj;
  try { obj = JSON.parse(readFileSync(path.join(ROOT, "data", "lineups", `${nn}.json`), "utf8")); } catch { continue; }
  for (const [ack, e] of Object.entries(obj)) {
    if (!e || !e.confident || !Array.isArray(e.funds) || !e.funds.length) continue;
    const row = byAck.get(ack);
    if (!row) continue;
    const schH = g(row, "assetsEOY") || 0;
    if (schH < 1e6) continue;
    const sum = e.funds.reduce((a, x) => a + (+x.value || 0), 0);
    if (sum < schH * 1.15) continue;
    members.push({ ack, e, row, schH, sum, ppl: g(row, "partEOY") || g(row, "participants") || 0, name: g(row, "sponsorName") || "" });
  }
}
console.log(`overshoot population: ${members.length} menus / ${members.reduce((a, x) => a + x.ppl, 0).toLocaleString()} ppl\n`);

/* ---------- is it ONE row? ---------- */
const B = { ONE_ROW: [], SEVERAL: [], NO_SINGLE: [] };
for (const mm of members) {
  const top = mm.e.funds.reduce((a, x) => ((+x.value || 0) > (a ? +a.value : -1) ? x : a), null);
  const after = (mm.sum - (+top.value || 0)) / mm.schH;
  const before = mm.sum / mm.schH;
  mm.top = top; mm.before = before; mm.after = after;
  /* DIRECTION, not band: |after-1| must be smaller than |before-1| */
  const toward = Math.abs(after - 1) < Math.abs(before - 1);
  if (toward && after >= 0.90 && after < 1.15) B.ONE_ROW.push(mm);
  else if (toward) B.SEVERAL.push(mm);
  else B.NO_SINGLE.push(mm);
}
for (const k of ["ONE_ROW", "SEVERAL", "NO_SINGLE"]) {
  const a = B[k];
  console.log(`${k.padEnd(10)} ${String(a.length).padStart(4)} menus  ${a.reduce((s, x) => s + x.ppl, 0).toLocaleString().padStart(11)} ppl`);
}
if (B.ONE_ROW.length + B.SEVERAL.length + B.NO_SINGLE.length !== members.length) throw new Error("buckets do not sum");

/* ---------- what is the largest row NAMED? ---------- */
console.log("\n--- the largest row, classified (ONE_ROW bucket: the menus a single row explains) ---");
const C = {};
const bump = (k, mm) => { (C[k] = C[k] || []).push(mm); };
for (const mm of B.ONE_ROW) {
  const raw = String(mm.top.name || "");
  const cl = cleanFiledName(raw);
  const f = { name: cl, nameRaw: raw, type: mm.top.type || "", iss: mm.top.iss || "" };
  const gen = (nm) => !!(isGenericTypeName(nm) || hasNoFundIdentity(nm) || isScheduleHCaption(nm));
  if (FV_NOTE.test(raw)) bump("fv-note (SHIPPED check reaches it)", mm);
  else if (FV_WIDE.test(raw)) bump("fv-note ABBREVIATED (shipped check is blind)", mm);
  else if (isNamelessFundRow(f, cl, gen)) bump("already qualified: names no fund", mm);
  else if (gen(cl)) bump("generic/caption name", mm);
  else bump("NAMES A FUND — a real row, double-counted or mis-valued", mm);
}
const keys = Object.keys(C).sort((a, b) => C[b].length - C[a].length);
for (const k of keys) {
  const a = C[k];
  console.log(`  ${String(a.length).padStart(4)} menus  ${a.reduce((s, x) => s + x.ppl, 0).toLocaleString().padStart(11)} ppl   ${k}`);
}

for (const k of keys) {
  const a = C[k].slice().sort((x, y) => y.ppl - x.ppl).slice(0, 8);
  console.log(`\n--- ${k} ---`);
  for (const mm of a) {
    console.log(`  ${String(mm.ppl).padStart(7)}p  ${mm.before.toFixed(2)}x -> ${mm.after.toFixed(2)}x  ${mm.e.funds.length} rows  ${(100 * (+mm.top.value || 0) / mm.sum).toFixed(0)}% of menu  ${mm.name.slice(0, 26)}  "${String(mm.top.name).slice(0, 40)}" [${String(mm.top.type || "-").slice(0, 18)}]`);
  }
}

/* how much would the WIDENED vocabulary add to the shipped fair-value check,
 * over the whole store rather than over this bucket -- the shipped check's own
 * population, so the two numbers are comparable */
let shipped = 0, wide = 0, wideOnly = 0, wideOnlyPpl = 0;
for (let s = 0; s < 64; s++) {
  const nn = String(s).padStart(2, "0");
  let obj;
  try { obj = JSON.parse(readFileSync(path.join(ROOT, "data", "lineups", `${nn}.json`), "utf8")); } catch { continue; }
  for (const [ack, e] of Object.entries(obj)) {
    if (!e || !e.confident || !Array.isArray(e.funds) || !e.funds.length) continue;
    const row = byAck.get(ack);
    if (!row) continue;
    const sh = e.funds.some((x) => FV_NOTE.test(String(x.name || "")));
    const wd = e.funds.some((x) => FV_WIDE.test(String(x.name || "")));
    if (sh) shipped++;
    if (wd) wide++;
    if (wd && !sh) { wideOnly++; wideOnlyPpl += g(row, "partEOY") || g(row, "participants") || 0; }
  }
}
console.log(`\nfair-value note, confident menus:  shipped vocabulary ${shipped}   widened ${wide}   WIDENED-ONLY ${wideOnly} menus / ${wideOnlyPpl.toLocaleString()} ppl`);
