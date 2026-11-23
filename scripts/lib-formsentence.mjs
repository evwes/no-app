/* wampo — THE FORM 5500's OWN PRINTED SENTENCES THAT CARRY A VEST WORD.
 *
 * WHY IT IS ITS OWN MODULE. This record already states the hazard — *the
 * form's own printed questions are in the filing text, so a text-level screen
 * must exclude the form before counting* — and `lib-plannote`'s
 * `stripFormAndNameNoise` applies it to the FLAT text before asking a
 * vocabulary question. But the vesting instruments ask their SHAPE questions
 * of `vestSentences`, which is built from the raw text, so the strip never
 * reached them: `vesting-gate-fork.mjs` reported 5.24M readers in "a SCHEDULE
 * is in the selection" whose best sentence, for all twelve largest members,
 * was line 6g(2) — *"Number of participants who terminated employment during
 * the plan year with accrued benefits that were less than 100% vested"* —
 * which is printed in every full-form filing. Its own LADDER test matches that
 * line, so a clean 60% of a bucket was reporting on the query.
 *
 * Kept here rather than inside one instrument so the two that need it cannot
 * diverge, and exported as a NAMED match so a member can be reported as form
 * text instead of silently vanishing: a strip that deletes evidence reads
 * exactly like a filing that carries none.
 *
 * The list is enumerated from the filings, not guessed.
 */
export const FORM_SENTENCE = [
  [/number of participants who terminated employment during the plan year with accrued benefits that were[^.]{0,40}less than 100% vested/i, "6g(2)"],
  [/deferred vested and retired participants/i, "schR"],
  [/\b6g\(2\)\b/i, "6g(2)-label"],
  [/total number of participants[^.]{0,80}vested/i, "participant-count"],
];

/** The matching form caption, or undefined. */
export function isFormSentence(s) {
  return FORM_SENTENCE.find(([re]) => re.test(s));
}
