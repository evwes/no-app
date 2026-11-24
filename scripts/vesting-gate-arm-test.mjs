#!/usr/bin/env node
/* wampo — THE GATE FOR v214's VESTING SCOPE-GATE ARM.
 *
 *   node scripts/vesting-gate-arm-test.mjs
 *
 * Corpus-free and CI-safe: every case below is a SENTENCE lifted verbatim from
 * a filing that was READ, so this runs anywhere. The population-level pricing
 * of each condition lives in `scripts/vesting-arm-conditions.mjs`, which needs
 * the corpus; the reader-facing claims of this ship rest on that one, and this
 * one is the regression gate.
 *
 * FOUR SECTIONS:
 *   1. must-FIRE   — the spellings the arm exists to reach, one per cause
 *   2. must-NOT-FIRE — every refusal, each on the filing that earned it
 *   3. the GATE, not just the predicate — `employerNamed` is what ships, so
 *      the OBJABSENT half must be asked through `lib-vestslice`'s sliced gate
 *      and must come back `uvOnly: false`
 *   4. SLICED MUTANTS — one per condition, with the mutation KIND matched to
 *      the condition kind. *Neutering a REQUIRED condition makes the predicate
 *      always false, so every case "flips" and nothing is proved* — so a
 *      requirement is WIDENED to always-match and a refusal is NEUTERED, and
 *      every mutant carries a CONTROL case that must still answer correctly.
 */
import { readFileSync } from "node:fs";
import { unnarrowedFullVesting } from "./lib-4i.mjs";
import { scopeGate, UV_OFF } from "./lib-vestslice.mjs";

const R = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
let bad = 0;
const ok = (c, msg) => { if (!c) { bad++; console.log(`  FAIL ${msg}`); } };

/* ---- 1. MUST FIRE, AND MUST BE `employerNamed` -------------------------- */
const FIRE = [
  ["Stanford (44,011) — an ALWAYS word and no FULLNESS word, which v211's WA_FULL refuses",
    "Vesting – Participants are immediately vested in their accounts."],
  ["Cohesity + 241 others (209,547) — a FULLNESS word and no ALWAYS word: the MIRROR of Stanford",
    "Vesting: Participants are fully (100%) vested in their account balance."],
  ["Electrical Industry (32,016) — attributive, with a comma and an adjective inside the object",
    "Each participant has a fully vested, nonforfeitable interest in his (or her) account."],
  ["Entertainment Industry (31,362) — the object connector is `rights TO`, and no fullness word",
    "Vesting Participants have immediate vested and nonforfeitable rights to their accounts at all times."],
  ["Yale (26,186) — the PDF dropped every “ti” ligature to a SPACE and it is still correct",
    "Ves ng A par cipant is immediately vested in 100 percent of their contribu ons, the university core and matching contribu ons, and the earnings of their account."],
  ["TECO Energy (5,416) — REVERSED order: the employer noun FOLLOWS the money noun",
    "In addition, participants in the Plan are fully vested immediately in the contributions of the Company."],
  ["Turner Industries (10,844) — “the Employer PORTION of their accounts”",
    "Participants are immediately vested in the Employer portion of their accounts upon participation in the Plan."],
  ["Schwan's (11,139) — COMMAS inside arm 1's three-word window",
    "Vesting Participants are vested immediately in their 401(k), rollover, safe harbor matching, voluntary matching, merger accounts, and discretionary contributions plus actual earnings thereon."],
  ["Conservation International (675) — the MISSING APOSTROPHE: “the Plan Sponsors contributions”",
    "Vesting: Participants are vested immediately in their contributions and the Plan Sponsors contributions plus actual earnings thereon."],
  ["Lowe's — v211's own largest fixture must still fire through the widened predicate",
    "Each participant shall at all times have a 100% vested interest in the balance of their account."],
];
for (const [why, s] of FIRE) {
  const r = unnarrowedFullVesting(s);
  ok(r, `must FIRE and does not — ${why}`);
  ok(r && r.employerNamed, `fires but is NOT employerNamed, so the gate would not take it — ${why}`);
}

/* ---- 2. MUST NOT FIRE — every refusal, on the filing that earned it ----- */
const SILENT = [
  ["employee money, the DOMINANT correct refusal and the largest member of the whole bucket (Teamster-UPS, 451,730)",
    "Participants are vested immediately in their contributions plus actual earnings thereon."],
  ["UPMC (109,112) — pretax and after-tax, named as types",
    "Participants are always fully vested in their pretax and after-tax contributions."],
  ["employeeScopedAccount — St. Luke's, an account narrowed to elective deferral and rollover money",
    "Participants are fully and immediately vested in their elective deferral and rollover accounts."],
  ["UV_OBJ_EMPLOYEE's FORM words — Henry Schein (10,297): a 401(k) contribution IS the deferral",
    "(d) Vesting Participants are immediately vested in their 401(k) Contributions plus actual earnings thereon."],
  ["UV_OBJ_EMPLOYEE's FORM words — Tampa Bay Performing Arts (635): catch-up money",
    "Participants are immediately fully vested in their catch-up contributions (and the related earnings)."],
  ["SPONSOR_TWO_CLAIM — a service condition in the same sentence",
    "Participants are 100% vested in the Company's contributions after completing two years of service."],
  ["AV_TRIGGER — Ellington (279): an acceleration trigger is not a schedule",
    "PAYMENT OF BENEFITS Participants become fully vested in their accounts upon termination of service due to death, disability or normal retirement."],
  ["terminationOnlyVesting — the §411(d)(3) counterfactual",
    "In the event of the Plan being terminated, participants will become 100% vested in the value of the employer contributions."],
  ["UV_PLAN_TERM — IBEW Local 5 (3,525), where terminationOnlyVesting returns FALSE because its own past-tense exemption fires on the SUBJUNCTIVE",
    "PLAN TERMINATION If the Plan was to be terminated, all participants would become fully vested in their retirement benefits."],
  ["UV_PLAN_TERM — TripAdvisor (1,937): a PARTIAL termination",
    "In accordance with IRC provisions, all participants affected by the partial termination are fully vested in their accounts."],
  ["UV_CONTRACT_BOILER — Community Foundation of NW Indiana (10,478): the 403(b) regulatory criteria",
    "The individual owner of the contract is fully vested in the contract or account."],
  ["UV_CONTRACT_BOILER in the PLURAL — OCLC (1,007)",
    "The individual owners of the contracts are fully vested in the contracts and/or accounts."],
  ["UV_FORFEIT — Rolls-Royce (992): a forfeiture sentence stating a vesting condition EXISTS",
    "Participants that terminate employment prior to being fully vested in the annual discretionary 3% contributions, forfeit this portion of their account."],
  ["UV_FORFEIT's two-word negation — Novation (8)",
    "Forfeitures – Forfeitures occur upon termination of employment by a participant who is not fully vested in the Plan."],
  ["UV_FORFEIT's two-word negation — Honolulu Community Action (378)",
    "Forfeitures Participant accounts that are not fully vested at the time of termination may result in forfeitures."],
  ["UV_FORFEIT's BEFORE arm — Brown University (12,566): a forfeiture-and-transfer mechanic",
    "employment terminates before the date of full vesting, the contracts or certificates issued to the University for a participant are returned to the Plan Sponsor and amended to provide for a transfer of ownership in the vested amount of the account, if any, to the participant."],
  ["UV_DISTRIB — Princeton (15,468): “entitled to receive the full VESTED VALUE of his account” is a distribution rule",
    "Withdrawals and Distributions If the employment of any participant is terminated, or if such employee retires or resigns, the participant is entitled to receive the full vested value of his account."],
  ["UV_WOUND_UP — McDermott (11,425): the plan has wound up, so this is its history",
    "All terminated employees who were participants in the Plan were fully vested in their account balances at the Closing Date."],
  ["UV_WOUND_UP's `remained` — Birmingham-Southern (893)",
    "All participants remained fully vested in their account balances, and all account balances have been liquidated and distributed to participants as of June 30, 2025."],
  ["UV_SCHEDULE — CommonSpirit (41,166): a RANGE of schedules, and the noun is PLURAL so SPONSOR_TWO_CLAIM's singular `vesting schedule` cannot match",
    "Vesting Mergers and acquisitions have resulted in a variety of vesting schedules, ranging from 100% fully vested immediately to a three- to six-year graded schedule."],
  ["UV_SCHEDULE's `range from` — Construction Employees Group (2,328)",
    "Employees are fully vested within a range from immediately to 6 years depending on the employer and investment type."],
  ["UV_SERVICE's generalised modifier — Trustmark (1,251): “GRADUATED over six years of PLAN service”, which SPONSOR_TWO_CLAIM's four adjectives miss",
    "Participants become 100 percent vested in the remainder of their account balances graduated over six years of plan service."],
  ["UV_SERVICE — Bradford Prep (198): a service condition measured in HOURS",
    "Participants are one hundred percent vested after 1,000 hours of credited service."],
  ["UV_SERVICE — Otterbein (1,261): a 3-year cliff whose word “years” the PDF dropped",
    "A participant is 100 percent vested after 3 of credited service."],
  ["UV_HARDSHIP — Carnegie Mellon (19,279 + 6,411): being fully vested is an ELIGIBILITY CRITERION for a hardship withdrawal",
    "employees who meet all of the following: are fully vested; are 59½ years of age or older; and have a condition of hardship as outlined in the Plan document."],
  ["UV_GLYPH — G & G Organization (394) and LECS (358): “their ELECTIVE CONTRIBUTIONS”, invisible to the employee test because the font mapped “ti” to U+019F",
    "VESTING ParƟicipants are immediately vested in their elecƟive contribuƟions plus earnings thereon."],
  ["UV_GLYPH's digit alphabet — Jack Schmitt (228): “Plan te1mination”",
    "In the event of Plan te1mination, each respective participant's account, net of any termination fees, will become fully vested and will be distributed to each pa1ticipant in accordance with the Plan."],
  ["uvOcrLadder — TakeCare (196): a REAL Years/Percent ladder whose OCR destroyed every anchor",
    "…haring contributions plus actual eamings thereon is based on years ofservice as follows: Years of Vestins Service Vested Percentaqe I year 25% 2 years s0% 3 years 75% 4 years or more t00%"],
  ["UV_AUDIT_BOILER — NuWay Alliance (293): an auditor's MATERIALITY conclusion",
    "As all participant's accounts are fully vested, management concluded that no adjustment to the accompanying financial statements was required."],
  ["UV_DEMONSTRATIVE — Griffon (6,332): a demonstrative whose referent is in an earlier sentence",
    "The participants are fully vested in these funds at all times."],
  ["UV_DEMONSTRATIVE's noun widening — Ageless Men's Health (721) and MTX (420): “these CONTRIBUTION ACCOUNTS”",
    "If made, participants are always 100% vested in these contribution accounts."],
  ["UV_OWN — Nomura (4,997): the possessive FOLLOWS the money noun, so the windowed employee test cannot see it",
    "Participants are fully vested at all times in contributions made on their own behalf."],
  ["no forward object at all — McKinsey (35,552), this arm's measured RESIDUE and not a defect",
    "Vesting Contributions are 100% vested at all times."],
  ["the REVERSED shape — also the residue",
    "Participants' account balances are fully vested at all times."],
];
for (const [why, s] of SILENT)
  ok(!unnarrowedFullVesting(s), `must NOT fire and does — ${why}`);

/* ---- 3. THE GATE, NOT JUST THE PREDICATE -------------------------------
 * `employerNamed` is the ship. The OTHER half of the predicate is a MEASURED
 * REFUSAL — 111 plans / 207,003 readers, below the reader floor, and three
 * readings of 52 of its members produced eleven defects — so the sliced gate
 * must report `uvOnly: false` for it. Asked through `lib-vestslice`, which cuts
 * the gate out of lib-4i's own bytes, because *a measurement of what a page
 * publishes must apply every condition the page applies*: the predicate
 * returning a value is not the gate taking it. */
const OBJABSENT = [
  ["P&G (42,915) — the statutory QNEC is in SUBJECT position, so the forward object is “the employees”",
    "The QNECs are immediately 100% vested to the employees.", "The Procter & Gamble Company"],
  ["Harvard (39,413) — “their ACCUMULATIONS under the Plan” names no account and no employer",
    "Vesting Participants in the Plan are immediately 100% vested in their accumulations under the Plan.", "President & Fellows Of Harvard College"],
  ["Dungarvin (6,066) — “all SOURCES of contributions”",
    "Vesting Participants are immediately vested in all sources of contributions plus actual earnings thereon.", "Dungarvin Group, Inc."],
  ["CHA General Services (4,921) — the object is “the Plan”",
    "Vesting Participants are immediately fully vested in the Plan.", "Cha General Services, Inc."],
];
for (const [why, s, sponsor] of OBJABSENT) {
  const r = unnarrowedFullVesting(s);
  ok(r, `the predicate must still QUALIFY this so the census can size it — ${why}`);
  ok(r && !r.employerNamed, `must be employerNamed:false — ${why}`);
  const g = scopeGate(s, s, sponsor);
  ok(!g.uvOnly, `the GATE must refuse the OBJABSENT half and does not — ${why}`);
}
/* …and the CONTROL that keeps the three assertions above from passing because
 * the gate is simply inert: a `employerNamed` sentence must come back TRUE
 * through the same sliced gate, and must be FALSE with the arm switched off. */
{
  const s = "Vesting – Participants are immediately vested in their accounts.";
  ok(scopeGate(s, s, "Acme Widgets Inc.").uvOnly, "the sliced gate does not admit the arm's own largest case — every assertion in section 3 would pass vacuously");
  ok(!scopeGate(s, s, "Acme Widgets Inc.", 1, UV_OFF).uvOnly, "UV_OFF does not disable the arm — the before/after lever is broken");
  /* and pass 0 must be byte-identical to the pre-v214 gate: the arm is
   * `waPass === 1` only, which is the whole additive-by-construction claim */
  ok(!scopeGate(s, s, "Acme Widgets Inc.", 0).uvOnly, "the arm fires on waPass 0 — it is NOT additive by construction and pass 0 is no longer the shipped loop");
}

/* ---- 4. SLICED MUTANTS -------------------------------------------------- */
const SRC = readFileSync(`${R}/scripts/lib-4i.mjs`, "utf8");
const BLOCK = (() => {
  const h = SRC.indexOf("const UV_OBJ = ");
  const e = SRC.indexOf("\n}", SRC.indexOf("export function unnarrowedFullVesting"));
  if (h < 0 || e < 0) throw new Error("vesting-gate-arm-test: the v214 block moved in lib-4i.mjs");
  return SRC.slice(h, e + 2).replace(/^export /gm, "");
})();
const { SPONSOR_TWO_CLAIM, employeeScopedAccount } = await import("./lib-4i.mjs");
const { AV_TRIGGER, terminationOnlyVesting } = await import("./lib-quote.mjs");
const build = (mutate) => {
  const s = mutate(BLOCK);
  if (s === BLOCK) throw new Error("a mutation did not land — its target string has moved in lib-4i.mjs");
  // eslint-disable-next-line no-new-func
  return new Function("SPONSOR_TWO_CLAIM", "employeeScopedAccount", "AV_TRIGGER", "terminationOnlyVesting",
    `${s}\n return unnarrowedFullVesting;`)(SPONSOR_TWO_CLAIM, employeeScopedAccount, AV_TRIGGER, terminationOnlyVesting);
};
/* prove the slicer works UNMUTATED first — *a broken slice makes every mutant
 * pass vacuously*, which is the shape that has cost this record twice. */
{
  const probe = build((s) => s + "\n/* probe */");
  for (const [why, t] of FIRE) if (!probe(t))
    throw new Error(`the slice cannot reproduce its own positive (${why}) — every mutant below would be meaningless`);
  for (const [why, t] of SILENT) if (probe(t))
    throw new Error(`the slice fires on its own refusal (${why}) — the slice is broken`);
}
/* `kind` is REQUIREMENT or REFUSAL and it decides the mutation's shape:
 * widen a requirement to always-match, neuter a refusal to never-match. Each
 * row carries `probe` (must change answer) and `control` (must NOT change). */
const NEVER = "/(?!)/";
const MUTANTS = [
  ["REQUIREMENT UV_UNCOND — the claim must be full or always", (s) => s.replace("if (!UV_UNCOND.test(x)) return null;", "if (false) return null;"),
    "Participants are 20% vested in their accounts.", "Vesting – Participants are immediately vested in their accounts."],
  ["REQUIREMENT UV_OBJ — there must be a FORWARD object to judge", (s) => s.replace("const m = x.match(UV_OBJ);", "const m = x.match(/([\\s\\S]*)/);"),
    "Vesting Contributions are 100% vested at all times.", "Participants are vested immediately in their contributions plus actual earnings thereon."],
  ["REFUSAL the employee OBJECT test", (s) => s.replace("if (!UV_OBJ_EMPLOYER.test(obj) && UV_OBJ_EMPLOYEE.test(obj)) return null;", ""),
    "Participants are immediately vested in their deferrals and the balance of each account.", "Vesting – Participants are immediately vested in their accounts."],
  /* THE FOUR PROBES BELOW ARE DRAWN FROM `vesting-arm-conditions.mjs --show
   * <COND>`, WHICH PRINTS THE PLANS EACH CONDITION IS THE *SOLE* PROTECTION
   * FOR. Four hand-written probes failed here first, every one because a SECOND
   * condition also blocked it — *a case protected by TWO conditions cannot fail
   * for either, so it proves neither* — and the probe I would otherwise have
   * "fixed" by taste is the one the live data names for free. Each is a real
   * filing, and the figure beside it is the readers it protects. */
  ["REFUSAL SPONSOR_TWO_CLAIM — Eastman Chemical (14,676): a carve-out to another plan's schedule",
    (s) => s.replace("if (SPONSOR_TWO_CLAIM.test(x)) return null;", ""),
    "Each participant is at all times 100% vested in their account, with the exception of amounts transferred from other plans, which may continue to be subject to the former plans' vesting requirements, as applicable.", "Vesting – Participants are immediately vested in their accounts."],
  /* NYU Langone (50,458) — the LARGEST single-protection case of any condition
   * in this list, and v211's own `WA_EMP_MAKES` fixture: the employee narrowing
   * is a TRAILING clause, so `UV_OBJ_EMPLOYEE`'s windowed test cannot see it,
   * while the object carries the word "account" and would be `employerNamed`.
   * Without this refusal the arm publishes `Immediate` on a sentence scoped to
   * the money the participant puts in themselves. */
  ["REFUSAL employeeScopedAccount (v211's shipped predicate, reused not retyped)",
    (s) => s.replace("if (employeeScopedAccount(x)) return null;", ""),
    "Vesting All participants are fully vested in their account balance for contributions they make immediately upon entering the Plan.", "Vesting – Participants are immediately vested in their accounts."],
  ["REFUSAL AV_TRIGGER", (s) => s.replace("if (AV_TRIGGER.test(x)) return null;", ""),
    "PAYMENT OF BENEFITS Participants become fully vested in their accounts upon termination of service due to death, disability or normal retirement.", "Vesting – Participants are immediately vested in their accounts."],
  /* SGA Youth & Family Services (978) — and the reason it is `terminationOnly
   * Vesting`'s case rather than `UV_PLAN_TERM`'s is that this filing writes
   * "IF TERMINATED," with no noun at all, so every phrase-anchored
   * plan-termination test misses it and only the shipped display predicate's
   * structural reading catches it. (Its "particpants" typo is in the filing.) */
  ["REFUSAL terminationOnlyVesting (lib-quote's shipped display predicate) — SGA Youth (978)",
    (s) => s.replace("if (terminationOnlyVesting(x)) return null;", ""),
    "If terminated, particpants in the Plan would become 100 percent vested in their accounts.", "Vesting – Participants are immediately vested in their accounts."],
  ["REFUSAL UV_CONTRACT_BOILER", (s) => s.replace("const UV_CONTRACT_BOILER = /", `const UV_CONTRACT_BOILER = ${NEVER} || /`),
    "The individual owner of the contract is fully vested in the contract or account.", "Vesting: Participants are fully (100%) vested in their account balance."],
  ["REFUSAL UV_FORFEIT", (s) => s.replace("const UV_FORFEIT = /", `const UV_FORFEIT = ${NEVER} || /`),
    "Forfeitures Participant accounts that are not fully vested at the time of termination may result in forfeitures.", "Vesting – Participants are immediately vested in their accounts."],
  ["REFUSAL UV_DISTRIB", (s) => s.replace("const UV_DISTRIB = /", `const UV_DISTRIB = ${NEVER} || /`),
    "Withdrawals and Distributions If the employment of any participant is terminated, or if such employee retires or resigns, the participant is entitled to receive the full vested value of his account.", "Vesting – Participants are immediately vested in their accounts."],
  ["REFUSAL UV_PLAN_TERM", (s) => s.replace("const UV_PLAN_TERM = /", `const UV_PLAN_TERM = ${NEVER} || /`),
    "PLAN TERMINATION If the Plan was to be terminated, all participants would become fully vested in their retirement benefits.", "Vesting – Participants are immediately vested in their accounts."],
  ["REFUSAL UV_GLYPH", (s) => s.replace("const UV_GLYPH = /", `const UV_GLYPH = ${NEVER} || /`),
    "In the event of Plan te1mination, each respective participant's account, net of any termination fees, will become fully vested and will be distributed to each pa1ticipant in accordance with the Plan.", "Ves ng A par cipant is immediately vested in 100 percent of their contribu ons, the university core and matching contribu ons, and the earnings of their account."],
  ["REFUSAL UV_SERVICE", (s) => s.replace("const UV_SERVICE = /", `const UV_SERVICE = ${NEVER} || /`),
    "A participant is 100 percent vested after 3 of credited service.", "Vesting – Participants are immediately vested in their accounts."],
  ["REFUSAL UV_SCHEDULE", (s) => s.replace("const UV_SCHEDULE = /", `const UV_SCHEDULE = ${NEVER} || /`),
    "Employees are fully vested within a range from immediately to 6 years depending on the employer and investment type.", "Vesting – Participants are immediately vested in their accounts."],
  ["REFUSAL UV_HARDSHIP", (s) => s.replace("const UV_HARDSHIP = /", `const UV_HARDSHIP = ${NEVER} || /`),
    "employees who meet all of the following: are fully vested; are 59½ years of age or older; and have a condition of hardship as outlined in the Plan document.", "Vesting – Participants are immediately vested in their accounts."],
  ["REFUSAL UV_WOUND_UP", (s) => s.replace("const UV_WOUND_UP = /", `const UV_WOUND_UP = ${NEVER} || /`),
    "All terminated employees who were participants in the Plan were fully vested in their account balances at the Closing Date.", "Vesting – Participants are immediately vested in their accounts."],
  /* Resurgens P.C. (1,678) — a whole Service-Years/Percent TABLE welded in
   * front of a sentence that is TRUE on its own ("always 100% vested in their
   * safe harbor matching contributions"), and the table says matching and
   * profit sharing reach 100% only at THREE YEARS. So the sentence is right
   * about the safe-harbor pot and `Immediate` would be wrong about the plan,
   * and the digits-and-percent DENSITY is the only thing that sees it: the
   * table carries no "years of service" and no schedule word. */
  ["REFUSAL uvOcrLadder — Resurgens P.C. (1,678), a welded Years/Percent table",
    (s) => s.replace("const uvOcrLadder = (s) =>", "const uvOcrLadder = (s) => false &&"),
    "Service Years Matching Profit Sharing <1 0% 0% 1 0% 0% 2 0% 0% 3 100% 100% Participants are always 100% vested in their safe harbor matching contributions.", "Vesting – Participants are immediately vested in their accounts."],
  ["REFUSAL UV_AUDIT_BOILER", (s) => s.replace("const UV_AUDIT_BOILER = /", `const UV_AUDIT_BOILER = ${NEVER} || /`),
    "As all participant's accounts are fully vested, management concluded that no adjustment to the accompanying financial statements was required.", "Vesting – Participants are immediately vested in their accounts."],
  ["REFUSAL UV_DEMONSTRATIVE", (s) => s.replace("const UV_DEMONSTRATIVE = /", `const UV_DEMONSTRATIVE = ${NEVER} || /`),
    "If made, participants are always 100% vested in these contribution accounts.", "Vesting – Participants are immediately vested in their accounts."],
  ["REFUSAL UV_OWN", (s) => s.replace("const UV_OWN = /", `const UV_OWN = ${NEVER} || /`),
    "Participants are fully vested at all times in contributions made on their own behalf.", "Vesting – Participants are immediately vested in their accounts."],
  /* THE REVERSE DIRECTION: the `employerNamed` disjuncts must LOSE a positive
   * when removed, not gain a refusal — and the account one is Stanford's, the
   * case whose absence the arm exists for. */
  ["DISJUNCT UV_OBJ_ACCT must be load-bearing for Stanford (reverse: a positive is LOST)",
    (s) => s.replace("UV_OBJ_EMPLOYER.test(obj) || UV_OBJ_ACCT.test(obj) };", "UV_OBJ_EMPLOYER.test(obj) };"),
    "Vesting – Participants are immediately vested in their accounts.", "Participants are vested immediately in their contributions plus actual earnings thereon.", "named"],
];
for (const [why, mut, probeText, controlText, dim] of MUTANTS) {
  const m = build(mut);
  const read = (fn, t) => (dim === "named" ? (fn(t) ? !!fn(t).employerNamed : false) : !!fn(t));
  const got = read(m, probeText), shipped = read(unnarrowedFullVesting, probeText);
  ok(got !== shipped, `MUTANT "${why}" is NOT load-bearing: the predicate still answers ${shipped} on its own case`);
  /* *Give every mutation a control that some OTHER case still answers
   * correctly, or a mutant that simply broke the predicate reads as a
   * successful flip.* */
  ok(read(m, controlText) === read(unnarrowedFullVesting, controlText),
    `MUTANT "${why}" also changed its CONTROL case — the mutation broke the predicate rather than removing one condition`);
}

console.log(`\nvesting-gate-arm: ${FIRE.length} must-fire, ${SILENT.length} must-not-fire, `
  + `${OBJABSENT.length} gate-level refusals of the OBJABSENT half + 3 gate controls, `
  + `${MUTANTS.length} sliced mutants (${MUTANTS.length - 1} forward, 1 reverse), each with its own control`);
console.log(bad ? `${bad} FAILURES` : "all v214 scope-gate arm checks pass");
process.exit(bad ? 1 : 0);
