#!/usr/bin/env node
/* wampo — does `fund-facts-check` actually bite on a VEHICLE entry?
 *
 * `vehicles` is where every collective trust, separate account and guaranteed
 * option has to live, because `funds` is keyed by ticker and these have none.
 * It has existed, validated, and held ZERO entries — so every rule in that
 * branch has only ever been read, never run. On 2026-11-13 it gained the
 * return fields (it could not carry a `ytd` at all: the closed whitelist
 * rejected it as unknown) and a third `erBasis`, which is exactly the moment to
 * prove the rules bite: every figure ever published through this section
 * arrives afterwards.
 *
 * THE TWO RULES THAT MATTER MOST, and both are about not laundering a figure:
 *
 *  - `erBasis` is REQUIRED, because a CIT's price is normally negotiated per
 *    plan and the provider's headline figure is not the plan's. The new
 *    `class-published` says the provider prices a NAMED unit class and the
 *    filing states that class — a narrower claim, not a looser one — so it
 *    demands `shareClass` and is refused without it.
 *  - the trailing returns run through the SAME `checkReturns` as a ticker
 *    entry. The cumulative-pasted-into-annualised case is repeated here
 *    deliberately: it is the one error that looks entirely plausible, and a
 *    rule shared by reference can still be wired up wrongly at one call site.
 *    If this case ever passes, `vehicles` is not calling the shared function.
 *
 * Runs with no network and writes only inside the OS temp dir.
 * Usage: node scripts/fund-facts-vehicle-test.mjs      (exit 1 on any failure)
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
const dir = mkdtempSync(path.join(tmpdir(), "ff-vehicle-"));
const SRC = "https://investor.vanguard.com/vmf/api/1464/profile";
const TODAY = new Date().toISOString().slice(0, 10);

/* shaped on the real thing: Vanguard Target Retirement 2020 Trust I, whose
 * profile carries its own CUSIP, a dated expense ratio and a dated YTD. */
const base = (extra) => ({
  name: "Vanguard Target Retirement 2020 Trust I",
  provider: "Vanguard", kind: "collective-trust", cusip: "92202V591",
  shareClass: "Trust I", updated: TODAY,
  er: 0.065, erAsOf: "2026-03-31", erSource: SRC, erBasis: "class-published",
  ...extra,
});
const drop = (o, k) => Object.fromEntries(Object.entries(o).filter(([x]) => x !== k));
const curve = {
  returnBasis: "annualised",
  r1y: 4.6, r1yAsOf: "2026-10-31", r1ySource: SRC,
  r3y: 11.38, r3yAsOf: "2026-10-31", r3ySource: SRC,
  r5y: 4.11, r5yAsOf: "2026-10-31", r5ySource: SRC,
  r10y: 6.77, r10yAsOf: "2026-10-31", r10ySource: SRC,
};

/* [label, entry, wantExit] */
const CASES = [
  ["a sourced, dated, class-published trust PASSES", base({}), 0],
  ["... with a YTD return (the field vehicles could not carry at all)",
    base({ ytd: 3.63, ytdAsOf: TODAY, ytdSource: SRC }), 0],
  ["... with a full trailing curve", base(curve), 0],

  /* erBasis: the guard that stops a provider's figure being printed as a plan's */
  ["an expense ratio with NO erBasis", drop(base({}), "erBasis"), 1],
  ["an erBasis that is not one of the three", base({ erBasis: "whatever" }), 1],
  ["`class-published` with no shareClass naming the class",
    drop(base({}), "shareClass"), 1],
  ["`class-published` with an empty shareClass", base({ shareClass: "  " }), 1],
  /* the OTHER two bases must NOT demand shareClass — a negotiated separate
   * account genuinely has no published class, and requiring one there would
   * make the honest case unrepresentable. */
  ["`vehicle-stated` without a shareClass still passes",
    drop(base({ erBasis: "vehicle-stated" }), "shareClass"), 0],

  /* the receipts, repeated rather than relaxed */
  ["an expense ratio with no as-of date", drop(base({}), "erAsOf"), 1],
  ["an expense ratio with no source URL", drop(base({}), "erSource"), 1],
  ["an erAsOf in the future", base({ erAsOf: "2099-01-01" }), 1],
  ["an implausible expense ratio", base({ er: 42 }), 1],

  /* the shared return rules, at THIS call site */
  ["a CUMULATIVE 10y pasted into the annualised field",
    base({ ...curve, r10y: 159.4 }), 1],
  ["a trailing curve with no returnBasis", base(drop(curve, "returnBasis")), 1],
  ["a YTD with no as-of date", base({ ytd: 3.63, ytdSource: SRC }), 1],
  ["a YTD with no source URL", base({ ytd: 3.63, ytdAsOf: TODAY }), 1],
  ["a 10y figure on a trust three years old",
    base({ ...curve, inception: "2023-01-01" }), 1],

  /* identity and the closed whitelist */
  ["a malformed CUSIP", base({ cusip: "92202V59" }), 1],
  ["an unknown field (the whitelist still closes)", base({ aum: 1e9 }), 1],
  ["a key that is not provider::fund", base({}), 1, "Vanguard Target 2020"],
  ["an entry with neither er nor ytd nor a status",
    drop(drop(drop(drop(base({}), "er"), "erAsOf"), "erSource"), "erBasis"), 1],
];

let bad = 0;
for (const [label, entry, wantExit, key] of CASES) {
  const f = path.join(dir, "f.json");
  writeFileSync(f, JSON.stringify({
    _schema: "test", funds: {},
    vehicles: { [key || "vanguard::target-retirement-2020-trust-i"]: entry },
  }));
  let code = 0, out = "";
  try { out = execFileSync("node", [CHECK, f], { encoding: "utf8" }); }
  catch (e) { code = e.status ?? 1; out = String(e.stdout || "") + String(e.stderr || ""); }
  if (code === wantExit) console.log(`  ok    ${label}`);
  else {
    bad++;
    console.log(`  FAIL  ${label}`);
    console.log(`        exit ${code} (want ${wantExit})`);
    console.log(`        ${out.trim().split("\n").slice(0, 2).join(" | ").slice(0, 170)}`);
  }
}

/* A DORMANT FEE WARNS AND IS NOT REFUSED, and both halves are the point.
 *
 * Vanguard's API serves every Target Retirement Trust III vintage at er 0.4000
 * as of 2014-03-31 — six times the band its live classes sit in, the same round
 * number across all twelve — together with a YTD block holding no value. Those
 * records are dormant. Recording one is CORRECT (it is what the source says);
 * publishing it as a plan's price would be badly wrong. So the checker must let
 * it into the file and say so loudly, and the two expectations below pin
 * exactly that: exit 0, and a warning naming the entry.
 *
 * The fresh case is not decoration — without it a rule that warned on EVERY
 * vehicle would pass the stale case and nobody would notice. */
{
  const cases = [
    ["a twelve-year-old fee warns", base({ erAsOf: "2014-03-31", er: 0.4 }), 0, true],
    ["a current fee does not", base({}), 0, false],
  ];
  for (const [label, entry, wantExit, wantWarn] of cases) {
    const f = path.join(dir, "s.json");
    writeFileSync(f, JSON.stringify({ _schema: "test", funds: {}, vehicles: { "vanguard::x": entry } }));
    let code = 0, out = "";
    try { out = execFileSync("node", [CHECK, f], { encoding: "utf8" }); }
    catch (e) { code = e.status ?? 1; out = String(e.stdout || "") + String(e.stderr || ""); }
    const warned = /dormant record/.test(out);
    if (code === wantExit && warned === wantWarn) console.log(`  ok    ${label}`);
    else { bad++; console.log(`  FAIL  ${label}: exit ${code} (want ${wantExit}), warned ${warned} (want ${wantWarn})`); }
  }
}

/* THE TWO SECTIONS' COUNTERS MUST NOT BE THE SAME COUNTER. When the return
 * rules were factored out to be shared, both call sites accumulated into the
 * TICKER totals, and the first file to hold a vehicle return reported "503
 * ticker entries (503 with an expense ratio, 546 with a YTD return)" — more
 * YTDs than entries, which cannot be true. A gate's own summary is a claim
 * about the data, and a number in it that cannot be true is a defect even
 * though no reader sees it. One ticker and one vehicle, each with one YTD:
 * both halves must read 1. */
{
  const f = path.join(dir, "c.json");
  writeFileSync(f, JSON.stringify({
    _schema: "test",
    funds: { TEST: { name: "Test Fund", updated: TODAY, er: 0.04, erAsOf: TODAY, erSource: SRC,
      ytd: 1.1, ytdAsOf: TODAY, ytdSource: SRC } },
    vehicles: { "vanguard::x": base({ ytd: 2.2, ytdAsOf: TODAY, ytdSource: SRC }) },
  }));
  const out = execFileSync("node", [CHECK, f], { encoding: "utf8" });
  const ok = /1 ticker entries \(1 with an expense ratio, 1 with a YTD return/.test(out)
    && /1 vehicle entries \(1 with an expense ratio, 1 with a YTD return/.test(out);
  if (ok) console.log("  ok    ticker and vehicle totals are counted apart");
  else { bad++; console.log(`  FAIL  the two sections share a counter: ${out.trim().split("\n").pop()}`); }
}

/* THE BRANCH MUST ACTUALLY BE REACHED. Every case above could pass against a
 * checker that ignores `vehicles` entirely except for the few it refuses, so
 * assert the count it reports — a silent skip reads exactly like a clean pass. */
{
  const f = path.join(dir, "n.json");
  writeFileSync(f, JSON.stringify({ _schema: "test", funds: {},
    vehicles: { "vanguard::a": base({}), "vanguard::b": base({}) } }));
  const out = execFileSync("node", [CHECK, f], { encoding: "utf8" });
  if (/2 vehicle entries \(2 with an expense ratio[,)]/.test(out)) console.log("  ok    the checker counts the vehicles it read");
  else { bad++; console.log(`  FAIL  the checker did not report 2 vehicle entries: ${out.trim().slice(-160)}`); }
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

console.log(bad ? `\nfund-facts-vehicle-test: ${bad} FAILURE(S)` : `\nfund-facts-vehicle-test: ${CASES.length + 5} checks, all pass`);
process.exit(bad ? 1 : 0);
