#!/usr/bin/env node
/* wampo — WHAT IS THE CEILING ON THE VESTING QUOTE? The match half of this
 * question shipped as `match-quote-ceiling.mjs` and this is its sibling.
 *
 * WHY IT IS NOT A COPY, AND THE DIFFERENCE IS THE WHOLE POINT. `matchQuoteOk(s,
 * false)` REQUIRES a rate in match position, so match's ceiling (1.35M) sits
 * 4.7x below its vocabulary bucket (6.37M). `vestingQuoteOk(t)` has no numeric
 * requirement at all — it vetoes the blank form's printed question, ACCEPTS
 * anything reading as a vesting rule, and otherwise accepts unless the sentence
 * states a DIFFERENT rule. So the match finding must not be assumed to transfer:
 * two guards of different shape give different ceilings over the same filings.
 *
 * THE TWO LAYERS, because vesting has one match does not. A sentence reaches a
 * reader only if BOTH hold:
 *   (1) `vestingQuoteOk(s)` accepts it — the guard BOTH renderers call
 *       (app.js:3939 and build-seo-pages.mjs:419); and
 *   (2) the extractor's immediate-vesting loop reaches a quote fallback at all,
 *       which `scopeGate(s, t, sponsor).passes` answers. Its own slice says a
 *       false verdict `continue`s BEFORE every fallback, so the filing stores
 *       NOTHING — which is exactly this bucket.
 * Reporting one number for both would hide which repair is owed, the mistake
 * this record names as sizing a class wrong.
 *
 * Everything is measured through the SHIPPED code: `vestingSelection` and
 * `scopeGate` are slices of `lib-4i.mjs` (lib-vestslice.mjs, which throws if the
 * boundaries move), and `vestingQuoteOk` is imported, not retyped.
 *
 * CONTROLS, because a broken pipeline and an empty finding read the same zero:
 *   POSITIVE — plans the store already publishes a vesting QUOTE for (ledger
 *     state `withheld`) must read AT the ceiling. If they do not, this
 *     instrument is broken and its zero means nothing.
 *   NEGATIVE — the blank form's own 6g question must be REFUSED by the oracle.
 *
 * The form-noise arms are copied from `vesting-candidates.mjs` (read, not
 * remembered) and reported as a SUB-SPLIT only: they describe candidate
 * quality, not the publish gate, so they must not move the headline.
 *
 * Usage:  node scripts/vesting-quote-ceiling.mjs [--top N]
 */
import { buildLedger } from "./lib-ledger.mjs";
import { read } from "./lib-filingtext.mjs";
import { vestingQuoteOk } from "./lib-quote.mjs";
import { vestingSelection, scopeGate } from "./lib-vestslice.mjs";

const argv = process.argv.slice(2);
const TOP = (() => { const i = argv.indexOf("--top"); return i > 0 ? +argv[i + 1] : 10; })();

/* copied verbatim from scripts/vesting-candidates.mjs */
const FORM_ARMS = [
  ["dotted leaders", /\.{5,}/],
  ["digit-box filler", /123456789012/],
  ["a form line reference", /\b\d[a-z]\(\d\)/],
  ["the form's own 6g wording", /\bNumber of participants who\b/i],
  ["a form/schedule footer", /\b(?:Form|Schedule [A-Z]\b.{0,20})5500\b/i],
  ["the Schedule R line-14 question", /\bnumber of deferred vested\b/i],
  ["an OMB header", /\bOMB No\b/i],
];
const isForm = (s) => FORM_ARMS.some(([, re]) => re.test(s));

const FORM_6G = "Number of participants who terminated employment during the plan year with accrued benefits that were less than 100% vested.";
if (vestingQuoteOk(FORM_6G)) throw new Error("NEGATIVE CONTROL FAILED: the oracle accepts the blank form's own 6g question");

const L = buildLedger({ withStatus: false });
const absent = [], published = [];
for (const p of L.plans) {
  const c = p.cells.vesting;
  const row = { name: p.sponsorName, ein: p.ein, pn: p.pn, ppl: p.ppl, ack: p.ack };
  if (c.state === "absent" && !c.why.startsWith("no features")) absent.push(row);
  else if (c.state === "withheld") published.push(row);
}
if (!absent.length || !published.length) throw new Error(`populations empty (absent ${absent.length}, published ${published.length}) — the cell states or why-prefix moved`);

/** Does any candidate sentence clear the oracle? Returns the verdict detail. */
function ceiling(row) {
  const raw = read(row.ack);
  if (!raw) return { judged: false };
  let sel;
  try { sel = vestingSelection(raw); } catch (e) { return { judged: true, threw: String(e.message).slice(0, 60) }; }
  const cands = sel.vestSentences || [];
  let best = null, gated = 0, formNoise = 0;
  for (const c of cands) {
    const s = typeof c === "string" ? c : (c && (c.s || c.text)) || "";
    if (!s) continue;
    if (!vestingQuoteOk(s)) continue;
    if (isForm(s)) { formNoise++; continue; }
    const g = scopeGate(s, sel.t, row.name || "");
    if (!g.passes) { gated++; continue; }
    best = s; break;                       // passes both layers
  }
  return { judged: true, cands: cands.length, best, gated, formNoise };
}

/* ---- POSITIVE CONTROL FIRST: the instrument must see what the store shows -- */
let ctlJudged = 0, ctlAtCeiling = 0;
for (const r of published.slice(0, 400)) {
  const v = ceiling(r);
  if (!v.judged) continue;
  ctlJudged++;
  if (v.best || v.gated) ctlAtCeiling++;    // oracle accepted something
}
const ctlPct = ctlJudged ? (100 * ctlAtCeiling / ctlJudged) : 0;
console.log(`POSITIVE CONTROL — plans whose store ALREADY publishes a vesting quote:`);
console.log(`   judged ${ctlJudged}, oracle accepts a candidate on ${ctlAtCeiling} (${ctlPct.toFixed(1)}%)`);
if (ctlJudged >= 50 && ctlPct < 70)
  throw new Error(`POSITIVE CONTROL FAILED at ${ctlPct.toFixed(1)}% — the pipeline cannot see sentences the store publishes, so any ceiling it reports is meaningless`);
console.log(`   (a low figure here would mean the instrument is broken, not that the data is empty)\n`);

/* ---- THE CEILING over the absent bucket ---------------------------------- */
const B = { reach: [], gate: [], none: [], unjudged: [], threw: [] };
for (const r of absent) {
  const v = ceiling(r);
  if (!v.judged) { B.unjudged.push(r); continue; }
  if (v.threw) { B.threw.push({ ...r, why: v.threw }); continue; }
  if (v.best) B.reach.push(r);
  else if (v.gated) B.gate.push(r);
  else B.none.push(r);
}
const sum = (a) => a.reduce((s, r) => s + r.ppl, 0);
const line = (k, a, note) => console.log(`${String(sum(a)).padStart(10)} ppl  ${String(a.length).padStart(5)} pl  ${k}  ${note}`);
console.log(`vesting ABSENT bucket: ${absent.length} plans / ${sum(absent).toLocaleString()} readers`);
line("REACH ", B.reach, "oracle accepts AND the scope gate passes — an ARM refused it; a quote is reachable");
line("GATED ", B.gate, "oracle accepts but the SCOPE GATE continues first — the loop never reaches a fallback");
line("NONE  ", B.none, "no candidate the oracle would publish — a CEILING no selector can move");
line("THREW ", B.threw, "the selection slice threw");
line("UNJUD ", B.unjudged, "no cached filing text");
const judgedPpl = sum(B.reach) + sum(B.gate) + sum(B.none) + sum(B.threw);
console.log(`\njudged ${(100 * judgedPpl / Math.max(1, sum(absent))).toFixed(1)}% of the bucket's readers`);
console.log(`CEILING (REACH + GATED) = ${(sum(B.reach) + sum(B.gate)).toLocaleString()} readers / ${B.reach.length + B.gate.length} plans`);
console.log(`\nlargest REACH members:`);
for (const r of B.reach.sort((a, b) => b.ppl - a.ppl).slice(0, TOP)) console.log(`   ${String(r.ppl).padStart(7)}  ${r.name}  ${r.ack}`);
console.log(`largest GATED members:`);
for (const r of B.gate.sort((a, b) => b.ppl - a.ppl).slice(0, TOP)) console.log(`   ${String(r.ppl).padStart(7)}  ${r.name}  ${r.ack}`);
console.log("\nThese figures are DERIVED. Re-run; never copy them forward.");
