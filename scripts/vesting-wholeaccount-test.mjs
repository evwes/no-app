#!/usr/bin/env node
/* GATE for v211 — "the participant's WHOLE ACCOUNT is fully vested".
 *
 *   node scripts/vesting-wholeaccount-test.mjs
 *
 * WHY A SEPARATE FILE BESIDES `parser-gate.mjs`. The gate pins eleven live
 * FILINGS, which is the review moment and the end-to-end proof. It cannot show
 * that each CONDITION of the predicate is load-bearing, and this change is a
 * conjunction of five — a full-vest marker, an unconditional marker, an account
 * OBJECT in either word order, the employee-narrowing refusal, and the employer
 * escape inside that refusal. *A case protected by TWO conditions cannot fail
 * for either, so it proves neither*, so every fixture below is chosen by asking
 * which OTHER conditions also decide it, and every condition gets a sliced
 * mutant that must flip a NAMED case.
 *
 * The direction of risk is the same as every vesting change on this record: a
 * false positive tells a participant their employer money is theirs today. So
 * the must-NOT-fire list is the long one, and all seventeen members of the
 * live refusal were read against their filings before any of this was written.
 */
import { readFileSync } from "node:fs";
import { wholeAccountVested, employeeScopedAccount, SPONSOR_TWO_CLAIM } from "./lib-4i.mjs";
import { AV_TRIGGER } from "./lib-quote.mjs";

const R = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
let bad = 0;
const ok = (cond, why) => { if (!cond) { bad++; console.error(`FAIL ${why}`); } };

/* ---- 1. MUST FIRE — every one lifted verbatim from a filing that was read.
 * Each also fails `IMMED` in lib-4i, which is why they published nothing. */
const FIRE = [
  ["Lowe's 289,398 — the `100%` with no word boundary after the percent sign",
    "Vesting - Each participant shall at all times have a 100% vested interest in the balance of their account."],
  ["Microsoft 184,329 — `Plan accounts` with no `all` in front of it",
    "Vesting Participants are fully vested in Plan accounts at all times."],
  ["IBM 144,897 — the always-marker BEFORE the full-vest marker",
    "Vesting Participants in the Plan are at all times fully vested in their account balance, including employee contributions, prior IBM contributions and earnings thereon, if any."],
  ["ABM 87,551 — the account is the SUBJECT, so the object test must run in reverse",
    "(c) Vesting The value of the participant’s account, including the Company’s matching portion, is fully vested at all times."],
  ["U.S. Bancorp 85,667 — `immediately 100 percent vested in their entire account balance`",
    "Participants may invest their account balance in one or more of a variety of investment funds and are immediately 100 percent vested in their entire account balance."],
  ["Union Pacific 31,226 — `at all times have a 100% vested interest in their accounts`",
    "Vesting — Participants at all times have a 100% vested interest in their accounts."],
  ["Supplemental Income Trust 43,977 — future copula, `will be fully vested`",
    "Vesting Each participant’s account will be fully vested at all times."],
  ["Strata Oncology — SAFE HARBOR is employer money by statute (IRC 401(k)(12))",
    "Vesting The balance in each participant’s salary deferral, rollover, and safe-harbor accounts are 100% vested at all times."],
];
for (const [why, t] of FIRE) ok(wholeAccountVested(t), `MUST FIRE — ${why}`);

/* ---- 2. MUST NOT FIRE. The first five are the live refusal, read against
 * their filings; the rest are the shapes the conditions exist to exclude. */
const SILENT = [
  ["St. Luke's 750 — the account list is narrowed to employee money",
    "Vesting Participants are fully and immediately vested in their elective deferral and rollover accounts, plus earnings thereon."],
  ["Cadence Bank 7,885 — employer money is named to say it is NOT immediate",
    "(f) Vesting The employee deferral accounts are 100% vested and non-forfeitable at all times, and employer contributions have a one-year vesting period."],
  ["NYU Langone 50,458 — the narrowing clause FOLLOWS the account noun",
    "Vesting All participants are fully vested in their account balance for contributions they make immediately upon entering the Plan."],
  ["Methodist Hospitals of Dallas 17,325 — mandatory / voluntary / rollover",
    "Participants are at all times 100% vested in amounts credited to their mandatory, voluntary, and rollover accounts under the Plan."],
  ["Cascade Wood 131 — `his Employee Fund account`",
    "An employee is fully vested at all times in his Employee Fund account."],
  /* THE FOUR THE DIFFERENTIAL CAUGHT — each would have REPLACED a true
   * multi-year employer-money schedule with `Immediate`, which is worse than
   * any blank. Legacy Funeral / Retail Concepts / LBC Houston file the first;
   * Morgan Lewis & Bockius files the second. */
  ["Legacy Funeral / Retail Concepts / LBC Houston — `the portion of their account ATTRIBUTABLE TO participant contributions`",
    "Vesting - A participant is immediately fully vested with respect to the portion of their account attributable to participant contributions and related earnings."],
  /* THE FOUR THE QUOTE MOVES CAUGHT — plans with no label today, where the arm
   * sets both the label and the quote, so a sentence that is not a plan-wide
   * claim would publish one. */
  ["Re/Max 761 — `AFFECTED participants` is a subset, and the quote it displaced states a real 3-year schedule",
    "As a result, affected participants immediately became 100% vested in their accounts."],
  ["Ageless Men's Health 721 / MTX 420 — a demonstrative whose referent is in another sentence",
    "If made, participants are always 100% vested in these contribution accounts."],
  ["Murata 793 — `all OTHER accounts` presupposes accounts that are not",
    "Each participant's interest in all other accounts is at all times fully vested and nonforfeitable."],
  ["Knights of Columbus 949 — `DERIVED FROM their own contributions`",
    "Vesting For employees of the Society and the adopting employer, participants are immediately and fully (100%) vested in the value of their accounts derived from their own contributions."],
  ["Ditsch USA 190 — `attributable to his or her contributions (including ROLLOVERS)`, over a 20%-per-period employer schedule",
    "Vesting Each participant is immediately fully vested in the portion of his or her account attributable to his or her contributions (including rollovers) and earnings thereon."],
  ["Grant-Blackford 194 — `the participant's ACCOUNT IN SALARY REDUCTION CONTRIBUTIONS`",
    "Vesting and Forfeitures The Plan provides that the participant\u2019s account in salary reduction contributions are fully vested immediately at the participant\u2019s effective date of participation."],
  ["Morgan Lewis 5,179 — the account is only where the participant's own money was PUT",
    "Vesting and Forfeitures All participant contributions and earnings thereon allocated to the accounts of participants under the Plan are fully vested and nonforfeitable at all times."],
  ["no unconditional marker: a three-year cliff satisfies every other condition",
    "A participant is 100% vested in their account after three years of service."],
  ["no full-vest marker: a 20% ladder step is not a whole-account claim",
    "A participant is 20% vested in their account at all times after the first year."],
  ["no account OBJECT: Charter's class, which is why the shipped gate is right",
    "Participants are immediately vested in their voluntary contributions."],
  ["the vest word is ADJECTIVAL on a loan rule, and the only percentage is 50%",
    "Loans are limited to the lesser of $50,000 or 50% of the participant’s vested account balance at all times."],
];
for (const [why, t] of SILENT) ok(!wholeAccountVested(t), `MUST NOT FIRE — ${why}`);

/* ---- 3. SINGLE PROTECTION, one case per condition. For each, the OTHER
 * conditions are asserted to pass, so the named one is the only thing
 * deciding. A condition with no such case is untested machinery. */
const WA = {
  full: /\b100\s?%|\b100\s+percent\b|\bone\s+hundred\s+percent\b|\bfully\b/i,
  always: /\bat all times\b|\balways\b|\bimmediate(?:ly)?\b|\bat any time\b/i,
};
{
  /* the FULL marker: everything else holds and only the marker is missing */
  const t = "A participant is 20% vested in their account at all times.";
  ok(!WA.full.test(t) && WA.always.test(t) && !employeeScopedAccount(t),
    "single-protection(full): the case is decided by more than the full-vest marker");
  ok(!wholeAccountVested(t), "single-protection(full): the predicate fires without a full-vest marker");
}
{
  /* the ALWAYS marker */
  const t = "A participant is 100% vested in their account after three years of service.";
  ok(WA.full.test(t) && !WA.always.test(t) && !employeeScopedAccount(t),
    "single-protection(always): the case is decided by more than the unconditional marker");
  ok(!wholeAccountVested(t), "single-protection(always): the predicate fires with no unconditional marker");
}
{
  /* the ACCOUNT object */
  const t = "Participants are immediately 100% vested in their voluntary contributions.";
  ok(WA.full.test(t) && WA.always.test(t) && !employeeScopedAccount(t),
    "single-protection(object): the case is decided by more than the account object");
  ok(!wholeAccountVested(t), "single-protection(object): the predicate fires with no account object");
}
{
  /* the EMPLOYEE-NARROWING refusal — everything else holds */
  const t = "Participants are fully vested in their elective deferral accounts at all times.";
  ok(WA.full.test(t) && WA.always.test(t), "single-protection(narrow): the case loses another condition too");
  ok(employeeScopedAccount(t), "single-protection(narrow): the narrowing test does not fire on its own case");
  ok(!wholeAccountVested(t), "single-protection(narrow): the predicate fires on an employee-narrowed account");
}
{
  /* the EMPLOYER ESCAPE inside that refusal — without it this is refused */
  const t = "The balance in each participant’s salary deferral, rollover, and safe-harbor accounts are 100% vested at all times.";
  ok(/\b(?:elective|defer(?:ral|red)|rollover)\b/i.test(t),
    "single-protection(escape): the case carries no employee narrowing, so the escape is not what saves it");
  ok(!employeeScopedAccount(t), "single-protection(escape): the employer escape does not reach safe-harbor money");
  ok(wholeAccountVested(t), "single-protection(escape): the predicate refuses a safe-harbor account list");
}
{
  /* the PER-MENTION design, against the sentence-wide alternative. This is the
   * one condition whose failure mode is publishing the OPPOSITE of the filing. */
  const t = "(f) Vesting The employee deferral accounts are 100% vested and non-forfeitable at all times, and employer contributions have a one-year vesting period.";
  ok(/\bemployer\b/i.test(t),
    "single-protection(per-mention): the case carries no employer word, so it cannot distinguish the two designs");
  ok(employeeScopedAccount(t),
    "single-protection(per-mention): a sentence-wide employer test would admit Cadence Bank and publish Immediate over a one-year schedule");
}
{
  /* the TWO-CLAIM label block, which belongs to the call site. It must fire on
   * the carve-out and NOT on the five whole-account positives. */
  const t = "Each participant is at all times 100% vested in their account, with the exception of amounts transferred from other plans, which may continue to be subject to the former plans' vesting requirements, as applicable.";
  ok(wholeAccountVested(t), "two-claim: Eastman's sentence must reach the gate before the label can be blocked");
  ok(SPONSOR_TWO_CLAIM.test(t), "two-claim: SPONSOR_TWO_CLAIM does not fire on Eastman's carve-out");
  for (const [why, p] of FIRE)
    ok(!SPONSOR_TWO_CLAIM.test(p), `two-claim: it must NOT fire on a clean positive — ${why}`);
}
{
  /* the ACCELERATION TRIGGER refusal, also at the call site, and the reason it
   * lives at the GATE: `accelerationOnlyVesting` reads this sentence's own word
   * "immediately" as a complete answer and would let the label through. */
  const t = "Participants will become immediately 100% vested in their account once they attain Normal Retirement Age of age 65, or if death or disability occurs while an employee.";
  ok(wholeAccountVested(t), "accel: Jmark's sentence satisfies the scope predicate (which is why the trigger test is needed)");
  ok(AV_TRIGGER.test(t), "accel: AV_TRIGGER does not fire on Jmark's sentence");
  for (const [why, p] of FIRE)
    ok(!AV_TRIGGER.test(p), `accel: it must NOT fire on a clean positive — ${why}`);
}

/* ---- 4. SLICED MUTANTS. Each deletes ONE condition from the shipped source
 * and must change the verdict on a named case. A control that cannot fail is
 * decorative; a mutation anchored on a string that has moved reads as "not
 * load-bearing", so `build` throws when the target string is absent. */
const SRC = readFileSync(`${R}/scripts/lib-4i.mjs`, "utf8");
const slice = (() => {
  const h = SRC.indexOf("const WA_FULL =");
  const e = SRC.indexOf("\n}", SRC.indexOf("export function wholeAccountVested"));
  if (h < 0 || e < 0) throw new Error("vesting-wholeaccount-test: the v211 block moved in lib-4i.mjs");
  return SRC.slice(h, e + 2).replace(/^export /gm, "");
})();
const build = (mutate) => {
  const s = mutate(slice);
  if (s === slice) throw new Error("a mutation did not land — its target string has moved in lib-4i.mjs");
  // eslint-disable-next-line no-new-func
  return new Function(`${s}\n return { wholeAccountVested, employeeScopedAccount };`)();
};
/* prove the slicer works UNMUTATED first: a broken slice makes every mutant
 * below pass vacuously, which is the shape that has cost this record twice. */
{
  const probe = build((s) => s + "\n/* probe */");
  for (const [why, t] of FIRE) if (!probe.wholeAccountVested(t))
    throw new Error(`the slice cannot reproduce its own positive (${why}) — every mutant below would be meaningless`);
  for (const [why, t] of SILENT) if (probe.wholeAccountVested(t))
    throw new Error(`the slice fires on its own refusal (${why}) — the slice is broken`);
}
const MUTANTS = [
  ["the full-vest marker", (s) => s.replace("WA_FULL.test(x) && ", ""),
    "A participant is 20% vested in their account at all times.", true],
  ["the unconditional marker", (s) => s.replace("WA_ALWAYS.test(x) && ", ""),
    "A participant is 100% vested in their account after three years of service.", true],
  ["the account object", (s) => s.replace("(WA_FWD.test(x) || WA_REV.test(x))", "true"),
    "Participants are immediately 100% vested in their voluntary contributions.", true],
  ["the employee-narrowing refusal", (s) => s.replace(" && !employeeScopedAccount(x)", ""),
    "Participants are fully vested in their elective deferral accounts at all times.", true],
  ["the following-clause narrowing (WA_EMP_MAKES)", (s) => s.replace("WA_EMP_MAKES.test(x) || ", ""),
    "Vesting All participants are fully vested in their account balance for contributions they make immediately upon entering the Plan.", true],
  /* the two arms the DIFFERENTIAL earned. Each probe is the sentence that would
   * have replaced a true multi-year employer schedule with `Immediate`. */
  ["the subset / demonstrative refusal (WA_SUBSET)", (s) => s.replace("!WA_SUBSET.test(x) && ", ""),
    "As a result, affected participants immediately became 100% vested in their accounts.", true],
  ["the trailing attributable-to narrowing (WA_ATTRIB)", (s) => s.replace(" || WA_ATTRIB.test(x)", ""),
    "Vesting - A participant is immediately fully vested with respect to the portion of their account attributable to participant contributions and related earnings.", true],
  ["the account-of-a-money-type narrowing (WA_ACCT_OF)", (s) => s.replace(" || WA_ACCT_OF.test(x)", ""),
    "Vesting and Forfeitures The Plan provides that the participant\u2019s account in salary reduction contributions are fully vested immediately at the participant\u2019s effective date of participation.", true],
  /* TWO CONDITIONS BLOCK DITSCH USA AND NEITHER IS NECESSARY ALONE — the
   * plural `rollovers?` in the shared vocabulary and the possessive form
   * `his or her contributions`. Priced one at a time each reads "necessary for
   * 0", which is the shape this record warns about: two mutually redundant
   * guards, where deleting BOTH is the real cost. So the mutation removes both
   * at once, and that pair IS load-bearing. The possessive form also has its
   * own single-protection case below ("their contributions", no type word at
   * all), which is what keeps it from being decoration. */
  ["the plural AND the possessive together (Ditsch is protected twice)",
    (s) => s.replace("|rollovers?", "|rollover").replace("|${WA_EMP_POSS})", ")"),
    "Vesting Each participant is immediately fully vested in the portion of his or her account attributable to his or her contributions (including rollovers) and earnings thereon.", true],
  ["the possessive employee form alone, on a sentence naming NO money type",
    (s) => s.replace("|${WA_EMP_POSS})", ")"),
    "Vesting Each participant is immediately fully vested in the portion of their account attributable to their contributions and earnings thereon.", true],
  ["the allocated-to-accounts narrowing (WA_EMP_ALLOC)", (s) => s.replace(" || WA_EMP_ALLOC.test(x)", ""),
    "Vesting and Forfeitures All participant contributions and earnings thereon allocated to the accounts of participants under the Plan are fully vested and nonforfeitable at all times.", true],
  /* THE REVERSE DIRECTION: deleting the employer escape must LOSE a positive,
   * not gain a refusal. Without it the predicate reads safe-harbor money as
   * employee money. */
  ["the employer escape inside the narrowing", (s) => s.replace(" || WA_EMPLOYER_NARROW.test(w)", ""),
    "Vesting The balance in each participant’s salary deferral, rollover, and safe-harbor accounts are 100% vested at all times.", false],
  /* and the REVERSED object arm, which ABM is the only case for */
  ["the reversed account object (WA_REV)", (s) => s.replace("|| WA_REV.test(x)", ""),
    "(c) Vesting The value of the participant’s account, including the Company’s matching portion, is fully vested at all times.", false],
];
for (const [why, mut, probeText, wantsFireAfter] of MUTANTS) {
  const m = build(mut);
  const got = m.wholeAccountVested(probeText);
  const shipped = wholeAccountVested(probeText);
  ok(got !== shipped,
    `MUTANT "${why}" is NOT load-bearing: the predicate still answers ${shipped} on its own case`);
  ok(got === wantsFireAfter,
    `MUTANT "${why}" flipped the wrong way: expected ${wantsFireAfter} after the mutation, got ${got}`);
}

console.log(`\nvesting-wholeaccount: ${FIRE.length} must-fire, ${SILENT.length} must-not-fire, `
  + `6 single-protection conditions, ${MUTANTS.length} sliced mutants (11 forward, 2 reverse)`);
console.log(bad ? `${bad} FAILURES` : "all v211 whole-account checks pass");
process.exit(bad ? 1 : 0);
