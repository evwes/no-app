/* wampo — WHY DOES A FILING THAT TALKS ABOUT A MATCH PUBLISH NOTHING?
 *
 * `notes-gap-census.mjs match` answers the FIRST question — does the public
 * copy carry the audited notes, and do those notes use the word "match" at all.
 * Its bucket C (note present, vocabulary present, extractor yields nothing) is
 * the parser-addressable class and it is NOT one class: a filing whose only
 * "match" word sits in "forfeitures reduce future employer matching
 * contributions" is as silent on the formula as one with no match word at all,
 * and a filing stating "a matching contribution of 50% of the first 6%" that we
 * drop is a defect. One cause must never be quoted for both — this record
 * already paid for that once, when a "two-column page" label was read off 2.23M
 * readers and eight members refuted it.
 *
 * SO THE CONDITIONS ARE SLICED FROM `lib-4i.mjs`, NEVER RETYPED. The match
 * quote fallback is two loops over `mre` / `MF_FVERB` with four rejections, all
 * of them inline inside `extractPlanFeatures`, so they cannot be imported. This
 * reads them out of the source and compiles them, and the EQUIVALENCE CONTROL
 * is what makes that trustworthy rather than merely convenient: over every
 * filing whose production answer is a quote with no formula (so the quote came
 * from these very loops), the sliced loop must return the IDENTICAL string.
 * A control that cannot fail is decorative; this one fails the moment the slice
 * drifts from the source.
 *
 * Usage:
 *   node scripts/match-cause-census.mjs            # full pass, writes the cache
 *   node scripts/match-cause-census.mjs --cached   # re-bucket from the cache
 *   node scripts/match-cause-census.mjs --control  # the equivalence control only
 *   node scripts/match-cause-census.mjs --cached --show <BUCKET> [--top N]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { buildLedger } from "./lib-ledger.mjs";
import { extractPlanFeatures, mfWidened, mfMixedFraction, mfEqualTo, mfEqualToWords, mfFiniteVerb } from "./lib-4i.mjs";
import { planNoteArm, attachmentHasNoTextLayer, stripFormAndNameNoise, FIELD_WORD } from "./lib-plannote.mjs";
import { read, seededShuffle } from "./lib-filingtext.mjs";

const argv = process.argv.slice(2);
const CACHE = process.env.MATCH_CAUSE_CACHE || "/tmp/wampo-match-cause.jsonl";
const CACHED = argv.includes("--cached");
const CONTROL_ONLY = argv.includes("--control");
const SHOW = (() => { const i = argv.indexOf("--show"); return i > 0 ? argv[i + 1] : null; })();
const TOP = (() => { const i = argv.indexOf("--top"); return i > 0 ? +argv[i + 1] : 12; })();

/* ---------------------------------------------------------------- the slice */
/* MOVED to `scripts/lib-matchslice.mjs` 2026-11-24, VERBATIM, because a second
 * instrument needed the identical thing and this record's rule is that a
 * construction is SHARED rather than retyped. The equivalence control below is
 * unchanged and now guards the shared copy, which is the point: it fails the
 * moment the slice drifts from `lib-4i.mjs`. */
import { fallback } from "./lib-matchslice.mjs";

/* ------------------------------------------------- the equivalence control */
function control(L) {
  /* Production's answer is a quote with NO formula exactly when one of these
   * loops supplied it — every other path that sets `matchText` also sets
   * `match`. So on that population the sliced loop must return the identical
   * string. Drawn seeded so the control can be re-run by anyone. */
  const pool = [];
  for (const p of L.plans) {
    const c = p.cells.match;
    /* the ledger's own name for "a quote and no formula" — asked of the cell
     * rather than re-derived, so the control's population is the metric's */
    if (c.state !== "withheld" || !/^no formula parsed/.test(c.why) || !p.ack) continue;
    pool.push(p);
  }
  let n = 0, same = 0, diff = [];
  for (const p of seededShuffle(pool, 0x4D41).slice(0, 4000)) {
    const raw = read(p.ack);
    if (!raw) continue;
    let ft;
    try { ft = extractPlanFeatures(raw, p.sponsorName || ""); } catch { continue; }
    if (!ft || ft.match || !ft.matchText) continue;   // not a fallback-supplied quote
    n++;
    const f = fallback(raw).found;
    if (f === ft.matchText) same++; else diff.push({ ack: p.ack, name: p.sponsorName, prod: ft.matchText, slice: f });
  }
  console.log(`EQUIVALENCE CONTROL: ${same}/${n} fallback-supplied quotes reproduced by the slice`);
  if (!n) throw new Error("control reached ZERO fallback-supplied quotes — a broken arm and an inert arm read the same zero");
  for (const d of diff.slice(0, 5)) {
    console.log(`  DIFF ${d.name} ${d.ack}`);
    console.log(`    prod : ${String(d.prod).slice(0, 160)}`);
    console.log(`    slice: ${String(d.slice).slice(0, 160)}`);
  }
  return { n, same, diff: diff.length };
}

/* ------------------------------------------------------------ the population */
const L = buildLedger({ withStatus: false });
if (CONTROL_ONLY) { const r = control(L); process.exit(r.diff ? 1 : 0); }

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
    const flat = raw.replace(/\s+/g, " ");
    if (!FIELD_WORD.match.test(stripFormAndNameNoise(flat))) { recs.push({ ...r, b: "B" }); continue; }
    /* bucket C — the parser-addressable class. Everything below is its cause. */
    const fb = fallback(raw);
    const rec = { ...r, b: "C", why: fb.why, cands: fb.cands, found: fb.found ? fb.found.slice(0, 400) : null };
    rec.mf = [["widened", mfWidened], ["mixedfrac", mfMixedFraction], ["equalto", mfEqualTo],
      ["equaltowords", mfEqualToWords], ["finiteverb", mfFiniteVerb]]
      .filter(([, f]) => { try { return !!f(flat); } catch { return false; } }).map(([k]) => k);
    /* WHERE IS THE MATCH WORD, AND IS A MAGNITUDE NEAR IT? A window, not a
     * sentence: this question is about the TEXT, not about what production
     * selected, and the sentence machinery is already asked above. */
    const stripped = stripFormAndNameNoise(flat);
    const hits = [];
    for (const m of stripped.matchAll(/\bmatch(?:es|ed|ing)?\b/gi)) hits.push(m.index);
    rec.hits = hits.length;
    const WIN = 220;
    const RATE = /\d{1,3}(?:\.\d+)?\s?(?:percent|%)|\$\s?\d[\d.,]*\s*(?:for|per)\s+(?:each|every)/i;
    rec.rateNear = hits.some((i) => RATE.test(stripped.slice(Math.max(0, i - WIN), i + WIN)));
    rec.ctx = hits.slice(0, 40).map((i) => stripped.slice(Math.max(0, i - 120), i + 160));
    recs.push(rec);
  }
  writeFileSync(CACHE, recs.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`wrote ${recs.length} records to ${CACHE}`);
}

/* --------------------------------------------------------------- the report */
const NEG = /(?:does not|do not|did not|no longer|ceased to|elected not to)[^.]{0,80}?match|no (?:employer |company )?match(?:ing)? contributions? (?:were|was|are|is|have been|had been)[^.]{0,30}?(?:made|provided|required)|match(?:ing)? contributions? (?:were|was|are|is) (?:not|no longer)/i;
const DISC = /discretion/i;
const ONLY_OTHER = /forfeit|vest|eligib/i;

function causeOf(r) {
  if (r.b !== "C") return r.b;
  if (r.found) return "C-slice-differs";                       // must be empty; see note
  if (r.mf.length) return "C-mf-fires";                        // must be empty; see note
  if (r.cands === 0) return r.rateNear ? "C0-rate-no-anchor" : "C0-no-rate-no-anchor";
  const kinds = [...new Set(r.why.map((w) => w.split(":")[1]))].sort().join("+");
  return `C1-rejected:${kinds}${r.rateNear ? "" : " (no rate near)"}`;
}
const tally = new Map();
for (const r of recs) {
  const k = causeOf(r);
  let v = tally.get(k);
  if (!v) tally.set(k, (v = { plans: 0, ppl: 0, ex: [] }));
  v.plans++; v.ppl += r.ppl; v.ex.push(r);
}
console.log("");
for (const [k, v] of [...tally].sort((a, b) => b[1].ppl - a[1].ppl))
  console.log(`${String(v.ppl).padStart(10)} ppl  ${String(v.plans).padStart(5)} pl  ${k}`);

const C = recs.filter((r) => r.b === "C");
console.log(`\nbucket C total: ${C.length} plans / ${C.reduce((s, r) => s + r.ppl, 0).toLocaleString()} readers`);
/* The sub-split that decides whether there is work here: does the text state a
 * magnitude anywhere near a match word? */
for (const [lab, f] of [
  ["a magnitude sits within 220 chars of a match word", (r) => r.rateNear],
  ["  of those, an explicit NEGATIVE statement", (r) => r.rateNear && r.ctx.some((c) => NEG.test(c))],
  ["  of those, DISCRETION near the match word", (r) => r.rateNear && r.ctx.some((c) => DISC.test(c))],
  ["no magnitude near any match word", (r) => !r.rateNear],
  ["  of those, an explicit NEGATIVE statement", (r) => !r.rateNear && r.ctx.some((c) => NEG.test(c))],
  ["  of those, DISCRETION near the match word", (r) => !r.rateNear && r.ctx.some((c) => DISC.test(c))],
  ["  of those, every context is forfeiture/vesting/eligibility", (r) => !r.rateNear && r.ctx.length > 0 && r.ctx.every((c) => ONLY_OTHER.test(c))],
]) {
  const s = C.filter(f);
  console.log(`${String(s.reduce((a, r) => a + r.ppl, 0)).padStart(10)} ppl  ${String(s.length).padStart(5)} pl  ${lab}`);
}

if (SHOW) {
  const v = tally.get(SHOW);
  if (!v) { console.log(`\nno bucket named ${SHOW}`); process.exit(2); }
  console.log(`\n--- ${SHOW}: top ${TOP} by readers ---`);
  for (const e of v.ex.sort((a, b) => b.ppl - a.ppl).slice(0, TOP)) {
    console.log(`\n${e.ppl} ${e.name}  ein=${e.ein} pn=${e.pn} ${e.ack}  hits=${e.hits} cands=${e.cands} why=${(e.why || []).join(",")}`);
    for (const c of (e.ctx || []).slice(0, 3)) console.log(`    … ${c.replace(/\s+/g, " ")} …`);
  }
}
console.log("\nThese figures are DERIVED. Re-run this script; never copy them forward.");
