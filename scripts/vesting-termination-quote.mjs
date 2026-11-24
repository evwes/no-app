#!/usr/bin/env node
/* wampo — IS THE PUBLISHED VESTING SENTENCE THE PLAN-TERMINATION BOILERPLATE?
 *
 * `lib-4i.mjs:8037` vetoes a conditional schedule out of `vestSentences`, and
 * among its arms is
 *     in the event (?:the plan|of (?:plan |the plan['’]s )?terminat|…)
 * which requires the words "in the event the plan". Auditors also write
 * **"In the event THAT the Plan is terminated, participants would become 100%
 * vested in their accounts"**, and that one intervening word escapes every arm:
 * `if the plan (?:is|becomes)` wants "if", and `upon (?:such |the |any )?
 * termination of the plan` wants "upon". *A fix for one phrasing of a class is
 * not a fix for the class — and the class also has an INTERVENING WORD.*
 *
 * WHY THIS IS MEASURED STORE-SIDE AND EXACTLY, with no filing text: the defect
 * is that a vetoed sentence became `vestingText`, and `vestingText` IS the
 * store. So the population is enumerable rather than sampled, and the question
 * "would a reader see it" is answered by the publish oracle BOTH renderers call
 * (`vestingQuoteOk`, app.js:3939 and build-seo-pages.mjs:419) plus the serving
 * condition — a plan whose features come from its own ack.
 *
 * A PLAN-TERMINATION SENTENCE IS UNIVERSAL IRC BOILERPLATE: §411(d)(3) makes
 * every participant fully vested on plan termination, so the sentence is true
 * of EVERY plan and says nothing about this one. Published under
 * "Employer-money vesting" with no label above it, it reads as the answer —
 * app.js's own comment says a quote with no label "IS the whole answer". That
 * is the same defect v83 fixed for a loan limit and v202 for a withdrawal rule.
 *
 * Usage: node scripts/vesting-termination-quote.mjs [--lim N] [--selftest]
 */
import { loadPlans } from "./lib-schema.mjs";
import { loadLineups } from "./lib-ledger.mjs";
import { vestingQuoteOk } from "./lib-quote.mjs";

const argv = process.argv.slice(2);
const LIM = (() => { const i = argv.indexOf("--lim"); return i >= 0 ? +argv[i + 1] : 20; })();

/* THE SHIPPED VETO, sliced by import rather than retyped? It is a bare literal
 * inside `extractPlanFeatures`, so it cannot be imported. It is therefore read
 * out of the FILE BYTES and compiled, the way `lib-vestslice` does, so this
 * script goes wrong the moment the veto moves instead of drifting silently. */
import { readFileSync } from "node:fs";
const SRC = readFileSync(new URL("./lib-4i.mjs", import.meta.url), "utf8");
const VETO = (() => {
  const i = SRC.indexOf("if (!BOILER.test(s) && !/defined benefit");
  if (i < 0) throw new Error("the selection veto's anchor moved — this screen cannot be trusted");
  const m = SRC.slice(i).match(/!\/(defined benefit[\s\S]*?)\/i\.test\(s\)/);
  if (!m) throw new Error("cannot read the veto regex out of lib-4i.mjs");
  return new RegExp(m[1], "i");
})();
if (!VETO.test("In the event the plan terminates, participants become fully vested."))
  throw new Error("veto control: the sliced veto does not fire on its own documented case");

/* The boilerplate shape, stated as the CLAIM and not as the absence of one:
 * the sentence conditions full vesting on the PLAN ENDING. */
/* THE PLAN ENDING, in either word order. Stated as two directed arms because
 * "the Plan is terminated" and "termination of the Plan" are the same claim
 * with the nouns swapped, and *alternation is FIRST-match, not longest-match*,
 * so one arm written to cover both would silently serve only the shorter. The
 * windows are the narrowest run the mechanism allows. */
export const PLAN_ENDS = /\bplans?\b[^.]{0,45}?\b(?:terminat\w+|discontinu\w+)|\b(?:terminat\w+|discontinu\w+)\b[^.]{0,25}?\bthe\s+plans?\b/i;
/* …conditioned rather than historical. A plan that HAS wound up is describing
 * its own facts; a plan saying what WOULD happen is quoting §411(d)(3). */
export const PLAN_ENDS_IF = /\b(?:in the event|if|when|should|upon|in case of|in the case of)\b/i;
const isTerm = (s) => /\bvest\w+/i.test(s) && PLAN_ENDS.test(s) && PLAN_ENDS_IF.test(s);

/* …AND THE PART THAT DECIDES WHETHER IT IS A DEFECT, which the first version of
 * this screen did not have and so over-reported by 7x. Nearly every sentence
 * `isTerm` catches ALSO states the plan's real rule and names plan termination
 * only as one ACCELERATING event beside death and disability — Kforce's
 * "100% vested after five years of credited service OR upon … Plan
 * termination", Del Monte's two-year cliff, Agfa's three-year. Withdrawing
 * those would be *a guard that blocks a wrong answer discarding the honest
 * evidence*, the eighth instance of which this parser already records, and
 * v82's own note measured 38 of 108 such sentences carrying the real schedule.
 * So the defect is only the sentence whose ONLY vesting content is the
 * counterfactual. Required to be ABSENT, each arm a different kind of real
 * content: a service condition, a ladder, an unconditional immediate claim, or
 * a named employer-money schedule. */
/* NO TRAILING `\b` AFTER THE PERCENTAGE ALTERNATION. `%` is a non-word
 * character, so `0%` followed by a SPACE has no boundary after it and
 * `\b\d{1,3}\s?%\b` reads a whole Years/Percent table as containing no
 * percentage at all. lib-4i.mjs:381 carries this exact note about `AV_FULL`,
 * and this screen walked into it anyway: Hillis-Carnes (551 readers) publishes
 * the table "less than 2 0% 2 20% 3 40% 4 60% 5 80% 6 100%" and was reported
 * as a sentence with no vesting content but a termination clause — i.e. the
 * screen proposed withdrawing a real schedule. *A guard that withdraws a TRUE
 * answer makes the page less honest, not more.*
 * `years?\s+of` is deliberately `years?\s*of`: Commencement Bay's filing reads
 * "three yearsof credited service" with the space lost in the PDF text layer,
 * and *a service test keyed on a correctly spelled unit is defeated by the
 * filings' own typos* — that one cost a 3-year cliff its quote.
 * The PAST-TENSE arm is the third refusal reading earned: Cornell Dubilier
 * (613) and Critigen (281) are plans that ARE winding up, so "all participants
 * became fully vested" is a FACT about this plan and not §411(d)(3) boilerplate. */
export const OTHER_VEST_CONTENT = /\byears?\s*of\s+(?:vesting\s+|credited\s+|continuous\s+|eligibility\s+)?(?:service|employment)\b|\bcomplet\w+\s+(?:\w+\s+){0,3}years?\b|\b\d{1,3}\s?(?:%|percent)|\bvesting schedule\b|\bgraded\b|\bcliff\b|\bratably\b|\bimmediate(?:ly)?\b|\bat all times\b|\banniversar\w+|\bhours of service\b|\bnormal retirement\b|\bage \d\d\b/i;
/* a plan that HAS terminated is stating its own history */
export const PAST_TERMINATION = /\b(?:became|were|was|has\s+been|have\s+been)\b[^.]{0,60}?\bvest\w+|\bbegan\s+the\s+termination\b|\bamendment\s+to\s+terminate\b|\beffective\s+\w+\s+\d{1,2},?\s+\d{4}\b/i;
/* `100%`/`fully` on its own is NOT other content — "would become 100% vested"
 * is the counterfactual's own words — so the percentage arm must not read the
 * full-vesting figure. Measured: without this the screen finds nothing at all,
 * which is why it is stated rather than assumed. */
const stripFull = (s) => s.replace(/\b(?:100\s?%|100\s+percent|one\s+hundred\s+percent|fully)\s*vest\w*/gi, " vested ");
export const terminationOnly = (s) => isTerm(s) && !OTHER_VEST_CONTENT.test(stripFull(s)) && !PAST_TERMINATION.test(s);

if (argv.includes("--selftest")) {
  /* one case per condition, each where that condition is the ONLY protection */
  const must = [
    ["In the event that the Plan is terminated, participants would become 100% vested in their accounts.", true, "the intervening THAT — the shape this screen exists for"],
    ["If the Plan is terminated, participants become fully vested in their accounts.", true, "the IF spelling"],
    ["Upon termination of the Plan, all participants shall become fully vested.", true, "the UPON spelling, claim before condition"],
    ["Employer contributions vest 20% per year of service and are fully vested after five years.", false, "a REAL graded schedule must not be caught"],
    ["Participants are immediately vested in Company matching contributions.", false, "a REAL immediate statement must not be caught"],
    ["Participants may terminate employment and receive their vested account balance.", false, "TERMINATION OF EMPLOYMENT is not termination of the plan"],
  ];
  const mustOnly = [
    ["In the event that the Plan is terminated, participants would become 100% vested in their accounts.", true, "the counterfactual ALONE — the defect"],
    ["A participant is 100% vested after five years of credited service or upon death, total disability, normal retirement age, or Plan termination.", false, "a REAL five-year schedule naming termination as an accelerator must be KEPT"],
    ["A participant becomes fully vested in Company contributions upon the completion of two years of service with the Company, or the attainment of age 65, retirement, disability, death or termination of the Plan.", false, "a REAL two-year cliff must be KEPT"],
    ["In the event of full or partial Plan termination, affected participants would become 100 percent vested in their employer contributions.", true, "the intervening FULL OR PARTIAL, counterfactual alone"],
    ["Participants vest in the Company's contributions portion of their accounts as follows: Years of Percent Continuous Service Vested less than 2 0% 2 20% 3 40% 4 60% 5 80% 6 100% The Plan permits withdrawals when a participant terminates employment or upon termination of the Plan.", false, "a real TABLE must be KEPT - the percent arm must not need a trailing word boundary"],
    ["A participant is 100% vested after three yearsof credited service or upon termination of the Plan.", false, "a real cliff whose filing LOST THE SPACE must be KEPT"],
    ["Effective October 31, 2023, when the Plan began the termination process, all participants became fully vested in all employer contributions.", false, "a plan that HAS terminated states its own history and must be KEPT"],
  ];
  let bad = 0;
  for (const [s, want, why] of mustOnly) {
    const got = terminationOnly(s);
    if (got !== want) { console.log(`SELFTEST FAIL terminationOnly (${got} want ${want}): ${why}\n   ${s}`); bad++; }
  }
  for (const [s, want, why] of must) {
    const got = isTerm(s);
    if (got !== want) { console.log(`SELFTEST FAIL (${got} want ${want}): ${why}\n   ${s}`); bad++; }
  }
  /* and the ESCAPE control: the shipped veto must MISS the first case, or this
   * whole screen is describing a defect that does not exist */
  if (VETO.test(must[0][0])) { console.log("SELFTEST FAIL: the shipped veto already catches the THAT spelling — there is no defect here"); bad++; }
  console.log(bad ? `SELFTEST: ${bad} failure(s)` : "SELFTEST: ok — 6 predicate cases and the escape control");
  if (bad) process.exit(1);
}

const d = loadPlans(), lineups = loadLineups();
const rows = [];
let published = 0, pubPpl = 0;
for (const r of d.rows) {
  const ack = d.get(r, "ack");
  if (!ack || d.get(r, "sf")) continue;
  const e = lineups.get(ack);
  const ft = e && e.features;
  if (!ft || !ft.vestingText) continue;
  const s = ft.vestingText;
  if (!vestingQuoteOk(s)) continue;            // the page would not show it
  published++; pubPpl += d.get(r, "partEOY") || d.get(r, "participants") || 0;
  if (!terminationOnly(s)) continue;
  if (VETO.test(s)) continue;                  // the shipped veto already drops it
  rows.push({ name: d.get(r, "sponsorName"), ein: d.get(r, "ein"), pn: d.get(r, "pn"),
    ppl: d.get(r, "partEOY") || d.get(r, "participants") || 0, ack, label: ft.vesting || "", s });
}
const sum = (a) => a.reduce((x, y) => x + y.ppl, 0);
console.log(`POSITIVE CONTROL — plans whose stored vesting quote the page WOULD publish: ${published} / ${pubPpl.toLocaleString()} readers`);
if (!published) throw new Error("no published vesting quote found at all — the store fields or the oracle moved");
const noLabel = rows.filter((r) => !r.label), withLabel = rows.filter((r) => r.label);
console.log(`\nplan-termination boilerplate PUBLISHED as the vesting sentence: ${rows.length} plans / ${sum(rows).toLocaleString()} readers`);
console.log(`   of which NO label above it (the quote IS the whole answer): ${noLabel.length} / ${sum(noLabel).toLocaleString()}`);
console.log(`   of which a label is also published (quote is corroboration):  ${withLabel.length} / ${sum(withLabel).toLocaleString()}`);
for (const r of [...rows].sort((a, b) => b.ppl - a.ppl).slice(0, LIM))
  console.log(`\n ${String(r.ppl).padStart(7)} ${r.name} · ${r.ein}|${r.pn} · ${r.ack}\n   label=${r.label || "(none)"}\n   ${r.s}`);
console.log("\nThese figures are DERIVED. Re-run; never copy them forward.");
