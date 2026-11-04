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
const src = readFileSync(path.join(HERE, "fund-facts-issuer.mjs"), "utf8");

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

/* REAL windows from run #9's log. The trailing "A" in the first is where the
 * log line was truncated, and it is left in deliberately: the extractor must
 * cope with the text it will actually be handed. */
const CASES = [
  { tk: "FXAIX",
    text: "Net Expense Ratio YTD Return YTD Return is adjusted for possible sales charges, and assumes reinvestment of dividends and capital gains. $263.13 +0.96 (0.37%) 0.015% 12.73% Quote data as of close 11/03/2026 A",
    er: 0.015, ytd: 12.73, asOf: "2026-11-03" },
  { tk: "FSMDX",
    text: "Net Expense Ratio YTD Return YTD Return is adjusted for possible sales charges, and assumes reinvestment of dividends and capital gains. $42.73 +0.01 (0.02%) 0.025% 11.86% Quote data as of close 11/03/2026 As",
    er: 0.025, ytd: 11.86, asOf: "2026-11-03" },
  { tk: "FSSNX",
    text: "Net Expense Ratio YTD Return YTD Return is adjusted for possible sales charges, and assumes reinvestment of dividends and capital gains. $35.33 +0.08 (0.23%) 0.025% 13.77% Quote data as of close 11/03/2026 As",
    er: 0.025, ytd: 13.77, asOf: "2026-11-03" },
  /* A NEGATIVE YTD must parse, or the extractor silently works only in a rising
   * market -- a seasonal bug that would look like a layout change in January. */
  { tk: "SYNTH-NEG",
    text: "Net Expense Ratio YTD Return blah. $10.00 -0.05 (-0.50%) 0.450% -3.21% Quote data as of close 11/03/2026",
    er: 0.45, ytd: -3.21, asOf: "2026-11-03" },
];

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
];

let bad = 0;
for (const c of CASES) {
  const e = extract(c.text, "https://example.invalid/x");
  const ok = e.er === c.er && e.ytd === c.ytd && e.erAsOf === c.asOf && e.ytdAsOf === c.asOf;
  if (!ok) {
    bad++;
    console.log(`MISMATCH ${c.tk}: want er=${c.er} ytd=${c.ytd} @${c.asOf}; got er=${e.er} ytd=${e.ytd} @${e.erAsOf}${e._reject ? ` (refused: ${e._reject})` : ""}`);
  } else {
    console.log(`ok   ${c.tk.padEnd(10)} er=${e.er}% ytd=${e.ytd}% @${e.erAsOf}  (day's change ${e._chgPct}% correctly NOT taken as the fee)`);
  }
}
for (const r of REFUSE) {
  const e = extract(r.text, "https://example.invalid/x");
  if (e.er != null || e.ytd != null) {
    bad++;
    console.log(`MISMATCH must refuse (${r.why}) — but returned er=${e.er} ytd=${e.ytd}`);
  } else {
    console.log(`ok   refused: ${r.why}`);
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
