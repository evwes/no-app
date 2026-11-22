#!/usr/bin/env node
/* wampo — SIZE THE FUTURE-EFFECTIVE-AMENDMENT CLASS on the Roth / after-tax
 * arms: how many plans publish a YES whose only evidence is an amendment that
 * takes effect AFTER the plan year the page reports?
 *
 * WHY. `docs/accuracy-log.md` 2026-11-20 records two defects on these arms.
 * The first is a negation read as an affirmation (Waste Management files
 * "After-tax contributions are not permitted by the Plan." and the store holds
 * `afterTax: true`). The second was found while sizing the first and is the
 * reason a negation veto alone is not the fix: Cortech
 * (20261015073223NAL0008571632003) DENIES Roth in its contributions note while
 * its Note 8 — Subsequent events lists "Participants are allowed to make Roth
 * contributions" under a restatement effective 1 January 2026, after the plan
 * year reported. Asked that section ALONE the shipped extractor returns
 * `roth: true`, so the flag is DOUBLY CAUSED. *A defect caused by two
 * mechanisms is not fixed by repairing one*, and two fix-counts priced
 * separately would double-count the same rows. This measures the second class
 * and its OVERLAP with the first.
 *
 * THE TEST REQUIRES THE PRESENCE OF THE BAD SHAPE, never the absence of a good
 * one (this record's rule, paid for by five refuted absence screens):
 *   1. a heading in the subsequent-events / plan-amendment family, DISCOVERED
 *      from the data rather than guessed (see HEADING VOCABULARY below);
 *   2. the SHIPPED `extractPlanFeatures` answering `true` for the arm when
 *      asked that SECTION ALONE — the page's own notion of an affirmative
 *      sentence, never a re-implementation of one;
 *   3. an effective date inside the section AFTER the filing's plan-year end,
 *      reconstructed from `pyb`/`pye` exactly as `build-data.mjs` writes them.
 * An amendment effective DURING the reported year is in scope and correct, so
 * the dates are read and reported, never assumed.
 *
 * AND IT SEPARATES CAUSE FROM COINCIDENCE by blanking the sections (same
 * length, spaces, so every offset the extractor's windows use is preserved)
 * and re-asking:
 *   CAUSAL  full=true, blanked=false -> the published yes IS the amendment.
 *   LATENT  full=true, blanked=true  -> something else also says yes today, so
 *           the yes stands; but if that something else is a NEGATION misread
 *           (the first defect), repairing it hands the flag straight to this
 *           section. That is the Cortech shape and the overlap to price.
 *
 * HEADING VOCABULARY — ENUMERATED, NOT GUESSED, over 1,137 filings of the
 * published-yes population (the enumeration is in the report for this pass):
 *   SUBSEQUENT EVENTS 440 bare, plus "N. SUBSEQUENT EVENTS", "NOTE N -/–/—/./:
 *   SUBSEQUENT EVENTS", "(N) SUBSEQUENT EVENTS", "[2] SUBSEQUENT EVENTS:",
 *   "NOTE I/H/J/K/L – SUBSEQUENT EVENTS", "SUBSEQUENT EVENT" singular,
 *   "PLAN MANAGEMENT'S REVIEW OF SUBSEQUENT EVENTS", "SUBSEQUENT EVENTS – DATE
 *   OF MANAGEMENT'S EVALUATION", "11. SUBSEQUENT EVENT – CHANGE IN SERVICE
 *   PROVIDER", "DELINQUENT PARTICIPANT CONTRIBUTIONS AND SUBSEQUENT EVENT";
 *   and the amendment family, two orders of magnitude rarer as a heading:
 *   "PLAN AMENDMENTS" 5, "NOTE 8 - PLAN AMENDMENTS", "NOTE 7 – PLAN AMENDMENT
 *   AND TAX STATUS", "PLAN AMENDMENT AND/OR TERMINATION", "SUMMARY OF PLAN
 *   AMENDMENTS", "10. PLAN AMENDMENTS AND PLAN MERGER:", "6. PLAN PROVISIONS,
 *   AMENDMENTS AND TERMINATION".
 * So the anchor is `subsequent event(s)`, and the amendment family is admitted
 * only with a plan word beside it. ***The single most common heading-shaped
 * line in the family is a FORM PAGE*** — `Part III   Amendments`, Schedule R's
 * printed heading, 1,140 hits across 1,137 filings, i.e. every filing. Keying
 * on `amend` alone sections the blank Form 5500 and the class reads as
 * universal; this record's rule that the form's own printed questions are in
 * the filing text, met again. Two sponsor NAMES also matched — `LAMENDOLA
 * DENTISTRY`, `16TH AMENDMENT ADVISORS LLC` — which is why the amendment arm
 * requires the word "plan" or a termination/tax-status/merger companion.
 * `--headings` re-runs the enumeration over whatever population is selected.
 *
 * Usage:
 *   node scripts/subsequent-events-size.mjs                 # cached texts only
 *   node scripts/subsequent-events-size.mjs --download       # fetch misses
 *   node scripts/subsequent-events-size.mjs --head 150 --sample 1000 --seed N
 *   node scripts/subsequent-events-size.mjs --headings       # vocabulary only
 * Exit 1 if a pinned fixture is not reproduced: a count that omits its own
 * motivating case looks exactly like a count that includes it.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPlans } from "./lib-schema.mjs";
import { read, ensure, seededShuffle, wilson95 } from "./lib-filingtext.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const one = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const has = (f) => argv.includes(f);
const HEAD_N = +one("--head", 150), SAMPLE_N = +one("--sample", 1000), SEED = +one("--seed", 20261120);
const ALL = has("--all");
/* WHICH POPULATION THE DRAW COMES FROM, and it has to be selectable: a draw
 * over the UNION is 97% Roth plans, so it leaves the after-tax arm — the one
 * carrying the 19.66M must-keep exposure — measured on whatever fraction of
 * the sample happens to publish it (85 of 1,000 on the first pass, a bound of
 * 0–182 plans). `--arm afterTax` draws from the after-tax yeses alone. */
const ARM = one("--arm", "either");
if (!["roth", "afterTax", "either"].includes(ARM)) { console.error(`--arm must be roth|afterTax|either`); process.exit(2); }
/* `--dump-dates <file>` writes ONE JSONL RECORD PER DATE found in the window the
 * classifier actually read, with the prefix and suffix it actually saw and the
 * verdict of each anchor test. It exists because the date vocabulary has to be
 * ENUMERATED OVER THE FILINGS rather than guessed: this record's rule that a fix
 * for one phrasing of a class is not a fix for the class, met here as a SIZING
 * error — "On January 1, 2026, the Company amended the Plan to allow after-tax
 * employee contributions" carries its amendment date BEFORE the verb, so a
 * prefix-only anchor reads it as undated and the member lands in a quarantine
 * bucket whose own name ("only the evaluation date") is false for it. */
const DUMP = one("--dump-dates", "");
/* `--anchor pre` restores the PREFIX-ONLY anchor this script shipped with, so
 * the suffix disjunct below can be measured as a DIFFERENTIAL over one
 * population rather than against a remembered number. */
const ANCHOR = one("--anchor", "both");
if (!["pre", "both"].includes(ANCHOR)) { console.error(`--anchor must be pre|both`); process.exit(2); }

/* ---------------------------------------------------------------------------
 * the population: plans whose OWN entry's features publish a yes
 * `lib-ledger.mjs:274` — both reader surfaces publish the plan's own features
 * and never the trust's, so this is plan-keyed by construction and no
 * master-trust resolution applies.
 * ------------------------------------------------------------------------- */
const feats = new Map();
for (const sh of readdirSync(path.join(ROOT, "data/lineups"))) {
  if (!sh.endsWith(".json")) continue;
  for (const [ack, e] of Object.entries(JSON.parse(readFileSync(path.join(ROOT, "data/lineups", sh), "utf8"))))
    if (e && e.features && (e.features.roth || e.features.afterTax)) feats.set(ack, e.features);
}
if (!feats.size) throw new Error("CONTROL FAILED: no features loaded — the measurement is void");

const d = loadPlans(path.join(ROOT, "plans-all.json"));
const pop = [];
for (const r of d.rows) {
  const ack = d.get(r, "ack");
  const ft = ack ? feats.get(ack) : null;
  if (!ft) continue;
  const pyb = String(d.get(r, "pyb") || ""), pyeRaw = String(d.get(r, "pye") || "");
  /* plan-year END, reconstructed the way build-data.mjs:1234 writes it: `pye`
   * is stored ONLY for irregular years, and blank means the natural boundary.
   * Reading blank as "no plan year end" would make every regular filing
   * undatable and the class unmeasurable. */
  let pyeY = 0, pyeM = 0;
  if (/^\d{4}-\d{2}$/.test(pyeRaw)) { pyeY = +pyeRaw.slice(0, 4); pyeM = +pyeRaw.slice(5, 7); }
  else if (/^\d{4}-\d{2}$/.test(pyb)) {
    const by = +pyb.slice(0, 4), bm = +pyb.slice(5, 7);
    if (bm === 1) { pyeY = by; pyeM = 12; } else { pyeY = by + 1; pyeM = bm - 1; }
  }
  pop.push({
    ack, pyeY, pyeM, pyb,
    ppl: +d.get(r, "partEOY") || +d.get(r, "participants") || 0,
    name: String(d.get(r, "sponsorName") || "").trim(),
    roth: !!ft.roth, afterTax: !!ft.afterTax,
    rothText: ft.rothText || "", afterTaxText: ft.afterTaxText || "",
  });
}
pop.sort((a, b) => b.ppl - a.ppl);
if (ARM !== "either") {
  /* spliced in place rather than `push(...keep)`: spreading 44,624 elements
   * into a call is a RangeError waiting for the Roth arm */
  const keep = pop.filter((p) => p[ARM]);
  pop.length = 0;
  for (const k of keep) pop.push(k);
}
const POPPPL = pop.reduce((t, x) => t + x.ppl, 0);

/* ---------------------------------------------------------------------------
 * THE FIRST DEFECT, store-only: the published quote's own words deny the flag.
 * Screened on the QUOTE, which is the string the page renders beside the tick,
 * and requiring the PRESENCE of a denial rather than the absence of anything.
 * ------------------------------------------------------------------------- */
/* THE FIRST VERSION OF THIS SCREEN WAS 2.7x TOO WIDE AND IT TOOK READING ITS
 * OWN MEMBERS TO SEE IT. Keyed on "the quote contains a negation", it returned
 * 119 Roth plans, of which most are plans that plainly DO offer Roth and whose
 * quote is about something else being refused: "Roth contributions are not
 * eligible for the employer match", "Loans from Roth deferrals are not
 * permitted", "Roth deferrals are not available for in-service withdrawals".
 * Those are QUOTE DISPLACEMENTS — the flag is right and the witness is poor —
 * and counting them as false flags would have over-stated defect 1 and handed
 * the gate an expect-loss list containing plans that must be KEPT. *A screen
 * that finds its own conclusion in every member it reads has not been shown
 * the members that would refute it*, so both counts are reported and the tight
 * one is the only one the gate uses.
 *
 * TIGHT means the negation governs the CONTRIBUTION TYPE itself, and four
 * vetoes, each drawn from a member read by hand:
 *   loans/withdrawals/distributions/rollovers/match  — a different refusal
 *   `non-Roth after-tax`                             — denies the OTHER arm
 *   `prior to <date>` / `before <date>`              — a HISTORICAL denial,
 *                                                      which affirms it now
 *   `not eligible for`                               — not a denial of access
 */
const DENIAL_TIGHT = new RegExp(
  "(?:" +
  "(?:plan|it)?\\s*(?:does|do|did) not (?:currently )?(?:allow|permit|provide for|provide|offer|accept)[^.]{0,60}?(?:roth|after[- ]?tax|post[- ]?tax)" +
  "|(?:roth|after[- ]?tax|post[- ]?tax)[^.]{0,70}?(?:are|is|were|was) not (?:permitted|allowed|available|offered|made|an option)" +
  "|no (?:roth|after[- ]?tax|post[- ]?tax)[^.]{0,40}?contributions? (?:are|is|were|was|may)" +
  ")", "i");
const DENIAL_VETO = /\bloan|\bborrow|\bwithdraw|\bdistribut|hardship|roll ?over|\bnotes? receivable|in-?service|non-?roth|not eligible for|\bprior to\b[^.]{0,30}\d{4}|\bbefore\b[^.]{0,20}\d{4}|\bmatch/i;
const DENIAL_LOOSE = /\b(?:does|do|did) not (?:currently )?(?:allow|permit|provide|offer)|\bnot (?:permitted|allowed|available|offered|eligible)\b|\bno (?:longer )?(?:roth|after[- ]tax|post[- ]tax)[^.]{0,40}(?:permitted|allowed|available|offered)|\bare not\b[^.]{0,30}\b(?:permitted|allowed|available|offered|made)\b|\bmay not\b[^.]{0,30}\b(?:make|contribute|elect)\b/i;
const denies = (quote) => !!quote && DENIAL_TIGHT.test(quote) && !DENIAL_VETO.test(quote);
const deniesLoose = (quote) => !!quote && DENIAL_LOOSE.test(quote);

/* `--negation-only` answers defect 1 EXACTLY over the whole population,
 * because that screen needs no filing text at all: the quote is in the store
 * and it is the string the page renders. Defect 2 is sampled; defect 1 is not,
 * and saying which is which is the difference between a measurement and an
 * estimate. */
if (has("--negation-only")) {
  const f0 = (n) => n.toLocaleString();
  for (const arm of (ARM === "either" ? ["roth", "afterTax"] : [ARM])) {
    const q = (p) => (arm === "roth" ? p.rothText : p.afterTaxText);
    const hits = pop.filter((p) => p[arm] && denies(q(p)));
    const loose = pop.filter((p) => p[arm] && deniesLoose(q(p)));
    const popArm = pop.filter((p) => p[arm]);
    console.log(`\n${arm}: ${f0(hits.length)} of ${f0(popArm.length)} published yeses have a quote whose own words DENY the` +
      ` contribution type — ${f0(hits.reduce((t, x) => t + x.ppl, 0))} readers of ${f0(popArm.reduce((t, x) => t + x.ppl, 0))}`);
    console.log(`  (a LOOSE screen — "the quote contains any negation" — returns ${f0(loose.length)} plans /` +
      ` ${f0(loose.reduce((t, x) => t + x.ppl, 0))} readers; the difference is QUOTE DISPLACEMENT, where the flag is` +
      ` right and the sentence shown is about loans, withdrawals, rollovers or match eligibility)`);
    for (const x of hits.sort((a, b) => b.ppl - a.ppl))
      console.log(`  ${String(x.ppl).padStart(7)}ppl  ${x.ack}  ${x.name.slice(0, 32).padEnd(32)}  ${JSON.stringify(String(arm === "roth" ? x.rothText : x.afterTaxText).slice(0, 110))}`);
  }
  process.exit(0);
}

/* ---------------------------------------------------------------------------
 * the heading finder
 * ------------------------------------------------------------------------- */
const SUBSEQ = /\bsubsequent\s+events?\b/i;
const AMEND_PLAN = /\bplan\s+amendments?\b|\bamendments?\b[^.]{0,30}\b(?:termination|tax status|merger)\b|\bplan provisions,\s*amendments\b/i;
const FORM_PART = /^part\s+[ivx]+\b/i;          /* Schedule R's printed "Part III  Amendments" */
const NOTE_START = /^\s*(?:note\s+)?[([]?(?:\d{1,2}|[A-Z])[)\]]?\s*[.\-–—:]\s*[A-Z]/;
const MAX_SECTION_LINES = 45;

function headingLines(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l || l.length > 90) continue;
    if (!/subsequent|\bamend/i.test(l)) continue;
    if (FORM_PART.test(l)) continue;
    const words = l.split(/\s+/);
    if (words.length > 9) continue;
    if (/[.;]$/.test(l) && !NOTE_START.test(l)) continue;
    if (/\$|\d{3,}/.test(l)) continue;
    const fam = SUBSEQ.test(l) ? "subsequent" : (AMEND_PLAN.test(l) ? "amendment" : null);
    if (!fam) continue;
    out.push({ line: i, fam, text: l });
  }
  return { headings: out, lines };
}

/* The span of a section: its own heading line (auditors put the first sentence
 * on it) through the next note heading, capped. A cap is the conservative
 * choice: an over-long extent would blank real notes and over-attribute. */
function sectionSpans(text) {
  const { headings, lines } = headingLines(text);
  const starts = new Map(lines.map((_, i) => [i, false]));
  for (const h of headings) starts.set(h.line, true);
  const spans = [];
  for (const h of headings) {
    let end = h.line;
    for (let j = h.line + 1; j < lines.length && j - h.line <= MAX_SECTION_LINES; j++) {
      const l = lines[j].trim();
      if (!l) { end = j; continue; }
      if (starts.get(j)) break;
      if (NOTE_START.test(l) && l.length <= 90 && !/[.;]$/.test(l)) break;
      end = j;
    }
    spans.push({ ...h, endLine: end });
  }
  /* character offsets, so the blanking is length-preserving */
  const starts2 = [];
  let off = 0;
  for (const l of lines) { starts2.push(off); off += l.length + 1; }
  return spans.map((s) => ({
    ...s,
    from: starts2[s.line],
    to: Math.min(text.length, starts2[s.endLine] + lines[s.endLine].length),
  }));
}

const blankOut = (text, spans) => {
  if (!spans.length) return text;
  let out = text;
  for (const s of spans) {
    out = out.slice(0, s.from) + out.slice(s.from, s.to).replace(/[^\n]/g, " ") + out.slice(s.to);
  }
  return out;
};

/* ---------------------------------------------------------------------------
 * dates
 * ------------------------------------------------------------------------- */
const MONTHS = ["january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december"];
function datesIn(s) {
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
const afterPYE = (dt, p) => p.pyeY > 0 && (dt.y > p.pyeY || (dt.y === p.pyeY && dt.m > p.pyeM));
const EFFECTIVE_NEAR = /\b(?:effective|adopted|amended|restated|amendment|as of|beginning|commencing|effectiveness|implement\w*|will (?:begin|start)|added)\b[^.]{0,70}$/i;
/* THE DATE THAT IS ALWAYS IN THE FUTURE AND MEANS NOTHING. Every
 * subsequent-events note states the date management evaluated events through,
 * and that date is by definition after the plan-year end — it sits in 29 of
 * the 34 sections this pass classified. A screen that accepted "a future date
 * in the section" would therefore fire on almost every section it found, which
 * is a clean, meaningless rate of exactly the shape this record warns about. So
 * a future date counts only when it is ANCHORED to an effective/adopted/amended
 * word AND is not the evaluation or issuance date. */
const EVAL_DATE = /\b(?:evaluat\w+|review\w+|through the date|available to be issued|were issued|date of (?:the )?(?:independent )?audit\w*|report date|financial statements were)\b[^.]{0,90}$/i;

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
const EFFECTIVE_AFTER = new RegExp(
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
const TAXWORD = { roth: "roth", afterTax: "after[-\\s]?tax|post[-\\s]?tax|aftertax" };
const grantRe = (tw) => new RegExp(
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
const degreeRe = (tw) => new RegExp(
  "\\b(?:increas|decreas|rais|lower|chang|modif)\\w*\\b[^.]{0,60}?\\b(?:maximum|minimum|limit|cap|percentage)\\b[^.]{0,60}?(?:" + tw + ")" +
  "|\\b(?:increas|decreas|rais|lower|chang|modif)\\w*\\b[^.]{0,40}?(?:" + tw + ")[^.]{0,60}?\\b(?:maximum|minimum|limit|cap|from)\\b", "i");
const presupposes = (quote, arm) => {
  const tw = TAXWORD[arm];
  return !!quote && degreeRe(tw).test(quote) && !grantRe(tw).test(quote);
};

/* ---------------------------------------------------------------------------
 * `--selftest` — the controls for the two predicates above, and `--mutations
 * <dump.jsonl>` which prices a WIDENING over the real date dump rather than
 * over the cases its author imagined.
 *
 * Every string below is VERBATIM from a filing's `suf`/`quote` in a
 * `--dump-dates` run: a hand-built control table tests only what its author
 * already thought of. Each refusal has been READ in its own filing.
 * ------------------------------------------------------------------------- */
if (has("--selftest")) {
  const must = [
    ["simpson", ", the Company amended the Plan to allow after-tax employee contributions."],
    ["ultra-clean", ", the Plan was amended to allow for after-tax contributions."],
    ["arcturus", ", the Plan was amended to (i) permit participants to make voluntary after-tax"],
    ["solomon", ", the Plan was amended as follows: • Effective January 1, 2026, participants"],
    ["rosenberg", ", the plan implemented procedures to require"],
    ["bracebridge", ", the Plan adopted the SECURE 2.0 provision"],
    ["praetorian-restatement", ", the Plan was restated and amended"],
  ];
  const mustNot = [
    /* a remedial-amendment DEADLINE, which affirms current operation */
    ["grainger-will-be-amended", ", the Plan will be amended to adopt certain legally required"],
    ["mccarter-intends-to-amend", ". Participants may also contribute amounts representing distributions"],
    /* the §603 catch-up mandate: the subject is PARTICIPANTS */
    ["washington-gas-participants", ", participants who earned FICA wages of $145,000"],
    /* a change, but not an amendment of the plan's terms */
    ["coach-usa-assumed", ", the Plan was assumed by Bus Holdings"],
    ["cyberark-decision", ", the Company made the decision to terminate the Plan"],
    ["fanatics-merger", ", ColorDynamics 401(k) Profit Sharing Plan merged into the Plan"],
    ["crossover-acquired", ", Crossover Health Management Services, Inc. was acquired by"],
    ["kidde-added", ". Kidde Home Safety, LLC was added as a participating employer"],
    /* the evaluation date under a phrasing EVAL_DATE misses: the suffix names a
     * DATE, never a subject */
    ["sprinklr-eval", ", the date the financial statements and the accompanying notes"],
    ["hanna-eval", ", the date the report was available to be issued"],
    /* eligibility / vesting cohort dates */
    ["infirmary-cohort", ", two percent of the participant’s eligible compensation"],
    ["potomac-vesting", ", remain fully vested."],
    ["private-client-vesting", " will be 100% vested in employer contributions."],
    ["dillards-dividend", " to shareholders of record as of December 15, 2025"],
    /* A DEGREE CHANGE OF THIS ARM, refused at the VERB SET rather than only at
     * the presupposition screen, so the member never needs the second guard:
     * Health Management Associates (1,114) "During 2026, the Plan increased the
     * maximum annual employee after-tax contribution amount from $4,000 to
     * $9,000" — after-tax existed at $4,000 in the year reported. */
    ["health-management-increased", ", the Plan increased the maximum annual employee after-tax contribution amount from $4,000 to $9,000."],
    /* A CUSTODIAN CHANGE IS NOT AN AMENDMENT OF THE PLAN'S TERMS, and this
     * date was attributed to a generic contributions sentence two paragraphs
     * away (Praetorian, 188, tier `section`). */
    ["praetorian-custodian", ", the Plan changed custodian from Matrix Trust Company to FMTC"],
    /* THE `^` IS LOAD-BEARING AND THESE FOUR ARE WHY. Each is a date whose own
     * phrase says nothing, followed LATER in the same 90 characters by an
     * amendment sentence about a different date. Vizient's is the EVALUATION
     * date (6,859 readers); Resolute's and Richline's are balance-sheet dates;
     * Coach USA's is a 2022 date followed by a 2023 amendment. A suffix anchor
     * that may match anywhere in its window attributes all four. */
    ["vizient-eval-then-amendment", ", the date these financial statements were available to be issued The Plan was amended effective"],
    ["resolute-balance-sheet", " Plan Amendments The Plan was amended and restated on January 1, 2019 to incorporate"],
    ["richline-balance-sheet", " and 2024 10. Subsequent events Effective January 1, 2026, the Plan was amended to add"],
    ["coach-usa-other-date", ". Effective April 20, 2023, the Plan was amended to allow installment payments"],
  ];
  const f1 = [];
  for (const [id, s] of must) if (!EFFECTIVE_AFTER.test(s)) f1.push(`POSITIVE ${id} does not fire: ${JSON.stringify(s)}`);
  for (const [id, s] of mustNot) if (EFFECTIVE_AFTER.test(s)) f1.push(`REFUSAL ${id} FIRES and must not: ${JSON.stringify(s)}`);
  /* presupposition: the three keeps and the five that must stay in the headline */
  const pKeep = [
    ["irhythm", "afterTax", "Effective January 1 2026, the Plan documents has been amended to increase the contribution limit of after-tax contributions from 10% to 20% of compensation."],
    ["qualys", "afterTax", "X Change the limit for voluntary after tax contributions to 12%."],
    ["stonepeak", "afterTax", "Additionally, effective January 1, 2026, the Company increased the after-tax contribution maximum from $10,000 to $29,500 for the 2026 Plan year."],
  ];
  const pHeadline = [
    ["fanatics", "afterTax", "the Plan was amended to allow voluntary after-tax contributions, a revised safe harbor matching contribution equal to 100% of the first 4% of eligible compensation deferred, a change in the matching contribution formula from the prior year"],
    ["mntn", "afterTax", "Additionally, effective January 1, 2026, the Plan was amended to permit after-tax contributions and the Employer matching contribution calculation increased to a maximum of 4%"],
    ["backblaze", "afterTax", "Effective January 1, 2026, the Plan was amended to change the age requirement for participation to 18 years of age from 16, and to allow after-tax contributions"],
    ["fish-richardson", "afterTax", "Effective January 1, 2026, the Plan was amended to provide for an automatic annual increase of 1% in participants' deferral percentages, up to a maximum of 15%, and to permit after-tax contributions"],
    ["praetorian", "afterTax", "In conjunction with the 2025 Restatement, the Plan was amended to allow after-tax employee contributions, limited to 10% of compensation, as defined"],
  ];
  for (const [id, arm, q] of pKeep) if (!presupposes(q, arm)) f1.push(`PRESUPPOSES ${id} does not fire — a degree change would be counted as a defect`);
  for (const [id, arm, q] of pHeadline) if (presupposes(q, arm)) f1.push(`PRESUPPOSES ${id} FIRES — a real defect would be withdrawn from the headline`);

  /* MUTATIONS, each derived from a refusal above and each anchored on the
   * fragment of the source it is meant to change. A mutation must fail BY NAME
   * on its own refusal; one that reaches nothing is reported, because a
   * mutation that cannot fail prices nothing. */
  const SRC = EFFECTIVE_AFTER.source;
  const muts = [
    ["admit a future aux (reaches the remedial-amendment DEADLINE)",
      SRC.replace("(?:was|were|is|has\\s+been|have\\s+been)?", "(?:was|were|is|will\\s+be|has\\s+been|have\\s+been)?"),
      ["grainger-will-be-amended"]],
    ["admit `assum\\w*` as an amendment verb (reaches a plan ASSUMED by a buyer)",
      SRC.replace("implement\\w*", "implement\\w*|assum\\w*"), ["coach-usa-assumed"]],
    ["drop the `^` so the phrase may sit anywhere in the 90-character suffix",
      SRC.replace(/^\^/, ""),
      ["vizient-eval-then-amendment", "resolute-balance-sheet", "richline-balance-sheet", "coach-usa-other-date"]],
    ["admit `increas\\w*` as an amendment verb (reaches a DEGREE change of this arm)",
      SRC.replace("implement\\w*", "implement\\w*|increas\\w*"), ["health-management-increased"]],
    ["admit `chang\\w*` as an amendment verb (reaches a CUSTODIAN change)",
      SRC.replace("implement\\w*", "implement\\w*|chang\\w*"), ["praetorian-custodian"]],
    ["allow up to three free words after the subject (reaches `made the decision`, `will be`)",
      SRC.replace("\\s+(?:was|were|is|has\\s+been|have\\s+been)?", "(?:\\s+[a-z]+){0,3}\\s*(?:was|were|is|has\\s+been|have\\s+been)?"),
      ["grainger-will-be-amended"]],
  ];
  const f2 = [];
  for (const [lbl, src, expect] of muts) {
    let re;
    try { re = new RegExp(src, "i"); } catch (e) { f2.push(`MUTATION ${lbl}: not a valid regex — ${e.message}`); continue; }
    if (src === SRC) { f2.push(`MUTATION ${lbl}: the replacement did not change the source — it prices nothing`); continue; }
    const reached = mustNot.filter(([, s]) => re.test(s)).map(([id]) => id);
    const named = expect.filter((e) => reached.includes(e));
    console.log(`  mutation: ${lbl}`);
    console.log(`    newly reaches refusals: ${reached.length ? reached.join(", ") : "(NONE)"}`);
    if (!named.length) f2.push(`MUTATION ${lbl}: expected to reach ${expect.join("/")} and reached ${reached.join(", ") || "nothing"} — the control is decorative`);
  }
  if (f1.length || f2.length) {
    console.error(`\nSELFTEST FAILED:`);
    for (const x of [...f1, ...f2]) console.error(`  ${x}`);
    process.exit(1);
  }
  console.log(`\nselftest OK — ${must.length} positives fire, ${mustNot.length} refusals do not,` +
    ` ${pKeep.length} presuppositions fire, ${pHeadline.length} headline members do not,` +
    ` ${muts.length} widening mutations each reach a named refusal`);
  process.exit(0);
}

/* ---------------------------------------------------------------------------
 * `--published-quote` — WHAT A TERMINAL VETO WOULD ACTUALLY WITHDRAW, store
 * only, no filing text at all.
 *
 * WHY IT IS THE DECISIVE MEASUREMENT FOR THE FIX. The classes above are
 * measured by BLANKING the section and re-asking, which answers "is this
 * amendment the only thing in the filing that says yes". That is the right
 * question about the FILING and the WRONG question about the PARSER: the
 * shipped arms are a FIRST-WINS chain, so when the amendment sentence wins the
 * quote the parser never looks at the other evidence. A veto placed beside
 * v207's — `if (out.roth && futureEffective(out.rothText)) out.roth = false` —
 * therefore withdraws every plan whose PUBLISHED QUOTE is a future-effective
 * grant, *including the LATENT ones whose yes is independently supported*. This
 * record's rule that a guard blocking a wrong answer must not discard the
 * honest evidence, and the reason the fix has to be a RE-SEARCH (skip this
 * candidate, take the next) rather than a veto.
 *
 * So this mode measures the terminal veto's exact blast radius over all 48,857
 * published yeses, and the SIZING passes above say how much of it is correct.
 * The difference is what a re-search must recover and a veto would lose.
 * ------------------------------------------------------------------------- */
if (has("--published-quote")) {
  const f0 = (n) => n.toLocaleString();
  /* the same catch-up test the pass uses, declared here because `CATCHUP` is a
   * `const` below this block and a TDZ error reads like a missing function */
  const catchupQ = (s) => /catch-? ?up/i.test(String(s || ""));
  /* the quote is ONE SENTENCE, so the window is the quote and the tier is
   * `sentence` by construction — which is exactly the tier reading 25 members
   * by hand established as the reliable one */
  const futureGrant = (quote, p, arm) => {
    if (!quote || !p.pyeY) return null;
    const dts = datesIn(quote);
    if (!dts.length) return null;
    const hit = dts.find((x) => {
      if (!afterPYE(x, p)) return false;
      const pre = quote.slice(Math.max(0, x.idx - 90), x.idx);
      const suf = quote.slice(x.idx + x.raw.length, x.idx + x.raw.length + 90);
      return (EFFECTIVE_NEAR.test(pre) || EFFECTIVE_AFTER.test(suf)) && !EVAL_DATE.test(pre);
    });
    if (!hit) return null;
    if (presupposes(quote, arm)) return null;     /* a degree change presupposes the feature */
    return hit.raw;
  };
  for (const arm of (ARM === "either" ? ["roth", "afterTax"] : [ARM])) {
    const popArm = pop.filter((x) => x[arm]);
    const q = (p) => (arm === "roth" ? p.rothText : p.afterTaxText);
    const hits = [];
    for (const p of popArm) {
      const d2 = futureGrant(q(p), p, arm);
      if (d2) hits.push({ ...p, date: d2, catchup: catchupQ(q(p)) });
    }
    const S = (a) => a.reduce((t, x) => t + x.ppl, 0);
    console.log(`\n${arm}: a TERMINAL veto on the published quote would withdraw ${f0(hits.length)} of ${f0(popArm.length)}` +
      ` yeses — ${f0(S(hits))} readers of ${f0(S(popArm))}`);
    console.log(`  of those, a SECURE 2.0 catch-up mandate: ${f0(hits.filter((x) => x.catchup).length)} plans /` +
      ` ${f0(S(hits.filter((x) => x.catchup)))} readers`);
    console.log(`  plans with no reconstructable plan-year end (veto cannot apply): ` +
      `${f0(popArm.filter((x) => !x.pyeY).length)}`);
    for (const x of hits.sort((a, b) => b.ppl - a.ppl).slice(0, 15))
      console.log(`    ${String(x.ppl).padStart(7)}ppl  ${x.ack}  ${x.name.slice(0, 30).padEnd(30)} PYE ${x.pyeY}-${String(x.pyeM).padStart(2, "0")}` +
        ` eff ${JSON.stringify(x.date)}${x.catchup ? " catch-up" : ""}\n              ${JSON.stringify(String(q(x)).slice(0, 160))}`);
    if (hits.length > 15) console.log(`    … ${hits.length - 15} more`);
    writeFileSync(`/tmp/pubquote-${arm}.json`, JSON.stringify(hits.map((x) => ({ ack: x.ack, ppl: x.ppl, name: x.name, date: x.date, catchup: x.catchup })), null, 1));
    console.log(`  enumerated -> /tmp/pubquote-${arm}.json`);
  }
  process.exit(0);
}

/* ---------------------------------------------------------------------------
 * the pass
 * ------------------------------------------------------------------------- */
const { extractPlanFeatures } = await import("./lib-4i.mjs");

/* the fixtures, pinned BY ACK and asserted by ROLE */
/* the same lever `tax-flag-gate.mjs` carries, for the same reason: a pin whose
 * failure path has never been exercised is decorative, and this one's HAD not
 * been — see the `must-stay-withdrawn` check below. */
const FIX = JSON.parse(readFileSync(process.env.TAX_FLAG_FIXTURES || path.join(ROOT, "scripts/tax-flag-fixtures.json"), "utf8"));
const fixByAck = new Map(FIX.cases.map((c) => [c.ack, c]));

/* TWO STRATA, AND THEY MUST NOT BE POOLED. The head is the top plans by
 * readers and is measured EXACTLY; the tail is a seeded uniform draw of
 * everything below it, and only a rate measured THERE scales. Pooling them
 * puts Wells Fargo's 248,225 readers into a "rate" and multiplies it by 44,624
 * plans — this record's rule that ranking picks what to READ while a random
 * draw estimates a RATE, and the reason two earlier fix yields came out 25x
 * and 12x wrong. The fixtures are forced into the population because a pin the
 * run never reaches proves nothing, and they are then EXCLUDED from the tail
 * rate, because a hand-picked member is not a draw. */
let chosen, HEADSET = new Set(), TAILSET = new Set(), TAIL_REMAINING = 0, TAIL_REMAINING_PPL = 0;
if (ALL) {
  chosen = pop;
  for (const p of pop) p.stratum = "all";
} else {
  const head = pop.slice(0, HEAD_N);
  const rest = pop.slice(HEAD_N);
  const tail = seededShuffle(rest, SEED).slice(0, SAMPLE_N);
  HEADSET = new Set(head.map((p) => p.ack));
  TAILSET = new Set(tail.map((p) => p.ack));
  TAIL_REMAINING = rest.length;
  TAIL_REMAINING_PPL = rest.reduce((t, x) => t + x.ppl, 0);
  const want = new Map([...head, ...tail].map((p) => [p.ack, p]));
  for (const c of FIX.cases) { const p = pop.find((x) => x.ack === c.ack); if (p) want.set(c.ack, p); }
  chosen = [...want.values()];
  for (const p of chosen) p.stratum = HEADSET.has(p.ack) ? "head" : (TAILSET.has(p.ack) ? "tail" : "fixture");
}

console.log(`published-yes population: ${pop.length.toLocaleString()} plans / ${POPPPL.toLocaleString()} readers`);
console.log(`selected ${chosen.length.toLocaleString()} filings (${ALL ? "ALL" : `head ${HEAD_N} by readers + ${SAMPLE_N} seeded uniform, seed ${SEED}`})`);

const fetched = await ensure(chosen.map((p) => p.ack), {
  download: has("--download"), concurrency: 6,
  onProgress: (a, b) => process.stdout.write(`\r  fetching ${a}/${b}`),
});
if (has("--download")) console.log(`\n  cache: ${fetched.have} present, ${fetched.fetched} fetched, ${fetched.failed.length} unreachable`);

if (has("--headings")) {
  const c = new Map();
  let formHits = 0;
  for (const p of chosen) {
    const t = read(p.ack); if (!t) continue;
    for (const l of t.split(/\r?\n/)) if (FORM_PART.test(l.trim()) && /\bamend/i.test(l)) formHits++;
    for (const h of headingLines(t).headings) {
      const k = `${h.fam}  ${h.text.replace(/\s{2,}/g, " ").toUpperCase()}`;
      c.set(k, (c.get(k) || 0) + 1);
    }
  }
  console.log(`\nheadings ACCEPTED (${c.size} distinct); form "Part III Amendments" lines seen and REFUSED: ${formHits}`);
  for (const [k, v] of [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60)) console.log(`${String(v).padStart(5)}  ${k}`);
  process.exit(0);
}

const R = {
  noText: [], mismatch: [], agree: 0,
  arms: { roth: mk(), afterTax: mk() },
};
function mk() {
  return { stored: [], causalFuture: [], causalUnanchored: [], causalInYear: [], causalUndated: [],
    causalPresupposes: [], latentFuture: [], latentOther: [], noSection: 0, sectionSilent: 0,
    denial: [], denialAndLatentFuture: [], denialAndCausalFuture: [] };
}
/* The SECURE 2.0 §603 Roth catch-up mandate is statutory boilerplate entering
 * every 2026 filing, it is effective 1 January 2026 for almost everyone, and
 * it is a REQUIREMENT on catch-up money rather than a Roth election — so it is
 * BOTH a future-effective amendment and the class the v206 arm's CATCHUP_MANDATE
 * already refuses. Counted as a sub-class rather than a separate one, because
 * two fixes priced apart would both claim these plans. */
const CATCHUP = (s) => /catch-? ?up/i.test(String(s || ""));

let processed = 0;
const dumpLines = [];
for (const p of chosen) {
  const text = read(p.ack);
  if (!text) { R.noText.push(p); continue; }
  processed++;
  const full = extractPlanFeatures(text, p.name) || {};
  /* CONTROL — the local parse must agree with the STORE on the flag. A filing
   * production reads through OCR yields nothing like this locally, and a
   * disagreement counted as a finding would report the download path as a
   * defect. Reported, never silently counted. */
  const agreeRoth = !!full.roth === p.roth, agreeAt = !!full.afterTax === p.afterTax;
  if (agreeRoth && agreeAt) R.agree++; else R.mismatch.push({ ...p, got: { roth: !!full.roth, afterTax: !!full.afterTax } });

  const spans = sectionSpans(text);
  const blanked = spans.length ? blankOut(text, spans) : text;
  if (spans.length && blanked === text) throw new Error(`CONTROL FAILED: ${p.ack} has ${spans.length} sections and blanking changed nothing`);
  const bf = spans.length ? (extractPlanFeatures(blanked, p.name) || {}) : full;
  const secText = spans.map((s) => text.slice(s.from, s.to)).join("\n\n");
  const sf = spans.length ? (extractPlanFeatures(secText, p.name) || {}) : {};

  for (const arm of ["roth", "afterTax"]) {
    const A = R.arms[arm];
    if (!p[arm] || !full[arm]) continue;       /* judge only what the page publishes AND this text reproduces */
    A.stored.push(p);
    if (denies(arm === "roth" ? p.rothText : p.afterTaxText)) A.denial.push(p);
    if (!spans.length) { A.noSection++; continue; }
    if (!sf[arm]) { A.sectionSilent++; continue; }
    /* the section alone says yes — now date the sentence it says it with */
    const quote = String(arm === "roth" ? sf.rothText : sf.afterTaxText) || "";
    const at = quote ? secText.indexOf(quote) : -1;
    /* DATE ATTRIBUTION IS THREE TIERS AND THE WIDEST ONE MISATTRIBUTES. A
     * subsequent-events note commonly lists several amendments with several
     * effective dates, so a ±700-character window around the sentence picks up
     * a NEIGHBOUR's date: Exact Sciences (9,161 readers) files "Effective May
     * 1, 2025, the Plan was amended to allow after-tax contributions" — inside
     * the reported year and therefore CORRECT — and the same note carries
     * 1 January 2026 and 23 March 2026 for other changes, which read as a
     * future effective date for this one. So the quote's OWN sentence is asked
     * first, a tight window second, and the whole section only as a last
     * resort, and the tier is reported so a loose attribution is visible
     * rather than silent. */
    const tiers = [
      ["sentence", quote],
      ["near", at >= 0 ? secText.slice(Math.max(0, at - 250), at + quote.length + 120) : ""],
      ["section", at >= 0 ? secText.slice(Math.max(0, at - 700), at + quote.length + 300) : secText],
    ];
    let tier = "none", window = "", dts = [];
    for (const [name, w] of tiers) {
      if (!w) continue;
      const d2 = datesIn(w);
      if (d2.length) { tier = name; window = w; dts = d2; break; }
    }
    const future = dts.filter((x) => afterPYE(x, p));
    /* ANCHORED: tied to an effective/adopted/amended word and NOT the
     * evaluation or issuance date, which every such note carries and which is
     * always after the plan-year end. The word may sit on EITHER SIDE of the
     * date — see EFFECTIVE_AFTER — and the eval veto is a claim about the DATE,
     * so it applies whichever side found it. */
    const preOf = (x) => window.slice(Math.max(0, x.idx - 90), x.idx);
    const sufOf = (x) => window.slice(x.idx + x.raw.length, x.idx + x.raw.length + 90);
    const anchoredPre = (x) => EFFECTIVE_NEAR.test(preOf(x));
    const anchoredSuf = (x) => ANCHOR === "both" && EFFECTIVE_AFTER.test(sufOf(x));
    const anchored = (x) => (anchoredPre(x) || anchoredSuf(x)) && !EVAL_DATE.test(preOf(x));
    const eff = future.filter(anchored);
    const inYear = dts.filter((x) => !afterPYE(x, p) && anchored(x));
    /* which side of the date the anchor was on, reported so a widening is
     * visible in the output rather than folded into one count */
    const sufOnly = eff.filter((x) => !anchoredPre(x) && anchoredSuf(x));
    const causal = !bf[arm];
    /* TWO SHAPES INSIDE ONE CLASS, AND THEY ARE NOT EQUALLY WRONG. An
     * amendment effective after the reported plan year but BEFORE today is
     * true of the plan now and false of the year the page reports — a SCOPE
     * error. One effective after today is a claim about the future. Aramark's
     * Roth was added effective 8 December 2025 against a plan year that ended
     * 30 September 2025, which is the first shape; the owner's decision about
     * severity differs between them, so they are counted apart. */
    const TODAY = { y: new Date().getUTCFullYear(), m: new Date().getUTCMonth() + 1 };
    const stillAhead = eff.some((x) => x.y > TODAY.y || (x.y === TODAY.y && x.m > TODAY.m));
    const rec = { ...p, quote, dates: dts.map((x) => x.raw), future: future.map((x) => x.raw),
      eff: eff.map((x) => x.raw), inYear: inYear.map((x) => x.raw), catchup: CATCHUP(quote),
      sufOnly: sufOnly.map((x) => x.raw), presupposes: presupposes(quote, arm),
      stillAhead, tier, heads: spans.map((s) => s.text) };
    const neg = denies(arm === "roth" ? p.rothText : p.afterTaxText);
    let bucket;
    if (causal) {
      /* a degree-change sentence presupposes the feature: evidence FOR the
       * published yes, so it is quarantined BEFORE the headline bucket */
      if (eff.length && rec.presupposes) { bucket = "causalPresupposes"; A.causalPresupposes.push(rec); }
      else if (eff.length) { bucket = "causalFuture"; A.causalFuture.push(rec); }
      else if (inYear.length) { bucket = "causalInYear"; A.causalInYear.push(rec); }
      else if (future.length) { bucket = "causalUnanchored"; A.causalUnanchored.push(rec); }   /* a future date, but only the evaluation date */
      else { bucket = "causalUndated"; A.causalUndated.push(rec); }
    } else if (eff.length) {
      bucket = "latentFuture";
      A.latentFuture.push(rec);
      if (neg) A.denialAndLatentFuture.push(rec);
    } else { bucket = "latentOther"; A.latentOther.push(rec); }
    if (causal && eff.length && neg) A.denialAndCausalFuture.push(rec);
    if (DUMP) {
      /* every date the classifier saw, with the two contexts it judged it on.
       * A record is written even when the window held NO date, so the
       * "undated" population is enumerable rather than inferred from absence. */
      const base = { ack: p.ack, ppl: p.ppl, name: p.name, arm, bucket, tier, pyeY: p.pyeY, pyeM: p.pyeM, quote: quote.slice(0, 200) };
      if (!dts.length) dumpLines.push(JSON.stringify({ ...base, date: null }));
      for (const x of dts) {
        const pre = window.slice(Math.max(0, x.idx - 90), x.idx);
        const suf = window.slice(x.idx + x.raw.length, x.idx + x.raw.length + 90);
        dumpLines.push(JSON.stringify({ ...base, date: x.raw, bareYear: !!x.bareYear,
          future: afterPYE(x, p), anchoredPre: EFFECTIVE_NEAR.test(pre),
          anchoredSuf: EFFECTIVE_AFTER.test(suf), evalPre: EVAL_DATE.test(pre),
          pre: pre.replace(/\s+/g, " "), suf: suf.replace(/\s+/g, " ") }));
      }
    }
  }
  if (processed % 200 === 0) process.stdout.write(`\r  parsed ${processed}/${chosen.length}`);
}
console.log(`\n`);
if (DUMP) {
  writeFileSync(DUMP, dumpLines.join("\n") + "\n");
  console.log(`date dump: ${dumpLines.length} records -> ${DUMP}`);
}

/* ---------------------------------------------------------------------------
 * the pins — THROW on a miss, before any number is believed
 * ------------------------------------------------------------------------- */
const fails = [];
const ARMS = ARM === "either" ? ["roth", "afterTax"] : [ARM];
for (const c of FIX.cases) {
  const p = pop.find((x) => x.ack === c.ack);
  /* a fixture whose arm this run does not cover is NOT APPLICABLE rather than
   * failing — Waste Management publishes only after-tax, so `--arm roth`
   * cannot judge it, and a pin that fails for being out of scope teaches a
   * gate to be habitually red */
  if (!p && ARM !== "either" && !Object.keys(c.expect).includes(ARM)) {
    console.log(`  (fixture ${c.id} does not publish ${ARM} — not applicable to this run)`);
    continue;
  }
  /* must-stay-withdrawn: v207 withdrew this arm and the withdrawal was RIGHT,
   * so the ack is CORRECTLY absent and its absence is the pin PASSING. The
   * claim inverts: present means a later change undid the shipped fix. This
   * script exited 1 on both its own motivating cases the first time it ran
   * after the v207 merge, which is bookkeeping reported as a defect — and a
   * check that is habitually red teaches its reader to ignore it. */
  const withdrawnArms = ARMS.filter((a) => (c.expect[a] || []).includes("must-stay-withdrawn"));
  if (withdrawnArms.length) {
    /* `p[a]`, NOT `p.features[a]`: a population row carries the arm flags
     * directly (`roth`/`afterTax`, built above from `e.features`) and has no
     * `features` key at all, so the original spelling was undefined on every
     * row and the regression pin COULD NOT FAIL — the one thing in the repo
     * guarding v207 against being undone was decorative. Shown failing by
     * name with `TAX_FLAG_FIXTURES` pointed at a copy that declares a
     * still-published arm must-stay-withdrawn. */
    const stillPublished = withdrawnArms.filter((a) => p && p[a] === true);
    if (stillPublished.length) {
      fails.push(`${c.id}: ${stillPublished.join("/")} is PUBLISHED again — v207 withdrew it and something has undone that. This is a REGRESSION, not a stale pin.`);
    } else {
      console.log(`  (fixture ${c.id} ${withdrawnArms.join("/")}: withdrawn by v207 and still withdrawn — pin holds)`);
    }
    /* every in-scope arm accounted for: nothing left for this fixture to say */
    if (withdrawnArms.length === ARMS.filter((a) => (c.expect[a] || []).length).length) continue;
  }
  if (!p) { fails.push(`${c.id}: ack ${c.ack} is not in the published-yes population at all`); continue; }
  if (!chosen.some((x) => x.ack === c.ack)) { fails.push(`${c.id}: not selected by this run — the pin proves nothing`); continue; }
  const t = read(c.ack);
  if (!t) { fails.push(`${c.id}: no text available (run with --download)`); continue; }
  for (const arm of ARMS) {
    const want = c.expect[arm];
    if (!want || !want.length) continue;
    const A = R.arms[arm];
    const inClass = (k) => A[k].some((x) => x.ack === c.ack);
    for (const w of want) {
      if (w === "denial" && !A.denial.some((x) => x.ack === c.ack))
        fails.push(`${c.id} ${arm}: expected the NEGATION class and the quote screen did not fire on ${JSON.stringify((arm === "roth" ? p.rothText : p.afterTaxText).slice(0, 90))}`);
      if (w === "subsequent-future" && !(inClass("causalFuture") || inClass("latentFuture")))
        fails.push(`${c.id} ${arm}: expected a FUTURE-EFFECTIVE subsequent-events cause and found none`);
      if (w === "must-keep" && !(p[arm] && A.stored.some((x) => x.ack === c.ack)))
        fails.push(`${c.id} ${arm}: expected a correct published yes and the store/text do not both give one`);
      if (w === "must-keep" && (inClass("causalFuture") || A.denial.some((x) => x.ack === c.ack)))
        fails.push(`${c.id} ${arm}: a CORRECT yes landed in a defect class — the screen is too wide`);
    }
  }
}

/* ---------------------------------------------------------------------------
 * report
 * ------------------------------------------------------------------------- */
const f = (n) => n.toLocaleString();
const sum = (a) => a.reduce((t, x) => t + x.ppl, 0);
console.log(`texts read ${processed}, unreachable ${R.noText.length}`);
const checked = R.agree + R.mismatch.length;
console.log(`CONTROL — local parse vs the STORE's flags: agrees on ${R.agree}/${checked}` +
  `${checked ? ` (${(100 * R.agree / checked).toFixed(1)}%)` : ""}, disagrees on ${R.mismatch.length}` +
  ` (OCR-served filings, prior-year fallback-served filings and withdrawn PDFs land here;` +
  ` they are excluded from every class below)`);
{ /* the DIRECTION of the disagreement, because "store says yes, this text says
   * no" is an unreadable-locally filing while the reverse would mean the store
   * is stale — two different facts behind one rate. */
  let lostHere = 0, extraHere = 0;
  for (const m of R.mismatch) {
    for (const arm of ["roth", "afterTax"]) {
      if (m[arm] && !m.got[arm]) lostHere++;
      if (!m[arm] && m.got[arm]) extraHere++;
    }
  }
  console.log(`  direction: ${lostHere} arm-flags the store has and this text does not (not readable here),` +
    ` ${extraHere} this text has and the store does not (store written from a different text)`);
}

for (const arm of ARMS) {
  const A = R.arms[arm];
  console.log(`\n=== ${arm.toUpperCase()} ===${ARM === "either" ? "" : `  (population RESTRICTED to --arm ${ARM})`}`);
  const popArm = pop.filter((x) => x[arm]);
  console.log(`  population publishing yes: ${f(popArm.length)} plans / ${f(sum(popArm))} readers`);
  console.log(`  judged here: ${f(A.stored.length)} plans / ${f(sum(A.stored))} readers` +
    `  [head ${A.stored.filter((x) => x.stratum === "head").length}, tail ${A.stored.filter((x) => x.stratum === "tail").length}, fixture ${A.stored.filter((x) => x.stratum === "fixture").length}]`);
  const L = (lbl, a) => console.log(`    ${lbl.padEnd(54)} ${f(a.length).padStart(5)} plans  ${f(sum(a)).padStart(10)} readers`);
  L("NEGATION class (quote denies it) — defect 1", A.denial);
  L("CAUSAL + anchored future effective date — WRONG NOW", A.causalFuture);
  L("  of those, anchored by the SUFFIX only (--anchor both)", A.causalFuture.filter((x) => x.sufOnly.length));
  /* THE TIER IS THE HEADLINE'S OWN HEDGE AND IT HAS TO BE PRINTED THREE WAYS,
   * because reading all 25 members the suffix anchor newly reached on the roth
   * arm found the split is a RELIABLE DISCRIMINATOR: all 19 at tier `sentence`
   * or `near` are real future-effective amendments, and all 6 at tier
   * `section` are section-span artifacts — the quote is a standing plan-terms
   * sentence ("Roth deferrals are also permitted by the Plan") and the date
   * belongs to a different sentence in the same note. So `sentence`+`near` is
   * the DEFENSIBLE floor and `section` is a separate, unestablished question
   * about `MAX_SECTION_LINES`. A two-way split folded `near` in with
   * `section`, which hid that `near` behaves like `sentence`. */
  L("  of those, dated from the quote's OWN sentence", A.causalFuture.filter((x) => x.tier === "sentence"));
  L("  of those, dated from a TIGHT window round the quote", A.causalFuture.filter((x) => x.tier === "near"));
  L("  of those, dated from ANYWHERE in the section (unestablished)", A.causalFuture.filter((x) => x.tier === "section"));
  L("  TIGHT floor: sentence + near", A.causalFuture.filter((x) => x.tier === "sentence" || x.tier === "near"));
  L("  of those, a SECURE 2.0 catch-up mandate", A.causalFuture.filter((x) => x.catchup));
  L("  of those, effective date STILL ahead of today", A.causalFuture.filter((x) => x.stillAhead));
  L("  of those, effective after the year but before today", A.causalFuture.filter((x) => !x.stillAhead));
  L("CAUSAL + anchored future, but PRESUPPOSES the feature (keep)", A.causalPresupposes);
  L("CAUSAL + effective date inside the year (correct)", A.causalInYear);
  L("CAUSAL + only the evaluation date (undatable)", A.causalUnanchored);
  L("CAUSAL + no date at all in the section", A.causalUndated);
  L("LATENT + future effective date (another cause stands)", A.latentFuture);
  L("  of those, the other cause is a NEGATION (Cortech)", A.denialAndLatentFuture);
  L("LATENT, no future effective date", A.latentOther);
  console.log(`    ${"no section found".padEnd(54)} ${f(A.noSection).padStart(5)} plans`);
  console.log(`    ${"section found, says nothing about this arm".padEnd(54)} ${f(A.sectionSilent).padStart(5)} plans`);

  /* THE ESTIMATE, BY STRATUM. The head is exact over the top HEAD_N plans; the
   * tail is a uniform draw of the rest, so its rate scales to the rest and its
   * readers scale by the draw's own weight (N_rest / n_drawn), which is the
   * unbiased estimator for a uniform sample. Fixtures are in neither. */
  if (!ALL) {
    for (const [lbl, key] of [["WRONG NOW (causal + anchored future)", "causalFuture"],
      ["+ the latent-after-a-negation-repair cases", null]]) {
      const members = key ? A[key] : [...A.causalFuture, ...A.denialAndLatentFuture];
      const headJ = A.stored.filter((x) => x.stratum === "head");
      const tailJ = A.stored.filter((x) => x.stratum === "tail");
      const headHit = members.filter((x) => x.stratum === "head");
      const tailHit = members.filter((x) => x.stratum === "tail");
      const fixHit = members.filter((x) => x.stratum === "fixture");
      const [lo, hi] = wilson95(tailHit.length, tailJ.length);
      /* the judged tail is a sub-sample of the drawn tail (unreadable filings
       * dropped out), so the scale factor is population-rest / judged-tail */
      const armRest = popArm.length - Math.min(HEAD_N, popArm.length);
      const w = tailJ.length ? armRest / tailJ.length : 0;
      console.log(`\n    ESTIMATE — ${lbl}`);
      console.log(`      head (top ${HEAD_N} by readers, exact): ${headHit.length}/${headJ.length} plans, ${f(sum(headHit))} readers`);
      console.log(`      tail draw: ${tailHit.length}/${tailJ.length} = ${(100 * tailHit.length / (tailJ.length || 1)).toFixed(2)}% ` +
        `(Wilson 95% ${(100 * lo).toFixed(2)}–${(100 * hi).toFixed(2)}%)`);
      console.log(`      tail scaled to ${f(armRest)} plans: ${f(Math.round(lo * armRest))}–${f(Math.round(hi * armRest))} plans, ` +
        `readers ≈ ${f(Math.round(sum(tailHit) * w))} (point estimate, one draw)`);
      console.log(`      TOTAL: ${f(headHit.length + Math.round(lo * armRest))}–${f(headHit.length + Math.round(hi * armRest))} plans, ` +
        `≈ ${f(sum(headHit) + Math.round(sum(tailHit) * w))} readers`);
      if (fixHit.length && !tailHit.length)
        console.log(`      NOTE: ${fixHit.length} member(s) of this class in this run are hand-picked FIXTURES ` +
          `(${fixHit.map((x) => x.name).join(", ")}) and the random draw found NONE, so the upper bound above is ` +
          `all this run establishes — a fixture is not a draw and must not be scaled.`);
    }
  }

  for (const [lbl, a, cap] of [["WRONG NOW (causal + anchored future)", A.causalFuture, 12],
    ["NEWLY REACHED by the SUFFIX anchor — every member printed, to be READ", A.causalFuture.filter((x) => x.sufOnly.length), 999],
    ["PRESUPPOSES the feature (anchored future, must be KEPT)", A.causalPresupposes, 999],
    ["LATENT + future", A.latentFuture, 12],
    ["CAUSAL + in-year (correct)", A.causalInYear, 12], ["CAUSAL + only the evaluation date", A.causalUnanchored, 12]]) {
    if (!a.length) continue;
    console.log(`\n  --- ${lbl} ---`);
    for (const x of a.sort((p, q) => q.ppl - p.ppl).slice(0, cap)) {
      console.log(`    ${String(x.ppl).padStart(7)}ppl  ${x.ack}  ${x.name.slice(0, 40)}  PYE ${x.pyeY}-${String(x.pyeM).padStart(2, "0")}  [${x.stratum}/${x.tier}]${x.catchup ? " catch-up" : ""}`);
      console.log(`             future ${JSON.stringify(x.future)} eff ${JSON.stringify(x.eff)} inYear ${JSON.stringify(x.inYear)}`);
      console.log(`             quote ${JSON.stringify(String(x.quote).slice(0, cap > 12 ? 300 : 150))}${String(x.quote).length > (cap > 12 ? 300 : 150) ? ` …+${String(x.quote).length - (cap > 12 ? 300 : 150)}` : ""}`);
    }
    if (a.length > cap) console.log(`    … ${a.length - cap} more`);
  }
}

/* OVERLAP, stated as the owner asked: two fix-counts priced separately would
 * double-count exactly these plans. */
console.log(`\n=== OVERLAP of the two defect classes (judged set) ===`);
for (const arm of ARMS) {
  const A = R.arms[arm];
  const neg = new Set(A.denial.map((x) => x.ack));
  const se = new Set([...A.causalFuture, ...A.latentFuture].map((x) => x.ack));
  const both = [...se].filter((a) => neg.has(a));
  console.log(`  ${arm}: negation ${A.denial.length} plans; future-amendment ${se.size} plans; BOTH ${both.length} plans` +
    ` (${f(sum(A.denial.filter((x) => se.has(x.ack))))} readers)`);
  if (both.length) console.log(`    ${both.slice(0, 10).join(" ")}`);
}

if (fails.length) {
  console.error(`\nPINNED FIXTURES FAILED — the measurement is not believable:`);
  for (const x of fails) console.error(`  ${x}`);
  process.exit(1);
}
console.log(`\nall ${FIX.cases.length} pinned fixtures reproduced`);
