#!/usr/bin/env node
/* wampo — WHERE DOES THE STORE CONTRADICT ITSELF ON A TAX FLAG?
 *
 * `afterTax: true` and its own evidence `afterTaxText` sit side by side in every
 * lineup entry, so a row whose quote DENIES after-tax while the flag asserts it
 * needs no filing download to find: the refutation is already in the store, one
 * key away from the claim. Same for `roth` / `rothText`.
 *
 * That is why this screen is store-side and exact rather than sampled. It was
 * written because the populations reached me as a sizing agent's figures, and
 * this record's rule is that a queued count must be re-derived before a fix
 * ships — a re-size is a NEW MEASUREMENT, not a delta against a remembered one.
 *
 * THE SCREEN REQUIRES THE PRESENCE OF THE BAD SHAPE, never the absence of a good
 * one: a NEGATION that governs the tax noun phrase inside the flag's own quote.
 * Every syntactic proxy for an absence leaks, and five screens on this project's
 * record were refuted by reading their own members. So this one PRINTS every
 * member it reaches and the output is the audit, not the count.
 *
 * Readers are DISTINCT participants, resolved through MEMBER PLANS — a count
 * keyed on plans is blind to every master-trust row, met nine times here.
 *
 *   node scripts/tax-flag-contradiction.mjs [--all] [--field afterTax|roth]
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadPlans } from "./lib-schema.mjs";
import { servedLineup } from "./lib-ledger.mjs";
import { taxFlagDenialClause } from "./lib-4i.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : ""; };
const ONLY = arg("--field");
const SHOW_ALL = process.argv.includes("--all");

/* THE PREDICATE IS THE PARSER'S, IMPORTED, NOT A COPY. It used to be defined
 * here, and that is the duplicate-definition trap this record names: nothing
 * executes a comment asserting two regex sets are equivalent, and one
 * re-implementation of a shipped lookup published 65% false findings into a
 * watched metric. `taxFlagDenialClause` now lives in scripts/lib-4i.mjs beside
 * the veto that uses it, so this screen measures exactly what the parser will
 * do — and the controls below are therefore controls on the SHIPPED code. */
const pick = (text, field) => taxFlagDenialClause(text, field);
const flags = (text, field) => !!pick(text, field);
/* the reason a quote was refused is no longer introspectable from outside the
 * parser, so this reports only WHETHER it was refused, by asking the predicate
 * about the clause that would otherwise have matched. A refusal nobody can read
 * is indistinguishable from a screen that never reached the row, so the shape
 * breakdown is derived by re-testing each clause against the subject and a
 * generic negation rather than by naming the refusal that fired. */
const GENERIC_NEG = /\bnot\b|\bno\b|\bcannot\b|\bineligible\b/i;
const refusalOf = (text, field) => {
  if (pick(text, field)) return "";
  for (const c of String(text || "").split(/[.;:]/))
    if (TAX_SUBJECT_PROBE[field].test(c) && GENERIC_NEG.test(c)) return "refused-by-shape";
  return "";
};
const TAX_SUBJECT_PROBE = {
  afterTax: /\bafter[\s-]?tax\b|\bpost[\s-]?tax\b|\bnon-?deductible\b/i,
  roth: /\broth\b/i,
};

/* CONTROLS ON THE SHIPPED PREDICATE, above the loop that uses it so a broken
 * screen costs one minute rather than a whole pass. Every sentence here is a
 * real filed one, and each refusal has a case where it is the ONLY protection —
 * a case protected twice proves neither. */
const MUST_FLAG = [
  ["After-tax contributions are not permitted by the 6 Plan.", "afterTax"],
  ["Participants are not permitted to make contributions on a traditional after-tax basis.", "afterTax"],
  ["The Plan does not allow for Roth or after-tax contributions.", "afterTax"],
  ["The Plan does not allow for Roth or after-tax contributions.", "roth"],
  ["Voluntary after-tax contributions to the Plan are not permitted.", "afterTax"],
  ["No after-tax contributions may be made to the Plan.", "afterTax"],
  /* the four repairs an independent screen found in this one */
  ["The Plan does not currently permit participants to make after-tax contributions.", "afterTax"],
  ["During 2025, the Plan did not permit Roth elective deferrals.", "roth"],
  ["Roth elective deferrals were not permitted under the Plan during the year ended December 31, 2025.", "roth"],
  ["Participants age 60 through 63 may make additional catch-up contributions of up to $11,250 annually in 2025 Roth contributions are not permitted.", "roth"],
  /* AND THE SAME TWO QUOTES MUST STILL WITHDRAW ON THE OTHER ARM — one sentence
   * that is right for one field and wrong for the other is the sharpest case in
   * this class, and a control that checked only the roth side would have let a
   * silent loss of both through. */
  ["Except for Roth contributions, the Plan does not allow for after-tax contributions.", "afterTax"],
  ["Except for the Roth contributions, after-tax contributions are not allowed.", "afterTax"],
  ["The Plan does not permit Roth or after-tax contributions.", "afterTax"],
  ["The Plan does not permit Roth or after-tax contributions.", "roth"],
];
const MUST_NOT_FLAG = [
  /* affirmative, and the whole correct-yes population looks like these */
  ["Participants may elect to make after-tax contributions to the Plan.", "afterTax"],
  ["The Plan permits Roth elective deferrals.", "roth"],
  ["Participants may contribute on a pre-tax or after-tax basis.", "afterTax"],
  /* a negation governing something ELSE in a sentence that mentions the tax
   * word — co-occurrence is not governance, and this is the sharpest risk */
  ["Participants may make after-tax contributions; loans are not permitted.", "afterTax"],
  ["Principal and interest is paid through after-tax payroll deductions.", "afterTax"],
  /* one per clause-level refusal */
  ["The Plan does not accept a rollover of after-tax contributions.", "afterTax"],
  ["Loans are not available from a participant's after-tax contribution.", "afterTax"],
  ["Hourly union participants employed at the Company's Browntown facility are not permitted to make after-tax contributions.", "afterTax"],
  ["Prior to May 1, 2025, participants were not allowed to contribute after-tax contributions.", "afterTax"],
  ["There were no after-tax contributions to the Plan for the year ended December 31, 2025.", "afterTax"],
  ["It is not available for after-tax Contributions.", "afterTax"],
  ["Roth deferrals are not permitted to be used for notes.", "roth"],
  ["Participants are not permitted to borrow from their Roth deferrals and earnings.", "roth"],
  ["Roth deferrals are not allowed for in-service distributions in accordance with the Plan document provisions.", "roth"],
  ["Participants' pre-tax and/or Roth contributions were not permitted to exceed $23,500 for 2025.", "roth"],
  ["Participants may not make pre-tax and Roth contributions during the same plan year.", "roth"],
  ["However, participants may not make after-tax or Roth IRA contributions.", "roth"],
  ["Eligible employees who do not elect to make a contribution deferral are automatically enrolled at 3%.", "afterTax"],
  /* FIVE EARNED BY THE GATE, which refused the ship and named them. Each sits
   * on a superseded or unserved entry, so no enumeration of what READERS see
   * could have found them — a predicate is judged over the whole population it
   * runs on, not over the rows a reader happens to see today. */
  ["Contributions to the Plan include (i) pre-tax salary reduction contributions (or in some cases, after-tax contributions if employed in a foreign jurisdiction that does not permit pre-tax contributions), (ii) matching contributions", "afterTax"],
  ["Employees may not contribute more than 50% of their total base compensation in pre-tax and after-tax contributions subject to the IRS dollar limits described above.", "afterTax"],
  ["Such employees are not eligible to make pre-tax elective contributions or Roth contributions to the Plan.", "roth"],
  ["Except for Roth contributions, the Plan does not allow for after-tax contributions.", "roth"],
  ["Except for the Roth contributions, after-tax contributions are not allowed.", "roth"],
  /* the audit finding, whose denying clause carries none of the audit framing */
  ["It was noted that one participant elected for no Roth contribution from bonus check but still employee contributions were withheld.", "roth"],
];

let bad = 0;
for (const [t, f] of MUST_FLAG)
  if (!flags(t, f)) { console.log(`CONTROL FAIL: must flag (${f}) ${JSON.stringify(t)}`); bad++; }
for (const [t, f] of MUST_NOT_FLAG)
  if (flags(t, f)) { console.log(`CONTROL FAIL: must NOT flag (${f}) ${JSON.stringify(t)}`); bad++; }
if (bad) throw new Error(`${bad} control(s) failed — the screen is wrong, so any count it prints is meaningless`);
console.log(`controls: ${MUST_FLAG.length} must-flag and ${MUST_NOT_FLAG.length} must-not-flag cases pass`);
console.log(`          (the 4th must-not case is the sharp one: a negation governing LOANS in a`);
console.log(`           sentence that affirms after-tax — co-occurrence alone would flag it)\n`);

/* readers, through member plans */
const d = loadPlans();
const INDEX = JSON.parse(readFileSync(`${ROOT}/lineups-index.json`, "utf8")).plans;
const members = new Map();
for (const r of d.rows) {
  const o = { sponsorName: d.get(r, "sponsorName"), ein: d.get(r, "ein"), pn: d.get(r, "pn"),
    ppl: d.get(r, "partEOY") || d.get(r, "participants") || 0,
    planYear: d.get(r, "planYear"), ack: d.get(r, "ack"), mtiaAck: d.get(r, "mtiaAck") };
  for (const a of [o.ack, o.mtiaAck]) {
    if (!a) continue;
    if (!members.has(a)) members.set(a, []);
    members.get(a).push(o);
  }
}
const servedBy = (m) => servedLineup(m, INDEX).ack;

const FIELDS = ONLY ? [ONLY] : ["afterTax", "roth"];
const out = {};
for (const f of FIELDS) out[f] = { rows: [], plans: new Map(), yesPlans: new Map(), yes: 0, noQuote: 0 };

for (let s = 0; s < 64; s++) {
  const f = `${ROOT}/data/lineups/${String(s).padStart(2, "0")}.json`;
  if (!existsSync(f)) continue;
  for (const [ack, e] of Object.entries(JSON.parse(readFileSync(f, "utf8")))) {
    const ft = e.features || {};
    const all = members.get(ack);
    if (!all) continue;
    /* the SERVING condition: a trust's entry reaches readers only through the
     * plans it actually serves, so an entry nothing serves publishes nothing */
    const mem = all.filter((m) => servedBy(m) === ack);
    if (!mem.length) continue;
    for (const field of FIELDS) {
      if (ft[field] !== true) continue;
      const acc = out[field];
      acc.yes++;
      for (const m of mem) if (!acc.yesPlans.has(`${m.ein}|${m.pn}`)) acc.yesPlans.set(`${m.ein}|${m.pn}`, m.ppl);
      const q = ft[`${field}Text`];
      if (!q) { acc.noQuote++; continue; }
      if (!flags(String(q), field)) {
        const why = refusalOf(String(q), field);
        if (why) {
          acc.refused = acc.refused || new Map();
          const cur = acc.refused.get(why) || { n: 0, ppl: 0 };
          cur.n++; cur.ppl += mem.reduce((a, m) => a + m.ppl, 0);
          acc.refused.set(why, cur);
        }
        continue;
      }
      const lead = mem[0];
      acc.rows.push({ ack, pk: `${lead.ein}|${lead.pn}`, sponsor: lead.sponsorName,
        py: lead.planYear, ppl: mem.reduce((a, m) => a + m.ppl, 0), q: String(q) });
      for (const m of mem) if (!acc.plans.has(`${m.ein}|${m.pn}`)) acc.plans.set(`${m.ein}|${m.pn}`, m.ppl);
    }
  }
}

const fmt = (n) => n.toLocaleString();
const sum = (m) => [...m.values()].reduce((a, v) => a + v, 0);
for (const field of FIELDS) {
  const a = out[field];
  console.log(`===== ${field} =====`);
  console.log(`  published TRUE and served:      ${fmt(a.yes)} entries / ${fmt(a.yesPlans.size)} plans / ${fmt(sum(a.yesPlans))} DISTINCT readers`);
  console.log(`  of those, NO quote stored:      ${fmt(a.noQuote)}  (this screen cannot judge them)`);
  console.log(`  CONTRADICTED BY THEIR OWN QUOTE: ${fmt(a.rows.length)} entries / ${fmt(a.plans.size)} plans / ${fmt(sum(a.plans))} DISTINCT readers`);
  if (a.refused && a.refused.size) {
    console.log(`  REFUSED, by shape (a quote whose negation governs something else):`);
    for (const [why, c] of [...a.refused.entries()].sort((x, y) => y[1].ppl - x[1].ppl))
      console.log(`      ${String(c.n).padStart(4)} entries / ${fmt(c.ppl).padStart(10)} reader-slots  ${why}`);
  }
  const show = SHOW_ALL ? a.rows : a.rows.slice().sort((x, y) => y.ppl - x.ppl).slice(0, 30);
  console.log(`\n  --- every member, by readers${SHOW_ALL ? "" : " (top 30; pass --all for the rest)"} ---`);
  for (const r of show)
    console.log(`  ${String(r.ppl).padStart(7)}p  ${r.pk}  PY${r.py || "?"}  ${String(r.sponsor || "").slice(0, 34).padEnd(34)}  ${r.ack}\n       "${r.q.replace(/\s+/g, " ").slice(0, 150)}"`);
  console.log("");
}
