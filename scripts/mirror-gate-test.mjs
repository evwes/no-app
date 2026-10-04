/* THE MIRROR GATE'S PLAN-KEYED PATH, EXERCISED AGAINST A REAL DOL REFRESH.
 *
 * WHY THIS EXISTS. `mirror-gate`'s plan-keyed classification is the thing
 * standing between a DOL refresh and an operator reaching for `--force-data`:
 * on 2026-09-30 it turned **7,830 ack-keyed "lost lineups"** into **22 plans
 * that actually stopped being served**, a factor of 356. But that path does
 * NOTHING on a quiet pair — every cycle it prints `+0 gained, -0 lost` and four
 * zeroes — and *a check that prints 0 on a quiet store has not been tested.*
 * Until 2026-10-04 the gate could not be pointed at a historical pair at all:
 * `MIRROR_GATE_MAIN_REF` moved the MAIN side while the BRANCH side was read
 * from disk, so the comment promising reproducibility was true of one half.
 *
 * So this replays the refresh and asserts the five figures the gate's own
 * comment records. If the classification ever drifts — a benign bucket
 * swallowing a real loss, or the trust arm regressing — these numbers move and
 * this test says which bucket.
 *
 * THE NEGATIVE CONTROL IS THE HALF THAT MATTERS, and it is the reason the
 * fixture had to be a refresh: a QUIET pair is also replayed, and it must
 * produce 0 ack losses and 0 of every bucket. A test that only ran the quiet
 * pair would pass against a gate whose plan-keyed code had been deleted
 * outright, which is exactly the failure this file exists to catch.
 *
 * Run: node scripts/mirror-gate-test.mjs
 * It needs the two refs in the local object store; if they are absent it SKIPS
 * with exit 99 rather than passing silently, because a test that cannot reach
 * its fixture must not report success.
 *
 * DELIBERATELY NOT IN CI, and the reason is the fixture: only
 * `fund-facts.yml` sets `fetch-depth: 0`, so `site-test` and `build-data` get
 * a shallow clone that cannot reach 7f553567, and the test would SKIP (exit 99)
 * on every run — a step that always fails is a red gate, and *a red gate is
 * worse than no gate*. Deepening those clones is not free either: this repo's
 * history carries 33 MB plans-all snapshots per data commit. So this runs on
 * demand, before and after any change to mirror-gate's classification, and the
 * commit that changes that classification is expected to cite it.
 *
 * NORMAL-MODE CONTROL, run when this shipped: the gate's output with no env
 * override is BYTE-IDENTICAL to origin/main's copy of the gate, same exit code.
 * A change to a gate has to prove it did not move the gate.
 */
import { execFileSync } from "node:child_process";

/* The 2026-09-30 refresh: +870 plans, found by reading plans-all's own count
 * across every data commit in that window. */
const REFRESH = { before: "7f553567", after: "52a9171f",
  want: { lostAck: 7830, superseded: 7585, wind: 171, shortForm: 82, gone: 1, real: 22, realPpl: 16996 } };
/* Two adjacent commits from a quiet hour on the SAME universe: the control. */
const QUIET = { before: "8b5bad78", after: "869c5f03",
  want: { lostAck: 0, superseded: 0, wind: 0, shortForm: 0, gone: 0, real: 0, realPpl: 0 } };

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

const have = (ref) => {
  try { execFileSync("git", ["cat-file", "-e", `${ref}^{commit}`], { stdio: "ignore" }); return true; }
  catch { return false; }
};
const run = (before, after) => {
  const out = execFileSync("node", ["scripts/mirror-gate.mjs"], {
    encoding: "utf8",
    env: { ...process.env, MIRROR_GATE_MAIN_REF: before, MIRROR_GATE_BRANCH_REF: after },
    maxBuffer: 1 << 28,
  });
  return out;
};
/* mirror-gate exits 2 in replay mode BY DESIGN, so execFileSync throws and the
 * output is on the error. Reading it any other way would mean the replay had
 * exited 0, which is the thing the exit code exists to prevent — so a clean
 * return is itself a FAILURE. */
const replay = (before, after) => {
  try {
    run(before, after);
    return { text: null, code: 0 };
  } catch (e) {
    return { text: `${e.stdout || ""}${e.stderr || ""}`, code: e.status };
  }
};

const num = (text, re) => { const m = text.match(re); return m ? +m[1].replace(/,/g, "") : null; };

for (const [label, pair] of [["2026-09-30 DOL REFRESH", REFRESH], ["a QUIET pair (the control)", QUIET]]) {
  if (!have(pair.before) || !have(pair.after)) {
    console.error(`mirror-gate-test: SKIPPED ${label} — ${pair.before}/${pair.after} not in this clone.`);
    console.error("  A shallow clone cannot reach the fixture. This is a SKIP, not a pass.");
    process.exit(99);
  }
  const { text, code } = replay(pair.before, pair.after);
  ok(code === 2, `${label}: replay exited ${code}, want 2 — a replay that exits 0 can be read as a mirror PASS`);
  if (!text) { fails.push(`${label}: no output captured`); continue; }
  ok(/REPLAY MODE/.test(text), `${label}: the replay banner is missing — an operator could mistake this for a real verdict`);

  const got = {
    lostAck: num(text, /-([\d,]+) lost vs/),
    superseded: num(text, /([\d,]+) superseded by a newer filing/),
    wind: num(text, /([\d,]+) wind-down/),
    shortForm: num(text, /([\d,]+) now short-form/),
    gone: num(text, /([\d,]+) no longer in the universe/),
    real: num(text, /([\d,]+) plan\(s\) \/ [\d,]+ participants actually stop/),
    realPpl: num(text, /[\d,]+ plan\(s\) \/ ([\d,]+) participants actually stop/),
  };
  for (const k of Object.keys(pair.want)) {
    ok(got[k] === pair.want[k], `${label}: ${k} = ${got[k]}, want ${pair.want[k]}`);
  }
  console.log(`${label}: ack -${got.lostAck} -> superseded ${got.superseded}, wind ${got.wind}, `
    + `short-form ${got.shortForm}, gone ${got.gone}, REAL ${got.real} plans / ${got.realPpl} ppl`);
}

/* AND THE CONTROL ON THE CONTROL: the refresh and the quiet pair must not
 * produce the same numbers, or the fixture is not exercising anything. */
ok(REFRESH.want.real !== QUIET.want.real && REFRESH.want.lostAck !== QUIET.want.lostAck,
  "the fixture and the control expect identical figures — the fixture is not a refresh");

if (fails.length) { for (const f of fails) console.error("FAIL " + f); process.exit(1); }
console.log(`\nmirror-gate-test: the plan-keyed path reproduces the 2026-09-30 refresh exactly `
  + `(22 real losses of 7,830 ack losses, a factor of 356) and reads 0 on a quiet pair — 0 failures`);
