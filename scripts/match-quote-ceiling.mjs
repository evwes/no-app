#!/usr/bin/env node
/* wampo — WHAT IS THE CEILING ON THE MATCH QUOTE? Measured, not estimated.
 *
 * WHY THIS AND NOT `match-cause-census.mjs`. That census answers "which of the
 * shipped loops' rejections fired", which is a question about the LOOPS. The
 * question a ship needs answered first is a question about the FILINGS: is
 * there any sentence in this filing that a reader could lawfully be shown under
 * a match heading? Because `matchQuoteOk(text, false)` — the guard BOTH
 * renderers call — requires a RATE IN MATCH POSITION when no formula is parsed,
 * a filing whose only match sentences state no rate has a quote ceiling of
 * ZERO, however wide the selector gets. *A count of a condition is not a measure
 * of a defect*, and the condition "mentions a match" is not the condition the
 * page applies.
 *
 * So the ceiling is: a sentence exists that
 *   (1) the extractor's own `sentence()` would build (same clean, same 300-char
 *       cap — *measure through the function the page calls, with the argument
 *       the page passes*), and
 *   (2) is not form-page boilerplate, and
 *   (3) `matchQuoteOk(s, false)` ACCEPTS.
 *
 * Every plan reaching that bar is a plan a wider SELECTOR could serve. Every
 * plan not reaching it is a ceiling no selector can move, and must never be
 * counted as addressable.
 *
 * AND THE SPLIT THAT DECIDES WHAT TO BUILD. For each plan at the ceiling, ask
 * whether the ACCEPTED sentence carries an `mre` or `MF_FVERB` hit:
 *   SELECTOR — it carries neither, so no widening of the GUARDS can reach it
 *              and the vocabulary is the gap;
 *   GUARD    — it carries one and a shipped rejection dropped it.
 * Those are two different ships with two different risk profiles, and quoting
 * one number for both is how a class gets sized wrong on this record.
 *
 * Usage:
 *   node scripts/match-quote-ceiling.mjs                 # full pass
 *   node scripts/match-quote-ceiling.mjs --show SELECTOR --top 12
 *   node scripts/match-quote-ceiling.mjs --selftest
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { buildLedger } from "./lib-ledger.mjs";
import { extractPlanFeatures } from "./lib-4i.mjs";
import { matchQuoteOk } from "./lib-quote.mjs";
import { planNoteArm, attachmentHasNoTextLayer, stripFormAndNameNoise, FIELD_WORD } from "./lib-plannote.mjs";
import { read } from "./lib-filingtext.mjs";
import { scanSentences, fallback, PIECES, MF_FVERB_SRC, flatten } from "./lib-matchslice.mjs";

const argv = process.argv.slice(2);
const CACHE = process.env.MATCH_CEILING_CACHE || "/tmp/wampo-match-ceiling.jsonl";
const CACHED = argv.includes("--cached");
const SHOW = (() => { const i = argv.indexOf("--show"); return i > 0 ? argv[i + 1] : null; })();
const TOP = (() => { const i = argv.indexOf("--top"); return i > 0 ? +argv[i + 1] : 12; })();

/* The two selector vocabularies, compiled from the SAME sources production
 * uses, so "does this sentence carry a selector hit" is production's question
 * and not a retyped approximation. */
const MRE_SRC = PIECES[4].replace(/^\s*const mre = \//, "").replace(/\/gi;?\s*$/, "");
if (!/matching contributions\? \(\?:is\|are\|equal\|of\|based\|provided\)/.test(MRE_SRC))
  throw new Error("match-quote-ceiling: the mre source did not unwrap — the slice shape moved");
const MRE = new RegExp(MRE_SRC, "i");
const FRE = new RegExp(MF_FVERB_SRC, "i");

/* ------------------------------------------------------------------ selftest */
/* A CONTROL PER CONDITION, each with a case where that condition is the ONLY
 * one that can fail it. A control that cannot fail is decorative. */
function selftest() {
  const cases = [
    // [name, sentence, expect-accepted-by-matchQuoteOk(.,false)]
    ["rate-in-match-position accepted", "The Company makes a matching contribution equal to 50% of the first 6% of eligible compensation deferred by the participant.", true],
    ["no rate at all refused", "Participants may select from among several funds in which to invest their employer matching contributions each year.", false],
    ["vesting-only refused", "Company matching contributions vest 20% annually until the participant is 100% vested in the account.", false],
    ["eligibility-only refused", "Contributions made prior to completing twelve months of service are not eligible for the employer match under the Plan.", false],
  ];
  let bad = 0;
  for (const [name, s, want] of cases) {
    const got = matchQuoteOk(s, false);
    if (got !== want) { console.log(`SELFTEST FAIL ${name}: got ${got} want ${want}`); bad++; }
  }
  /* The SELECTOR/GUARD split must be able to come out both ways, or the split
   * is decorative. Both probes are real filing phrasings. */
  const selOnly = "Certain participating employers provide matching and nonelective contributions equal to 50% of the first 4% of compensation.";
  if (MRE.test(selOnly) || FRE.test(selOnly)) { console.log("SELFTEST FAIL: the SELECTOR probe is already reached by mre/fre"); bad++; }
  const guardOnly = "The Company makes matching contributions equal to 100% of the first 3% of compensation for each eligible participant.";
  if (!MRE.test(guardOnly)) { console.log("SELFTEST FAIL: the GUARD probe is not reached by mre"); bad++; }
  /* And the scan must actually find a sentence in a real filing, because a
   * broken arm and an inert arm read the same zero. */
  const probe = scanSentences("Note 1 - Description of the Plan. The Company makes matching contributions equal to 50% of the first 6% of compensation. Vesting is immediate.");
  if (!probe.length) { console.log("SELFTEST FAIL: scanSentences found no sentence in a text that plainly has one"); bad++; }
  console.log(bad ? `SELFTEST: ${bad} failure(s)` : "SELFTEST: ok (4 guard cases, 2 split probes, 1 scan probe)");
  return bad;
}
if (argv.includes("--selftest")) process.exit(selftest());

/* ---------------------------------------------------------------- population */
const L = buildLedger({ withStatus: false });
let recs;
if (CACHED && existsSync(CACHE)) {
  recs = readFileSync(CACHE, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  console.log(`re-bucketing ${recs.length} cached records from ${CACHE}`);
} else {
  const rows = [];
  for (const p of L.plans) {
    const c = p.cells.match;
    if (c.state !== "absent" || c.why.startsWith("no features")) continue;
    rows.push({ ein: p.ein, pn: p.pn, name: p.sponsorName, ppl: p.ppl, ack: p.ack });
  }
  console.log(`match absent (attachment read): ${rows.length} plans / ${rows.reduce((s, r) => s + r.ppl, 0).toLocaleString()} readers`);
  recs = [];
  let i = 0;
  for (const r of rows) {
    if (++i % 2000 === 0) process.stderr.write(`  ${i}/${rows.length}\n`);
    const raw = read(r.ack);
    if (!raw) { recs.push({ ...r, b: "D0" }); continue; }
    let ft = null;
    try { ft = extractPlanFeatures(raw, r.name || ""); } catch { /* bucketed below */ }
    if (ft && (ft.match || ft.matchText || ft.noEmployer)) { recs.push({ ...r, b: "R" }); continue; }
    if (attachmentHasNoTextLayer(raw)) { recs.push({ ...r, b: "A0" }); continue; }
    if (!planNoteArm(raw)) { recs.push({ ...r, b: "A1" }); continue; }
    if (!FIELD_WORD.match.test(stripFormAndNameNoise(raw.replace(/\s+/g, " ")))) { recs.push({ ...r, b: "B" }); continue; }

    /* bucket C. Now the ceiling question. */
    const sents = scanSentences(raw, FIELD_WORD.match.source);
    const live = sents.filter((x) => !x.boiler && !x.short);
    const ok = live.filter((x) => matchQuoteOk(x.s, false));
    const rec = { ...r, b: "C", nSent: sents.length, nLive: live.length, nOk: ok.length };
    if (ok.length) {
      /* the EARLIEST accepted sentence is the one a first-wins loop would take */
      const first = ok.reduce((a, x) => (x.idx < a.idx ? x : a), ok[0]);
      rec.pick = first.s.slice(0, 400);
      rec.selMre = MRE.test(first.s);
      rec.selFre = FRE.test(first.s);
      rec.anySel = ok.some((x) => MRE.test(x.s) || FRE.test(x.s));
      rec.rej = [first.acctMech ? "acct-mech" : null,
        !first.hasRate && first.otherTopic ? "other-topic" : null,
        !first.hasRate && first.dollarTotal ? "dollar-total" : null].filter(Boolean);
    }
    rec.fbWhy = fallback(raw).why;
    recs.push(rec);
  }
  writeFileSync(CACHE, recs.map((x) => JSON.stringify(x)).join("\n") + "\n");
  console.log(`wrote ${recs.length} records to ${CACHE}`);
}

/* ------------------------------------------------------------------- report */
const sum = (a) => a.reduce((s, r) => s + r.ppl, 0);
const C = recs.filter((r) => r.b === "C");
const judged = recs.filter((r) => r.b !== "D0");
console.log(`\njudged ${judged.length} of ${recs.length} — unjudged (no public copy here): ${recs.length - judged.length} plans / ${sum(recs.filter((r) => r.b === "D0")).toLocaleString()} readers`);
console.log(`bucket C (note present, match vocabulary present): ${C.length} plans / ${sum(C).toLocaleString()} readers\n`);

const ceiling = C.filter((r) => r.nOk > 0);
const noCeiling = C.filter((r) => !r.nOk);
console.log(`${String(sum(ceiling)).padStart(10)} ppl  ${String(ceiling.length).padStart(5)} pl  CEILING-REACHABLE — a sentence exists that matchQuoteOk(s,false) ACCEPTS`);
console.log(`${String(sum(noCeiling)).padStart(10)} ppl  ${String(noCeiling.length).padStart(5)} pl  NO QUOTE POSSIBLE — every match sentence is refused by the page's own guard\n`);

const buckets = new Map();
for (const r of ceiling) {
  const k = (r.selMre || r.selFre)
    ? `GUARD:${r.rej.length ? r.rej.join("+") : "none-fired(selection order)"}`
    : (r.anySel ? "SELECTOR-later-sentence" : "SELECTOR");
  let v = buckets.get(k);
  if (!v) buckets.set(k, (v = { plans: 0, ppl: 0, ex: [] }));
  v.plans++; v.ppl += r.ppl; v.ex.push(r);
}
for (const [k, v] of [...buckets].sort((a, b) => b[1].ppl - a[1].ppl))
  console.log(`${String(v.ppl).padStart(10)} ppl  ${String(v.plans).padStart(5)} pl  ${k}`);

if (SHOW) {
  const v = buckets.get(SHOW);
  if (!v) { console.log(`\nno bucket named ${SHOW}; have: ${[...buckets.keys()].join(" | ")}`); process.exit(2); }
  console.log(`\n--- ${SHOW}: top ${TOP} by readers ---`);
  for (const e of v.ex.sort((a, b) => b.ppl - a.ppl).slice(0, TOP)) {
    console.log(`\n${e.ppl} ${e.name}  ein=${e.ein} pn=${e.pn} ${e.ack}  sent=${e.nSent} live=${e.nLive} ok=${e.nOk} mre=${e.selMre} fre=${e.selFre} rej=${(e.rej || []).join(",")}`);
    console.log(`   PICK: ${e.pick}`);
  }
}
console.log("\nThese figures are DERIVED. Re-run this script; never copy them forward.");
