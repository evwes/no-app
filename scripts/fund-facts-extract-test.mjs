#!/usr/bin/env node
/* wampo — the tether for the issuer-page extractor.
 *
 * WHY IT EXISTS, and it is the sharpest near-miss in this work: the first
 * extractor read the figures by LABEL PROXIMITY and run #9's --explain pass
 * showed the page puts every label first and every value after, so the first
 * percentage following "Net Expense Ratio" is THE DAY'S PRICE CHANGE. It gave
 * FXAIX er=0.37 and ytd=0.37 where the truth is 0.015 and 12.73, and it was
 * wrong the same way on all four funds it reached -- every figure plausible,
 * dated and sourced. Without --explain those four would have been written into
 * `data/fund-facts.json` as verified facts.
 *
 * So the fixtures below are REAL TEXT, copied from run #9's own log rather than
 * invented, and each asserts the three values the page states. A hand-built
 * fixture tests the cases its author already imagined; these test the case that
 * actually fooled me.
 *
 * Usage: node scripts/fund-facts-extract-test.mjs   (exit 1 on any mismatch)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/* ISSUER_PATH lets this suite be pointed at another copy of the extractor,
 * which is how its own negative control is run: a test that has never been
 * shown to FAIL against the code it replaced has not been shown to see the
 * defect at all. */
const ISSUER = process.env.ISSUER_PATH || path.join(HERE, "fund-facts-issuer.mjs");
const src = readFileSync(ISSUER, "utf8");

/* Slice the extractor out of the shipped source rather than retyping it: a
 * transcribed copy of a predicate measures the transcription. */
function slice(from, to) {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error(`cannot slice ${JSON.stringify(from)} -> ${JSON.stringify(to)}; the extractor moved`);
  return src.slice(a, b);
}
/* ONE CONTIGUOUS SLICE, not several. My first attempt took four overlapping
 * ranges and redeclared `MONTHS`, which threw -- and a slicer that assembles
 * fragments is also a slicer that can silently omit one. The whole extraction
 * section is lifted in a single piece. */
const code = slice("const detag =", "/* ---- the run");
const extract = new Function(`${code}; return extract;`)();

/* REAL FULL-PAGE SPANS, and the truncated windows they replace are the reason.
 *
 * The four cases here used to be ~200-character windows copied from run #9's
 * log. Production hands `extract` the WHOLE page -- `detag(r.body)`, about
 * 39KB -- and the defect found on 2026-11-15 lives in the RELATIONSHIP BETWEEN
 * TWO REGIONS of that page: the header quote group carries a month-end
 * prospectus YTD, and the detail block carries the current one with its own
 * date. A window holding only the header cannot express that, so the tether
 * was green while the daily refresh mislabelled 91 month-end returns as
 * same-day figures.
 *
 * THE EVIDENCE WAS IN THE OLD FIXTURE, CUT OFF ONE CHARACTER IN. It ended with
 * a bare "A" -- the first letter of "As of 10/31/2026 Prospectus", the label
 * that dates the header figures -- and the file's own comment noted the "A"
 * was left in deliberately. *A fixture is only as good as the question it is
 * able to ask.*
 *
 * So these are real detagged spans, verbatim, from data/fixtures/schwab-pages.json,
 * trimmed to cover both regions. JNYAX is the SENSITIVE one on purpose: its
 * header reads 11.00 against a detail of 11.03, so a test carrying only VCSTX
 * (17.91 vs 12.09) would catch a wide miss and not a near one. */
const FIX = JSON.parse(readFileSync(path.join(HERE, "..", "data", "fixtures", "schwab-pages.json"), "utf8"));
if (FIX.cases.length < 4) throw new Error(`only ${FIX.cases.length} page fixtures — the suite needs its real pages`);
const CASES = FIX.cases.map((c) => ({ tk: c.tk, text: c.text, er: c.er, erAsOf: c.erAsOf,
  ytd: c.detailYtd, ytdAsOf: c.ytdAsOf, headerYtd: c.headerYtd }));

/* A NEGATIVE YTD must parse, or the extractor silently works only in a rising
 * market -- a seasonal bug that would look like a layout change in January.
 * Synthetic, but shaped like the real page: both regions present. */
CASES.push({ tk: "SYNTH-NEG",
  text: "Net Expense Ratio YTD Return blah. $10.00 -0.05 (-0.50%) 0.450% 4.00% Quote data as of close 11/03/2026 As of 10/31/2026 Prospectus "
      + "... 52 Week Range $9.00 - $12.00 YTD Return is adjusted for possible sales charges. -3.21% as of 11/03/2026",
  er: 0.45, erAsOf: "2026-10-31", ytd: -3.21, ytdAsOf: "2026-11-03", headerYtd: 4 });

/* MUST REFUSE. Each is the shape of a real failure rather than a typo: the
 * quote-echo that fooled the first version, a column shift that would publish
 * a 12% index fund, and a page whose value group is absent entirely. */
const REFUSE = [
  { why: "er and ytd both equal the day's change (the run #9 defect)",
    text: "Net Expense Ratio YTD Return x. $263.13 +0.96 (0.37%) 0.37% 0.37% Quote data as of close 11/03/2026" },
  { why: "expense ratio implausible — a column shift",
    text: "Net Expense Ratio YTD Return x. $263.13 +0.96 (0.37%) 12.73% 0.015% Quote data as of close 11/03/2026" },
  { why: "no value group on the page at all",
    text: "Net Expense Ratio YTD Return and then nothing numeric follows at all." },
  /* THE ANCHOR'S UNIQUENESS IS A MEASUREMENT, NOT A GUARANTEE. Across six
   * saved pages there is exactly ONE dated percentage. A page carrying two
   * must be refused rather than guessed at, because the anchor would no
   * longer identify the YTD alone. */
  { why: "two dated percentages — the anchor no longer identifies the YTD",
    text: "Net Expense Ratio YTD Return x. $10.00 +0.05 (0.50%) 0.450% 4.00% Quote data as of close 11/03/2026 As of 10/31/2026 Prospectus "
        + "... 5.00% as of 11/03/2026 ... and later 6.00% as of 11/03/2026" },
  /* A page with the header but NO detail block must yield no YTD rather than
   * falling back to the month-end figure. That fallback IS the defect. */
  { why: "header only, no dated detail figure — must not fall back to the month-end YTD",
    text: "Net Expense Ratio YTD Return x. $10.00 +0.05 (0.50%) 0.450% 4.00% Quote data as of close 11/03/2026 As of 10/31/2026 Prospectus",
    erStillOk: true },
];

let bad = 0;
for (const c of CASES) {
  const e = extract(c.text, "https://example.invalid/x");
  /* EACH FIGURE'S OWN DATE IS CHECKED SEPARATELY. The old assertion compared
   * both against one `asOf`, which is precisely the conflation that shipped. */
  const ok = e.er === c.er && e.ytd === c.ytd && e.erAsOf === c.erAsOf && e.ytdAsOf === c.ytdAsOf;
  if (!ok) {
    bad++;
    console.log(`MISMATCH ${c.tk}: want er=${c.er}@${c.erAsOf} ytd=${c.ytd}@${c.ytdAsOf}; got er=${e.er}@${e.erAsOf} ytd=${e.ytd}@${e.ytdAsOf}${e._reject ? ` (refused: ${e._reject})` : ""}`);
  } else if (e.ytd === c.headerYtd && c.headerYtd !== c.ytd) {
    /* THE DISCRIMINATING ASSERTION, and the one no previous version could make:
     * the published YTD must not be the header's month-end figure. */
    bad++;
    console.log(`MISMATCH ${c.tk}: published the HEADER's month-end YTD ${c.headerYtd}% instead of the detail block's ${c.ytd}%`);
  } else {
    console.log(`ok   ${c.tk.padEnd(10)} er=${e.er}%@${e.erAsOf} ytd=${e.ytd}%@${e.ytdAsOf}  (header month-end ${c.headerYtd}% correctly NOT taken; day's change ${e._chgPct}% not taken as the fee)`);
  }
}
for (const r of REFUSE) {
  const e = extract(r.text, "https://example.invalid/x");
  /* `erStillOk` cases refuse only the YTD: a page with a dated prospectus fee
   * and no detail block should still publish the FEE. A guard that blocks a
   * wrong answer must not discard the honest evidence beside it. */
  const offended = r.erStillOk ? (e.ytd != null) : (e.er != null || e.ytd != null);
  if (offended) {
    bad++;
    console.log(`MISMATCH must refuse (${r.why}) — but returned er=${e.er} ytd=${e.ytd}`);
  } else {
    console.log(`ok   refused: ${r.why}${r.erStillOk ? `  (and kept the fee ${e.er}%@${e.erAsOf}, as it should)` : ""}`);
  }
}

/* AND THE CONTROL THAT THE CONTROLS CAN FAIL: feed the first case's own correct
 * text and assert it is NOT refused, so a change that rejects everything cannot
 * satisfy every must-refuse case above and read as a pass. */
const sane = extract(CASES[0].text, "x");
if (sane.er == null) { bad++; console.log("MISMATCH the valid case is being refused — every must-refuse case above is worthless"); }
else console.log("ok   the valid case still passes, so the refusals mean something");

console.log(bad ? `fund-facts-extract-test: ${bad} case(s) wrong` : "fund-facts-extract-test: OK — the fee is read from its own column, not from the day's quote");
process.exit(bad ? 1 : 0);
