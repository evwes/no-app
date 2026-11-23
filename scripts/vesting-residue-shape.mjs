#!/usr/bin/env node
/* WHAT IS IN THE POST-v211 VESTING RESIDUE, ASKED OF SENTENCES THAT ARE NOT
 * THE FORM'S OWN PRINTED QUESTIONS.
 *
 * WHY THIS EXISTS RATHER THAN A RE-READING OF `vesting-gate-fork.mjs`. That
 * instrument buckets the residue by SHAPE — "a SCHEDULE is in the selection" —
 * and its `LADDER` test is
 *     \bless than \d\b[^.]{0,40}\d{1,3}\s?%
 * which matches the Form 5500's own printed line 6g(2), *"Number of
 * participants who terminated employment during the plan year with accrued
 * benefits that were less than 100% vested"*, present in EVERY full-form
 * filing. Run against the post-v211 store it therefore reported 5.24M readers
 * in "G-noscope — a SCHEDULE is in the selection" whose best sentence, for all
 * twelve largest members, IS that printed line. `lib-plannote` already strips
 * it (`[form-6g]`) before asking its vocabulary question, and the fork asks the
 * selection instead, so the strip never reached the shape test.
 *
 * This record's own rule: *the form's own printed questions are in the filing
 * text, so a text-level screen must exclude the form before counting — a clean
 * 100% reports on the query.* Met again, from the other side: a clean 60% of a
 * bucket reporting on the query.
 *
 * So: read the fork's `--dump`, drop every FORM sentence, and re-bucket. It
 * takes a dump rather than re-deriving the selection because the selection is
 * the expensive half (25 min over 5,000 filings) and is unchanged by this
 * question.
 *
 * Usage: node scripts/vesting-residue-shape.mjs <dump.json> [--list BUCKET]
 *                                               [--top N]
 */
import { readFileSync } from "node:fs";
import { isFormSentence } from "./lib-formsentence.mjs";

const argv = process.argv.slice(2);
const DUMP = argv.find((a) => !a.startsWith("--"));
if (!DUMP) { console.error("usage: vesting-residue-shape.mjs <dump.json> [--list BUCKET] [--top N]"); process.exit(2); }
const TOP = (() => { const i = argv.indexOf("--top"); return i > 0 ? +argv[i + 1] : 12; })();
const LIST = (() => { const i = argv.indexOf("--list"); return i > 0 ? argv[i + 1] : null; })();


/* THE SHAPE TESTS, carried over VERBATIM from vesting-gate-fork.mjs so the two
 * instruments disagree only about the form strip and nothing else. */
const LADDER = /\d{1,3}\s?%[^.]{0,60}(?:year|anniversar)|(?:year|anniversar)[^.]{0,60}\d{1,3}\s?%|\bless than \d\b[^.]{0,40}\d{1,3}\s?%/i;
const CLIFFISH = /(?:100\s?%|one hundred percent|fully)[^.]{0,60}?\bvest\w*[^.]{0,60}?(?:after|upon|completion of|complet\w+)[^.]{0,40}?\b(?:\d{1,2}|one|two|three|four|five|six)\b[^.]{0,20}?\b(?:year|month)/i;
const IMMEDIATEISH = /\b(?:immediate(?:ly)?|at all times|always)\b[^.]{0,60}?\bvest|\bvest\w*[^.]{0,40}?\b(?:immediate(?:ly)?|at all times)\b/i;
/* FORFEITURE-ACCOUNTING sentences mention vesting and never state a schedule;
 * the shipped loop demotes them in its sort and this record says 3,582 of them
 * once shipped AS the vesting quote. Reported as its own shape rather than
 * folded into "no schedule", because the repair for it is a quote repair. */
const FORFEIT_ONLY = /forfeit/i;

/* CONTROL, above the loop that uses it: the form line must be recognised, and
 * a real schedule sentence must NOT be. A strip that matched everything and a
 * strip that matched nothing would both read as a clean re-bucketing. */
{
  const f = "218246 6g(2) Number of participants who terminated employment during the plan year with accrued benefits that were h less than 100% vested.";
  if (!isFormSentence(f)) throw new Error("control 1: the form 6g(2) line is not recognised as form text");
  if (!LADDER.test(f)) throw new Error("control 2: the fork's LADDER test no longer fires on the form line — this instrument's premise has changed and its headline no longer means what it says");
  const real = "Participants vest in employer contributions at 20% per year of service and are 100% vested after five years.";
  if (isFormSentence(real)) throw new Error("control 3: the form strip eats a real schedule sentence");
  if (!LADDER.test(real)) throw new Error("control 4: LADDER does not fire on a plain ladder");
}

const rows = JSON.parse(readFileSync(DUMP, "utf8"));
const sum = (a) => a.reduce((s, x) => s + x.ppl, 0);
const tally = new Map();
const add = (k, r, extra) => {
  let v = tally.get(k);
  if (!v) tally.set(k, (v = { plans: 0, ppl: 0, ex: [] }));
  v.plans++; v.ppl += r.ppl; v.ex.push({ ...r, ...extra });
};

let formOnlyPl = 0, formOnlyPpl = 0, formSeen = 0;
for (const r of rows) {
  const all = r.sentences || [];
  if (all.some(isFormSentence)) formSeen++;
  const real = all.filter((s) => !isFormSentence(s));
  if (!real.length) {
    formOnlyPl++; formOnlyPpl += r.ppl;
    add("F  every selected sentence is the FORM's own printed text", r, { n: all.length, best: all[0] || "" });
    continue;
  }
  const sched = real.filter((s) => LADDER.test(s) || CLIFFISH.test(s));
  const immed = real.filter((s) => IMMEDIATEISH.test(s));
  const shape = sched.length ? "a SCHEDULE is in the selection"
    : immed.length ? "an IMMEDIATE claim is in the selection"
      : real.every((s) => FORFEIT_ONLY.test(s)) ? "every real sentence is FORFEITURE accounting"
        : "no schedule, no immediate claim, not all forfeiture";
  add(`${r.head} — ${shape}`, r, { n: real.length, nAll: all.length,
    best: (sched[0] || immed[0] || real[0] || "") });
}

console.log(`members in dump: ${rows.length} plans / ${sum(rows).toLocaleString()} readers`);
console.log(`carry at least one FORM sentence: ${formSeen} plans`);
console.log(`carry ONLY form sentences: ${formOnlyPl} plans / ${formOnlyPpl.toLocaleString()} readers\n`);
for (const [k, v] of [...tally].sort((a, b) => b[1].ppl - a[1].ppl)) {
  console.log(`${String(v.ppl).padStart(11)} ppl  ${String(v.plans).padStart(5)} pl  ${k}`);
  for (const e of v.ex.sort((a, b) => b.ppl - a.ppl).slice(0, Math.min(TOP, 6)))
    console.log(`      ${String(e.ppl).padStart(8)} ${String(e.name).slice(0, 34).padEnd(35)} ${e.ack}`);
}
if (LIST) {
  const keys = [...tally.keys()].filter((k) => k.startsWith(LIST));
  if (!keys.length) { console.error(`\nno bucket starting ${LIST}`); process.exit(2); }
  for (const key of keys) {
    console.log(`\n--- ${key} — largest ${TOP} ---`);
    for (const e of tally.get(key).ex.sort((a, b) => b.ppl - a.ppl).slice(0, TOP))
      console.log(`${String(e.ppl).padStart(8)} ${String(e.name).slice(0, 38).padEnd(39)} ${e.ack}\n         (${e.n} real of ${e.nAll}) ${JSON.stringify(e.best.slice(0, 300))}`);
  }
}
console.log("\nThese figures are DERIVED. Re-run; never copy them forward.");
