#!/usr/bin/env node
/* WHY DID THE VESTING LOOP PRODUCE NOTHING AT ALL?
 *
 * `notes-gap-census.mjs vesting` answers the question BEFORE this one — is the
 * note in the public copy, and does it carry vesting vocabulary. Its PARSER
 * CANDIDATE bucket is the largest addressable class on the ledger, and it is
 * one bucket with at least two unrelated repairs inside it. This splits it.
 *
 * THE FORK THAT MATTERS. `extractPlanFeatures` anchors every vesting arm on one
 * regex, `/[^.]{0,220}\bvest(?:ed|ing)?\b[^.]{0,220}\./`, and a filing in the
 * absent bucket either handed that selection NOTHING or handed it sentences
 * that every arm then refused. The first is a SELECTION defect and the second
 * is a READING defect, and nothing in the store tells them apart — so a pass
 * aimed at one of them over a bucket that is mostly the other buys nothing.
 *
 * Sub-buckets of "the selection was empty", each a different repair:
 *   S-plural       the only vesting word is "vests" / "vest" as a plural verb.
 *                  The anchor's `(?:ed|ing)?` is followed by `\b`, so "vests"
 *                  cannot anchor it at all. `FIELD_WORD.vesting` DOES read it,
 *                  which is why the notes census calls these addressable.
 *   S-nonforf      the only vocabulary is "nonforfeitable" — the statutory
 *                  synonym, which the anchor does not know.
 *   S-noperiod     a vest/vested/vesting word IS present and there is no `.`
 *                  within 220 characters after it: a TABLE, a heading run, or
 *                  a page of columns. The anchor needs a sentence terminator.
 *   S-vetoed       sentences existed and the loop's own filters removed them
 *                  (form boilerplate, plan-termination, death/disability).
 *   S-other        none of the above — report rather than absorb.
 *
 * Usage:  node scripts/vesting-absent-census.mjs [--top N] [--list BUCKET]
 *
 * Reads only the shared filing-text cache; it never downloads. Members with no
 * cached text are counted and named as UNJUDGED, because a census over part of
 * a population is a floor and must say so.
 */
import { buildLedger } from "./lib-ledger.mjs";
import { extractPlanFeatures } from "./lib-4i.mjs";
import { planNoteArm, attachmentHasNoTextLayer, stripFormAndNameNoise, FIELD_WORD } from "./lib-plannote.mjs";
import { read } from "./lib-filingtext.mjs";
import { vestingSelection, VEST_ANCHOR } from "./lib-vestslice.mjs";

const argv = process.argv.slice(2);
const TOP = (() => { const i = argv.indexOf("--top"); return i > 0 ? +argv[i + 1] : 12; })();
const LIST = (() => { const i = argv.indexOf("--list"); return i > 0 ? argv[i + 1] : null; })();

const L = buildLedger({ withStatus: false });
const rows = [];
for (const p of L.plans) {
  const c = p.cells.vesting;
  if (c.state !== "absent") continue;
  if (c.why.startsWith("no features")) continue;   // the shared bucket, not this one
  rows.push({ ein: p.ein, pn: p.pn, name: p.sponsorName, ppl: p.ppl, ack: p.ack });
}
const sum = (a) => a.reduce((s, r) => s + r.ppl, 0);
console.log(`vesting ABSENT bucket: ${rows.length} plans / ${sum(rows).toLocaleString()} readers`);
console.log(`anchor under test: ${VEST_ANCHOR}\n`);

/* "vests" / "vest" used as a plural verb or a bare noun the anchor cannot
 * reach. Deliberately the COMPLEMENT of the anchor's own vocabulary rather
 * than a guess at English: whatever `FIELD_WORD.vesting` reads and
 * `\bvest(?:ed|ing)?\b` does not is exactly the blind spot. */
const ANCHORABLE = /\bvest(?:ed|ing)?\b/i;
const PLURAL = /\bvests\b/i;
const NONFORF = /\bnon-?forfeitable\b/i;

const tally = new Map();
const add = (k, r, extra) => {
  let v = tally.get(k);
  if (!v) tally.set(k, (v = { plans: 0, ppl: 0, ex: [] }));
  v.plans++; v.ppl += r.ppl; v.ex.push({ ...r, ...extra });
};

let judgedPpl = 0;
for (const r of rows) {
  const raw = read(r.ack);
  if (!raw) { add("U0 unjudged — no cached filing text", r); continue; }
  judgedPpl += r.ppl;
  let ft = null;
  try { ft = extractPlanFeatures(raw, r.name || ""); } catch { /* bucketed below */ }
  if (ft && (ft.vesting || ft.vestingText)) { add("R instrument already yields the field (not production)", r); continue; }
  if (attachmentHasNoTextLayer(raw)) { add("A0 no text layer (OCR path, not reproducible here)", r); continue; }
  if (!planNoteArm(raw)) { add("A1 NO plan-description note — SOURCE gap", r); continue; }
  const flat = stripFormAndNameNoise(raw.replace(/\s+/g, " "));
  if (!FIELD_WORD.vesting.test(flat)) { add("B note present and SILENT on vesting — CEILING", r); continue; }

  /* --- the fork: what did the selection have to work with? --- */
  const sel = vestingSelection(raw);
  if (sel.vestSentences.length) {
    add("C-read selection NON-empty — every arm refused", r,
      { n: sel.vestSentences.length, best: sel.vestSentences[0] });
    continue;
  }
  /* The selection is empty. Ask the stripped text WHY — stripped, because the
   * form's own 6g(2) line and Schedule R carry vest words on every filing and
   * a sub-cause keyed on the raw text would attribute them to the notes. */
  const hasAnchorable = ANCHORABLE.test(flat);
  if (!hasAnchorable && PLURAL.test(flat)) { add("S-plural only \"vests\" — the anchor cannot reach it", r); continue; }
  if (!hasAnchorable && NONFORF.test(flat)) { add("S-nonforf only \"nonforfeitable\"", r); continue; }
  if (!hasAnchorable) { add("S-other vocabulary present but not anchorable", r); continue; }
  /* An anchorable word IS there. Either no sentence terminator is in reach, or
   * the loop's filters removed everything. Ask the anchor directly on the same
   * normalized text the parser uses. */
  const t = raw.replace(/\s+/g, " ");
  const anchorFinds = new RegExp(VEST_ANCHOR.source, "gi").test(t);
  if (!anchorFinds) {
    let gapEx = "";
    const m = t.match(ANCHORABLE);
    if (m) gapEx = t.slice(Math.max(0, m.index - 60), m.index + 200);
    add("S-noperiod no sentence terminator within 220 chars of a vest word", r, { gapEx });
    continue;
  }
  add("S-vetoed the loop's own filters removed every sentence", r);
}

console.log(`judged ${(100 * judgedPpl / Math.max(1, sum(rows))).toFixed(1)}% of the bucket's readers\n`);
for (const [k, v] of [...tally].sort((a, b) => b[1].ppl - a[1].ppl)) {
  console.log(`${String(v.ppl).padStart(11)} ppl  ${String(v.plans).padStart(5)} pl  ${k}`);
  for (const e of v.ex.sort((a, b) => b.ppl - a.ppl).slice(0, TOP))
    console.log(`      ${String(e.ppl).padStart(8)} ${String(e.name).slice(0, 36).padEnd(37)} ${e.ack}`);
}
if (LIST) {
  const key = [...tally.keys()].find((k) => k.startsWith(LIST));
  if (!key) { console.error(`\nno bucket starting ${LIST}`); process.exit(2); }
  console.log(`\n--- every member of ${key}, largest first ---`);
  for (const e of tally.get(key).ex.sort((a, b) => b.ppl - a.ppl)) {
    console.log(`${String(e.ppl).padStart(8)} ${String(e.name).slice(0, 40).padEnd(41)} ${e.ack}`);
    if (e.best) console.log(`         (${e.n} selected) ${JSON.stringify(String(e.best).slice(0, 200))}`);
    if (e.gapEx) console.log(`         ${JSON.stringify(String(e.gapEx).replace(/\s+/g, " ").slice(0, 200))}`);
  }
}
console.log("\nThese figures are DERIVED. Re-run; never copy them forward.");
