/* wampo — ONE slice of `extractPlanFeatures`'s match-quote machinery, shared by
 * every instrument that has to ask "what would the fallback loops do with this
 * filing?".
 *
 * WHY IT IS A LIBRARY. The match quote fallback is two loops over `mre` /
 * `MF_FVERB` with four rejections, all of them INLINE inside
 * `extractPlanFeatures`, so they cannot be imported. `match-cause-census.mjs`
 * read them out of the source and compiled them, and a second instrument now
 * needs the identical thing. This record's standing rule is that a construction
 * is SHARED rather than retyped: *a harness that re-types a mechanism measures
 * the re-typing*, and a hand-rebuilt candidate loop has already given the
 * OPPOSITE attribution once on this project.
 *
 * So this file is the census's slice, moved verbatim, plus the one thing the
 * second instrument needs that the census did not: an enumeration of EVERY
 * match-vocabulary sentence in a filing, which is how the quote CEILING is
 * measured rather than guessed.
 *
 * THE SLICE IS ONLY TRUSTWORTHY BECAUSE OF THE EQUIVALENCE CONTROL, which stays
 * in `match-cause-census.mjs --control`: over every filing whose production
 * answer is a quote with no formula (so the quote came from these very loops),
 * the sliced loop must return the IDENTICAL string. A control that cannot fail
 * is decorative; that one fails the moment this slice drifts from the source.
 */
import { readFileSync } from "node:fs";
import { MF_FVERB, MQ3_REFUSE, matchWeldPhrases, crossesWeldPhrase } from "./lib-4i.mjs";
import { matchQuoteOk } from "./lib-quote.mjs";

const R = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
export const LIB4I_SRC = process.env.MATCHSLICE_SRC || `${R}/scripts/lib-4i.mjs`;
const SRC = readFileSync(LIB4I_SRC, "utf8");

/** One `const NAME = …;` statement out of lib-4i, taken whole, by its own text. */
export function sliceConst(name, { multi = false } = {}) {
  const a = SRC.indexOf(`  const ${name} = `);
  if (a < 0) throw new Error(`lib-matchslice: lib-4i has no \`const ${name} = \` — the slice boundary moved`);
  // a single statement ends at the first newline whose line ends in `;`
  let b = a;
  for (;;) {
    const nl = SRC.indexOf("\n", b + 1);
    if (nl < 0) throw new Error(`lib-matchslice: unterminated const ${name}`);
    const line = SRC.slice(b, nl);
    b = nl;
    if (/;\s*$/.test(line) && (!multi || /^\s*\};?\s*$/.test(line) || /\.trim\(\);\s*$/.test(line))) break;
  }
  return SRC.slice(a, b);
}

export const PIECES = [
  sliceConst("BOILER"),
  sliceConst("clean", { multi: true }),
  sliceConst("cap"),
  sliceConst("sentence", { multi: true }),
  sliceConst("mre"),
  sliceConst("OTHER_TOPIC"),
  sliceConst("DOLLAR_TOTAL"),
  sliceConst("ACCT_MECH"),
  sliceConst("HAS_RATE"),
];
/* ASSERT THE SHAPE RATHER THAN TRUSTING THE OFFSETS. Each piece must carry the
 * token that makes it the thing it is named for; a boundary that slid one
 * statement would otherwise compile and measure something else. */
const SHAPE = [
  [0, "provide explanation"], [1, "Notes? to Financial Statements"], [2, "s.slice(0, n - 3)"],
  [3, "lastIndexOf"], [4, "matching contributions? (?:is|are|equal|of|based|provided)"],
  [5, "non-?forfeitable"], [6, "amounted to"], [7, "account is credited"], [8, "percent|%"],
];
for (const [i, must] of SHAPE)
  if (!PIECES[i].includes(must)) throw new Error(`lib-matchslice: slice ${i} is missing ${must}`);
if (PIECES.some((p) => /process\.|readFileSync|import /.test(p)))
  throw new Error("lib-matchslice: a slice reaches outside the extractor");

/* MF_FVERB IS IMPORTED, NOT SLICED, AND THE CENSUS'S FIRST VERSION SLICED IT
 * WRONG — the equivalence control is what said so. `export const MF_FVERB =
 * String.raw`…`` INTERPOLATES `${MF_FSUBJ}` and `${MF_FPLURAL}`, so the
 * template's own source text carries those two tokens LITERALLY: a regex
 * compiled from it matches the characters `${MF_FSUBJ}` and therefore nothing
 * at all. The whole verb loop read inert — 179 of 2,289 fallback quotes came
 * back `null` — and *a broken arm and an inert arm read the same zero*. The
 * exported VALUE is already interpolated. */
export const MF_FVERB_SRC = MF_FVERB;
if (/\$\{/.test(MF_FVERB_SRC)) throw new Error("lib-matchslice: MF_FVERB carries an un-interpolated template");

/** The extractor's own normalisation, which every offset below is computed on. */
export const flatten = (text) =>
  String(text).replace(/[​-‏﻿]/g, "").replace(/\s+/g, " ");

/* ------------------------------------------------------- the two loops, as shipped */
/* The rejection EXPRESSIONS are the sliced ones; only the bookkeeping around
 * them is written here, and the equivalence control is what proves the
 * bookkeeping changed no verdict. */
/* THE THIRD LOOP IS MODELLED TOO, AND THE EQUIVALENCE CONTROL IS WHAT FORCED
 * IT. v213 appended a third fallback and the control immediately read 714/715
 * instead of 714/714 — one plan whose production quote the slice could not
 * reproduce, because the slice modelled only the first two loops. *A control
 * that drifts for a reason that is not a defect teaches its reader to ignore
 * it*, so the loop is modelled rather than the control relaxed. Its predicates
 * are IMPORTED (`MQ3_REFUSE`, `matchWeldPhrases`, `crossesWeldPhrase`,
 * `matchQuoteOk`) and never retyped; only the loop around them is here, which
 * is the same arrangement the two loops above already have. */
const FALLBACK_BODY = `
${PIECES.join("\n")}
const fre = new RegExp(MF_FVERB_SRC, "gi");
const why = [];
let found = null, cands = 0;
for (const [tag, re] of [["noun", mre], ["verb", fre]]) {
  if (found) break;
  re.lastIndex = 0;
  let mm;
  while ((mm = re.exec(t))) {
    const s = sentence(mm.index);
    cands++;
    if (BOILER.test(s)) { why.push(tag + ":boiler"); continue; }
    if (s.length <= 60) { why.push(tag + ":short"); continue; }
    if (ACCT_MECH.test(s)) { why.push(tag + ":acct-mech"); continue; }
    if (!HAS_RATE.test(s) && OTHER_TOPIC.test(s)) { why.push(tag + ":other-topic"); continue; }
    if (!HAS_RATE.test(s) && DOLLAR_TOTAL.test(s)) { why.push(tag + ":dollar-total"); continue; }
    found = s; break;
  }
}
/* v213: the third loop, which runs only when the first two produced nothing */
let mq3 = null;
if (!found && RAW !== null) {
  const welds = matchWeldPhrases(RAW);
  const re3 = /\\bmatch(?:es|ed|ing)?\\b/gi;
  let m3;
  while ((m3 = re3.exec(t))) {
    const s = sentence(m3.index);
    if (BOILER.test(s)) { why.push("mq3:boiler"); continue; }
    if (!matchQuoteOk(s, false)) { why.push("mq3:quote-guard"); continue; }
    const r = MQ3_REFUSE.find(([, f]) => f(s));
    if (r) { why.push("mq3:" + r[0]); continue; }
    if (crossesWeldPhrase(s, welds)) { why.push("mq3:weld"); continue; }
    mq3 = s; break;
  }
}
return { found: found || mq3, loop: found ? "1-2" : mq3 ? "3" : null, why, cands };
`;
const runFallback = new Function(
  "t", "MF_FVERB_SRC", "RAW", "MQ3_REFUSE", "matchWeldPhrases", "crossesWeldPhrase", "matchQuoteOk",
  FALLBACK_BODY);
/**
 * What production's THREE quote-fallback loops do with this filing's text.
 * The RAW text is passed as well as the flattened one because the third loop's
 * weld witness is taken from the layout, which the flatten destroys; pass only
 * flattened text and the weld refusal silently reads as inert.
 */
export const fallback = (text) =>
  runFallback(flatten(text), MF_FVERB_SRC, String(text), MQ3_REFUSE, matchWeldPhrases, crossesWeldPhrase, matchQuoteOk);

/* ------------------------------------------- EVERY match-vocabulary sentence */
/* THE CEILING IS A PROPERTY OF THE FILING, NOT OF THE LOOPS. To ask "could any
 * widening of `mre` ever publish a quote here?" the question has to be put to
 * the SENTENCES, built by the extractor's own `sentence()` so the string judged
 * is the string a reader would receive — *measure through the function the page
 * calls, with the argument the page passes*, and `sentence()` already applies
 * `clean` and the 300-character `cap`.
 *
 * `vocab` is caller-supplied so this helper carries no opinion about what the
 * match vocabulary is; `notes-gap-census`'s `FIELD_WORD.match` is the one in
 * use. Sentences are de-duplicated by their own text, because one sentence
 * holding three match words is one sentence. */
const SCAN_BODY = `
${PIECES.join("\n")}
const re = new RegExp(vocabSrc, "gi");
const out = [];
const seen = new Set();
let mm;
while ((mm = re.exec(t))) {
  const s = sentence(mm.index);
  if (seen.has(s)) continue;
  seen.add(s);
  out.push({ s, idx: mm.index, boiler: BOILER.test(s), short: s.length <= 60,
             acctMech: ACCT_MECH.test(s), otherTopic: OTHER_TOPIC.test(s),
             dollarTotal: DOLLAR_TOTAL.test(s), hasRate: HAS_RATE.test(s) });
  if (out.length >= 400) break;
}
return out;
`;
const runScan = new Function("t", "vocabSrc", SCAN_BODY);
/**
 * Every distinct sentence of `text` containing `vocabSrc`, built by the
 * extractor's own `sentence()`, with each shipped rejection evaluated.
 * @param {string} text
 * @param {string} vocabSrc source of the vocabulary regex (no flags)
 */
export const scanSentences = (text, vocabSrc = "\\bmatch(?:es|ed|ing)?\\b") =>
  runScan(flatten(text), vocabSrc);
