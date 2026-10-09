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
/* (c) THE BLANK FORM IS NOT A PLAN'S RULE — 2026-10-04, found while gating v201.
 *
 * Form 5500 line 6g(2) prints the question *"Number of participants who
 * terminated employment during the plan year with accrued benefits that were
 * less than 100% vested"*. The composite PDF carries the form pages ahead of
 * the audited attachment, so that sentence is in EVERY filing's text — and it
 * carries a vest word and a percentage, so **`VQ_VESTS` accepts it and (b)
 * returns true before (a) is ever consulted.** The extractor's own `BOILER`
 * filter does not block it either (no underscore run, no `part IV`, no
 * `2[01][abc]`), and `audit-data`'s form-question check reads `matchText` ONLY.
 * So nothing anywhere tested a VESTING quote for form text.
 *
 * MEASURED over the extractor's OWN candidate sets (sliced out of lib-4i.mjs
 * and run, not retyped) across both local corpora — **364 filings, 2,361
 * guard-accepted candidates, and this sentence is an accepted candidate in ALL
 * 364.** It is published on none of them today, because an unrelated `continue`
 * inside the vesting loop happens to drop it first. That is luck, not design,
 * and v201 made the guard an ORACLE THE PARSER CONSULTS — so the next change to
 * that `continue` would promote the blank form onto 30+ plan pages.
 *
 * ONE ARM, BY LEAVE-ONE-OUT RATHER THAN BY TASTE. Three were written. The
 * digit-box filler `123456789012` fires ALONE on 304 candidates and is
 * **NECESSARY for 0** — every one is also caught by the printed question — and
 * a `number of deferred vested` arm (Schedule SSA) fires on **0**. Sufficiency
 * is not necessity: only the printed question is load-bearing (alone 386,
 * necessary for 82), so only it ships.
 *
 * THE PRICE IS ZERO AND THAT IS THE WHOLE SAFETY CASE: of all **58,257
 * PUBLISHED** vesting quotes in the store, this veto withholds **0**. It cannot
 * take a quote off a page; it can only stop one arriving. (A first attempt to
 * size the class from the STORED quotes read 0 among published AND 0 among
 * withheld — *a both-sided zero across a whole population reports on the
 * query* — which is why the vocabulary comes from the candidate sets.)
 *
 * It is checked BEFORE (b), because (b) is what accepts it. */
const VQ_FORM_TEXT = /\bNumber of participants who terminated employment during the plan year\b/i;

export function vestingQuoteOk(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (VQ_FORM_TEXT.test(t)) return false;     /* (c) is the blank form's own question */
  if (VQ_VESTS.test(t)) return true;          /* (b) states a vesting rule */
  return !VQ_OTHER_RULE.test(t);              /* (a) states another one */
}

/* ---- AND THE PUBLISHED SENTENCE IS THE ACCELERATION CLAUSE, NOT THE SCHEDULE
 * 2026-10-09, from the queue entry sized 2026-10-05 02:3xZ.
 *
 * `vestingQuoteOk` asks "is this sentence a vesting rule?" and these sentences
 * ARE one, so it accepts them and should. The defect is one layer up: where the
 * extractor found no vesting LABEL, the quote is the plan's WHOLE published
 * vesting answer, and for this class that answer is
 *
 *   "A participant becomes fully vested in Company contributions and earnings
 *    thereon if the participant's termination of employment occurs due to
 *    death, disability or normal retirement."          (Smith And Nephew)
 *   "A participant becomes 100% vested in Employer Contributions if the
 *    participant becomes totally disabled, dies or reaches age 65 while
 *    employed by the Company."                         (U.S. Fire Insurance)
 *
 * Every word TRUE, and answering a different question. An accelerated-vesting
 * clause is near-universal boilerplate; it says nothing about when a
 * participant who simply LEAVES owns employer money, which is the only thing a
 * reader of the vesting line wants.
 *
 * SO THIS IS NOT A GUARD AND MUST NOT BECOME ONE. Reading the six largest
 * filings of the class (2026-10-05 02:3xZ) found that FIVE OF SIX state no
 * ladder anywhere in the attachment — so withholding the quote would publish
 * "not stated in the audited notes" about a filing that DID state something.
 * *A guard that withdraws a true answer because it is incomplete makes the page
 * less honest, not more.* The quote stays; a sentence beside it says what the
 * quote is.
 *
 * AND THE CLAIM IS ABOUT THE QUOTE, NOT ABOUT THE FILING. The queue entry
 * prescribed a label reading "the notes state only when vesting ACCELERATES",
 * which is a claim about the attachment — and it is FALSE for the minority:
 * Aaron Thomas (2,285 ppl) files a real `Years of service | Vesting %` table
 * (2->20, 3->40, 4->60, 5->80, 6->100) that the extractor did not select. A
 * label asserting the notes say nothing more would be a NEW false statement on
 * that page. What the shipped wording asserts instead — that THIS SENTENCE
 * states when vesting is accelerated and does not say how employer money vests
 * for someone who leaves before then — is verifiable from the published
 * sentence alone, cannot be falsified by a ladder elsewhere in the attachment,
 * and needs no per-filing reading to be safe.
 *
 * THE SHAPE: a FULL-vesting claim, an ACCELERATION trigger, and no SCHEDULE
 * anywhere in the sentence under a deliberately generous test — the same
 * conjunction shape as `vestingQuoteOk`, and generous in the same direction,
 * because here a false positive puts a qualifier on a sentence that does state
 * a schedule.
 *
 * PLAN TERMINATION IS DELIBERATELY NOT A TRIGGER. For a plan that HAS
 * terminated, "all participants become fully vested upon termination of the
 * Plan" is a complete answer, not an acceleration exception. Termination of
 * EMPLOYMENT due to death is a trigger and is reached by the death arm. */
/* NO TRAILING `\b` AFTER THE ALTERNATION. The first version had one, and `%` is
 * a non-word character, so `100%` followed by a space has no boundary between
 * them: the arm matched "fully vested" and MISSED "100% vested", which is the
 * commonest spelling in the class. Five of the six pinned filings failed, and
 * they failed BEFORE the count printed — which is the only reason this is a
 * footnote and not a published figure. */
/* AND THE PERCENTAGE FOLLOWS THE PARTICIPLE AS OFTEN AS IT PRECEDES IT. Manko
 * Window Systems (423 ppl) files "An employee who becomes disabled, dies, or
 * reaches age 60 will be VESTED 100% in employer contributions" — a textbook
 * member the forward-only arm missed, found by the leave-one-out asking what
 * requiring AV_FULL keeps out. The other two it keeps out are forfeiture
 * accounting ("The NON-VESTED account balances of participants who terminated
 * for any reason other than death …", Emeh, 1,163 ppl) and a distribution
 * election (Aspeq Heating, 508) — both correctly refused, which is what makes
 * this condition load-bearing in the first place. */
const AV_FULL = new RegExp([
  String.raw`(?:\b100\s?%|\b100\s+percent\b|\bone\s+hundred\s+percent\b|\bfully\b|\bfull\b)[^.]{0,40}?\bvest`,
  String.raw`\bvested\s+(?:100\s?%|100\s+percent\b|one\s+hundred\s+percent\b)`,
].join("|"), "i");
/* each arm is an event that ACCELERATES vesting — it happens TO a participant
 * rather than being measured in service */
const AV_TRIGGER = new RegExp([
  String.raw`\b(?:death|dies|died|deceased)\b`,
  String.raw`\bdisab`,
  String.raw`\b(?:normal|early)\s+retirement\b`,
  String.raw`\bretirement\s+age\b`,
  String.raw`\b(?:attain|attains|attaining|reach|reaches|reaching)\w*\s+(?:the\s+)?age\b`,
  String.raw`\bage\s+(?:\d{2}|sixty|sixty-five|fifty-nine)\b`,
].join("|"), "i");
/* ABSENCE of all of these is the third condition. Generous on purpose: any hint
 * that the sentence also carries a schedule — a service requirement, a
 * percentage that is not 100, a ladder word, or an IMMEDIATE-vesting statement,
 * which is itself a complete answer — refuses the qualifier.
 *
 * FIVE MORE ARMS WERE WRITTEN AND DELETED BY LEAVE-ONE-OUT: `as follows`,
 * `graded|cliff|increment`, `anniversar`, `(per|each|every) year` and the
 * spelled-out `twenty percent` family each admit **0** quotes the surviving
 * arms do not already refuse. Every arm below has a real single-protection case
 * drawn from the pool and named at its own line. *A control that cannot fail is
 * decorative*, and an arm that can never be the only protection is the same
 * thing in the other register; a future filing that needs one of them brings
 * its own case with it. */
const AV_SCHEDULE = new RegExp([
  String.raw`\byears?\s+(?:of\s+)?(?:\w+\s+){0,2}?(?:service|employment|participation)\b`,
  /* A COUNT OF YEARS IS A SCHEDULE, AND THE FILINGS SPELL IT FOUR WAYS. Three
   * live false positives needed this arm and one of them is the typo this
   * record already names: Gilster-Mary Lee (2,288 ppl) files "after six (6)
   * yeas of vesting services", a COMPLETE six-year rule, so neither the
   * service arm above (`yeas`) nor a digit test (`six`) reaches it — hence the
   * spelled numbers, the optional parenthesised digit AND the `yeas` stem.
   * Stone Belt Arc states "at the end of three years or earlier when you reach
   * normal retirement age", a three-year cliff beside the exception.
   * The `age` lookbehind is what keeps "reaches age 65 years" out of it: an age
   * is not a service count, and that spelling is in the class itself. */
  String.raw`(?<!age )\b(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:\(\s?\d{1,2}\s?\)\s*)?(?:years?|yrs?|yeas)\b`,
  String.raw`\b[1-9]\d?\s?%`,                        /* 1-99%: a ladder step. 100% cannot match */
  /* `schedule` is taken BARE on purpose. Onestream Software (1,028 ppl)
   * publishes its whole ladder inside the quote — "in accordance with the
   * following schedule: Vesting Service (Years) Vesting (%) Less than 1 - 1
   * but less than 2 25 2 but less than 3 50 …" — whose steps carry no percent
   * sign and whose year column is spelled `Service (Years)`, so every narrower
   * arm missed it. A sentence that refers to a schedule at all is a sentence
   * this qualifier must not describe. */
  String.raw`\bschedule`,
  String.raw`\bimmediate`,                           /* a complete answer is present */
  String.raw`\bcompleting\b|\bcompletion\s+of\b`,
  String.raw`\bhours\s+of\s+service\b`,
].join("|"), "i");

/* VESTING AS THE PRECONDITION OF ANOTHER RULE, which `VQ_OTHER_RULE`'s
 * vocabulary reaches only when it happens to name the rule. Akins Ford (384
 * ppl) publishes "Upon attainment of age 59 ½, benefits attributable to any
 * employer contributions … are available for withdrawal **if the participant is
 * 100% vested** in those benefits" — an age trigger and a full-vest claim, and
 * no acceleration anywhere: the vesting is the CONDITION, the withdrawal is the
 * rule. Anchored on the subordinator so it cannot reach a main-clause claim:
 * "If Participants were employed on or after their retirement age, the …
 * contributions were fully vested" (Patriot Transportation) is the class
 * itself and must survive. */
const AV_VEST_AS_CONDITION = /\b(?:if|provided(?:\s+that)?|to\s+the\s+extent|that|which|when)\s+(?:the\s+|they\s+|he\s+|she\s+|it\s+)?(?:\w+\s+){0,2}?(?:is|are|was|were)\s+(?:100\s?%|100\s+percent|fully)\s*vested/i;
/* AND AN `including` CLAUSE MAKES THE TRIGGER AN EXAMPLE RATHER THAN THE
 * CONDITION. Lehigh Heavy Forge (163 ppl) files "All participants, INCLUDING
 * participants incurring a severance from employment as a result of death or
 * disability, are 100% vested in elective deferrals and employer discretionary
 * contributions" — universal vesting, a COMPLETE answer, with the trigger words
 * sitting inside an appositive. Telling that reader the sentence does not say
 * how employer money vests would be a new false claim. */
const AV_INCLUDING = /\bincluding\b/i;

/**
 * True when a published vesting quote states only when vesting is ACCELERATED.
 * The caller must also have NO vesting label to show: where a label exists the
 * schedule already reaches the reader and the qualifier would be noise.
 * @param {string} text the quote as published (post-`quoteTrim`)
 */
export function accelerationOnlyVesting(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (!AV_FULL.test(t)) return false;
  if (!AV_TRIGGER.test(t)) return false;
  /* A `VQ_OTHER_RULE.test(t)` refusal stood here and was REMOVED BY
   * MEASUREMENT, not by taste. It was written for Bridgestone Hosepower (882
   * ppl), "Participants may receive an in-service distribution … from all of
   * their accounts that are fully vested" — an adjectival vest-word on a
   * DISTRIBUTION rule, which `vestingQuoteOk` publishes anyway because its
   * condition (b) sees "are fully vested" and returns before (a) is asked.
   * Leave-one-out over the whole pool: neutering it admits **0** quotes the
   * class does not already refuse, because `AV_VEST_AS_CONDITION` catches
   * Bridgestone on `that are fully vested`. Sufficient, necessary for nothing.
   * *A condition that can never be the only protection proves nothing.* */
  if (AV_VEST_AS_CONDITION.test(t)) return false;
  if (AV_INCLUDING.test(t)) return false;
  return !AV_SCHEDULE.test(t);
}

/* TABLE DEBRIS LEADING A PUBLISHED QUOTE — 2026-10-03, found by the 15:0xZ
 * participant-weighted draw.
 *
 * Lithia Motors (30,021 participants) publishes its match quote as
 *   "| Contributions — The Plan provides for employee contributions, …"
 * A leading Schedule-H COLUMN BAR, verbatim, in front of 30,021 readers. The
 * two guards above decide WHETHER a quote may be published; nothing decides
 * what its first character is, so whatever glyph the extractor's sentence
 * window opened on goes out with it. `cleanFiledName` does this work for the
 * NAME column and had no counterpart here.
 *
 * 64 quotes / 64 plans / 129,653 participants, which is the PUBLISHED figure
 * and not the stored one: the raw store holds 65, and the 65th
 * (Mike Albert Leasing, 425 ppl) is already suppressed by `matchQuoteOk`, so
 * trimming it would reach no reader. *A STORED field is not a PUBLISHED one.*
 *
 * THE GATE IS "A SENTENCE MUST REMAIN", and it is what separates a repair from
 * a truncation. Measured, the refusals are load-bearing — 9 quotes / 9,434 ppl
 * whose debris cannot be trimmed because what is behind it is not a sentence:
 *   - Soo Line Railroad (5,584 ppl) "`) are immediately vested in their
 *     employer matching contributions`" — the window opened MID-SENTENCE, so
 *     trimming the paren leaves "are immediately vested…", a fragment.
 *   - Steak N Shake (1,281) "`| | -6- 1 | | ) | | | Vesting — …`" — a
 *     page-furniture run carrying a PAGE NUMBER; the residue fails the
 *     sentence test, so it is left alone.
 *   - Union Avenue Healthcare (598) "`; ; ' The Company contributions …`" and
 *     Revela Foods (384) "`| £ a a The Company contributes …`" — stripping the
 *     punctuation leaves MORE debris (`' The`, `£ a a The`), which is OCR
 *     noise and not punctuation, so a wider vocabulary is the wrong answer.
 *   - Yusen Logistics (2,617) "`,000 (indexed) or 150% of the regular age-50
 *     catch-up limit`" — ***the comma is not leading punctuation, it is the
 *     inside of `$23,000`***, and trimming it leaves "000 (indexed)". A COMMA
 *     IS THEREFORE NOT IN `LEAD` AT ALL: a leading-glyph repair and a
 *     mid-sentence truncation look identical from the first character, and only
 *     what REMAINS tells them apart.
 *
 * THE TWO PROTECTIONS WERE MEASURED SEPARATELY, because Yusen is covered by
 * BOTH (the comma is absent from LEAD *and* the sentence gate would refuse it),
 * so no single drift can expose it and a fixture for it alone cannot fail.
 * Over the 105,220 published quotes: the comma's absence from LEAD is the only
 * protection on **10 quotes / 10 plans / 4,551 ppl** (Pentegra's
 * "`, CONTINUED Note 1 – Description of Plan, Continued Vesting …`", where
 * trimming the comma merely uncovers a page-header run — a different defect),
 * and the sentence gate is the only protection on **8 / 8 / 8,856**. Each now
 * has a real fixture of its own.
 *
 * AND ONE ARM WAS DROPPED FOR TOUCHING NOTHING. A `-6-` page-number stripper
 * was written first and ran ahead of LEAD; measured, it changed the published
 * text of **0 of 105,220 quotes**, and the Steak N Shake case it was written
 * for is refused by the sentence gate regardless. *An arm that is real in
 * principle and inert on the data is untested machinery* — its own negative
 * control could only ever read "breaks NOTHING".
 *
 * AND THE BULLET IS DELIBERATELY ABSENT. A first screen counted 157 quotes /
 * 428,797 ppl opening on "a stray bullet or dash run" and that is NOT a defect:
 * United Airlines (88,204 ppl) files "• Management and Administrative
 * Participants and UAFC Participants - …", which is the audited notes' own
 * bulleted list, and the bullet tells the reader this is one item of several.
 * *A count keyed on a character measures the character.*
 *
 * SAFETY, measured over the whole store: trimming changes NEITHER guard's
 * verdict on any of the 64 — 0 quotes move between shown and suppressed — so
 * this cannot change which plans publish a quote, only how one reads. That is
 * also why it is applied at the render site rather than inside the guards. */
const Q_LEAD = /^(?:[|│┃]|[)\]}]|[;:]|_)+[\s|)\]};:_.\-–]*/;
const Q_SENTENCE = /^(?:[A-Z]|\d+(?:\.\d+)?\s*%|["“(])/;

/* AND THE OTHER LEADING THING AN ATTACHMENT WELDS ONTO A SENTENCE: the PAGE
 * NUMBER AND RUNNING HEADER. 1,890 published quotes / 1,887 acks /
 * 6,096,337 participants open on it, and the largest is the largest plan in
 * the universe — Walmart (1,996,659 ppl) publishes, as its WHOLE vesting
 * answer, "6 Table of Contents Vesting Participants are immediately vested in
 * all elective, catch-up, rollover, Company matching and qualified
 * non-elective contributions." Starbucks (314,112) opens on nine words of
 * statement title; Kroger (262,794) on a bare "5".
 *
 * THE SHAPE IS THE ARM LOOP ABOVE, not something new: each arm may remove only
 * a segment it can NAME, and the SAME Q_SENTENCE gate judges the remainder. It
 * is deliberately NOT "strip up to the first rule-start word" — that is the
 * greedy shape that once published `Vanguard Windsor Fund` for Windsor II.
 *
 * SAFETY, measured over all 96,956 published quotes: 0 stop being publishable,
 * so like the arm above this cannot change WHICH plans publish a quote.
 *
 * TWO FALSE POSITIVES WERE FOUND BY READING THE REMOVED PREFIXES, NOT BY ANY
 * COUNT, and each earned a guard plus its own fixture:
 *   - Honeywell (63,466 ppl) files "Participating Units 6 Honeywell 401(k) -
 *     Continued covered by a non-variable match …" — the page number and
 *     header are welded MID-sentence and the sentence's own subject is its
 *     first two words. So a header run containing a bare integer is reaching
 *     past a header that does not start the quote (`\d` guard).
 *   - "In years in which the safe harbor provisions of Section 401(k) are
 *     satisfied …" (28,272 ppl) has no finite verb and no page marker in its
 *     run, so every other guard passed it. A running header is a PROPER NAME,
 *     so every word of the run must be capitalised or a connector.
 * A third came out of the integer distribution: 212 of 235 bare-integer
 * removals are single digits, which is what a page number looks like, and
 * every multi-digit one was read — two filings publish a SPACED "401 (k)",
 * where cutting the number leaves "(k) Vesting …" and mutilates the plan-type
 * token rather than removing a page number.
 *
 * NAMED RESIDUE, left alone on purpose: a quote opening on an orphaned union
 * LOCAL number ("117 Affiliated with the International Brotherhood of
 * Teamsters …", 160 ppl) is indistinguishable from a page number by shape. */
const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const Q_ARMS = [
  ["page-word",   /^page\s+(?:no\.?\s*)?\d{1,3}\b[\s.:—–-]*/i],
  ["paren-page",  /^\(\s*\d{1,3}\s*\)[\s.:—–-]*/],
  ["toc",         /^table of contents\b[\s.:—–-]*/i],
  ["continued",   /^(?:[-–—]\s*)?\(?\s*continued\s*\)?[\s.:—–-]*/i],
  ["notes-title", /^notes? to (?:the )?(?:consolidated )?financial statements?\b[\s.:—–-]*/i],
  ["period",      /^(?:for the )?(?:years?|periods?) ended MONTH \d{1,2},? \d{4}(?:\s+and\s+(?:MONTH \d{1,2},? )?\d{4})*[\s.:—–-]*/i],
  /* A DATE-LINE MUST BE A DATE: `[a-z]+ \d{1,2}, \d{4}` matched the word
   * FRAGMENT "er 31, 2025" (a truncated December), so the arm was accepting
   * any word followed by numbers. It takes a RUN of dates because one filing
   * was left opening on "AND DECEMBER 31, 2022", the second half of its own
   * comparative period. All 14 removals were read and all 14 are the
   * statement period, never a date the rule turns on. */
  ["date-line",   /^MONTH \d{1,2},? \d{4}(?:\s+(?:and|to|through|[-–—])\s+(?:MONTH \d{1,2},? )?\d{4})*[\s.:—–-]*/i],
  ["note-n",      /^note\s+\d+\s*[-–—:.]?\s*/i],
  ["descr",       /^description of (?:the )?plan\b[\s.:—–-]*/i],
  ["basis",       /^\((?:modified cash basis|in thousands|dollars? in thousands|dollar and share amounts in thousands)\)[\s.:—–-]*/i],
];
for (const a of Q_ARMS) if (/MONTH/.test(a[1].source)) a[1] = new RegExp(a[1].source.replace(/MONTH/g, MONTH), a[1].flags);
if (Q_ARMS.some((a) => /MONTH/.test(a[1].source))) throw new Error("lib-quote: a MONTH placeholder survived compilation");

/* a ladder/unit follower means a leading integer is table DATA, not a page
 * number: Motiva files "0 % For any portion exceeding 6% …" */
const Q_DATA_FOLLOWER = /^(?:%|percent\b|years?\b|yrs?\b|months?\b|or\s+(?:more|less)\b|but\s+less\b|and\s+(?:over|above)\b|to\s+\d)/i;
const Q_PLAN_PAREN = /^\(\s*[kb]\s*\)/i;
const Q_HEADER_VERB = /\b(?:is|are|was|were|will|may|shall|must|can|has|have|had|match(?:es|ed)?|contribut\w+|vest\w*|receive\w*|provide\w*|elect\w*|defer\w*|become\w*)\b/i;
const Q_NAME_CONNECTOR = /^(?:and|of|the|for|at|et|al\.?|de|la|von|van|&|-|–|—)$/i;
/* the plan-name suffix is a WORD RUN, not an alternation: alternation is
 * FIRST-match, so `plan|…|plan and trust` matched Starbucks' " Plan" and
 * stranded "and Trust", which then failed the gate and cost the whole trim. */
const Q_PLAN_TYPE = /^((?:[^\s]+\s+){0,11}?)(401\s?\(\s?k\s?\)|403\s?\(\s?b\s?\)|457\s?\(\s?b\s?\))((?:\s+(?:savings|retirement|investment|profit|sharing|and|the|of|plan|trust|program|fund)\b)*)[\s.:—–-]*/i;

function qHeaderArm(s) {
  const m = s.match(Q_PLAN_TYPE);
  if (!m) return null;
  const run = m[1];
  if (!run.trim()) return null;                /* the quote OPENS on 401(k) — no header */
  if (/[%$]/.test(run)) return null;           /* a rule, not a name */
  if (Q_HEADER_VERB.test(run)) return null;    /* a predicate, not a name */
  if (/(?:^|\s)\d{1,4}(?:\s|$)/.test(run)) return null;   /* the Honeywell guard */
  for (const w of run.trim().split(/\s+/)) {   /* a header is a proper NAME */
    if (!w || Q_NAME_CONNECTOR.test(w)) continue;
    if (!/^[(\["'“]*[A-Z0-9]/.test(w)) return null;
  }
  return m[0];
}

function quoteStripLead(input) {
  let s = String(input || "").trim();
  let best = null;
  for (let i = 0; i < 12; i++) {
    let fired = false;
    for (const [, re] of Q_ARMS) {
      const m = s.match(re);
      if (m && m[0].trim()) { fired = true; s = s.slice(m[0].length).trim(); break; }
    }
    if (!fired) {
      const h = qHeaderArm(s);
      if (h) { fired = true; s = s.slice(h.length).trim(); }
    }
    if (!fired) {
      const m = s.match(/^\d{1,3}\s+(?=\S)/);
      const after = m ? s.slice(m[0].length) : "";
      if (m && !Q_DATA_FOLLOWER.test(after) && !Q_PLAN_PAREN.test(after)) { fired = true; s = after.trim(); }
    }
    if (!fired) break;
    /* KEEP THE LAST STATE THAT PASSES THE GATE. Judging only the final state
     * lets a fired arm REFUSE THE WHOLE TRIM — measured, every arm had a
     * population that trimmed only when that arm was switched off. Backing off
     * can only return a prefix the shipped gate already accepts. */
    if (Q_SENTENCE.test(s) && s.length >= 25) best = s;
  }
  return best;
}

export function quoteTrim(text) {
  let t = String(text || "").trim();
  if (Q_LEAD.test(t)) {
    const rest = t.replace(Q_LEAD, "").trim();
    if (Q_SENTENCE.test(rest)) t = rest;
  }
  return quoteStripLead(t) || t;
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
  for (const c of (JSON.parse(readFileSync(url, "utf8")).accelCases) || []) {
    const got = accelerationOnlyVesting(c.text);
    if (got !== c.expect) {
      bad++;
      console.log(`FAIL accel expected ${c.expect} got ${got} [${c.why}]\n     "${c.text.slice(0, 120)}"`);
    }
  }
  const { trimCases, accelCases } = JSON.parse(readFileSync(url, "utf8"));
  for (const c of trimCases || []) {
    const got = quoteTrim(c.text);
    if (got !== c.expect) {
      bad++;
      console.log(`FAIL trim [${c.why}]\n     in   "${c.text.slice(0, 110)}"\n     want "${c.expect.slice(0, 110)}"\n     got  "${got.slice(0, 110)}"`);
    }
  }
  const n = cases.length + (vestingCases || []).length + (trimCases || []).length + (accelCases || []).length;
  console.log(bad ? `\n${bad} of ${n} fixtures FAILED` : `all ${n} quote-guard fixtures pass`);
  process.exit(bad ? 1 : 0);
}
