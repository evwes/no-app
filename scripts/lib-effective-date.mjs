/* wampo — IS A STATED EFFECTIVE DATE AFTER THE PLAN YEAR WE ARE REPORTING ON?
 *
 * THE ONE COPY OF THE PREDICATES. They were developed and self-tested inside
 * `scripts/subsequent-events-size.mjs` (whose `--selftest` is their control:
 * 7 positives, 20 refusals each READ in its own filing, 3 presuppositions, 5
 * headline members and 6 widening mutations), and they are now SHIPPED — the
 * parser's roth and after-tax arms skip a candidate sentence whose own grant is
 * not yet effective. So the sizer IMPORTS them from here rather than holding a
 * second copy: this record's rule is to SLICE a shipped predicate and never
 * reproduce it from memory, and a selftest that gates a copy gates nothing.
 * This file was WRITTEN by slicing those lines, not by retyping them.
 *
 * WHAT IS HERE AND WHAT IS NOT. `datesIn` / `afterPYE` / `EFFECTIVE_NEAR` /
 * `EFFECTIVE_AFTER` / `EVAL_DATE` / `presupposes` are verbatim. Two things are
 * ADDED, and both are new code with their own controls in
 * `scripts/effective-date-test.mjs`:
 *   `planYearEnd`          the pyb/pye reconstruction the sizer did inline,
 *                          moved here so the parser and the sizer cannot drift
 *   `futureEffectiveGrant` the sizer's `--published-quote` `futureGrant`, taking
 *                          a plan-year end instead of a whole store row
 *
 * IT FAILS OPEN BY CONSTRUCTION, ON PURPOSE. With no reconstructable plan-year
 * end there is no date test at all and `futureEffectiveGrant` returns null — a
 * master trust (no `pyb`) and any caller that passes no plan year keep exactly
 * the behaviour they had. *A date test with no date is not a veto; it is
 * silence*, and silence here means the flag stands.
 */
/* ---------------------------------------------------------------------------
 * dates
 * ------------------------------------------------------------------------- */
export const MONTHS = ["january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december"];
export function datesIn(s) {
  const out = [];
  for (const m of s.matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\s*,?\s*(\d{4})\b/gi))
    out.push({ y: +m[3], m: MONTHS.indexOf(m[1].toLowerCase()) + 1, d: +m[2], idx: m.index, raw: m[0] });
  for (const m of s.matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/gi))
    out.push({ y: +m[2], m: MONTHS.indexOf(m[1].toLowerCase()) + 1, d: 1, idx: m.index, raw: m[0] });
  for (const m of s.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g)) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    out.push({ y, m: +m[1], d: +m[2], idx: m.index, raw: m[0] });
  }
  /* A BARE YEAR IS AN EFFECTIVE DATE AND LEAVING IT OUT COST A REAL MEMBER:
   * Industrial Marketing files "In 2026, the Plan was amended to allow
   * participants to make Roth elective deferrals under the Plan." — the only
   * date in its note is the auditor's evaluation date, so on a day/month/year
   * vocabulary alone the single clearest member of the class carried NO
   * effective date at all. Admitted only behind in/during/effective/beginning,
   * so a dollar year or a plan name cannot supply one. */
  for (const m of s.matchAll(/\b(?:in|during|effective(?:\s+(?:in|for))?|beginning(?:\s+in)?|commencing(?:\s+in)?)\s+(20\d\d)\b/gi))
    out.push({ y: +m[1], m: 1, d: 1, idx: m.index, raw: m[0], bareYear: true });
  return out.filter((x) => x.m >= 1 && x.m <= 12 && x.y >= 1990 && x.y <= 2040);
}
export const afterPYE = (dt, p) => p.pyeY > 0 && (dt.y > p.pyeY || (dt.y === p.pyeY && dt.m > p.pyeM));
export const EFFECTIVE_NEAR = /\b(?:effective|adopted|amended|restated|amendment|as of|beginning|commencing|effectiveness|implement\w*|will (?:begin|start)|added)\b[^.]{0,70}$/i;
/* THE DATE THAT IS ALWAYS IN THE FUTURE AND MEANS NOTHING. Every
 * subsequent-events note states the date management evaluated events through,
 * and that date is by definition after the plan-year end — it sits in 29 of
 * the 34 sections this pass classified. A screen that accepted "a future date
 * in the section" would therefore fire on almost every section it found, which
 * is a clean, meaningless rate of exactly the shape this record warns about. So
 * a future date counts only when it is ANCHORED to an effective/adopted/amended
 * word AND is not the evaluation or issuance date. */
export const EVAL_DATE = /\b(?:evaluat\w+|review\w+|through the date|available to be issued|were issued|date of (?:the )?(?:independent )?audit\w*|report date|financial statements were)\b[^.]{0,90}$/i;

/* THE ANCHOR WORD IS NOT ALWAYS BEFORE THE DATE, AND A PREFIX-ONLY ANCHOR SENDS
 * REAL DEFECTS INTO A QUARANTINE BUCKET WHOSE OWN NAME IS FALSE FOR THEM.
 * Simpson Manufacturing files "On January 1, 2026, the Company amended the Plan
 * to allow after-tax employee contributions." — the amendment verb follows the
 * date, so `EFFECTIVE_NEAR` reads nothing and the member lands in
 * `causalUnanchored`, labelled "only the evaluation date". Three were known by
 * name; the shapes below are ENUMERATED from `--dump-dates` over the 4,306
 * after-tax yeses and the 44,551 roth yeses, never guessed.
 *
 * IT IS A DEDICATED DISJUNCT, NOT A TOKEN ADDED TO `EFFECTIVE_NEAR`'s
 * VOCABULARY, because that vocabulary is a closed whole-string set that
 * multiplies with every token already in it, and its blast radius is 70
 * characters of PRECEDING text. This one is bounded by `^`: it fires only on
 * the phrase IMMEDIATELY after the date, and only on the enumerated
 * announcement shape ⟨date⟩, the ⟨plan/company⟩ ⟨was⟩ ⟨amended⟩.
 *
 * FIVE SHAPES IT REFUSES, every one read in its own filing:
 *  - `the Plan WILL BE amended` / `the Plan Sponsor INTENDS TO AMEND by the
 *    deadline of <date>` — W.W. Grainger (31,290) and McCarter & English
 *    (1,167). That is the SECURE 2.0 remedial-amendment DEADLINE, which
 *    affirms that the plan already operates the provision and is being
 *    documented later. It is the opposite of a not-yet-effective grant, so the
 *    aux list admits only `was/were/is/has been/have been` — a future aux
 *    cannot reach the verb.
 *  - `participants who earned FICA wages of …` (Washington Gas Light, 1,318) —
 *    the §603 catch-up mandate, whose subject is PARTICIPANTS. Admitting it
 *    would widen the subject set over a class the v206 arm already refuses.
 *  - `the Plan's document provider … adopted an amendment` (Sharpe Dry Goods,
 *    174) — a real amendment, but reaching it needs an open noun phrase after
 *    the subject, and `the Plan's ⟨anything⟩` is how a 40-character wildcard
 *    gets into a regex that has to stay narrow.
 *  - merger / acquisition / assumption / bankruptcy / dividend dates
 *    (`the Plan was assumed by`, `ColorDynamics … merged`, `the Company made
 *    the decision to`) — a change, but not an amendment of the plan's terms.
 *  - the evaluation date under a phrasing `EVAL_DATE` misses
 *    (`through <date>, the date the financial statements were available`) — the
 *    suffix here names a DATE, never a subject, so `^…the (plan|company|…)`
 *    cannot reach it.
 * `increas\w*` and `chang\w*` are NOT in the verb set: each was necessary for
 * exactly one member and both of those members must be KEPT — see
 * PRESUPPOSITION below. */
export const EFFECTIVE_AFTER = new RegExp(
  "^[\\s,;:—–-]*the\\s+(?:plan|company|employer|board|organization|plan\\s+sponsor|plan\\s+administrator)" +
  "\\s+(?:was|were|is|has\\s+been|have\\s+been)?\\s*(?:amend\\w*|restat\\w*|adopt\\w*|implement\\w*)\\b", "i");

/* A SENTENCE THAT CHANGES THE DEGREE OF A FEATURE PRESUPPOSES THE FEATURE, so
 * it is evidence FOR the published yes in the reported year and must never
 * license a withdrawal. Health Management Associates (1,114) files "During
 * 2026, the Plan increased the maximum annual employee after-tax contribution
 * amount from $4,000 to $9,000." — after-tax plainly existed at $4,000 in the
 * year reported. Same shape as the standing refusal that a LOAN FROM after-tax
 * money presupposes after-tax money. Counted apart, never in the headline.
 *
 * IT IS ARM-SPECIFIC, AND THE FIRST VERSION WAS NOT — which is how a guard
 * meant to protect a true answer nearly withdrew five real defects. Keyed on
 * "a degree verb and a limit noun appear in the quote", it claimed EIGHT
 * members / 17,933 readers of the after-tax headline and five of them were
 * about something else entirely: Fanatics (12,580) "a change in the matching
 * contribution formula from…", Mntn (722) "amended to PERMIT after-tax
 * contributions and the Employer matching contribution calculation increased",
 * Backblaze (491) "amended to change the age requirement … from 16", Fish &
 * Richardson (279) "an automatic annual increase of 1% in participants'
 * deferral percentages", Praetorian (188) "amended to ALLOW after-tax employee
 * contributions, limited to 10%". In each the sentence GRANTS this arm and
 * changes the degree of something else. *A witness that a row is damaged is not
 * a witness to WHICH claim the damage is on.* So the degree change must govern
 * THIS ARM's own tax word, and a GRANT of this arm vetoes outright: a new
 * permission is never a degree change, whatever else the sentence moves. */
export const TAXWORD = { roth: "roth", afterTax: "after[-\\s]?tax|post[-\\s]?tax|aftertax" };
export const grantRe = (tw) => new RegExp(
  /* `add\w*` MATCHES "ADDITIONALLY", and that is not a grant verb. Stonepeak
   * files "Additionally, effective January 1, 2026, the Company increased the
   * after-tax contribution maximum from $10,000 to $29,500" — a textbook
   * presupposition — and the first spelling of this veto threw it back into the
   * headline on the strength of an adverb. *A character class written for a
   * concept picks up everything that shares its shape*, met again on a stem
   * rather than a character class. */
  "\\b(?:permit|allow|introduc|offer|institut|implement|includ)\\w*\\b[^.]{0,70}?(?:" + tw + ")" +
  "|\\badd(?:ed|ing|s)?\\b[^.]{0,70}?(?:" + tw + ")" +
  "|(?:" + tw + ")[^.]{0,70}?\\b(?:are|is|were|was|became|may)\\b[^.]{0,40}?\\b(?:permitted|allowed|available|offered|added|introduced)\\b", "i");
export const degreeRe = (tw) => new RegExp(
  "\\b(?:increas|decreas|rais|lower|chang|modif)\\w*\\b[^.]{0,60}?\\b(?:maximum|minimum|limit|cap|percentage)\\b[^.]{0,60}?(?:" + tw + ")" +
  "|\\b(?:increas|decreas|rais|lower|chang|modif)\\w*\\b[^.]{0,40}?(?:" + tw + ")[^.]{0,60}?\\b(?:maximum|minimum|limit|cap|from)\\b", "i");
export const presupposes = (quote, arm) => {
  const tw = TAXWORD[arm];
  return !!quote && degreeRe(tw).test(quote) && !grantRe(tw).test(quote);
};
/* ---------------------------------------------------------------------------
 * ADDED (not sliced): the plan-year end, and the predicate the parser calls
 * ------------------------------------------------------------------------- */

/* The reconstruction `subsequent-events-size.mjs` did inline, exactly as
 * `build-data.mjs` writes the two fields: `pye` is set only for IRREGULAR
 * years, so the ordinary case is derived from `pyb` — a January start ends in
 * December of the same year, any other month ends in the month BEFORE it, a
 * year later. Returns {pyeY:0,pyeM:0} when neither field is readable, which is
 * what makes the date test fail open. */
export function planYearEnd(pyb, pye) {
  const b = String(pyb || ""), e = String(pye || "");
  if (/^\d{4}-\d{2}$/.test(e)) return { pyeY: +e.slice(0, 4), pyeM: +e.slice(5, 7) };
  if (/^\d{4}-\d{2}$/.test(b)) {
    const by = +b.slice(0, 4), bm = +b.slice(5, 7);
    return bm === 1 ? { pyeY: by, pyeM: 12 } : { pyeY: by + 1, pyeM: bm - 1 };
  }
  return { pyeY: 0, pyeM: 0 };
}

/* IS THIS SENTENCE A GRANT THAT IS NOT YET IN EFFECT? Returns the date string
 * that makes it so, or null. The unit is ONE SENTENCE, which is both what the
 * page publishes as the quote and what the parser is choosing between — the
 * tier that reading 25 members by hand established as the reliable one.
 *
 * FOUR CONDITIONS, every one load-bearing and each measured in
 * `docs/accuracy-log.md` 2026-11-22:
 *   a date AFTER the plan-year end   — the class itself
 *   ANCHORED to an effective/amended word, on EITHER side of the date
 *                                    — "a future date in the section" fires on
 *                                      almost every section, a clean and
 *                                      meaningless rate
 *   NOT the evaluation date          — which is in the future by definition and
 *                                      sits in 29 of 34 sections
 *   NOT a degree change              — "increased the after-tax maximum from
 *                                      $4,000 to $9,000" PRESUPPOSES the
 *                                      feature in the year reported, so it is
 *                                      evidence FOR the yes and must never
 *                                      withdraw one
 */
/* A SENTENCE THAT SUSPENDS, FREEZES OR CURTAILS THIS ARM'S OWN TAX WORD
 * PRESUPPOSES IT, EXACTLY AS A DEGREE CHANGE DOES — and it is a SEPARATE
 * predicate because `presupposes`'s grant veto cannot be asked of it.
 *
 * FOUND BY READING THE MEMBER, NOT BY IMAGINING THE CLASS. Arcadium Lithium
 * (482 readers) files "Effective March 31, 2026, the Plan was frozen and
 * contributions under the Plan are temporarily suspended, including after-tax
 * contributions." The date is after the plan-year end and anchored on
 * "Effective", so the date test skipped it — and the next after-tax candidate
 * in the same filing, "Participants may designate contributions as Roth
 * contributions or as other after-tax contributions", is refused by the
 * `rothModifies` guard in `lib-4i.mjs` on the words "or as other". So the
 * re-search found nothing and a TRUE flag was withdrawn. You cannot suspend
 * what does not exist: during the year reported, after-tax was available.
 *
 * WHY NOT A FOURTH ARM OF `presupposes`: that function vetoes on a GRANT verb,
 * and its grant list contains `includ\w*`. Arcadium's sentence says "including
 * after-tax contributions" — a LIST MARKER — so the grant veto fires and the
 * presupposition would be thrown away. Same shape as `add\w*` matching
 * "Additionally", which this file already records; a dedicated disjunct whose
 * blast radius is the phrase is the recorded remedy.
 *
 * ITS BLAST RADIUS IS MEASURED, NOT ASSUMED — see
 * `scripts/effective-date-test.mjs --restriction`, which enumerates every
 * published quote the date test would otherwise skip and prints the ones this
 * spares, to be read. */
const RESTRICT_VERBS = "suspend|freez|froze|curtail|ceas";
export const restrictsExisting = (quote, arm) => {
  const tw = TAXWORD[arm];
  if (!quote || !tw) return false;
  return new RegExp(
    "\\b(?:" + RESTRICT_VERBS + ")\\w*\\b[^.]{0,80}?(?:" + tw + ")" +
    "|(?:" + tw + ")[^.]{0,60}?\\b(?:" + RESTRICT_VERBS + ")\\w*\\b", "i").test(quote);
};

export function futureEffectiveGrant(quote, pye, arm) {
  if (!quote || !pye || !pye.pyeY) return null;
  const dts = datesIn(quote);
  if (!dts.length) return null;
  const hit = dts.find((x) => {
    if (!afterPYE(x, pye)) return false;
    const pre = quote.slice(Math.max(0, x.idx - 90), x.idx);
    const suf = quote.slice(x.idx + x.raw.length, x.idx + x.raw.length + 90);
    return (EFFECTIVE_NEAR.test(pre) || EFFECTIVE_AFTER.test(suf)) && !EVAL_DATE.test(pre);
  });
  if (!hit) return null;
  if (presupposes(quote, arm)) return null;
  if (restrictsExisting(quote, arm)) return null;
  return hit.raw;
}

/* THE §603/§604 CATCH-UP MANDATE. Hoisted out of the v206 roth arm in
 * `lib-4i.mjs`, where it was measured as the sole protection for 3 filings /
 * 133,930 readers and where it was UNREACHABLE whenever the primary arm fired —
 * `docs/accuracy-log.md` 2026-11-22 (04:xxZ). Section 603 makes high earners'
 * CATCH-UP contributions Roth; it says nothing about whether a participant may
 * elect Roth for ordinary deferrals. The discriminator is REQUIREMENT vs
 * PERMISSION, not the word "catch-up": US Acute Care's "May elect to contribute
 * … (plus catch-up contributions as defined in the Plan document) … on a
 * pre-tax basis and/or after-tax (Roth) basis" names catch-up inside a general
 * election and is kept. */
export const catchupMandate = (s) =>
  /catch-? ?up/i.test(String(s || "")) &&
  /\b(?:required|requires|require|must|mandat\w+)\b/i.test(String(s || ""));

/* AND THE REFUSAL THE PARSER ACTUALLY CALLS: A MANDATE, AND NOT A SENTENCE THAT
 * ALSO GRANTS THE ARM.
 *
 * MEASURED, NOT FEARED. Promoting `catchupMandate` from the v206 arm to the
 * PRIMARY arm withdraws 279 plans / 184,635 readers whose published quote is a
 * mandate the date test cannot reach, and moves 61 quotes / 134,079 readers.
 * The top twenty were read: eighteen are plain SS603/604 mandates and two are
 * MIXED — one sentence that both announces the mandate and grants Roth:
 *   Aijj Enterprises (7,405) "Among other changes, the amendment added a Roth
 *     elective deferral feature, ... including enhanced catch-up contribution
 *     limits" — refusing this withdrew a TRUE flag, because the re-search found
 *     nothing else and v207 had published it.
 *   Loyola University (8,752) "a ROTH contribution was added to the Plan, and
 *     the ROTH catch-up contribution as required by SECURE 2.0 was implemented".
 * *Ambiguity must not withdraw* — this project's own position, recorded for
 * v207's negation veto on exactly this kind of affirm-then-carve-out sentence.
 *
 * THE GRANT VETO IS `grantRe`, ALREADY HERE AND ALREADY TESTED, and it does not
 * weaken what the v206 arm protected: measured on both of that arm's pinned
 * mandates — Whole Foods (123,250) and Altamed (6,577), the single-protection
 * cases in `roth-pairing-test.mjs` — `grantRe` is FALSE, so both still refuse.
 * American Eagle, Mavis and Resonetics likewise. It is therefore ONE spelling
 * used in both arms rather than two spellings of one caption family. */
export const catchupMandateRefusal = (s, arm = "roth") =>
  catchupMandate(s) && !grantRe(TAXWORD[arm] || TAXWORD.roth).test(String(s || ""));
