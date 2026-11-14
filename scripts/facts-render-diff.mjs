#!/usr/bin/env node
/* wampo — THE DIFFERENTIAL FOR A SOURCING BATCH: what changes on the page when
 * `fund-facts.js` gains entries and NOTHING ELSE MOVES.
 *
 * WHY THIS EXISTS AS ITS OWN INSTRUMENT. `vehicle-render-diff.mjs` varies
 * `app.js` and loads the SAME `fund-facts.js` on both sides, by design — its
 * header says so. A sourcing batch is the opposite change: identical page code,
 * a different sourced-figure table. There was no instrument for it, so every
 * batch so far has been shipped on the checker's entry count, which says how
 * many FACTS were written and nothing at all about how many CELLS move. *A
 * STORED FIELD IS NOT A PUBLISHED ONE.*
 *
 * And the number that matters most is not the gain. A sourced figure OUTRANKS
 * the pattern estimate (`erShown = erSourced ? erSourced.er : er`), so a batch
 * can CHANGE a fee a reader is already being shown. That is a published claim
 * moving, it is the direction in which the Black Hills defect did its damage,
 * and it must be counted separately from a blank being filled:
 *
 *   - fee NEWLY published   the cell was empty, now it is not
 *   - fee CHANGED           the cell held the estimate, now it holds the source
 *   - fee WITHDRAWN         the cell held a figure, now it holds none
 *
 * A CHANGED fee is reported with both values and the row's filed name, because
 * a disagreement between the estimate and the source is a TICKER question, not
 * a fee question, and only reading the name can settle it.
 *
 * Run: node scripts/facts-render-diff.mjs <before/fund-facts.js> [--sample 25]
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRenderer } from "./apppath.mjs";
import { loadPlans } from "./lib-schema.mjs";
import { servedLineup } from "./lib-ledger.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BEFORE = process.argv[2];
const SAMPLE = (() => { const i = process.argv.indexOf("--sample"); return i > 0 ? +process.argv[i + 1] : 25; })();

/* THE BEFORE MUST BE PINNED AND THE PIN MUST BE TESTED. A `{app:}` for
 * `{appjs:}` typo once made both renderers read the working tree and print a
 * perfect zero -- a before that is silently the after reads as a clean
 * no-difference. So: the path is required, must exist, and must DIFFER from the
 * working tree's asset, or there is nothing to measure and we say so loudly
 * rather than printing zeros. */
if (!BEFORE) throw new Error("usage: facts-render-diff.mjs <before/fund-facts.js> [--sample N]");
if (!existsSync(BEFORE)) throw new Error(`BEFORE asset does not exist: ${BEFORE}`);
const beforeSrc = readFileSync(BEFORE, "utf8");
const afterSrc = readFileSync(path.join(ROOT, "fund-facts.js"), "utf8");
if (beforeSrc === afterSrc) {
  throw new Error("BEFORE and AFTER fund-facts.js are byte-identical — there is no difference to measure, and a zero here would be reporting on the query");
}

const common = { appjs: path.join(ROOT, "app.js") };
const A = buildRenderer({ ...common, fundfacts: BEFORE });
const B = buildRenderer({ ...common, fundfacts: path.join(ROOT, "fund-facts.js") });

const lidx = JSON.parse(readFileSync(`${ROOT}/lineups-index.json`, "utf8")).plans;
const d = loadPlans();
const plansForRenderer = d.rows.map((r) => ({ sponsorName: d.get(r, "sponsorName"), ticker: d.get(r, "ticker") }));
A.setPlans(plansForRenderer); B.setPlans(plansForRenderer);

const members = new Map();
for (const row of d.rows) {
  const p = { ack: d.get(row, "ack"), mtiaAck: d.get(row, "mtiaAck"),
    ein: d.get(row, "ein"), pn: d.get(row, "pn"),
    participants: +d.get(row, "partEOY") || +d.get(row, "participants") || 0,
    sponsorName: String(d.get(row, "sponsorName") || "").trim(), ticker: d.get(row, "ticker") };
  const s = servedLineup(p, lidx);
  if (!s.ack) continue;
  if (!members.has(s.ack)) members.set(s.ack, []);
  members.get(s.ack).push(p);
}

/* ---- THE NARROWING, AND ITS DISCHARGE --------------------------------------
 *
 * The first version of this script rendered BOTH sides over all 1.78M rows:
 * 3.56M renderRow calls, and it had not finished in twenty minutes. The
 * narrowing is a property of the change, and it must gate the RENDER rather
 * than only the comparison.
 *
 * DISCHARGED STRUCTURALLY, by reading app.js rather than by sampling --
 * sampling cannot establish a superset:
 *
 *   - `FUND_FACTS` is read at exactly ONE site, app.js:4766-4767, inside
 *     `if (!star && tk && typeof FUND_FACTS === "object" && FUND_FACTS)`.
 *   - `tk` (4524) and `star` (4527) are `const`, assigned from `lookupTicker`,
 *     which never reads FUND_FACTS. They are the CONDITION of that site, so
 *     they cannot be functions of it.
 *   - `er` (4661), the pattern estimate, is computed before the site.
 *   - `shownType` (4855) is a chain of row-shape predicates and reads none of
 *     the site's outputs.
 *
 * So a row's cells can move only if `FUND_FACTS[tk]` itself moved. The key
 * delta is computed here from the two assets, and asserted to be ADDITIVE --
 * if any key were REMOVED or CHANGED the narrowing would still hold, but the
 * script says so loudly, because a removal is a withdrawn published figure.
 *
 * A random sample of NON-candidate rows is then rendered on both sides and
 * required to show zero difference. That corroborates the structural argument;
 * it does not establish it.
 */
const keysOf = (src) => {
  const decl = "const FUND_FACTS = {";
  const at = src.indexOf(decl);
  if (at < 0) throw new Error("no FUND_FACTS declaration in one of the assets");
  const open = at + decl.length - 1;
  return JSON.parse(src.slice(open, src.indexOf("\n};", open) + 2));
};
const kA = keysOf(beforeSrc), kB = keysOf(afterSrc);
const addedK = Object.keys(kB).filter((k) => !(k in kA));
const removedK = Object.keys(kA).filter((k) => !(k in kB));
const changedK = Object.keys(kA).filter((k) => k in kB && JSON.stringify(kA[k]) !== JSON.stringify(kB[k]));
const CAND = new Set([...addedK, ...removedK, ...changedK].map((k) => k.toUpperCase()));
console.log(`FUND_FACTS key delta: ${addedK.length} added, ${removedK.length} removed, ${changedK.length} changed`);
if (removedK.length) console.log(`  *** REMOVED (a withdrawn published figure): ${removedK.join(" ")} ***`);
if (changedK.length) console.log(`  *** CHANGED in place: ${changedK.join(" ")} ***`);
if (!CAND.size) throw new Error("the two assets differ but no FUND_FACTS key moved — the difference is in FUND_VEHICLES, which this script does not measure");
console.log(`candidate tickers: ${CAND.size}\n`);

const num = (v) => (v == null || v === "" ? null : +v);
const st = { rows: 0, rowsA: 0, rowsB: 0, candRows: 0, ctrlRows: 0, ctrlDiff: 0,
  erNew: 0, erChanged: 0, erWithdrawn: 0, ytdNew: 0, ytdWithdrawn: 0,
  tkMoved: 0, starMoved: 0, typeMoved: 0, nameMoved: 0 };
const ctrlExamples = [];
const TKC = new Map();   // (iss, name, type) -> resolved ticker, the page's own lookupTicker
const plansTouched = new Set(), pplTouched = new Map();
const changedRows = [], movedOther = [];

for (const sh of readdirSync(`${ROOT}/data/lineups`).sort()) {
  if (!sh.endsWith(".json")) continue;
  const shard = JSON.parse(readFileSync(`${ROOT}/data/lineups/${sh}`, "utf8"));
  for (const [ack, e] of Object.entries(shard)) {
    const mem = members.get(ack);
    if (!mem || !e || !e.confident || !Array.isArray(e.funds) || !e.funds.length) continue;
    const lead = mem[0];
    const total = e.funds.reduce((a, f) => a + (+f.value || 0), 0);
    const ppl = mem.reduce((a, m) => a + m.participants, 0);
    for (const raw of e.funds) {
      st.rows++;
      const nameRaw = String(raw.name || "");
      /* THE PAGE CLEANS UPSTREAM OF THE SLICE and a name change can change ROW
       * MEMBERSHIP, so each side cleans with ITS OWN renderer and both counts
       * are printed. This change cannot move membership -- it touches no name
       * rule -- and printing it is how that is established rather than assumed. */
      /* CANDIDACY IS DECIDED BY `lookupTicker`, NOT BY A FULL RENDER. The
       * second version of this script rendered the AFTER side over every row
       * to read its `tk` and was still unfinished after ten minutes.
       * `lookupTicker(f)` is the function that PRODUCES `tk` -- it is handed
       * out from inside the renderer's own context, so this is the page's own
       * resolver and not a re-implementation of it -- and it reads only the
       * fund object, so it caches on (iss, name, type) with no plan in the
       * key. 1.78M rows collapse to ~100k distinct keys.
       *
       * Both sides are then rendered IN FULL for candidates and controls, so
       * every figure compared is a real renderRow answer. */
      const ck = `${String(raw.iss || "").trim()}\u0000${nameRaw}\u0000${String(raw.type || "")}`;
      let tkc = TKC.get(ck);
      if (tkc === undefined) {
        const info = B.fns.lookupTicker({ ...raw, nameRaw, name: B.clean(nameRaw) });
        TKC.set(ck, tkc = info && info.tk ? String(info.tk).toUpperCase() : null);
      }
      const cand = tkc != null && CAND.has(tkc);
      const ctrl = !cand && (st.rows % 400 === 0);
      if (!cand && !ctrl) continue;
      const rb = B.renderRow(lead, { ...raw, nameRaw, name: B.clean(nameRaw) }, "menu", total);
      const ra = A.renderRow(lead, { ...raw, nameRaw, name: A.clean(nameRaw) }, "menu", total);
      if (rb) st.rowsB++;
      if (ra) st.rowsA++;
      if (!ra || !rb) continue;
      if (ctrl) {
        st.ctrlRows++;
        const same = num(ra.erShown) === num(rb.erShown)
          && (ra.ytdSourced ? ra.ytdSourced.ytd : null) === (rb.ytdSourced ? rb.ytdSourced.ytd : null)
          && String(ra.tk || "") === String(rb.tk || "") && !!ra.star === !!rb.star
          && String(ra.shownType || "") === String(rb.shownType || "");
        if (!same) { st.ctrlDiff++; if (ctrlExamples.length < 8) ctrlExamples.push({ nameRaw, tk: rb.tk, a: ra.erShown, b: rb.erShown }); }
        continue;
      }
      st.candRows++;

      const ea = num(ra.erShown), eb = num(rb.erShown);
      const ya = ra.ytdSourced ? num(ra.ytdSourced.ytd) : null;
      const yb = rb.ytdSourced ? num(rb.ytdSourced.ytd) : null;
      let touched = false;

      if (ea == null && eb != null) { st.erNew++; touched = true; }
      else if (ea != null && eb == null) { st.erWithdrawn++; touched = true; }
      else if (ea != null && eb != null && ea !== eb) {
        st.erChanged++; touched = true;
        changedRows.push({ sponsor: lead.sponsorName, pk: `${lead.ein}|${lead.pn}`, ppl,
          nameRaw, tk: rb.tk, star: rb.star, type: raw.type || "(none stated)",
          from: ea, to: eb, value: +raw.value || 0,
          srcA: ra.erSourced ? "sourced" : "est.", srcB: rb.erSourced ? "sourced" : "est." });
      }
      if (ya == null && yb != null) { st.ytdNew++; touched = true; }
      else if (ya != null && yb == null) { st.ytdWithdrawn++; touched = true; }

      /* NOTHING ELSE MAY MOVE. A sourcing batch writes figures; if a ticker,
       * an asterisk, a type or a displayed name moves, the change is doing
       * something it was not asked to do and the ship stops. */
      const other = [];
      if (String(ra.tk || "") !== String(rb.tk || "")) { st.tkMoved++; other.push(`tk ${ra.tk} -> ${rb.tk}`); }
      if (!!ra.star !== !!rb.star) { st.starMoved++; other.push(`star ${ra.star} -> ${rb.star}`); }
      if (String(ra.shownType || "") !== String(rb.shownType || "")) { st.typeMoved++; other.push(`type ${ra.shownType} -> ${rb.shownType}`); }
      if (String(ra.name || "") !== String(rb.name || "")) { st.nameMoved++; other.push(`name ${ra.name} -> ${rb.name}`); }
      if (other.length && movedOther.length < 20) movedOther.push({ nameRaw, tk: rb.tk, what: other.join("; ") });

      if (touched) { plansTouched.add(`${lead.ein}|${lead.pn}`); pplTouched.set(`${lead.ein}|${lead.pn}`, ppl); }
    }
  }
}

const n = (x) => x.toLocaleString();
const readers = [...pplTouched.values()].reduce((a, b) => a + b, 0);
console.log(`\nBEFORE ${BEFORE}\nAFTER  ${path.join(ROOT, "fund-facts.js")}\n`);
console.log(`rows walked             ${n(st.rows)}  (ticker resolved via ${n(TKC.size)} distinct cached keys)`);
console.log(`CANDIDATE rows          ${n(st.candRows)}  — resolve one of the ${CAND.size} moved tickers, non-starred or not`);
console.log(`control rows            ${n(st.ctrlRows)}  (1 in 400 NON-candidates, both sides rendered)`);
console.log(`  control differences   ${st.ctrlDiff}${st.ctrlDiff ? "   *** THE NARROWING IS WRONG — read these ***" : "   (none — corroborates the structural discharge)"}`);
console.log(`fee NEWLY published     ${n(st.erNew)}`);
console.log(`fee CHANGED value       ${n(st.erChanged)}${st.erChanged ? "   <- a published claim moving; read the sample" : ""}`);
console.log(`fee WITHDRAWN           ${n(st.erWithdrawn)}`);
console.log(`return NEWLY published  ${n(st.ytdNew)}`);
console.log(`return WITHDRAWN        ${n(st.ytdWithdrawn)}`);
console.log(`ticker / star / type / name cells moved   ${st.tkMoved} / ${st.starMoved} / ${st.typeMoved} / ${st.nameMoved}`);
console.log(`plans / readers touched ${n(plansTouched.size)} / ${n(readers)}`);

if (movedOther.length) {
  console.log(`\n*** SOMETHING OTHER THAN A FIGURE MOVED — this is not what a sourcing batch does ***`);
  for (const m of movedOther) console.log(`  ${m.tk}  ${m.nameRaw.slice(0, 50)}  ${m.what}`);
}

if (changedRows.length) {
  /* A seeded uniform draw over the CHANGED rows, with each row's filed TYPE and
   * filed NAME printed, because the estimate and the source disagreeing is a
   * ticker question and only the name settles it. */
  let seed = 20261114 >>> 0;
  const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
  const pick = [];
  for (let i = 0; i < changedRows.length; i++) {
    if (pick.length < SAMPLE) pick.push(changedRows[i]);
    else { const j = Math.floor(rnd() * (i + 1)); if (j < SAMPLE) pick[j] = changedRows[i]; }
  }
  /* A TUPLE, NOT A STRING THAT IS THEN SPLIT. The first version keyed this on
   * `${tk} ${from} -> ${to}` and destructured `[tk, , from, , to]`, which is
   * off by one: every line printed "->% -> undefined%". The numbers above were
   * unaffected, which is exactly why a broken summary is worth fixing rather
   * than eyeballing past -- it is the part a reader believes. */
  const byTk = new Map();
  for (const c of changedRows) {
    const k = `${c.tk}\u0000${c.from}\u0000${c.to}`;
    if (!byTk.has(k)) byTk.set(k, { tk: c.tk, from: c.from, to: c.to, rows: 0, ppl: new Map() });
    const g = byTk.get(k); g.rows++; g.ppl.set(c.pk, c.ppl);
  }
  console.log(`\nEVERY CHANGED FEE, BY TICKER AND DIRECTION (${byTk.size} distinct):`);
  for (const g of [...byTk.values()].sort((x, y) => y.rows - x.rows)) {
    const rd = [...g.ppl.values()].reduce((a, b) => a + b, 0);
    console.log(`  ${String(g.rows).padStart(5)} rows  ${n(rd).padStart(9)} readers   ${g.tk.padEnd(7)} ${String(g.from).padStart(6)}% -> ${String(g.to).padStart(6)}%   ${g.to > g.from ? "UP  " : "DOWN"}`);
  }
  /* dumped so the reading can be redone without re-walking 1.78M rows */
  const dump = process.env.FACTS_DIFF_DUMP;
  if (dump) { writeFileSync(dump, JSON.stringify(changedRows)); console.log(`\n  (${n(changedRows.length)} changed rows dumped to ${dump})`); }
  console.log(`\nSEEDED DRAW over the ${n(changedRows.length)} changed rows, ${pick.length} drawn — read each filed name against its symbol:`);
  for (const [i, c] of pick.entries()) {
    console.log(`  ${String(i + 1).padStart(3)} ${c.tk}${c.star ? "*" : " "} ${String(c.from).padStart(6)}% (${c.srcA}) -> ${String(c.to).padStart(6)}% (${c.srcB})  $${n(Math.round(c.value))}`);
    console.log(`      ${JSON.stringify(c.nameRaw).slice(0, 86)}   type ${JSON.stringify(c.type)}`);
    console.log(`      ${c.sponsor.slice(0, 46)}  (${c.pk}, ${n(c.ppl)} participants)`);
  }
}
