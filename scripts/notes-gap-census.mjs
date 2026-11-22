#!/usr/bin/env node
/* wampo — WHY IS THERE NO MATCH / VESTING ANSWER? The cause census.
 *
 * Owner directive 2026-09-02: every unknown gets a DIAGNOSED cause, and
 * "attachment read, no match statement found" describes US rather than the
 * filing. This is the instrument behind the reason strings in `lib-ledger.mjs`,
 * committed so those figures are RE-DERIVED and never copied forward — the
 * standing rule this project has broken five times.
 *
 * THE ORDER OF THE QUESTIONS IS THE WHOLE DESIGN. Before asking what a filing's
 * notes say about a match, ask whether the public copy carries the notes at
 * all: Shell Provident Fund files a Schedule C formula description plus the 4i
 * schedule, and Dollar General files the §103(a)(3)(C) opinion, the statements
 * and the schedule. Both have a CONFIDENT fund lineup and neither has one
 * sentence a parser could read about a match or a vesting schedule.
 *
 * Buckets, in the order a filing is asked:
 *   D0  no public copy reachable (403 / withdrawn from the bucket)
 *   R   the cached text ALREADY yields the field — a difference between this
 *       instrument and the production run, counted separately and never as a
 *       cause. After a parser change that is not yet merged, this bucket is
 *       largely the change itself; say which.
 *   A0  the attachment has no extractable text layer (scanned / cipher).
 *       Production reads these through OCR and `lib-filingtext` does not, so
 *       they are LABELLED and never counted as a finding in either direction.
 *   A1  text extracts and the public copy carries NO plan-description note —
 *       a SOURCE gap. There is nothing to parse.
 *   B   the note is present and does NOT carry the field's vocabulary — the
 *       filing is silent, which is a CEILING no parser can move.
 *   C   the note is present AND carries the vocabulary — PARSER CANDIDATE.
 *
 * Needs the filings. `--download` fetches what the corpus lacks (~5 min per
 * thousand); without it, unreachable members land in D0 and the header says
 * what share of the bucket's READERS was judged, because a census over 70% of
 * a population is a floor and must say so.
 *
 * Usage:
 *   node scripts/notes-gap-census.mjs match [--download] [--top N]
 *   node scripts/notes-gap-census.mjs vesting
 *   node scripts/notes-gap-census.mjs nofeatures     # the cause both share
 */
import { buildLedger } from "./lib-ledger.mjs";
import { extractPlanFeatures } from "./lib-4i.mjs";
import { planNoteArm, attachmentHasNoTextLayer, stripFormAndNameNoise, FIELD_WORD } from "./lib-plannote.mjs";
import { read, ensure } from "./lib-filingtext.mjs";

const argv = process.argv.slice(2);
const WHICH = argv.find((a) => !a.startsWith("--")) || "match";
const DOWNLOAD = argv.includes("--download");
const TOP = (() => { const i = argv.indexOf("--top"); return i > 0 ? +argv[i + 1] : 10; })();
if (!["match", "vesting", "nofeatures"].includes(WHICH)) {
  console.error("notes-gap-census: first argument must be match | vesting | nofeatures");
  process.exit(2);
}

/* THE POPULATION IS TAKEN FROM THE LEDGER'S OWN CELLS, not re-derived from the
 * store — a prediction about a metric must apply exactly the conditions the
 * metric applies, no more. The reason-string prefixes are the join. */
const FIELD = WHICH === "nofeatures" ? null : WHICH;
const L = buildLedger({ withStatus: false });
const rows = [];
for (const p of L.plans) {
  const c = p.cells[FIELD || "match"];
  if (c.state !== "absent") continue;
  const isNoFt = c.why.startsWith("no features");
  if (WHICH === "nofeatures" ? !isNoFt : isNoFt) continue;
  rows.push({ ein: p.ein, pn: p.pn, name: p.sponsorName, ppl: p.ppl, ack: p.ack });
}
const sum = (a) => a.reduce((s, r) => s + r.ppl, 0);
console.log(`${WHICH}: ${rows.length} plans / ${sum(rows).toLocaleString()} readers in the bucket`);

if (DOWNLOAD) {
  const r = await ensure(rows.map((x) => x.ack), { download: true, concurrency: 5,
    onProgress: (d, t) => { if (d % 200 === 0) process.stderr.write(`  fetched ${d}/${t}\n`); } });
  console.log(`  corpus: had ${r.have}, fetched ${r.fetched}, failed ${r.failed.length}`);
}

const LABEL = {
  D0: "no public copy reachable (403 / withdrawn)",
  R: "the cached text ALREADY yields the field (instrument vs production text difference)",
  A0: "attachment has no extractable text layer (OCR path — not reproducible here)",
  A1: "NO plan-description note in the public copy — SOURCE gap, nothing to parse",
  B: `note present and SILENT on ${WHICH} — CEILING, no parser can move it`,
  C: WHICH === "nofeatures"
    ? "note present and the extractor finds NO feature of any kind — PARSER CANDIDATE"
    : `note present and carries the ${WHICH} vocabulary — PARSER CANDIDATE`,
};
const tally = new Map();
const add = (k, r) => {
  let v = tally.get(k);
  if (!v) tally.set(k, (v = { plans: 0, ppl: 0, ex: [] }));
  v.plans++; v.ppl += r.ppl;
  v.ex.push(r);
};

const yields = (ft) => FIELD === "match" ? !!(ft && (ft.match || ft.matchText || ft.noEmployer))
  : FIELD === "vesting" ? !!(ft && (ft.vesting || ft.vestingText))
    : !!(ft && Object.keys(ft).length);

let judged = 0;
for (const r of rows) {
  const raw = read(r.ack);
  if (!raw) { add("D0", r); continue; }
  judged++;
  let ft = null;
  try { ft = extractPlanFeatures(raw, r.name || ""); } catch { /* falls through to a bucket */ }
  if (yields(ft)) { add("R", r); continue; }
  if (attachmentHasNoTextLayer(raw)) { add("A0", r); continue; }
  if (!planNoteArm(raw)) { add("A1", r); continue; }
  if (FIELD && !FIELD_WORD[FIELD].test(stripFormAndNameNoise(raw.replace(/\s+/g, " ")))) { add("B", r); continue; }
  add("C", r);
}
const judgedPpl = rows.filter((r) => read(r.ack)).reduce((s, r) => s + r.ppl, 0);
console.log(`  judged ${judged} of ${rows.length} filings — ${(100 * judgedPpl / Math.max(1, sum(rows))).toFixed(1)}% of the bucket's readers\n`);

for (const [k, v] of [...tally].sort((a, b) => b[1].ppl - a[1].ppl)) {
  console.log(`${String(v.ppl).padStart(11)} ppl  ${String(v.plans).padStart(5)} pl  ${k}  ${LABEL[k]}`);
  for (const e of v.ex.sort((a, b) => b.ppl - a.ppl).slice(0, TOP))
    console.log(`      ${String(e.ppl).padStart(8)} ${e.name}  ein=${e.ein} pn=${e.pn}  ${e.ack}`);
}
const notWork = ["A1", "A0", "D0"].reduce((s, k) => s + (tally.get(k) ? tally.get(k).ppl : 0), 0)
  + (tally.get("B") ? tally.get("B").ppl : 0);
console.log(`\nNOT PARSER WORK (source gap + ceiling + unreachable): ${notWork.toLocaleString()} of ${sum(rows).toLocaleString()} readers`
  + ` (${(100 * notWork / Math.max(1, sum(rows))).toFixed(1)}%)`);
console.log("These figures are DERIVED. Re-run this script; never copy them forward.");
