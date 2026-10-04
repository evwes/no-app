#!/usr/bin/env node
/* wampo — the PARTICIPANT-WEIGHTED DRAW over PUBLISHED fund menus, 2026-10-04.
 *
 * WHY THIS IS TRACKED RATHER THAN A SCRATCH SCRIPT. The hourly cycle's
 * hands-on review draws a plan at random, weighted by participants, and reads
 * what the page publishes. That instrument lived in `scratchpad/` — gitignored,
 * wiped twice — and it carried a defect that silently affected every draw made
 * through it. The project has already paid for this exact mistake once:
 * `scripts/apppath.mjs` was shadowed by a stale `scratchpad/apppath.mjs` under
 * the same basename, and 81 measurement scripts imported the wrong one.
 *
 * THE DEFECT IT FIXES, measured 2026-10-04 08:3xZ. The scratch version drew
 * from every stored entry in `data/lineups/*.json`. The SITE only renders a
 * lineup when the entry is CONFIDENT (`lineups-index`'s bit 1, which agrees
 * with `entry.confident` on all 60,163 of them — the agreement is the control
 * that both reads are right). So 1,265 entries / 10,317,233 participants —
 * **9.1% of the pool's weight** — were drawable but published to nobody, and
 * the draw presented them as though a reader saw them. It drew one: The Home
 * Depot's own ack (468,817 ppl), whose four-row $3,544,514 "menu" is three Form
 * 5500 form artifacts (the plan administrator's name at 92%, a form-field
 * fragment `g(1) complete this item)`, a participant-count caption) beside
 * $15,698,707,253 of plan assets. That is `confident: false` and reaches no
 * reader: the page serves its MASTER TRUST's 33-fund $14.02B menu instead.
 * *A STORED field is not a PUBLISHED one* — met on the measuring instrument.
 * The three largest unpublished-but-drawable entries are all the same
 * documented shape, a non-confident plan ack beside a confident trust: Target
 * (495,482), Home Depot (468,817), Kroger (411,922).
 *
 * WHAT IT PRINTS, and every field is there for a recorded reason:
 *   - the ISSUER column, because `lookupTicker` prepends it before asking the
 *     resolver. A draw that omitted it read Amedisys's `Income Fund` -> =DODIX
 *     as an unsupported assertion and sized a 45,976-row class around it; the
 *     filing names Dodge & Cox in the issuer cell. *An omitted INPUT field
 *     makes a correct page look wrong.*
 *   - `star`, because a comparable renders an asterisk and a footnote: the row
 *     is labelled an approximation, not an identification. A draw that printed
 *     `tk` and dropped `star` was one paragraph from publishing a false claim
 *     about Intel. *An asterisk is a whole category of claim.*
 *   - the suppression FLAGS, because app.js withholds a fee on eleven separate
 *     grounds and a harness that prints the fee without them reports an upper
 *     bound.
 *   - menu sum against plan assets, which is the ratio every junk menu fails.
 *
 * It renders through `scripts/apppath.mjs` with `tab: "menu"` — the only value
 * a first render ever sees, since `filedLineupTable` computes
 * `tab = hasSma ? (state.lineupTab[plan.id] || "menu") : "menu"`. Passing
 * "all" makes every row read `tk —`/`er —` and returns a tidy all-identical
 * count that a positive control catches and a count never would.
 *
 *   node scripts/draw-published.mjs [n] [--seed <s>] [--rows <k>] [--all]
 *
 * `--seed` makes a draw REPRODUCIBLE, which is not a convenience: on
 * 2026-10-04 a drawn plan was lost because re-running the script to see the
 * rest of its output drew a different plan. `--all` lifts the confident gate
 * and is for auditing the gate itself; it prints a loud banner, because a
 * figure taken with it is not a statement about readers.
 */
import { readFileSync, existsSync } from "node:fs";
import { loadPlans } from "./lib-schema.mjs";
import { buildRenderer } from "./apppath.mjs";

const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : def;
};
const N = Number(argv.find((a) => /^\d+$/.test(a)) || 2);
const ROWS = Number(flag("--rows", 14));
const ALL = argv.includes("--all");
const SEED = flag("--seed", null);
const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

/* a seeded PRNG, so a draw can be re-read rather than re-rolled */
function rng(seed) {
  if (seed === null) return Math.random;
  let h = 2166136261 >>> 0;
  for (const c of String(seed)) h = (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0);
  return () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5; h >>>= 0;
    return h / 4294967296;
  };
}
const rand = rng(SEED);

const { renderRow, clean, setPlans } = buildRenderer();

/* THE PUBLISHED GATE. `lineups-index.json`'s ack map lives under `.plans`, not
 * at the top level — reading `idx[ack]` returned undefined for all 61,428 acks
 * including confident ones, a clean zero across a whole population reporting
 * on the query. There is no lib-schema loader for this file, which is exactly
 * why a guessed field name was possible, so the shape is asserted here. */
const idxFile = JSON.parse(readFileSync(`${ROOT}/lineups-index.json`, "utf8"));
if (!idxFile.plans || typeof idxFile.plans !== "object")
  throw new Error(`draw-published: lineups-index.json has no .plans map; its keys are ${Object.keys(idxFile).join(", ")}`);
const INDEX = idxFile.plans;

const d = loadPlans();
setPlans(d.rows.map((r) => ({ sponsorName: d.get(r, "sponsorName"), ticker: d.get(r, "ticker") })));

/* EVERY member plan of each ack, never a first-wins map: a trust row resolved
 * through one arbitrary member is how a page count went wrong, and this record
 * carries eight instances of a plan-keyed count being blind to a trust. */
const members = new Map();
for (const r of d.rows) {
  const o = { sponsorName: d.get(r, "sponsorName"), ein: d.get(r, "ein"), pn: d.get(r, "pn"),
    ticker: d.get(r, "ticker"), ppl: d.get(r, "partEOY") || d.get(r, "participants") || 0,
    assets: d.get(r, "assetsEOY") || 0, planYear: d.get(r, "planYear") };
  for (const a of [d.get(r, "ack"), d.get(r, "mtiaAck")]) {
    if (!a) continue;
    if (!members.has(a)) members.set(a, []);
    members.get(a).push(o);
  }
}

const pool = [];
let skippedUnpublished = 0, skippedPpl = 0;
for (let s = 0; s < 64; s++) {
  const f = `${ROOT}/data/lineups/${String(s).padStart(2, "0")}.json`;
  if (!existsSync(f)) continue;
  for (const [ack, e] of Object.entries(JSON.parse(readFileSync(f, "utf8")))) {
    const mem = members.get(ack);
    if (!mem || !e.funds || !e.funds.length) continue;
    const ppl = mem.reduce((a, m) => a + m.ppl, 0);
    if (ppl <= 0) continue;
    const published = ((INDEX[ack] || 0) & 1) === 1;
    if (!published && !ALL) { skippedUnpublished++; skippedPpl += ppl; continue; }
    pool.push({ ack, e, mem, ppl, published });
  }
}
/* ASSERTED, in both directions, against the case that exposed the defect: a
 * pin that can only pass is decorative, so the gate is checked by a row it
 * must EXCLUDE as well as one it must admit. */
if (!ALL) {
  const HD_PLAN = "20260714155858NAL0001241043001";   // confident:false, 4 form artifacts
  const HD_TRUST = "20260715102148NAL0001978259001";  // confident:true, 33 funds / $14.02B
  const has = (a) => pool.some((p) => p.ack === a);
  if (has(HD_PLAN) && members.has(HD_PLAN))
    throw new Error("draw-published: the confident gate is not holding — Home Depot's non-confident plan ack is drawable, and its menu is three Form 5500 form artifacts");
  if (members.has(HD_TRUST) && !has(HD_TRUST))
    throw new Error("draw-published: the confident gate is TOO TIGHT — Home Depot's confident trust ack (33 funds, $14.02B) is not drawable");
}

const total = pool.reduce((a, p) => a + p.ppl, 0);
console.log(`pool: ${pool.length.toLocaleString()} ${ALL ? "stored" : "PUBLISHED"} menus reaching ${total.toLocaleString()} participants`
  + (SEED === null ? "" : `   seed=${JSON.stringify(SEED)}`));
if (ALL) console.log(`  !! --all: the confident gate is OFF. These menus include entries NO READER SEES.\n     A figure taken this way is not a statement about readers.`);
else console.log(`  (${skippedUnpublished.toLocaleString()} stored menus / ${skippedPpl.toLocaleString()} participants excluded as not published)`);

const used = new Set();
const picks = [];
while (picks.length < N && used.size < pool.length) {
  let t = rand() * total, i = 0;
  for (; i < pool.length; i++) { t -= pool[i].ppl; if (t <= 0) break; }
  if (i >= pool.length) i = pool.length - 1;
  if (used.has(i)) continue;
  used.add(i);
  picks.push(pool[i]);
}

for (const p of picks) {
  const lead = p.mem.slice().sort((a, b) => b.ppl - a.ppl)[0];
  const sum = p.e.funds.reduce((a, x) => a + (+x.value || 0), 0);
  const sorted = p.e.funds.slice().sort((a, b) => (+b.value || 0) - (+a.value || 0));
  /* THE DENOMINATOR IS THE SUM OVER EVERY MEMBER PLAN, NOT THE LEAD PLAN'S
   * ASSETS. Found on this script's second use: Meijer drew `ratio 3.345`
   * because a TRUST menu shared by two member plans was compared against one
   * of them. That is this record's most repeated error — a count keyed on
   * plans is blind to a trust, met eight times — reappearing inside the fix
   * for a different instrument defect. The lead plan's own figure is printed
   * beside it so a single-plan entry reads identically. */
  const memAssets = p.mem.reduce((a, m) => a + Number(m.assets || 0), 0);
  const ratio = memAssets ? sum / memAssets : null;
  console.log(`\n${"=".repeat(96)}`);
  console.log(`${lead.sponsorName}  ein=${lead.ein} pn=${lead.pn}  ${p.ppl.toLocaleString()} ppl across ${p.mem.length} member plan(s)`);
  console.log(`ack ${p.ack}${p.published ? "" : "   [NOT PUBLISHED]"}  ${p.e.funds.length} funds`);
  console.log(`menu sum $${Math.round(sum).toLocaleString()} vs assetsEOY $${Math.round(memAssets).toLocaleString()}`
    + (p.mem.length > 1 ? ` summed over ${p.mem.length} member plans (lead alone: $${Number(lead.assets).toLocaleString()})` : "")
    + (ratio === null ? "" : `  ratio ${ratio.toFixed(3)}`));
  console.log(`source: ${JSON.stringify(String(p.e.source || "").slice(0, 110))}`);
  console.log("-".repeat(96));
  sorted.slice(0, ROWS).forEach((fd, i) => {
    const raw = String(fd.name).replace(/\s+(?:N\/R|\$?0\.00)$/i, "").trim();
    const nm = clean(raw);
    const v = renderRow(lead, { ...fd, nameRaw: raw, name: nm }, "menu", sum);
    const pct = sum ? (+fd.value || 0) / sum * 100 : 0;
    const flags = Object.entries(v.flags || {}).filter(([, x]) => x).map(([k]) => k).join(",");
    console.log(`${String(i).padStart(2)} ${pct.toFixed(1).padStart(5)}% $${String(Math.round(+fd.value || 0).toLocaleString()).padStart(14)}  `
      + `tk ${((v.star ? "~" : " ") + String(v.tk || "-")).padEnd(7)} er ${String(v.er ?? "-").padEnd(6)} type ${JSON.stringify(String(v.shownType || "")).slice(0, 24).padEnd(26)}`);
    console.log(`        iss ${JSON.stringify(String(fd.iss || "").slice(0, 34)).padEnd(36)} shown ${JSON.stringify(String(v.name || nm).slice(0, 56))}`);
    if (flags) console.log(`        flags ${flags}`);
  });
  if (sorted.length > ROWS) console.log(`   ... ${sorted.length - ROWS} more rows`);
}
