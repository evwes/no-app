#!/usr/bin/env node
/* wampo — WHAT v214's ARM COSTS THE TWO READERS OF `vesting` THAT LIVE IN
 * `fetch-4i.mjs`, WHICH NEITHER A DIFFERENTIAL NOR A GATE CAN SEE.
 *
 * *A write-set argument is sound only when closed under what READS the field*,
 * and `git diff | grep -o 'out\.[A-Za-z]*'` cannot see either of these, because
 * both observe `extractPlanFeatures` from OUTSIDE it — so a differential that
 * calls `extractPlanFeatures` directly is blind to both by construction.
 *
 *   READER 1  `fetch-4i.mjs:662`
 *     const notesMissing = (f) => !f || !["match","matchText","vesting","vestingText"]
 *       .some((k) => k in f);
 *     if ((!isConfident(parsed) || notesMissing(features) || imgPages.length) && hasOcrTools) {
 *   A base `vesting`/`vestingText` makes `notesMissing` FALSE. For a filing
 *   whose parse IS confident, `imgPages` is `[]` BY CONSTRUCTION — the line
 *   above computes it only when `!(parsed.found && isConfident(parsed))` — so
 *   `notesMissing` is that filing's ONLY OCR trigger, and a new base vesting
 *   value takes it away.
 *     THE CONDITION IS A DISJUNCTION OVER FOUR KEYS, so the cost lands only on
 *   acks that today have NO match feature EITHER: with `match` or `matchText`
 *   present, `notesMissing` is already false and nothing changes.
 *
 *   READER 2  `fetch-4i.mjs:803` FEATURE_GROUPS / `mergeFeatures`
 *     for (const g of FEATURE_GROUPS) { if (g.some((k) => k in base)) continue; … }
 *   `["vesting","vestingText"]` is ONE group, skipped when the base has
 *   either — so a base value CLOSES the group and an OCR parse's vesting can
 *   no longer be merged in.
 *
 * Usage: node scripts/vesting-arm-fetch-cost.mjs
 */
import { readFileSync } from "node:fs";
import { buildLedger, loadLineups } from "./lib-ledger.mjs";
import { loadStatus } from "./lib-schema.mjs";
import { read } from "./lib-filingtext.mjs";
import { vestingSelection } from "./lib-vestslice.mjs";
import { unnarrowedFullVesting } from "./lib-4i.mjs";

/* THE POPULATION IS THE DIFFERENTIAL'S MOVES WHEN ONE IS SUPPLIED, AND THAT IS
 * THE DIFFERENCE BETWEEN A BOUND AND A COST. Both readers below are triggered
 * by a field being PRESENT, so only a plan that actually GAINS `vesting` or
 * `vestingText` can cost anything — and after the arm was scoped to fill a
 * blank, "some sentence qualifies" stopped being the same set as "the field
 * changes". Asked without a moves file this script prices the wider QUALIFYING
 * set, which over-states: it read 1,504 plans where the moves are 550.
 *   node scripts/vesting-arm-fetch-cost.mjs [moves.json]
 */
const MOVES = process.argv[2]
  ? new Set(JSON.parse(readFileSync(process.argv[2], "utf8")).map((m) => m.ack))
  : null;
console.log(MOVES
  ? `population: the DIFFERENTIAL's ${MOVES.size} moved acks — plans whose stored field actually changes\n`
  : `population: every plan where some sentence QUALIFIES, which OVER-STATES the cost; pass moves.json\n`);

const L = buildLedger({ withStatus: false });
const lineups = loadLineups();
/* `loadStatus()` returns `{plans, generated, at}` and NOT a map — this record
 * names `Object.values(loadStatus())` as having reported "3 status entries,
 * 100% at pv 0" with a confident wrong verdict attached. `.at(ack)` is the
 * strict reader: it returns null for an unknown ack and THROWS on an unknown
 * field name rather than reading it as "not confident". */
const status = loadStatus();

/* THE ARM'S OWN POPULATION, asked of the gate's half only — `employerNamed`,
 * which is what ships. Anything the gate does not take cannot cost anything. */
const reached = [];
for (const p of L.plans) {
  if (p.sf || !p.ack) continue;
  const st = p.cells.vesting.state;
  if (st === "published") continue;                 // already has a label; pass 1 never runs
  if (MOVES) { if (MOVES.has(p.ack)) reached.push(p); continue; }
  const raw = read(p.ack);
  if (!raw) continue;
  let hit = false;
  try {
    for (const s of vestingSelection(raw).vestSentences) {
      const uv = unnarrowedFullVesting(s);
      if (uv && uv.employerNamed) { hit = true; break; }
    }
  } catch { /* an unreadable filing is not this measurement's subject */ }
  if (hit) reached.push(p);
}
const sum = (a) => a.reduce((s, r) => s + r.ppl, 0);
console.log(`arm reaches (employerNamed, not already published): ${reached.length} plans / ${sum(reached).toLocaleString()} readers\n`);

/* ---- READER 1: the OCR trigger ------------------------------------------- */
let r1Lost = [], r1NoMatch = 0, r1Confident = 0;
for (const p of reached) {
  const e = lineups.get(p.ack);
  const ft = e && e.features ? e.features : null;
  /* `notesMissing` TODAY: no match and no vesting key at all. If it is already
   * false, the arm changes nothing about this filing's OCR trigger. */
  const notesMissingToday = !ft || !["match", "matchText", "vesting", "vestingText"].some((k) => k in ft);
  if (!notesMissingToday) continue;
  r1NoMatch++;
  /* …and the trigger is only LOST where the other two disjuncts are false.
   * `c` in the status is the confidence flag the merge records; a non-confident
   * parse keeps `!isConfident(parsed)` true and OCR still fires. */
  const s = status.at(p.ack);
  const confident = !!(s && s.c);
  if (!confident) continue;
  r1Confident++;
  r1Lost.push(p);
}
console.log(`READER 1 (notesMissing, the OCR trigger)`);
console.log(`  of the reached, \`notesMissing\` is TRUE today (no match feature either): ${r1NoMatch}`);
console.log(`  of those, the stored parse is CONFIDENT, so \`imgPages\` is [] by construction`);
console.log(`  and \`notesMissing\` is the ONLY remaining trigger:               ${r1Confident}`);
console.log(`  => OCR ATTEMPTS LOST: ${r1Lost.length} acks / ${sum(r1Lost).toLocaleString()} readers`);
for (const p of [...r1Lost].sort((a, b) => b.ppl - a.ppl).slice(0, 10)) console.log(`     ${String(p.ppl).padStart(7)}  ${p.sponsorName} (${p.ack})`);
/* …AND WHETHER THE ATTEMPT WAS EVER WORTH ANYTHING IS A MEASUREMENT, NOT A
 * REASSURANCE. `ov` is written UNCONDITIONALLY as the current OCR_VERSION
 * whether or not a page was ever rasterised — this record says so in terms, and
 * reading `ov: 8` as "OCR ran" is the inference that hid the Meta defect — so
 * `ov` is reported as what it is: evidence the ack went down the OCR BRANCH,
 * not evidence a page was read. What carries the argument instead is that
 * `notesMissing` has been TRUE for these acks on every run since v12, so the
 * trigger has fired on every one of them and has produced no match or vesting
 * feature yet. The attempt being lost is an attempt that has already been made
 * repeatedly and has already come back empty. */
{
  let withOv = 0, ocrAdopted = 0;
  for (const p of r1Lost) {
    const s = status.at(p.ack);
    if (s && s.ov) withOv++;
    const e = lineups.get(p.ack);
    if (e && e.ocr) ocrAdopted++;
  }
  console.log(`  of those, carry an \`ov\` stamp (went down the OCR branch at some run): ${withOv}/${r1Lost.length}`);
  console.log(`  of those, whose STORED entry is an adopted OCR parse: ${ocrAdopted}/${r1Lost.length}`);
}
console.log(`  STANDING COST, stated even where today's is zero: any ack this arm newly answers`);
console.log(`  from a CONFIDENT base parse with no match feature loses its only OCR attempt. The`);
console.log(`  loss is of an ATTEMPT, not of data: the base parse already answered the vesting`);
console.log(`  question, and OCR's own value could only have been merged into an EMPTY group.\n`);

/* ---- READER 2: FEATURE_GROUPS ------------------------------------------- */
let r2Risk = [], r2OcrHasVesting = 0;
for (const p of reached) {
  const e = lineups.get(p.ack);
  const ft = e && e.features ? e.features : null;
  const hasVestGroup = !!ft && ["vesting", "vestingText"].some((k) => k in ft);
  if (hasVestGroup) continue;        // group already closed today — nothing changes
  r2Risk.push(p);
  if (e && e.ocr) r2OcrHasVesting++;
}
console.log(`READER 2 (FEATURE_GROUPS: ["vesting","vestingText"] is ONE group)`);
console.log(`  of the reached, the vesting group is EMPTY in the store today: ${r2Risk.length} / ${sum(r2Risk).toLocaleString()} readers`);
console.log(`  of those, the stored entry is an OCR parse: ${r2OcrHasVesting}`);
console.log(`  COST ON TODAY'S STORE = 0, AND THE ARGUMENT IS A CONSTRUCTION RATHER THAN A SAMPLE:`);
console.log(`  the group being EMPTY in the store is exactly the statement that the merge produced`);
console.log(`  no vesting value for this ack — so OCR supplied none to merge. Had OCR supplied one,`);
console.log(`  the store would hold it and the group would already be closed, putting the ack in`);
console.log(`  the skipped set above. The cost is therefore 0 for every ack in the population, not`);
console.log(`  0 on a sample of it.`);
console.log(`  STANDING COST: on a FUTURE run where OCR newly reads a page the base cannot, a base`);
console.log(`  vesting value from this arm pre-empts the OCR one. That is production's own stated`);
console.log(`  preference — \`mergeFeatures\` prefers the base on every one of its 16 groups — and it`);
console.log(`  is the same exposure v211's arm took.`);
