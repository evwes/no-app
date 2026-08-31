#!/usr/bin/env node
/* wampo — diff the working parser against a committed one over the local
 * corpus, BEFORE spending a re-parse on it.
 *
 *   node scripts/diff-parser.mjs <git-ref>      # e.g. HEAD, origin/main
 *
 * Prints gained / lost / changed per feature field, and every changed label,
 * because a label that changes SHAPE is a change even when the totals do not
 * move (Graded -> cliff is invisible to a coverage count — v92 shipped 48 of
 * those on a green verdict).
 */
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const ref = process.argv[2] || "HEAD";
const DIR = process.env.CORPUS_DIR || "/tmp/wampo-corpus";

const tmp = mkdtempSync(path.join(os.tmpdir(), "wampo-diff-"));
const baseline = path.join(tmp, "lib-4i-baseline.mjs");
writeFileSync(baseline, execFileSync("git", ["show", `${ref}:scripts/lib-4i.mjs`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));

const oldLib = await import(baseline);
const newLib = await import("./lib-4i.mjs");
console.log(`baseline ${ref} = v${oldLib.PARSER_VERSION}  ->  working tree = v${newLib.PARSER_VERSION}`);

const files = readdirSync(DIR).filter((f) => f.endsWith(".txt"));
const tally = {};
const changes = [];
for (const f of files) {
  const t = readFileSync(path.join(DIR, f), "utf8");
  if (t.length < 500) continue;
  const a = oldLib.extractPlanFeatures(t) || {}, b = newLib.extractPlanFeatures(t) || {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const av = a[k], bv = b[k];
    if (JSON.stringify(av) === JSON.stringify(bv)) continue;
    const kind = av === undefined ? "gained" : bv === undefined ? "LOST" : "changed";
    (tally[k] ||= { gained: 0, LOST: 0, changed: 0 })[kind]++;
    if (kind !== "gained" && /^(vesting|match)$/.test(k)) {
      changes.push(`${kind === "LOST" ? "LOST   " : "changed"} [${k}] ${f.slice(0, 14)}  ${String(av).slice(0, 60)}  ->  ${String(bv).slice(0, 60)}`);
    }
  }
}
console.log(`\n${files.length} filings compared\n`);
for (const [k, v] of Object.entries(tally).sort()) {
  console.log(`  ${k.padEnd(16)} gained ${String(v.gained).padStart(4)}   changed ${String(v.changed).padStart(4)}   LOST ${String(v.LOST).padStart(4)}`);
}
if (changes.length) {
  console.log("\nevery label change, for reading:");
  for (const c of changes) console.log("  " + c);
}
