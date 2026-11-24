#!/usr/bin/env node
/* wampo — READ THE SENTENCES THE VESTING SCOPE GATE REFUSES.
 *
 * `vesting-quote-ceiling.mjs` reports that 2,868 plans / 5.39M readers of the
 * vesting-absent bucket are GATED: `vestingQuoteOk` accepts a candidate and
 * `scopeGate(s, t, sponsor).passes` is false, so the immediate-vesting loop's
 * `continue` runs before every quote fallback and the filing stores nothing.
 *
 * THAT IS A POPULATION, NOT A DEFECT. The gate exists to refuse a vesting claim
 * about EMPLOYEE money, which is vested by law — "immediately vested in their
 * voluntary contributions" is the refusal the whole mechanism is built on. This
 * record's rule is explicit: *when a class is a semantic judgment, do not screen
 * for the ABSENCE of the good case; require the PRESENCE of the bad one* — five
 * screens for "this sentence is not about vesting" were each refuted by reading
 * their own members. So this script does not classify. It PRINTS, so the
 * sentences can be read, and it prints every field the gate acts on:
 *   - the three shipped arms plus v211's, so a reader can see WHICH refusal it is
 *   - the sponsor-money regex actually built for this plan (the v209 arm is
 *     sponsor-keyed, so the same sentence is admitted for one plan and refused
 *     for another, and omitting it makes a correct refusal look arbitrary)
 *   - the FULL sentence, never a truncation: *a truncated print can turn a
 *     complete answer into a defect*.
 *
 * TWO SAMPLES, because *RANK to pick what to READ; draw RANDOMLY to estimate a
 * RATE*: `--rank N` takes the N largest by readers, `--draw N [--seed S]` takes
 * a seeded uniform draw. Large plans file long attachments and are
 * systematically different from the bucket's bulk, so a rate read off the rank
 * is not a rate.
 *
 * Usage: node scripts/vesting-gate-read.mjs [--rank N] [--draw N] [--seed S]
 *                                           [--tag T] [--json out.json]
 */
import { writeFileSync } from "node:fs";
import { buildLedger } from "./lib-ledger.mjs";
import { read } from "./lib-filingtext.mjs";
import { vestingQuoteOk } from "./lib-quote.mjs";
import { vestingSelection, scopeGate } from "./lib-vestslice.mjs";
import { sponsorMoneyRe } from "./lib-4i.mjs";

const argv = process.argv.slice(2);
/* `i >= 0`, not `i > 0`: the FIRST flag sits at index 0, and `i > 0` silently
 * ignored it — `--json out` wrote nothing and read exactly like a run that had
 * nothing to write. A clean no-op reports on the query. */
const num = (f, d) => { const i = argv.indexOf(f); if (i >= 0 && !argv[i + 1]) throw new Error(`${f} needs a value`); return i >= 0 ? +argv[i + 1] : d; };
const str = (f, d) => { const i = argv.indexOf(f); if (i >= 0 && !argv[i + 1]) throw new Error(`${f} needs a value`); return i >= 0 ? argv[i + 1] : d; };
const RANK = num("--rank", 0), DRAW = num("--draw", 0), SEED = num("--seed", 20261124);
const JSONOUT = str("--json", "");

/* same form-noise arms the ceiling uses, read from that file rather than guessed */
const FORM_ARMS = [
  [/\.{5,}/], [/123456789012/], [/\b\d[a-z]\(\d\)/], [/\bNumber of participants who\b/i],
  [/\b(?:Form|Schedule [A-Z]\b.{0,20})5500\b/i], [/\bnumber of deferred vested\b/i], [/\bOMB No\b/i],
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

/** The GATED verdict for one plan: every oracle-accepted, gate-refused sentence. */
function gatedSentences(row) {
  const raw = read(row.ack);
  if (!raw) return null;
  const sel = vestingSelection(raw);
  const out = [];
  for (const c of sel.vestSentences || []) {
    const s = typeof c === "string" ? c : (c && (c.s || c.text)) || "";
    if (!s || !vestingQuoteOk(s) || isForm(s)) continue;
    const g = scopeGate(s, sel.t, row.name || "");
    if (g.passes) return { passes: true };     // REACH, not GATED
    out.push({ s, ...g });
  }
  return out.length ? { passes: false, sents: out } : { passes: false, sents: [] };
}

const gated = [];
for (const r of absent) {
  const v = gatedSentences(r);
  if (!v || v.passes || !v.sents.length) continue;
  gated.push({ ...r, sents: v.sents });
}
const sum = (a) => a.reduce((s, r) => s + r.ppl, 0);
console.log(`GATED population re-derived: ${gated.length} plans / ${sum(gated).toLocaleString()} readers\n`);

/* mulberry32 — a named, reproducible generator; `Math.random` would make the
 * draw unrepeatable and so unciteable. */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function show(title, rows) {
  console.log(`======== ${title} (${rows.length} plans / ${sum(rows).toLocaleString()} readers) ========`);
  for (const r of rows) {
    const re = sponsorMoneyRe(r.name || "");
    console.log(`\n--- ${r.ppl} ppl · ${r.name} · ${r.ein}|${r.pn} · ${r.ack}`);
    console.log(`    sponsorMoneyRe: ${re ? String(re) : "(null — no usable sponsor token)"}`);
    r.sents.forEach((x, i) => {
      console.log(`    [${i}] emp=${x.employerMoney ? 1 : 0} univ=${x.universal ? 1 : 0} strict=${x.strictGate ? 1 : 0} wa=${x.wholeAcctOnly ? 1 : 0}`);
      console.log(`        ${x.s}`);
    });
  }
  console.log("");
}

const byPpl = [...gated].sort((a, b) => b.ppl - a.ppl);
if (RANK) show("RANKED — largest by readers", byPpl.slice(0, RANK));
if (DRAW) {
  const r = rng(SEED), pool = [...gated];
  const pick = [];
  for (let i = 0; i < DRAW && pool.length; i++) pick.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  show(`SEEDED UNIFORM DRAW (seed ${SEED})`, pick);
}
if (JSONOUT) { writeFileSync(JSONOUT, JSON.stringify({ n: gated.length, ppl: sum(gated), gated }, null, 1)); console.log(`wrote ${JSONOUT}`); }
console.log("These figures are DERIVED. Re-run; never copy them forward.");
