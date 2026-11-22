#!/usr/bin/env node
/* wampo — A FEATURES DIFFERENTIAL NARROWED ON ONE NAMED EXPORTED ARM.
 *
 *   node scripts/match-arm-diff.mjs --arm <exportName> [<base-ref>]
 *                                   [--discharge N] [--show K]
 *
 * A committed-base-vs-working-tree differential, so whatever this harness does
 * differently from production cancels on both sides. The baseline module graph
 * comes out of the git ref through `lib-refmod.mjs`, which is the mechanism
 * `diff-parser.mjs` spent five parser versions not adopting.
 *
 * THE NARROWING IS A PROPERTY OF THE CHANGE AND IT SUPERSETS BY CONSTRUCTION.
 * The only edit is one disjunct appended to the end of the `mf` chain, so when
 * `mfEmployerNounLead(flat)` returns null the chain's value is identical on
 * both sides and `extractPlanFeatures` is byte-identical. Sampling could never
 * establish that; the construction does. `--discharge N` re-runs N EXCLUDED
 * filings unnarrowed anyway and requires 0 differences, because a narrowing
 * believed and not discharged is the shape that has cost this record twice.
 *
 * THE STATE MAPPER IS A PROJECTION AND IT SAYS SO. `matchCell` is not exported
 * from `lib-ledger.mjs`, so the published/withheld/absent precedence is written
 * here. Its control is that it must reproduce the LEDGER'S OWN state on every
 * plan whose stored features it is handed — printed, not assumed.
 *
 * WHAT IT CANNOT JUDGE IS NAMED AS A BAND, not folded into the headline: a plan
 * with no cached filing text is UNJUDGED, and v208 over-delivered by 8% because
 * a registration was quoted as exact over a judged subset.
 */
import { readFileSync, writeFileSync, existsSync, openSync, writeSync, closeSync } from "node:fs";
import { buildLedger } from "./lib-ledger.mjs";
import { read } from "./lib-filingtext.mjs";
import { loadPlans } from "./lib-schema.mjs";
import { materialiseAt } from "./lib-refmod.mjs";

const argv = process.argv.slice(2);
/* flag VALUES are not positional arguments. `--arm discMatchWidened HEAD~1`
 * made the first version read the arm name as the git ref and then refuse,
 * because `indexOf` returned 0 and the guard asked for `> 0`: two
 * off-by-one-shaped mistakes in one line of argument parsing. */
const FLAGV = new Set(["--arm", "--discharge", "--show", "--prefilter", "--moves", "--narrow-cache", "--chunk"]);
const POS = argv.filter((a, i) => !a.startsWith("--") && !FLAGV.has(argv[i - 1]));
const REF = POS[0] || "HEAD";
const DISCHARGE = (() => { const i = argv.indexOf("--discharge"); return i >= 0 ? +argv[i + 1] : 0; })();
const SHOW = (() => { const i = argv.indexOf("--show"); return i >= 0 ? +argv[i + 1] : 25; })();
/* RESUMABILITY IS NOT A CONVENIENCE HERE. This container gives a background
 * process CPU only while a turn is active and reclaims it between turns, so a
 * 90-minute pass over 56,056 filings dies partway with nothing to show. Both
 * halves therefore checkpoint: the narrowing appends `ack<TAB>0|1` to
 * `--narrow-cache` as it goes and skips anything already in it, and the diff
 * takes `--chunk <start>:<count>` and writes `<moves>.<start>`. A run that dies
 * costs the chunk it was in and nothing before it. */
const NARROW_CACHE = (() => { const i = argv.indexOf("--narrow-cache"); return i >= 0 ? argv[i + 1] : null; })();
const CHUNK = (() => {
  const i = argv.indexOf("--chunk"); if (i < 0) return null;
  const [a, b] = String(argv[i + 1]).split(":").map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b)) { console.error("--chunk wants <start>:<count>"); process.exit(2); }
  return { start: a, count: b };
})();

const ARM = (() => { const i = argv.indexOf("--arm"); return i >= 0 ? argv[i + 1] : null; })();
if (!ARM) { console.error("match-arm-diff: --arm <exportName> is required — the narrowing IS the named arm"); process.exit(2); }
const base = materialiseAt(REF, "lib-4i.mjs", { label: "wampo-armdiff" });
const oldLib = await import(base.entryPath);
const newLib = await import("./lib-4i.mjs");
console.log(`baseline ${REF} = v${oldLib.PARSER_VERSION}  ->  working tree = v${newLib.PARSER_VERSION}`);
/* THE TWO CONTROLS THAT MAKE THE NARROWING A NARROWING. The working tree must
 * EXPORT the arm, and the baseline must NOT — otherwise the predicate used to
 * narrow is already in the baseline, the excluded set is not excluded, and the
 * run prints a clean zero about a question it never asked. */
if (typeof newLib[ARM] !== "function")
  throw new Error(`the working tree exports no ${ARM} — nothing to measure`);
if (typeof oldLib[ARM] === "function")
  throw new Error(`${REF} already carries ${ARM} — the baseline is not a baseline`);
const fires = (flat) => !!newLib[ARM](flat);
/* A SUBSTRING EVERY ARM REQUIRES, applied to the RAW text before the whitespace
 * flatten. The flatten is the expensive step — 8.3 GB of filing text through one
 * regex — and `--prefilter discretion` skips it for the 19,033 filings that
 * cannot possibly fire. It is sound ONLY while every arm requires the substring,
 * so it is asserted rather than trusted: the assertion below runs the arm on a
 * sentence with the substring REMOVED and requires silence. */
const PREFILTER = (() => { const i = argv.indexOf("--prefilter"); return i >= 0 ? argv[i + 1] : null; })();
const preRe = PREFILTER ? new RegExp(PREFILTER, "i") : null;
if (PREFILTER) {
  const probe = "At its discretion the Employer may make discretionary matching contributions at the discretion of the Board.";
  if (!newLib[ARM](probe)) throw new Error(`--prefilter: the probe sentence does not fire ${ARM} — the prefilter cannot be validated`);
  const stripped = probe.replace(new RegExp(PREFILTER, "gi"), "XXXX");
  if (newLib[ARM](stripped)) throw new Error(`--prefilter ${PREFILTER} is NOT required by ${ARM} — it still fires with the substring removed`);
  console.log(`prefilter: "${PREFILTER}" asserted necessary for ${ARM} (probe fires; probe without it does not)`);
}

/* the ledger's precedence, written once and controlled below */
const stateOf = (ft) => !ft ? "absent"
  : ft.match ? "published"
    : ft.matchMisread ? "withheld"
      : ft.matchText ? "withheld"
        : ft.noEmployer ? "published" : "absent";

const L = buildLedger({ withStatus: false });
/* the EMPLOYER CONTRIBUTION per ack, read from the same store the audit reads,
 * because the trail's `match` key is gated on it */
const empByAck = (() => {
  const P = loadPlans(), m = new Map();
  for (const r of P.rows) m.set(P.get(r, "ack"), P.get(r, "contribEmployer") || 0);
  return m;
})();
/* THE MAPPER'S CONTROL. Handed each plan's STORED features — the very input the
 * ledger used — the mapper must return the ledger's own state. A short-form
 * plan is `impossible` before features are consulted at all, so it is excluded
 * by the same condition `matchCell` applies first. */
import { loadLineups } from "./lib-ledger.mjs";
const lineups = loadLineups();
let ctrlN = 0, ctrlOk = 0;
const ctrlBad = [];
for (const p of L.plans) {
  if (p.sf) continue;
  const own = p.ack ? lineups.get(p.ack) : null;
  const ft = own && own.features ? own.features : null;
  ctrlN++;
  if (stateOf(ft) === p.cells.match.state) ctrlOk++;
  else ctrlBad.push(`${p.sponsorName} ${p.ein}|${p.pn}: ledger=${p.cells.match.state} mapper=${stateOf(ft)}`);
}
console.log(`MAPPER CONTROL: ${ctrlOk}/${ctrlN} full-form plans reproduce the ledger's own match state`);
for (const b of ctrlBad.slice(0, 5)) console.log(`  MISMATCH ${b}`);
if (ctrlOk !== ctrlN) { console.error("the state mapper disagrees with lib-ledger — fix it before reading anything below"); process.exit(1); }

/* ------------------------------------------------------------ the population
 * THE TEXT IS NEVER HELD. The corpus is 8.3 GB and a first version kept every
 * judged filing's string alive to save a re-read; it died of heap exhaustion
 * after the mapper control printed, which looks exactly like the control having
 * failed. Read, test, discard. */
const ppl = (a) => a.reduce((s, x) => s + (x.ppl !== undefined ? x.ppl : x.p.ppl), 0);
const narrowed = [], excluded = [], unjudged = [];
let judged = 0, judgedPpl = 0;
const cached = new Map();
if (NARROW_CACHE && existsSync(NARROW_CACHE))
  for (const line of readFileSync(NARROW_CACHE, "utf8").split("\n"))
    if (line) { const [a, v] = line.split("\t"); cached.set(a, v === "1"); }
let scanned = 0, fresh = 0;
const sink = NARROW_CACHE ? openSync(NARROW_CACHE, "a") : null;
for (const p of L.plans) {
  if (p.sf || !p.ack) continue;
  if (++scanned % 2000 === 0) process.stderr.write(`  narrowing ${scanned} (fresh ${fresh})\n`);
  if (cached.has(p.ack)) {
    judged++; judgedPpl += p.ppl;
    (cached.get(p.ack) ? narrowed : excluded).push(p);
    continue;
  }
  const raw = read(p.ack);
  if (!raw) { unjudged.push(p); continue; }
  judged++; judgedPpl += p.ppl; fresh++;
  /* `raw.toLowerCase()` was here and it allocated a full copy of every
   * multi-megabyte filing — as expensive as the flatten it exists to avoid, and
   * the run got SLOWER rather than faster. A case-folded regex on the raw text
   * allocates nothing. */
  let hit = false;
  if (!PREFILTER || preRe.test(raw)) hit = fires(raw.replace(/\s+/g, " "));
  (hit ? narrowed : excluded).push(p);
  if (sink) writeSync(sink, `${p.ack}\t${hit ? 1 : 0}\n`);
}
if (sink) closeSync(sink);
console.log(`\njudged ${judged} full-form plans / ${judgedPpl.toLocaleString()} readers`);
console.log(`UNJUDGED ${unjudged.length} plans / ${ppl(unjudged).toLocaleString()} readers — no cached filing text, so every figure below is a FLOOR over the run`);
console.log(`narrowed to ${narrowed.length} plans / ${ppl(narrowed).toLocaleString()} readers (the arm fires on the text); ${excluded.length} excluded`);

/* ------------------------------------------------------------ the difference */
const FIELDS = new Set();
const moves = [];
const nonMatch = [];
let done = 0;
const slice = CHUNK ? narrowed.slice(CHUNK.start, CHUNK.start + CHUNK.count) : narrowed;
if (CHUNK) console.log(`CHUNK ${CHUNK.start}..${CHUNK.start + slice.length} of ${narrowed.length}`);
for (const p of slice) {
  if (++done % 250 === 0) process.stderr.write(`  diffing ${done}/${slice.length}\n`);
  const raw = read(p.ack);
  const a = oldLib.extractPlanFeatures(raw, p.sponsorName || "") || {};
  const b = newLib.extractPlanFeatures(raw, p.sponsorName || "") || {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let changed = false;
  for (const k of keys) {
    if (JSON.stringify(a[k]) === JSON.stringify(b[k])) continue;
    changed = true;
    FIELDS.add(k);
    if (!/^match/.test(k)) nonMatch.push(`${k} :: ${p.sponsorName} ${p.ack} :: ${String(a[k]).slice(0, 80)} -> ${String(b[k]).slice(0, 80)}`);
  }
  if (!changed) continue;
  moves.push({
    p, from: stateOf(a), to: stateOf(b),
    oldMatch: a.match || null, newMatch: b.match || null,
    oldQuote: a.matchText || null, newQuote: b.matchText || null,
    ledger: p.cells.match.state,
    contribEmployer: empByAck.get(p.ack) || 0,
  });
}
console.log(`\nfields that moved anywhere: ${[...FIELDS].sort().join(", ") || "(none)"}`);
console.log(`NON-MATCH FIELD MOVES: ${nonMatch.length}`);
for (const n of nonMatch.slice(0, 10)) console.log("  " + n);

const by = new Map();
for (const m of moves) {
  const k = `${m.from} -> ${m.to}`;
  let v = by.get(k); if (!v) by.set(k, (v = []));
  v.push(m);
}
console.log(`\n${moves.length} plans / ${moves.reduce((s, m) => s + m.p.ppl, 0).toLocaleString()} readers change at all`);
for (const [k, v] of [...by].sort((x, y) => y[1].reduce((s, m) => s + m.p.ppl, 0) - x[1].reduce((s, m) => s + m.p.ppl, 0)))
  console.log(`  ${String(v.reduce((s, m) => s + m.p.ppl, 0)).padStart(9)} ppl  ${String(v.length).padStart(4)} pl  ${k}`);

const lost = moves.filter((m) => m.oldMatch && !m.newMatch);
const relabel = moves.filter((m) => m.oldMatch && m.newMatch && m.oldMatch !== m.newMatch);
const quoteMoved = moves.filter((m) => m.oldQuote && m.newQuote && m.oldQuote !== m.newQuote);
console.log(`\nFORMULAS LOST: ${lost.length}    FORMULAS RELABELLED: ${relabel.length}    QUOTES CHANGED (both present): ${quoteMoved.length}`);
for (const m of [...lost, ...relabel].slice(0, 10))
  console.log(`  ${m.p.sponsorName} ${m.p.ack}  ${m.oldMatch} -> ${m.newMatch}`);

/* THE TRAIL SPLITS A PLAN GAINING A FORMULA TWO WAYS AND THE LEDGER DOES NOT.
 * `audit-data` counts `match` only where the plan reported employer money and
 * puts the rest in `matchInZeroEmp`; `matchAny` is their sum. A registration
 * naming `match` alone under-predicts by exactly the $0-employer population, so
 * the split is printed rather than left to a band. */
{
  const zero = moves.filter((m) => m.newMatch && !m.oldMatch && !(m.contribEmployer > 0));
  const nonzero = moves.filter((m) => m.newMatch && !m.oldMatch && m.contribEmployer > 0);
  console.log(`\nTRAIL SPLIT of the plans that GAIN a formula:`);
  console.log(`  match          += ${nonzero.length}  (employer money reported)`);
  console.log(`  matchInZeroEmp += ${zero.length}  ($0 employer contribution)`);
  console.log(`  matchAny       += ${nonzero.length + zero.length}`);
  const hadQuote = moves.filter((m) => m.newMatch && !m.oldMatch && m.oldQuote);
  console.log(`  matchQuote     -= ${hadQuote.filter((m) => m.contribEmployer > 0).length}  (of the gainers, had a stored quote and employer money)`);
}
const MOVES = (() => { const i = argv.indexOf("--moves"); return i >= 0 ? argv[i + 1] : null; })();
if (MOVES) {
  writeFileSync(CHUNK ? `${MOVES}.${CHUNK.start}` : MOVES, JSON.stringify(moves.map((m) => ({
    ein: m.p.ein, pn: m.p.pn, name: m.p.sponsorName, ack: m.p.ack, ppl: m.p.ppl,
    contribEmployer: m.contribEmployer, from: m.from, to: m.to, ledger: m.ledger,
    oldMatch: m.oldMatch, newMatch: m.newMatch, oldQuote: m.oldQuote, newQuote: m.newQuote,
  }))));
  console.log(`wrote ${moves.length} moved plans to ${MOVES}`);
}

console.log(`\n--- the ${Math.min(SHOW, moves.length)} largest movers, for reading ---`);
for (const m of moves.sort((a, b) => b.p.ppl - a.p.ppl).slice(0, SHOW)) {
  console.log(`\n${m.p.ppl} ${m.p.sponsorName}  ${m.p.ein}|${m.p.pn}  ${m.p.ack}`);
  console.log(`  ledger today: ${m.ledger}   harness: ${m.from} -> ${m.to}`);
  console.log(`  formula: ${m.oldMatch || "(none)"} -> ${m.newMatch || "(none)"}`);
  console.log(`  quote  : ${String(m.newQuote || "").slice(0, 300)}`);
}

/* ------------------------------------------------------------- the discharge */
if (DISCHARGE) {
  let n = 0, diff = 0;
  for (const p of excluded.slice(0, DISCHARGE)) {
    const raw = read(p.ack);
    n++;
    const a = JSON.stringify(oldLib.extractPlanFeatures(raw, p.sponsorName || "") || {});
    const b = JSON.stringify(newLib.extractPlanFeatures(raw, p.sponsorName || "") || {});
    if (a !== b) { diff++; console.log(`  DISCHARGE DIFFERENCE ${p.sponsorName} ${p.ack}`); }
  }
  console.log(`\nNARROWING DISCHARGE: ${n} excluded filings re-run unnarrowed, ${diff} differences`);
  if (diff) process.exit(1);
}
console.log("\nThese figures are DERIVED. Re-run this script; never copy them forward.");
