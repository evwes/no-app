/* wampo — DOES THE PUBLIC COPY CARRY THE PLAN-DESCRIPTION NOTE?
 *
 * WHY THIS EXISTS, AND WHY IT IS A LIBRARY RATHER THAN A SCRIPT.
 *
 * `match` and `vesting` both come from the audited notes, and the field ledger
 * labels their largest gap "attachment read, no match statement found" —
 * a sentence that describes US. The owner directive on this is explicit: every
 * unknown gets a diagnosed cause. The first thing to ask of such a filing is
 * not what its notes say about a match; it is whether the public copy carries
 * the notes AT ALL. ~9k filings in this universe render form pages only, and a
 * larger set carries the auditor's OPINION, the statements and the 4i schedule
 * with the notes absent — Shell Provident Fund (22,944 readers) files a
 * Schedule C formula description plus the 4i schedule and nothing else, and
 * Dollar General (193,089) files the opinion, the statements and the schedule.
 * Neither has one sentence a parser could read about a match or a vesting
 * schedule, and no parser change will ever reach them.
 *
 * THE TRAP THIS ENCODES, PAID FOR ON 2026-11-22. The first detector keyed on
 * the phrase "notes to the financial statements" anywhere in the text — and
 * EVERY ERISA §103(a)(3)(C) opinion contains it: "…the statements of changes
 * in net assets available for benefits for the years then ended, and the
 * RELATED NOTES TO THE FINANCIAL STATEMENTS." So Dollar General was classified
 * as "notes present and readable, the extractor finds nothing — PARSER
 * CANDIDATE" at 193,089 readers, which is the exact opposite of its cause.
 * *A count keyed on a vocabulary measures the vocabulary*, and here the
 * vocabulary belonged to the document that says the notes exist somewhere
 * rather than to the notes.
 *
 * So every arm below is a hallmark of the NOTE and appears in no opinion:
 * the plan-description note's own boilerplate, its heading in a numbered-note
 * form, the accounting-policies heading, and the running page header that
 * carries a DATE or a period after it (which the opinion's prose never does,
 * because there the phrase is followed by a full stop or a conjunction).
 *
 * It answers only this question. It is NOT a judgment about whether the notes
 * say anything about any field — ask the field's own vocabulary for that, and
 * ask it only after this returns non-null.
 */

/** Each arm is named so a census can report WHICH hallmark found the note. */
export const PLAN_NOTE_ARMS = [
  ["boilerplate-general", /provides only general information|following (?:is a )?(?:brief )?description of the plan|more complete description of the plan/i],
  ["refer-to-document", /refer to the plan (?:document|agreement|instrument)/i],
  ["numbered-description", /\b(?:note\s*)?\(?\d{1,2}[).:]\s*(?:plan )?description of (?:the )?plan\b|\b(?:note\s*)?\(?\d{1,2}[).:]\s*plan description\b/i],
  ["policies-heading", /summary of significant accounting policies/i],
  /* the RUNNING HEADER of the notes section, which always carries the period
   * it covers. The trailing anchor is what separates it from the opinion's
   * prose use of the same phrase. */
  ["sourced-heading", /\bnotes? to (?:the )?financial statements\s*(?:\(continued\)|\(concluded\))?\s*(?:for the|december|january|as of|years? ended|\d)/i],
];

/** The name of the arm that found the plan-description note, or null. */
export function planNoteArm(text) {
  const t = String(text || "").replace(/\s+/g, " ");
  for (const [name, re] of PLAN_NOTE_ARMS) if (re.test(t)) return name;
  return null;
}
export const hasPlanNote = (text) => planNoteArm(text) !== null;

/* A TEXT-LAYER FAILURE IS NOT AN ABSENT NOTE, and the two must not be merged:
 * a composite EFAST2 PDF always carries the printed Form 5500 pages, so the
 * form's own words extract even when every attachment page is an image. A
 * filing production reads through OCR therefore looks, to a `pdftotext`-only
 * instrument, exactly like a filing with no notes. Low alphabetic density past
 * the form is the witness, and a caller must report this bucket as "not
 * reproducible here" rather than as a cause. */
export function attachmentHasNoTextLayer(text) {
  const t = String(text || "");
  const i = t.search(/Schedule H|Schedule I|Part VII|IRS Compliance Questions/i);
  const tail = i > 0 ? t.slice(i) : t;
  const letters = (tail.match(/[A-Za-z]/g) || []).length;
  return tail.length < 4000 || letters / Math.max(1, tail.length) < 0.25;
}

/* THE FORM'S OWN PRINTED QUESTIONS CARRY BOTH FIELDS' VOCABULARIES, and this
 * record already paid for a clean 100% that reported on the query. Line 21b
 * prints "employer matching contributions"; line 6g(2) and Schedule R print
 * vest words. Two HOLDINGS/EMPLOYER names are stripped for the same reason and
 * are on the record as traps: `MATCH GROUP INC` is a public company IBM holds
 * (144,897 readers, and the only prose "match" in its whole filing), and
 * `COLLEGE MATCH` is a participating employer in TriNet's schedule. */
export function stripFormAndNameNoise(flatText) {
  return String(flatText || "")
    .replace(/how the plan is intended to satisfy the nondiscrimination requirements for\s+employee deferrals and employer matching contributions/i, " [form-21b] ")
    .replace(/\b21b\b[^.]{0,400}?401\(m\)\(2\)\./i, " [form-21b] ")
    .replace(/number of participants who terminated employment during the plan year with accrued benefits that were[^.]{0,40}less than 100% vested/i, " [form-6g] ")
    .replace(/deferred vested and retired participants/i, " [form-schR] ")
    .replace(/MATCH(?:ING)? GROUP(?:,? INC\.?)?/g, " [holding] ")
    .replace(/COLLEGE MATCH/g, " [employer-name] ");
}

/** Field vocabularies, asked only of text that HAS a plan-description note. */
export const FIELD_WORD = {
  match: /\bmatch(?:es|ed|ing)?\b/i,
  vesting: /\bvest(?:s|ed|ing)?\b|\bnon-?forfeitable\b/i,
};
