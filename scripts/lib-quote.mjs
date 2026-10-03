/* wampo — the canonical test for "may this quote be published under a MATCH
 * heading?"
 *
 * WHY THIS FILE EXISTS. The rule was written once, inline, in app.js. The
 * static page generator never got it, so 615 of the 5,000 published pages
 * printed the heading "Match formula, as filed" over whatever sentence the
 * extractor had stored — 269 of them over a sentence containing no number at
 * all. That is the SECOND time in one day that one sentence living in two
 * places let the interactive report be corrected while the page generator went
 * on publishing the old behaviour (the first was the "withdrawn from the
 * EFAST2 bucket" wording). So the rule now lives in exactly one place, and
 * app.js exposes its copy for the smoke test to compare against the fixtures
 * in docs/quote-guard-cases.json.
 *
 * WHAT IT REJECTS, and why each rejection is safe.
 * `matchText` is the sentence the extractor picked as evidence of a match. It
 * is chosen by proximity to matching language, so it is frequently a sentence
 * that MENTIONS matching while describing something else:
 *   - no number at all      "They may select from among several funds in which
 *                            to invest their ... matching contributions."
 *   - a vesting schedule    "Company matching contributions vest 20% annually
 *                            until the participant is 100% vested."
 *   - account mechanics     "Each participant's account is credited with the
 *                            participant's contributions, the Company's
 *                            matching contributions, and the allocation of..."
 *   - eligibility only      "Contributions made prior to completing 12 months
 *                            of service are not eligible for the match."
 *
 * The last three rejections all require the ABSENCE of a rate expression in
 * match position. A sentence that does state a rate is kept even when it also
 * talks about vesting or crediting, so this can only ever drop sentences that
 * carry no formula. That direction matters: publishing "no formula stated"
 * when the filing stated one is as much a lie as the reverse.
 *
 * THE QUOTE DOES TWO DIFFERENT JOBS, and the test is not the same for both.
 * Measured before shipping: 8,120 plans carry a PARSED formula whose quote
 * states no number — "The Company may elect to make discretionary matching
 * contributions to the Plan." A discretionary match has no number; that
 * sentence is the correct and complete evidence for the formula we display.
 * Requiring a digit of it would have stripped the evidence from 8,120 plans
 * to fix a false heading on 615 pages. So:
 *   hasFormula=true  — the quote SUPPORTS a formula shown above it. It needs
 *                      only to be about the match at all.
 *   hasFormula=false — the quote IS the claim, under "Match formula, as
 *                      filed". It must actually state a rate.
 * app.js applied the strict test in both positions, which is why those 8,120
 * plans render a formula with its evidence missing today. This fixes that too.
 */

/* A number doing the work of a match RATE rather than sitting in some other
 * position in the sentence. Four shapes, each calibrated against real filings:
 *
 * PCT_THEN_OF   "50% OF eligible compensation", "12 percent OF the
 *               participant's compensation". Restricted to PERCENTAGES on
 *               purpose: "$29,342 OF employer matching contributions" is a
 *               year's TOTAL, not a rate, and El Valor published exactly that
 *               under a formula heading while this allowed dollars through.
 *               A vesting percentage does not take these connectors — it reads
 *               "vested 20% AFTER two years", "vest at 20% EACH year" — which
 *               is what separates the two without parsing the sentence. Bare
 *               "each" is excluded for that reason; only "for each".
 * LEADIN_RATE   "equal to fifty percent (50%)", "a 100% match", "up to 4%".
 *               Needed because the rate and its connector are frequently NOT
 *               adjacent: "(50%) of" defeats an adjacency test, and three of
 *               ten sampled drops were real formulas phrased this way.
 * DOLLAR_RATE   "$500 PER year", "$45 per month" — a dollar amount only counts
 *               when a period makes it a rate.
 * WORD_RATE     "dollar-for-dollar", "50 cents for each dollar".
 *
 * The gap between the number and its connector is bounded (~15-25 chars) so a
 * connector belonging to a later clause cannot reach back and validate an
 * unrelated number. */
/* Auditors write the rate both ways, often in one sentence ("equal one hundred
 * (100%) percent"). Sampling the drops found spelled-out percentages were the
 * single largest cause of losing a real formula, so both forms count. */
const WORDNUM = "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|one hundred|hundred)(?:[- ](?:five|hundred))?";
const N = `(?:\\d+(?:\\.\\d+)?\\s?(?:%|percent)|${WORDNUM}\\s+percent)`;
const PCT_THEN_OF = new RegExp(`(?:${N})[^.]{0,15}?\\b(?:of|on|for each|for every|up to|not to exceed|to a maximum)\\b`, "i");
const LEADIN_RATE = new RegExp(
  `\\b(?:up to|not to exceed|equal(?:s|ling)? to|equals|equal|a maximum of|maximum of|lesser of)\\b[^.]{0,25}?(?:${N}|\\$\\s?[\\d,]+)`, "i");
const DOLLAR_RATE = /\$\s?[\d,]+(?:\.\d+)?\s*(?:per|each|a)\s+(?:year|month|pay period|payroll|participant|annum)/i;
const WORD_RATE = /\bdollar[- ]for[- ]dollar\b|\b\d+\s?cents?\s+(?:for|on|per)\b|\bone[- ](?:half|third|quarter)\s+of\b/i;
const RATE_IN_MATCH_POSITION = {
  test: (t) => PCT_THEN_OF.test(t) || LEADIN_RATE.test(t) || DOLLAR_RATE.test(t) || WORD_RATE.test(t),
};

const MENTIONS_VESTING = /\bvest(?:s|ed|ing)?\b/i;
const ACCOUNT_MECHANICS = /\b(?:is|are) credited with\b|\bare recorded when\b|\bon the accrual basis\b/i;
const ELIGIBILITY_ONLY = /\b(?:not eligible for|(?:are|is) eligible to (?:receive|participate)|becomes? eligible for|to be eligible (?:for|to))\b/i;

/**
 * True when `text` may be shown to a reader under a match heading.
 * @param {string} text        the stored matchText
 * @param {boolean} hasFormula whether an extracted formula is displayed above
 *                             it. When false the quote must stand alone as the
 *                             formula, which is the stricter test.
 */
export function matchQuoteOk(text, hasFormula = false) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (/^Vesting\b/i.test(t)) return false;       // one sentence used as evidence for both; this one is the vesting note
  if (RATE_IN_MATCH_POSITION.test(t)) return true;
  if (MENTIONS_VESTING.test(t)) return false;    // the number is attached to "vested", not to the match
  if (ACCOUNT_MECHANICS.test(t)) return false;
  if (ELIGIBILITY_ONLY.test(t)) return false;
  /* States no rate. It can corroborate a formula we parsed (a discretionary
   * match has no number to state); it cannot BE one. */
  return hasFormula;
}

/* ---- the VESTING quote, which has the same disease ----------------------
 *
 * `vestingText` is selected by proximity to vesting language, so it is often a
 * sentence that MENTIONS vested money while stating a completely different
 * rule. PSEG — the plan the owner asked about — publishes, under
 * "Employer-money vesting" and over the line "Quoted from the audited
 * financial statements":
 *
 *   "If a Participant withdraws certain post-income tax Deposits and/or vested
 *    Employer Matching Contributions before such amounts have been in the Plan
 *    for twenty-four months, the Participant will not be eligible to receive
 *    matching Employer Matching Contributions during the subsequent six
 *    months."
 *
 * That is a withdrawal-suspension rule. Charter Communications (120,688
 * participants) publishes a LOAN LIMIT. Vensure publishes raw Form 5500
 * table text in which the only vest-stem is part of a company's NAME, VESTED
 * METALS INTERNATIONAL LLC. Brown University publishes a plan-amendment
 * sentence about contribution formulas.
 *
 * SIX MEASUREMENT PASSES WENT INTO THIS PREDICATE AND FIVE WERE REFUTED BY
 * READING THEIR OWN MEMBERS, never twice for the same reason:
 *   - "no vesting ARITHMETIC"  2,433 entries / 3.9M ppl — and almost all were
 *     honest rules stated without numbers ("fully vested at all times",
 *     "based on years of continuous service").
 *   - "no vesting VOCABULARY"  2 entries — and PSEG was not among them,
 *     because its sentence does say "vested". A MEASUREMENT THAT CANNOT SEE
 *     ITS OWN MOTIVATING EXAMPLE HAS NOT BEEN SCOPED.
 *   - three successively wider "no vesting PREDICATE" screens, 181 -> 100 ->
 *     80, each still admitting real quotes: "a participant's vested interest
 *     ... is based upon years of continuous service" (missed phrasing), "are
 *     100% immediately vested" (`\w` cannot match `%`), "one hundred percent
 *     (100%) vested", and ladders written with no percent sign at all
 *     ("3 years 25  4 years 50", Church & Dwight).
 *
 * The lesson that produced the shipped shape: "is this sentence about vesting"
 * is a semantic judgment, and every syntactic screen for its ABSENCE leaks. So
 * this does not screen for absence. It requires BOTH
 *   (a) the sentence states a DIFFERENT named plan rule — a loan limit, an
 *       in-service withdrawal or distribution, a merger or amendment, or raw
 *       form-table text — each arm anchored on that rule's own vocabulary, and
 *   (b) no vesting rule anywhere in it, under a deliberately GENEROUS test.
 *
 * The one genuinely general thing six passes taught: a vesting RULE needs a
 * copula or a verb form ("are vested", "vest", "vesting"), an explicit
 * percentage-vested, a ladder, or "vested interest/portion ... based upon". An
 * ADJECTIVAL "vested Employer Matching Contributions" is a noun phrase some
 * other rule acts on, and is never itself a rule. That is exactly the PSEG
 * shape, and it is why (b) can be generous without swallowing the class.
 *
 * MEASURED store-wide over all 58,283 stored vestingText entries: 39 entries /
 * 213,948 participants fail both conditions, and all 39 publish the quote with
 * NO vesting label above it — so the quote IS the whole answer in every case.
 * Every one of the 39 was read. Withholding leaves the existing honest
 * fallback, "not stated in the audited notes — check the plan's SPD".
 *
 * DIRECTION, as with matchQuoteOk: a false positive here withholds an honest
 * quote, which costs a reader information; a false negative publishes a false
 * claim about what the filing says. Those are not symmetric, which is why (b)
 * is generous and (a) is anchored rather than vocabulary-wide. */

const VQ_RULE_WORD = String.raw`(?:based upon|based on|dependent upon|dependent on|determined by|determined based|according to|as follows|following (?:table|schedule)|years of (?:credited |vesting |continuous )?service|increments of|anniversar|cliff|graded)`;
/* (b) ANY vesting rule. Generous on purpose — see the note above. */
const VQ_VESTS = new RegExp([
  String.raw`\bvests?\b`,
  String.raw`\bvesting\b`,
  String.raw`\bforfeit`,
  /* a copula before the participle, with anything in the gap: "are 100%
   * immediately vested", "is one hundred percent (100%) vested" */
  String.raw`\b(?:are|is|was|were|be|become|becomes|became|been|have|has|had)\b[^.]{0,40}?\bvested\b`,
  String.raw`\bvested\s+(?:in|after|upon|at|according|based|immediately|when|once|following)\b`,
  String.raw`\bvested\s*(?:\d{1,3}\s?%|percent)`,
  String.raw`(?:\d{1,3}\s?%|percent)\s*\)?\s*vested\b`,
  String.raw`\bvested\s+(?:interest|percentage|portion|percent|value|service)\b[\s\S]{0,200}?${VQ_RULE_WORD}`,
  String.raw`${VQ_RULE_WORD}[\s\S]{0,200}?\bvested\s+(?:interest|percentage|portion|percent|value)\b`,
  /* a ladder, with or without percent signs */
  String.raw`\d{1,3}\s?%[\s\S]{0,40}?(?:year|anniversar)`,
  String.raw`(?:year|anniversar)[\s\S]{0,40}?\d{1,3}\s?%`,
  String.raw`\d\s+years?\b[\s\S]{0,8}\d{2,3}\b[\s\S]{0,40}?\d\s+years?\b`,
].join("|"), "i");

/* (a) the other named rule. Each arm is anchored on vocabulary that rule owns,
 * not on a word it merely contains: "loan" alone would catch "one-half of the
 * participant's vested balance" inside a real vesting sentence. */
const VQ_OTHER_RULE = new RegExp([
  /* loan limit */
  String.raw`\b(?:participant loans?|loans? (?:are|from|under|permitted|secured)|may borrow|minimum loan|maximum loan|outstanding (?:loan|balance of any previous loan))\b`,
  /* raw Form 5500 table text bled into the notes */
  String.raw`\b2[a-d]\b[\s\S]{0,60}\bEIN\b`,
  String.raw`Name of Participating`,
  /* a merger or an amendment */
  String.raw`\b(?:was|been) (?:amended|merged)`,
  String.raw`merged into the Plan`,
  String.raw`transferred in full to the receiving plan`,
  String.raw`In-Plan Roth Conversions`,
  /* an in-service withdrawal or a distribution.
   * `withdraws` is here because without it THE MOTIVATING CASE ESCAPED. The
   * first store-wide count of this class — 39 entries — did not contain PSEG,
   * whose sentence opens "If a Participant WITHDRAWS", third person singular,
   * where every arm written from the sample said "may withdraw". That is the
   * SECOND time in this one investigation that a measurement could not see its
   * own motivating example, and it was caught by a pinned fixture failing
   * rather than by re-reading the count. */
  String.raw`\b(?:may (?:elect to )?withdraw|may withdrawal|withdraws|in-service (?:withdrawal|distribution)|allows for in-service|available for distribution|must take a distribution|may (?:elect to )?receive (?:a |all|either|the )|entitled to (?:receive|the (?:full|total) value)|Payments of Benefits|payable upon|reallocated to supplement)\b`,
].join("|"), "i");

/**
 * True when `text` may be shown to a reader under a vesting heading.
 * @param {string} text the stored vestingText
 */
export function vestingQuoteOk(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (VQ_VESTS.test(t)) return true;          /* (b) states a vesting rule */
  return !VQ_OTHER_RULE.test(t);              /* (a) states another one */
}

/* `node scripts/lib-quote.mjs --selftest` — the same convention lib-schema.mjs
 * uses. Runs the pinned fixtures; the browser twin is checked against the very
 * same file by scripts/smoke-test.mjs. */
if (process.argv[1] && process.argv[1].endsWith("lib-quote.mjs") && process.argv.includes("--selftest")) {
  const { readFileSync } = await import("node:fs");
  const url = new URL("../docs/quote-guard-cases.json", import.meta.url);
  const { cases, vestingCases } = JSON.parse(readFileSync(url, "utf8"));
  let bad = 0;
  for (const c of cases) {
    const got = matchQuoteOk(c.text, c.hasFormula);
    if (got !== c.expect) {
      bad++;
      console.log(`FAIL expected ${c.expect} got ${got} [${c.why}]\n     "${c.text.slice(0, 120)}"`);
    }
  }
  for (const c of vestingCases || []) {
    const got = vestingQuoteOk(c.text);
    if (got !== c.expect) {
      bad++;
      console.log(`FAIL vesting expected ${c.expect} got ${got} [${c.why}]\n     "${c.text.slice(0, 120)}"`);
    }
  }
  const n = cases.length + (vestingCases || []).length;
  console.log(bad ? `\n${bad} of ${n} fixtures FAILED` : `all ${n} quote-guard fixtures pass`);
  process.exit(bad ? 1 : 0);
}
