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

/* `node scripts/lib-quote.mjs --selftest` — the same convention lib-schema.mjs
 * uses. Runs the pinned fixtures; the browser twin is checked against the very
 * same file by scripts/smoke-test.mjs. */
if (process.argv[1] && process.argv[1].endsWith("lib-quote.mjs") && process.argv.includes("--selftest")) {
  const { readFileSync } = await import("node:fs");
  const url = new URL("../docs/quote-guard-cases.json", import.meta.url);
  const { cases } = JSON.parse(readFileSync(url, "utf8"));
  let bad = 0;
  for (const c of cases) {
    const got = matchQuoteOk(c.text, c.hasFormula);
    if (got !== c.expect) {
      bad++;
      console.log(`FAIL expected ${c.expect} got ${got} [${c.why}]\n     "${c.text.slice(0, 120)}"`);
    }
  }
  console.log(bad ? `\n${bad} of ${cases.length} fixtures FAILED` : `all ${cases.length} quote-guard fixtures pass`);
  process.exit(bad ? 1 : 0);
}
