#!/usr/bin/env node
/* GATE for vestingQuoteOk — "may this sentence be published under a VESTING
 * heading?" (scripts/lib-quote.mjs).
 *
 * WHY A SEPARATE GATE BESIDES THE FIXTURES. lib-quote.mjs --selftest proves the
 * predicate agrees with 22 pinned filings. That is necessary and not
 * sufficient: a hand-built table tests the cases its author already imagined,
 * and the risk of this change runs entirely in one direction — withholding an
 * HONEST vesting quote. So this also
 *   (1) asserts a negative control PER CONDITION, each firing by name,
 *   (2) measures the whole store through the shipped function and holds the
 *       withheld population to a ceiling, because a predicate that silently
 *       grows from 41 to 4,100 entries is a different predicate, and
 *   (3) checks that the two render surfaces reach the same verdict, since
 *       app.js carries a browser twin and build-seo-pages imports the module.
 *
 * Run: node scripts/vesting-quote-test.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { vestingQuoteOk, quoteTrim, accelerationOnlyVesting } from "./lib-quote.mjs";
import { vestingQuoteUpgrade } from "./lib-4i.mjs";
import { loadPlans } from "./lib-schema.mjs";

let bad = 0;
const fail = (m) => { bad++; console.error(`FAIL ${m}`); };
const R = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

/* ---- 1. the fixtures, run here too so this file fails on its own ---- */
const { vestingCases } = JSON.parse(readFileSync(`${R}/docs/quote-guard-cases.json`, "utf8"));
if (!vestingCases?.length) fail("docs/quote-guard-cases.json carries no vestingCases");
for (const c of vestingCases || []) {
  const got = vestingQuoteOk(c.text);
  if (got !== c.expect) fail(`fixture: expected ${c.expect} got ${got} — ${c.why}`);
}
console.log(`fixtures: ${vestingCases?.length || 0} cases (${(vestingCases || []).filter((c) => !c.expect).length} must-withhold, ${(vestingCases || []).filter((c) => c.expect).length} must-keep)`);

/* ---- 2. negative controls, one PER CONDITION, each asserted BY NAME ----
 * A control that cannot fail is decorative. Each of these is a sentence that
 * satisfies exactly one half of the conjunction, so it pins which half. */
const CONTROLS = [
  { why: "condition (a) alone — a loan rule with no vesting word at all MUST be withheld",
    text: "Participant loans are permitted up to the lesser of $50,000 or one-half of the account balance.",
    expect: false },
  { why: "condition (b) alone — a vesting rule that ALSO states a distribution rule MUST be kept",
    text: "A participant is 100% vested after three years of service; benefits are payable upon retirement.",
    expect: true },
  { why: "neither condition — a sentence naming no other rule is kept even with no schedule in it",
    text: "The vesting provisions are described in the Plan document.",
    expect: true },
  { why: "the adjectival shape, which is the whole diagnosis: a vest-word modifying a noun some OTHER rule acts on",
    text: "A participant may withdraw the vested portion of employer contributions after reaching age 59 1/2.",
    expect: false },
  { why: "the same sentence with a real schedule added must flip to kept — (b) is checked first",
    text: "A participant may withdraw the vested portion of employer contributions after reaching age 59 1/2, and becomes 100% vested after two years of service.",
    expect: true },
  { why: "empty input is never publishable",
    text: "", expect: false },
];
for (const c of CONTROLS) {
  const got = vestingQuoteOk(c.text);
  if (got !== c.expect) fail(`control: expected ${c.expect} got ${got} — ${c.why}`);
}
console.log(`controls: ${CONTROLS.length}, all asserted by name`);

/* The controls above would all still pass if vestingQuoteOk were replaced by a
 * table lookup of their own texts, so assert that the PREDICATE is live: a
 * sentence built to satisfy (a) and not (b) must be withheld even though it
 * appears nowhere above. */
if (vestingQuoteOk("Loans are secured by the balance in the participant's account.") !== false)
  fail("the predicate is inert on an unseen (a)-only sentence");

/* ---- 3. the whole store, through the SHIPPED function ---- */
const CEILING = 80;        /* measured at 41 on the pv-199 store, 2026-10-03 */
const PPL_CEILING = 400_000;
const d = loadPlans(`${R}/plans-all.json`);
const reach = new Map();
for (const row of d.rows) {
  const n = d.get(row, "partEOY") || d.get(row, "participants") || 0;
  for (const a of [d.get(row, "ack"), d.get(row, "mtiaAck")])
    if (a) reach.set(a, (reach.get(a) || 0) + n);
}
let total = 0, withheld = 0, ppl = 0, withLabel = 0;
for (let s = 0; s < 64; s++) {
  const f = `${R}/data/lineups/${String(s).padStart(2, "0")}.json`;
  if (!existsSync(f)) continue;
  for (const [ack, e] of Object.entries(JSON.parse(readFileSync(f, "utf8")))) {
    const t = e?.features?.vestingText;
    if (!t) continue;
    total++;
    if (vestingQuoteOk(t)) continue;
    withheld++; ppl += reach.get(ack) || 0;
    if (e.features.vesting) withLabel++;
  }
}
console.log(`store: ${total} stored vestingText entries; WITHHELD ${withheld} / ${ppl.toLocaleString()} ppl (${withLabel} keep a vesting label)`);
if (!total) fail("read 0 stored vestingText entries — the store was not read, so nothing above was measured");
if (withheld > CEILING) fail(`withheld ${withheld} entries, ceiling ${CEILING} — re-read the members before raising it`);
if (ppl > PPL_CEILING) fail(`withheld reaches ${ppl} ppl, ceiling ${PPL_CEILING}`);
if (withheld === 0) fail("withheld 0 — on a store that contains Charter's loan limit and PSEG's withdrawal rule, a clean zero reports on the query");

/* ---- 4. both surfaces must agree ---- */
const appjs = readFileSync(`${R}/app.js`, "utf8");
if (!/window\.__wampoVestingQuoteOk/.test(appjs))
  fail("app.js does not expose __wampoVestingQuoteOk — the browser twin cannot be cross-checked by the smoke test");
if (!/vestingQuoteOk\(ff\.vestingText\)/.test(appjs))
  fail("app.js renders ff.vestingText without passing it through the guard");
const seo = readFileSync(`${R}/scripts/build-seo-pages.mjs`, "utf8");
if (!/vestingQuoteOk/.test(seo))
  fail("scripts/build-seo-pages.mjs renders the vesting quote without the guard — the crawlable pages are the other surface");

/* ---- 4b. the ACCELERATION-ONLY qualifier, 2026-10-09 ----
 * `accelerationOnlyVesting` does not withhold anything; it adds a sentence
 * saying the published quote states when vesting is ACCELERATED rather than how
 * it is earned. So the risk runs the other way from the guard above: a false
 * positive puts that sentence under a quote that DOES state a schedule, which
 * is a wrong published claim. Hence a ceiling AND a floor, both measured, and
 * the fixtures run here too so this file fails on its own. */
const { accelCases } = JSON.parse(readFileSync(`${R}/docs/quote-guard-cases.json`, "utf8"));
if (!accelCases?.length) fail("docs/quote-guard-cases.json carries no accelCases");
for (const c of accelCases || []) {
  const got = accelerationOnlyVesting(c.text);
  if (got !== c.expect) fail(`accel fixture: expected ${c.expect} got ${got} — ${c.why}`);
}
console.log(`accel fixtures: ${accelCases.length} cases (${accelCases.filter((c) => c.expect).length} must-fire, ${accelCases.filter((c) => !c.expect).length} must-not-fire)`);
/* THE CLASS, re-derived through both gates the display applies: published by
 * `vestingQuoteOk`, served from the plan's OWN ack (features are never served
 * from a trust), and carrying no vesting LABEL, because where a label exists
 * the schedule already reaches the reader and the qualifier is gated off. */
/* RAISED FOR v203, 2026-10-09, AND THE RAISE IS THE PRE-REGISTRATION.
 * `accelLabelled` below counts plans where the qualifier FIRES but a vesting
 * LABEL gates it off — and on the pv-202 store **all 123 of them are labelled
 * `Immediate`, which is the defect v203 repairs**: the label and the quote
 * contradict each other. v203 withholds `Immediate` over exactly these
 * sentences (`lib-4i`, the `IMMED` branch), so after the re-parse those plans
 * lose the label and MOVE OUT of `accelLabelled` and INTO `accel` — the
 * qualified population grows by the number of labels withdrawn and nothing
 * else changes. Measured by replaying the real extractor on all 123 filings:
 * 82 lose the label outright, 29 gain the REAL schedule from the same filing
 * (so they stay labelled and stay gated off), and 12 could not be replayed
 * locally because production reads their notes through OCR.
 *   expected after v203:  accel 59 -> 141..153   (82..94 join)
 *                         accelPpl 51,205 -> ~90,000
 *                         accelLabelled 123 -> 29..41
 * The 200 is headroom over the top of that range, not a new measurement; a
 * figure above it means the guard reached further than the replay predicted
 * and the members must be read before it is raised again. */
const ACCEL_CEILING = 200;          /* 59 plans on pv-202; 141..153 expected on pv-203 */
const ACCEL_PPL_CEILING = 160_000;  /* measured at 51,205; ~90,000 expected on pv-203 */
/* `participants` and NOT `partEOY || participants`: both display surfaces print
 * `participants` beside the quote, and a reader-facing figure must be summed in
 * the field the reader is shown. The other convention reads 51,489 here. */
const ownAck = new Map();
for (const row of d.rows) {
  const a = d.get(row, "ack");
  if (a) ownAck.set(a, (ownAck.get(a) || 0) + (d.get(row, "participants") || 0));
}
let accel = 0, accelPpl = 0, accelLabelled = 0;
for (let s = 0; s < 64; s++) {
  const f = `${R}/data/lineups/${String(s).padStart(2, "0")}.json`;
  if (!existsSync(f)) continue;
  for (const [ack, e] of Object.entries(JSON.parse(readFileSync(f, "utf8")))) {
    const t = e?.features?.vestingText;
    if (!t || !vestingQuoteOk(t) || !ownAck.has(ack)) continue;
    if (!accelerationOnlyVesting(quoteTrim(t))) continue;
    if (e.features.vesting) { accelLabelled++; continue; }
    accel++; accelPpl += ownAck.get(ack) || 0;
  }
}
console.log(`accel class: ${accel} plans / ${accelPpl.toLocaleString()} ppl qualified; ${accelLabelled} more fire but carry a LABEL and are gated off`);
if (accel === 0) fail("the qualifier reaches 0 plans — on a store holding Smith And Nephew and U.S. Fire, a clean zero reports on the query");
if (accel > ACCEL_CEILING) fail(`qualifier reaches ${accel} plans, ceiling ${ACCEL_CEILING} — read the members before raising it`);
if (accelPpl > ACCEL_PPL_CEILING) fail(`qualifier reaches ${accelPpl} ppl, ceiling ${ACCEL_PPL_CEILING}`);
if (accelLabelled === 0) fail("0 labelled quotes fire — the `!ff.vesting` gate is then untested against the population it exists for");
/* both surfaces, and the LABEL GATE on each, because the gate is half the claim */
if (!/window\.__wampoAccelOnly/.test(appjs))
  fail("app.js does not expose __wampoAccelOnly — the browser twin cannot be cross-checked by the smoke test");
if (!/!ff\.vesting && accelerationOnlyVesting\(vestingQuote\)/.test(appjs))
  fail("app.js renders the acceleration qualifier without the `!ff.vesting` gate, or not at all");
if (!/!ff\.vesting && accelerationOnlyVesting\(vestQuote\)/.test(seo))
  fail("scripts/build-seo-pages.mjs renders the acceleration qualifier without the `!ff.vesting` gate, or not at all");

/* ---- 5. the v201 UPGRADE predicate, which makes this guard an ORACLE ----
 * `vestingQuoteUpgrade` lets a guard-ACCEPTED sentence displace a stored quote
 * this guard REJECTS, so the two now move together: a change to `vestingQuoteOk`
 * changes which sentence the PARSER stores, not only what the page shows. The
 * three conditions are what make the upgrade unable to harm, so each gets a
 * control where it is the ONLY protection — and each control is built by
 * SLICING the condition out of the shipped source, so moving the source makes
 * this report "the source moved" rather than passing quietly. */
const libSrc = readFileSync(`${R}/scripts/lib-4i.mjs`, "utf8");
const fnSrc = (libSrc.match(/export function vestingQuoteUpgrade\(out, candidate\) \{[\s\S]*?\n\}/) || [])[0];
if (!fnSrc) fail("vestingQuoteUpgrade is not where this test slices it out of lib-4i.mjs");
const CONDS = [
  { name: "no label was settled", cut: "!out.vesting\n    && ",
    out: { vesting: "3-year cliff", vestingText: "Participant loans are permitted up to $50,000." },
    cand: "Employer contributions are 100% vested after two years of service.",
    /* the label consumers (app.js's graded-rate enrichment, audit-data's cliff
     * cross-check) all read vestingText only when a LABEL exists, so this is
     * the condition that keeps the upgrade out of their way */
    why: "a plan WITH a label must never have its quote displaced" },
  { name: "the stored quote is withheld", cut: "!vestingQuoteOk(out.vestingText) && ",
    out: { vesting: "", vestingText: "Employer contributions vest 20% per year and are fully vested after five years." },
    cand: "Participants become 100% vested after three years of service.",
    why: "a PUBLISHED quote must never change — this is the whole safety claim" },
  { name: "the candidate is publishable", cut: "&& vestingQuoteOk(candidate)",
    out: { vesting: "", vestingText: "Participant loans are permitted up to $50,000." },
    cand: "A participant may withdraw the vested portion of employer contributions at age 59 1/2.",
    why: "one withheld sentence must never be swapped for another withheld sentence" },
];
for (const c of CONDS) {
  if (vestingQuoteUpgrade(c.out, c.cand) !== false)
    fail(`upgrade: the shipped predicate allows a case it must refuse — ${c.why}`);
  if (!fnSrc.includes(c.cut))
    fail(`upgrade control "${c.name}": the source moved — ${JSON.stringify(c.cut)} is no longer in vestingQuoteUpgrade, so this control proves nothing`);
  else {
    const mutant = new Function("vestingQuoteOk", "return " + fnSrc
      .replace("export function", "function").replace(c.cut, "")
      + "; return vestingQuoteUpgrade;")(vestingQuoteOk);
    if (mutant(c.out, c.cand) !== true)
      fail(`upgrade control "${c.name}" is DECORATIVE: removing it does not admit its own case, so nothing proves the condition is load-bearing`);
  }
}
/* and the predicate must FIRE — a guard set that refuses everything is safe and
 * useless. This is the shape of all five plans v201 moves. */
if (vestingQuoteUpgrade({ vesting: "", vestingText: "The Plan allows for in-service distributions upon attainment of age 59 1/2." },
  "Vesting in Company matching contributions is based on years of continuous service and becomes 100% vested after one full year of credited service.") !== true)
  fail("upgrade: the predicate does not fire on the shape it was built for — it is inert");
console.log(`upgrade: ${CONDS.length} conditions, each the ONLY protection on its own case and each proved load-bearing by a sliced mutant`);

console.log(bad ? `\n${bad} check(s) FAILED` : `\nall vesting-quote checks pass`);
process.exit(bad ? 1 : 0);
