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
import { mfWidened } from "./lib-4i.mjs";

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
import { readFileSync } from "node:fs";
const SRC = readFileSync(new URL("./lib-4i.mjs", import.meta.url), "utf8");
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

if (fails.length) { for (const f of fails) console.error("FAIL " + f); process.exit(1); }
console.log(`\nmatch-formula: ${EXTRACT.length + REFUSE.length + SILENT.length} assertions, 0 failures `
  + `(${EXTRACT.length} extract, ${REFUSE.length} range/cap refused, ${SILENT.length} silent; both controls fire)`);
