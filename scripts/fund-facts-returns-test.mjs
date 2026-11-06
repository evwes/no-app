#!/usr/bin/env node
/* wampo — does `fund-facts-check` actually REFUSE a bad trailing return?
 *
 * The trailing-return fields (r1y / r3y / r5y / r10y) were opened on
 * 2026-11-06 so the fund-facts agent can source the owner's return curve. Until
 * then the validator's closed field whitelist rejected them as unknown fields,
 * so the DATA — not the chart — was the blocker.
 *
 * Opening a field list is the moment to prove the rules bite, because every
 * figure that will ever be published through it arrives afterwards. A validator
 * whose new rules were run once by hand is untested machinery.
 *
 * THE RULE THAT MATTERS MOST is the annualised/cumulative one. A fund's 10-year
 * cumulative return and its 10-year annualised return differ by an order of
 * magnitude (10% annualised over a decade is +159% cumulative), so pasting one
 * into the other's field publishes a wildly wrong number that looks entirely
 * plausible. The per-horizon band plus a required `returnBasis` is what catches
 * it, and the case below is exactly that paste.
 *
 * Runs with no network and writes only inside the OS temp dir.
 * Usage: node scripts/fund-facts-returns-test.mjs      (exit 1 on any failure)
 */
import { writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* NEVER hardcode the sandbox path in anything CI runs — that reports as
 * `spawn ENOENT` and reads like a missing binary. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = path.join(ROOT, "scripts", "fund-facts-check.mjs");
const dir = mkdtempSync(path.join(tmpdir(), "ff-returns-"));
const SRC = "https://example.com/fund";

const base = (extra) => ({
  name: "Test Fund", updated: "2026-11-05",
  er: 0.04, erAsOf: "2026-11-05", erSource: SRC, ...extra,
});
const curve = {
  returnBasis: "annualised",
  r1y: 14.2, r1yAsOf: "2026-10-31", r1ySource: SRC,
  r3y: 9.8, r3yAsOf: "2026-10-31", r3ySource: SRC,
  r5y: 11.4, r5yAsOf: "2026-10-31", r5ySource: SRC,
  r10y: 10.1, r10yAsOf: "2026-10-31", r10ySource: SRC,
};
const less = (k) => Object.fromEntries(Object.entries(curve).filter(([x]) => x !== k));

/* [label, entry, wantExit, wantWarn] */
const CASES = [
  ["a full, sourced, single-date curve PASSES", base(curve), 0, false],
  ["a CUMULATIVE 10y pasted into the annualised field",
    base({ ...curve, r10y: 159.4 }), 1, false],
  ["returnBasis missing entirely", base(less("returnBasis")), 1, false],
  ["returnBasis says cumulative", base({ ...curve, returnBasis: "cumulative" }), 1, false],
  ["a return with no as-of date",
    base({ returnBasis: "annualised", r1y: 14.2, r1ySource: SRC }), 1, false],
  ["a return with no source URL",
    base({ returnBasis: "annualised", r1y: 14.2, r1yAsOf: "2026-10-31" }), 1, false],
  ["an as-of date in the future",
    base({ returnBasis: "annualised", r1y: 14.2, r1yAsOf: "2099-01-01", r1ySource: SRC }), 1, false],
  ["a 10y figure on a fund three years old",
    base({ ...curve, inception: "2023-01-01" }), 1, false],
  ["an unknown horizon field (the whitelist still closes)",
    base({ returnBasis: "annualised", r2y: 5, r2yAsOf: "2026-10-31", r2ySource: SRC }), 1, false],
  /* a WARN and not a failure: a partly refreshed entry is a normal intermediate
   * state, and refusing it would block the very sourcing this field list opens.
   * But a curve drawn across two quotes is not one quote, so it must say so. */
  ["mixed as-of dates across the curve — warns, does not fail",
    base({ ...curve, r5yAsOf: "2026-07-31" }), 0, true],
  /* and the pre-existing fields must be untouched by the widening */
  ["an entry with only er and ytd still passes",
    base({ ytd: 12.7, ytdAsOf: new Date().toISOString().slice(0, 10), ytdSource: SRC }), 0, false],
];

let bad = 0;
for (const [label, entry, wantExit, wantWarn] of CASES) {
  const f = path.join(dir, "f.json");
  writeFileSync(f, JSON.stringify({ _schema: "test", funds: { TEST: entry }, vehicles: {} }));
  let code = 0, out = "";
  try { out = execFileSync("node", [CHECK, f], { encoding: "utf8" }); }
  catch (e) { code = e.status ?? 1; out = String(e.stdout || "") + String(e.stderr || ""); }
  const warned = /\bwarning/.test(out) && !/0 warnings/.test(out);
  const okExit = code === wantExit, okWarn = warned === wantWarn;
  if (okExit && okWarn) console.log(`  ok    ${label}`);
  else {
    bad++;
    console.log(`  FAIL  ${label}`);
    console.log(`        exit ${code} (want ${wantExit}), warned ${warned} (want ${wantWarn})`);
    console.log(`        ${out.trim().split("\n").slice(0, 2).join(" | ").slice(0, 160)}`);
  }
}

/* POSITIVE CONTROL ON THE SUITE ITSELF: the live file must still pass, or the
 * widening broke something that is already published. */
try {
  execFileSync("node", [CHECK], { encoding: "utf8", cwd: ROOT });
  console.log("  ok    the committed data/fund-facts.json still passes");
} catch (e) {
  bad++;
  console.log("  FAIL  the committed data/fund-facts.json no longer passes");
  console.log(`        ${String(e.stdout || e.message).trim().slice(0, 200)}`);
}

console.log(bad ? `\nfund-facts-returns-test: ${bad} FAILURE(S)` : `\nfund-facts-returns-test: ${CASES.length + 1} checks, all pass`);
process.exit(bad ? 1 : 0);
