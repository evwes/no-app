/* wampo — materialise a script's WHOLE local module graph at a git ref, so a
 * baseline parser can be imported and run beside the working tree's.
 *
 * EXTRACTED from trace-filing.mjs 2026-10-20, unchanged in behaviour, because
 * scripts/parse-replay.mjs needs exactly the same thing over a POPULATION and
 * this record's standing rule is that a shipped construction is sliced or
 * shared, never reproduced from memory — a harness that re-types a mechanism
 * measures the re-typing. Both callers now resolve one copy.
 *
 * The three properties that cost real time to learn, kept with their reasons:
 *
 *  1. THE GRAPH IS WALKED TRANSITIVELY AND EVERY FILE COMES FROM THE SAME REF.
 *     Copying only the entry point and letting a relative import resolve
 *     against the working tree is WORSE than a throw: it silently compares the
 *     baseline's lib-4i against the CURRENT lib-quote and labels the result
 *     with the baseline's ref. A missing file therefore THROWS rather than
 *     falling back — a baseline assembled from two refs is not a baseline.
 *     (v201 added `import … from "./lib-quote.mjs"`, which made every
 *     v201/v202/v203 comparison unrunnable until the walk was transitive.)
 *
 *  2. THE LAYOUT IS <root>/scripts/ WITH THE REPO'S DATA ASSETS SYMLINKED
 *     BESIDE IT, because lib-4i resolves `../sec-funds.json` from its OWN
 *     directory behind an `existsSync`. A bare temp dir makes the baseline run
 *     with NO SEC table while the working tree runs with one, and degrades
 *     silently. Holding the data constant is also the right control for a code
 *     comparison: vary the code, not the corpus.
 *
 *  3. THE CALLER GETS THE DIRECTORY, not an import, so it can import whichever
 *     entry point it needs and so a replay can build several baselines.
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync, mkdtempSync, symlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* the non-code assets lib-4i and its siblings resolve relative to their own
 * directory. `data` carries the lineup and fee shards. */
const ASSETS = ["sec-funds.json", "plans-all.json", "mtias.json",
  "lineups-status.json", "lineups-index.json", "fund-er.js", "sec-tickers.js", "data"];

/**
 * Materialise `entry` and everything it imports from the WORKING TREE, with an
 * optional source mutation applied to one file. Same layout and the same asset
 * symlinks as `materialiseAt`, so the two are comparable by construction.
 *
 * WHY IT EXISTS (v212). A test for a NEW PREDICATE can slice that predicate out
 * of lib-4i's bytes and mutate the slice — `vesting-wholeaccount-test.mjs` does
 * exactly that. A test for a CONTROL-FLOW change cannot: the thing under test is
 * a `continue` inside `extractPlanFeatures`, a 2,500-line function that cannot
 * be lifted out of its file. Without a mutant materialiser such a change ships
 * with no leave-one-out evidence at all, and *a control that cannot fail is
 * decorative*. Written here rather than in the test so the ASSET list and the
 * transitive walk are SHARED and not retyped — property 1 and 2 above are the
 * reasons, and they are no less true for a working-tree copy.
 *
 * `mutate` must CHANGE the file; a mutation that does not land is thrown rather
 * than reported, because a mutant identical to the shipped source passes every
 * assertion vacuously and reads as "this condition is not load-bearing".
 *
 * @param {{file?: string, mutate?: (src: string) => string, label?: string}} [opts]
 * @returns {{dir: string, entryPath: string, files: string[]}}
 */
export function materialiseWorkingTree(entry = "lib-4i.mjs", opts = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), `${opts.label || "wtmut"}-`));
  const dir = path.join(root, "scripts");
  mkdirSync(dir);
  for (const asset of ASSETS) {
    const from = path.join(REPO, asset);
    if (existsSync(from)) symlinkSync(from, path.join(root, asset));
  }
  const target = opts.file || entry;
  let mutated = false;
  const seen = new Set();
  const copy = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    const from = path.join(REPO, "scripts", rel);
    if (!existsSync(from))
      throw new Error(`working tree: scripts/${rel} does not exist. The module graph cannot be assembled.`);
    let src = readFileSync(from, "utf8");
    if (rel === target && opts.mutate) {
      const out = opts.mutate(src);
      if (out === src)
        throw new Error(`the mutation did not land in scripts/${rel} — its target string has moved, and an unmutated mutant passes vacuously`);
      src = out; mutated = true;
    }
    writeFileSync(path.join(dir, rel), src);
    for (const m of src.matchAll(/\bfrom\s+["'](\.\/[^"']+)["']/g)) copy(m[1].slice(2));
    for (const m of src.matchAll(/\bimport\s*\(\s*["'](\.\/[^"']+)["']\s*\)/g)) copy(m[1].slice(2));
  };
  copy(entry);
  if (opts.mutate && !mutated)
    throw new Error(`the mutation target scripts/${target} is not in ${entry}'s module graph — nothing was mutated`);
  return { dir, entryPath: path.join(dir, entry), files: [...seen] };
}

/**
 * Materialise `entry` and everything it imports, at `ref`.
 * @param {string} ref    a git ref (branch, tag or sha)
 * @param {string} entry  a script filename relative to scripts/, e.g. "lib-4i.mjs"
 * @param {{label?: string}} [opts]
 * @returns {{dir: string, entryPath: string, files: string[]}}
 */
export function materialiseAt(ref, entry = "lib-4i.mjs", opts = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), `${opts.label || "refmod"}-`));
  const dir = path.join(root, "scripts");
  mkdirSync(dir);
  for (const asset of ASSETS) {
    const from = path.join(REPO, asset);
    if (existsSync(from)) symlinkSync(from, path.join(root, asset));
  }
  const seen = new Set();
  const fetchAt = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    let src;
    try {
      src = execFileSync("git", ["show", `${ref}:scripts/${rel}`],
        { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    } catch {
      throw new Error(`ref ${ref}: scripts/${rel} does not exist there. The baseline's ` +
        `module graph cannot be assembled, and resolving it against the working tree ` +
        `instead would mix two versions into one "baseline".`);
    }
    writeFileSync(path.join(dir, rel), src);
    for (const m of src.matchAll(/\bfrom\s+["'](\.\/[^"']+)["']/g)) fetchAt(m[1].slice(2));
    for (const m of src.matchAll(/\bimport\s*\(\s*["'](\.\/[^"']+)["']\s*\)/g)) fetchAt(m[1].slice(2));
  };
  fetchAt(entry);
  return { dir, entryPath: path.join(dir, entry), files: [...seen] };
}

/* fetch-4i's confidence predicate, which decides whether a parse PUBLISHES.
 * It is re-implemented here rather than imported because it lives inside
 * fetch-4i.mjs's loop; the two must agree, and `parse-replay.mjs` asserts that
 * agreement against the committed store before it reports anything, which is
 * the control that this copy IS the shipped rule. */
export const isConfident = (p) => !!p && p.found && Array.isArray(p.funds) && p.funds.length >= 3 &&
  (p.ratio || 0) > 0.45 && (p.ratio || 0) < 1.6 &&
  (p.funds.length >= 5 || ((p.ratio || 0) > 0.7 && (p.ratio || 0) < 1.3)) &&
  !p.stmt && !p.trustPtr;
