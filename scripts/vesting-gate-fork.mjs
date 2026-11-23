#!/usr/bin/env node
/* THE ONE ADDRESSABLE VESTING BUCKET, SPLIT BY WHICH GATE REFUSED.
 *
 * `vesting-absent-census.mjs` measured the whole absent bucket and found the
 * parser-addressable part is a SINGLE sub-bucket: the sentence selection was
 * non-empty on every one of them and every arm refused. That is 4,535 plans /
 * 10.37M readers at the time of writing — derive it, never read it here.
 *
 * This asks which refusal. The immediate-vesting loop opens with
 *   if (!strictGate && !employerMoney && !universal) continue;
 * and that `continue` precedes every quote fallback in the loop, so it is the
 * only refusal in the chain that leaves a filing with NOTHING — no label and
 * no quote. Every other refusal in that loop stores the sentence. So:
 *
 *   G-noscope   no selected sentence passes the employer-scope gate. The gate
 *               is the whole cause and the repair, if there is one, is in it.
 *   G-passed    a sentence DOES pass the gate and the filing still stores
 *               nothing, so a later refusal (forfeit / off-topic / a label
 *               block with blockedButQuotable false) is the cause.
 *
 * Each is split again by what the sentences SAY, under the discipline this
 * record demands for a semantic class: require the PRESENCE of the publishable
 * case, never the absence of the unpublishable one.
 *
 * It does NOT call extractPlanFeatures — the census already established that
 * the instrument reproduces production on this bucket to 1 plan / 157 readers,
 * and skipping it is the difference between 25 minutes and three.
 *
 * Usage:
 *   node scripts/vesting-gate-fork.mjs [--dump FILE] [--top N] [--list BUCKET]
 */
import { writeFileSync } from "node:fs";
import { buildLedger } from "./lib-ledger.mjs";
import { planNoteArm, stripFormAndNameNoise, FIELD_WORD } from "./lib-plannote.mjs";
import { read } from "./lib-filingtext.mjs";
import { vestingSelection, scopeGate } from "./lib-vestslice.mjs";

const argv = process.argv.slice(2);
const TOP = (() => { const i = argv.indexOf("--top"); return i > 0 ? +argv[i + 1] : 12; })();
const LIST = (() => { const i = argv.indexOf("--list"); return i > 0 ? argv[i + 1] : null; })();
const DUMP = (() => { const i = argv.indexOf("--dump"); return i > 0 ? argv[i + 1] : null; })();

const L = buildLedger({ withStatus: false });
const rows = [];
for (const p of L.plans) {
  const c = p.cells.vesting;
  if (c.state !== "absent" || c.why.startsWith("no features")) continue;
  rows.push({ ein: p.ein, pn: p.pn, name: p.sponsorName, ppl: p.ppl, ack: p.ack });
}

/* WHAT WOULD BE PUBLISHABLE. Presence tests, each naming a shape a reader can
 * act on. A LADDER or a CLIFF is a schedule; an unqualified IMMEDIATE is a
 * complete answer. Nothing here is a screen for "not about vesting". */
const LADDER = /\d{1,3}\s?%[^.]{0,60}(?:year|anniversar)|(?:year|anniversar)[^.]{0,60}\d{1,3}\s?%|\bless than \d\b[^.]{0,40}\d{1,3}\s?%/i;
const CLIFFISH = /(?:100\s?%|one hundred percent|fully)[^.]{0,60}?\bvest\w*[^.]{0,60}?(?:after|upon|completion of|complet\w+)[^.]{0,40}?\b(?:\d{1,2}|one|two|three|four|five|six)\b[^.]{0,20}?\b(?:year|month)/i;
const IMMEDIATEISH = /\b(?:immediate(?:ly)?|at all times|always)\b[^.]{0,60}?\bvest|\bvest\w*[^.]{0,40}?\b(?:immediate(?:ly)?|at all times)\b/i;
/* EMPLOYEE money, for reporting only — never used to withhold anything here */
const EMPLOYEE_ONLY = /\b(?:their own|employee|participant'?s?|voluntary|elective|salary[- ]defer|pre-?tax|roth|after-?tax|deferral)\b[^.]{0,60}\bcontribution/i;

const tally = new Map();
const add = (k, r, extra) => {
  let v = tally.get(k);
  if (!v) tally.set(k, (v = { plans: 0, ppl: 0, ex: [] }));
  v.plans++; v.ppl += r.ppl; v.ex.push({ ...r, ...extra });
};

const dump = [];
let judged = 0, judgedPpl = 0;
for (const r of rows) {
  const raw = read(r.ack);
  if (!raw) continue;
  if (!planNoteArm(raw)) continue;
  const flat = stripFormAndNameNoise(raw.replace(/\s+/g, " "));
  if (!FIELD_WORD.vesting.test(flat)) continue;
  const sel = vestingSelection(raw);
  if (!sel.vestSentences.length) continue;
  judged++; judgedPpl += r.ppl;

  const gates = sel.vestSentences.map((s) => scopeGate(s, sel.t, r.name || ""));
  const passIdx = gates.findIndex((g) => g.passes);
  const schedule = sel.vestSentences.filter((s) => LADDER.test(s) || CLIFFISH.test(s));
  const immediate = sel.vestSentences.filter((s) => IMMEDIATEISH.test(s));
  const shape = schedule.length ? "a SCHEDULE is in the selection"
    : immediate.length ? "an IMMEDIATE claim is in the selection"
      : "no schedule and no immediate claim in the selection";
  const head = passIdx >= 0 ? "G-passed" : "G-noscope";
  const best = (schedule[0] || immediate[0] || sel.vestSentences[0] || "").replace(/\s+/g, " ");
  add(`${head} — ${shape}`, r, { n: sel.vestSentences.length, best,
    empOnly: sel.vestSentences.every((s) => EMPLOYEE_ONLY.test(s)) });
  if (DUMP) dump.push({ ...r, head, shape, n: sel.vestSentences.length,
    sentences: sel.vestSentences.map((s) => s.replace(/\s+/g, " ")) });
}

const sum = (a) => a.reduce((s, x) => s + x.ppl, 0);
console.log(`C-read population reconstructed: ${judged} plans / ${judgedPpl.toLocaleString()} readers`);
console.log(`  (of ${rows.length} plans / ${sum(rows).toLocaleString()} in the whole absent bucket)\n`);
for (const [k, v] of [...tally].sort((a, b) => b[1].ppl - a[1].ppl)) {
  const eo = v.ex.filter((e) => e.empOnly);
  console.log(`${String(v.ppl).padStart(11)} ppl  ${String(v.plans).padStart(5)} pl  ${k}`);
  console.log(`              (every selected sentence is EMPLOYEE money on ${eo.length} pl / ${sum(eo).toLocaleString()} ppl)`);
  for (const e of v.ex.sort((a, b) => b.ppl - a.ppl).slice(0, TOP))
    console.log(`      ${String(e.ppl).padStart(8)} ${String(e.name).slice(0, 34).padEnd(35)} ${e.ack}`);
}
if (LIST) {
  const keys = [...tally.keys()].filter((k) => k.startsWith(LIST));
  if (!keys.length) { console.error(`\nno bucket starting ${LIST}`); process.exit(2); }
  for (const key of keys) {
    console.log(`\n--- ${key} — largest ${TOP} with their best sentence ---`);
    for (const e of tally.get(key).ex.sort((a, b) => b.ppl - a.ppl).slice(0, TOP))
      console.log(`${String(e.ppl).padStart(8)} ${String(e.name).slice(0, 38).padEnd(39)} ${e.ack}\n         (${e.n} sel) ${JSON.stringify(e.best.slice(0, 260))}`);
  }
}
if (DUMP) { writeFileSync(DUMP, JSON.stringify(dump)); console.log(`\ndumped ${dump.length} members to ${DUMP}`); }
console.log("\nThese figures are DERIVED. Re-run; never copy them forward.");
