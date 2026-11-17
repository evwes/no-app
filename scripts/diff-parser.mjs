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
 *
 * THIS SCRIPT THREW `ERR_MODULE_NOT_FOUND` ON EVERY RUN FROM v201 TO v205 AND
 * NOTHING SAID SO. It copied ONE file out of the git ref and let the copy's
 * relative imports resolve wherever they fell; v201 added
 * `import … from "./lib-quote.mjs"` to lib-4i, so the baseline could no longer
 * be loaded at all and the ONLY tracked features differential in the repo was
 * unrunnable for five parser versions — exactly the failure `lib-refmod.mjs`
 * was extracted to prevent, fixed there for `trace-filing` and `parse-replay`
 * and never here. *A shared mechanism fixes only the callers that adopt it.*
 * Found 2026-11-17 by reaching for this tool for a features change and getting
 * a stack trace; the whole module graph now comes from the ref.
 *
 * NOTE WHAT THIS CANNOT SEE, since the alternative keeps being reached for:
 * `parse-replay.mjs` replays `parse4i` and is BLIND to every feature field, so
 * a features change measured there prints 0 lost by construction. This is the
 * instrument for features; that one is the instrument for menus.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { materialiseAt } from "./lib-refmod.mjs";

const ref = process.argv[2] || "HEAD";
const DIR = process.env.CORPUS_DIR || "/tmp/wampo-corpus";

const base = materialiseAt(ref, "lib-4i.mjs", { label: "wampo-diff" });
const oldLib = await import(base.entryPath);
const newLib = await import("./lib-4i.mjs");
console.log(`baseline ${ref} = v${oldLib.PARSER_VERSION}  ->  working tree = v${newLib.PARSER_VERSION}`);
console.log(`  baseline graph: ${base.files.join(", ")}`);

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
