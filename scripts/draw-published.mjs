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
/* N IS A POSITIONAL ARGUMENT AND MUST NOT BE READ OUT OF A FLAG'S VALUE.
 * Found 2026-10-04 19:1xZ: this line was `argv.find(a => /^\d+$/.test(a))`,
 * and `--seed 19082026` is an all-digit argv entry, so N became **19,082,026**.
 * The draw then walked the ENTIRE 60,163-entry pool and rendered every menu in
 * it, which looks exactly like a hang — and the one seeded draw that appeared
 * to work had simply printed pick 1 of nineteen million before being killed.
 * Its drawn plan was still a correct participant-weighted first pick, so the
 * record from it stands; what was lost was every later pick and ten minutes a
 * cycle. Flag VALUES are excluded by name here rather than by shape, because
 * "looks like a number" is what broke it. */
const FLAGS_WITH_VALUES = ["--seed", "--rows"];
const positional = argv.filter((a, i) => {
  if (a.startsWith("--")) return false;
  const prev = argv[i - 1];
  return !(prev && FLAGS_WITH_VALUES.includes(prev));
});
const N = Number(positional.find((a) => /^\d+$/.test(a)) || 2);
if (!(N >= 1 && N <= 50)) throw new Error(`draw-published: N=${N} is not a sane draw size (1-50) — a flag value was probably read as the count`);
const ROWS = Number(flag("--rows", 14));
const ALL = argv.includes("--all");
const SEED = flag("--seed", null);
const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

/* A TRUNCATED PRINT MUST SAY IT IS TRUNCATED — 2026-10-10, and this one cost a
 * whole false defect class.
 *
 * Every field here used to print as `JSON.stringify(x).slice(0, n)`, which cuts
 * INSIDE the quoted string and throws away the CLOSING QUOTE. Short values kept
 * both quotes, so the output looked uniform — and a long name arrived as
 * `shown "Trust TD2 Capital Group 2030 Target Date Retirement Trus`, which I
 * read as a fund name the parser had cut off mid-word. The stored name is
 * `… Retirement Trust TD2`, complete. I then sized, fixtured and nearly shipped
 * a "rotated and truncated name" class that does not exist, and the whole-store
 * scan reading 0 is what sent me back to the stored string.
 *
 * So: cut inside, then re-quote, then append an explicit marker. A value that
 * was shortened can never again be mistaken for one that was not. The record
 * already carries *a truncated print can turn a complete answer into a defect*
 * from a 128-character window over filing text; this is the same rule met in
 * my own instrument's output column, which is the harder place to see it. */
function cut(x, n) {
  const s = String(x == null ? "" : x);
  return s.length <= n ? JSON.stringify(s) : JSON.stringify(s.slice(0, n)) + "…+" + (s.length - n);
}

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
    assets: d.get(r, "assetsEOY") || 0, planYear: d.get(r, "planYear"),
    /* the plan's own and linked-trust acks, needed to ask which menu its page
     * actually serves — see servedBy() below */
    ack: d.get(r, "ack"), mtiaAck: d.get(r, "mtiaAck") };
  for (const a of [d.get(r, "ack"), d.get(r, "mtiaAck")]) {
    if (!a) continue;
    if (!members.has(a)) members.set(a, []);
    members.get(a).push(o);
  }
}

/* AND BEING A MEMBER OF AN ACK IS NOT BEING SERVED ITS MENU — found 2026-10-09
 * by a draw made through this very file.
 *
 * Both surfaces serve a trust's menu ONLY where the plan's own lineup is
 * unusable (`app.js:2898`, `build-seo-pages.mjs:111`). This pool credited every
 * member plan of a published trust ack with its full participant count, so a
 * plan with a perfectly good menu of its own was weighted onto its trust's menu
 * as well. Measured over every published trust ack: **3,350,019 participants,
 * 28.1% of the credited trust weight**, are credited to a menu their page never
 * shows.
 *
 * It drew one. Bank of America pn=003 (246,394 ppl) came up on its TRUST's ack,
 * whose 15 rows are all guaranteed investment contracts summing $4.58B against
 * the plan's filed $71.5B — a menu covering 6.4% of the plan, which reads
 * exactly like a serious accuracy defect. It is not: BofA's own ack is
 * confident and its page shows its own menu, so that trust entry reaches no
 * reader. The entry is also correctly judged — `coverageRatio` 0.85 against the
 * TRUST's own assets, which is the right denominator for what it measures.
 *
 * This is the same class of error the file's own header records EIGHT instances
 * of, and the second one inside this tool: the earlier fix added the CONFIDENT
 * gate (9.1% of the weight was entries no reader sees) and never asked the
 * second question. *A gate on whether a menu is publishABLE is not a gate on
 * whether THIS plan is shown it.*
 *
 * The condition is imported rather than retyped — `lib-ledger.mjs` is the one
 * place it lives, and a transcription of a shipped expression rots as the
 * expression grows. */
import { servedLineup } from "./lib-ledger.mjs";
const servedBy = (m) => servedLineup(m, INDEX).ack;

const pool = [];
let skippedUnpublished = 0, skippedPpl = 0, skippedUnserved = 0, skippedUnservedPpl = 0;
for (let s = 0; s < 64; s++) {
  const f = `${ROOT}/data/lineups/${String(s).padStart(2, "0")}.json`;
  if (!existsSync(f)) continue;
  for (const [ack, e] of Object.entries(JSON.parse(readFileSync(f, "utf8")))) {
    const all = members.get(ack);
    if (!all || !e.funds || !e.funds.length) continue;
    /* THE TWO GATES RUN IN THIS ORDER ON PURPOSE, and the order is the whole
     * reason the telemetry below still means anything. `servedBy` can only ever
     * return a CONFIDENT ack, so filtering by it first makes `mem` empty for
     * every unpublished entry and the "excluded as not published" counter
     * silently reads 0 — which is how the first version of this fix reported
     * that nothing was excluded, where the truth is 1,265 menus and 10,317,233
     * participants. *A clean zero reports on the query.* So: publish gate
     * first, against the FULL member weight, then the serving filter. */
    const pplAll = all.reduce((a, m) => a + m.ppl, 0);
    if (pplAll <= 0) continue;
    const published = ((INDEX[ack] || 0) & 1) === 1;
    if (!published && !ALL) { skippedUnpublished++; skippedPpl += pplAll; continue; }
    /* ONLY the members this ack's menu is actually SERVED to. With --all the
     * serving condition is lifted along with the confident gate, since that
     * mode exists to audit the gates themselves and says so loudly. */
    const mem = ALL ? all : all.filter((m) => servedBy(m) === ack);
    const ppl = mem.reduce((a, m) => a + m.ppl, 0);
    if (!mem.length || ppl <= 0) { skippedUnserved++; skippedUnservedPpl += pplAll; continue; }
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

  /* THE SERVING CONDITION, pinned on the case that exposed it. Bank of America
   * pn=003 is a member of this trust ack AND has a confident menu of its own,
   * so its 246,394 participants must not be weighted onto the trust's 15-GIC
   * menu. Asserted by WEIGHT rather than by the ack's presence, because the
   * trust legitimately serves other members and excluding it outright would be
   * the opposite error. */
  const BOFA_TRUST = "20260807124444NAL0005911459001";
  const bofaEntry = pool.find((p) => p.ack === BOFA_TRUST);
  if (bofaEntry && bofaEntry.mem.some((m) => m.ein === "560906609" && m.pn === "003"))
    throw new Error("draw-published: the SERVING condition is not holding — Bank of America pn=003 "
      + "(246,394 ppl) has its own confident menu and is still being credited to its trust's 15-GIC "
      + "menu, which covers 6.4% of the plan and reaches no reader");
}

const total = pool.reduce((a, p) => a + p.ppl, 0);
console.log(`pool: ${pool.length.toLocaleString()} ${ALL ? "stored" : "PUBLISHED"} menus reaching ${total.toLocaleString()} participants`
  + (SEED === null ? "" : `   seed=${JSON.stringify(SEED)}`));
if (ALL) console.log(`  !! --all: the confident gate is OFF. These menus include entries NO READER SEES.\n     A figure taken this way is not a statement about readers.`);
else {
  console.log(`  (${skippedUnpublished.toLocaleString()} stored menus / ${skippedPpl.toLocaleString()} participants excluded as not published)`);
  /* The second exclusion, reported separately because it is a different
   * fact: these menus ARE publishable and every member plan of them is
   * served its own menu instead, so they reach no reader through this ack. */
  console.log(`  (${skippedUnserved.toLocaleString()} publishable menus / ${skippedUnservedPpl.toLocaleString()} participants excluded as served their OWN menu instead)`);
}

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
  /* `cut` is defined above; see its comment — a truncated print must SAY it is
   * truncated, because this file's old `JSON.stringify(x).slice(0, n)` cut the
   * closing quote off and a shortened name read as a complete one. */
  console.log(`${lead.sponsorName}  ein=${lead.ein} pn=${lead.pn}  ${p.ppl.toLocaleString()} ppl across ${p.mem.length} member plan(s)`);
  console.log(`ack ${p.ack}${p.published ? "" : "   [NOT PUBLISHED]"}  ${p.e.funds.length} funds`);
  console.log(`menu sum $${Math.round(sum).toLocaleString()} vs assetsEOY $${Math.round(memAssets).toLocaleString()}`
    + (p.mem.length > 1 ? ` summed over ${p.mem.length} member plans (lead alone: $${Number(lead.assets).toLocaleString()})` : "")
    + (ratio === null ? "" : `  ratio ${ratio.toFixed(3)}`));
  console.log(`source: ${cut(p.e.source, 110)}`);
  console.log("-".repeat(96));
  sorted.slice(0, ROWS).forEach((fd, i) => {
    const raw = String(fd.name).replace(/\s+(?:N\/R|\$?0\.00)$/i, "").trim();
    const nm = clean(raw);
    const v = renderRow(lead, { ...fd, nameRaw: raw, name: nm }, "menu", sum);
    const pct = sum ? (+fd.value || 0) / sum * 100 : 0;
    const flags = Object.entries(v.flags || {}).filter(([, x]) => x).map(([k]) => k).join(",");
    console.log(`${String(i).padStart(2)} ${pct.toFixed(1).padStart(5)}% $${String(Math.round(+fd.value || 0).toLocaleString()).padStart(14)}  `
      + `tk ${((v.star ? "~" : " ") + String(v.tk || "-")).padEnd(7)} er ${String(v.er ?? "-").padEnd(6)} type ${cut(v.shownType, 24).padEnd(26)}`);
    console.log(`        iss ${cut(fd.iss, 34).padEnd(36)} shown ${cut(v.name || nm, 56)}`);
    if (flags) console.log(`        flags ${flags}`);
  });
  if (sorted.length > ROWS) console.log(`   ... ${sorted.length - ROWS} more rows`);
}
