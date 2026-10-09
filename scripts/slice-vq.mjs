#!/usr/bin/env node
/* SLICE the quote guards out of lib-quote.mjs VERBATIM and rebuild app.js's
 * browser twin from the bytes of the canonical file.
 *
 *   node scripts/slice-vq.mjs [--check]
 *
 * WHY THIS IS TRACKED, AND WHY IT REPLACES RATHER THAN INSERTS. The twin was
 * first built by a slicer that lived in gitignored `scratchpad/`, and that
 * slicer threw if app.js already carried the twin — so it could create the
 * block once and never update it. Two hazards followed from one file:
 *   (1) the directory is a session artifact and has been wiped twice, so the
 *       only way to regenerate the twin was to rewrite the slicer from memory;
 *   (2) with no re-slice available, the only way to change the twin was to
 *       HAND-EDIT app.js — which is exactly what this project has lost four
 *       browser twins to.
 * `scripts/gen-generic-twin.mjs` had the same lesson the harder way: four
 * predicates sat inside a generated block unsliced, and any run of the
 * generator deleted them.
 *
 * `--check` asserts the committed twin is byte-identical to what a fresh slice
 * would produce and exits 1 otherwise, so CI can catch a hand-edit.
 *
 * No hardcoded sandbox path: a hardcoded cwd once made Node report
 * `spawn python3 ENOENT` in CI and sent the diagnosis at the runner image.
 */
import { readFileSync, writeFileSync } from "node:fs";

const R = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const CHECK = process.argv.includes("--check");
const src = readFileSync(`${R}/scripts/lib-quote.mjs`, "utf8");

const START = "const VQ_RULE_WORD =";
const END = "/* `node scripts/lib-quote.mjs --selftest`";
const a = src.indexOf(START), b = src.indexOf(END);
if (a < 0 || b < 0 || b <= a) throw new Error(`lib-quote slice boundaries not found: a=${a} b=${b}`);
let slice = src.slice(a, b).trimEnd();

/* Assert the SHAPE rather than trusting the offsets: the slice must carry every
 * constant the guard reads and nothing executable from the selftest block. A
 * new constant added to the guard and left outside these boundaries would make
 * the twin throw `ReferenceError` in the browser and nothing else would say so. */
for (const must of ["VQ_RULE_WORD", "VQ_VESTS", "VQ_OTHER_RULE", "export function vestingQuoteOk",
  "AV_FULL", "AV_TRIGGER", "AV_SCHEDULE", "export function accelerationOnlyVesting"])
  if (!slice.includes(must)) throw new Error(`the slice is missing ${must} — it is outside the boundaries`);
if (/--selftest|process\.(argv|exit)|readFileSync/.test(slice))
  throw new Error("the slice reaches into the selftest block");
/* every identifier the sliced code READS must be something the slice DEFINES or
 * the browser provides — the ReferenceError check the generic-twin failure
 * wanted and did not have */
for (const id of (slice.match(/\b(?:VQ|AV|Q)_[A-Z_0-9]+\b/g) || []))
  if (!new RegExp(`const ${id}\\s*=`).test(slice)) throw new Error(`the slice reads ${id} without defining it`);

/* A MODULE `export` IN A CLASSIC SCRIPT BREAKS THE WHOLE FILE, AND
 * `node --check` DOES NOT SAY SO. The first version of this slicer rewrote one
 * export by name; the slice also carries `quoteTrim`, so app.js came out with
 * `export function quoteTrim` inside its IIFE. `node --check` PASSED (it parses
 * as a module) and every browser would have thrown SyntaxError and loaded no
 * app.js at all. Strip EVERY export, and assert none survives — a named rewrite
 * is a rewrite for the exports you remembered. */
slice = slice.replace(/^export (?=(?:function|const|let|class)\b)/gm, "");
if (/^\s*export\b/m.test(slice)) throw new Error("an `export` survived the strip — in a classic script that is a SyntaxError and app.js would not load at all");
/* PROSE DOES NOT SHIP TO BROWSERS. lib-quote.mjs carries ~60 lines of
 * measurement notes per guard, which is where they belong; verbatim-slicing
 * them put 3,571 bytes of commentary into every visitor's download for zero
 * behavioural change. `gen-generic-twin.mjs` already strips prose this way.
 *
 * Only MULTI-LINE block comments go — a trailing `/* ... *\/` on a line of code
 * is often the only thing naming which half of a conjunction a line is, so it
 * stays. And the strip is ASSERTED not to touch code: the non-comment lines
 * must be identical before and after, or this throws. */
const codeLines = (x) => x.split("\n").filter((l) => {
  const t = l.trim();
  return t && !t.startsWith("/*") && !t.startsWith("*") && !t.startsWith("//");
});
const before = codeLines(slice).join("\n");
slice = slice.replace(/^[ \t]*\/\*(?:[^*]|\*(?!\/))*\*\/[ \t]*\n/gm, (m) =>
  m.split("\n").length > 3 ? "" : m);
if (codeLines(slice).join("\n") !== before)
  throw new Error("stripping prose changed a line of CODE — the comment pattern is reaching too far");
const body = slice.split("\n").map((l) => (l.trim() ? "  " + l : l)).join("\n");

const HEAD = `  /* ---- vesting-quote guard ------------------------------------------------
   * CANONICAL COPY: scripts/lib-quote.mjs, which carries the six measurement
   * passes and the five refutations. This is the browser twin, SLICED VERBATIM
   * from that file by scripts/slice-vq.mjs and never typed by hand;
   * scripts/smoke-test.mjs runs both against docs/quote-guard-cases.json and
   * fails when they disagree. Re-slice with \`node scripts/slice-vq.mjs\`;
   * \`--check\` fails when the committed twin has drifted. */
`;
/* The slice reaches past `vestingQuoteOk` to `quoteTrim`, which app.js twins
 * too, so BOTH tethers belong to this one block. They used to be two blocks and
 * the quoteTrim half was hand-written — which is how `--check` found its first
 * drift. */
const TAIL = "  window.__wampoVestingQuoteOk = vestingQuoteOk;   // read by the smoke test only\n"
  + "  window.__wampoAccelOnly = accelerationOnlyVesting; // read by the smoke test only\n"
  + "  window.__wampoQuoteTrim = quoteTrim;             // read by the smoke test only\n";
const twin = HEAD + body + "\n" + TAIL;

const app = readFileSync(`${R}/app.js`, "utf8");
const s = app.indexOf("  /* ---- vesting-quote guard");
const ENDLINE = "  window.__wampoQuoteTrim = quoteTrim;             // read by the smoke test only\n";
const e = app.indexOf(ENDLINE);
if (s < 0) throw new Error("app.js carries no vesting-quote twin to replace — run the first insertion by hand, once");
if (e < s) throw new Error("app.js's twin tail sits before its head — the block boundaries are not what this expects");
const current = app.slice(s, e + ENDLINE.length);

if (CHECK) {
  if (current === twin) { console.log("slice-vq --check: app.js's vesting-quote twin is byte-identical to a fresh slice"); process.exit(0); }
  console.error("slice-vq --check FAILED: app.js's vesting-quote twin has DRIFTED from scripts/lib-quote.mjs.");
  console.error("  Run `node scripts/slice-vq.mjs` and commit app.js (and re-run scripts/stamp-assets.mjs).");
  process.exit(1);
}
if (current === twin) { console.log("slice-vq: already identical, app.js untouched"); process.exit(0); }
writeFileSync(`${R}/app.js`, app.slice(0, s) + twin + app.slice(e + ENDLINE.length));
console.log(`slice-vq: twin re-sliced, ${body.split("\n").length} lines verbatim from lib-quote.mjs`);
