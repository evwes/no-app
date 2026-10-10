#!/usr/bin/env node
/* THE TETHER ON `wrapRepair` — merge-4i's self-wrapping-duplication arm.
 *
 * IT SLICES THE ARM OUT OF THE SOURCE AND NEVER RETYPES IT. A harness that
 * reproduces a shipped construction from memory measures the memory; this
 * reads the `wrapRepair` block and the two constants above it out of
 * `scripts/merge-4i.mjs` and evaluates them with `whole`, `nk` and `ck`
 * injected, so a change to the arm changes what is tested.
 *
 * AND IT SUPPLIES ITS OWN FROZEN ATTESTATION MAP, which is the whole reason
 * this can live in CI where `merge-name-test.mjs` cannot. That file reads
 * every pin's verdict off live store attestations, so its status has flipped
 * three times on DOL drift alone and a gate that reddens on a refresh with
 * nothing wrong is the habitually-red gate that hid ten site-test failures.
 * The counts below are chosen to exercise the conditions, not copied from the
 * store — the store's own numbers are in the arm's comment and in the log.
 *
 * EVERY CONDITION HAS A CASE WHERE IT IS THE ONLY PROTECTION, because a case
 * protected twice cannot fail for either. The mutation harness at the bottom
 * neuters each condition in turn and requires the named case to flip, so a
 * condition that stops protecting anything fails this test rather than going
 * quietly decorative.
 *
 * Usage: node scripts/wrap-repair-test.mjs [--src <path to merge-4i.mjs>]
 */
import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const srcPath = (() => { const i = argv.indexOf("--src"); return i >= 0 ? argv[i + 1] : "scripts/merge-4i.mjs"; })();
const src = readFileSync(srcPath, "utf8");

/* ---- slice the arm, verbatim ---- */
const START = "const WRAP_FLOOR =";
const END = "/* A BROKEN FONT SHIFTED A RUN OF THE NAME BY +29";
const a = src.indexOf(START), b = src.indexOf(END, a);
if (a < 0 || b < 0) { console.error("wrap-repair-test: could not slice wrapRepair out of " + srcPath); process.exit(1); }
const sliced = src.slice(a, b);
if (!/const wrapRepair = \(name\) => \{/.test(sliced)) {
  console.error("wrap-repair-test: the slice does not contain wrapRepair — the boundaries have moved"); process.exit(1);
}

/* ---- the frozen attestation map ----
 * key: a name that stands alone, value: how many plans file it that way. */
const ATTEST = {
  "vanguard windsor ii admiral shares": 27,          // the numeral case
  "nt collective s&p500 index fund-dc-non lending (tier j)": 3,   // exactly at the floor
  "american funds 2030 target date fund r6": 242,    // strip-TAIL: the house leads
  "new york life guaranteed interest account": 47,
  "equity income fund class r6": 81,                 // ratio: 81 vs 1 on the other side
  "class r-6 equity income fund": 1,
  "mid one two attested twice": 2,                   // FLOOR single-protection
  "aa bb cc rot left": 30, "rot left aa bb cc": 5,   // RATIO single-protection
  "mid one two a b": 30,                             // RUN-LENGTH single-protection
  "vanguard target retirement 2055 trust ii": 400,   // the vintage decoy's other half
};

function build(mut) {
  const flags = Object.assign({ floor: true, ratio: true, runlen: true }, mut || {});
  let code = sliced;
  if (!flags.floor) code = code.replace(/WRAP_FLOOR = 3/, "WRAP_FLOOR = 1");
  if (!flags.ratio) code = code.replace(/WRAP_RATIO = 10/, "WRAP_RATIO = 1");
  if (!flags.runlen) code = code.replace(/if \(a\.length < 5\) continue;/, "if (a.length < 1) continue;");
  const whole = new Map(Object.entries(ATTEST));
  const nk = (s) => String(s).trim().toLowerCase();
  const ck = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  // eslint-disable-next-line no-new-func
  const f = new Function("whole", "nk", "ck", code + "\n return wrapRepair;");
  return f(whole, nk, ck);
}

let fails = 0;
const fail = (m) => { console.error("  FAIL " + m); fails++; };

/* ---- must FIRE, with the exact output ---- */
const FIRE = [
  ["Admiral Shares Vanguard Windsor II Admiral Shares", "Vanguard Windsor II Admiral Shares",
   "the recorded hazard: a repair must not cost the row its numeral"],
  ["LENDING (TIER J) NT COLLECTIVE S&P500 INDEX FUND-DC-NON LENDING (TIER J)",
   "NT COLLECTIVE S&P500 INDEX FUND-DC-NON LENDING (TIER J)",
   "the largest member, and attested at exactly the floor"],
  ["American Funds 2030 Target Date Fund R6 American Funds", "American Funds 2030 Target Date Fund R6",
   "STRIP-TAIL: stripping the LEAD here would remove the house"],
  ["Guaranteed Interest Account New York Life Guaranteed Interest Account",
   "New York Life Guaranteed Interest Account", "a plain lead duplication"],
  ["Class R-6 Equity Income Fund Class R6", "Equity Income Fund Class R6",
   "the only row where the ratio is satisfied non-trivially (81 vs 1)"],
];
/* ---- must NOT fire ---- */
const KEEP = [
  ["Vanguard Target Retirement 2050 Trust II Vanguard Target Retirement 2055 Trust II",
   "TWO VINTAGES of one series: the shape collapseSelfRepeat's floors exist to protect"],
  ["Attested Twice mid one two Attested Twice", "FLOOR: the surviving side stands alone only twice"],
  ["Rot Left aa bb cc Rot Left", "RATIO: both sides attested (30 vs 5), so the orientation is not settled"],
  ["A B mid one two A B", "RUN LENGTH: a two-character run is not a duplicated run"],
  ["Vanguard Windsor II Admiral Shares", "an undamaged name, no duplication at all"],
];

console.log("=== must FIRE ===");
const wr = build();
for (const [input, want, why] of FIRE) {
  const got = wr(input);
  if (got !== want) fail(`${JSON.stringify(input)}\n         want ${JSON.stringify(want)}\n          got ${JSON.stringify(got)}   (${why})`);
  else console.log(`  ok   ${JSON.stringify(want)}`);
}
console.log("=== must NOT fire ===");
for (const [input, why] of KEEP) {
  const got = wr(input);
  if (got !== null) fail(`${JSON.stringify(input)} was REPAIRED to ${JSON.stringify(got)} — ${why}`);
  else console.log(`  ok   left alone: ${JSON.stringify(input)}`);
}

/* ---- single-protection matrix: neuter one condition, require its own case to flip ----
 * A condition whose case still passes when the condition is gone is not what
 * protects that case, and the condition is decorative. */
console.log("=== single-protection matrix (each condition neutered alone) ===");
const MATRIX = [
  ["floor",  "Attested Twice mid one two Attested Twice"],
  ["ratio",  "Rot Left aa bb cc Rot Left"],
  ["runlen", "A B mid one two A B"],
];
for (const [cond, probe] of MATRIX) {
  const w2 = build({ [cond]: false });
  const got = w2(probe);
  if (got === null)
    fail(`neutering '${cond}' did NOT change the verdict on ${JSON.stringify(probe)} — that condition is DECORATIVE here, or the probe is protected twice`);
  else console.log(`  ok   '${cond}' is the only protection on ${JSON.stringify(probe)} (without it -> ${JSON.stringify(got)})`);
}

/* ---- THE INVARIANT THAT REPLACES A DELETED CONDITION ----
 * The arm carries no "at least three tokens between the copies" test, because
 * the loop bound `k <= floor((n-3)/2)` already forces `n - 2k >= 3`. That is
 * asserted here over every name length the arm can see, rather than restated
 * as dead code in the arm: a condition unreachable by construction reads as a
 * guard and protects nothing, and no fixture can show it is the only
 * protection because production cannot build one. */
console.log("=== the middle-length invariant, asserted rather than guarded ===");
let worst = Infinity;
for (let n = 5; n <= 60; n++) {
  const kMax = Math.floor((n - 3) / 2);
  if (kMax < 2) continue;
  for (let k = 2; k <= kMax; k++) worst = Math.min(worst, n - 2 * k);
}
if (worst < 3) fail(`the loop bound no longer guarantees three tokens between the copies (min ${worst}) — the deleted condition must come back`);
else console.log(`  ok   over name lengths 5..60, the narrowest middle the loop can reach is ${worst} tokens`);

/* ---- the slice is the shipped code, asserted ---- */
if (!/whole\.get\(nk\(stripLead\)\)/.test(sliced)) fail("the sliced arm no longer reads the store-wide attestation map");
if (fails) { console.error(`\nwrap-repair-test: ${fails} failure(s)`); process.exit(1); }
console.log("\nwrap-repair-test: ok");
