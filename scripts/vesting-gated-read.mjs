#!/usr/bin/env node
/* wampo — WHAT IS ACTUALLY IN THE GATED BUCKET? A reading instrument, not a
 * count.
 *
 * `vesting-quote-ceiling.mjs` partitions the vesting-absent population into
 * REACH / GATED / NONE and reports GATED as the largest class. GATED means: at
 * least one candidate sentence clears `vestingQuoteOk`, and NOT ONE of them
 * clears the employer-scope gate, so the extractor's `continue` at
 * lib-4i.mjs:9132 runs before every quote fallback and the filing stores
 * nothing at all.
 *
 * That bucket is a POPULATION, not a defect — the gate refuses sentences that
 * do not name employer money, and employee money is vested by law. So this
 * script exists to put the sentences in front of a human, ranked to pick what
 * to READ and drawn at random to estimate a RATE, with every gate arm's own
 * verdict printed beside each candidate.
 *
 * Everything is measured through the SHIPPED code: the selection and the gate
 * come from `lib-vestslice.mjs` (which throws if the parser moves) and the
 * oracle is imported from `lib-quote.mjs`.
 *
 * Usage:
 *   node scripts/vesting-gated-read.mjs --rank 40
 *   node scripts/vesting-gated-read.mjs --draw 40 --seed 7
 *   node scripts/vesting-gated-read.mjs --ack <ACK>
 */
import { buildLedger } from "./lib-ledger.mjs";
import { read } from "./lib-filingtext.mjs";
import { vestingQuoteOk } from "./lib-quote.mjs";
import { vestingSelection, scopeGate, EEM_OFF } from "./lib-vestslice.mjs";

const argv = process.argv.slice(2);
/* `i >= 0`, not `i > 0`: the first flag sits at index 0 of the sliced argv, and
 * a `> 0` test silently ignores it — a clean zero reporting on the query. */
const num = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? +argv[i + 1] : d; };
const str = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
if (argv.length && !argv.some((a) => a.startsWith("--"))) throw new Error("no flag parsed — check the argv slice");
const RANK = num("--rank", 0), DRAW = num("--draw", 0), SEED = num("--seed", 1);
const ONE = str("--ack");
/* *A BEFORE/AFTER SCREEN MUST ASK THE BEFORE SIDE'S INDEX.* Once v215's
 * `eemOnly` arm is inside the gate, `passes` is TRUE for ~458 of the plans this
 * script exists to count, so a post-ship run reports a SMALLER bucket — which
 * is correct as a measure of what the gate still refuses, and useless as a
 * measure of what v215 moved. `--pre-v215` hands the sliced gate an arm that
 * answers null, giving the pre-ship gate exactly, so the two readings differ in
 * one value and nothing else. */
const PRE = argv.includes("--pre-v215");
const JSONOUT = argv.includes("--json");

const FORM_ARMS = [
  [/\.{5,}/], [/123456789012/], [/\b\d[a-z]\(\d\)/],
  [/\bNumber of participants who\b/i], [/\b(?:Form|Schedule [A-Z]\b.{0,20})5500\b/i],
  [/\bnumber of deferred vested\b/i], [/\bOMB No\b/i],
];
const isForm = (s) => FORM_ARMS.some(([re]) => re.test(s));

const L = buildLedger({ withStatus: false });
const absent = [];
for (const p of L.plans) {
  const c = p.cells.vesting;
  if (c.state === "absent" && !c.why.startsWith("no features"))
    absent.push({ name: p.sponsorName, ein: p.ein, pn: p.pn, ppl: p.ppl, ack: p.ack });
}
if (!absent.length) throw new Error("absent population empty — the cell states or why-prefix moved");

/** Every oracle-accepted candidate with its gate verdict. */
function judge(row) {
  const raw = read(row.ack);
  if (!raw) return { judged: false };
  const sel = vestingSelection(raw);
  const out = [];
  let anyPass = false;
  for (const c of sel.vestSentences || []) {
    const s = typeof c === "string" ? c : (c && (c.s || c.text)) || "";
    if (!s) continue;
    if (!vestingQuoteOk(s)) continue;
    if (isForm(s)) continue;
    const g = PRE ? scopeGate(s, sel.t, row.name || "", 1, undefined, EEM_OFF)
                  : scopeGate(s, sel.t, row.name || "");
    if (g.passes) anyPass = true;
    out.push({ s, g });
  }
  return { judged: true, cands: out, anyPass, n: (sel.vestSentences || []).length };
}

if (ONE) {
  const row = absent.find((r) => r.ack === ONE) || { name: str("--name") || "", ack: ONE, ppl: 0 };
  const v = judge(row);
  console.log(`${row.name} — ${row.ack} — ${row.ppl} ppl — judged=${v.judged} cands=${v.cands?.length} anyPass=${v.anyPass}`);
  for (const c of v.cands || []) console.log(`  [${c.g.passes ? "PASS" : "gate"} emp=${+!!c.g.employerMoney} uni=${+!!c.g.universal} str=${+!!c.g.strictGate} wa=${+!!c.g.wholeAcctOnly} uv=${+!!c.g.uvOnly}] ${c.s}`);
  process.exit(0);
}

const gated = [];
for (const r of absent) {
  const v = judge(r);
  if (!v.judged || v.anyPass || !v.cands.length) continue;
  gated.push({ ...r, cands: v.cands });
}
const sum = (a) => a.reduce((s, r) => s + r.ppl, 0);
console.error(`GATED: ${gated.length} plans / ${sum(gated).toLocaleString()} readers (re-derived)`);

if (JSONOUT) { console.log(JSON.stringify(gated.map((g) => ({ ...g, cands: g.cands.map((c) => ({ s: c.s, g: c.g })) })))); process.exit(0); }

/* a seeded LCG, so a draw is reproducible and quotable */
function shuffled(arr, seed) {
  let x = seed >>> 0 || 1;
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    x = (x * 1664525 + 1013904223) >>> 0;
    const j = x % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const show = (list, title) => {
  console.log(`\n==== ${title} ====`);
  for (const r of list) {
    console.log(`\n--- ${r.ppl} ppl  ${r.name}  ${r.ack}`);
    for (const c of r.cands.slice(0, 6))
      console.log(`   | ${c.s.slice(0, 460)}`);
  }
};
if (RANK) show([...gated].sort((a, b) => b.ppl - a.ppl).slice(0, RANK), `RANKED top ${RANK} by readers`);
if (DRAW) show(shuffled(gated, SEED).slice(0, DRAW), `SEEDED DRAW ${DRAW} (seed ${SEED})`);
