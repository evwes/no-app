#!/usr/bin/env node
/* wampo — READ THE MEMBERS v214's SCOPE-GATE ARM WOULD NEWLY REACH.
 *
 * `vesting-gate-census.mjs` decomposed the GATED bucket by cause and reported a
 * shape-independent UPPER BOUND — "a refused sentence makes an unconditional
 * full/immediate vesting claim whose object is not narrowed to employee money".
 * That bound is now a SHIPPED EXPORT, `unnarrowedFullVesting` in lib-4i.mjs, so
 * this instrument asks the PARSER's own predicate rather than a copy of it: if
 * the arm moves, this measurement moves with it, which is the whole reason the
 * bound was promoted into the parser instead of being re-typed here.
 *
 * WHAT IT SPLITS, AND WHY THE SPLIT IS THE DECISION. `unnarrowedFullVesting`
 * returns `employerNamed`, true when the object POSITIVELY names employer money
 * or the un-narrowed whole account and false when it merely FAILS the employee
 * test. *When a class is a semantic judgment, do not screen for the ABSENCE of
 * the good case; require the PRESENCE of the bad one* — an object that merely
 * lacks an employee word is exactly such an absence, so the two halves cannot
 * carry the same claim. This prints both, by readers and by plans, with a
 * seeded draw of each so the rate is estimated rather than ranked.
 *
 * THE SERVING AND PUBLISH CONDITIONS ARE THE LEDGER'S. Membership is
 * `p.cells.vesting.state`, computed by `lib-ledger.mjs`, which is what decides
 * what a reader sees — so an `absent` plan here is a reader looking at a blank
 * cell and a `withheld` plan is a reader seeing a quote with no label. Those
 * are different gains and are counted separately: absent -> withheld leaves
 * `vesting_shown` FLAT by construction (its denominator is the sum of the two),
 * and only withheld -> published moves the scalar.
 *
 * Usage:
 *   node scripts/vesting-gate-arm-read.mjs                      sizes only
 *   node scripts/vesting-gate-arm-read.mjs --draw EMPNAMED --lim 25 [--seed N]
 *   node scripts/vesting-gate-arm-read.mjs --rank OBJABSENT --lim 15 [--skip N]
 *   node scripts/vesting-gate-arm-read.mjs --state withheld ...
 */
import { buildLedger } from "./lib-ledger.mjs";
import { loadPlans } from "./lib-schema.mjs";
import { read } from "./lib-filingtext.mjs";
import { vestingQuoteOk } from "./lib-quote.mjs";
import { vestingSelection, scopeGate, UV_OFF } from "./lib-vestslice.mjs";
import { unnarrowedFullVesting } from "./lib-4i.mjs";

const argv = process.argv.slice(2);
const num = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? +argv[i + 1] : d; };
const str = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const LIM = num("--lim", 12), SKIP = num("--skip", 0);
const DRAW = str("--draw", ""), RANK = str("--rank", ""), STATE = str("--state", "absent");

/* form noise — the composite EFAST2 PDF carries the BLANK Form 5500 pages, and
 * line 6g(2) contains a vest word and a percentage, so a text-level screen must
 * exclude the form before counting. Copied from the census by reading it. */
const FORM = [/\.{5,}/, /123456789012/, /\b\d[a-z]\(\d\)/, /\bNumber of participants who\b/i,
  /\b(?:Form|Schedule [A-Z]\b.{0,20})5500\b/i, /\bnumber of deferred vested\b/i, /\bOMB No\b/i];
const isForm = (s) => FORM.some((re) => re.test(s));

/* ---- CONTROLS, ABOVE THE LOOP THAT USES THE PREDICATE --------------------
 * *A broken arm and an inert arm read the same zero*, and this whole script is
 * a count of one predicate's hits — so three cases from the census's own
 * fixture are asserted before anything is counted. Each would catch a
 * different failure: a predicate that never fires, one that fires on the
 * dominant CORRECT refusal, and one that has lost its `employerNamed` split. */
for (const [label, s, want] of [
  ["Stanford (an always-word, no fullness word)", "Vesting – Participants are immediately vested in their accounts.", "named"],
  ["Cohesity (a fullness word, no always-word)", "Vesting: Participants are fully (100%) vested in their account balance.", "named"],
  /* P&G is reached and is NOT `employerNamed`, and that is a PROPERTY OF THE
   * OBJECT TEST worth pinning rather than filing as a miss: "The QNECs are
   * immediately 100% vested to the employees" puts the statutory employer-money
   * term in SUBJECT position, so the forward object is "the employees" and
   * carries no employer word. *A predicate written to judge a WHOLE STRING is
   * not a predicate about its PREFIXES* — and the converse holds here: a
   * positional object test cannot see evidence that sits before the verb. */
  ["P&G (QNEC in SUBJECT position)", "The QNECs are immediately 100% vested to the employees.", "unnamed"],
  /* McKinsey (35,552) is NOT REACHED AT ALL, and pinning that is the point.
   * "Vesting Contributions are 100% vested at all times" has NO FORWARD OBJECT
   * — nothing follows the verb — so `UV_OBJ` finds nothing to judge and the arm
   * refuses. The same is true of the REVERSED shape ("participants' account
   * balances are fully vested"). Those two shapes are this arm's measured
   * RESIDUE, not an oversight: the bound this arm implements was computed with
   * the same object test, so the 612-plan figure never contained them. A ship
   * that later reaches them is a NEW measurement and must be sized as one. */
  ["McKinsey (no forward object at all — the RESIDUE)", "Vesting Contributions are 100% vested at all times.", "null"],
  ["the REVERSED shape — also the residue", "Participants' account balances are fully vested at all times.", "null"],
  ["Teamster-UPS (the dominant CORRECT refusal)", "Participants are vested immediately in their contributions plus actual earnings thereon.", "null"],
  ["Community Foundation (403(b) contract boilerplate)", "The individual owner of the contract is fully vested in the contract or account.", "null"],
  ["McDermott (the plan has wound up)", "All terminated employees who were participants in the Plan were fully vested in their account balances at the Closing Date.", "null"],
  /* the two defects the RANKED reading of this arm's own output earned */
  ["Princeton (a DISTRIBUTION rule, not a vesting rule)", "Withdrawals and Distributions If the employment of any participant is terminated, or if such employee retires or resigns, the participant is entitled to receive the full vested value of his account.", "null"],
  ["Brown (a forfeiture mechanic: BEFORE the date of full vesting)", "employment terminates before the date of full vesting, the contracts or certificates issued to the University for a participant are returned to the Plan Sponsor and amended to provide for a transfer of ownership in the vested amount of the account, if any, to the participant.", "null"],
  /* …and the two correct ATTRIBUTIVE members a copula requirement would have
   * cost, which is why `UV_DISTRIB` keys on the governing verb instead */
  ["Electrical Industry (attributive and CORRECT)", "Each participant has a fully vested, nonforfeitable interest in his (or her) account.", "named"],
  ["Lowe's, v211's own fixture (attributive and CORRECT)", "Each participant shall at all times have a 100% vested interest in the balance of their account.", "named"],
  /* the four the RANKED reading of OBJABSENT earned — the first would have been
   * a FALSE LABEL on 41,166 readers through the loop's existing IMMED branch */
  ["CommonSpirit (a RANGE of schedules, plural)", "Vesting Mergers and acquisitions have resulted in a variety of vesting schedules, ranging from 100% fully vested immediately to a three- to six-year graded schedule.", "null"],
  ["Carnegie Mellon (hardship-withdrawal ELIGIBILITY)", "employees who meet all of the following: are fully vested; are 59½ years of age or older; and have a condition of hardship as outlined in the Plan document.", "null"],
  ["Henry Schein (401(k) contributions ARE the deferral)", "(d) Vesting Participants are immediately vested in their 401(k) Contributions plus actual earnings thereon.", "null"],
  ["Griffon (a demonstrative with no referent)", "The participants are fully vested in these funds at all times.", "null"],
  ["Nomura (“on their own behalf”)", "Participants are fully vested at all times in contributions made on their own behalf.", "null"],
  /* …and the control that keeps the 401(k) arm from over-refusing: a sentence
   * naming a deferral type BESIDE employer money is a claim about both */
  ["Schwan's (401(k) BESIDE safe harbor matching — must SURVIVE)", "Vesting Participants are vested immediately in their 401(k), rollover, safe harbor matching, voluntary matching, merger accounts, and discretionary contributions plus actual earnings thereon.", "named"],
  /* the two the SECOND ranked reading earned */
  ["IBEW Local 5 (§411(d)(3), and terminationOnlyVesting says FALSE)", "PLAN TERMINATION If the Plan was to be terminated, all participants would become fully vested in their retirement benefits.", "null"],
  ["FirstBank (two columns welded; “7” for the ti ligature)", "stock in the ESOP account to cash and transfer this cash to the 401(k) savings arrangement por7on of the Plan in ac- Par7cipants become fully vested in discre7onary contribu- cordance with the par7cipant’s investment direc7ons.", "null"],
  /* …and Yale, damaged the SAME WAY with a SPACE, which must SURVIVE — the
   * control that stops the weld arm being keyed on the damage itself */
  ["Yale (ligature dropped to a SPACE, readable and CORRECT)", "Ves ng A par cipant is immediately vested in 100 percent of their contribu ons, the university core and matching contribu ons, and the earnings of their account.", "named"],
  /* the three the SEEDED DRAW earned — a rate, not a bound */
  ["Novation (“not fully vested”, the negation as TWO WORDS)", "Forfeitures – Forfeitures occur upon termination of employment by a participant who is not fully vested in the Plan.", "null"],
  ["Honolulu Community Action (same class)", "Forfeitures Participant accounts that are not fully vested at the time of termination may result in forfeitures.", "null"],
  ["Bradford Prep (a service condition measured in HOURS)", "Participants are one hundred percent vested after 1,000 hours of credited service.", "null"],
  ["NuWay Alliance (an auditor's MATERIALITY conclusion)", "As all participant's accounts are fully vested, management concluded that no adjustment to the accompanying financial statements was required.", "null"],
  /* …and a drawn member that must SURVIVE the `not`-negation widening, since
   * "100 percent vested immediately" is a hair from "not ... vested" */
  ["Dallas Cowboys (must SURVIVE the negation arm)", "A participant is 100 percent vested immediately upon participation in the Plan.", "unnamed"],
  /* the four the SECOND seeded draw earned, two of them EMPLOYEE-MONEY claims
   * let through by one substituted glyph — the precise harm the gate exists for */
  ["G & G Organization (“their elective contributions” through U+019F)", "VESTING ParƟicipants are immediately vested in their elecƟive contribuƟions plus earnings thereon.", "null"],
  ["LECS (the same filing template, same glyph)", "401(K) VESTING ParƟicipants are immediately vested in their elecƟive contribuƟions plus earnings thereon.", "null"],
  ["Jack Schmitt (§411(d)(3) spelled “te1mination”)", "In the event of Plan te1mination, each respective participant's account, net of any termination fees, will become fully vested and will be distributed to each pa1ticipant in accordance with the Plan.", "null"],
  ["Otterbein (a 3-year cliff whose word “years” the PDF dropped)", "A participant is 100 percent vested after 3 of credited service.", "null"],
  /* …and the typographic-apostrophe control, without which the glyph arm would
   * refuse the arm's own correct institutional members */
  ["Argonne (a curly apostrophe must SURVIVE the glyph arm)", "Vesting Participants are immediately vested in the Laboratory’s contributions, plus actual earnings thereon upon entry into the Plan.", "unnamed"],
  ["Purdue Research Foundation (same control)", "Participants are also immediately vested in the Organization’s contributions.", "unnamed"],
]) {
  const r = unnarrowedFullVesting(s);
  const got = r === null ? "null" : (r.employerNamed ? "named" : "unnamed");
  if (got !== want) throw new Error(`arm-read control FAILED: ${label} -> ${got}, wanted ${want}`);
}

const L = buildLedger({ withStatus: false });
const d = loadPlans();
const empContrib = new Map();
for (const r of d.rows) empContrib.set(`${d.get(r, "ein")}|${d.get(r, "pn")}`, d.get(r, "contribEmployer") || 0);

const B = { EMPNAMED: [], OBJABSENT: [] };
let popN = 0, popPpl = 0, gatedN = 0, gatedPpl = 0, unjudN = 0, unjudPpl = 0;
for (const p of L.plans) {
  const c = p.cells.vesting;
  if (c.state !== STATE) continue;
  if (STATE === "absent" && c.why.startsWith("no features")) continue;
  popN++; popPpl += p.ppl;
  const raw = read(p.ack);
  if (!raw) { unjudN++; unjudPpl += p.ppl; continue; }
  const sel = vestingSelection(raw);
  const refused = [];
  let passes = false;
  for (const cd of sel.vestSentences || []) {
    const s = typeof cd === "string" ? cd : (cd && (cd.s || cd.text)) || "";
    if (!s || !vestingQuoteOk(s) || isForm(s)) continue;
    if (scopeGate(s, sel.t, p.sponsorName || "", 1, UV_OFF).passes) { passes = true; break; }
    refused.push(s);
  }
  if (passes || !refused.length) continue;
  gatedN++; gatedPpl += p.ppl;
  const hits = refused.map((s) => [s, unnarrowedFullVesting(s)]).filter(([, r]) => r);
  if (!hits.length) continue;
  const row = {
    name: p.sponsorName, ein: p.ein, pn: p.pn, ppl: p.ppl, ack: p.ack,
    emp: empContrib.get(`${p.ein}|${p.pn}`) || 0,
    hits,
  };
  (hits.some(([, r]) => r.employerNamed) ? B.EMPNAMED : B.OBJABSENT).push(row);
}

const sum = (a) => a.reduce((s, r) => s + r.ppl, 0);
console.log(`state=${STATE}: ${popN} plans / ${popPpl.toLocaleString()} readers (attachment read)`);
console.log(`  of which GATED (oracle accepts, every arm of the scope gate refuses): ${gatedN} / ${gatedPpl.toLocaleString()}`);
console.log(`  unjudged (no cached filing text): ${unjudN} / ${unjudPpl.toLocaleString()}\n`);
for (const k of ["EMPNAMED", "OBJABSENT"])
  console.log(`${String(sum(B[k])).padStart(9)} ppl  ${String(B[k].length).padStart(5)} pl  ${k}`);
console.log(`${String(sum(B.EMPNAMED) + sum(B.OBJABSENT)).padStart(9)} ppl  ${String(B.EMPNAMED.length + B.OBJABSENT.length).padStart(5)} pl  TOTAL reached by the arm`);
const noEmp = [...B.EMPNAMED, ...B.OBJABSENT].filter((r) => r.emp <= 0);
console.log(`\nof the reached, plans whose 5500 reports NO employer contribution: ${noEmp.length} / ${sum(noEmp).toLocaleString()}`);
console.log("  (NOT a refusal: a plan can vest a match immediately and report none in the measured year,");
console.log("   and the ledger field is about what the notes SAY. Reported so the reader of this number knows.)");

/* mulberry32 — a NAMED, reproducible generator. *RANK to pick what to READ;
 * draw RANDOMLY to estimate a RATE*: the ranked members of this bucket are big
 * institutional filings and are systematically unlike its bulk. */
function drawFrom(pool, n, seed) {
  let z = seed >>> 0;
  const rnd = () => { z = (z + 0x6D2B79F5) >>> 0; let x = z; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const p = [...pool], out = [];
  while (out.length < n && p.length) out.push(p.splice(Math.floor(rnd() * p.length), 1)[0]);
  return out;
}
const show = (rows) => {
  for (const r of rows) {
    console.log(`\n=== ${r.ppl} ppl · ${r.name} · ${r.ein}|${r.pn} · ${r.ack} · empContrib=${r.emp}`);
    for (const [s, v] of r.hits) console.log(`  [${v.employerNamed ? "NAMED" : "absent"}] ${s}\n      obj= ${JSON.stringify(v.obj)}`);
  }
};
if (DRAW && B[DRAW]) { console.log(`\n--- SEEDED DRAW of ${DRAW} (seed ${num("--seed", 20261124)}) ---`); show(drawFrom(B[DRAW], LIM + SKIP, num("--seed", 20261124)).slice(SKIP)); }
if (RANK && B[RANK]) { console.log(`\n--- RANKED BY READERS, ${RANK} ---`); show([...B[RANK]].sort((a, b) => b.ppl - a.ppl).slice(SKIP, SKIP + LIM)); }
console.log("\nThese figures are DERIVED. Re-run; never copy them forward.");
