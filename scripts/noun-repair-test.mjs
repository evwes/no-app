#!/usr/bin/env node
/* THE TETHER FOR merge-4i's LEADING-UNIT-NOUN REPAIR.
 *
 * `shares Fidelity Blue Chip Growth`, `sh. Mutual fund`, `Shares of Dodge and
 * Cox Stock Fund`: the 4i description column holds a unit noun and the fund
 * name follows it. The arm strips the noun when the REMAINDER is attested as
 * another filing's whole name.
 *
 * CI-SAFE BY CONSTRUCTION, which is the property `merge-name-test` lacks. That
 * file reads every pin's verdict off LIVE store attestations and has changed
 * status three times on DOL drift alone — and *a gate that reddens on a
 * refresh with nothing wrong is the habitually-red gate that hid ten
 * `site-test` failures*. So this test SLICES the arm out of the source and
 * supplies its OWN FROZEN attestation map. It never reads the store, so it
 * cannot rot, and it fails only if the arm's behaviour changes.
 *
 * Exit 0 clean, 1 on any failure, 2 if the slice cannot be found.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/* NEVER hardcode the sandbox path: `fund-note-test` died `ENOENT … open
 * '/home/user/no-app/app.js'` on its first CI run doing exactly that, and
 * `map-test`'s hardcoded cwd reported `spawn python3 ENOENT` and hid ten red
 * runs. Resolve from this file's own location. */
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "merge-4i.mjs");

let failures = 0;
const fail = (m) => { console.error(`  FAIL ${m}`); failures++; };

const src = readFileSync(SRC, "utf8");

/* ---- slice the shipped arm, rather than retype it ------------------------
 * *A harness that reproduces a shipped construction from memory measures the
 * memory.* */
const floorM = src.match(/const NOUN_FLOOR = (\d+);/);
const reM = src.match(/const LEAD_UNIT_NOUN = (\/\^.*?\/i);\n/);
const fnStart = src.indexOf("const nounRepair = (name) => {");
if (!floorM || !reM || fnStart < 0) {
  console.error("noun-repair-test: cannot find the arm in merge-4i.mjs — re-read it before trusting this test");
  process.exit(2);
}
const fnEnd = src.indexOf("\n  };", fnStart);
if (fnEnd < 0) { console.error("noun-repair-test: cannot find the end of nounRepair"); process.exit(2); }
const fnSrc = src.slice(fnStart, fnEnd + "\n  };".length);
const NOUN_FLOOR = Number(floorM[1]);

/* ---- THE FROZEN WITNESS -------------------------------------------------
 * Counts, not rows read from disk. Each entry is the number of CONFIDENT
 * entries that file this exact string as a WHOLE stored name, at the time the
 * arm shipped. Freezing it is the whole point: the arm's verdicts are then a
 * function of the code alone. */
const FROZEN = {
  "fidelity blue chip growth": 235,
  "dodge and cox stock fund": 12,
  "mutual fund": 36,
  "registered investment company": 61,
  "american balanced fund r6": 244,
  "target retirement 2045 fund inv": 7,
  "vanguard star fund": 9,
  "stock fund": 13,
  "allocated": 5,          /* ATTESTED and NOT a fund — the floor hazard */
  "fund": 22,              /* likewise, one token */
  "term corp bond idx adm": 0,   /* `SH Term` is SHORT, not shares */
  "in trust": 0,
  "collective fund": 1,
  "class e shares": 40,
};
const nk = (s) => String(s).trim().toLowerCase();
const whole = new Map(Object.entries(FROZEN));

/* build the sliced arm against the frozen map */
const make = (body = fnSrc, floor = NOUN_FLOOR, re = null) => {
  const fn = new Function("whole", "nk", "NOUN_FLOOR", "LEAD_UNIT_NOUN",
    `${body}\n return nounRepair;`);
  return fn(whole, nk, floor, re || eval(reM[1]));
};
const nounRepair = make();

console.log(`noun-repair-test: arm sliced from merge-4i.mjs (floor ${NOUN_FLOOR}), frozen witness of ${whole.size} names`);

/* ---- MUST FIRE: every one a real member, with the figure it carries ----- */
const MUST = [
  ["shares Fidelity Blue Chip Growth", "Fidelity Blue Chip Growth",
   "JM Family Automotive, $105,150,512, 6.49% of its menu"],
  ["Shares of Dodge and Cox Stock Fund", "Dodge and Cox Stock Fund",
   "Employers Mutual Casualty, $57,057,583 — the `of` must be CONSUMED, not tolerated"],
  ["15,575 sh. Mutual fund", "Mutual fund",
   "the leading COUNT plus the abbreviated noun; this row gains FXAIX from its issuer cell"],
  ["299,771 shs American Balanced Fund R6", "American Balanced Fund R6",
   "a comma-grouped count and `shs`"],
  ["13,116 shares of Vanguard Star Fund", "Vanguard Star Fund",
   "count + noun + preposition, all three parts at once"],
  ["sh Stock Fund", "Stock Fund",
   "the bare two-letter `sh`, 134 rows depend on it"],
  ["Shares of Registered Investment Company", "Registered Investment Company",
   "Estee Lauder, $553,288,718, 17.43% — the class's largest row by dollars"],
];
console.log("\nMUST FIRE:");
for (const [s, want, why] of MUST) {
  const got = nounRepair(s);
  if (got !== want) fail(`${JSON.stringify(s)} -> ${JSON.stringify(got)}, want ${JSON.stringify(want)}  (${why})`);
  else console.log(`  ok    ${JSON.stringify(s)} -> ${JSON.stringify(want)}`);
}

/* ---- MUST NOT FIRE: the hazards, each with the reason it is one ---------- */
const MUSTNOT = [
  ["Shares of", "THE QUEUE'S OWN NAMED HAZARD — a holding named after a PREPOSITION. 91.61% of Central City Concern's menu"],
  ["Shares of interest", "one token survives the preposition; American Honda, $229,031,968"],
  ["Shares Allocated", "`Allocated` is ATTESTED FIVE TIMES and is no fund — the floor failure the two-token test exists for"],
  ["Share Balance", "a column header, not a name"],
  ["shs. l", "a single letter"],
  ["SH Term Corp Bond IDX ADM", "`SH` here abbreviates SHORT, not shares — only the WITNESS can tell, no pattern can"],
  ["1,475,016.774 Class E shares", "the noun is TRAILING; Vistra Operations, $406,765,376"],
  ["Shareholder Services Group", "`Share` is the head of a longer word"],
  ["Unit investment trusts", "attested once — below the floor"],
  ["shares Fidelity Nonesuch Imaginary Fund", "a real-looking remainder no other filing attests"],
];
console.log("\nMUST NOT FIRE:");
for (const [s, why] of MUSTNOT) {
  const got = nounRepair(s);
  if (got !== null) fail(`${JSON.stringify(s)} -> ${JSON.stringify(got)}, want null  (${why})`);
  else console.log(`  ok    ${JSON.stringify(s)} refused`);
}

/* ---- SINGLE-PROTECTION MUTATIONS ----------------------------------------
 * *A case protected by two conditions cannot fail for either, so it proves
 * neither.* Each mutation must break EXACTLY its own case and the suite exits
 * 1 if a mutation changes nothing — a control that cannot fail is decorative.
 */
console.log("\nSINGLE-PROTECTION MUTATIONS:");
const MUTATIONS = [
  ["two-token floor",
   (b) => b.replace("if (rest.split(/\\s+/).length < 2) return null;", ""),
   "Shares Allocated", "Allocated",
   "without it, five damaged rows license `Allocated` as a fund name"],
  ["attestation floor",
   (b) => b.replace(/if \(\(whole\.get\(nk\(rest\)\) \|\| 0\) < NOUN_FLOOR\) return null;/, ""),
   "SH Term Corp Bond IDX ADM", "Term Corp Bond IDX ADM",
   "without it, `SH` as an abbreviation of SHORT is stripped off a real fund"],
];
for (const [label, mut, probe, broken, why] of MUTATIONS) {
  const body = mut(fnSrc);
  if (body === fnSrc) { fail(`mutation "${label}" changed NOTHING — the control is decorative and cannot fail`); continue; }
  let got;
  try { got = make(body)(probe); } catch (e) { got = `threw ${e.message}`; }
  if (got !== broken) fail(`mutation "${label}": ${JSON.stringify(probe)} -> ${JSON.stringify(got)}, expected the breakage ${JSON.stringify(broken)}  (${why})`);
  else console.log(`  ok    "${label}" is the ONLY protection for ${JSON.stringify(probe)} (breaks to ${JSON.stringify(broken)})`);
}

/* ---- INVARIANTS the deleted conditions used to state --------------------
 * Two candidates were removed for being unreachable rather than inert, and
 * *a condition unreachable by construction is worse than an inert one: it
 * reads as a guard and is dead code.* What they claimed is asserted here. */
console.log("\nINVARIANTS (the deleted conditions' claims):");
{
  /* (1) the three-letter test: no remainder the arm admits can lack three
   * consecutive letters, because a two-token remainder must be attested ≥3 as
   * a whole filed name. Asserted over a generated sweep rather than argued. */
  let bad = 0;
  for (const [k, n] of Object.entries(FROZEN)) {
    if (n < NOUN_FLOOR) continue;
    for (const lead of ["shares ", "sh. ", "units ", "12,345 shares of "]) {
      const r = nounRepair(lead + k);
      if (r !== null && !/[A-Za-z]{3}/.test(r)) { bad++; console.error(`    ${JSON.stringify(lead + k)} -> ${JSON.stringify(r)} has no three-letter run`); }
    }
  }
  if (bad) fail(`${bad} admitted remainders lack a three-letter run — the deleted condition was NOT unreachable, restore it`);
  else console.log("  ok    no admitted remainder lacks a three-letter run (the deleted test was unreachable)");
}
{
  /* (2) the `/&` second noun: at this stage those rows still carry a type
   * caption in front of the noun, so the anchor cannot reach them. If one ever
   * becomes reachable the residue note in merge-4i is wrong. */
  const probes = ["SHARES/UNITS Fidelity Blue Chip Growth", "SHARES / UNITS Mutual fund"];
  let reach = 0;
  for (const p of probes) if (nounRepair(p) !== null) { reach++; console.error(`    ${JSON.stringify(p)} -> ${JSON.stringify(nounRepair(p))}`); }
  if (reach) fail("a `SHARES/UNITS` form now fires — the deleted branch is reachable and the residue note must be rewritten");
  else console.log("  ok    the `SHARES/UNITS` form is still out of reach at this stage (named residue, not a gap)");
}
{
  /* (3) idempotence: the arm must not chain on its own output, or a name
   * beginning with a real `Share`/`Unit` word could be eaten one token per
   * merge. */
  let bad = 0;
  for (const [s] of MUST) {
    const one = nounRepair(s);
    if (one && nounRepair(one) !== null) { bad++; console.error(`    ${JSON.stringify(s)} -> ${JSON.stringify(one)} -> ${JSON.stringify(nounRepair(one))}`); }
  }
  if (bad) fail(`${bad} results fire a SECOND time — the repair is not idempotent and a later merge would eat more`);
  else console.log("  ok    idempotent: no repaired name fires a second time");
}

console.log(failures ? `\nnoun-repair-test: ${failures} FAILURE(S)` : "\nnoun-repair-test: all checks pass");
process.exit(failures ? 1 : 0);
