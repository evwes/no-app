#!/usr/bin/env node
/* wampo — controls for the field ledger.
 *
 * A ledger that silently reaches no arm reports a tidy set of zeros and looks
 * like good news, so every state must be shown to be REACHED on real data, and
 * the two conditions that have cost this project published figures — the
 * short-form ceiling and the trust-serving rule — are pinned in BOTH
 * directions. A pin that can only pass is decorative.
 *
 *   node scripts/ledger-test.mjs
 */
import { buildLedger, score, PLAN_LEVEL, STATES } from "./lib-ledger.mjs";

const fails = [];
const ok = [];
const check = (name, cond, detail) => (cond ? ok : fails).push(`${name}${detail ? "  — " + detail : ""}`);

const ledger = buildLedger();
const byId = new Map(ledger.plans.map((p) => [`${p.ein}|${p.pn}`, p]));
const s = score(ledger);

/* 1. EVERY STATE IS REACHED. Without this, a typo in a state name turns a whole
 *    arm into a silent zero and the scorecard still prints. */
for (const f of PLAN_LEVEL) {
  const seen = new Set(ledger.plans.map((p) => p.cells[f].state));
  check(`${f}: reaches >1 state`, seen.size > 1, [...seen].join("/"));
}
for (const st of ["published", "withheld", "partial", "absent", "impossible"]) {
  const n = ledger.plans.filter((p) => PLAN_LEVEL.some((f) => p.cells[f].state === st)).length;
  check(`state "${st}" is reached on real data`, n > 0, `${n.toLocaleString()} plans`);
}
check("every cell state is a declared STATE",
  ledger.plans.every((p) => PLAN_LEVEL.every((f) => STATES.includes(p.cells[f].state))));

/* 2. A KNOWN FULL-FORM PLAN. Boeing files everything: if its custodian or
 *    lineup reads absent, the ledger is reading the wrong fields. */
const boeing = byId.get("910425694|002");
check("Boeing pn=002 is in the ledger", !!boeing);
if (boeing) {
  check("Boeing custodian is published as Fidelity",
    boeing.cells.custodian.state === "published" && /fidelity/i.test(String(boeing.cells.custodian.value)),
    `${boeing.cells.custodian.state} ${JSON.stringify(boeing.cells.custodian.value)}`);
  check("Boeing lineup is published", boeing.cells.lineup.state === "published",
    `${boeing.cells.lineup.state} (${boeing.cells.lineup.value})`);
  check("Boeing is not treated as short form", !boeing.sf);
}

/* 3. THE SHORT-FORM CEILING, BOTH DIRECTIONS. A short-form filer's match must be
 *    `impossible` and NEVER `absent` — filing it as absent is what would send an
 *    agent to look for an attachment that does not exist by law. And a
 *    full-form filer must never be marked impossible. */
const sf = ledger.plans.filter((p) => p.sf);
const ff = ledger.plans.filter((p) => !p.sf);
check("short-form plans exist in the ledger", sf.length > 1000, `${sf.length.toLocaleString()}`);
check("NO short-form plan has match `absent` (it must be impossible)",
  sf.every((p) => p.cells.match.state !== "absent"),
  `${sf.filter((p) => p.cells.match.state === "absent").length} violations`);
check("NO full-form plan has match `impossible`",
  ff.every((p) => p.cells.match.state !== "impossible"),
  `${ff.filter((p) => p.cells.match.state === "impossible").length} violations`);
check("short-form Roth is still knowable (code 2R survives the ceiling)",
  sf.some((p) => p.cells.contributions.value && p.cells.contributions.value.roth),
  `${sf.filter((p) => p.cells.contributions.value && p.cells.contributions.value.roth).length.toLocaleString()} SF plans with Roth`);

/* 4. THE TRUST-SERVING CONDITION, BOTH DIRECTIONS, on the documented pin. Home
 *    Depot's OWN ack is not confident (its four-row "menu" is three Form 5500
 *    artifacts) and its TRUST's ack is — so its lineup must be served `trust`.
 *    This is the condition three published figures on this record were wrong
 *    for want of. */
const hd = ledger.plans.find((p) => p.ack === "20260714155858NAL0001241043001"
  || p.mtiaAck === "20260715102148NAL0001978259001");
if (hd) {
  check("Home Depot's lineup is served by its TRUST, not its own ack",
    hd.cells.lineup.state === "published" && hd.cells.lineup.value === "trust",
    `${hd.cells.lineup.state}/${hd.cells.lineup.value}`);
} else {
  ok.push("Home Depot pin not in this store (acks move on a DOL refresh) — skipped");
}
const servedOwn = ledger.plans.filter((p) => p.cells.lineup.value === "own").length;
const servedTrust = ledger.plans.filter((p) => p.cells.lineup.value === "trust").length;
check("both serving paths are exercised", servedOwn > 0 && servedTrust > 0,
  `own ${servedOwn.toLocaleString()}, trust ${servedTrust.toLocaleString()}`);

/* 5. THE SCORE IS A SHARE OF THE POSSIBLE, NOT OF THE UNIVERSE. If `impossible`
 *    ever leaks into the denominator the scalar falls and the loop starts
 *    chasing a ceiling, so assert the arithmetic rather than trusting it. */
for (const f of PLAN_LEVEL) {
  const b = s.fields[f];
  check(`${f}: possible excludes impossible`,
    b.possible === b.published + b.withheld + b.partial + b.absent,
    `${b.possible} vs ${b.published + b.withheld + b.partial + b.absent}`);
  check(`${f}: published+impossible <= universe`, b.published + b.impossible <= s.universePpl);
}
check("overall scalar is a fraction", s.overall > 0 && s.overall < 1, `${(s.overall * 100).toFixed(2)}%`);
check("the impossible ceiling is participant-weighted, not plan-weighted",
  s.fields.match.impossibleShareOfUniverse < 0.2,
  `match ceiling ${(s.fields.match.impossibleShareOfUniverse * 100).toFixed(1)}% of people `
  + `(a PLAN-count reading would say ~39%)`);

/* 6. WITHHELD IS NOT COUNTED AS WORK. A score that treats a deliberate refusal
 *    as a gap rewards publishing what a guard judged wrong. */
const withheldPpl = PLAN_LEVEL.reduce((a, f) => a + s.fields[f].withheld, 0);
check("withheld is reached and is excluded from `addressable`",
  withheldPpl > 0 && s.addressable === PLAN_LEVEL.reduce((a, f) => a + s.fields[f].absent + s.fields[f].partial, 0),
  `${Math.round(withheldPpl).toLocaleString()} withheld participant-cells`);

console.log(`ledger-test: ${ok.length} passed, ${fails.length} failed\n`);
for (const o of ok) console.log(`  ok    ${o}`);
if (fails.length) {
  console.log("");
  for (const f of fails) console.log(`  FAIL  ${f}`);
  process.exit(1);
}
