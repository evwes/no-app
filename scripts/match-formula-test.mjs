/* THE v198 MATCH-FORMULA ARMS, tested through the SHIPPED function.
 *
 * WHY THIS EXISTS. The owner asked why PSEG quotes an employer match and shows
 * no "Formula:" line. Its sentence defeats every arm of the chain in
 * extractPlanFeatures TWICE — the word "match" arrives AFTER the numbers, and a
 * possessive sits between "of" and "first":
 *
 *   "...contributes an amount equal to 50% of each Participant's first 8% of
 *    eligible compensation ... as its matching contribution"
 *
 * `mfWidened` adds both shapes. It is appended LAST in the chain, so it can
 * only fire where every existing arm returned null — measured over every stored
 * matchText: 0 existing formulas change, 122 plans / 197,324 participants gain
 * one.
 *
 * THE REFUSAL IS THE RISKY HALF AND IS TESTED HARDEST. A range or a cap yields
 * a tidy pair and publishing it OVERSTATES the filing. Every must-refuse case
 * below is a real sentence from a real plan, named with its participant count,
 * because the cost of getting this wrong is a wrong number in front of them.
 */
import { mfWidened, mfMixedFraction, mfEqualTo, mfEqualToWords, mfMisreadRateUnderCap,
  mfMisreadCompoundCap, mfFiniteVerb, MF_FVERB,
  extractPlanFeatures as extractPlanFeatures205 } from "./lib-4i.mjs";

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const got = (t) => { const m = mfWidened(t); return m ? `${m[1]}/${m[2]}` : null; };

/* ---- MUST EXTRACT, every one a real filing ---------------------------- */
const EXTRACT = [
  // PSEG pn=004 (4,114 ppl) — the motivating case. "matching" AFTER the pair,
  // possessive before "first". Arm (b).
  ["The Participant's Employer contributes an amount equal to 50% of each Participant's first 8% of eligible compensation made as Deferred Deposits and/or Nondeferred Deposits as its matching contribution to the Plan.",
   "50/8"],
  // Michelin (19,906 ppl) — "matching" BEFORE, possessive blocks it. Arm (a).
  ["The Company makes a matching contribution equal to 100% of each participant's first 3% of pre-tax contributions.",
   "100/3"],
  // Rentokil (28,927 ppl) — the largest gain.
  ["The Company’s matching contribution was 50% of the participant's first 7% of compensation.",
   "50/7"],
  // UniFirst (13,504 ppl)
  ["The Company made matching contributions to the Plan equal to 100% of each participant's first 3% of eligible compensation.",
   "100/3"],
];

/* ---- MUST REFUSE: a range or a cap is not a flat rate ------------------ */
const REFUSE = [
  // BAE Systems, 58,830 ppl — the largest and the whole reason for the guard.
  ["The Employer generally contributes between 50% and 100% of the first 6% of Plan compensation that a participant defers.",
   "a RANGE (between 50% and 100%)"],
  // TRC Companies, 9,355 ppl — slipped through the first attempt because the
  // window was measured from the start of the MATCH, not of the RATE.
  ["The Company matching contribution formula is a basic match of up to 50% of each participant's first 6% of compensation.",
   "a CAP (up to 50%)"],
  // Rose-Hulman, 1,076 ppl
  ["The Plan provides an additional matching contribution of up to 100% of each participant's first 4% of pay.",
   "a CAP (up to 100%)"],
];

/* ---- MUST REFUSE: no formula at all ----------------------------------- */
const SILENT = [
  ["The Company may make a discretionary matching contribution as determined by the Board.", "discretionary, no numbers"],
  ["Participants vest 20% per year and are 100% vested after five years of credited service.", "a VESTING sentence with two percentages"],
  ["", "empty"],
];

for (const [t, want] of EXTRACT) ok(got(t) === want, `MUST EXTRACT ${want}, got ${got(t)} — ${t.slice(0, 64)}`);
for (const [t, why] of REFUSE) ok(got(t) === null, `MUST REFUSE ${why}, got ${got(t)} — ${t.slice(0, 64)}`);
for (const [t, why] of SILENT) ok(got(t) === null, `MUST REFUSE ${why}, got ${got(t)}`);

/* ---- NEGATIVE CONTROL, one per condition, each required to FAIL BY NAME.
 * A control that cannot fail is decorative, so each mutation is asserted to
 * have LANDED and then required to change at least one verdict. ---------- */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const SRC = readFileSync(new URL("./lib-4i.mjs", import.meta.url), "utf8");

/* LOADING A MUTANT: A `data:` MODULE CANNOT RESOLVE A RELATIVE IMPORT.
 *
 * The mutants below used to load from a base64 `data:` URL, which has no base
 * to resolve `./lib-quote.mjs` against — so the moment v201 gave lib-4i its
 * first relative import, EVERY negative control in this file died with
 * ERR_UNSUPPORTED_RESOLUTION and the prep gate failed the run. (It failed it
 * before the download, which is what that gate is for.)
 *
 * So the mutant goes to a temp FILE and its relative specifiers are rewritten
 * to absolute file URLs — the same shape `diff-parser.mjs` has always used.
 * The rewrite is general rather than a special case for one specifier, because
 * the next import added to lib-4i must not break this file again. */
const MUT_DIR = mkdtempSync(join(tmpdir(), "mf-mutant-"));
const SCRIPTS = new URL(".", import.meta.url).href.replace(/\/$/, "");
let mutantSeq = 0;
async function loadMutant(source) {
  const rebased = source.replace(/(\sfrom\s*)(["'])\.\/([^"']+)\2/g,
    (_m, kw, q, rest) => `${kw}${q}${SCRIPTS}/${rest}${q}`);
  if (/\sfrom\s*["']\.\//.test(rebased))
    throw new Error("a relative import survived the rebase — the mutant would fail to resolve and every control below would pass vacuously");
  const f = join(MUT_DIR, `mutant-${++mutantSeq}.mjs`);
  writeFileSync(f, rebased);
  return import(`file://${f}`);
}
/* and prove the loader works on the UNMUTATED source before any control
 * depends on it: a loader that throws makes every control below a skip. */
{
  const probe = await loadMutant(SRC);
  if (typeof probe.extractPlanFeatures !== "function")
    throw new Error("the mutant loader cannot load the shipped source unchanged — every negative control below would be meaningless");
}
const slice = (() => {
  const h = SRC.indexOf("const MF_RATE =");
  const e = SRC.indexOf("\n}", SRC.indexOf("export function mfWidened"));
  if (h < 0 || e < 0) throw new Error("match-formula-test: the v198 block moved in lib-4i.mjs");
  return SRC.slice(h, e + 2).replace(/export function mfWidened/, "function mfWidened");
})();
const build = (mutate) => {
  const s = mutate(slice);
  if (s === slice) throw new Error("negative control did not land — the target string moved");
  // eslint-disable-next-line no-new-func
  return new Function(`${s}\n return mfWidened;`)();
};
const CONTROLS = [
  ["the range/cap refusal",
   (s) => s.replace("if (rateAt > 0 && MF_RANGE.test(t.slice(Math.max(0, rateAt - 40), rateAt))) return null;", ""),
   REFUSE],
  ["the possessive allowance",
   (s) => s.replace("(?:the |each |a |an )?(?:[A-Za-z’'()]+ ){0,3}", "(?:the )?"),
   EXTRACT],
];
console.log("NEGATIVE CONTROL, one per condition:");
for (const [label, mutate, cases] of CONTROLS) {
  const f = build(mutate);
  const broke = cases.filter(([t, want]) => {
    const m = f(t); const v = m ? `${m[1]}/${m[2]}` : null;
    return v !== (cases === REFUSE ? null : want);
  });
  console.log(`  drop ${label}: changes ${broke.length} of ${cases.length} verdicts`);
  if (!broke.length) fails.push(`the control for ${label} changed NOTHING — it is decorative`);
}

/* ======================================================================
 * v199. Three arms and a gate, every case a real filing with its
 * participant count, because each one is a number in front of those people.
 * ====================================================================== */
let n199 = 0;
const is = (c, m) => { n199++; if (!c) fails.push(m); };
const pair = (f, t) => { const m = f(t); return m ? `${m[1]}/${m[2]}` : null; };

/* ---- MIXED FRACTIONS. The generic arms read the DENOMINATOR as the rate,
 * so CBRE published a twentieth of its real match to 55,809 people. ----- */
const FRAC = [
  ["The Company matches its employee’s contributions up to 66-2/3% of the first 6% of the employee’s annual compensation (up to a maximum annual matching contribution of $6,000).", "66.67/6", "CBRE Services, 55,809 ppl"],
  ["Employer matching contributions – The Company matches 66 2/3% of participant contributions, up to 6% of eligible compensation deferred to the Plan.", "66.67/6", "Daimler Truck, 8,508 ppl — the space-separated spelling"],
  ["The matching contribution for management employees is equal to 133 1/3% of the first 3% of the employee’s compensation the employee elected to defer.", "133.33/3", "DirecTV, 8,330 ppl — a rate ABOVE 100%"],
  ["The Company may make a discretionary match of 33-1/3% of each participant’s contribution, up to a maximum of 6% of the participant’s total compensation.", "33.33/6", "JAC Products, 1,234 ppl"],
];
for (const [t, want, who] of FRAC) is(pair(mfMixedFraction, t) === want, `mixed fraction MUST read ${want} (${who}), got ${pair(mfMixedFraction, t)}`);
is(mfMixedFraction("The Company matches 50% of the first 6% of eligible compensation.") === null,
  "mfMixedFraction MUST stay silent on a plain formula — it is first in the chain and must not shadow it");

/* ---- THE "equal to" CONNECTORS ---------------------------------------- */
const EQ = [
  ["Company matching contributions is equal to 100%, up to 6% of each participants’ eligible compensation.", "100/6", "Universal City, 24,228 ppl — a COMMA where the shipped arm demands 'of'"],
  ["The Company matched the participant’s contribution in an amount equal to 50% up to the first 5% of employee elective deferrals.", "50/5", "Alro Steel, 5,327 ppl"],
];
for (const [t, want, who] of EQ) is(pair(mfEqualTo, t) === want, `mfEqualTo MUST read ${want} (${who}), got ${pair(mfEqualTo, t)}`);

/* ---- THE RATE IN WORDS. "equal to the deferrals" IS 100%, and that single
 * inference is all this arm owns. ------------------------------------- */
const WORDS = [
  ["The CHP and NYEEI Sponsors will make matching contributions equal to the employees’ salary deferral contributions up to 3% of eligible compensation.", "100/3", "Mount Sinai, 75,936 ppl"],
  ["The matching contribution is in an amount equal to the employee’s elective deferrals that do not exceed 4% of the employee’s compensation for the Plan year.", "100/4", "ON Semiconductor, 6,525 ppl"],
];
for (const [t, want, who] of WORDS) is(pair(mfEqualToWords, t) === want, `mfEqualToWords MUST read ${want} (${who}), got ${pair(mfEqualToWords, t)}`);
const WORDS_REFUSE = [
  ["The Sponsors may contribute a matching contribution equal to half of the employee elective deferrals, not to exceed 2% of compensation.", "Hebrew Home at Riverdale, 2,084 ppl — HALF is a rate, and 100% would overstate it"],
  ["The employer’s discretionary matching contribution is an amount equal to one-half of the employees’ contributions, up to 6% of compensation.", "Loffler Companies, 683 ppl"],
  /* These two were the reason a sentence-wide band guard existed. It was
   * removed for blocking six CORRECT extractions (Mars, 66,642 ppl) and
   * protecting none — see the comment in lib-4i.mjs. Both must still be
   * refused, now by the arms' own "equal to" anchor, and these assertions are
   * what proves that removal was safe rather than merely convenient. */
  ["Union participants receive a 60% employer matching contribution on salary deferrals from 2% up to the first 10% of the participant’s compensation.", "American Rock Salt, 463 ppl — a BAND, refused by shape now that the guard is gone"],
  ["In general, participant contributions eligible for an employer matching contribution range from 0% to 8% of base pay.", "Lockheed Martin, 22,570 ppl — a range and no rate at all"],
];
for (const [t, who] of WORDS_REFUSE) is(mfEqualToWords(t) === null && mfEqualTo(t) === null, `the v199 arms MUST BOTH refuse: ${who}`);

/* ---- THE MISREAD GATE. Publishing a wrong formula is worse than
 * publishing none, and the quote survives either way. ------------------ */
const GATE_TRUE = [
  ["1% of the first 6% of pay", "Certain participating employers provide a match of 100% up to 1% of compensation, plus 50% in excess of 1% up to 6% of compensation.", "CommonSpirit Health, 127,392 ppl"],
  ["2% of the first 6% of pay", "The Company matches Elective Deferrals at a rate of 200% for the first 2% of the Participant's Eligible Compensation during the Plan year and 50% of the Elective Deferrals thereafter up to a maximum of 6%.", "Boston Scientific, 34,105 ppl"],
  ["1% of the first 10% of pay", "Participants are automatically enrolled in the Plan at 4% of eligible compensation, increased each year by 1% up to 10%, unless the participant opts out.", "DPR Construction, 11,689 ppl — an AUTO-ESCALATION sentence, no match in it"],
];
/* v200 — rate == cap. The queue asked whether that is a real design or a
 * second misread shape and warned it was one measurement, not a quiet
 * widening. Measured over all 75 published `N% of the first N%` plans: 13 hold
 * a better candidate for the rate in their own sentence, 62 do not. So the
 * guard became `rate <= cap` and the DISCRIMINATOR is unchanged — these three
 * are withheld by the same evidence as the three above them. */
GATE_TRUE.push(
  ["6% of the first 6% of pay", "The Company will make a matching contribution of 50% up to the first 6% of eligible compensation that a participant contributes to the Plan for union employees and 100% up to the first 6% for all others.", "Alliance Laundry Systems, 3,527 ppl — the CAP published as the rate"],
  ["0.5% of the first 0.5% of pay", "Years of Eligible Service Employer Match to Employee Contributions After 1 year 100% up to 0.50% of eligible compensation", "Appalachian Regional Healthcare, 7,523 ppl"],
  ["4% of the first 4% of pay", "eligible participants receive the following Company discretionary match: Rule 60 Salaried 200% up to 4% of participant deferral", "Kent Corporation, 2,563 ppl"],
);
for (const [f, t, who] of GATE_TRUE) is(mfMisreadRateUnderCap(f, t) === true, `the gate MUST withhold "${f}" (${who})`);
const GATE_FALSE = [
  ["50% of the first 6% of pay", "The Company matches 50% of the first 6% of eligible compensation.", "the commonest real formula in the country"],
  ["100% of the first 3% of pay", "equal to 100% up to the first 3% of employee deferrals and 50% on the next 2%.", "a safe-harbor basic match"],
  ["66.67% of the first 6% of pay", "The Company matches 66-2/3% of the first 6% of compensation.", "the mixed-fraction arm's own output must survive the gate"],
  ["3% of the first 6% of pay", "The Company matches 3% of the first 6% of compensation.", "rate under cap but NO larger number in the sentence — an unusual design, not a misread"],
  ["Varies by employer group", "whatever", "a non-numeric formula string"],
];
/* v200 — and the 62 that must keep publishing. `rate == cap` IS a legal
 * design, which is exactly why the test could not be the equality: it has to
 * be the same evidence. Each of these states its formula verbatim. */
GATE_FALSE.push(
  ["10% of the first 10% of pay", "a non-discretionary matching contribution equal to 10% of the first 10% of the eligible employee's compensation contributed to the Plan.", "The All Roads Company, 1,217 ppl — rate==cap stated VERBATIM"],
  ["10% of the first 10% of pay", "For 2025, the Company made a matching contribution of 10% of deferrals on the first 10% of compensation.", "Steel Warehouse, 1,964 ppl"],
  ["10% of the first 10% of pay", "The Company's matching policy is equal to 10% of participant elective deferral contributions not to exceed 10% of participant elective deferral contributions.", "Metz Culinary Management, 8,274 ppl — odd but as filed"],
);
for (const [f, t, who] of GATE_FALSE) is(mfMisreadRateUnderCap(f, t) === false, `the gate MUST NOT withhold "${f}" (${who})`);

/* ---- v200's SECOND GATE: the defect can be in the CAP, and the rate test is
 * blind to it by construction. 20 plans / 34,578 ppl, and 8 of them have a
 * rate BELOW their cap so no widening of the first gate could reach them.
 * Teledyne Technologies is the largest and the clearest: the published cap is
 * the resulting MATCH AMOUNT, so the formula understates the benefit by half
 * in front of 12,959 readers. ------------------------------------------- */
const CAP_TRUE = [
  ["50% of the first 4% of pay", "Generally, the Company will match 50% of 8% of qualifying wages the employee defers to the Plan, provided that total matching contributions do not exceed 4% of the employee's compensation.", "Teledyne Technologies, 12,959 ppl — the cap published is the MATCH AMOUNT, not the deferral cap"],
  ["75% of the first 75% of pay", "The discretionary employer match was 75% of employee contributions, not to exceed 75% of 7% of eligible compensation.", "Morningstar, 5,250 ppl — rate right, cap taken from the rate's own compound"],
  ["50% of the first 3% of pay", "The Company provides a matching contribution equal to 50% of 6% of the participants' compensation deferred, for a maximum match of 3% of compensation.", "World Kinect, 3,294 ppl"],
  ["50% of the first 2% of pay", "During 2023, the Company matched 50% of 4% of each participant's deferred compensation, up to a maximum of 2% of compensation.", "Winchester Hospital, 3,178 ppl"],
  ["30% of the first 30% of pay", "the employer matching contribution was equal to 30 percent of deferred compensation, not to exceed 30 percent of 5 percent of compensation.", "ABC Appliance, 878 ppl — spelled out rather than signed"],
];
for (const [f, t, who] of CAP_TRUE) is(mfMisreadCompoundCap(f, t) === true, `the CAP gate MUST withhold "${f}" (${who})`);
const CAP_FALSE = [
  ["50% of the first 6% of pay", "The Company matches 50% of 6% of compensation.", "the compound AGREES with the published cap — nothing to withhold"],
  ["6% of the first 6% of pay", "a contribution of 6% of 75% of something unrelated", "the compound's second number is LARGER, so it reads backwards"],
  ["10% of the first 10% of pay", "a matching contribution of 10% of deferrals on the first 10% of compensation", "no compound in the sentence at all"],
  ["50% of the first 6% of pay", "The Company matches 50% of the first 6% of eligible compensation.", "the commonest real formula in the country"],
  ["Varies by employer group", "whatever", "a non-numeric formula string"],
];
for (const [f, t, who] of CAP_FALSE) is(mfMisreadCompoundCap(f, t) === false, `the CAP gate MUST NOT withhold "${f}" (${who})`);
/* The two gates are DISJOINT on the live store — 13 + 20 = 33 withheld, with
 * no plan counted twice — and that is asserted here on the two shapes rather
 * than left as a property of one measurement. */
is(mfMisreadRateUnderCap(CAP_TRUE[0][0], CAP_TRUE[0][1]) === false,
  "Teledyne is reached ONLY by the cap gate — if the rate gate also catches it the two are not disjoint and the counts double-count");
is(mfMisreadCompoundCap(GATE_TRUE[3][0], GATE_TRUE[3][1]) === false,
  "Alliance Laundry is reached ONLY by the rate gate");

/* A KNOWN LIMIT, ASSERTED SO IT CANNOT BE FORGOTTEN RATHER THAN GLOSSED.
 * Jones Lang LaSalle (47,898 ppl) publishes "3% of the first 5% of pay" from
 *   "$1.00 per dollar on the first 3% deferred and $0.50 per dollar on
 *    deferrals in excess of 3% up to 5%"
 * where the answer is 100% of the first 3%. The gate does NOT catch it, and
 * cannot: the only percentages in the sentence are 3 and 5, and 5 is the cap,
 * so nothing in it is a better candidate for the rate. The rate lives in the
 * DOLLAR ratios. Widening the gate to reach this one case would mean dropping
 * the cap exclusion, which is the vacuous version this test already fails on.
 * It is a dollar-ratio tier misread — a different class, queued as such. */
is(mfMisreadRateUnderCap("3% of the first 5% of pay",
  "The Company matches pretax deferrals at a rate of $1.00 per dollar on the first 3% deferred and $0.50 per dollar on deferrals in excess of 3% up to 5% of the participants’ compensation.") === false,
  "the Jones Lang LaSalle limit is documented as NOT caught — if this now passes, the gate widened and that needs its own measurement");

/* ---- NEGATIVE CONTROLS for v199, one per guard, each required to flip a
 * verdict. Built by slicing the shipped source and mutating it. -------- */
const V199 = [
  ["the fraction-word guard", /const MF_FRACWORD = \/[^\n]*\/i;/,
   "const MF_FRACWORD = /(?!)/;", () => mfEqualToWords(WORDS_REFUSE[0][0]) !== null],
  ["the cap exclusion in the misread gate", /if \(n > rate && n !== cap && n <= 300\) return true;/,
   "if (n > rate && n <= 300) return true;", null],
  ["the rate-under-cap test", /if \(!\(rate <= cap\)\) return false;/,
   "if (false) return false;", () => mfMisreadRateUnderCap(GATE_FALSE[0][0], GATE_FALSE[0][1]) === true],
  /* v200's two new guards, each sliced and each required to flip. The target
   * regex matches `rate <= cap` as shipped — this control FAILED LOUDLY when
   * the comparison moved from `<` to `<=`, which is the whole point of
   * slicing the source rather than restating it. */
  ["the compound's smaller-than-rate guard", /if \(inner < rate && inner !== cap\) return true;/,
   "if (inner !== cap) return true;", null],
  ["the compound's not-already-published guard", /if \(inner < rate && inner !== cap\) return true;/,
   "if (inner < rate) return true;", null],
];
console.log("\nNEGATIVE CONTROL for v199, one per guard:");
for (const [label, find, repl, probe] of V199) {
  if (!find.test(SRC)) { fails.push(`the control for ${label} could not find its target — the source moved`); continue; }
  const mutated = SRC.replace(find, repl);
  if (mutated === SRC) { fails.push(`the control for ${label} did not land`); continue; }
  // Load the mutated module from memory, so the shipped file is never touched.
  const mod = await loadMutant(mutated);
  const saved = { mfEqualToWords, mfMisreadRateUnderCap };
  const flipped = (() => {
    const g = globalThis;
    g.__probe = { mfEqualToWords: mod.mfEqualToWords, mfMisreadRateUnderCap: mod.mfMisreadRateUnderCap };
    try {
      /* The probe must be a case the rate<cap test is the ONLY thing refusing:
       * a rate ABOVE its cap (the ordinary shape of every real formula) in a
       * sentence that also holds a larger number. Probing with "50% of the
       * first 6%" and a sentence containing nothing above 50 proved nothing,
       * because the cap-exclusion test refused it too — a control has to be
       * reached by the condition it is testing. */
      if (label === "the rate-under-cap test")
        return mod.mfMisreadRateUnderCap("50% of the first 6% of pay",
          "The Company matches 100% of the first 3% of pay and 50% of the next 3%.") === true;
      /* Dropping the cap exclusion makes the second condition vacuous, which
       * is exactly the defect this gate shipped with for one iteration: the
       * cap is always larger than the rate, so every rate<cap case passed.
       * The honest design — "3% of the first 6%" with nothing larger in the
       * sentence is an unusual design, not a misread — is what detects it. */
      if (label === "the cap exclusion in the misread gate")
        return mod.mfMisreadRateUnderCap(GATE_FALSE[3][0], GATE_FALSE[3][1]) === true;
      /* Each v200 guard is probed with the case where it is the ONLY
       * protection, found by asking the two guards separately rather than by
       * reusing one case for both — a case protected twice proves neither. */
      if (label === "the compound's smaller-than-rate guard")
        return mod.mfMisreadCompoundCap(CAP_FALSE[1][0], CAP_FALSE[1][1]) === true;
      if (label === "the compound's not-already-published guard")
        return mod.mfMisreadCompoundCap(CAP_FALSE[0][0], CAP_FALSE[0][1]) === true;
      return mod.mfEqualToWords(WORDS_REFUSE[0][0]) !== null;
    } finally { void saved; void probe; }
  })();
  console.log(`  drop ${label}: ${flipped ? "a verdict FLIPS (control fires)" : "NOTHING changes"}`);
  if (!flipped) fails.push(`the control for ${label} changed NOTHING — it is decorative`);
}

/* ======================================================================
 * v205 — MATCH AS A FINITE VERB.
 *
 * Every arm above and the quote fallback in extractPlanFeatures anchor on the
 * NOUN "match(ing) contribution(s)". A filing that writes the verb instead is
 * invisible to all of them at once, which is the `absent: attachment read, no
 * match statement found` cell. Measured over a participant-weighted draw of
 * 200 filings from that class: 17 of 200 gain an answer and 0 lose one.
 *
 * THE TWO CONDITIONS ARE TESTED SEPARATELY AND EACH WITH A CASE WHERE IT IS
 * THE ONLY PROTECTION, found by asking the live corpus which sites each one
 * blocks alone rather than by imagining them. A case protected twice proves
 * neither.
 * ====================================================================== */
let n205 = 0;
const is205 = (c, m) => { n205++; if (!c) fails.push(m); };
const fv = (t) => { const m = mfFiniteVerb(t); return m ? `${W205(m[1])}/${W205(m[2])}` : null; };
const W205 = (x) => ({ "one hundred": 100, "seventy five": 75, "twenty five": 25, fifty: 50, forty: 40, thirty: 30, twenty: 20, ten: 10, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 }[String(x).toLowerCase().replace(/-/g, " ")] ?? +x);

/* ---- MUST EXTRACT, every one a real filing ---------------------------- */
const FV_EXTRACT = [
  ["The Company matches 100 percent of the participant’s contribution up to three percent and 50 percent of the participant’s contribution between four and five percent, for a maximum matching contribution of four percent.",
   "100/3", "A&K Railroad Materials — inflected verb, rate and cap both in WORDS"],
  ["The Plan provides for discretionary Company matching contributions and for the year ended December 31, 2025, the Company matched 50 percent of the amount of compensation deferred by the participant up to four percent.",
   "50/4", "Hixson Metal Finishing — past tense"],
  ["For the year ended December 31, 2025, the employer matched 40% of the participant's contributions to the Plan, up to 9%, for a maximum matching contribution of 3.6%.",
   "40/9", "North Shore Bank of Commerce"],
  ["The Company matches 100% of the participants’ deferred amount with the match limited to 4% of the participants’ compensation for the salaried Nissan maintenance project employees.",
   "100/4", "Yates Services, 2,699 ppl — 'limited to' as the cap connector"],
  ["For the year ended December 31, 2025, the employer match was 100% of elective contributions up to 3 percent, plus 50 percent of employee contributions between 3 and 9 percent.",
   "100/3", "Kihomac — the NOUN form rescued by a COPULA, which is what separates it from a line caption"],
  ["In addition, the Company will match 100% of the participant’s pre-tax, Roth and/or after-tax contributions to the Plan up to a total of 3% of eligible compensation.",
   "100/3", "Wabtec, 14,847 ppl — a MODAL before a bare verb"],
];
for (const [t, want, who] of FV_EXTRACT) is205(fv(t) === want, `mfFiniteVerb MUST read ${want} (${who}), got ${fv(t)}`);

/* ---- MUST REFUSE. A cap on the MATCH is not a cap on the matched tier, and a
 * cap with no rate has no rate to publish. Both fall through to the quote,
 * which is the honest answer. ------------------------------------------- */
const FV_REFUSE = [
  ["Employees can elect to contribute 1% or 2% of their salary and the University will match 200% of employees’ voluntary contributions for a maximum University contribution of 8%, including the mandatory University contribution and the University match.",
   "University of Chicago, 19,024 ppl — 8% caps the MATCH; '200% of the first 8%' would state a benefit twice the real one"],
  ["The Plan Sponsor matches up to 4% of a participant's eligible contribution to the Plan on a per pay period basis.",
   "Pinnacle Bank, 3,987 ppl — ONE percentage, and it is the cap"],
  ["The Plan Sponsor matches up to 5% of a participating employee’s eligible compensation.",
   "Metairie Park Country Day School — same shape"],
  ["The Employer generally contributes between 50% and 100% of the first 6% of Plan compensation that a participant defers.",
   "BAE Systems, 58,830 ppl — a RANGE. mfWidened needs MF_RANGE for this; MF_F refuses it by ADJACENCY, because the rate must sit immediately after the verb and 'between 50% and' cannot fit there. Measured: dropping MF_RANGE from this arm changed 0 of 54,387 live verdicts, which is why the guard is gone rather than untested"],
  ["The Employer generally matches between 50% and 100% of the first 6% of Plan compensation that a participant defers.",
   "the same sentence with the FINITE VERB substituted — a CONSTRUCTED case, used because the live corpus holds no range written with the verb, and the adjacency is what refuses it"],
];
for (const [t, why] of FV_REFUSE) is205(mfFiniteVerb(t) === null, `mfFiniteVerb MUST REFUSE: ${why}, got ${fv(t)}`);

/* ---- THE VERB PREDICATE ITSELF, which is also the quote fallback's gate.
 * Its must-NOT-fire list is drawn from the live corpus, and every member was
 * quoted under the match heading by the first version of this arm. ------- */
const FVRE = () => new RegExp(MF_FVERB, "i");
const FV_FIRE = [
  ["(2) Other eligible employment The Company matches the lesser of 50% of each employee’s deferral contribution or $500 per year.", "Costco, 279,798 ppl"],
  ["The Plan Sponsor matches up to 4% of a participant's eligible contribution to the Plan.", "Pinnacle Bank"],
  ["the University will match 200% of employees’ voluntary contributions", "University of Chicago — modal"],
  ["the Credit Union matched employee contributions according to the following schedule", "State Employees' Credit Union"],
  ["For 2025, the approved employer match was 20% of the participants’ contribution.", "Janitronics — noun plus copula"],
  ["The Bank matches a portion of employee contributions up to a max of 5% of eligible pay.", "Flagstar Bank"],
  ["The Companies match 100% of participant contributions on the first $3,250 per calendar year for eligible participants.", "Robert W. Baird — a PLURAL subject takes the bare verb"],
];
for (const [t, who] of FV_FIRE) is205(FVRE().test(t), `the verb predicate MUST fire: ${who}`);
const FV_SILENT = [
  ["CONTRIBUTIONS Employee 403(b) Deferral 10,609,352 Employer Match 4,230,299 Employer Nonelective 3,483,123 Employee Rollover 3,127,988",
   "Mid-South Independent School, 5,204 ppl — a Statement of Changes LINE CAPTION. The grammatical tail is the ONLY protection here: the subject 'Employer' fires"],
  ["2d Aggregate Account Balances Employer Contributions for the Plan Year Attributable to Participating Employer COLLEGE MATCH 93-1388375 0.00 41002",
   "TriNet HR III, 219,334 ppl — a participating employer whose NAME is COLLEGE MATCH. Tail-only protection"],
  ["Participants are immediately vested in their voluntary contributions and safe harbor employer match and nonelective contributions plus actual earnings thereon.",
   "TriNet HR III — a VESTING sentence about VOLUNTARY contributions, which are vested by law. Tail-only protection"],
  ["After-tax contributions are not eligible for the Company match. The Company match is contributed to the participants’ accounts.",
   "an ELIGIBILITY sentence, the noun form with no copula after it"],
  ["manage market risks and to alter the return characteristics of underlying securities to match certain fixed income fund characteristics",
   "Tyson Foods — a DERIVATIVES note. 'securities' is not an employer, which is the subject condition doing the work"],
  ["there are insufficient controls in place to ensure that employee data matches between the recordkeeping system and payroll system",
   "an internal-control finding. SUBJECT-ONLY protection: 'data matches' is an inflected verb and would fire without it"],
  ["Akron General Health System Matched Retirement Savings Plan (“Akron”) Non-union and union participants",
   "Cleveland Clinic, 88,028 ppl — a PLAN NAME containing 'Matched'. Subject-only: 'System Matched' is inflected"],
  ["SHANDS HEALTHCARE MATCHED SAVINGS ACCOUNT 403(B) plan number (PN) 003",
   "Shands Teaching Hospital, 16,344 ppl — a plan name on a FORM page. Subject-only"],
];
for (const [t, who] of FV_SILENT) is205(!FVRE().test(t), `the verb predicate MUST STAY SILENT: ${who}`);

/* ---- THE LESSER-OF DOLLAR CAP, measured through the shipped function
 * because the arm is inline in extractPlanFeatures rather than exported. --- */
const LESSER = [
  ["The Company matches the lesser of 50% of each employee’s deferral contribution or $500 per year.",
   "50% of contributions, capped at $500 per year", "Costco, 279,798 ppl"],
  ["The Plan provides for a Company matching contribution equal to the lesser of 25% of each participant’s elective deferrals or $500.",
   "25% of contributions, capped at $500 per year", "E & A Markets"],
  ["The Plan Sponsor will make a matching contribution equal to the lesser of 100% of the employee’s deferral amount or $550 for actively employed participants on June 30, 2025.",
   "100% of contributions, capped at $550 per year", "Howard Industries"],
];
for (const [t, want, who] of LESSER) {
  const got = (extractPlanFeatures205(t) || {}).match || null;
  is205(got === want, `the lesser-of arm MUST read "${want}" (${who}), got ${got}`);
}
/* and it must be ANCHORED on "lesser of" — a bare "or $N" elsewhere in a
 * sentence may never supply a cap. This sentence has a rate, a deferral noun
 * and a dollar figure joined by "or", and no lesser-of. */
is205(((extractPlanFeatures205("The Company matches 50% of each employee’s deferral contributions, and forfeitures of $1,200 or $3,400 were applied to reduce them.") || {}).match || null) !== "50% of contributions, capped at $3,400 per year",
  "the lesser-of arm MUST NOT take a dollar figure from an unanchored 'or $N'");

/* ---- NEGATIVE CONTROLS, one per condition, each required to flip a verdict
 * ON THE CASE WHERE IT IS THE ONLY PROTECTION. Built by slicing the shipped
 * source, never by retyping it. ---------------------------------------- */
const FV_SLICE = (() => {
  const h = SRC.indexOf("const MF_FSUBJ =");
  const e = SRC.indexOf("\n}", SRC.indexOf("export function mfFiniteVerb"));
  if (h < 0 || e < 0) throw new Error("match-formula-test: the v205 block moved in lib-4i.mjs");
  return SRC.slice(h, e + 2)
    .replace(/export function mfFiniteVerb/, "function mfFiniteVerb")
    .replace(/export const MF_FVERB/, "const MF_FVERB");
})();
/* the needed constants from above the slice, sliced too rather than retyped */
const FV_DEPS = (() => {
  const h = SRC.indexOf("const MF_RATE =");
  const e = SRC.indexOf("\n", SRC.indexOf("const MF_ART ="));
  if (h < 0 || e < 0) throw new Error("match-formula-test: the v198/v199 constants moved");
  /* the region carries several exported helpers; strip the keyword generally
   * rather than naming one, so the next export added to it cannot break this */
  return SRC.slice(h, e).replace(/^export /gm, "");
})();
const fvBuild = (mutate) => {
  const s = mutate(FV_SLICE);
  if (s === FV_SLICE) throw new Error("v205 negative control did not land — the target string moved");
  // eslint-disable-next-line no-new-func
  return new Function(`${FV_DEPS}\n${s}\n return { mfFiniteVerb, MF_FVERB };`)();
};
/* prove the slicer works UNMUTATED first: a broken slice makes every control
 * below pass vacuously */
{
  const probe = fvBuild((s) => s + "\n/* probe */");
  if (!probe.mfFiniteVerb(FV_EXTRACT[0][0])) throw new Error("the v205 slice cannot reproduce its own first extraction — every control below would be meaningless");
  if (!new RegExp(probe.MF_FVERB, "i").test(FV_FIRE[0][0])) throw new Error("the v205 slice's verb predicate does not fire on Costco — the slice is broken");
}
/* Orlando Health, 50,251 readers, verbatim from its filing. */
const FV_GAP_PROBE = "The Organization matches 100% on the first 2% a participant contributes, and 50% of the next 6% up to 8% for those under 10 years of service or 50% of the net 8% up to 10% for those over 10 years of service.";
is205(mfFiniteVerb(FV_GAP_PROBE) === null, "mfFiniteVerb MUST refuse Orlando Health: the nearest cap belongs to a LATER tier");
const FV_CONTROLS = [
  /* ANCHORED ON THE DECLARATION, not on the alternation's text: the tail is the
   * part of this arm most likely to grow, and a mutation keyed on its body
   * silently stops landing when it does. `build` asserts the landing either
   * way, so a moved anchor FAILS rather than passing vacuously. */
  ["the grammatical verb tail (bare 'match' admitted)",
   (s) => s.replace(/const MF_FVERB_TAIL = String\.raw`[^`]*`;/,
     "const MF_FVERB_TAIL = String.raw`match(?:es|ed)?\\b`;"),
   (mod) => new RegExp(mod.MF_FVERB, "i").test(FV_SILENT[0][0]), "Mid-South's line caption is quoted again"],
  ["the employer-subject requirement",
   (s) => s.replace("${MF_FSUBJ}\\s+", "\\b\\w+\\s+"),
   (mod) => new RegExp(mod.MF_FVERB, "i").test(FV_SILENT[5][0]), "the internal-control finding fires"],
  /* THE GAP'S PROBE HAD TO BE MEASURED, NOT GUESSED. The first one was
   * University of Chicago, where MF_LEAD is the protection and the gap changes
   * nothing — a control that cannot fail is decorative. Asked of the live
   * corpus, the gap changes 111 of 54,387 verdicts and all five read produce a
   * WRONG pair without it: Orlando Health 100/8 for a 100%-of-first-2% match,
   * L'Oreal 100/6 for 100%/2%, Foley & Lardner 25/1 where 1% caps the MATCH,
   * Kohler 50/1, Teledyne 50/4 (v200's compound-cap misread). All five are
   * answered by an EARLIER arm today, so the live cost is zero — and this guard
   * is what keeps it zero as the chain moves. */
  ["the no-crossing-percent gap",
   (s) => s.replace("(?:(?!percent\\b)[^.%]){0,110}?", "[^.]{0,110}?"),
   (mod) => { const m = mod.mfFiniteVerb(FV_GAP_PROBE); return !!m; }, "Orlando Health reads 100/8 for a 100%-of-the-first-2% match"],
  ["the copula's number requirement",
   (s) => s.replace("(?=(?:(?!\\. )[^.]){0,20}?[\\d$])", ""),
   (mod) => new RegExp(mod.MF_FVERB, "i").test(FV_SILENT[3][0]), "the account-crediting sentence is quoted under the match heading"],
];
console.log("v205 NEGATIVE CONTROL, one per condition, on the case where it is the ONLY protection:");
for (const [label, mutate, probe, what] of FV_CONTROLS) {
  let flipped = false;
  try { flipped = probe(fvBuild(mutate)); } catch (e) { fails.push(`the v205 control for ${label} THREW: ${e.message}`); }
  console.log(`  drop ${label}: ${flipped ? `a verdict FLIPS (${what})` : "NOTHING changes"}`);
  if (!flipped) fails.push(`the v205 control for ${label} changed NOTHING — it is decorative`);
}

if (fails.length) { for (const f of fails) console.error("FAIL " + f); process.exit(1); }
console.log(`\nmatch-formula: ${EXTRACT.length + REFUSE.length + SILENT.length} v198 assertions `
  + `(${EXTRACT.length} extract, ${REFUSE.length} range/cap refused, ${SILENT.length} silent; both controls fire)`);
console.log(`match-formula: ${n199} v199 assertions, 0 failures `
  + `(${FRAC.length} mixed fractions, ${EQ.length + WORDS.length} connectors, ${WORDS_REFUSE.length} refused, `
  + `${GATE_TRUE.length} withheld, ${GATE_FALSE.length} kept; all controls fire)`);
console.log(`match-formula: v200 — ${CAP_TRUE.length} cap-gate withheld, ${CAP_FALSE.length} kept, `
  + `2 disjointness assertions, 2 new sliced controls`);
console.log(`match-formula: v205 — ${n205} assertions `
  + `(${FV_EXTRACT.length} finite-verb extracted, ${FV_REFUSE.length} refused, `
  + `${FV_FIRE.length} predicate fires, ${FV_SILENT.length} predicate silent, `
  + `${LESSER.length + 1} lesser-of; all ${FV_CONTROLS.length} controls fire)`);
