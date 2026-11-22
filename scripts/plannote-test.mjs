#!/usr/bin/env node
/* wampo — pins for lib-plannote.mjs, keyed BY ACK, throwing on a miss.
 *
 * A guessed SHAPE fails as a clean zero where a guessed field NAME throws, and
 * a count that omits its own motivating case looks exactly like a count that
 * includes it. So the six filings that produced the detector are pinned by
 * ack, with the verdict established by READING each one, and a missing cached
 * text is a FAILURE rather than a skip — otherwise an empty corpus turns this
 * test into a decorative pass.
 *
 * Needs the filing texts in CORPUS_DIR. `--allow-missing` downgrades an
 * unreachable pin to a WARN and is for a fresh sandbox only; CI must not use
 * it, because that is the flag that makes this test unable to fail.
 *
 * Usage: node scripts/plannote-test.mjs [--allow-missing]
 */
import { planNoteArm, attachmentHasNoTextLayer, stripFormAndNameNoise, FIELD_WORD } from "./lib-plannote.mjs";
import { read, ensure } from "./lib-filingtext.mjs";

const ALLOW_MISSING = process.argv.includes("--allow-missing");

/* [ack, hasNote, why] — `why` is what reading the filing established. */
const PINS = [
  ["20260724135502NAL0012679475001", true,
    "Microsoft — '1. Plan Description … Vesting  Participants are fully vested in Plan accounts at all times.'"],
  ["20260723165543NAL0014354289001", true,
    "Costco — '(d) Vesting  Participants are immediately vested in their deferral contributions …'"],
  ["20260802102049NAL0023532819001", true,
    "Proletariat — '1. Plan Description … refer to the plan document for a more complete description'"],
  ["20261012105859NAL0002979424001", true,
    "Duke University — notes present; its silence on a match is the FILING's, not ours"],
  ["20260917101230NAL0006242626001", false,
    "Shell Provident Fund — Schedule C formula descriptions + the 4i schedule, no notes in the public copy"],
  ["20261009130556NAL0016770867001", false,
    "Dollar General — the §103(a)(3)(C) OPINION, the statements and the 4i schedule; notes absent. "
    + "This is the pin that matters: the opinion's own 'and the related notes to the financial statements' "
    + "is what defeated the first detector and classified 193,089 readers as a parser candidate."],
];

/* Vocabulary pins: the form's printed questions and two name traps must not
 * read as the notes mentioning the field. */
const NOISE_PINS = [
  ["21b prints the match vocabulary", FIELD_WORD.match,
    "21b If this is a Code section 401(k) plan, check all boxes that apply to indicate how the plan is intended to satisfy the "
    + "nondiscrimination requirements for employee deferrals and employer matching contributions (as applicable) under Code sections 401(k)(3) and 401(m)(2).", false],
  ["MATCH GROUP INC is a holding", FIELD_WORD.match, "MATCH GROUP INC    EQUITY   -     -    38,756    1,251,431", false],
  ["COLLEGE MATCH is an employer name", FIELD_WORD.match, "COLLEGE MATCH   219,334", false],
  ["real prose survives the strip", FIELD_WORD.match, "The Company matches 50% of the first 6% of eligible compensation.", true],
  ["6g(2) prints the vest vocabulary", FIELD_WORD.vesting,
    "6g(2) Number of participants who terminated employment during the plan year with accrued benefits that were less than 100% vested", false],
  ["real vesting prose survives the strip", FIELD_WORD.vesting, "Participants are fully vested in Plan accounts at all times.", true],
];

let fail = 0, warn = 0, pass = 0;
await ensure(PINS.map((p) => p[0]), { download: false });

for (const [ack, want, why] of PINS) {
  const t = read(ack);
  if (!t) {
    if (ALLOW_MISSING) { console.log(`WARN  ${ack} not in CORPUS_DIR — pin not checked (${why.slice(0, 60)}…)`); warn++; continue; }
    console.log(`FAIL  ${ack} not in CORPUS_DIR; this test cannot pass without its pins`);
    fail++; continue;
  }
  const arm = planNoteArm(t);
  const got = arm !== null;
  if (got !== want) { console.log(`FAIL  ${ack} planNoteArm=${arm} want hasNote=${want}\n      ${why}`); fail++; continue; }
  /* a negative pin must be negative for the RIGHT reason: the filing's text
   * must extract, or it is an OCR case and proves nothing about the detector */
  if (!want && attachmentHasNoTextLayer(t)) { console.log(`FAIL  ${ack} is a no-text-layer filing, so it cannot test the detector`); fail++; continue; }
  pass++;
}

for (const [why, re, text, want] of NOISE_PINS) {
  const got = re.test(stripFormAndNameNoise(text.replace(/\s+/g, " ")));
  if (got !== want) { console.log(`FAIL  noise pin "${why}": got ${got} want ${want}`); fail++; } else pass++;
}

/* NEGATIVE CONTROL ON THE CONTROLS: a detector that answered `true` for
 * everything would pass every positive pin. Assert it answers null for text
 * that is plainly not a note. */
if (planNoteArm("Schedule of Assets (Held at End of Year) Total 950,875,974") !== null) {
  console.log("FAIL  planNoteArm fired on a bare schedule page"); fail++;
} else pass++;
if (planNoteArm("") !== null) { console.log("FAIL  planNoteArm fired on empty text"); fail++; } else pass++;

/* THE CONTROL THAT MAKES THE PINS LOAD-BEARING: the detector this one replaced
 * — keyed on the phrase "notes to the financial statements" ANYWHERE in the
 * text — must FAIL a pin by name. Three pins is enough to show which one:
 * Shell and Microsoft are right under both detectors, so neither of them can
 * witness the difference, and a pin set made only of those two would have let
 * the broken detector ship. *A case protected by two conditions proves
 * neither.* Run with no corpus this prints a warn, never a pass. */
const MUTANT = /notes? to (?:the )?(?:consolidated )?financial statements|notes? to financial statement/i;
{
  const want = [["20261009130556NAL0016770867001", false], ["20260917101230NAL0006242626001", false], ["20260724135502NAL0012679475001", true]];
  let mutantFails = 0, checked = 0;
  for (const [ack, w] of want) {
    const t = read(ack);
    if (!t) continue;
    checked++;
    if (MUTANT.test(t) !== w) mutantFails++;
  }
  if (!checked) { console.log("WARN  mutant control unchecked (no corpus)"); warn++; } else if (!mutantFails) {
    console.log(`FAIL  the phrase-anywhere detector passes all ${checked} checked pins — this pin set cannot witness the defect it was written for`);
    fail++;
  } else { console.log(`ok    phrase-anywhere mutant fails ${mutantFails} of ${checked} pins (Dollar General)`); pass++; }
}

console.log(`\nplannote-test: ${pass} pass, ${warn} warn, ${fail} fail`);
process.exit(fail ? 1 : 0);
