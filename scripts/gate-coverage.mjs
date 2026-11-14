#!/usr/bin/env node
/* wampo — DOES EVERY GATE ACTUALLY RUN, AND CAN THE FILES IT GUARDS TRIGGER IT?
 *
 * Three defects of exactly this shape were found in one week, none by a test:
 *
 *   `ledger-test.mjs` runs in NO workflow. It is the suite over `lib-ledger`,
 *   the project's single objective function, and CI has never executed it —
 *   which is how a pin that ASSERTED the 2R defect survived while that defect
 *   overstated one field by 8,549,974 readers.
 *
 *   `stamp-assets.mjs` was missing from `site-test.yml`'s `paths` filter. The
 *   cache-buster's own gate could not be started by the cache-buster — the
 *   gate standing over the seventeen-day staleness the owner reported as
 *   "nothing is updated in wampo".
 *
 *   `merge-name-test.mjs` is deliberately out of CI (it reads pins off the
 *   live store and a DOL refresh flips its verdicts — a habitually-red gate is
 *   what hid ten consecutive site-test failures). That is the right call, and
 *   its cost is that nothing ran it, so a missing `vm` binding left the
 *   sec-tickers key-set refusal inert over 18,093 keys, announcing its own
 *   stand-down 23 times into a log nobody read.
 *
 * So this reports three things, and the third is the one no eye catches:
 *
 *   A  ORPHAN      a gate script no workflow runs at all
 *   B  UNTRIGGERABLE  a gate whose workflow has a `paths` filter that does not
 *                     list the gate's own file
 *   C  BLIND SPOT  a gate whose workflow cannot be triggered by a file the gate
 *                  TRANSITIVELY IMPORTS — the import graph is the honest
 *                  trigger set, and it refutes itself the moment an import is
 *                  added. This is the one that found `lib-af-abbrev.mjs`.
 *
 * ALLOWLIST, NOT SILENCE. A deliberate exclusion is declared here by name with
 * its reason, so "not in CI" stays a decision somebody made rather than a
 * thing that drifted. An allowlisted entry is still PRINTED, just not failed
 * on — *a suppression that hides its own population is how a gate goes
 * decorative*.
 *
 * Exit 0 clean, 1 on any unallowlisted finding. Reads only; no network.
 * Usage: node scripts/gate-coverage.mjs [--verbose]
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WFDIR = path.join(ROOT, ".github", "workflows");
const VERBOSE = process.argv.includes("--verbose");

/* Deliberate exclusions. Each needs a REASON, and the reason is the record's. */
const ALLOW_ORPHAN = {
  "merge-name-test.mjs":
    "store-coupled by design — reads every pin off the live store and has flipped on DOL drift three times; a gate that reddens on a refresh with nothing wrong is the habitually-red gate that hid ten site-test failures. Its CI-safe siblings (wrap-repair-test, noun-repair-test) slice the arm and supply a FROZEN attestation map.",
  "deploy-check.mjs":
    "not a CI gate — invoked by scripts/mirror.sh (line 220) after a mirror, to block until Pages actually serves the commit. It is the deployment watcher, and running it on a push would mean nothing.",
  "mirror-gate.mjs":
    "not a CI gate — invoked by scripts/mirror.sh (line 92) as the mirror's own refusal. Running it on a push would compare a branch against itself.",
  "mirror-gate-test.mjs":
    "needs commits absent from a shallow CI clone; exits 99 as a self-declared SKIP. NOT benign — it means the mirror gate's negative controls are exercised nowhere, and that is a real hole, recorded rather than hidden.",
  "sitetest-gate.mjs":
    "not a CI gate — invoked by scripts/mirror.sh before the push, to refuse a mirror whose site-test verdict is red or unknown. It reads the GitHub API for the branch's runs, so on a push it would be asking about the very run that is asking. UNLIKE mirror-gate-test, its negative controls are NOT orphaned: `--selftest` is pure, takes a literal runs array, and IS a step in site-test.yml, so all nine refusals and allowances are exercised on every frontend push.",
};

/* Workflows whose narrow trigger is a DELIBERATE cost decision. Their findings
 * are PRINTED but not failed on — a suppression that hides its own population
 * is how a gate goes decorative, so the count stays visible and a change in it
 * is readable. */
const ALLOW_WORKFLOW = {
  "build-data.yml":
    "its paths filter is deliberately the six files that justify a 1.5-to-4-hour re-parse; a push to a library or a test must not fire one. The libraries it imports carry their own gates in site-test.yml, which IS startable by them -- what is missing is only the re-run of the pipeline consumer, and that is the cost decision itself.",
};

/* ---------- the gates ----------
 * TWO POPULATIONS, UNIONED, AND THE SECOND IS THE LOAD-BEARING ONE.
 *
 * A name-shape list alone (-test/-gate/-check) is a count keyed on a CHARACTER
 * SHAPE, and it measures the shape. `stamp-assets.mjs` is the cache-buster's
 * gate, matches none of those suffixes, and is exactly the file whose absence
 * from a paths filter this instrument exists to catch — a first version keyed
 * only on the suffix printed a clean "(none)" with that very defect injected.
 * So the triggerability checks run over EVERY script any workflow invokes,
 * whatever it is called, and the orphan check runs over the name-shaped set
 * (a non-test script that no workflow runs is not a finding — plenty of
 * scripts are tools, run by hand or by mirror.sh). */
const GATE_RE = /-(test|gate|check)\.mjs$/;
const named = readdirSync(path.join(ROOT, "scripts")).filter((f) => GATE_RE.test(f));

/* ---------- what each workflow runs, and what can trigger it ---------- */
/* Deliberately a line scan rather than a YAML parse: the question is "does this
 * workflow's text invoke this script", and a parser would need the schema to
 * stay in step with every future workflow shape. A miss here is a FALSE CLEAN,
 * so the control below asserts the scan finds a known-present invocation. */
const workflows = {};
for (const f of readdirSync(WFDIR).filter((f) => /\.ya?ml$/.test(f))) {
  const text = readFileSync(path.join(WFDIR, f), "utf8");
  const runs = new Set();
  for (const m of text.matchAll(/node\s+(?:--[\w=-]+\s+)*scripts\/([\w.-]+\.mjs)/g)) runs.add(m[1]);
  /* The `paths:` filter. THESE ARE YAML FLOW SEQUENCES, not block sequences:
   * `paths: ["app.js", "index.html", ...]` spanning dozens of lines with `#`
   * comments interleaved. A first version expected `- item` lines, extracted
   * NOTHING, set hasFilter=false, and silently skipped checks B and C on the
   * only workflows that have a filter — printing a clean "(none)" with two
   * injected defects live. So: walk from `paths:` accumulating comment-stripped
   * lines until the bracket balances, then take the quoted strings. */
  const paths = new Set();
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*paths:\s*\[/.test(lines[i])) continue;
    let acc = "", depth = 0;
    for (let j = i; j < lines.length; j++) {
      const bare = lines[j].replace(/#.*$/, "");
      acc += bare + "\n";
      for (const ch of bare) { if (ch === "[") depth++; else if (ch === "]") depth--; }
      if (depth <= 0 && acc.includes("[")) break;
    }
    for (const m of acc.matchAll(/["']([^"']+)["']/g)) paths.add(m[1]);
  }
  workflows[f] = { runs, paths, hasFilter: paths.size > 0, text };
}

/* CONTROL: the scan must find something known to be there. A regex that matches
 * nothing would print a perfectly clean report. */
const allRuns = new Set(Object.values(workflows).flatMap((w) => [...w.runs]));
if (!allRuns.has("smoke-test.mjs")) {
  console.error("SCAN CONTROL FAILED: the invocation scan did not find smoke-test.mjs, which site-test.yml certainly runs. The report below would be a false clean.");
  process.exit(1);
}
if (allRuns.size < 10) {
  console.error(`SCAN CONTROL FAILED: only ${allRuns.size} script invocations found across ${Object.keys(workflows).length} workflows.`);
  process.exit(1);
}

/* ---------- transitive imports, within scripts/ ---------- */
const importCache = new Map();
function importsOf(file) {
  if (importCache.has(file)) return importCache.get(file);
  const out = new Set();
  importCache.set(file, out);                       // cycle guard, set before recursing
  const p = path.join(ROOT, "scripts", file);
  if (!existsSync(p)) return out;
  const src = readFileSync(p, "utf8");
  for (const m of src.matchAll(/from\s+["']\.\/([\w.-]+\.mjs)["']/g)) {
    out.add(m[1]);
    for (const d of importsOf(m[1])) out.add(d);
  }
  return out;
}

/* does a paths filter cover a given repo-relative file? */
const covers = (paths, rel) => {
  for (const p of paths) {
    if (p === rel) return true;
    if (p.endsWith("/**") && rel.startsWith(p.slice(0, -2))) return true;
    if (p.endsWith("/*") && path.dirname(rel) === p.slice(0, -2)) return true;
  }
  return false;
};

/* ---------- the three findings ---------- */
const orphans = [], untriggerable = [], blind = [];
/* orphan check: name-shaped scripts only */
for (const g of named.sort()) if (!Object.values(workflows).some((w) => w.runs.has(g))) orphans.push(g);
/* TRIGGERABILITY IS A QUESTION ABOUT THE SCRIPT, NOT ABOUT EACH WORKFLOW.
 *
 * A script run by two workflows is covered if EITHER can be started by it.
 * Asking it per-workflow reported 19 findings, every one of them
 * `build-data.yml`, whose 6-file filter is deliberate and documented: a push
 * to a test file must NOT trigger a 1.5-to-4-hour re-parse. Failing on that
 * would make this exactly the habitually-red gate the record blames for hiding
 * ten consecutive site-test failures. So the finding is only raised when NO
 * workflow that runs the script can be started by it — i.e. the change is
 * genuinely unverified anywhere. */
const invoked = [...allRuns].sort();
const startableBy = (g, file) => Object.entries(workflows)
  .some(([, w]) => w.runs.has(g) && (!w.hasFilter || covers(w.paths, file)));
for (const g of invoked) {
  const hosts = Object.entries(workflows).filter(([, w]) => w.runs.has(g)).map(([wf]) => wf);
  if (!startableBy(g, `scripts/${g}`)) untriggerable.push({ g, wf: hosts.join(", ") });
  const missing = [...importsOf(g)].filter((d) => !startableBy(g, `scripts/${d}`)).sort();
  if (missing.length) blind.push({ g, wf: hosts.join(", "), missing });
}

let bad = 0;
const head = (s) => console.log(`\n${s}`);

head(`GATES: ${named.length} name-shaped gate scripts; ${allRuns.size} scripts invoked by ${Object.keys(workflows).length} workflows (triggerability is checked over the INVOKED set, not the named one)`);

head("A — ORPHANS: run by no workflow");
for (const g of orphans) {
  const why = ALLOW_ORPHAN[g];
  if (why) console.log(`  allowed  ${g}\n           ${why}`);
  else { bad++; console.log(`  ORPHAN   ${g}  — exists, tests something, and CI never runs it`); }
}
if (!orphans.length) console.log("  (none)");

for (const [w, why] of Object.entries(ALLOW_WORKFLOW))
  console.log(`\n  allowlisted workflow ${w}: ${why}`);

head("B — UNTRIGGERABLE: the gate's own file is not in its workflow's paths filter");
for (const { g, wf } of untriggerable) {
  const ok = wf.split(", ").every((w) => ALLOW_WORKFLOW[w]);
  if (!ok) bad++;
  console.log(`  ${ok ? "noted  " : "FINDING"}  scripts/${g} — run by ${wf}, and no workflow that runs it can be started by it`);
}
if (!untriggerable.length) console.log("  (none)");

head("C — BLIND SPOTS: a file the gate IMPORTS cannot start the job that runs it");
for (const { g, wf, missing } of blind) {
  const ok = wf.split(", ").every((w) => ALLOW_WORKFLOW[w]);
  if (!ok) bad++;
  console.log(`  ${ok ? "noted  " : "FINDING"}  ${g} (run by ${wf}) imports ${missing.length} file(s) that can start no job running it`);
  for (const m of missing) console.log(`            scripts/${m}`);
}
if (!blind.length) console.log("  (none)");

if (VERBOSE) {
  head("coverage map");
  for (const [wf, w] of Object.entries(workflows))
    console.log(`  ${wf.padEnd(22)} runs ${String(w.runs.size).padStart(2)}  paths ${w.hasFilter ? w.paths.size : "none (any push)"}`);
}

console.log(bad
  ? `\ngate-coverage: ${bad} finding(s) — a gate that cannot be started by what it guards is indistinguishable from no gate`
  : `\ngate-coverage: every gate runs somewhere and every one can be started by what it guards`);
process.exit(bad ? 1 : 0);
