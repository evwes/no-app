#!/usr/bin/env node
/* wampo — v206's ROTH-BESIDE-A-TAX-WORD arm, condition by condition, over
 * VERBATIM sentences from real Form 5500 audit attachments.
 *
 * WHY A SECOND TEST WHEN `parser-gate` ALREADY PINS SIX FILINGS. The gate
 * downloads a whole PDF per specimen, so it can only hold a handful, and two
 * of this arm's conditions have no whole-filing fixture that is honest:
 *
 *  - AMAZON IS THE CASE FOR THE MONEY-GOING-IN REQUIREMENT AND THE THREE
 *    VETOES TOGETHER, and neither alone: disabling either over 497 filing
 *    texts admits NOTHING, and disabling BOTH admits Amazon's rollover
 *    sentence and its 1,428,999 readers. *A conjunction's conditions cannot be
 *    priced one at a time when two of them block the same population* — this
 *    record's own rule, met again here, and the reason the first draft of this
 *    file claimed Amazon as a single-protection case for one of them. The
 *    joint discharge at the bottom asserts it.
 *    It cannot be a `parser-gate` specimen either: production reads that
 *    filing's notes ONLY THROUGH OCR, and `parser-gate` runs `pdftotext`
 *    alone, where the same PDF yields no notes at all — so a gate pin would
 *    pass for the wrong reason. *A gate that passes vacuously is worse than no
 *    gate* (this project lost two months to exactly that on the
 *    `{vesting: null, quote: null}` specimen).
 *  - THE THREE VETOES BLOCK 0 OF 497 FILINGS ON THEIR OWN, so there is no live
 *    single-protection case to pin, and inventing one would test my
 *    imagination. What is pinned instead is their REACHABILITY: the sentence
 *    they guard is boilerplate in this corpus — 26 of those 497 filings carry
 *    one that passes every other condition and trips a veto, one word short of
 *    firing — and the recorded position for a guard with no single-protection
 *    case is to measure it rather than fabricate a fixture (see AV_FULL in
 *    `parser-gate`).
 *
 * Every `text` below is copied from the filing named in `why`. Nothing here is
 * composed: a sentence I wrote would test the arm against the shape I already
 * had in mind, which is the one failure mode a fixture cannot catch.
 *
 *   node scripts/roth-pairing-test.mjs
 */
import { extractPlanFeatures } from "./lib-4i.mjs";

/* `roth` is the expected verdict; `at` the expected afterTax verdict (this arm
 * must never set it — the 2K disjunction is not settled by a Roth statement).
 * `cond` names the condition the case exists for, so a failure says which. */
const CASES = [
  /* ---- POSITIVE: the shapes every pre-v206 arm missed ------------------- */
  { why: "Southwest Airlines 20260707151841NAL0015672371001 (87,150 readers)", cond: "forward adjacency, prepositional",
    roth: true, at: false,
    text: "Eligible Employees also have the option of deferring to the Plan on an after-tax basis through a Roth provision. Company matching contributions are equal to a specified percentage of the participants' salary reduction contributions." },
  { why: "Sealed Air 20260824135735NAL0018933971001 (8,968 readers)", cond: "LINE-WRAP HYPHEN in 'before- tax'",
    roth: true, at: false,
    text: "Participant contributions may be made on a before- tax or Roth basis by salary deduction and, in addition, for certain collectively bargained employees, on an after-tax basis." },
  { why: "Xylem 20261007085527NAL0015242339001 (1,016 readers)", cond: "the `savings` verb-phrase arm of money-going-IN",
    roth: true, at: false,
    text: "A participant may designate savings as pre-tax savings, after-tax savings, Roth savings or any combination of the three." },
  { why: "Asian Art Museum 20261008084025NAL0026155041001 (332 readers)", cond: "REVERSE adjacency, 'Roth after-tax basis'",
    roth: true, at: false,
    text: "Participants may elect to contribute through payroll deductions amounts up to 100% of their annual compensation, as defined by the Plan, on a tax-deferred and/or Roth after-tax basis, up to the maximum amount allowed by the IRC." },
  { why: "Cardiology Associates 20261013125241NAL0005047824001 (224 readers)", cond: "a list whose shared noun PRECEDES it, plus a wrap hyphen",
    roth: true, at: false,
    text: "Each year, participants may contribute up to the maximum percentage allowable, not to exceed the limits of Code Sections 401(k), 404 and 415 of the Internal Revenue Code, and elect to classify these contributions as pre-tax 401(k), Roth, or after- tax." },
  { why: "TD Bank 20261012133159NAL0002880178001 (51,492 readers)", cond: "'a Roth after-tax basis' as a list item",
    roth: true, at: false,
    text: "Contributions Participants may contribute to the Plan up to 50% of their eligible compensation on a pre-tax basis, a Roth after-tax basis, or a combination of both." },
  { why: "Mary Campbell Center 20260319104050NAL0003337667001 (192 readers)", cond: "29 characters between the tax word and Roth",
    roth: true, at: false,
    text: "Contributions Each year, participants may contribute up to the maximum limits allowable by the Internal Revenue Code (“IRC”) of pretax annual compensation or after-tax basis in accordance with the Roth provision, as defined by the Plan." },
  { why: "US Acute Care 20260903120742NAL0013117234001 (181 readers)", cond: "'catch-up' inside a PERMISSION must not be read as the mandate",
    roth: true, at: false,
    text: "May elect to contribute up to the lesser of $23,500 and $23,000 for the years ended December 31, 2025 and 2024, respectively, (plus catch-up contributions as defined in the Plan document) or 75% of their pre-tax annual compensation to the Plan on a pre-tax basis and/or after-tax (Roth) basis." },

  /* ---- NEGATIVE: one per condition, each from a real filing ------------- */
  { why: "Amazon 20261008124416NAL0016118003001 (1,428,999 readers) — money-going-IN AND the vetoes, jointly",
    cond: "money-going-IN + vetoes (neither alone)", roth: false, at: false,
    text: "Participants may also roll over amounts representing pre-tax or Roth after-tax distributions from other qualified plans." },
  { why: "Whole Foods 20260918110451NAL0012578674001 (123,250 readers) — THE single-protection case for CATCHUP_MANDATE",
    cond: "SECURE 2.0 catch-up mandate", roth: false, at: false,
    text: "In accordance with this regulation, effective January 1, 2026, the Plan required all participants aged 50 and older to make their catch-up contributions on a Roth (after-tax) basis." },
  { why: "Altamed 20260925103746NAL0015062976001 (6,577 readers) — the mandate in the FUTURE tense",
    cond: "SECURE 2.0 catch-up mandate", roth: false, at: false,
    text: "For plan years beginning in 2026, catch-up contributions for participants age 50 or older earning more than $145,000 annually will be required to be made on a Roth (after-tax) basis." },
  { why: "Roth Bros., Inc. 20260930073605NAL0011352403001 (218 readers) — THE SPONSOR IS NAMED ROTH",
    cond: "adjacency requirement", roth: false, at: false,
    text: "Retirement & 401(k) Savings Plan Notes to Financial Statements For the Years Ended December 31, 2025 and 2024 Note A – Description of Plan The following description of Roth Bros., Inc. Retirement & 401(k) Savings Plan provides only general information. Participants may contribute a percentage of their eligible compensation on a pre-tax basis." },
  { why: "The Giant Company 20261009101210NAL0029732481001 (41,288 readers) — the REFUSAL the owner's 2K decision rests on",
    cond: "no inference from a bare tax word", roth: false, at: false,
    text: "Contributions Each year, participants may contribute up to 75% of their pretax or post tax annual compensation, as defined in the Plan, subject to certain Internal Revenue Code limitations." },
  { why: "Southern California Edison 20261012154258NAL0003176128001 (16,437 readers) — a DEFERRAL described as after-tax, no Roth named",
    cond: "no inference from a bare tax word", roth: false, at: false,
    text: "Contributions Subject to statutory limits, all participants may defer pre-tax and after-tax dollars up to 84% of eligible pay." },
  { why: "Publix 20261002113657NAL0023325792001 (244,619 readers) — a WITHDRAWAL sentence, and the veto's reachable shape",
    cond: "not-going-in veto (reachable, blocks 0 of 497)", roth: false, at: false,
    text: "Participants are allowed to withdraw, at any time, any portion of after-tax participant contributions, subject to Plan provisions." },
  { why: "Publix 20261002113657NAL0023325792001 — a loan repaid by after-tax payroll deduction is not a contribution type",
    cond: "not-going-in veto", roth: false, at: false,
    text: "Repayments of principal and interest are made through after-tax payroll deductions each pay period." },
];

let failed = 0;
for (const c of CASES) {
  const ff = extractPlanFeatures(c.text, "") || {};
  const gotR = !!ff.roth, gotA = !!ff.afterTax;
  const ok = gotR === c.roth && gotA === c.at;
  if (!ok) failed++;
  console.log(`${ok ? "OK  " : "FAIL"} roth=${gotR} afterTax=${gotA} (want ${c.roth}/${c.at})  [${c.cond}]  ${c.why}`);
  if (!ok && ff.rothText) console.log(`       quote it would publish: ${ff.rothText}`);
}

/* THE CONTROL ON THE CONTROLS: a positive case must be positive for THIS arm,
 * not for one of the five Roth arms that precede it, or this file would pass
 * green while the arm it exists for did nothing. Each positive is re-run with
 * the v206 block disabled, by text substitution on the shipped source, and
 * must flip to false. A fixture is only as good as the question its harness
 * asks. */
const { readFileSync, writeFileSync, mkdtempSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const path = await import("node:path");
const SRC = readFileSync(new URL("./lib-4i.mjs", import.meta.url), "utf8");
const ANCHOR = "  if (!out.roth) {\n    const ROLL_IN =";
const hits = SRC.split(ANCHOR).length - 1;
if (hits !== 1) {
  console.log(`FAIL discharge: the v206 block anchor occurs ${hits} times, so the arm cannot be disabled to prove the positives need it`);
  failed++;
} else {
  const dir = mkdtempSync(path.join(tmpdir(), "roth-pair-"));
  // lib-4i imports ./lib-quote.mjs and resolves data assets from its own dir;
  // the baseline only has to EXTRACT FEATURES, which touches neither, so a
  // bare directory is enough here and is asserted by the positives flipping.
  const p = path.join(dir, "lib-4i-noarm.mjs");
  writeFileSync(p, SRC.replace(ANCHOR, "  if (false) {\n    const ROLL_IN ="));
  /* THE WHOLE LOCAL GRAPH, not the one import that was there when this was
   * written. v208 added `./lib-effective-date.mjs` to lib-4i and this test went
   * ERR_MODULE_NOT_FOUND — a copy of a module graph is only as current as the
   * list that built it, so the list is derived from the SOURCE rather than
   * typed. A missing file still throws; it just names the real cause. */
  for (const m of SRC.matchAll(/\bfrom\s+["']\.\/([^"']+)["']/g))
    writeFileSync(path.join(dir, m[1]), readFileSync(new URL(`./${m[1]}`, import.meta.url), "utf8"));
  const noarm = await import(p);
  let reached = 0;
  for (const c of CASES.filter((x) => x.roth)) {
    const before = !!(noarm.extractPlanFeatures(c.text, "") || {}).roth;
    if (before) {
      console.log(`FAIL discharge: ${c.why} is already true WITHOUT the v206 arm — it tests an older arm, not this one`);
      failed++;
    } else reached++;
  }
  console.log(`\ndischarge: all ${reached} positive cases are false without the v206 arm (so each one tests it)`);

  /* THE JOINT DISCHARGE. The money-going-IN requirement and the three vetoes
   * each block NOTHING on their own over 497 filing texts, which reads as two
   * pieces of dead code. Disabling BOTH must admit Amazon's rollover
   * sentence — otherwise the pair really is inert and should be deleted rather
   * than carried as decoration. */
  const BOTH = [
    [`if (!/contribut|\\bdefer|designate\\w* savings|savings (?:as|on) a/i.test(s)) continue;`, `if (false) continue;`],
    [`if (ROLL_IN.test(s) || NOT_IN.test(s) || /\\broth\\s+ira\\b/i.test(s)) continue;`, `if (false) continue;`],
  ];
  let src2 = SRC, anchorsOk = true;
  for (const [from, to] of BOTH) {
    if (src2.split(from).length - 1 !== 1) { anchorsOk = false; break; }
    src2 = src2.replace(from, to);
  }
  const amazon = CASES.find((c) => /^Amazon/.test(c.why));
  if (!anchorsOk || !amazon) {
    console.log("FAIL joint discharge: anchors or the Amazon case could not be resolved");
    failed++;
  } else {
    const p2 = path.join(dir, "lib-4i-noguards.mjs");
    writeFileSync(p2, src2);
    const noguards = await import(p2);
    const flips = !!(noguards.extractPlanFeatures(amazon.text, "") || {}).roth;
    if (!flips) {
      console.log("FAIL joint discharge: with BOTH the money-going-IN requirement and the vetoes disabled, " +
        "Amazon's rollover sentence is still refused — the pair blocks nothing and is decoration, not a guard");
      failed++;
    } else {
      console.log("joint discharge: disabling the money-going-IN requirement AND the vetoes together admits " +
        "Amazon's rollover sentence (1,428,999 readers), so the pair is load-bearing though neither is alone");
    }
  }
}

console.log(`\n${CASES.length} cases, ${failed} failed`);
process.exit(failed ? 1 : 0);
