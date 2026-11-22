#!/usr/bin/env node
/* wampo — pins for lib-plannote.mjs.
 *
 * TWO LAYERS, AND THE FIRST ONE RUNS IN CI.
 *
 *  (1) `data/fixtures/plannote-pages.json` — VERBATIM slices of eleven real
 *      EFAST2 filings, committed, so a clone with no filing corpus still
 *      exercises every arm and every refusal. `gate-coverage.mjs` is explicit
 *      that *a gate that cannot be started by what it guards is
 *      indistinguishable from no gate*, and the sibling gate this one most
 *      resembles — `tax-flag-gate.mjs` — is allowlisted as an orphan precisely
 *      because it needs the store and the corpus. Its recorded closure is "a
 *      PURE pin selftest, literal population records and literal fixtures",
 *      queued rather than claimed. This test does that from the start.
 *  (2) the same six motivating filings BY ACK, whole, when CORPUS_DIR has
 *      them. Whole-filing verdicts are what the census actually asked, and a
 *      slice can be right where the filing is wrong. Missing texts are a WARN
 *      here and never a silent pass.
 *
 * Usage: node scripts/plannote-test.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planNoteArm, PLAN_NOTE_ARMS, attachmentHasNoTextLayer, stripFormAndNameNoise, FIELD_WORD } from "./lib-plannote.mjs";
import { read } from "./lib-filingtext.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fail = 0, warn = 0, pass = 0;
const bad = (m) => { console.log(`FAIL  ${m}`); fail++; };
const ok = (m) => { console.log(`ok    ${m}`); pass++; };

/* ---- layer 1: the committed fixtures ---------------------------------- */
const FIX = JSON.parse(readFileSync(path.join(REPO, "data/fixtures/plannote-pages.json"), "utf8"));
if (!Array.isArray(FIX.pages) || FIX.pages.length < 13)
  bad(`plannote-pages.json holds ${FIX.pages && FIX.pages.length} pages; expected >= 13 — a shrunken fixture file is a test that stopped testing`);

for (const p of FIX.pages) {
  const arm = planNoteArm(p.text);
  if (!!arm !== p.hasNote) { bad(`fixture ${p.id}: planNoteArm=${arm}, want hasNote=${p.hasNote}\n      ${p.why}`); continue; }
  /* a SINGLE-PROTECTION fixture must still be single-protection: if a later
   * arm widens into it, the fixture silently stops proving what it is for */
  if (p.sole) {
    const fired = PLAN_NOTE_ARMS.filter(([, re]) => re.test(p.text)).map(([n]) => n);
    if (fired.length !== 1 || fired[0] !== p.sole) {
      bad(`fixture ${p.id}: ${fired.length} arms fire (${fired.join(",")}); it exists to be the ONLY case for \`${p.sole}\``);
      continue;
    }
  }
  ok(`fixture ${p.id} (${p.hasNote ? `note found by ${arm}` : "no note"})`);
}
/* every arm must be exercised by at least one fixture — *an arm real in
 * principle and inert on the data is untested machinery*, and a BROKEN arm and
 * an INERT arm read the same zero */
for (const [name] of PLAN_NOTE_ARMS) {
  if (!FIX.pages.some((p) => p.text && new RegExp(PLAN_NOTE_ARMS.find(([n]) => n === name)[1].source, "i").test(p.text)))
    bad(`arm \`${name}\` fires on no fixture — it is untested machinery`);
  else ok(`arm \`${name}\` is exercised by a fixture`);
}

/* ---- the vocabulary noise strip --------------------------------------- */
for (const [why, re, text, want] of [
  ["21b prints the match vocabulary", FIELD_WORD.match,
    "21b If this is a Code section 401(k) plan, check all boxes that apply to indicate how the plan is intended to satisfy the "
    + "nondiscrimination requirements for employee deferrals and employer matching contributions (as applicable) under Code sections 401(k)(3) and 401(m)(2).", false],
  ["MATCH GROUP INC is a holding, not a match statement", FIELD_WORD.match, "MATCH GROUP INC    EQUITY   -     -    38,756    1,251,431", false],
  ["COLLEGE MATCH is a participating employer's NAME", FIELD_WORD.match, "COLLEGE MATCH   219,334", false],
  ["real match prose survives the strip", FIELD_WORD.match, "The Company matches 50% of the first 6% of eligible compensation.", true],
  ["6g(2) prints the vest vocabulary", FIELD_WORD.vesting,
    "6g(2) Number of participants who terminated employment during the plan year with accrued benefits that were less than 100% vested", false],
  ["Schedule R prints 'deferred vested'", FIELD_WORD.vesting, "14 Enter the number of deferred vested and retired participants (inactive participants)", false],
  ["real vesting prose survives the strip", FIELD_WORD.vesting, "Participants are fully vested in Plan accounts at all times.", true],
]) {
  const got = re.test(stripFormAndNameNoise(text.replace(/\s+/g, " ")));
  if (got !== want) bad(`noise pin "${why}": got ${got} want ${want}`); else ok(`noise pin: ${why}`);
}

/* ---- the detector must be able to say NO ------------------------------- */
if (planNoteArm("Schedule of Assets (Held at End of Year) Total 950,875,974") !== null) bad("planNoteArm fired on a bare schedule page");
else ok("planNoteArm answers null on a bare schedule page");
if (planNoteArm("") !== null) bad("planNoteArm fired on empty text"); else ok("planNoteArm answers null on empty text");

/* THE CONTROL THAT MAKES THE FIXTURES LOAD-BEARING: the detector this one
 * replaced — keyed on the phrase "notes to the financial statements" ANYWHERE —
 * must FAIL a fixture by name. Dollar General is that fixture, because every
 * ERISA §103(a)(3)(C) opinion contains the phrase while its notes are absent.
 * Microsoft and Shell are right under BOTH detectors and cannot witness the
 * difference, so a fixture set made of those two alone would have let the
 * broken detector ship. *A case protected by two conditions proves neither.* */
{
  const MUTANT = /notes? to (?:the )?(?:consolidated )?financial statements|notes? to financial statement/i;
  const wrong = FIX.pages.filter((p) => MUTANT.test(p.text) !== p.hasNote);
  if (!wrong.length) bad("the phrase-anywhere mutant passes every fixture — this fixture set cannot witness the defect it was written for");
  else ok(`phrase-anywhere mutant fails ${wrong.length} fixture(s) by name: ${wrong.map((p) => p.id).join(", ")}`);
}
/* …AND A SECOND MUTANT FOR THE OTHER THING THAT NEARLY SHIPPED. `sourced-heading`
 * carried a bare `\d` alternative, which matches a TABLE OF CONTENTS page
 * number and a STATEMENT FOOTER ("See accompanying notes to financial
 * statements 4") in filings whose notes are NOT in the public copy. Measured
 * over 19,855 filings it is the only thing detecting a note on 6 filings /
 * 3,412 readers, and on all six there is no note.
 *
 * THE FIRST VERSION OF THIS CONTROL WAS DECORATIVE and said so only when it
 * was mutation-tested: it asserted the loose arm does not match the MICROSOFT
 * slice, which is true either way, so restoring the bare `\d` left the whole
 * suite green. The two `loose-arm-*` fixtures are drawn from the measured
 * population instead, so the mutant now gets a verdict WRONG. */
{
  const LOOSE = /\bnotes? to (?:the )?financial statements\s*(?:\(continued\)|\(concluded\))?\s*(?:for the|december|january|as of|years? ended|\d)/i;
  const others = PLAN_NOTE_ARMS.filter(([n]) => n !== "sourced-heading").map(([, re]) => re);
  const mutantVerdict = (t) => LOOSE.test(t) || others.some((re) => re.test(t));
  const wrong = FIX.pages.filter((p) => mutantVerdict(p.text) !== p.hasNote);
  if (!wrong.length) bad("the loose `sourced-heading` mutant passes every fixture — the tightening is untested and the bare \\d could come back unnoticed");
  else ok(`loose sourced-heading mutant fails ${wrong.length} fixture(s) by name: ${wrong.map((p) => p.id).join(", ")}`);
}

/* ---- layer 2: the whole filings, when the corpus is present ------------ */
const WHOLE = FIX.pages.filter((p) => !p.id.startsWith("only-"));
for (const p of WHOLE) {
  const t = read(p.ack);
  if (!t) { console.log(`WARN  whole-filing pin ${p.ack} (${p.id}) not in CORPUS_DIR`); warn++; continue; }
  const got = planNoteArm(t) !== null;
  if (got !== p.hasNote) { bad(`whole filing ${p.ack} (${p.id}): hasNote=${got} want ${p.hasNote}`); continue; }
  if (!p.hasNote && attachmentHasNoTextLayer(t)) { bad(`${p.ack} is a no-text-layer filing, so it cannot test the detector`); continue; }
  ok(`whole filing ${p.id}`);
}

console.log(`\nplannote-test: ${pass} pass, ${warn} warn, ${fail} fail`);
process.exit(fail ? 1 : 0);
