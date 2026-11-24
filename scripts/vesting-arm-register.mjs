#!/usr/bin/env node
/* wampo — PRE-REGISTER v214's FIGURES BY RUNNING THE METRIC ITSELF.
 *
 *   node scripts/vesting-arm-register.mjs <moves.json>   (from match-arm-diff --moves)
 *
 * *PRE-REGISTER a run's figures before dispatch — a ceiling plus a NAMED SET —
 * and derive them by running the metric itself.* So this does not hand-compute
 * a percentage: it loads the real ledger, applies the differential's per-plan
 * state moves to the real cells, and calls `score()` — `lib-ledger`'s own
 * scalar — on both sides. A hand-derived `shown` is a fourth copy of a formula
 * that already exists once.
 *
 * TWO KEY SETS, REGISTERED SEPARATELY, because *a registration can over-deliver
 * in PLANS and under-deliver in READERS at once, and that is a property of a
 * KEY, not of a run* (v211). The trail keys count ENTRIES in
 * `lineups-status.json`; the ledger keys count PARTICIPANT-WEIGHTED CELLS over
 * served plans. They are computed from the same moves and are not the same
 * question.
 *
 * AND THE BAND'S TOP END IS THE WHOLE UNJUDGED REACHABLE POPULATION, not a rate
 * applied to it: v213's band was blown 11x by taking the judged FIRE RATE to
 * the unjudged set when the right ceiling was that set's whole size. Here the
 * unjudged set can be narrowed by a CONSTRUCTION rather than a rate — a plan
 * that already publishes a vesting label never runs pass 1 of the immediate
 * loop at all — and what survives that narrowing is reported whole.
 */
import { readFileSync } from "node:fs";
import { buildLedger, score } from "./lib-ledger.mjs";
import { cachedAcks } from "./lib-filingtext.mjs";

const MOVES = process.argv[2];
if (!MOVES) { console.error("usage: vesting-arm-register.mjs <moves.json>"); process.exit(2); }
const moves = JSON.parse(readFileSync(MOVES, "utf8"));

const L = buildLedger({ withStatus: false });
const before = score(L);

/* THE CONTROL THAT MAKES THE SIMULATION MEAN ANYTHING: every moved plan must be
 * found in the ledger by its own key AND must currently sit in the state the
 * differential says it moved FROM. A move applied to a plan the ledger has in
 * a different state is a move measured against the wrong baseline, and it would
 * read exactly like a correct one. */
const byKey = new Map(L.plans.map((p) => [`${p.ein}|${p.pn}`, p]));
let applied = 0, mismatched = 0;
const bad = [];
for (const m of moves) {
  const p = byKey.get(`${m.ein}|${m.pn}`);
  if (!p) { bad.push(`${m.name} ${m.ein}|${m.pn}: not in the ledger at all`); continue; }
  if (p.cells.vesting.state !== m.from) {
    mismatched++;
    bad.push(`${m.name} ${m.ein}|${m.pn}: differential says from=${m.from}, ledger says ${p.cells.vesting.state}`);
    continue;
  }
  p.cells.vesting = { ...p.cells.vesting, state: m.to };
  applied++;
}
if (bad.length) { for (const b of bad.slice(0, 10)) console.log(`  BASELINE MISMATCH, EXCLUDED FROM THE REGISTRATION: ${b}`); }
/* A MISMATCH IS EXCLUDED, NEVER FORCED, AND IT IS A REAL CLASS RATHER THAN AN
 * ERROR. `match-arm-diff`'s `from` is what the CURRENT code produces from the
 * cached TEXT parse; the ledger's state is what the STORE holds, and the store
 * can hold an OCR or prior-year-fallback parse that `lib-filingtext` cannot
 * reproduce — it is `pdftotext -layout` and does no OCR, which is a property of
 * the instrument that every caller has to report. Invisible Technologies is the
 * one such plan here: the store has it `withheld` (it publishes a quote today)
 * where the text-only re-extraction has it `absent`.
 *   EXCLUDING IT IS THE CONSERVATIVE DIRECTION, which is why this is not a
 * failure: the arm is scoped to FILL A BLANK, so in production — where pass 0
 * sees the OCR text and sets the quote — the label is BLOCKED and the plan
 * gains nothing. Counting it as a gain would over-register. The threshold below
 * fails the run if this class is ever large enough to matter, because a
 * silently-tolerated mismatch is the baseline being wrong. */
if (mismatched > Math.max(5, moves.length * 0.02)) {
  console.error(`${mismatched} of ${moves.length} moves do not start from the ledger's state — too many to treat as the OCR/fallback class; the baseline is wrong and nothing below is trustworthy`);
  process.exit(1);
}
console.log(`applied ${applied} of ${moves.length} differential moves onto the live ledger`);
console.log(`(${mismatched} excluded as the OCR/fallback class, which under-registers by construction)\n`);

const after = score(L);
const f = (x) => (x * 100).toFixed(3) + "%";
const V = (s) => s.fields.vesting;
console.log("LEDGER KEYS (participant-weighted cells, lib-ledger's own score())");
console.log(`  vesting published   ${V(before).published.toLocaleString().padStart(12)} -> ${V(after).published.toLocaleString().padStart(12)}  (${(V(after).published - V(before).published >= 0 ? "+" : "") + (V(after).published - V(before).published).toLocaleString()})`);
console.log(`  vesting withheld    ${V(before).withheld.toLocaleString().padStart(12)} -> ${V(after).withheld.toLocaleString().padStart(12)}  (${(V(after).withheld - V(before).withheld >= 0 ? "+" : "") + (V(after).withheld - V(before).withheld).toLocaleString()})`);
console.log(`  vesting absent/GAP  ${V(before).absent.toLocaleString().padStart(12)} -> ${V(after).absent.toLocaleString().padStart(12)}  (${(V(after).absent - V(before).absent >= 0 ? "+" : "") + (V(after).absent - V(before).absent).toLocaleString()})`);
console.log(`  vesting_shown       ${f(V(before).publishedShareOfPossible).padStart(12)} -> ${f(V(after).publishedShareOfPossible).padStart(12)}`);
console.log(`  ONE SCALAR          ${f(before.overall).padStart(12)} -> ${f(after.overall).padStart(12)}`);
console.log(`  ledger addressable  ${before.addressable.toLocaleString().padStart(12)} -> ${after.addressable.toLocaleString().padStart(12)}`);
/* …and every OTHER plan-level field must be byte-identical, which is the
 * ledger-side form of "nothing else moves" — a claim about the CHANGE. */
console.log("\n  the other four plan-level fields (must be IDENTICAL — the write set is vesting only):");
for (const k of Object.keys(before.fields)) {
  if (k === "vesting") continue;
  const a = before.fields[k], b = after.fields[k];
  const same = a.published === b.published && a.withheld === b.withheld && a.absent === b.absent && a.partial === b.partial;
  console.log(`    ${k.padEnd(16)} ${same ? "IDENTICAL" : "*** MOVED ***"}  published ${a.published.toLocaleString()} -> ${b.published.toLocaleString()}`);
}

/* ---- the TRAIL keys, which count ENTRIES and not readers ---------------- */
const trailLines = readFileSync("docs/coverage-history.jsonl", "utf8").trim().split("\n");
const trail = JSON.parse(trailLines[trailLines.length - 1]);
const gain = moves.filter((m) => m.newMatch && !m.oldMatch).length;
const wasQuote = moves.filter((m) => m.newMatch && !m.oldMatch && m.oldQuote).length;
const quoteOnly = moves.filter((m) => !m.newMatch && !m.oldMatch && !m.oldQuote && m.newQuote).length;
console.log(`\nTRAIL KEYS (per ENTRY, which is how audit-data counts them; baseline is the last line of`);
console.log(`docs/coverage-history.jsonl, attributed by the COMMIT that introduced it — never by position)`);
console.log(`  vesting    ${String(trail.vesting).padStart(7)} -> ${String(trail.vesting + gain).padStart(7)}  (+${gain})`);
console.log(`  vestQuote  ${String(trail.vestQuote).padStart(7)} -> ${String(trail.vestQuote + quoteOnly - wasQuote).padStart(7)}  (${quoteOnly} gained quote-only, ${wasQuote} quote-only promoted to a label)`);
console.log(`  pv         ${trail.pv} -> 214`);

/* ---- the BAND ----------------------------------------------------------- */
const have = cachedAcks();
let uN = 0, uPpl = 0, pubN = 0, pubPpl = 0;
for (const p of L.plans) {
  if (p.sf || !p.ack || have.has(p.ack)) continue;
  if (p.cells.vesting.state === "published") { pubN++; pubPpl += p.ppl; continue; }
  uN++; uPpl += p.ppl;
}
console.log(`\nBAND. The differential judged every full-form plan with cached filing text and is EXACT over`);
console.log(`that population. UNJUDGED: ${(uN + pubN).toLocaleString()} plans, of which ${pubN.toLocaleString()} / ${pubPpl.toLocaleString()} readers`);
console.log(`ALREADY PUBLISH a vesting label and cannot be reached — pass 1 of the immediate loop runs`);
console.log(`only on \`!out.vesting\`, so that is a CONSTRUCTION and not a rate. The reachable unjudged`);
console.log(`remainder is ${uN} plans / ${uPpl.toLocaleString()} readers, and the band's TOP END is the WHOLE of it:`);
console.log(`  vesting published  +${(V(after).published - V(before).published).toLocaleString()}  to  +${(V(after).published - V(before).published + uPpl).toLocaleString()}`);
console.log(`  vesting_shown      ${f(V(after).publishedShareOfPossible)}  to  ${f((V(after).published + uPpl) / V(after).possible)}`);
console.log(`No rate is applied to the unjudged set. v213's band was blown 11x by doing that.`);
console.log("\nThese figures are DERIVED. Re-run; never copy them forward.");
