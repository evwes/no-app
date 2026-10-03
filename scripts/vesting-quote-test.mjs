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
import { vestingQuoteOk } from "./lib-quote.mjs";
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

console.log(bad ? `\n${bad} check(s) FAILED` : `\nall vesting-quote checks pass`);
process.exit(bad ? 1 : 0);
