#!/usr/bin/env node
/* wampo — PRICE EVERY CONDITION OF v214's ARM OVER THE LIVE DATA, IN ONE PASS.
 *
 *   node scripts/vesting-arm-conditions.mjs [--show <COND>] [--lim N]
 *
 * WHY THIS AND NOT A TABLE OF HAND PROBES. *Measure a guard's blocking
 * population over the LIVE DATA, not over the examples that come to mind* — a
 * hand-built control table tests the cases its author already imagined. And the
 * sharper half: *a conjunction's conditions cannot be priced one at a time when
 * two of them block the same population*, so a probe written for one refusal is
 * routinely ALSO blocked by another and reads "necessary for 0" when deleting
 * BOTH would be the real cost. Two mutually redundant guards each priced alone
 * once cost six correct rows on this record.
 *
 * SO THE PASS IS INVERTED. It evaluates the arm's REQUIREMENTS only — the
 * unconditional-claim test, the forward object, and the employer/account object
 * — and then, for every surviving candidate sentence, records WHICH REFUSALS
 * FIRE. From that one table every question is answerable without re-running:
 *
 *   BLOCKS       how many plans a refusal blocks at all (its population)
 *   SOLE         how many it is the ONLY protection for — this is necessity,
 *                and a condition whose SOLE set is empty is priced as
 *                redundant-on-today's-data rather than quietly kept
 *   REDUNDANT    which other refusal covers its population
 *
 * EVERY FIGURE IS A PLAN COUNT UNDER THE SHIPPED CONDITIONS, IN ORDER: the
 * plan must be full-form, must not already publish a vesting label (or pass 1
 * never runs at all), its sentence must come from the SHIPPED selection, must
 * be accepted by the SHIPPED oracle both renderers call, and must carry the
 * `employerNamed` object the gate actually takes. *A measurement of what a page
 * publishes must apply every condition the page applies, in order.*
 *
 * The requirements and the refusals are SLICED from lib-4i's own bytes, not
 * retyped: a harness that re-types a predicate measures the re-typing.
 */
import { readFileSync } from "node:fs";
import { buildLedger } from "./lib-ledger.mjs";
import { read } from "./lib-filingtext.mjs";
import { vestingQuoteOk } from "./lib-quote.mjs";
import { vestingSelection } from "./lib-vestslice.mjs";
import { unnarrowedFullVesting, vestingQuoteKeepTokens } from "./lib-4i.mjs";

const argv = process.argv.slice(2);
const SHOW = (() => { const i = argv.indexOf("--show"); return i >= 0 ? argv[i + 1] : ""; })();
const LIM = (() => { const i = argv.indexOf("--lim"); return i >= 0 ? +argv[i + 1] : 10; })();

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SRC = readFileSync(`${ROOT}/scripts/lib-4i.mjs`, "utf8");

/* ---- THE SLICE ----------------------------------------------------------
 * The whole v214 block, from the first const to the end of the exported
 * predicate, compiled with `export` stripped. Its two external names —
 * `SPONSOR_TWO_CLAIM` and `employeeScopedAccount` live above the block, and
 * `AV_TRIGGER` / `terminationOnlyVesting` are imports — are passed in, the way
 * `lib-vestslice` passes v211's. */
const BLOCK = (() => {
  const h = SRC.indexOf("const UV_OBJ = ");
  const e = SRC.indexOf("\n}", SRC.indexOf("export function unnarrowedFullVesting"));
  if (h < 0 || e < 0) throw new Error("vesting-arm-conditions: the v214 block moved in lib-4i.mjs");
  return SRC.slice(h, e + 2).replace(/^export /gm, "");
})();
for (const must of ["UV_UNCOND", "UV_OBJ_ACCT", "unnarrowedFullVesting", "UV_GLYPH", "UV_SERVICE"])
  if (!BLOCK.includes(must)) throw new Error(`vesting-arm-conditions: the slice is missing ${must} — the boundaries moved`);

const { SPONSOR_TWO_CLAIM, employeeScopedAccount } = await import("./lib-4i.mjs");
const { AV_TRIGGER, terminationOnlyVesting } = await import("./lib-quote.mjs");
const mk = (body) => new Function("SPONSOR_TWO_CLAIM", "employeeScopedAccount", "AV_TRIGGER", "terminationOnlyVesting",
  `${BLOCK}\n${body}`)(SPONSOR_TWO_CLAIM, employeeScopedAccount, AV_TRIGGER, terminationOnlyVesting);

/* THE REQUIREMENTS ALONE — every `return null` that is NOT a refusal, and
 * nothing else. This is what makes the pass one-pass: it is a strict superset
 * of the arm, so every sentence the arm could ever take is in its output. */
const req = mk(`return function (x) {
  if (!UV_UNCOND.test(x)) return null;
  const m = x.match(UV_OBJ);
  if (!m) return null;
  const obj = m[1];
  if (!UV_OBJ_EMPLOYER.test(obj) && UV_OBJ_EMPLOYEE.test(obj)) return null;
  return { obj, employerNamed: UV_OBJ_EMPLOYER.test(obj) || UV_OBJ_ACCT.test(obj) };
};`);
/* …and each refusal as its own predicate, named exactly as in the source. */
const REFUSALS = mk(`return {
  SPONSOR_TWO_CLAIM: (x) => SPONSOR_TWO_CLAIM.test(x),
  employeeScopedAccount: (x) => employeeScopedAccount(x),
  AV_TRIGGER: (x) => AV_TRIGGER.test(x),
  terminationOnlyVesting: (x) => terminationOnlyVesting(x),
  UV_CONTRACT_BOILER: (x) => UV_CONTRACT_BOILER.test(x),
  UV_FORFEIT: (x) => UV_FORFEIT.test(x),
  UV_DISTRIB: (x) => UV_DISTRIB.test(x),
  UV_SCHEDULE: (x) => UV_SCHEDULE.test(x),
  UV_HARDSHIP: (x) => UV_HARDSHIP.test(x),
  UV_PLAN_TERM: (x) => UV_PLAN_TERM.test(x),
  UV_GLYPH: (x) => UV_GLYPH.test(x),
  UV_SERVICE: (x) => UV_SERVICE.test(x),
  UV_AUDIT_BOILER: (x) => UV_AUDIT_BOILER.test(x),
  uvOcrLadder: (x) => uvOcrLadder(x),
  UV_WOUND_UP: (x) => UV_WOUND_UP.test(x),
  UV_DEMONSTRATIVE_obj: (x, obj) => UV_DEMONSTRATIVE.test(obj),
  UV_OWN_obj: (x, obj) => UV_OWN.test(obj),
};`);
const NAMES = Object.keys(REFUSALS);

/* ---- CONTROLS ABOVE THE LOOP -------------------------------------------
 * The slice must reproduce the SHIPPED predicate exactly on cases that reach
 * it, or every number below is about a different function. Checked in both
 * directions: a sentence the arm takes, and one every refusal must stop. */
{
  const recompose = (x) => {
    const r = req(x);
    if (!r) return null;
    for (const n of NAMES) if (REFUSALS[n](x, r.obj)) return null;
    return r;
  };
  const CASES = [
    ["Vesting – Participants are immediately vested in their accounts.", true],
    ["Participants are vested immediately in their contributions plus actual earnings thereon.", false],
    ["The individual owner of the contract is fully vested in the contract or account.", false],
    ["A participant is 100 percent vested after 3 of credited service.", false],
    ["The Plan is a defined contribution plan covering all eligible employees.", false],
  ];
  for (const [s, wantTruthy] of CASES) {
    const a = recompose(s), b = unnarrowedFullVesting(s);
    if (!!a !== !!b) throw new Error(`condition slice DISAGREES with the shipped predicate on: ${s.slice(0, 60)}`);
    if (!!a !== wantTruthy) throw new Error(`condition slice gives the wrong answer on a pinned case: ${s.slice(0, 60)}`);
  }
  console.log("slice control: the recomposed conditions reproduce the shipped predicate on 5 pinned cases, both directions\n");
}

const L = buildLedger({ withStatus: false });
/* cand: one row per (plan, sentence) that satisfies the REQUIREMENTS and the
 * shipped oracle, carrying the set of refusals that fire on it. */
const cand = [];
let scanned = 0, unjud = 0;
for (const p of L.plans) {
  if (p.sf || !p.ack) continue;
  /* THE PUBLISH CONDITION, FIRST: a plan that already has a vesting LABEL never
   * runs pass 1 at all, so admitting a sentence of its could change nothing. */
  if (p.cells.vesting.state === "published") continue;
  const raw = read(p.ack);
  if (!raw) { unjud++; continue; }
  if (!vestingQuoteKeepTokens(raw)) continue;
  if (++scanned % 2000 === 0) process.stderr.write(`  ${scanned} scanned, ${cand.length} candidates\n`);
  let sel;
  try { sel = vestingSelection(raw); } catch { continue; }
  for (const s of sel.vestSentences) {
    if (!vestingQuoteOk(s)) continue;          // the oracle BOTH renderers call
    const r = req(s);
    if (!r) continue;
    const fired = NAMES.filter((n) => REFUSALS[n](s, r.obj));
    cand.push({ p, s, obj: r.obj, employerNamed: r.employerNamed, fired });
  }
}
console.log(`scanned ${scanned} non-published full-form plans with cached text (${unjud} unjudged)`);
console.log(`candidate sentences satisfying the REQUIREMENTS and the oracle: ${cand.length}\n`);

/* A plan is ADMITTED if any candidate of its is `employerNamed` and no refusal
 * fires on it — which is the gate's own condition. Per-condition necessity is
 * then a question about PLANS, not sentences: a refusal is load-bearing only
 * where removing it ADMITS A PLAN that is not admitted already. */
const named = cand.filter((c) => c.employerNamed);
const planKey = (c) => `${c.p.ein}|${c.p.pn}`;
const admittedNow = new Set(named.filter((c) => !c.fired.length).map(planKey));
const pplOf = (keys) => {
  let n = 0; const seen = new Set();
  for (const c of named) if (keys.has(planKey(c)) && !seen.has(planKey(c))) { seen.add(planKey(c)); n += c.p.ppl; }
  return n;
};
console.log(`ADMITTED by the shipped arm: ${admittedNow.size} plans / ${pplOf(admittedNow).toLocaleString()} readers`);
/* AN UPPER BOUND, AND THE FIRST VERSION OF THIS LINE CALLED IT A LOWER ONE.
 * Admission at the gate is NECESSARY for a label and not SUFFICIENT: the nine
 * guards between the gate and the label all still run, and the differential
 * prices them at 542 labels against 1,503 admissions. A bound stated in the
 * wrong direction is worse than none, because it reads as a floor under the
 * delivery when it is a ceiling over it. */
console.log(`(an UPPER bound on the arm's label gain: admission is NECESSARY, not SUFFICIENT — the nine`);
console.log(` guards between the gate and the label still run, and the DIFFERENTIAL is what prices them)\n`);

const rows = [];
for (const n of NAMES) {
  /* BLOCKS: candidate sentences this refusal stops (employerNamed only, since
   * the gate takes nothing else). SOLE: plans it is the ONLY protection for. */
  const blocks = named.filter((c) => c.fired.includes(n));
  const sole = new Set(blocks.filter((c) => c.fired.length === 1).map(planKey));
  for (const k of [...sole]) if (admittedNow.has(k)) sole.delete(k);   // another sentence already admits the plan
  const co = new Map();
  for (const c of blocks) for (const o of c.fired) if (o !== n) co.set(o, (co.get(o) || 0) + 1);
  const top = [...co.entries()].sort((a, b) => b[1] - a[1])[0];
  rows.push({ n, blocks: blocks.length, blockPlans: new Set(blocks.map(planKey)).size, sole, soleP: pplOf(sole), top });
}
rows.sort((a, b) => b.sole.size - a.sole.size || b.blocks - a.blocks);
console.log("condition                 BLOCKS(sent/plan)   SOLE PROTECTION (plans / readers)   most common co-firer");
for (const r of rows)
  console.log(`${r.n.padEnd(24)} ${String(r.blocks).padStart(6)} /${String(r.blockPlans).padStart(5)}      `
    + `${String(r.sole.size).padStart(4)} pl / ${String(r.soleP.toLocaleString()).padStart(9)}        `
    + (r.top ? `${r.top[0]} (${r.top[1]})` : "— none"));
const inert = rows.filter((r) => r.sole.size === 0);
console.log(`\n${rows.length - inert.length} of ${rows.length} conditions are the SOLE protection for at least one plan.`);
if (inert.length) {
  console.log(`REDUNDANT ON TODAY'S DATA (every plan they block is blocked by another condition too):`);
  for (const r of inert) console.log(`  ${r.n} — blocks ${r.blocks} sentences, always beside ${r.top ? r.top[0] : "nothing"}`);
  console.log(`  These are kept and DECLARED rather than deleted: each names a distinct mechanism and`);
  console.log(`  was earned on a filing that was READ. *A 0 in leave-one-out can be a property of`);
  console.log(`  today's data rather than of the construction* — but a reader of this gate is owed the`);
  console.log(`  number rather than the assumption, which is what this block is.`);
}

if (SHOW) {
  const r = rows.find((x) => x.n === SHOW);
  if (!r) { console.log(`\nno such condition: ${SHOW}`); process.exit(2); }
  console.log(`\n--- ${SHOW}: the plans it is the SOLE protection for ---`);
  const seen = new Set();
  for (const c of named.filter((x) => x.fired.length === 1 && x.fired[0] === SHOW).sort((a, b) => b.p.ppl - a.p.ppl)) {
    if (!r.sole.has(planKey(c)) || seen.has(planKey(c))) continue;
    seen.add(planKey(c));
    if (seen.size > LIM) break;
    console.log(`\n=== ${c.p.ppl} ppl · ${c.p.sponsorName} · ${c.p.ack}`);
    console.log(`    ${c.s}`);
    console.log(`    obj= ${JSON.stringify(c.obj)}`);
  }
}
console.log("\nThese figures are DERIVED. Re-run; never copy them forward.");
