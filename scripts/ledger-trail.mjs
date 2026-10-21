#!/usr/bin/env node
/* wampo — append ONE line of the field ledger to docs/ledger-history.jsonl.
 *
 * WHY: `lib-ledger.mjs` has existed since 2026-10-06, is imported by nine
 * scripts, reduces "which of the things a reader came for do we know" to one
 * participant-weighted scalar — and was never written to a trail. So nothing in
 * this project could answer "did a week of work move the number", which is the
 * exact question the owner has asked three times. `docs/coverage-history.jsonl`
 * tracks ITEMS (confident lineups, match counts); this tracks FIELDS, weighted
 * by readers, which is the unit the field agents are accountable to.
 *
 * It is a REPORT and never a gate. The merge job calls it with `|| true`: a
 * ledger failure must not stop the pipeline committing new filings.
 *
 * Run: node scripts/ledger-trail.mjs [--print]
 */
import { readFileSync, appendFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLedger, score, PLAN_LEVEL } from "./lib-ledger.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TRAIL = path.join(ROOT, "docs", "ledger-history.jsonl");

const s = score(buildLedger());
const r4 = (x) => (x == null ? null : Math.round(x * 10000) / 100);   // percent, 2dp

/* Flat and short on purpose: one line per run, diffable by eye, and keyed so a
 * field agent can grep its own number out of it without parsing the whole
 * object. `*_gap` is the PARTICIPANT count behind absent+partial — the readers
 * with no answer, which is what ranks the work. */
const line = {
  d: new Date().toISOString().slice(0, 10),
  ppl: s.universePpl,
  overall: r4(s.overall),
  addressable: s.addressable,
};
for (const f of PLAN_LEVEL) {
  const b = s.fields[f];
  line[`${f}_shown`] = r4(b.publishedShareOfPossible);
  line[`${f}_gap`] = b.absent + b.partial;
  line[`${f}_withheld`] = b.withheld;
  line[`${f}_ceiling`] = r4(b.impossibleShareOfUniverse);
}

/* Do not append an identical line twice in a row: the pipeline runs several
 * times a day and a quiet ingest window moves nothing, so an unconditional
 * append would bury the moves that matter under duplicates. Compared with the
 * DATE EXCLUDED, because this record has measured that including a timestamp
 * forces a difference at every midnight for free and inflates a streak by 2.5x. */
const key = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).filter(([k]) => k !== "d")));
let prev = null;
if (existsSync(TRAIL)) {
  const lines = readFileSync(TRAIL, "utf8").trim().split("\n").filter(Boolean);
  if (lines.length) { try { prev = JSON.parse(lines[lines.length - 1]); } catch { /* ignore */ } }
}
const same = prev && key(prev) === key(line);
if (!same) appendFileSync(TRAIL, JSON.stringify(line) + "\n");

console.log(`field ledger: overall ${line.overall}% of knowable cells shown, ` +
  `${line.addressable.toLocaleString()} participant-cells addressable`);
for (const f of PLAN_LEVEL)
  console.log(`  ${f.padEnd(14)} ${String(line[`${f}_shown`]).padStart(5)}% shown   ` +
    `${line[`${f}_gap`].toLocaleString().padStart(11)} readers with no answer` +
    (line[`${f}_withheld`] ? `   (${line[`${f}_withheld`].toLocaleString()} withheld on purpose)` : ""));
console.log(same
  ? `trail: line is byte-identical to the previous one (date excluded) — NOT appended`
  : `trail: line APPENDED to docs/ledger-history.jsonl`);
