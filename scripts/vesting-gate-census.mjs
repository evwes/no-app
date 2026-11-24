#!/usr/bin/env node
/* wampo — DECOMPOSE THE VESTING SCOPE-GATE BUCKET BY CAUSE.
 *
 * `vesting-quote-ceiling.mjs` splits the vesting-absent bucket into REACH /
 * GATED / NONE and reports GATED as the largest addressable class. GATED is a
 * POPULATION, NOT A DEFECT: the gate exists to refuse a vesting claim about
 * EMPLOYEE money, which is vested by law, and the page renders a quote with no
 * label as *the whole answer* (app.js:3928 says so in those words). So the
 * question this script answers is not "how big is GATED" but "what fraction of
 * GATED is the gate getting WRONG", and it answers it by splitting on causes
 * each of which was derived by READING members, never by screening for the
 * absence of a good case.
 *
 * THE FIVE CAUSES, and what each is:
 *
 *  CONTRAST  — the sentence joins an employee-scoped contribution phrase to a
 *              capitalized-entity possessive one ("their contributions and the
 *              Organization's contributions"). The contrast IS the evidence
 *              that the second pot is the employer's, whatever noun the
 *              auditor defined, so this needs no noun vocabulary. A GATE
 *              DEFECT.
 *  PORTION   — "<entity>('s) … contribution portion of their accounts", the
 *              construction v212's own examples are written in. Arm 1 misses
 *              it when the word "contribution" is absent ("the Employer
 *              portion of their accounts"); arm 2 misses it always, because it
 *              demands "accounts" immediately after the noun. A GATE DEFECT.
 *  LADDER    — a refused sentence CARRIES a real graded ladder or vesting
 *              table. The gate is irrelevant here: an EARLIER arm should have
 *              labelled it and did not, so the repair is in the graded arms
 *              and this population must not be counted as gate work.
 *  WHOLEACCT — "Participants are 100% vested in their accounts" with no
 *              always-word, which v211's `wholeAccountVested` refuses because
 *              it requires one.
 *  EMPONLY   — every refused sentence scopes vesting to the participant's own
 *              money. THE GATE IS RIGHT. Split by whether the filing reports
 *              EMPLOYER CONTRIBUTIONS at all, because a plan with none has no
 *              employer money to vest and the field is moot rather than
 *              missing — that is a CEILING, not a backlog.
 *
 * Every figure is DERIVED through the shipped code: the selection and the gate
 * come from `lib-vestslice.mjs` (a slice of lib-4i that throws if the
 * boundaries move) and the publish oracle is the imported `vestingQuoteOk`.
 *
 * Usage: node scripts/vesting-gate-census.mjs [--show CAUSE] [--lim N] [--skip N]
 */
import { readFileSync } from "node:fs";
import { buildLedger } from "./lib-ledger.mjs";
import { loadPlans } from "./lib-schema.mjs";
import { read } from "./lib-filingtext.mjs";
import { vestingQuoteOk, AV_TRIGGER } from "./lib-quote.mjs";
import { vestingSelection, scopeGate } from "./lib-vestslice.mjs";
import { SPONSOR_TWO_CLAIM, employeeScopedAccount } from "./lib-4i.mjs";
import { PLAN_ENDS, PLAN_ENDS_IF } from "./vesting-termination-quote.mjs";
const isTerm = (s) => /\bvest\w+/i.test(s) && PLAN_ENDS.test(s) && PLAN_ENDS_IF.test(s);

const argv = process.argv.slice(2);
const num = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? +argv[i + 1] : d; };
const SHOW = (() => { const i = argv.indexOf("--show"); return i >= 0 ? argv[i + 1] : ""; })();
const LIM = num("--lim", 8), SKIP = num("--skip", 0);

/* form noise, copied from vesting-quote-ceiling.mjs (read, not remembered) */
const FORM = [/\.{5,}/, /123456789012/, /\b\d[a-z]\(\d\)/, /\bNumber of participants who\b/i,
  /\b(?:Form|Schedule [A-Z]\b.{0,20})5500\b/i, /\bnumber of deferred vested\b/i, /\bOMB No\b/i];
const isForm = (s) => FORM.some((re) => re.test(s));

/* A capitalized token that must never be read as the employer however it is
 * positioned. `Participant` reached the enumeration 25 times over 30,661
 * readers, so this list is a measurement and not a precaution. */
const EMPWORD = /^(?:Participant|Participants|Employee|Employees|Member|Members|Plan|Plans|Trust|Fund|Trustee|Trustees|Account|Accounts|Individual|Individuals|Staff|Worker|Workers|Beneficiary|Code|IRS|Service|Internal|Roth|Rollover|Elective|Voluntary|Salary|Deferral|Deferrals|Pre|After)$/;
const CAP = "[A-Z][A-Za-z&.\\-]{1,24}";

const EMPLOYEE_POT = "(?:their|his|her|participants['’]|employees['’])\\s+(?:own\\s+)?(?:\\w+\\s+){0,3}contributions?";
const ENTITY_POT = "(?:the\\s+)?(" + CAP + ")(?:'s|’s|s'|s’)\\s+(?:\\w+\\s+){0,3}contributions?";
/* BOTH WORD ORDERS, as two regexes rather than one alternation — the capture
 * group would land at a different index in each branch, and a helper reading
 * `m[1]` would then read the wrong token on half the population. The first
 * version had only the forward arm and could not see Bank Street College's
 * "100% vested in both the College's and their contributions" (1,153 readers):
 * *a class also has an ORDER*. */
export const VEST_CONTRAST_FWD = new RegExp("\\b" + EMPLOYEE_POT + "[^.]{0,40}?\\band\\s+" + ENTITY_POT);
export const VEST_CONTRAST_REV = new RegExp("\\b" + ENTITY_POT + "[^.]{0,40}?\\b(?:and|plus)\\s+(?:the\\s+)?" + EMPLOYEE_POT.replace("contributions?", "contributions?|\\btheir\\s+own\\b"));
const contrast = (s) => {
  const m = s.match(VEST_CONTRAST_FWD) || s.match(VEST_CONTRAST_REV);
  return m && !EMPWORD.test(m[1]) ? m : null;
};
/* …and the HONEST MAXIMUM for "the employer noun is outside arm 1's closed
 * vocabulary", with no contrast required at all: any capitalized possessive in
 * contribution position that is not an employee word. It is reported as a
 * SEPARATE, WIDER bucket rather than folded into CONTRAST, because without the
 * contrast the only thing identifying the entity as the employer is the capital
 * letter — which is the auditor's defined-term convention and not a guarantee. */
export const VEST_POSSESS = new RegExp("\\b(?:the\\s+)?(" + CAP + ")(?:'s|’s|s'|s’)\\s+(?:\\w+\\s+){0,3}contributions?\\b");
export const VEST_PORTION = new RegExp(
  "\\bvest\\w*\\b[^.]{0,80}?\\b(?:in|of)\\s+(?:the\\s+)?(" + CAP + ")(?:'s|\u2019s|s'|s\u2019)?\\s+"
  + "(?:\\w+\\s+){0,4}?(?:portion|share)\\s+of\\s+(?:their|his|her|the)\\s+accounts?\\b");
/* a ladder or a Years/Percent table INSIDE the refused sentence */
const LADDER = /\b\d{1,3}\s?(?:%|percent)\b[^.]{0,80}?\b(?:after|following|upon|year|years)\b|\byears?\s+of\s+(?:vesting|credited|continuous)?\s*service\b[^.]{0,60}?\b\d{1,3}\s?(?:%|percent)?\b/i;
const WHOLEACCT = /\b(?:100\s?(?:%|percent)|fully)\s*\(?(?:100%?)?\)?\s*vested\s+in\s+(?:their|his|her|the)\s+(?:entire\s+|whole\s+)?(?:plan\s+)?accounts?(?:\s+balances?)?\b/i;

/* ---- THREE SHAPES THE FIRST CUT OF THIS CENSUS PUT IN "GATE RIGHT" --------
 * Found by READING the largest members of the EMPONLY_EMP bucket, which is the
 * bucket whose size carries the whole refusal. All three are real gate defects
 * and all three were invisible to the four buckets above, so the first run
 * UNDER-stated gate work and OVER-stated the ceiling. *A screen that finds its
 * own conclusion in every member it reads has not been shown the members that
 * would refute it* — these refute it, and they were found by printing the
 * bucket rather than by trusting its name.
 *
 * ALWAYS_NOFULL — v211's `wholeAccountVested` requires a FULLNESS word
 *   (`WA_FULL`: 100% / fully / full) as well as an always-word. Stanford
 *   (44,011) files "Vesting – Participants are immediately vested in their
 *   accounts." — a whole-account claim with an always-word and NO fullness
 *   word, so `WA_FULL` refuses it. This is the mirror of WHOLEACCT_STRICT,
 *   which has the fullness word and lacks the always-word; between them they
 *   say the conjunction is too strong in BOTH directions.
 * ALL_AMOUNTS — `universal` keys on the literal "all contributions". Jones
 *   Lang LaSalle (48,832) files "All amounts contributed to the Plan are
 *   immediately 100% vested", which is the same claim with a different noun.
 * ABBREV — arm 1's noun list spells out `non-elective`; Procter & Gamble
 *   (42,915) writes "The QNECs are immediately 100% vested to the employees",
 *   and a QNEC is employer money BY STATUTE (IRC 401(k)(12)). */
const ALWAYS_NOFULL = /\b(?:immediate(?:ly)?|always|at all times)\b[^.]{0,40}?\bvested\b[^.]{0,30}?\b(?:in|of)\s+(?:their|his|her|the)\s+(?:plan\s+)?accounts?\b|\bvested\b[^.]{0,30}?\b(?:in|of)\s+(?:their|his|her|the)\s+(?:plan\s+)?accounts?\b[^.]{0,40}?\b(?:at all times|immediate(?:ly)?|always)\b/i;
const ALL_AMOUNTS = /\ball\s+(?:amounts?|monies|moneys|funds?|sums?)\s+(?:contributed|credited|allocated|deposited)\b[^.]{0,60}?\bvest|\bvest\w*\b[^.]{0,60}?\ball\s+(?:amounts?|monies|moneys|funds?)\s+(?:contributed|credited|allocated)\b/i;
const ABBREV = /\b(?:QNECs?|QMACs?|QACAs?|SHNECs?|QNEC\/QMAC)\b[^.]{0,80}?\bvest|\bvest\w*\b[^.]{0,80}?\b(?:QNECs?|QMACs?|SHNECs?)\b/i;
/* …and the employee-narrowing that must still refuse each of them: an account
 * narrowed to the participant's own money is not the whole account, whatever
 * always-word sits beside it. Imported from lib-4i rather than retyped. */
const empScoped = (s) => employeeScopedAccount(s);

const ent = (m) => m && !EMPWORD.test(m[1]);

/* ---- AND A BOUND THAT DOES NOT DEPEND ON MY BUCKET SHAPES AT ALL ---------
 * TWO consecutive readings of EMPONLY_EMP — the bucket whose size carries the
 * whole refusal — found real gate defects inside it, and the SECOND reading
 * found four MORE after the first three had been reclassified: Harvard's
 * "immediately 100% vested in their ACCUMULATIONS under the Plan" (39,413),
 * McKinsey's bare defined term "CONTRIBUTIONS are 100% vested at all times"
 * (35,552), the Entertainment Industry plan's "immediate vested and
 * nonforfeitable RIGHTS TO their accounts at all times" (31,362) and the
 * Electrical Industry plan's "fully vested, nonforfeitable INTEREST IN his (or
 * her) account" (32,016). Every pass finds another spelling, which is the
 * signature of a CLOSED VOCABULARY against an OPEN CLASS, and it means every
 * shape bucket above is a floor and the "gate right" bucket is a ceiling.
 *
 * So this asks the question the other way round, with no noun list: does the
 * sentence make an UNCONDITIONAL full-or-immediate vesting claim whose OBJECT
 * is not narrowed to the participant's own money? `employeeScopedAccount` is
 * the SHIPPED refusal and is imported, not retyped; the object test extends it
 * to the contribution nouns, because "vested in their contributions" is the
 * dominant CORRECT refusal and must stay refused. This is an upper bound on
 * "the gate may be wrong here", not a proposal — a sentence can satisfy it and
 * still be unpublishable for reasons no predicate sees. */
const VEST_OBJ = /\bvest\w*\b[^.]{0,45}?\b(?:in|to|of|interest\s+in|rights?\s+to|with\s+respect\s+to)\s+([^.]{0,80})/i;
const OBJ_EMPLOYEE = /\b(?:their|his|her|participant'?s?|employees?'?)\s+(?:own\s+)?(?:\w+\s+){0,2}contributions?\b|\b(?:elective|deferral|deferrals|salary|pre-?\s?tax|after-?\s?tax|post-?\s?tax|roth|rollover|rollovers|voluntary|mandatory|individual|personal|employee|participant)\b/i;
const OBJ_EMPLOYER = /\b(?:employer|company|corporation|matching|match|non-?elective|nonelective|profit[- ]sharing|discretionary|safe[\s-]*harbor|QNEC|QMAC|sponsor)\b/i;
const UNCOND = /\b(?:100\s?%|100\s+percent|one\s+hundred\s+percent|fully|full)\b[^.]{0,40}?\bvest|\bvest\w*\s+(?:100\s?%|100\s+percent)|\b(?:immediate(?:ly)?|always|at all times)\b[^.]{0,45}?\bvest|\bvest\w*\b[^.]{0,45}?\b(?:at all times|immediate(?:ly)?|always)\b/i;
/* FOUR REFUSALS, EACH EARNED BY READING A MEMBER OF THE FIRST DRAW rather than
 * by imagining what could go wrong. The first draw of 25 was 21/25 by plans and
 * only 47% by READERS, because one 10,478-reader member was a false positive —
 * so the refusals are priced, not guessed:
 *  ACCEL   — Ellington Management (279): "become fully vested in their accounts
 *            UPON TERMINATION OF SERVICE DUE TO DEATH, DISABILITY OR NORMAL
 *            RETIREMENT". `SPONSOR_TWO_CLAIM` has no death/disability arm, so
 *            the bound admitted an acceleration-only clause. `AV_TRIGGER` is
 *            EXPORTED by lib-quote for exactly this and is imported here.
 *  CONTRACT— Community Foundation of Northwest Indiana (10,478, the single
 *            largest false positive): "…are legally enforceable against the
 *            insurer or custodian by the individual owner of the contract …
 *            and · The individual owner of the contract is fully vested in the
 *            contract or account." That is the 403(b) regulatory CRITERIA
 *            boilerplate quoted out of the regulation, not this plan's rule.
 *  FORFEIT — Mercy University (2,381): "As contributions are fully vested,
 *            there are no forfeitures in the Plan." A forfeiture-accounting
 *            sentence; `vRank` already demotes these in the selection, which is
 *            the parser agreeing they are weak evidence.
 *  OCRLADDER—TakeCare Insurance (196): a REAL Years/Percent ladder whose OCR
 *            mangled every anchor ("years ofservice", "t00%"), so neither the
 *            service arm nor a percent arm reaches it. Keyed on the digits-and-
 *            percent DENSITY rather than on any spelling, because the spellings
 *            are what the OCR destroyed. */
const ACCEL = AV_TRIGGER;
/* PLURAL. The first version read "individual OWNER of the CONTRACT" and OCLC
 * (1,007) files "The individual OWNERS of the CONTRACTS are fully vested in the
 * contracts and/or accounts" — *a fix for one phrasing of a class is not a fix
 * for the class*, met inside this very cycle on a refusal I had just written. */
const CONTRACT_BOILER = /\bindividual\s+owners?\s+of\s+the\s+contracts?\b|\blegally\s+enforceable\s+against\s+the\s+insurer\b/i;
/* …and a forfeiture sentence that states a vesting condition EXISTS is the
 * strongest possible evidence AGAINST an immediate reading: Rolls-Royce (992)
 * files "Participants that terminate employment PRIOR TO BEING FULLY VESTED in
 * the annual discretionary 3% contributions, FORFEIT this portion". The first
 * version keyed on "no forfeitures", which is the opposite sentence. */
const FORFEIT_ACCT = /\bno\s+forfeitures?\b|\bthere\s+(?:are|were)\s+no\s+forfeit|\bprior\s+to\s+(?:being\s+)?(?:\w+\s+){0,2}vest\w*|\bforfeit\w*\b[^.]{0,40}?\bnon-?vest|\bnon-?vest\w*\b[^.]{0,40}?\bforfeit/i;
/* THE PLAN HAS WOUND UP, so "participants became fully vested" is this plan's
 * own HISTORY and not its rule. Four of the second draw's eight false
 * positives were this, including its largest (McDermott, 11,425) — and a
 * past-tense wind-down claim must not license an "Immediate" label for a plan
 * that no longer exists. Present-tense "are fully vested" is the class itself
 * and must survive, so the arm is anchored on the PAST participle beside the
 * vest word, never on the mere presence of a date. */
const WOUND_UP = /\b(?:became|were|was|has\s+been|have\s+been|had\s+been)\b[^.]{0,45}?\bvest\w+|\bvest\w+[^.]{0,30}?\b(?:at\s+the\s+)?closing\s+date\b|\bplan['’]s\s+termination\b|\bceased\s+contributions\b|\bplan\s+is\s+frozen\b|\bno\s+impact\s+to\s+the\s+operations\b/i;
const OCR_LADDER = (s) => ((s.match(/\b\d{1,3}\s?(?:%|percent)/gi) || []).length >= 3)
  || /\bvest\w*\s+percenta/i.test(s) || /\byears?\s*of\s*vest/i.test(s);

function gateMayBeWrong(s) {
  if (!UNCOND.test(s)) return false;
  if (SPONSOR_TWO_CLAIM.test(s)) return false;          // two claims, or a service condition
  if (isTerm(s)) return false;                           // the §411(d)(3) counterfactual
  if (employeeScopedAccount(s)) return false;            // the SHIPPED refusal
  if (ACCEL.test(s)) return false;
  if (CONTRACT_BOILER.test(s)) return false;
  if (FORFEIT_ACCT.test(s)) return false;
  if (OCR_LADDER(s)) return false;
  if (WOUND_UP.test(s)) return false;
  const m = s.match(VEST_OBJ);
  if (!m) return false;
  const obj = m[1];
  return OBJ_EMPLOYER.test(obj) || !OBJ_EMPLOYEE.test(obj);
}

const L = buildLedger({ withStatus: false });
const d = loadPlans();
const empContrib = new Map();
for (const r of d.rows) empContrib.set(`${d.get(r, "ein")}|${d.get(r, "pn")}`, d.get(r, "contribEmployer") || 0);

const B = { CONTRAST: [], POSSESS: [], PORTION: [], LADDER: [], WHOLEACCT_STRICT: [], ALWAYS_NOFULL: [], ALL_AMOUNTS: [], ABBREV: [], WHOLEACCT: [], EMPONLY_NOEMP: [], EMPONLY_EMP: [], UNJUD: [] };
let absentN = 0, absentPpl = 0, gatedN = 0, gatedPpl = 0, mayWrongN = 0, mayWrongPpl = 0;
const MAYWRONG = [];

/* THE WITHHELD POPULATION IS PART OF THIS QUESTION AND MY FIRST PASS OMITTED
 * IT. The immediate loop runs on `!out.vesting`, which is true of every plan in
 * the ledger's `withheld` state as well — those plans have a QUOTE and no
 * LABEL. So a gate widening there moves withheld -> published, which is the only
 * move that raises `vesting_shown`; an absent -> withheld move leaves the scalar
 * flat by construction, as v212 and v213 both demonstrated. Sizing a gate
 * change on the absent bucket alone therefore prices the half that CANNOT move
 * the metric and ignores the half that can. */
const W = { CONTRAST: [], PORTION: [], POSSESS: [] };
let withheldN = 0, withheldPpl = 0, wGated = 0, wGatedPpl = 0;
for (const p of L.plans) {
  if (p.cells.vesting.state !== "withheld") continue;
  withheldN++; withheldPpl += p.ppl;
  const raw = read(p.ack);
  if (!raw) continue;
  const sel = vestingSelection(raw);
  const refused = [];
  let passes = false;
  for (const cd of sel.vestSentences || []) {
    const s = typeof cd === "string" ? cd : (cd && (cd.s || cd.text)) || "";
    if (!s || !vestingQuoteOk(s) || isForm(s)) continue;
    if (scopeGate(s, sel.t, p.sponsorName || "").passes) { passes = true; break; }
    refused.push(s);
  }
  if (passes || !refused.length) continue;
  wGated++; wGatedPpl += p.ppl;
  const row = { name: p.sponsorName, ein: p.ein, pn: p.pn, ppl: p.ppl, ack: p.ack, sents: refused };
  if (refused.some((s) => LADDER.test(s))) continue;      // an earlier-arm question
  if (refused.some((s) => contrast(s))) W.CONTRAST.push(row);
  else if (refused.some((s) => ent(s.match(VEST_PORTION)))) W.PORTION.push(row);
  else if (refused.some((s) => ent(s.match(VEST_POSSESS)))) W.POSSESS.push(row);
}

for (const p of L.plans) {
  const c = p.cells.vesting;
  if (c.state !== "absent" || c.why.startsWith("no features")) continue;
  absentN++; absentPpl += p.ppl;
  const row = { name: p.sponsorName, ein: p.ein, pn: p.pn, ppl: p.ppl, ack: p.ack };
  const raw = read(p.ack);
  if (!raw) { B.UNJUD.push(row); continue; }
  const sel = vestingSelection(raw);
  const refused = [];
  let passes = false;
  for (const cd of sel.vestSentences || []) {
    const s = typeof cd === "string" ? cd : (cd && (cd.s || cd.text)) || "";
    if (!s || !vestingQuoteOk(s) || isForm(s)) continue;
    if (scopeGate(s, sel.t, p.sponsorName || "").passes) { passes = true; break; }
    refused.push(s);
  }
  if (passes || !refused.length) continue;         // REACH or NONE — not this bucket
  gatedN++; gatedPpl += p.ppl;
  row.sents = refused;
  if (refused.some(gateMayBeWrong)) { mayWrongN++; mayWrongPpl += p.ppl; MAYWRONG.push(row); }
  /* ORDER MATTERS AND IS NOT ARBITRARY: LADDER is tested FIRST because a
   * filing carrying a real schedule is an EARLIER-arm defect whatever else its
   * sentences say, and counting it as gate work would credit a gate widening
   * with readers only the graded arm can serve. */
  if (refused.some((s) => LADDER.test(s))) B.LADDER.push(row);
  else if (refused.some((s) => contrast(s))) B.CONTRAST.push(row);
  else if (refused.some((s) => ent(s.match(VEST_PORTION)))) B.PORTION.push(row);
  else if (refused.some((s) => ent(s.match(VEST_POSSESS)))) B.POSSESS.push(row);
  else if (refused.some((s) => ALWAYS_NOFULL.test(s) && !empScoped(s))) B.ALWAYS_NOFULL.push(row);
  else if (refused.some((s) => ALL_AMOUNTS.test(s) && !empScoped(s))) B.ALL_AMOUNTS.push(row);
  else if (refused.some((s) => ABBREV.test(s))) B.ABBREV.push(row);
  else if (refused.some((s) => WHOLEACCT.test(s))) {
    /* SPLIT, because v211 earned the always-word DELIBERATELY: lib-4i.mjs:383
     * says in terms that without it "a participant is 100% vested in their
     * account AFTER THREE YEARS" reads as immediate. So the only members worth
     * a number are those where the always-word is the ONLY thing missing —
     * present tense, no plan-termination condition, no service condition, no
     * subset marker. Everything else in this bucket is the guard working. */
    const strict = refused.filter((s) => WHOLEACCT.test(s)
      && !isTerm(s) && !SPONSOR_TWO_CLAIM.test(s)
      && !/\b(?:affected|impacted|such|these|those|certain)\s+(?:participants?|employees?|accounts?)\b/i.test(s)
      && !/\b(?:were|was|became|had been|remained)\b/i.test(s));
    (strict.length ? B.WHOLEACCT_STRICT : B.WHOLEACCT).push({ ...row, sents: strict.length ? strict : row.sents });
  }
  else if ((empContrib.get(`${p.ein}|${p.pn}`) || 0) > 0) B.EMPONLY_EMP.push(row);
  else B.EMPONLY_NOEMP.push(row);
}

const sum = (a) => a.reduce((s, r) => s + r.ppl, 0);
console.log(`vesting ABSENT (attachment read): ${absentN} plans / ${absentPpl.toLocaleString()} readers`);
console.log(`of which GATED (oracle accepts, scope gate refuses): ${gatedN} plans / ${gatedPpl.toLocaleString()} readers\n`);
const NOTE = {
  LADDER: "a refused sentence CARRIES a ladder/table — an EARLIER-arm defect, NOT gate work",
  CONTRAST: "employee phrase AND a capitalized entity's contributions — a GATE defect",
  POSSESS: "a capitalized entity's contributions with NO contrast — wider, weaker evidence",
  PORTION: "\"<entity> … portion of their accounts\" — a GATE defect",
  ALWAYS_NOFULL: "whole account + an ALWAYS word, no FULLNESS word - v211's WA_FULL refuses it (Stanford)",
  ALL_AMOUNTS: "\"all amounts contributed ... are 100% vested\" - `universal` wants the word contributions (JLL)",
  ABBREV: "QNEC/QMAC - employer money by statute, spelled as an abbreviation (P&G)",
  WHOLEACCT_STRICT: "whole account, present tense, unconditional — the always-word is the ONLY thing missing",
  WHOLEACCT: "whole account vested, no always-word — v211's arm refuses it",
  EMPONLY_EMP: "employee-money only AND the filing reports employer contributions — GATE RIGHT, source ceiling",
  EMPONLY_NOEMP: "employee-money only AND the filing reports NO employer contribution — GATE RIGHT, field moot",
  UNJUD: "no cached filing text",
};
for (const k of ["CONTRAST", "POSSESS", "PORTION", "WHOLEACCT_STRICT", "ALWAYS_NOFULL", "ALL_AMOUNTS", "ABBREV", "WHOLEACCT", "LADDER", "EMPONLY_EMP", "EMPONLY_NOEMP", "UNJUD"])
  console.log(`${String(sum(B[k])).padStart(9)} ppl  ${String(B[k].length).padStart(5)} pl  ${k.padEnd(13)} ${NOTE[k]}`);
console.log(`\nUPPER BOUND, shape-independent — a refused sentence makes an UNCONDITIONAL full/immediate\nvesting claim whose object is NOT narrowed to employee money: ${mayWrongN} plans / ${mayWrongPpl.toLocaleString()} readers`);
const DRAWN = (() => {
  if (SHOW !== "MAYWRONG_DRAW") return [];
  /* mulberry32: a NAMED, reproducible generator. `Math.random` would make the
   * draw unrepeatable and therefore uncitable. *RANK to pick what to READ;
   * draw RANDOMLY to estimate a RATE* — the ranked members of this bucket are
   * big institutional filings and are systematically unlike its bulk. */
  let z = (num("--seed", 20261124)) >>> 0;
  const rnd = () => { z = (z + 0x6D2B79F5) >>> 0; let x = z; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const pool = [...MAYWRONG], out = [];
  while (out.length < LIM && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out;
})();
for (const r of DRAWN.slice(SKIP)) {
  console.log(`\n=== ${r.ppl} ppl · ${r.name} · ${r.ein}|${r.pn} · ${r.ack}`);
  for (const s of r.sents.filter(gateMayBeWrong)) console.log(`    ${s}`);
}
if (SHOW === "MAYWRONG") for (const r of [...MAYWRONG].sort((a,b)=>b.ppl-a.ppl).slice(SKIP, SKIP + LIM)) {
  console.log(`\n=== ${r.ppl} ppl · ${r.name} · ${r.ein}|${r.pn} · ${r.ack}`);
  for (const s of r.sents.filter(gateMayBeWrong)) console.log(`    ${s}`);
}
console.log(`\nGATE-ADDRESSABLE in ABSENT (CONTRAST + PORTION) = ${(sum(B.CONTRAST) + sum(B.PORTION)).toLocaleString()} readers / ${B.CONTRAST.length + B.PORTION.length} plans  [absent -> withheld: a QUOTE, scalar FLAT]`);
console.log(`\nWITHHELD bucket: ${withheldN} plans / ${withheldPpl.toLocaleString()} readers; of those GATED ${wGated} / ${wGatedPpl.toLocaleString()}`);
for (const k of ["CONTRAST", "PORTION", "POSSESS"])
  console.log(`${String(sum(W[k])).padStart(9)} ppl  ${String(W[k].length).padStart(5)} pl  W.${k}`);
console.log(`GATE-ADDRESSABLE in WITHHELD (CONTRAST + PORTION) = ${(sum(W.CONTRAST) + sum(W.PORTION)).toLocaleString()} readers / ${W.CONTRAST.length + W.PORTION.length} plans  [withheld -> published: a LABEL, scalar MOVES]`);

if (SHOW && B[SHOW]) {
  const rows = [...B[SHOW]].sort((a, b) => b.ppl - a.ppl).slice(SKIP, SKIP + LIM);
  for (const r of rows) {
    console.log(`\n=== ${r.ppl} ppl · ${r.name} · ${r.ein}|${r.pn} · ${r.ack}`);
    for (const s of r.sents) console.log(`    ${s}`);
  }
}
console.log("\nThese figures are DERIVED. Re-run; never copy them forward.");

/* ---- THE FIXTURE IS VERIFIED, NOT DECORATIVE --------------------------------
 * `data/fixtures/vesting-gate-read.json` records the members READ by hand. A
 * pin that does not identify a real plan is worthless and *a count that omits
 * its own motivating case looks exactly like a count that includes it*, so this
 * mode asserts, by ACK: the plan exists, its reader count still matches, and
 * every `defect` and `refuse` member is STILL IN THE GATED BUCKET this census
 * computes. It THROWS on a miss rather than reporting one, because a pin that
 * can be missed silently is not a pin.
 *   node scripts/vesting-gate-census.mjs --verify-fixture
 * `unread` members are exempt from the bucket check by their own label, and
 * `earlier_arm_not_the_gate` members are exempt because the whole point of that
 * list is that the gate is not their repair. */
if (argv.includes("--verify-fixture")) {
  const FX = JSON.parse(readFileSync(new URL("../data/fixtures/vesting-gate-read.json", import.meta.url), "utf8"));
  const byAck = new Map();
  for (const r of d.rows) byAck.set(d.get(r, "ack"), d.get(r, "partEOY") || d.get(r, "participants") || 0);
  const gatedAcks = new Set([...Object.values(B).flat(), ...MAYWRONG].map((r) => r.ack));
  const bad = [];
  let checked = 0, inGated = 0;
  const groups = [["defect", FX.defect, true], ["refuse", FX.refuse, true],
    ["earlier_arm", FX.earlier_arm_not_the_gate, false],
    ["termination", FX.published_termination_counterfactual.members, false]];
  for (const [g, list, mustBeGated] of groups) for (const m of list) {
    checked++;
    if (!byAck.has(m.ack)) { bad.push(`${g}/${m.name}: ack ${m.ack} is in NO row of plans-all`); continue; }
    const live = byAck.get(m.ack);
    if (m.ppl && live !== m.ppl) bad.push(`${g}/${m.name}: pinned ${m.ppl} readers, store says ${live}`);
    if (gatedAcks.has(m.ack)) inGated++;
    else if (mustBeGated && m.cause !== "unread") bad.push(`${g}/${m.name} (${m.ack}): pinned as a GATED member and the census does not place it there — the bucket moved under the fixture`);
  }
  console.log(`\nFIXTURE: ${checked} pinned acks checked, ${inGated} still in the gated bucket`);
  if (bad.length) { for (const b of bad) console.log(`  FAIL ${b}`); throw new Error(`fixture verification failed on ${bad.length} pin(s)`); }
  console.log("FIXTURE ok — every pinned ack exists, every reader count matches, every gated pin is still gated");
}
