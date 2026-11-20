/* wampo — A DELIBERATELY OVER-WIDE NEGATION VETO. A TEST INSTRUMENT. IT MUST
 * NEVER SHIP, AND NOTHING IN THE PIPELINE IMPORTS IT.
 *
 * WHY IT EXISTS. `scripts/tax-flag-gate.mjs` is a gate whose whole job is to
 * refuse a candidate extractor that withdraws a TRUE Roth or after-tax yes
 * from the 4,349 plans / 19.66M readers who correctly publish one. A gate that
 * has only ever printed "0 lost" has not been shown able to see a loss, and a
 * zero from an untested harness is worthless — this record's rule, paid for by
 * a harness that compared the working tree against itself and printed a
 * perfect, meaningless no-difference.
 *
 * So this module is the loss. It is the mistake a real negation veto would
 * make if it were keyed on the wrong token: `permitt`/`allow`/`not` appear in
 * the AFFIRMATIVE sentence as often as in the denial — Target Corporation's
 * 473,741 readers are published off "participants are ALLOWED TO MAKE
 * contributions … in any combination of before-tax, after-tax and/or Roth
 * contributions", and Pilgrim's Pride is on record in `docs/accuracy-log.md`
 * (2026-11-20) as already being vetoed twice over by exactly these stems.
 *
 * It is keyed on the arm's own QUOTE, which is where a veto inside the arm
 * would look, and it is loudly marked so the gate can never mistake it for a
 * real candidate.
 */
import { extractPlanFeatures as realExtract, PARSER_VERSION as realVersion } from "./lib-4i.mjs";

export const IS_MUTANT = "over-wide negation veto (tax-flag-gate loss control)";
export const PARSER_VERSION = realVersion;

/* The over-wide part: any of these stems anywhere in the quote. A correct veto
 * would have to require the negation to GOVERN the contribution type, and
 * would have to refuse a historical denial, a loan clause and a `non-Roth`
 * carve-out. This one does none of that, on purpose. */
const OVER_WIDE = /\bnot\b|\bno\b|\bpermitt\w*|\ballow\w*/i;

export function extractPlanFeatures(text, sponsor) {
  const out = realExtract(text, sponsor) || {};
  if (out.roth && OVER_WIDE.test(String(out.rothText || ""))) out.roth = false;
  if (out.afterTax && OVER_WIDE.test(String(out.afterTaxText || ""))) out.afterTax = false;
  return out;
}
