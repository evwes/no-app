#!/usr/bin/env node
/* wampo — WARM THE SHARED FILING-TEXT CACHE FOR A LEDGER BUCKET.
 *
 * WHY IT EXISTS. The container restarts and wipes /tmp/wampo-corpus, and every
 * text-level instrument on this record (`notes-gap-census`, `vesting-absent-
 * census`, `vesting-gate-fork`, `tax-flag-gate`, `subsequent-events-size`)
 * then reports `judged 0.0%` — a clean zero that reports on the QUERY, not on
 * the filings. Rebuilding the cache is a real cost that a pass has to budget
 * and report, and the two shipped downloaders embed it inside a census at
 * concurrency 5 (~50 filings/min), so a 5,000-ack bucket costs 100 minutes
 * before one measurement is taken.
 *
 * This does nothing but the download, through `lib-filingtext`'s own `ensure`
 * (shared, never retyped), at a caller-chosen concurrency, and prints progress
 * so a long warm is distinguishable from a stalled one. It selects the SAME
 * populations the censuses select, by reading the ledger rather than a list of
 * acks copied forward.
 *
 * Usage:
 *   node scripts/warm-corpus.mjs <bucket> [--concurrency N] [--limit N]
 * where <bucket> is one of:
 *   vesting-absent   the ledger's "attachment read, no vesting statement found"
 *   match-absent     the ledger's "attachment read, no match statement found"
 *   nofeatures       the shared "no features extracted from the attachment"
 *   all              the union of the three
 *
 * It never parses and never judges: a warmer that also measures hides a
 * download failure inside a finding.
 */
import { buildLedger } from "./lib-ledger.mjs";
import { ensure, CORPUS, seededShuffle } from "./lib-filingtext.mjs";

const argv = process.argv.slice(2);
const BUCKET = argv.find((a) => !a.startsWith("--")) || "vesting-absent";
const num = (flag, dflt) => { const i = argv.indexOf(flag); return i > 0 ? +argv[i + 1] : dflt; };
const CONC = num("--concurrency", 16);
const LIMIT = num("--limit", 0);
const SAMPLE = num("--sample", 0);
const SEED = num("--seed", 20261123);

const WANT = {
  "vesting-absent": (p) => p.cells.vesting.state === "absent" && !p.cells.vesting.why.startsWith("no features"),
  "match-absent": (p) => p.cells.match.state === "absent" && !p.cells.match.why.startsWith("no features"),
  "nofeatures": (p) => p.cells.vesting.state === "absent" && p.cells.vesting.why.startsWith("no features"),
};
/* THE POPULATION A VESTING-QUOTE CHANGE CAN REACH, which is narrower than the
 * universe and is a property of the CHANGE rather than of the filings: every
 * path in `extractPlanFeatures` that sets a vesting LABEL sets `vestingText` in
 * the same statement, and the graded/cliff readers that run BEFORE the
 * immediate loop cause it to be skipped entirely (`if (!out.vesting)`), so a
 * plan whose vesting cell is PUBLISHED cannot keep its label and change its
 * quote through that loop. `absent` and `withheld` are therefore the risk
 * population — and the claim is DISCHARGED rather than trusted, by
 * `vesting-published-sample`, which the differential re-runs unnarrowed. */
WANT["vesting-risk"] = (p) => !p.sf && ["absent", "withheld"].includes(p.cells.vesting.state);
WANT["vesting-published"] = (p) => !p.sf && p.cells.vesting.state === "published";
WANT.all = (p) => WANT["vesting-absent"](p) || WANT["match-absent"](p) || WANT.nofeatures(p);
if (!WANT[BUCKET]) {
  console.error(`warm-corpus: unknown bucket ${BUCKET}; expected one of ${Object.keys(WANT).join(", ")}`);
  process.exit(2);
}

const L = buildLedger({ withStatus: false });
let rows = L.plans.filter((p) => p.ack && WANT[BUCKET](p));
/* Largest readers first, so a warm that is cut short has warmed the part of the
 * bucket that any reader figure is dominated by — and so a partial cache is a
 * FLOOR on readers rather than an arbitrary slice. */
rows.sort((a, b) => b.ppl - a.ppl);
if (LIMIT) rows = rows.slice(0, LIMIT);
/* `--sample N` draws UNIFORMLY from a seed instead, because a top-N warm and a
 * uniform warm answer different questions and this record has paid for mixing
 * them: *RANK to pick what to READ; draw RANDOMLY to estimate a RATE.* A
 * DISCHARGE is a rate question — "can a plan outside the narrowing move at
 * all" — so it must not be fed the largest filings, which are systematically
 * longer and differently written. The seed is printed so the draw can be
 * re-made by anyone checking it. */
if (SAMPLE) {
  rows = seededShuffle(rows, SEED).slice(0, SAMPLE);
  console.log(`uniform draw: ${SAMPLE} of the bucket, seed ${SEED}`);
}
const acks = [...new Set(rows.map((p) => p.ack))];
const ppl = rows.reduce((s, p) => s + p.ppl, 0);
console.log(`warm-corpus ${BUCKET}: ${rows.length} plans / ${ppl.toLocaleString()} readers / ${acks.length} distinct acks`);
console.log(`corpus dir: ${CORPUS}   concurrency: ${CONC}`);

const t0 = Date.now();
const r = await ensure(acks, {
  download: true,
  concurrency: CONC,
  onProgress: (done, total) => {
    const el = (Date.now() - t0) / 1000;
    const rate = done / Math.max(el, 0.001);
    process.stdout.write(`  ${done}/${total}  ${rate.toFixed(1)}/s  eta ${((total - done) / Math.max(rate, 0.001) / 60).toFixed(1)} min\n`);
  },
});
console.log(`\nhad ${r.have}, missing ${r.missing}, fetched ${r.fetched}, failed ${r.failed.length}`);
/* A failure list is a measurement: a filing that cannot be downloaded is a
 * SOURCE gap and a census must count it separately from a filing that parses
 * to nothing. Named, not summarised. */
if (r.failed.length) console.log(`failed acks (first 20): ${r.failed.slice(0, 20).join(" ")}`);
console.log(`elapsed ${((Date.now() - t0) / 60000).toFixed(1)} min`);
