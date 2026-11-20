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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : ""; };
const ONLY = arg("--field");
const SHOW_ALL = process.argv.includes("--all");

/* The tax noun phrase, per field. `roth` must also match inside `Non-Roth`,
 * which is itself a DENIAL of non-Roth after-tax and an affirmation of nothing
 * — that spelling is why the roth arm fires on BMO. */
const SUBJECT = {
  afterTax: /\bafter[\s-]?tax\b|\bpost[\s-]?tax\b|\bnondeductible\b|\bnon-?deductible\b/i,
  roth: /\broth\b/i,
};
/* NEGATION, as a presence test. Each alternative is a form seen in this corpus;
 * `\bno\b` is deliberately absent because it matches "no later than" and every
 * other ordinary use — a character- or word-shaped screen picks up everything
 * that shares its shape. */
const NEGATION = new RegExp([
  String.raw`\b(?:are|is|was|were)\s+not\s+(?:permitted|allowed|available|offered|accepted|made)\b`,
  /* AN INTERVENING ADVERB AND THE PAST TENSE ARE BOTH THE SAME CLASS, and both
   * were found by diffing this screen against an independent one: *"does not
   * CURRENTLY permit participants to make after-tax contributions"* (Smithbucklin,
   * 1,043 readers) and *"During 2025, the Plan DID not permit Roth elective
   * deferrals"* (E-Z Excavating). A class has a POSITION, a TENSE and an
   * INTERVENING WORD — this record's own list, met again. */
  /* `elect` IS NOT IN THIS LIST, and it was, for one revision. Adding it reached
   * *"Eligible employees who do not elect to make a contribution deferral..."* —
   * auto-enrolment language where the negation governs the EMPLOYEE's election
   * and not the plan's terms. The one case that seemed to need it, *"does not
   * elect automatic enrollment and does not permit Roth elective deferrals"*,
   * matches on `does not permit` anyway. A widening measured at +1 true member
   * and +1 false one is not a widening worth having. */
  String.raw`\b(?:does|do|did)\s+not\s+(?:\w+ly\s+)?(?:allow|permit|provide|offer|accept)\b`,
  String.raw`\bnot\s+permitted\s+to\s+make\b`,
  String.raw`\bmay\s+not\s+(?:make|elect|contribute)\b`,
  String.raw`\bcannot\s+(?:make|elect|contribute)\b`,
  String.raw`\bno\s+(?:after[\s-]?tax|roth|post[\s-]?tax)\b`,
  String.raw`\bineligible\s+to\s+make\b`,
  String.raw`\bis\s+not\s+a\s+feature\b`,
  String.raw`\bnot\s+eligible\s+to\s+make\b`,
].join("|"), "i");

/* CONTROLS, above the loop that uses them, so a broken screen costs one minute
 * rather than a whole pass — and each case is one where the named condition is
 * the ONLY protection. */
const MUST_FLAG = [
  ["After-tax contributions are not permitted by the 6 Plan.", "afterTax"],
  ["Participants are not permitted to make contributions on a traditional after-tax basis.", "afterTax"],
  ["The Plan does not allow for Roth or after-tax contributions.", "afterTax"],
  ["The Plan does not allow for Roth or after-tax contributions.", "roth"],
  ["Voluntary after-tax contributions to the Plan are not permitted.", "afterTax"],
  ["Non-Roth after-tax contributions by participants are not permitted.", "roth"],
];
const MUST_NOT_FLAG = [
  /* affirmative, and the whole correct-yes population looks like these */
  ["Participants may elect to make after-tax contributions to the Plan.", "afterTax"],
  ["The Plan permits Roth elective deferrals.", "roth"],
  ["Participants may contribute on a pre-tax or after-tax basis.", "afterTax"],
  /* a negation that governs something ELSE in a sentence that mentions the tax
   * word — the screen keys on co-occurrence, so this is its sharpest risk */
  ["Participants may make after-tax contributions; loans are not permitted.", "afterTax"],
  /* the loan boilerplate that must never fire on either arm */
  ["Principal and interest is paid through after-tax payroll deductions.", "afterTax"],
  /* ONE CASE PER REFUSAL, each the real filed sentence, and each a case where
   * that refusal is the ONLY thing standing between the row and the fix — a
   * case protected twice proves neither. */
  ["The Plan does not accept a rollover of after-tax contributions.", "afterTax"],
  ["Loans are not available from a participant's after-tax contribution.", "afterTax"],
  ["Hourly union participants employed at the Company's Browntown facility are not permitted to make after-tax contributions.", "afterTax"],
  ["Prior to May 1, 2025, participants were not allowed to contribute after-tax contributions.", "afterTax"],
  ["There were no after-tax contributions to the Plan for the year ended December 31, 2025.", "afterTax"],
  ["It is not available for after-tax Contributions.", "afterTax"],
  /* and one per refusal added after reading the ROTH arm's own members */
  ["Roth deferrals are not permitted to be used for notes.", "roth"],
  ["Participants are not permitted to borrow from their Roth deferrals and earnings.", "roth"],
  ["Roth deferrals are not allowed for in-service distributions in accordance with the Plan document provisions.", "roth"],
  ["Participants' pre-tax and/or Roth contributions were not permitted to exceed $23,500 for 2025.", "roth"],
  ["Participants may not make pre-tax and Roth contributions during the same plan year.", "roth"],
  ["However, participants may not make after-tax or Roth IRA contributions.", "roth"],
  /* auto-enrolment: the negation governs the EMPLOYEE's election, not the plan */
  ["Eligible employees who do not elect to make a contribution deferral are automatically enrolled at 3%.", "afterTax"],
];
/* FOUR REPAIRS, each with the filed sentence that found it — these are
 * MUST-FLAG cases, added to the list above after an independent screen reached
 * members this one silently dropped. */
MUST_FLAG.push(
  ["The Plan does not currently permit participants to make after-tax contributions.", "afterTax"],
  ["During 2025, the Plan did not permit Roth elective deferrals.", "roth"],
  ["Roth elective deferrals were not permitted under the Plan during the year ended December 31, 2025.", "roth"],
  ["Participants age 60 through 63 may make additional catch-up contributions of up to $11,250 annually in 2025 Roth contributions are not permitted.", "roth"],
);
/* CO-OCCURRENCE IS NOT GOVERNANCE, and the control below caught the first
 * version of this function doing exactly that. `Participants may make after-tax
 * contributions; loans are not permitted.` carries the subject and a negation
 * and means the OPPOSITE of a denial — the negation governs LOANS. A screen
 * keyed on "both tokens appear in the quote" would have published that row as a
 * wrong claim and, worse, would have inflated the population with affirmative
 * rows, which is the direction that makes a withdrawal look justified.
 *
 * So the test is per CLAUSE: some single clause must contain BOTH the tax noun
 * phrase and a negation. Clause boundaries are `.` `;` and `:` — the corpus
 * writes these denials as whole sentences or as semicolon-separated list items,
 * and a comma is NOT a boundary because `after-tax contributions, however, are
 * not permitted` is one clause for this purpose. */
const CLAUSE = /[.;:]/;

/* SIX SHAPES REACH THE SCREEN AND ONLY ONE IS THE DEFECT. Reading all 71 members
 * of the first version refuted most of its own count — the largest member was
 * Dick's Sporting Goods at 64,943 readers on *"The Plan does not accept a
 * rollover of after-tax contributions"*, which denies a ROLLOVER of after-tax
 * money and says nothing about whether the plan offers after-tax. *A screen that
 * finds its own conclusion in every member it reads has not been shown the
 * members that would refute it* — so these are refusals, each keyed on the
 * PRESENCE of its own shape, each with a case below where it is the only
 * protection.
 *
 * Two of them are the more interesting kind, because they point the other way:
 *  - a LOAN or WITHDRAWAL sourced from after-tax money PRESUPPOSES after-tax
 *    money, so the clause is evidence FOR the flag, not against it.
 *  - a PRIOR-TO prohibition that has since been lifted is the mirror image of
 *    the subsequent-events defect: the flag may be correct for the reported
 *    year and wrong only about history. */
const REFUSE = [
  /* the negated verb governs a ROLLOVER / TRANSFER of after-tax money in */
  ["rollover-only", /\broll(?:over|ing)?s?\b|\btransfers?\s+(?:of|from)\b|\bdirect\s+rollover\b/i],
  /* the negated verb governs a LOAN, WITHDRAWAL or DISTRIBUTION taken FROM it.
   * `notes`, `borrow` and `in-service distributions` were added after reading
   * the roth arm's own members: *"Roth deferrals are not permitted to be used
   * for notes"*, *"not permitted to borrow from their Roth deferrals"* and
   * *"not allowed for in-service distributions"* each PRESUPPOSE Roth money and
   * were being counted as denials of it. A fix for one phrasing of a class is
   * not a fix for the class. */
  ["loan-or-withdrawal-source", /\bloans?\b|\bnotes?\b|\bborrow\w*\b|\bwithdrawals?\b|\bdistributions?\b|\bhardship\b/i],
  /* a LIMIT or a CAP is not a denial — it presupposes the contribution type:
   * *"pre-tax and/or Roth contributions were not permitted to exceed $23,500"* */
  /* THE LIMIT MUST BIND TO THE NEGATION, not merely share a clause with it.
   * Singapore Airlines files *"...catch-up contributions of up to $11,250
   * annually in 2025 Roth contributions are not permitted."* — two sentences
   * welded with no period, so a clause-wide `up to $\d` refused a real denial.
   * The refusal now requires the limit to be what is negated. */
  ["limit-not-denial", /\bnot\s+(?:permitted|allowed|eligible)\s+to\s+exceed\b|\bnot\s+(?:permitted|allowed)\s+in\s+excess\s+of\b|\bmay\s+not\s+exceed\b|\bare\s+limited\s+to\b/i],
  /* a restriction on COMBINING two types presupposes both:
   * *"may not make pre-tax and Roth contributions during the same plan year"* */
  ["combining-restriction", /\bsame\s+plan\s+year\b|\bboth\b|\bsimultaneous\w*\b|\bconcurrent\w*\b|\bin\s+the\s+same\b/i],
  /* a Roth IRA is a different vehicle from a designated Roth account, so
   * *"may not make after-tax or Roth IRA contributions"* settles nothing here */
  ["roth-ira-not-designated", /\broth\s+ira\b/i],
  /* the prohibition is scoped to a NAMED SUBSET, so the plan offers it to others */
  ["subset-population", /\bemployees\s+of\b|\bhighly\s+compensated\b|\bunion\b|\bbargaining\b|\bfacility\b|\blocation\b|\bdivision\b|\bemployed\s+at\b|\beligible\s+for\s+the\b/i],
  /* a PAST prohibition, since lifted */
  ["temporal-prior", /\bprior\s+to\b|\beffective\s+(?:as\s+of\s+)?\w+\s+\d{1,2},?\s+\d{4}\b|\buntil\b|\bbeginning\b|\bbefore\s+\w+\s+\d{1,2},?\s+\d{4}\b/i],
  /* a statement about the YEAR'S ACTIVITY, not about the plan's terms */
  /* `during the (plan) year` was a disjunct here and it was WRONG: in
   * *"Roth elective deferrals were not permitted under the Plan during the year
   * ended December 31, 2025"* it dates a real denial rather than describing
   * activity, and refusing it silently dropped a true member. The refusal now
   * requires the existential itself. */
  ["zero-activity", /\bthere\s+(?:were|was)\s+no\b|\bno\s+such\s+contributions\s+were\b|\bno\s+\w+\s+contributions\s+were\s+made\b/i],
  /* the negated subject is a PRONOUN whose referent is some other feature */
  ["ambiguous-referent", /^\s*it\s+(?:is|was)\s+not\b/i],
];

/* the surviving shape: a clause carrying the subject AND a negation AND none of
 * the six refusals */
const flags = (text, field) => !!pick(text, field);
const pick = (text, field) => {
  for (const c of String(text).split(CLAUSE)) {
    if (!SUBJECT[field].test(c) || !NEGATION.test(c)) continue;
    const r = REFUSE.find(([, re]) => re.test(c));
    if (r) continue;                      /* this clause is one of the six */
    return c.trim();
  }
  return null;
};
/* and the reason a quote was refused, for the audit trail — a refusal nobody can
 * read is indistinguishable from a screen that never reached the row */
const refusalOf = (text, field) => {
  const hits = new Set();
  for (const c of String(text).split(CLAUSE)) {
    if (!SUBJECT[field].test(c) || !NEGATION.test(c)) continue;
    const r = REFUSE.find(([, re]) => re.test(c));
    if (r) hits.add(r[0]);
  }
  return [...hits].join("+");
};

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
