#!/usr/bin/env node
/* THE TETHER ON `ticker-conflict`'s TWO SUPPRESSIONS — audit-data.mjs.
 *
 * IT SLICES THE GUARD OUT OF THE SOURCE AND NEVER RETYPES IT, for the reason
 * `wrap-repair-test.mjs` does: a harness that reproduces a shipped
 * construction from memory measures the memory. A change to
 * `conflictSuppressed` changes what this tests.
 *
 * AND IT SUPPLIES ITS OWN FROZEN CORROBORATION MAP rather than asking
 * sec-funds.json, so a DOL/SEC refresh cannot redden it. `wrap-repair-test`
 * records why that matters: a gate that goes red on a refresh with nothing
 * wrong is the habitually-red gate that hid ten consecutive site-test
 * failures. The real registry is exercised in production; what is pinned here
 * is the guard's LOGIC.
 *
 * EVERY CONDITION HAS A CASE WHERE IT IS THE ONLY PROTECTION, and here that
 * holds BY CONSTRUCTION rather than by choice: the INDEX cases carry no
 * parenthetical at all, so suppression B cannot reach them, and the welded
 * CMTFX case did not fire the leading-bare arm, so suppression A cannot reach
 * it. The mutation harness at the bottom neuters each in turn and requires its
 * own case to flip, so a condition that stops protecting anything fails this
 * test rather than going quietly decorative.
 *
 * THE FAIL-OPEN CASE IS TESTED TOO, and it is the one that matters most: if
 * the registry index cannot be built, suppression A must suppress NOTHING. An
 * arm that cannot fire is worse than an absent one, and pointed at a check it
 * would silently empty the findings list while the log still looked healthy.
 *
 * Usage: node scripts/ticker-conflict-test.mjs [--src <path to audit-data.mjs>]
 */
import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const srcPath = (() => { const i = argv.indexOf("--src"); return i >= 0 ? argv[i + 1] : "scripts/audit-data.mjs"; })();
const src = readFileSync(srcPath, "utf8");

/* ---- slice the guard, verbatim ---- */
const START = "const CONFLICT_PARENS =";
const END = "const d = JSON.parse(";
const a = src.indexOf(START), b = src.indexOf(END, a);
if (a < 0 || b < 0) { console.error("ticker-conflict-test: could not slice the guard out of " + srcPath); process.exit(1); }
const sliced = src.slice(a, b);
for (const need of ["const conflictSuppressed =", "uncorroborated-lead", "row-names-our-own-symbol"]) {
  if (!sliced.includes(need)) {
    console.error(`ticker-conflict-test: the slice does not contain ${JSON.stringify(need)} — the boundaries have moved`);
    process.exit(1);
  }
}

/* ---- the frozen corroboration map ----
 * key: a filed name, value: what the SHIPPED `resolveFiledTicker` returns for
 * it. The two INDEX entries are null because `INDEX` is registered to CYBER
 * HORNET TRUST's `CYBER HORNET S&P 500(R)`, which shares no content word with
 * a Fidelity index fund's name; the two symbol-led entries corroborate. These
 * were read off the real resolver on 2026-11-08 and are frozen here. */
const CORROBORATE = {
  "INDEX 2040 INSTL PREM FIDELITY MID CAP INDEX": null,
  "INDEX Company FIDELITY US BOND INDEX": null,
  "INDEX FD - AI": null,
  "FXAIX Fidelity 500 Index Fund": "FXAIX",
  "DODGX Dodge & Cox Stock Fund": "DODGX",
};

function build(mut) {
  const flags = Object.assign({ corro: true, paren: true, index: true }, mut || {});
  let code = sliced;
  /* neuter A: make the corroboration always agree */
  if (!flags.corro) code = code.replace("if (__filedTk && corro !== filed) return \"uncorroborated-lead\";", "void corro;");
  /* neuter B: make the parenthetical scan never match */
  if (!flags.paren) code = code.replace("if (p[1] === gotTk) return \"row-names-our-own-symbol\";", "void p;");
  for (const [tok, repl] of [["if (__filedTk && corro !== filed)", "void corro;"], ["if (p[1] === gotTk)", "void p;"]]) {
    if (!flags.corro && tok.includes("corro") && code.includes(tok)) {
      console.error("ticker-conflict-test: the A-mutation did not apply — its anchor has moved"); process.exit(1);
    }
    if (!flags.paren && tok.includes("gotTk") && code.includes(tok)) {
      console.error("ticker-conflict-test: the B-mutation did not apply — its anchor has moved"); process.exit(1);
    }
    void repl;
  }
  /* the index: available (frozen map) or unbuildable (fail-open path) */
  const buildIndex = () => (flags.index ? { byTicker: new Map([["x", 1]]) } : (() => { throw new Error("no index"); })());
  const resolveFiledTicker = (_idx, s) => {
    if (!Object.prototype.hasOwnProperty.call(CORROBORATE, s))
      throw new Error(`ticker-conflict-test: no frozen corroboration for ${JSON.stringify(s)} — add it or the test is measuring a guess`);
    return CORROBORATE[s];
  };
  const console_ = { log: () => {} };
  // eslint-disable-next-line no-new-func
  const f = new Function("buildIndex", "resolveFiledTicker", "console", "URL", "import_meta_url",
    code.replace("new URL(\"../sec-funds.json\", import.meta.url)", "\"sec-funds.json\"") +
    "\n return { conflictSuppressed, filedTkCorroborated };");
  return f(buildIndex, resolveFiledTicker, console_, URL, "");
}

let fails = 0;
const fail = (m) => { console.error("  FAIL " + m); fails++; };

/* ---- MUST SUPPRESS: this check's own artifacts, all six read against their
 * filings on 2026-11-08 ---- */
const SUPPRESS = [
  // [name, leadBare, filed, publishedTk, expected reason, why]
  ["INDEX 2040 INSTL PREM FIDELITY MID CAP INDEX", true, "INDEX", "FSMDX", "uncorroborated-lead",
    "Hinge Health: the filing's row is FIDELITY MID CAP INDEX at $3,213,804; INDEX is the previous row's wrapped continuation"],
  ["INDEX Company FIDELITY US BOND INDEX", true, "INDEX", "FXNAX", "uncorroborated-lead",
    "Thorpe Specialty: the filing's row is FIDELITY US BOND INDEX at $4,806,132"],
  ["INDEX FD - AI", true, "INDEX", "FXAIX", "uncorroborated-lead",
    "Morgan Foods: the filing reads 'Fidelity 500 INDEX FD - AI' at $2,586,143"],
  ["CLASS (CMTFX) FEDERATED INSTL HIGH YIELD BOND INSTL (FIHBX)", false, "CMTFX", "FIHBX", "row-names-our-own-symbol",
    "I Am Boundless: the filing's row IS '… (FIHBX)' at $96,099; '… CLASS (CMTFX)' is the row above, welded on"],
];
console.log("must SUPPRESS:");
{
  const G = build();
  for (const [nm, lead, filed, got, want, why] of SUPPRESS) {
    const r = G.conflictSuppressed(nm, lead, filed, got);
    if (r !== want) fail(`${JSON.stringify(nm.slice(0, 46))} -> ${JSON.stringify(r)}, want ${JSON.stringify(want)}`);
    else console.log(`  ok   ${want.padEnd(24)} ${JSON.stringify(nm.slice(0, 44))}`);
    void why;
  }
}

/* ---- MUST NOT SUPPRESS: the two findings that READ AS GENUINE against their
 * filings, plus a legitimate leading-bare symbol ---- */
const KEEP = [
  ["Vanguard Total Bond Market Index Fund Institutional (VBITX)", false, "VBITX", "VBTLX",
    "St. Jude, 11,230 readers: the filing states the Institutional class; the page publishes VBTLX (Admiral)"],
  ["PIMCO Total Return A (PTTAX) 236,653 il", false, "PTTAX", "PTTRX",
    "IBEW Local 4, 759 readers: OCR-verified as class A; the page publishes the Institutional symbol"],
  ["FXAIX Fidelity 500 Index Fund", true, "FXAIX", "FXALX",
    "a genuine leading symbol that corroborates must still be reportable"],
];
console.log("must NOT suppress:");
{
  const G = build();
  for (const [nm, lead, filed, got, why] of KEEP) {
    const r = G.conflictSuppressed(nm, lead, filed, got);
    if (r !== null) fail(`${JSON.stringify(nm.slice(0, 46))} suppressed as ${JSON.stringify(r)} — ${why}`);
    else console.log(`  ok   reported            ${JSON.stringify(nm.slice(0, 44))}`);
  }
}

/* ---- FAIL OPEN: no index, so suppression A must suppress NOTHING ---- */
console.log("fail-open (registry index unbuildable):");
{
  const G = build({ index: false });
  for (const [nm, lead, filed, got] of SUPPRESS.filter((s) => s[1])) {
    const r = G.conflictSuppressed(nm, lead, filed, got);
    if (r !== null) fail(`with no index, ${JSON.stringify(nm.slice(0, 40))} was still suppressed as ${JSON.stringify(r)}`);
    else console.log(`  ok   not suppressed     ${JSON.stringify(nm.slice(0, 44))}`);
  }
  /* B does not depend on the index and must keep working */
  const [nm, lead, filed, got, want] = SUPPRESS[3];
  if (G.conflictSuppressed(nm, lead, filed, got) !== want)
    fail("with no index, suppression B stopped working — it does not depend on the registry");
  else console.log("  ok   B still fires      (it reads the row's own name, not the registry)");
}

/* ---- NEGATIVE CONTROLS, one per condition, each on a case where that
 * condition is the ONLY protection ---- */
console.log("negative controls (neuter one condition, its own case must flip):");
{
  const noA = build({ corro: false });
  let flipped = 0;
  for (const [nm, lead, filed, got] of SUPPRESS.filter((s) => s[1])) {
    if (noA.conflictSuppressed(nm, lead, filed, got) === null) flipped++;
  }
  if (flipped !== 3) fail(`neutering the corroboration should expose all 3 INDEX cases; ${flipped} flipped`);
  else console.log("  ok   A is load-bearing  (3 INDEX cases reappear without it)");
  /* and it must NOT have rescued the CMTFX case, which B owns */
  const [cn, cl, cf2, cg, cw] = SUPPRESS[3];
  if (noA.conflictSuppressed(cn, cl, cf2, cg) !== cw)
    fail("neutering A changed the CMTFX verdict — the two conditions are not independent");
  else console.log("  ok   A does not own     the welded-parenthetical case");

  const noB = build({ paren: false });
  if (noB.conflictSuppressed(cn, cl, cf2, cg) !== null)
    fail("neutering the parenthetical scan left the CMTFX case suppressed — B is not load-bearing");
  else console.log("  ok   B is load-bearing  (the welded case reappears without it)");
  /* and B must not own any INDEX case */
  let stillSup = 0;
  for (const [nm, lead, filed, got] of SUPPRESS.filter((s) => s[1]))
    if (noB.conflictSuppressed(nm, lead, filed, got) !== null) stillSup++;
  if (stillSup !== 3) fail(`neutering B should leave all 3 INDEX cases suppressed by A; ${stillSup} remained`);
  else console.log("  ok   B does not own     the INDEX cases");
}

if (fails) { console.error(`\nticker-conflict-test: ${fails} failure(s)`); process.exit(1); }
console.log("\nticker-conflict-test: the two suppressions remove this check's artifacts and keep its real findings");
