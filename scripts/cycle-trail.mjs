#!/usr/bin/env node
/* wampo — ONE LINE PER CYCLE, recording what the LOOP did.
 *
 * WHY THIS EXISTS. This project instruments its outputs exhaustively and its
 * own loop not at all: 640 lines of coverage trail, 5 of ledger trail, and
 * nothing that records a cycle. Two failures already on the record follow
 * directly from that blind spot:
 *
 *   - the daily Routine sat `enabled: false` for SEVENTEEN DAYS and nothing
 *     said so, because the only witness was a scalar that happens to move
 *     slowly. The session-start banner kept printing it as the durable
 *     scheduler the whole time.
 *   - the scalar has read 78.87% for six consecutive days across four DOL
 *     refreshes while cycles kept firing. That may be correct -- the week's
 *     work was row-level, which the scalar deliberately excludes -- but
 *     nothing distinguishes "correctly flat" from "quietly stalled".
 *
 * A loop that cannot see itself is the thing it was built to prevent.
 *
 * EVERY FIELD IS DERIVED. Nothing is typed in and nothing is carried forward
 * by increment, because a count bumped by hand is not a measurement. The
 * inputs are the two existing trails, `git log`, and the accuracy log.
 *
 * THE STALL VERDICT IS THE POINT. A trail nobody reads is a cost, so this
 * prints a verdict rather than a row: when the scalar has not moved for N
 * cycles the honest response is to change something other than the data --
 * the plan, the check, or escalate to the owner -- and the script says so by
 * name. A cycle that ships nothing is a legitimate outcome; a RUN of them
 * that nothing notices is not.
 *
 * Run: node scripts/cycle-trail.mjs [--check] [--since <iso>]
 *   --check   print the verdict, append nothing (for a session to read first)
 */
import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TRAIL = path.join(ROOT, "docs", "cycle-history.jsonl");
const CHECK = process.argv.includes("--check");
const STALL_AT = 3;              // cycles with an unmoved scalar before it is called

const sh = (c) => execSync(c, { cwd: ROOT, encoding: "utf8" }).trim();
const lastLine = (p) => {
  if (!existsSync(p)) return null;
  const ls = readFileSync(p, "utf8").trim().split("\n").filter(Boolean);
  return ls.length ? JSON.parse(ls[ls.length - 1]) : null;
};

/* ---- the three things a cycle can be judged on -------------------------- */

/* 1. THE READER-FACING SCALAR. Read from the ledger trail rather than
 * recomputed: recomputing costs five minutes and would make this script too
 * expensive to run every cycle, which is how an instrument stops being run. */
const ledger = lastLine(path.join(ROOT, "docs", "ledger-history.jsonl"));
const coverage = lastLine(path.join(ROOT, "docs", "coverage-history.jsonl"));

/* 2. WHAT THIS CYCLE SHIPPED, by reading git rather than by being told.
 * Bot commits are excluded: a data commit is the pipeline working, not the
 * loop working, and conflating them is what would let a dead loop look busy. */
const prev = lastLine(TRAIL);
const since = (() => {
  const i = process.argv.indexOf("--since");
  if (i > 0) return process.argv[i + 1];
  return prev ? prev.at : sh("git log -1 --format=%cI HEAD~20 2>/dev/null || git log -1 --format=%cI");
})();
const BOT = /^(Update filed plan data|Regenerate sec-tickers|Update fund facts)/;
const commits = sh(`git log --since="${since}" --format=%s origin/main 2>/dev/null || true`)
  .split("\n").filter(Boolean);
const substantive = commits.filter((s) => !BOT.test(s));

/* 3. WAS IT NEW WORK OR REWORK? A commit whose subject describes fixing our
 * own defect is rework. This is a count keyed on a VOCABULARY and therefore
 * measures the vocabulary -- so it is reported as a HINT with its matches
 * printed, never as a number to steer by. The honest signal is the ratio's
 * direction over many cycles, not any single cycle's value. */
const REWORK = /\bbroke\b|\bwrong\b|\bred\b|\bstale\b|\brefused in writing\b|\bmislabell?ed\b|\bdefect\b|\bwearing\b/i;
const rework = substantive.filter((s) => REWORK.test(s));

/* accuracy-log entries added since the last cycle: defects FOUND, which is a
 * different and better number than defects shipped */
const logAdds = +sh(`git log --since="${since}" --format=%H origin/main -- docs/accuracy-log.md 2>/dev/null | wc -l`) || 0;

const headSha = sh("git rev-parse --short origin/main 2>/dev/null || git rev-parse --short HEAD");
const line = {
  at: new Date().toISOString(),
  head: headSha,
  overall: ledger ? ledger.overall : null,
  addressable: ledger ? ledger.addressable : null,
  confident: coverage ? coverage.confident : null,
  high: coverage ? coverage.high : null,
  pv: coverage ? coverage.pv : null,
  commits: commits.length,
  substantive: substantive.length,
  reworkHint: rework.length,
  accuracyLogTouches: logAdds,
};

/* ---- the verdict, which is the part worth reading ----------------------- */

const hist = existsSync(TRAIL)
  ? readFileSync(TRAIL, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
  : [];
const withNew = hist.concat([line]);
let flat = 0;
for (let i = withNew.length - 1; i > 0; i--) {
  if (withNew[i].overall != null && withNew[i].overall === withNew[i - 1].overall) flat++;
  else break;
}

console.log(`cycle: head ${line.head} · scalar ${line.overall ?? "?"}% · pv ${line.pv ?? "?"} · high ${line.high ?? "?"}`);
console.log(`  commits since last cycle: ${line.commits} (${line.substantive} substantive, ${line.commits - line.substantive} bot)`);
if (rework.length) {
  console.log(`  REWORK HINT — ${rework.length} subject(s) read as fixing our own defect. Read them, do not total them:`);
  for (const s of rework.slice(0, 5)) console.log(`     ${s.slice(0, 92)}`);
}
if (line.substantive === 0) {
  console.log(`  THIS CYCLE SHIPPED NOTHING. That is a legitimate outcome once; a run of them is a stall.`);
}
if (flat >= STALL_AT) {
  console.log(`\n  *** STALL: the scalar has read ${line.overall}% for ${flat + 1} consecutive cycles. ***`);
  console.log(`  The rule this implements: when the number stops moving, change something OTHER`);
  console.log(`  than the data -- the plan, the check, or hand it to the owner. Running the same`);
  console.log(`  cycle shape again is a bug with a budget.`);
  console.log(`  NOTE the scalar is PLAN-LEVEL: row-level work (fees, tickers, returns) cannot move`);
  console.log(`  it by design, so a flat run during row-level work is CORRECT and still worth saying.`);
} else if (flat > 0) {
  console.log(`  scalar unmoved for ${flat + 1} cycle(s) (stall called at ${STALL_AT + 1})`);
}

if (CHECK) { console.log(`\n--check: nothing appended`); process.exit(0); }
appendFileSync(TRAIL, JSON.stringify(line) + "\n");
console.log(`\nappended to docs/cycle-history.jsonl (${hist.length + 1} lines)`);
